import { redirect } from 'next/navigation';

import { getSession } from '@/lib/server/auth/session';
import { verifySignedConnectPayload } from '@/lib/server/extensions/connect-payload';

export const dynamic = 'force-dynamic';

type ConnectPageProps = {
  searchParams: Promise<{
    payload?: string | string[];
  }>;
};

export default async function ExtensionConnectPage({
  searchParams,
}: ConnectPageProps) {
  const resolvedSearchParams = await searchParams;
  const payloadValue = Array.isArray(resolvedSearchParams.payload)
    ? resolvedSearchParams.payload[0]
    : resolvedSearchParams.payload;
  const session = await getSession();

  if (!session) {
    const callbackPath = `/app/extension/connect?payload=${encodeURIComponent(payloadValue ?? '')}`;
    redirect(`/login?callback=${encodeURIComponent(callbackPath)}`);
  }

  const payload = verifySignedConnectPayload(payloadValue);

  if (!payload) {
    return (
      <main className='mx-auto flex min-h-screen max-w-3xl items-center justify-center px-6 py-16'>
        <section className='surface w-full rounded-[2rem] p-8 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.55)]'>
          <h1 className='text-2xl font-semibold tracking-tight text-slate-950'>
            Extension pairing link expired
          </h1>
          <p className='mt-3 text-sm leading-7 text-slate-700'>
            Return to the extension and start the connection flow again.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className='mx-auto flex min-h-screen max-w-3xl items-center justify-center px-6 py-16'>
      <section className='surface w-full rounded-[2rem] p-8 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.55)]'>
        <div className='space-y-3'>
          <span className='inline-flex w-fit rounded-full border border-emerald-200/70 bg-emerald-100/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-900'>
            Chrome extension pairing
          </span>
          <h1 className='text-3xl font-semibold tracking-tight text-slate-950'>
            Connect your browser extension
          </h1>
          <p className='text-sm leading-7 text-slate-700'>
            This will issue a revocable device token for the extension and bind
            it to your current personal space.
          </p>
        </div>

        <dl className='mt-6 grid gap-4 rounded-3xl border border-slate-200/80 bg-white/90 p-5 text-sm text-slate-700'>
          <div>
            <dt className='text-xs font-semibold uppercase tracking-[0.16em] text-slate-500'>
              Device
            </dt>
            <dd className='mt-1 text-slate-900'>
              {payload.deviceLabel ?? 'Chrome extension'}
            </dd>
          </div>
          <div>
            <dt className='text-xs font-semibold uppercase tracking-[0.16em] text-slate-500'>
              Extension version
            </dt>
            <dd className='mt-1 text-slate-900'>
              {payload.extensionVersion ?? 'Unknown'}
            </dd>
          </div>
          <div>
            <dt className='text-xs font-semibold uppercase tracking-[0.16em] text-slate-500'>
              Browser version
            </dt>
            <dd className='mt-1 text-slate-900'>
              {payload.browserVersion ?? 'Unknown'}
            </dd>
          </div>
        </dl>

        <form
          action='/app/extension/connect/confirm'
          method='post'
          className='mt-6'
        >
          <input type='hidden' name='payload' value={payloadValue ?? ''} />
          <button
            type='submit'
            className='inline-flex items-center justify-center rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800'
          >
            Connect extension
          </button>
        </form>
      </section>
    </main>
  );
}
