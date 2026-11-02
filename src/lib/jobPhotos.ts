import { supabase } from '@/integrations/supabase/client';

// Before/after job photos — client half.
//
// The helper's job screen calls uploadJobPhoto() at the arrival ("before")
// and finish ("after") moments. Photos are resized in the browser to keep
// uploads fast on mobile data, then posted as multipart form-data to the
// job-photo edge function (which verifies the caller is the assigned helper
// and stamps the URL on the booking).
//
// FAIL-SOFT CONTRACT: this module never throws — a photo that won't upload
// must never block the job flow. Callers get the URL on success, null on any
// failure, and decide how gently to mention it.

const MAX_DIM = 1600;
const JPEG_QUALITY = 0.82;

/** Downscale to ≤1600px on the long edge and re-encode as JPEG. Uses
 *  img+canvas (not createImageBitmap) for the widest WKWebView support.
 *  Falls back to the original file if anything about decoding fails. */
async function resizeForUpload(file: File): Promise<Blob> {
  try {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('decode failed'));
        el.src = url;
      });
      const scale = Math.min(1, MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight));
      // Already small enough and already a JPEG — send as-is.
      if (scale === 1 && file.type === 'image/jpeg') return file;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) return file;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
      );
      return blob ?? file;
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return file;
  }
}

/** Upload a job photo. Returns the public URL on success, null on failure. */
export async function uploadJobPhoto(
  bookingId: string,
  kind: 'arrival' | 'finish',
  file: File,
): Promise<string | null> {
  try {
    const blob = await resizeForUpload(file);
    const form = new FormData();
    form.append('booking_id', bookingId);
    form.append('kind', kind);
    form.append('photo', new File([blob], `${kind}.jpg`, { type: blob.type || 'image/jpeg' }));
    const { data, error } = await supabase.functions.invoke<{ url?: string }>('job-photo', { body: form });
    if (error || !data?.url) return null;
    return data.url;
  } catch {
    return null;
  }
}

/** The BUYER's optional photo of the job, attached right after posting. No
 *  session — the booking id is the capability (see job-photo kind='customer').
 *  Same fail-soft contract: null on any failure, never throws. */
export async function uploadCustomerPhoto(bookingId: string, file: File): Promise<string | null> {
  try {
    const blob = await resizeForUpload(file);
    const form = new FormData();
    form.append('booking_id', bookingId);
    form.append('kind', 'customer');
    form.append('photo', new File([blob], 'customer.jpg', { type: blob.type || 'image/jpeg' }));
    const { data, error } = await supabase.functions.invoke<{ url?: string }>('job-photo', { body: form });
    if (error || !data?.url) return null;
    return data.url;
  } catch {
    return null;
  }
}
