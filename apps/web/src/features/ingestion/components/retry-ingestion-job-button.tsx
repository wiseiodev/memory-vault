'use client';

import { useRouter } from 'next/navigation';
import { startTransition, useState } from 'react';

import { rpc } from '@/rpc/client';

type RetryIngestionJobButtonProps = {
  jobId: string;
};

export function RetryIngestionJobButton({
  jobId,
}: RetryIngestionJobButtonProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  function handleRetry() {
    setError(null);

    startTransition(async () => {
      setIsPending(true);

      try {
        await rpc.ingestion.retry({
          jobId,
        });
        router.refresh();
      } catch (retryError) {
        setError(
          retryError instanceof Error
            ? retryError.message
            : 'Retry failed unexpectedly.',
        );
      } finally {
        setIsPending(false);
      }
    });
  }

  return (
    <div className='flex flex-col items-end gap-2'>
      <button
        type='button'
        onClick={handleRetry}
        disabled={isPending}
        className='inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-amber-900 transition hover:border-amber-300 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60'
      >
        {isPending ? 'Retrying...' : 'Retry'}
      </button>
      {error ? <p className='text-xs text-red-600'>{error}</p> : null}
    </div>
  );
}
