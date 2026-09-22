import { ChevronDown, ChevronRight, Folder, FolderOpen, FolderPlus, Star } from "lucide-react";
import { useState } from "react";
import { createFolder, listDirectory } from "../api";
import type { DirEntry } from "../types";

interface Props {
  entry: DirEntry;
  depth: number;
  openFolderPath: string | null;
  favourites: string[];
  onOpenFolder: (path: string) => void;
  onDropPhoto: (photoPaths: string[], destFolder: string) => void;
  onTogglePin: (path: string) => void;
}

/// A single folder row that can expand to fetch and show its own
/// subfolders, and create new subfolders directly inside itself - used both
/// for the main library browser and for each pinned favourite, so a
/// favourite behaves exactly like any other folder in the tree instead of
/// being a dead-end shortcut.
export default function FolderTreeNode({
  entry,
  depth,
  openFolderPath,
  favourites,
  onOpenFolder,
  onDropPhoto,
  onTogglePin,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [children, setChildren] = useState<DirEntry[] | null>(null);
  const [hasChildren, setHasChildren] = useState(entry.hasChildren);
  const [creating, setCreating] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOpen = openFolderPath === entry.path;
  const isPinned = favourites.includes(entry.path);

  async function toggleExpand() {
    if (!expanded && children === null) {
      setLoading(true);
      try {
        const listing = await listDirectory(entry.path);
        setChildren(listing.entries);
      } catch {
        setChildren([]);
      } finally {
        setLoading(false);
      }
    }
    setExpanded((e) => !e);
  }

  async function refreshChildren() {
    try {
      const listing = await listDirectory(entry.path);
      setChildren(listing.entries);
    } catch (e) {
      setError(String(e));
    }
  }

  async function submitNewFolder() {
    const name = newFolderName.trim();
    setCreating(false);
    setNewFolderName("");
    if (!name) return;
    try {
      await createFolder(entry.path, name);
      setHasChildren(true);
      setExpanded(true);
      await refreshChildren();
    } catch (e) {
      setError(String(e));
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const raw = e.dataTransfer.getData("text/plain");
    if (!raw) return;
    try {
      const paths = JSON.parse(raw) as string[];
      if (paths.length > 0) onDropPhoto(paths, entry.path);
    } catch {
      onDropPhoto([raw], entry.path);
    }
  }

  return (
    <div>
      <div
        className={`dir-row${isOpen ? " dir-row--open" : ""}${dragOver ? " dir-row--dragover" : ""}`}
        style={{ paddingLeft: depth * 14 }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <span className="dir-row__chevron" onClick={() => hasChildren && toggleExpand()}>
          {hasChildren ? expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} /> : null}
        </span>
        <span
          className="dir-row__name"
          onClick={toggleExpand}
          onDoubleClick={() => onOpenFolder(entry.path)}
          title="Click to expand, double-click to open for culling, drag a photo here to move it"
        >
          {expanded ? (
            <FolderOpen className="dir-row__folder-icon" size={14} />
          ) : (
            <Folder className="dir-row__folder-icon" size={14} />
          )}{" "}
          {entry.name}
        </span>
        <button
          type="button"
          className="dir-row__open"
          onClick={() => onOpenFolder(entry.path)}
          title="Open this folder for culling"
        >
          ⏵
        </button>
        <button
          type="button"
          className={`dir-row__pin${isPinned ? " dir-row__pin--active" : ""}`}
          onClick={() => onTogglePin(entry.path)}
          title={isPinned ? "Remove from favourites" : "Pin to favourites"}
        >
          <Star size={13} fill={isPinned ? "currentColor" : "none"} />
        </button>
        <button type="button" className="dir-row__add" onClick={() => setCreating(true)} title="New subfolder">
          <FolderPlus size={13} />
        </button>
      </div>
      {creating && (
        <form
          className="dir-row__new-form"
          style={{ paddingLeft: (depth + 1) * 14 }}
          onSubmit={(e) => {
            e.preventDefault();
            void submitNewFolder();
          }}
        >
          <input
            autoFocus
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onBlur={() => setCreating(false)}
            placeholder="Folder name"
          />
        </form>
      )}
      {error && (
        <p className="dir-browser__error" style={{ paddingLeft: (depth + 1) * 14 }}>
          {error}
        </p>
      )}
      {expanded && loading && (
        <div className="dir-row__loading" style={{ paddingLeft: (depth + 1) * 14 }}>
          Loading…
        </div>
      )}
      {expanded &&
        children?.map((child) => (
          <FolderTreeNode
            key={child.path}
            entry={child}
            depth={depth + 1}
            openFolderPath={openFolderPath}
            favourites={favourites}
            onOpenFolder={onOpenFolder}
            onDropPhoto={onDropPhoto}
            onTogglePin={onTogglePin}
          />
        ))}
    </div>
  );
}
