import { Link } from '@tanstack/react-router';
import type { Element } from 'hast';
import type { AnchorHTMLAttributes } from 'react';

/** In-app links navigate client-side; external links open in a new tab. */
export function MarkdownLink({
  node: _node,
  href = '',
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { node?: Element }) {
  if (href.startsWith('/') && !href.startsWith('/files/')) {
    return <Link to={href} {...props} />;
  }
  if (href.startsWith('#') || href.startsWith('/files/')) return <a href={href} {...props} />;
  return <a href={href} target="_blank" rel="noopener noreferrer" {...props} />;
}
