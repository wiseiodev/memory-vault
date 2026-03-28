'use client';

import { useRouter } from 'next/navigation';
import { startTransition, useState } from 'react';

import { authClient } from '@/lib/auth-client';

export function SignOutButton() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);

    startTransition(async () => {
      setIsPending(true);

      try {
        await authClient.signOut({
          fetchOptions: {
            onSuccess: () => {
              router.push('/');
              router.refresh();
            },
          },
        });
      } catch (signOutError) {
        console.error('Sign out failed', signOutError);
        setError('Something went wrong while signing out. Please try again.');
      } finally {
        setIsPending(false);
      }
    });
  }

  return (
    <div className='space-y-2'>
      <button
        type='button'
        onClick={handleClick}
        disabled={isPending}
        className='inline-flex items-center justify-center rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-70'
      >
        {isPending ? 'Signing out...' : 'Sign out'}
      </button>
      {error ? <p className='text-sm text-red-600'>{error}</p> : null}
    </div>
  );
}
