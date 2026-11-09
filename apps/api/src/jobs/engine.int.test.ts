import { fixedClock } from '@dz/core';
import type { FixedClock } from '@dz/core';
import { createTestDatabase } from '@dz/db/testing';
import type { TestDatabase } from '@dz/db/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { buildApp } from '../app.ts';
import { memoryLogger, testConfig, testDependencies } from '../test/helpers.ts';
import { signedInAs } from '../test/sessions.ts';
import { createJobEngine } from './engine.ts';
import type { Subscriptions } from './engine.ts';
import { NonRetryableJobError, RetryLaterError } from './errors.ts';
import { publishEvent } from './queue.ts';
import { defineJob, JobRegistry } from './registry.ts';
import { SYSTEM_TEST_PROCESSED, systemJobs } from './system.ts';

let testDb: TestDatabase;
beforeAll(async () => {
  testDb = await createTestDatabase();
});
afterAll(async () => {
  await testDb.drop();
});
beforeEach(async () => {
  await testDb.db.job.deleteMany();
  await testDb.db.outboxEvent.deleteMany();
  await testDb.db.scheduledTask.deleteMany();
});

/** Per-test harness: handlers record their executions; behaviour is scripted per test. */
function harness(options: {
  behaviour?: (payload: { key: string }, attempt: number) => Promise<void>;
  subscriptions?: Subscriptions;
  schedules?: { name: string; intervalSeconds: number }[];
  clock?: FixedClock;
  leaseMs?: number;
}) {
  const runs: { key: string; attempt: number }[] = [];
  const clock = options.clock ?? fixedClock('2026-11-02T10:00:00Z');
  const registry = new JobRegistry([
    defineJob({
      name: 'test.work',
      payload: z.object({ key: z.string() }),
      maxAttempts: 3,
      handler: async (payload, context) => {
        runs.push({ key: payload.key, attempt: context.attempt });
        await options.behaviour?.(payload, context.attempt);
      },
    }),
    defineJob({ name: 'test.scheduled', payload: z.object({}), handler: () => Promise.resolve() }),
  ]);
  const engine = (workerId: string) =>
    createJobEngine({
      db: testDb.db,
      clock,
      logger: memoryLogger().logger,
      registry,
      workerId,
      random: () => 0.5,
      ...(options.subscriptions ? { subscriptions: options.subscriptions } : {}),
      ...(options.schedules ? { schedules: options.schedules } : {}),
      ...(options.leaseMs ? { leaseMs: options.leaseMs } : {}),
    });
  return { runs, clock, engine: engine('worker-a'), engine2: engine('worker-b') };
}

describe('mise en file et outbox transactionnelles', () => {
  it('un job mis en file dans une transaction annulée n’existe pas', async () => {
    const { engine } = harness({});
    await expect(
      testDb.db.$transaction(async (tx) => {
        await engine.enqueue(tx, 'test.work', { key: 'a' });
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(await testDb.db.job.count()).toBe(0);
    await testDb.db.$transaction((tx) => engine.enqueue(tx, 'test.work', { key: 'b' }));
    expect(await testDb.db.job.count()).toBe(1);
  });

  it('payload validé et clé de déduplication respectée', async () => {
    const { engine } = harness({});
    await expect(engine.enqueue(testDb.db, 'test.work', { wrong: 1 })).rejects.toThrow();
    await expect(engine.enqueue(testDb.db, 'inconnu', {})).rejects.toThrow(/Unknown job/u);
    expect(await engine.enqueue(testDb.db, 'test.work', { key: 'x' }, { dedupeKey: 'k1' })).toBe(
      true,
    );
    expect(await engine.enqueue(testDb.db, 'test.work', { key: 'x' }, { dedupeKey: 'k1' })).toBe(
      false,
    );
    expect(await testDb.db.job.count()).toBe(1);
  });

  it('un événement outbox est diffusé exactement une fois, même avec deux relais concurrents', async () => {
    const subscriptions: Subscriptions = {
      'order.created': [{ job: 'test.work', payload: (event) => ({ key: event.aggregateId }) }],
    };
    const { engine, engine2, runs, clock } = harness({ subscriptions });
    await testDb.db.$transaction(async (tx) => {
      for (let index = 0; index < 20; index += 1) {
        await publishEvent(
          tx,
          {
            type: 'order.created',
            aggregateType: 'Order',
            aggregateId: `o${String(index)}`,
            payload: {},
          },
          clock.now(),
        );
      }
    });
    await Promise.all([engine.runTick(), engine2.runTick(), engine.runTick()]);
    await engine.runTick();
    expect(await testDb.db.outboxEvent.count({ where: { status: 'DISPATCHED' } })).toBe(20);
    expect(await testDb.db.job.count()).toBe(20);
    expect(runs.map((run) => run.key).sort()).toEqual(
      Array.from({ length: 20 }, (_, index) => `o${String(index)}`).sort(),
    );
  });

  it('un événement défectueux est mis de côté sans bloquer les autres', async () => {
    const subscriptions: Subscriptions = {
      'bad.event': [{ job: 'test.work', payload: () => ({ invalid: true }) }],
      'good.event': [{ job: 'test.work', payload: () => ({ key: 'ok' }) }],
    };
    const { engine, runs, clock } = harness({ subscriptions });
    await publishEvent(
      testDb.db,
      { type: 'bad.event', aggregateType: 'X', aggregateId: '1', payload: {} },
      clock.now(),
    );
    await publishEvent(
      testDb.db,
      { type: 'good.event', aggregateType: 'X', aggregateId: '2', payload: {} },
      clock.now(),
    );
    await engine.runTick();
    const bad = await testDb.db.outboxEvent.findFirstOrThrow({ where: { type: 'bad.event' } });
    expect(bad).toMatchObject({ status: 'PENDING', attempts: 1 });
    expect(bad.lastError).toBeTruthy();
    expect(runs).toEqual([{ key: 'ok', attempt: 1 }]);
  });
});

describe('exécution, retries et dead-letter', () => {
  it('succès : exécuté une fois, marqué SUCCEEDED', async () => {
    const { engine, runs } = harness({});
    await engine.enqueue(testDb.db, 'test.work', { key: 'a' });
    expect(await engine.runTick()).toMatchObject({ succeeded: 1 });
    await engine.runTick();
    expect(runs).toHaveLength(1);
    expect((await testDb.db.job.findFirstOrThrow()).status).toBe('SUCCEEDED');
  });

  it('échecs : backoff croissant puis dead-letter après maxAttempts, erreur masquée', async () => {
    const { engine, runs, clock } = harness({
      behaviour: () => Promise.reject(new Error('carrier said no for 0555123456')),
    });
    await engine.enqueue(testDb.db, 'test.work', { key: 'a' });
    await engine.runTick();
    let job = await testDb.db.job.findFirstOrThrow();
    expect(job).toMatchObject({ status: 'PENDING', attempts: 1 });
    expect(job.runAt.getTime() - clock.now().getTime()).toBe(30_000);
    expect(job.lastError).not.toContain('0555123456');
    await engine.runTick();
    expect(runs).toHaveLength(1); // not due yet
    clock.advance(30_000);
    await engine.runTick();
    job = await testDb.db.job.findFirstOrThrow();
    expect(job.runAt.getTime() - clock.now().getTime()).toBe(60_000);
    clock.advance(60_000);
    expect(await engine.runTick()).toMatchObject({ dead: 1 });
    job = await testDb.db.job.findFirstOrThrow();
    expect(job).toMatchObject({ status: 'DEAD', attempts: 3 });
    expect(runs.map((run) => run.attempt)).toEqual([1, 2, 3]);
  });

  it('erreur non rejouable : dead-letter immédiat', async () => {
    const { engine } = harness({
      behaviour: () => Promise.reject(new NonRetryableJobError('422')),
    });
    await engine.enqueue(testDb.db, 'test.work', { key: 'a' });
    expect(await engine.runTick()).toMatchObject({ dead: 1 });
  });

  it('« réessayer plus tard » : reporté sans consommer d’essai', async () => {
    let calls = 0;
    const { engine, clock } = harness({
      behaviour: () => {
        calls += 1;
        return calls === 1 ? Promise.reject(new RetryLaterError('429', 90_000)) : Promise.resolve();
      },
    });
    await engine.enqueue(testDb.db, 'test.work', { key: 'a' });
    await engine.runTick();
    let job = await testDb.db.job.findFirstOrThrow();
    expect(job).toMatchObject({ status: 'PENDING', attempts: 0 });
    expect(job.runAt.getTime() - clock.now().getTime()).toBe(90_000);
    clock.advance(90_000);
    await engine.runTick();
    job = await testDb.db.job.findFirstOrThrow();
    expect(job).toMatchObject({ status: 'SUCCEEDED', attempts: 1 });
  });

  it('clé de concurrence : jamais deux jobs RUNNING pour la même clé', async () => {
    const running = new Set<string>();
    let maxParallel = 0;
    const { engine, engine2, runs } = harness({
      behaviour: async (payload) => {
        running.add(payload.key);
        maxParallel = Math.max(maxParallel, running.size);
        await new Promise((resolve) => setTimeout(resolve, 20));
        running.delete(payload.key);
      },
    });
    for (let index = 0; index < 6; index += 1) {
      await engine.enqueue(
        testDb.db,
        'test.work',
        { key: `k${String(index)}` },
        { concurrencyKey: 'carrier:1' },
      );
    }
    await Promise.all([engine.runTick(), engine2.runTick(), engine.runTick(), engine2.runTick()]);
    while ((await testDb.db.job.count({ where: { status: 'PENDING' } })) > 0) {
      await Promise.all([engine.runTick(), engine2.runTick()]);
    }
    expect(runs).toHaveLength(6);
    expect(maxParallel).toBe(1);
  });

  it('ticks concurrents : chaque job exécuté exactement une fois', async () => {
    const { engine, engine2, runs } = harness({
      behaviour: () => new Promise((resolve) => setTimeout(resolve, 2)),
    });
    for (let index = 0; index < 40; index += 1) {
      await engine.enqueue(testDb.db, 'test.work', { key: `j${String(index)}` });
    }
    await Promise.all([engine.runTick(), engine2.runTick(), engine.runTick(), engine2.runTick()]);
    expect(runs).toHaveLength(40);
    expect(new Set(runs.map((run) => run.key)).size).toBe(40);
  });

  it('bail expiré (worker disparu) : le job redevient disponible', async () => {
    const { engine, clock, runs } = harness({ leaseMs: 60_000 });
    await engine.enqueue(testDb.db, 'test.work', { key: 'a' });
    await testDb.db.job.updateMany({
      data: {
        status: 'RUNNING',
        attempts: 1,
        lockedBy: 'ghost',
        lockedUntil: new Date(clock.now().getTime() - 1),
      },
    });
    expect(await engine.runTick()).toMatchObject({ recovered: 1, succeeded: 1 });
    expect(runs).toEqual([{ key: 'a', attempt: 2 }]);
  });
});

describe('tâches planifiées', () => {
  it('déclenchées une seule fois par échéance, même avec deux workers', async () => {
    const { engine, engine2, clock } = harness({
      schedules: [{ name: 'test.scheduled', intervalSeconds: 3600 }],
    });
    await engine.ensureSchedules();
    await Promise.all([engine.runTick(), engine2.runTick(), engine.runTick()]);
    expect(await testDb.db.job.count({ where: { queue: 'test.scheduled' } })).toBe(1);
    clock.advance(1_800_000);
    await engine.runTick();
    expect(await testDb.db.job.count({ where: { queue: 'test.scheduled' } })).toBe(1);
    clock.advance(1_800_000);
    await engine.runTick();
    expect(await testDb.db.job.count({ where: { queue: 'test.scheduled' } })).toBe(2);
  });
});

describe('API des jobs', () => {
  it('dead-letter consultable, relance et abandon audités (OWNER/ADMIN)', async () => {
    const app = await buildApp(testDependencies({ db: testDb.db }));
    await app.ready();
    const admin = await signedInAs(testDb.db, ['ADMIN']);
    const dead = await testDb.db.job.create({
      data: {
        queue: 'maintenance.purge-sessions',
        payload: {},
        status: 'DEAD',
        attempts: 8,
        lastError: 'boom',
      },
    });
    const list = await app.inject({
      method: 'GET',
      url: '/v1/jobs?status=DEAD',
      headers: admin.headers,
    });
    expect(list.json<{ items: { id: string }[] }>().items.map((job) => job.id)).toContain(
      dead.id.toString(),
    );
    const retry = await app.inject({
      method: 'POST',
      url: `/v1/jobs/${dead.id.toString()}/retry`,
      headers: admin.headers,
    });
    expect(retry.json()).toMatchObject({ status: 'PENDING', attempts: 0 });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/v1/jobs/${dead.id.toString()}/retry`,
          headers: admin.headers,
        })
      ).statusCode,
    ).toBe(409);
    const cancel = await app.inject({
      method: 'POST',
      url: `/v1/jobs/${dead.id.toString()}/cancel`,
      headers: admin.headers,
      payload: { reason: 'obsolète' },
    });
    expect(cancel.json()).toMatchObject({ status: 'CANCELLED' });
    const audit = await testDb.db.auditLog.findMany({
      where: { entityType: 'Job', entityId: dead.id.toString() },
    });
    expect(audit.map((entry) => entry.action).sort()).toEqual(['job.cancelled', 'job.retried']);
    await app.close();
  });

  it('événement de test publié depuis l’API, relayé et traité par un tick lancé par un admin', async () => {
    const clock = fixedClock('2026-11-06T10:00:00Z');
    const app = await buildApp(testDependencies({ db: testDb.db, clock }));
    await app.ready();
    const admin = await signedInAs(testDb.db, ['ADMIN']);
    const published = await app.inject({
      method: 'POST',
      url: '/v1/jobs/test-event',
      headers: admin.headers,
    });
    expect(published.statusCode).toBe(202);
    const { outboxEventId } = published.json<{ outboxEventId: string }>();

    const tick = await app.inject({ method: 'POST', url: '/v1/jobs/tick', headers: admin.headers });
    expect(tick.statusCode).toBe(200);
    expect(tick.json()).toMatchObject({ relayed: 1, dead: 0 });
    expect(tick.json<{ succeeded: number }>().succeeded).toBeGreaterThanOrEqual(1);
    const processed = () =>
      testDb.db.auditLog.count({
        where: { action: SYSTEM_TEST_PROCESSED, entityId: outboxEventId },
      });
    expect(await processed()).toBe(1);

    // Nothing left to relay; the job handler itself is idempotent (at-least-once execution).
    const again = await app.inject({
      method: 'POST',
      url: '/v1/jobs/tick',
      headers: admin.headers,
    });
    expect(again.json()).toMatchObject({ relayed: 0 });
    const job = systemJobs[0];
    if (!job) throw new Error('system job missing');
    const context = { jobId: 1n, attempt: 2, db: testDb.db, clock, logger: memoryLogger().logger };
    await job.run({ outboxEventId }, context);
    expect(await processed()).toBe(1);

    const actions = await testDb.db.auditLog.findMany({
      where: { action: { in: ['jobs.tick', 'system.test_event.published'] } },
      select: { action: true, actorUserId: true },
    });
    expect(actions.filter((entry) => entry.action === 'jobs.tick')).toHaveLength(2);
    expect(actions.every((entry) => entry.actorUserId === admin.user.id)).toBe(true);
    await app.close();
  });

  it('relance d’un job : échéance = horloge de l’application (BUG-002)', async () => {
    const clock = fixedClock('2026-11-06T12:00:00Z');
    const app = await buildApp(testDependencies({ db: testDb.db, clock }));
    const owner = await signedInAs(testDb.db, ['OWNER']);
    const dead = await testDb.db.job.create({
      data: { queue: 'maintenance.purge-sessions', payload: {}, status: 'DEAD', attempts: 8 },
    });
    const retry = await app.inject({
      method: 'POST',
      url: `/v1/jobs/${dead.id.toString()}/retry`,
      headers: owner.headers,
    });
    expect(retry.json()).toMatchObject({ runAt: '2026-11-06T12:00:00.000Z' });
    await app.close();
  });

  it('tick : désactivé sans secret, refusé avec un mauvais secret, exécute un tour sinon', async () => {
    const secret = 'x'.repeat(40);
    const disabled = await buildApp(testDependencies({ db: testDb.db }));
    expect((await disabled.inject({ method: 'POST', url: '/v1/internal/tick' })).statusCode).toBe(
      404,
    );
    await disabled.close();

    const app = await buildApp(
      testDependencies({ db: testDb.db, config: testConfig({ tickSecret: secret }) }),
    );
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/internal/tick',
          headers: { 'x-tick-secret': 'nope' },
        })
      ).statusCode,
    ).toBe(401);
    await testDb.db.job.create({ data: { queue: 'maintenance.purge-rate-limits', payload: {} } });
    const ok = await app.inject({
      method: 'POST',
      url: '/v1/internal/tick',
      headers: { 'x-tick-secret': secret },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ succeeded: 1 });
    await app.close();
  });
});
