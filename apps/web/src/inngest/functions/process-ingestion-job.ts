import { createIngestionRepository } from '@/features/ingestion/repository';
import { processIngestionJob } from '@/features/ingestion/service';
import { ingestionJobRequestedEvent } from '@/inngest/events';
import {
  ingestionJobsChannel,
  ingestionJobUpsertTopicName,
} from '@/inngest/realtime';

import { inngest } from '../client';

export const processIngestionJobFunction = inngest.createFunction(
  {
    concurrency: [
      {
        key: 'event.data.jobId',
        limit: 1,
      },
    ],
    id: 'process-ingestion-job',
    retries: 0,
    triggers: [ingestionJobRequestedEvent],
  },
  async ({ event, step }) => {
    const jobId = event.data.jobId;
    const repository = createIngestionRepository();

    return processIngestionJob(
      {
        jobId,
      },
      {
        loadJobRealtimeTarget: ({ jobId: realtimeJobId, stepId }) =>
          step.run(stepId, async () =>
            repository.getJobRealtimeTarget({
              jobId: realtimeJobId,
            }),
          ),
        now: () => new Date(),
        publishJobUpdate: ({ stepId, update }) =>
          step.realtime
            .publish(
              stepId,
              ingestionJobsChannel({
                userId: update.userId,
              })[ingestionJobUpsertTopicName],
              update.job,
            )
            .then(() => undefined),
        repository,
        run: async (stepId, fn) => {
          return (await step.run(stepId, fn)) as Awaited<ReturnType<typeof fn>>;
        },
      },
    );
  },
);
