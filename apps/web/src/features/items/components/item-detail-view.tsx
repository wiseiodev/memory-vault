import Link from 'next/link';

import type { ItemDetail } from '../schemas';

type ItemDetailViewProps = {
  item: ItemDetail;
};

const KIND_LABEL: Record<ItemDetail['kind'], string> = {
  file: 'File',
  note: 'Note',
  web_page: 'Web page',
};

const STATUS_STYLES: Record<ItemDetail['status'], string> = {
  archived: 'border-slate-200/70 bg-slate-100/80 text-slate-700',
  failed: 'border-red-200/70 bg-red-100/80 text-red-900',
  pending: 'border-amber-200/70 bg-amber-100/80 text-amber-900',
  processing: 'border-sky-200/70 bg-sky-100/80 text-sky-900',
  ready: 'border-emerald-200/70 bg-emerald-100/80 text-emerald-900',
};

function formatBytes(value: string | null) {
  if (!value) {
    return null;
  }

  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) {
    return value;
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function resolveTitle(item: ItemDetail) {
  if (item.title && item.title.trim().length > 0) {
    return item.title;
  }

  if (item.kind === 'web_page' && item.canonicalUri) {
    return item.canonicalUri;
  }

  if (item.kind === 'note') {
    return 'Untitled note';
  }

  return 'Untitled item';
}

function NoteBody({ metadata }: { metadata: Record<string, unknown> }) {
  const noteBody = metadata.noteBody;
  if (typeof noteBody !== 'string' || noteBody.trim().length === 0) {
    return null;
  }

  return (
    <section className='rounded-3xl border border-slate-200/80 bg-white/90 p-5'>
      <h3 className='text-sm font-semibold uppercase tracking-[0.18em] text-slate-500'>
        Note
      </h3>
      <p className='mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-800'>
        {noteBody}
      </p>
    </section>
  );
}

export function ItemDetailView({ item }: ItemDetailViewProps) {
  const title = resolveTitle(item);
  const capturedAt = item.capturedAt ?? item.createdAt;
  const byteSize = formatBytes(item.blob?.byteSize ?? null);

  return (
    <div className='space-y-6'>
      <header className='space-y-3'>
        <div className='flex flex-wrap items-center gap-2'>
          <span className='inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600'>
            {KIND_LABEL[item.kind]}
          </span>
          <span
            className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${STATUS_STYLES[item.status]}`}
          >
            {item.status}
          </span>
          <Link
            href={`/app/spaces/${item.spaceId}`}
            className='inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900'
          >
            {item.spaceName}
          </Link>
        </div>
        <h1 className='text-2xl font-semibold tracking-tight text-slate-950'>
          {title}
        </h1>
        {item.canonicalUri ? (
          <a
            href={item.canonicalUri}
            rel='noreferrer noopener'
            target='_blank'
            className='break-all text-sm text-sky-700 hover:underline'
          >
            {item.canonicalUri}
          </a>
        ) : null}
        <dl className='flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500'>
          <div>
            <dt className='sr-only'>Captured at</dt>
            <dd>Captured {new Date(capturedAt).toLocaleString()}</dd>
          </div>
          <div>
            <dt className='sr-only'>Source item id</dt>
            <dd className='break-all'>{item.sourceItemId}</dd>
          </div>
        </dl>
      </header>

      <NoteBody metadata={item.metadata} />

      {item.blob ? (
        <section className='rounded-3xl border border-slate-200/80 bg-white/90 p-5'>
          <h3 className='text-sm font-semibold uppercase tracking-[0.18em] text-slate-500'>
            Source blob
          </h3>
          <dl className='mt-3 grid gap-3 text-sm text-slate-700 sm:grid-cols-2'>
            <div>
              <dt className='text-xs font-semibold uppercase tracking-[0.16em] text-slate-500'>
                Content type
              </dt>
              <dd className='mt-1 text-slate-900'>
                {item.blob.contentType ?? 'unknown'}
              </dd>
            </div>
            {byteSize ? (
              <div>
                <dt className='text-xs font-semibold uppercase tracking-[0.16em] text-slate-500'>
                  Size
                </dt>
                <dd className='mt-1 text-slate-900'>{byteSize}</dd>
              </div>
            ) : null}
            <div className='sm:col-span-2'>
              <dt className='text-xs font-semibold uppercase tracking-[0.16em] text-slate-500'>
                Object key
              </dt>
              <dd className='mt-1 break-all text-slate-900'>
                {item.blob.objectKey}
              </dd>
            </div>
            {item.blob.uploadedAt ? (
              <div>
                <dt className='text-xs font-semibold uppercase tracking-[0.16em] text-slate-500'>
                  Uploaded
                </dt>
                <dd className='mt-1 text-slate-900'>
                  {new Date(item.blob.uploadedAt).toLocaleString()}
                </dd>
              </div>
            ) : null}
          </dl>
        </section>
      ) : null}

      <section className='rounded-3xl border border-slate-200/80 bg-white/90 p-5'>
        <div className='flex items-baseline justify-between gap-3'>
          <h3 className='text-sm font-semibold uppercase tracking-[0.18em] text-slate-500'>
            Segments
          </h3>
          <p className='text-xs text-slate-500'>
            {item.segments.length} of {item.segmentCount}
          </p>
        </div>

        {item.segments.length === 0 ? (
          <p className='mt-4 text-sm text-slate-600'>
            No segments yet. Extraction runs after capture — check back after
            ingestion completes.
          </p>
        ) : (
          <ol className='mt-4 space-y-3'>
            {item.segments.map((segment) => (
              <li
                key={segment.id}
                className='rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4'
              >
                <div className='flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500'>
                  <span>Segment {segment.ordinal + 1}</span>
                  <span>
                    {segment.kind.replace('_', ' ')}
                    {segment.tokenCount !== null
                      ? ` · ${segment.tokenCount} tokens`
                      : ''}
                  </span>
                </div>
                <p className='mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-800'>
                  {segment.content}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className='rounded-3xl border border-slate-200/80 bg-white/90 p-5'>
        <div className='flex items-baseline justify-between gap-3'>
          <h3 className='text-sm font-semibold uppercase tracking-[0.18em] text-slate-500'>
            Derived memories
          </h3>
          <p className='text-xs text-slate-500'>
            {item.memories.length} of {item.memoryCount}
          </p>
        </div>

        {item.memories.length === 0 ? (
          <p className='mt-4 text-sm text-slate-600'>
            No memories have been promoted from this item yet.
          </p>
        ) : (
          <ul className='mt-4 space-y-3'>
            {item.memories.map((memory) => (
              <li
                key={memory.id}
                className='rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4'
              >
                <div className='flex flex-wrap items-center justify-between gap-2'>
                  <p className='text-sm font-semibold text-slate-900'>
                    {memory.title ?? 'Untitled memory'}
                  </p>
                  <span className='text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500'>
                    {memory.kind} · {memory.state}
                  </span>
                </div>
                <p className='mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-800'>
                  {memory.summary ?? memory.content}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
