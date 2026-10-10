import type { Metadata } from 'next';
import { Toaster } from 'sonner';
import { ServerWakingBanner } from '@/components/ServerWakingBanner';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Loan Management System', template: '%s · LMS' },
  description: 'Apply for a personal loan and manage loans through their lifecycle.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-indigo-700 focus:shadow"
        >
          Skip to content
        </a>
        <ServerWakingBanner />
        {children}
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
