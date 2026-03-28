import Link from 'next/link';
import { redirect } from 'next/navigation';

import { GoogleSignInButton } from '@/components/auth/google-sign-in-button';
import { getSession } from '@/lib/server/auth/session';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const session = await getSession();

  if (session) {
    redirect('/app');
  }

  return (
    <main className='flex min-h-screen items-center justify-center px-6 py-16'>
      <section className='surface flex w-full max-w-4xl flex-col gap-8 rounded-[2rem] p-8 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.55)] sm:p-12'>
        <div className='space-y-4'>
          <span className='inline-flex w-fit rounded-full border border-amber-200/70 bg-amber-100/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-900'>
            Google-only v1 auth
          </span>
          <div className='max-w-2xl space-y-3'>
            <h1 className='text-4xl font-semibold tracking-tight text-slate-950'>
              Sign in to your memory vault
            </h1>
            <p className='text-base leading-8 text-slate-700'>
              LAB-115 keeps auth intentionally small: Google sign-in only,
              server-validated sessions, and a protected product shell ready for
              the first real memory features.
            </p>
          </div>
        </div>

        <div className='flex flex-col gap-4 rounded-3xl border border-slate-200/80 bg-white/90 p-6'>
          <GoogleSignInButton />
          <p className='text-sm leading-7 text-slate-600'>
            By continuing, you’ll authenticate with Google and land in the
            protected <code>/app</code> shell.
          </p>
        </div>

        <div className='flex flex-wrap items-center gap-3 text-sm text-slate-600'>
          <Link
            href='/'
            className='font-medium text-slate-900 underline-offset-4 hover:underline'
          >
            Back to public home
          </Link>
          <span aria-hidden='true' className='text-slate-400'>
            /
          </span>
          <span>
            Preview and production use the same Google OAuth setup for now.
          </span>
        </div>
      </section>
    </main>
  );
}
