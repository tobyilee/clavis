import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Navigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Notice } from '@/components/notice';
import { isApiError } from '@/lib/api';
import { spaceQuery } from '@/lib/queries';

export const Route = createFileRoute('/s/$key/')({ component: SpaceHome });

/** A space opens on its home page (D-35). */
function SpaceHome() {
  const { t } = useTranslation();
  const { key } = Route.useParams();
  const space = useQuery(spaceQuery(key));
  if (space.isError) {
    return <Notice title={isApiError(space.error, 404) ? t('space.notFound') : t('error.load')} />;
  }
  if (!space.data) return null;
  if (!space.data.homePageShortId)
    return <Notice title={space.data.name} body={t('space.noHome')} />;
  return (
    <Navigate
      to="/s/$key/p/$slugId"
      params={{ key: space.data.key, slugId: space.data.homePageShortId }}
      replace
    />
  );
}
