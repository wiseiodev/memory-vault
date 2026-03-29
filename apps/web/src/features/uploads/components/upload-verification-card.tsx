'use client';

import { useRouter } from 'next/navigation';
import { startTransition, useReducer } from 'react';

import { rpc } from '@/rpc/client';

type CompleteResult = Awaited<ReturnType<typeof rpc.captures.finalizeUpload>>;
type UploadPhase =
  | 'idle'
  | 'reserving'
  | 'uploading'
  | 'completing'
  | 'complete';

type UploadVerificationState = {
  error: string | null;
  file: File | null;
  isPending: boolean;
  phase: UploadPhase;
  result: CompleteResult | null;
};

type UploadVerificationAction =
  | { type: 'file.selected'; file: File | null }
  | { type: 'submit.rejected'; error: string }
  | { type: 'submit.started' }
  | { type: 'phase.changed'; phase: UploadPhase }
  | { type: 'submit.succeeded'; result: CompleteResult }
  | { type: 'submit.failed'; error: string };

const initialState: UploadVerificationState = {
  error: null,
  file: null,
  isPending: false,
  phase: 'idle',
  result: null,
};

export function UploadVerificationCard() {
  const router = useRouter();
  const [state, dispatch] = useReducer(uploadVerificationReducer, initialState);

  function handleSubmit() {
    if (!state.file) {
      dispatch({
        type: 'submit.rejected',
        error: 'Choose a file first.',
      });
      return;
    }

    const selectedFile = state.file;

    startTransition(() => {
      dispatch({ type: 'submit.started' });

      void rpc.uploads
        .reserve({
          byteSize: selectedFile.size,
          contentType: selectedFile.type || 'application/octet-stream',
          filename: selectedFile.name,
        })
        .then(async (reservedUpload) => {
          dispatch({
            type: 'phase.changed',
            phase: 'uploading',
          });
          const uploadResponse = await fetch(reservedUpload.uploadUrl, {
            body: selectedFile,
            headers: reservedUpload.uploadHeaders,
            method: reservedUpload.uploadMethod,
          });

          if (!uploadResponse.ok) {
            throw new Error('Direct upload to S3 failed.');
          }

          dispatch({
            type: 'phase.changed',
            phase: 'completing',
          });
          return rpc.captures.finalizeUpload({
            sourceBlobId: reservedUpload.sourceBlobId,
            sourceItemId: reservedUpload.sourceItemId,
          });
        })
        .then((completedUpload) => {
          dispatch({
            type: 'submit.succeeded',
            result: completedUpload,
          });
          router.refresh();
        })
        .catch((uploadError) => {
          console.error('Upload verification failed', uploadError);
          dispatch({
            type: 'submit.failed',
            error:
              uploadError instanceof Error
                ? uploadError.message
                : 'Upload failed unexpectedly.',
          });
        });
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
            dispatch({
              type: 'file.selected',
              file: event.target.files?.[0] ?? null,
            });
          }}
          className='block w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700'
        />

        <button
          type='button'
          disabled={!state.file || state.isPending}
          onClick={handleSubmit}
          className='inline-flex items-center justify-center rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60'
        >
          {labelForPhase(state.phase, state.isPending)}
        </button>

        <SelectedFileSummary file={state.file} />

        {state.error ? (
          <p className='text-sm text-red-600'>{state.error}</p>
        ) : null}

        <UploadResultDetails result={state.result} />
      </div>
    </article>
  );
}

function uploadVerificationReducer(
  state: UploadVerificationState,
  action: UploadVerificationAction,
): UploadVerificationState {
  switch (action.type) {
    case 'file.selected':
      return {
        ...state,
        error: null,
        file: action.file,
      };
    case 'submit.rejected':
      return {
        ...state,
        error: action.error,
      };
    case 'submit.started':
      return {
        ...state,
        error: null,
        isPending: true,
        phase: 'reserving',
        result: null,
      };
    case 'phase.changed':
      return {
        ...state,
        phase: action.phase,
      };
    case 'submit.succeeded':
      return {
        ...state,
        isPending: false,
        phase: 'complete',
        result: action.result,
      };
    case 'submit.failed':
      return {
        ...state,
        error: action.error,
        isPending: false,
        phase: 'idle',
      };
    default:
      return state;
  }
}

function labelForPhase(phase: UploadPhase, isPending: boolean) {
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

function SelectedFileSummary({ file }: { file: File | null }) {
  if (!file) {
    return null;
  }

  return (
    <p className='text-sm text-slate-600'>
      Selected: <span className='font-medium text-slate-900'>{file.name}</span>{' '}
      ({file.type || 'unknown type'}, {file.size} bytes)
    </p>
  );
}

function UploadResultDetails({ result }: { result: CompleteResult | null }) {
  if (!result) {
    return null;
  }

  return (
    <dl className='grid gap-3 rounded-2xl border border-emerald-200/70 bg-emerald-50/80 p-4 text-sm text-slate-700'>
      <div>
        <dt className='text-xs font-semibold uppercase tracking-[0.16em] text-slate-500'>
          Source item
        </dt>
        <dd className='mt-1 break-all text-slate-900'>{result.sourceItemId}</dd>
      </div>
      <div>
        <dt className='text-xs font-semibold uppercase tracking-[0.16em] text-slate-500'>
          Source blob
        </dt>
        <dd className='mt-1 break-all text-slate-900'>{result.sourceBlobId}</dd>
      </div>
      <div>
        <dt className='text-xs font-semibold uppercase tracking-[0.16em] text-slate-500'>
          Kind
        </dt>
        <dd className='mt-1 text-slate-900'>{result.kind}</dd>
      </div>
      <div>
        <dt className='text-xs font-semibold uppercase tracking-[0.16em] text-slate-500'>
          Uploaded at
        </dt>
        <dd className='mt-1 text-slate-900'>
          {new Date(result.capturedAt).toLocaleString()}
        </dd>
      </div>
    </dl>
  );
}
