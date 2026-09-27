import { pageSlugId } from '@clavis/shared/schema';

/** Router params for a page view: /s/$key/p/$slugId (D-08). */
export const pageParams = (p: { spaceKey: string; slug: string; shortId: string }) => ({
  key: p.spaceKey,
  slugId: pageSlugId(p.slug, p.shortId),
});

export const pagePath = (p: { spaceKey: string; slug: string; shortId: string }) =>
  `/s/${p.spaceKey}/p/${pageSlugId(p.slug, p.shortId)}`;
