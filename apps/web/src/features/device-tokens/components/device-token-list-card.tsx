import type { DeviceTokenListItem } from '../schemas';
import { RevokeDeviceTokenButton } from './revoke-device-token-button';

export function DeviceTokenListCard(input: {
  deviceTokens: DeviceTokenListItem[];
}) {
  return (
    <article className='rounded-3xl border border-slate-200/80 bg-white/90 p-5'>
      <div className='space-y-2'>
        <h3 className='text-sm font-semibold uppercase tracking-[0.18em] text-slate-500'>
          Connected devices
        </h3>
        <p className='text-sm leading-7 text-slate-700'>
          Extension device tokens can be revoked independently from your web
          session.
        </p>
      </div>

      {input.deviceTokens.length === 0 ? (
        <p className='mt-4 text-sm text-slate-600'>
          No extension devices have been paired yet.
        </p>
      ) : (
        <div className='mt-4 space-y-3'>
          {input.deviceTokens.map((deviceToken) => (
            <div
              key={deviceToken.id}
              className='rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4'
            >
              <div className='flex flex-wrap items-start justify-between gap-3'>
                <div className='space-y-1'>
                  <p className='font-medium text-slate-900'>
                    {deviceToken.label ?? 'Chrome extension'}
                  </p>
                  <p className='text-xs uppercase tracking-[0.16em] text-slate-500'>
                    {deviceToken.platform.replaceAll('_', ' ')} /{' '}
                    {deviceToken.tokenPrefix}
                  </p>
                </div>
                {deviceToken.revokedAt ? (
                  <span className='rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500'>
                    Revoked
                  </span>
                ) : (
                  <RevokeDeviceTokenButton deviceTokenId={deviceToken.id} />
                )}
              </div>
              <dl className='mt-3 grid gap-2 text-sm text-slate-700'>
                <div>
                  <dt className='text-xs font-semibold uppercase tracking-[0.16em] text-slate-500'>
                    Added
                  </dt>
                  <dd className='mt-1 text-slate-900'>
                    {new Date(deviceToken.createdAt).toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt className='text-xs font-semibold uppercase tracking-[0.16em] text-slate-500'>
                    Last used
                  </dt>
                  <dd className='mt-1 text-slate-900'>
                    {deviceToken.lastUsedAt
                      ? new Date(deviceToken.lastUsedAt).toLocaleString()
                      : 'Never'}
                  </dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
