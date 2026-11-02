import { ROLES } from '@dz/domain';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { requireAuth } from '../auth/context.ts';
import {
  createUser,
  getUser,
  listUsers,
  resetPassword,
  resetTwoFactor,
  updateUser,
} from './service.ts';
import type { UsersDependencies } from './service.ts';

const role = z.enum(ROLES);
const locale = z.enum(['fr', 'en', 'ar']);
const idParams = z.object({ id: z.uuid() });
const userDto = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  roles: z.array(role),
  locale,
  isActive: z.boolean(),
  storeIds: z.array(z.string()),
  totpEnabled: z.boolean(),
  lastLoginAt: z.string().nullable(),
  createdAt: z.string(),
});

const read = { access: { permission: 'users.read' } } as const;
const manage = { access: { permission: 'users.manage' } } as const;

/** /v1/users — account management (OWNER/ADMIN; ADMIN manages agents only). */
export const usersRoutes: FastifyPluginAsyncZod<{ deps: UsersDependencies }> = (app, { deps }) => {
  app.get(
    '/',
    {
      config: read,
      schema: {
        tags: ['users'],
        querystring: z.object({
          q: z.string().trim().min(1).max(100).optional(),
          role: role.optional(),
          active: z
            .enum(['true', 'false'])
            .transform((value) => value === 'true')
            .optional(),
          cursor: z.uuid().optional(),
          limit: z.coerce.number().int().min(1).max(200).default(50),
        }),
        response: { 200: z.object({ items: z.array(userDto), nextCursor: z.string().nullable() }) },
      },
    },
    (request) => listUsers(deps, request.query),
  );

  app.get(
    '/:id',
    { config: read, schema: { tags: ['users'], params: idParams, response: { 200: userDto } } },
    (request) => getUser(deps, request.params.id),
  );

  app.post(
    '/',
    {
      config: manage,
      schema: {
        tags: ['users'],
        body: z.object({
          email: z.string().trim().toLowerCase().pipe(z.email()),
          name: z.string().trim().min(2).max(100),
          roles: z.array(role).min(1).max(4),
          locale: z.enum(['fr', 'en']).default('fr'),
          storeIds: z.array(z.uuid()).max(100).default([]),
          password: z.string().min(1).max(256),
        }),
        response: { 201: userDto },
      },
    },
    async (request, reply) => {
      const user = await createUser(deps, requireAuth(request), request.body);
      return reply.status(201).send(user);
    },
  );

  app.patch(
    '/:id',
    {
      config: manage,
      schema: {
        tags: ['users'],
        params: idParams,
        body: z
          .object({
            name: z.string().trim().min(2).max(100).optional(),
            roles: z.array(role).min(1).max(4).optional(),
            locale: z.enum(['fr', 'en']).optional(),
            storeIds: z.array(z.uuid()).max(100).optional(),
            isActive: z.boolean().optional(),
          })
          .refine((body) => Object.keys(body).length > 0, { error: 'nothing to update' }),
        response: { 200: userDto },
      },
    },
    (request) => updateUser(deps, requireAuth(request), request.params.id, request.body),
  );

  app.post(
    '/:id/reset-password',
    {
      config: manage,
      schema: {
        tags: ['users'],
        params: idParams,
        body: z.object({ newPassword: z.string().min(1).max(256) }),
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      await resetPassword(deps, requireAuth(request), request.params.id, request.body.newPassword);
      return reply.status(204).send(null);
    },
  );

  app.post(
    '/:id/reset-2fa',
    { config: manage, schema: { tags: ['users'], params: idParams, response: { 204: z.null() } } },
    async (request, reply) => {
      await resetTwoFactor(deps, requireAuth(request), request.params.id);
      return reply.status(204).send(null);
    },
  );

  return Promise.resolve();
};
