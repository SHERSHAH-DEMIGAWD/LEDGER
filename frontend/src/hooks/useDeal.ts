import { useState, useEffect, useCallback, useRef } from 'react';
import { dealApi } from '../services/dealApi';
import { useAuth } from '../contexts/AuthContext';
import type { Deal } from '../types/deal';

export interface UseDealResult {
  deal: Deal | null;
  loading: boolean;
  /** Refreshing a current view keeps its form mounted; actions must wait. */
  refreshing: boolean;
  error: string | null;
  notFound: boolean;
  refetch: () => void;
}

export function useDeal(id: string | undefined): UseDealResult {
  const { user } = useAuth();
  const key = `${user?.id}:${user?.role}:${id}`;
  const [snapshot, setSnapshot] = useState<{ key: string; deal: Deal } | null>(null);
  const [refreshing, setRefreshing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [tick, setTick] = useState(0);
  const sequence = useRef(0);

  const refetch = useCallback(() => {
    sequence.current += 1;
    setRefreshing(true);
    setTick((value) => value + 1);
  }, []);

  useEffect(() => {
    const request = ++sequence.current;
    let cancelled = false;
    setError(null);
    setNotFound(false);
    if (!id || !user) {
      setSnapshot(null);
      setRefreshing(false);
      return;
    }
    setRefreshing(true);
    dealApi.getDeal(id).then((deal) => {
      if (!cancelled && sequence.current === request) setSnapshot({ key, deal });
    }).catch((err: unknown) => {
      if (cancelled || sequence.current !== request) return;
      setSnapshot(null);
      const message = err instanceof Error ? err.message : 'Failed to load deal.';
      if (message.includes('not found') || message.includes('404')) setNotFound(true);
      else setError(message);
    }).finally(() => {
      if (!cancelled && sequence.current === request) setRefreshing(false);
    });
    return () => { cancelled = true; };
  }, [id, user?.id, user?.role, key, tick]);

  useEffect(() => {
    const refreshVisible = () => { if (document.visibilityState !== 'hidden') refetch(); };
    window.addEventListener('focus', refreshVisible);
    document.addEventListener('visibilitychange', refreshVisible);
    const interval = window.setInterval(refreshVisible, 30_000);
    return () => {
      window.removeEventListener('focus', refreshVisible);
      document.removeEventListener('visibilitychange', refreshVisible);
      window.clearInterval(interval);
    };
  }, [refetch]);

  // Actor/deal changes hide the previous record in the first render, before
  // effects run. Failed refreshes clear it rather than preserving stale state.
  const deal = snapshot?.key === key ? snapshot.deal : null;
  return { deal, loading: !deal && refreshing, refreshing, error, notFound, refetch };
}
