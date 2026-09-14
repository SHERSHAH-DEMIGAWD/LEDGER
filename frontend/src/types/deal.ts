/**
 * types/deal.ts
 *
 * Canonical TypeScript types for the Deal domain.
 * These mirror the backend API response shapes and are the single source of truth
 * for all frontend deal-related components.
 */

import type { DealStatus } from './dealStates';
import type { DealTerms } from './api';

// ---------------------------------------------------------------------------
// Sub-resources
// ---------------------------------------------------------------------------

export interface DealParty {
  id: string;
  name: string;
  role: string;
  email?: string;
}

export interface DealDocument {
  id: string;
  name: string;
  type: string;
  size: string;
  uploadedAt: string;
  url?: string;
}

export interface DealEvent {
  id: string;
  type: string;
  label: string;
  description?: string;
  actor?: string;
  timestamp: string;
  action?: string;
  note?: string;
}

// ---------------------------------------------------------------------------
// Core Deal
// ---------------------------------------------------------------------------

export interface Deal {
  id: string;
  title: string;
  amount: number;
  amountFormatted: string;
  counterparties: string;
  status: DealStatus;
  fundingStatus?: 'NOT_FUNDED' | 'FUNDED' | 'REFUNDED';
  paymentId?: string | null;
  paymentStatus?: string | null;
  description: string;
  /** Current authoritative terms; proposed terms never replace this snapshot. */
  terms: DealTerms;
  termsVersionNumber: number;
  acceptedVersionNumber: number | null;
  pendingTerms?: DealTerms;
  pendingTermsVersionNumber?: number;
  latestRevisionNote?: string | null;
  latestRevisionNoteAuthorId?: string | null;
  latestRevisionNoteAt?: string | null;
  parties: DealParty[];
  documents: DealDocument[];
  events: DealEvent[];
  createdAt: string;
  updatedAt: string;
  dueDate?: string;
  closeDate?: string;
  dealType?: string;
  source?: string;
}

// ---------------------------------------------------------------------------
// Summary shape (for list views)
// ---------------------------------------------------------------------------

export interface DealSummary {
  id: string;
  title: string;
  amount: number;
  amountFormatted: string;
  counterparties: string;
  status: DealStatus;
  updatedAt: string;
  updatedAtRelative: string;
}

// ---------------------------------------------------------------------------
// API response shapes
// ---------------------------------------------------------------------------

export interface DealListResponse {
  deals: DealSummary[];
  total: number;
}

export interface DealResponse {
  deal: Deal;
}

export interface ApiError {
  message: string;
  code?: string;
}
