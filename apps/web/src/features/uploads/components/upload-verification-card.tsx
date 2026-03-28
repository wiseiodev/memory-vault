'use client';

import { useRouter } from 'next/navigation';
import { startTransition, useState } from 'react';

import { rpc } from '@/rpc/client';

type CompleteResult = Awaited<ReturnType<typeof rpc.uploads.complete>>;

export function UploadVerificationCard() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [phase, setPhase] = useState<
    'idle' | 'reserving' | 'uploading' | 'completing' | 'complete'
  >('idle');
  const [result, setResult] = useState<CompleteResult | null>(null);

  function handleSubmit() {
    if (!file) {
      setError('Choose a file first.');
      return;
    }

    setError(null);
    setResult(null);

    startTransition(async () => {
      setIsPending(true);

      try {
        setPhase('reserving');
        const reservedUpload = await rpc.uploads.reserve({
          byteSize: file.size,
          contentType: file.type || 'application/octet-stream',
          filename: file.name,
        });

        setPhase('uploading');
        const uploadResponse = await fetch(reservedUpload.uploadUrl, {
          body: file,
          headers: reservedUpload.uploadHeaders,
          method: reservedUpload.uploadMethod,
        });

        if (!uploadResponse.ok) {
          throw new Error('Direct upload to S3 failed.');
        }

        setPhase('completing');
        const completedUpload = await rpc.uploads.complete({
          sourceBlobId: reservedUpload.sourceBlobId,
          sourceItemId: reservedUpload.sourceItemId,
        });
        setResult(completedUpload);
        setPhase('complete');
        router.refresh();
      } catch (uploadError) {
        console.error('Upload verification failed', uploadError);
        setError(
          uploadError instanceof Error
            ? uploadError.message
            : 'Upload failed unexpectedly.',
        );
        setPhase('idle');
      } finally {
        setIsPending(false);
      }
    });
  }

  return (
    <article className='rounded-3xl border border-slate-200/80 bg-white/90 p-5'>
      <div className='space-y-2'>
        <h3 className='text-sm font-semibold uppercase tracking-[0.18em] text-slate-500'>
          LAB-117 upload verification
        </h3>
        <p className='text-sm leading-7 text-slate-700'>
          Reserve a blob record, upload directly to S3, and finalize the
          metadata back in Neon.
        </p>
      </div>

      <div className='mt-5 space-y-4'>
        <input
          type='file'
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setError(null);
          }}
          className='block w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700'
        />

        <button
          type='button'
          disabled={!file || isPending}
          onClick={handleSubmit}
          className='inline-flex items-center justify-center rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60'
        >
          {labelForPhase(phase, isPending)}
        </button>

        {file ? (
          <p className='text-sm text-slate-600'>
            Selected:{' '}
            <span className='font-medium text-slate-900'>{file.name}</span> (
            {file.type || 'unknown type'}, {file.size} bytes)
          </p>
        ) : null}

        {error ? <p className='text-sm text-red-600'>{error}</p> : null}

        {result ? (
          <dl className='grid gap-3 rounded-2xl border border-emerald-200/70 bg-emerald-50/80 p-4 text-sm text-slate-700'>
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
                Source blob
              </dt>
              <dd className='mt-1 break-all text-slate-900'>
                {result.sourceBlobId}
              </dd>
            </div>
            <div>
              <dt className='text-xs font-semibold uppercase tracking-[0.16em] text-slate-500'>
                Object key
              </dt>
              <dd className='mt-1 break-all text-slate-900'>
                {result.objectKey}
              </dd>
            </div>
            <div>
              <dt className='text-xs font-semibold uppercase tracking-[0.16em] text-slate-500'>
                Uploaded at
              </dt>
              <dd className='mt-1 text-slate-900'>
                {result.uploadedAt
                  ? new Date(result.uploadedAt).toLocaleString()
                  : 'Pending'}
              </dd>
            </div>
          </dl>
        ) : null}
      </div>
    </article>
  );
}

function labelForPhase(
  phase: 'idle' | 'reserving' | 'uploading' | 'completing' | 'complete',
  isPending: boolean,
) {
  if (!isPending) {
    return 'Upload file';
  }

  if (phase === 'reserving') {
    return 'Reserving upload...';
  }

  if (phase === 'uploading') {
    return 'Uploading to S3...';
  }

  if (phase === 'completing') {
    return 'Finalizing metadata...';
  }

  return 'Working...';
}
