import type { Page } from '@clavis/shared/schema';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Navigate } from '@tanstack/react-router';
import { FileQuestion } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Notice } from '@/components/notice';
import { apiGet, isApiError } from '@/lib/api';
import { pageParams } from '@/lib/urls';

export const Route = createFileRoute('/s/$key/w/$title')({ component: WikiLinkTarget });

/** Resolves a [[wiki link]] by title and redirects to the page's canonical URL. */
function WikiLinkTarget() {
  const { t } = useTranslation();
  const { key, title } = Route.useParams();
  const page = useQuery({
    queryKey: ['by-title', key.toUpperCase(), title],
    queryFn: () =>
      apiGet<Page>(
        `/pages/by-title?space=${encodeURIComponent(key)}&title=${encodeURIComponent(title)}`,
      ),
    retry: false,
  });
  if (page.data) return <Navigate to="/s/$key/p/$slugId" params={pageParams(page.data)} replace />;
  if (page.isError) {
    return (
      <Notice
        icon={<FileQuestion className="size-5" />}
        title={isApiError(page.error, 404) ? t('page.missingTitle', { title }) : t('error.load')}
        body={
          isApiError(page.error, 404)
            ? t('page.missingBody', { key: key.toUpperCase() })
            : undefined
        }
      />
    );
  }
  return null;
}
