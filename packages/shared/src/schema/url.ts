/** Page URL helpers (D-08, D-22): /s/{KEY}/p/{slug}-{shortId}, with Korean kept in the slug. */

export const SHORT_ID_RE = /^[0-9a-z]{6}$/;

export function slugify(title: string): string {
  return title
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
}

export function pageSlugId(slug: string, shortId: string): string {
  return slug ? `${slug}-${shortId}` : shortId;
}

/** Extracts the short id from "slug-shortId" (the slug is decoration, D-08). */
export function parseSlugId(slugId: string): string | null {
  const shortId = slugId.slice(-6);
  if (!SHORT_ID_RE.test(shortId)) return null;
  return slugId.length === 6 || slugId[slugId.length - 7] === '-' ? shortId : null;
}
