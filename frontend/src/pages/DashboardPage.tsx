import { Link } from 'react-router-dom';
import { useDeals } from '../hooks/useDeals';
import { useAuth } from '../contexts/AuthContext';
import { DealListSkeleton, EmptyState, ErrorState } from '../components/DealStateViews';
import { RecordList } from '../components/RecordList';

export function DashboardPage() {
  const { user } = useAuth();
  const { deals, loading, error, refetch } = useDeals();
  const active = deals.filter((deal) => !['COMPLETED', 'DECLINED', 'CANCELLED'].includes(deal.status));
  const reviews = deals.filter((deal) => ['PENDING_ACCEPTANCE', 'SUBMITTED', 'REVISION_REQUESTED', 'DISPUTED'].includes(deal.status));
  const completed = deals.filter((deal) => deal.status === 'COMPLETED');
  const recent = [...deals].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 5);
  const amounts = active.reduce<Record<string, number>>((totals, deal) => {
    const currency = deal.currency ?? 'INR';
    totals[currency] = (totals[currency] ?? 0) + deal.amount;
    return totals;
  }, {});
  const values = Object.entries(amounts).map(([currency, amount]) => new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount));
  const unavailable = loading || !!error;
  return (
    <div className="transaction-page register-page">
      <header className="transaction-header">
        <p className="transaction-eyebrow">Your collaboration register</p>
        <h1 className="transaction-title">Work, held<br />to its word.</h1>
        <p className="transaction-intro">Welcome, {user?.name}.<br />Your agreements, progress and payments. On record.</p>
        <div className="transaction-actions register-page__actions">
          {(user?.role === 'BRAND' || user?.role === 'ADMIN') && <Link className="transaction-button transaction-button--primary" to="/deals/new">Create a deal <span aria-hidden="true">↗</span></Link>}
          {user?.role === 'CREATOR' && <Link className="transaction-button transaction-button--primary" to="/invitations">Review invitations <span aria-hidden="true">↗</span></Link>}
          <Link className="transaction-link" to="/deals">View all records →</Link>
        </div>
      </header>
      <dl className="register-metrics" aria-label="Your deal overview">
        <div><dt>Active deals</dt><dd>{unavailable ? '—' : String(active.length).padStart(2, '0')}</dd></div>
        <div><dt>In review</dt><dd>{unavailable ? '—' : String(reviews.length).padStart(2, '0')}</dd></div>
        <div><dt>Completed</dt><dd>{unavailable ? '—' : String(completed.length).padStart(2, '0')}</dd></div>
        <div className="register-metrics__value"><dt>Active agreed value</dt><dd>{unavailable ? '—' : values.length ? values.map((value) => <span key={value}>{value}</span>) : '—'}</dd></div>
      </dl>
      <section className="register-records" aria-labelledby="recent-records">
        <div className="register-section-head"><h2 id="recent-records">Recent records</h2><span>{unavailable ? '—' : deals.length + ' on record'}</span></div>
        {loading ? <DealListSkeleton count={3} /> : error ? <ErrorState message={error} onRetry={refetch} /> : !recent.length ? <EmptyState title="Your first agreement starts here" description="Create a deal or respond to an invitation to begin your record." /> : <RecordList entries={recent} />}
      </section>
    </div>
  );
}
