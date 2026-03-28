'use client';

import { useState } from 'react';

import { rpc } from '@/rpc/client';

type DownloadButtonProps = {
  sourceBlobId: string;
};

export function DownloadButton({ sourceBlobId }: DownloadButtonProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleDownload() {
    setError(null);
    setIsPending(true);
    try {
      const downloadUrl = await rpc.uploads.download({ sourceBlobId });
      window.location.assign(downloadUrl);
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : 'Download failed.',
      );
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className='flex flex-col items-end gap-2'>
      <button
        type='button'
        onClick={handleDownload}
        disabled={isPending}
        className='inline-flex items-center rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60'
      >
        {isPending ? 'Loading...' : 'Download'}
      </button>
      {error ? <p className='text-xs text-red-600'>{error}</p> : null}
    </div>
  );
}
