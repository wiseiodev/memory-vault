import type { Metadata } from 'next';

import { SpaceListCard } from '@/features/spaces';
import { rpc } from '@/rpc/client';

export const metadata: Metadata = {
  title: 'Spaces | Memory Vault',
  description: 'Organize saved memory content by space.',
};

export default async function SpacesPage() {
  const spaces = await rpc.spaces.list();

  return (
    <div className='space-y-6'>
      <div className='space-y-2'>
        <p className='text-xs font-semibold uppercase tracking-[0.18em] text-slate-500'>
          Spaces
        </p>
        <h2 className='text-2xl font-semibold tracking-tight text-slate-950'>
          Your spaces
        </h2>
        <p className='max-w-2xl text-sm leading-7 text-slate-600'>
          Spaces are the unit of scoping for saved content, derived memories,
          and ask-with-citations queries.
        </p>
      </div>

      <SpaceListCard spaces={spaces} />
    </div>
  );
}
