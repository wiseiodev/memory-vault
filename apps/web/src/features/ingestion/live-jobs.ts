import type { IngestionJobListItem, RetryIngestionJobResult } from './schemas';

const ingestionJobStageRank: Record<IngestionJobListItem['stage'], number> = {
  complete: 4,
  embed: 2,
  extract: 0,
  promote: 3,
  segment: 1,
};

const ingestionJobStatusRank: Record<IngestionJobListItem['status'], number> = {
  canceled: 3,
  failed: 3,
  queued: 0,
  running: 1,
  succeeded: 3,
};

function sortJobsDescByCreatedAt(jobs: IngestionJobListItem[]) {
  return [...jobs].sort(
    (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt),
  );
}

function shouldReplaceIngestionJob(
  currentJob: IngestionJobListItem,
  candidateJob: IngestionJobListItem,
) {
  const currentUpdatedAt = Date.parse(currentJob.updatedAt);
  const candidateUpdatedAt = Date.parse(candidateJob.updatedAt);

  if (candidateUpdatedAt !== currentUpdatedAt) {
    return candidateUpdatedAt > currentUpdatedAt;
  }

  if (candidateJob.attemptCount !== currentJob.attemptCount) {
    return candidateJob.attemptCount > currentJob.attemptCount;
  }

  if (
    ingestionJobStatusRank[candidateJob.status] !==
    ingestionJobStatusRank[currentJob.status]
  ) {
    return (
      ingestionJobStatusRank[candidateJob.status] >
      ingestionJobStatusRank[currentJob.status]
    );
  }

  if (
    ingestionJobStageRank[candidateJob.stage] !==
    ingestionJobStageRank[currentJob.stage]
  ) {
    return (
      ingestionJobStageRank[candidateJob.stage] >
      ingestionJobStageRank[currentJob.stage]
    );
  }

  return true;
}

export function upsertIngestionJob(
  jobs: IngestionJobListItem[],
  update: IngestionJobListItem,
) {
  const existingJob = jobs.find((job) => job.jobId === update.jobId);

  if (existingJob && !shouldReplaceIngestionJob(existingJob, update)) {
    return sortJobsDescByCreatedAt(jobs);
  }

  return sortJobsDescByCreatedAt([
    update,
    ...jobs.filter((job) => job.jobId !== update.jobId),
  ]);
}

export function queueRetriedIngestionJob(
  jobs: IngestionJobListItem[],
  result: RetryIngestionJobResult,
  updatedAt: string,
) {
  return jobs.map((job) =>
    job.jobId === result.jobId
      ? {
          ...job,
          errorCode: null,
          errorMessage: null,
          finishedAt: null,
          stage: result.stage,
          status: result.status,
          updatedAt,
        }
      : job,
  );
}
