import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, FileVideo, FolderOpen } from "lucide-react";
import { currentMonitor, getCurrentWindow, PhysicalPosition, PhysicalSize } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { AppTitleBar } from "./components/AppTitleBar";
import { PathField } from "./components/PathField";
import { RenamePanel } from "./components/RenamePanel";
import { AudioPanel } from "./components/AudioPanel";
import { TaskLog } from "./components/TaskLog";
import { SettingsPage } from "./components/SettingsPage";
import { CaptionPage } from "./components/CaptionPage";
import { buildRenamePreview } from "./lib/rename";
import {
  isAudioPath,
  isVideoPath,
  listVideoFiles,
  pickAudioFile,
  pickCopywritingFile,
  pickDirectories,
  pickDirectory,
  pickVideoFiles,
  processVideos,
  videoFileFromPath
} from "./lib/tauri";
import type {
  AudioCountryPreset,
  CaptionExportLine,
  CaptionLine,
  ProcessProgressEvent,
  AudioMode,
  CaptionStyleFile,
  CaptionStyleLibrary,
  CopyCountryBinding,
  CopyLabels,
  RenameEnabled,
  RenameLabels,
  RenameOptions,
  RenameParams,
  ShortAudioMode,
  TaskMode,
  VideoFile
} from "./lib/types";

const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");

const defaultRenameOptions: RenameOptions = {
  countries: ["印尼", "越南", "菲律宾", "新加坡", "马来西亚", "泰国"],
  materials: ["眼睛", "茶叶", "肠胃", "洗护液", "酸言", "喉咙"],
  resolutions: ["1080P", "4K"],
  versions: Array.from({ length: 16 }, (_, index) => `V${index + 1}`),
  platforms: ["TikTok", "Shopee"]
};

const defaultRenameParams: RenameParams = {
  date: today,
  country: "印尼",
  material: "眼睛",
  resolution: "1080P",
  version: "V1",
  platform: "TikTok"
};

const defaultRenameEnabled: RenameEnabled = {
  date: true,
  country: true,
  material: true,
  resolution: true,
  version: true,
  platform: true
};

const defaultRenameLabels: RenameLabels = {
  date: "日期",
  country: "国家",
  material: "素材",
  resolution: "分辨率",
  version: "版本",
  platform: "平台"
};

const defaultCopyLabels: CopyLabels = {
  country: "国家",
  product: "产品"
};

const defaultCaptionLines: CaptionLine[] = [
  createCaptionLine("6.6 BIG SALE", 0, 2, { xPercent: 50, yPercent: 18 }, 68, "#ffffff", "#ff2d55"),
  createCaptionLine("Order Now", 2, 4, { xPercent: 50, yPercent: 74 }, 58, "#ffd60a", "#000000")
];

const storageKeys = {
  renameOptions: "vpro.renameOptions",
  renameEnabled: "vpro.renameEnabled",
  renameParams: "vpro.renameParams",
  renameLabels: "vpro.renameLabels",
  audioCountries: "vpro.audioCountries",
  captionStyleLibraries: "vpro.caption.styleLibraries",
  copyCountries: "vpro.caption.copyCountries",
  copyLabels: "vpro.caption.copyLabels",
  captionLines: "vpro.caption.lines",
  captionEnabled: "vpro.caption.enabled",
  hideRenameOnlyWarning: "vpro.hideRenameOnlyWarning",
  hideSilentVideoWarning: "vpro.hideSilentVideoWarning",
  windowSize: "glad-service.windowSize.v1",
  theme: "vpro.theme"
};

const appWindow = getCurrentWindow();
const windowLayoutTolerance = 2;

function settleWindowLayout(delay = 80) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, delay);
  });
}

type WorkspaceMode = "clip" | "caption" | "dubbing";
type ClipStage = "start" | "engine" | "risk" | "confirmed";

const clipStartLabel = "点击开始创作你的爆款视频";
const clipEngineLabel = "开启爆款AI引擎";
const clipRiskTitle = "⚠️ 系统风险提示";
const clipRiskText = [
  "当前模块为 TikTok Shop 爆款素材批量生产引擎，主要用于短视频素材测试、内容矩阵扩容、自然流量撬动、广告素材放量及商品转化效率提升。",
  "启用后，系统可能生成具备高点击率、高完播率、高互动率及高转化潜力的素材内容，并在命中平台推荐机制后触发商品曝光增长、点击增长、加购提升、订单放大、ROI 优化及单品权重提升。",
  "请在使用前确认店铺已具备完整承接能力，包括库存安全水位、供应链备货能力、仓储处理效率、物流履约稳定性、客服响应效率、售后处理能力、广告预算空间及平台风控合规能力。",
  "若店铺承接能力不足，素材爆量可能引发库存击穿、发货延迟、客服积压、退款上升、差评增加、体验分下降、广告消耗异常、链接权重受损及后续流量受限等经营风险。",
  "未完成店铺承接能力建设前，请谨慎启用该功能。"
];
const clipRiskConfirmLabel = "我已了解该风险，并已经完成铺承接能力建设";
const clipConfirmLines = ["你TMD做梦呢", "快去拍视频", "顺便给我拍两条"];

function loadJson<T>(key: string, fallback: T) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? ({ ...fallback, ...JSON.parse(raw) } as T) : fallback;
  } catch {
    return fallback;
  }
}

function loadArray<T>(key: string, fallback: T[]) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : fallback;
  } catch {
    return fallback;
  }
}

function loadRenameParams() {
  return { ...loadJson(storageKeys.renameParams, defaultRenameParams), date: today } as RenameParams;
}

function loadCaptionLines() {
  try {
    const raw = localStorage.getItem(storageKeys.captionLines);
    if (!raw) return defaultCaptionLines;
    const parsed = JSON.parse(raw) as CaptionLine[];
    if (!Array.isArray(parsed) || parsed.length === 0) return defaultCaptionLines;
    return parsed.map(normalizeCaptionLine);
  } catch {
    return defaultCaptionLines;
  }
}

function normalizeCaptionLine(line: Partial<CaptionLine>) {
  return {
    ...createCaptionLine(
      line.text || "",
      line.startTime ?? 0,
      line.endTime ?? 2,
      line.position ?? { xPercent: 50, yPercent: 50 },
      line.fontSize ?? 54,
      line.fontColor ?? "#ffffff",
      line.outlineColor ?? "#000000"
    ),
    ...line,
    copyCountryId: line.copyCountryId ?? "",
    copyProductId: line.copyProductId ?? "",
    boxWidthPercent: line.boxWidthPercent ?? 70,
    outline: line.outline ?? 4,
    shadow: line.shadow ?? 2
  };
}

function buildRenameTemplate(enabled: RenameEnabled) {
  return [
    enabled.date ? "{date}" : "",
    enabled.country ? "{country}" : "",
    enabled.material ? "{material}" : "",
    enabled.resolution ? "{resolution}" : "",
    enabled.version ? "{version}" : "",
    enabled.platform ? "{platform}" : "",
    "{index}"
  ]
    .filter(Boolean)
    .join("_");
}

function buildAutoExportFolderPreview(params: RenameParams) {
  const country = sanitizeFolderPart(params.country);
  const material = sanitizeFolderPart(params.material);
  const name = [country, material].filter(Boolean).join("_") || "video_export";
  return `桌面\\${name}`;
}

function sanitizeFolderPart(value: string) {
  return value.trim().replace(/[<>:"/\\|?*]/g, "_");
}

function videoSelectionLabel(videos: VideoFile[]) {
  if (videos.length === 0) return "";
  if (videos.length === 1) return videos[0].name;
  return `已导入 ${videos.length} 个视频`;
}

function mergeVideos(current: VideoFile[], incoming: VideoFile[]) {
  const byPath = new Map(current.map((video) => [video.path, video]));
  for (const video of incoming) byPath.set(video.path, video);
  return Array.from(byPath.values());
}

function createCaptionLine(
  text: string,
  startTime: number,
  endTime: number,
  position: CaptionLine["position"],
  fontSize: number,
  fontColor: string,
  outlineColor: string
): CaptionLine {
  return {
    id: crypto.randomUUID(),
    text,
    startTime,
    endTime,
    copyCountryId: "",
    copyProductId: "",
    boxWidthPercent: 70,
    fontSize,
    fontColor,
    outlineColor,
    outline: 4,
    shadow: 2,
    position
  };
}

function toCaptionExportLine(line: CaptionLine, stylePaths: string[] = [], sameVideoStyle = true): CaptionExportLine {
  return {
    text: line.text,
    startTime: line.startTime,
    endTime: line.endTime >= 12 ? 86400 : line.endTime,
    stylePaths,
    sameVideoStyle,
    boxWidthPercent: line.boxWidthPercent,
    fontSize: line.fontSize,
    fontColor: line.fontColor,
    outlineColor: line.outlineColor,
    outline: line.outline,
    shadow: line.shadow,
    position: line.position
  };
}

function copyPathsForLine(line: CaptionLine, countries: CopyCountryBinding[]) {
  const country = countries.find((item) => item.enabled && item.id === line.copyCountryId);
  const product = country?.products.find((item) => item.enabled && item.id === line.copyProductId);
  return product?.paths ?? [];
}

function activeCaptionLines(lines: CaptionLine[], countries: CopyCountryBinding[], stylePaths: string[] = [], sameVideoStyle = true) {
  return lines.filter((line) => line.text.trim() || copyPathsForLine(line, countries).length > 0).map((line) => ({
    ...toCaptionExportLine(line, stylePaths, sameVideoStyle),
    copyPaths: copyPathsForLine(line, countries)
  }));
}

export default function App() {
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem(storageKeys.theme) === "dark");
  const [audioDir, setAudioDir] = useState("");
  const [singleAudioPath, setSingleAudioPath] = useState("");
  const [outputDir, setOutputDir] = useState("");
  const [videos, setVideos] = useState<VideoFile[]>([]);
  const [renameOptions, setRenameOptions] = useState<RenameOptions>(() => loadJson(storageKeys.renameOptions, defaultRenameOptions));
  const [renameEnabled, setRenameEnabled] = useState<RenameEnabled>(() => loadJson(storageKeys.renameEnabled, defaultRenameEnabled));
  const [renameLabels, setRenameLabels] = useState<RenameLabels>(() => loadJson(storageKeys.renameLabels, defaultRenameLabels));
  const [renameParams, setRenameParams] = useState<RenameParams>(loadRenameParams);
  const [audioCountries, setAudioCountries] = useState<AudioCountryPreset[]>(() => loadArray<AudioCountryPreset>(storageKeys.audioCountries, []));
  const [captionStyleLibraries, setCaptionStyleLibraries] = useState<CaptionStyleLibrary[]>(() => loadArray<CaptionStyleLibrary>(storageKeys.captionStyleLibraries, []));
  const [copyCountries, setCopyCountries] = useState<CopyCountryBinding[]>(() => loadArray<CopyCountryBinding>(storageKeys.copyCountries, []));
  const [copyLabels, setCopyLabels] = useState<CopyLabels>(() => loadJson(storageKeys.copyLabels, defaultCopyLabels));
  const [captionLines, setCaptionLines] = useState<CaptionLine[]>(loadCaptionLines);
  const [captionEnabled, setCaptionEnabled] = useState(() => localStorage.getItem(storageKeys.captionEnabled) !== "false");
  const [selectedStylePool, setSelectedStylePool] = useState<CaptionStyleFile[]>([]);
  const [sameVideoStyle, setSameVideoStyle] = useState(true);
  const [selectedAudioCountryId, setSelectedAudioCountryId] = useState("");
  const [selectedAudioProductId, setSelectedAudioProductId] = useState("");
  const [audioMode, setAudioMode] = useState<AudioMode>("random");
  const [shortAudioMode, setShortAudioMode] = useState<ShortAudioMode>("loop");
  const [logs, setLogs] = useState<string[]>([]);
  const [success, setSuccess] = useState(0);
  const [failed, setFailed] = useState(0);
  const [taskTotal, setTaskTotal] = useState(0);
  const [taskCurrent, setTaskCurrent] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceMode>("dubbing");
  const [clipStage, setClipStage] = useState<ClipStage>("start");
  const [isDragActive, setIsDragActive] = useState(false);
  const [autoExportPreview, setAutoExportPreview] = useState(() => buildAutoExportFolderPreview(defaultRenameParams));
  const [pendingTaskMode, setPendingTaskMode] = useState<TaskMode | null>(null);
  const [dontShowWarningAgain, setDontShowWarningAgain] = useState(false);

  const template = useMemo(() => buildRenameTemplate(renameEnabled), [renameEnabled]);
  const preview = useMemo(() => buildRenamePreview(videos, template, renameParams), [videos, template, renameParams]);

  useEffect(() => {
    document.documentElement.dataset.theme = isDarkMode ? "dark" : "light";
    localStorage.setItem(storageKeys.theme, isDarkMode ? "dark" : "light");
  }, [isDarkMode]);

  useEffect(() => {
    let unlistenResize: (() => void) | undefined;
    let unlistenClose: (() => void) | undefined;

    const saveWindowSize = async (force = false) => {
      if (!force && document.documentElement.dataset.maximized === "true") return;
      const size = await appWindow.innerSize();
      if (size.width < 960 || size.height < 680) return;
      localStorage.setItem(storageKeys.windowSize, JSON.stringify({ width: size.width, height: size.height }));
    };

    const restoreWindowSize = async () => {
      try {
        const raw = localStorage.getItem(storageKeys.windowSize);
        if (!raw) return;

        const saved = JSON.parse(raw) as { width?: number; height?: number };
        if (!saved.width || !saved.height || saved.width < 1100 || saved.height < 740) return;

        await appWindow.setSize(new PhysicalSize(Math.round(saved.width), Math.round(saved.height)));
      } catch {
        localStorage.removeItem(storageKeys.windowSize);
      }
    };

    const setupWindowState = async () => {
      await restoreWindowSize();
      document.documentElement.dataset.maximized = "false";
      unlistenResize = await appWindow.onResized(({ payload }) => {
        void (async () => {
          let isWorkAreaSized = false;
          try {
            const monitor = await currentMonitor();
            const workAreaSize = monitor?.workArea.size;
            isWorkAreaSized = Boolean(workAreaSize && Math.abs(payload.width - workAreaSize.width) <= 2 && Math.abs(payload.height - workAreaSize.height) <= 2);
          } catch {
            isWorkAreaSized = false;
          }

          document.documentElement.dataset.maximized = isWorkAreaSized ? "true" : "false";
          if (isWorkAreaSized) return;
          if (payload.width < 960 || payload.height < 680) return;
          localStorage.setItem(storageKeys.windowSize, JSON.stringify({ width: payload.width, height: payload.height }));
        })();
      });
      unlistenClose = await appWindow.onCloseRequested(async (event) => {
        event.preventDefault();
        await saveWindowSize(true);
        await appWindow.destroy();
      });
    };

    void setupWindowState();

    return () => {
      unlistenResize?.();
      unlistenClose?.();
    };
  }, []);

  useEffect(() => localStorage.setItem(storageKeys.renameOptions, JSON.stringify(renameOptions)), [renameOptions]);
  useEffect(() => localStorage.setItem(storageKeys.renameEnabled, JSON.stringify(renameEnabled)), [renameEnabled]);
  useEffect(() => localStorage.setItem(storageKeys.renameLabels, JSON.stringify(renameLabels)), [renameLabels]);
  useEffect(() => localStorage.setItem(storageKeys.audioCountries, JSON.stringify(audioCountries)), [audioCountries]);
  useEffect(() => localStorage.setItem(storageKeys.captionStyleLibraries, JSON.stringify(captionStyleLibraries)), [captionStyleLibraries]);
  useEffect(() => localStorage.setItem(storageKeys.copyCountries, JSON.stringify(copyCountries)), [copyCountries]);
  useEffect(() => localStorage.setItem(storageKeys.copyLabels, JSON.stringify(copyLabels)), [copyLabels]);
  useEffect(() => localStorage.setItem(storageKeys.captionLines, JSON.stringify(captionLines)), [captionLines]);
  useEffect(() => localStorage.setItem(storageKeys.captionEnabled, captionEnabled ? "true" : "false"), [captionEnabled]);
  useEffect(() => localStorage.setItem(storageKeys.renameParams, JSON.stringify({ ...renameParams, date: "" })), [renameParams]);

  useEffect(() => {
    const refreshDate = () => {
      const nextDate = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      setRenameParams((current) => (current.date === nextDate ? current : { ...current, date: nextDate }));
      setAutoExportPreview(buildAutoExportFolderPreview(renameParams));
    };
    refreshDate();
    const timer = window.setInterval(refreshDate, 60 * 1000);
    return () => window.clearInterval(timer);
  }, [renameParams]);

  const handleDroppedPaths = useCallback(async (paths: string[]) => {
    if (paths.length === 0) return;

    const importedVideos: VideoFile[] = [];
    const audioFiles: string[] = [];
    const audioDirectories: string[] = [];
    const failedPaths: string[] = [];

    for (const path of paths) {
      if (isVideoPath(path)) {
        importedVideos.push(videoFileFromPath(path));
        continue;
      }

      if (isAudioPath(path)) {
        audioFiles.push(path);
        continue;
      }

      try {
        const folderVideos = await listVideoFiles(path);
        if (folderVideos.length > 0) {
          importedVideos.push(...folderVideos);
        } else {
          audioDirectories.push(path);
        }
      } catch {
        failedPaths.push(path);
      }
    }

    if (importedVideos.length > 0) {
      setVideos((current) => mergeVideos(current, importedVideos));
    }

    if (audioFiles.length > 0) {
      setSingleAudioPath(audioFiles[audioFiles.length - 1]);
    }

    if (audioDirectories.length > 0) {
      setAudioDir(audioDirectories[audioDirectories.length - 1]);
    }

    const messages = [
      importedVideos.length > 0 ? `拖入导入 ${importedVideos.length} 个视频` : "",
      audioFiles.length > 0 ? `拖入设置统一音频：${audioFiles[audioFiles.length - 1]}` : "",
      audioDirectories.length > 0 ? `拖入设置音频素材库：${audioDirectories[audioDirectories.length - 1]}` : "",
      failedPaths.length > 0 ? `拖入失败 ${failedPaths.length} 个项目` : ""
    ].filter(Boolean);

    if (messages.length > 0) {
      setLogs((current) => [...messages, ...current]);
    }
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupDragDrop = async () => {
      unlisten = await appWindow.onDragDropEvent(({ payload }) => {
        if (payload.type === "enter" || payload.type === "over") {
          setIsDragActive(true);
          return;
        }

        setIsDragActive(false);

        if (payload.type === "drop") {
          void handleDroppedPaths(payload.paths);
        }
      });
    };

    void setupDragDrop();

    return () => {
      unlisten?.();
    };
  }, [handleDroppedPaths]);

  async function addVideos() {
    const selectedVideos = await pickVideoFiles();
    if (selectedVideos.length === 0) return;
    setVideos((current) => mergeVideos(current, selectedVideos));
    setLogs((current) => [`已添加 ${selectedVideos.length} 个视频`, ...current]);
  }

  async function addVideoFolder() {
    const directories = await pickDirectories();
    if (directories.length === 0) return;

    const importedVideos: VideoFile[] = [];
    const failedDirectories: string[] = [];

    for (const directory of directories) {
      try {
        const folderVideos = await listVideoFiles(directory);
        importedVideos.push(...folderVideos);
      } catch {
        failedDirectories.push(directory);
      }
    }

    if (importedVideos.length > 0) {
      setVideos((current) => mergeVideos(current, importedVideos));
    }

    const messages = [
      `从 ${directories.length} 个文件夹添加 ${importedVideos.length} 个视频`,
      failedDirectories.length > 0 ? `读取失败 ${failedDirectories.length} 个文件夹` : ""
    ].filter(Boolean);
    setLogs((current) => [...messages, ...current]);
  }

  function clearVideos() {
    setVideos([]);
    setLogs((current) => ["已清空导入素材", ...current]);
  }

  async function chooseOutputDir() {
    const directory = await pickDirectory();
    if (directory) setOutputDir(directory);
  }

  async function chooseAudioDir() {
    const directory = await pickDirectory();
    if (directory) setAudioDir(directory);
  }

  async function chooseAudioPresetDir() {
    return await pickDirectory();
  }

  async function chooseCopywritingFile() {
    return await pickCopywritingFile();
  }

  async function chooseCopywritingDirectories() {
    return await pickDirectories();
  }

  async function maximizeAppWindowToWorkArea() {
    try {
      const monitor = await currentMonitor();
      if (monitor?.workArea) {
        const targetPosition = new PhysicalPosition(Math.round(monitor.workArea.position.x), Math.round(monitor.workArea.position.y));
        const targetSize = new PhysicalSize(Math.round(monitor.workArea.size.width), Math.round(monitor.workArea.size.height));
        let correctedPosition = targetPosition;
        let correctedSize = targetSize;

        document.documentElement.dataset.maximized = "true";
        for (let attempt = 0; attempt < 3; attempt += 1) {
          await appWindow.setPosition(correctedPosition);
          await appWindow.setSize(correctedSize);
          await settleWindowLayout();

          const [actualContentPosition, actualContentSize] = await Promise.all([appWindow.innerPosition(), appWindow.innerSize()]);
          const contentPositionDeltaX = targetPosition.x - actualContentPosition.x;
          const contentPositionDeltaY = targetPosition.y - actualContentPosition.y;
          const contentSizeDeltaWidth = targetSize.width - actualContentSize.width;
          const contentSizeDeltaHeight = targetSize.height - actualContentSize.height;

          if (
            Math.abs(contentPositionDeltaX) <= windowLayoutTolerance &&
            Math.abs(contentPositionDeltaY) <= windowLayoutTolerance &&
            Math.abs(contentSizeDeltaWidth) <= windowLayoutTolerance &&
            Math.abs(contentSizeDeltaHeight) <= windowLayoutTolerance
          ) {
            break;
          }

          correctedPosition = new PhysicalPosition(correctedPosition.x + contentPositionDeltaX, correctedPosition.y + contentPositionDeltaY);
          correctedSize = new PhysicalSize(Math.max(960, correctedSize.width + contentSizeDeltaWidth), Math.max(680, correctedSize.height + contentSizeDeltaHeight));
        }
      }
    } catch {
      // Keep this page usable even if Windows refuses a resize request.
    }
  }

  async function activateClipEasterEgg() {
    setIsDarkMode(true);
    setClipStage("engine");
  }

  async function startClipEngine() {
    setIsDarkMode(true);
    await maximizeAppWindowToWorkArea();
    setClipStage("risk");
  }

  async function chooseSingleAudio() {
    const file = await pickAudioFile();
    if (file) setSingleAudioPath(file);
  }

  function requestTaskStart(taskMode: TaskMode) {
    if (taskMode === "renameOnly" && localStorage.getItem(storageKeys.hideRenameOnlyWarning) !== "true") {
      setDontShowWarningAgain(false);
      setPendingTaskMode(taskMode);
      return;
    }

    if (taskMode === "silentVideo" && localStorage.getItem(storageKeys.hideSilentVideoWarning) !== "true") {
      setDontShowWarningAgain(false);
      setPendingTaskMode(taskMode);
      return;
    }

    void startProcessing(taskMode);
  }

  function confirmPendingTask() {
    if (!pendingTaskMode) return;

    if (dontShowWarningAgain) {
      const key = pendingTaskMode === "renameOnly" ? storageKeys.hideRenameOnlyWarning : storageKeys.hideSilentVideoWarning;
      localStorage.setItem(key, "true");
    }

    const taskMode = pendingTaskMode;
    setPendingTaskMode(null);
    setDontShowWarningAgain(false);
    void startProcessing(taskMode);
  }

  async function startProcessing(taskMode: TaskMode) {
    const taskId = crypto.randomUUID();
    setIsProcessing(true);
    setSuccess(0);
    setFailed(0);
    setTaskTotal(videos.length);
    setTaskCurrent(0);
    setLogs((current) => [taskStartLog(taskMode), ...current]);
    const unlisten = await listen<ProcessProgressEvent>("process-progress", (event) => {
      if (event.payload.taskId !== taskId) return;
      setSuccess(event.payload.success);
      setFailed(event.payload.failed);
      setTaskTotal(event.payload.total);
      setTaskCurrent(event.payload.current);
      if (event.payload.status === "item" && event.payload.log) {
        setLogs((current) => [event.payload.log, ...current]);
      }
    });

    try {
      const result = await processVideos({
        taskId,
        videos,
        outputDir,
        renameTemplate: template,
        renameParams,
        taskMode,
        audioMode,
        singleAudioPath,
        audioDir,
        shortAudioMode,
        captions: captionEnabled ? activeCaptionLines(captionLines, copyCountries, selectedStylePool.map((style) => style.path), sameVideoStyle) : []
      });
      setSuccess(result.success);
      setFailed(result.failed);
      setTaskCurrent(videos.length);
    } catch (error) {
      setFailed((value) => value + 1);
      setLogs((current) => [`Task failed: ${String(error)}`, ...current]);
    } finally {
      unlisten();
      setIsProcessing(false);
    }
  }

  return (
    <>
      <AppTitleBar
        activeWorkspace={activeWorkspace}
        isDarkMode={isDarkMode}
        onOpenWorkspace={(workspace) => {
          setIsSettingsOpen(false);
          setActiveWorkspace(workspace);
        }}
        onOpenSettings={() => {
          setIsSettingsOpen(true);
        }}
        onToggleTheme={() => setIsDarkMode((value) => !value)}
      />
      <main className="app-shell">
        {isSettingsOpen ? (
          <SettingsPage
            audioCountries={audioCountries}
            captionStyleLibraries={captionStyleLibraries}
            copyCountries={copyCountries}
            copyLabels={copyLabels}
            enabled={renameEnabled}
            labels={renameLabels}
            options={renameOptions}
            params={renameParams}
            onAudioCountriesChange={setAudioCountries}
            onCaptionStyleLibrariesChange={setCaptionStyleLibraries}
            onClose={() => setIsSettingsOpen(false)}
            onCopyCountriesChange={setCopyCountries}
            onCopyLabelsChange={setCopyLabels}
            onEnabledChange={setRenameEnabled}
            onLabelsChange={setRenameLabels}
            onOptionsChange={setRenameOptions}
            onParamsChange={setRenameParams}
            onPickAudioDirectory={chooseAudioPresetDir}
            onPickCopywritingDirectories={chooseCopywritingDirectories}
            onPickExportDirectory={chooseAudioPresetDir}
            onPickCopywritingFile={chooseCopywritingFile}
            onPickStyleDirectory={chooseAudioPresetDir}
          />
        ) : activeWorkspace === "caption" ? (
          <CaptionPage
            captionEnabled={captionEnabled}
            captionLines={captionLines}
            copyCountries={copyCountries}
            copyLabels={copyLabels}
            onCaptionLinesChange={setCaptionLines}
            onCaptionEnabledChange={setCaptionEnabled}
            onSameVideoStyleChange={setSameVideoStyle}
            onSelectedStylePoolChange={setSelectedStylePool}
            outputDir={outputDir}
            renameParams={renameParams}
            renameTemplate={template}
            sameVideoStyle={sameVideoStyle}
            selectedStylePool={selectedStylePool}
            styleLibraries={captionStyleLibraries}
            videos={videos}
          />
        ) : activeWorkspace === "clip" ? (
          <ClipPage stage={clipStage} onBack={() => setClipStage("engine")} onConfirm={() => setClipStage("confirmed")} onStart={activateClipEasterEgg} onStartEngine={startClipEngine} />
        ) : (
        <div className="workspace-grid">
          <div className="left-column">
            <section className="panel file-panel compact-file-panel">
              <div className="panel-title">
                <h2>文件</h2>
                <span>未选导出目录时自动创建</span>
              </div>
              <div className="import-row">
                <label className="path-field">
                  <span>已导入素材</span>
                  <input value={videoSelectionLabel(videos)} readOnly placeholder="未导入视频" />
                </label>
                <button type="button" className="icon-button text-button" onClick={addVideos}>
                  <FileVideo size={18} />
                  添加视频
                </button>
                <button type="button" className="icon-button text-button" onClick={addVideoFolder}>
                  <FolderOpen size={18} />
                  添加文件夹
                </button>
              </div>
              <div className="grid one">
                <PathField label="导出文件夹（可选）" value={outputDir} displayValue={outputDir || autoExportPreview} onPick={chooseOutputDir} />
              </div>
            </section>

            <RenamePanel
              template={template}
              params={renameParams}
              options={renameOptions}
              enabled={renameEnabled}
              labels={renameLabels}
              preview={preview}
              onClearVideos={clearVideos}
              onParamsChange={setRenameParams}
              onOptionsChange={setRenameOptions}
              onEnabledChange={setRenameEnabled}
              onLabelsChange={setRenameLabels}
              onExport={() => requestTaskStart("renameOnly")}
              isProcessing={isProcessing}
            />
          </div>

          <div className="side-column">
            <TaskLog success={success} failed={failed} logs={logs} isProcessing={isProcessing} total={taskTotal} current={taskCurrent} />
            <AudioPanel
              audioMode={audioMode}
              shortAudioMode={shortAudioMode}
              singleAudioPath={singleAudioPath}
              audioDir={audioDir}
              audioCountries={audioCountries}
              selectedAudioCountryId={selectedAudioCountryId}
              selectedAudioProductId={selectedAudioProductId}
              isProcessing={isProcessing}
              onAudioModeChange={setAudioMode}
              onShortAudioModeChange={setShortAudioMode}
              onPickSingleAudio={chooseSingleAudio}
              onPickAudioDir={chooseAudioDir}
              onPickAudioPresetDir={chooseAudioPresetDir}
              onAudioDirChange={setAudioDir}
              onAudioCountriesChange={setAudioCountries}
              onSelectedAudioCountryChange={setSelectedAudioCountryId}
              onSelectedAudioProductChange={setSelectedAudioProductId}
              onStart={() => requestTaskStart("replaceAudio")}
              onSilentExport={() => requestTaskStart("silentVideo")}
            />
          </div>
        </div>
        )}
        {isDragActive ? (
          <div className="drop-overlay">
            <div className="drop-overlay-card">
              <FileVideo size={22} />
              <span>松开导入文件夹、视频或音频</span>
            </div>
          </div>
        ) : null}
      </main>
      {pendingTaskMode ? (
        <WarningDialog
          taskMode={pendingTaskMode}
          dontShowAgain={dontShowWarningAgain}
          onDontShowAgainChange={setDontShowWarningAgain}
          onCancel={() => {
            setPendingTaskMode(null);
            setDontShowWarningAgain(false);
          }}
          onConfirm={confirmPendingTask}
        />
      ) : null}
    </>
  );
}

function ClipPage({
  stage,
  onBack,
  onConfirm,
  onStart,
  onStartEngine
}: {
  stage: ClipStage;
  onBack: () => void;
  onConfirm: () => void;
  onStart: () => void;
  onStartEngine: () => void;
}) {
  const [riskAccepted, setRiskAccepted] = useState(false);

  function handleRiskBack() {
    setRiskAccepted(false);
    onBack();
  }

  function handleRiskConfirm() {
    if (!riskAccepted) return;
    setRiskAccepted(false);
    onConfirm();
  }

  return (
    <section className={`clip-page clip-easter-page clip-stage-${stage}`} onClick={stage === "confirmed" ? onBack : undefined}>
      {stage === "start" ? (
        <button type="button" className="clip-hero-button" onClick={onStart}>
          {clipStartLabel}
        </button>
      ) : null}

      {stage === "engine" ? (
        <button type="button" className="clip-engine-button" onClick={onStartEngine}>
          {clipEngineLabel}
        </button>
      ) : null}

      {stage === "risk" ? (
        <div className="clip-risk-panel">
          <h1>{clipRiskTitle}</h1>
          <div className="clip-risk-copy">
            {clipRiskText.map((text) => (
              <p key={text}>{text}</p>
            ))}
          </div>
          <label className="clip-risk-check">
            <input type="checkbox" checked={riskAccepted} onChange={(event) => setRiskAccepted(event.target.checked)} />
            <span>{clipRiskConfirmLabel}</span>
          </label>
          <div className="clip-risk-actions">
            <button type="button" className="icon-button text-button" onClick={handleRiskBack}>
              返回
            </button>
            <button type="button" className="primary-action inline-primary clip-risk-continue" onClick={handleRiskConfirm} disabled={!riskAccepted}>
              继续
            </button>
          </div>
        </div>
      ) : null}

      {stage === "confirmed" ? (
        <div className="clip-confirm-panel">
          <div className="clip-dream-lines">
            {clipConfirmLines.map((line, index) => (
              <strong key={line} className={index === 0 ? "clip-dream-line-primary" : "clip-dream-line-secondary"}>
                {line}
              </strong>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function taskStartLog(taskMode: TaskMode) {
  if (taskMode === "renameOnly") return "开始导出重命名视频";
  if (taskMode === "silentVideo") return "开始导出无声音视频";
  return "开始处理音频替换任务";
}

function WarningDialog({
  taskMode,
  dontShowAgain,
  onDontShowAgainChange,
  onCancel,
  onConfirm
}: {
  taskMode: TaskMode;
  dontShowAgain: boolean;
  onDontShowAgainChange: (value: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const isRenameOnly = taskMode === "renameOnly";

  return (
    <div className="modal-backdrop">
      <div className="confirm-dialog">
        <div className="confirm-icon">
          <AlertTriangle size={22} />
        </div>
        <h3>{isRenameOnly ? "确认只导出重命名视频？" : "确认导出无声音视频？"}</h3>
        <p>{isRenameOnly ? "本次导出只会复制视频并改名，不会替换或处理音频。" : "本次导出会移除视频音频轨道，导出结果没有声音。"}</p>
        <label className="confirm-check">
          <input type="checkbox" checked={dontShowAgain} onChange={(event) => onDontShowAgainChange(event.target.checked)} />
          以后不再提示
        </label>
        <div className="confirm-actions">
          <button type="button" className="icon-button text-button" onClick={onCancel}>
            取消
          </button>
          <button type="button" className="primary-action inline-primary" onClick={onConfirm}>
            确认导出
          </button>
        </div>
      </div>
    </div>
  );
}
