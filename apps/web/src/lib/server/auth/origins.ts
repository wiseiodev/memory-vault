function toOrigin(url: string) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

type BuildTrustedOriginsInput = {
  baseUrl?: string;
  vercelUrl?: string;
};

export function buildTrustedOrigins({
  baseUrl,
  vercelUrl,
}: BuildTrustedOriginsInput) {
  const origins = new Set<string>(['http://localhost:3000']);

  const normalizedBaseUrl = baseUrl ? toOrigin(baseUrl) : null;
  if (normalizedBaseUrl) {
    origins.add(normalizedBaseUrl);
  }

  if (vercelUrl) {
    const normalizedVercelUrl = toOrigin(`https://${vercelUrl}`);
    if (normalizedVercelUrl) {
      origins.add(normalizedVercelUrl);
    }
  }

  return [...origins];
}
