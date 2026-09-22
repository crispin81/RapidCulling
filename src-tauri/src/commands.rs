use crate::grouping::{self, GroupInput};
use crate::library;
use crate::preview;
use crate::types::{DirListing, FullPreview, PhotoInfo, ScanComplete, ScanProgress};
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

#[tauri::command]
pub async fn scan_folder(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    folder: String,
    similarity_percent: f64,
) -> Result<ScanComplete, String> {
    let found = library::find_photos(Path::new(&folder))?;
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

#[tauri::command]
pub async fn list_directory(path: Option<String>) -> Result<DirListing, String> {
    let dir = match path {
        Some(p) => PathBuf::from(p),
        None => dirs::home_dir().ok_or_else(|| "could not determine home directory".to_string())?,
    };
    library::list_directory(&dir)
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
) -> Result<(), String> {
    let dest = Path::new(&dest_folder);
    for path in &paths {
        library::move_photo(Path::new(path), dest)?;
    }

    let moved: std::collections::HashSet<&str> = paths.iter().map(|s| s.as_str()).collect();
    state.last_scan.lock().unwrap().retain(|p| !moved.contains(p.path.as_str()));

    Ok(())
}
