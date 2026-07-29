import { useEffect, useState } from 'react';
import { canvasToBlob, drawScaled } from './safeImage';

/**
 * Display-side twin of prepareJoinPhoto (safeImage.ts) — the other half of
 * the "never render a user image unbounded" rule.
 *
 * Stored helper/job photos can be full-resolution phone shots (a 12MP+
 * decode behind a 32px avatar), and iOS WebKit under memory pressure fails
 * the composited layer and paints it SOLID BLACK — owner repro 2026-07-29:
 * the homepage face pile rendered as one black rectangle. So no customer
 * surface hands a storage URL straight to <img> any more: fetch → probe
 * dimensions off-DOM (onload, never decode()) → if the image is bigger than
 * the surface needs, decode WITH downscale-at-decode and hand the compositor
 * a small JPEG object URL instead.
 *
 * FAIL-SOFT like everything in this family: any failure returns the
 * original URL, so behaviour is never worse than it was. Results are
 * memoised per (url, size) for the page session.
 */

// Skip the re-encode when the photo is already close to the target — a
// 400px avatar rendered at 40px is harmless; only real decode weight is.
const SLACK = 1.6;

const cache = new Map<string, Promise<string>>();

async function shrink(url: string, maxEdge: number): Promise<string> {
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) return url;
  const blob = await res.blob();

  let objectUrl: string | null = null;
  let bitmap: ImageBitmap | null = null;
  try {
    objectUrl = URL.createObjectURL(blob);

    // Header-only measure with an off-DOM <img> — same probe as
    // prepareJoinPhoto: onload never needs a full decode, nothing paints.
    let probe: HTMLImageElement | null = new Image();
    probe.src = objectUrl;
    try {
      await new Promise<void>((ok, rej) => {
        probe!.onload = () => ok();
        probe!.onerror = () => rej(new Error('probe load failed'));
      });
    } catch {
      probe = null;
    }
    const w = probe?.naturalWidth ?? 0;
    const h = probe?.naturalHeight ?? 0;

    // Already surface-sized: the original URL is safe as-is (and keeps the
    // browser's HTTP cache doing the work).
    if (probe && w && h && Math.max(w, h) <= maxEdge * SLACK) return url;

    if (typeof createImageBitmap === 'function') {
      const opts: ImageBitmapOptions = { resizeQuality: 'medium' };
      if (w && h && Math.max(w, h) > maxEdge) {
        const r = maxEdge / Math.max(w, h);
        opts.resizeWidth = Math.max(1, Math.round(w * r));
        opts.resizeHeight = Math.max(1, Math.round(h * r));
      }
      bitmap = await createImageBitmap(blob, opts)
        .catch(() => createImageBitmap(blob))
        .catch(() => null);
    }
    const source: CanvasImageSource | null = bitmap ?? probe;
    const sw = bitmap?.width ?? w;
    const sh = bitmap?.height ?? h;
    if (!source || !sw || !sh) return url;

    const canvas = drawScaled(source, sw, sh, maxEdge);
    bitmap?.close?.();
    bitmap = null;
    if (!canvas) return url;
    const out = await canvasToBlob(canvas, 0.85);
    if (!out) return url;
    return URL.createObjectURL(out);
  } catch {
    bitmap?.close?.();
    return url;
  } finally {
    if (objectUrl) { try { URL.revokeObjectURL(objectUrl); } catch { /* noop */ } }
  }
}

/** Never rejects; null in = null out, otherwise always a renderable URL. */
export function boundedPhotoUrl(url: string | null | undefined, maxEdge = 256): Promise<string | null> {
  if (!url) return Promise.resolve(null);
  const key = `${maxEdge}|${url}`;
  let p = cache.get(key);
  if (!p) {
    p = shrink(url, maxEdge).catch(() => url);
    cache.set(key, p);
  }
  return p;
}

/** Hook form: null while resolving (render the placeholder), then the safe URL. */
export function useBoundedPhoto(url: string | null | undefined, maxEdge = 256): string | null {
  const [out, setOut] = useState<string | null>(null);
  useEffect(() => {
    let on = true;
    setOut(null);
    if (!url) return;
    boundedPhotoUrl(url, maxEdge).then(u => { if (on) setOut(u); });
    return () => { on = false; };
  }, [url, maxEdge]);
  return out;
}
