import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { dealApi } from '../services/dealApi';
import { DealStateBadge } from './DealStateBadge';
import { DealTermsSummary } from './DealTermsSummary';
import { ACTION_LABELS } from '../hooks/useDealActions';
import type { Deal, DealEvent } from '../types/deal';
import type { DealAction } from '../types/api';

interface Props {
  deal: Deal;
  actions: DealAction[];
  checkingActions: boolean;
  actionsError: string | null;
  actionInFlight: DealAction | null;
  events: DealEvent[] | null;
  onAction: (action: DealAction) => Promise<void>;
  onRefresh: () => void;
  onNotice: (message: string, kind: 'success' | 'error' | 'conflict') => void;
}

/** The invitation is the deal itself; every lifecycle value comes from the API. */
export function DealEntryView({ deal, actions, checkingActions, actionsError, actionInFlight, events, onAction, onRefresh, onNotice }: Props) {
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const inviteLock = useRef(false);
  const active = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  const brand = deal.parties.find((party) => party.role === 'Brand');
  const creator = deal.parties.find((party) => party.role === 'Creator');
  const canInvite = deal.status === 'DRAFT' && (user?.role === 'ADMIN' || (user?.role === 'BRAND' && user.id === brand?.id));
  const busy = inviting || actionInFlight !== null || checkingActions;

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inviteLock.current || busy) return;
    inviteLock.current = true;
    setInviting(true);
    try {
      const result = await dealApi.inviteCreator(deal.id, { creatorEmail: email.trim() });
      if (!active.current) return;
      if (result.ok) {
        onNotice('Invitation sent. The creator can review this deal in Invitations.', 'success');
      } else {
        onNotice(result.message, result.kind === 'conflict' ? 'conflict' : 'error');
      }
    } catch {
      if (active.current) onNotice('We could not confirm the invitation. Refresh the deal status before trying again.', 'error');
    } finally {
      // A lost response can still have committed. Always reconcile with the API.
      if (active.current) onRefresh();
      inviteLock.current = false;
      if (active.current) setInviting(false);
    }
  }

  const guidance: Partial<Record<Deal['status'], string>> = {
    DRAFT: 'Your deal is saved. Invite the creator you have agreed to work with.',
    PENDING_ACCEPTANCE: user?.role === 'CREATOR'
      ? 'Review the scope, deliverables and payment below before responding.'
      : 'Invitation sent. Waiting for the creator to accept or decline.',
    ACCEPTED: deal.pendingTerms
      ? 'Invitation accepted. A terms proposal is awaiting a response; funding is unavailable until it is resolved.'
      : deal.paymentStatus === 'PENDING'
        ? 'Invitation accepted. Payment is awaiting confirmation. Refresh the status before continuing.'
        : user?.role === 'CREATOR'
      ? 'Invitation accepted. The brand can now fund the deal. Work starts after funding is confirmed.'
      : 'Invitation accepted. Review the agreed terms, then fund this deal.',
    DECLINED: 'The creator declined this invitation. This deal is closed and cannot be funded. A new agreement needs a new deal.',
    CANCELLED: 'This deal was cancelled. No further invitation or funding actions are available.',
  };

  return (
    <div className="transaction-page">
      <Link className="transaction-link" to="/deals">← All deals</Link>
      <header className="transaction-header">
        <p className="transaction-eyebrow">Agreement on record</p>
        <h1 className="transaction-title">{deal.title}</h1>
        <div className="transaction-actions">
          <DealStateBadge status={deal.status} />
          <button className="transaction-link" onClick={onRefresh} disabled={busy}>Refresh status</button>
        </div>
        <p className="transaction-intro" role="status">{guidance[deal.status]}</p>
      </header>

      <section className="transaction-section" aria-label="Deal participants">
        <dl className="transaction-fields">
          <div><dt className="transaction-eyebrow">Brand</dt><dd>{brand?.name ?? 'Brand'}{brand?.email && <small>{brand.email}</small>}</dd></div>
          <div><dt className="transaction-eyebrow">Creator</dt><dd>{creator?.name ?? 'Not invited yet'}{creator?.email && <small>{creator.email}</small>}</dd></div>
        </dl>
      </section>

      {canInvite && (
        <section className="transaction-section" aria-labelledby="invite-heading">
          <h2 id="invite-heading">Invite Creator</h2>
          <p className="transaction-note">Enter their registered Ledger email. The invitation appears in their account.</p>
          <form onSubmit={invite} className="transaction-form">
            <div className="transaction-field">
              <label htmlFor="creator-email">Creator email</label>
              <input id="creator-email" name="creatorEmail" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy} placeholder="creator@example.com" />
            </div>
            <div className="transaction-actions">
              <button type="submit" className="transaction-button transaction-button--primary" disabled={busy || !!actionsError} aria-busy={inviting}>{inviting ? 'Sending invitation…' : 'Send invitation →'}</button>
            </div>
          </form>
        </section>
      )}

      <section className="transaction-section" aria-labelledby="deal-terms-heading">
        <p className="transaction-eyebrow">Version {deal.termsVersionNumber} · {['DRAFT', 'PENDING_ACCEPTANCE', 'DECLINED', 'CANCELLED'].includes(deal.status) ? 'Invitation terms' : 'Agreed terms'}</p>
        <h2 id="deal-terms-heading">Scope &amp; payment</h2>
        <DealTermsSummary terms={deal.terms} />
      </section>

      {deal.pendingTerms && (
        <section className="transaction-section">
          <h2>Proposed changes · Version {deal.pendingTermsVersionNumber}</h2>
          <p className="transaction-note">Awaiting a separate terms response. These changes are not agreed terms. Funding remains unavailable while this proposal is pending.</p>
          <DealTermsSummary terms={deal.pendingTerms} />
        </section>
      )}

      <section className="transaction-section" aria-label="Next action">
        {deal.status === 'ACCEPTED' && <p className="transaction-note">Funding: {deal.fundingStatus?.replace(/_/g, ' ')} · Agreed amount: {deal.amountFormatted}{deal.paymentStatus === 'PENDING' ? ' · Payment awaiting confirmation' : ''}</p>}
        {actionsError && <p className="transaction-error" role="alert">{actionsError} <button className="transaction-link" onClick={onRefresh}>Retry status check</button></p>}
        {checkingActions && <p className="transaction-note" role="status">Checking the latest actions…</p>}
        <div className="transaction-actions">
          {actions.filter((action) => action !== 'SUBMIT_FOR_ACCEPTANCE' && !(action === 'FUND' && deal.pendingTerms)).map((action) => (
            <button key={action} type="button" className={`transaction-button ${['DECLINE', 'CANCEL'].includes(action) ? 'transaction-button--danger' : 'transaction-button--primary'}`} disabled={busy || (action === 'FUND' && deal.paymentStatus === 'PENDING')} aria-busy={actionInFlight === action} onClick={() => onAction(action)}>
              {actionInFlight === action ? 'Updating…' : ACTION_LABELS[action]}
            </button>
          ))}
          {deal.status === 'DECLINED' && user?.role === 'BRAND' && <Link className="transaction-button transaction-button--primary" to="/deals/new">Create a new deal →</Link>}
        </div>
        {deal.status === 'PENDING_ACCEPTANCE' && user?.role === 'CREATOR' && <p className="transaction-note">Declining closes this deal. Accepting records your agreement to the invitation terms above.</p>}
      </section>

      <section className="transaction-section" aria-labelledby="entry-history-heading">
        <h2 id="entry-history-heading">Record history</h2>
        {events === null ? <p className="transaction-note">History is not available yet. Refresh to try again.</p> : (
          <ol className="transaction-history">
            {events.map((entry) => <li key={entry.id}><span>{entry.label}{entry.actor && ` · ${entry.actor}`}</span><small>{new Date(entry.timestamp).toLocaleString()}</small></li>)}
          </ol>
        )}
      </section>
    </div>
  );
}
