import { FolderOpen } from "lucide-react";

type PathFieldProps = {
  label: string;
  value: string;
  displayValue?: string;
  buttonLabel?: string;
  onPick: () => void;
};

export function PathField({ label, value, displayValue, buttonLabel = "选择", onPick }: PathFieldProps) {
  return (
    <label className="path-field">
      <span>{label}</span>
      <div className="path-row">
        <input value={displayValue ?? value} readOnly placeholder="未选择" />
        <button type="button" className="icon-button text-button" onClick={onPick}>
          <FolderOpen size={18} />
          {buttonLabel}
        </button>
      </div>
    </label>
  );
}
