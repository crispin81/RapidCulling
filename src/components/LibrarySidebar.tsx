import { openUrl } from "@tauri-apps/plugin-opener";
import { Check, Star, X } from "lucide-react";
import { useState } from "react";
import DirectoryBrowser from "./DirectoryBrowser";
import FavouritesPanel from "./FavouritesPanel";
import type { PhotoFilters, PickFilterState } from "../types";

// TODO: swap for the real RapidCulling tutorial video URL before launch.
const TUTORIAL_VIDEO_URL = "https://github.com/crispin81";
const TUTORIAL_DISMISSED_KEY = "rapidculling.tutorialDismissed";

interface Props {
  openFolderPath: string | null;
  selectedPath: string | null;
  onSelectFolder: (path: string) => void;
  onOpenFolder: (path: string) => void;
  onDropPhoto: (photoPaths: string[], destFolder: string) => void;
  favourites: string[];
  onTogglePin: (path: string) => void;
  filters: PhotoFilters;
  onFiltersChange: (filters: PhotoFilters) => void;
  similarityPercent: number;
  onSimilarityPercentChange: (similarityPercent: number) => void;
  groupingStale: boolean;
  onUpdateGrouping: () => void;
}

export default function LibrarySidebar({
  openFolderPath,
  selectedPath,
  onSelectFolder,
  onOpenFolder,
  onDropPhoto,
  favourites,
  onTogglePin,
  filters,
  onFiltersChange,
  similarityPercent,
  onSimilarityPercentChange,
  groupingStale,
  onUpdateGrouping,
}: Props) {
  const [tutorialDismissed, setTutorialDismissed] = useState(() => {
    try {
      return localStorage.getItem(TUTORIAL_DISMISSED_KEY) === "1";
    } catch {
      return false;
    }
  });
  function toggleExactStars(star: number) {
    onFiltersChange({ ...filters, exactStars: filters.exactStars === star ? 0 : star });
  }

  function togglePickState(state: PickFilterState) {
    onFiltersChange({ ...filters, pickState: filters.pickState === state ? "any" : state });
  }

  function dismissTutorial() {
    setTutorialDismissed(true);
    try {
      localStorage.setItem(TUTORIAL_DISMISSED_KEY, "1");
    } catch {
      // localStorage unavailable - dismissal just won't persist across restarts.
    }
  }

  return (
    <aside className="sidebar">
      {!tutorialDismissed && (
        <div className="video-link">
          <a
            className="video-link__cta"
            href={TUTORIAL_VIDEO_URL}
            onClick={(e) => {
              e.preventDefault();
              openUrl(TUTORIAL_VIDEO_URL);
            }}
            title="Watch the tutorial video on YouTube"
          >
            ▶ New user? Watch this first!
          </a>
          <button
            type="button"
            className="video-link__close"
            onClick={dismissTutorial}
            title="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      <h3>Library</h3>
      {openFolderPath && (
        <p className="sidebar__root" title={openFolderPath}>Culling: {openFolderPath}</p>
      )}
      <p className="sidebar__hint">Double-click (or ⏵) a folder to cull it. Drag a photo onto a folder to move it there.</p>
      <DirectoryBrowser
        openFolderPath={openFolderPath}
        selectedPath={selectedPath}
        onSelectFolder={onSelectFolder}
        onOpenFolder={onOpenFolder}
        onDropPhoto={onDropPhoto}
        favourites={favourites}
        onTogglePin={onTogglePin}
      />

      <h3>Favourites</h3>
      <FavouritesPanel
        favourites={favourites}
        openFolderPath={openFolderPath}
        selectedPath={selectedPath}
        onSelectFolder={onSelectFolder}
        onOpenFolder={onOpenFolder}
        onTogglePin={onTogglePin}
        onDropPhoto={onDropPhoto}
      />

      <h3>Filter</h3>
      <div className="star-filter">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            className={`star-filter__star${star <= filters.exactStars ? " star-filter__star--active" : ""}`}
            onClick={() => toggleExactStars(star)}
            title={`${star} star${star === 1 ? "" : "s"} only`}
          >
            <Star size={16} fill={star <= filters.exactStars ? "currentColor" : "none"} />
          </button>
        ))}
      </div>
      <div className="pick-filter">
        <button
          type="button"
          className={`pick-filter__btn${filters.pickState === "picked" ? " pick-filter__btn--active-pick" : ""}`}
          onClick={() => togglePickState("picked")}
        >
          <Check size={14} /> Picked
        </button>
        <button
          type="button"
          className={`pick-filter__btn${filters.pickState === "unpicked" ? " pick-filter__btn--active" : ""}`}
          onClick={() => togglePickState("unpicked")}
        >
          Unpicked
        </button>
        <button
          type="button"
          className={`pick-filter__btn${filters.pickState === "rejected" ? " pick-filter__btn--active-reject" : ""}`}
          onClick={() => togglePickState("rejected")}
        >
          <X size={14} /> Rejected
        </button>
      </div>

      <h3>Grouping</h3>
      <label className="sidebar__slider">
        Photo similarity: {similarityPercent}%
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={similarityPercent}
          onChange={(e) => onSimilarityPercentChange(Number(e.target.value))}
        />
      </label>
      <p className="sidebar__hint">
        100% groups only near-identical frames; lower values group shots that are further apart in time or content.
        Grouping applies automatically once a scan finishes - change the slider afterwards and click below to
        re-group.
      </p>
      <button type="button" className="sidebar__apply" onClick={onUpdateGrouping}>
        Update grouping
      </button>
      {groupingStale && <p className="sidebar__hint">Similarity changed - click Update grouping to refresh.</p>}

      <h3>Shortcuts</h3>
      <ul className="sidebar__shortcuts">
        <li><kbd>↑</kbd>/<kbd>↓</kbd> next/prev photo or group</li>
        <li><kbd>←</kbd>/<kbd>→</kbd> scroll similar shots</li>
        <li><kbd>0</kbd>-<kbd>5</kbd> star rating</li>
        <li><kbd>P</kbd> pick, <kbd>X</kbd> reject</li>
      </ul>
    </aside>
  );
}
