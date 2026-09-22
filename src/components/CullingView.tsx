import { useEffect, useRef, useState } from "react";
import type { PhotoInfo } from "../types";
import GroupRow from "./GroupRow";

const ROW_HEIGHT = 136;
const OVERSCAN = 4;

interface Props {
  groups: string[][];
  photos: Record<string, PhotoInfo>;
  focusedGroupIndex: number;
  focusedFrameIndex: number;
  selectedPaths: Set<string>;
  onFocusFrame: (groupIndex: number, frameIndex: number, e: React.MouseEvent) => void;
  onClearSelection: () => void;
}

export default function CullingView({
  groups,
  photos,
  focusedGroupIndex,
  focusedFrameIndex,
  selectedPaths,
  onFocusFrame,
  onClearSelection,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setViewportHeight(el.clientHeight));
    observer.observe(el);
    setViewportHeight(el.clientHeight);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const targetTop = focusedGroupIndex * ROW_HEIGHT;
    const targetBottom = targetTop + ROW_HEIGHT;
    if (targetTop < el.scrollTop) {
      el.scrollTo({ top: targetTop, behavior: "smooth" });
    } else if (targetBottom > el.scrollTop + el.clientHeight) {
      el.scrollTo({ top: targetBottom - el.clientHeight, behavior: "smooth" });
    }
  }, [focusedGroupIndex]);

  const totalHeight = groups.length * ROW_HEIGHT;
  const firstVisible = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const lastVisible = Math.min(
    groups.length,
    Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN,
  );

  return (
    <div
      className="culling-view"
      ref={containerRef}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      onMouseDown={(e) => {
        // Clicking anywhere that isn't a thumbnail - including empty space
        // next to the icons in a row - deselects, same as Escape.
        if (!(e.target as HTMLElement).closest(".thumb")) onClearSelection();
      }}
    >
      <div className="culling-view__spacer" style={{ height: totalHeight }}>
        {groups.slice(firstVisible, lastVisible).map((paths, i) => {
          const groupIndex = firstVisible + i;
          return (
            <div
              key={paths[0] ?? groupIndex}
              className="culling-view__row-wrapper"
              style={{ transform: `translateY(${groupIndex * ROW_HEIGHT}px)` }}
            >
              <GroupRow
                paths={paths}
                photos={photos}
                isRowFocused={groupIndex === focusedGroupIndex}
                focusedFrameIndex={focusedFrameIndex}
                selectedPaths={selectedPaths}
                onFocusFrame={(frameIndex, e) => onFocusFrame(groupIndex, frameIndex, e)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
