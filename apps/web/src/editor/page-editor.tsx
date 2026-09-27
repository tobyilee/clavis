import type { Page, SaveResult, Violation } from '@clavis/shared/schema';
import { requiredSections } from '@clavis/shared/templates';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useBlocker, useNavigate } from '@tanstack/react-router';
import { cn } from 'cn';
import { Eye, Loader2, Paperclip, Save } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { Input } from '@/components/ui/input';
import { apiGet, apiSend, isApiError } from '@/lib/api';
import { indexTree, pageQuery, treeQuery } from '@/lib/queries';
import { relativeTime } from '@/lib/time';
import { pageParams } from '@/lib/urls';
import { renderMarkdown } from '@/markdown/render';
import { useRenderContext } from '@/markdown/use-render-context';
import type { Completions } from './codemirror';
import { type Draft, drafts } from './drafts';
import { readFrontmatter, updateFrontmatter } from './frontmatter';
import { FrontmatterForm } from './frontmatter-form';
import { MarkdownEditor, type MarkdownEditorHandle } from './markdown-editor';
import { ProblemsPanel } from './problems-panel';
import { useScrollSync } from './scroll-sync';
import { useLint, useViolationMessage } from './use-lint';

export interface EditorAttachments {
  names: string[] | null;
  resolve: (filename: string) => string | null;
  /** Uploads files and inserts references; resolves to per-file error messages. */
  upload?: (files: File[], editor: MarkdownEditorHandle) => Promise<string[]>;
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setV(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return v;
}

export function PageEditor({
  page,
  attachments,
  initialLine,
}: {
  page: Page;
  attachments: EditorAttachments;
  /** Line to open at, e.g. a finding picked on the Space dashboard. */
  initialLine?: number;
}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const editor = useRef<MarkdownEditorHandle>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  // What the server has (after our last save), and what we are editing.
  const [saved, setSaved] = useState({
    title: page.title,
    content: page.content,
    revision: page.revision,
  });
  const [title, setTitle] = useState(page.title);
  const [content, setContent] = useState(page.content);
  const [saving, setSaving] = useState(false);
  const [saveProblems, setSaveProblems] = useState<Violation[]>([]);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [conflictRevision, setConflictRevision] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft | null>(() => {
    const d = drafts.load(page.id);
    return d && (d.content !== page.content || d.title !== page.title) ? d : null;
  });
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');
  // Phones: the properties form folds away to leave room for writing (D-06).
  const [showProps, setShowProps] = useState(false);

  // Once, after CodeMirror has mounted (child effects run first).
  useEffect(() => {
    if (initialLine) editor.current?.gotoLine(initialLine);
  }, [initialLine]);
  const leaving = useRef(false);

  const dirty = title !== saved.title || content !== saved.content;
  const messageFor = useViolationMessage();

  // ── Lint & preview ───────────────────────────────────────────────────────
  const tree = useQuery(treeQuery(queryClient, page.spaceKey));
  const treeIndex = useMemo(() => (tree.data ? indexTree(tree.data.tree) : null), [tree.data]);
  const violations = useLint(content, {
    spaceKey: page.spaceKey,
    tree: treeIndex,
    attachments: attachments.names,
    self: title,
  });
  const shown = useMemo(() => {
    // Server-reported errors (e.g. a link to another space) stay until the text changes.
    const seen = new Set(violations.map((v) => `${v.ruleId}:${v.line}`));
    return [...saveProblems.filter((v) => !seen.has(`${v.ruleId}:${v.line}`)), ...violations];
  }, [violations, saveProblems]);
  const hasErrors = shown.some((v) => v.severity === 'error');

  const ctx = useRenderContext(page.spaceKey, attachments.resolve);
  const previewSource = useDebounced(content, 150);
  const preview = useMemo(() => renderMarkdown(previewSource, ctx).element, [previewSource, ctx]);
  const { onEditorScroll, onPreviewScroll } = useScrollSync(editor, previewRef);

  const fm = useMemo(() => readFrontmatter(content), [content]);
  const missingSections = useMemo(() => {
    if (!fm.valid) return [];
    const present = violations
      .filter((v) => v.ruleId === 'clavis/required-sections')
      .map((v) => v.params?.section);
    return requiredSections(fm.fields.type).filter((s) => present.includes(s.ko));
  }, [fm, violations]);

  // ── Drafts & leaving ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(
      () => drafts.save(page.id, { title, content, baseRevision: saved.revision }),
      800,
    );
    return () => clearTimeout(timer);
  }, [dirty, title, content, page.id, saved.revision]);

  useBlocker({
    shouldBlockFn: () => dirty && !leaving.current && !window.confirm(t('editor.confirmLeave')),
    enableBeforeUnload: () => dirty && !leaving.current,
  });

  // ── Actions ──────────────────────────────────────────────────────────────
  const completions = useCallback(
    (): Completions => ({
      titles: async (spaceKey) => {
        if (!spaceKey || spaceKey === page.spaceKey) return [...(treeIndex?.byTitle.keys() ?? [])];
        try {
          const other = await queryClient.fetchQuery(treeQuery(queryClient, spaceKey));
          return [...indexTree(other.tree).byTitle.keys()];
        } catch {
          return [];
        }
      },
      attachments: () => attachments.names ?? [],
    }),
    [page.spaceKey, treeIndex, queryClient, attachments.names],
  );

  const setFrontmatter = (patch: Parameters<typeof updateFrontmatter>[1]) => {
    const next = updateFrontmatter(editor.current?.getDoc() ?? content, patch);
    editor.current?.setDoc(next);
  };

  const addMissingSections = () => {
    const doc = editor.current?.getDoc() ?? content;
    const locale = i18n.language.startsWith('ko') ? 'ko' : 'en';
    const text = missingSections.map((s) => `## ${s[locale]}\n`).join('\n');
    editor.current?.setDoc(`${doc.replace(/\n*$/, '\n\n')}${text}`);
  };

  const save = async (exit: boolean) => {
    if (saving) return;
    setSaving(true);
    setNotice(null);
    try {
      const result = await apiSend<SaveResult>('PUT', `/pages/${page.id}`, {
        title,
        content,
        baseRevision: saved.revision,
      });
      // The response leaves out the content we just sent.
      queryClient.setQueryData(pageQuery(page.shortId).queryKey, { ...result.page, content });
      void queryClient.invalidateQueries({ queryKey: ['tree', page.spaceKey] });
      drafts.clear(page.id);
      setDraft(null);
      setSaveProblems([]);
      setSaved({
        title: result.page.title,
        content,
        revision: result.page.revision,
      });
      const renamed = [
        result.linksUpdated ? t('editor.linksUpdated', { count: result.linksUpdated }) : '',
        result.linksToOldTitle ? t('editor.renamedLinks', { count: result.linksToOldTitle }) : '',
      ]
        .filter(Boolean)
        .map((m) => ` ${m}`)
        .join('');
      setNotice({
        tone: 'ok',
        text: `${t('editor.saved', { revision: result.page.revision })}${renamed}`,
      });
      if (exit) {
        leaving.current = true;
        await navigate({ to: '/s/$key/p/$slugId', params: pageParams(result.page) });
      }
    } catch (e) {
      if (isApiError(e, 422)) {
        setSaveProblems(e.problem.violations ?? []);
        setNotice({ tone: 'error', text: t('editor.lintFailed') });
      } else if (isApiError(e, 409) && e.problem.type.endsWith('revision-conflict')) {
        setConflictRevision(e.problem.revision ?? null);
      } else if (isApiError(e)) {
        setNotice({ tone: 'error', text: e.problem.detail ?? e.problem.title });
      } else {
        setNotice({ tone: 'error', text: t('editor.saveFailed') });
      }
    } finally {
      setSaving(false);
    }
  };

  const loadLatest = async (copyMine: boolean) => {
    if (copyMine) {
      try {
        await navigator.clipboard.writeText(content);
      } catch {
        // The draft in localStorage still has it.
      }
    }
    const latest = await apiGet<Page>(`/pages/${page.id}`);
    queryClient.setQueryData(pageQuery(page.shortId).queryKey, latest);
    setSaved({ title: latest.title, content: latest.content, revision: latest.revision });
    setTitle(latest.title);
    editor.current?.setDoc(latest.content);
    setConflictRevision(null);
    setNotice({
      tone: 'ok',
      text: t(copyMine ? 'editor.loadedLatestCopied' : 'editor.loadedLatest'),
    });
  };

  const uploadFiles = (files: File[]) => {
    const ed = editor.current;
    if (!ed || !attachments.upload || files.length === 0) return;
    setNotice({ tone: 'ok', text: t('editor.uploading', { count: files.length }) });
    void attachments
      .upload(files, ed)
      .then((errors) =>
        setNotice(
          errors.length > 0
            ? { tone: 'error', text: `${t('editor.uploadFailed')} ${errors.join('; ')}` }
            : { tone: 'ok', text: t('editor.uploaded', { count: files.length }) },
        ),
      );
  };

  const restoreDraft = () => {
    if (!draft) return;
    setTitle(draft.title);
    editor.current?.setDoc(draft.content);
    setDraft(null);
  };

  // ── Layout ───────────────────────────────────────────────────────────────
  return (
    <div className="-mx-4 -my-6 flex h-[calc(100dvh-3.5rem)] flex-col md:-mx-8">
      <div className="flex flex-col gap-2 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Input
            aria-label={t('editor.title')}
            className="h-10 flex-1 text-lg font-semibold md:text-lg"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          {attachments.upload && (
            <Button variant="ghost" size="icon" asChild>
              <label title={t('editor.attach')}>
                <Paperclip />
                <span className="sr-only">{t('editor.attach')}</span>
                <input
                  type="file"
                  multiple
                  className="sr-only"
                  onChange={(e) => {
                    uploadFiles([...(e.target.files ?? [])]);
                    e.target.value = '';
                  }}
                />
              </label>
            </Button>
          )}
          <Button variant="ghost" asChild>
            <Link to="/s/$key/p/$slugId" params={pageParams(page)}>
              {t('editor.close')}
            </Link>
          </Button>
          <Button
            onClick={() => void save(true)}
            disabled={saving || hasErrors}
            title="⌘S"
            aria-label={t('editor.save')}
          >
            {saving ? <Loader2 className="animate-spin" /> : <Save />}
            <span className="hidden sm:inline">{t('editor.save')}</span>
          </Button>
        </div>
        <button
          type="button"
          className="self-start text-xs text-muted-foreground underline md:hidden"
          onClick={() => setShowProps((v) => !v)}
          aria-expanded={showProps}
        >
          {showProps ? t('editor.hideProps') : t('editor.showProps')}
        </button>
        <div className={cn(!showProps && 'hidden md:block')}>
          <FrontmatterForm fields={fm.fields} valid={fm.valid} onChange={setFrontmatter} />
        </div>
        {missingSections.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {t('editor.missingSections', { sections: missingSections.map((s) => s.ko).join(', ') })}{' '}
            <button type="button" className="underline" onClick={addMissingSections}>
              {t('editor.addSections')}
            </button>
          </p>
        )}
        {draft && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm">
            {t('editor.draftFound', { when: relativeTime(draft.savedAt, i18n.language) })}
            {draft.baseRevision < page.revision && (
              <span className="text-amber-600">{t('editor.draftOutdated')}</span>
            )}
            <Button size="sm" variant="outline" onClick={restoreDraft}>
              {t('editor.restoreDraft')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                drafts.clear(page.id);
                setDraft(null);
              }}
            >
              {t('editor.discardDraft')}
            </Button>
          </div>
        )}
        {notice && (
          <p
            className={cn(
              'text-sm',
              notice.tone === 'error' ? 'text-destructive' : 'text-muted-foreground',
            )}
            role="status"
          >
            {notice.text}
          </p>
        )}
      </div>

      <div className="flex border-b md:hidden" role="tablist">
        {(['edit', 'preview'] as const).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              'flex-1 py-2 text-sm',
              tab === key && 'border-b-2 border-foreground font-medium',
            )}
          >
            {key === 'edit' ? (
              t('editor.tabEdit')
            ) : (
              <>
                <Eye className="mr-1 inline size-4" />
                {t('editor.tabPreview')}
              </>
            )}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1">
        <div className={cn('min-w-0 flex-1 md:block md:border-r', tab !== 'edit' && 'hidden')}>
          <MarkdownEditor
            ref={editor}
            initialDoc={page.content}
            violations={shown}
            messageFor={messageFor}
            onChange={(doc) => {
              setContent(doc);
              if (saveProblems.length) setSaveProblems([]);
            }}
            onSave={() => void save(false)}
            onScroll={onEditorScroll}
            completions={completions}
            lineNumbers={
              typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches
            }
            placeholder={t('editor.placeholder')}
            onPasteFiles={attachments.upload ? uploadFiles : undefined}
          />
        </div>
        <div
          ref={previewRef}
          onScroll={onPreviewScroll}
          className={cn(
            'min-w-0 flex-1 overflow-y-auto px-6 py-4 md:block',
            tab !== 'preview' && 'hidden',
          )}
        >
          <div className="prose-clavis">{preview}</div>
        </div>
      </div>

      <ProblemsPanel
        violations={shown}
        messageFor={messageFor}
        onSelect={(line) => {
          setTab('edit');
          editor.current?.gotoLine(line);
        }}
      />

      <Dialog
        open={conflictRevision !== null}
        onOpenChange={(open) => !open && setConflictRevision(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('editor.conflictTitle')}</DialogTitle>
            <DialogDescription>
              {t('editor.conflictBody', { mine: saved.revision, theirs: conflictRevision ?? '?' })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConflictRevision(null)}>
              {t('editor.keepEditing')}
            </Button>
            <Button onClick={() => void loadLatest(true)}>{t('editor.copyAndLoad')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
