'use client';

import { startTransition, useState } from 'react';

import { authClient } from '@/lib/auth-client';

export function GoogleSignInButton() {
  const [isPending, setIsPending] = useState(false);

  function handleClick() {
    startTransition(async () => {
      setIsPending(true);

      await authClient.signIn.social({
        provider: 'google',
        callbackURL: '/app',
      });
    });
  }

  return (
    <button
      type='button'
      onClick={handleClick}
      disabled={isPending}
      className='inline-flex items-center justify-center rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-70'
    >
      {isPending ? 'Redirecting to Google...' : 'Continue with Google'}
    </button>
  );
}
