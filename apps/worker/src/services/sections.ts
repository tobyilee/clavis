import {
  editSection,
  locateSection,
  parseSections,
  type Section,
  sectionText,
  updateFrontmatter,
} from '@clavis/shared/markdown';
import type { PageMetaPatch, SaveResult, UpdateSectionInput } from '@clavis/shared/schema';
import type { Actor } from './actors';
import { notFound, ServiceError } from './errors';
import { locatorWhere, parsePageRef } from './page-read';
import { updatePage } from './pages';

/**
 * Editing part of a page (D-48). The Worker reads the page, edits the Markdown and saves it
 * through the normal pipeline (lint, links, revision guard), so a section edit is exactly a
 * page save. When the caller did not pin a revision and someone saved in between, the edit is
 * applied once more to the newer text: the section hash still guards what the caller saw.
 */

/** What a section edit needs of the page. A full getPage also reads tags and ancestors. */
interface PageText {
  id: string;
  revision: number;
  content: string;
}

async function readText(DB: D1Database, ref: string): Promise<PageText> {
  const w = locatorWhere(parsePageRef(ref));
  const row = await DB.prepare(
    `SELECT p.id, p.revision, p.content FROM pages p JOIN spaces s ON s.id = p.space_id
     WHERE ${w.sql} LIMIT 1`,
  )
    .bind(...w.binds)
    .first<PageText>();
  if (!row) throw notFound('Page');
  return row;
}

function locate(page: PageText, ref: string): Section {
  const found = locateSection(page.content, ref);
  if ('section' in found) return found.section;
  const list = found.candidates.map((s) => `${'#'.repeat(s.level)} ${s.title} (id: ${s.id})`);
  throw found.error === 'ambiguous'
    ? new ServiceError(409, 'section-ambiguous', `Several sections are titled "${ref}"`, {
        detail: `Use the section id instead:\n${list.join('\n')}`,
      })
    : new ServiceError(404, 'section-not-found', `No section "${ref}" on this page`, {
        detail: list.length
          ? `Sections on the page:\n${list.join('\n')}`
          : 'The page has no headings.',
      });
}

export async function listSections(DB: D1Database, ref: string) {
  const page = await readText(DB, ref);
  return { revision: page.revision, sections: parseSections(page.content) };
}

export async function readSection(DB: D1Database, ref: string, section: string) {
  const page = await readText(DB, ref);
  const s = locate(page, section);
  return { revision: page.revision, section: s, content: sectionText(page.content, s) };
}

const isConflict = (e: unknown) => e instanceof ServiceError && e.slug === 'revision-conflict';

/** Reads, edits and saves; retries once on a lost race unless the caller pinned a revision. */
async function saveEdited(
  DB: D1Database,
  actor: Actor,
  ref: string,
  pinned: number | undefined,
  edit: (page: PageText) => string,
): Promise<SaveResult> {
  for (let attempt = 0; ; attempt++) {
    const page = await readText(DB, ref);
    if (pinned !== undefined && page.revision !== pinned) {
      throw new ServiceError(409, 'revision-conflict', 'The page was changed by someone else', {
        detail: `Current revision is ${page.revision}. Read the page again and reapply your change.`,
        revision: page.revision,
      });
    }
    const content = edit(page);
    try {
      return await updatePage(DB, actor, page.id, { content, baseRevision: page.revision });
    } catch (e) {
      if (isConflict(e) && pinned === undefined && attempt === 0) continue;
      throw e;
    }
  }
}

export function updateSection(
  DB: D1Database,
  actor: Actor,
  ref: string,
  section: string,
  input: UpdateSectionInput,
): Promise<SaveResult> {
  if (
    input.mode === 'replace' &&
    input.baseSectionHash === undefined &&
    input.baseRevision === undefined
  ) {
    // Replacing blind could erase what someone else just wrote there.
    throw new ServiceError(400, 'base-required', 'replace needs baseSectionHash or baseRevision', {
      detail: 'Read the section first and pass its hash as baseSectionHash.',
    });
  }
  return saveEdited(DB, actor, ref, input.baseRevision, (page) => {
    const s = locate(page, section);
    if (input.baseSectionHash !== undefined && s.hash !== input.baseSectionHash) {
      throw new ServiceError(409, 'section-conflict', 'The section was changed by someone else', {
        detail: `Its hash is now ${s.hash}. Read the section again and reapply your change.\n\n${sectionText(page.content, s)}`,
        revision: page.revision,
      });
    }
    return editSection(page.content, s, input.mode, input.content);
  });
}

export function patchPageMeta(
  DB: D1Database,
  actor: Actor,
  ref: string,
  { baseRevision, ...patch }: PageMetaPatch,
): Promise<SaveResult> {
  // Saved pages always have valid frontmatter (a blocking rule), so the edit applies.
  return saveEdited(DB, actor, ref, baseRevision, (page) => updateFrontmatter(page.content, patch));
}
