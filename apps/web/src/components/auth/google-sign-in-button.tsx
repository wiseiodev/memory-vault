'use client';

import { startTransition, useState } from 'react';

import { authClient } from '@/lib/auth-client';

export function GoogleSignInButton(input: { callbackURL?: string }) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);

    startTransition(async () => {
      setIsPending(true);

      try {
        await authClient.signIn.social({
          callbackURL: input.callbackURL ?? '/app',
          provider: 'google',
        });
      } catch (signInError) {
        console.error('Google sign-in failed', signInError);
        setError(
          'Something went wrong while redirecting to Google. Please try again.',
        );
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
        className='inline-flex items-center justify-center rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-70'
      >
        {isPending ? 'Redirecting to Google...' : 'Continue with Google'}
      </button>
      {error ? <p className='text-sm text-red-600'>{error}</p> : null}
    </div>
  );
}
