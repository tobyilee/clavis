import { describe, expect, it } from 'vitest';
import { extractMentions, mentionMarkup, renderMentions } from '../src/markdown';

const ADAM = '01M3GP4CTHQ6R8070XQG6JZWVN';

describe('mentions', () => {
  it('finds stored mentions by id and plain ones by name', () => {
    const body = `${mentionMarkup('Adam', ADAM)} 확인 부탁, @토비 도요. cc @Adam.`;
    expect(body).toContain(`@[Adam](actor:${ADAM})`);
    expect(extractMentions(body)).toEqual({ ids: [ADAM], names: ['토비', 'adam'] });
  });

  it('ignores email addresses and words with @ inside', () => {
    expect(extractMentions('메일은 dev@example.com, a@b')).toEqual({ ids: [], names: [] });
  });

  it('renders stored mentions as links the renderer keeps', () => {
    expect(renderMentions(`hi ${mentionMarkup('Adam', ADAM)}!`)).toBe(
      `hi [@Adam](#mention-${ADAM})!`,
    );
  });
});
