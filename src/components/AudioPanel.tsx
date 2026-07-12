import { Play, VolumeX } from "lucide-react";
import type { ReactNode } from "react";
import { PathField } from "./PathField";
import type { AudioCountryPreset, AudioMode, ShortAudioMode } from "../lib/types";

type AudioPanelProps = {
  audioMode: AudioMode;
  shortAudioMode: ShortAudioMode;
  singleAudioPath: string;
  audioDir: string;
  audioCountries: AudioCountryPreset[];
  selectedAudioCountryId: string;
  selectedAudioProductId: string;
  isProcessing: boolean;
  onAudioModeChange: (value: AudioMode) => void;
  onShortAudioModeChange: (value: ShortAudioMode) => void;
  onPickSingleAudio: () => void;
  onPickAudioDir: () => void;
  onPickAudioPresetDir: () => Promise<string>;
  onAudioDirChange: (value: string) => void;
  onAudioCountriesChange: (value: AudioCountryPreset[]) => void;
  onSelectedAudioCountryChange: (value: string) => void;
  onSelectedAudioProductChange: (value: string) => void;
  onStart: () => void;
  onSilentExport: () => void;
};

export function AudioPanel({
  audioMode,
  shortAudioMode,
  singleAudioPath,
  audioDir,
  audioCountries,
  selectedAudioCountryId,
  selectedAudioProductId,
  isProcessing,
  onAudioModeChange,
  onShortAudioModeChange,
  onPickSingleAudio,
  onPickAudioDir,
  onPickAudioPresetDir,
  onAudioDirChange,
  onAudioCountriesChange,
  onSelectedAudioCountryChange,
  onSelectedAudioProductChange,
  onStart,
  onSilentExport
}: AudioPanelProps) {
  const visibleCountries = audioCountries.filter((country) => country.enabled);
  const selectedCountry = visibleCountries.find((country) => country.id === selectedAudioCountryId) || visibleCountries[0];
  const visibleProducts = selectedCountry?.products.filter((product) => product.enabled) || [];

  function selectCountry(countryId: string) {
    const country = visibleCountries.find((item) => item.id === countryId);
    const product = country?.products.find((item) => item.enabled);
    onSelectedAudioCountryChange(countryId);
    onSelectedAudioProductChange(product?.id || "");
    onAudioDirChange(product?.path || "");
  }

  function selectProduct(productId: string) {
    const product = visibleProducts.find((item) => item.id === productId);
    onSelectedAudioProductChange(productId);
    onAudioDirChange(product?.path || "");
  }

  return (
    <section className="panel audio-panel">
      <div className="panel-title">
        <h2>音频替换</h2>
        <span>素材库可在右上角设置中管理</span>
      </div>

      <div className="segmented">
        <button type="button" className={audioMode === "random" ? "active" : ""} onClick={() => onAudioModeChange("random")}>
          素材库
        </button>
        <button type="button" className={audioMode === "single" ? "active" : ""} onClick={() => onAudioModeChange("single")}>
          统一音频
        </button>
      </div>

      {audioMode === "single" ? (
        <PathField label="音频/视频文件" value={singleAudioPath} buttonLabel="选择文件" onPick={onPickSingleAudio} />
      ) : (
        <>
          {visibleCountries.length > 0 ? (
            <div className="audio-choice-board">
              <AudioChoiceRow label="国家">
                {visibleCountries.map((country) => (
                  <button
                    type="button"
                    key={country.id}
                    className={selectedCountry?.id === country.id ? "chip active" : "chip"}
                    onClick={() => selectCountry(country.id)}
                  >
                    {country.name}
                  </button>
                ))}
              </AudioChoiceRow>
              <AudioChoiceRow label="产品">
                {visibleProducts.map((product) => (
                  <button
                    type="button"
                    key={product.id}
                    className={selectedAudioProductId === product.id ? "chip active" : "chip"}
                    title={product.path}
                    onClick={() => selectProduct(product.id)}
                  >
                    {product.name}
                  </button>
                ))}
              </AudioChoiceRow>
            </div>
          ) : null}
          <PathField label="音频文件夹" value={audioDir} onPick={onPickAudioDir} />
        </>
      )}

      <div className="radio-row">
        <label>
          <input type="radio" checked={shortAudioMode === "loop"} onChange={() => onShortAudioModeChange("loop")} />
          音频过短时循环
        </label>
        <label>
          <input type="radio" checked={shortAudioMode === "silence"} onChange={() => onShortAudioModeChange("silence")} />
          音频播完后静音
        </label>
      </div>

      <div className="audio-actions">
        <button type="button" className="primary-action" onClick={onStart} disabled={isProcessing}>
          <Play size={18} />
          {isProcessing ? "处理中" : "开始处理"}
        </button>
        <button type="button" className="icon-button text-button secondary-action" onClick={onSilentExport} disabled={isProcessing}>
          <VolumeX size={18} />
          导出无声音视频
        </button>
      </div>

    </section>
  );
}

function AudioChoiceRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="choice-row">
      <div className="choice-label">{label}</div>
      <div className="chip-list">{children}</div>
    </div>
  );
}
