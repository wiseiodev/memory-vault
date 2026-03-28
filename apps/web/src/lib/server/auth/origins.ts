function toOrigin(url: string) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function toHost(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

type BuildBaseUrlOptionsInput = {
  baseUrl?: string;
  nodeEnv?: string;
};

export function buildBaseUrlOptions({
  baseUrl,
  nodeEnv = process.env.NODE_ENV,
}: BuildBaseUrlOptionsInput) {
  const allowedHosts = new Set<string>([
    'localhost:*',
    '127.0.0.1:*',
    '*.vercel.app',
  ]);

  const fallback = baseUrl ? toOrigin(baseUrl) : null;
  const fallbackHost = baseUrl ? toHost(baseUrl) : null;

  if (fallbackHost) {
    allowedHosts.add(fallbackHost);
  }

  return {
    allowedHosts: [...allowedHosts],
    fallback: fallback ?? undefined,
    protocol:
      nodeEnv === 'development' ? ('http' as const) : ('https' as const),
  };
}
