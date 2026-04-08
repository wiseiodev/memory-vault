import 'server-only';

function isSafeAppPathname(pathname: string) {
  return pathname === '/app' || pathname.startsWith('/app/');
}

export function sanitizeAppCallbackPath(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    const candidate = new URL(value, 'https://memory-vault.local');

    if (
      candidate.origin !== 'https://memory-vault.local' ||
      !isSafeAppPathname(candidate.pathname)
    ) {
      return null;
    }

    return `${candidate.pathname}${candidate.search}${candidate.hash}`;
  } catch {
    return null;
  }
}
