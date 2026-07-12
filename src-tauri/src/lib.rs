mod commands;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::files::list_video_files,
            commands::ffmpeg::process_videos,
            commands::caption::process_caption_videos,
            commands::caption::list_caption_style_files,
            commands::caption::list_favorite_caption_style_files,
            commands::caption::favorite_caption_style_file,
            commands::copywriting::list_copywriting_entries,
            commands::copywriting::append_copywriting_entry,
            commands::copywriting::export_copywriting_library
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
