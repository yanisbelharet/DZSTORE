import { createHash, createHmac } from 'node:crypto';

/**
 * AWS Signature Version 4 for S3-compatible object storage (Cloudflare R2), header-based
 * authentication. Implemented here instead of the AWS SDK (≈ 3 MB) for four calls
 * (PutObject, GetObject, DeleteObject). Reference: AWS « Signature Calculations for the
 * Authorization Header » (S3 API reference); verified against its published example.
 */
export interface SigV4Credentials {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service?: string;
}

export interface SigV4Request {
  method: string;
  url: URL;
  /** Headers to sign (lower-case names are not required). `host` is added automatically. */
  headers: Record<string, string>;
  /** Hex SHA-256 of the body (`UNSIGNED-PAYLOAD` is not used). */
  payloadHash: string;
}

export const sha256Hex = (data: string | Uint8Array): string =>
  createHash('sha256').update(data).digest('hex');
const hmac = (key: string | Buffer, data: string): Buffer =>
  createHmac('sha256', key).update(data).digest();

/** RFC 3986 encoding as S3 expects it (each path segment, `/` kept). */
const encodeSegment = (segment: string): string =>
  encodeURIComponent(segment).replace(
    /[!'()*]/gu,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );

/** `20130524T000000Z` */
export const amzDate = (date: Date): string =>
  date
    .toISOString()
    .replace(/[-:]/gu, '')
    .replace(/\.\d{3}/u, '');

/** Returns the headers to send, including `x-amz-date` and `authorization`. */
export function signRequest(
  request: SigV4Request,
  credentials: SigV4Credentials,
  now: Date,
): Record<string, string> {
  const service = credentials.service ?? 's3';
  const stamp = amzDate(now);
  const day = stamp.slice(0, 8);
  const headers: Record<string, string> = {
    host: request.url.host,
    'x-amz-content-sha256': request.payloadHash,
    'x-amz-date': stamp,
  };
  for (const [name, value] of Object.entries(request.headers)) {
    headers[name.toLowerCase()] = value.trim().replace(/\s+/gu, ' ');
  }
  const names = Object.keys(headers).sort();
  const canonicalPath = request.url.pathname
    .split('/')
    .map((segment) => encodeSegment(decodeURIComponent(segment)))
    .join('/');
  const canonicalQuery = [...request.url.searchParams]
    .map(([key, value]) => [encodeSegment(key), encodeSegment(value)] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  const canonicalRequest = [
    request.method.toUpperCase(),
    canonicalPath,
    canonicalQuery,
    names.map((name) => `${name}:${headers[name] ?? ''}\n`).join(''),
    names.join(';'),
    request.payloadHash,
  ].join('\n');
  const scope = `${day}/${credentials.region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', stamp, scope, sha256Hex(canonicalRequest)].join('\n');
  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${credentials.secretAccessKey}`, day), credentials.region), service),
    'aws4_request',
  );
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  // `host` is signed but set by fetch itself from the URL.
  const sent = Object.fromEntries(Object.entries(headers).filter(([name]) => name !== 'host'));
  return {
    ...sent,
    authorization: `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}`,
  };
}
