import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { User, Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { generateToken, hashToken, emailService } from '../utils/email.js';
import { UnauthorizedError, ConflictError, ValidationError } from '../middleware/errorHandler.js';

const MAX_FAILED_LOGINS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export interface RegisterInput {
  email: string;
  password: string;
  role: 'BRAND' | 'CREATOR';
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthResult {
  accessToken: string;
  user: {
    id: string;
    email: string;
    role: string;
    emailVerified: boolean;
  };
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, config.auth.bcryptRounds);
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Generate an access token (short-lived)
 *
 * Note: the JWT payload contains userId, email, and role. The middleware
 * never trusts client-asserted role; this is the server's view at issue time.
 * A role change takes effect at the next access-token refresh (≤15 min).
 */
export function generateAccessToken(user: User): string {
  const payload = {
    userId: user.id,
    email: user.email,
    role: user.role,
  };
  return jwt.sign(payload, config.auth.jwtSecret, {
    expiresIn: config.auth.accessTokenExpiresIn,
  } as jwt.SignOptions);
}

/**
 * Generate a refresh token (long-lived, stored in DB as a hash for revocation)
 */
export async function generateRefreshToken(userId: string): Promise<string> {
  const token = generateToken(32);
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await prisma.refreshToken.create({
    data: {
      tokenHash,
      userId,
      expiresAt,
    },
  });

  return token;
}

/**
 * Verify and rotate a refresh token atomically.
 *
 * Concurrency safety:
 *   - The lookup + revocation is done via updateMany with a WHERE filter
 *     on (tokenHash, revokedAt IS NULL, expiresAt > now). The DB enforces
 *     that only ONE of N concurrent calls can match and update; subsequent
 *     calls find 0 rows and reject.
 *   - We then insert the new token in a separate statement (the rotation
 *     contract is: old token is single-use). The new token is returned to
 *     the winner of the race.
 */
export async function rotateRefreshToken(oldToken: string): Promise<{ user: User; newToken: string }> {
  const tokenHash = hashToken(oldToken);
  const now = new Date();

  // Atomically claim the token: only succeed if it is un-revoked and un-expired.
  // updateMany returns the count of rows matched; we need to fetch the userId
  // from the row we updated, so we do a two-step atomic operation:
  //   1. findUnique with SELECT ... FOR UPDATE behavior (Prisma uses
  //      $transaction with interactive mode for row-level locking on
  //      PostgreSQL).
  const result = await prisma.$transaction(async (tx) => {
    const stored = await tx.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!stored || stored.revokedAt || stored.expiresAt <= now) {
      return null;
    }

    // Try to mark as revoked. The compound where-filter ensures only one
    // concurrent caller can win: if another transaction has already
    // revoked it, this updateMany will report count=0 and we reject.
    const claim = await tx.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null, expiresAt: { gt: now } },
      data: { revokedAt: now },
    });

    if (claim.count !== 1) {
      return null; // lost the race
    }

    // Generate and insert the new token inside the same transaction so a
    // failed insert rolls back the revocation (avoids a window where the
    // old token is dead but no new token was issued).
    const newToken = generateToken(32);
    const newExpiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    await tx.refreshToken.create({
      data: {
        tokenHash: hashToken(newToken),
        userId: stored.userId,
        expiresAt: newExpiresAt,
      },
    });

    return { user: stored.user, newToken };
  });

  if (!result) {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  return result;
}

/**
 * Revoke a refresh token (used by logout).
 */
export async function revokeRefreshToken(token: string): Promise<void> {
  const tokenHash = hashToken(token);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * Revoke all active refresh tokens for a user.
 * Used on password change (and is exported for future use).
 */
export async function revokeAllRefreshTokensForUser(userId: string): Promise<number> {
  const result = await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count;
}

/**
 * Register a new user.
 */
export async function register(input: RegisterInput): Promise<{ user: User; verificationToken: string }> {
  const existing = await prisma.user.findUnique({
    where: { email: input.email.toLowerCase() },
  });

  if (existing) {
    throw new ConflictError('User with this email already exists');
  }

  validatePassword(input.password);

  const passwordHash = await hashPassword(input.password);

  const user = await prisma.user.create({
    data: {
      email: input.email.toLowerCase(),
      passwordHash,
      role: input.role,
    },
  });

  // Verification token: random raw token sent to the user, hash stored in DB.
  const rawToken = generateToken(32);
  const expiresAt = new Date(Date.now() + config.email.verificationExpiresIn);

  await prisma.emailVerification.create({
    data: {
      tokenHash: hashToken(rawToken),
      userId: user.id,
      expiresAt,
    },
  });

  // The mock email service receives the raw token. The real implementation
  // must NEVER log the raw token.
  await emailService.sendVerificationEmail(user.email, rawToken);

  return { user, verificationToken: rawToken };
}

/**
 * Login a user.
 *
 * Concurrency safety for lockout:
 *   - Failed-login increment uses updateMany with a WHERE filter on
 *     (id, lockedUntil IS NULL OR lockedUntil <= now). The DB enforces
 *     atomicity, so concurrent failed logins each get a unique pre-image.
 *   - We do NOT read the current failedLogins count; we increment with
 *     `{ increment: 1 }` and then decide whether to lock based on the
 *     post-update value via a separate atomic update.
 *   - The lock decision is itself an atomic update with a predicate
 *     (failedLogins >= MAX and lockedUntil IS NULL) so only one concurrent
 *     caller can set lockedUntil.
 *
 * Information disclosure:
 *   - The locked-account path returns the SAME generic error as the
 *     invalid-credentials path. The user cannot distinguish them by message.
 *   - The locked-account path performs an equivalent bcrypt.compare to
 *     keep timing roughly constant.
 */
export async function login(input: LoginInput): Promise<{ user: User; tokens: TokenPair }> {
  const user = await prisma.user.findUnique({
    where: { email: input.email.toLowerCase() },
  });

  const GENERIC_INVALID = new UnauthorizedError('Invalid credentials');

  if (!user || !user.passwordHash) {
    // Perform an equivalent-cost bcrypt to avoid revealing account existence
    // via timing. (Constant-time is impractical with bcrypt, but we at least
    // do work on this path.)
    await bcrypt.compare(input.password, '$2b$12$' + 'x'.repeat(53));
    throw GENERIC_INVALID;
  }

  // Check if account is locked
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    // Still verify a password to keep timing comparable to the failure path.
    await bcrypt.compare(input.password, user.passwordHash);
    throw GENERIC_INVALID;
  }

  const valid = await verifyPassword(input.password, user.passwordHash);

  if (!valid) {
    // Atomic failed-login increment. The compound WHERE ensures we only
    // touch an account that is not currently locked (a locked account
    // would have been short-circuited above).
    await prisma.user.updateMany({
      where: {
        id: user.id,
        OR: [{ lockedUntil: null }, { lockedUntil: { lte: new Date() } }],
      },
      data: { failedLogins: { increment: 1 } },
    });

    // Atomic lock decision. Only the first caller that observes
    // failedLogins >= MAX wins; subsequent callers' updates no-op.
    const post = await prisma.user.findUnique({
      where: { id: user.id },
      select: { failedLogins: true },
    });

    if (post && post.failedLogins >= MAX_FAILED_LOGINS) {
      // Set the lock ONLY if not already locked. The compound WHERE prevents
      // extending an existing lock. count === 1 on the winning call, 0 otherwise.
      await prisma.user.updateMany({
        where: {
          id: user.id,
          OR: [{ lockedUntil: null }, { lockedUntil: { lte: new Date() } }],
        },
        data: {
          lockedUntil: new Date(Date.now() + LOCKOUT_DURATION_MS),
          failedLogins: 0,
        },
      });
    }

    throw GENERIC_INVALID;
  }

  // Successful login: reset failed-login counter and any active lock.
  await prisma.user.updateMany({
    where: { id: user.id },
    data: { failedLogins: 0, lockedUntil: null },
  });

  const accessToken = generateAccessToken(user);
  const refreshToken = await generateRefreshToken(user.id);

  return {
    user: { ...user, failedLogins: 0, lockedUntil: null },
    tokens: { accessToken, refreshToken },
  };
}

/**
 * Verify email using the raw token from the email link.
 *
 * The raw token is hashed and looked up by hash. After use, the verification
 * row is deleted so the token cannot be replayed.
 */
export async function verifyEmail(rawToken: string): Promise<void> {
  const tokenHash = hashToken(rawToken);
  const now = new Date();

  // Atomically claim a non-expired, non-deleted verification row by deleting
  // it as part of the lookup. We use a delete + count so concurrent verifications
  // with the same token cannot both succeed.
  const result = await prisma.$transaction(async (tx) => {
    // First try to find the row to give a useful error
    const existing = await tx.emailVerification.findUnique({
      where: { tokenHash },
    });
    if (!existing) {
      return { ok: false as const, reason: 'not_found' as const };
    }
    if (existing.expiresAt <= now) {
      // Clean up the expired row opportunistically
      await tx.emailVerification.delete({ where: { id: existing.id } });
      return { ok: false as const, reason: 'expired' as const };
    }
    // Delete to claim the token. If a concurrent caller already deleted it,
    // this throws P2025 and we treat as invalid.
    try {
      await tx.emailVerification.delete({ where: { id: existing.id } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        return { ok: false as const, reason: 'not_found' as const };
      }
      throw e;
    }
    await tx.user.update({
      where: { id: existing.userId },
      data: { emailVerified: true },
    });
    return { ok: true as const };
  });

  if (!result.ok) {
    throw new ValidationError('Invalid or expired verification token');
  }
}

/**
 * Get user by ID
 */
export async function getUserById(id: string): Promise<User | null> {
  return prisma.user.findUnique({
    where: { id },
  });
}

/**
 * Validate password strength
 */
function validatePassword(password: string): void {
  if (password.length < 8) {
    throw new ValidationError('Password must be at least 8 characters long');
  }
  if (!/[a-z]/.test(password)) {
    throw new ValidationError('Password must contain at least one lowercase letter');
  }
  if (!/[A-Z]/.test(password)) {
    throw new ValidationError('Password must contain at least one uppercase letter');
  }
  if (!/[0-9]/.test(password)) {
    throw new ValidationError('Password must contain at least one number');
  }
}

/**
 * Cleanup expired tokens (call periodically)
 */
export async function cleanupExpiredTokens(): Promise<void> {
  await prisma.refreshToken.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  await prisma.emailVerification.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
}
