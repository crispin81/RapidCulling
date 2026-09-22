import { ArrowUp, FolderPlus, Home } from "lucide-react";
import { useEffect, useState } from "react";
import { createFolder, listDirectory } from "../api";
import type { DirEntry } from "../types";
import FolderTreeNode from "./FolderTreeNode";

interface Props {
  openFolderPath: string | null;
  onOpenFolder: (path: string) => void;
  onDropPhoto: (photoPaths: string[], destFolder: string) => void;
  favourites: string[];
  onTogglePin: (path: string) => void;
}

export default function DirectoryBrowser({ openFolderPath, onOpenFolder, onDropPhoto, favourites, onTogglePin }: Props) {
  const [rootPath, setRootPath] = useState<string | null>(null);
  const [rootParent, setRootParent] = useState<string | null>(null);
  const [rootEntries, setRootEntries] = useState<DirEntry[]>([]);
  const [pathInput, setPathInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creatingAtRoot, setCreatingAtRoot] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [rootDragOver, setRootDragOver] = useState(false);

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

  async function submitNewRootFolder() {
    const name = newFolderName.trim();
    setCreatingAtRoot(false);
    setNewFolderName("");
    if (!name || !rootPath) return;
    try {
      await createFolder(rootPath, name);
      await goTo(rootPath);
    } catch (e) {
      setError(String(e));
    }
  }

  function handleRootDrop(e: React.DragEvent) {
    e.preventDefault();
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
        <button type="button" onClick={() => setCreatingAtRoot(true)} disabled={!rootPath} title="New folder here">
          <FolderPlus size={14} /> Folder
        </button>
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
        {creatingAtRoot && (
          <form
            className="dir-row__new-form"
            onSubmit={(e) => {
              e.preventDefault();
              void submitNewRootFolder();
            }}
          >
            <input
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onBlur={() => setCreatingAtRoot(false)}
              placeholder="Folder name"
            />
          </form>
        )}
        {rootEntries.map((entry) => (
          <FolderTreeNode
            key={entry.path}
            entry={entry}
            depth={0}
            openFolderPath={openFolderPath}
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
