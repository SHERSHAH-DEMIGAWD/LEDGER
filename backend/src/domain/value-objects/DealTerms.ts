import { DealTermsValidationError } from '../errors/index.js';

export interface Deliverable {
  title: string;
  description: string;
  deadline?: string; // ISO date string
}

export interface DealTerms {
  title: string;
  description: string;
  deliverables: Deliverable[];
  paymentAmount: number; // In cents, to avoid floating point issues
  currency: string;
  timeline?: {
    startDate?: string;
    endDate?: string;
    milestones?: Array<{ name: string; date?: string }>;
  };
}

export function createDealTerms(terms: DealTerms): DealTerms {
  validateDealTerms(terms);
  return Object.freeze({ ...terms });
}

export function validateDealTerms(terms: unknown): void {
  if (!terms || typeof terms !== 'object') {
    throw new DealTermsValidationError('Deal terms must be an object');
  }

  const t = terms as Record<string, unknown>;

  // Title is required and must be a non-empty string
  if (typeof t.title !== 'string' || t.title.trim().length === 0) {
    throw new DealTermsValidationError('Deal terms must include a title');
  }

  if (t.title.trim().length > 255) {
    throw new DealTermsValidationError('Deal title must be 255 characters or less');
  }

  // Description is required
  if (typeof t.description !== 'string' || t.description.trim().length === 0) {
    throw new DealTermsValidationError('Deal terms must include a description');
  }

  // Payment amount must be a positive number (in cents)
  if (typeof t.paymentAmount !== 'number' || !Number.isInteger(t.paymentAmount)) {
    throw new DealTermsValidationError('Payment amount must be an integer (in cents)');
  }

  if (t.paymentAmount < 0) {
    throw new DealTermsValidationError('Payment amount cannot be negative');
  }

  if (t.paymentAmount > 1_000_000_00) {
    // $1,000,000 max for MVP
    throw new DealTermsValidationError('Payment amount exceeds maximum allowed value');
  }

  // Currency must be a valid 3-letter code
  if (typeof t.currency !== 'string' || !/^[A-Z]{3}$/.test(t.currency)) {
    throw new DealTermsValidationError('Currency must be a valid 3-letter uppercase code (e.g., USD)');
  }

  // Deliverables must be an array with at least one item
  if (!Array.isArray(t.deliverables)) {
    throw new DealTermsValidationError('Deal must include at least one deliverable');
  }

  if (t.deliverables.length === 0) {
    throw new DealTermsValidationError('Deal must include at least one deliverable');
  }

  // Validate each deliverable
  for (const [index, deliverable] of t.deliverables.entries()) {
    validateDeliverable(deliverable, index);
  }
}

function validateDeliverable(deliverable: unknown, index: number): void {
  if (!deliverable || typeof deliverable !== 'object') {
    throw new DealTermsValidationError(`Deliverable ${index} must be an object`);
  }

  const d = deliverable as Record<string, unknown>;

  if (typeof d.title !== 'string' || d.title.trim().length === 0) {
    throw new DealTermsValidationError(`Deliverable ${index} must have a title`);
  }

  if (d.title.trim().length > 255) {
    throw new DealTermsValidationError(`Deliverable ${index} title must be 255 characters or less`);
  }

  if (typeof d.description !== 'string' || d.description.trim().length === 0) {
    throw new DealTermsValidationError(`Deliverable ${index} must have a description`);
  }

  // Optional deadline validation (ISO date string)
  if (d.deadline !== undefined && typeof d.deadline !== 'string') {
    throw new DealTermsValidationError(`Deliverable ${index} deadline must be a string`);
  }
}