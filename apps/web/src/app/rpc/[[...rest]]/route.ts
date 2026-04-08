import { ORPCError, onError } from '@orpc/server';
import { RPCHandler } from '@orpc/server/fetch';
import { getRequestLogger, withEvlog } from '@/lib/evlog';
import {
  applyExtensionCorsHeaders,
  getExtensionCorsHeaders,
} from '@/lib/server/extensions/cors';
import { appRouter } from '@/rpc/router';

export const runtime = 'nodejs';

const expectedCodes = new Set([
  'BAD_REQUEST',
  'CONFLICT',
  'FORBIDDEN',
  'NOT_FOUND',
  'UNAUTHORIZED',
]);

const handler = new RPCHandler(appRouter, {
  interceptors: [
    onError((error) => {
      if (error instanceof ORPCError && expectedCodes.has(error.code)) {
        return;
      }

      getRequestLogger().error(
        error instanceof Error ? error : new Error('Unknown RPC error'),
        {
          action: 'rpc.unexpected_error',
        },
      );
    }),
  ],
});

const handleRequest = withEvlog(async (request: Request) => {
  if (request.method === 'OPTIONS') {
    const corsHeaders = getExtensionCorsHeaders(request.headers.get('origin'));

    return new Response(null, {
      headers: corsHeaders ?? {},
      status: corsHeaders ? 204 : 403,
    });
  }

  const { response } = await handler.handle(request, {
    prefix: '/rpc',
    context: { headers: request.headers },
  });

  return applyExtensionCorsHeaders(
    response ?? new Response('Not found', { status: 404 }),
    request.headers.get('origin'),
  );
});

export const GET = handleRequest;
export const OPTIONS = handleRequest;
export const POST = handleRequest;
