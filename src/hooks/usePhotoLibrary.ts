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
      await scanFolder(folder, similarityPercent);
    },
    [similarityPercent],
  );

  const applyGrouping = useCallback(async (nextSimilarityPercent: number) => {
    const result = await recomputeGroups(nextSimilarityPercent);
    setAppliedGroups(result.groups);
    setLastAppliedPercent(nextSimilarityPercent);
  }, []);

  const setRating = useCallback(async (path: string, rating: number) => {
    setPhotos((prev) => (prev[path] ? { ...prev, [path]: { ...prev[path], rating } } : prev));
    await apiSetRating(path, rating);
  }, []);

  const setPick = useCallback(async (path: string, pick: boolean) => {
    setPhotos((prev) => (prev[path] ? { ...prev, [path]: { ...prev[path], pick } } : prev));
    await apiSetPick(path, pick);
  }, []);

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
      await moveItems(paths, destFolder);
      const movedSet = new Set(paths);
      setPhotos((prev) => {
        const next = { ...prev };
        for (const p of paths) delete next[p];
        return next;
      });
      setAppliedGroups((prev) =>
        prev ? prev.map((g) => g.filter((p) => !movedSet.has(p))).filter((g) => g.length > 0) : prev,
      );
    },
    [],
  );

  return {
    photos,
    appliedGroups,
    scanProgress,
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
