use std::fs;
use std::path::Path;
use std::path::PathBuf;
use std::process::Command;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

use chrono::Local;
use rand::seq::SliceRandom;
use tauri::{AppHandle, Emitter};

use super::caption::{build_caption_style_pools, build_copywriting_pools, burn_captions_to_video, caption_has_content, prepare_caption_ass_file};
use super::files::list_audio_files;
use super::rename::render_file_name;
use super::types::{CaptionExportLine, ProcessProgressEvent, ProcessResult, TaskRequest};

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[tauri::command]
pub fn process_videos(app: AppHandle, request: TaskRequest) -> Result<ProcessResult, String> {
    validate_request(&request)?;
    let output_dir = resolve_output_dir(&request)?;
    let task_id = request.task_id.clone().unwrap_or_else(|| "default".to_string());

    let audio_pool = if request.task_mode == "replaceAudio" && request.audio_mode == "random" {
        let directory = request.audio_dir.as_deref().unwrap_or_default();
        let files = list_audio_files(directory)?;
        if files.is_empty() {
            return Err("No supported audio files found in the audio directory".to_string());
        }
        files
    } else {
        Vec::new()
    };

    let mut rng = rand::thread_rng();
    let mut success = 0;
    let mut failed = 0;
    let mut logs = Vec::new();
    let captions = request.captions.as_deref().unwrap_or(&[]);
    let should_burn_captions = has_active_captions(captions);
    let copywriting_pools = if should_burn_captions {
        build_copywriting_pools(captions)?
    } else {
        Default::default()
    };
    let caption_style_pools = if should_burn_captions {
        build_caption_style_pools(captions)?
    } else {
        Default::default()
    };
    let subtitle_dir = output_dir.join("_subtitles");
    let temp_dir = output_dir.join("_temp");
    if should_burn_captions {
        fs::create_dir_all(&subtitle_dir).map_err(|error| error.to_string())?;
        fs::create_dir_all(&temp_dir).map_err(|error| error.to_string())?;
    }

    emit_progress(
        &app,
        &task_id,
        "started",
        request.videos.len(),
        0,
        success,
        failed,
        "Task started".to_string(),
    );

    for (index, video) in request.videos.iter().enumerate() {
        let output_name = render_file_name(
            &request.rename_template,
            video,
            index + 1,
            &request.rename_params,
        );
        let mut output_path = output_dir.join(output_name);
        if should_burn_captions {
            output_path.set_extension("mp4");
        }
        let use_combined_replace_audio_caption = should_burn_captions && request.task_mode == "replaceAudio";
        let temp_path = temp_dir.join(format!("{}_{}.mp4", sanitize_folder_part(&video.stem), index + 1));
        let base_output_path = if should_burn_captions && !use_combined_replace_audio_caption { &temp_path } else { &output_path };

        let task_result = match request.task_mode.as_str() {
            "renameOnly" => copy_renamed_video(&video.path, base_output_path),
            "silentVideo" => run_silent_video_ffmpeg(&video.path, &base_output_path.to_string_lossy()),
            _ => {
                let audio_path = if request.audio_mode == "random" {
                    audio_pool
                        .choose(&mut rng)
                        .cloned()
                        .ok_or_else(|| "Failed to choose a random audio file".to_string())?
                } else {
                    request.single_audio_path.clone().unwrap_or_default()
                };

                if use_combined_replace_audio_caption {
                    let ass_path = prepare_caption_ass_file(
                        captions,
                        &subtitle_dir,
                        &video.stem,
                        index + 1,
                        &copywriting_pools,
                        &caption_style_pools,
                    )?;
                    run_replace_audio_with_captions_ffmpeg(
                        &video.path,
                        &audio_path,
                        &ass_path,
                        &output_path,
                        &request.short_audio_mode,
                    )
                } else {
                    run_replace_audio_ffmpeg(
                        &video.path,
                        &audio_path,
                        &base_output_path.to_string_lossy(),
                        &request.short_audio_mode,
                    )
                }
            }
        }
        .and_then(|_| {
            if should_burn_captions && !use_combined_replace_audio_caption {
                burn_captions_to_video(
                    &base_output_path.to_string_lossy(),
                    captions,
                    &subtitle_dir,
                    &output_path,
                    &video.stem,
                    index + 1,
                    &copywriting_pools,
                    &caption_style_pools,
                )?;
                let _ = fs::remove_file(base_output_path);
            }
            Ok(())
        });

        match task_result {
            Ok(()) => {
                success += 1;
                let log = format!("OK: {} -> {}", video.name, output_path.display());
                emit_progress(
                    &app,
                    &task_id,
                    "item",
                    request.videos.len(),
                    index + 1,
                    success,
                    failed,
                    log.clone(),
                );
                logs.push(log);
            }
            Err(error) => {
                failed += 1;
                let log = format!("FAILED: {}, {}", video.name, error);
                emit_progress(
                    &app,
                    &task_id,
                    "item",
                    request.videos.len(),
                    index + 1,
                    success,
                    failed,
                    log.clone(),
                );
                logs.push(log);
            }
        }
    }

    emit_progress(
        &app,
        &task_id,
        "finished",
        request.videos.len(),
        request.videos.len(),
        success,
        failed,
        "Task finished".to_string(),
    );

    Ok(ProcessResult {
        success,
        failed,
        logs,
    })
}

fn emit_progress(
    app: &AppHandle,
    task_id: &str,
    status: &str,
    total: usize,
    current: usize,
    success: usize,
    failed: usize,
    log: String,
) {
    let _ = app.emit(
        "process-progress",
        ProcessProgressEvent {
            task_id: task_id.to_string(),
            status: status.to_string(),
            total,
            current,
            success,
            failed,
            log,
        },
    );
}

fn has_active_captions(captions: &[CaptionExportLine]) -> bool {
    captions.iter().any(caption_has_content)
}

fn validate_request(request: &TaskRequest) -> Result<(), String> {
    if request.videos.is_empty() {
        return Err("Please select a video directory first".to_string());
    }

    if !request.output_dir.trim().is_empty() && !Path::new(&request.output_dir).is_dir() {
        return Err("Output directory does not exist".to_string());
    }

    if request.task_mode == "replaceAudio" && request.audio_mode == "single" {
        let audio = request.single_audio_path.as_deref().unwrap_or_default();
        if !Path::new(audio).is_file() {
            return Err("Please select one audio file".to_string());
        }
    }

    if request.task_mode == "replaceAudio" && request.audio_mode == "random" {
        let audio_dir = request.audio_dir.as_deref().unwrap_or_default();
        if !Path::new(audio_dir).is_dir() {
            return Err("Please select an audio asset directory".to_string());
        }
    }

    Ok(())
}

fn resolve_output_dir(request: &TaskRequest) -> Result<PathBuf, String> {
    if !request.output_dir.trim().is_empty() {
        return Ok(PathBuf::from(request.output_dir.trim()));
    }

    let desktop = desktop_dir()?;
    let date_code = Local::now().format("%m%d").to_string();
    let country = sanitize_folder_part(&request.rename_params.country);
    let material = sanitize_folder_part(&request.rename_params.material);
    let base_name = [country, material, date_code.clone()]
        .into_iter()
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>()
        .join("_");

    let base_name = if base_name.is_empty() {
        "video_export".to_string()
    } else {
        base_name
    };
    let mut suffix = next_daily_suffix(&desktop, &date_code)?;
    let mut candidate = desktop.join(format!("{}_{:02}", base_name, suffix));
    while candidate.exists() {
        suffix += 1;
        candidate = desktop.join(format!("{}_{:02}", base_name, suffix));
    }

    fs::create_dir_all(&candidate).map_err(|error| error.to_string())?;
    Ok(candidate)
}

fn next_daily_suffix(desktop: &Path, date_code: &str) -> Result<usize, String> {
    let mut max_suffix = 0;

    for entry in fs::read_dir(desktop).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };

        let parts = name.rsplitn(3, '_').collect::<Vec<_>>();
        if parts.len() < 3 || parts[1] != date_code {
            continue;
        }

        if let Ok(suffix) = parts[0].parse::<usize>() {
            max_suffix = max_suffix.max(suffix);
        }
    }

    Ok(max_suffix + 1)
}

fn copy_renamed_video(video_path: &str, output_path: &Path) -> Result<(), String> {
    fs::copy(video_path, output_path)
        .map(|_| ())
        .map_err(|error| error.to_string())
}

fn desktop_dir() -> Result<PathBuf, String> {
    let profile = std::env::var("USERPROFILE").map_err(|_| "USERPROFILE was not found".to_string())?;
    let desktop = PathBuf::from(profile).join("Desktop");
    if desktop.is_dir() {
        Ok(desktop)
    } else {
        Err("Desktop directory was not found".to_string())
    }
}

fn sanitize_folder_part(value: &str) -> String {
    value
        .trim()
        .chars()
        .map(|character| match character {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            _ => character,
        })
        .collect()
}

fn run_replace_audio_ffmpeg(
    video_path: &str,
    audio_path: &str,
    output_path: &str,
    short_audio_mode: &str,
) -> Result<(), String> {
    let mut command = Command::new(ffmpeg_executable());
    hide_command_window(&mut command);
    command.arg("-y").arg("-i").arg(video_path);

    if short_audio_mode == "loop" {
        command.arg("-stream_loop").arg("-1");
    }

    command
        .arg("-i")
        .arg(audio_path)
        .arg("-map")
        .arg("0:v:0")
        .arg("-map")
        .arg("1:a:0")
        .arg("-c:v")
        .arg("copy")
        .arg("-c:a")
        .arg("aac");

    if short_audio_mode == "silence" {
        command.arg("-af").arg("apad");
    }

    command.arg("-shortest").arg(output_path);

    let output = command.output().map_err(|error| {
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
        Err(format_ffmpeg_error(&stderr))
    }
}

fn run_replace_audio_with_captions_ffmpeg(
    video_path: &str,
    audio_path: &str,
    ass_path: &Path,
    output_path: &Path,
    short_audio_mode: &str,
) -> Result<(), String> {
    let mut command = Command::new(ffmpeg_executable());
    hide_command_window(&mut command);
    command.arg("-y").arg("-i").arg(video_path);

    if short_audio_mode == "loop" {
        command.arg("-stream_loop").arg("-1");
    }

    let filter = format!("subtitles='{}'", ffmpeg_filter_path(ass_path));
    command
        .arg("-i")
        .arg(audio_path)
        .arg("-vf")
        .arg(filter)
        .arg("-map")
        .arg("0:v:0")
        .arg("-map")
        .arg("1:a:0")
        .arg("-c:v")
        .arg("libx264")
        .arg("-preset")
        .arg("veryfast")
        .arg("-crf")
        .arg("20")
        .arg("-c:a")
        .arg("aac");

    if short_audio_mode == "silence" {
        command.arg("-af").arg("apad");
    }

    command.arg("-shortest").arg(output_path);

    let output = command.output().map_err(|error| {
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
        Err(format_ffmpeg_error(&stderr))
    }
}

fn run_silent_video_ffmpeg(video_path: &str, output_path: &str) -> Result<(), String> {
    let mut command = Command::new(ffmpeg_executable());
    hide_command_window(&mut command);

    let output = command
        .arg("-y")
        .arg("-i")
        .arg(video_path)
        .arg("-f")
        .arg("lavfi")
        .arg("-i")
        .arg("anullsrc=channel_layout=stereo:sample_rate=44100")
        .arg("-map")
        .arg("0:v:0")
        .arg("-map")
        .arg("1:a:0")
        .arg("-c:v")
        .arg("copy")
        .arg("-c:a")
        .arg("aac")
        .arg("-shortest")
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
        Err(format_ffmpeg_error(&stderr))
    }
}

fn hide_command_window(command: &mut Command) {
    #[cfg(windows)]
    {
        command.creation_flags(CREATE_NO_WINDOW);
    }
}

fn format_ffmpeg_error(stderr: &str) -> String {
    if stderr.contains("Stream map '1:a:0' matches no streams")
        || stderr.contains("matches no streams")
        || stderr.contains("Stream specifier ':a'")
    {
        return "所选音频/视频文件没有可用音轨".to_string();
    }

    stderr.lines().last().unwrap_or("FFmpeg failed").to_string()
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

fn ffmpeg_filter_path(path: &Path) -> String {
    path.to_string_lossy()
        .replace('\\', "/")
        .replace(':', "\\:")
        .replace('\'', "\\'")
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
