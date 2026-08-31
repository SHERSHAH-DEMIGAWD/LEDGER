/**
 * services/dealNormalizer.ts
 *
 * Converts the backend's `BackendDeal` (DealWithVersions) shape into the
 * frontend's canonical `Deal` and `DealSummary` shapes.
 *
 * This is the ONLY translation layer. Pages and hooks never talk directly
 * to the raw backend shape — they always receive the normalized type.
 *
 * The conversion rules:
 *   Backend fields         →  Frontend fields
 *   deal.id              →  deal.id
 *   deal.versions[last]  →  deal.title (from terms.title)
 *   deal.versions[last]  →  deal.description (from terms.description)
 *   deal.versions[last]  →  deal.dealType (inferred from status / terms)
 *   deal.versions[last]  →  deal.amount (terms.paymentAmount / 100)
 *   deal.versions[last]  →  deal.amountFormatted (formatted from terms)
 *   deal.versions[last]  →  parties (derived from brandId + creatorId)
 *   deal.versions[last]  →  documents ([] — backend doesn't expose)
 *   []                  →  deal.events (populated from /history if available)
 *   deal.status          →  deal.status
 *   deal.createdAt       →  deal.createdAt
 *   deal.updatedAt       →  deal.updatedAt
 *
 * For list items (DealSummary), a subset of fields is populated.
 */

import type { Deal, DealSummary, DealParty } from '../types/deal';
import type { BackendDeal, BackendDealHistoryEntry } from '../types/api';
import type { DealStatus } from '../types/dealStates';
import type { DealEvent } from '../types/deal';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Normalize a BackendDeal into a frontend Deal.
 * Returns null if the deal has no versions (shouldn't happen in practice).
 */
export function normalizeDeal(backendDeal: BackendDeal): Deal | null {
  const latestVersion = backendDeal.versions[backendDeal.versions.length - 1];

  if (!latestVersion) return null;

  const terms = latestVersion.terms;
  const amount = terms.paymentAmount / 100; // cents → dollars
  const amountFormatted = formatCurrency(amount, terms.currency);

  return {
    id: backendDeal.id,
    title: terms.title,
    amount,
    amountFormatted,
    counterparties: buildCounterparties(backendDeal),
    status: backendDeal.status,
    description: terms.description,
    parties: buildParties(backendDeal),
    documents: [], // Backend doesn't expose documents in this response
    events: [],     // Populated separately by getDealHistory
    createdAt: new Date(backendDeal.createdAt).toISOString(),
    updatedAt: new Date(backendDeal.updatedAt).toISOString(),
    dealType: inferDealType(backendDeal.status),
    // dueDate, closeDate, source are not available in the backend schema
  };
}

/**
 * Normalize a BackendDeal into a DealSummary (list item shape).
 */
export function normalizeDealSummary(backendDeal: BackendDeal): DealSummary | null {
  const normalized = normalizeDeal(backendDeal);
  if (!normalized) return null;

  return {
    id: normalized.id,
    title: normalized.title,
    amount: normalized.amount,
    amountFormatted: normalized.amountFormatted,
    counterparties: normalized.counterparties,
    status: normalized.status,
    updatedAt: normalized.updatedAt,
    updatedAtRelative: relativeTime(normalized.updatedAt),
  };
}

/**
 * Convert a backend history entry to a frontend DealEvent.
 */
export function normalizeHistoryEntry(entry: BackendDealHistoryEntry): DealEvent {
  return {
    id: entry.id,
    type: entry.action.toLowerCase().replace('.', '_'),
    label: formatActionLabel(entry.action),
    description: formatActionDescription(entry),
    actor: entry.actorId ?? undefined,
    timestamp: new Date(entry.timestamp).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Build a human-readable counterparties string from brandId + creatorId.
 * In production, you'd look up real names — here we use the IDs directly.
 */
function buildCounterparties(deal: BackendDeal): string {
  const parts: string[] = [];

  if (deal.brandId) {
    parts.push(`Brand ${deal.brandId.slice(0, 8)}…`);
  }

  if (deal.creatorId) {
    parts.push(`Creator ${deal.creatorId.slice(0, 8)}…`);
  }

  return parts.join(' · ') || '—';
}

/**
 * Build Party records from brand + creator IDs.
 * In production these would be resolved to real names/emails.
 */
function buildParties(deal: BackendDeal): DealParty[] {
  const parties: DealParty[] = [];

  parties.push({
    id: deal.brandId,
    name: `Brand ${deal.brandId.slice(0, 8)}`,
    role: 'Brand',
  });

  if (deal.creatorId) {
    parties.push({
      id: deal.creatorId,
      name: `Creator ${deal.creatorId.slice(0, 8)}`,
      role: 'Creator',
    });
  }

  return parties;
}

/**
 * Infer a human-readable deal type from the status.
 * This is a rough heuristic — in production the backend would provide this.
 */
function inferDealType(status: DealStatus): string {
  const map: Record<DealStatus, string> = {
    DRAFT: 'Draft',
    PENDING_ACCEPTANCE: 'Pending',
    ACCEPTED: 'Active',
    DECLINED: 'Declined',
    FUNDED: 'Funded',
    IN_PROGRESS: 'In Progress',
    SUBMITTED: 'Submitted',
    APPROVED: 'Approved',
    REVISION_REQUESTED: 'Revision',
    DISPUTED: 'Disputed',
    RESOLVED: 'Resolved',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled',
  };
  return map[status] ?? status;
}

/**
 * Format a numeric amount + currency code into a display string.
 */
function formatCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency.toUpperCase()} ${amount.toLocaleString()}`;
  }
}

/**
 * Format an action code like 'DEAL.STATE_CHANGED' into a readable label.
 */
function formatActionLabel(action: string): string {
  // Strip the namespace prefix
  const label = action.replace(/^(DEAL|INVITATION)\./, '');
  // Convert SCREAMING_SNAKE to Title Case
  return label.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Format a history entry's metadata into a human-readable description.
 */
function formatActionDescription(entry: BackendDealHistoryEntry): string | undefined {
  const m = entry.metadata;
  if (!m) return undefined;

  // State change events
  if ('fromStatus' in m && 'toStatus' in m) {
    return `${m.fromStatus} → ${m.toStatus}`;
  }

  // Creator invitation
  if ('creatorId' in m && entry.action === 'DEAL.CREATOR_INVITED') {
    return `Creator invited`;
  }

  return undefined;
}

/**
 * Relative time string for the summary view.
 */
function relativeTime(isoString: string): string {
  const then = new Date(isoString).getTime();
  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((now - then) / 1000));

  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 86400 * 7) return `${Math.floor(diffSec / 86400)}d ago`;
  if (diffSec < 86400 * 30) return `${Math.floor(diffSec / 86400 / 7)}w ago`;
  return new Date(isoString).toLocaleDateString();
}
