import { Link } from '@tanstack/react-router';
import { Check, Languages, Pencil, Settings, User } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { LANGUAGES } from '@/i18n';
import { isApiError } from '@/lib/api';
import { useMe, useRenameMe } from '@/lib/me';

/** Mounted only while open, so each opening starts from the current name. */
function RenameDialog({ current, onClose }: { current: string; onClose: () => void }) {
  const { t } = useTranslation();
  const rename = useRenameMe();
  const [name, setName] = useState(current);
  const error = !rename.error
    ? null
    : isApiError(rename.error, 409)
      ? t('user.nameTaken')
      : isApiError(rename.error)
        ? (rename.error.problem.detail ?? rename.error.problem.title)
        : String(rename.error);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const next = name.trim();
            if (next === current) onClose();
            else if (next) rename.mutate(next, { onSuccess: onClose });
          }}
        >
          <DialogHeader>
            <DialogTitle>{t('user.renameTitle')}</DialogTitle>
            <DialogDescription>{t('user.renameHelp')}</DialogDescription>
          </DialogHeader>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label={t('user.name')}
            aria-invalid={error !== null}
            maxLength={64}
            autoFocus
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            <li>{t('user.renameMentionHint')}</li>
            <li>{t('user.renameOwnerHint')}</li>
          </ul>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('editor.cancel')}
            </Button>
            <Button type="submit" variant="primary" disabled={rename.isPending || !name.trim()}>
              {t('user.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Who is signed in, with the display name change (D-67). On phones the name is an icon. */
export function UserMenu() {
  const { t, i18n } = useTranslation();
  const { data } = useMe();
  const [renaming, setRenaming] = useState(false);
  if (!data) return null;
  return (
    <>
      {data.role === 'admin' && (
        <Link
          to="/admin"
          className="hidden text-xs text-muted-foreground hover:text-foreground sm:inline"
        >
          {t('admin.title')}
        </Link>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex max-w-40 shrink-0 items-center rounded-md p-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground sm:px-2"
            aria-label={t('user.menu')}
            title={data.email ?? ''}
          >
            <User className="size-4 sm:hidden" />
            <span className="hidden truncate sm:inline">{data.name}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="font-normal">
            <span className="block truncate text-sm font-medium text-foreground">{data.name}</span>
            {data.email && <span className="block truncate">{data.email}</span>}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {data.kind === 'human' && (
            <DropdownMenuItem onSelect={() => setRenaming(true)}>
              <Pencil /> {t('user.rename')}
            </DropdownMenuItem>
          )}
          {data.role === 'admin' && (
            <DropdownMenuItem asChild>
              <Link to="/admin">
                <Settings /> {t('admin.title')}
              </Link>
            </DropdownMenuItem>
          )}
          {/* The header's language toggle is hidden on phones. */}
          <DropdownMenuSeparator className="sm:hidden" />
          {LANGUAGES.map((lng) => (
            <DropdownMenuItem
              key={lng}
              className="sm:hidden"
              onSelect={() => void i18n.changeLanguage(lng)}
            >
              <Languages />
              <span className="flex-1">{t(`user.language.${lng}`)}</span>
              {i18n.resolvedLanguage === lng && <Check />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {renaming && <RenameDialog current={data.name} onClose={() => setRenaming(false)} />}
    </>
  );
}
