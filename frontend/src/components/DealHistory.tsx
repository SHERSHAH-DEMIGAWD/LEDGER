import type { DealEvent } from '../types/deal';

interface Props {
  events: DealEvent[] | null;
  error: string | null;
  onRefresh: () => void;
}

/** History is informative; its availability must not block permitted actions. */
export function DealHistory({ events, error, onRefresh }: Props) {
  if (events === null) {
    return <p className={error ? 'transaction-error' : 'transaction-note'} role={error ? 'alert' : 'status'}>
      {error ?? 'Loading the recorded history…'}
      {error && <><br /><button className="transaction-link" onClick={onRefresh}>Retry history and status</button></>}
    </p>;
  }
  if (events.length === 0) return <p className="transaction-note">No history entries were returned for this deal.</p>;
  return <ol className="transaction-history">
    {events.map((event) => <li key={event.id}>
      <strong>{event.label}</strong>{event.actor && <span> · {event.actor}</span>}
      {event.description && <p className="transaction-event-detail">{event.description}</p>}
      {event.note && <p className="transaction-recorded-note">{event.note}</p>}
      <small><time dateTime={event.timestamp}>{new Date(event.timestamp).toLocaleString()}</time></small>
    </li>)}
  </ol>;
}
