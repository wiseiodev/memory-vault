import Link from 'next/link';

import { getSession } from '@/lib/server/auth/session';

export default async function Home() {
  const session = await getSession();

  return (
    <main className='flex min-h-screen items-center justify-center px-6 py-16'>
      <section className='surface flex w-full max-w-5xl flex-col gap-10 rounded-[2rem] p-8 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.55)] sm:p-12'>
        <div className='flex flex-col gap-5'>
          <span className='inline-flex w-fit rounded-full border border-sky-200/70 bg-sky-100/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-sky-900'>
            {session ? 'Signed in' : 'Public home'}
          </span>
          <div className='max-w-3xl space-y-4'>
            <h1 className='text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl'>
              {session
                ? 'Your memory vault foundation is authenticated'
                : 'Memory Vault is ready for its first real auth flow'}
            </h1>
            <p className='text-lg leading-8 text-slate-700'>
              {session ? (
                <>
                  Your session is active, the protected shell lives at{' '}
                  <code>/app</code>, and the repo is ready for the first memory
                  features to build on top of this auth foundation.
                </>
              ) : (
                <>
                  The repo is configured for web, extension, and MCP workspaces,
                  and LAB-115 adds Google sign-in plus the first protected route
                  at <code>/app</code>.
                </>
              )}
            </p>
            <p className='max-w-2xl text-sm leading-7 text-slate-600'>
              This starter keeps the platform narrow on purpose: Next.js App
              Router on Vercel, shared Turborepo config, Biome, Vitest, GitHub
              Actions, Lefthook, and now Better Auth + Drizzle wired from day
              one so follow-on tickets can focus on product behavior instead of
              repo plumbing.
            </p>
          </div>
        </div>

        <div className='flex flex-wrap items-center gap-4'>
          <Link
            href={session ? '/app' : '/login'}
            className='inline-flex items-center justify-center rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800'
          >
            {session ? 'Go to app' : 'Sign in with Google'}
          </Link>
          <p className='text-sm leading-7 text-slate-600'>
            {session
              ? `Signed in as ${session.user.email}`
              : 'The landing page stays public. Authentication begins on /login.'}
          </p>
        </div>

        <div className='grid gap-4 md:grid-cols-3'>
          <article className='rounded-3xl border border-slate-200/80 bg-white/90 p-5'>
            <h2 className='text-sm font-semibold uppercase tracking-[0.2em] text-slate-500'>
              App Surface
            </h2>
            <p className='mt-3 text-sm leading-7 text-slate-700'>
              <code>apps/web</code> uses Next.js App Router, Tailwind, a{' '}
              <code>src/</code> layout, and strict TypeScript defaults for the
              product UI and auth surface.
            </p>
          </article>

          <article className='rounded-3xl border border-slate-200/80 bg-white/90 p-5'>
            <h2 className='text-sm font-semibold uppercase tracking-[0.2em] text-slate-500'>
              Shared Config
            </h2>
            <p className='mt-3 text-sm leading-7 text-slate-700'>
              Workspace packages hold Biome and TypeScript baselines so future
              apps inherit the same conventions without drift.
            </p>
          </article>

          <article className='rounded-3xl border border-slate-200/80 bg-white/90 p-5'>
            <h2 className='text-sm font-semibold uppercase tracking-[0.2em] text-slate-500'>
              Quality Gates
            </h2>
            <p className='mt-3 text-sm leading-7 text-slate-700'>
              Git hooks and PR checks run formatting, type checks, tests, and
              builds before auth and later memory flows move deeper into
              implementation.
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}
