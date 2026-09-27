import type { Attachment } from '@clavis/shared/schema';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { EditorAttachments } from '@/editor/page-editor';
import { ApiError, apiGet } from './api';

export const attachmentsQuery = (pageId: string) => ({
  queryKey: ['attachments', pageId],
  queryFn: () =>
    apiGet<{ attachments: Attachment[] }>(`/pages/${pageId}/attachments`).then(
      (r) => r.attachments,
    ),
});

/** Uploads one file as the raw request body (streams into R2 on the server). */
export async function uploadFile(pageId: string, file: File): Promise<Attachment> {
  const res = await fetch(
    `/api/v1/pages/${pageId}/attachments?filename=${encodeURIComponent(file.name || 'pasted.png')}`,
    {
      method: 'POST',
      headers: {
        'content-type': file.type || 'application/octet-stream',
        accept: 'application/json',
      },
      body: file,
    },
  );
  if (!res.ok) {
    const problem = res.headers.get('content-type')?.includes('problem+json')
      ? await res.json()
      : { type: 'about:blank', title: res.statusText, status: res.status };
    throw new ApiError(problem);
  }
  return (await res.json()) as Attachment;
}

/** Markdown that references an uploaded file (D-31): images inline, others as links. */
export function attachmentMarkdown(a: Pick<Attachment, 'filename' | 'mimeType'>): string {
  const path = `attachments/${encodeURI(a.filename)}`;
  const label = a.filename.replace(/\.[^.]+$/, '').replace(/[[\]]/g, '');
  return a.mimeType.startsWith('image/') ? `![${label}](${path})` : `[${a.filename}](${path})`;
}

/** A page's attachments for the renderer and editor (resolve by name, upload on paste). */
export function useAttachments(pageId: string | null): EditorAttachments & { list: Attachment[] } {
  const queryClient = useQueryClient();
  const query = useQuery({ ...attachmentsQuery(pageId ?? ''), enabled: !!pageId });
  const list = query.data;
  return useMemo(() => {
    const byName = new Map((list ?? []).map((a) => [a.filename, a]));
    return {
      list: list ?? [],
      names: list ? [...byName.keys()] : null,
      resolve: (name: string) => byName.get(name)?.url ?? null,
      upload: pageId
        ? async (files, editor) => {
            const errors: string[] = [];
            await Promise.all(
              files.map(async (file) => {
                // A unique placeholder, found again by text since the person keeps typing.
                const token = `![uploading ${Math.random().toString(36).slice(2, 8)} ${file.name}]()`;
                editor.insert(`${token}\n`);
                const replace = (text: string) => {
                  const doc = editor.getDoc();
                  const at = doc.indexOf(token);
                  if (at >= 0) editor.replaceRange(at, at + token.length + (text ? 0 : 1), text);
                };
                try {
                  const a = await uploadFile(pageId, file);
                  // Refresh the list before the reference lands, so lint sees the file.
                  await queryClient.invalidateQueries({ queryKey: ['attachments', pageId] });
                  replace(attachmentMarkdown(a));
                } catch (e) {
                  replace('');
                  errors.push(
                    `${file.name}: ${e instanceof ApiError ? (e.problem.detail ?? e.problem.title) : String(e)}`,
                  );
                }
              }),
            );
            return errors;
          }
        : undefined,
    };
  }, [list, pageId, queryClient]);
}
