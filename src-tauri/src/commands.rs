use crate::grouping::{self, GroupInput};
use crate::library;
use crate::preview;
use crate::types::{DirListing, FullPreview, MoveFailure, MoveResult, PhotoInfo, ScanComplete, ScanProgress};
use crate::xmp::{self, RatingFlags};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{Emitter, State};

// Bumped from 480: still cheap relative to the embedded-preview decode
// (the real cost, fixed regardless of target size), but sharp enough to
// fill the large loupe pane without looking soft.
const GRID_THUMB_MAX_DIM: u32 = 960;
const FULL_PREVIEW_MAX_DIM: u32 = 2400;

/// Serializes directory enumeration. On macOS the first touch of a protected
/// location (external volume, Desktop...) raises a permission prompt, and a
/// folder click fires several listings at once - unserialized, each one
/// raises its own prompt. Queued behind the first, the rest just succeed
/// once it's answered.
static FS_GATE: Mutex<()> = Mutex::new(());

fn fs_gate() -> std::sync::MutexGuard<'static, ()> {
    FS_GATE.lock().unwrap_or_else(|e| e.into_inner())
}

#[derive(Default)]
pub struct AppState {
    pub last_scan: Mutex<Vec<GroupInput>>,
}

fn group_inputs_to_result(groups: Vec<Vec<String>>) -> ScanComplete {
    ScanComplete {
        groups,
        failed_paths: Vec::new(),
    }
}

/// Just the filenames of the RAW photos directly in `folder`, with no
/// decoding - fast enough to call the instant a folder is clicked in the
/// tree, to show what's there before committing to a full scan.
#[tauri::command]
pub async fn list_photo_names(folder: String) -> Result<Vec<String>, String> {
    let found = {
        let _gate = fs_gate();
        library::find_photos(Path::new(&folder))?
    };
    let mut names: Vec<String> = found
        .into_iter()
        .filter_map(|p| p.raw_path.file_name().map(|n| n.to_string_lossy().into_owned()))
        .collect();
    names.sort();
    Ok(names)
}

#[tauri::command]
pub async fn scan_folder(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    folder: String,
    similarity_percent: f64,
) -> Result<ScanComplete, String> {
    let found = {
        let _gate = fs_gate();
        library::find_photos(Path::new(&folder))?
    };
    let total = found.len();
    let _ = app.emit("scan-progress", ScanProgress { done: 0, total });

    let thread_count = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4).max(1);
    let chunk_size = found.len().div_ceil(thread_count).max(1);
    let progress = Arc::new(AtomicUsize::new(0));
    let failed_paths: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
    let group_inputs: Arc<Mutex<Vec<GroupInput>>> = Arc::new(Mutex::new(Vec::with_capacity(total)));

    std::thread::scope(|scope| {
        for chunk in found.chunks(chunk_size) {
            let app = app.clone();
            let progress = progress.clone();
            let failed_paths = failed_paths.clone();
            let group_inputs = group_inputs.clone();
            scope.spawn(move || {
                for photo in chunk {
                    match process_photo(&photo.raw_path, photo.jpeg_path.as_deref()) {
                        Ok((info, group_input)) => {
                            let _ = app.emit("photo-ready", &info);
                            group_inputs.lock().unwrap().push(group_input);
                        }
                        Err(_) => {
                            failed_paths
                                .lock()
                                .unwrap()
                                .push(photo.raw_path.to_string_lossy().to_string());
                        }
                    }
                    let done = progress.fetch_add(1, Ordering::Relaxed) + 1;
                    let _ = app.emit("scan-progress", ScanProgress { done, total });
                }
            });
        }
    });

    let group_inputs = Arc::try_unwrap(group_inputs).unwrap().into_inner().unwrap();
    *state.last_scan.lock().unwrap() = group_inputs.clone();

    let groups = grouping::group_photos(group_inputs, similarity_percent);
    let mut result = group_inputs_to_result(groups);
    result.failed_paths = Arc::try_unwrap(failed_paths).unwrap().into_inner().unwrap();
    let _ = app.emit("scan-complete", &result);
    Ok(result)
}

fn process_photo(
    raw_path: &Path,
    jpeg_path: Option<&Path>,
) -> Result<(PhotoInfo, GroupInput), String> {
    let extracted = preview::extract_source_image(raw_path, jpeg_path)?;
    let phash = preview::compute_dhash(&extracted.image);
    let (thumb_base64, width, height) =
        preview::make_thumb_base64(&extracted.image, extracted.orientation, GRID_THUMB_MAX_DIM)?;

    let xmp_path = xmp::sidecar_path_for(raw_path);
    let flags = xmp::read(&xmp_path);

    let path_string = raw_path.to_string_lossy().to_string();
    let info = PhotoInfo {
        path: path_string.clone(),
        jpeg_path: jpeg_path.map(|p| p.to_string_lossy().to_string()),
        file_name: raw_path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default(),
        timestamp_ms: extracted.timestamp_ms,
        orientation: extracted.orientation,
        width,
        height,
        thumb_base64,
        rating: flags.rating,
        pick: flags.pick,
        phash,
    };

    let group_input = GroupInput {
        path: path_string,
        timestamp_ms: extracted.timestamp_ms,
        phash,
    };

    Ok((info, group_input))
}

#[tauri::command]
pub async fn recompute_groups(
    state: State<'_, AppState>,
    similarity_percent: f64,
) -> Result<ScanComplete, String> {
    let inputs = state.last_scan.lock().unwrap().clone();
    let groups = grouping::group_photos(inputs, similarity_percent);
    Ok(group_inputs_to_result(groups))
}

#[tauri::command]
pub async fn get_full_preview(path: String) -> Result<FullPreview, String> {
    let raw_path = PathBuf::from(&path);
    let jpeg_candidate = ["jpg", "jpeg", "JPG", "JPEG"]
        .iter()
        .map(|ext| raw_path.with_extension(ext))
        .find(|p| p.is_file());

    // A JPEG (like a RAW) always gets decoded and capped at
    // FULL_PREVIEW_MAX_DIM here, regardless of the source file's actual
    // resolution (a 100-megapixel JPEG is not sent to the frontend at full
    // size - same bounded cost as any other photo).
    let extracted = preview::extract_source_image(&raw_path, jpeg_candidate.as_deref())?;
    let (image_base64, width, height) =
        preview::make_thumb_base64(&extracted.image, extracted.orientation, FULL_PREVIEW_MAX_DIM)?;

    Ok(FullPreview {
        path,
        image_base64,
        width,
        height,
    })
}

fn update_flags(path: &str, update: impl FnOnce(&mut RatingFlags)) -> Result<(), String> {
    let raw_path = PathBuf::from(path);
    let xmp_path = xmp::sidecar_path_for(&raw_path);
    let mut flags = xmp::read(&xmp_path);
    update(&mut flags);
    xmp::write(&xmp_path, flags)
}

#[tauri::command]
pub async fn set_rating(path: String, rating: i8) -> Result<(), String> {
    update_flags(&path, |f| f.rating = rating)
}

#[tauri::command]
pub async fn set_pick(path: String, pick: bool) -> Result<(), String> {
    update_flags(&path, |f| f.pick = pick)
}

/// Sets rating and pick together in a single read-modify-write. Picked and
/// rejected must never both be true, and since they share one XMP sidecar,
/// firing set_rating and set_pick as two separate, unsynchronized calls to
/// clear one while setting the other is a real race - whichever write lands
/// last can silently clobber the other's change. This command is the only
/// safe way to change both at once.
#[tauri::command]
pub async fn set_rating_and_pick(path: String, rating: i8, pick: bool) -> Result<(), String> {
    update_flags(&path, |f| {
        f.rating = rating;
        f.pick = pick;
    })
}

#[tauri::command]
pub async fn list_directory(path: Option<String>) -> Result<DirListing, String> {
    let dir = match path {
        Some(p) => PathBuf::from(p),
        None => dirs::home_dir().ok_or_else(|| "could not determine home directory".to_string())?,
    };
    let _gate = fs_gate();
    library::list_directory(&dir)
}

/// Every mounted disk/volume on the system - internal drives, external
/// drives, USB sticks - so users working off a second/external drive can
/// jump straight to it instead of typing a path by hand.
#[tauri::command]
pub async fn list_volumes() -> Vec<crate::types::Volume> {
    // Mount points under these are internal OS/system paths (or, on Linux,
    // often just other subvolumes of the same root disk) - never somewhere
    // a photographer's library would actually live.
    const SYSTEM_PREFIXES: &[&str] =
        &["/boot", "/var", "/usr", "/etc", "/tmp", "/run", "/snap", "/nix", "/proc", "/sys", "/dev"];

    let disks = sysinfo::Disks::new_with_refreshed_list();
    // A single physical disk (especially with Linux subvolumes/bind mounts,
    // e.g. btrfs @, @home, @log, @pkg all on one device) can show up as
    // several separate mount points here - collapse those down to one entry
    // (the shallowest mount point) so the same drive isn't listed 4 times.
    let mut by_device: std::collections::HashMap<String, (PathBuf, bool)> = std::collections::HashMap::new();
    for d in disks.iter() {
        if d.total_space() <= 1_000_000_000 {
            continue;
        }
        let mount = d.mount_point();
        let mount_str = mount.to_string_lossy();
        if SYSTEM_PREFIXES.iter().any(|p| mount_str == *p || mount_str.starts_with(&format!("{p}/"))) {
            continue;
        }
        let device = d.name().to_string_lossy().into_owned();
        by_device
            .entry(device)
            .and_modify(|(existing, _)| {
                if mount.components().count() < existing.components().count() {
                    *existing = mount.to_path_buf();
                }
            })
            .or_insert_with(|| (mount.to_path_buf(), d.is_removable()));
    }

    let mut volumes: Vec<crate::types::Volume> = by_device
        .into_values()
        .map(|(path, removable)| {
            let path_str = path.to_string_lossy().into_owned();
            let name = path
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_else(|| {
                    if path_str == "/" {
                        if cfg!(target_os = "macos") { "This Mac" } else { "This PC" }.to_string()
                    } else {
                        path_str.clone()
                    }
                });
            crate::types::Volume { name, path: path_str, removable }
        })
        .collect();
    volumes.sort_by(|a, b| b.removable.cmp(&a.removable).then_with(|| a.name.cmp(&b.name)));
    volumes
}

#[tauri::command]
pub async fn create_folder(parent: String, name: String) -> Result<String, String> {
    library::create_folder(Path::new(&parent), &name)
}

#[tauri::command]
pub async fn list_favourites(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    crate::favourites::read(&app)
}

#[tauri::command]
pub async fn add_favourite(app: tauri::AppHandle, folder: String) -> Result<Vec<String>, String> {
    crate::favourites::add(&app, folder)
}

#[tauri::command]
pub async fn remove_favourite(app: tauri::AppHandle, folder: String) -> Result<Vec<String>, String> {
    crate::favourites::remove(&app, &folder)
}

#[tauri::command]
pub async fn move_items(
    state: State<'_, AppState>,
    paths: Vec<String>,
    dest_folder: String,
) -> Result<MoveResult, String> {
    let dest = Path::new(&dest_folder);
    // Keep going on a per-item failure rather than aborting the whole batch -
    // one locked/cross-drive/permission-denied file must not strand the
    // photos before it in limbo (moved on disk but never reflected in state
    // because an early return skipped the bookkeeping below).
    let mut moved = Vec::new();
    let mut failed = Vec::new();
    for path in &paths {
        match library::move_photo(Path::new(path), dest) {
            Ok(()) => moved.push(path.clone()),
            Err(error) => failed.push(MoveFailure { path: path.clone(), error }),
        }
    }

    let moved_set: std::collections::HashSet<&str> = moved.iter().map(|s| s.as_str()).collect();
    state.last_scan.lock().unwrap().retain(|p| !moved_set.contains(p.path.as_str()));

    Ok(MoveResult { moved, failed })
}

/// Opens System Settings at Privacy & Security -> Full Disk Access (macOS
/// only; a no-op elsewhere). Full Disk Access can't be granted from inside
/// the app - the user has to flip the switch themselves.
#[tauri::command]
pub async fn open_full_disk_access() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles")
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
