import { useEffect, useRef, useState } from "react";
import { getFullPreview } from "../api";
import type { PhotoInfo } from "../types";

interface Props {
  photo: PhotoInfo | null;
}

// A true close-up: the magnifier shows the full-res crop at native
// resolution (1 source pixel = 1 screen pixel) rather than an artificially
// scaled-up view, so it stays crisp instead of blurring from upscaling.
const ZOOM_LEVEL = 1;
const MAGNIFIER_SIZE = 280; // must match .loupe__float's width/height in App.css

interface HoverState {
  sampleX: number;
  sampleY: number;
  dotLeftPx: number;
  dotTopPx: number;
}

interface FullRes {
  src: string;
  width: number;
  height: number;
}

export default function LoupePreview({ photo }: Props) {
  const [hover, setHover] = useState<HoverState | null>(null);
  const [fullRes, setFullRes] = useState<FullRes | null>(null);
  const cacheRef = useRef<Map<string, FullRes>>(new Map());
  const currentPathRef = useRef<string | null>(null);
  currentPathRef.current = photo?.path ?? null;

  useEffect(() => {
    setHover(null);
    setFullRes(photo ? cacheRef.current.get(photo.path) ?? null : null);
  }, [photo?.path]);

  if (!photo) {
    return <div className="loupe loupe--empty">Select a photo to preview it here</div>;
  }

  // The main preview always shows the already-decoded embedded RAW preview
  // (fast, already in memory) - a fresh full-resolution JPEG is only worth
  // rendering for the magnifier, and only once you actually hover to check
  // detail, not on every photo you merely flip past. Until it's ready, the
  // magnifier shows a spinner rather than a blurry low-res stand-in.
  const mainSrc = photo.thumbBase64;

  function ensureFullRes() {
    if (!photo) return;
    if (cacheRef.current.has(photo.path)) return;
    const path = photo.path;
    void getFullPreview(path).then((result) => {
      const entry: FullRes = { src: result.imageBase64, width: result.width, height: result.height };
      cacheRef.current.set(path, entry);
      if (currentPathRef.current === path) {
        setFullRes(entry);
      }
    });
  }

  function handleMouseMove(e: React.MouseEvent<HTMLImageElement>) {
    const img = e.currentTarget;
    const rect = img.getBoundingClientRect();
    const naturalW = img.naturalWidth;
    const naturalH = img.naturalHeight;
    if (!naturalW || !naturalH || rect.width === 0 || rect.height === 0) return;

    const containerRatio = rect.width / rect.height;
    const imageRatio = naturalW / naturalH;

    let contentW = rect.width;
    let contentH = rect.height;
    let offsetX = 0;
    let offsetY = 0;

    if (imageRatio > containerRatio) {
      contentH = rect.width / imageRatio;
      offsetY = (rect.height - contentH) / 2;
    } else {
      contentW = rect.height * imageRatio;
      offsetX = (rect.width - contentW) / 2;
    }

    const px = e.clientX - rect.left - offsetX;
    const py = e.clientY - rect.top - offsetY;

    if (px < 0 || py < 0 || px > contentW || py > contentH) {
      setHover(null);
      return;
    }

    setHover({
      sampleX: Math.min(1, Math.max(0, px / contentW)),
      sampleY: Math.min(1, Math.max(0, py / contentH)),
      dotLeftPx: offsetX + px,
      dotTopPx: offsetY + py,
    });
  }

  let magnifier: { renderedW: number; renderedH: number; left: number; top: number } | null = null;
  if (hover && fullRes) {
    const renderedW = fullRes.width * ZOOM_LEVEL;
    const renderedH = fullRes.height * ZOOM_LEVEL;
    magnifier = {
      renderedW,
      renderedH,
      left: MAGNIFIER_SIZE / 2 - hover.sampleX * renderedW,
      top: MAGNIFIER_SIZE / 2 - hover.sampleY * renderedH,
    };
  }

  return (
    <div className="loupe">
      <div className="loupe__main">
        <img
          src={mainSrc}
          alt={photo.fileName}
          onMouseEnter={ensureFullRes}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHover(null)}
          draggable={false}
        />
        {hover && (
          <div className="loupe__cursor-dot" style={{ left: `${hover.dotLeftPx}px`, top: `${hover.dotTopPx}px` }} />
        )}
      </div>
      <div className="loupe__meta">
        <span>{photo.fileName}</span>
        <span>{photo.width}×{photo.height}</span>
      </div>

      {hover && (
        <div className="loupe__float">
          {fullRes && magnifier ? (
            <img
              src={fullRes.src}
              alt=""
              className="loupe__float-img"
              style={{
                width: magnifier.renderedW,
                height: magnifier.renderedH,
                transform: `translate(${magnifier.left}px, ${magnifier.top}px)`,
              }}
              draggable={false}
            />
          ) : (
            <div className="loupe__float-loading">
              <div className="loupe__float-spinner" />
              <span>1:1 preview loading</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
