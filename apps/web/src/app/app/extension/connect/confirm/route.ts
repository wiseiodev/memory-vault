import { withEvlog } from '@/lib/evlog';
import { getApiSession } from '@/lib/server/auth/session';
import { issueDeviceToken } from '@/lib/server/device-tokens';
import { buildChromeExtensionCallbackUrl } from '@/lib/server/extensions/config';
import { verifySignedConnectPayload } from '@/lib/server/extensions/connect-payload';

export const runtime = 'nodejs';

export const POST = withEvlog(async (request: Request) => {
  const formData = await request.formData();
  const payloadValue = formData.get('payload');
  const rawPayload = typeof payloadValue === 'string' ? payloadValue : null;
  const payload = verifySignedConnectPayload(rawPayload);

  if (!payload) {
    return new Response('Extension pairing payload expired.', {
      status: 400,
    });
  }

  const session = await getApiSession(request.headers);

  if (!session?.user) {
    const callbackPath = `/app/extension/connect?payload=${encodeURIComponent(rawPayload ?? '')}`;

    return Response.redirect(
      new URL(
        `/login?callback=${encodeURIComponent(callbackPath)}`,
        request.url,
      ),
      303,
    );
  }

  const issuedToken = await issueDeviceToken({
    browserVersion: payload.browserVersion,
    deviceLabel: payload.deviceLabel,
    extensionId: payload.extensionId,
    extensionVersion: payload.extensionVersion,
    userId: session.user.id,
  });

  const callbackUrl = new URL(
    buildChromeExtensionCallbackUrl({
      callbackPath: payload.callbackPath,
      extensionId: payload.extensionId,
    }),
  );
  const hash = new URLSearchParams({
    deviceTokenId: issuedToken.deviceTokenId,
    spaceId: issuedToken.spaceId,
    state: payload.state,
    token: issuedToken.rawToken,
  });

  callbackUrl.hash = hash.toString();

  return Response.redirect(callbackUrl, 303);
});
