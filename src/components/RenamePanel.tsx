import { Brush, CalendarDays, Download } from "lucide-react";
import type { RenameEnabled, RenameLabels, RenameOptions, RenameParams, RenamePreview } from "../lib/types";

type OptionGroupKey = keyof RenameOptions;
type OptionGroup = { key?: OptionGroupKey; paramKey: keyof RenameParams };

const optionGroups: OptionGroup[] = [
  { paramKey: "date" },
  { key: "countries", paramKey: "country" },
  { key: "materials", paramKey: "material" },
  { key: "resolutions", paramKey: "resolution" },
  { key: "versions", paramKey: "version" },
  { key: "platforms", paramKey: "platform" }
];

type RenamePanelProps = {
  template: string;
  params: RenameParams;
  options: RenameOptions;
  enabled: RenameEnabled;
  labels: RenameLabels;
  preview: RenamePreview[];
  isProcessing: boolean;
  onClearVideos: () => void;
  onExport: () => void;
  onParamsChange: (value: RenameParams) => void;
  onOptionsChange: (value: RenameOptions) => void;
  onEnabledChange: (value: RenameEnabled) => void;
  onLabelsChange: (value: RenameLabels) => void;
};

export function RenamePanel({
  params,
  options,
  enabled,
  labels,
  preview,
  isProcessing,
  onClearVideos,
  onExport,
  onParamsChange
}: RenamePanelProps) {
  const visibleGroups = optionGroups.filter((group) => group.paramKey !== "date" && enabled[group.paramKey]);

  function selectValue(paramKey: OptionGroup["paramKey"], value: string) {
    onParamsChange({ ...params, [paramKey]: value });
  }

  return (
    <section className="panel rename-panel">
      <div className="panel-title">
        <h2>重命名</h2>
        <div className="rename-toolbar">
          {enabled.date ? (
            <div className="toolbar-date">
              <CalendarDays size={18} />
              {formatDisplayDate(params.date)}
            </div>
          ) : null}
          <button type="button" className="icon-only soft-icon" onClick={onClearVideos} title="清空导入素材">
            <Brush size={18} />
          </button>
          <button type="button" className="icon-button text-button compact-action" onClick={onExport} disabled={isProcessing}>
            <Download size={17} />
            导出
          </button>
        </div>
      </div>

      <div className="rename-board">
        {visibleGroups.map((group) => (
          <div className="choice-row" key={group.paramKey}>
            <div className="choice-label">{labels[group.paramKey]}</div>
            <div className="chip-list">
              {options[group.key as OptionGroupKey].map((item) => (
                <button
                  type="button"
                  key={item}
                  className={params[group.paramKey] === item ? "chip active" : "chip"}
                  onClick={() => selectValue(group.paramKey, item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>原文件名</th>
              <th>导出文件名</th>
            </tr>
          </thead>
          <tbody>
            {preview.length === 0 ? (
              <tr>
                <td colSpan={2} className="empty-cell">导入视频后显示预览</td>
              </tr>
            ) : (
              preview.map((item) => (
                <tr key={item.source}>
                  <td>{item.source}</td>
                  <td>{item.target}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

    </section>
  );
}

function formatDisplayDate(value: string) {
  if (!/^\d{8}$/.test(value)) return value;
  return `${value.slice(0, 4)}年${value.slice(4, 6)}月${value.slice(6, 8)}日`;
}
