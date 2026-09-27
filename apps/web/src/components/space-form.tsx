import type { Space } from '@clavis/shared/schema';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { apiSend, isApiError } from '@/lib/api';

/** Create a space (key is permanent, D-34) or rename / describe an existing one. */
export function SpaceForm({
  space,
  onClose,
}: {
  space: Space | 'new' | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isNew = space === 'new';
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (space && space !== 'new') {
      setName(space.name);
      setDescription(space.description ?? '');
    } else {
      setKey('');
      setName('');
      setDescription('');
    }
    setError(null);
  }, [space]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (isNew) {
        const created = await apiSend<Space>('POST', '/spaces', {
          key: key.trim(),
          name: name.trim(),
          description: description.trim() || undefined,
        });
        await queryClient.invalidateQueries({ queryKey: ['spaces'] });
        onClose();
        await navigate({ to: '/s/$key', params: { key: created.key } });
      } else if (space) {
        await apiSend('PATCH', `/spaces/${space.key}`, {
          name: name.trim(),
          description: description.trim() || null,
        });
        await queryClient.invalidateQueries({ queryKey: ['spaces'] });
        await queryClient.invalidateQueries({ queryKey: ['space', space.key] });
        onClose();
      }
    } catch (err) {
      setError(isApiError(err) ? (err.problem.detail ?? err.problem.title) : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={space !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>
              {isNew ? t('space.new') : t('space.edit', { key: space?.key })}
            </DialogTitle>
          </DialogHeader>
          {isNew && (
            <label className="flex flex-col gap-1 text-sm">
              {t('space.key')}
              <Input
                required
                value={key}
                onChange={(e) => setKey(e.target.value.toUpperCase())}
                pattern="[A-Z][A-Z0-9]{1,9}"
                placeholder="PAY"
                className="font-mono"
              />
              <span className="text-xs text-muted-foreground">{t('space.keyHelp')}</span>
            </label>
          )}
          <label className="flex flex-col gap-1 text-sm">
            {t('space.name')}
            <Input required value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t('space.description')}
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
            />
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('editor.cancel')}
            </Button>
            <Button type="submit" disabled={busy}>
              {isNew ? t('space.create') : t('space.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
