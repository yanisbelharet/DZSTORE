import { AppError, isAppError } from '@dz/core/errors';
import type { ErrorCode, ErrorDetails } from '@dz/core/errors';
import type { ApiError } from '@dz/contracts';
import { Prisma } from '@dz/db';
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
} from 'fastify-type-provider-zod';

const GENERIC_MESSAGES: Partial<Record<ErrorCode, string>> = {
  BAD_REQUEST: 'Malformed request',
  NOT_FOUND: 'Resource not found',
  PAYLOAD_TOO_LARGE: 'Request body too large',
  UNSUPPORTED_MEDIA_TYPE: 'Unsupported content type',
  RATE_LIMITED: 'Too many requests',
  INTERNAL: 'Internal server error',
};

const FRAMEWORK_STATUS_CODES: Partial<Record<number, ErrorCode>> = {
  400: 'BAD_REQUEST',
  404: 'NOT_FOUND',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  429: 'RATE_LIMITED',
};

interface MappedError {
  status: number;
  code: ErrorCode;
  message: string;
  details?: ErrorDetails;
}

function generic(code: ErrorCode): MappedError {
  const status = new AppError(code, '').status;
  return { status, code, message: GENERIC_MESSAGES[code] ?? 'Request failed' };
}

function mapError(error: unknown): MappedError {
  if (hasZodFastifySchemaValidationErrors(error)) {
    // Paths, codes and Zod messages only: submitted values are never echoed.
    const issues = error.validation.map((item) => ({
      in: error.validationContext ?? 'body',
      path: item.instancePath.replace(/^\//u, '').replaceAll('/', '.'),
      code: item.keyword,
      message: item.message,
    }));
    return {
      status: 422,
      code: 'VALIDATION_FAILED',
      message: 'Request validation failed',
      details: { issues },
    };
  }
  if (isAppError(error)) {
    return error.expose
      ? {
          status: error.status,
          code: error.code,
          message: error.message,
          ...(error.details === undefined ? {} : { details: error.details }),
        }
      : generic(error.code === 'INVALID_CONFIGURATION' ? 'INTERNAL' : error.code);
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // Safety net when a service did not translate the error itself.
    if (error.code === 'P2002')
      return { status: 409, code: 'CONFLICT', message: 'Resource already exists' };
    if (error.code === 'P2025') return generic('NOT_FOUND');
  }
  if (isResponseSerializationError(error)) return generic('INTERNAL');
  const statusCode = (error as Partial<FastifyError>).statusCode;
  const frameworkCode = statusCode === undefined ? undefined : FRAMEWORK_STATUS_CODES[statusCode];
  return frameworkCode === undefined ? generic('INTERNAL') : generic(frameworkCode);
}

function envelope(mapped: MappedError, requestId: string): ApiError {
  return {
    error: {
      code: mapped.code,
      message: mapped.message,
      ...(mapped.details === undefined ? {} : { details: mapped.details }),
      requestId,
    },
  };
}

export function errorHandler(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  const mapped = mapError(error);
  if (mapped.status >= 500) request.log.error({ err: error }, 'request failed');
  return reply.status(mapped.status).send(envelope(mapped, request.id));
}

export function notFoundHandler(request: FastifyRequest, reply: FastifyReply) {
  return reply.status(404).send(envelope(generic('NOT_FOUND'), request.id));
}
