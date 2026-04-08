import 'server-only';

import { isAllowedChromeExtensionOrigin } from './config';

export function getExtensionCorsHeaders(origin: string | null) {
  if (!origin || !isAllowedChromeExtensionOrigin(origin)) {
    return null;
  }

  return {
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  } satisfies Record<string, string>;
}

export function applyExtensionCorsHeaders(
  response: Response,
  origin: string | null,
) {
  const corsHeaders = getExtensionCorsHeaders(origin);

  if (!corsHeaders) {
    return response;
  }

  const nextResponse = new Response(response.body, response);

  for (const [key, value] of Object.entries(corsHeaders)) {
    nextResponse.headers.set(key, value);
  }

  return nextResponse;
}
