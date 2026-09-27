import type { DealEvent } from '../types/deal';
import { motion } from 'motion/react';
import { historyMark, useRecordedHistory } from '../motion/TransactionLifecycle';

interface Props {
  events: DealEvent[] | null;
  error: string | null;
  onRefresh: () => void;
}

/** History is informative; its availability must not block permitted actions. */
export function DealHistory({ events, error, onRefresh }: Props) {
  const { fresh, reduced } = useRecordedHistory();
  if (events === null) {
    return <p className={error ? 'transaction-error' : 'transaction-note'} role={error ? 'alert' : 'status'}>
      {error ?? 'Loading the recorded history…'}
      {error && <><br /><button className="transaction-link" onClick={onRefresh}>Retry history and status</button></>}
    </p>;
  }
  if (events.length === 0) return <p className="transaction-note">No history entries were returned for this deal.</p>;
  const latest = events.reduce((a, b) => Date.parse(a.timestamp) >= Date.parse(b.timestamp) ? a : b).id;
  return <ol className="transaction-history">
    {events.map((event) => <motion.li key={event.id} data-history-mark={historyMark(event.action)}
      data-history-latest={event.id === latest ? '' : undefined} data-history-fresh={fresh.has(event.id) ? '' : undefined}
      initial={false} animate={{ opacity: fresh.has(event.id) ? [0.72, 1] : 1 }}
      transition={{ duration: reduced ? 0.14 : 0.7 }}>
      <strong>{event.label}</strong>{event.actor && <span> · {event.actor}</span>}
      {event.description && <p className="transaction-event-detail">{event.description}</p>}
      {event.note && <p className="transaction-recorded-note">{event.note}</p>}
      <small><time dateTime={event.timestamp}>{new Date(event.timestamp).toLocaleString()}</time></small>
    </motion.li>)}
  </ol>;
}
