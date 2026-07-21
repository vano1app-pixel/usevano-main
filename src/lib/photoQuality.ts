/**
 * Off-DOM, fail-soft profile-photo quality checks (owner call, July 2026:
 * "good pics only" — helper photos are the trust surface of the homepage).
 *
 * Philosophy matches safeImage.ts exactly: NOTHING here may ever block a
 * signup or a photo change by accident. Measurement failure (undecodable
 * file, canvas quota, weird browser) returns null and the caller proceeds
 * as if the photo were fine — only a photo we POSITIVELY measured as junk
 * is rejected, and borderline shots only get a gentle warning while still
 * being accepted.
 *
 * Two tiers:
 *   verdict 'reject'  — never a usable face photo: microscopic dimensions
 *                       or a flat/blank frame (solid wall, black frame,
 *                       accidental pocket shot). Caller shows the message
 *                       and keeps the picker open.
 *   verdict 'warn'    — usable but poor (very dark, blown-out, blurry).
 *                       Caller stages the photo anyway and shows the note;
 *                       the helper can keep it or pick a better one.
 */

export interface PhotoQualityResult {
  verdict: 'ok' | 'warn' | 'reject';
  /** Friendly, ready-to-render message. Empty string when verdict is 'ok'. */
  message: string;
}

// Reject thresholds — only unambiguous junk.
const MIN_EDGE_PX = 200;        // smaller than this can't render as an avatar
const BLANK_STDDEV = 6;         // luminance spread of a flat/solid frame

// Warn thresholds — deliberately conservative.
const DARK_MEAN = 40;           // 0-255; night-pocket territory
const BLOWN_MEAN = 228;         // near-white AND flat = washed out
const BLOWN_STDDEV = 26;
// Sharpness = laplacian variance normalised by contrast (stddev²), measured
// on a 512px sample — normalising stops dark-but-sharp photos reading as
// blurry, and 512px keeps source-resolution blur visible (at 96px a 14px
// blur disappears into the downscale). Calibrated 2026-07-21 in Chromium,
// JPEG round-tripped: sharp scene 0.041 · real-ish noisy photo 0.123 ·
// dark-but-sharp 0.265 — versus blur(4px) 0.0012 · blur(8px) 0.0004.
// 0.005 flags only genuine mush, ~8× below the cleanest sharp measurement.
const BLUR_SHARPNESS = 0.005;

const SAMPLE_EDGE = 512;

/** Never throws; null = "couldn't measure, treat as fine" (fail-soft). */
export async function assessPhotoQuality(file: File): Promise<PhotoQualityResult | null> {
  let objectUrl: string | null = null;
  try {
    objectUrl = URL.createObjectURL(file);

    // Probe with an off-DOM <img> — onload needs only the header, no full
    // decode, nothing mounted (same pattern as safeImage.ts; decode() is
    // deliberately avoided — Safari rejects it for big photos).
    const probe = new Image();
    probe.src = objectUrl;
    await new Promise<void>((res, rej) => {
      probe.onload = () => res();
      probe.onerror = () => rej(new Error('probe failed'));
    });
    const w = probe.naturalWidth, h = probe.naturalHeight;
    if (!w || !h) return null;

    if (Math.min(w, h) < MIN_EDGE_PX) {
      return {
        verdict: 'reject',
        message: 'That photo is too small to use — please choose a bigger, clearer one.',
      };
    }

    // Tiny grayscale sample for the light/sharpness stats. Drawing at 96px
    // decodes scaled-down in modern browsers — full-size pixels never sit in
    // memory (the iOS Safari lesson).
    const ratio = Math.min(SAMPLE_EDGE / w, SAMPLE_EDGE / h, 1);
    const sw = Math.max(8, Math.round(w * ratio));
    const sh = Math.max(8, Math.round(h * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = sw; canvas.height = sh;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(probe, 0, 0, sw, sh);
    const { data } = ctx.getImageData(0, 0, sw, sh);

    const n = sw * sh;
    const lum = new Float32Array(n);
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const l = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
      lum[i] = l; sum += l;
    }
    const mean = sum / n;
    let varSum = 0;
    for (let i = 0; i < n; i++) { const d = lum[i] - mean; varSum += d * d; }
    const stddev = Math.sqrt(varSum / n);

    if (stddev < BLANK_STDDEV) {
      return {
        verdict: 'reject',
        message: 'That image looks blank — please choose a clear photo of you.',
      };
    }

    // Sharpness: variance of the 3x3 Laplacian over the interior pixels.
    let lapSum = 0, lapSqSum = 0; const m = (sw - 2) * (sh - 2);
    for (let y = 1; y < sh - 1; y++) {
      for (let x = 1; x < sw - 1; x++) {
        const i = y * sw + x;
        const v = 4 * lum[i] - lum[i - 1] - lum[i + 1] - lum[i - sw] - lum[i + sw];
        lapSum += v; lapSqSum += v * v;
      }
    }
    const lapMean = lapSum / m;
    const lapVar = lapSqSum / m - lapMean * lapMean;
    const sharpness = lapVar / Math.max(stddev * stddev, 1);

    const problems: string[] = [];
    if (mean < DARK_MEAN) problems.push('quite dark');
    else if (mean > BLOWN_MEAN && stddev < BLOWN_STDDEV) problems.push('washed out');
    if (sharpness < BLUR_SHARPNESS) problems.push('a bit blurry');

    if (problems.length > 0) {
      return {
        verdict: 'warn',
        message: `This photo looks ${problems.join(' and ')} — a bright, clear face photo gets you chosen more. You can keep it or pick another.`,
      };
    }
    return { verdict: 'ok', message: '' };
  } catch {
    return null; // fail-soft: never let the checker itself cost a signup
  } finally {
    if (objectUrl) { try { URL.revokeObjectURL(objectUrl); } catch { /* noop */ } }
  }
}
