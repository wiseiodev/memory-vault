import Link from 'next/link';
import type { ReactNode } from 'react';

type ItemLinkProps = {
  children: ReactNode;
  className?: string;
  sourceItemId: string;
};

export function ItemLink({ children, className, sourceItemId }: ItemLinkProps) {
  return (
    <Link className={className} href={`/app/items/${sourceItemId}`}>
      {children}
    </Link>
  );
}
