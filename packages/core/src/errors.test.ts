import { describe, expect, it } from 'vitest';

import { AppError, ERROR_CODES, isAppError } from './errors.ts';

describe('AppError', () => {
  it('porte un code stable et le statut HTTP associé', () => {
    const error = new AppError('NOT_FOUND', 'Order not found', { details: { orderId: 'o1' } });
    expect(error.code).toBe('NOT_FOUND');
    expect(error.status).toBe(404);
    expect(error.details).toEqual({ orderId: 'o1' });
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('AppError');
  });

  it('chaque code a un statut HTTP valide', () => {
    for (const { status } of Object.values(ERROR_CODES)) {
      expect(status).toBeGreaterThanOrEqual(400);
      expect(status).toBeLessThan(600);
    }
  });

  it('conserve la cause sans l’exposer dans la sérialisation', () => {
    const cause = new Error('db down: postgresql://user:secret@host/db');
    const error = new AppError('UNAVAILABLE', 'Database unavailable', { cause });
    expect(error.cause).toBe(cause);
    expect(JSON.stringify(error.toJSON())).not.toContain('secret');
    expect(error.toJSON()).toEqual({ code: 'UNAVAILABLE', message: 'Database unavailable' });
  });

  it('ne publie le message que pour les erreurs exposables (4xx)', () => {
    expect(new AppError('VALIDATION_FAILED', 'Bad phone').expose).toBe(true);
    expect(new AppError('INTERNAL', 'Unexpected state').expose).toBe(false);
  });

  it('isAppError reconnaît uniquement les AppError', () => {
    expect(isAppError(new AppError('CONFLICT', 'Version mismatch'))).toBe(true);
    expect(isAppError(new Error('x'))).toBe(false);
    expect(isAppError({ code: 'CONFLICT' })).toBe(false);
  });
});
