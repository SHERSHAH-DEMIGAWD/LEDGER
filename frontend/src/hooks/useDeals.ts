/**
 * hooks/useDeals.ts
 *
 * Data hook for the deals list page.
 * Handles loading, error, and empty states — the page only renders content.
 *
 * Status filters are applied by the API; text search uses its returned records.
 * Visible registers refresh so invitation responses reach the brand's view.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { dealApi } from '../services/dealApi';
import { useAuth } from '../contexts/AuthContext';
import type { DealSummary } from '../types/deal';
import type { DealStatus } from '../types/dealStates';

export interface UseDealsOptions {
  /** Fetch immediately on mount. Default true. */
  fetchOnMount?: boolean;
  /** Server-side status filter. */
  status?: DealStatus;
  /** Text search over the returned records. */
  search?: string;
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
  const { fetchOnMount = true, status, search } = options;
  const { user } = useAuth();
  const key = JSON.stringify([user?.id, user?.role, status, search]);

  const [snapshot, setSnapshot] = useState<{
    key: string; deals: DealSummary[]; total: number; error: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const sequence = useRef(0);

  const refetch = useCallback(() => {
    sequence.current += 1;
    setLoading(true);
    setTick((t) => t + 1);
  }, []);

  useEffect(() => {
    const request = ++sequence.current;
    if (!fetchOnMount || !user) {
      setSnapshot(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const result = await dealApi.listDeals({ status, search });
        if (!cancelled && sequence.current === request) {
          setSnapshot({ key, ...result, error: null });
        }
      } catch (err) {
        if (!cancelled && sequence.current === request) {
          setSnapshot({
            key, deals: [], total: 0,
            error: err instanceof Error
              ? err.message
              : 'Failed to load deals. Please try again.',
          });
        }
      } finally {
        if (!cancelled && sequence.current === request) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [tick, fetchOnMount, status, search, user?.id, user?.role, key]);

  useEffect(() => {
    if (!fetchOnMount || !user) return;
    const refreshVisible = () => { if (document.visibilityState !== 'hidden') refetch(); };
    window.addEventListener('focus', refreshVisible);
    document.addEventListener('visibilitychange', refreshVisible);
    const interval = window.setInterval(refreshVisible, 30_000);
    return () => {
      window.removeEventListener('focus', refreshVisible);
      document.removeEventListener('visibilitychange', refreshVisible);
      window.clearInterval(interval);
    };
  }, [fetchOnMount, user?.id, user?.role, refetch]);

  // Hide another account's data and obsolete filter results on the render
  // that changes identity, before effects or outstanding requests finish.
  const current = user && fetchOnMount && snapshot?.key === key ? snapshot : null;
  return {
    deals: current?.deals ?? [],
    total: current?.total ?? 0,
    loading: Boolean(user && fetchOnMount && (loading || !current)),
    error: current?.error ?? null,
    refetch,
  };
}

/**
 * Filter helpers — used by pages for client-side filter chips on top of
 * server-filtered results, including dashboard tab grouping.
 */
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
    'ACCEPTED',
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
