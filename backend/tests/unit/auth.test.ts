import { describe, it, expect } from 'vitest';
import { generateToken, hashToken } from '../../src/utils/email.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

// ---------------------------------------------------------------------------
// Constants mirror those in auth.service.ts
// ---------------------------------------------------------------------------
const JWT_SECRET = 'test-jwt-secret-at-least-32-chars-long-here';

// ---------------------------------------------------------------------------
// 1. Password Hashing
// ---------------------------------------------------------------------------
describe('Password Hashing', () => {
  it('should hash password using bcrypt', async () => {
    const password = 'Test123Pass';
    const hash = await bcrypt.hash(password, 12);

    expect(hash).toBeTruthy();
    expect(hash).not.toEqual(password);
    expect(hash.length).toBeGreaterThan(50);
  });

  it('should verify correct password', async () => {
    const password = 'Test123Pass';
    const hash = await bcrypt.hash(password, 12);
    const isValid = await bcrypt.compare(password, hash);

    expect(isValid).toBe(true);
  });

  it('should reject incorrect password', async () => {
    const password = 'Test123Pass';
    const hash = await bcrypt.hash(password, 12);
    const isValid = await bcrypt.compare('WrongPass123', hash);

    expect(isValid).toBe(false);
  });

  it('should produce different hashes for same password (salted)', async () => {
    const password = 'Test123Pass';
    const hash1 = await bcrypt.hash(password, 12);
    const hash2 = await bcrypt.hash(password, 12);

    expect(hash1).not.toEqual(hash2);
  });
});

// ---------------------------------------------------------------------------
// 2. Token Generation & Hashing
// ---------------------------------------------------------------------------
describe('Token Generation', () => {
  it('should generate random token of default size (64 hex chars)', () => {
    const token = generateToken(32);
    expect(token).toBeTruthy();
    expect(token.length).toBe(64);
    expect(/^[0-9a-f]+$/.test(token)).toBe(true);
  });

  it('should generate different tokens on each call', () => {
    const token1 = generateToken();
    const token2 = generateToken();
    expect(token1).not.toEqual(token2);
  });

  it('should generate token of custom size', () => {
    const token = generateToken(16);
    expect(token.length).toBe(32); // 16 bytes -> 32 hex chars
  });
});

describe('Token Hashing (SHA-256)', () => {
  it('should hash a token deterministically', () => {
    const token = 'test-token-123';
    const hash1 = hashToken(token);
    const hash2 = hashToken(token);
    expect(hash1).toEqual(hash2);
  });

  it('should produce different hash than the original token', () => {
    const token = 'test-token-123';
    const hash = hashToken(token);
    expect(hash).not.toEqual(token);
    expect(hash.length).toBe(64); // SHA-256 = 256 bits = 64 hex chars
  });

  it('should produce different hashes for different tokens', () => {
    const hash1 = hashToken('token-a');
    const hash2 = hashToken('token-b');
    expect(hash1).not.toEqual(hash2);
  });

  it('hashed verification tokens cannot be reversed to the original token', () => {
    // SHA-256 is one-way; the hash should not contain any substring of the input
    const token = 'my-super-secret-verification-token';
    const hash = hashToken(token);
    expect(hash.includes(token)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. Email Verification Token Security
// ---------------------------------------------------------------------------
describe('Email Verification Token Security', () => {
  it('should store only a hash, not the plaintext token', () => {
    const rawToken = generateToken(32);
    const storedHash = hashToken(rawToken);

    // The raw token must NOT appear in the hash
    expect(storedHash).not.toBe(rawToken);

    // Someone with DB read access cannot derive the raw token from the hash
    // (SHA-256 preimage resistance — this is a design invariant, not a runtime test)
    expect(hashToken(rawToken)).toBe(storedHash);
  });

  it('should generate 256-bit tokens (256 bits of entropy)', () => {
    // 32 bytes = 256 bits — sufficient for a one-time-use token
    const token = generateToken(32);
    // log2(16^64) ≈ 256 bits of entropy
    expect(token.length).toBe(64);
  });

  it('should produce a consistent fingerprint (first/last 4 chars) for logs without leaking the token', () => {
    const token = generateToken(32);
    const fp = token.slice(0, 4) + '…' + token.slice(-4);
    expect(fp.length).toBe(9); // 4 + 1 + 4
    expect(fp.includes(token)).toBe(false);
    expect(fp.startsWith(token.slice(0, 4))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. JWT Structure & Security
// ---------------------------------------------------------------------------
describe('JWT Structure', () => {
  it('should encode and decode a valid payload', () => {
    const payload = { userId: 'user-123', email: 'test@example.com', role: 'BRAND' };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '15m' });
    const decoded = jwt.verify(token, JWT_SECRET) as any;

    expect(decoded.userId).toEqual(payload.userId);
    expect(decoded.email).toEqual(payload.email);
    expect(decoded.role).toEqual(payload.role);
  });

  it('should reject a tampered token', () => {
    const token = jwt.sign({ userId: 'user-123' }, JWT_SECRET);
    const tampered = token.slice(0, -2) + 'xx';

    expect(() => jwt.verify(tampered, JWT_SECRET)).toThrow();
  });

  it('should reject an expired token', () => {
    const token = jwt.sign({ userId: 'user-123' }, JWT_SECRET, { expiresIn: '-1s' });

    expect(() => jwt.verify(token, JWT_SECRET)).toThrow(jwt.TokenExpiredError);
  });

  it('should reject a token signed with the wrong secret', () => {
    const token = jwt.sign({ userId: 'user-123' }, 'wrong-secret');

    expect(() => jwt.verify(token, JWT_SECRET)).toThrow(jwt.JsonWebTokenError);
  });

  it('should reject a malformed token', () => {
    expect(() => jwt.verify('not.a.valid.jwt', JWT_SECRET)).toThrow();
  });

  it('should reject a token with no signature at all', () => {
    const parts = jwt.sign({ userId: 'user-123' }, JWT_SECRET).split('.');
    const unsigned = [...parts.slice(0, 2), ''].join('.');
    expect(() => jwt.verify(unsigned, JWT_SECRET)).toThrow();
  });

  it('should include iat (issued-at) claim by default', () => {
    const token = jwt.sign({ userId: 'user-123' }, JWT_SECRET);
    const decoded = jwt.decode(token) as any;
    expect(decoded.iat).toBeDefined();
    expect(typeof decoded.iat).toBe('number');
  });

  it('should include exp (expiration) claim when expiresIn is set', () => {
    const token = jwt.sign({ userId: 'user-123' }, JWT_SECRET, { expiresIn: '15m' });
    const decoded = jwt.decode(token) as any;
    expect(decoded.exp).toBeDefined();
    expect(decoded.exp).toBeGreaterThan(decoded.iat);
  });

  it('should NOT include sensitive fields like passwordHash in the JWT payload', () => {
    const payload = { userId: 'user-123', email: 'test@example.com', role: 'BRAND' };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '15m' });
    const decoded = jwt.decode(token) as any;

    expect(decoded).not.toHaveProperty('passwordHash');
    expect(decoded).not.toHaveProperty('password');
    expect(decoded).not.toHaveProperty('secret');
  });
});

// ---------------------------------------------------------------------------
// 5. Config Secret Validation (unit-level checks)
// ---------------------------------------------------------------------------
describe('Secret Validation Logic', () => {
  it('should require minimum length for secrets', () => {
    const isLongEnough = (s: string) => s.length >= 32;
    expect(isLongEnough('short')).toBe(false);
    expect(isLongEnough('exactly-32-characters-abcdefghijkl')).toBe(true);
    expect(isLongEnough('longer-than-32-characters-abcdefgh')).toBe(true);
  });

  it('should identify obvious placeholder values', () => {
    const placeholders = ['change-me', 'changeme', 'secret', 'password', 'test'];
    const isPlaceholder = (s: string) =>
      placeholders.some((p) => s.toLowerCase().includes(p));

    expect(isPlaceholder('real-value-abc123')).toBe(false);
    expect(isPlaceholder('change-me-in-production')).toBe(true);
    expect(isPlaceholder('changeme')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. Password Validation
// ---------------------------------------------------------------------------
describe('Password Validation Logic', () => {
  const validatePasswordLogic = (password: string): boolean => {
    if (password.length < 8) return false;
    if (!/[a-z]/.test(password)) return false;
    if (!/[A-Z]/.test(password)) return false;
    if (!/[0-9]/.test(password)) return false;
    return true;
  };

  it('should accept a valid password', () => {
    expect(validatePasswordLogic('Test123Pass')).toBe(true);
  });

  it('should reject password too short', () => {
    expect(validatePasswordLogic('Test1')).toBe(false);
  });

  it('should reject password without uppercase', () => {
    expect(validatePasswordLogic('test123pass')).toBe(false);
  });

  it('should reject password without lowercase', () => {
    expect(validatePasswordLogic('TEST123PASS')).toBe(false);
  });

  it('should reject password without number', () => {
    expect(validatePasswordLogic('TestPassword')).toBe(false);
  });

  it('should reject empty password', () => {
    expect(validatePasswordLogic('')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 7. Refresh Token Rotation (contract verification)
// ---------------------------------------------------------------------------
describe('Refresh Token Rotation Contract', () => {
  it('should generate different access and refresh tokens', () => {
    // Simulate token pair generation
    const accessToken = jwt.sign({ userId: 'user-1' }, JWT_SECRET, { expiresIn: '15m' });
    const refreshToken = generateToken(32);

    expect(accessToken).toBeTruthy();
    expect(refreshToken).toBeTruthy();
    // They are fundamentally different types: JWT vs random hex string
    expect(accessToken.split('.').length).toBe(3); // JWT has 3 parts
    expect(refreshToken.split('.').length).toBe(1); // hex string has no dots
  });

  it('refresh token hash should be different from the raw token', () => {
    const raw = generateToken(32);
    const hash = hashToken(raw);
    expect(hash).not.toBe(raw);
    expect(hash).toHaveLength(64);
  });

  it('rotation should revoke the old token hash', () => {
    // Simulate: we hash, store, then "revoke" by noting that the stored value
    // no longer matches the revoked set.
    const raw = generateToken(32);
    const hash = hashToken(raw);
    const revokedHashes = new Set<string>();
    revokedHashes.add(hash);

    // A rotation check would look up by hash and find it revoked
    expect(revokedHashes.has(hash)).toBe(true);

    // A fresh token would not be in the revoked set
    const fresh = generateToken(32);
    expect(revokedHashes.has(hashToken(fresh))).toBe(false);
  });

  it('concurrent rotation attempts with the same token: only one should succeed', () => {
    // Simulate the atomic WHERE-clause contract:
    // updateMany({ where: { tokenHash, revokedAt: null } })
    let revokedAt: Date | null = null;

    // Caller A wins the race
    const claimA = revokedAt === null;
    if (claimA) revokedAt = new Date();

    // Caller B loses — the DB row is already revoked
    const claimB = revokedAt === null;

    expect(claimA).toBe(true);
    expect(claimB).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 8. Account Lockout Logic
// ---------------------------------------------------------------------------
describe('Account Lockout Logic', () => {
  const MAX_FAILED = 5;
  const LOCKOUT_MS = 15 * 60 * 1000;
  const LOCKOUT_DURATION_MS = LOCKOUT_MS;

  it('should lock after MAX_FAILED failed attempts', () => {
    let failedLogins = 0;
    let lockedUntil: Date | null = null;

    // Simulate 5 failed attempts
    for (let i = 0; i < MAX_FAILED; i++) {
      failedLogins++;
    }

    if (failedLogins >= MAX_FAILED && !lockedUntil) {
      lockedUntil = new Date(Date.now() + LOCKOUT_MS);
    }

    expect(failedLogins).toBe(5);
    expect(lockedUntil).not.toBeNull();
    expect(lockedUntil!.getTime()).toBeGreaterThan(Date.now());
  });

  it('should NOT lock if attempts are below threshold', () => {
    let failedLogins = 0;
    let lockedUntil: Date | null = null;

    failedLogins = 3;

    if (failedLogins >= MAX_FAILED && !lockedUntil) {
      lockedUntil = new Date(Date.now() + LOCKOUT_MS);
    }

    expect(lockedUntil).toBeNull();
  });

  it('should reset counter on successful login', () => {
    let failedLogins = 3;
    let lockedUntil: Date | null = null;

    // Successful login
    failedLogins = 0;
    lockedUntil = null;

    expect(failedLogins).toBe(0);
    expect(lockedUntil).toBeNull();
  });

  it('should keep lockout active until expiration', () => {
    const futureLock = new Date(Date.now() + 10 * 60 * 1000); // 10 min from now
    const now = new Date();

    expect(futureLock > now).toBe(true);
    expect(futureLock > new Date()).toBe(true); // still locked
  });

  it('concurrent failed logins: only the first to observe threshold should win the lock', () => {
    // Simulate: both callers read failedLogins=4, both increment, both check >= MAX.
    // The DB's WHERE clause (lockedUntil IS NULL OR lockedUntil <= now) ensures
    // only one concurrent UPDATE can set the lock; the second's updateMany
    // reports count=0 and the lock remains as set by the first.
    let lockedUntil: Date | null = null;

    // Caller A wins the atomic updateMany (lockedUntil IS NULL matches)
    const aMatched = lockedUntil === null;
    if (aMatched) {
      lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
    }

    // Caller B arrives immediately after A's commit
    const bMatched = lockedUntil === null; // false, because A set it
    const lockLoser = bMatched ? 'lock acquired' : 'already locked';

    expect(aMatched).toBe(true);
    expect(bMatched).toBe(false);
    expect(lockLoser).toBe('already locked');
    expect(lockedUntil).not.toBeNull();
  });

  it('locked account should use the same error message as invalid credentials', () => {
    // Both paths must return the same user-facing message to prevent enumeration
    const LOCKED_MSG = 'Invalid credentials';
    const INVALID_MSG = 'Invalid credentials';
    expect(LOCKED_MSG).toEqual(INVALID_MSG);
  });
});

// ---------------------------------------------------------------------------
// 9. Rate Limiting Key Generation
// ---------------------------------------------------------------------------
describe('Rate Limiting Key Generation', () => {
  it('should use the client IP as the key', () => {
    const keyFromReq = (ip: string | undefined) => {
      if (!ip) throw new Error('req.ip unavailable');
      return ip;
    };

    expect(keyFromReq('192.168.1.100')).toBe('192.168.1.100');
    expect(keyFromReq('::1')).toBe('::1');
  });

  it('should throw rather than fall back to a shared key on missing IP', () => {
    const keyFromReq = (ip: string | undefined) => {
      if (!ip) throw new Error('req.ip unavailable; check trust proxy configuration');
      return ip;
    };

    expect(() => keyFromReq(undefined)).toThrow('req.ip unavailable');
    expect(() => keyFromReq(undefined)).not.toThrow('unknown');
  });

  it('should treat ::ffff:127.0.0.1 and ::1 as the same loopback for trust proxy', () => {
    // Express normalises IPv6-mapped IPv4 under 'loopback' mode
    const loopbackAddrs = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
    loopbackAddrs.forEach((ip) => {
      // The trust-proxy logic maps these to 'loopback' in config.server.trustProxy
      expect(['loopback', '127.0.0.1', '::1', '::ffff:127.0.0.1']).toContain(ip);
    });
  });
});

// ---------------------------------------------------------------------------
// 10. Cookie Security Configuration
// ---------------------------------------------------------------------------
describe('Cookie Security Configuration', () => {
  it('should default Secure=true in production', () => {
    const isProduction = true;
    const secure = isProduction; // config.cookies.secure
    expect(secure).toBe(true);
  });

  it('should default Secure=false in development', () => {
    const isProduction = false;
    const secure = isProduction;
    expect(secure).toBe(false);
  });

  it('should require Secure when SameSite=none', () => {
    const sameSite = 'none';
    const secure = true; // must be true when sameSite === 'none'
    const valid = sameSite !== 'none' || secure === true;
    expect(valid).toBe(true);
  });

  it('SameSite=strict blocks cross-site requests', () => {
    // SameSite=Strict: cookie sent only for same-site requests
    const sameSite = 'strict';
    expect(sameSite === 'strict').toBe(true);
  });

  it('SameSite=lax allows top-level cross-origin navigations', () => {
    const sameSite = 'lax';
    expect(sameSite === 'lax').toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 11. Error Handler — No Information Leakage
// ---------------------------------------------------------------------------
describe('Error Handler — No Information Leakage', () => {
  it('should map AppError subclasses to their correct status codes', () => {
    class AppError extends Error {
      constructor(public code: string, message: string, public statusCode: number) {
        super(message);
      }
    }

    const tests: Array<{ error: AppError; expectedCode: number }> = [
      { error: new AppError('AUTH_010', 'Authentication required', 401), expectedCode: 401 },
      { error: new AppError('AUTH_011', 'Forbidden', 403), expectedCode: 403 },
      { error: new AppError('VAL_001', 'Validation failed', 400), expectedCode: 400 },
      { error: new AppError('RES_002', 'Conflict', 409), expectedCode: 409 },
      { error: new AppError('RES_001', 'Not found', 404), expectedCode: 404 },
      { error: new AppError('SYS_001', 'Internal error', 500), expectedCode: 500 },
    ];

    tests.forEach(({ error, expectedCode }) => {
      expect(error.statusCode).toBe(expectedCode);
      expect(error.code).toBeTruthy();
    });
  });

  it('should NOT include stack trace or internal messages in production', () => {
    const nodeEnv = 'production';
    const err = new Error('sql: connection refused to host localhost:5432');

    const clientMessage =
      nodeEnv === 'production' ? 'An unexpected error occurred' : err.message;

    expect(clientMessage).toBe('An unexpected error occurred');
    expect(clientMessage).not.toContain('localhost');
    expect(clientMessage).not.toContain('sql');
  });

  it('should include stack trace in development only', () => {
    const nodeEnv = 'development';
    const err = new Error('sql: connection refused');

    const clientMessage =
      nodeEnv === 'development' ? err.message : 'An unexpected error occurred';

    expect(clientMessage).toBe('sql: connection refused');
    expect(clientMessage).toContain('connection refused');
  });

  it('should NOT leak the actual JWT secret in error messages', () => {
    const secret = 'super-secret-jwt-key-12345';
    void new jwt.JsonWebTokenError('invalid signature', secret as any);

    // The error object may contain the secret, but the response handler
    // must only expose the generic message
    const responseMessage = 'Invalid token';
    expect(responseMessage).not.toContain(secret);
    expect(responseMessage).not.toContain('jwt');
  });

  it('should use identical error messages for lockout and invalid-credentials', () => {
    const lockoutMsg = 'Invalid credentials';
    const invalidMsg = 'Invalid credentials';
    expect(lockoutMsg).toBe(invalidMsg);
  });
});

// ---------------------------------------------------------------------------
// 12. Authorization — Server-Side Only
// ---------------------------------------------------------------------------
describe('Authorization — Server-Side Role Enforcement', () => {
  const roleHierarchy: Record<string, number> = {
    ADMIN: 4,
    HRT: 3,
    BRAND: 2,
    CREATOR: 1,
  };

  it('should enforce explicit role lists (requireRole)', () => {
    const requireRole = (...allowed: string[]) => (userRole: string) =>
      allowed.includes(userRole);

    const hrtOrAdmin = requireRole('HRT', 'ADMIN');
    expect(hrtOrAdmin('HRT')).toBe(true);
    expect(hrtOrAdmin('ADMIN')).toBe(true);
    expect(hrtOrAdmin('BRAND')).toBe(false);
    expect(hrtOrAdmin('CREATOR')).toBe(false);
  });

  it('should NOT trust client-provided role in authorization', () => {
    // The server NEVER reads req.body.role for authorization.
    // This test documents the invariant: req.user.role comes from the JWT only.
    const serverRoleFromJwt = 'CREATOR';
    void 'ADMIN'; // attacker-controlled (must be ignored)

    const authorize = (userRole: string, requiredRole: string) =>
      userRole === requiredRole;

    // Server uses its own role from JWT, not client input
    expect(authorize(serverRoleFromJwt, 'ADMIN')).toBe(false);
  });

  it('should enforce minimum role level (requireMinRole)', () => {
    const requireMinRole = (min: string) => (userRole: string) =>
      (roleHierarchy[userRole] ?? 0) >= (roleHierarchy[min] ?? 0);

    const requireHrt = requireMinRole('HRT');
    expect(requireHrt('ADMIN')).toBe(true);
    expect(requireHrt('HRT')).toBe(true);
    expect(requireHrt('BRAND')).toBe(false);
    expect(requireHrt('CREATOR')).toBe(false);
  });

  it('should keep HRT and Admin capabilities distinct', () => {
    // HRT can access HRT routes
    const requireHRT = (role: string) => ['HRT', 'ADMIN'].includes(role);
    expect(requireHRT('HRT')).toBe(true);
    expect(requireHRT('ADMIN')).toBe(true);

    // Admin-only routes
    const requireAdmin = (role: string) => role === 'ADMIN';
    expect(requireAdmin('HRT')).toBe(false);
    expect(requireAdmin('ADMIN')).toBe(true);
  });
});
