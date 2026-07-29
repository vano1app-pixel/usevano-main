/**
 * Off-DOM, fail-soft photo shrinking for the join form.
 *
 * The pre-July-8 join flow set the picked file directly and never broke; the
 * full-screen cropper added in #324 rendered huge photos in a transformed
 * layer and black-screened iPhone 16 Safari (48MP shots). The join form is
 * back on the direct-set flow, with this helper as an INVISIBLE optimisation:
 * shrink the photo before upload when we can, and when we can't — return
 * null and the caller uses the original file exactly like the old code did.
 * Nothing here may ever block or break a signup.
 *
 * The pipeline mirrors PhotoCropper's hardened one (probe <img> onload for
 * dimensions — deliberately NOT decode(), which Safari rejects for big
 * photos; createImageBitmap with decode-time resize so full-size pixels
 * never sit in memory; canvas fallback), but every failure exits with null
 * instead of an error state.
 */

const JOIN_MAX_EDGE = 2048;   // browser-safe ceiling, plenty for a 400px avatar
const STASH_MAX_EDGE = 400;   // draft-resume copy kept in localStorage (~50 KB)

export interface PreparedJoinPhoto {
  /** The file to upload — shrunk JPEG, or the original when already small. */
  file: File;
  /** Object/data URL for the on-page preview tile. */
  previewUrl: string;
  /** Small data URL for the draft stash, or null if it couldn't be made. */
  stashDataUrl: string | null;
}

export function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise(res => {
    try { canvas.toBlob(b => res(b), 'image/jpeg', quality); } catch { res(null); }
  });
}

export function drawScaled(source: CanvasImageSource, sw: number, sh: number, maxEdge: number): HTMLCanvasElement | null {
  try {
    const ratio = Math.min(1, maxEdge / Math.max(sw, sh));
    const canvas = document.createElement('canvas');
    canvas.width  = Math.max(1, Math.round(sw * ratio));
    canvas.height = Math.max(1, Math.round(sh * ratio));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas;
  } catch {
    return null;
  }
}

/** Never throws; null means "couldn't decode — use the original file as-is". */
export async function prepareJoinPhoto(file: File): Promise<PreparedJoinPhoto | null> {
  let objectUrl: string | null = null;
  let bitmap: ImageBitmap | null = null;
  try {
    objectUrl = URL.createObjectURL(file);

    // Measure with an off-DOM <img>: onload only needs the header — no full
    // decode, nothing mounted or painted.
    let probe: HTMLImageElement | null = new Image();
    probe.src = objectUrl;
    try {
      await new Promise<void>((res, rej) => {
        probe!.onload = () => res();
        probe!.onerror = () => rej(new Error('probe load failed'));
      });
    } catch {
      probe = null; // <img> can't read it; createImageBitmap may still manage
    }
    const w = probe?.naturalWidth ?? 0;
    const h = probe?.naturalHeight ?? 0;

    // Already browser-safe: keep the ORIGINAL file (old-flow behaviour), just
    // try to cut a small stash copy for the draft.
    if (probe && w && h && Math.max(w, h) <= JOIN_MAX_EDGE) {
      const stashCanvas = drawScaled(probe, w, h, STASH_MAX_EDGE);
      let stashDataUrl: string | null = null;
      try { stashDataUrl = stashCanvas?.toDataURL('image/jpeg', 0.85) ?? null; } catch { stashDataUrl = null; }
      return { file, previewUrl: objectUrl, stashDataUrl };
    }

    // Big (or <img>-unreadable): decode with downscale-at-decode where the
    // engine supports it, so the full-resolution pixels never exist.
    if (typeof createImageBitmap === 'function') {
      const blob: Blob | null = await fetch(objectUrl).then(r => r.blob()).catch(() => null);
      if (blob) {
        const opts: ImageBitmapOptions = { resizeQuality: 'high' };
        if (w && h) {
          const r = JOIN_MAX_EDGE / Math.max(w, h);
          opts.resizeWidth  = Math.max(1, Math.round(w * r));
          opts.resizeHeight = Math.max(1, Math.round(h * r));
        }
        bitmap = await createImageBitmap(blob, opts)
          .catch(() => createImageBitmap(blob))
          .catch(() => null);
      }
    }
    const source: CanvasImageSource | null = bitmap ?? probe;
    const sw = bitmap?.width  ?? w;
    const sh = bitmap?.height ?? h;
    if (!source || !sw || !sh) return null;

    const mainCanvas = drawScaled(source, sw, sh, JOIN_MAX_EDGE);
    bitmap?.close?.();
    bitmap = null;
    if (!mainCanvas) return null;
    const out = await canvasToBlob(mainCanvas, 0.92);
    if (!out) return null;

    const stashCanvas = drawScaled(mainCanvas, mainCanvas.width, mainCanvas.height, STASH_MAX_EDGE);
    let stashDataUrl: string | null = null;
    try { stashDataUrl = stashCanvas?.toDataURL('image/jpeg', 0.85) ?? null; } catch { stashDataUrl = null; }

    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
    return {
      file: new File([out], 'photo.jpg', { type: 'image/jpeg' }),
      previewUrl: URL.createObjectURL(out),
      stashDataUrl,
    };
  } catch {
    bitmap?.close?.();
    if (objectUrl) { try { URL.revokeObjectURL(objectUrl); } catch { /* noop */ } }
    return null;
  }
}
