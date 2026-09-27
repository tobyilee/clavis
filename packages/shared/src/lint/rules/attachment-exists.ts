import { extractAttachmentRefs } from '../../markdown/links';
import type { LintRule } from '../types';

export const attachmentExists: LintRule = {
  id: 'clavis/attachment-exists',
  severity: 'error',
  blocking: true,
  check({ lines }, { attachmentExists }) {
    if (!attachmentExists) return [];
    return extractAttachmentRefs(lines)
      .filter((ref) => !attachmentExists(ref.filename))
      .map((ref) => ({
        line: ref.line,
        column: ref.column,
        message: `Attachment "${ref.filename}" does not exist on this page.`,
        params: { filename: ref.filename },
      }));
  },
};
