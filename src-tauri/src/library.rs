use crate::types::{DirEntry, DirListing};
use crate::xmp;
use std::path::{Path, PathBuf};

const JPEG_EXTENSIONS: [&str; 4] = ["jpg", "jpeg", "JPG", "JPEG"];

pub struct FoundPhoto {
    pub raw_path: PathBuf,
    pub jpeg_path: Option<PathBuf>,
}

/// Lists RAW files directly inside `folder` (non-recursive - the folder
/// tree/subfolder browsing is a separate concern) paired with any
/// same-basename JPEG sibling.
pub fn find_photos(folder: &Path) -> Result<Vec<FoundPhoto>, String> {
    let raw_extensions = rawler::decoders::supported_extensions();
    let entries = std::fs::read_dir(folder).map_err(|e| e.to_string())?;

    let mut photos = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let Some(ext) = path.extension().and_then(|e| e.to_str()) else {
            continue;
        };
        let ext_upper = ext.to_uppercase();
        if !raw_extensions.contains(&ext_upper.as_str()) {
            continue;
        }

        let jpeg_path = JPEG_EXTENSIONS
            .iter()
            .map(|jpeg_ext| path.with_extension(jpeg_ext))
            .find(|candidate| candidate.is_file());

        photos.push(FoundPhoto {
            raw_path: path,
            jpeg_path,
        });
    }

    Ok(photos)
}

fn is_hidden(path: &Path) -> bool {
    path.file_name()
        .and_then(|n| n.to_str())
        .map(|n| n.starts_with('.'))
        .unwrap_or(false)
}

fn has_subdirectories(dir: &Path) -> bool {
    std::fs::read_dir(dir)
        .map(|entries| {
            entries
                .flatten()
                .any(|e| e.path().is_dir() && !is_hidden(&e.path()))
        })
        .unwrap_or(false)
}

/// Lists the immediate subdirectories of `dir` (lazily - a file browser only
/// ever needs one level at a time, unlike the eager whole-tree walk this
/// replaced). Hidden (dotfile) directories are skipped, same as a normal
/// file manager's default view.
pub fn list_directory(dir: &Path) -> Result<DirListing, String> {
    if !dir.is_dir() {
        return Err(format!("not a directory: {}", dir.display()));
    }

    let mut subdirs: Vec<PathBuf> = std::fs::read_dir(dir)
        .map_err(|e| e.to_string())?
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.is_dir() && !is_hidden(p))
        .collect();
    subdirs.sort_by_key(|p| p.file_name().map(|n| n.to_string_lossy().to_lowercase()));

    let entries = subdirs
        .into_iter()
        .map(|path| DirEntry {
            name: path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| path.to_string_lossy().to_string()),
            has_children: has_subdirectories(&path),
            path: path.to_string_lossy().to_string(),
        })
        .collect();

    Ok(DirListing {
        path: dir.to_string_lossy().to_string(),
        parent: dir.parent().map(|p| p.to_string_lossy().to_string()),
        entries,
    })
}

pub fn create_folder(parent: &Path, name: &str) -> Result<String, String> {
    let new_path = parent.join(name);
    std::fs::create_dir(&new_path).map_err(|e| e.to_string())?;
    Ok(new_path.to_string_lossy().to_string())
}

/// Moves a photo's RAW file together with its `.xmp` sidecar and any paired
/// JPEG into `dest_folder`, as a unit.
pub fn move_photo(raw_path: &Path, dest_folder: &Path) -> Result<(), String> {
    let file_name = raw_path
        .file_name()
        .ok_or_else(|| "invalid path".to_string())?;
    let dest_raw = dest_folder.join(file_name);
    std::fs::rename(raw_path, &dest_raw).map_err(|e| e.to_string())?;

    let xmp_src = xmp::sidecar_path_for(raw_path);
    if xmp_src.is_file() {
        let xmp_dest = xmp::sidecar_path_for(&dest_raw);
        std::fs::rename(&xmp_src, &xmp_dest).map_err(|e| e.to_string())?;
    }

    for jpeg_ext in JPEG_EXTENSIONS {
        let jpeg_src = raw_path.with_extension(jpeg_ext);
        if jpeg_src.is_file() {
            let jpeg_dest = dest_raw.with_extension(jpeg_ext);
            std::fs::rename(&jpeg_src, &jpeg_dest).map_err(|e| e.to_string())?;
            break;
        }
    }

    Ok(())
}
