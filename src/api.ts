import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { DirListing, FullPreview, MoveResult, PhotoInfo, ScanComplete, ScanProgress, Volume } from "./types";

export function scanFolder(folder: string, similarityPercent: number): Promise<ScanComplete> {
  return invoke("scan_folder", { folder, similarityPercent });
}

export function recomputeGroups(similarityPercent: number): Promise<ScanComplete> {
  return invoke("recompute_groups", { similarityPercent });
}

export function getFullPreview(path: string): Promise<FullPreview> {
  return invoke("get_full_preview", { path });
}

export function setRating(path: string, rating: number): Promise<void> {
  return invoke("set_rating", { path, rating });
}

export function setPick(path: string, pick: boolean): Promise<void> {
  return invoke("set_pick", { path, pick });
}

export function listDirectory(path?: string): Promise<DirListing> {
  return invoke("list_directory", { path: path ?? null });
}

export function listVolumes(): Promise<Volume[]> {
  return invoke("list_volumes");
}

export function listPhotoNames(folder: string): Promise<string[]> {
  return invoke("list_photo_names", { folder });
}

export function createFolder(parent: string, name: string): Promise<string> {
  return invoke("create_folder", { parent, name });
}

export function moveItems(paths: string[], destFolder: string): Promise<MoveResult> {
  return invoke("move_items", { paths, destFolder });
}

export function listFavourites(): Promise<string[]> {
  return invoke("list_favourites");
}

export function addFavourite(folder: string): Promise<string[]> {
  return invoke("add_favourite", { folder });
}

export function removeFavourite(folder: string): Promise<string[]> {
  return invoke("remove_favourite", { folder });
}

export function onPhotoReady(handler: (photo: PhotoInfo) => void): Promise<UnlistenFn> {
  return listen<PhotoInfo>("photo-ready", (event) => handler(event.payload));
}

export function onScanProgress(handler: (progress: ScanProgress) => void): Promise<UnlistenFn> {
  return listen<ScanProgress>("scan-progress", (event) => handler(event.payload));
}

export function onScanComplete(handler: (result: ScanComplete) => void): Promise<UnlistenFn> {
  return listen<ScanComplete>("scan-complete", (event) => handler(event.payload));
}
