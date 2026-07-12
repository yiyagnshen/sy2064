use std::fs;
use std::path::{Path, PathBuf};

use chrono::Local;

use super::types::{AppendCopywritingRequest, CopywritingEntry, ExportCopywritingLibraryRequest};

#[tauri::command]
pub fn list_copywriting_entries(paths: Vec<String>) -> Result<Vec<CopywritingEntry>, String> {
    read_copywriting_entries(&paths)
}

#[tauri::command]
pub fn append_copywriting_entry(request: AppendCopywritingRequest) -> Result<String, String> {
    let text = request.text.trim();
    if text.is_empty() {
        return Err("Copywriting text is empty".to_string());
    }

    let target = resolve_append_target(&request.path)?;
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let existing = fs::read_to_string(&target).unwrap_or_default();
    if existing.lines().any(|line| line.trim() == text) {
        return Ok(target.to_string_lossy().to_string());
    }

    let mut next = existing;
    if !next.is_empty() && !next.ends_with('\n') {
        next.push('\n');
    }
    next.push_str(text);
    next.push('\n');
    fs::write(&target, next).map_err(|error| error.to_string())?;
    Ok(target.to_string_lossy().to_string())
}

#[tauri::command]
pub fn export_copywriting_library(request: ExportCopywritingLibraryRequest) -> Result<String, String> {
    let root = PathBuf::from(request.output_dir.trim());
    if !root.is_dir() {
        return Err("Output directory does not exist".to_string());
    }

    let export_root = root.join(format!("copywriting_library_{}", Local::now().format("%Y%m%d_%H%M%S")));
    fs::create_dir_all(&export_root).map_err(|error| error.to_string())?;

    for country in request.countries.iter().filter(|country| country.enabled) {
        for product in country.products.iter().filter(|product| product.enabled) {
            let product_dir = export_root
                .join(sanitize_part(&country.name))
                .join(sanitize_part(&product.name));
            fs::create_dir_all(&product_dir).map_err(|error| error.to_string())?;
            export_paths(&product.paths, &product_dir)?;
        }
    }

    Ok(export_root.to_string_lossy().to_string())
}

pub fn read_copywriting_entries(paths: &[String]) -> Result<Vec<CopywritingEntry>, String> {
    let mut entries = Vec::new();
    let mut files = Vec::new();

    for path in paths {
        collect_copywriting_files(Path::new(path), &mut files)?;
    }

    files.sort();
    for file in files {
        let text = fs::read_to_string(&file).unwrap_or_default();
        for line in parse_copywriting_lines(&text) {
            entries.push(CopywritingEntry {
                text: line,
                source_path: file.to_string_lossy().to_string(),
            });
        }
    }

    Ok(entries)
}

fn collect_copywriting_files(path: &Path, files: &mut Vec<PathBuf>) -> Result<(), String> {
    if path.is_file() {
        if is_supported_copywriting_file(path) {
            files.push(path.to_path_buf());
        }
        return Ok(());
    }

    if !path.is_dir() {
        return Ok(());
    }

    for entry in fs::read_dir(path).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        collect_copywriting_files(&entry.path(), files)?;
    }

    Ok(())
}

fn parse_copywriting_lines(text: &str) -> Vec<String> {
    text.lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with('#'))
        .map(ToString::to_string)
        .collect()
}

fn resolve_append_target(path: &str) -> Result<PathBuf, String> {
    let target = PathBuf::from(path.trim());
    if target.is_dir() {
        return Ok(target.join("文案.txt"));
    }

    if target.extension().is_some() {
        return Ok(target);
    }

    Err("Please bind a copywriting file or folder first".to_string())
}

fn export_paths(paths: &[String], product_dir: &Path) -> Result<(), String> {
    let mut files = Vec::new();
    for path in paths {
        collect_copywriting_files(Path::new(path), &mut files)?;
    }

    files.sort();
    for (index, file) in files.iter().enumerate() {
        let file_name = file.file_name().and_then(|value| value.to_str()).unwrap_or("copy.txt");
        let target = product_dir.join(format!("{:03}_{}", index + 1, sanitize_part(file_name)));
        fs::copy(file, target).map_err(|error| error.to_string())?;
    }

    Ok(())
}

fn is_supported_copywriting_file(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .map(|extension| {
            ["txt", "csv", "json"].iter().any(|supported| extension.eq_ignore_ascii_case(supported))
        })
        .unwrap_or(false)
}

fn sanitize_part(value: &str) -> String {
    let cleaned = value
        .trim()
        .chars()
        .map(|character| match character {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            _ => character,
        })
        .collect::<String>();
    if cleaned.is_empty() { "copywriting".to_string() } else { cleaned }
}
