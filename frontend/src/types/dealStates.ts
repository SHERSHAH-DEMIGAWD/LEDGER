// Deal state definitions for frontend UI
// Generated from PRODUCT_RULES.md and ARCHITECTURE.md
// All transitions are handled server-side - this is purely presentational

export type DealStatus =
  | 'DRAFT'
  | 'PENDING_ACCEPTANCE'
  | 'ACCEPTED'
  | 'DECLINED'
  | 'FUNDED'
  | 'IN_PROGRESS'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'REVISION_REQUESTED'
  | 'DISPUTED'
  | 'RESOLVED'
  | 'COMPLETED'
  | 'CANCELLED';

export interface DealStateConfig {
  value: DealStatus;
  label: string;
  /** CSS variable name for text color, e.g., '--color-status-draft' */
  colorVar: string;
  /** CSS variable name for background color, e.g., '--color-status-draft-bg' */
  bgVar: string;
  /** Display order for timeline/steppers */
  order: number;
  /** Terminal states (no forward transitions) */
  isTerminal: boolean;
}

export const DEAL_STATES: Record<DealStatus, DealStateConfig> = {
  DRAFT: {
    value: 'DRAFT',
    label: 'Draft',
    colorVar: '--color-status-draft',
    bgVar: '--color-status-draft-bg',
    order: 0,
    isTerminal: false,
  },
  PENDING_ACCEPTANCE: {
    value: 'PENDING_ACCEPTANCE',
    label: 'Pending Acceptance',
    colorVar: '--color-status-pending-acceptance',
    bgVar: '--color-status-pending-acceptance-bg',
    order: 1,
    isTerminal: false,
  },
  ACCEPTED: {
    value: 'ACCEPTED',
    label: 'Accepted',
    colorVar: '--color-status-accepted',
    bgVar: '--color-status-accepted-bg',
    order: 2,
    isTerminal: false,
  },
  DECLINED: {
    value: 'DECLINED',
    label: 'Declined',
    colorVar: '--color-status-declined',
    bgVar: '--color-status-declined-bg',
    order: 3,
    isTerminal: true,
  },
  FUNDED: {
    value: 'FUNDED',
    label: 'Funded',
    colorVar: '--color-status-funded',
    bgVar: '--color-status-funded-bg',
    order: 4,
    isTerminal: false,
  },
  IN_PROGRESS: {
    value: 'IN_PROGRESS',
    label: 'In Progress',
    colorVar: '--color-status-in-progress',
    bgVar: '--color-status-in-progress-bg',
    order: 5,
    isTerminal: false,
  },
  SUBMITTED: {
    value: 'SUBMITTED',
    label: 'Submitted',
    colorVar: '--color-status-submitted',
    bgVar: '--color-status-submitted-bg',
    order: 6,
    isTerminal: false,
  },
  APPROVED: {
    value: 'APPROVED',
    label: 'Approved',
    colorVar: '--color-status-approved',
    bgVar: '--color-status-approved-bg',
    order: 7,
    isTerminal: false,
  },
  REVISION_REQUESTED: {
    value: 'REVISION_REQUESTED',
    label: 'Revision Requested',
    colorVar: '--color-status-revision-requested',
    bgVar: '--color-status-revision-requested-bg',
    order: 8,
    isTerminal: false,
  },
  DISPUTED: {
    value: 'DISPUTED',
    label: 'Disputed',
    colorVar: '--color-status-disputed',
    bgVar: '--color-status-disputed-bg',
    order: 9,
    isTerminal: false,
  },
  RESOLVED: {
    value: 'RESOLVED',
    label: 'Resolved',
    colorVar: '--color-status-resolved',
    bgVar: '--color-status-resolved-bg',
    order: 10,
    isTerminal: false,
  },
  COMPLETED: {
    value: 'COMPLETED',
    label: 'Completed',
    colorVar: '--color-status-completed',
    bgVar: '--color-status-completed-bg',
    order: 11,
    isTerminal: true,
  },
  CANCELLED: {
    value: 'CANCELLED',
    label: 'Cancelled',
    colorVar: '--color-status-cancelled',
    bgVar: '--color-status-cancelled-bg',
    order: 12,
    isTerminal: true,
  },
};

export const DEAL_STATE_ORDER: DealStatus[] = Object.values(DEAL_STATES)
  .sort((a, b) => a.order - b.order)
  .map(state => state.value);

export function getDealStateConfig(status: DealStatus): DealStateConfig {
  return DEAL_STATES[status];
}

export function getDealStateLabel(status: DealStatus): string {
  return DEAL_STATES[status]?.label || status;
}

export function getDealStateColorVar(status: DealStatus): string {
  return DEAL_STATES[status]?.colorVar || '--color-text-muted';
}

export function getDealStateBgVar(status: DealStatus): string {
  return DEAL_STATES[status]?.bgVar || 'rgba(79, 79, 99, 0.10)';
}