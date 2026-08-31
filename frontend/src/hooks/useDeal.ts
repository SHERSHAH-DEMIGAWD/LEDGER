/**
 * hooks/useDeal.ts
 *
 * Data hook for the deal detail page.
 * Handles loading, error, and not-found states — the page only renders content.
 */

import { useState, useEffect } from 'react';
import { dealApi } from '../services/dealApi';
import type { Deal } from '../types/deal';

export interface UseDealResult {
  deal: Deal | null;
  loading: boolean;
  error: string | null;
  /** True when loading is false and deal is null — the "not found" case. */
  notFound: boolean;
  /** Reload the current deal. */
  refetch: () => void;
}

export function useDeal(id: string | undefined): UseDealResult {
  const [deal, setDeal] = useState<Deal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!id) {
      setDeal(null);
      setLoading(false);
      setError(null);
      setNotFound(false);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setNotFound(false);
      try {
        const result = await dealApi.getDeal(id!);
        if (!cancelled) {
          setDeal(result);
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Failed to load deal.';
          if (msg.includes('not found') || msg.includes('404')) {
            setNotFound(true);
          } else {
            setError(msg);
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id, tick]);

  return {
    deal,
    loading,
    error,
    notFound,
    refetch: () => setTick((t) => t + 1),
  };
}
