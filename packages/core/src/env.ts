import { z } from 'zod';

import { AppError } from './errors.ts';

export const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

/** Variables shared by every process. Apps extend it with their own schema. */
export const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
});

export type EnvSource = Readonly<Record<string, string | undefined>>;

const MASK = '[masked]';

/**
 * Validates the environment once at startup and fails with the list of invalid variables.
 * Values are never echoed: any occurrence of the raw value in a validation message is masked.
 */
export function loadEnv<Schema extends z.ZodType>(
  schema: Schema,
  source: EnvSource = process.env,
): z.output<Schema> {
  const result = schema.safeParse(source);
  if (result.success) return result.data;

  const problems = result.error.issues.map((issue) => {
    const name = issue.path.map(String).join('.') || '(root)';
    const raw = source[name];
    const hint = raw ? issue.message.split(raw).join(MASK) : issue.message;
    return { name, hint };
  });
  const summary = problems.map(({ name, hint }) => `${name} (${hint})`).join('; ');
  throw new AppError('INVALID_CONFIGURATION', `Invalid environment configuration: ${summary}`, {
    details: { variables: problems.map(({ name }) => name) },
  });
}
