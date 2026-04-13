import { ORPCError } from '@orpc/server';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { type ItemDetail, ItemDetailView } from '@/features/items';
import { rpc } from '@/rpc/client';

type ItemDetailPageProps = {
  params: Promise<{ sourceItemId: string }>;
};

export async function generateMetadata({
  params,
}: ItemDetailPageProps): Promise<Metadata> {
  const { sourceItemId } = await params;

  try {
    const item = await rpc.items.get({ sourceItemId });
    return {
      title: `${item.title ?? 'Item'} | Memory Vault`,
    };
  } catch {
    return { title: 'Item | Memory Vault' };
  }
}

export default async function ItemDetailPage({ params }: ItemDetailPageProps) {
  const { sourceItemId } = await params;

  let item: ItemDetail;
  try {
    item = await rpc.items.get({ sourceItemId });
  } catch (error) {
    if (error instanceof ORPCError && error.code === 'NOT_FOUND') {
      notFound();
    }
    throw error;
  }

  return (
    <div className='space-y-6'>
      <Link
        href='/app'
        className='text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 hover:text-slate-700'
      >
        ← Inbox
      </Link>

      <ItemDetailView item={item} />
    </div>
  );
}
