import { describe, expect, it } from 'vitest';

import { amzDate, sha256Hex, signRequest } from './sigv4.ts';

// Example credentials published in the AWS documentation (not a secret).
const AWS_EXAMPLE = {
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  region: 'us-east-1',
};

describe('signature AWS SigV4', () => {
  it('reproduit l’exemple officiel « GET Object » de la documentation S3', () => {
    const headers = signRequest(
      {
        method: 'GET',
        url: new URL('https://examplebucket.s3.amazonaws.com/test.txt'),
        headers: { Range: 'bytes=0-9' },
        payloadHash: sha256Hex(''),
      },
      AWS_EXAMPLE,
      new Date('2013-05-24T00:00:00Z'),
    );
    expect(headers.authorization).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41',
    );
    expect(headers['x-amz-date']).toBe('20130524T000000Z');
  });

  it('format de date et empreinte du corps vide', () => {
    expect(amzDate(new Date('2026-11-12T08:09:10.123Z'))).toBe('20261112T080910Z');
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
});
