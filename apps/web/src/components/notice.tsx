import type { ReactNode } from 'react';

export function Notice({
  icon,
  title,
  body,
  children,
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  children?: ReactNode;
}) {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-lg border p-6 text-center">
      {icon && (
        <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-muted">
          {icon}
        </div>
      )}
      <h1 className="text-lg font-semibold">{title}</h1>
      {body && <p className="mt-2 text-sm text-muted-foreground">{body}</p>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
