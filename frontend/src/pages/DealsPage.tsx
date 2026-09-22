import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDeals, filterDeals } from '../hooks/useDeals';
import { useAuth } from '../contexts/AuthContext';
import { DealListSkeleton, EmptyState, ErrorState } from '../components/DealStateViews';
import { RecordList } from '../components/RecordList';

const FILTERS = [['all', 'All records'], ['active', 'Active'], ['completed', 'Completed'], ['disputed', 'Disputed'], ['declined', 'Declined'], ['cancelled', 'Cancelled']];

export function DealsPage() {
  const { user } = useAuth();
  const { deals, loading, error, refetch } = useDeals();
  const [activeFilter, setActiveFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const filtered = useMemo(() => filterDeals(deals, activeFilter, searchQuery), [deals, activeFilter, searchQuery]);
  return (
    <div className="transaction-page register-page">
      <header className="transaction-header">
        <p className="transaction-eyebrow">Register of agreements</p>
        <h1 className="transaction-title">Deal records.</h1>
        <p className="transaction-intro">Every agreement has a place. Follow its progress from the first terms to the final delivery.</p>
        {(user?.role === 'BRAND' || user?.role === 'ADMIN') && <div className="transaction-actions register-page__actions"><Link className="transaction-button transaction-button--primary" to="/deals/new">Create a deal ↗</Link></div>}
      </header>
      <div className="record-tools">
        <label className="transaction-field"><span>Search records</span><input type="search" placeholder="Title or counterparty…" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} /></label>
        <div className="record-filters" role="group" aria-label="Filter records">
          {FILTERS.map(([value, label]) => <button type="button" key={value} aria-pressed={activeFilter === value} onClick={() => setActiveFilter(value)}>{label}</button>)}
        </div>
        <p className="transaction-note" aria-live="polite">{loading ? 'Loading records…' : error ? 'Records unavailable' : filtered.length + (filtered.length === 1 ? ' record' : ' records')}</p>
      </div>
      {loading ? <DealListSkeleton count={5} /> : error ? <ErrorState title="Register access interrupted" message={error} onRetry={refetch} /> : !filtered.length ? <EmptyState title="No records found" description={searchQuery ? 'No records match “' + searchQuery + '”.' : 'No agreements in this category.'} action={(searchQuery || activeFilter !== 'all') ? <button className="transaction-link" onClick={() => { setSearchQuery(''); setActiveFilter('all'); }}>Clear filters</button> : undefined} /> : <RecordList entries={filtered} />}
    </div>
  );
}
