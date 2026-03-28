export default function AppPage() {
  return (
    <div className='space-y-6'>
      <div className='space-y-3'>
        <p className='text-xs font-semibold uppercase tracking-[0.18em] text-slate-500'>
          LAB-115
        </p>
        <h2 className='text-3xl font-semibold tracking-tight text-slate-950'>
          Google sign-in is wired into the first protected app route
        </h2>
        <p className='max-w-2xl text-sm leading-7 text-slate-600'>
          This shell is intentionally narrow. It proves the auth model, session
          persistence, and protected-route behavior before the inbox, spaces,
          and ask surfaces arrive in later tickets.
        </p>
      </div>

      <div className='grid gap-4 md:grid-cols-2'>
        <article className='rounded-3xl border border-slate-200/80 bg-white/90 p-5'>
          <h3 className='text-sm font-semibold uppercase tracking-[0.18em] text-slate-500'>
            Auth foundation
          </h3>
          <p className='mt-3 text-sm leading-7 text-slate-700'>
            Better Auth uses Google-only sign-in in v1, DB-backed sessions in
            Neon, and a shared server helper for protected pages and future
            route handlers.
          </p>
        </article>

        <article className='rounded-3xl border border-slate-200/80 bg-white/90 p-5'>
          <h3 className='text-sm font-semibold uppercase tracking-[0.18em] text-slate-500'>
            Next step
          </h3>
          <p className='mt-3 text-sm leading-7 text-slate-700'>
            LAB-116 will layer the canonical memory schema on top of this
            identity foundation instead of re-deciding how the app reaches
            Postgres.
          </p>
        </article>
      </div>
    </div>
  );
}
