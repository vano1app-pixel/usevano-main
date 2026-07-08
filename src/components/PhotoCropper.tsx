import { useCallback, useRef, useState } from 'react';
import { motion } from 'framer-motion';

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
        setScale(s => Math.max(minScale, s * ratio));
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
        <button type="button" onClick={onCancel} className="text-sm text-white/70 font-medium">
          Cancel
        </button>
        <span className="text-sm font-semibold text-white">Move and scale</span>
        <button type="button" onClick={confirm} className="text-sm text-white font-semibold">
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
        <img
          ref={imgRef}
          src={src}
          alt="Crop your photo"
          draggable={false}
          onLoad={onImageLoad}
          className="absolute pointer-events-none max-w-none"
          style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`, transformOrigin: 'center' }}
        />

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

      <div className="px-8 pb-8 pt-4 flex-shrink-0">
        <input
          type="range"
          min={minScale}
          max={minScale * 4}
          step={0.005}
          value={scale}
          onChange={e => {
            const s = parseFloat(e.target.value);
            setScale(s);
            setOffset(o => clampOffset(o.x, o.y, s));
          }}
          className="w-full accent-white"
          aria-label="Zoom"
        />
        <p className="text-center text-xs text-white/50 mt-2">Drag to reposition · pinch or slide to zoom</p>
      </div>
    </motion.div>
  );
}
