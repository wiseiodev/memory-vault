import Link from 'next/link';

import type { SpaceListItem } from '../schemas';

type SpaceListCardProps = {
  spaces: SpaceListItem[];
};

export function SpaceListCard({ spaces }: SpaceListCardProps) {
  if (spaces.length === 0) {
    return (
      <div className='rounded-3xl border border-dashed border-slate-300/80 bg-white/60 p-8 text-center'>
        <p className='text-sm text-slate-600'>
          No spaces yet. A default space is created the first time you save
          something.
        </p>
      </div>
    );
  }

  return (
    <ul className='grid gap-3 md:grid-cols-2'>
      {spaces.map((space) => (
        <li key={space.id}>
          <Link
            href={`/app/spaces/${space.id}`}
            className='flex h-full flex-col gap-3 rounded-3xl border border-slate-200/80 bg-white/90 p-5 transition hover:border-slate-300 hover:bg-white'
          >
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <h3 className='text-lg font-semibold text-slate-950'>
                {space.name}
              </h3>
              {space.isDefault ? (
                <span className='inline-flex rounded-full border border-emerald-200/70 bg-emerald-100/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-900'>
                  Default
                </span>
              ) : null}
            </div>
            {space.description ? (
              <p className='text-sm leading-6 text-slate-700'>
                {space.description}
              </p>
            ) : null}
            <dl className='mt-auto flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500'>
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
          </Link>
        </li>
      ))}
    </ul>
  );
}
