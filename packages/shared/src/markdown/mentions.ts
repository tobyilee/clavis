/**
 * @mentions in comments (Phase 3 N3). The stored form names the person by id, so a
 * rename does not break it: `@[Adam](actor:01J…)`. A plain `@Adam` (no spaces in the name)
 * also counts; it is resolved by name when the comment is posted.
 */

const MARKUP_RE = /@\[([^\]\n]{1,64})\]\(actor:([0-9A-Za-z]{10,40})\)/g;
// A plain mention: not part of an email address or a word, name without spaces.
const PLAIN_RE = /(^|[^\p{L}\p{N}._@-])@([\p{L}\p{N}][\p{L}\p{N}._-]{0,63})/gu;

export const mentionMarkup = (name: string, id: string) =>
  `@[${name.replace(/[\]\n]/g, '')}](actor:${id})`;

export interface Mentions {
  /** Actor ids from @[name](actor:id). */
  ids: string[];
  /** Lowercased names from plain @name, to be resolved against actors. */
  names: string[];
}

export function extractMentions(body: string): Mentions {
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const m of body.matchAll(MARKUP_RE)) if (m[2]) ids.add(m[2]);
  // Plain ones outside the markup (whose "@[" never matches the plain pattern anyway).
  for (const m of body.replace(MARKUP_RE, ' ').matchAll(PLAIN_RE)) {
    const name = m[2]?.replace(/[._-]+$/, '');
    if (name) names.add(name.toLowerCase());
  }
  return { ids: [...ids], names: [...names] };
}

/**
 * For display: turns the stored form into a Markdown link the renderer keeps
 * (`[@Adam](#mention-01J…)`), which the stylesheet shows as a chip.
 */
export const renderMentions = (body: string) =>
  body.replace(MARKUP_RE, (_, name: string, id: string) => `[@${name}](#mention-${id})`);
