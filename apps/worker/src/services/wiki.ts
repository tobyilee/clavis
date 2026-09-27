import { and, asc, eq, isNull } from 'drizzle-orm';
import type { Db } from '../db/client';
import { pages, spaces } from '../db/schema';

export interface TreeNode {
  shortId: string;
  title: string;
  docType: string;
  status: string;
  children: TreeNode[];
}

export async function listSpaces(d: Db) {
  return d
    .select({ key: spaces.key, name: spaces.name, description: spaces.description })
    .from(spaces)
    .where(isNull(spaces.archivedAt))
    .orderBy(asc(spaces.key));
}

/** The whole page tree of a space in one query, assembled in memory. */
export async function spaceTree(d: Db, spaceKey: string): Promise<TreeNode[] | null> {
  const space = await d.query.spaces.findFirst({ where: eq(spaces.key, spaceKey.toUpperCase()) });
  if (!space) return null;
  const rows = await d
    .select({
      id: pages.id,
      parentId: pages.parentId,
      shortId: pages.shortId,
      title: pages.title,
      docType: pages.docType,
      status: pages.status,
    })
    .from(pages)
    .where(and(eq(pages.spaceId, space.id), isNull(pages.deletedAt)))
    .orderBy(asc(pages.position));

  const nodes = new Map(rows.map((r) => [r.id, { ...r, children: [] as TreeNode[] }]));
  const roots: TreeNode[] = [];
  for (const r of rows) {
    const node = nodes.get(r.id);
    if (!node) continue;
    const parent = r.parentId ? nodes.get(r.parentId) : undefined;
    (parent ? parent.children : roots).push(node);
  }
  const strip = (n: TreeNode & { id?: string; parentId?: string | null }): TreeNode => ({
    shortId: n.shortId,
    title: n.title,
    docType: n.docType,
    status: n.status,
    children: n.children.map(strip),
  });
  return roots.map(strip);
}

/** Finds a live page by short id ("a1b2c3") or by "SPACEKEY:Title". */
export async function findPage(d: Db, ref: string) {
  const prefixed = /^([A-Z][A-Z0-9]{1,9}):(.+)$/.exec(ref.trim());
  const base = d
    .select({
      shortId: pages.shortId,
      title: pages.title,
      content: pages.content,
      revision: pages.revision,
      updatedAt: pages.updatedAt,
      updatedBy: pages.updatedBy,
      spaceKey: spaces.key,
    })
    .from(pages)
    .innerJoin(spaces, eq(pages.spaceId, spaces.id));
  const where = prefixed
    ? and(
        eq(spaces.key, prefixed[1] ?? ''),
        eq(pages.title, (prefixed[2] ?? '').trim()),
        isNull(pages.deletedAt),
      )
    : and(eq(pages.shortId, ref.trim()), isNull(pages.deletedAt));
  return (await base.where(where).limit(1).get()) ?? null;
}
