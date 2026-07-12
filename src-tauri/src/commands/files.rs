use std::fs;
use std::path::Path;

use super::types::VideoFile;

const VIDEO_EXTENSIONS: &[&str] = &["mp4", "mov", "m4v", "avi", "mkv", "webm"];
const AUDIO_EXTENSIONS: &[&str] = &[
    "mp3", "wav", "aac", "m4a", "ogg", "flac", "wma", "opus", "amr", "mp4", "mov", "mkv",
];

#[tauri::command]
pub fn list_video_files(directory: String) -> Result<Vec<VideoFile>, String> {
    let dir = Path::new(&directory);
    if !dir.is_dir() {
        return Err("Video directory does not exist".to_string());
    }

    let mut files = Vec::new();
    collect_video_files(dir, &mut files)?;

    files.sort_by(|left, right| left.path.cmp(&right.path));
    Ok(files)
}

fn collect_video_files(dir: &Path, files: &mut Vec<VideoFile>) -> Result<(), String> {
    for entry in fs::read_dir(dir).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();

        if path.is_dir() {
            collect_video_files(&path, files)?;
            continue;
        }

        if !path.is_file() {
            continue;
        }

        let extension = path
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("")
            .to_lowercase();

        if !VIDEO_EXTENSIONS.contains(&extension.as_str()) {
            continue;
        }

        let name = path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("")
            .to_string();
        let stem = path
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("")
            .to_string();

        files.push(VideoFile {
            path: path.to_string_lossy().to_string(),
            name,
            stem,
            extension,
        });
    }

    Ok(())
}

pub fn list_audio_files(directory: &str) -> Result<Vec<String>, String> {
    let dir = Path::new(directory);
    if !dir.is_dir() {
        return Err("Audio directory does not exist".to_string());
    }

    let mut files = Vec::new();
    for entry in fs::read_dir(dir).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let extension = path
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("")
            .to_lowercase();

        if AUDIO_EXTENSIONS.contains(&extension.as_str()) {
            files.push(path.to_string_lossy().to_string());
        }
    }

    files.sort();
    Ok(files)
}
