import type { Metadata } from 'next';
import { ButtonLink } from '@/components/ui/ButtonLink';

export const metadata: Metadata = { title: 'Page not found' };

export default function NotFound() {
  return (
    <main
      id="main-content"
      className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center"
    >
      <p className="text-5xl font-bold text-slate-300">404</p>
      <h1 className="text-2xl font-semibold text-slate-900">Page not found</h1>
      <p className="max-w-md text-sm text-slate-600">
        The page you were looking for doesn&apos;t exist or has moved.
      </p>
      <ButtonLink href="/">Go to my home page</ButtonLink>
    </main>
  );
}
