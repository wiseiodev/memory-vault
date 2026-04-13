import Link from 'next/link';
import type { ReactNode } from 'react';

import { AppShellNav } from '@/components/app-shell/app-shell-nav';
import { requireSession } from '@/lib/server/auth/session';
import '@/rpc/server-client';

export const dynamic = 'force-dynamic';

type AppLayoutProps = {
  children: ReactNode;
};

export default async function AppLayout({ children }: AppLayoutProps) {
  const session = await requireSession();

  return (
    <div className='mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-6 py-8'>
      <header className='surface flex flex-wrap items-center justify-between gap-4 rounded-[2rem] p-5 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.55)]'>
        <Link href='/app' className='flex flex-col gap-1'>
          <span className='text-xs font-semibold uppercase tracking-[0.24em] text-emerald-900'>
            Memory Vault
          </span>
          <span className='text-lg font-semibold tracking-tight text-slate-950'>
            {session.user.name}
          </span>
        </Link>
        <AppShellNav />
      </header>

      <main className='surface min-w-0 rounded-[2rem] p-6 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.55)]'>
        {children}
      </main>
    </div>
  );
}
