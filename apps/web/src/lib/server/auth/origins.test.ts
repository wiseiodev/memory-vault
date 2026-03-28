import { describe, expect, it } from 'vitest';

import { buildTrustedOrigins } from './origins';

describe('buildTrustedOrigins', () => {
  it('includes localhost and normalizes configured origins', () => {
    expect(
      buildTrustedOrigins({
        baseUrl: 'https://memoryapp.ai/api/auth',
        vercelUrl: 'memory-vault-git-auth-preview-wiseiodev.vercel.app',
      }),
    ).toEqual([
      'http://localhost:3000',
      'https://memoryapp.ai',
      'https://memory-vault-git-auth-preview-wiseiodev.vercel.app',
    ]);
  });

  it('ignores invalid origin input', () => {
    expect(
      buildTrustedOrigins({
        baseUrl: 'not-a-url',
      }),
    ).toEqual(['http://localhost:3000']);
  });
});
