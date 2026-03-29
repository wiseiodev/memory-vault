/**
 * @vitest-environment node
 */

import { describe, expect, it } from 'vitest';

import { createInngestClientOptions } from './client';

function createEnv(overrides: Partial<NodeJS.ProcessEnv>): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    ...overrides,
  };
}

describe('createInngestClientOptions', () => {
  it('enables dev mode without requiring keys', () => {
    expect(
      createInngestClientOptions(
        createEnv({
          INNGEST_DEV: '1',
        }),
      ),
    ).toEqual({
      checkpointing: {
        maxRuntime: '240s',
      },
      id: 'memory-vault-web',
      isDev: true,
    });
  });

  it('trims configured cloud credentials and base URL', () => {
    expect(
      createInngestClientOptions(
        createEnv({
          INNGEST_BASE_URL: ' http://localhost:8288 ',
          INNGEST_EVENT_KEY: ' evt_test ',
          INNGEST_SIGNING_KEY: ' signkey_test ',
          INNGEST_SIGNING_KEY_FALLBACK: ' signkey_fallback ',
        }),
      ),
    ).toEqual({
      baseUrl: 'http://localhost:8288',
      checkpointing: {
        maxRuntime: '240s',
      },
      eventKey: 'evt_test',
      id: 'memory-vault-web',
      signingKey: 'signkey_test',
      signingKeyFallback: 'signkey_fallback',
    });
  });
});
