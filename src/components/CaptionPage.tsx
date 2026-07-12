import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Star, Trash2 } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  favoriteCaptionStyleFile,
  listCaptionStyleFiles,
  listFavoriteCaptionStyleFiles,
  processCaptionVideos
} from "../lib/tauri";
import type { CaptionExportLine, CaptionLine, CaptionPosition, CaptionStyleFile, CaptionStyleLibrary, CopyCountryBinding, CopyLabels, RenameParams, VideoFile } from "../lib/types";

type CaptionPageProps = {
  captionEnabled: boolean;
  captionLines: CaptionLine[];
  copyCountries: CopyCountryBinding[];
  copyLabels: CopyLabels;
  onCaptionLinesChange: (value: CaptionLine[]) => void;
  onCaptionEnabledChange: (value: boolean) => void;
  onSameVideoStyleChange: (value: boolean) => void;
  onSelectedStylePoolChange: (value: CaptionStyleFile[]) => void;
  outputDir: string;
  renameParams: RenameParams;
  renameTemplate: string;
  sameVideoStyle: boolean;
  selectedStylePool: CaptionStyleFile[];
  styleLibraries: CaptionStyleLibrary[];
  videos: VideoFile[];
};

const defaultTimelineDuration = 12;
const favoriteStyleStorageKey = "vpro.caption.favoriteStyleSources";

export function CaptionPage({ captionEnabled, captionLines: lines, copyCountries, copyLabels, onCaptionEnabledChange, onCaptionLinesChange, onSameVideoStyleChange, onSelectedStylePoolChange, outputDir, renameParams, renameTemplate, sameVideoStyle, selectedStylePool, styleLibraries, videos }: CaptionPageProps) {
  const [activeId, setActiveId] = useState("");
  const [previewTime, setPreviewTime] = useState(0);
  const [activeStyleTab, setActiveStyleTab] = useState("favorite");
  const [isExporting, setIsExporting] = useState(false);
  const [exportLogs, setExportLogs] = useState<string[]>([]);
  const [exportSuccess, setExportSuccess] = useState(0);
  const [exportFailed, setExportFailed] = useState(0);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [previewScale, setPreviewScale] = useState(0.28);
  const [videoDuration, setVideoDuration] = useState(defaultTimelineDuration);
  const [showCenterGuide, setShowCenterGuide] = useState(false);

  const activeLine = lines.find((line) => line.id === activeId) ?? lines[0];
  const previewVideo = videos[0];
  const previewUrl = useMemo(() => (previewVideo ? convertFileSrc(previewVideo.path) : ""), [previewVideo]);
  const timelineDuration = Math.max(defaultTimelineDuration, Math.ceil(videoDuration * 10) / 10);
  const visibleLines = lines.filter((line) => previewTime >= line.startTime && previewTime <= line.endTime);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const updateScale = () => {
      const rect = stage.getBoundingClientRect();
      setPreviewScale(clamp(rect.width / 1080, 0.12, 1));
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (videoDuration <= defaultTimelineDuration) return;
    const shouldExtend = lines.some((line) => line.endTime >= defaultTimelineDuration);
    if (!shouldExtend) return;
    onCaptionLinesChange(lines.map((line) => (line.endTime >= defaultTimelineDuration ? { ...line, endTime: timelineDuration } : line)));
  }, [videoDuration]);

  const updateLine = (id: string, patch: Partial<CaptionLine>) => {
    onCaptionLinesChange(lines.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  };

  const updateLineTime = (id: string, startTime: number, endTime: number) => {
    const safeStart = clamp(roundTime(startTime), 0, timelineDuration - 0.1);
    const safeEnd = clamp(roundTime(endTime), safeStart + 0.1, timelineDuration);
    updateLine(id, { startTime: safeStart, endTime: safeEnd });
  };

  const addLine = () => {
    const nextLine = createCaptionLine("New Caption", 0, timelineDuration, { xPercent: 50, yPercent: 50 }, 54, "#ffffff", "#000000");
    onCaptionLinesChange([...lines, nextLine]);
    setActiveId(nextLine.id);
    setPreviewTime(nextLine.startTime);
  };

  const removeLineById = (id: string) => {
    if (lines.length <= 1) return;
    const nextLines = lines.filter((line) => line.id !== id);
    onCaptionLinesChange(nextLines);
    if (activeId === id) setActiveId(nextLines[0]?.id ?? "");
  };

  const handlePreviewPointerDown = (event: React.PointerEvent<HTMLElement>, line: CaptionLine) => {
    event.stopPropagation();
    const target = event.currentTarget;
    const stage = target.closest(".caption-stage") as HTMLElement | null;
    if (!stage) return;

    target.setPointerCapture(event.pointerId);
    setActiveId(line.id);

    const updatePositionFromPointer = (clientX: number, clientY: number) => {
      const rect = stage.getBoundingClientRect();
      const rawXPercent = clamp(((clientX - rect.left) / rect.width) * 100, 8, 92);
      const isNearCenter = Math.abs(rawXPercent - 50) <= 2;
      const xPercent = isNearCenter ? 50 : rawXPercent;
      const yPercent = clamp(((clientY - rect.top) / rect.height) * 100, 8, 88);
      setShowCenterGuide(isNearCenter);
      updateLine(line.id, {
        position: {
          xPercent: Math.round(xPercent),
          yPercent: Math.round(yPercent)
        }
      });
    };

    updatePositionFromPointer(event.clientX, event.clientY);
    target.onpointermove = (moveEvent) => updatePositionFromPointer(moveEvent.clientX, moveEvent.clientY);
    target.onpointerup = () => {
      target.onpointermove = null;
      target.onpointerup = null;
      setShowCenterGuide(false);
      target.releasePointerCapture(event.pointerId);
    };
  };

  const handleCaptionWidthPointerDown = (event: React.PointerEvent<HTMLElement>, line: CaptionLine) => {
    event.stopPropagation();
    const target = event.currentTarget;
    const stage = target.closest(".caption-stage") as HTMLElement | null;
    if (!stage) return;

    target.setPointerCapture(event.pointerId);
    setActiveId(line.id);
    const rect = stage.getBoundingClientRect();
    const initialX = event.clientX;
    const initialWidth = line.boxWidthPercent;

    target.onpointermove = (moveEvent) => {
      const deltaPercent = ((moveEvent.clientX - initialX) / rect.width) * 100;
      updateLine(line.id, { boxWidthPercent: Math.round(clamp(initialWidth + deltaPercent, 24, 90)) });
    };
    target.onpointerup = () => {
      target.onpointermove = null;
      target.onpointerup = null;
      target.releasePointerCapture(event.pointerId);
    };
  };

  const updateActiveFontSize = (fontSize: number) => {
    if (!activeLine) return;
    updateLine(activeLine.id, { fontSize });
  };

  const exportCaptionVideos = async () => {
    setIsExporting(true);
    setExportSuccess(0);
    setExportFailed(0);
    setExportLogs(["开始导出字幕视频"]);

    try {
      const result = await processCaptionVideos({
        videos,
        outputDir,
        renameTemplate,
        renameParams,
        captions: lines.map((line) => toCaptionExportLine(line, timelineDuration, copyCountries, selectedStylePool.map((style) => style.path), sameVideoStyle))
      });
      setExportSuccess(result.success);
      setExportFailed(result.failed);
      setExportLogs(result.logs);
    } catch (error) {
      setExportFailed(1);
      setExportLogs([`任务失败：${String(error)}`]);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <main className="caption-page">
      <div className="caption-layout three-columns">
        <section className="panel caption-preview-panel fixed-preview">
          <div className="caption-stage-wrap">
            <div className="caption-stage" ref={stageRef}>
              {previewUrl ? <video src={previewUrl} muted controls onLoadedMetadata={(event) => setVideoDuration(event.currentTarget.duration || defaultTimelineDuration)} /> : <div className="caption-video-placeholder">导入视频后显示画面</div>}
              {showCenterGuide ? <div className="caption-center-guide" /> : null}
              <div className="safe-area safe-top" />
              <div className="safe-area safe-right" />
              <div className="safe-area safe-bottom" />
              {visibleLines.length === 0 && activeLine ? <CaptionOverlay line={activeLine} ghost previewScale={previewScale} onPointerDown={handlePreviewPointerDown} onResizeStart={handleCaptionWidthPointerDown} /> : null}
              {visibleLines.map((line) => (
                <CaptionOverlay key={line.id} line={line} active={line.id === activeId} previewScale={previewScale} onPointerDown={handlePreviewPointerDown} onResizeStart={handleCaptionWidthPointerDown} />
              ))}
            </div>
          </div>
        </section>
        <section className="caption-timeline-panel">
          <CaptionTimeline
            activeId={activeId}
            duration={timelineDuration}
            lines={lines}
            previewTime={previewTime}
            onPreviewTimeChange={setPreviewTime}
            onSelect={setActiveId}
            onTimeChange={updateLineTime}
          />
        </section>

        <section className="panel caption-style-panel">
          <StyleLibraryBrowser
            activeTab={activeStyleTab}
            activeLine={activeLine}
            libraries={styleLibraries}
            onSelectTab={setActiveStyleTab}
            onSameVideoStyleChange={onSameVideoStyleChange}
            onSelectedStylePoolChange={onSelectedStylePoolChange}
            onStyleApply={(style) => {
              if (!activeLine) return;
              updateLine(activeLine.id, {
                fontColor: style.fontColor,
                outlineColor: style.outlineColor,
                outline: style.outline,
                shadow: style.shadow
              });
            }}
            sameVideoStyle={sameVideoStyle}
            selectedStylePool={selectedStylePool}
          />
        </section>

        <section className="panel caption-copy-panel">
          <div className="panel-title">
            <h2>{"\u6587\u6848"}</h2>
            <div className="caption-copy-actions">
              <button
                type="button"
                className={captionEnabled ? "caption-enable-toggle active" : "caption-enable-toggle"}
                onClick={() => onCaptionEnabledChange(!captionEnabled)}
              >
                {captionEnabled ? "\u6dfb\u52a0\u5b57\u5e55" : "\u4e0d\u6dfb\u52a0\u5b57\u5e55"}
              </button>
              <div className="caption-export-status inline-status">
                <div>
                  <span>{"\u5b8c\u6210"}</span>
                  <strong>{exportSuccess}</strong>
                </div>
                <div>
                  <span>{"\u5931\u8d25"}</span>
                  <strong>{exportFailed}</strong>
                </div>
              </div>
              <button type="button" className="primary-action inline-primary" disabled={isExporting || !captionEnabled} onClick={exportCaptionVideos}>
                {!captionEnabled ? "\u5b57\u5e55\u5df2\u5173\u95ed" : isExporting ? "\u5bfc\u51fa\u4e2d" : "\u5bfc\u51fa\u5b57\u5e55\u89c6\u9891"}
              </button>
            </div>
          </div>
          <div className="copy-line-list">
            {lines.map((line, index) => (
              <CaptionCopyLineEditor
                key={line.id}
                countries={copyCountries}
                index={index}
                labels={copyLabels}
                line={line}
                onRemove={() => removeLineById(line.id)}
                onSelect={() => {
                  setActiveId(line.id);
                  setPreviewTime(line.startTime);
                }}
                onUpdate={(patch) => updateLine(line.id, patch)}
              />
            ))}
          </div>
          <button type="button" className="icon-button text-button copy-add-line" onClick={addLine}>
            <Plus size={16} />
            添加文案
          </button>
          <div className="caption-font-size-control">
            <span>{"\u5b57\u53f7"}</span>
            <input type="range" min={18} max={120} value={activeLine?.fontSize ?? 54} onChange={(event) => updateActiveFontSize(Number(event.target.value))} />
            <strong>{Math.round(activeLine?.fontSize ?? 54)}</strong>
          </div>
          <div className="caption-export-log">
            {exportLogs.length === 0 ? <p>等待导出任务</p> : null}
            {exportLogs.map((log, index) => (
              <p key={`${log}-${index}`}>{log}</p>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function toCaptionExportLine(line: CaptionLine, timelineDuration: number, copyCountries: CopyCountryBinding[], stylePaths: string[] = [], sameVideoStyle = true): CaptionExportLine {
  return {
    text: line.text,
    startTime: line.startTime,
    endTime: line.endTime >= timelineDuration - 0.1 ? 86400 : line.endTime,
    copyPaths: copyPathsForLine(line, copyCountries),
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

function CaptionTimeline({
  activeId,
  duration,
  lines,
  previewTime,
  onPreviewTimeChange,
  onSelect,
  onTimeChange
}: {
  activeId: string;
  duration: number;
  lines: CaptionLine[];
  previewTime: number;
  onPreviewTimeChange: (value: number) => void;
  onSelect: (id: string) => void;
  onTimeChange: (id: string, startTime: number, endTime: number) => void;
}) {
  const timelineWidth = `${Math.max(100, Math.ceil(duration * 18))}px`;
  const handleTrackPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const nextTime = clamp(((event.clientX - rect.left) / rect.width) * duration, 0, duration);
    onPreviewTimeChange(roundTime(nextTime));
  };

  return (
    <div className="caption-nle-timeline">
      <div className="caption-timeline-scroll">
        <div className="caption-timeline-inner" style={{ width: timelineWidth }}>
          <div className="caption-ruler" onPointerDown={handleTrackPointerDown}>
            <div className="caption-playhead" style={{ left: `${(previewTime / duration) * 100}%` }} />
          </div>
          <div className="caption-track-list">
            {lines.map((line, index) => (
              <CaptionTimelineClip key={line.id} duration={duration} index={index} line={line} active={line.id === activeId} onSelect={onSelect} onTimeChange={onTimeChange} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StyleLibraryBrowser({
  activeTab,
  activeLine: _activeLine,
  libraries,
  onSelectTab,
  onSameVideoStyleChange,
  onSelectedStylePoolChange,
  onStyleApply,
  sameVideoStyle,
  selectedStylePool
}: {
  activeTab: string;
  activeLine?: CaptionLine;
  libraries: CaptionStyleLibrary[];
  onSelectTab: (id: string) => void;
  onSameVideoStyleChange: (value: boolean) => void;
  onSelectedStylePoolChange: (value: CaptionStyleFile[]) => void;
  onStyleApply: (style: CaptionStyleFile) => void;
  sameVideoStyle: boolean;
  selectedStylePool: CaptionStyleFile[];
}) {
  const visibleLibraries = libraries.filter((item) => item.enabled);
  const activeLibrary = visibleLibraries.find((item) => item.id === activeTab);
  const sectionTitle = activeTab === "favorite" ? "\u6536\u85cf" : activeLibrary?.name || "ASS";
  const [styleFiles, setStyleFiles] = useState<CaptionStyleFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStyleSelectMode, setIsStyleSelectMode] = useState(false);
  const [activeAppliedStylePath, setActiveAppliedStylePath] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const [favoriteSourcePaths, setFavoriteSourcePaths] = useState<string[]>(() => loadFavoriteStyleSources());
  const selectedStylePaths = new Set(selectedStylePool.map((style) => style.path));
  const hasSelectedStyles = selectedStylePool.length > 0;
  const shouldClearStyleSelection = isStyleSelectMode || hasSelectedStyles;
  const allVisibleStylesSelected = styleFiles.length > 0 && styleFiles.every((style) => selectedStylePaths.has(style.path));
  const styleSelectionButtonActive = isStyleSelectMode || hasSelectedStyles;
  const styleSelectAllButtonActive = allVisibleStylesSelected || hasSelectedStyles;

  useEffect(() => {
    let cancelled = false;

    async function loadStyles() {
      setIsLoading(true);
      try {
        const files = activeTab === "favorite"
          ? await listFavoriteCaptionStyleFiles()
          : activeLibrary
            ? await listCaptionStyleFiles(activeLibrary.path)
            : [];
        if (!cancelled) setStyleFiles(files);
      } catch {
        if (!cancelled) setStyleFiles([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadStyles();
    return () => {
      cancelled = true;
    };
  }, [activeTab, activeLibrary?.path, reloadToken]);

  async function favoriteStyle(event: React.PointerEvent<HTMLElement>, style: CaptionStyleFile) {
    event.preventDefault();
    event.stopPropagation();
    if (favoriteSourcePaths.includes(style.path)) return;
    try {
      await favoriteCaptionStyleFile({ sourcePath: style.path });
      const nextSources = [...favoriteSourcePaths, style.path];
      setFavoriteSourcePaths(nextSources);
      localStorage.setItem(favoriteStyleStorageKey, JSON.stringify(nextSources));
      setReloadToken((value) => value + 1);
    } catch {
      // Ignore failed favorites; the user can click again after checking the source file.
    }
  }

  function toggleStyleSelection(style: CaptionStyleFile) {
    if (selectedStylePaths.has(style.path)) {
      onSelectedStylePoolChange(selectedStylePool.filter((item) => item.path !== style.path));
      return;
    }
    onSelectedStylePoolChange([...selectedStylePool, style]);
  }

  function toggleStyleSelectMode() {
    setIsStyleSelectMode((value) => !value);
  }

  function clearStyleSelection() {
    onSelectedStylePoolChange([]);
    setIsStyleSelectMode(false);
  }

  function toggleAllVisibleStyles() {
    if (styleFiles.length === 0) return;
    if (allVisibleStylesSelected) {
      const visiblePaths = new Set(styleFiles.map((style) => style.path));
      onSelectedStylePoolChange(selectedStylePool.filter((style) => !visiblePaths.has(style.path)));
      return;
    }
    const next = [...selectedStylePool];
    const existing = new Set(next.map((style) => style.path));
    styleFiles.forEach((style) => {
      if (!existing.has(style.path)) next.push(style);
    });
    onSelectedStylePoolChange(next);
    setIsStyleSelectMode(true);
  }

  return (
    <div className="caption-style-browser">
      <aside className="caption-style-nav">
        <button type="button" className={activeTab === "favorite" ? "style-nav-button active" : "style-nav-button"} onClick={() => onSelectTab("favorite")}>
          {"\u6536\u85cf"}
        </button>
        {visibleLibraries.map((library) => (
          <button type="button" className={activeTab === library.id ? "style-nav-button active" : "style-nav-button"} key={library.id} onClick={() => onSelectTab(library.id)} title={library.path}>
            {library.name || "ASS"}
          </button>
        ))}
      </aside>
      <div className="caption-style-gallery">
        <div className="style-gallery-head">
          <div className="style-gallery-title">{sectionTitle}</div>
          <div className="style-gallery-actions">
            <button type="button" className={styleSelectionButtonActive ? "icon-button text-button active" : "icon-button text-button"} onClick={shouldClearStyleSelection ? clearStyleSelection : toggleStyleSelectMode}>
              {shouldClearStyleSelection ? "\u6e05\u7a7a" : "\u9009\u62e9"}
            </button>
            <button type="button" className={styleSelectAllButtonActive ? "icon-button text-button active" : "icon-button text-button"} onClick={shouldClearStyleSelection ? clearStyleSelection : toggleAllVisibleStyles} disabled={!shouldClearStyleSelection && styleFiles.length === 0}>
              {shouldClearStyleSelection ? "\u6e05\u7a7a" : "\u5168\u9009"}
            </button>
            <button type="button" className={sameVideoStyle ? "icon-button text-button style-same-video-toggle active" : "icon-button text-button style-same-video-toggle"} onClick={() => onSameVideoStyleChange(!sameVideoStyle)}>
              {"\u540c\u6a21\u677f"}
            </button>
          </div>
        </div>
        <div className="style-card-grid">
          {isLoading ? <div className="caption-empty-library">{"\u6b63\u5728\u8bfb\u53d6 ASS..."}</div> : null}
          {!isLoading && styleFiles.length === 0 ? <div className="caption-empty-library">{"\u6ca1\u6709\u627e\u5230 ASS \u82b1\u5b57"}</div> : null}
          {styleFiles.map((style) => {
            const isFavorite = activeTab === "favorite" || favoriteSourcePaths.includes(style.path);
            const isSelectedForExport = selectedStylePaths.has(style.path);
            const isAppliedStyle = activeAppliedStylePath === style.path;
            const cardClassName = [
              "style-preview-card",
              "ass-style-card",
              isSelectedForExport ? "selected-for-export" : "",
              isAppliedStyle ? "applied-style" : ""
            ].filter(Boolean).join(" ");
            return (
              <button
                type="button"
                className={cardClassName}
                key={style.id}
                title={style.path}
                onClick={() => {
                  if (isStyleSelectMode) {
                    toggleStyleSelection(style);
                    return;
                  }
                  setActiveAppliedStylePath(style.path);
                  onStyleApply(style);
                }}
              >
                {activeTab !== "favorite" ? (
                  <span
                    className={isFavorite ? "style-favorite-button active" : "style-favorite-button"}
                    role="button"
                    tabIndex={0}
                    title="\u6536\u85cf"
                    onPointerDown={(event) => favoriteStyle(event, style)}
                  >
                    <Star size={13} fill={isFavorite ? "currentColor" : "none"} />
                  </span>
                ) : null}
                <span
                  className="style-preview-text"
                  style={{
                    color: style.fontColor,
                    fontSize: `${Math.max(18, Math.min(34, style.fontSize * 0.36))}px`,
                    textShadow: captionTextShadow(style.outlineColor, style.outline, style.shadow)
                  }}
                >
                  {"\u82b1\u5b57"}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CaptionCopyLineEditor({
  countries,
  index,
  labels,
  line,
  onRemove,
  onSelect,
  onUpdate
}: {
  countries: CopyCountryBinding[];
  index: number;
  labels: CopyLabels;
  line: CaptionLine;
  onRemove: () => void;
  onSelect: () => void;
  onUpdate: (patch: Partial<CaptionLine>) => void;
}) {
  const enabledCountries = countries.filter((country) => country.enabled);
  const selectedCountry = enabledCountries.find((country) => country.id === line.copyCountryId);
  const enabledProducts = selectedCountry?.products.filter((product) => product.enabled) ?? [];

  return (
    <section className="copy-line-card" onClick={onSelect}>
      <div className="copy-line-head">
        <strong>文案 {index + 1}</strong>
        <button type="button" className="icon-only danger" onClick={onRemove} title="删除文案">
          <Trash2 size={14} />
        </button>
      </div>
      <textarea value={line.text} onChange={(event) => onUpdate({ text: event.target.value })} />
      <div className="copy-source-row">
        <div className="copy-choice-row">
          <span>{labels.country || "国家"}</span>
          <div className="chip-list">
            {enabledCountries.length === 0 ? <em>未配置</em> : null}
            {enabledCountries.map((country) => (
              <button
                type="button"
                className={line.copyCountryId === country.id ? "chip active" : "chip"}
                key={country.id}
                onClick={() => onUpdate({ copyCountryId: country.id, copyProductId: "" })}
              >
                {country.name}
              </button>
            ))}
          </div>
        </div>
        <div className="copy-choice-row">
          <span>{labels.product || "产品"}</span>
          <div className="chip-list">
            {enabledProducts.length === 0 ? <em>{selectedCountry ? "未配置" : "先选" + (labels.country || "国家")}</em> : null}
            {enabledProducts.map((product) => (
              <button
                type="button"
                className={line.copyProductId === product.id ? "chip active" : "chip"}
                key={product.id}
                onClick={() => onUpdate({ copyProductId: product.id })}
              >
                {product.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function CaptionTimelineClip({
  active,
  duration,
  index,
  line,
  onSelect,
  onTimeChange
}: {
  active: boolean;
  duration: number;
  index: number;
  line: CaptionLine;
  onSelect: (id: string) => void;
  onTimeChange: (id: string, startTime: number, endTime: number) => void;
}) {
  const left = (line.startTime / duration) * 100;
  const width = ((line.endTime - line.startTime) / duration) * 100;

  const startDrag = (event: React.PointerEvent<HTMLElement>, mode: "move" | "start" | "end") => {
    event.stopPropagation();
    const target = event.currentTarget;
    const track = target.closest(".caption-track") as HTMLElement | null;
    if (!track) return;

    target.setPointerCapture(event.pointerId);
    onSelect(line.id);
    const rect = track.getBoundingClientRect();
    const initialX = event.clientX;
    const initialStart = line.startTime;
    const initialEnd = line.endTime;
    const initialDuration = initialEnd - initialStart;

    target.onpointermove = (moveEvent) => {
      const delta = ((moveEvent.clientX - initialX) / rect.width) * duration;
      if (mode === "move") {
        const nextStart = clamp(initialStart + delta, 0, duration - initialDuration);
        onTimeChange(line.id, nextStart, nextStart + initialDuration);
      }
      if (mode === "start") {
        onTimeChange(line.id, clamp(initialStart + delta, 0, initialEnd - 0.1), initialEnd);
      }
      if (mode === "end") {
        onTimeChange(line.id, initialStart, clamp(initialEnd + delta, initialStart + 0.1, duration));
      }
    };
    target.onpointerup = () => {
      target.onpointermove = null;
      target.onpointerup = null;
      target.releasePointerCapture(event.pointerId);
    };
  };

  return (
    <div className="caption-track">
      <span>{index + 1}</span>
      <div className="caption-track-lane">
        <div className={active ? "caption-clip active" : "caption-clip"} style={{ left: `${left}%`, width: `${width}%` }} onPointerDown={(event) => startDrag(event, "move")}>
          <i className="clip-handle left" onPointerDown={(event) => startDrag(event, "start")} />
          <strong>{line.text || "未填写"}</strong>
          <i className="clip-handle right" onPointerDown={(event) => startDrag(event, "end")} />
        </div>
      </div>
    </div>
  );
}

function CaptionOverlay({
  line,
  active = false,
  ghost = false,
  previewScale,
  onPointerDown,
  onResizeStart
}: {
  line: CaptionLine;
  active?: boolean;
  ghost?: boolean;
  previewScale: number;
  onPointerDown: (event: React.PointerEvent<HTMLElement>, line: CaptionLine) => void;
  onResizeStart: (event: React.PointerEvent<HTMLElement>, line: CaptionLine) => void;
}) {
  return (
    <div
      className={["caption-overlay", active ? "active" : "", ghost ? "ghost" : ""].filter(Boolean).join(" ")}
      onPointerDown={(event) => onPointerDown(event, line)}
      style={{
        left: `${line.position.xPercent}%`,
        top: `${line.position.yPercent}%`,
        width: `${line.boxWidthPercent}%`,
        color: line.fontColor,
        fontSize: `${Math.max(8, line.fontSize * previewScale)}px`,
        textShadow: captionTextShadow(line.outlineColor, line.outline * previewScale, line.shadow * previewScale)
      }}
    >
      <span>{line.text || "未填写"}</span>
      {active || ghost ? <i className="caption-box-resize" onPointerDown={(event) => onResizeStart(event, line)} /> : null}
    </div>
  );
}

function createCaptionLine(
  text: string,
  startTime: number,
  endTime: number,
  position: CaptionPosition,
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

function captionTextShadow(outlineColor: string, outline: number, shadow: number) {
  const stroke = Math.max(1, Math.round(outline * 0.45));
  const softShadow = Math.max(0, Math.round(shadow * 0.8));
  return [
    `${stroke}px ${stroke}px 0 ${outlineColor}`,
    `${-stroke}px ${stroke}px 0 ${outlineColor}`,
    `${stroke}px ${-stroke}px 0 ${outlineColor}`,
    `${-stroke}px ${-stroke}px 0 ${outlineColor}`,
    `0 ${softShadow + 2}px ${softShadow + 6}px rgba(0, 0, 0, 0.38)`
  ].join(", ");
}

function loadFavoriteStyleSources() {
  try {
    const raw = localStorage.getItem(favoriteStyleStorageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function roundTime(value: number) {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
