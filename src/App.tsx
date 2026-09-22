import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { addFavourite, listFavourites, removeFavourite } from "./api";
import CullingView from "./components/CullingView";
import LibrarySidebar from "./components/LibrarySidebar";
import LoupePreview from "./components/LoupePreview";
import TitleBar from "./components/TitleBar";
import { usePhotoLibrary } from "./hooks/usePhotoLibrary";
import type { PhotoFilters, PhotoInfo } from "./types";

const DEFAULT_FILTERS: PhotoFilters = { minStars: 0, pickState: "any" };

function matchesFilters(filters: PhotoFilters, rating: number, pick: boolean): boolean {
  if (filters.minStars > 0 && rating < filters.minStars) return false;
  switch (filters.pickState) {
    case "picked":
      return pick;
    case "rejected":
      return rating === -1;
    case "unpicked":
      return !pick && rating !== -1;
    case "any":
      return true;
  }
}

export default function App() {
  const {
    photos,
    appliedGroups,
    scanProgress,
    similarityPercent,
    setSimilarityPercent,
    groupingStale,
    openFolder,
    applyGrouping,
    setRating,
    setPick,
    rejectPhoto,
    pickPhoto,
    moveGroupsOrPhotos,
  } = usePhotoLibrary();

  const [rootFolder, setRootFolder] = useState<string | null>(null);
  const [favourites, setFavourites] = useState<string[]>([]);
  const [filters, setFilters] = useState<PhotoFilters>(DEFAULT_FILTERS);
  const [focus, setFocus] = useState({ groupIndex: 0, frameIndex: 0 });
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [selectionAnchor, setSelectionAnchor] = useState<string | null>(null);

  useEffect(() => {
    void listFavourites().then(setFavourites);
  }, []);

  // While a scan is still streaming in (appliedGroups is null until
  // scan-complete), show every photo in its own row in capture order - lets
  // a big folder be browsed the moment photos start arriving rather than
  // waiting for the whole scan to finish.
  const naiveGroups = useMemo(() => {
    return (Object.values(photos) as PhotoInfo[])
      .sort((a, b) => a.timestampMs - b.timestampMs)
      .map((p) => [p.path]);
  }, [photos]);

  const groups = appliedGroups ?? naiveGroups;

  const filteredGroups = useMemo(() => {
    if (filters.minStars === 0 && filters.pickState === "any") return groups;
    return groups
      .map((paths) =>
        paths.filter((p) => {
          const photo = photos[p];
          return photo ? matchesFilters(filters, photo.rating, photo.pick) : false;
        }),
      )
      .filter((paths) => paths.length > 0);
  }, [groups, photos, filters]);

  useEffect(() => {
    setFocus((prev) => {
      const groupIndex = Math.min(prev.groupIndex, Math.max(0, filteredGroups.length - 1));
      const frameIndex = Math.min(prev.frameIndex, Math.max(0, (filteredGroups[groupIndex]?.length ?? 1) - 1));
      return { groupIndex, frameIndex };
    });
  }, [filteredGroups]);

  const focusedPath = filteredGroups[focus.groupIndex]?.[focus.frameIndex] ?? null;
  const focusedPhoto = focusedPath ? photos[focusedPath] ?? null : null;

  // Flattened in display order so shift-click range selection and
  // select-all operate over exactly what's currently visible (respecting
  // the active filter), not the full unfiltered library.
  const flatVisiblePaths = useMemo(() => filteredGroups.flat(), [filteredGroups]);

  function handleFocusFrame(groupIndex: number, frameIndex: number, e: React.MouseEvent) {
    setFocus({ groupIndex, frameIndex });
    const path = filteredGroups[groupIndex]?.[frameIndex];
    if (!path) return;

    if (e.shiftKey && selectionAnchor) {
      const anchorIdx = flatVisiblePaths.indexOf(selectionAnchor);
      const clickedIdx = flatVisiblePaths.indexOf(path);
      if (anchorIdx !== -1 && clickedIdx !== -1) {
        const [lo, hi] = anchorIdx < clickedIdx ? [anchorIdx, clickedIdx] : [clickedIdx, anchorIdx];
        setSelectedPaths(new Set(flatVisiblePaths.slice(lo, hi + 1)));
      }
    } else if (e.ctrlKey || e.metaKey) {
      setSelectedPaths((prev) => {
        const next = new Set(prev);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        return next;
      });
      setSelectionAnchor(path);
    } else {
      setSelectedPaths(new Set([path]));
      setSelectionAnchor(path);
    }
  }

  useEffect(() => {
    function isTypingTarget(target: EventTarget | null) {
      const el = target as HTMLElement | null;
      const tag = el?.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
    }

    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSelectedPaths(new Set(flatVisiblePaths));
        return;
      }
      if (e.key === "Escape") {
        setSelectedPaths(new Set());
        return;
      }

      const targets = selectedPaths.size > 0 ? Array.from(selectedPaths) : focusedPath ? [focusedPath] : [];
      if (targets.length === 0) return;

      if (e.key >= "0" && e.key <= "5") {
        const rating = Number(e.key);
        for (const path of targets) void setRating(path, rating);
        return;
      }
      switch (e.key.toLowerCase()) {
        case "p":
          if (targets.length > 1) {
            // Multiple selected: apply pick to all of them rather than
            // toggling each individually against its own current state,
            // which would give inconsistent results across mixed-state
            // photos - "mark these as picks" should be unambiguous.
            for (const path of targets) {
              void setPick(path, true);
              if (photos[path]?.rating === -1) void setRating(path, 0);
            }
          } else {
            pickPhoto(targets[0]);
          }
          return;
        case "x":
          if (targets.length > 1) {
            for (const path of targets) {
              void setRating(path, -1);
              if (photos[path]?.pick) void setPick(path, false);
            }
          } else {
            rejectPhoto(targets[0]);
          }
          return;
        case "arrowleft":
          e.preventDefault();
          setFocus((prev) => {
            const frameIndex = Math.max(0, prev.frameIndex - 1);
            const path = filteredGroups[prev.groupIndex]?.[frameIndex];
            if (path) {
              setSelectedPaths(new Set([path]));
              setSelectionAnchor(path);
            }
            return { ...prev, frameIndex };
          });
          return;
        case "arrowright": {
          e.preventDefault();
          const groupLen = filteredGroups[focus.groupIndex]?.length ?? 1;
          setFocus((prev) => {
            const frameIndex = Math.min(groupLen - 1, prev.frameIndex + 1);
            const path = filteredGroups[prev.groupIndex]?.[frameIndex];
            if (path) {
              setSelectedPaths(new Set([path]));
              setSelectionAnchor(path);
            }
            return { ...prev, frameIndex };
          });
          return;
        }
        case "arrowup":
          e.preventDefault();
          setFocus((prev) => {
            const groupIndex = Math.max(0, prev.groupIndex - 1);
            const frameIndex = Math.min(prev.frameIndex, (filteredGroups[groupIndex]?.length ?? 1) - 1);
            const clamped = Math.max(0, frameIndex);
            const path = filteredGroups[groupIndex]?.[clamped];
            if (path) {
              setSelectedPaths(new Set([path]));
              setSelectionAnchor(path);
            }
            return { groupIndex, frameIndex: clamped };
          });
          return;
        case "arrowdown":
          e.preventDefault();
          setFocus((prev) => {
            const groupIndex = Math.min(filteredGroups.length - 1, prev.groupIndex + 1);
            const frameIndex = Math.min(prev.frameIndex, (filteredGroups[groupIndex]?.length ?? 1) - 1);
            const clamped = Math.max(0, frameIndex);
            const path = filteredGroups[groupIndex]?.[clamped];
            if (path) {
              setSelectedPaths(new Set([path]));
              setSelectionAnchor(path);
            }
            return { groupIndex, frameIndex: clamped };
          });
          return;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    focusedPath,
    focus.groupIndex,
    filteredGroups,
    flatVisiblePaths,
    selectedPaths,
    photos,
    setRating,
    setPick,
    pickPhoto,
    rejectPhoto,
  ]);

  async function handleOpenFolder(folder: string) {
    setRootFolder(folder);
    setFocus({ groupIndex: 0, frameIndex: 0 });
    setSelectedPaths(new Set());
    setSelectionAnchor(null);
    await openFolder(folder);
  }

  async function handleDropPhoto(paths: string[], destFolder: string) {
    await moveGroupsOrPhotos(paths, destFolder);
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      for (const p of paths) next.delete(p);
      return next;
    });
  }

  async function handleTogglePin(path: string) {
    const next = favourites.includes(path) ? await removeFavourite(path) : await addFavourite(path);
    setFavourites(next);
  }

  return (
    <div className="app-shell">
      <TitleBar />
      <div className="app">
        <LibrarySidebar
          openFolderPath={rootFolder}
          onOpenFolder={handleOpenFolder}
          onDropPhoto={handleDropPhoto}
          favourites={favourites}
          onTogglePin={handleTogglePin}
          filters={filters}
          onFiltersChange={setFilters}
          similarityPercent={similarityPercent}
          onSimilarityPercentChange={setSimilarityPercent}
          groupingStale={groupingStale}
          onUpdateGrouping={() => applyGrouping(similarityPercent)}
        />

        <main className="app__main">
          <LoupePreview photo={focusedPhoto} />

          {scanProgress && (
            <div className="scan-progress">
              <span>
                Scanning… {scanProgress.done}/{scanProgress.total || "?"}
              </span>
              <div className="scan-progress__bar">
                <div
                  className="scan-progress__bar-fill"
                  style={{
                    width: `${scanProgress.total > 0 ? (scanProgress.done / scanProgress.total) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          )}

          {!rootFolder && (
            <div className="app__empty">
              <p>Open a folder of RAW files to start culling.</p>
            </div>
          )}

          {rootFolder && filteredGroups.length === 0 && !scanProgress && (
            <div className="app__empty">
              <p>No photos match the current filter.</p>
            </div>
          )}

          <CullingView
            groups={filteredGroups}
            photos={photos}
            focusedGroupIndex={focus.groupIndex}
            focusedFrameIndex={focus.frameIndex}
            selectedPaths={selectedPaths}
            onFocusFrame={handleFocusFrame}
            onClearSelection={() => setSelectedPaths(new Set())}
          />
        </main>
      </div>
    </div>
  );
}
