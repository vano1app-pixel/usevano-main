import { useCallback, useEffect, useRef, useState } from 'react';
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
 */

const CROP_D = 260;              // guide-circle diameter (screen px)
const CROP_R = CROP_D / 2;
const OUTPUT_SIZE = 400;         // exported square edge (px)
// Photos are downscaled to this max edge BEFORE the cropper shows them. An
// iPhone 16 shot is ~48MP (8064×6048); iOS Safari won't paint a CSS-
// transformed layer that big, so the old code rendered a BLACK screen the
// moment such a photo was picked (the exact "screen goes black after
// uploading a picture" bug report). 2048px is far more detail than the
// 400px export needs and safely inside every mobile browser's limits.
const SAFE_MAX_EDGE = 2048;

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
  // The size-bounded source the <img> actually shows (see SAFE_MAX_EDGE),
  // plus honest loading/failure states — this overlay must NEVER be a silent
  // black screen, whatever the phone throws at it.
  const [safeSrc,  setSafeSrc]  = useState<string | null>(null);
  const [imgReady, setImgReady] = useState(false);
  const [failed,   setFailed]   = useState(false);

  // Decode off-DOM and downscale huge photos to a browser-safe size before
  // ever mounting the on-screen <img>.
  //
  // IRON RULE: an image we could not MEASURE and (if big) SHRINK is never
  // shown — that's the black-screen bug. iOS Safari is known to REJECT
  // img.decode() on very large photos even though they load fine, so the
  // pipeline tries the most crash-resistant APIs in order and, if every
  // tier fails, fails VISIBLY (message + way out) instead of gambling with
  // an unbounded render.
  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;
    setSafeSrc(null); setImgReady(false); setFailed(false);
    (async () => {
      let bitmap: ImageBitmap | null = null;
      try {
        let source: CanvasImageSource | null = null;
        let w = 0, h = 0;
        // Tier 1 — createImageBitmap: decodes off the main thread, no decode()
        // quirks, and gives exact dimensions.
        try {
          if (typeof createImageBitmap !== 'function') throw new Error('no createImageBitmap');
          const blob = await (await fetch(src)).blob();
          bitmap = await createImageBitmap(blob);
          w = bitmap.width; h = bitmap.height;
          source = bitmap;
        } catch {
          // Tier 2 — a plain <img> load. Deliberately NOT decode(): Safari
          // rejects decode() for big images that onload handles fine.
          const probe = new Image();
          probe.src = src;
          await new Promise<void>((res, rej) => {
            probe.onload = () => res();
            probe.onerror = () => rej(new Error('load failed'));
          });
          w = probe.naturalWidth; h = probe.naturalHeight;
          source = probe;
        }
        if (!source || !w || !h) throw new Error('unmeasurable image');

        if (Math.max(w, h) <= SAFE_MAX_EDGE) {
          bitmap?.close?.();
          if (!cancelled) setSafeSrc(src); // measured small — raw is safe
          return;
        }
        const ratio = SAFE_MAX_EDGE / Math.max(w, h);
        const canvas = document.createElement('canvas');
        canvas.width  = Math.max(1, Math.round(w * ratio));
        canvas.height = Math.max(1, Math.round(h * ratio));
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('no 2d context');
        ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
        bitmap?.close?.();
        bitmap = null;
        const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', 0.92));
        if (!blob) throw new Error('encode failed');
        createdUrl = URL.createObjectURL(blob);
        if (cancelled) { URL.revokeObjectURL(createdUrl); return; }
        setSafeSrc(createdUrl);
      } catch {
        bitmap?.close?.();
        // Could not measure/shrink — fail visibly, never render unbounded.
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [src]);

  const clampOffset = useCallback((x: number, y: number, s: number) => {
    const { w, h } = naturalSize.current;
    const maxX = Math.max(0, (w * s) / 2 - CROP_R);
    const maxY = Math.max(0, (h * s) / 2 - CROP_R);
    return { x: Math.max(-maxX, Math.min(maxX, x)), y: Math.max(-maxY, Math.min(maxY, y)) };
  }, []);

  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    naturalSize.current = { w: img.naturalWidth, h: img.naturalHeight };
    // Smallest scale that still covers the guide circle, then a touch more so
    // there's room to move without exposing an edge.
    const s = Math.max(CROP_D / img.naturalWidth, CROP_D / img.naturalHeight);
    setMinScale(s);
    setScale(s * 1.1);
    setOffset({ x: 0, y: 0 });
    setImgReady(true);
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
      if (!blob) return;
      onCropped(new File([blob], 'photo.jpg', { type: 'image/jpeg' }), URL.createObjectURL(blob));
    }, 'image/jpeg', 0.9);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] bg-black flex flex-col"
    >
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0">
        <button type="button" onClick={onCancel} className="text-sm text-white/70 font-medium py-2 px-2 -mx-2">
          Cancel
        </button>
        <span className="text-sm font-semibold text-white">Move and scale</span>
        <button
          type="button"
          onClick={confirm}
          disabled={!imgReady || failed}
          className="text-sm text-white font-semibold py-2 px-2 -mx-2 disabled:opacity-40"
        >
          Use photo
        </button>
      </div>

      {failed ? (
        /* The photo genuinely can't be opened on this device — say so and
           offer the way out. Never a dead black screen. */
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8 text-center">
          <p className="text-base font-semibold text-white">We couldn't open that photo</p>
          <p className="text-sm text-white/60 leading-relaxed max-w-xs">
            The file may be in a format this browser can't read. Try picking a different photo, or take a fresh one with the camera.
          </p>
          <button
            type="button"
            onClick={onCancel}
            className="mt-2 h-11 rounded-full bg-white px-6 text-sm font-semibold text-black active:scale-[0.97] transition-transform"
          >
            Choose another photo
          </button>
        </div>
      ) : (
      <div
        ref={cropAreaRef}
        className="flex-1 relative overflow-hidden flex items-center justify-center select-none"
        style={{ touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {safeSrc && (
          <img
            ref={imgRef}
            src={safeSrc}
            alt="Crop your photo"
            draggable={false}
            onLoad={onImageLoad}
            onError={() => setFailed(true)}
            className="absolute pointer-events-none max-w-none"
            style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`, transformOrigin: 'center' }}
          />
        )}

        {/* Preparing beat — big phone photos take a moment to decode +
            downscale; a visible pulse means "working", never "crashed". */}
        {!imgReady && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-6 h-6 text-white/80 animate-spin" aria-hidden="true" />
            <p className="text-xs text-white/60">Preparing your photo…</p>
          </div>
        )}

        {/* Dimmed overlay with a circular framing hole */}
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
      </div>
      )}

      {!failed && (
      <div className="px-8 pb-8 pt-4 flex-shrink-0">
        <input
          type="range"
          min={minScale}
          max={minScale * 4}
          step={0.005}
          value={scale}
          disabled={!imgReady}
          onChange={e => {
            const s = parseFloat(e.target.value);
            setScale(s);
            setOffset(o => clampOffset(o.x, o.y, s));
          }}
          className="w-full accent-white disabled:opacity-40"
          aria-label="Zoom"
        />
        <p className="text-center text-xs text-white/50 mt-2">Drag to reposition · pinch or slide to zoom</p>
      </div>
      )}
    </motion.div>
  );
}
