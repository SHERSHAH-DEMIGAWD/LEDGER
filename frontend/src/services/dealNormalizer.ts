/**
 * services/dealNormalizer.ts
 *
 * Converts the backend's `BackendDeal` (DealWithVersions) shape into the
 * frontend's canonical `Deal` and `DealSummary` shapes.
 *
 * This is the ONLY translation layer. Pages and hooks never talk directly
 * to the raw backend shape — they always receive the normalized type.
 *
 * Terms follow the backend's accepted-version pointer. Pending proposals are
 * exposed separately, and rejected versions never replace accepted terms.
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
  if (['FUNDED', 'IN_PROGRESS', 'SUBMITTED', 'REVISION_REQUESTED', 'APPROVED', 'DISPUTED', 'RESOLVED', 'COMPLETED'].includes(backendDeal.status) &&
      (backendDeal.fundingStatus !== 'FUNDED' || !backendDeal.paymentRecordId)) {
    throw new Error('Funding could not be verified for this deal. Reload or contact support.');
  }
  const latestVersion = backendDeal.acceptedVersionNumber != null
    ? backendDeal.versions.find((v) => v.versionNumber === backendDeal.acceptedVersionNumber && !v.isPending)
    : [...backendDeal.versions].sort((a, b) => b.versionNumber - a.versionNumber).find((v) => !v.isPending);

  if (!latestVersion) return null;

  const terms = latestVersion.terms;
  const pendingVersion = backendDeal.versions.find((v) => v.isPending);
  const amount = terms.paymentAmount / 100; // cents → dollars
  const amountFormatted = formatCurrency(amount, terms.currency);

  return {
    id: backendDeal.id,
    title: terms.title,
    amount,
    amountFormatted,
    counterparties: buildCounterparties(backendDeal),
    status: backendDeal.status,
    fundingStatus: backendDeal.fundingStatus,
    description: terms.description,
    terms,
    termsVersionNumber: latestVersion.versionNumber,
    acceptedVersionNumber: backendDeal.acceptedVersionNumber ?? null,
    pendingTerms: pendingVersion?.terms,
    pendingTermsVersionNumber: pendingVersion?.versionNumber,
    latestRevisionNote: backendDeal.latestRevisionNote,
    latestRevisionNoteAuthorId: backendDeal.latestRevisionNoteAuthorId,
    latestRevisionNoteAt: backendDeal.latestRevisionNoteAt,
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
    actor: entry.actor?.name || entry.actor?.email || undefined,
    timestamp: new Date(entry.timestamp).toISOString(),
    action: entry.action,
    note: [entry.metadata?.note, entry.metadata?.revisionNote, entry.metadata?.disputeNote, entry.metadata?.resolutionNote]
      .find((value): value is string => typeof value === 'string' && value.length > 0),
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Prefer the server's participant names; never use raw identifiers as names.
 */
function buildCounterparties(deal: BackendDeal): string {
  const parts: string[] = [];

  if (deal.brandId) {
    parts.push(deal.brand?.name || deal.brand?.email || 'Brand');
  }

  if (deal.creatorId) {
    parts.push(deal.creator?.name || deal.creator?.email || 'Creator');
  }

  return parts.join(' · ') || '—';
}

/**
 * An unassigned creator is absent, rather than a fabricated counterparty.
 */
function buildParties(deal: BackendDeal): DealParty[] {
  const parties: DealParty[] = [];

  parties.push({
    id: deal.brandId,
    name: deal.brand?.name || deal.brand?.email || 'Brand',
    role: 'Brand',
    email: deal.brand?.email,
  });

  if (deal.creatorId) {
    parties.push({
      id: deal.creatorId,
      name: deal.creator?.name || deal.creator?.email || 'Creator',
      role: 'Creator',
      email: deal.creator?.email,
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
export function formatCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency.toUpperCase()} ${amount.toLocaleString()}`;
  }
}

/**
 * Format an action code like 'DEAL.STATE_CHANGED' into a readable label.
 */
function formatActionLabel(action: string): string {
  const deliveryLabels: Record<string, string> = {
    'DELIVERABLE.SUBMITTED': 'Work submitted',
    'DELIVERABLE.REVISION_REQUESTED': 'Revision requested',
    'DELIVERABLE.APPROVED': 'Work approved',
    'DISPUTE.RAISED': 'Dispute raised',
    'DISPUTE.RESOLVED': 'Dispute resolved',
    'PAYMENT.RELEASED': 'Deal completed (simulated release)',
  };
  if (deliveryLabels[action]) return deliveryLabels[action];
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
