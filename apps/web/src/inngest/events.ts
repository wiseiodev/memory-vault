import { z } from 'zod';

export const inngestSetupPingEventName = 'app/inngest.setup.ping';

export const inngestSetupPingData = z.object({
  message: z.string().min(1),
  requestedAt: z.string().datetime().optional(),
});

export type InngestSetupPingData = z.infer<typeof inngestSetupPingData>;

export function createInngestSetupPingEvent(data: InngestSetupPingData) {
  return {
    data: inngestSetupPingData.parse(data),
    name: inngestSetupPingEventName,
  };
}
