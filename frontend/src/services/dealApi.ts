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
 */

import axios, { type AxiosInstance } from 'axios';
import type {
  Deal,
  DealListResponse,
  DealResponse,
  DealSummary,
} from '../types/deal';
import type { DealStatus } from '../types/dealStates';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** When true, the client returns mock data. When false, it uses HTTP. */
const USE_MOCK = import.meta.env.VITE_USE_MOCK_DEALS !== 'false';

/** Base URL for the real backend. Only used when USE_MOCK is false. */
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api';

/**
 * Artificial latency for mock responses (ms). Keeps the UI honest about
 * loading states.
 */
const MOCK_LATENCY_MS = 350;

// ---------------------------------------------------------------------------
// HTTP client (only constructed when not using mocks)
// ---------------------------------------------------------------------------

let httpClient: AxiosInstance | null = null;

function getHttpClient(): AxiosInstance {
  if (!httpClient) {
    httpClient = axios.create({
      baseURL: API_BASE_URL,
      timeout: 10_000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
  return httpClient;
}

// ---------------------------------------------------------------------------
// Mock dataset
// ---------------------------------------------------------------------------

const MOCK_DEALS: Deal[] = [
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
// Mock helpers
// ---------------------------------------------------------------------------

function delay<T>(value: T, ms = MOCK_LATENCY_MS): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
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
   */
  async listDeals(options: ListDealsOptions = {}): Promise<DealListResponse> {
    if (USE_MOCK) {
      let deals = MOCK_DEALS.map(toSummary);
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

    const { data } = await getHttpClient().get<DealListResponse>('/deals', {
      params: options,
    });
    return data;
  },

  /**
   * Fetch a single deal by id (full record).
   * Throws if not found.
   */
  async getDeal(id: string): Promise<Deal> {
    if (USE_MOCK) {
      const deal = MOCK_DEALS.find((d) => d.id === id);
      if (!deal) {
        await delay(null, MOCK_LATENCY_MS);
        throw new Error(`Deal "${id}" not found`);
      }
      return delay(deal);
    }

    const { data } = await getHttpClient().get<DealResponse>(`/deals/${id}`);
    return data.deal;
  },
};

export type DealApi = typeof dealApi;
