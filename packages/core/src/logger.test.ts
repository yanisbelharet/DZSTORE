import { describe, expect, it } from 'vitest';

import { AppError } from './errors.ts';
import { createLogger, scrub } from './logger.ts';

function capture() {
  const lines: Record<string, unknown>[] = [];
  const stream = {
    write(chunk: string) {
      lines.push(JSON.parse(chunk) as Record<string, unknown>);
    },
  };
  return { lines, stream };
}

describe('logger — rédaction des données personnelles et secrets', () => {
  it('masque les clés sensibles à toute profondeur', () => {
    const { lines, stream } = capture();
    const logger = createLogger({ name: 'test', level: 'info', destination: stream });
    logger.info(
      {
        order: {
          id: 'o-1',
          customerName: 'Amine Benali',
          phone: '0555123456',
          address: '12 rue Didouche Mourad',
          clientIp: '105.101.20.3',
          items: [{ sku: 'SKU-1', quantity: 2 }],
        },
        headers: { authorization: 'Bearer abc.def.ghi', cookie: 'sid=xyz' },
        carrier: { apiToken: 'tok_123', nom_client: 'Amine', telephone: '0661234567' },
      },
      'order created',
    );
    const out = JSON.stringify(lines[0]);
    for (const secret of [
      'Amine',
      '0555123456',
      'Didouche',
      '105.101.20.3',
      'abc.def.ghi',
      'sid=xyz',
      'tok_123',
      '0661234567',
    ]) {
      expect(out).not.toContain(secret);
    }
    expect(out).toContain('o-1');
    expect(out).toContain('SKU-1');
  });

  it('masque les motifs sensibles dans les valeurs libres et le message', () => {
    const { lines, stream } = capture();
    const logger = createLogger({ name: 'test', level: 'info', destination: stream });
    logger.info(
      {
        note: 'Client 0770 12 34 56 joignable, sinon +213 6 61 23 45 67',
        url: 'https://dhd.ecotrack.dz/api/v1/get/orders/status?api_token=SECRET123&trackings=EC1',
        raw: 'Authorization: Bearer eyJhbGciOi.payload.sig',
        contact: 'amine@example.com',
      },
      'Appel du 0550 00 00 01 depuis 41.200.10.5',
    );
    const out = JSON.stringify(lines[0]);
    for (const secret of [
      '0770 12 34 56',
      '6 61 23 45 67',
      'SECRET123',
      'trackings=EC1',
      'eyJhbGciOi',
      'amine@example.com',
      '0550 00 00 01',
      '41.200.10.5',
    ]) {
      expect(out).not.toContain(secret);
    }
    expect(out).toContain('https://dhd.ecotrack.dz/api/v1/get/orders/status');
  });

  it('masque les données personnelles contenues dans une erreur', () => {
    const { lines, stream } = capture();
    const logger = createLogger({ name: 'test', level: 'info', destination: stream });
    logger.error({ err: new Error('Commande refusée pour 0555123456') }, 'carrier error');
    expect(JSON.stringify(lines[0])).not.toContain('0555123456');
  });

  it('conserve le type et le code des erreurs applicatives', () => {
    const { lines, stream } = capture();
    const logger = createLogger({ name: 'test', level: 'info', destination: stream });
    logger.error({ err: new AppError('CONFLICT', 'Version mismatch') }, 'update failed');
    logger.error(new TypeError('boom'));
    expect(lines[0]).toMatchObject({ err: { type: 'AppError', code: 'CONFLICT', status: 409 } });
    expect(lines[1]).toMatchObject({ err: { type: 'TypeError', message: 'boom' }, msg: 'boom' });
  });

  it('propage l’identifiant de corrélation', () => {
    const { lines, stream } = capture();
    const logger = createLogger({ name: 'api', level: 'info', destination: stream });
    logger.child({ requestId: 'req-42' }).info('handled');
    expect(lines[0]).toMatchObject({ requestId: 'req-42', name: 'api', msg: 'handled' });
  });

  it('respecte le niveau configuré', () => {
    const { lines, stream } = capture();
    const logger = createLogger({ name: 'test', level: 'warn', destination: stream });
    logger.info('ignored');
    logger.warn('kept');
    expect(lines).toHaveLength(1);
  });

  it('scrub ne modifie pas l’objet d’origine et gère les cycles', () => {
    const original: Record<string, unknown> = { phone: '0555123456', nested: { ok: true } };
    original.self = original;
    const result = scrub(original) as Record<string, unknown>;
    expect(original.phone).toBe('0555123456');
    expect(result.phone).toBe('[REDACTED]');
    expect(result.self).toBe('[Circular]');
  });

  it('ne parcourt pas les objets non simples (sockets, flux, instances) ni les octets', () => {
    class Socket {
      remoteAddress = '41.200.10.5';
      self = this;
    }
    const value = scrub({ socket: new Socket(), body: Buffer.from('secret'), list: new Map() });
    expect(value).toEqual({ socket: '[Socket]', body: '[Binary]', list: '[Map]' });
  });

  it('ne masque pas les montants, dates ni identifiants techniques', () => {
    const value = scrub({
      total: 4500,
      createdAt: '2026-11-02T10:00:00.000Z',
      id: '0190f5a8-7c3e-7d2a-9b1c-2f3e4d5a6b7c',
      tracking: 'ECQFLD2103047673',
    });
    expect(value).toEqual({
      total: 4500,
      createdAt: '2026-11-02T10:00:00.000Z',
      id: '0190f5a8-7c3e-7d2a-9b1c-2f3e4d5a6b7c',
      tracking: 'ECQFLD2103047673',
    });
  });
});
