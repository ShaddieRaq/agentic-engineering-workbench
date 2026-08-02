import { useCallback, useEffect, useState } from "react";
import { api, type Operation } from "./api.js";

export function useResource<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(path));

  const reload = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try {
      setData(await api<T>(path));
      setError(null);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => { void reload(); }, [reload]);
  return { data, error, loading, reload };
}

export function useOperation(operationId: string | null) {
  const resource = useResource<Operation>(
    operationId ? `/api/operations/${operationId}` : null,
  );

  useEffect(() => {
    if (!operationId || resource.data?.status === "completed" || resource.data?.status === "failed") {
      return;
    }
    const timer = window.setInterval(() => void resource.reload(), 750);
    return () => window.clearInterval(timer);
  }, [operationId, resource.data?.status, resource.reload]);

  return resource;
}
