import { ChevronDown, ChevronRight, Folder, FolderOpen, FolderPlus, Minus, Star } from "lucide-react";
import { useState } from "react";
import { createFolder, listDirectory } from "../api";
import type { DirEntry } from "../types";

interface Props {
  entry: DirEntry;
  depth: number;
  openFolderPath: string | null;
  selectedPath: string | null;
  onSelectFolder: (path: string) => void;
  favourites: string[];
  onOpenFolder: (path: string) => void;
  onDropPhoto: (photoPaths: string[], destFolder: string) => void;
  onTogglePin: (path: string) => void;
  /// When set (favourites top level only), shows a minus button that removes this row from favourites.
  onRemoveFavourite?: (path: string) => void;
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
  selectedPath,
  onSelectFolder,
  favourites,
  onOpenFolder,
  onDropPhoto,
  onTogglePin,
  onRemoveFavourite,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [children, setChildren] = useState<DirEntry[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOpen = openFolderPath === entry.path;
  const isSelected = selectedPath === entry.path;
  const isPinned = favourites.includes(entry.path);

  async function toggleExpand() {
    onSelectFolder(entry.path);
    if (!expanded && children === null) {
      setLoading(true);
      try {
        const listing = await listDirectory(entry.path);
        setChildren(listing.entries);
        setError(null);
      } catch (e) {
        setChildren([]);
        setError(String(e));
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
      setExpanded(true);
      await refreshChildren();
    } catch (e) {
      setError(String(e));
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    // Without this, the drop event bubbles up through the tree's ancestor
    // elements to the root drop zone, which ALSO handles it - silently
    // firing a second, unintended move of the same photos to whatever
    // folder the browser root happens to be showing. One drop must mean
    // exactly one move.
    e.stopPropagation();
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
        className={`dir-row${isOpen || isSelected ? " dir-row--open" : ""}${dragOver ? " dir-row--dragover" : ""}`}
        style={{ paddingLeft: depth * 14 }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <span className="dir-row__chevron" onClick={toggleExpand}>
          {/* Always shown: hiding it after an empty folder loads made the arrow vanish on click. */}
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </span>
        <span
          className="dir-row__name"
          onClick={toggleExpand}
          onDoubleClick={() => {
            onSelectFolder(entry.path);
            onOpenFolder(entry.path);
          }}
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
          onClick={() => {
            onSelectFolder(entry.path);
            onOpenFolder(entry.path);
          }}
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
        {onRemoveFavourite && (
          <button
            type="button"
            className="dir-row__remove"
            onClick={() => onRemoveFavourite(entry.path)}
            title="Remove from favourites"
          >
            <Minus size={13} />
          </button>
        )}
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
            selectedPath={selectedPath}
            onSelectFolder={onSelectFolder}
            favourites={favourites}
            onOpenFolder={onOpenFolder}
            onDropPhoto={onDropPhoto}
            onTogglePin={onTogglePin}
          />
        ))}
    </div>
  );
}
