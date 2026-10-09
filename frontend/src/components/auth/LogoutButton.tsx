'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { apiRequest } from '@/lib/api-client';

export function LogoutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function handleLogout() {
    setIsLoggingOut(true);
    try {
      await apiRequest<null>('/auth/logout', { method: 'POST' });
      // Leaving the authenticated layout unmounts everything that held the old session.
      router.replace('/login');
    } catch {
      toast.error('Could not log out. Please try again.');
      setIsLoggingOut(false);
    }
  }

  return (
    <Button
      variant="secondary"
      isLoading={isLoggingOut}
      onClick={handleLogout}
      className={className}
    >
      Log out
    </Button>
  );
}
