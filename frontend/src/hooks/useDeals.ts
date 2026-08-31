/**
 * hooks/useDeals.ts
 *
 * Data hook for the deals list page.
 * Handles loading, error, and empty states — the page only renders content.
 */

import { useState, useEffect, useCallback } from 'react';
import { dealApi } from '../services/dealApi';
import type { DealSummary } from '../types/deal';
import type { DealStatus } from '../types/dealStates';

export interface UseDealsOptions {
  /** Fetch immediately on mount. Default true. */
  fetchOnMount?: boolean;
}

export interface UseDealsResult {
  deals: DealSummary[];
  total: number;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useDeals(
  options: UseDealsOptions = {}
): UseDealsResult {
  const { fetchOnMount = true } = options;

  const [deals, setDeals] = useState<DealSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!fetchOnMount) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await dealApi.listDeals();
        if (!cancelled) {
          setDeals(result.deals);
          setTotal(result.total);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'Failed to load deals. Please try again.'
          );
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
  }, [tick, fetchOnMount]);

  return { deals, total, loading, error, refetch };
}

/** Filter helpers — used by pages, not hooks */
export function filterDeals(
  deals: DealSummary[],
  filter: string,
  searchQuery: string
): DealSummary[] {
  let result = deals;

  if (filter !== 'all') {
    result = result.filter((d) => matchesFilter(d.status, filter));
  }

  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    result = result.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.counterparties.toLowerCase().includes(q)
    );
  }

  return result;
}

function matchesFilter(status: DealStatus, filter: string): boolean {
  const ACTIVE: DealStatus[] = [
    'DRAFT',
    'PENDING_ACCEPTANCE',
    'FUNDED',
    'IN_PROGRESS',
    'SUBMITTED',
    'APPROVED',
    'REVISION_REQUESTED',
  ];
  switch (filter) {
    case 'active':
      return ACTIVE.includes(status);
    case 'completed':
      return status === 'COMPLETED';
    case 'disputed':
      return status === 'DISPUTED';
    case 'declined':
      return status === 'DECLINED';
    case 'cancelled':
      return status === 'CANCELLED';
    default:
      return true;
  }
}
