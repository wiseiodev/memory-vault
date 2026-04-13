import '@/rpc/server-client';

import { withEvlog } from '@/lib/evlog';
import { rpc } from '@/rpc/client';

export const runtime = 'nodejs';

export const GET = withEvlog(async () => {
  const manifest = await rpc.account.export();

  const timestamp = new Date()
    .toISOString()
    .replaceAll(':', '-')
    .replace('.', '-');

  return new Response(JSON.stringify(manifest, null, 2), {
    headers: {
      'cache-control': 'no-store',
      'content-disposition': `attachment; filename="memory-vault-export-${timestamp}.json"`,
      'content-type': 'application/json; charset=utf-8',
    },
  });
});
