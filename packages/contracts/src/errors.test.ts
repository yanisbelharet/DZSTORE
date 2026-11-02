import { describe, expect, it } from 'vitest';

import { apiErrorSchema } from './errors.ts';

describe('apiErrorSchema', () => {
  it('accepte l’enveloppe d’erreur standard', () => {
    const parsed = apiErrorSchema.parse({
      error: { code: 'NOT_FOUND', message: 'Route not found', requestId: 'req-1' },
    });
    expect(parsed.error.code).toBe('NOT_FOUND');
  });

  it('refuse une réponse sans identifiant de requête', () => {
    expect(apiErrorSchema.safeParse({ error: { code: 'X', message: 'y' } }).success).toBe(false);
  });
});
