import { FileText, FolderOpen, FolderPlus, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { appendCopywritingEntry, exportCopywritingLibrary } from "../lib/tauri";
import type {
  AudioCountryPreset,
  CaptionStyleLibrary,
  CopyCountryBinding,
  CopyLabels,
  CopyProductBinding,
  RenameEnabled,
  RenameLabels,
  RenameOptions,
  RenameParams
} from "../lib/types";

type OptionGroupKey = keyof RenameOptions;
type RenameGroup = { key?: OptionGroupKey; paramKey: keyof RenameParams };
type SettingsTab = "audio" | "copy" | "copySave" | "style" | "rename";

const renameGroups: RenameGroup[] = [
  { paramKey: "date" },
  { key: "countries", paramKey: "country" },
  { key: "materials", paramKey: "material" },
  { key: "resolutions", paramKey: "resolution" },
  { key: "versions", paramKey: "version" },
  { key: "platforms", paramKey: "platform" }
];

const settingsTabs: { id: SettingsTab; label: string }[] = [
  { id: "audio", label: "音频" },
  { id: "copy", label: "文案" },
  { id: "copySave", label: "\u4fdd\u5b58\u6587\u6848" },
  { id: "style", label: "花字" },
  { id: "rename", label: "重命名" }
];

type SettingsPageProps = {
  audioCountries: AudioCountryPreset[];
  captionStyleLibraries: CaptionStyleLibrary[];
  copyCountries: CopyCountryBinding[];
  copyLabels: CopyLabels;
  enabled: RenameEnabled;
  labels: RenameLabels;
  options: RenameOptions;
  params: RenameParams;
  onAudioCountriesChange: (value: AudioCountryPreset[]) => void;
  onCaptionStyleLibrariesChange: (value: CaptionStyleLibrary[]) => void;
  onClose: () => void;
  onCopyCountriesChange: (value: CopyCountryBinding[]) => void;
  onCopyLabelsChange: (value: CopyLabels) => void;
  onEnabledChange: (value: RenameEnabled) => void;
  onLabelsChange: (value: RenameLabels) => void;
  onOptionsChange: (value: RenameOptions) => void;
  onParamsChange: (value: RenameParams) => void;
  onPickAudioDirectory: () => Promise<string>;
  onPickCopywritingDirectories: () => Promise<string[]>;
  onPickExportDirectory: () => Promise<string>;
  onPickCopywritingFile: () => Promise<string>;
  onPickStyleDirectory: () => Promise<string>;
};

export function SettingsPage({
  audioCountries,
  captionStyleLibraries,
  copyCountries,
  copyLabels,
  enabled,
  labels,
  options,
  params,
  onAudioCountriesChange,
  onCaptionStyleLibrariesChange,
  onClose,
  onCopyCountriesChange,
  onCopyLabelsChange,
  onEnabledChange,
  onLabelsChange,
  onOptionsChange,
  onParamsChange,
  onPickAudioDirectory,
  onPickCopywritingDirectories,
  onPickExportDirectory,
  onPickCopywritingFile,
  onPickStyleDirectory
}: SettingsPageProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("audio");

  return (
    <main className="settings-page">
      <section className="settings-page-header">
        <div>
          <h1>设置</h1>
          <p>音频、文案、花字和重命名配置</p>
        </div>
        <button type="button" className="icon-only" onClick={onClose} title="关闭设置">
          <X size={20} />
        </button>
      </section>

      <div className="settings-page-grid settings-page-with-nav">
        <aside className="settings-side-nav">
          {settingsTabs.map((tab) => (
            <button type="button" className={activeTab === tab.id ? "active" : ""} key={tab.id} onClick={() => setActiveTab(tab.id)}>
              {tab.label}
            </button>
          ))}
        </aside>

        {activeTab === "audio" ? (
          <AudioSettingsSection countries={audioCountries} onCountriesChange={onAudioCountriesChange} onPickDirectory={onPickAudioDirectory} />
        ) : null}
        {activeTab === "copy" ? (
          <CopySettingsSection
            countries={copyCountries}
            labels={copyLabels}
            onCountriesChange={onCopyCountriesChange}
            onLabelsChange={onCopyLabelsChange}
            onPickDirectories={onPickCopywritingDirectories}
            onPickExportDirectory={onPickExportDirectory}
            onPickFile={onPickCopywritingFile}
          />
        ) : null}
        {activeTab === "copySave" ? <CopySaveSettingsSection countries={copyCountries} labels={copyLabels} /> : null}
        {activeTab === "style" ? (
          <StyleSettingsSection libraries={captionStyleLibraries} onLibrariesChange={onCaptionStyleLibrariesChange} onPickDirectory={onPickStyleDirectory} />
        ) : null}
        {activeTab === "rename" ? (
          <RenameSettingsSection
            enabled={enabled}
            labels={labels}
            options={options}
            params={params}
            onEnabledChange={onEnabledChange}
            onLabelsChange={onLabelsChange}
            onOptionsChange={onOptionsChange}
            onParamsChange={onParamsChange}
          />
        ) : null}
      </div>
    </main>
  );
}

function RenameSettingsSection({
  enabled,
  labels,
  options,
  params,
  onEnabledChange,
  onLabelsChange,
  onOptionsChange,
  onParamsChange
}: Pick<
  SettingsPageProps,
  "enabled" | "labels" | "options" | "params" | "onEnabledChange" | "onLabelsChange" | "onOptionsChange" | "onParamsChange"
>) {
  const [drafts, setDrafts] = useState<Record<OptionGroupKey, string>>({
    countries: "",
    materials: "",
    resolutions: "",
    versions: "",
    platforms: ""
  });

  function addOption(group: RenameGroup) {
    if (!group.key) return;
    const value = drafts[group.key].trim();
    if (!value || options[group.key].includes(value)) return;
    onOptionsChange({ ...options, [group.key]: [...options[group.key], value] });
    setDrafts({ ...drafts, [group.key]: "" });
  }

  function removeOption(group: RenameGroup, value: string) {
    if (!group.key) return;
    const nextValues = options[group.key].filter((item) => item !== value);
    onOptionsChange({ ...options, [group.key]: nextValues });
    if (params[group.paramKey] === value) {
      onParamsChange({ ...params, [group.paramKey]: nextValues[0] || "" });
    }
  }

  return (
    <section className="panel settings-page-panel">
      <div className="panel-title">
        <h2>重命名设置</h2>
      </div>
      <div className="settings-groups">
        {renameGroups.map((group) => (
          <div className="settings-group" key={group.paramKey}>
            <div className="settings-group-title">
              <input
                className="label-input"
                value={labels[group.paramKey]}
                onChange={(event) => onLabelsChange({ ...labels, [group.paramKey]: event.target.value })}
              />
              <label className="switch-row">
                <input
                  type="checkbox"
                  checked={enabled[group.paramKey]}
                  onChange={(event) => onEnabledChange({ ...enabled, [group.paramKey]: event.target.checked })}
                />
                启用
              </label>
            </div>
            <div className="settings-group-body">
              {group.key ? (
                <>
                  <div className="settings-list">
                    {options[group.key].map((item) => (
                      <div className="settings-item" key={item}>
                        <span>{item}</span>
                        <button type="button" className="icon-only danger" onClick={() => removeOption(group, item)} title="删除">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="settings-add">
                    <input
                      value={drafts[group.key]}
                      onChange={(event) => setDrafts({ ...drafts, [group.key as OptionGroupKey]: event.target.value })}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") addOption(group);
                      }}
                      placeholder={`新增${labels[group.paramKey]}`}
                    />
                    <button type="button" className="icon-button" onClick={() => addOption(group)} title="新增">
                      <Plus size={18} />
                    </button>
                  </div>
                </>
              ) : (
                <div className="settings-note">日期每天自动更新，不需要手动编辑。</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function AudioSettingsSection({
  countries,
  onCountriesChange,
  onPickDirectory
}: {
  countries: AudioCountryPreset[];
  onCountriesChange: (value: AudioCountryPreset[]) => void;
  onPickDirectory: () => Promise<string>;
}) {
  const [newCountryName, setNewCountryName] = useState("");
  const [productDrafts, setProductDrafts] = useState<Record<string, string>>({});

  function addCountry() {
    const name = newCountryName.trim();
    if (!name) return;
    onCountriesChange([...countries, { id: makeId(), name, enabled: true, products: [] }]);
    setNewCountryName("");
  }

  function updateCountry(countryId: string, patch: Partial<AudioCountryPreset>) {
    onCountriesChange(countries.map((country) => (country.id === countryId ? { ...country, ...patch } : country)));
  }

  function removeCountry(countryId: string) {
    onCountriesChange(countries.filter((country) => country.id !== countryId));
  }

  async function addProduct(countryId: string) {
    const name = productDrafts[countryId]?.trim();
    if (!name) return;
    const path = await onPickDirectory();
    if (!path) return;
    onCountriesChange(
      countries.map((country) =>
        country.id === countryId
          ? { ...country, products: [...country.products, { id: makeId(), name, path, enabled: true }] }
          : country
      )
    );
    setProductDrafts({ ...productDrafts, [countryId]: "" });
  }

  function updateProduct(countryId: string, productId: string, patch: { name?: string; path?: string; enabled?: boolean }) {
    onCountriesChange(
      countries.map((country) =>
        country.id === countryId
          ? { ...country, products: country.products.map((product) => (product.id === productId ? { ...product, ...patch } : product)) }
          : country
      )
    );
  }

  function removeProduct(countryId: string, productId: string) {
    onCountriesChange(
      countries.map((country) =>
        country.id === countryId ? { ...country, products: country.products.filter((product) => product.id !== productId) } : country
      )
    );
  }

  async function rebindProduct(countryId: string, productId: string) {
    const path = await onPickDirectory();
    if (path) updateProduct(countryId, productId, { path });
  }

  return (
    <section className="panel settings-page-panel">
      <div className="panel-title">
        <h2>音频设置</h2>
      </div>
      <div className="settings-add country-add-row">
        <input
          value={newCountryName}
          onChange={(event) => setNewCountryName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") addCountry();
          }}
          placeholder="新增国家"
        />
        <button type="button" className="icon-button text-button" onClick={addCountry}>
          <Plus size={18} />
          新增
        </button>
      </div>

      <div className="audio-country-settings">
        {countries.map((country) => (
          <div className="audio-country-card" key={country.id}>
            <div className="audio-country-header">
              <input className="label-input" value={country.name} onChange={(event) => updateCountry(country.id, { name: event.target.value })} />
              <label className="switch-row">
                <input type="checkbox" checked={country.enabled} onChange={(event) => updateCountry(country.id, { enabled: event.target.checked })} />
                启用
              </label>
              <button type="button" className="icon-only danger" onClick={() => removeCountry(country.id)} title="删除国家">
                <Trash2 size={16} />
              </button>
            </div>

            <div className="audio-products">
              {country.products.map((product) => (
                <div className="audio-product-row" key={product.id}>
                  <input className="label-input" value={product.name} onChange={(event) => updateProduct(country.id, product.id, { name: event.target.value })} />
                  <span title={product.path}>{product.path}</span>
                  <label className="switch-row">
                    <input
                      type="checkbox"
                      checked={product.enabled}
                      onChange={(event) => updateProduct(country.id, product.id, { enabled: event.target.checked })}
                    />
                    启用
                  </label>
                  <button type="button" className="icon-button" onClick={() => rebindProduct(country.id, product.id)} title="重新绑定">
                    <FolderPlus size={16} />
                  </button>
                  <button type="button" className="icon-only danger" onClick={() => removeProduct(country.id, product.id)} title="删除产品">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>

            <div className="settings-add">
              <input
                value={productDrafts[country.id] || ""}
                onChange={(event) => setProductDrafts({ ...productDrafts, [country.id]: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === "Enter") addProduct(country.id);
                }}
                placeholder="新增产品并绑定文件夹"
              />
              <button type="button" className="icon-button text-button" onClick={() => addProduct(country.id)}>
                <FolderPlus size={18} />
                绑定
              </button>
            </div>
          </div>
        ))}
        {countries.length === 0 ? <div className="settings-note">还没有绑定国家和产品音频文件夹。</div> : null}
      </div>
    </section>
  );
}

function CopySaveSettingsSection({ countries, labels }: { countries: CopyCountryBinding[]; labels: CopyLabels }) {
  const [selectedCountryId, setSelectedCountryId] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [draft, setDraft] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const availableCountries = countries.filter((country) => country.products.some((product) => product.paths.length > 0));
  const selectedCountry = availableCountries.find((country) => country.id === selectedCountryId) ?? availableCountries[0];
  const availableProducts = selectedCountry?.products.filter((product) => product.paths.length > 0) ?? [];
  const selectedProduct = availableProducts.find((product) => product.id === selectedProductId) ?? availableProducts[0];
  const targetPath = selectedProduct?.paths[0] ?? "";

  async function saveCopywriting() {
    const text = draft.trim();
    if (!text || !targetPath) return;
    setIsSaving(true);
    try {
      await appendCopywritingEntry({ path: targetPath, text });
      setDraft("");
      window.alert("\u5df2\u4fdd\u5b58\u5230\u6587\u6848\u5e93");
    } catch (error) {
      window.alert(`\u4fdd\u5b58\u6587\u6848\u5931\u8d25: ${String(error)}`);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="panel settings-page-panel copy-save-panel">
      <div className="panel-title">
        <h2>{"\u4fdd\u5b58\u6587\u6848"}</h2>
        <button type="button" className="icon-button text-button" onClick={saveCopywriting} disabled={!draft.trim() || !targetPath || isSaving}>
          {isSaving ? "\u4fdd\u5b58\u4e2d" : "\u4fdd\u5b58\u5230\u6587\u6848\u5e93"}
        </button>
      </div>
      <div className="copy-save-body">
        <div className="copy-choice-row">
          <span>{labels.country || "\u56fd\u5bb6"}</span>
          <div className="chip-list">
            {availableCountries.length === 0 ? <em>{"\u8bf7\u5148\u5728\u6587\u6848\u9875\u7ed1\u5b9a\u6587\u6848\u5e93"}</em> : null}
            {availableCountries.map((country) => (
              <button
                type="button"
                className={selectedCountry?.id === country.id ? "chip active" : "chip"}
                key={country.id}
                onClick={() => {
                  setSelectedCountryId(country.id);
                  setSelectedProductId("");
                }}
              >
                {country.name}
              </button>
            ))}
          </div>
        </div>
        <div className="copy-choice-row">
          <span>{labels.product || "\u4ea7\u54c1"}</span>
          <div className="chip-list">
            {selectedCountry && availableProducts.length === 0 ? <em>{"\u8be5\u56fd\u5bb6\u6ca1\u6709\u7ed1\u5b9a\u6587\u6848\u5e93\u7684\u4ea7\u54c1"}</em> : null}
            {availableProducts.map((product) => (
              <button
                type="button"
                className={selectedProduct?.id === product.id ? "chip active" : "chip"}
                key={product.id}
                onClick={() => setSelectedProductId(product.id)}
              >
                {product.name}
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          <span>{"\u8981\u6dfb\u52a0\u7684\u6587\u6848"}</span>
          <textarea className="copy-save-textarea" value={draft} onChange={(event) => setDraft(event.target.value)} />
        </label>
        <div className="settings-note">{targetPath ? `${"\u4fdd\u5b58\u5230"}: ${targetPath}` : "\u8bf7\u5148\u9009\u62e9\u5df2\u7ed1\u5b9a\u8def\u5f84\u7684\u4ea7\u54c1"}</div>
      </div>
    </section>
  );
}

function CopySettingsSection({
  countries,
  labels,
  onCountriesChange,
  onLabelsChange,
  onPickDirectories,
  onPickExportDirectory,
  onPickFile
}: {
  countries: CopyCountryBinding[];
  labels: CopyLabels;
  onCountriesChange: (value: CopyCountryBinding[]) => void;
  onLabelsChange: (value: CopyLabels) => void;
  onPickDirectories: () => Promise<string[]>;
  onPickExportDirectory: () => Promise<string>;
  onPickFile: () => Promise<string>;
}) {
  const [newCountryName, setNewCountryName] = useState("");
  const [productDrafts, setProductDrafts] = useState<Record<string, string>>({});
  const [isExportingLibrary, setIsExportingLibrary] = useState(false);

  function addCountry() {
    const name = newCountryName.trim();
    if (!name) return;
    onCountriesChange([...countries, { id: makeId(), name, enabled: true, products: [] }]);
    setNewCountryName("");
  }

  function updateCountry(countryId: string, patch: Partial<CopyCountryBinding>) {
    onCountriesChange(countries.map((country) => (country.id === countryId ? { ...country, ...patch } : country)));
  }

  function removeCountry(countryId: string) {
    onCountriesChange(countries.filter((country) => country.id !== countryId));
  }

  function addProduct(countryId: string) {
    const name = productDrafts[countryId]?.trim();
    if (!name) return;
    onCountriesChange(
      countries.map((country) =>
        country.id === countryId
          ? { ...country, products: [...country.products, { id: makeId(), name, enabled: true, paths: [] }] }
          : country
      )
    );
    setProductDrafts({ ...productDrafts, [countryId]: "" });
  }

  function updateProduct(countryId: string, productId: string, patch: Partial<CopyProductBinding>) {
    onCountriesChange(
      countries.map((country) =>
        country.id === countryId
          ? { ...country, products: country.products.map((product) => (product.id === productId ? { ...product, ...patch } : product)) }
          : country
      )
    );
  }

  function removeProduct(countryId: string, productId: string) {
    onCountriesChange(
      countries.map((country) =>
        country.id === countryId ? { ...country, products: country.products.filter((product) => product.id !== productId) } : country
      )
    );
  }

  async function bindFile(countryId: string, product: CopyProductBinding) {
    const path = await onPickFile();
    if (path) updateProduct(countryId, product.id, { paths: appendUnique(product.paths, [path]) });
  }

  async function bindFolders(countryId: string, product: CopyProductBinding) {
    const paths = await onPickDirectories();
    if (paths.length > 0) updateProduct(countryId, product.id, { paths: appendUnique(product.paths, paths) });
  }

  function removePath(countryId: string, product: CopyProductBinding, path: string) {
    updateProduct(countryId, product.id, { paths: product.paths.filter((item) => item !== path) });
  }

  async function exportLibrary() {
    const outputDir = await onPickExportDirectory();
    if (!outputDir) return;
    setIsExportingLibrary(true);
    try {
      const exportedPath = await exportCopywritingLibrary({ countries, outputDir });
      window.alert(`\u5df2\u5bfc\u51fa\u6587\u6848\u5e93: ${exportedPath}`);
    } catch (error) {
      window.alert(`\u5bfc\u51fa\u6587\u6848\u5e93\u5931\u8d25: ${String(error)}`);
    } finally {
      setIsExportingLibrary(false);
    }
  }

  return (
    <section className="panel settings-page-panel">
      <div className="panel-title">
        <h2>文案设置</h2>
        <button type="button" className="icon-button text-button" onClick={exportLibrary} disabled={isExportingLibrary}>
          <FolderOpen size={16} />
          {isExportingLibrary ? "\u5bfc\u51fa\u4e2d" : "\u5bfc\u51fa\u6587\u6848\u5e93"}
        </button>
      </div>
      <div className="settings-group compact-settings-group">
        <label className="field">
          <span>国家按钮名称</span>
          <input value={labels.country} onChange={(event) => onLabelsChange({ ...labels, country: event.target.value })} />
        </label>
        <label className="field">
          <span>产品按钮名称</span>
          <input value={labels.product} onChange={(event) => onLabelsChange({ ...labels, product: event.target.value })} />
        </label>
      </div>

      <div className="settings-add country-add-row">
        <input
          value={newCountryName}
          onChange={(event) => setNewCountryName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") addCountry();
          }}
          placeholder="新增国家"
        />
        <button type="button" className="icon-button text-button" onClick={addCountry}>
          <Plus size={18} />
          新增
        </button>
      </div>

      <div className="copy-settings-list embedded-settings-list">
        {countries.length === 0 ? <div className="settings-note">还没有配置国家和产品文案库。</div> : null}
        {countries.map((country) => (
          <section className="copy-country-card" key={country.id}>
            <div className="copy-country-head">
              <label className="field">
                <span>国家名称</span>
                <input value={country.name} onChange={(event) => updateCountry(country.id, { name: event.target.value })} />
              </label>
              <label className="switch-row">
                <input type="checkbox" checked={country.enabled} onChange={(event) => updateCountry(country.id, { enabled: event.target.checked })} />
                启用
              </label>
              <button type="button" className="icon-only danger" onClick={() => removeCountry(country.id)} title="删除国家">
                <Trash2 size={15} />
              </button>
            </div>
            <div className="copy-product-list">
              {country.products.map((product) => (
                <div className="copy-product-row" key={product.id}>
                  <div className="copy-product-main">
                    <label className="field">
                      <span>产品名称</span>
                      <input value={product.name} onChange={(event) => updateProduct(country.id, product.id, { name: event.target.value })} />
                    </label>
                    <label className="switch-row">
                      <input type="checkbox" checked={product.enabled} onChange={(event) => updateProduct(country.id, product.id, { enabled: event.target.checked })} />
                      启用
                    </label>
                    <button type="button" className="icon-button text-button" onClick={() => bindFile(country.id, product)}>
                      <FileText size={15} />
                      绑定文件
                    </button>
                    <button type="button" className="icon-button text-button" onClick={() => bindFolders(country.id, product)}>
                      <FolderOpen size={15} />
                      绑定文件夹
                    </button>
                    <button type="button" className="icon-only danger" onClick={() => removeProduct(country.id, product.id)} title="删除产品">
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <div className="copy-path-list">
                    {product.paths.length === 0 ? <span>未绑定文案文件或文件夹</span> : null}
                    {product.paths.map((path) => (
                      <div className="copy-path-item" key={path}>
                        <em>{path}</em>
                        <button type="button" className="icon-only danger" onClick={() => removePath(country.id, product, path)} title="移除路径">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="settings-add">
              <input
                value={productDrafts[country.id] || ""}
                onChange={(event) => setProductDrafts({ ...productDrafts, [country.id]: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === "Enter") addProduct(country.id);
                }}
                placeholder="新增产品"
              />
              <button type="button" className="icon-button text-button" onClick={() => addProduct(country.id)}>
                <Plus size={18} />
                新增
              </button>
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

function StyleSettingsSection({
  libraries,
  onLibrariesChange,
  onPickDirectory
}: {
  libraries: CaptionStyleLibrary[];
  onLibrariesChange: (value: CaptionStyleLibrary[]) => void;
  onPickDirectory: () => Promise<string>;
}) {
  async function addLibrary() {
    const path = await onPickDirectory();
    if (!path || libraries.some((item) => item.path === path)) return;
    onLibrariesChange([...libraries, { id: makeId(), name: fileNameFromPath(path), path, enabled: true }]);
  }

  function updateLibrary(id: string, patch: Partial<CaptionStyleLibrary>) {
    onLibrariesChange(libraries.map((library) => (library.id === id ? { ...library, ...patch } : library)));
  }

  function removeLibrary(id: string) {
    onLibrariesChange(libraries.filter((library) => library.id !== id));
  }

  return (
    <section className="panel settings-page-panel">
      <div className="panel-title">
        <h2>花字设置</h2>
        <button type="button" className="icon-button text-button" onClick={addLibrary}>
          <FolderOpen size={16} />
          绑定新文件夹
        </button>
      </div>
      <div className="style-settings-list embedded-settings-list">
        {libraries.length === 0 ? <div className="settings-note">还没有绑定花字文件夹。</div> : null}
        {libraries.map((library) => (
          <div className="style-settings-row" key={library.id}>
            <label className="field">
              <span>选择栏名称</span>
              <input value={library.name} onChange={(event) => updateLibrary(library.id, { name: event.target.value })} />
            </label>
            <div className="style-settings-path">{library.path}</div>
            <label className="switch-row style-settings-switch">
              <input type="checkbox" checked={library.enabled} onChange={(event) => updateLibrary(library.id, { enabled: event.target.checked })} />
              启用
            </label>
            <button type="button" className="icon-only danger" onClick={() => removeLibrary(library.id)} title="删除">
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function appendUnique(current: string[], incoming: string[]) {
  return Array.from(new Set([...current, ...incoming]));
}

function fileNameFromPath(path: string) {
  const normalized = path.replace(/\\/g, "/");
  return normalized.split("/").filter(Boolean).pop() || path;
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
