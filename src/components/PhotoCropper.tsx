import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';

/**
 * Full-screen "move and scale" photo cropper — the same drag + pinch + zoom
 * flow used on the account page and the join form, extracted here so the two
 * can never drift apart. Faces are the whole point of a helper photo, so this
 * lets a student frame their head in the guide circle instead of uploading a
 * stretched full-body shot that a hard object-cover would slice.
 *
 * OUTPUT is a SQUARE (not a circle-clipped image): circular avatars round it
 * with CSS, and the rectangular helper cards object-cover it — a real circle
 * clip would bake black corners into the JPEG and show them on the cards. The
 * circle is only an on-screen framing guide.
 *
 * iOS SAFARI, IMPORTANT (July 2026 black-screen bug): the raw camera file is
 * NEVER shown directly. A modern iPhone photo is 24–48MP, and mobile Safari
 * routinely refuses to decode/composite an image that large inside a
 * transformed full-screen layer — the <img> silently paints nothing, and on
 * this black overlay that read as "the screen goes black" (real user report,
 * iPhone 16). So the file is decoded OFF-screen first and downscaled to a
 * ≤ WORK_MAX-px working copy (plenty for a 400px export at 4× zoom), and
 * every failure path shows words + a way out instead of silence.
 */

const CROP_D = 260;              // guide-circle diameter (screen px)
const CROP_R = CROP_D / 2;
const OUTPUT_SIZE = 400;         // exported square edge (px)
const WORK_MAX = 1600;           // longest edge of the on-screen working copy

export interface PhotoCropperProps {
  /** Object URL (or data URL) of the image being cropped. */
  src: string;
  /** Cancel without producing a photo. */
  onCancel: () => void;
  /** Fires with the cropped square JPEG + a preview object URL for it. */
  onCropped: (file: File, previewUrl: string) => void;
}

export function PhotoCropper({ src, onCancel, onCropped }: PhotoCropperProps) {
  const imgRef      = useRef<HTMLImageElement>(null);
  const cropAreaRef = useRef<HTMLDivElement>(null);
  const naturalSize = useRef({ w: 0, h: 0 });
  const activePointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const lastPinchDist  = useRef<number | null>(null);

  const [scale,        setScale]        = useState(1);
  const [minScale,     setMinScale]     = useState(0.1);
  const [offset,       setOffset]       = useState({ x: 0, y: 0 });
  // The downscaled copy actually shown on screen (see header comment). null =
  // still preparing; loadError = the photo genuinely can't be decoded.
  const [workSrc,   setWorkSrc]   = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  // Decode off-screen + downscale. Fail-soft: if the canvas step is blocked
  // for any reason the raw image is used (old behaviour); only a photo that
  // won't decode AT ALL lands in the error state.
  useEffect(() => {
    let alive = true;
    setWorkSrc(null);
    setLoadError(false);
    const probe = new Image();
    probe.onload = async () => {
      // decode() forces the full bitmap decode (metadata-only "load" isn't
      // enough to draw). It can reject on memory-pressed Safari even for
      // drawable images, so a rejection just falls through to drawImage.
      try { await probe.decode?.(); } catch { /* try drawing anyway */ }
      if (!alive) return;
      const w = probe.naturalWidth, h = probe.naturalHeight;
      if (!w || !h) { setLoadError(true); return; }
      const ratio = Math.min(1, WORK_MAX / Math.max(w, h));
      if (ratio === 1) { setWorkSrc(src); return; } // already small — use as-is
      try {
        const canvas = document.createElement('canvas');
        canvas.width  = Math.round(w * ratio);
        canvas.height = Math.round(h * ratio);
        const ctx = canvas.getContext('2d');
        if (!ctx) { setWorkSrc(src); return; }
        ctx.drawImage(probe, 0, 0, canvas.width, canvas.height);
        const url = canvas.toDataURL('image/jpeg', 0.92);
        // A blocked/empty canvas exports a stub — fall back to the raw image.
        setWorkSrc(url && url.length > 64 ? url : src);
      } catch {
        setWorkSrc(src);
      }
    };
    probe.onerror = () => { if (alive) setLoadError(true); };
    probe.src = src;
    return () => { alive = false; };
  }, [src]);

  const clampOffset = useCallback((x: number, y: number, s: number) => {
    const { w, h } = naturalSize.current;
    const maxX = Math.max(0, (w * s) / 2 - CROP_R);
    const maxY = Math.max(0, (h * s) / 2 - CROP_R);
    return { x: Math.max(-maxX, Math.min(maxX, x)), y: Math.max(-maxY, Math.min(maxY, y)) };
  }, []);

  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    // A "loaded" image with no pixels (seen on memory-pressed mobile Safari)
    // would make the scale maths divide by zero — treat it as a decode failure.
    if (!img.naturalWidth || !img.naturalHeight) { setLoadError(true); return; }
    naturalSize.current = { w: img.naturalWidth, h: img.naturalHeight };
    // Smallest scale that still covers the guide circle, then a touch more so
    // there's room to move without exposing an edge.
    const s = Math.max(CROP_D / img.naturalWidth, CROP_D / img.naturalHeight);
    setMinScale(s);
    setScale(s * 1.1);
    setOffset({ x: 0, y: 0 });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    lastPinchDist.current = null;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const ptr = activePointers.current;
    if (!ptr.has(e.pointerId)) return;
    const prev = ptr.get(e.pointerId)!;
    ptr.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (ptr.size === 1) {
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      setOffset(o => clampOffset(o.x + dx, o.y + dy, scale));
    } else if (ptr.size === 2) {
      const pts = Array.from(ptr.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (lastPinchDist.current !== null) {
        const ratio = dist / lastPinchDist.current;
        // Mirror the slider path: clamp scale to [minScale, minScale*4] AND
        // re-clamp the offset for the new scale. Without the offset re-clamp,
        // pinching OUT near a corner left the shrunken image no longer covering
        // the guide circle, so confirm() exported a JPEG with a white
        // letterbox band / the face pushed off-frame. Without the upper clamp,
        // pinch could zoom past the slider's max.
        const nextScale = Math.min(minScale * 4, Math.max(minScale, scale * ratio));
        setScale(nextScale);
        setOffset(o => clampOffset(o.x, o.y, nextScale));
      }
      lastPinchDist.current = dist;
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    activePointers.current.delete(e.pointerId);
    if (activePointers.current.size < 2) lastPinchDist.current = null;
  };

  const confirm = () => {
    const img  = imgRef.current;
    const area = cropAreaRef.current;
    if (!img || !area) return;

    const imgRect  = img.getBoundingClientRect();
    const areaRect = area.getBoundingClientRect();
    const cx = areaRect.left + areaRect.width  / 2;
    const cy = areaRect.top  + areaRect.height / 2;

    const scaleX = img.naturalWidth  / imgRect.width;
    const scaleY = img.naturalHeight / imgRect.height;
    const srcX = (cx - CROP_R - imgRect.left) * scaleX;
    const srcY = (cy - CROP_R - imgRect.top)  * scaleY;
    const srcW = CROP_D * scaleX;
    const srcH = CROP_D * scaleY;

    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Fill first so any letterboxed edge is white, never transparent→black.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

    canvas.toBlob(blob => {
      if (blob) {
        onCropped(new File([blob], 'photo.jpg', { type: 'image/jpeg' }), URL.createObjectURL(blob));
        return;
      }
      // Safari can hand back a null blob under memory pressure — synchronous
      // toDataURL usually still works, so "Use photo" never becomes a dead
      // button. If even that throws, the sheet stays open for a retry.
      try {
        const bin = atob(canvas.toDataURL('image/jpeg', 0.9).split(',')[1]);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const file = new File([bytes], 'photo.jpg', { type: 'image/jpeg' });
        onCropped(file, URL.createObjectURL(file));
      } catch { /* keep the cropper open — the user can retry or cancel */ }
    }, 'image/jpeg', 0.9);
  };

  // A REAL portal to <body> — same lesson as the booking sheet: rendered in
  // place, any transformed/filtered ancestor (the route-level page-enter
  // wrapper was one) becomes the containing block for this fixed overlay, so
  // "inset-0" spans the PAGE instead of the screen and the whole UI lands
  // below the fold. Portaling makes full-screen mean full-screen, always.
  return createPortal(
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] bg-black flex flex-col"
    >
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0">
        <button type="button" onClick={onCancel} className="text-sm text-white/70 font-medium">
          Cancel
        </button>
        <span className="text-sm font-semibold text-white">Move and scale</span>
        <button
          type="button"
          onClick={confirm}
          disabled={!workSrc || loadError}
          className="text-sm text-white font-semibold disabled:opacity-40"
        >
          Use photo
        </button>
      </div>

      <div
        ref={cropAreaRef}
        className="flex-1 relative overflow-hidden flex items-center justify-center select-none"
        style={{ touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {loadError ? (
          /* The photo can't be decoded — say so and offer the way out. A
             silent black screen here is exactly the bug this replaced. */
          <div className="relative z-20 flex flex-col items-center gap-3 px-8 text-center">
            <p className="text-sm text-white/85 leading-relaxed">
              That photo couldn't be opened — it may be too large for this browser.
            </p>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-full bg-white/15 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/25 transition-colors"
            >
              Try a different photo
            </button>
          </div>
        ) : !workSrc ? (
          /* Preparing the working copy (decode + downscale) — usually <1s. */
          <div className="relative z-20 flex flex-col items-center gap-2.5">
            <Loader2 className="w-6 h-6 text-white/80 animate-spin" aria-hidden="true" />
            <p className="text-xs text-white/60">Opening your photo…</p>
          </div>
        ) : (
          <img
            ref={imgRef}
            src={workSrc}
            alt="Crop your photo"
            draggable={false}
            onLoad={onImageLoad}
            onError={() => setLoadError(true)}
            className="absolute pointer-events-none max-w-none"
            style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`, transformOrigin: 'center' }}
          />
        )}

        {/* Dimmed overlay with a circular framing hole */}
        {!loadError && (
          <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 10 }}>
            <defs>
              <mask id="photo-crop-hole">
                <rect width="100%" height="100%" fill="white" />
                <circle cx="50%" cy="50%" r={CROP_R} fill="black" />
              </mask>
            </defs>
            <rect width="100%" height="100%" fill="rgba(0,0,0,0.62)" mask="url(#photo-crop-hole)" />
            <circle cx="50%" cy="50%" r={CROP_R} fill="none" stroke="white" strokeWidth="1.5" opacity="0.7" />
          </svg>
        )}
      </div>

      <div className="px-8 pb-8 pt-4 flex-shrink-0">
        <input
          type="range"
          min={minScale}
          max={minScale * 4}
          step={0.005}
          value={scale}
          disabled={!workSrc || loadError}
          onChange={e => {
            const s = parseFloat(e.target.value);
            setScale(s);
            setOffset(o => clampOffset(o.x, o.y, s));
          }}
          className="w-full accent-white disabled:opacity-30"
          aria-label="Zoom"
        />
        <p className="text-center text-xs text-white/50 mt-2">Drag to reposition · pinch or slide to zoom</p>
      </div>
    </motion.div>,
    document.body,
  );
}
