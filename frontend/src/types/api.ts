/**
 * types/api.ts
 *
 * Types describing the *backend* wire format.
 *
 * The backend wraps every successful response in:
 *   { success: true, data: <T> }
 * and every error in:
 *   { success: false, error: { code, message } }
 *
 * This file owns the wire-format shapes only. The frontend `Deal`/`DealSummary`
 * shapes used by pages and components are in `types/deal.ts`. The boundary
 * between the two lives in `services/dealNormalizer.ts`.
 */

import type { DealStatus } from './dealStates';

/**
 * Standard success envelope returned by every backend endpoint.
 */
export interface ApiSuccessEnvelope<T> {
  success: true;
  data: T;
}

/**
 * Standard error envelope. See backend `errorHandler.ts` for the codes.
 */
export interface ApiErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

/**
 * A union of every possible backend response.
 * Use this when you need to discriminate by `success`.
 */
export type ApiResponse<T> = ApiSuccessEnvelope<T> | ApiErrorEnvelope;

// ---------------------------------------------------------------------------
// Domain shapes returned by the backend
// ---------------------------------------------------------------------------

export type DealAction =
  | 'SUBMIT_FOR_ACCEPTANCE'
  | 'ACCEPT'
  | 'DECLINE'
  | 'FUND'
  | 'START'
  | 'SUBMIT_DELIVERABLE'
  | 'APPROVE'
  | 'REQUEST_REVISION'
  | 'RESUBMIT'
  | 'RAISE_DISPUTE'
  | 'RESOLVE'
  | 'ACCEPT_RESOLUTION'
  | 'REQUEST_REWORK'
  | 'RELEASE_PAYMENT'
  | 'CANCEL';

export interface Deliverable {
  title: string;
  description: string;
  deadline?: string;
}

export interface DealTerms {
  title: string;
  description: string;
  deliverables: Deliverable[];
  /** Payment amount in cents (integer). */
  paymentAmount: number;
  /** 3-letter uppercase currency code. */
  currency: string;
  timeline?: {
    startDate?: string;
    endDate?: string;
    milestones?: Array<{ name: string; date?: string }>;
  };
}

export interface DealVersion {
  id: string;
  versionNumber: number;
  isPending?: boolean;
  terms: DealTerms;
  createdAt: string;
}

/** Participant fields explicitly projected by the API (never account secrets). */
export interface BackendParticipant {
  id: string;
  name: string | null;
  email: string;
}

/**
 * The full Deal record as returned by the backend.
 * Mirrors `DealWithVersions` on the server side.
 *
 * Note: this is the *backend* shape. Frontend code should consume the
 * normalized `Deal` from `types/deal.ts` after `dealNormalizer.ts`
 * translates it.
 */
export interface BackendDeal {
  id: string;
  brandId: string;
  creatorId: string | null;
  brand?: BackendParticipant | null;
  creator?: BackendParticipant | null;
  status: DealStatus;
  acceptedVersionNumber?: number | null;
  paymentRecordId?: string | null;
  contractId: string | null;
  fundingStatus: 'NOT_FUNDED' | 'FUNDED' | 'REFUNDED';
  createdAt: string;
  updatedAt: string;
  versions: DealVersion[];
}

/**
 * Response of `GET /deals/:id/state`.
 * Lists the actions the current actor is permitted to take on this deal.
 */
export interface BackendDealState {
  dealId: string;
  status: DealStatus;
  updatedAt: string;
  isTerminal: boolean;
  availableActions: DealAction[];
  brandId: string;
  creatorId: string | null;
}

/**
 * Response of `GET /deals/:id/history`.
 * The backend exposes this as a list of audit-log entries.
 */
export interface BackendDealHistoryEntry {
  id: string;
  action: string;
  actorId: string | null;
  actor?: BackendParticipant | null;
  metadata: Record<string, unknown> | null;
  timestamp: string;
  resourceType: string;
  resourceId: string;
}

/**
 * Response of `GET /invitations`.
 * Slim shape optimized for the creator's invitation inbox.
 */
export interface BackendInvitation {
  id: string;
  status: DealStatus;
  createdAt: string;
  updatedAt: string;
  brandId: string;
  brand?: BackendParticipant | null;
  terms: DealTerms;
  latestVersionNumber: number;
}

// ---------------------------------------------------------------------------
// Request payloads
// ---------------------------------------------------------------------------

export type InviteCreatorRequest =
  | { creatorId: string; creatorEmail?: never }
  | { creatorEmail: string; creatorId?: never };

export interface TransitionDealRequest {
  action: DealAction;
}

// ---------------------------------------------------------------------------
// Error codes (from backend middleware/errorHandler.ts)
// ---------------------------------------------------------------------------

/**
 * Known error codes the backend can return. The frontend can branch on these
 * to decide whether to show validation, authorization, conflict, or generic
 * messaging.
 */
export type ApiErrorCode =
  | 'VAL_001'      // Validation error (Zod or deal terms)
  | 'AUTH_010'     // Authentication required / token invalid
  | 'AUTH_011'     // Forbidden (role / participation)
  | 'RES_001'      // Resource not found
  | 'RES_002'      // Resource conflict (optimistic lock failure)
  | 'DEAL_001'     // Domain / state-machine error
  | 'SYS_001';     // Generic server error
