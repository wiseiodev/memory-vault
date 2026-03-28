import Link from 'next/link';
import type { ReactNode } from 'react';

import { SignOutButton } from '@/components/auth/sign-out-button';
import { requireSession } from '@/lib/server/auth/session';

export const dynamic = 'force-dynamic';

type AppLayoutProps = {
  children: ReactNode;
};

export default async function AppLayout({ children }: AppLayoutProps) {
  const session = await requireSession();

  return (
    <div className='mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-6 py-10'>
      <header className='surface flex flex-col gap-6 rounded-[2rem] p-6 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.55)] sm:flex-row sm:items-start sm:justify-between'>
        <div className='space-y-3'>
          <div className='inline-flex w-fit rounded-full border border-emerald-200/70 bg-emerald-100/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-900'>
            Authenticated App
          </div>
          <div className='space-y-2'>
            <h1 className='text-3xl font-semibold tracking-tight text-slate-950'>
              Welcome back, {session.user.name}
            </h1>
            <p className='max-w-2xl text-sm leading-7 text-slate-600'>
              This is the first protected product shell for Memory Vault. The
              auth session is stored in Neon and verified server-side before the
              app route renders.
            </p>
          </div>
        </div>

        <div className='flex flex-col gap-3 rounded-3xl border border-slate-200/80 bg-white/90 p-4 text-sm text-slate-700'>
          <div>
            <p className='text-xs font-semibold uppercase tracking-[0.18em] text-slate-500'>
              Account
            </p>
            <p className='mt-1 font-medium text-slate-900'>
              {session.user.email}
            </p>
          </div>
          <div className='flex flex-wrap gap-3'>
            <Link
              href='/'
              className='inline-flex items-center rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950'
            >
              Public home
            </Link>
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className='grid gap-6 lg:grid-cols-[1.6fr_0.9fr]'>
        <section className='surface rounded-[2rem] p-6 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.55)]'>
          {children}
        </section>
        <aside className='surface rounded-[2rem] p-6 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.55)]'>
          <h2 className='text-sm font-semibold uppercase tracking-[0.18em] text-slate-500'>
            Session details
          </h2>
          <dl className='mt-4 space-y-4 text-sm text-slate-700'>
            <div>
              <dt className='text-xs font-semibold uppercase tracking-[0.16em] text-slate-500'>
                User ID
              </dt>
              <dd className='mt-1 break-all text-slate-900'>
                {session.user.id}
              </dd>
            </div>
            <div>
              <dt className='text-xs font-semibold uppercase tracking-[0.16em] text-slate-500'>
                Session ID
              </dt>
              <dd className='mt-1 break-all text-slate-900'>
                {session.session.id}
              </dd>
            </div>
            <div>
              <dt className='text-xs font-semibold uppercase tracking-[0.16em] text-slate-500'>
                Expires
              </dt>
              <dd className='mt-1 text-slate-900'>
                {new Date(session.session.expiresAt).toLocaleString()}
              </dd>
            </div>
          </dl>
        </aside>
      </main>
    </div>
  );
}
