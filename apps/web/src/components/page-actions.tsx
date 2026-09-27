import type { Page, TreeNode } from '@clavis/shared/schema';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { FilePlus, FolderInput, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select } from '@/components/ui/input';
import { apiSend, isApiError } from '@/lib/api';
import { useCanEdit } from '@/lib/me';
import { treeQuery } from '@/lib/queries';
import { pageParams } from '@/lib/urls';

/** Flattens the tree for a parent picker, leaving out `exclude` and everything under it. */
function parentOptions(
  nodes: TreeNode[],
  exclude: string,
  depth = 0,
): { node: TreeNode; depth: number }[] {
  return nodes.flatMap((n) =>
    n.id === exclude ? [] : [{ node: n, depth }, ...parentOptions(n.children, exclude, depth + 1)],
  );
}

export function PageActions({ page, isHome }: { page: Page; isHome: boolean }) {
  const { t } = useTranslation();
  const canEdit = useCanEdit();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<'move' | 'delete' | null>(null);
  const [parent, setParent] = useState<string>(page.parentId ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const tree = useQuery({ ...treeQuery(queryClient, page.spaceKey), enabled: dialog === 'move' });

  if (!canEdit) return null;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['tree', page.spaceKey] });
    void queryClient.invalidateQueries({ queryKey: ['page'] });
  };

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      setDialog(null);
    } catch (e) {
      setError(isApiError(e) ? (e.problem.detail ?? e.problem.title) : t('editor.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const move = () =>
    run(async () => {
      await apiSend('POST', `/pages/${page.id}/move`, { parent: parent || null });
      refresh();
    });

  const remove = () =>
    run(async () => {
      await apiSend('DELETE', `/pages/${page.id}`);
      refresh();
      const up = page.ancestors.at(-1);
      await navigate(
        up
          ? { to: '/s/$key/p/$slugId', params: pageParams({ spaceKey: page.spaceKey, ...up }) }
          : { to: '/s/$key', params: { key: page.spaceKey } },
      );
    });

  return (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="sm" asChild>
        <Link to="/s/$key/p/$slugId/edit" params={pageParams(page)}>
          <Pencil /> {t('page.edit')}
        </Link>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t('page.more')}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() =>
              void navigate({
                to: '/s/$key/new',
                params: { key: page.spaceKey },
                search: { parent: page.id },
              })
            }
          >
            <FilePlus /> {t('page.addChild')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDialog('move')}>
            <FolderInput /> {t('page.move')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={isHome}
            onSelect={() => setDialog('delete')}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 /> {t('page.delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialog === 'move'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('page.moveTitle', { title: page.title })}</DialogTitle>
            <DialogDescription>{t('page.moveBody')}</DialogDescription>
          </DialogHeader>
          <Select
            value={parent}
            onChange={(e) => setParent(e.target.value)}
            aria-label={t('page.newParent')}
          >
            <option value="">{t('page.topLevel')}</option>
            {parentOptions(tree.data?.tree ?? [], page.id).map(({ node, depth }) => (
              <option key={node.id} value={node.id}>
                {`${'  '.repeat(depth)}${node.title}`}
              </option>
            ))}
          </Select>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialog(null)}>
              {t('editor.cancel')}
            </Button>
            <Button onClick={() => void move()} disabled={busy}>
              {t('page.move')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'delete'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('page.deleteTitle', { title: page.title })}</DialogTitle>
            <DialogDescription>{t('page.deleteBody')}</DialogDescription>
          </DialogHeader>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialog(null)}>
              {t('editor.cancel')}
            </Button>
            <Button variant="destructive" onClick={() => void remove()} disabled={busy}>
              {t('page.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
