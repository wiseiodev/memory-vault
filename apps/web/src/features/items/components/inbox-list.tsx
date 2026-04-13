import type { ItemListItem } from '../schemas';
import { ItemPreviewCard } from './item-preview-card';

type InboxListProps = {
  emptyMessage?: string;
  items: ItemListItem[];
  showSpace?: boolean;
};

export function InboxList({
  emptyMessage = 'Nothing here yet. Capture a note, save a URL, or upload a file to get started.',
  items,
  showSpace = true,
}: InboxListProps) {
  if (items.length === 0) {
    return (
      <div className='rounded-3xl border border-dashed border-slate-300/80 bg-white/60 p-8 text-center'>
        <p className='text-sm text-slate-600'>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <ul className='space-y-3'>
      {items.map((item) => (
        <li key={item.sourceItemId}>
          <ItemPreviewCard item={item} showSpace={showSpace} />
        </li>
      ))}
    </ul>
  );
}
