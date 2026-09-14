/** The creator inbox reads and responds to invitations held by the backend. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { DealTermsSummary } from '../components/DealTermsSummary';
import { useAuth } from '../contexts/AuthContext';
import { invitationApi, type InvitationSummary } from '../services/invitationApi';
import '../styles/transaction.css';

interface ResponseNotice {
  dealId: string;
  title: string;
  message: string;
  error: boolean;
}

export function InvitationsPage() {
  const { user } = useAuth();

  if (user?.role !== 'CREATOR') {
    return (
      <div className="transaction-page">
        <p className="transaction-eyebrow">Invitations</p>
        <h1 className="transaction-title">A creator reviews the invitation.</h1>
        <p className="transaction-intro">Sign in as the invited creator to review and respond. Brands can follow the invitation's status from their deal.</p>
        <Link to="/deals" className="transaction-link">View deals →</Link>
      </div>
    );
  }

  // A persona change discards the previous creator's inbox and pending UI.
  return <InvitationInbox key={user.id} />;
}

function InvitationInbox() {
  const [invitations, setInvitations] = useState<InvitationSummary[] | null>(null);
  const [refreshing, setRefreshing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<{ id: string; response: 'accept' | 'decline' } | null>(null);
  const [notice, setNotice] = useState<ResponseNotice | null>(null);
  const active = useRef(false);
  const requestSequence = useRef(0);
  const refreshLock = useRef(false);
  const actionLock = useRef(false);

  const refreshInvitations = useCallback(async () => {
    if (!active.current) return;
    const sequence = ++requestSequence.current;
    refreshLock.current = true;
    setRefreshing(true);

    try {
      const data = await invitationApi.listInvitations();
      if (!active.current || sequence !== requestSequence.current) return;
      setInvitations(data);
      setError(null);
    } catch (err) {
      if (!active.current || sequence !== requestSequence.current) return;
      // Keep the last known entries visible, but require a successful refresh
      // before responding to an invitation whose current state is unknown.
      setError(err instanceof Error ? err.message : 'Could not refresh invitations. Please try again.');
    } finally {
      if (active.current && sequence === requestSequence.current) {
        refreshLock.current = false;
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    active.current = true;
    void refreshInvitations();

    const refreshIfAvailable = () => {
      if (document.visibilityState === 'visible' && !actionLock.current && !refreshLock.current) {
        void refreshInvitations();
      }
    };
    window.addEventListener('focus', refreshIfAvailable);
    document.addEventListener('visibilitychange', refreshIfAvailable);
    const timer = window.setInterval(refreshIfAvailable, 30_000);

    return () => {
      active.current = false;
      ++requestSequence.current;
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshIfAvailable);
      document.removeEventListener('visibilitychange', refreshIfAvailable);
    };
  }, [refreshInvitations]);

  const respond = async (invitation: InvitationSummary, response: 'accept' | 'decline') => {
    if (!active.current || actionLock.current || refreshLock.current || error) return;
    // The ref closes the gap before React renders disabled controls.
    actionLock.current = true;
    setAction({ id: invitation.id, response });
    setNotice(null);

    try {
      const result = response === 'accept'
        ? await invitationApi.acceptInvitation(invitation.id)
        : await invitationApi.declineInvitation(invitation.id);
      if (!active.current) return;
      setNotice({
        dealId: invitation.id,
        title: invitation.title,
        error: !result.ok,
        message: result.ok
          ? `Invitation ${response === 'accept' ? 'accepted' : 'declined'}.`
          : result.kind === 'network' || result.kind === 'server'
            ? 'We could not confirm your response. Check the current deal status before trying again.'
            : result.message,
      });
    } catch {
      if (!active.current) return;
      setNotice({
        dealId: invitation.id,
        title: invitation.title,
        message: 'We could not confirm your response. Check the current deal status before trying again.',
        error: true,
      });
    } finally {
      // Conflicts and lost responses may follow a committed change. Always
      // reconcile before allowing a second response to the last known entry.
      if (active.current) await refreshInvitations();
      actionLock.current = false;
      if (active.current) setAction(null);
    }
  };

  const disabled = refreshing || action !== null || error !== null;

  return (
    <div className="transaction-page">
      <header className="transaction-header">
        <Link to="/deals" className="transaction-back">← All deals</Link>
        <p className="transaction-eyebrow">Pending invitations</p>
        <h1 className="transaction-title">An invitation to collaborate.</h1>
        <p className="transaction-intro">Review the terms, deliverables and payment before accepting or declining.</p>
      </header>

      <div className="transaction-actions" style={{ marginBottom: 24 }}>
        <button type="button" className="transaction-button" disabled={refreshing || action !== null} onClick={() => {
          if (!actionLock.current && !refreshLock.current) void refreshInvitations();
        }}>
          {refreshing ? 'Refreshing…' : 'Refresh invitations'}
        </button>
        <span className="transaction-note" style={{ margin: 0 }} role="status">
          {invitations === null && refreshing ? 'Loading invitations…' : error ? 'Refresh required' : `${invitations?.length ?? 0} pending`}
        </span>
      </div>

      {notice && (
        <div className={notice.error ? 'transaction-error' : 'transaction-section'} role={notice.error ? 'alert' : 'status'}>
          <p className={notice.error ? undefined : 'transaction-note'}>{notice.message}</p>
          <Link to={`/deals/${encodeURIComponent(notice.dealId)}`} className="transaction-link">View current deal: {notice.title} →</Link>
        </div>
      )}

      {error && (
        <div className="transaction-error" role="alert">
          <p>{error}</p>
          <p style={{ marginBottom: 0 }}>Refresh to verify the current invitations before responding.</p>
        </div>
      )}

      {!refreshing && !error && invitations?.length === 0 && (
        <section className="transaction-section">
          <h2 className="transaction-subheading">No pending invitations</h2>
          <p className="transaction-note">Invitations sent to your creator account will appear here. You can find deals you have already responded to in your deals.</p>
          <Link to="/deals" className="transaction-link">View all deals →</Link>
        </section>
      )}

      <div aria-busy={refreshing || action !== null}>
        {invitations?.map((invitation) => (
          <article key={invitation.id} className="transaction-section" aria-labelledby={`invitation-${invitation.id}`}>
            <p className="transaction-eyebrow">Awaiting your response · Terms v{invitation.termsVersionNumber}</p>
            <h2 id={`invitation-${invitation.id}`} className="transaction-subheading" style={{ fontFamily: 'var(--font-display)', fontSize: 26, overflowWrap: 'anywhere' }}>
              {invitation.title}
            </h2>
            <p className="transaction-note" style={{ overflowWrap: 'anywhere' }}>
              From {invitation.brandName}
              {invitation.brandEmail && invitation.brandEmail !== invitation.brandName ? ` · ${invitation.brandEmail}` : ''}
            </p>
            <DealTermsSummary terms={invitation.terms} />
            <div className="transaction-actions" style={{ marginTop: 28 }}>
              <button type="button" className="transaction-button transaction-button--primary" disabled={disabled} onClick={() => void respond(invitation, 'accept')}>
                {action?.id === invitation.id && action.response === 'accept' ? 'Accepting…' : 'Accept invitation'}
              </button>
              <button type="button" className="transaction-button transaction-button--danger" disabled={disabled} onClick={() => void respond(invitation, 'decline')}>
                {action?.id === invitation.id && action.response === 'decline' ? 'Declining…' : 'Decline invitation'}
              </button>
              <Link to={`/deals/${encodeURIComponent(invitation.id)}`} className="transaction-link">Open deal →</Link>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
