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
   * Create a payment intent and return a specific intent ID.
   * Used after the deal has been serialized (unique dealId in DB) to ensure
   * the intent ID is deterministic and matches the record already created.
   * The returned intent ID MUST equal the provided `intentId`.
   *
   * In a real provider (Stripe), this would use the idempotency key feature.
   * In simulation, it returns an intent with the exact ID provided.
   *
   * @param intentId  The intent ID already recorded in the Payment DB row.
   * @param amount   The payment amount (must match the recorded amount).
   * @param currency The currency (must match).
   */
  createIdempotentIntent(
    intentId: string,
    amount: number,
    currency: string,
    metadata: Record<string, string>,
  ): Promise<PaymentIntent>;

  /**
   * Confirm/complete a payment intent.
   * In the simulated provider, this always succeeds.
   */
  confirm(intentId: string): Promise<PaymentResult>;
}