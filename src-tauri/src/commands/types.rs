use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VideoFile {
    pub path: String,
    pub name: String,
    pub stem: String,
    pub extension: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RenameParams {
    pub date: String,
    pub country: String,
    pub material: String,
    pub resolution: String,
    pub version: String,
    pub platform: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TaskRequest {
    pub task_id: Option<String>,
    pub videos: Vec<VideoFile>,
    pub output_dir: String,
    pub rename_template: String,
    pub rename_params: RenameParams,
    pub task_mode: String,
    pub audio_mode: String,
    pub single_audio_path: Option<String>,
    pub audio_dir: Option<String>,
    pub short_audio_mode: String,
    pub captions: Option<Vec<CaptionExportLine>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CaptionPosition {
    pub x_percent: f64,
    pub y_percent: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CaptionExportLine {
    pub text: String,
    pub start_time: f64,
    pub end_time: f64,
    pub copy_paths: Option<Vec<String>>,
    pub style_paths: Option<Vec<String>>,
    pub same_video_style: Option<bool>,
    pub box_width_percent: f64,
    pub font_size: f64,
    pub font_color: String,
    pub outline_color: String,
    pub outline: f64,
    pub shadow: f64,
    pub position: CaptionPosition,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CopyProductBinding {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub paths: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CopyCountryBinding {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub products: Vec<CopyProductBinding>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CopywritingEntry {
    pub text: String,
    pub source_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppendCopywritingRequest {
    pub path: String,
    pub text: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportCopywritingLibraryRequest {
    pub countries: Vec<CopyCountryBinding>,
    pub output_dir: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CaptionStyleFile {
    pub id: String,
    pub name: String,
    pub path: String,
    pub sample_text: String,
    pub font_size: f64,
    pub font_color: String,
    pub outline_color: String,
    pub outline: f64,
    pub shadow: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FavoriteCaptionStyleRequest {
    pub source_path: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProcessProgressEvent {
    pub task_id: String,
    pub status: String,
    pub total: usize,
    pub current: usize,
    pub success: usize,
    pub failed: usize,
    pub log: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CaptionExportRequest {
    pub videos: Vec<VideoFile>,
    pub output_dir: String,
    pub rename_template: String,
    pub rename_params: RenameParams,
    pub captions: Vec<CaptionExportLine>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessResult {
    pub success: usize,
    pub failed: usize,
    pub logs: Vec<String>,
}
