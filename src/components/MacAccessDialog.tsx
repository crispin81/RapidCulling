import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { openFullDiskAccess } from "../api";

const DISMISSED_KEY = "rapidculling.fullDiskAccessPrompt.dismissed";

function shouldShow(): boolean {
  if (!/Mac/i.test(navigator.userAgent)) return false;
  try {
    return localStorage.getItem(DISMISSED_KEY) !== "1";
  } catch {
    return true;
  }
}

/** First-launch macOS-only note explaining how to stop the repeated
 * "RapidCulling would like to access..." prompts. Full Disk Access can't be
 * granted by the app itself, so this just opens the right settings pane. */
export default function MacAccessDialog() {
  const [open, setOpen] = useState(shouldShow);
  if (!open) return null;

  function dismiss(forever: boolean) {
    if (forever) {
      try {
        localStorage.setItem(DISMISSED_KEY, "1");
      } catch {
        /* nothing to persist to - it'll just ask again next launch */
      }
    }
    setOpen(false);
  }

  async function handleOpenSettings() {
    try {
      await openFullDiskAccess();
    } finally {
      dismiss(true);
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="mac-access-title">
        <div className="modal__icon">
          <ShieldCheck size={26} color="#ffcc33" />
        </div>
        <h2 id="mac-access-title" className="modal__title">
          Stop the repeated permission pop-ups
        </h2>
        <p className="modal__text">
          macOS asks for permission each time RapidCulling opens a new drive or folder. Give it
          Full Disk Access once and those prompts go away.
        </p>
        <ol className="modal__steps">
          <li>Click <strong>Open System Settings</strong> below.</li>
          <li>Switch on <strong>RapidCulling</strong> in the Full Disk Access list. Use the + button to add it if it isn't there.</li>
          <li>Restart RapidCulling.</li>
        </ol>
        <p className="modal__note">
          RapidCulling only reads and moves the photos you choose. This is optional, and you can
          skip it and just approve the prompts as they appear.
        </p>
        <div className="modal__actions">
          <button className="modal__btn modal__btn--primary" onClick={handleOpenSettings}>
            Open System Settings
          </button>
          <button className="modal__btn" onClick={() => dismiss(false)}>
            Not now
          </button>
          <button className="modal__btn modal__btn--quiet" onClick={() => dismiss(true)}>
            Don't show again
          </button>
        </div>
      </div>
    </div>
  );
}
