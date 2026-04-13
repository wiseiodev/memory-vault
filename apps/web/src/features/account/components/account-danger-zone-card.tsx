'use client';

import { useRouter } from 'next/navigation';
import { startTransition, useState } from 'react';

import { authClient } from '@/lib/auth-client';
import { rpc } from '@/rpc/client';

const CONFIRMATION_PHRASE = 'DELETE';

export function AccountDangerZoneCard(input: { userEmail: string }) {
  const router = useRouter();
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleRequestConfirm() {
    setError(null);
    setConfirmation('');
    setIsConfirming(true);
  }

  function handleCancel() {
    setConfirmation('');
    setIsConfirming(false);
  }

  function handleDelete() {
    if (confirmation.trim() !== CONFIRMATION_PHRASE) {
      setError(`Type ${CONFIRMATION_PHRASE} to confirm.`);
      return;
    }

    setError(null);

    startTransition(async () => {
      setIsPending(true);

      try {
        await rpc.account.delete();
        await authClient.signOut({
          fetchOptions: {
            onSuccess: () => {
              router.push('/');
              router.refresh();
            },
          },
        });
      } catch (deleteError) {
        console.error('Account deletion failed', deleteError);
        setError('Could not delete your account. Please try again.');
      } finally {
        setIsPending(false);
      }
    });
  }

  return (
    <article className='rounded-3xl border border-red-200/70 bg-red-50/70 p-5'>
      <div className='space-y-2'>
        <h3 className='text-sm font-semibold uppercase tracking-[0.18em] text-red-700'>
          Delete account
        </h3>
        <p className='text-sm leading-7 text-red-900/80'>
          Permanently deletes the account <strong>{input.userEmail}</strong>,
          every space, source item, segment, promoted memory, citation, and
          device token associated with it. Stored blobs are removed from object
          storage. Backup copies may persist within the documented retention
          window. This cannot be undone.
        </p>
      </div>

      {isConfirming ? (
        <div className='mt-4 space-y-3'>
          <label className='block text-sm text-red-900'>
            Type <code className='font-mono'>{CONFIRMATION_PHRASE}</code> to
            confirm:
            <input
              type='text'
              disabled={isPending}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              className='mt-1 block w-full rounded-2xl border border-red-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-red-400 focus:outline-none disabled:opacity-60'
            />
          </label>
          <div className='flex flex-wrap items-center gap-2'>
            <button
              type='button'
              disabled={isPending}
              onClick={handleDelete}
              className='inline-flex items-center rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60'
            >
              {isPending ? 'Deleting…' : 'Delete account permanently'}
            </button>
            <button
              type='button'
              disabled={isPending}
              onClick={handleCancel}
              className='inline-flex items-center rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60'
            >
              Cancel
            </button>
          </div>
          {error ? <p className='text-sm text-red-700'>{error}</p> : null}
        </div>
      ) : (
        <div className='mt-4'>
          <button
            type='button'
            onClick={handleRequestConfirm}
            className='inline-flex items-center rounded-full border border-red-300 px-4 py-2 text-sm font-medium text-red-700 transition hover:border-red-400 hover:text-red-900'
          >
            Delete account
          </button>
        </div>
      )}
    </article>
  );
}
