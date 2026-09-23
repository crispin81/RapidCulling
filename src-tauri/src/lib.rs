pub mod commands;
pub mod favourites;
pub mod grouping;
pub mod library;
pub mod preview;
pub mod types;
pub mod xmp;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(commands::AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::list_photo_names,
            commands::scan_folder,
            commands::recompute_groups,
            commands::get_full_preview,
            commands::set_rating,
            commands::set_pick,
            commands::set_rating_and_pick,
            commands::list_directory,
            commands::list_volumes,
            commands::create_folder,
            commands::move_items,
            commands::list_favourites,
            commands::add_favourite,
            commands::remove_favourite,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
