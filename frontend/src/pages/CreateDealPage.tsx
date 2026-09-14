import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DealTermsForm } from '../components/DealTermsForm';
import { useAuth } from '../contexts/AuthContext';
import { useDealNavigation } from '../contexts/DealNavigationContext';
import { dealApi } from '../services/dealApi';
import type { DealTerms } from '../types/api';
import '../styles/transaction.css';

export function CreateDealPage() {
  const { user, hasRole } = useAuth();

  if (!hasRole('BRAND', 'ADMIN')) {
    return (
      <div className="transaction-page">
        <p className="transaction-eyebrow">New deal</p>
        <h1 className="transaction-title">A brand starts the record.</h1>
        <p className="transaction-intro">Deal creation is available to brand accounts. Creators can review deals from their invitations.</p>
        <Link className="transaction-link" to={user?.role === 'CREATOR' ? '/invitations' : '/deals'}>Continue to {user?.role === 'CREATOR' ? 'invitations' : 'deals'} →</Link>
      </div>
    );
  }

  // Changing persona clears the previous account's editor and pending UI.
  return <CreateDealWorkspace key={user?.id} />;
}

function CreateDealWorkspace() {
  const navigate = useNavigate();
  const { recordNavigation } = useDealNavigation();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [checkedDeals, setCheckedDeals] = useState(false);
  const requestLock = useRef(false);
  const active = useRef(true);

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  const createDeal = async (terms: DealTerms) => {
    if (requestLock.current || (uncertain && !checkedDeals)) return;
    requestLock.current = true;
    setSubmitting(true);
    setError(null);
    setUncertain(false);
    setCheckedDeals(false);

    try {
      const result = await dealApi.createDeal(terms);
      if (!active.current) return;
      if (result.ok) {
        recordNavigation('forward');
        navigate(`/deals/${result.data.id}`, { replace: true });
      } else {
        const ambiguous = result.kind === 'network' || result.kind === 'server';
        setUncertain(ambiguous);
        setError(ambiguous
          ? 'We could not confirm whether the deal was created. Check your deals before submitting again. Your entries are still here.'
          : result.message);
      }
    } catch {
      if (!active.current) return;
      setUncertain(true);
      setError('We could not confirm whether the deal was created. Check your deals before submitting again. Your entries are still here.');
    } finally {
      requestLock.current = false;
      if (active.current) setSubmitting(false);
    }
  };

  return (
    <div className="transaction-page transaction-create-page">
      <header className="transaction-header">
        <Link to="/deals" className="transaction-back">← All deals</Link>
        <p className="transaction-eyebrow">A collaboration, on record</p>
        <h1 className="transaction-title">Create a deal.</h1>
        <p className="transaction-intro">Put the work, the expectations and the payment in one place. Then invite the creator you are already working with.</p>
      </header>
      <div className="transaction-create-layout">
        <div>
          <DealTermsForm submitting={submitting} onSubmit={createDeal} submitLabel="Create deal" error={error} disabled={uncertain && !checkedDeals} />
          {uncertain && (
            <div className="transaction-recovery">
              <Link to="/deals" target="_blank" rel="noopener noreferrer" className="transaction-link">Check my deals in a new tab ↗</Link>
              <label className="transaction-checkbox">
                <input type="checkbox" checked={checkedDeals} onChange={(event) => setCheckedDeals(event.target.checked)} />
                <span>I checked my deals and this deal was not created.</span>
              </label>
            </div>
          )}
          <p className="transaction-note transaction-create-footnote">Your deal starts as a draft. You will review the record and invite your creator next.</p>
        </div>
        <aside className="transaction-create-aside" aria-label="What happens next">
          <p className="transaction-eyebrow">From agreement to work</p>
          <ol className="transaction-steps">
            <li aria-current="step"><span>01</span><div><strong>Create the record</strong><p>Define the scope and payment.</p></div></li>
            <li><span>02</span><div><strong>Invite your creator</strong><p>Send the deal to their Ledger account.</p></div></li>
            <li><span>03</span><div><strong>Review together</strong><p>Once accepted, confirm terms and continue to funding.</p></div></li>
          </ol>
        </aside>
      </div>
    </div>
  );
}
