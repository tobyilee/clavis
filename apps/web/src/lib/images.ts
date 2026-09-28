/** Photos go up with at most this long edge (K2); screenshots and drawings keep every pixel. */
export const PHOTO_MAX_EDGE = 2000;

const PHOTO_TYPES = new Set(['image/jpeg', 'image/heic', 'image/heif']);
// Only Safari shows HEIC, so iPhone photos become JPEG even when small.
const CONVERT_TYPES = new Set(['image/heic', 'image/heif']);

/** The size to redraw a photo at, or null when the file can go up as it is. */
export function photoTarget(
  type: string,
  width: number,
  height: number,
  maxEdge = PHOTO_MAX_EDGE,
): { width: number; height: number } | null {
  if (!PHOTO_TYPES.has(type) || width <= 0 || height <= 0) return null;
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  if (scale === 1 && !CONVERT_TYPES.has(type)) return null;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/**
 * Shrinks a big phone photo to a JPEG before upload: a 12MP picture is 3–5MB, and pages show
 * it far smaller. Anything else, or an image this browser can't decode, goes up unchanged.
 */
export async function shrinkPhoto(file: File): Promise<File> {
  if (!PHOTO_TYPES.has(file.type) || typeof createImageBitmap !== 'function') return file;
  try {
    // from-image applies the EXIF rotation; the JPEG written below has none left to apply.
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const target = photoTarget(file.type, bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    const ctx = target && canvas.getContext('2d');
    if (!target || !ctx) {
      bitmap.close();
      return file;
    }
    canvas.width = target.width;
    canvas.height = target.height;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, target.width, target.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.85),
    );
    if (!blob) return file;
    const stem = file.name.replace(/\.[^.]*$/, '') || 'photo';
    return new File([blob], `${stem}.jpg`, { type: 'image/jpeg', lastModified: file.lastModified });
  } catch {
    return file;
  }
}
