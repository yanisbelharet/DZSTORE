import type { Clock } from '@dz/core';
import { AppError } from '@dz/core/errors';
import type { Logger } from '@dz/core/logger';
import type { DbClient } from '@dz/db';
import type { z } from 'zod';

export interface JobContext {
  jobId: bigint;
  attempt: number;
  db: DbClient;
  clock: Clock;
  logger: Logger;
}

/** A registered job: payload validated by Zod when enqueued and again when run. */
export interface JobDefinition {
  name: string;
  maxAttempts?: number;
  validate(payload: unknown): unknown;
  run(payload: unknown, context: JobContext): Promise<void>;
}

export function defineJob<Schema extends z.ZodType>(definition: {
  name: string;
  payload: Schema;
  maxAttempts?: number;
  handler: (payload: z.output<Schema>, context: JobContext) => Promise<void>;
}): JobDefinition {
  return {
    name: definition.name,
    ...(definition.maxAttempts === undefined ? {} : { maxAttempts: definition.maxAttempts }),
    validate: (payload) => definition.payload.parse(payload),
    run: (payload, context) => definition.handler(definition.payload.parse(payload), context),
  };
}

export class JobRegistry {
  readonly #definitions = new Map<string, JobDefinition>();

  constructor(definitions: readonly JobDefinition[] = []) {
    for (const definition of definitions) this.register(definition);
  }

  register(definition: JobDefinition): this {
    if (this.#definitions.has(definition.name)) {
      throw new Error(`Job "${definition.name}" is registered twice`);
    }
    this.#definitions.set(definition.name, definition);
    return this;
  }

  get(name: string): JobDefinition {
    const definition = this.#definitions.get(name);
    if (!definition) throw new AppError('INTERNAL', `Unknown job "${name}"`);
    return definition;
  }

  has(name: string): boolean {
    return this.#definitions.has(name);
  }
}
