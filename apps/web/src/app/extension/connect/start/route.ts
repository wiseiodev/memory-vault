import { extensionConnectStartParams } from '@memory-vault/extension-contract';

import { withEvlog } from '@/lib/evlog';
import { isAllowedChromeExtensionId } from '@/lib/server/extensions/config';
import { createSignedConnectPayload } from '@/lib/server/extensions/connect-payload';

export const runtime = 'nodejs';

export const GET = withEvlog(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const parsed = extensionConnectStartParams.safeParse(
    Object.fromEntries(searchParams.entries()),
  );

  if (!parsed.success) {
    return new Response('Invalid extension connect parameters.', {
      status: 400,
    });
  }

  if (!isAllowedChromeExtensionId(parsed.data.extensionId)) {
    return new Response('This Chrome extension is not allowlisted.', {
      status: 403,
    });
  }

  const payload = createSignedConnectPayload(parsed.data);
  const redirectUrl = new URL('/app/extension/connect', request.url);

  redirectUrl.searchParams.set('payload', payload);

  return Response.redirect(redirectUrl, 302);
});
