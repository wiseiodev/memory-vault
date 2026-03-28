import Link from 'next/link';

import type { UploadListItem } from '@/lib/server/uploads/service';

import { DeleteUploadButton } from './delete-upload-button';

type UploadListCardProps = {
  uploads: UploadListItem[];
};

export function UploadListCard({ uploads }: UploadListCardProps) {
  return (
    <article className='rounded-3xl border border-slate-200/80 bg-white/90 p-5'>
      <div className='space-y-2'>
        <h3 className='text-sm font-semibold uppercase tracking-[0.18em] text-slate-500'>
          Your uploads
        </h3>
        <p className='text-sm leading-7 text-slate-700'>
          Uploaded files stay downloadable here, and failed or pending records
          can be cleaned up if you want a tidy workspace.
        </p>
      </div>

      {uploads.length === 0 ? (
        <p className='mt-5 text-sm text-slate-600'>
          No uploads yet. Reserve one above to see it show up here.
        </p>
      ) : (
        <ul className='mt-5 space-y-3'>
          {uploads.map((upload) => (
            <li
              key={upload.sourceBlobId}
              className='flex flex-col gap-4 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 lg:flex-row lg:items-start lg:justify-between'
            >
              <div className='space-y-2'>
                <div className='flex flex-wrap items-center gap-2'>
                  <p className='font-medium text-slate-950'>
                    {upload.filename}
                  </p>
                  <StatusBadge status={upload.status} />
                </div>
                <dl className='grid gap-1 text-sm text-slate-600'>
                  <div>
                    <dt className='sr-only'>Created</dt>
                    <dd>Added {new Date(upload.createdAt).toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt className='sr-only'>Details</dt>
                    <dd>
                      {upload.contentType ?? 'unknown type'}
                      {upload.byteSize ? `, ${upload.byteSize} bytes` : ''}
                    </dd>
                  </div>
                  <div>
                    <dt className='sr-only'>Object key</dt>
                    <dd className='break-all text-xs text-slate-500'>
                      {upload.objectKey}
                    </dd>
                  </div>
                  {upload.uploadedAt ? (
                    <div>
                      <dt className='sr-only'>Uploaded</dt>
                      <dd>
                        Uploaded {new Date(upload.uploadedAt).toLocaleString()}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </div>

              <div className='flex flex-col items-start gap-2 lg:items-end'>
                {upload.status === 'uploaded' ? (
                  <Link
                    href={`/api/uploads/download?sourceBlobId=${encodeURIComponent(upload.sourceBlobId)}`}
                    className='inline-flex items-center rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white transition hover:bg-slate-800'
                  >
                    Download
                  </Link>
                ) : (
                  <span className='text-xs font-medium text-slate-500'>
                    Download available after upload completes
                  </span>
                )}
                <DeleteUploadButton
                  sourceBlobId={upload.sourceBlobId}
                  sourceItemId={upload.sourceItemId}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function StatusBadge({ status }: { status: UploadListItem['status'] }) {
  const styles =
    status === 'uploaded'
      ? 'border-emerald-200/70 bg-emerald-100/80 text-emerald-900'
      : status === 'failed'
        ? 'border-red-200/70 bg-red-100/80 text-red-900'
        : 'border-amber-200/70 bg-amber-100/80 text-amber-900';

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${styles}`}
    >
      {status}
    </span>
  );
}
