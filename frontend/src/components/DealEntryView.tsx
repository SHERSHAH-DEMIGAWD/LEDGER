import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { dealApi } from '../services/dealApi';
import { DealStateBadge } from './DealStateBadge';
import { DealTermsSummary } from './DealTermsSummary';
import { DealTermsRefinement, type TermsRefinementProps } from './DealTermsRefinement';
import { DealHistory } from './DealHistory';
import { ACTION_LABELS } from '../hooks/useDealActions';
import type { Deal, DealEvent } from '../types/deal';
import type { DealAction } from '../types/api';

interface Props extends Pick<TermsRefinementProps, 'termsActionInFlight' | 'onTermsAction'> {
  deal: Deal;
  actions: DealAction[];
  checkingActions: boolean;
  actionsError: string | null;
  actionInFlight: DealAction | null;
  events: DealEvent[] | null;
  historyError: string | null;
  onAction: (action: DealAction) => Promise<boolean>;
  onRefresh: () => void;
  onNotice: (message: string, kind: 'success' | 'error' | 'conflict') => void;
}

/** The invitation is the deal itself; every lifecycle value comes from the API. */
export function DealEntryView({ deal, actions, checkingActions, actionsError, actionInFlight, events, historyError, onAction, onRefresh, onNotice, termsActionInFlight, onTermsAction }: Props) {
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
  const busy = inviting || actionInFlight !== null || checkingActions || !!actionsError;

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inviteLock.current || busy || !canInvite) return;
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
    FUNDED: 'Funding is confirmed. Review the agreed scope, then start work when you are ready.',
    DECLINED: 'The creator declined this invitation. This deal is closed and cannot be funded. A new agreement needs a new deal.',
    CANCELLED: 'This deal was cancelled. No further invitation or funding actions are available.',
  };

  return (
    <div className="transaction-page">
      <header className="transaction-header">
        <Link className="transaction-back" to="/deals">← All deals</Link>
        <p className="transaction-eyebrow">{deal.status === 'FUNDED' ? 'Funded agreement' : 'Agreement on record'}</p>
        <h1 className="transaction-title">{deal.title}</h1>
        <div className="transaction-actions">
          <DealStateBadge status={deal.status} />
          <button className="transaction-link" onClick={onRefresh} disabled={busy}>Refresh status</button>
        </div>
        <p className="transaction-intro" role="status">{guidance[deal.status]}</p>
        <p className="transaction-note">Created <time dateTime={deal.createdAt}>{new Date(deal.createdAt).toLocaleDateString()}</time> · Updated <time dateTime={deal.updatedAt}>{new Date(deal.updatedAt).toLocaleString()}</time></p>
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

      <DealTermsRefinement key={`${deal.id}:${deal.termsVersionNumber}`} deal={deal} disabled={busy} termsActionInFlight={termsActionInFlight} onTermsAction={onTermsAction} />

      <section className="transaction-section" aria-label="Next action">
        {['ACCEPTED', 'FUNDED'].includes(deal.status) && <>
          <h2>Funding &amp; next step</h2>
          <p className="transaction-note">{deal.fundingStatus === 'FUNDED' ? 'Funding confirmed' : 'Awaiting funding'} · Agreed amount: {deal.amountFormatted}{deal.paymentStatus === 'PENDING' ? ' · Payment awaiting confirmation' : ''}</p>
          <p className="transaction-note">Payments are simulated in this MVP. Funding records the payment status without charging real money.</p>
        </>}
        {actionsError && <p className="transaction-error" role="alert">{actionsError} <button className="transaction-link" onClick={onRefresh}>Retry status check</button></p>}
        {checkingActions && <p className="transaction-note" role="status">Checking the latest actions…</p>}
        {!checkingActions && !actionsError && actions.length === 0 && !['DECLINED', 'CANCELLED'].includes(deal.status) && <p className="transaction-note">No action is available for your account in the current state.</p>}
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
        <DealHistory events={events} error={historyError} onRefresh={onRefresh} />
      </section>
    </div>
  );
}
