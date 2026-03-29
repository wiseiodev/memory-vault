import type { IngestionJobListItem, RetryIngestionJobResult } from '../schemas';
import { RetryIngestionJobButton } from './retry-ingestion-job-button';

type IngestionJobsCardProps = {
  jobs: IngestionJobListItem[];
  onRetryQueued?: (result: RetryIngestionJobResult) => void;
};

export function IngestionJobsCard({
  jobs,
  onRetryQueued,
}: IngestionJobsCardProps) {
  return (
    <article className='min-w-0 rounded-3xl border border-slate-200/80 bg-white/90 p-5'>
      <div className='space-y-2'>
        <h3 className='text-sm font-semibold uppercase tracking-[0.18em] text-slate-500'>
          LAB-119 ingestion jobs
        </h3>
        <p className='text-sm leading-7 text-slate-700'>
          Notes now enqueue durable ingestion work in Inngest. URLs and uploads
          share the same job surface, but still fail with an explicit
          not-implemented extraction error until their processors exist.
        </p>
      </div>

      {jobs.length === 0 ? (
        <p className='mt-4 text-sm text-slate-600'>
          No ingestion jobs have been created yet.
        </p>
      ) : (
        <div className='mt-5 space-y-4'>
          {jobs.map((job) => (
            <div
              key={job.jobId}
              className='grid gap-4 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)]'
            >
              <div className='min-w-0 space-y-3'>
                <div className='flex flex-wrap items-center gap-2'>
                  <span className='inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600'>
                    {job.sourceKind ?? 'unknown source'}
                  </span>
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${
                      job.status === 'succeeded'
                        ? 'bg-emerald-100 text-emerald-900'
                        : job.status === 'failed'
                          ? 'bg-rose-100 text-rose-900'
                          : job.status === 'running'
                            ? 'bg-sky-100 text-sky-900'
                            : 'bg-amber-100 text-amber-900'
                    }`}
                  >
                    {job.status}
                  </span>
                  <span className='text-xs font-medium uppercase tracking-[0.14em] text-slate-500'>
                    stage: {job.stage}
                  </span>
                </div>

                <div>
                  <p className='text-sm font-semibold text-slate-900'>
                    {job.sourceTitle ?? 'Untitled source'}
                  </p>
                  <p className='mt-1 break-all text-xs text-slate-500'>
                    {job.jobId}
                  </p>
                </div>

                <dl className='grid gap-3 text-sm text-slate-700 sm:grid-cols-3'>
                  <div>
                    <dt className='text-xs font-semibold uppercase tracking-[0.16em] text-slate-500'>
                      Attempts
                    </dt>
                    <dd className='mt-1 text-slate-900'>
                      {job.attemptCount} / {job.maxAttempts}
                    </dd>
                  </div>
                  <div>
                    <dt className='text-xs font-semibold uppercase tracking-[0.16em] text-slate-500'>
                      Created
                    </dt>
                    <dd className='mt-1 text-slate-900'>
                      {new Date(job.createdAt).toLocaleString()}
                    </dd>
                  </div>
                  <div>
                    <dt className='text-xs font-semibold uppercase tracking-[0.16em] text-slate-500'>
                      Finished
                    </dt>
                    <dd className='mt-1 text-slate-900'>
                      {job.finishedAt
                        ? new Date(job.finishedAt).toLocaleString()
                        : 'Still in progress'}
                    </dd>
                  </div>
                </dl>

                {job.errorMessage ? (
                  <div className='rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900'>
                    <p className='font-semibold'>
                      {job.errorCode ?? 'INGESTION_ERROR'}
                    </p>
                    <p className='mt-1 max-h-56 overflow-auto whitespace-pre-wrap break-words pr-2 font-mono text-xs leading-6 [overflow-wrap:anywhere]'>
                      {job.errorMessage}
                    </p>
                  </div>
                ) : null}
              </div>

              <div className='min-w-0 flex items-start justify-end'>
                {job.status === 'failed' ? (
                  <RetryIngestionJobButton
                    jobId={job.jobId}
                    onRetried={onRetryQueued}
                  />
                ) : (
                  <div className='rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500'>
                    {job.status === 'succeeded' ? 'Finished' : 'Watching'}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
