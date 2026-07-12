export type AudioMode = "single" | "random";
export type ShortAudioMode = "loop" | "silence";
export type TaskMode = "replaceAudio" | "renameOnly" | "silentVideo";

export type VideoFile = {
  path: string;
  name: string;
  stem: string;
  extension: string;
};

export type AudioProductFolder = {
  id: string;
  name: string;
  path: string;
  enabled: boolean;
};

export type AudioCountryPreset = {
  id: string;
  name: string;
  enabled: boolean;
  products: AudioProductFolder[];
};

export type CaptionStyleLibrary = {
  id: string;
  name: string;
  path: string;
  enabled: boolean;
};

export type CaptionStyleFile = {
  id: string;
  name: string;
  path: string;
  sampleText: string;
  fontSize: number;
  fontColor: string;
  outlineColor: string;
  outline: number;
  shadow: number;
};

export type FavoriteCaptionStyleRequest = {
  sourcePath: string;
};

export type CopyProductBinding = {
  id: string;
  name: string;
  enabled: boolean;
  paths: string[];
};

export type CopyCountryBinding = {
  id: string;
  name: string;
  enabled: boolean;
  products: CopyProductBinding[];
};

export type CopyLabels = {
  country: string;
  product: string;
};

export type CopywritingEntry = {
  text: string;
  sourcePath: string;
};

export type AppendCopywritingRequest = {
  path: string;
  text: string;
};

export type ExportCopywritingLibraryRequest = {
  countries: CopyCountryBinding[];
  outputDir: string;
};

export type RenameParams = {
  date: string;
  country: string;
  material: string;
  resolution: string;
  version: string;
  platform: string;
};

export type RenameOptions = {
  countries: string[];
  materials: string[];
  resolutions: string[];
  versions: string[];
  platforms: string[];
};

export type RenameEnabled = {
  date: boolean;
  country: boolean;
  material: boolean;
  resolution: boolean;
  version: boolean;
  platform: boolean;
};

export type RenameLabels = {
  date: string;
  country: string;
  material: string;
  resolution: string;
  version: string;
  platform: string;
};

export type RenamePreview = {
  source: string;
  target: string;
};

export type CaptionPosition = {
  xPercent: number;
  yPercent: number;
};

export type CaptionLine = {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  copyCountryId: string;
  copyProductId: string;
  boxWidthPercent: number;
  fontSize: number;
  fontColor: string;
  outlineColor: string;
  outline: number;
  shadow: number;
  position: CaptionPosition;
};

export type TaskRequest = {
  taskId?: string;
  videos: VideoFile[];
  outputDir: string;
  renameTemplate: string;
  renameParams: RenameParams;
  taskMode: TaskMode;
  audioMode: AudioMode;
  singleAudioPath?: string;
  audioDir?: string;
  shortAudioMode: ShortAudioMode;
  captions?: CaptionExportLine[];
};

export type CaptionExportLine = {
  text: string;
  startTime: number;
  endTime: number;
  copyPaths?: string[];
  stylePaths?: string[];
  sameVideoStyle?: boolean;
  boxWidthPercent: number;
  fontSize: number;
  fontColor: string;
  outlineColor: string;
  outline: number;
  shadow: number;
  position: {
    xPercent: number;
    yPercent: number;
  };
};

export type CaptionExportRequest = {
  videos: VideoFile[];
  outputDir: string;
  renameTemplate: string;
  renameParams: RenameParams;
  captions: CaptionExportLine[];
};

export type ProcessResult = {
  success: number;
  failed: number;
  logs: string[];
};

export type ProcessProgressEvent = {
  taskId: string;
  status: "started" | "item" | "finished";
  total: number;
  current: number;
  success: number;
  failed: number;
  log: string;
};
