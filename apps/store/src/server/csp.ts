import { createHash } from 'node:crypto';

/** CSP source expression (`sha256-…`) allowing exactly this inline content. */
export const cspHash = (content: string): `sha256-${string}` =>
  `sha256-${createHash('sha256').update(content, 'utf8').digest('base64')}`;
