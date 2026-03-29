import { realtime } from 'inngest';

import { ingestionJobListItem } from '@/features/ingestion/schemas';

export const ingestionJobUpsertTopicName = 'job-upsert';

export const ingestionJobsChannel = realtime.channel({
  name: (params: { userId: string }) => `ingestion:${params.userId}`,
  topics: {
    [ingestionJobUpsertTopicName]: {
      schema: ingestionJobListItem,
    },
  },
});
