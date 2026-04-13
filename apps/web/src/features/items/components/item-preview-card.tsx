import Link from 'next/link';

import type { ItemListItem } from '../schemas';
import { ItemLink } from './item-link';

type ItemPreviewCardProps = {
  item: ItemListItem;
  showSpace?: boolean;
};

const KIND_LABEL: Record<ItemListItem['kind'], string> = {
  file: 'File',
  note: 'Note',
  web_page: 'Web page',
};

const STATUS_STYLES: Record<ItemListItem['status'], string> = {
  archived: 'border-slate-200/70 bg-slate-100/80 text-slate-700',
  failed: 'border-red-200/70 bg-red-100/80 text-red-900',
  pending: 'border-amber-200/70 bg-amber-100/80 text-amber-900',
  processing: 'border-sky-200/70 bg-sky-100/80 text-sky-900',
  ready: 'border-emerald-200/70 bg-emerald-100/80 text-emerald-900',
};

function resolveTitle(item: ItemListItem) {
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

export function ItemPreviewCard({
  item,
  showSpace = true,
}: ItemPreviewCardProps) {
  const title = resolveTitle(item);
  const capturedAt = item.capturedAt ?? item.createdAt;

  return (
    <article className='rounded-3xl border border-slate-200/80 bg-white/90 p-5 transition hover:border-slate-300 hover:bg-white'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div className='flex flex-wrap items-center gap-2'>
          <span className='inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600'>
            {KIND_LABEL[item.kind]}
          </span>
          <span
            className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${STATUS_STYLES[item.status]}`}
          >
            {item.status}
          </span>
          {showSpace ? (
            <Link
              href={`/app/spaces/${item.spaceId}`}
              className='inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900'
            >
              {item.spaceName}
            </Link>
          ) : null}
        </div>
        <p className='text-xs text-slate-500'>
          {new Date(capturedAt).toLocaleString()}
        </p>
      </div>

      <ItemLink
        sourceItemId={item.sourceItemId}
        className='mt-3 block text-lg font-semibold text-slate-950 hover:underline'
      >
        {title}
      </ItemLink>

      {item.canonicalUri &&
      item.kind === 'web_page' &&
      title !== item.canonicalUri ? (
        <p className='mt-1 break-all text-xs text-slate-500'>
          {item.canonicalUri}
        </p>
      ) : null}

      {item.previewText ? (
        <p className='mt-3 text-sm leading-6 text-slate-700'>
          {item.previewText}
        </p>
      ) : null}

      <dl className='mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500'>
        <div>
          <dt className='sr-only'>Segments</dt>
          <dd>
            {item.segmentCount} segment{item.segmentCount === 1 ? '' : 's'}
          </dd>
        </div>
        <div>
          <dt className='sr-only'>Memories</dt>
          <dd>
            {item.memoryCount} memor{item.memoryCount === 1 ? 'y' : 'ies'}
          </dd>
        </div>
      </dl>
    </article>
  );
}
