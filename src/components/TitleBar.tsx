import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X } from "lucide-react";

const appWindow = getCurrentWindow();

export default function TitleBar() {
  return (
    <div className="titlebar" data-tauri-drag-region>
      <span className="titlebar__title" data-tauri-drag-region>
        <span className="titlebar__title-rapid">Rapid</span>
        <span className="titlebar__title-culling">Culling</span>{" "}
        <span className="titlebar__version">v1.0</span> <span className="titlebar__beta">beta</span>
      </span>
      <div className="titlebar__controls">
        <button type="button" onClick={() => appWindow.minimize()} title="Minimize">
          <Minus size={13} />
        </button>
        <button type="button" onClick={() => appWindow.toggleMaximize()} title="Maximize">
          <Square size={11} />
        </button>
        <button type="button" className="titlebar__close" onClick={() => appWindow.close()} title="Close">
          <X size={13} />
        </button>
      </div>
    </div>
  );
}
