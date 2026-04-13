'use client';

import { startTransition, useState } from 'react';

export function AccountExportCard() {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleExport() {
    setError(null);

    startTransition(async () => {
      setIsPending(true);

      try {
        const response = await fetch('/api/account/export', {
          method: 'GET',
        });

        if (!response.ok) {
          throw new Error(`Export request failed (${response.status})`);
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        const timestamp = new Date().toISOString().replaceAll(':', '-');
        anchor.href = url;
        anchor.download = `memory-vault-export-${timestamp}.json`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
      } catch (exportError) {
        console.error('Account export failed', exportError);
        setError('Could not prepare your export. Please try again.');
      } finally {
        setIsPending(false);
      }
    });
  }

  return (
    <article className='rounded-3xl border border-slate-200/80 bg-white/90 p-5'>
      <div className='space-y-2'>
        <h3 className='text-sm font-semibold uppercase tracking-[0.18em] text-slate-500'>
          Export your vault
        </h3>
        <p className='text-sm leading-7 text-slate-700'>
          Download a JSON manifest of every space, source item, extracted
          segment, promoted memory, and citation on your account. Raw blobs are
          referenced with signed download URLs that expire 15 minutes after
          export. Re-run the export to refresh them.
        </p>
      </div>
      <div className='mt-4 space-y-2'>
        <button
          type='button'
          disabled={isPending}
          onClick={handleExport}
          className='inline-flex items-center rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-70'
        >
          {isPending ? 'Preparing export…' : 'Download export'}
        </button>
        {error ? <p className='text-sm text-red-600'>{error}</p> : null}
      </div>
    </article>
  );
}
