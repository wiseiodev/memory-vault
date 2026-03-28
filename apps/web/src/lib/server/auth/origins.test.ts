import { describe, expect, it } from 'vitest';

import { buildBaseUrlOptions } from './origins';

describe('buildBaseUrlOptions', () => {
  it('builds allowed hosts and a fallback for production-style URLs', () => {
    expect(
      buildBaseUrlOptions({
        baseUrl: 'https://memoryapp.ai/api/auth',
        nodeEnv: 'production',
      }),
    ).toEqual({
      allowedHosts: [
        'localhost:*',
        '127.0.0.1:*',
        '*.vercel.app',
        'memoryapp.ai',
      ],
      fallback: 'https://memoryapp.ai',
      protocol: 'https',
    });
  });

  it('uses localhost-friendly protocol and omits invalid fallback input', () => {
    expect(
      buildBaseUrlOptions({
        baseUrl: 'not-a-url',
        nodeEnv: 'development',
      }),
    ).toEqual({
      allowedHosts: ['localhost:*', '127.0.0.1:*', '*.vercel.app'],
      fallback: undefined,
      protocol: 'http',
    });
  });
});
