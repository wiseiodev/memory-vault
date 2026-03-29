'use client';

import { useRouter } from 'next/navigation';
import { startTransition, useState } from 'react';

import { rpc } from '@/rpc/client';

type CaptureResult =
  | Awaited<ReturnType<typeof rpc.captures.createNote>>
  | Awaited<ReturnType<typeof rpc.captures.createUrl>>;

export function CaptureVerificationCard() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [noteBody, setNoteBody] = useState('');
  const [noteTitle, setNoteTitle] = useState('');
  const [result, setResult] = useState<CaptureResult | null>(null);
  const [url, setUrl] = useState('');
  const [urlTitle, setUrlTitle] = useState('');

  function handleCreateNote() {
    if (!noteBody.trim()) {
      setError('Add a note body first.');
      return;
    }

    setError(null);
    setResult(null);

    startTransition(async () => {
      setIsPending(true);

      try {
        const createdNote = await rpc.captures.createNote({
          body: noteBody,
          title: noteTitle || undefined,
        });

        setResult(createdNote);
        router.refresh();
      } catch (captureError) {
        setError(
          captureError instanceof Error
            ? captureError.message
            : 'Note capture failed unexpectedly.',
        );
      } finally {
        setIsPending(false);
      }
    });
  }

  function handleCreateUrl() {
    if (!url.trim()) {
      setError('Add a URL first.');
      return;
    }

    setError(null);
    setResult(null);

    startTransition(async () => {
      setIsPending(true);

      try {
        const createdUrl = await rpc.captures.createUrl({
          title: urlTitle || undefined,
          url,
        });

        setResult(createdUrl);
        router.refresh();
      } catch (captureError) {
        setError(
          captureError instanceof Error
            ? captureError.message
            : 'URL capture failed unexpectedly.',
        );
      } finally {
        setIsPending(false);
      }
    });
  }

  return (
    <article className='rounded-3xl border border-slate-200/80 bg-white/90 p-5'>
      <div className='space-y-2'>
        <h3 className='text-sm font-semibold uppercase tracking-[0.18em] text-slate-500'>
          LAB-118 capture verification
        </h3>
        <p className='text-sm leading-7 text-slate-700'>
          Create canonical source items directly for manual notes and saved URLs
          before async ingestion exists.
        </p>
      </div>

      <div className='mt-5 grid gap-5 md:grid-cols-2'>
        <div className='space-y-3 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4'>
          <h4 className='text-sm font-semibold text-slate-900'>Manual note</h4>
          <input
            value={noteTitle}
            onChange={(event) => setNoteTitle(event.target.value)}
            placeholder='Optional title'
            className='block w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700'
          />
          <textarea
            value={noteBody}
            onChange={(event) => setNoteBody(event.target.value)}
            placeholder='Remember to renew the passport next month.'
            rows={5}
            className='block w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700'
          />
          <button
            type='button'
            disabled={isPending}
            onClick={handleCreateNote}
            className='inline-flex items-center justify-center rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60'
          >
            Save note
          </button>
        </div>

        <div className='space-y-3 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4'>
          <h4 className='text-sm font-semibold text-slate-900'>Saved URL</h4>
          <input
            value={urlTitle}
            onChange={(event) => setUrlTitle(event.target.value)}
            placeholder='Optional title'
            className='block w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700'
          />
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder='https://example.com/trips/japan'
            className='block w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700'
          />
          <button
            type='button'
            disabled={isPending}
            onClick={handleCreateUrl}
            className='inline-flex items-center justify-center rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60'
          >
            Save URL
          </button>
        </div>
      </div>

      {error ? <p className='mt-4 text-sm text-red-600'>{error}</p> : null}

      {result ? (
        <dl className='mt-4 grid gap-3 rounded-2xl border border-emerald-200/70 bg-emerald-50/80 p-4 text-sm text-slate-700'>
          <div>
            <dt className='text-xs font-semibold uppercase tracking-[0.16em] text-slate-500'>
              Kind
            </dt>
            <dd className='mt-1 text-slate-900'>{result.kind}</dd>
          </div>
          <div>
            <dt className='text-xs font-semibold uppercase tracking-[0.16em] text-slate-500'>
              Source item
            </dt>
            <dd className='mt-1 break-all text-slate-900'>
              {result.sourceItemId}
            </dd>
          </div>
          <div>
            <dt className='text-xs font-semibold uppercase tracking-[0.16em] text-slate-500'>
              Status
            </dt>
            <dd className='mt-1 text-slate-900'>{result.status}</dd>
          </div>
          <div>
            <dt className='text-xs font-semibold uppercase tracking-[0.16em] text-slate-500'>
              Captured at
            </dt>
            <dd className='mt-1 text-slate-900'>
              {new Date(result.capturedAt).toLocaleString()}
            </dd>
          </div>
        </dl>
      ) : null}
    </article>
  );
}
