import { Clock, LogIn, Timer } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '@/lib/api';
import { useMe } from '@/lib/me';
import { Notice } from './notice';
import { Button } from './ui/button';

/** Shows the wiki only to approved people; pending accounts wait for an admin (D-29). */
export function AuthGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const me = useMe();

  if (me.isPending) return null;
  if (me.error instanceof ApiError && me.error.problem.status === 401) {
    return (
      <Notice
        icon={<LogIn className="size-5" />}
        title={t('auth.signedOutTitle')}
        body={t('auth.signedOutBody')}
      />
    );
  }
  if (!me.data) {
    // 429 (too many requests) or an outage: say so, instead of a page with no user.
    const limited = me.error instanceof ApiError && me.error.problem.status === 429;
    return (
      <Notice
        icon={limited ? <Timer className="size-5" /> : undefined}
        title={t(limited ? 'auth.rateLimitedTitle' : 'error.load')}
        body={limited ? t('auth.rateLimitedBody') : undefined}
      >
        <Button size="sm" variant="outline" onClick={() => void me.refetch()}>
          {t('auth.retry')}
        </Button>
      </Notice>
    );
  }
  if (me.data.role === 'pending') {
    return (
      <Notice
        icon={<Clock className="size-5" />}
        title={t('auth.pendingTitle')}
        body={t('auth.pendingBody', { email: me.data.email })}
      />
    );
  }
  return <>{children}</>;
}
