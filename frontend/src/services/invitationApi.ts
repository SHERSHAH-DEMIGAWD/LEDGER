/** Creator invitations are the backend's pending deals, never a local store. */
import type { BackendInvitation, DealTerms } from '../types/api';
import type { Deal } from '../types/deal';
import type { DealStatus } from '../types/dealStates';
import { getHttpClient } from './httpClient';
import { dealApi, type ApiResult, type ApiCallError, type ApiCallResult } from './dealApi';
import { formatCurrency } from './dealNormalizer';

export interface InvitationSummary {
  id: string;
  title: string;
  description: string;
  amount: number;
  amountFormatted: string;
  currency: string;
  brandId: string;
  brandName: string;
  brandEmail?: string;
  status: DealStatus;
  createdAt: string;
  deliverableCount: number;
  terms: DealTerms;
  termsVersionNumber: number;
}

export type InvitationCallResult<T> = ApiCallResult<T>;
export type InvitationCallError = ApiCallError;
export type InvitationResult<T> = ApiResult<T>;

function normalizeInvitation(inv: BackendInvitation): InvitationSummary {
  const amount = inv.terms.paymentAmount / 100;
  return {
    id: inv.id,
    title: inv.terms.title,
    description: inv.terms.description,
    amount,
    amountFormatted: formatCurrency(amount, inv.terms.currency),
    currency: inv.terms.currency,
    brandId: inv.brandId,
    brandName: inv.brand?.name || inv.brand?.email || 'Brand',
    brandEmail: inv.brand?.email,
    status: inv.status,
    createdAt: new Date(inv.createdAt).toISOString(),
    deliverableCount: inv.terms.deliverables.length,
    terms: inv.terms,
    termsVersionNumber: inv.latestVersionNumber,
  };
}

export const invitationApi = {
  isMock(): boolean {
    return false;
  },

  async listInvitations(): Promise<InvitationSummary[]> {
    const { data } = await getHttpClient().get<{
      success: boolean; data: { invitations: BackendInvitation[] };
    }>('/invitations');
    return data.data.invitations.map(normalizeInvitation);
  },

  async acceptInvitation(id: string): Promise<InvitationResult<Deal>> {
    return dealApi.transitionDeal(id, 'ACCEPT');
  },

  async declineInvitation(id: string): Promise<InvitationResult<Deal>> {
    return dealApi.transitionDeal(id, 'DECLINE');
  },
};

export type InvitationApi = typeof invitationApi;
