use std::collections::HashMap;
use std::fs;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::process::Command;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

use chrono::Local;
use rand::seq::SliceRandom;

use super::copywriting::read_copywriting_entries;
use super::rename::render_file_name;
use super::types::{CaptionExportLine, CaptionExportRequest, CaptionStyleFile, FavoriteCaptionStyleRequest, ProcessResult, RenameParams};

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

pub type CopywritingPools = HashMap<usize, Vec<String>>;
pub type CaptionStylePools = HashMap<usize, Vec<CaptionStyleFile>>;

#[tauri::command]
pub fn process_caption_videos(request: CaptionExportRequest) -> Result<ProcessResult, String> {
    validate_caption_request(&request)?;
    let output_dir = resolve_caption_output_dir(&request.output_dir, &request.rename_params)?;
    let subtitle_dir = output_dir.join("_subtitles");
    fs::create_dir_all(&subtitle_dir).map_err(|error| error.to_string())?;
    let copywriting_pools = build_copywriting_pools(&request.captions)?;
    let caption_style_pools = build_caption_style_pools(&request.captions)?;

    let mut success = 0;
    let mut failed = 0;
    let mut logs = Vec::new();

    for (index, video) in request.videos.iter().enumerate() {
        let output_name = render_file_name(
            &request.rename_template,
            video,
            index + 1,
            &request.rename_params,
        );
        let mut output_path = output_dir.join(output_name);
        output_path.set_extension("mp4");
        let task_result = burn_captions_to_video(
            &video.path,
            &request.captions,
            &subtitle_dir,
            &output_path,
            &video.stem,
            index + 1,
            &copywriting_pools,
            &caption_style_pools,
        );

        match task_result {
            Ok(()) => {
                success += 1;
                logs.push(format!("OK: {} -> {}", video.name, output_path.display()));
            }
            Err(error) => {
                failed += 1;
                logs.push(format!("FAILED: {}, {}", video.name, error));
            }
        }
    }

    Ok(ProcessResult {
        success,
        failed,
        logs,
    })
}

#[tauri::command]
pub fn list_caption_style_files(directory: String) -> Result<Vec<CaptionStyleFile>, String> {
    let root = PathBuf::from(directory.trim());
    if !root.is_dir() {
        return Ok(Vec::new());
    }

    let mut files = Vec::new();
    collect_caption_style_files(&root, &mut files)?;
    files.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(files)
}

#[tauri::command]
pub fn list_favorite_caption_style_files() -> Result<Vec<CaptionStyleFile>, String> {
    let directory = favorite_caption_dir()?;
    if !directory.is_dir() {
        return Ok(Vec::new());
    }

    let mut files = Vec::new();
    collect_caption_style_files(&directory, &mut files)?;
    files.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(files)
}

#[tauri::command]
pub fn favorite_caption_style_file(request: FavoriteCaptionStyleRequest) -> Result<CaptionStyleFile, String> {
    let source = PathBuf::from(request.source_path.trim());
    if !source.is_file() {
        return Err("ASS file was not found".to_string());
    }

    let extension = source
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    if !extension.eq_ignore_ascii_case("ass") {
        return Err("Only ASS files can be favorited".to_string());
    }

    let directory = favorite_caption_dir()?;
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let file_name = source.file_name().and_then(|value| value.to_str()).unwrap_or("style.ass");
    let target = directory.join(format!("{:016x}_{}", hash_path(&source), sanitize_stem(file_name)));
    fs::copy(&source, &target).map_err(|error| error.to_string())?;
    Ok(parse_caption_style_file(&target))
}

pub fn burn_captions_to_video(
    input_video_path: &str,
    captions: &[CaptionExportLine],
    subtitle_dir: &Path,
    output_path: &Path,
    video_stem: &str,
    index: usize,
    copywriting_pools: &CopywritingPools,
    caption_style_pools: &CaptionStylePools,
) -> Result<(), String> {
    let ass_path = prepare_caption_ass_file(
        captions,
        subtitle_dir,
        video_stem,
        index,
        copywriting_pools,
        caption_style_pools,
    )?;
    run_caption_ffmpeg(input_video_path, &ass_path, output_path)
}

pub fn prepare_caption_ass_file(
    captions: &[CaptionExportLine],
    subtitle_dir: &Path,
    video_stem: &str,
    index: usize,
    copywriting_pools: &CopywritingPools,
    caption_style_pools: &CaptionStylePools,
) -> Result<PathBuf, String> {
    fs::create_dir_all(subtitle_dir).map_err(|error| error.to_string())?;
    let ass_path = subtitle_dir.join(format!("{}_{}.ass", sanitize_stem(video_stem), index));
    let copy_resolved_captions = resolve_copywriting_captions(captions, index, copywriting_pools);
    let resolved_captions = resolve_caption_styles(&copy_resolved_captions, index, caption_style_pools);
    write_ass_file(&ass_path, &resolved_captions)?;
    Ok(ass_path)
}

fn validate_caption_request(request: &CaptionExportRequest) -> Result<(), String> {
    if request.videos.is_empty() {
        return Err("Please select videos first".to_string());
    }

    if request.captions.iter().all(|caption| !caption_has_content(caption)) {
        return Err("Please enter at least one caption".to_string());
    }

    if !request.output_dir.trim().is_empty() && !Path::new(&request.output_dir).is_dir() {
        return Err("Output directory does not exist".to_string());
    }

    Ok(())
}

pub fn caption_has_content(caption: &CaptionExportLine) -> bool {
    !caption.text.trim().is_empty()
        || caption
            .copy_paths
            .as_ref()
            .map(|paths| paths.iter().any(|path| !path.trim().is_empty()))
            .unwrap_or(false)
}

pub fn write_ass_file(path: &Path, captions: &[CaptionExportLine]) -> Result<(), String> {
    let mut output = String::new();
    output.push_str("[Script Info]\n");
    output.push_str("Title: Generated Caption\n");
    output.push_str("ScriptType: v4.00+\n");
    output.push_str("WrapStyle: 0\n");
    output.push_str("ScaledBorderAndShadow: yes\n");
    output.push_str("PlayResX: 1080\n");
    output.push_str("PlayResY: 1920\n\n");
    output.push_str("[V4+ Styles]\n");
    output.push_str("Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n");

    for (index, caption) in captions.iter().enumerate() {
        output.push_str(&format!(
            "Style: Caption{},Arial,{},{},&H000000FF,{},&H80000000,1,0,0,0,100,100,0,0,1,{},{},5,60,60,0,1\n",
            index + 1,
            clamp_f64(caption.font_size, 18.0, 120.0).round() as usize,
            ass_color(&caption.font_color),
            ass_color(&caption.outline_color),
            clamp_f64(caption.outline, 0.0, 12.0),
            clamp_f64(caption.shadow, 0.0, 12.0)
        ));
    }

    output.push_str("\n[Events]\n");
    output.push_str("Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n");

    for (index, caption) in captions.iter().enumerate() {
        if caption.text.trim().is_empty() {
            continue;
        }

        let x = (1080.0 * clamp_f64(caption.position.x_percent, 0.0, 100.0) / 100.0).round();
        let y = (1920.0 * clamp_f64(caption.position.y_percent, 0.0, 100.0) / 100.0).round();
        let text = ass_wrapped_text(&caption.text, caption.font_size, caption.box_width_percent);

        output.push_str(&format!(
            "Dialogue: 0,{},{},Caption{},,0,0,0,,{{\\an5\\pos({},{})\\q0\\fad(120,120)}}{}\n",
            ass_time(caption.start_time),
            ass_time(caption.end_time.max(caption.start_time + 0.1)),
            index + 1,
            x as usize,
            y as usize,
            text
        ));
    }

    fs::write(path, output).map_err(|error| error.to_string())
}

pub fn build_copywriting_pools(captions: &[CaptionExportLine]) -> Result<CopywritingPools, String> {
    let mut pools = HashMap::new();
    let mut rng = rand::thread_rng();
    for (caption_index, caption) in captions.iter().enumerate() {
        if let Some(paths) = caption.copy_paths.as_ref().filter(|paths| !paths.is_empty()) {
            let mut entries = read_copywriting_entries(paths)?
                .into_iter()
                .map(|entry| entry.text)
                .filter(|text| !text.trim().is_empty())
                .collect::<Vec<_>>();
            if entries.len() > 1 {
                entries.shuffle(&mut rng);
            }
            if !entries.is_empty() {
                pools.insert(caption_index, entries);
            }
        }
    }
    Ok(pools)
}

pub fn build_caption_style_pools(captions: &[CaptionExportLine]) -> Result<CaptionStylePools, String> {
    let mut pools = HashMap::new();
    let mut rng = rand::thread_rng();
    for (caption_index, caption) in captions.iter().enumerate() {
        if let Some(paths) = caption.style_paths.as_ref().filter(|paths| !paths.is_empty()) {
            let mut styles = paths
                .iter()
                .filter(|path| !path.trim().is_empty())
                .map(|path| parse_caption_style_file(Path::new(path)))
                .collect::<Vec<_>>();
            if styles.len() > 1 {
                styles.shuffle(&mut rng);
            }
            if !styles.is_empty() {
                pools.insert(caption_index, styles);
            }
        }
    }
    Ok(pools)
}

fn resolve_copywriting_captions(captions: &[CaptionExportLine], video_index: usize, copywriting_pools: &CopywritingPools) -> Vec<CaptionExportLine> {
    let mut resolved = Vec::with_capacity(captions.len());
    for (caption_index, caption) in captions.iter().enumerate() {
        let mut next = caption.clone();
        if let Some(entries) = copywriting_pools.get(&caption_index).filter(|entries| !entries.is_empty()) {
            let selected = &entries[(video_index - 1) % entries.len()];
            next.text = selected.clone();
        }
        resolved.push(next);
    }
    resolved
}

fn resolve_caption_styles(captions: &[CaptionExportLine], video_index: usize, caption_style_pools: &CaptionStylePools) -> Vec<CaptionExportLine> {
    if captions.iter().any(|caption| caption.same_video_style.unwrap_or(false)) {
        return resolve_same_video_caption_styles(captions, video_index, caption_style_pools);
    }

    let mut resolved = Vec::with_capacity(captions.len());
    for (caption_index, caption) in captions.iter().enumerate() {
        let mut next = caption.clone();
        if let Some(styles) = caption_style_pools.get(&caption_index).filter(|styles| !styles.is_empty()) {
            let selected = &styles[(video_index - 1) % styles.len()];
            apply_caption_style(&mut next, selected);
        }
        resolved.push(next);
    }
    resolved
}

fn resolve_same_video_caption_styles(captions: &[CaptionExportLine], video_index: usize, caption_style_pools: &CaptionStylePools) -> Vec<CaptionExportLine> {
    let shared_style = captions
        .iter()
        .enumerate()
        .find_map(|(caption_index, _)| caption_style_pools.get(&caption_index).filter(|styles| !styles.is_empty()))
        .map(|styles| styles[(video_index - 1) % styles.len()].clone());

    let mut resolved = Vec::with_capacity(captions.len());
    for caption in captions {
        let mut next = caption.clone();
        if caption.style_paths.as_ref().map(|paths| !paths.is_empty()).unwrap_or(false) {
            if let Some(style) = shared_style.as_ref() {
                apply_caption_style(&mut next, style);
            }
        }
        resolved.push(next);
    }
    resolved
}

fn apply_caption_style(caption: &mut CaptionExportLine, style: &CaptionStyleFile) {
    caption.font_color = style.font_color.clone();
    caption.outline_color = style.outline_color.clone();
    caption.outline = style.outline;
    caption.shadow = style.shadow;
}

fn collect_caption_style_files(directory: &Path, files: &mut Vec<CaptionStyleFile>) -> Result<(), String> {
    for entry in fs::read_dir(directory).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        if path.is_dir() {
            collect_caption_style_files(&path, files)?;
            continue;
        }

        let is_ass = path
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| value.eq_ignore_ascii_case("ass"))
            .unwrap_or(false);
        if !is_ass {
            continue;
        }

        files.push(parse_caption_style_file(&path));
    }

    Ok(())
}

fn parse_caption_style_file(path: &Path) -> CaptionStyleFile {
    let content = fs::read_to_string(path).unwrap_or_default();
    let mut font_size = 64.0;
    let mut font_color = "#FFFFFF".to_string();
    let mut outline_color = "#000000".to_string();
    let mut outline = 4.0;
    let mut shadow = 2.0;
    let mut sample_text = "花字".to_string();

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("Style:") {
            let values = trimmed.trim_start_matches("Style:").split(',').map(str::trim).collect::<Vec<_>>();
            if values.len() >= 18 {
                font_size = values.get(2).and_then(|value| value.parse::<f64>().ok()).unwrap_or(font_size);
                font_color = ass_bgr_to_rgb(values.get(3).copied().unwrap_or_default()).unwrap_or(font_color);
                outline_color = ass_bgr_to_rgb(values.get(5).copied().unwrap_or_default()).unwrap_or(outline_color);
                outline = values.get(16).and_then(|value| value.parse::<f64>().ok()).unwrap_or(outline);
                shadow = values.get(17).and_then(|value| value.parse::<f64>().ok()).unwrap_or(shadow);
            }
        }

        if trimmed.starts_with("Dialogue:") {
            if let Some(text) = trimmed.splitn(10, ',').nth(9) {
                let cleaned = strip_ass_tags(text);
                if !cleaned.trim().is_empty() {
                    sample_text = cleaned;
                    break;
                }
            }
        }
    }

    let name = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("ASS")
        .to_string();

    CaptionStyleFile {
        id: path.to_string_lossy().to_string(),
        name,
        path: path.to_string_lossy().to_string(),
        sample_text,
        font_size: clamp_f64(font_size, 18.0, 120.0),
        font_color,
        outline_color,
        outline: clamp_f64(outline, 0.0, 12.0),
        shadow: clamp_f64(shadow, 0.0, 12.0),
    }
}

fn favorite_caption_dir() -> Result<PathBuf, String> {
    let profile = std::env::var("USERPROFILE").map_err(|_| "USERPROFILE was not found".to_string())?;
    Ok(PathBuf::from(profile)
        .join("AppData")
        .join("Local")
        .join("很高兴为您服务")
        .join("caption-style-favorites"))
}

fn hash_path(path: &Path) -> u64 {
    let mut hasher = DefaultHasher::new();
    path.to_string_lossy().hash(&mut hasher);
    hasher.finish()
}

fn ass_bgr_to_rgb(value: &str) -> Option<String> {
    let hex = value.trim().trim_start_matches("&H").trim_start_matches("&h");
    if hex.len() < 6 {
        return None;
    }

    let color = &hex[hex.len() - 6..];
    let blue = &color[0..2];
    let green = &color[2..4];
    let red = &color[4..6];
    Some(format!("#{}{}{}", red, green, blue))
}

fn strip_ass_tags(value: &str) -> String {
    let mut output = String::new();
    let mut in_tag = false;

    for character in value.chars() {
        match character {
            '{' => in_tag = true,
            '}' => in_tag = false,
            _ if !in_tag => output.push(character),
            _ => {}
        }
    }

    output.replace("\\N", "\n").replace("\\n", "\n").trim().to_string()
}

pub fn run_caption_ffmpeg(video_path: &str, ass_path: &Path, output_path: &Path) -> Result<(), String> {
    let mut command = Command::new(ffmpeg_executable());
    hide_command_window(&mut command);

    let filter = format!("subtitles='{}'", ffmpeg_filter_path(ass_path));
    let output = command
        .arg("-y")
        .arg("-i")
        .arg(video_path)
        .arg("-vf")
        .arg(filter)
        .arg("-c:v")
        .arg("libx264")
        .arg("-preset")
        .arg("veryfast")
        .arg("-crf")
        .arg("20")
        .arg("-c:a")
        .arg("copy")
        .arg(output_path)
        .output()
        .map_err(|error| {
            if error.kind() == std::io::ErrorKind::NotFound {
                "ffmpeg was not found. Install FFmpeg and add it to PATH".to_string()
            } else {
                error.to_string()
            }
        })?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(stderr.lines().last().unwrap_or("FFmpeg failed").to_string())
    }
}

fn resolve_caption_output_dir(output_dir: &str, params: &RenameParams) -> Result<PathBuf, String> {
    if !output_dir.trim().is_empty() {
        return Ok(PathBuf::from(output_dir.trim()));
    }

    let profile = std::env::var("USERPROFILE").map_err(|_| "USERPROFILE was not found".to_string())?;
    let desktop = PathBuf::from(profile).join("Desktop");
    if !desktop.is_dir() {
        return Err("Desktop directory was not found".to_string());
    }

    let name = [
        sanitize_stem(&params.country),
        sanitize_stem(&params.material),
        Local::now().format("%m%d_%H%M%S").to_string(),
    ]
    .into_iter()
    .filter(|value| !value.is_empty())
    .collect::<Vec<_>>()
    .join("_");
    let output = desktop.join(if name.is_empty() { "caption_export".to_string() } else { name });
    fs::create_dir_all(&output).map_err(|error| error.to_string())?;
    Ok(output)
}

fn ass_time(seconds: f64) -> String {
    let centiseconds = (seconds.max(0.0) * 100.0).round() as u64;
    let hours = centiseconds / 360_000;
    let minutes = (centiseconds % 360_000) / 6_000;
    let secs = (centiseconds % 6_000) / 100;
    let cs = centiseconds % 100;
    format!("{}:{:02}:{:02}.{:02}", hours, minutes, secs, cs)
}

fn ass_color(value: &str) -> String {
    let hex = value.trim().trim_start_matches('#');
    if hex.len() != 6 {
        return "&H00FFFFFF".to_string();
    }

    let r = &hex[0..2];
    let g = &hex[2..4];
    let b = &hex[4..6];
    format!("&H00{}{}{}", b, g, r)
}

fn ass_text(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('{', "\\{")
        .replace('}', "\\}")
        .replace("\r\n", "\\N")
        .replace('\n', "\\N")
}

fn ass_wrapped_text(value: &str, font_size: f64, box_width_percent: f64) -> String {
    let font_size = clamp_f64(font_size, 18.0, 120.0);
    let box_width = 1080.0 * clamp_f64(box_width_percent, 24.0, 90.0) / 100.0;
    let max_units = (box_width / font_size).max(1.0);
    let normalized = value.replace("\r\n", "\n").replace('\r', "\n");
    let mut output_lines = Vec::new();

    for source_line in normalized.split('\n') {
        if source_line.is_empty() {
            output_lines.push(String::new());
            continue;
        }

        let mut current = String::new();
        let mut current_width = 0.0;

        for character in source_line.chars() {
            let character_width = ass_character_width(character);
            if !current.is_empty() && current_width + character_width > max_units {
                output_lines.push(current.trim_end().to_string());
                current.clear();
                current_width = 0.0;
                if character.is_whitespace() {
                    continue;
                }
            }

            current.push(character);
            current_width += character_width;
        }

        output_lines.push(current.trim_end().to_string());
    }

    output_lines
        .into_iter()
        .map(|line| ass_text(&line))
        .collect::<Vec<_>>()
        .join("\\N")
}

fn ass_character_width(character: char) -> f64 {
    if character.is_whitespace() {
        0.33
    } else if character.is_ascii_punctuation() {
        0.38
    } else if character.is_ascii() {
        0.58
    } else if is_cjk_character(character) {
        1.0
    } else {
        0.72
    }
}

fn is_cjk_character(character: char) -> bool {
    matches!(
        character as u32,
        0x2E80..=0x9FFF | 0xAC00..=0xD7AF | 0xF900..=0xFAFF | 0xFF00..=0xFFEF
    )
}

fn ffmpeg_filter_path(path: &Path) -> String {
    path.to_string_lossy()
        .replace('\\', "/")
        .replace(':', "\\:")
        .replace('\'', "\\'")
}

fn sanitize_stem(value: &str) -> String {
    value
        .trim()
        .chars()
        .map(|character| match character {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            _ => character,
        })
        .collect()
}

fn clamp_f64(value: f64, min: f64, max: f64) -> f64 {
    value.min(max).max(min)
}

fn hide_command_window(command: &mut Command) {
    #[cfg(windows)]
    {
        command.creation_flags(CREATE_NO_WINDOW);
    }
}

fn ffmpeg_executable() -> PathBuf {
    for candidate in bundled_ffmpeg_candidates() {
        if candidate.is_file() {
            return candidate;
        }
    }

    let common_paths = [
        r"C:\ffmpeg\ffmpeg-8.1.1-essentials_build\bin\ffmpeg.exe",
        r"C:\ffmpeg\bin\ffmpeg.exe",
        r"C:\Program Files\ffmpeg\bin\ffmpeg.exe",
        r"C:\Program Files (x86)\ffmpeg\bin\ffmpeg.exe",
    ];

    for path in common_paths {
        let candidate = PathBuf::from(path);
        if candidate.is_file() {
            return candidate;
        }
    }

    PathBuf::from("ffmpeg")
}

fn bundled_ffmpeg_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(exe_dir) = current_exe.parent() {
            candidates.push(exe_dir.join("ffmpeg.exe"));
            candidates.push(exe_dir.join("ffmpeg").join("ffmpeg.exe"));
            candidates.push(exe_dir.join("resources").join("ffmpeg").join("ffmpeg.exe"));
            candidates.push(exe_dir.join("resources").join("resources").join("ffmpeg").join("ffmpeg.exe"));
        }
    }

    candidates.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources").join("ffmpeg").join("ffmpeg.exe"));
    candidates
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converts_rgb_hex_to_ass_bgr() {
        assert_eq!(ass_color("#FF2D55"), "&H00552DFF");
    }

    #[test]
    fn formats_ass_time_with_centiseconds() {
        assert_eq!(ass_time(62.34), "0:01:02.34");
    }

    #[test]
    fn escapes_ass_text() {
        assert_eq!(ass_text("A{B}\nC"), "A\\{B\\}\\NC");
    }

    #[test]
    fn wraps_caption_text_to_match_preview_width() {
        let wrapped = ass_wrapped_text("ABCDEFGHIJKL", 60.0, 30.0);
        assert!(wrapped.contains("\\N"));
    }

    #[test]
    fn writes_caption_box_width_and_full_font_size() {
        let path = std::env::temp_dir().join(format!("caption-test-{}.ass", std::process::id()));
        let caption = CaptionExportLine {
            text: "ABCDEFGHIJKL".to_string(),
            start_time: 0.0,
            end_time: 2.0,
            copy_paths: None,
            style_paths: None,
            same_video_style: None,
            box_width_percent: 30.0,
            font_size: 120.0,
            font_color: "#FFFFFF".to_string(),
            outline_color: "#000000".to_string(),
            outline: 10.0,
            shadow: 9.0,
            position: super::super::types::CaptionPosition {
                x_percent: 50.0,
                y_percent: 50.0,
            },
        };

        write_ass_file(&path, &[caption]).unwrap();
        let ass = fs::read_to_string(&path).unwrap();
        let _ = fs::remove_file(&path);

        assert!(ass.contains("Style: Caption1,Arial,120,"));
        assert!(ass.contains("\\N"));
        assert!(ass.contains("\\q0"));
        assert!(!ass.contains("\\q2"));
    }
}
