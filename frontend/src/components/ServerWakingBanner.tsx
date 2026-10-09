'use client';

import { useSyncExternalStore } from 'react';
import { getServerWaking, subscribeToServerWaking } from '@/lib/api-client';

/** Shown while GET requests retry because the free-tier API is waking up (about a minute). */
export function ServerWakingBanner() {
  const isWaking = useSyncExternalStore(subscribeToServerWaking, getServerWaking, () => false);
  if (!isWaking) return null;

  return (
    <div role="status" className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-900">
      Waking up the server. This can take up to a minute on the free hosting plan…
    </div>
  );
}
