use serde::Serialize;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PhotoInfo {
    pub path: String,
    pub jpeg_path: Option<String>,
    pub file_name: String,
    pub timestamp_ms: i64,
    pub orientation: u16,
    pub width: u32,
    pub height: u32,
    pub thumb_base64: String,
    pub rating: i8,
    pub pick: bool,
    pub phash: u64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ScanProgress {
    pub total: usize,
    pub done: usize,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ScanComplete {
    pub groups: Vec<Vec<String>>,
    pub failed_paths: Vec<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DirEntry {
    pub path: String,
    pub name: String,
    pub has_children: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DirListing {
    pub path: String,
    pub parent: Option<String>,
    pub entries: Vec<DirEntry>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FullPreview {
    pub path: String,
    pub image_base64: String,
    pub width: u32,
    pub height: u32,
}
