import { useEffect, useRef } from "react";
import type { PhotoInfo } from "../types";
import FilmstripThumbnail from "./FilmstripThumbnail";

interface Props {
  paths: string[];
  photos: Record<string, PhotoInfo>;
  isRowFocused: boolean;
  focusedFrameIndex: number;
  selectedPaths: Set<string>;
  onFocusFrame: (index: number, e: React.MouseEvent) => void;
}

export default function GroupRow({
  paths,
  photos,
  isRowFocused,
  focusedFrameIndex,
  selectedPaths,
  onFocusFrame,
}: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isRowFocused) return;
    const scroller = scrollerRef.current;
    const focusedEl = scroller?.children[focusedFrameIndex] as HTMLElement | undefined;
    focusedEl?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [isRowFocused, focusedFrameIndex]);

  return (
    <div className={`group-row${isRowFocused ? " group-row--focused" : ""}`}>
      {paths.length > 1 && <div className="group-row__badge">{paths.length} similar</div>}
      <div className="group-row__scroller" ref={scrollerRef}>
        {paths.map((path, i) => {
          const photo = photos[path];
          if (!photo) return <div key={path} className="thumb thumb--loading" />;
          const isSelected = selectedPaths.has(path);
          const dragPaths = isSelected && selectedPaths.size > 1 ? Array.from(selectedPaths) : [path];
          return (
            <FilmstripThumbnail
              key={path}
              photo={photo}
              isSelected={isSelected}
              dragPaths={dragPaths}
              onSelect={(e) => onFocusFrame(i, e)}
            />
          );
        })}
      </div>
    </div>
  );
}
