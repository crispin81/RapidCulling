import { open as openNativeFolderPicker } from "@tauri-apps/plugin-dialog";
import { ArrowUp, ChevronDown, FolderOpen, Home } from "lucide-react";
import { useEffect, useState } from "react";
import { listDirectory, listVolumes } from "../api";
import type { DirEntry, Volume } from "../types";
import FolderTreeNode from "./FolderTreeNode";

interface Props {
  openFolderPath: string | null;
  selectedPath: string | null;
  onSelectFolder: (path: string) => void;
  onOpenFolder: (path: string) => void;
  onDropPhoto: (photoPaths: string[], destFolder: string) => void;
  favourites: string[];
  onTogglePin: (path: string) => void;
}

export default function DirectoryBrowser({
  openFolderPath,
  selectedPath,
  onSelectFolder,
  onOpenFolder,
  onDropPhoto,
  favourites,
  onTogglePin,
}: Props) {
  const [rootPath, setRootPath] = useState<string | null>(null);
  const [rootParent, setRootParent] = useState<string | null>(null);
  const [rootEntries, setRootEntries] = useState<DirEntry[]>([]);
  const [pathInput, setPathInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [rootDragOver, setRootDragOver] = useState(false);
  const [volumes, setVolumes] = useState<Volume[]>([]);

  useEffect(() => {
    void listVolumes().then(setVolumes);
  }, []);

  async function goTo(path?: string) {
    try {
      const listing = await listDirectory(path);
      setRootPath(listing.path);
      setRootParent(listing.parent);
      setRootEntries(listing.entries);
      setPathInput(listing.path);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => {
    void goTo();
  }, []);

  async function handleNativeOpen() {
    // Going through the OS's own folder picker (rather than only ever
    // navigating via our in-app tree) matters most on macOS: picking a
    // folder this way is what grants a persistent, non-repeating
    // permission for it - browsing there purely via our own custom tree
    // never does, which is why protected folders (Desktop, Documents...)
    // can otherwise re-prompt on every touch.
    const picked = await openNativeFolderPicker({ directory: true, multiple: false });
    if (typeof picked === "string") void goTo(picked);
  }

  function handleRootDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setRootDragOver(false);
    if (!rootPath) return;
    const raw = e.dataTransfer.getData("text/plain");
    if (!raw) return;
    try {
      const paths = JSON.parse(raw) as string[];
      if (paths.length > 0) onDropPhoto(paths, rootPath);
    } catch {
      onDropPhoto([raw], rootPath);
    }
  }

  return (
    <div className="dir-browser">
      <div className="dir-browser__pathbar">
        <button type="button" onClick={() => goTo()} title="Home">
          <Home size={14} />
        </button>
        <button type="button" onClick={() => rootParent && goTo(rootParent)} disabled={!rootParent} title="Up one level">
          <ArrowUp size={14} />
        </button>
        <button type="button" onClick={handleNativeOpen} title="Open Folder… (recommended on macOS - grants persistent access)">
          <FolderOpen size={14} />
        </button>
        {volumes.length > 1 && (
          <div className="drives-select">
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) void goTo(e.target.value);
              }}
              title="Jump to a drive"
            >
              <option value="">Drives…</option>
              {volumes.map((v) => (
                <option key={v.path} value={v.path}>
                  {v.name}
                  {v.removable ? " (removable)" : ""}
                </option>
              ))}
            </select>
            <ChevronDown size={12} className="drives-select__chevron" />
          </div>
        )}
      </div>
      <form
        className="dir-browser__path-form"
        onSubmit={(e) => {
          e.preventDefault();
          void goTo(pathInput);
        }}
      >
        <input value={pathInput} onChange={(e) => setPathInput(e.target.value)} placeholder="/path/to/photos" />
      </form>
      {error && <p className="dir-browser__error">{error}</p>}

      <div
        className={`dir-browser__tree${rootDragOver ? " dir-browser__tree--dragover" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setRootDragOver(true);
        }}
        onDragLeave={() => setRootDragOver(false)}
        onDrop={handleRootDrop}
      >
        {rootEntries.map((entry) => (
          <FolderTreeNode
            key={entry.path}
            entry={entry}
            depth={0}
            openFolderPath={openFolderPath}
            selectedPath={selectedPath}
            onSelectFolder={onSelectFolder}
            favourites={favourites}
            onOpenFolder={onOpenFolder}
            onDropPhoto={onDropPhoto}
            onTogglePin={onTogglePin}
          />
        ))}
      </div>
    </div>
  );
}
