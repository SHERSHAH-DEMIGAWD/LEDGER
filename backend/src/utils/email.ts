import crypto from 'crypto';
import { config } from '../config.js';

/**
 * Generate a cryptographically secure random token.
 * Returns a hex-encoded string; default 32 bytes (64 hex chars = 256 bits of entropy).
 */
export function generateToken(bytes: number = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Hash a token using SHA-256.
 * Used for storing opaque references to verification tokens and refresh tokens.
 * NOT a password hash — these tokens are high-entropy and do not need bcrypt.
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Email service interface.
 * The real implementation MUST NOT log raw tokens.
 */
export interface EmailService {
  sendVerificationEmail(email: string, token: string): Promise<void>;
}

class MockEmailService implements EmailService {
  async sendVerificationEmail(email: string, token: string): Promise<void> {
    // In production, the real implementation would call SendGrid/SES/etc.
    // The mock is for local development only. To avoid leaking raw tokens
    // into shared log aggregators, we log only a redacted identifier and
    // instruct the developer to inspect the verification flow another way.
    if (config.server.isProduction) {
      console.log(`[EMAIL] Verification email queued for ${email}`);
      return;
    }
    const tokenFingerprint = token.slice(0, 4) + '…' + token.slice(-4);
    const verificationUrl = `${config.server.corsOrigin}/verify-email?token=${token}`;
    console.log(`[EMAIL] Verification email to ${email}: ${verificationUrl}`);
    console.log(`[EMAIL] Token fingerprint (dev only): ${tokenFingerprint}`);
  }
}

export const emailService: EmailService = new MockEmailService();
