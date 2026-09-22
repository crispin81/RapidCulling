use tauri::Manager;

fn favourites_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("favourites.json"))
}

pub fn read(app: &tauri::AppHandle) -> Result<Vec<String>, String> {
    let path = favourites_path(app)?;
    if !path.is_file() {
        return Ok(Vec::new());
    }
    let contents = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&contents).map_err(|e| e.to_string())
}

fn write(app: &tauri::AppHandle, favourites: &[String]) -> Result<(), String> {
    let path = favourites_path(app)?;
    let contents = serde_json::to_string_pretty(favourites).map_err(|e| e.to_string())?;
    // Write-then-rename so a crash mid-write can't leave favourites.json
    // truncated - the file is always either the old list or the new one.
    let tmp_path = path.with_extension("json.tmp");
    std::fs::write(&tmp_path, contents).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp_path, &path).map_err(|e| e.to_string())
}

pub fn add(app: &tauri::AppHandle, folder: String) -> Result<Vec<String>, String> {
    let mut favourites = read(app)?;
    if !favourites.contains(&folder) {
        favourites.push(folder);
        write(app, &favourites)?;
    }
    Ok(favourites)
}

pub fn remove(app: &tauri::AppHandle, folder: &str) -> Result<Vec<String>, String> {
    let mut favourites = read(app)?;
    favourites.retain(|f| f != folder);
    write(app, &favourites)?;
    Ok(favourites)
}
