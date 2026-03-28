'use client';

import { useRouter } from 'next/navigation';
import { startTransition, useState } from 'react';

import { rpc } from '@/rpc/client';

type DeleteUploadButtonProps = {
  sourceBlobId: string;
  sourceItemId: string;
};

export function DeleteUploadButton({
  sourceBlobId,
  sourceItemId,
}: DeleteUploadButtonProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  function handleDelete() {
    setError(null);

    startTransition(async () => {
      setIsPending(true);

      try {
        await rpc.uploads.delete({
          sourceBlobId,
          sourceItemId,
        });

        router.refresh();
      } catch (deleteError) {
        setError(
          deleteError instanceof Error
            ? deleteError.message
            : 'Delete failed unexpectedly.',
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
        onClick={handleDelete}
        disabled={isPending}
        className='inline-flex items-center rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-700 transition hover:border-slate-300 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-60'
      >
        {isPending ? 'Deleting...' : 'Delete'}
      </button>
      {error ? <p className='text-xs text-red-600'>{error}</p> : null}
    </div>
  );
}
