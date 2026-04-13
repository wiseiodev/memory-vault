'use client';

import { useRouter } from 'next/navigation';
import { Fragment, startTransition, useState } from 'react';

import { rpc } from '@/rpc/client';

type Mode = 'note' | 'url' | 'file';

export function QuickCaptureComposer() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [mode, setMode] = useState<Mode>('note');
  const [noteBody, setNoteBody] = useState('');
  const [noteTitle, setNoteTitle] = useState('');
  const [url, setUrl] = useState('');
  const [urlTitle, setUrlTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [phaseLabel, setPhaseLabel] = useState<string | null>(null);

  function reset() {
    setNoteBody('');
    setNoteTitle('');
    setUrl('');
    setUrlTitle('');
    setFile(null);
    setPhaseLabel(null);
  }

  async function uploadFile(selected: File) {
    setPhaseLabel('Reserving upload…');
    const reserved = await rpc.uploads.reserve({
      byteSize: selected.size,
      contentType: selected.type || 'application/octet-stream',
      filename: selected.name,
    });

    setPhaseLabel('Uploading to S3…');
    const uploadResponse = await fetch(reserved.uploadUrl, {
      body: selected,
      headers: reserved.uploadHeaders,
      method: reserved.uploadMethod,
    });

    if (!uploadResponse.ok) {
      throw new Error('Direct upload to S3 failed.');
    }

    setPhaseLabel('Finalizing metadata…');
    await rpc.captures.finalizeUpload({
      sourceBlobId: reserved.sourceBlobId,
      sourceItemId: reserved.sourceItemId,
    });
  }

  function submit() {
    setError(null);

    if (mode === 'note' && !noteBody.trim()) {
      setError('Add a note body first.');
      return;
    }

    if (mode === 'url' && !url.trim()) {
      setError('Add a URL first.');
      return;
    }

    if (mode === 'file' && !file) {
      setError('Choose a file first.');
      return;
    }

    startTransition(async () => {
      setIsPending(true);

      try {
        if (mode === 'note') {
          await rpc.captures.createNote({
            body: noteBody,
            title: noteTitle || undefined,
          });
        } else if (mode === 'url') {
          await rpc.captures.createUrl({
            title: urlTitle || undefined,
            url,
          });
        } else if (file) {
          await uploadFile(file);
        }

        reset();
        router.refresh();
      } catch (captureError) {
        setError(
          captureError instanceof Error
            ? captureError.message
            : 'Capture failed unexpectedly.',
        );
      } finally {
        setIsPending(false);
        setPhaseLabel(null);
      }
    });
  }

  return (
    <section className='rounded-3xl border border-slate-200/80 bg-white/90 p-5'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <h3 className='text-sm font-semibold uppercase tracking-[0.18em] text-slate-500'>
          Quick capture
        </h3>
        <div className='flex gap-1 rounded-full border border-slate-200 bg-slate-50 p-1'>
          <button
            type='button'
            onClick={() => setMode('note')}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              mode === 'note'
                ? 'bg-slate-950 text-white'
                : 'text-slate-700 hover:text-slate-950'
            }`}
          >
            Note
          </button>
          <button
            type='button'
            onClick={() => setMode('url')}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              mode === 'url'
                ? 'bg-slate-950 text-white'
                : 'text-slate-700 hover:text-slate-950'
            }`}
          >
            URL
          </button>
          <button
            type='button'
            onClick={() => setMode('file')}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              mode === 'file'
                ? 'bg-slate-950 text-white'
                : 'text-slate-700 hover:text-slate-950'
            }`}
          >
            File
          </button>
        </div>
      </div>

      <div className='mt-4 space-y-3'>
        {mode === 'note' ? (
          <Fragment key='note'>
            <input
              value={noteTitle}
              onChange={(event) => setNoteTitle(event.target.value)}
              placeholder='Optional title'
              className='block w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700'
            />
            <textarea
              value={noteBody}
              onChange={(event) => setNoteBody(event.target.value)}
              placeholder='Jot something down...'
              rows={4}
              className='block w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700'
            />
          </Fragment>
        ) : mode === 'url' ? (
          <Fragment key='url'>
            <input
              value={urlTitle}
              onChange={(event) => setUrlTitle(event.target.value)}
              placeholder='Optional title'
              className='block w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700'
            />
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder='https://example.com/'
              className='block w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700'
            />
          </Fragment>
        ) : (
          <Fragment key='file'>
            <input
              type='file'
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className='block w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700'
            />
            {file ? (
              <p className='text-xs text-slate-500'>
                Selected:{' '}
                <span className='font-medium text-slate-700'>{file.name}</span>{' '}
                ({file.type || 'unknown type'}, {file.size} bytes)
              </p>
            ) : null}
          </Fragment>
        )}

        <div className='flex items-center justify-between gap-3'>
          {error ? (
            <p className='text-sm text-red-600'>{error}</p>
          ) : phaseLabel ? (
            <p className='text-xs text-slate-500'>{phaseLabel}</p>
          ) : (
            <p className='text-xs text-slate-500'>
              Saves to your default space and begins ingestion immediately.
            </p>
          )}
          <button
            type='button'
            disabled={isPending}
            onClick={submit}
            className='inline-flex items-center justify-center rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60'
          >
            {isPending
              ? 'Saving…'
              : mode === 'note'
                ? 'Save note'
                : mode === 'url'
                  ? 'Save URL'
                  : 'Upload file'}
          </button>
        </div>
      </div>
    </section>
  );
}
