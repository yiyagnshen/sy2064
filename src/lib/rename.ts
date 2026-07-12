import type { RenameParams, RenamePreview, VideoFile } from "./types";

const padIndex = (index: number) => String(index).padStart(3, "0");

export function renderFileName(
  template: string,
  file: VideoFile,
  index: number,
  params: RenameParams
) {
  const values: Record<string, string> = {
    date: params.date.trim(),
    country: params.country.trim(),
    material: params.material.trim(),
    product: params.material.trim(),
    resolution: params.resolution.trim(),
    version: params.version.trim(),
    platform: params.platform.trim(),
    index: padIndex(index),
    origin: file.stem
  };

  const stem = template
    .replace(/\{(date|country|material|product|resolution|version|platform|index|origin)\}/g, (_, key) => {
      return values[key] || "";
    })
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");

  return `${stem || file.stem}.${file.extension}`;
}

export function buildRenamePreview(
  files: VideoFile[],
  template: string,
  params: RenameParams
): RenamePreview[] {
  return files.map((file, idx) => ({
    source: file.name,
    target: renderFileName(template, file, idx + 1, params)
  }));
}
