/**
 * services/dealApi.ts
 *
 * Frontend API client for the Deal resource.
 *
 * This is the ONLY place in the frontend that knows whether data comes from
 * a real backend or local mocks. Pages and hooks call this client through its
 * exported `dealApi` object — they never reach into the mock directly.
 *
 * To switch from mocks to a real backend:
 *   1. Set VITE_USE_MOCK_DEALS=false (or remove the env var entirely)
 *   2. Ensure VITE_API_BASE_URL points to a working backend
 *   3. No other frontend code needs to change.
 *
 * The mock data here is presentational only. It mirrors the shape of a
 * real backend response so swapping implementations is frictionless.
 *
 * MOCK MODE BEHAVIOR:
 *   In mock mode, transitions are simulated locally using a state machine
 *   that mirrors the backend's DealStateMachine. Each seed persona sees
 *   only the actions authorized for their role on each deal. This is
 *   what powers the development/demo experience when no backend is
 *   available. NEVER use this for production — the backend remains the
 *   source of truth for authorization.
 */

import axios, { type AxiosError } from 'axios';
import type {
  Deal,
  DealListResponse,
  DealSummary,
  DealEvent,
} from '../types/deal';
import type {
  BackendDeal,
  BackendDealState,
  BackendDealHistoryEntry,
  DealAction,
} from '../types/api';
import type { DealStatus } from '../types/dealStates';
import { normalizeDeal, normalizeDealSummary, normalizeHistoryEntry } from './dealNormalizer';
import { getHttpClient } from './httpClient';
import { getMockUser } from './auth';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** When true, the client returns mock data. When false, it uses HTTP. */
const USE_MOCK = import.meta.env.VITE_USE_MOCK_DEALS !== 'false';

/**
 * Artificial latency for mock responses (ms). Keeps the UI honest about
 * loading states.
 */
const MOCK_LATENCY_MS = 350;

// ---------------------------------------------------------------------------
// HTTP client
// ---------------------------------------------------------------------------
// The shared httpClient is imported from ./httpClient — it attaches the
// Authorization and X-Mock-User headers automatically.

// ---------------------------------------------------------------------------
// Mock dataset
// ---------------------------------------------------------------------------

/**
 * The static seed data. Individual deal state is managed in the mockStore
 * to support state transitions during the demo.
 */
const MOCK_DEALS_DATA: Deal[] = [
  {
    id: '1',
    title: 'Seed Bridge Capital — Series A',
    amount: 1_200_000,
    amountFormatted: '$1,200,000',
    counterparties: 'Bridge Ventures · Capital Group',
    status: 'PENDING_ACCEPTANCE',
    description:
      'Bridge capital for the Series A round of a high-growth SaaS company. ' +
      'Funds will be held in escrow pending milestone verification and board approval.',
    parties: [
      { id: 'p-1-1', name: 'Sarah Chen', role: 'Investor Lead', email: 'sarah@bridge.vc' },
      { id: 'p-1-2', name: 'James Park', role: 'Founder', email: 'james@startup.io' },
      { id: 'p-1-3', name: 'Lisa Tran', role: 'Legal Counsel', email: 'lisa@tranlaw.com' },
    ],
    documents: [
      { id: 'd-1-1', name: 'Term Sheet', type: 'PDF', size: '2.4 MB', uploadedAt: '2026-08-15T10:30:00Z' },
      { id: 'd-1-2', name: 'Cap Table', type: 'XLSX', size: '128 KB', uploadedAt: '2026-08-15T10:32:00Z' },
      { id: 'd-1-3', name: 'Due Diligence Report', type: 'PDF', size: '5.1 MB', uploadedAt: '2026-08-16T09:14:00Z' },
    ],
    events: [
      { id: 'e-1-1', type: 'created', label: 'Deal Created', actor: 'James Park', timestamp: '2026-08-15T10:30:00Z' },
      { id: 'e-1-2', type: 'submitted', label: 'Submitted to Investor', timestamp: '2026-08-16T11:00:00Z' },
      { id: 'e-1-3', type: 'review_started', label: 'Under Review', actor: 'Bridge Ventures', timestamp: '2026-08-17T08:45:00Z' },
    ],
    createdAt: '2026-08-15T10:30:00Z',
    updatedAt: '2026-08-17T08:45:00Z',
    dueDate: '2026-09-15T00:00:00Z',
    dealType: 'Equity',
    source: 'Direct',
  },
  {
    id: '2',
    title: 'Northbrook Acquisition — Series B',
    amount: 3_500_000,
    amountFormatted: '$3,500,000',
    counterparties: 'Northbrook Partners · Apex Fund',
    status: 'FUNDED',
    description:
      'Strategic acquisition financing for a regional manufacturing rollup. ' +
      'Capital will be deployed across two tranches tied to integration milestones.',
    parties: [
      { id: 'p-2-1', name: 'Michael Reyes', role: 'Acquirer', email: 'michael@northbrook.io' },
      { id: 'p-2-2', name: 'Diana Volkov', role: 'Managing Partner', email: 'diana@apex.fund' },
    ],
    documents: [
      { id: 'd-2-1', name: 'Purchase Agreement', type: 'PDF', size: '8.2 MB', uploadedAt: '2026-07-22T14:00:00Z' },
      { id: 'd-2-2', name: 'Financial Statements', type: 'PDF', size: '3.6 MB', uploadedAt: '2026-07-22T14:05:00Z' },
    ],
    events: [
      { id: 'e-2-1', type: 'created', label: 'Deal Created', actor: 'Michael Reyes', timestamp: '2026-07-20T09:00:00Z' },
      { id: 'e-2-2', type: 'accepted', label: 'Terms Accepted', timestamp: '2026-07-23T16:20:00Z' },
      { id: 'e-2-3', type: 'funded', label: 'Funds Disbursed', actor: 'Apex Fund', timestamp: '2026-08-01T12:00:00Z' },
    ],
    createdAt: '2026-07-20T09:00:00Z',
    updatedAt: '2026-08-28T12:00:00Z',
    closeDate: '2026-08-01T12:00:00Z',
    dealType: 'Acquisition',
    source: 'Broker',
  },
  {
    id: '3',
    title: 'Meridian Growth — Bridge Loan',
    amount: 750_000,
    amountFormatted: '$750,000',
    counterparties: 'Meridian Capital',
    status: 'COMPLETED',
    description:
      'Short-term bridge loan to support working capital during a planned Series A close. ' +
      'Repaid in full at the closing of the primary round.',
    parties: [
      { id: 'p-3-1', name: 'Elena Park', role: 'Borrower', email: 'elena@meridian.co' },
      { id: 'p-3-2', name: 'Tom Whitaker', role: 'Lender', email: 'tom@meridiancap.com' },
    ],
    documents: [
      { id: 'd-3-1', name: 'Loan Agreement', type: 'PDF', size: '1.2 MB', uploadedAt: '2026-06-10T11:00:00Z' },
      { id: 'd-3-2', name: 'Repayment Confirmation', type: 'PDF', size: '420 KB', uploadedAt: '2026-08-20T15:30:00Z' },
    ],
    events: [
      { id: 'e-3-1', type: 'created', label: 'Deal Created', timestamp: '2026-06-10T11:00:00Z' },
      { id: 'e-3-2', type: 'funded', label: 'Loan Disbursed', timestamp: '2026-06-11T09:00:00Z' },
      { id: 'e-3-3', type: 'completed', label: 'Loan Repaid', timestamp: '2026-08-20T15:30:00Z' },
    ],
    createdAt: '2026-06-10T11:00:00Z',
    updatedAt: '2026-08-20T15:30:00Z',
    closeDate: '2026-08-20T15:30:00Z',
    dealType: 'Debt',
    source: 'Direct',
  },
  {
    id: '4',
    title: 'Solaris Labs — Convertible Note',
    amount: 2_100_000,
    amountFormatted: '$2,100,000',
    counterparties: 'Solaris Ventures · Peak Equity',
    status: 'DISPUTED',
    description:
      'Convertible note with valuation cap and discount. ' +
      'Dispute concerns the cap interpretation versus the most favored investor provision.',
    parties: [
      { id: 'p-4-1', name: 'Ravi Krishnan', role: 'Founder', email: 'ravi@solaris.dev' },
      { id: 'p-4-2', name: 'Nora Blake', role: 'Lead Investor', email: 'nora@solaris.vc' },
      { id: 'p-4-3', name: 'Oscar Vega', role: 'Co-Investor', email: 'oscar@peakequity.io' },
    ],
    documents: [
      { id: 'd-4-1', name: 'Convertible Note', type: 'PDF', size: '1.8 MB', uploadedAt: '2026-05-14T10:00:00Z' },
      { id: 'd-4-2', name: 'Cap Table', type: 'XLSX', size: '256 KB', uploadedAt: '2026-05-14T10:05:00Z' },
      { id: 'd-4-3', name: 'Dispute Notice', type: 'PDF', size: '180 KB', uploadedAt: '2026-08-22T11:30:00Z' },
    ],
    events: [
      { id: 'e-4-1', type: 'created', label: 'Deal Created', timestamp: '2026-05-14T10:00:00Z' },
      { id: 'e-4-2', type: 'submitted', label: 'Submitted', timestamp: '2026-05-15T09:00:00Z' },
      { id: 'e-4-3', type: 'disputed', label: 'Dispute Opened', actor: 'Peak Equity', timestamp: '2026-08-22T11:30:00Z' },
    ],
    createdAt: '2026-05-14T10:00:00Z',
    updatedAt: '2026-08-22T11:30:00Z',
    dealType: 'Convertible',
    source: 'Direct',
  },
  {
    id: '5',
    title: 'Ironwood Partners — Series C',
    amount: 5_000_000,
    amountFormatted: '$5,000,000',
    counterparties: 'Ironwood Capital · Summit Fund',
    status: 'IN_PROGRESS',
    description:
      'Series C growth round for an enterprise infrastructure company. ' +
      'Funds earmarked for international expansion and product line extension.',
    parties: [
      { id: 'p-5-1', name: 'Hannah Cole', role: 'CEO', email: 'hannah@ironwood.io' },
      { id: 'p-5-2', name: 'Marcus Lin', role: 'Investor', email: 'marcus@summit.fund' },
      { id: 'p-5-3', name: 'Priya Iyer', role: 'Board Observer', email: 'priya@ironwoodcap.com' },
    ],
    documents: [
      { id: 'd-5-1', name: 'Term Sheet', type: 'PDF', size: '1.6 MB', uploadedAt: '2026-08-10T09:00:00Z' },
      { id: 'd-5-2', name: 'Business Plan', type: 'PDF', size: '4.2 MB', uploadedAt: '2026-08-10T09:10:00Z' },
      { id: 'd-5-3', name: 'Cap Table', type: 'XLSX', size: '320 KB', uploadedAt: '2026-08-10T09:15:00Z' },
      { id: 'd-5-4', name: 'Audited Financials', type: 'PDF', size: '6.8 MB', uploadedAt: '2026-08-12T14:00:00Z' },
    ],
    events: [
      { id: 'e-5-1', type: 'created', label: 'Deal Created', actor: 'Hannah Cole', timestamp: '2026-08-10T09:00:00Z' },
      { id: 'e-5-2', type: 'submitted', label: 'Submitted to Investors', timestamp: '2026-08-12T16:00:00Z' },
      { id: 'e-5-3', type: 'in_progress', label: 'Due Diligence', actor: 'Summit Fund', timestamp: '2026-08-18T10:00:00Z' },
    ],
    createdAt: '2026-08-10T09:00:00Z',
    updatedAt: '2026-08-25T14:00:00Z',
    dueDate: '2026-10-30T00:00:00Z',
    dealType: 'Equity',
    source: 'Direct',
  },
  {
    id: '6',
    title: 'Atlas Holdings — Term Sheet Review',
    amount: 850_000,
    amountFormatted: '$850,000',
    counterparties: 'Atlas Holdings',
    status: 'DRAFT',
    description:
      'Draft term sheet for a strategic minority investment. ' +
      'Internal review pending before submission to the issuer.',
    parties: [
      { id: 'p-6-1', name: 'Internal Team', role: 'Originator' },
    ],
    documents: [
      { id: 'd-6-1', name: 'Draft Term Sheet', type: 'DOCX', size: '512 KB', uploadedAt: '2026-08-30T09:00:00Z' },
    ],
    events: [
      { id: 'e-6-1', type: 'created', label: 'Draft Created', actor: 'Internal Team', timestamp: '2026-08-30T09:00:00Z' },
    ],
    createdAt: '2026-08-30T09:00:00Z',
    updatedAt: '2026-08-30T09:00:00Z',
    dealType: 'Equity',
    source: 'Direct',
  },
  {
    id: '7',
    title: 'Cascade Energy — Project Financing',
    amount: 12_000_000,
    amountFormatted: '$12,000,000',
    counterparties: 'Cascade Energy · Greenfield Bank',
    status: 'SUBMITTED',
    description:
      'Project financing for a 50MW solar installation. ' +
      'Awaiting bank credit committee review.',
    parties: [
      { id: 'p-7-1', name: 'Aiden Wright', role: 'Project Lead', email: 'aiden@cascade.energy' },
      { id: 'p-7-2', name: 'Sofia Mendez', role: 'Bank Liaison', email: 'sofia@greenfield.bank' },
    ],
    documents: [
      { id: 'd-7-1', name: 'Project Proposal', type: 'PDF', size: '12.4 MB', uploadedAt: '2026-08-20T11:00:00Z' },
      { id: 'd-7-2', name: 'Financial Model', type: 'XLSX', size: '2.1 MB', uploadedAt: '2026-08-20T11:10:00Z' },
    ],
    events: [
      { id: 'e-7-1', type: 'created', label: 'Deal Created', timestamp: '2026-08-18T10:00:00Z' },
      { id: 'e-7-2', type: 'submitted', label: 'Submitted to Bank', timestamp: '2026-08-22T15:00:00Z' },
    ],
    createdAt: '2026-08-18T10:00:00Z',
    updatedAt: '2026-08-22T15:00:00Z',
    dealType: 'Project Finance',
    source: 'Direct',
  },
];

// ---------------------------------------------------------------------------
// Mock state machine — mirrors backend DealStateMachine
// ---------------------------------------------------------------------------

/** A mock transition mirrors the backend's DEAL_TRANSITIONS for simulation. */
interface MockTransition {
  action: DealAction;
  from: DealStatus;
  to: DealStatus;
  allowedRoles: string[];
}

// IMPORTANT: This must mirror the backend DealStateMachine transitions exactly.
// Adding new transitions here is intentional for demo purposes.
const MOCK_TRANSITIONS: MockTransition[] = [
  { action: 'SUBMIT_FOR_ACCEPTANCE', from: 'DRAFT', to: 'PENDING_ACCEPTANCE', allowedRoles: ['BRAND', 'ADMIN'] },
  { action: 'ACCEPT', from: 'PENDING_ACCEPTANCE', to: 'ACCEPTED', allowedRoles: ['CREATOR'] },
  { action: 'DECLINE', from: 'PENDING_ACCEPTANCE', to: 'DECLINED', allowedRoles: ['CREATOR'] },
  { action: 'CANCEL', from: 'DRAFT', to: 'CANCELLED', allowedRoles: ['BRAND', 'ADMIN'] },
  { action: 'CANCEL', from: 'PENDING_ACCEPTANCE', to: 'CANCELLED', allowedRoles: ['BRAND', 'ADMIN'] },
  { action: 'FUND', from: 'ACCEPTED', to: 'FUNDED', allowedRoles: ['BRAND', 'ADMIN'] },
  { action: 'START', from: 'FUNDED', to: 'IN_PROGRESS', allowedRoles: ['BRAND', 'CREATOR', 'ADMIN'] },
  { action: 'SUBMIT_DELIVERABLE', from: 'IN_PROGRESS', to: 'SUBMITTED', allowedRoles: ['CREATOR'] },
  { action: 'APPROVE', from: 'SUBMITTED', to: 'APPROVED', allowedRoles: ['BRAND', 'ADMIN'] },
  { action: 'REQUEST_REVISION', from: 'SUBMITTED', to: 'REVISION_REQUESTED', allowedRoles: ['BRAND', 'ADMIN'] },
  { action: 'RESUBMIT', from: 'REVISION_REQUESTED', to: 'SUBMITTED', allowedRoles: ['CREATOR'] },
  { action: 'RAISE_DISPUTE', from: 'SUBMITTED', to: 'DISPUTED', allowedRoles: ['BRAND', 'ADMIN'] },
  { action: 'RESOLVE', from: 'DISPUTED', to: 'RESOLVED', allowedRoles: ['HRT', 'ADMIN'] },
  { action: 'ACCEPT_RESOLUTION', from: 'RESOLVED', to: 'APPROVED', allowedRoles: ['BRAND', 'ADMIN'] },
  { action: 'REQUEST_REWORK', from: 'RESOLVED', to: 'IN_PROGRESS', allowedRoles: ['CREATOR', 'BRAND', 'ADMIN'] },
  { action: 'RELEASE_PAYMENT', from: 'APPROVED', to: 'COMPLETED', allowedRoles: ['BRAND', 'ADMIN'] },
  { action: 'RELEASE_PAYMENT', from: 'RESOLVED', to: 'COMPLETED', allowedRoles: ['BRAND', 'ADMIN'] },
];

const TERMINAL_STATES: DealStatus[] = ['DECLINED', 'COMPLETED', 'CANCELLED'];

function getMockAvailableActions(status: DealStatus, role: string): DealAction[] {
  if (TERMINAL_STATES.includes(status)) return [];
  return MOCK_TRANSITIONS
    .filter((t) => t.from === status && t.allowedRoles.includes(role))
    .map((t) => t.action);
}

// ---------------------------------------------------------------------------
// Mutable mock state store
// ---------------------------------------------------------------------------

/**
 * In-memory mock data store that tracks deal state changes.
 * State changes persist for the session lifetime.
 * Switching personas with the UserSwitcher updates the "current role" used
 * for authorization in mock mode.
 */
interface MockDealStore {
  status: DealStatus;
  events: DealEvent[];
}

/** Mutable state store keyed by deal id. */
const mockStore: Record<string, MockDealStore> = {};

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function delay<T>(value: T, ms = MOCK_LATENCY_MS): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((now - then) / 1000));

  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} minute${Math.floor(diffSec / 60) !== 1 ? 's' : ''} ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} hour${Math.floor(diffSec / 3600) !== 1 ? 's' : ''} ago`;
  if (diffSec < 86400 * 7) return `${Math.floor(diffSec / 86400)} day${Math.floor(diffSec / 86400) !== 1 ? 's' : ''} ago`;
  if (diffSec < 86400 * 30) return `${Math.floor(diffSec / 86400 / 7)} week${Math.floor(diffSec / 86400 / 7) !== 1 ? 's' : ''} ago`;
  return new Date(iso).toLocaleDateString();
}

function toSummary(deal: Deal): DealSummary {
  return {
    id: deal.id,
    title: deal.title,
    amount: deal.amount,
    amountFormatted: deal.amountFormatted,
    counterparties: deal.counterparties,
    status: deal.status,
    updatedAt: deal.updatedAt,
    updatedAtRelative: relativeTime(deal.updatedAt),
  };
}

/** Get the current user's role from the auth store (mock mode). */
function getMockUserRole(): string {
  try {
    const user = getMockUser();
    return user?.role ?? 'BRAND';
  } catch {
    return 'BRAND';
  }
}

/**
 * Add a new event to the mock store for a deal.
 * Creates the store entry if it doesn't exist.
 */
function addMockEvent(dealId: string, event: Omit<DealEvent, 'id'>): void {
  if (!mockStore[dealId]) {
    // Initialize from the original MOCK_DEALS data if not yet initialized
    const deal = MOCK_DEALS_DATA.find((d) => d.id === dealId);
    if (deal) {
      mockStore[dealId] = {
        status: deal.status,
        events: [...deal.events],
      };
    } else {
      return;
    }
  }
  mockStore[dealId].events.push({
    ...event,
    id: `mock-evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  });
  // NOTE: do not overwrite `status` here. `applyMockTransition` is the
  // single source of truth for status updates. The event label is a
  // human-readable string (e.g. "Deal Accepted"), not a DealStatus code.
}

/** Get current status from mock store (falls back to initial data). */
function getMockDealStatus(dealId: string): DealStatus {
  if (mockStore[dealId]) return mockStore[dealId].status;
  const deal = MOCK_DEALS_DATA.find((d) => d.id === dealId);
  return deal?.status ?? 'DRAFT';
}

/** Get current events from mock store (falls back to initial data). */
function getMockDealEvents(dealId: string): DealEvent[] {
  if (mockStore[dealId]) return mockStore[dealId].events;
  const deal = MOCK_DEALS_DATA.find((d) => d.id === dealId);
  return deal?.events ?? [];
}

/**
 * Apply a state transition in the mock store.
 * Returns the new status or null if the transition is invalid.
 */
function applyMockTransition(dealId: string, action: DealAction): DealStatus | null {
  if (!mockStore[dealId]) {
    const deal = MOCK_DEALS_DATA.find((d) => d.id === dealId);
    if (!deal) return null;
    mockStore[dealId] = {
      status: deal.status,
      events: [...deal.events],
    };
  }

  const current = mockStore[dealId].status;
  const transition = MOCK_TRANSITIONS.find(
    (t) => t.from === current && t.action === action
  );
  if (!transition) return null;

  const role = getMockUserRole();
  if (!transition.allowedRoles.includes(role)) return null;

  const newStatus = transition.to;
  mockStore[dealId].status = newStatus;

  const actionLabelMap: Partial<Record<DealAction, string>> = {
    SUBMIT_FOR_ACCEPTANCE: 'Deal Submitted',
    ACCEPT: 'Deal Accepted',
    DECLINE: 'Deal Declined',
    CANCEL: 'Deal Cancelled',
    FUND: 'Deal Funded',
    START: 'Work Started',
    SUBMIT_DELIVERABLE: 'Deliverable Submitted',
    APPROVE: 'Deliverable Approved',
    REQUEST_REVISION: 'Revision Requested',
    RESUBMIT: 'Deliverable Resubmitted',
    RAISE_DISPUTE: 'Dispute Raised',
    RESOLVE: 'Dispute Resolved',
    ACCEPT_RESOLUTION: 'Resolution Accepted',
    REQUEST_REWORK: 'Rework Requested',
    RELEASE_PAYMENT: 'Payment Released',
  };

  addMockEvent(dealId, {
    type: 'state_change',
    label: actionLabelMap[action] ?? action,
    timestamp: new Date().toISOString(),
  });

  return newStatus;
}

// ---------------------------------------------------------------------------
// List options
// ---------------------------------------------------------------------------

export interface ListDealsOptions {
  /** Filter by status. `undefined` = all. */
  status?: DealStatus;
  /** Free-text search over title + counterparties. */
  search?: string;
}

// ---------------------------------------------------------------------------
// API error handling
// ---------------------------------------------------------------------------

export interface ApiCallResult<T> {
  ok: true;
  data: T;
}

export interface ApiCallError {
  ok: false;
  kind: 'network' | 'auth' | 'forbidden' | 'validation' | 'conflict' | 'not_found' | 'server';
  message: string;
  /** Backend error code, e.g. 'DEAL_001', 'AUTH_011' */
  code?: string;
}

export type ApiResult<T> = ApiCallResult<T> | ApiCallError;

function isBackendErrorResponse(data: unknown): data is { success: false; error: { code: string; message: string } } {
  return typeof data === 'object' && data !== null && 'success' in data && (data as { success: unknown }).success === false;
}

function mapAxiosError(err: AxiosError<unknown>): ApiCallError {
  const status = err.response?.status;
  const body = err.response?.data;

  if (status === 401) {
    return { ok: false, kind: 'auth', message: 'Authentication required. Please sign in.' };
  }
  if (status === 403) {
    const code = isBackendErrorResponse(body) ? body.error.code : undefined;
    return { ok: false, kind: 'forbidden', message: 'You do not have permission to perform this action.', code };
  }
  if (status === 404) {
    return { ok: false, kind: 'not_found', message: 'Resource not found.' };
  }
  if (status === 409) {
    return {
      ok: false,
      kind: 'conflict',
      message: isBackendErrorResponse(body) ? body.error.message : 'The deal was modified by another request. Please reload and try again.',
      code: isBackendErrorResponse(body) ? body.error.code : undefined,
    };
  }
  if (status === 400) {
    const message = isBackendErrorResponse(body) ? body.error.message : err.message;
    const code = isBackendErrorResponse(body) ? body.error.code : undefined;
    // Distinguish validation from state-machine errors
    if (code === 'DEAL_001') {
      return { ok: false, kind: 'validation', message, code };
    }
    return { ok: false, kind: 'validation', message, code };
  }
  if (status && status >= 500) {
    return { ok: false, kind: 'server', message: 'A server error occurred. Please try again later.' };
  }
  return { ok: false, kind: 'network', message: 'Network error. Please check your connection.' };
}

// ---------------------------------------------------------------------------
// dealApi — the public client
// ---------------------------------------------------------------------------

export const dealApi = {
  /**
   * Whether the client is currently serving mock data.
   * Useful for debug overlays and tests.
   */
  isMock(): boolean {
    return USE_MOCK;
  },

  /**
   * Fetch a list of deals (summaries).
   * Resolves with `{ deals, total }`. Throws on error.
   *
   * When USE_MOCK is false, forwards status + search to the backend.
   * When USE_MOCK is true, applies filters locally on the mock dataset.
   */
  async listDeals(options: ListDealsOptions = {}): Promise<DealListResponse> {
    if (USE_MOCK) {
      // Use the live mock store (reflects state transitions performed in this session).
      let deals = MOCK_DEALS_DATA.map((d) => ({
        ...d,
        status: getMockDealStatus(d.id),
        updatedAt: mockStore[d.id]?.events.at(-1)?.timestamp ?? d.updatedAt,
      })).map(toSummary);
      if (options.status) {
        deals = deals.filter((d) => d.status === options.status);
      }
      if (options.search) {
        const q = options.search.toLowerCase();
        deals = deals.filter(
          (d) =>
            d.title.toLowerCase().includes(q) ||
            d.counterparties.toLowerCase().includes(q)
        );
      }
      return delay({ deals, total: deals.length });
    }

    const params: Record<string, string> = {};
    if (options.status) params.status = options.status;
    if (options.search) params.search = options.search;

    const { data } = await getHttpClient().get<{
      success: boolean;
      data: { deals: BackendDeal[] };
    }>('/deals', {
      params,
    });

    const summaries = data.data.deals
      .map(normalizeDealSummary)
      .filter((d): d is DealSummary => d !== null);

    return { deals: summaries, total: summaries.length };
  },

  /**
   * Fetch a single deal by id (full record).
   * Throws if not found.
   */
  async getDeal(id: string): Promise<Deal> {
    if (USE_MOCK) {
      const deal = MOCK_DEALS_DATA.find((d) => d.id === id);
      if (!deal) {
        await delay(null, MOCK_LATENCY_MS);
        throw new Error(`Deal "${id}" not found`);
      }
      // Return a copy with live status from the mock store
      const liveStatus = getMockDealStatus(id);
      return delay({ ...deal, status: liveStatus });
    }

    const { data } = await getHttpClient().get<{
      success: boolean;
      data: { deal: BackendDeal };
    }>(`/deals/${id}`);

    const normalized = normalizeDeal(data.data.deal);
    if (!normalized) throw new Error(`Deal "${id}" not found`);
    const { data: payment } = await getHttpClient().get<{
      data: { fundingStatus: 'NOT_FUNDED' | 'FUNDED' | 'REFUNDED'; paymentId: string | null; paymentStatus: string | null };
    }>(`/deals/${id}/payment-status`);
    // These requests can straddle a funding/refund commit. Never merge
    // different funding snapshots into a seemingly authoritative deal view.
    if (normalized.fundingStatus !== payment.data.fundingStatus ||
        (payment.data.paymentStatus === 'SUCCEEDED' && payment.data.fundingStatus !== 'FUNDED') ||
        (normalized.status === 'ACCEPTED' && payment.data.fundingStatus === 'FUNDED')) {
      throw new Error('Funding changed while loading this deal. Please reload.');
    }
    normalized.fundingStatus = payment.data.fundingStatus;
    normalized.paymentId = payment.data.paymentId;
    normalized.paymentStatus = payment.data.paymentStatus;
    if (['FUNDED', 'IN_PROGRESS'].includes(normalized.status) &&
        (normalized.fundingStatus !== 'FUNDED' || !normalized.paymentId || normalized.paymentStatus !== 'SUCCEEDED')) {
      throw new Error('Funding could not be verified for this deal. Reload or contact support.');
    }
    return normalized;
  },

  /**
   * Fetch the current state of a deal, including available actions for the
   * authenticated actor.
   *
   * Returns null on error (caller should handle gracefully).
   */
  async getDealState(id: string): Promise<ApiResult<BackendDealState>> {
    if (USE_MOCK) {
      const deal = MOCK_DEALS_DATA.find((d) => d.id === id);
      if (!deal) {
        return { ok: false, kind: 'not_found', message: `Deal "${id}" not found` };
      }
      const liveStatus = getMockDealStatus(id);
      const role = getMockUserRole();
      const availableActions = getMockAvailableActions(liveStatus, role);
      return {
        ok: true,
        data: {
          dealId: id,
          status: liveStatus,
          isTerminal: TERMINAL_STATES.includes(liveStatus),
          availableActions,
          brandId: '550e8400-e29b-41d4-a716-446655440001',
          creatorId: null,
        },
      };
    }

    try {
      const { data } = await getHttpClient().get<{
        success: boolean;
        data: { state: BackendDealState };
      }>(`/deals/${id}/state`);
      return { ok: true, data: data.data.state };
    } catch (err) {
      if (axios.isAxiosError(err)) {
        return mapAxiosError(err);
      }
      return { ok: false, kind: 'server', message: 'Unexpected error fetching deal state.' };
    }
  },

  /**
   * Perform a state transition on a deal.
   *
   * The backend validates the transition (state machine + authorization).
   * Returns the updated normalized deal on success.
   * Returns an error result on validation failure, auth failure, or conflict.
   */
  async transitionDeal(
    id: string,
    action: DealAction
  ): Promise<ApiResult<Deal>> {
    if (USE_MOCK) {
      const deal = MOCK_DEALS_DATA.find((d) => d.id === id);
      if (!deal) {
        return delay({ ok: false, kind: 'not_found' as const, message: `Deal "${id}" not found` });
      }
      // Apply the transition to the mock store — validates state + role
      const newStatus = applyMockTransition(id, action);
      if (!newStatus) {
        return delay({
          ok: false,
          kind: 'validation' as const,
          message: `Action '${action}' is not available from the current state, or you do not have permission.`,
        });
      }
      // Return the updated deal with the new status and live events
      return delay({
        ok: true as const,
        data: { ...deal, status: newStatus, events: getMockDealEvents(id) },
      });
    }

    try {
      if (action === 'FUND') {
        await getHttpClient().post(`/deals/${id}/fund`, {});
        return { ok: true, data: await dealApi.getDeal(id) };
      }
      const { data } = await getHttpClient().post<{
        success: boolean;
        data: { deal: BackendDeal };
      }>(
        `/deals/${id}/transition`,
        { action }
      );
      const normalized = normalizeDeal(data.data.deal);
      if (!normalized) {
        return { ok: false, kind: 'server', message: 'Failed to parse deal response.' };
      }
      return { ok: true, data: normalized };
    } catch (err) {
      if (axios.isAxiosError(err)) {
        return mapAxiosError(err);
      }
      return { ok: false, kind: 'server', message: 'Unexpected error performing action.' };
    }
  },

  /**
   * Invite a creator to a deal (DRAFT → PENDING_ACCEPTANCE).
   *
   * Returns the updated deal on success.
   */
  async inviteCreator(
    dealId: string,
    creatorId: string
  ): Promise<ApiResult<Deal>> {
    if (USE_MOCK) {
      const deal = MOCK_DEALS_DATA.find((d) => d.id === dealId);
      if (!deal) {
        return { ok: false, kind: 'not_found', message: `Deal "${dealId}" not found` };
      }
      // For mock mode, invite is simulated by moving DRAFT → PENDING_ACCEPTANCE
      const newStatus = applyMockTransition(dealId, 'SUBMIT_FOR_ACCEPTANCE');
      const liveStatus = newStatus ?? getMockDealStatus(dealId);
      return delay({ ok: true, data: { ...deal, status: liveStatus } });
    }

    try {
      const { data } = await getHttpClient().post<{
        success: boolean;
        data: { deal: BackendDeal };
      }>(
        `/deals/${dealId}/invite`,
        { creatorId }
      );
      const normalized = normalizeDeal(data.data.deal);
      if (!normalized) {
        return { ok: false, kind: 'server', message: 'Failed to parse deal response.' };
      }
      return { ok: true, data: normalized };
    } catch (err) {
      if (axios.isAxiosError(err)) {
        return mapAxiosError(err);
      }
      return { ok: false, kind: 'server', message: 'Unexpected error inviting creator.' };
    }
  },

  /**
   * Fetch the audit history for a deal.
   *
   * Returns null on error (caller should handle gracefully).
   */
  async getDealHistory(id: string): Promise<ApiResult<import('../types/deal').DealEvent[]>> {
    if (USE_MOCK) {
      const deal = MOCK_DEALS_DATA.find((d) => d.id === id);
      if (!deal) {
        return { ok: false, kind: 'not_found', message: `Deal "${id}" not found` };
      }
      return delay({ ok: true, data: getMockDealEvents(id) });
    }

    try {
      const { data } = await getHttpClient().get<{
        success: boolean;
        data: { history: BackendDealHistoryEntry[] };
      }>(`/deals/${id}/history`);

      return {
        ok: true,
        data: data.data.history.map(normalizeHistoryEntry),
      };
    } catch (err) {
      if (axios.isAxiosError(err)) {
        return mapAxiosError(err);
      }
      return { ok: false, kind: 'server', message: 'Unexpected error fetching history.' };
    }
  },
};

export type DealApi = typeof dealApi;
