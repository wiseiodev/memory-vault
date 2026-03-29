import { ORPCError, onError } from '@orpc/server';
import { RPCHandler } from '@orpc/server/fetch';
import { getRequestLogger, withEvlog } from '@/lib/evlog';
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
  const { response } = await handler.handle(request, {
    prefix: '/rpc',
    context: { headers: request.headers },
  });

  return response ?? new Response('Not found', { status: 404 });
});

export const GET = handleRequest;
export const POST = handleRequest;
