import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { apiGet } from '@/lib/api';

interface Health {
  status: 'ok';
  version: string;
  db: 'ok' | 'error';
}

export const Route = createFileRoute('/')({ component: Home });

function Home() {
  const { t } = useTranslation();
  const health = useQuery({ queryKey: ['health'], queryFn: () => apiGet<Health>('/health') });
  const ok = health.data?.status === 'ok' && health.data.db === 'ok';

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold">{t('home.title')}</h1>
      <p className="mt-4 text-muted-foreground">{t('home.empty')}</p>
      <p className="mt-8 flex items-center gap-2 text-sm">
        <span className={`size-2 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500'}`} />
        {t('home.serverStatus')}:{' '}
        {health.isPending ? '…' : ok ? t('home.serverOk') : t('home.serverDown')}
        {health.data && <span className="text-muted-foreground">v{health.data.version}</span>}
      </p>
    </div>
  );
}
