import { authed } from '@/rpc/procedures';

import {
  listRecentIngestionJobsOutput,
  retryIngestionJobInput,
  retryIngestionJobOutput,
} from './schemas';
import { listRecentIngestionJobs, retryIngestionJob } from './service';

export const ingestionRouter = {
  listRecent: authed
    .output(listRecentIngestionJobsOutput)
    .handler(async ({ context }) => {
      return listRecentIngestionJobs({
        userId: context.user.id,
      });
    }),
  retry: authed
    .input(retryIngestionJobInput)
    .output(retryIngestionJobOutput)
    .handler(async ({ context, input }) => {
      return retryIngestionJob({
        jobId: input.jobId,
        userId: context.user.id,
      });
    }),
};
