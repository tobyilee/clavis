import type { Comment, Thread } from '@clavis/shared/schema';
import { useQuery } from '@tanstack/react-query';
import { Bot, Check, MessageSquare, RotateCcw, User } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Select, Textarea } from '@/components/ui/input';
import { isApiError } from '@/lib/api';
import { threadsQuery, useCommentAction } from '@/lib/comments';
import { useMe } from '@/lib/me';
import { absoluteTime, relativeTime } from '@/lib/time';
import type { TocItem } from '@/markdown/plugins';
import { type RenderContext, renderMarkdown } from '@/markdown/render';

interface Props {
  pageId: string;
  toc: TocItem[];
  ctx: RenderContext;
}

export const threadAnchor = (id: string) => `comment-${id}`;

/** Comment threads under a page (D-44): open ones first, resolved ones folded away. */
export function Comments({ pageId, toc, ctx }: Props) {
  const { t } = useTranslation();
  const threads = useQuery(threadsQuery(pageId));
  const [showResolved, setShowResolved] = useState(false);
  const open = threads.data?.filter((th) => th.resolvedAt === null) ?? [];
  const resolved = threads.data?.filter((th) => th.resolvedAt !== null) ?? [];

  return (
    <section id="comments" className="mt-10 border-t pt-6" aria-labelledby="comments-heading">
      <h2 id="comments-heading" className="flex items-center gap-2 text-lg font-semibold">
        <MessageSquare className="size-5" /> {t('comments.title')}
        {open.length > 0 && (
          <span className="text-sm font-normal text-muted-foreground">
            {t('comments.openCount', { count: open.length })}
          </span>
        )}
      </h2>
      <div className="mt-4 space-y-4">
        {open.map((th) => (
          <ThreadView key={th.id} thread={th} pageId={pageId} toc={toc} ctx={ctx} />
        ))}
      </div>
      {resolved.length > 0 && (
        <button
          type="button"
          className="mt-4 text-sm text-muted-foreground underline"
          onClick={() => setShowResolved((v) => !v)}
          aria-expanded={showResolved}
        >
          {t(showResolved ? 'comments.hideResolved' : 'comments.showResolved', {
            count: resolved.length,
          })}
        </button>
      )}
      {showResolved && (
        <div className="mt-4 space-y-4 opacity-80">
          {resolved.map((th) => (
            <ThreadView key={th.id} thread={th} pageId={pageId} toc={toc} ctx={ctx} />
          ))}
        </div>
      )}
      <Composer pageId={pageId} toc={toc} />
    </section>
  );
}

function Composer({
  pageId,
  toc,
  replyTo,
  onDone,
}: {
  pageId: string;
  toc?: TocItem[];
  replyTo?: string;
  onDone?: () => void;
}) {
  const { t } = useTranslation();
  const action = useCommentAction(pageId);
  const [body, setBody] = useState('');
  const [section, setSection] = useState('');
  const submit = () => {
    if (!body.trim()) return;
    action.mutate(
      { kind: 'add', body, replyTo, sectionId: section || undefined },
      {
        onSuccess: () => {
          setBody('');
          setSection('');
          onDone?.();
        },
      },
    );
  };
  return (
    <form
      className={replyTo ? 'mt-3 space-y-2' : 'mt-6 space-y-2'}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
        }}
        placeholder={t(replyTo ? 'comments.replyPlaceholder' : 'comments.placeholder')}
        aria-label={t(replyTo ? 'comments.reply' : 'comments.new')}
        rows={replyTo ? 2 : 3}
      />
      <div className="flex flex-wrap items-center gap-2">
        {!replyTo && toc && toc.length > 0 && (
          <Select
            value={section}
            onChange={(e) => setSection(e.target.value)}
            aria-label={t('comments.section')}
            className="max-w-60"
          >
            <option value="">{t('comments.wholePage')}</option>
            {toc.map((h) => (
              <option key={h.id} value={h.id}>
                {h.level === 3 ? '  ' : ''}
                {h.text}
              </option>
            ))}
          </Select>
        )}
        <Button type="submit" size="sm" disabled={!body.trim() || action.isPending}>
          {t(replyTo ? 'comments.reply' : 'comments.submit')}
        </Button>
        {onDone && (
          <Button type="button" size="sm" variant="ghost" onClick={onDone}>
            {t('comments.cancel')}
          </Button>
        )}
        {action.isError && (
          <span className="text-sm text-destructive" role="alert">
            {isApiError(action.error) ? action.error.problem.title : t('error.load')}
          </span>
        )}
      </div>
    </form>
  );
}

function ThreadView({
  thread,
  pageId,
  toc,
  ctx,
}: {
  thread: Thread;
  pageId: string;
  toc: TocItem[];
  ctx: RenderContext;
}) {
  const { t } = useTranslation();
  const me = useMe().data;
  const canResolve = me?.role === 'editor' || me?.role === 'admin';
  const action = useCommentAction(pageId);
  const [replying, setReplying] = useState(false);
  const section = thread.sectionId ? toc.find((h) => h.id === thread.sectionId) : undefined;
  const resolved = thread.resolvedAt !== null;

  return (
    <article
      id={threadAnchor(thread.id)}
      className="scroll-mt-20 rounded-md border px-4 py-3 target:ring-2 target:ring-ring/50"
    >
      {thread.sectionId && (
        <a href={`#${thread.sectionId}`} className="mb-1 block text-xs text-muted-foreground">
          § {section?.text ?? thread.sectionId}
        </a>
      )}
      <CommentView
        comment={thread}
        pageId={pageId}
        ctx={ctx}
        deletable={thread.replies.length === 0}
      />
      {thread.replies.length > 0 && (
        <div className="mt-3 space-y-3 border-l-2 pl-4">
          {thread.replies.map((r) => (
            <CommentView key={r.id} comment={r} pageId={pageId} ctx={ctx} deletable />
          ))}
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {!resolved && !replying && (
          <Button size="sm" variant="ghost" onClick={() => setReplying(true)}>
            {t('comments.reply')}
          </Button>
        )}
        {canResolve && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => action.mutate({ kind: resolved ? 'reopen' : 'resolve', id: thread.id })}
            disabled={action.isPending}
          >
            {resolved ? <RotateCcw /> : <Check />}
            {t(resolved ? 'comments.reopen' : 'comments.resolve')}
          </Button>
        )}
        {resolved && thread.resolvedBy && (
          <span className="text-xs text-muted-foreground">
            {t('comments.resolvedBy', { name: thread.resolvedBy.name })}
          </span>
        )}
      </div>
      {replying && (
        <Composer pageId={pageId} replyTo={thread.id} onDone={() => setReplying(false)} />
      )}
    </article>
  );
}

function CommentView({
  comment,
  pageId,
  ctx,
  deletable,
}: {
  comment: Comment;
  pageId: string;
  ctx: RenderContext;
  deletable: boolean;
}) {
  const { t, i18n } = useTranslation();
  const me = useMe().data;
  const action = useCommentAction(pageId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const body = useMemo(() => renderMarkdown(comment.body, ctx).element, [comment.body, ctx]);
  const mine = me?.id === comment.author.id;
  const Icon = comment.author.kind === 'agent' ? Bot : User;

  return (
    <div>
      <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
        <Icon className="size-3.5" aria-label={t(`actorKind.${comment.author.kind}`)} />
        <span className="font-medium text-foreground">{comment.author.name}</span>
        <time title={absoluteTime(comment.createdAt, i18n.language)}>
          {relativeTime(comment.createdAt, i18n.language)}
        </time>
        {comment.updatedAt && <span>{t('comments.edited')}</span>}
        {mine && !editing && (
          <button type="button" className="underline" onClick={() => setEditing(true)}>
            {t('comments.edit')}
          </button>
        )}
        {(mine || me?.role === 'admin') && deletable && !editing && (
          <button
            type="button"
            className="underline"
            onClick={() => {
              if (window.confirm(t('comments.confirmDelete'))) {
                action.mutate({ kind: 'delete', id: comment.id });
              }
            }}
          >
            {t('comments.delete')}
          </button>
        )}
      </p>
      {editing ? (
        <form
          className="mt-2 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            action.mutate(
              { kind: 'edit', id: comment.id, body: draft },
              { onSuccess: () => setEditing(false) },
            );
          }}
        >
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-label={t('comments.edit')}
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={!draft.trim() || action.isPending}>
              {t('comments.save')}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
              {t('comments.cancel')}
            </Button>
          </div>
        </form>
      ) : (
        <div className="prose-clavis prose-comment mt-1 text-sm">{body}</div>
      )}
    </div>
  );
}
