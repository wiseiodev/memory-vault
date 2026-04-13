'use client';

import { useRouter } from 'next/navigation';
import { startTransition, useState } from 'react';

import { rpc } from '@/rpc/client';

type DeleteItemButtonProps = {
  redirectTo?: string;
  sourceItemId: string;
};

export function DeleteItemButton({
  redirectTo,
  sourceItemId,
}: DeleteItemButtonProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleRequestConfirm() {
    setError(null);
    setIsConfirming(true);
  }

  function handleCancel() {
    setIsConfirming(false);
  }

  function handleDelete() {
    setError(null);

    startTransition(async () => {
      setIsPending(true);

      try {
        await rpc.items.delete({ sourceItemId });

        if (redirectTo) {
          router.push(redirectTo);
        }

        router.refresh();
      } catch (deleteError) {
        console.error('Failed to delete source item', deleteError);
        setError('Could not delete this item. Please try again.');
      } finally {
        setIsPending(false);
        setIsConfirming(false);
      }
    });
  }

  if (!isConfirming) {
    return (
      <button
        type='button'
        onClick={handleRequestConfirm}
        className='inline-flex items-center rounded-full border border-red-200 px-4 py-2 text-sm font-medium text-red-700 transition hover:border-red-300 hover:text-red-900'
      >
        Delete item
      </button>
    );
  }

  return (
    <div className='flex flex-wrap items-center gap-2'>
      <span className='text-sm text-slate-700'>Delete this item?</span>
      <button
        type='button'
        disabled={isPending}
        onClick={handleDelete}
        className='inline-flex items-center rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60'
      >
        {isPending ? 'Deleting…' : 'Confirm delete'}
      </button>
      <button
        type='button'
        disabled={isPending}
        onClick={handleCancel}
        className='inline-flex items-center rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60'
      >
        Cancel
      </button>
      {error ? <p className='text-sm text-red-600'>{error}</p> : null}
    </div>
  );
}
