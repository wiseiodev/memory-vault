import { eventType } from 'inngest';
import { z } from 'zod';

export const inngestSetupPingEvent = eventType('app/inngest.setup.ping', {
  schema: z.object({
    message: z.string().min(1),
    requestedAt: z.string().datetime().optional(),
  }),
});

export const ingestionJobRequestedEvent = eventType(
  'app/ingestion.job.requested',
  {
    schema: z.object({
      jobId: z.string().min(1),
    }),
  },
);

export const inngestSetupPingEventName = inngestSetupPingEvent.name;
export const ingestionJobRequestedEventName = ingestionJobRequestedEvent.name;

export const inngestSetupPingData = inngestSetupPingEvent.schema;

export type InngestSetupPingData = z.infer<typeof inngestSetupPingData>;

export function createInngestSetupPingEvent(data: InngestSetupPingData) {
  return inngestSetupPingEvent.create(data);
}

export const ingestionJobRequestedData = ingestionJobRequestedEvent.schema;

export type IngestionJobRequestedData = z.infer<
  typeof ingestionJobRequestedData
>;

export function createIngestionJobRequestedEvent(
  input: IngestionJobRequestedData & { id: string },
) {
  return ingestionJobRequestedEvent.create(
    {
      jobId: input.jobId,
    },
    {
      id: input.id,
    },
  );
}
