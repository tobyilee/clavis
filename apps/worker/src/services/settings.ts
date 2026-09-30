import { eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { settings } from '../db/schema';

/** Shown next to "Clavis" in the header and the browser tab (D-64). */
export const SITE_TITLE = 'site.title';

export async function getSetting(d: Db, key: string): Promise<string | null> {
  const row = await d.query.settings.findFirst({ where: eq(settings.key, key) });
  return row?.value ?? null;
}

/** Stores a setting; an empty value removes the row, so the default applies again. */
export async function putSetting(
  d: Db,
  key: string,
  value: string,
  actorId: string,
  now: number,
): Promise<string | null> {
  if (!value) {
    await d.delete(settings).where(eq(settings.key, key));
    return null;
  }
  const row = { value, updatedBy: actorId, updatedAt: now };
  await d
    .insert(settings)
    .values({ key, ...row })
    .onConflictDoUpdate({ target: settings.key, set: row });
  return value;
}
