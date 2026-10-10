import type { Metadata } from 'next';
import { CollectionQueue } from '@/components/dashboard/CollectionModule';

export const metadata: Metadata = { title: 'Collection' };

export default function CollectionModulePage() {
  return <CollectionQueue />;
}
