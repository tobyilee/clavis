import { Clock, LogIn } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '@/lib/api';
import { useMe } from '@/lib/me';

function Notice({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-lg border p-6 text-center">
      <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-muted">
        {icon}
      </div>
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

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
  if (me.data?.role === 'pending') {
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
