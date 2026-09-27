import type { Template } from '@clavis/shared/schema';
import { queryOptions } from '@tanstack/react-query';
import { apiGet } from './api';

/** Custom templates of the space and of every space first, then the built-in ones (D-49). */
export const templatesQuery = (spaceKey: string, locale: 'ko' | 'en') =>
  queryOptions({
    queryKey: ['templates', spaceKey.toUpperCase(), locale],
    queryFn: () =>
      apiGet<{ templates: Template[] }>(
        `/templates?space=${encodeURIComponent(spaceKey)}&locale=${locale}`,
      ).then((r) => r.templates),
  });
