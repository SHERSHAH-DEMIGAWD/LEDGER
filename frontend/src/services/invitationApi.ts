/**
 * services/invitationApi.ts
 *
 * API client for the invitation workflow.
 *
 * Endpoints:
 *   GET /invitations  — list pending invitations for the current creator
 *
 * This is used alongside dealApi.ts. The invitation flow is a separate
 * resource but shares the same backend base URL and auth token.
 *
 * Mock data is used when VITE_USE_MOCK_DEALS !== 'false'.
 */

import axios, { type AxiosInstance } from 'axios';
import type { BackendInvitation } from '../types/api';
import { getAccessToken } from './auth';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** When true, the client returns mock data. When false, it uses HTTP. */
const USE_MOCK = import.meta.env.VITE_USE_MOCK_DEALS !== 'false';

/** Base URL for the real backend. Only used when USE_MOCK is false. */
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api';

const MOCK_LATENCY_MS = 300;

// ---------------------------------------------------------------------------
// HTTP client
// ---------------------------------------------------------------------------

let httpClient: AxiosInstance | null = null;

function getHttpClient(): AxiosInstance {
  if (!httpClient) {
    httpClient = axios.create({
      baseURL: API_BASE_URL,
      timeout: 10_000,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return httpClient;
}

function authHeaders(): Record<string, string> {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ---------------------------------------------------------------------------
// Mock invitations
// ---------------------------------------------------------------------------

const MOCK_INVITATIONS: BackendInvitation[] = [
  {
    id: 'inv-1',
    status: 'PENDING_ACCEPTANCE',
    createdAt: '2026-08-28T10:00:00Z',
    updatedAt: '2026-08-28T10:00:00Z',
    brandId: 'brand-abc',
    terms: {
      title: 'Brand Studio — Content Collaboration',
      description:
        'Create a series of brand assets for our Q4 marketing campaign. ' +
        'Includes social media content, blog posts, and video scripts.',
      deliverables: [
        {
          title: 'Social Media Content Pack',
          description: '12 posts across Instagram, Twitter, LinkedIn',
        },
        {
          title: 'Blog Article Series',
          description: '4 long-form articles, 1,500+ words each',
        },
      ],
      paymentAmount: 500000,
      currency: 'USD',
    },
    latestVersionNumber: 1,
  },
  {
    id: 'inv-2',
    status: 'PENDING_ACCEPTANCE',
    createdAt: '2026-08-25T09:30:00Z',
    updatedAt: '2026-08-25T09:30:00Z',
    brandId: 'brand-xyz',
    terms: {
      title: 'TechFlow — Product Launch Video',
      description:
        'Produce a 90-second product launch video for our SaaS platform. ' +
        'Includes script, filming, and post-production.',
      deliverables: [
        {
          title: 'Final Video (90s)',
          description: '4K, broadcast-ready with captions and music',
          deadline: '2026-10-15',
        },
        {
          title: 'Behind-the-Scenes Cut',
          description: '15s vertical format for social media',
        },
      ],
      paymentAmount: 850000,
      currency: 'USD',
    },
    latestVersionNumber: 1,
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface InvitationSummary {
  id: string;
  title: string;
  description: string;
  amount: number;
  amountFormatted: string;
  currency: string;
  brandId: string;
  status: string;
  createdAt: string;
  deliverableCount: number;
}

function normalizeInvitation(inv: BackendInvitation): InvitationSummary {
  const amount = inv.terms.paymentAmount / 100;
  let amountFormatted: string;
  try {
    amountFormatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: inv.terms.currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    amountFormatted = `${inv.terms.currency} ${amount.toLocaleString()}`;
  }

  return {
    id: inv.id,
    title: inv.terms.title,
    description: inv.terms.description,
    amount,
    amountFormatted,
    currency: inv.terms.currency,
    brandId: inv.brandId,
    status: inv.status,
    createdAt: new Date(inv.createdAt).toISOString(),
    deliverableCount: inv.terms.deliverables.length,
  };
}

function delay<T>(value: T, ms = MOCK_LATENCY_MS): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

export const invitationApi = {
  /**
   * Whether the client is currently serving mock data.
   */
  isMock(): boolean {
    return USE_MOCK;
  },

  /**
   * List pending invitations for the current creator.
   */
  async listInvitations(): Promise<InvitationSummary[]> {
    if (USE_MOCK) {
      return delay(MOCK_INVITATIONS.map(normalizeInvitation));
    }

    const { data } = await getHttpClient().get<{
      success: boolean;
      data: { invitations: BackendInvitation[] };
    }>('/invitations', { headers: authHeaders() });

    return data.data.invitations.map(normalizeInvitation);
  },
};

export type InvitationApi = typeof invitationApi;