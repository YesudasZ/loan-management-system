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
        <ServerWakingBanner />
        {children}
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
