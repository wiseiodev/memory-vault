import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Memory Vault',
  description:
    'Vercel-first monorepo foundations for the Personal Memory Vault project.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang='en'
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className='min-h-full bg-[radial-gradient(circle_at_top,_rgba(125,211,252,0.35),_transparent_38%),linear-gradient(180deg,_#f8fafc_0%,_#eff6ff_48%,_#e2e8f0_100%)] text-slate-950'>
        {children}
      </body>
    </html>
  );
}
