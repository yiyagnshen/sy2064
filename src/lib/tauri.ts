import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type {
  AppendCopywritingRequest,
  CaptionExportRequest,
  CaptionStyleFile,
  CopywritingEntry,
  ExportCopywritingLibraryRequest,
  FavoriteCaptionStyleRequest,
  ProcessResult,
  TaskRequest,
  VideoFile
} from "./types";

export const videoExtensions = ["mp4", "mov", "m4v", "avi", "mkv", "webm"];
export const audioExtensions = ["mp3", "wav", "aac", "m4a", "ogg", "flac", "wma", "opus", "amr"];

export async function pickDirectory() {
  const selected = await open({ directory: true, multiple: false });
  return typeof selected === "string" ? selected : "";
}

export async function pickDirectories() {
  const selected = await open({ directory: true, multiple: true });
  if (Array.isArray(selected)) return selected;
  return typeof selected === "string" ? [selected] : [];
}

export async function pickAudioFile() {
  const selected = await open({
    directory: false,
    multiple: false,
    filters: [
      {
        name: "Audio or video",
        extensions: [...audioExtensions, ...videoExtensions]
      }
    ]
  });
  return typeof selected === "string" ? selected : "";
}

export async function pickCopywritingFile() {
  const selected = await open({
    directory: false,
    multiple: false,
    filters: [
      {
        name: "Copywriting library",
        extensions: ["json", "txt", "csv"]
      }
    ]
  });
  return typeof selected === "string" ? selected : "";
}

export async function pickVideoFiles() {
  const selected = await open({
    directory: false,
    multiple: true,
    filters: [{ name: "Video", extensions: videoExtensions }]
  });

  if (Array.isArray(selected)) {
    return selected.map(videoFileFromPath);
  }

  return typeof selected === "string" ? [videoFileFromPath(selected)] : [];
}

export function listVideoFiles(directory: string) {
  return invoke<VideoFile[]>("list_video_files", { directory });
}

export function processVideos(request: TaskRequest) {
  return invoke<ProcessResult>("process_videos", { request });
}

export function processCaptionVideos(request: CaptionExportRequest) {
  return invoke<ProcessResult>("process_caption_videos", { request });
}

export function listCaptionStyleFiles(directory: string) {
  return invoke<CaptionStyleFile[]>("list_caption_style_files", { directory });
}

export function listFavoriteCaptionStyleFiles() {
  return invoke<CaptionStyleFile[]>("list_favorite_caption_style_files");
}

export function favoriteCaptionStyleFile(request: FavoriteCaptionStyleRequest) {
  return invoke<CaptionStyleFile>("favorite_caption_style_file", { request });
}

export function listCopywritingEntries(paths: string[]) {
  return invoke<CopywritingEntry[]>("list_copywriting_entries", { paths });
}

export function appendCopywritingEntry(request: AppendCopywritingRequest) {
  return invoke<string>("append_copywriting_entry", { request });
}

export function exportCopywritingLibrary(request: ExportCopywritingLibraryRequest) {
  return invoke<string>("export_copywriting_library", { request });
}

export function isVideoPath(path: string) {
  return videoExtensions.includes(extensionFromPath(path));
}

export function isAudioPath(path: string) {
  return audioExtensions.includes(extensionFromPath(path));
}

export function videoFileFromPath(path: string): VideoFile {
  const normalized = path.replace(/\\/g, "/");
  const name = normalized.split("/").pop() || path;
  const dotIndex = name.lastIndexOf(".");
  const stem = dotIndex > 0 ? name.slice(0, dotIndex) : name;
  const extension = dotIndex > 0 ? name.slice(dotIndex + 1).toLowerCase() : "";

  return { path, name, stem, extension };
}

function extensionFromPath(path: string) {
  const normalized = path.replace(/\\/g, "/");
  const name = normalized.split("/").pop() || "";
  const dotIndex = name.lastIndexOf(".");
  return dotIndex > 0 ? name.slice(dotIndex + 1).toLowerCase() : "";
}
