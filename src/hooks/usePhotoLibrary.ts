import { useCallback, useEffect, useRef, useState } from "react";
import {
  moveItems,
  onPhotoReady,
  onScanComplete,
  onScanProgress,
  recomputeGroups,
  scanFolder,
  setPick as apiSetPick,
  setRating as apiSetRating,
} from "../api";
import type { PhotoInfo, ScanProgress } from "../types";

export const DEFAULT_SIMILARITY_PERCENT = 50;

export function usePhotoLibrary() {
  const [photos, setPhotos] = useState<Record<string, PhotoInfo>>({});
  // null while a scan is still streaming in photos - the culling view falls
  // back to one photo per row in capture order so a big folder can be
  // browsed the moment photos start arriving. Grouping is applied
  // automatically once the scan finishes; after that, changing the
  // similarity slider only takes effect when "Update grouping" is clicked.
  const [appliedGroups, setAppliedGroups] = useState<string[][] | null>(null);
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [similarityPercent, setSimilarityPercent] = useState(DEFAULT_SIMILARITY_PERCENT);
  const [lastAppliedPercent, setLastAppliedPercent] = useState(DEFAULT_SIMILARITY_PERCENT);
  const unlistenRefs = useRef<Array<() => void>>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const unlistenReady = await onPhotoReady((photo) => {
        if (cancelled) return;
        setPhotos((prev) => ({ ...prev, [photo.path]: photo }));
      });
      const unlistenProgress = await onScanProgress((progress) => {
        if (cancelled) return;
        setScanProgress(progress);
      });
      const unlistenComplete = await onScanComplete((result) => {
        if (cancelled) return;
        setAppliedGroups(result.groups);
        setScanProgress(null);
      });
      unlistenRefs.current = [unlistenReady, unlistenProgress, unlistenComplete];
    })();
    return () => {
      cancelled = true;
      unlistenRefs.current.forEach((fn) => fn());
    };
  }, []);

  const openFolder = useCallback(
    async (folder: string) => {
      setPhotos({});
      setAppliedGroups(null);
      setScanProgress({ done: 0, total: 0 });
      setLastAppliedPercent(similarityPercent);
      try {
        await scanFolder(folder, similarityPercent);
      } catch (e) {
        // Most commonly: a pinned folder on a drive that's since been
        // unplugged/disconnected. Without this, the "Building thumbnails…"
        // banner would just hang forever with no explanation.
        setScanProgress(null);
        setError(`Couldn't open ${folder}: ${e}`);
      }
    },
    [similarityPercent],
  );

  const applyGrouping = useCallback(async (nextSimilarityPercent: number) => {
    const result = await recomputeGroups(nextSimilarityPercent);
    setAppliedGroups(result.groups);
    setLastAppliedPercent(nextSimilarityPercent);
  }, []);

  const setRating = useCallback(async (path: string, rating: number) => {
    const previous = photos[path]?.rating;
    setPhotos((prev) => (prev[path] ? { ...prev, [path]: { ...prev[path], rating } } : prev));
    try {
      await apiSetRating(path, rating);
    } catch (e) {
      // Roll back the optimistic update - if the write failed, the UI must
      // not keep showing a rating that was never actually saved to disk.
      if (previous !== undefined) {
        setPhotos((prev) => (prev[path] ? { ...prev, [path]: { ...prev[path], rating: previous } } : prev));
      }
      setError(`Couldn't save rating for ${path.split(/[\\/]/).pop()}: ${e}`);
    }
  }, [photos]);

  const setPick = useCallback(async (path: string, pick: boolean) => {
    const previous = photos[path]?.pick;
    setPhotos((prev) => (prev[path] ? { ...prev, [path]: { ...prev[path], pick } } : prev));
    try {
      await apiSetPick(path, pick);
    } catch (e) {
      if (previous !== undefined) {
        setPhotos((prev) => (prev[path] ? { ...prev, [path]: { ...prev[path], pick: previous } } : prev));
      }
      setError(`Couldn't save pick for ${path.split(/[\\/]/).pop()}: ${e}`);
    }
  }, [photos]);

  const rejectPhoto = useCallback(
    (path: string) => {
      const current = photos[path];
      if (!current) return;
      if (current.rating === -1) {
        void setRating(path, 0);
      } else {
        void setRating(path, -1);
        if (current.pick) void setPick(path, false);
      }
    },
    [photos, setRating, setPick],
  );

  const pickPhoto = useCallback(
    (path: string) => {
      const current = photos[path];
      if (!current) return;
      const nextPick = !current.pick;
      void setPick(path, nextPick);
      if (nextPick && current.rating === -1) {
        void setRating(path, 0);
      }
    },
    [photos, setPick, setRating],
  );

  const moveGroupsOrPhotos = useCallback(
    async (paths: string[], destFolder: string) => {
      let result;
      try {
        result = await moveItems(paths, destFolder);
      } catch (e) {
        // The whole call rejected (e.g. dest_folder itself is gone) - nothing
        // moved, so app state is still accurate. Just tell the user.
        setError(`Move failed: ${e}`);
        return;
      }

      // Only drop photos that were actually confirmed moved on disk - a
      // partial-batch failure must not make the UI forget about photos that
      // are still sitting right where they were.
      const movedSet = new Set(result.moved);
      setPhotos((prev) => {
        const next = { ...prev };
        for (const p of result.moved) delete next[p];
        return next;
      });
      setAppliedGroups((prev) =>
        prev ? prev.map((g) => g.filter((p) => !movedSet.has(p))).filter((g) => g.length > 0) : prev,
      );

      if (result.failed.length > 0) {
        // Group by the actual OS error text so a batch failing for one
        // reason (e.g. every file hitting the same cross-drive error)
        // reads as one clear line instead of a wall of filenames with no
        // explanation of what went wrong.
        const byReason = new Map<string, string[]>();
        for (const f of result.failed) {
          const name = f.path.split(/[\\/]/).pop() ?? f.path;
          const list = byReason.get(f.error);
          if (list) list.push(name);
          else byReason.set(f.error, [name]);
        }
        const summary = [...byReason.entries()]
          .map(([reason, names]) => `${reason} (${names.join(", ")})`)
          .join("; ");
        setError(`${result.failed.length} of ${paths.length} photo(s) couldn't be moved: ${summary}`);
      }
    },
    [],
  );

  return {
    photos,
    appliedGroups,
    scanProgress,
    error,
    clearError: () => setError(null),
    similarityPercent,
    setSimilarityPercent,
    groupingStale: similarityPercent !== lastAppliedPercent,
    openFolder,
    applyGrouping,
    setRating,
    setPick,
    rejectPhoto,
    pickPhoto,
    moveGroupsOrPhotos,
  };
}
