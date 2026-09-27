import { cn } from 'cn';
import type * as React from 'react';

function Input({ className, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      data-slot="input"
      className={cn(
        'h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50 md:text-sm',
        className,
      )}
      {...props}
    />
  );
}

function Select({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'h-9 rounded-md border bg-background px-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring/50 md:text-sm',
        className,
      )}
      {...props}
    />
  );
}

export { Input, Select };
