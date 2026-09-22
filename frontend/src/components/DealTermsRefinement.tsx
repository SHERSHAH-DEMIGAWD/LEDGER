import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import type { Deal } from '../types/deal';
import type { DealTerms } from '../types/api';
import { DealTermsForm } from './DealTermsForm';
import { DealTermsSummary } from './DealTermsSummary';

export type TermsAction = 'propose' | 'accept' | 'reject';

export interface TermsRefinementProps {
  deal: Deal;
  disabled: boolean;
  termsActionInFlight: TermsAction | null;
  onTermsAction: (action: TermsAction, terms?: DealTerms) => Promise<boolean>;
}

/** Mirrors the existing terms endpoints' participant and lifecycle rules. */
export function DealTermsRefinement({ deal, disabled, termsActionInFlight, onTermsAction }: TermsRefinementProps) {
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const allowedState = ['ACCEPTED', 'FUNDED', 'IN_PROGRESS'].includes(deal.status);
  const brand = deal.parties.find((party) => party.role === 'Brand');
  const creator = deal.parties.find((party) => party.role === 'Creator');
  const canPropose = allowedState && !!creator && user?.role === 'BRAND' && user.id === brand?.id && !deal.pendingTerms;
  const canRespond = allowedState && user?.role === 'CREATOR' && user.id === creator?.id && !!deal.pendingTerms;
  if (!canPropose && !deal.pendingTerms) return null;

  async function propose(terms: DealTerms) {
    if (await onTermsAction('propose', terms)) setEditing(false);
  }

  return <section className="transaction-section" aria-label="Terms refinement">
    {deal.pendingTerms ? <>
      <p className="transaction-eyebrow">Awaiting creator agreement · Version {deal.pendingTermsVersionNumber}</p>
      <h2>Proposed changes</h2>
      <p className="transaction-note">The agreed version remains active until the creator accepts this proposal.{deal.status === 'ACCEPTED' && ' Funding is unavailable while a proposal is pending.'}</p>
      <h3 className="transaction-subheading">{deal.pendingTerms.title}</h3>
      <DealTermsSummary terms={deal.pendingTerms} />
      {canRespond && <div className="transaction-actions">
        <button type="button" className="transaction-button transaction-button--primary" disabled={disabled} aria-busy={termsActionInFlight === 'accept'} onClick={() => void onTermsAction('accept')}>
          {termsActionInFlight === 'accept' ? 'Accepting…' : 'Accept proposed terms'}
        </button>
        <button type="button" className="transaction-button transaction-button--danger" disabled={disabled} aria-busy={termsActionInFlight === 'reject'} onClick={() => void onTermsAction('reject')}>
          {termsActionInFlight === 'reject' ? 'Rejecting…' : 'Reject proposed terms'}
        </button>
      </div>}
      {!allowedState && <p className="transaction-note">Terms responses are unavailable in the current deal state.</p>}
    </> : <>
      <h2>Refine the agreement</h2>
      <p className="transaction-note">Propose changes for the creator to review. Your current agreement stays active until they accept.</p>
      {editing ? <>
        <DealTermsForm initialTerms={deal.terms} submitting={termsActionInFlight === 'propose'} disabled={disabled} submitLabel="Propose changes" onSubmit={propose} />
        <button type="button" className="transaction-link" disabled={termsActionInFlight !== null} onClick={() => setEditing(false)}>Close editor</button>
      </> : <button type="button" className="transaction-button" disabled={disabled} onClick={() => setEditing(true)}>Propose term changes</button>}
    </>}
  </section>;
}
