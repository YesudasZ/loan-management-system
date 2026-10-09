import { useCallback, useEffect, useState } from 'react';
import { ApiError, apiRequest } from '@/lib/api-client';

export interface ApiQueryState<T> {
  data: T | null;
  error: ApiError | null;
  isLoading: boolean;
  /** Fetches again (e.g. after a mutation). */
  reload: () => void;
}

/** Loads `GET /api/v1{path}` on mount and whenever `path` or `reload()` changes it. */
export function useApiQuery<T>(path: string): ApiQueryState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    apiRequest<T>(path, { signal: controller.signal })
      .then((result) => {
        setData(result);
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
  }, [path, version]);

  const reload = useCallback(() => {
    setIsLoading(true);
    setVersion((previous) => previous + 1);
  }, []);

  return { data, error, isLoading, reload };
}
