import { Link } from '@tanstack/react-router';
import type { Element } from 'hast';
import type { AnchorHTMLAttributes } from 'react';
import { useMentionable } from '@/lib/notifications';

const MENTION = '#mention-';

/**
 * An @mention chip (renderMentions) shows the actor's current name: the stored markup keeps
 * the name from when the comment was written. Unknown ids keep that stored name.
 */
function Mention({
  id,
  children,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { id: string }) {
  const name = useMentionable(true).data?.find((a) => a.id === id)?.name;
  return (
    <a href={`${MENTION}${id}`} {...props}>
      {name ? `@${name}` : children}
    </a>
  );
}

/** In-app links navigate client-side; external links open in a new tab. */
export function MarkdownLink({
  node: _node,
  href = '',
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { node?: Element }) {
  if (href.startsWith(MENTION)) return <Mention id={href.slice(MENTION.length)} {...props} />;
  if (href.startsWith('/') && !href.startsWith('/files/')) {
    return <Link to={href} {...props} />;
  }
  if (href.startsWith('#') || href.startsWith('/files/')) return <a href={href} {...props} />;
  return <a href={href} target="_blank" rel="noopener noreferrer" {...props} />;
}
