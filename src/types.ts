export interface PhotoInfo {
  path: string;
  jpegPath: string | null;
  fileName: string;
  timestampMs: number;
  orientation: number;
  width: number;
  height: number;
  thumbBase64: string;
  rating: number;
  pick: boolean;
  phash: number;
}

export interface ScanProgress {
  total: number;
  done: number;
}

export interface ScanComplete {
  groups: string[][];
  failedPaths: string[];
}

export interface DirEntry {
  path: string;
  name: string;
  hasChildren: boolean;
}

export interface Volume {
  name: string;
  path: string;
  removable: boolean;
}

export interface DirListing {
  path: string;
  parent: string | null;
  entries: DirEntry[];
}

export interface MoveFailure {
  path: string;
  error: string;
}

export interface MoveResult {
  moved: string[];
  failed: MoveFailure[];
}

export interface FullPreview {
  path: string;
  imageBase64: string;
  width: number;
  height: number;
}

export type PickFilterState = "any" | "picked" | "rejected" | "unpicked";

export interface PhotoFilters {
  exactStars: number;
  pickState: PickFilterState;
}
