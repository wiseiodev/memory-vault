import { processIngestionJob } from '@/features/ingestion/service';
import { ingestionJobRequestedEventName } from '@/inngest/events';

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
  },
  { event: ingestionJobRequestedEventName },
  async ({ event, step }) => {
    const jobId = event.data.jobId;

    const result = await step.run('process-ingestion-job', async () => {
      return processIngestionJob({
        jobId,
      });
    });

    return result;
  },
);
