import { inngestSetupPingData, inngestSetupPingEvent } from '@/inngest/events';

import { inngest } from '../client';

export const inngestSetupPing = inngest.createFunction(
  {
    id: 'inngest-setup-ping',
    triggers: [inngestSetupPingEvent],
  },
  async ({ event, step }) => {
    const payload = inngestSetupPingData.parse(event.data);

    const response = await step.run('acknowledge-setup-event', async () => {
      return {
        acknowledgedAt: new Date().toISOString(),
        message: payload.message,
        requestedAt: payload.requestedAt ?? null,
      };
    });

    return response;
  },
);
