import { getClientSubscriptionToken } from 'inngest/react';
import { inngest } from '@/inngest/client';
import {
  ingestionJobsChannel,
  ingestionJobUpsertTopicName,
} from '@/inngest/realtime';
import { getApiSession } from '@/lib/server/auth/session';

export const runtime = 'nodejs';

const noStoreHeaders = {
  'Cache-Control': 'private, no-store, max-age=0',
};

export async function GET(request: Request) {
  const session = await getApiSession(request.headers);

  if (!session) {
    return Response.json(
      {
        message: 'Authentication required.',
      },
      {
        headers: noStoreHeaders,
        status: 401,
      },
    );
  }

  const token = await getClientSubscriptionToken(inngest, {
    channel: ingestionJobsChannel({
      userId: session.user.id,
    }),
    topics: [ingestionJobUpsertTopicName],
  });

  return Response.json(token, {
    headers: noStoreHeaders,
  });
}
