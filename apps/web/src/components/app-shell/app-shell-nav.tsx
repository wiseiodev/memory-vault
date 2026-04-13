'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  {
    href: '/app',
    label: 'Inbox',
    match: (pathname: string) => pathname === '/app',
  },
  {
    href: '/app/spaces',
    label: 'Spaces',
    match: (pathname: string) =>
      pathname === '/app/spaces' || pathname.startsWith('/app/spaces/'),
  },
  {
    href: '/app/ask',
    label: 'Ask',
    match: (pathname: string) => pathname.startsWith('/app/ask'),
  },
  {
    href: '/app/settings',
    label: 'Settings',
    match: (pathname: string) => pathname.startsWith('/app/settings'),
  },
] as const;

export function AppShellNav() {
  const pathname = usePathname() ?? '/app';

  return (
    <nav className='flex flex-wrap items-center gap-1'>
      {NAV_ITEMS.map((item) => {
        const active = item.match(pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`inline-flex items-center rounded-full border px-4 py-2 text-sm font-medium transition ${
              active
                ? 'border-slate-950 bg-slate-950 text-white'
                : 'border-slate-200 text-slate-700 hover:border-slate-300 hover:text-slate-950'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
