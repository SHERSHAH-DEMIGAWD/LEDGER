import { useState, useEffect, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { DealDetailSkeleton, ErrorState, EmptyState } from '../components/DealStateViews';
import { DealEntryView } from '../components/DealEntryView';
import { DealDeliveryView } from '../components/DealDeliveryView';
import type { TermsAction } from '../components/DealTermsRefinement';
import { useDeal } from '../hooks/useDeal';
import { useDealActions } from '../hooks/useDealActions';
import { useAuth } from '../contexts/AuthContext';
import { dealApi } from '../services/dealApi';
import type { DealEvent } from '../types/deal';
import type { DealAction, DealTerms } from '../types/api';

interface Toast {
  id: number;
  message: string;
  kind: 'success' | 'error' | 'conflict';
}

const ENTRY_STATUSES = ['DRAFT', 'PENDING_ACCEPTANCE', 'ACCEPTED', 'FUNDED', 'DECLINED', 'CANCELLED'];

/** Every lifecycle uses the existing transaction layout and authoritative API state. */
export function DealDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { deal, loading, refreshing, error, notFound, refetch } = useDeal(id);
  const { availableActions, loadingActions, actionsError, performAction, refetchActions } = useDealActions(id, deal?.status, deal?.updatedAt);
  const { user } = useAuth();
  const [historySnapshot, setHistorySnapshot] = useState<{ key: string; events: DealEvent[] } | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyTick, setHistoryTick] = useState(0);
  const historyKey = `${user?.id}:${user?.role}:${id}:${deal?.updatedAt}:${historyTick}`;
  const historyEvents = historySnapshot?.key === historyKey ? historySnapshot.events : null;
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [actionInFlight, setActionInFlight] = useState<DealAction | null>(null);
  const [termsActionInFlight, setTermsActionInFlight] = useState<TermsAction | null>(null);
  const actionLock = useRef(false);
  const active = useRef(true);
  const nextToast = useRef(0);
  const toastTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      toastTimers.current.forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    if (!id || !user) return;
    let cancelled = false;
    setHistorySnapshot(null);
    setHistoryError(null);
    dealApi.getDealHistory(id).then((result) => {
      if (cancelled) return;
      if (result.ok) setHistorySnapshot({ key: historyKey, events: result.data });
      else setHistoryError(result.message);
    }).catch(() => {
      if (!cancelled) setHistoryError('The recorded history could not be loaded. Please retry.');
    });
    return () => { cancelled = true; };
  }, [id, user?.id, historyKey]);

  const refreshRecord = () => {
    refetch();
    refetchActions();
    setHistoryTick((tick) => tick + 1);
  };

  const addToast = (message: string, kind: Toast['kind'] = 'success') => {
    if (!active.current) return;
    const toastId = ++nextToast.current;
    setToasts((items) => [...items, { id: toastId, message, kind }]);
    toastTimers.current.push(setTimeout(() => setToasts((items) => items.filter((item) => item.id !== toastId)), 7000));
  };

  const handleAction = async (action: DealAction, note?: string): Promise<boolean> => {
    if (actionLock.current || loadingActions || refreshing || actionsError || !availableActions.includes(action)) return false;
    actionLock.current = true;
    setActionInFlight(action);
    try {
      const result = await performAction(action, refetch, { note });
      if (!active.current) return false;
      addToast(result.message, result.success ? 'success' : result.isConflict ? 'conflict' : 'error');
      return result.success;
    } catch {
      addToast('The update could not be verified. Refresh status before trying again.', 'error');
      return false;
    } finally {
      if (active.current) {
        refreshRecord();
        setActionInFlight(null);
      }
      actionLock.current = false;
    }
  };

  const handleTermsAction = async (action: TermsAction, terms?: DealTerms): Promise<boolean> => {
    if (!deal || !user || actionLock.current || loadingActions || refreshing || actionsError) return false;
    const party = deal.parties.find((item) => item.role === (action === 'propose' ? 'Brand' : 'Creator'));
    if (!['ACCEPTED', 'FUNDED', 'IN_PROGRESS'].includes(deal.status) || party?.id !== user.id ||
        user.role !== (action === 'propose' ? 'BRAND' : 'CREATOR') ||
        (action === 'propose' ? !terms || !!deal.pendingTerms : !deal.pendingTerms)) return false;
    actionLock.current = true;
    setTermsActionInFlight(action);
    try {
      const result = action === 'propose' ? await dealApi.proposeTerms(deal.id, terms!)
        : action === 'accept' ? await dealApi.acceptProposal(deal.id) : await dealApi.rejectProposal(deal.id);
      if (!active.current) return false;
      if (result.ok) {
        addToast(action === 'propose' ? 'Proposed terms are ready for the creator to review.'
          : action === 'accept' ? 'Proposed terms accepted. The agreed version has been updated.'
            : 'Proposed terms rejected. Your existing agreement remains active.');
      } else addToast(result.message, result.kind === 'conflict' ? 'conflict' : 'error');
      return result.ok;
    } catch {
      addToast('The terms update could not be verified. Refresh status before trying again.', 'error');
      return false;
    } finally {
      if (active.current) {
        refreshRecord();
        setTermsActionInFlight(null);
      }
      actionLock.current = false;
    }
  };

  if (loading) return <DealDetailSkeleton />;
  if (notFound) return <div className="transaction-page">
    <Link className="transaction-back" to="/deals">← All deals</Link>
    <EmptyState title="Record not found" description="This deal could not be found in your records." />
  </div>;
  if (error || !deal) return <div className="transaction-page">
    <Link className="transaction-back" to="/deals">← All deals</Link>
    <ErrorState message={error || 'Failed to load record'} onRetry={refreshRecord} />
  </div>;

  const shared = {
    deal, actions: availableActions, checkingActions: loadingActions || refreshing || termsActionInFlight !== null,
    actionsError, actionInFlight, events: historyEvents, historyError, onRefresh: refreshRecord,
    termsActionInFlight, onTermsAction: handleTermsAction,
  };

  return <>
    <div className="transaction-toasts">
      {toasts.map((toast) => <div key={toast.id} className={`transaction-toast transaction-toast--${toast.kind}`}
        role={toast.kind === 'success' ? 'status' : 'alert'} aria-atomic="true"
      >
        <p>{toast.message}</p>
        <button type="button" className="transaction-link" onClick={() => setToasts((items) => items.filter((item) => item.id !== toast.id))}>Dismiss</button>
      </div>)}
    </div>
    {ENTRY_STATUSES.includes(deal.status)
      ? <DealEntryView key={deal.id} {...shared} onAction={handleAction} onNotice={addToast} />
      : <DealDeliveryView key={deal.id} {...shared} onAction={handleAction} />}
  </>;
}
