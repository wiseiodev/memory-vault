import type { Metadata } from 'next';

import { QuickCaptureComposer } from '@/features/captures';
import { InboxList } from '@/features/items';
import { rpc } from '@/rpc/client';

export const metadata: Metadata = {
  title: 'Inbox | Memory Vault',
  description: 'Everything you have saved, most recent first.',
};

export default async function InboxPage() {
  const items = await rpc.items.list({});

  return (
    <div className='space-y-6'>
      <div className='space-y-2'>
        <p className='text-xs font-semibold uppercase tracking-[0.18em] text-slate-500'>
          Inbox
        </p>
        <h2 className='text-2xl font-semibold tracking-tight text-slate-950'>
          Everything you have saved
        </h2>
        <p className='max-w-2xl text-sm leading-7 text-slate-600'>
          Notes, saved URLs, and uploaded files flow into the same inbox. Open
          an item to inspect the raw source and any derived memories.
        </p>
      </div>

      <QuickCaptureComposer />

      <InboxList items={items} />
    </div>
  );
}
