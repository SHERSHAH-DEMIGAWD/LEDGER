// payment/PaymentProvider.ts
/**
 * PaymentProvider abstraction for deal funding operations.
 * This interface defines the minimal payment functionality required by the MVP.
 * The simulated payment implementation always succeeds.
 */

export interface PaymentIntent {
  id: string;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED';
  amount: number;
  currency: string;
  metadata: Record<string, string>;
}

export interface PaymentResult {
  id: string;
  status: 'SUCCEEDED';
  amount: number;
  currency: string;
  metadata: Record<string, string>;
}

export interface PaymentProvider {
  /**
   * Create a payment intent for the given amount and currency.
   * This is the first step in a simulated payment flow.
   */
  createIntent(amount: number, currency: string, metadata: Record<string, string>): Promise<PaymentIntent>;

  /**
   * Confirm/complete a payment intent.
   * In the simulated provider, this always succeeds.
   */
  confirm(intentId: string): Promise<PaymentResult>;
}