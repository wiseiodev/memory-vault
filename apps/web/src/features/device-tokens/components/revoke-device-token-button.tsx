'use client';

import { useRouter } from 'next/navigation';
import { startTransition, useState } from 'react';

import { rpc } from '@/rpc/client';

export function RevokeDeviceTokenButton(input: { deviceTokenId: string }) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  function handleRevoke() {
    startTransition(async () => {
      setIsPending(true);

      try {
        await rpc.deviceTokens.revoke({
          deviceTokenId: input.deviceTokenId,
        });
        router.refresh();
      } finally {
        setIsPending(false);
      }
    });
  }

  return (
    <button
      type='button'
      disabled={isPending}
      onClick={handleRevoke}
      className='inline-flex items-center rounded-full border border-red-200 px-4 py-2 text-sm font-medium text-red-700 transition hover:border-red-300 hover:text-red-900 disabled:cursor-not-allowed disabled:opacity-60'
    >
      {isPending ? 'Revoking…' : 'Revoke'}
    </button>
  );
}
