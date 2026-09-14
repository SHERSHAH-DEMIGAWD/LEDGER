import type { DealTerms } from '../types/api';
import '../styles/transaction.css';

function displayDate(value: string): string {
  // Date-only deadlines must not shift to the previous day in western zones.
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function DealTermsSummary({ terms }: { terms: DealTerms }) {
  return (
    <div className="transaction-terms-summary">
      <p className="transaction-terms-description">{terms.description}</p>
      <dl className="transaction-terms-facts">
        <div>
          <dt>Total payment</dt>
          <dd>{terms.currency} {(terms.paymentAmount / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</dd>
        </div>
        {terms.timeline?.startDate && <div><dt>Start date</dt><dd>{displayDate(terms.timeline.startDate)}</dd></div>}
        {terms.timeline?.endDate && <div><dt>End date</dt><dd>{displayDate(terms.timeline.endDate)}</dd></div>}
      </dl>
      <h3 className="transaction-subheading">Deliverables <span>({terms.deliverables.length})</span></h3>
      <ol className="transaction-terms-deliverables">
        {terms.deliverables.map((item, index) => (
          <li key={index}>
            <span className="transaction-deliverable-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
            <div>
              <h4>{item.title}</h4>
              <p>{item.description}</p>
              {item.deadline && <span className="transaction-deadline">Due {displayDate(item.deadline)}</span>}
            </div>
          </li>
        ))}
      </ol>
      {!!terms.timeline?.milestones?.length && (
        <div className="transaction-terms-milestones">
          <h3 className="transaction-subheading">Milestones</h3>
          <ul>{terms.timeline.milestones.map((milestone, index) => <li key={index}>{milestone.name}{milestone.date ? ` · ${displayDate(milestone.date)}` : ''}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
