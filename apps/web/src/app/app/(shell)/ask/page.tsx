import type { Metadata } from 'next';

import { AskPanel } from '@/features/query';
import { rpc } from '@/rpc/client';

export const metadata: Metadata = {
  title: 'Ask | Memory Vault',
  description: 'Ask grounded questions about your saved memory content.',
};

export default async function AskPage() {
  const spaces = await rpc.spaces.list();

  return (
    <div className='space-y-6'>
      <div className='space-y-2'>
        <p className='text-xs font-semibold uppercase tracking-[0.18em] text-slate-500'>
          Ask
        </p>
        <h2 className='text-2xl font-semibold tracking-tight text-slate-950'>
          Ask your memory
        </h2>
        <p className='max-w-2xl text-sm leading-7 text-slate-600'>
          Every answer cites the saved source it comes from. If there is not
          enough grounded evidence, the assistant will say so instead of
          guessing.
        </p>
      </div>

      <AskPanel
        spaces={spaces.map((space) => ({ id: space.id, name: space.name }))}
      />
    </div>
  );
}
