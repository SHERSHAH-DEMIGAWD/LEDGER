import { createContext, useContext, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { motion } from 'motion/react';
import type { Deal, DealEvent } from '../types/deal';
import { getDealStateLabel, type DealStatus } from '../types/dealStates';
import { DealStateBadge } from '../components/DealStateBadge';
import { useMediaPreference } from './useMediaPreference';
import { routeEase } from './routeMotion';

// Presentation categories, never an ordering or a source of permitted actions.
type RecordMark = 'quiet' | 'secured' | 'active' | 'entry' | 'amendment' | 'confirmation' | 'closed' | 'interrupted' | 'outcome';
const marks: Record<DealStatus, RecordMark> = {
  DRAFT: 'quiet', PENDING_ACCEPTANCE: 'quiet', ACCEPTED: 'quiet', DECLINED: 'closed', CANCELLED: 'closed',
  FUNDED: 'secured', IN_PROGRESS: 'active', SUBMITTED: 'entry', REVISION_REQUESTED: 'amendment',
  APPROVED: 'confirmation', COMPLETED: 'closed', DISPUTED: 'interrupted', RESOLVED: 'outcome',
};
const LifecycleContext = createContext({ previous: null as DealStatus | null, reduced: false, duration: 0.7, fresh: new Set<string>() });

/** Mounted for one visible record. Initial data is a baseline, not an event. */
export function TransactionLifecycle({ deal, events, children }: { deal: Deal; events: DealEvent[] | null; children: ReactNode }) {
  const reduced = useMediaPreference('(prefers-reduced-motion: reduce)');
  const seenStatus = useRef(deal.status);
  const seenEvents = useRef<Set<string> | null>(null);
  const [previous, setPrevious] = useState<DealStatus | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const duration = reduced ? 0.14 : deal.status === 'COMPLETED' ? 1.08 : deal.status === 'FUNDED' ? 0.9 : 0.72;
  const mark = marks[deal.status];
  const amended = deal.status === 'SUBMITTED' && previous === 'REVISION_REQUESTED';

  useLayoutEffect(() => {
    const before = seenStatus.current;
    seenStatus.current = deal.status;
    // Media changes cancel an in-flight effect; they never replay a transition.
    if (before === deal.status || document.visibilityState !== 'visible') { setPrevious(null); return; }
    setPrevious(before);
    const timer = window.setTimeout(() => setPrevious(null), duration * 1000);
    return () => window.clearTimeout(timer);
  }, [deal.status, reduced, duration]);

  useLayoutEffect(() => {
    if (!events) return;
    const ids = new Set(events.map(event => event.id));
    const additions = seenEvents.current && document.visibilityState === 'visible'
      ? new Set(events.filter(event => !seenEvents.current!.has(event.id)).map(event => event.id)) : new Set<string>();
    // Keep the baseline through loading/errors; a retry must not replay history.
    seenEvents.current = new Set([...(seenEvents.current ?? []), ...ids]);
    if (additions.size) setFresh(additions);
  }, [events]);
  useLayoutEffect(() => {
    if (!fresh.size) return;
    const timer = window.setTimeout(() => setFresh(new Set()), reduced ? 140 : 900);
    return () => window.clearTimeout(timer);
  }, [fresh, reduced]);

  return <LifecycleContext.Provider value={{ previous, reduced, duration, fresh }}>
    <div className="transaction-lifecycle" data-lifecycle-mark={mark} data-lifecycle-status={deal.status}
      data-lifecycle-changing={previous ? '' : undefined} data-lifecycle-amended={amended ? '' : undefined}
      data-lifecycle-funded={deal.status === 'FUNDED' && deal.fundingStatus === 'FUNDED' && deal.paymentStatus === 'SUCCEEDED' ? '' : undefined}
      style={{ '--lifecycle-duration': `${duration}s` } as CSSProperties}>
      {children}
    </div>
  </LifecycleContext.Provider>;
}

/** The existing badge remains the only current-state announcement. */
export function RecordedDealState({ status }: { status: DealStatus }) {
  const { previous, reduced, duration } = useContext(LifecycleContext);
  const reopening = status === 'REVISION_REQUESTED' || status === 'DISPUTED';
  return <div className="transaction-record-state">
    <div className="transaction-record-rule" aria-hidden="true">
      <motion.i key={`${previous}:${status}`} initial={previous ? reduced ? { opacity: 0.5 } : { scaleX: reopening ? 1 : 0.08, opacity: 0.5 } : false}
        animate={previous ? reduced ? { opacity: [0.5, 1] } : { scaleX: reopening ? [1, 0.55, 1] : [0.08, 1], opacity: [0.5, 1] } : { scaleX: 1, opacity: 1 }}
        transition={{ duration, ease: routeEase }} />
      <motion.b key={`${status}:${previous}`} initial={previous ? { opacity: 0.55 } : false}
        animate={previous ? { opacity: [0.55, 1, 0.85] } : { opacity: 0.85 }} transition={{ duration, ease: routeEase }} />
    </div>
    <DealStateBadge status={status} showDot={false} />
    {previous && <motion.span className="transaction-previous-state" aria-hidden="true" initial={{ opacity: 0.7 }}
      animate={{ opacity: 0 }} transition={{ duration: reduced ? 0.12 : 0.3, delay: reduced ? 0 : 0.16 }}>
      {getDealStateLabel(previous)}
    </motion.span>}
  </div>;
}

// Only classify actual audit actions. Generic state changes retain their own
// server-provided description; never derive a branch from enum position.
export function historyMark(action?: string): RecordMark {
  switch (action) {
    case 'PAYMENT.FUNDED': return 'secured';
    case 'DELIVERABLE.SUBMITTED': return 'entry';
    case 'DELIVERABLE.REVISION_REQUESTED': return 'amendment';
    case 'DELIVERABLE.APPROVED': return 'confirmation';
    case 'DISPUTE.RAISED': return 'interrupted';
    case 'DISPUTE.RESOLVED': return 'outcome';
    case 'PAYMENT.RELEASED': return 'closed';
    default: return 'quiet';
  }
}

export function useRecordedHistory() { return useContext(LifecycleContext); }
