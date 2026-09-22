import { Check, Star, X } from "lucide-react";
import type { PhotoInfo } from "../types";

interface Props {
  photo: PhotoInfo;
  isSelected: boolean;
  dragPaths: string[];
  onSelect: (e: React.MouseEvent) => void;
}

export default function FilmstripThumbnail({ photo, isSelected, dragPaths, onSelect }: Props) {
  const rejected = photo.rating === -1;
  return (
    <button
      type="button"
      className={`thumb${isSelected ? " thumb--selected" : ""}${rejected ? " thumb--rejected" : ""}`}
      // Selection fires on mousedown rather than click: it's unaffected by
      // this element's draggable/drag-detection handling. Exception:
      // mousedown on an item that's already part of the current selection
      // is left alone here, so dragging it drags the whole selection - the
      // collapse-to-just-this-one only happens in onClick, which the
      // browser skips entirely if a real drag followed the mousedown.
      onMouseDown={(e) => {
        if (e.shiftKey || e.ctrlKey || e.metaKey || !isSelected) onSelect(e);
      }}
      onClick={(e) => {
        if (!e.shiftKey && !e.ctrlKey && !e.metaKey && isSelected) onSelect(e);
      }}
      title={photo.fileName}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", JSON.stringify(dragPaths));
        e.dataTransfer.effectAllowed = "move";
      }}
    >
      <img src={photo.thumbBase64} alt={photo.fileName} draggable={false} />
      <div className="thumb__overlay">
        {photo.pick && <Check className="thumb__pick" size={14} />}
        {rejected && <X className="thumb__reject" size={14} />}
        {photo.rating > 0 && (
          <span className="thumb__stars">
            {Array.from({ length: photo.rating }).map((_, i) => (
              <Star key={i} size={11} fill="currentColor" stroke="none" />
            ))}
          </span>
        )}
      </div>
    </button>
  );
}
