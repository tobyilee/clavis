import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/s/$key/trash')({ component: Trash });

// Filled in by Step 5 (F4).
function Trash() {
  const { t } = useTranslation();
  return <h1 className="text-2xl font-bold">{t('app.trash')}</h1>;
}
