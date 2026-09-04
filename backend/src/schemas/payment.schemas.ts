// schemas/payment.schemas.ts
/**
 * Payment-related Zod schemas for request validation.
 */

import { z } from 'zod';

/**
 * No request body needed for funding/refund endpoints in this MVP.
 * All parameters come from URL parameters and authentication context.
 */
export const emptyObjectSchema = z.object({});

/**
 * Response type exports for documentation/consumption purposes.
 * These are not used for validation but are helpful for TypeScript consumers.
 */
export type EmptyObject = z.infer<typeof emptyObjectSchema>;