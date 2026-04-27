/** Allowed image MIME types for uploads.
 *
 * SVG is intentionally NOT in this set. SVG files can contain inline
 * <script> tags that execute when the file is opened directly in a
 * browser (e.g. via the public storage URL). Allowing SVG uploads on
 * a public-read bucket is a stored-XSS vector. Stick to raster formats. */
const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

/**
 * Validate a file is a safe image before uploading.
 * Returns an error string if invalid, or null if OK.
 */
export function validateImageFile(file: File, maxMB = 5): string | null {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return `Invalid file type (${file.type || 'unknown'}). Allowed: JPEG, PNG, WebP, GIF.`;
  }
  if (file.size > maxMB * 1024 * 1024) {
    return `File too large. Max ${maxMB}MB.`;
  }
  return null;
}

/**
 * Generate a safe, unique filename for storage uploads.
 * Uses crypto.randomUUID() instead of Math.random().
 */
export function safeFileName(userId: string, originalName: string): string {
  const ext = originalName.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  return `${userId}/${crypto.randomUUID()}.${ext}`;
}
