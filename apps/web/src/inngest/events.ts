import { z } from 'zod';

export const inngestSetupPingEventName = 'app/inngest.setup.ping';
export const ingestionJobRequestedEventName = 'app/ingestion.job.requested';

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

export const ingestionJobRequestedData = z.object({
  jobId: z.string().min(1),
});

export type IngestionJobRequestedData = z.infer<
  typeof ingestionJobRequestedData
>;

export function createIngestionJobRequestedEvent(
  input: IngestionJobRequestedData & { id: string },
) {
  return {
    data: ingestionJobRequestedData.parse({
      jobId: input.jobId,
    }),
    id: input.id,
    name: ingestionJobRequestedEventName,
  };
}
