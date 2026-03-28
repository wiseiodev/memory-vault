'use client';

import { useRouter } from 'next/navigation';
import { startTransition, useState } from 'react';

import { authClient } from '@/lib/auth-client';

export function SignOutButton() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  function handleClick() {
    startTransition(async () => {
      setIsPending(true);

      await authClient.signOut({
        fetchOptions: {
          onSuccess: () => {
            router.push('/');
            router.refresh();
          },
        },
      });
    });
  }

  return (
    <button
      type='button'
      onClick={handleClick}
      disabled={isPending}
      className='inline-flex items-center justify-center rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-70'
    >
      {isPending ? 'Signing out...' : 'Sign out'}
    </button>
  );
}
