import { Inngest } from 'inngest';

type InngestEnv = NodeJS.ProcessEnv;

export function createInngestClientOptions(env: InngestEnv = process.env) {
  const baseUrl = env.INNGEST_BASE_URL?.trim() || undefined;
  const eventKey = env.INNGEST_EVENT_KEY?.trim() || undefined;
  const signingKey = env.INNGEST_SIGNING_KEY?.trim() || undefined;
  const signingKeyFallback =
    env.INNGEST_SIGNING_KEY_FALLBACK?.trim() || undefined;

  return {
    checkpointing: {
      maxRuntime: '240s',
    },
    id: 'memory-vault-web',
    ...(baseUrl ? { baseUrl } : {}),
    ...(env.INNGEST_DEV === '1' ? { isDev: true as const } : {}),
    ...(eventKey ? { eventKey } : {}),
    ...(signingKey ? { signingKey } : {}),
    ...(signingKeyFallback ? { signingKeyFallback } : {}),
  };
}

export const inngest = new Inngest(createInngestClientOptions());
