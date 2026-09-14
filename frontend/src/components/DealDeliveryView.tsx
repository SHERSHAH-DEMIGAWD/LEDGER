import { useId, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { Deal, DealEvent } from '../types/deal';
import type { DealAction } from '../types/api';
import { ACTION_LABELS } from '../hooks/useDealActions';
import { DealStateBadge } from './DealStateBadge';
import { DealTermsSummary } from './DealTermsSummary';
import '../styles/transaction.css';

interface Props {
  deal: Deal;
  actions: DealAction[];
  checkingActions: boolean;
  actionsError: string | null;
  actionInFlight: DealAction | null;
  events: DealEvent[] | null;
  historyError: string | null;
  onAction: (action: DealAction, note?: string) => Promise<boolean>;
  onRefresh: () => void;
}

const guidance: Partial<Record<Deal['status'], { title: string; next: string; copy: string }>> = {
  IN_PROGRESS: { title: 'Work in progress.', next: 'Creator to submit', copy: 'Complete the agreed deliverables and share the work with the brand through your existing channel. Record the submission here when it is ready for review.' },
  SUBMITTED: { title: 'Ready for review.', next: 'Brand to review', copy: 'The creator has recorded a submission. Review the shared work against the agreed scope, then request a revision or approve it. Raise a dispute if review needs an authorized resolver.' },
  REVISION_REQUESTED: { title: 'A revision is requested.', next: 'Creator to revise and resubmit', copy: 'Address the recorded revision request and share the revised work with the brand. Resubmitting returns this deal to brand review.' },
  APPROVED: { title: 'Work approved.', next: 'Brand to complete', copy: 'The brand has approved the submission. Complete the deal to close this transaction record.' },
  DISPUTED: { title: 'Under dispute review.', next: 'HRT or admin to resolve', copy: 'An authorized resolver reviews the recorded dispute and records a resolution. Submission approval remains paused while the dispute is open.' },
  RESOLVED: { title: 'Resolution recorded.', next: 'Participants to act on the resolution', copy: 'Review the resolution below. The brand can accept it or complete the deal; an authorized participant can request rework to return to active work.' },
  COMPLETED: { title: 'This deal is complete.', next: 'No further action', copy: 'The transaction record is closed. The agreed terms and recorded history remain available to the participants.' },
};

const noteActions: Partial<Record<DealAction, { label: string; help: string; required: boolean }>> = {
  SUBMIT_DELIVERABLE: { label: 'Submission note', help: 'Optional context for the brand about the work you shared. Submission moves the record to SUBMITTED for review.', required: false },
  REQUEST_REVISION: { label: 'Revision request', help: 'Describe what needs to change. The creator will see this request before resubmitting.', required: true },
  RAISE_DISPUTE: { label: 'Dispute note', help: 'Describe the issue for the authorized resolver. This moves the deal to DISPUTED.', required: true },
  RESOLVE: { label: 'Resolution note', help: 'Record the resolution for both participants. This moves the deal to RESOLVED; it does not approve work or transfer funds.', required: true },
};

/** Workflow copy explains the state; only server-provided actions render controls. */
export function DealDeliveryView({ deal, actions, checkingActions, actionsError, actionInFlight, events, historyError, onAction, onRefresh }: Props) {
  const [selected, setSelected] = useState<DealAction | null>(null);
  const [notes, setNotes] = useState<Partial<Record<DealAction, string>>>({});
  const lock = useRef(false);
  const noteId = useId();
  const current = guidance[deal.status];
  const busy = checkingActions || actionInFlight !== null || events === null || !!actionsError;
  const editor = selected && actions.includes(selected) ? noteActions[selected] : undefined;

  async function run(action: DealAction, note?: string) {
    if (lock.current || busy || !actions.includes(action)) return;
    lock.current = true;
    try {
      if (await onAction(action, note)) {
        setNotes((previous) => ({ ...previous, [action]: '' }));
        setSelected(null);
      }
    } finally { lock.current = false; }
  }

  function submitNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !editor) return;
    const value = (notes[selected] ?? '').trim();
    if ((editor.required && !value) || value.length > 5000) return;
    void run(selected, value || undefined);
  }

  return (
    <div className="transaction-page transaction-delivery-page">
      <header className="transaction-header">
        <Link className="transaction-back" to="/deals">← All deals</Link>
        <p className="transaction-eyebrow">Delivery &amp; review</p>
        <h1 className="transaction-title">{current?.title}</h1>
        <h2 className="transaction-deal-name">{deal.title}</h2>
        <div className="transaction-actions">
          <DealStateBadge status={deal.status} />
          <button className="transaction-link" disabled={checkingActions || actionInFlight !== null} onClick={onRefresh}>Refresh status</button>
        </div>
        <p className="transaction-intro">{current?.copy}</p>
      </header>

      <section className="transaction-section" aria-label="Current responsibility">
        <p className="transaction-eyebrow">Next step</p>
        <h2>{current?.next}</h2>
        <p className="transaction-note">{deal.parties.map((party) => `${party.role}: ${party.name}`).join(' · ')}</p>
        <p className="transaction-note">Ledger records submission status and supported notes. Deliverable files are shared outside Ledger; this record does not store them.</p>
        {deal.status === 'REVISION_REQUESTED' && <p className="transaction-note">Resubmission records that the revised work is ready for review, without adding a new note.</p>}
        {['APPROVED', 'RESOLVED', 'COMPLETED'].includes(deal.status) && <p className="transaction-note">Completion closes the record. Payment release is simulated; no real payout is made.</p>}
      </section>

      {deal.latestRevisionNote && (
        <section className="transaction-section" aria-label="Latest revision or resolution note">
          <p className="transaction-eyebrow">{deal.status === 'REVISION_REQUESTED' ? 'Revision request' : deal.status === 'RESOLVED' ? 'Resolution' : 'Latest revision / resolution note'}</p>
          <p className="transaction-recorded-note">{deal.latestRevisionNote}</p>
          {deal.latestRevisionNoteAt && <p className="transaction-note">Recorded {new Date(deal.latestRevisionNoteAt).toLocaleString()}</p>}
        </section>
      )}

      <section className="transaction-section" aria-label="Available actions">
        {checkingActions && <p className="transaction-note" role="status">Checking current state and actions…</p>}
        {actionsError && <p className="transaction-error" role="alert">{actionsError} <button className="transaction-link" onClick={onRefresh}>Retry status check</button></p>}
        {!checkingActions && !actionsError && actions.length === 0 && <p className="transaction-note" role="status">{deal.status === 'COMPLETED' ? 'This record is closed.' : 'No action is available for your account in the current state.'}</p>}
        <div className="transaction-actions">
          {actions.map((action) => <button key={action} type="button"
            className={`transaction-button ${['RAISE_DISPUTE', 'REQUEST_REVISION'].includes(action) ? 'transaction-button--danger' : 'transaction-button--primary'}`}
            disabled={busy} aria-busy={actionInFlight === action} aria-expanded={noteActions[action] ? selected === action : undefined}
            onClick={() => noteActions[action] ? setSelected(action) : void run(action)}>
            {actionInFlight === action ? 'Updating…' : ACTION_LABELS[action]}
          </button>)}
        </div>
        {selected && editor && <form className="transaction-form transaction-note-editor" onSubmit={submitNote}>
          <div className="transaction-field">
            <label htmlFor={noteId}>{editor.label}{!editor.required && ' (optional)'}</label>
            <textarea id={noteId} rows={5} maxLength={5000} required={editor.required} disabled={busy}
              aria-describedby={`${noteId}-help`} value={notes[selected] ?? ''}
              onChange={(event) => setNotes((previous) => ({ ...previous, [selected]: event.target.value }))} />
            <span id={`${noteId}-help`} className="transaction-field-hint">{editor.help} Up to 5,000 characters.</span>
          </div>
          <div className="transaction-actions">
            <button className="transaction-button transaction-button--primary" type="submit" disabled={busy || (editor.required && !(notes[selected] ?? '').trim())}>
              {actionInFlight === selected ? 'Recording…' : `Record ${editor.label.toLowerCase()}`}
            </button>
            <button className="transaction-link" type="button" disabled={actionInFlight !== null} onClick={() => setSelected(null)}>Close note</button>
          </div>
        </form>}
      </section>

      <section className="transaction-section" aria-labelledby="delivery-record-heading">
        <h2 id="delivery-record-heading">Submission &amp; review record</h2>
        {events === null ? (
          <p className={historyError ? 'transaction-error' : 'transaction-note'} role={historyError ? 'alert' : 'status'}>
            {historyError ?? 'Loading the recorded history…'}
            {historyError && <><br /><button className="transaction-link" onClick={onRefresh}>Retry history and status</button></>}
          </p>
        ) : events.length === 0 ? <p className="transaction-note">No history entries were returned for this deal.</p> : (
          <ol className="transaction-history">
            {events.map((event) => <li key={event.id}>
              <strong>{event.label}</strong>{event.actor && <span> · {event.actor}</span>}
              {event.description && <p className="transaction-event-detail">{event.description}</p>}
              {event.note && <p className="transaction-recorded-note">{event.note}</p>}
              <small>{new Date(event.timestamp).toLocaleString()}</small>
            </li>)}
          </ol>
        )}
      </section>

      <section className="transaction-section" aria-labelledby="delivery-terms-heading">
        <p className="transaction-eyebrow">Agreed terms · Version {deal.termsVersionNumber}</p>
        <h2 id="delivery-terms-heading">Scope &amp; payment</h2>
        <p className="transaction-note">Funding: {deal.fundingStatus?.replace(/_/g, ' ')} · Payment record: {deal.paymentStatus} · {deal.amountFormatted}</p>
        <DealTermsSummary terms={deal.terms} />
        {deal.pendingTerms && <p className="transaction-note">A separate terms proposal is pending. The agreed version above remains authoritative.</p>}
      </section>
    </div>
  );
}
