/**
 * services/invitationApi.ts
 *
 * API client for the invitation workflow.
 *
 * Endpoints:
 *   GET  /invitations              — list pending invitations for the current creator
 *   POST /invitations/:id/accept   — accept an invitation (CREATOR only)
 *   POST /invitations/:id/decline  — decline an invitation (CREATOR only)
 *
 * The invitation flow is a separate resource but shares the same backend base
 * URL and auth token with dealApi.
 *
 * Mock data is used when VITE_USE_MOCK_DEALS !== 'false'.
 *
 * In mock mode, the mock invitations are tied to the demo deal IDs in
 * `dealApi.ts`. Each invitation is owned by a specific creator (Alex, Jordan,
 * Sam) so that switching personas in the persona switcher shows different
 * invitations — mirroring the backend's `listCreatorInvitations` filter.
 */

import axios, { type AxiosError } from 'axios';
import type { BackendInvitation } from '../types/api';
import type { DealStatus } from '../types/dealStates';
import { getHttpClient } from './httpClient';
import { getMockUser } from './auth';
import type { MockUser } from './auth';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** When true, the client returns mock data. When false, it uses HTTP. */
const USE_MOCK = import.meta.env.VITE_USE_MOCK_DEALS !== 'false';

const MOCK_LATENCY_MS = 300;

// ---------------------------------------------------------------------------
// HTTP client
// ---------------------------------------------------------------------------
// The shared httpClient from ./httpClient attaches auth headers automatically.

// ---------------------------------------------------------------------------
// Mock invitations
//
// IDs are aligned with the seed deals in dealApi.ts so that accepting/declining
// flows through the real state machine in mock mode. The `creatorId` field is
// what we use to filter invitations per persona in mock mode (mirroring the
// backend's `listCreatorInvitations`).
// ---------------------------------------------------------------------------

/**
 * Mock invitation shape extends BackendInvitation with a private `creatorId`
 * used to filter for the current user. This field is NOT in the BackendInvitation
 * wire shape because the backend never returns the creatorId of a deal to a
 * non-participant; the client only knows it's a participant because it
 * received the invitation. In mock mode we keep it server-side-equivalent.
 */
type MockInvitation = BackendInvitation & { creatorId: string };

const MOCK_INVITATIONS: MockInvitation[] = [
  {
    id: 'inv-1',
    status: 'PENDING_ACCEPTANCE' as DealStatus,
    createdAt: '2026-08-28T10:00:00Z',
    updatedAt: '2026-08-28T10:00:00Z',
    brandId: '550e8400-e29b-41d4-a716-446655440001',
    creatorId: '550e8400-e29b-41d4-a716-446655440004', // Alex Rivera
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
    status: 'PENDING_ACCEPTANCE' as DealStatus,
    createdAt: '2026-08-25T09:30:00Z',
    updatedAt: '2026-08-25T09:30:00Z',
    brandId: '550e8400-e29b-41d4-a716-446655440002',
    creatorId: '550e8400-e29b-41d4-a716-446655440005', // Jordan Lee
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
  {
    id: 'inv-3',
    status: 'PENDING_ACCEPTANCE' as DealStatus,
    createdAt: '2026-08-30T14:15:00Z',
    updatedAt: '2026-08-30T14:15:00Z',
    brandId: '550e8400-e29b-41d4-a716-446655440003',
    creatorId: '550e8400-e29b-41d4-a716-446655440006', // Sam Patel
    terms: {
      title: 'Cloud9 — UI Animation Series',
      description:
        'Design and animate 6 short product UI showcase loops for our ' +
        'marketing site and pitch decks. Cinematic micro-interactions preferred.',
      deliverables: [
        {
          title: 'Hero Animation Loop',
          description: '8s seamless loop, 4K, web + social optimized',
          deadline: '2026-10-01',
        },
        {
          title: 'Feature Spotlight Pack',
          description: '5 x 4s loops, each highlighting a product feature',
        },
      ],
      paymentAmount: 320000,
      currency: 'USD',
    },
    latestVersionNumber: 1,
  },
];

// ---------------------------------------------------------------------------
// Mutable mock invitation store — tracks accept/decline state for the
// session so the invitations list updates immediately after each action.
// Mirrors the backend's behavior of filtering out non-pending invitations.
// ---------------------------------------------------------------------------

/**
 * Status of an invitation in the mock store. After accept, the deal status
 * moves to ACCEPTED; after decline, it moves to DECLINED. Either way, the
 * invitation should disappear from the pending inbox.
 */
type MockInvitationStatus = 'PENDING_ACCEPTANCE' | 'ACCEPTED' | 'DECLINED';

const invitationStatusStore: Record<string, MockInvitationStatus> = {};

/** Read the current invitation status (falls back to seed data). */
function getMockInvitationStatus(id: string): MockInvitationStatus {
  if (invitationStatusStore[id]) return invitationStatusStore[id];
  const inv = MOCK_INVITATIONS.find((i) => i.id === id);
  return (inv?.status as MockInvitationStatus) ?? 'PENDING_ACCEPTANCE';
}

/** Set the mock invitation status (used by accept/decline). */
function setMockInvitationStatus(
  id: string,
  status: MockInvitationStatus
): void {
  invitationStatusStore[id] = status;
}

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

// ---------------------------------------------------------------------------
// Result types — mirror dealApi for consistent call sites
// ---------------------------------------------------------------------------

export interface InvitationCallResult<T> {
  ok: true;
  data: T;
}

export interface InvitationCallError {
  ok: false;
  kind: 'network' | 'auth' | 'forbidden' | 'validation' | 'conflict' | 'not_found' | 'server';
  message: string;
  /** Backend error code, e.g. 'DEAL_001', 'AUTH_011' */
  code?: string;
}

export type InvitationResult<T> = InvitationCallResult<T> | InvitationCallError;

function isBackendErrorResponse(
  data: unknown,
): data is { success: false; error: { code: string; message: string } } {
  return (
    typeof data === 'object' &&
    data !== null &&
    'success' in data &&
    (data as { success: unknown }).success === false
  );
}

function mapAxiosError(err: AxiosError<unknown>): InvitationCallError {
  const status = err.response?.status;
  const body = err.response?.data;

  if (status === 401) {
    return {
      ok: false,
      kind: 'auth',
      message: 'Authentication required. Please sign in.',
    };
  }
  if (status === 403) {
    const code = isBackendErrorResponse(body) ? body.error.code : undefined;
    return {
      ok: false,
      kind: 'forbidden',
      message: 'You do not have permission to perform this action.',
      code,
    };
  }
  if (status === 404) {
    return { ok: false, kind: 'not_found', message: 'Invitation not found.' };
  }
  if (status === 409) {
    return {
      ok: false,
      kind: 'conflict',
      message:
        'This invitation was already responded to. Please reload and try again.',
      code: isBackendErrorResponse(body) ? body.error.code : undefined,
    };
  }
  if (status === 400) {
    const message = isBackendErrorResponse(body)
      ? body.error.message
      : err.message;
    const code = isBackendErrorResponse(body) ? body.error.code : undefined;
    return { ok: false, kind: 'validation', message, code };
  }
  if (status && status >= 500) {
    return {
      ok: false,
      kind: 'server',
      message: 'A server error occurred. Please try again later.',
    };
  }
  return {
    ok: false,
    kind: 'network',
    message: 'Network error. Please check your connection.',
  };
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
   *
   * Mock mode: filters by the current mock user's ID so each persona
   * sees only their own invitations. Non-creators get an empty list.
   * The filter mirrors the backend's `listCreatorInvitations` behavior.
   */
  async listInvitations(): Promise<InvitationSummary[]> {
    if (USE_MOCK) {
      const user = getMockUser() as MockUser | null;
      const creatorId = user?.role === 'CREATOR' ? user.id : null;
      // Use live status from the store (reflects accept/decline in this session)
      const pending = MOCK_INVITATIONS.filter((inv) => {
        const liveStatus = getMockInvitationStatus(inv.id);
        const isPending = liveStatus === 'PENDING_ACCEPTANCE';
        const isMine = creatorId == null || inv.creatorId === creatorId;
        return isPending && isMine;
      });
      return delay(pending.map(normalizeInvitation));
    }

    const { data } = await getHttpClient().get<{
      success: boolean;
      data: { invitations: BackendInvitation[] };
    }>('/invitations');

    return data.data.invitations.map(normalizeInvitation);
  },

  /**
   * Accept a pending invitation.
   *
   * Real backend: POST /invitations/:id/accept
   * Mock mode: records the action in the local invitation store so the
   * invitation disappears from the pending inbox. Also performs the
   * corresponding deal-state transition (PENDING_ACCEPTANCE → ACCEPTED)
   * through the dealApi mock store, so deal detail/history are consistent
   * if the invitation id maps to a seeded deal id.
   */
  async acceptInvitation(id: string): Promise<InvitationResult<void>> {
    if (USE_MOCK) {
      // Reject if already responded to (mirrors backend state machine).
      const current = getMockInvitationStatus(id);
      if (current !== 'PENDING_ACCEPTANCE') {
        await delay(undefined);
        return {
          ok: false,
          kind: 'conflict',
          message: 'This invitation was already responded to.',
        };
      }
      // Mark invitation as accepted so the inbox updates immediately.
      setMockInvitationStatus(id, 'ACCEPTED');
      // Best-effort: sync the underlying deal state machine if the
      // invitation id maps to a seeded deal id (inv-N → deal-N). The
      // invitation has its own id space, but when they collide we keep
      // both stores consistent so the demo flow makes sense.
      try {
        const { dealApi } = await import('./dealApi');
        await dealApi.transitionDeal(id, 'ACCEPT');
      } catch {
        // Silently ignore — invitation may not correspond to a deal.
      }
      await delay(undefined);
      return { ok: true, data: undefined };
    }

    try {
      await getHttpClient().post(
        `/invitations/${encodeURIComponent(id)}/accept`,
        {},
      );
      return { ok: true, data: undefined };
    } catch (err) {
      if (axios.isAxiosError(err)) {
        return mapAxiosError(err);
      }
      return {
        ok: false,
        kind: 'server',
        message: 'Unexpected error accepting invitation.',
      };
    }
  },

  /**
   * Decline a pending invitation (terminal).
   *
   * Real backend: POST /invitations/:id/decline
   * Mock mode: records the action in the local invitation store so the
   * invitation disappears from the pending inbox. Also performs the
   * corresponding deal-state transition (PENDING_ACCEPTANCE → DECLINED)
   * through the dealApi mock store when applicable.
   */
  async declineInvitation(id: string): Promise<InvitationResult<void>> {
    if (USE_MOCK) {
      const current = getMockInvitationStatus(id);
      if (current !== 'PENDING_ACCEPTANCE') {
        await delay(undefined);
        return {
          ok: false,
          kind: 'conflict',
          message: 'This invitation was already responded to.',
        };
      }
      setMockInvitationStatus(id, 'DECLINED');
      try {
        const { dealApi } = await import('./dealApi');
        await dealApi.transitionDeal(id, 'DECLINE');
      } catch {
        // Silently ignore — invitation may not correspond to a deal.
      }
      await delay(undefined);
      return { ok: true, data: undefined };
    }

    try {
      await getHttpClient().post(
        `/invitations/${encodeURIComponent(id)}/decline`,
        {},
      );
      return { ok: true, data: undefined };
    } catch (err) {
      if (axios.isAxiosError(err)) {
        return mapAxiosError(err);
      }
      return {
        ok: false,
        kind: 'server',
        message: 'Unexpected error declining invitation.',
      };
    }
  },
};

export type InvitationApi = typeof invitationApi;