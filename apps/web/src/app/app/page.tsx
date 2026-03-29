import type { Metadata } from 'next';
import { CaptureVerificationCard } from '@/features/captures';
import { IngestionJobsCard } from '@/features/ingestion';
import { UploadListCard, UploadVerificationCard } from '@/features/uploads';
import { rpc } from '@/rpc/client';

export const metadata: Metadata = {
  title: 'App | Memory Vault',
  description:
    'Internal verification surface for Memory Vault capture flows and observability foundations.',
};

export default async function AppPage() {
  const jobs = await rpc.ingestion.listRecent();
  const uploads = await rpc.uploads.list();

  return (
    <div className='space-y-6'>
      <div className='space-y-3'>
        <p className='text-xs font-semibold uppercase tracking-[0.18em] text-slate-500'>
          LAB-142 + LAB-118 + LAB-119
        </p>
        <h2 className='text-3xl font-semibold tracking-tight text-slate-950'>
          Capture, observability, and note ingestion are now wired into the app
          shell
        </h2>
        <p className='max-w-2xl text-sm leading-7 text-slate-600'>
          This shell stays intentionally narrow. It now proves request-scoped
          logging, direct S3 uploads, canonical capture, and the first
          Inngest-backed ingestion path on top of the auth, schema, and storage
          foundations.
        </p>
      </div>

      <div className='grid gap-4 md:grid-cols-2'>
        <article className='rounded-3xl border border-slate-200/80 bg-white/90 p-5'>
          <h3 className='text-sm font-semibold uppercase tracking-[0.18em] text-slate-500'>
            Capture flow
          </h3>
          <p className='mt-3 text-sm leading-7 text-slate-700'>
            Notes and saved URLs now create canonical `source_items`
            immediately, while file uploads still reserve storage first and then
            finalize through the same capture surface and enqueue ingestion
            jobs.
          </p>
        </article>

        <article className='rounded-3xl border border-slate-200/80 bg-white/90 p-5'>
          <h3 className='text-sm font-semibold uppercase tracking-[0.18em] text-slate-500'>
            Observability
          </h3>
          <p className='mt-3 text-sm leading-7 text-slate-700'>
            Note captures now flow through Inngest and create `segments`.
            Unsupported source kinds fail explicitly in the shared ingestion job
            surface instead of disappearing into background work.
          </p>
        </article>
      </div>

      <CaptureVerificationCard />
      <IngestionJobsCard jobs={jobs} />
      <UploadVerificationCard />
      <UploadListCard uploads={uploads} />
    </div>
  );
}
