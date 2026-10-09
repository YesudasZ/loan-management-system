'use client';

import { createContext, useCallback, useEffect, useState, type ReactNode } from 'react';
import { ApiError, apiRequest } from '@/lib/api-client';
import type { User } from '@/types/user';

export interface CurrentUserState {
  user: User | null;
  isLoading: boolean;
  error: ApiError | null;
  reload: () => void;
}

export const CurrentUserContext = createContext<CurrentUserState | null>(null);

/**
 * Loads the logged-in user once per page load (the cookie is httpOnly, so `/auth/me` is the
 * only way to learn who is logged in). A 401 makes the API client redirect to /login.
 */
export function CurrentUserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    apiRequest<{ user: User }>('/auth/me', { signal: controller.signal })
      .then((data) => {
        setUser(data.user);
        setError(null);
        setIsLoading(false);
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          caught instanceof ApiError ? caught : new ApiError(0, 'UNKNOWN', 'Unexpected error'),
        );
        setIsLoading(false);
      });
    return () => controller.abort();
  }, [attempt]);

  const reload = useCallback(() => {
    setIsLoading(true);
    setAttempt((previous) => previous + 1);
  }, []);

  return (
    <CurrentUserContext value={{ user, isLoading, error, reload }}>{children}</CurrentUserContext>
  );
}
