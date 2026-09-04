/**
 * Unit tests for the SimulatedPayment provider.
 *
 * Verifies the contract of the simulated payment integration:
 * - createIntent always succeeds and returns a PENDING intent
 * - confirm always returns a SUCCEEDED payment
 * - intent and payment IDs are unique across calls
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { SimulatedPayment } from '../../src/integrations/payment/SimulatedPayment.js';

describe('SimulatedPayment', () => {
  let provider: SimulatedPayment;

  beforeEach(() => {
    provider = new SimulatedPayment();
  });

  describe('createIntent', () => {
    it('returns a PENDING intent with the given amount and currency', async () => {
      const intent = await provider.createIntent(50000, 'USD', { dealId: 'deal-1' });

      expect(intent.status).toBe('PENDING');
      expect(intent.amount).toBe(50000);
      expect(intent.currency).toBe('USD');
      expect(intent.metadata).toEqual({ dealId: 'deal-1' });
    });

    it('returns an intent with a unique id', async () => {
      const a = await provider.createIntent(100, 'USD', {});
      const b = await provider.createIntent(100, 'USD', {});
      expect(a.id).not.toEqual(b.id);
    });
  });

  describe('confirm', () => {
    it('returns a SUCCEEDED payment for the given intentId', async () => {
      const result = await provider.confirm('intent-1');
      expect(result.status).toBe('SUCCEEDED');
      expect(result.metadata.intentId).toBe('intent-1');
    });

    it('returns a unique payment id across multiple confirmations', async () => {
      const a = await provider.confirm('intent-1');
      const b = await provider.confirm('intent-2');
      expect(a.id).not.toEqual(b.id);
    });
  });
});
