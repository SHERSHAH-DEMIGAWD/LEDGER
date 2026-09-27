import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { Deal, DealEvent } from '../types/deal';
import type { DealAction } from '../types/api';
import { ACTION_LABELS } from '../hooks/useDealActions';
import { RecordedDealState } from '../motion/TransactionLifecycle';
import { DealTermsSummary } from './DealTermsSummary';
import { DealTermsRefinement, type TermsRefinementProps } from './DealTermsRefinement';
import { DealHistory } from './DealHistory';
import '../styles/transaction.css';

interface Props extends Pick<TermsRefinementProps, 'termsActionInFlight' | 'onTermsAction'> {
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
export function DealDeliveryView({ deal, actions, checkingActions, actionsError, actionInFlight, events, historyError, onAction, onRefresh, termsActionInFlight, onTermsAction }: Props) {
  const [selected, setSelected] = useState<DealAction | null>(null);
  const [notes, setNotes] = useState<Partial<Record<DealAction, string>>>({});
  const lock = useRef(false);
  const noteId = useId();
  const noteInput = useRef<HTMLTextAreaElement>(null);
  const noteTrigger = useRef<HTMLButtonElement | null>(null);
  const current = guidance[deal.status];
  const busy = checkingActions || actionInFlight !== null || !!actionsError;
  const editor = selected && actions.includes(selected) ? noteActions[selected] : undefined;
  useEffect(() => {
    if (selected && editor) noteInput.current?.focus();
  }, [selected, editor]);

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
    <div className="transaction-page transaction-delivery-page" data-record-detail={deal.id}>
      <header className="transaction-header">
        <Link className="transaction-back" to="/deals">← All deals</Link>
        <p className="transaction-eyebrow">Delivery &amp; review</p>
        <h1 className="transaction-title">{current?.title}</h1>
        <h2 className="transaction-deal-name">{deal.title}</h2>
        <div className="transaction-actions">
          <RecordedDealState status={deal.status} />
          <button className="transaction-link" disabled={checkingActions || actionInFlight !== null} onClick={onRefresh}>Refresh status</button>
        </div>
        <p className="transaction-intro">{current?.copy}</p>
        <p className="transaction-note">Updated <time dateTime={deal.updatedAt}>{new Date(deal.updatedAt).toLocaleString()}</time></p>
        <nav className="transaction-section-nav" aria-label="In this deal">
          <a className="transaction-link" href="#delivery-next-action">{deal.status === 'COMPLETED' ? 'Completion' : 'Next action ↓'}</a>
          {deal.latestRevisionNote && <a className="transaction-link" href="#delivery-latest-note">Latest note</a>}
          <a className="transaction-link" href="#delivery-history">Record history</a>
          <a className="transaction-link" href="#delivery-terms">Terms &amp; payment</a>
        </nav>
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
        <section id="delivery-latest-note" tabIndex={-1} className="transaction-section" aria-label="Latest revision or resolution note">
          <p className="transaction-eyebrow">{deal.status === 'REVISION_REQUESTED' ? 'Revision request' : deal.status === 'RESOLVED' ? 'Resolution' : 'Latest revision / resolution note'}</p>
          <p className="transaction-recorded-note">{deal.latestRevisionNote}</p>
          {deal.latestRevisionNoteAt && <p className="transaction-note">Recorded {new Date(deal.latestRevisionNoteAt).toLocaleString()}</p>}
        </section>
      )}

      <section id="delivery-next-action" tabIndex={-1} className="transaction-section" aria-label="Available actions">
        <h2>{deal.status === 'COMPLETED' ? 'Completion' : 'Available actions'}</h2>
        {checkingActions && <p className="transaction-note" role="status">Checking current state and actions…</p>}
        {actionsError && <p className="transaction-error" role="alert">{actionsError} <button className="transaction-link" onClick={onRefresh}>Retry status check</button></p>}
        {!checkingActions && !actionsError && actions.length === 0 && <p className="transaction-note" role="status">{deal.status === 'COMPLETED' ? 'This record is closed.' : 'No action is available for your account in the current state.'}</p>}
        <div className="transaction-actions">
          {actions.map((action) => <button key={action} type="button"
            className={`transaction-button ${action === 'RAISE_DISPUTE' ? 'transaction-button--danger' : ['REQUEST_REVISION', 'REQUEST_REWORK'].includes(action) ? '' : 'transaction-button--primary'}`}
            disabled={busy} aria-busy={actionInFlight === action} aria-expanded={noteActions[action] ? selected === action : undefined}
            aria-controls={noteActions[action] && selected === action ? `${noteId}-editor` : undefined}
            onClick={(event) => {
              if (noteActions[action]) {
                noteTrigger.current = event.currentTarget;
                setSelected(action);
                noteInput.current?.focus();
              } else void run(action);
            }}>
            {actionInFlight === action ? 'Updating…' : ACTION_LABELS[action]}
          </button>)}
        </div>
        {selected && editor && <form id={`${noteId}-editor`} className="transaction-form transaction-note-editor" onSubmit={submitNote}>
          <div className="transaction-field">
            <label htmlFor={noteId}>{editor.label}{!editor.required && ' (optional)'}</label>
            <textarea ref={noteInput} id={noteId} rows={5} maxLength={5000} required={editor.required} disabled={busy}
              aria-describedby={`${noteId}-help`} value={notes[selected] ?? ''}
              onChange={(event) => setNotes((previous) => ({ ...previous, [selected]: event.target.value }))} />
            <span id={`${noteId}-help`} className="transaction-field-hint">{editor.help} Up to 5,000 characters.</span>
          </div>
          <div className="transaction-actions">
            <button className="transaction-button transaction-button--primary" type="submit" disabled={busy || (editor.required && !(notes[selected] ?? '').trim())}>
              {actionInFlight === selected ? 'Recording…' : `Record ${editor.label.toLowerCase()}`}
            </button>
            <button className="transaction-link" type="button" disabled={actionInFlight !== null} onClick={() => { setSelected(null); noteTrigger.current?.focus(); }}>Close note</button>
          </div>
        </form>}
      </section>

      <section id="delivery-history" tabIndex={-1} className="transaction-section" aria-labelledby="delivery-record-heading">
        <h2 id="delivery-record-heading">Submission &amp; review record</h2>
        <DealHistory events={events} error={historyError} onRefresh={onRefresh} />
      </section>

      <section id="delivery-terms" tabIndex={-1} className="transaction-section" aria-labelledby="delivery-terms-heading">
        <p className="transaction-eyebrow">Agreed terms · Version {deal.termsVersionNumber}</p>
        <h2 id="delivery-terms-heading">Scope &amp; payment</h2>
        <p className="transaction-note">{deal.fundingStatus === 'FUNDED' ? 'Funding confirmed' : 'Funding not confirmed'} · {deal.amountFormatted}</p>
        <DealTermsSummary terms={deal.terms} />
      </section>
      <DealTermsRefinement key={`${deal.id}:${deal.termsVersionNumber}`} deal={deal} disabled={busy} termsActionInFlight={termsActionInFlight} onTermsAction={onTermsAction} />
    </div>
  );
}
