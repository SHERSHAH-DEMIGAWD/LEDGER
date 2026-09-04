// payment/SimulatedPayment.ts
/**
 * Simulated payment provider implementation.
 * Always succeeds — used for MVP/demo purposes.
 * This provider can later be replaced with a real provider (Stripe, PayPal, etc.)
 * without modifying PaymentService, as long as it implements the PaymentProvider interface.
 */

import { PaymentProvider, PaymentIntent, PaymentResult } from './PaymentProvider.js';

export class SimulatedPayment implements PaymentProvider {
  private intentCounter = 0;
  private resultCounter = 0;

  async createIntent(
    amount: number,
    currency: string,
    metadata: Record<string, string>,
  ): Promise<PaymentIntent> {
    this.intentCounter++;
    return {
      id: `sim_intent_${Date.now()}_${this.intentCounter}`,
      status: 'PENDING',
      amount,
      currency,
      metadata,
    };
  }

  async confirm(intentId: string): Promise<PaymentResult> {
    this.resultCounter++;
    return {
      id: `sim_payment_${Date.now()}_${this.resultCounter}`,
      status: 'SUCCEEDED',
      amount: 0,
      currency: 'USD',
      metadata: { intentId },
    };
  }
}

export const simulatedPayment = new SimulatedPayment();