import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy | Memory Vault',
  description:
    'Privacy policy for Memory Vault and the Memory Vault Chrome extension.',
};

const LAST_UPDATED = 'April 8, 2026';

export default function PrivacyPage() {
  return (
    <main className='mx-auto flex min-h-screen w-full max-w-4xl px-6 py-16'>
      <section className='surface flex w-full flex-col gap-8 rounded-[2rem] p-8 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.55)] sm:p-12'>
        <div className='space-y-4'>
          <span className='inline-flex w-fit rounded-full border border-sky-200/70 bg-sky-100/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-sky-900'>
            Privacy Policy
          </span>
          <div className='space-y-3'>
            <h1 className='text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl'>
              Memory Vault Privacy Policy
            </h1>
            <p className='text-sm leading-7 text-slate-600'>
              Last updated: {LAST_UPDATED}
            </p>
            <p className='max-w-3xl text-base leading-8 text-slate-700'>
              This Privacy Policy describes how Memory Vault collects, uses, and
              protects information when you use the Memory Vault website and the
              Memory Vault Chrome extension.
            </p>
          </div>
        </div>

        <div className='space-y-8 text-sm leading-7 text-slate-700'>
          <section className='space-y-3'>
            <h2 className='text-xl font-semibold text-slate-950'>
              What Memory Vault does
            </h2>
            <p>
              Memory Vault is a personal capture tool. It lets you save notes,
              web pages, and highlighted text to your own Memory Vault account
              so that content can be processed and retrieved later.
            </p>
          </section>

          <section className='space-y-3'>
            <h2 className='text-xl font-semibold text-slate-950'>
              Information we collect
            </h2>
            <p>Depending on how you use Memory Vault, we may collect:</p>
            <ul className='list-disc space-y-2 pl-6'>
              <li>
                Account information such as your email address when you sign in.
              </li>
              <li>
                Notes and other text that you choose to save to Memory Vault.
              </li>
              <li>
                Web page information that you explicitly choose to save,
                including page URL, title, selected text, and an HTML snapshot
                of the page at the time of capture.
              </li>
              <li>
                Extension pairing data, including a device token stored locally
                in the extension so it can stay connected to your account.
              </li>
              <li>
                Basic service and diagnostic information needed to operate the
                app securely, such as request metadata and token usage records.
              </li>
            </ul>
          </section>

          <section className='space-y-3'>
            <h2 className='text-xl font-semibold text-slate-950'>
              How we use information
            </h2>
            <p>We use collected information only to:</p>
            <ul className='list-disc space-y-2 pl-6'>
              <li>authenticate you and keep your account connected,</li>
              <li>store and process the content you choose to save,</li>
              <li>power memory retrieval and related product functionality,</li>
              <li>maintain service reliability and security, and</li>
              <li>support troubleshooting and abuse prevention.</li>
            </ul>
          </section>

          <section className='space-y-3'>
            <h2 className='text-xl font-semibold text-slate-950'>
              Chrome extension permissions
            </h2>
            <p>
              The Memory Vault Chrome extension requests only the permissions
              needed to support user-initiated capture:
            </p>
            <ul className='list-disc space-y-2 pl-6'>
              <li>
                <strong>`activeTab`</strong> to access the current tab after you
                click a save action.
              </li>
              <li>
                <strong>`scripting`</strong> to read highlighted text and
                capture the current page HTML when you ask the extension to save
                a page or selection.
              </li>
              <li>
                <strong>`tabs`</strong> to read the active tab&apos;s URL and
                title for the item you are saving.
              </li>
              <li>
                <strong>`storage`</strong> to store the extension&apos;s local
                pairing state and device token.
              </li>
              <li>
                Host permissions for the Memory Vault web app and its storage
                endpoints so captured content can be sent to your account.
              </li>
            </ul>
          </section>

          <section className='space-y-3'>
            <h2 className='text-xl font-semibold text-slate-950'>
              Data sharing
            </h2>
            <p>
              We do not sell your personal data. We do not transfer your data to
              third parties for purposes unrelated to Memory Vault&apos;s core
              functionality. We may rely on infrastructure providers that help
              us host, secure, and operate the service.
            </p>
          </section>

          <section className='space-y-3'>
            <h2 className='text-xl font-semibold text-slate-950'>
              Data retention
            </h2>
            <p>
              We retain saved content and related account data for as long as it
              is needed to provide the service, unless you request deletion or
              the data must be removed for legal or security reasons.
            </p>
          </section>

          <section className='space-y-3'>
            <h2 className='text-xl font-semibold text-slate-950'>Contact</h2>
            <p>If you have questions about this Privacy Policy, contact:</p>
            <p>
              <a
                className='font-medium text-sky-700 underline underline-offset-4'
                href='mailto:io.dwise@gmail.com'
              >
                io.dwise@gmail.com
              </a>
            </p>
          </section>
        </div>

        <div className='flex flex-wrap items-center gap-4 border-t border-slate-200/80 pt-6 text-sm text-slate-600'>
          <Link
            href='/'
            className='inline-flex items-center justify-center rounded-full bg-slate-950 px-5 py-3 font-semibold text-white transition hover:bg-slate-800'
          >
            Back to Memory Vault
          </Link>
          <p>
            This page is intended to serve as the public privacy policy for the
            Memory Vault website and Chrome extension.
          </p>
        </div>
      </section>
    </main>
  );
}
