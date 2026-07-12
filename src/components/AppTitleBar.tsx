import { Maximize2, Minus, Moon, Settings, Sun, X } from "lucide-react";
import { currentMonitor, getCurrentWindow, PhysicalPosition, PhysicalSize } from "@tauri-apps/api/window";

type AppTitleBarProps = {
  activeWorkspace: "clip" | "caption" | "dubbing";
  isDarkMode: boolean;
  onOpenWorkspace: (workspace: "clip" | "caption" | "dubbing") => void;
  onOpenSettings: () => void;
  onToggleTheme: () => void;
};

const appWindow = getCurrentWindow();

type WindowBounds = {
  position: PhysicalPosition;
  size: PhysicalSize;
};

let restoreBounds: WindowBounds | null = null;
let isPseudoMaximized = false;

export function AppTitleBar({ activeWorkspace, isDarkMode, onOpenWorkspace, onOpenSettings, onToggleTheme }: AppTitleBarProps) {
  const startDrag = (event: React.MouseEvent<HTMLElement>) => {
    if (event.button !== 0) {
      return;
    }

    if (event.detail >= 2) {
      event.preventDefault();
      return;
    }

    if (isPseudoMaximized) {
      return;
    }

    void appWindow.startDragging();
  };

  const toggleMaximize = async () => {
    if (isPseudoMaximized && restoreBounds) {
      await appWindow.setPosition(restoreBounds.position);
      await appWindow.setSize(restoreBounds.size);
      restoreBounds = null;
      isPseudoMaximized = false;
      document.documentElement.dataset.maximized = "false";
      return;
    }

    const monitor = await currentMonitor();
    const workArea = monitor?.workArea;
    if (!workArea) {
      return;
    }

    restoreBounds = {
      position: await appWindow.outerPosition(),
      size: await appWindow.innerSize()
    };
    isPseudoMaximized = true;
    document.documentElement.dataset.maximized = "true";

    await appWindow.setPosition(workArea.position);
    await appWindow.setSize(workArea.size);
  };

  const minimize = async () => {
    await appWindow.minimize();
  };

  const close = async () => {
    await appWindow.close();
  };

  return (
    <header
      className="app-titlebar"
      data-tauri-drag-region
      onMouseDown={startDrag}
      onDoubleClick={(event) => {
        event.preventDefault();
        void toggleMaximize();
      }}
    >
      <div className="titlebar-left" data-tauri-drag-region>
        <div className="titlebar-brand" data-tauri-drag-region>
          <span className="brand-dot" />
          <span>很高兴为您服务</span>
        </div>
        <nav
          className="titlebar-tabs"
          onMouseDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <button type="button" className={activeWorkspace === "clip" ? "active" : ""} onClick={() => onOpenWorkspace("clip")}>
            剪辑
          </button>
          <button type="button" className={activeWorkspace === "caption" ? "active" : ""} onClick={() => onOpenWorkspace("caption")}>
            字幕
          </button>
          <button type="button" className={activeWorkspace === "dubbing" ? "active" : ""} onClick={() => onOpenWorkspace("dubbing")}>
            配音
          </button>
        </nav>
      </div>
      <div
        className="titlebar-controls"
        onMouseDown={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="window-control" onClick={onOpenSettings} title="设置">
          <Settings size={15} />
        </button>
        <button type="button" className="window-control" onClick={onToggleTheme} title={isDarkMode ? "日间模式" : "夜间模式"}>
          {isDarkMode ? <Sun size={15} /> : <Moon size={15} />}
        </button>
        <button type="button" className="window-control" onClick={minimize} title="最小化">
          <Minus size={15} />
        </button>
        <button type="button" className="window-control" onClick={toggleMaximize} title="最大化">
          <Maximize2 size={14} />
        </button>
        <button type="button" className="window-control close" onClick={close} title="关闭">
          <X size={15} />
        </button>
      </div>
    </header>
  );
}
