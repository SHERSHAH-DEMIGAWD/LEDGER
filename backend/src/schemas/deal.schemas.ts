import { z } from 'zod';
import type { DealAction } from '../domain/state-machine/DealStateMachine.js';

// ---------------------------------------------------------------------------------------
// Deal Terms
// ---------------------------------------------------------------------------------------

const deliverableSchema = z.object({
  title: z.string().min(1, 'Deliverable title is required').max(255),
  description: z.string().min(1, 'Deliverable description is required'),
  deadline: z.string().optional(),
});

export const dealTermsSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255, 'Title must be 255 characters or less'),
  description: z.string().min(1, 'Description is required'),
  deliverables: z
    .array(deliverableSchema)
    .min(1, 'At least one deliverable is required'),
  paymentAmount: z
    .number()
    .int('Payment amount must be an integer (in cents)')
    .min(0, 'Payment amount cannot be negative')
    .max(1_000_000_00, 'Payment amount exceeds maximum allowed value'),
  currency: z.string().regex(/^[A-Z]{3}$/, 'Currency must be a valid 3-letter uppercase code (e.g., USD)'),
  timeline: z
    .object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      milestones: z
        .array(
          z.object({
            name: z.string(),
            date: z.string().optional(),
          }),
        )
        .optional(),
    })
    .optional(),
});

// ---------------------------------------------------------------------------------------
// Deal Creation
// ---------------------------------------------------------------------------------------

export const createDealSchema = z.object({
  terms: dealTermsSchema,
});

// ---------------------------------------------------------------------------------------
// Deal Transition
// ---------------------------------------------------------------------------------------

const validActions: DealAction[] = [
  'SUBMIT_FOR_ACCEPTANCE',
  'ACCEPT',
  'DECLINE',
  'FUND',
  'START',
  'SUBMIT_DELIVERABLE',
  'APPROVE',
  'REQUEST_REVISION',
  'RESUBMIT',
  'RAISE_DISPUTE',
  'RESOLVE',
  'ACCEPT_RESOLUTION',
  'REQUEST_REWORK',
  'RELEASE_PAYMENT',
  'CANCEL',
];

export const transitionDealSchema = z.object({
  action: z.enum(validActions as [DealAction, ...DealAction[]], {
    errorMap: () => ({
      message: `Invalid action. Must be one of: ${validActions.join(', ')}`,
    }),
  }),
});

// ---------------------------------------------------------------------------------------
// Invite Creator
// ---------------------------------------------------------------------------------------

export const inviteCreatorSchema = z.object({
  creatorId: z.string().uuid('Invalid creator ID'),
});

// ---------------------------------------------------------------------------------------
// Deal List Filter
// ---------------------------------------------------------------------------------------

export const listDealsQuerySchema = z.object({
  status: z
    .string()
    .optional(),
});

// ---------------------------------------------------------------------------------------
// Submit Deliverable
// ---------------------------------------------------------------------------------------

export const submitDeliverableSchema = z.object({
  note: z
    .string()
    .max(5000, 'Submission note cannot exceed 5000 characters')
    .optional(),
});

export type SubmitDeliverableInput = z.infer<typeof submitDeliverableSchema>;

// ---------------------------------------------------------------------------------------
// Request Revision
// ---------------------------------------------------------------------------------------

export const requestRevisionSchema = z.object({
  note: z
    .string()
    .min(1, 'Revision note is required')
    .max(5000, 'Revision note cannot exceed 5000 characters'),
});

export type RequestRevisionInput = z.infer<typeof requestRevisionSchema>;

// ---------------------------------------------------------------------------------------
// Approve Deliverable
// ---------------------------------------------------------------------------------------

// Approval requires no additional payload — the brand's auth and the
// current SUBMITTED state are sufficient authorization.
export const approveDeliverableSchema = z.object({});

export type ApproveDeliverableInput = z.infer<typeof approveDeliverableSchema>;

// ---------------------------------------------------------------------------------------
// Release Payment (Complete)
// ---------------------------------------------------------------------------------------

// Payment release requires no additional payload — the brand's auth and
// current APPROVED state are sufficient authorization.
export const releasePaymentSchema = z.object({});

export type ReleasePaymentInput = z.infer<typeof releasePaymentSchema>;

// ---------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------

export type CreateDealInput = z.infer<typeof createDealSchema>;
export type TransitionDealInput = z.infer<typeof transitionDealSchema>;
export type InviteCreatorInput = z.infer<typeof inviteCreatorSchema>;
export type ListDealsQuery = z.infer<typeof listDealsQuerySchema>;
