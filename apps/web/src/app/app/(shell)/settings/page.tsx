import type { Metadata } from 'next';
import { SignOutButton } from '@/components/auth/sign-out-button';
import { AccountDangerZoneCard, AccountExportCard } from '@/features/account';
import { DeviceTokenListCard } from '@/features/device-tokens';
import { requireSession } from '@/lib/server/auth/session';
import { rpc } from '@/rpc/client';

export const metadata: Metadata = {
  title: 'Settings | Memory Vault',
  description: 'Account details, data ownership, and connected devices.',
};

export default async function SettingsPage() {
  const [session, deviceTokens] = await Promise.all([
    requireSession(),
    rpc.deviceTokens.list(),
  ]);

  return (
    <div className='space-y-6'>
      <div className='space-y-2'>
        <p className='text-xs font-semibold uppercase tracking-[0.18em] text-slate-500'>
          Settings
        </p>
        <h2 className='text-2xl font-semibold tracking-tight text-slate-950'>
          Account and devices
        </h2>
        <p className='max-w-2xl text-sm leading-7 text-slate-600'>
          Review the account that owns your memory vault and revoke any
          extension device tokens you no longer use.
        </p>
      </div>

      <section className='rounded-3xl border border-slate-200/80 bg-white/90 p-5'>
        <h3 className='text-sm font-semibold uppercase tracking-[0.18em] text-slate-500'>
          Account
        </h3>
        <dl className='mt-3 grid gap-3 text-sm text-slate-700 sm:grid-cols-2'>
          <div>
            <dt className='text-xs font-semibold uppercase tracking-[0.16em] text-slate-500'>
              Name
            </dt>
            <dd className='mt-1 text-slate-900'>{session.user.name}</dd>
          </div>
          <div>
            <dt className='text-xs font-semibold uppercase tracking-[0.16em] text-slate-500'>
              Email
            </dt>
            <dd className='mt-1 break-all text-slate-900'>
              {session.user.email}
            </dd>
          </div>
          <div>
            <dt className='text-xs font-semibold uppercase tracking-[0.16em] text-slate-500'>
              User ID
            </dt>
            <dd className='mt-1 break-all text-slate-900'>{session.user.id}</dd>
          </div>
          <div>
            <dt className='text-xs font-semibold uppercase tracking-[0.16em] text-slate-500'>
              Session expires
            </dt>
            <dd className='mt-1 text-slate-900'>
              {new Date(session.session.expiresAt).toLocaleString()}
            </dd>
          </div>
        </dl>
        <div className='mt-4'>
          <SignOutButton />
        </div>
      </section>

      <DeviceTokenListCard deviceTokens={deviceTokens} />

      <section className='space-y-3'>
        <h3 className='text-sm font-semibold uppercase tracking-[0.18em] text-slate-500'>
          Data ownership
        </h3>
        <p className='max-w-2xl text-sm leading-7 text-slate-600'>
          You own your vault. Export a full copy at any time, and permanently
          delete your account and its content whenever you like. Deletion
          removes live data from active retrieval immediately. Backup copies may
          persist in managed Postgres backups and S3 versioned storage for up to
          30 days before being removed.
        </p>
      </section>

      <AccountExportCard />

      <AccountDangerZoneCard userEmail={session.user.email} />
    </div>
  );
}
