import { parseSlugId } from '@clavis/shared/schema';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Notice } from '@/components/notice';
import { PageEditor } from '@/editor/page-editor';
import { isApiError } from '@/lib/api';
import { useAttachments } from '@/lib/attachments';
import { useCanEdit } from '@/lib/me';
import { pageQuery } from '@/lib/queries';

export const Route = createFileRoute('/s/$key/p/$slugId_/edit')({ component: EditPage });

function EditPage() {
  const { t } = useTranslation();
  const { slugId } = Route.useParams();
  const shortId = parseSlugId(slugId) ?? '';
  // Always start from the server's latest revision, not a cached copy.
  const page = useQuery({
    ...pageQuery(shortId),
    enabled: !!shortId,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
  const canEdit = useCanEdit();
  const attachments = useAttachments(page.data?.id ?? null);

  if (isApiError(page.error, 404) || !shortId) return <Notice title={t('page.notFound')} />;
  if (page.isError) return <Notice title={t('error.load')} />;
  if (!page.data || page.isFetching) return null;
  if (!canEdit) return <Notice title={t('editor.readOnly')} />;
  // Keyed by page so switching pages starts a fresh editor.
  return <PageEditor key={page.data.id} page={page.data} attachments={attachments} />;
}
