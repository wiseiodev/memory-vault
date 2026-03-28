import { UploadListCard, UploadVerificationCard } from '@/features/uploads';
import { rpc } from '@/rpc/client';

export default async function AppPage() {
  const uploads = await rpc.uploads.list();

  return (
    <div className='space-y-6'>
      <div className='space-y-3'>
        <p className='text-xs font-semibold uppercase tracking-[0.18em] text-slate-500'>
          LAB-117
        </p>
        <h2 className='text-3xl font-semibold tracking-tight text-slate-950'>
          Direct S3 uploads are wired into the first protected app route
        </h2>
        <p className='max-w-2xl text-sm leading-7 text-slate-600'>
          This shell stays intentionally narrow. It now proves the first blob
          reservation, direct upload, and completion flow on top of the auth,
          schema, and storage foundations.
        </p>
      </div>

      <div className='grid gap-4 md:grid-cols-2'>
        <article className='rounded-3xl border border-slate-200/80 bg-white/90 p-5'>
          <h3 className='text-sm font-semibold uppercase tracking-[0.18em] text-slate-500'>
            Blob flow
          </h3>
          <p className='mt-3 text-sm leading-7 text-slate-700'>
            Upload reservation creates canonical source rows first, the browser
            `PUT`s directly to S3, and completion confirms the object before
            final metadata is saved in Neon.
          </p>
        </article>

        <article className='rounded-3xl border border-slate-200/80 bg-white/90 p-5'>
          <h3 className='text-sm font-semibold uppercase tracking-[0.18em] text-slate-500'>
            Next step
          </h3>
          <p className='mt-3 text-sm leading-7 text-slate-700'>
            Later tickets can build extraction, segmentation, and ingestion jobs
            on top of the durable `source_items` and `source_blobs` records this
            flow now produces.
          </p>
        </article>
      </div>

      <UploadVerificationCard />
      <UploadListCard uploads={uploads} />
    </div>
  );
}
