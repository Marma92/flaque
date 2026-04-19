import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

export type UseQueryResult<T> = {
  data: T;
  loading: boolean;
  error: Error | null;
  refresh: () => void;
  setData: Dispatch<SetStateAction<T>>;
};

export type UseQueryOptions = {
  enabled?: boolean;
};

export function useQuery<T>(
  fetcher: () => Promise<T>,
  initialValue: T,
  options: UseQueryOptions = {}
): UseQueryResult<T> {
  const { enabled = true } = options;

  const [data, setData] = useState<T>(initialValue);
  const [loading, setLoading] = useState<boolean>(enabled);
  const [error, setError] = useState<Error | null>(null);
  const [nonce, setNonce] = useState(0);
  const requestIdRef = useRef(0);
  const initialValueRef = useRef(initialValue);

  useEffect(() => {
    if (!enabled) {
      setData(initialValueRef.current);
      setLoading(false);
      setError(null);
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    setLoading(true);
    setError(null);

    fetcher()
      .then((result) => {
        if (requestIdRef.current !== requestId) return;
        setData(result);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (requestIdRef.current !== requestId) return;
        const normalized = err instanceof Error ? err : new Error(String(err));
        setData(initialValueRef.current);
        setError(normalized);
        setLoading(false);
      });
  }, [fetcher, enabled, nonce]);

  const refresh = useCallback(() => {
    setNonce((n) => n + 1);
  }, []);

  return { data, loading, error, refresh, setData };
}
