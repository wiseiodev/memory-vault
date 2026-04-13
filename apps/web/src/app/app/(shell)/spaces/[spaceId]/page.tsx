import { ORPCError } from '@orpc/server';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { InboxList } from '@/features/items';
import type { SpaceDetail } from '@/features/spaces';
import { rpc } from '@/rpc/client';

type SpaceDetailPageProps = {
  params: Promise<{ spaceId: string }>;
};

export async function generateMetadata({
  params,
}: SpaceDetailPageProps): Promise<Metadata> {
  const { spaceId } = await params;

  try {
    const space = await rpc.spaces.get({ spaceId });
    return {
      title: `${space.name} | Memory Vault`,
      description: space.description ?? 'Saved memory content in this space.',
    };
  } catch {
    return { title: 'Space | Memory Vault' };
  }
}

export default async function SpaceDetailPage({
  params,
}: SpaceDetailPageProps) {
  const { spaceId } = await params;

  let space: SpaceDetail;
  try {
    space = await rpc.spaces.get({ spaceId });
  } catch (error) {
    if (error instanceof ORPCError && error.code === 'NOT_FOUND') {
      notFound();
    }
    throw error;
  }

  const items = await rpc.items.list({ spaceId });

  return (
    <div className='space-y-6'>
      <div className='space-y-3'>
        <Link
          href='/app/spaces'
          className='text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 hover:text-slate-700'
        >
          ← All spaces
        </Link>
        <div className='flex flex-wrap items-center gap-2'>
          <h2 className='text-2xl font-semibold tracking-tight text-slate-950'>
            {space.name}
          </h2>
          {space.isDefault ? (
            <span className='inline-flex rounded-full border border-emerald-200/70 bg-emerald-100/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-900'>
              Default
            </span>
          ) : null}
        </div>
        {space.description ? (
          <p className='max-w-2xl text-sm leading-7 text-slate-600'>
            {space.description}
          </p>
        ) : null}
        <dl className='flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500'>
          <div>
            <dt className='sr-only'>Items</dt>
            <dd>
              {space.itemCount} item{space.itemCount === 1 ? '' : 's'}
            </dd>
          </div>
          <div>
            <dt className='sr-only'>Memories</dt>
            <dd>
              {space.memoryCount} memor
              {space.memoryCount === 1 ? 'y' : 'ies'}
            </dd>
          </div>
        </dl>
      </div>

      <InboxList
        emptyMessage='Nothing in this space yet.'
        items={items}
        showSpace={false}
      />
    </div>
  );
}
