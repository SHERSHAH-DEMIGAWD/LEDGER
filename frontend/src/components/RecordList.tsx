import { Link } from 'react-router-dom';
import { DealStateBadge } from './DealStateBadge';
import { useDealNavigation } from '../contexts/DealNavigationContext';
import type { DealSummary } from '../types/deal';

/** Shared readable register rows for the overview and complete index. */
export function RecordList({ entries }: { entries: DealSummary[] }) {
  const { recordNavigation } = useDealNavigation();
  return (
    <div className="record-list">
      <div className="record-list__head" aria-hidden="true">
        <span>Record / parties</span><span>Agreed value</span><span>State / updated</span>
      </div>
      <ol className="record-list__entries">
        {entries.map((deal, index) => (
          <li key={deal.id}>
            <Link className="record-row" to={'/deals/' + encodeURIComponent(deal.id)} onClick={() => recordNavigation('forward')}>
              <div className="record-row__identity">
                <span className="record-row__number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                <div><h3>{deal.title}</h3><p>{deal.counterparties}</p></div>
              </div>
              <span className="record-row__value"><small>Agreed value</small>{deal.amountFormatted}</span>
              <div className="record-row__state"><DealStateBadge status={deal.status} size="sm" /><time dateTime={deal.updatedAt} title={new Date(deal.updatedAt).toLocaleString()}>{deal.updatedAtRelative}</time></div>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
