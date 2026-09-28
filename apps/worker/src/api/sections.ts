import {
  PageMetaPatchSchema,
  SectionListSchema,
  SectionReadSchema,
  UpdateSectionSchema,
} from '@clavis/shared/schema';
import { createRoute, z } from '@hono/zod-openapi';
import { requireRole } from '../auth/middleware';
import { emitFor } from '../events';
import { listSections, patchPageMeta, readSection, updateSection } from '../services/sections';
import { problemResponse } from './problem';
import { router } from './router';
import { json, PageRefParam, SaveResult } from './schemas';

export const sections = router();
const tags = ['sections'];
const security = [{ bearer: [] }];

const SectionList = SectionListSchema.openapi('SectionList');
const SectionRead = SectionReadSchema.openapi('SectionRead');
const SectionParam = PageRefParam.extend({
  section: z.string().openapi({
    param: { name: 'section', in: 'path' },
    description: 'Section id (the heading anchor) or heading text, URL-encoded',
    example: '액션-아이템',
  }),
});

const editErrors = {
  404: problemResponse('Page or section not found (the detail lists the sections)'),
  409: problemResponse(
    'Section changed since it was read (`section-conflict`), page revision changed, title ambiguous, or space archived',
  ),
  413: problemResponse('Resulting page over 100KB (D-33)'),
  422: problemResponse('Lint errors in the resulting page; nothing was saved'),
};

sections.openapi(
  createRoute({
    method: 'get',
    path: '/pages/{ref}/sections',
    tags,
    security,
    summary: "List a page's sections (headings) with their ids, lines and hashes",
    middleware: [requireRole('viewer')],
    request: { params: PageRefParam },
    responses: { 200: json(SectionList, 'Sections in order'), 404: problemResponse('Not found') },
  }),
  async (c) => c.json(await listSections(c.env.DB, c.req.valid('param').ref), 200),
);

sections.openapi(
  createRoute({
    method: 'get',
    path: '/pages/{ref}/sections/{section}',
    tags,
    security,
    summary: 'Read one section (heading and everything under it)',
    middleware: [requireRole('viewer')],
    request: { params: SectionParam },
    responses: { 200: json(SectionRead, 'The section'), 404: problemResponse('Not found') },
  }),
  async (c) => {
    const { ref, section } = c.req.valid('param');
    return c.json(await readSection(c.env.DB, ref, section), 200);
  },
);

sections.openapi(
  createRoute({
    method: 'put',
    path: '/pages/{ref}/sections/{section}',
    tags,
    security,
    summary: 'Replace or append to one section',
    description:
      '`replace` needs `baseSectionHash` (fails only if this section changed; D-48) or `baseRevision` (fails if anything changed). `append` needs neither. The whole page is then saved as usual: lint, links and the response are those of PUT /pages/{ref}.',
    middleware: [requireRole('editor')],
    request: {
      params: SectionParam,
      body: { content: { 'application/json': { schema: UpdateSectionSchema } } },
    },
    responses: { 200: json(SaveResult, 'Saved'), 400: problemResponse('Invalid'), ...editErrors },
  }),
  async (c) => {
    const { ref, section } = c.req.valid('param');
    return c.json(
      await updateSection(c.env.DB, c.get('actor'), ref, section, c.req.valid('json'), emitFor(c)),
      200,
    );
  },
);

sections.openapi(
  createRoute({
    method: 'patch',
    path: '/pages/{ref}/meta',
    tags,
    security,
    summary: 'Set status, owner or tags without sending the page',
    description:
      'Edits the frontmatter in place (comments and other keys are kept) and saves. Without `baseRevision` it applies to the current page.',
    middleware: [requireRole('editor')],
    request: {
      params: PageRefParam,
      body: { content: { 'application/json': { schema: PageMetaPatchSchema } } },
    },
    responses: { 200: json(SaveResult, 'Saved'), 400: problemResponse('Invalid'), ...editErrors },
  }),
  async (c) =>
    c.json(
      await patchPageMeta(
        c.env.DB,
        c.get('actor'),
        c.req.valid('param').ref,
        c.req.valid('json'),
        emitFor(c),
      ),
      200,
    ),
);
