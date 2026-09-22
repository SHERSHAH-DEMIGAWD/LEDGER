/** The backend is the sole source of deal, invitation and payment state. */
import axios, { type AxiosError } from 'axios';
import type { Deal, DealListResponse, DealSummary, DealEvent } from '../types/deal';
import type {
  BackendDeal, BackendDealState, BackendDealHistoryEntry,
  DealAction, DealTerms, InviteCreatorRequest, DealActionInput,
} from '../types/api';
import type { DealStatus } from '../types/dealStates';
import { normalizeDeal, normalizeDealSummary, normalizeHistoryEntry } from './dealNormalizer';
import { getHttpClient } from './httpClient';

export interface ListDealsOptions {
  status?: DealStatus;
  search?: string;
}

export interface ApiCallResult<T> {
  ok: true;
  data: T;
}

export interface ApiCallError {
  ok: false;
  kind: 'network' | 'auth' | 'forbidden' | 'validation' | 'conflict' | 'not_found' | 'server';
  message: string;
  code?: string;
}

export type ApiResult<T> = ApiCallResult<T> | ApiCallError;

function isBackendErrorResponse(data: unknown): data is { success: false; error: { code: string; message: string } } {
  if (typeof data !== 'object' || data === null || !('success' in data) || data.success !== false || !('error' in data)) return false;
  const error = data.error;
  return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' && 'message' in error && typeof error.message === 'string';
}

function mapAxiosError(err: AxiosError<unknown>): ApiCallError {
  const status = err.response?.status;
  const body = err.response?.data;
  const code = isBackendErrorResponse(body) ? body.error.code : undefined;
  const message = isBackendErrorResponse(body) ? body.error.message : undefined;
  if (status === 401) return { ok: false, kind: 'auth', message: 'Authentication required. Please sign in.', code };
  if (status === 403) return { ok: false, kind: 'forbidden', message: 'You do not have permission to perform this action.', code };
  if (status === 404) return { ok: false, kind: 'not_found', message: message ?? 'Resource not found.', code };
  if (status === 409) return {
    ok: false, kind: 'conflict', code,
    message: message ?? 'The deal changed. Reload its current state before trying again.',
  };
  if (status === 400) return { ok: false, kind: 'validation', message: message ?? err.message, code };
  if (status && status >= 500) return { ok: false, kind: 'server', message: 'A server error occurred. Please try again later.', code };
  return { ok: false, kind: 'network', message: 'Network error. Please check your connection.' };
}

function failure(err: unknown, fallback: string): ApiCallError {
  if (axios.isAxiosError(err)) return mapAxiosError(err);
  return { ok: false, kind: 'server', message: err instanceof Error ? err.message : fallback };
}

function requireDeal(deal: BackendDeal): Deal {
  const normalized = normalizeDeal(deal);
  if (!normalized) throw new Error('Current deal terms could not be verified. Please reload.');
  return normalized;
}

export const dealApi = {
  /** Kept for existing development indicators; transactions always use HTTP. */
  isMock(): boolean {
    return false;
  },

  async listDeals(options: ListDealsOptions = {}): Promise<DealListResponse> {
    const params: Record<string, string> = {};
    if (options.status) params.status = options.status;
    const { data } = await getHttpClient().get<{
      success: boolean; data: { deals: BackendDeal[] };
    }>('/deals', { params });
    let summaries = data.data.deals.map(normalizeDealSummary).filter((deal): deal is DealSummary => deal !== null);
    // The API supports status filtering, but no text-search parameter.
    if (options.search?.trim()) {
      const query = options.search.trim().toLowerCase();
      summaries = summaries.filter((deal) => deal.title.toLowerCase().includes(query) || deal.counterparties.toLowerCase().includes(query));
    }
    return { deals: summaries, total: summaries.length };
  },

  async createDeal(terms: DealTerms): Promise<ApiResult<Deal>> {
    try {
      const { data } = await getHttpClient().post<{
        success: boolean; data: { deal: BackendDeal };
      }>('/deals', { terms });
      return { ok: true, data: requireDeal(data.data.deal) };
    } catch (err) {
      return failure(err, 'Unexpected error creating deal.');
    }
  },

  async getDeal(id: string): Promise<Deal> {
    const path = `/deals/${encodeURIComponent(id)}`;
    const { data } = await getHttpClient().get<{
      success: boolean; data: { deal: BackendDeal };
    }>(path);
    const normalized = requireDeal(data.data.deal);
    const { data: payment } = await getHttpClient().get<{
      data: { fundingStatus: 'NOT_FUNDED' | 'FUNDED' | 'REFUNDED'; paymentId: string | null; paymentStatus: string | null };
    }>(`${path}/payment-status`);
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
    if (['FUNDED', 'IN_PROGRESS', 'SUBMITTED', 'REVISION_REQUESTED', 'APPROVED', 'DISPUTED', 'RESOLVED', 'COMPLETED'].includes(normalized.status) &&
        (normalized.fundingStatus !== 'FUNDED' || !normalized.paymentId || normalized.paymentStatus !== 'SUCCEEDED')) {
      throw new Error('Funding could not be verified for this deal. Reload or contact support.');
    }
    return normalized;
  },

  async getDealState(id: string): Promise<ApiResult<BackendDealState>> {
    try {
      const { data } = await getHttpClient().get<{
        success: boolean; data: { state: BackendDealState };
      }>(`/deals/${encodeURIComponent(id)}/state`);
      return { ok: true, data: data.data.state };
    } catch (err) {
      return failure(err, 'Unexpected error fetching deal state.');
    }
  },

  async transitionDeal(id: string, action: DealAction, input: DealActionInput = {}): Promise<ApiResult<Deal>> {
    try {
      const encodedId = encodeURIComponent(id);
      const deliveryEndpoints: Partial<Record<DealAction, string>> = {
        SUBMIT_DELIVERABLE: 'submit', REQUEST_REVISION: 'request-revision',
        RESUBMIT: 'resubmit', APPROVE: 'approve', RELEASE_PAYMENT: 'complete',
        RAISE_DISPUTE: 'dispute', RESOLVE: 'resolve',
      };
      const delivery = action in deliveryEndpoints || action === 'ACCEPT_RESOLUTION' || action === 'REQUEST_REWORK';
      const endpoint = deliveryEndpoints[action];
      // RESOLVED supports direct completion through the existing state-machine
      // route; the dedicated /complete endpoint accepts APPROVED only.
      if (endpoint && !(action === 'RELEASE_PAYMENT' && input.fromStatus === 'RESOLVED')) {
        const supportsNote = ['SUBMIT_DELIVERABLE', 'REQUEST_REVISION', 'RAISE_DISPUTE', 'RESOLVE'].includes(action);
        await getHttpClient().post(`/deals/${encodedId}/${endpoint}`, supportsNote && input.note !== undefined ? { note: input.note } : {});
      } else if (action === 'FUND') {
        await getHttpClient().post(`/deals/${encodedId}/fund`, {});
      } else if (action === 'ACCEPT' || action === 'DECLINE') {
        await getHttpClient().post(`/invitations/${encodedId}/${action.toLowerCase()}`, {});
      } else {
        await getHttpClient().post(`/deals/${encodedId}/transition`, { action });
      }
      // Re-read the current deal and verified payment snapshot after every
      // mutation, including an acceptance that may immediately be funded.
      const deal = await dealApi.getDeal(id);
      if (delivery) {
        // Do not announce success using a torn deal/payment/action snapshot.
        const state = await dealApi.getDealState(id);
        if (!state.ok) return state;
        if (state.data.dealId !== deal.id || state.data.status !== deal.status ||
            new Date(state.data.updatedAt).getTime() !== new Date(deal.updatedAt).getTime() ||
            (state.data.isTerminal && state.data.availableActions.length > 0)) {
          throw new Error('The deal changed while verifying the update. Refresh status before continuing.');
        }
      }
      return { ok: true, data: deal };
    } catch (err) {
      return failure(err, 'Unexpected error performing action.');
    }
  },

  async inviteCreator(dealId: string, target: InviteCreatorRequest): Promise<ApiResult<Deal>> {
    try {
      const { data } = await getHttpClient().post<{
        success: boolean; data: { deal: BackendDeal };
      }>(`/deals/${encodeURIComponent(dealId)}/invite`, target);
      return { ok: true, data: requireDeal(data.data.deal) };
    } catch (err) {
      return failure(err, 'Unexpected error inviting creator.');
    }
  },

  async proposeTerms(id: string, terms: DealTerms): Promise<ApiResult<Deal>> {
    try {
      await getHttpClient().post(`/deals/${encodeURIComponent(id)}/terms/propose`, { terms });
      return { ok: true, data: await dealApi.getDeal(id) };
    } catch (err) {
      return failure(err, 'Unable to propose revised terms.');
    }
  },

  async acceptProposal(id: string): Promise<ApiResult<Deal>> {
    try {
      await getHttpClient().post(`/deals/${encodeURIComponent(id)}/terms/accept`, {});
      return { ok: true, data: await dealApi.getDeal(id) };
    } catch (err) {
      return failure(err, 'Unable to accept the proposed terms.');
    }
  },

  async rejectProposal(id: string): Promise<ApiResult<Deal>> {
    try {
      await getHttpClient().post(`/deals/${encodeURIComponent(id)}/terms/reject`, {});
      return { ok: true, data: await dealApi.getDeal(id) };
    } catch (err) {
      return failure(err, 'Unable to reject the proposed terms.');
    }
  },

  async getDealHistory(id: string): Promise<ApiResult<DealEvent[]>> {
    try {
      const { data } = await getHttpClient().get<{
        success: boolean; data: { history: BackendDealHistoryEntry[] };
      }>(`/deals/${encodeURIComponent(id)}/history`);
      return { ok: true, data: data.data.history.map(normalizeHistoryEntry) };
    } catch (err) {
      return failure(err, 'Unexpected error fetching history.');
    }
  },
};

export type DealApi = typeof dealApi;
