/**
 * hooks/useDealActions.ts
 *
 * Manages deal state transitions and the available-actions state machine.
 *
 * This hook is the authoritative source for:
 * 1. What actions the current user can take (from GET /deals/:id/state)
 * 2. How to perform each action (wraps POST /deals/:id/transition)
 *
 * It is a companion to `useDeal`, which loads the deal record itself.
 * The page uses both hooks together.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { dealApi } from '../services/dealApi';
import { useAuth } from '../contexts/AuthContext';
import type { DealAction } from '../types/api';
import type { Deal } from '../types/deal';
import type { BackendDealState } from '../types/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ActionResult {
  /** True if the action succeeded. */
  success: boolean;
  /** Human-readable result message to show in a toast. */
  message: string;
  /** Updated deal data, if the action returned a new state. */
  updatedDeal?: Deal;
  /** True when the transition was rejected because the deal state changed
   *  concurrently. The caller should prompt the user to reload. */
  isConflict?: boolean;
}

export interface UseDealActionsResult {
  /** Actions the current user can take on this deal. */
  availableActions: DealAction[];
  /** True when the deal is in a terminal state (no further actions). */
  isTerminal: boolean;
  /** True when loading the available actions. */
  loadingActions: boolean;
  /** Error loading the available actions, if any. */
  actionsError: string | null;
  refetchActions: () => void;
  /**
   * Perform a deal action.
   * Handles the API call and returns a structured result the page can toast.
   * On success, triggers a refetch of the deal data.
   */
  performAction: (
    action: DealAction,
    refetch: () => void
  ) => Promise<ActionResult>;
}

// ---------------------------------------------------------------------------
// Action labels and icons
// ---------------------------------------------------------------------------

/** Human-readable labels for each DealAction. */
export const ACTION_LABELS: Record<DealAction, string> = {
  SUBMIT_FOR_ACCEPTANCE: 'Submit for Review',
  ACCEPT: 'Accept Deal',
  DECLINE: 'Decline',
  FUND: 'Fund',
  START: 'Start Work',
  SUBMIT_DELIVERABLE: 'Submit Deliverable',
  APPROVE: 'Approve',
  REQUEST_REVISION: 'Request Revision',
  RESUBMIT: 'Resubmit',
  RAISE_DISPUTE: 'Raise Dispute',
  RESOLVE: 'Resolve',
  ACCEPT_RESOLUTION: 'Accept Resolution',
  REQUEST_REWORK: 'Request Rework',
  RELEASE_PAYMENT: 'Release Payment',
  CANCEL: 'Cancel',
};

/** Action variant for the UI button — 'primary' | 'secondary' | 'danger' */
export function actionVariant(action: DealAction): 'primary' | 'secondary' | 'danger' {
  if (action === 'DECLINE' || action === 'CANCEL' || action === 'RAISE_DISPUTE') return 'danger';
  if (action === 'REQUEST_REVISION' || action === 'REQUEST_REWORK' || action === 'RESUBMIT') return 'secondary';
  return 'primary';
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useDealActions(
  dealId: string | undefined,
  status?: Deal['status'],
  updatedAt?: string,
): UseDealActionsResult {
  const { user } = useAuth();
  const key = `${user?.id}:${user?.role}:${dealId}:${status}:${updatedAt}`;
  const [snapshot, setSnapshot] = useState<{ key: string; state: BackendDealState } | null>(null);
  const [loadingActions, setLoadingActions] = useState(true);
  const [actionsError, setActionsError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const sequence = useRef(0);

  const refetchActions = useCallback(() => {
    sequence.current += 1;
    setSnapshot(null);
    setLoadingActions(true);
    setTick((t) => t + 1);
  }, []);

  useEffect(() => {
    const request = ++sequence.current;
    if (!dealId || !user) {
      setSnapshot(null);
      setActionsError(null);
      setLoadingActions(false);
      return;
    }

    let cancelled = false;
    // The guard above narrows dealId to string; non-null assertion is safe here.
    // TypeScript does not propagate narrowing into async closures, so we assert.
    const dealIdValue: string = dealId as string;

    async function loadState() {
      setLoadingActions(true);
      setActionsError(null);
      const result = await dealApi.getDealState(dealIdValue);

      if (cancelled || sequence.current !== request) return;

      if (!result.ok) {
        setActionsError(result.message);
        setSnapshot(null);
      } else if ((status && result.data.status !== status) ||
          (updatedAt && new Date(result.data.updatedAt).getTime() !== new Date(updatedAt).getTime())) {
        setSnapshot(null);
        setActionsError('The deal changed while checking actions. Refresh status to review the current record.');
      } else {
        setSnapshot({ key, state: result.data });
      }

      setLoadingActions(false);
    }

    loadState();
    return () => {
      cancelled = true;
    };
  }, [dealId, user?.id, user?.role, status, updatedAt, key, tick]);

  const performAction = useCallback(
    async (action: DealAction, refetch: () => void): Promise<ActionResult> => {
      if (!dealId) {
        return { success: false, message: 'No deal selected.' };
      }

      const result = await dealApi.transitionDeal(dealId, action);

      // Also reconcile after timeouts/conflicts: the server may have committed
      // a payment even when the response did not reach this browser.
      refetch();
      refetchActions();

      if (!result.ok) {
        return {
          success: false,
          message: result.message,
          isConflict: result.kind === 'conflict',
        };
      }

      const label = ACTION_LABELS[action] ?? action;
      return {
        success: true,
        message: `${label} — deal updated.`,
        updatedDeal: result.data,
      };
    },
    [dealId, refetchActions]
  );

  // Hide another actor's or an older record's actions before effects run.
  const state = snapshot?.key === key ? snapshot.state : null;
  return {
    availableActions: loadingActions ? [] : state?.availableActions ?? [],
    isTerminal: state?.isTerminal ?? false,
    loadingActions,
    actionsError,
    performAction,
    refetchActions,
  };
}
