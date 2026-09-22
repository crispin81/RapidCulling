use crate::types::{DirEntry, DirListing};
use crate::xmp;
use std::path::{Path, PathBuf};

const JPEG_EXTENSIONS: [&str; 4] = ["jpg", "jpeg", "JPG", "JPEG"];

#[derive(Debug)]
pub struct FoundPhoto {
    pub raw_path: PathBuf,
    pub jpeg_path: Option<PathBuf>,
}

/// Lists photos directly inside `folder` (non-recursive - the folder
/// tree/subfolder browsing is a separate concern): RAW files, each paired
/// with any same-basename JPEG sibling, plus any standalone JPEG that has no
/// RAW sibling - for photographers who shoot JPEG-only.
pub fn find_photos(folder: &Path) -> Result<Vec<FoundPhoto>, String> {
    let raw_extensions = rawler::decoders::supported_extensions();
    let entries: Vec<PathBuf> = std::fs::read_dir(folder)
        .map_err(|e| e.to_string())?
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.is_file())
        .collect();

    let is_jpeg = |p: &Path| -> bool {
        p.extension()
            .and_then(|e| e.to_str())
            .map(|e| e.eq_ignore_ascii_case("jpg") || e.eq_ignore_ascii_case("jpeg"))
            .unwrap_or(false)
    };

    let mut photos = Vec::new();
    let mut claimed_jpegs: std::collections::HashSet<PathBuf> = std::collections::HashSet::new();

    for path in &entries {
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
        if let Some(jp) = &jpeg_path {
            claimed_jpegs.insert(jp.clone());
        }

        photos.push(FoundPhoto {
            raw_path: path.clone(),
            jpeg_path,
        });
    }

    // A standalone JPEG is the photo in its own right: raw_path and
    // jpeg_path both point at the same file, so preview extraction takes
    // the JPEG branch (see extract_source_image) while every other
    // identity-derived piece (xmp sidecar, filename, move destination)
    // stays correctly scoped to this one file.
    for path in &entries {
        if is_jpeg(path) && !claimed_jpegs.contains(path) {
            photos.push(FoundPhoto {
                raw_path: path.clone(),
                jpeg_path: Some(path.clone()),
            });
        }
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

/// Picks a destination path in `dest_folder` for `file_name`, appending
/// " (2)", " (3)", ... before the extension if that name is already taken.
/// `std::fs::rename` silently *replaces* an existing file of the same name
/// on POSIX - since camera-assigned filenames (IMG_0001.CR2 and the like)
/// recur constantly across cards and shoots, moving a photo must never be
/// allowed to clobber an unrelated file that happens to share its name.
fn unique_dest(dest_folder: &Path, file_name: &std::ffi::OsStr) -> PathBuf {
    let candidate = dest_folder.join(file_name);
    if !candidate.exists() {
        return candidate;
    }
    let name_path = Path::new(file_name);
    let stem = name_path.file_stem().unwrap_or(file_name).to_string_lossy().into_owned();
    let ext = name_path.extension().map(|e| e.to_string_lossy().into_owned());
    let mut n = 2;
    loop {
        let candidate_name = match &ext {
            Some(ext) => format!("{stem} ({n}).{ext}"),
            None => format!("{stem} ({n})"),
        };
        let candidate = dest_folder.join(candidate_name);
        if !candidate.exists() {
            return candidate;
        }
        n += 1;
    }
}

/// Sibling of `dest_raw` with `ext` in place of its own extension, re-checked
/// for a collision of its own - the raw file's uniquified name being free
/// doesn't guarantee a same-stem sidecar/JPEG slot is too (e.g. an orphaned
/// sidecar left behind by a previous, different photo).
fn unique_dest_sibling(dest_raw: &Path, ext: &str) -> PathBuf {
    let candidate = dest_raw.with_extension(ext);
    if !candidate.exists() {
        return candidate;
    }
    let dest_folder = candidate.parent().unwrap_or_else(|| Path::new("."));
    let file_name = candidate.file_name().unwrap_or_else(|| std::ffi::OsStr::new("file"));
    unique_dest(dest_folder, file_name)
}

/// Moves a photo's RAW file together with its `.xmp` sidecar and any paired
/// JPEG into `dest_folder`, as a unit.
pub fn move_photo(raw_path: &Path, dest_folder: &Path) -> Result<(), String> {
    let file_name = raw_path
        .file_name()
        .ok_or_else(|| "invalid path".to_string())?;
    let dest_raw = unique_dest(dest_folder, file_name);
    std::fs::rename(raw_path, &dest_raw).map_err(|e| e.to_string())?;

    let xmp_src = xmp::sidecar_path_for(raw_path);
    if xmp_src.is_file() {
        let xmp_dest = unique_dest_sibling(&dest_raw, "xmp");
        std::fs::rename(&xmp_src, &xmp_dest).map_err(|e| e.to_string())?;
    }

    for jpeg_ext in JPEG_EXTENSIONS {
        let jpeg_src = raw_path.with_extension(jpeg_ext);
        if jpeg_src.is_file() {
            let jpeg_dest = unique_dest_sibling(&dest_raw, jpeg_ext);
            std::fs::rename(&jpeg_src, &jpeg_dest).map_err(|e| e.to_string())?;
            break;
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Regression test for a real data-loss bug: moving a photo into a
    /// folder that already contains a same-named file must never destroy
    /// that pre-existing file. Camera-assigned filenames (IMG_0001.CR2 and
    /// the like) recur constantly across different cards/shoots.
    #[test]
    fn move_photo_never_overwrites_an_existing_same_name_file() {
        let tmp = std::env::temp_dir().join(format!(
            "rapidculling-move-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let source = tmp.join("source");
        let dest = tmp.join("dest");
        std::fs::create_dir_all(&source).unwrap();
        std::fs::create_dir_all(&dest).unwrap();

        let src_raw = source.join("IMG_0001.raw");
        std::fs::write(&src_raw, b"incoming photo").unwrap();

        let existing_dest_raw = dest.join("IMG_0001.raw");
        std::fs::write(&existing_dest_raw, b"pre-existing, unrelated photo").unwrap();

        move_photo(&src_raw, &dest).unwrap();

        // The pre-existing file at the destination must be untouched.
        assert_eq!(
            std::fs::read_to_string(&existing_dest_raw).unwrap(),
            "pre-existing, unrelated photo"
        );
        // The incoming photo must have landed somewhere under a
        // disambiguated name, not vanished.
        let uniquified = dest.join("IMG_0001 (2).raw");
        assert_eq!(std::fs::read_to_string(&uniquified).unwrap(), "incoming photo");

        std::fs::remove_dir_all(&tmp).ok();
    }

    /// A folder with no RAW files at all (shot-in-JPEG workflow) must still
    /// surface its JPEGs as photos, while a JPEG that IS paired with a RAW
    /// sibling stays claimed by that pair rather than also appearing on its
    /// own.
    #[test]
    fn find_photos_picks_up_standalone_jpegs_and_pairs_with_raw() {
        let tmp = std::env::temp_dir().join(format!(
            "rapidculling-find-photos-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&tmp).unwrap();

        std::fs::write(tmp.join("IMG_0001.CR2"), b"raw").unwrap();
        std::fs::write(tmp.join("IMG_0001.jpg"), b"jpeg sibling").unwrap();
        std::fs::write(tmp.join("IMG_0002.jpg"), b"jpeg only").unwrap();

        let found = find_photos(&tmp).unwrap();
        assert_eq!(found.len(), 2, "expected the RAW+JPEG pair and the standalone JPEG, got {found:#?}");

        let paired = found
            .iter()
            .find(|p| p.raw_path.file_name().unwrap() == "IMG_0001.CR2")
            .expect("RAW+JPEG pair missing");
        assert!(paired.jpeg_path.is_some(), "RAW should be paired with its JPEG sibling");

        let standalone = found
            .iter()
            .find(|p| p.raw_path.file_name().unwrap() == "IMG_0002.jpg")
            .expect("standalone JPEG missing");
        assert_eq!(
            standalone.jpeg_path.as_deref(),
            Some(standalone.raw_path.as_path()),
            "a JPEG-only photo should be its own jpeg_path so preview extraction takes the JPEG branch"
        );

        std::fs::remove_dir_all(&tmp).ok();
    }
}
