import dotenv from 'dotenv';

dotenv.config();

/**
 * Fail fast on missing or weak secrets.
 * Never include the secret value itself in error messages.
 */
function requireSecret(name: string, minLength: number): string {
  const value = process.env[name];
  if (!value || value.length === 0) {
    throw new Error(`${name} must be defined in environment variables`);
  }
  if (value.length < minLength) {
    throw new Error(
      `${name} must be at least ${minLength} characters (got ${value.length})`
    );
  }
  // Reject obvious placeholder/default values that indicate a missed env var
  const placeholders = ['change-me', 'changeme', 'secret', 'password', 'test'];
  const lower = value.toLowerCase();
  for (const p of placeholders) {
    if (lower.includes(p) && process.env.NODE_ENV === 'production') {
      throw new Error(`${name} appears to be a placeholder; refusing to start in production`);
    }
  }
  return value;
}

const JWT_SECRET = requireSecret('JWT_SECRET', 32);
const REFRESH_TOKEN_SECRET = requireSecret('REFRESH_TOKEN_SECRET', 32);

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL must be defined in environment variables');
}

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

/**
 * Proxy trust mode.
 * - 'disabled' (default): do not trust any proxy headers. Use the direct peer IP.
 * - 'loopback': trust only the loopback proxy (127.0.0.1, ::1).
 * - 'uniquelocal': trust private/loopback addresses (10/8, 172.16/12, 192.168/16, 169.254/16, fc00::/7).
 * - 'n': trust up to n hops of proxy.
 * - 'true': trust all (UNSAFE for arbitrary deployments).
 *
 * Set TRUST_PROXY in the environment to match your deployment topology.
 * If unset, the safe default is 'disabled' (do not honor X-Forwarded-For).
 */
type TrustProxy = 'disabled' | 'loopback' | 'uniquelocal' | 'true' | number;
const trustProxyRaw = (process.env.TRUST_PROXY ?? 'disabled').toLowerCase();
let trustProxy: TrustProxy;
if (trustProxyRaw === 'disabled' || trustProxyRaw === 'false' || trustProxyRaw === '') {
  trustProxy = 'disabled';
} else if (trustProxyRaw === 'loopback') {
  trustProxy = 'loopback';
} else if (trustProxyRaw === 'uniquelocal') {
  trustProxy = 'uniquelocal';
} else if (trustProxyRaw === 'true' || trustProxyRaw === 'all') {
  trustProxy = 'true';
} else {
  const n = Number(trustProxyRaw);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(
      `TRUST_PROXY must be one of: disabled, loopback, uniquelocal, true, or a non-negative integer (got "${process.env.TRUST_PROXY}")`
    );
  }
  trustProxy = n;
}

/**
 * Cookie SameSite policy.
 * - 'strict': same-site only (blocks cross-site including sub-domains).
 * - 'lax': top-level navigations send the cookie (typical for cross-origin SPAs).
 * - 'none': cross-site (requires Secure=true).
 *
 * The intended deployment model is configured via COOKIE_SAMESITE.
 * Same-origin (frontend and backend on the same host): use 'strict'.
 * Cross-origin with the same registrable domain (e.g. app.example.com / api.example.com): use 'lax'.
 * Truly separate origins (api.evil.com / app.good.com): use 'none' with Secure=true.
 */
type SameSite = 'strict' | 'lax' | 'none';
const sameSiteRaw = (process.env.COOKIE_SAMESITE ?? 'lax').toLowerCase() as SameSite;
if (sameSiteRaw !== 'strict' && sameSiteRaw !== 'lax' && sameSiteRaw !== 'none') {
  throw new Error(
    `COOKIE_SAMESITE must be one of: strict, lax, none (got "${process.env.COOKIE_SAMESITE}")`
  );
}
const sameSite: SameSite = sameSiteRaw;
if (sameSite === 'none' && !isProduction) {
  // 'none' is rejected by browsers unless Secure is set, and Secure requires HTTPS.
  // Allow it in dev only if the developer has explicitly opted in.
  if (process.env.COOKIE_ALLOW_NONE_INSECURE !== 'true') {
    throw new Error(
      "COOKIE_SAMESITE=none requires Secure cookies. Set COOKIE_SECURE=true and use HTTPS, or use 'lax'/'strict' for local development."
    );
  }
}

const cookieSecureRaw = process.env.COOKIE_SECURE;
let cookieSecure: boolean;
if (cookieSecureRaw === undefined) {
  cookieSecure = isProduction;
} else if (cookieSecureRaw === 'true') {
  cookieSecure = true;
} else if (cookieSecureRaw === 'false') {
  cookieSecure = false;
} else {
  throw new Error(`COOKIE_SECURE must be 'true' or 'false' (got "${cookieSecureRaw}")`);
}
if (sameSite === 'none' && !cookieSecure) {
  throw new Error("COOKIE_SAMESITE=none requires COOKIE_SECURE=true");
}

export const config = {
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv,
    isProduction,
    corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3001',
    trustProxy,
  },
  database: {
    url: process.env.DATABASE_URL,
  },
  auth: {
    jwtSecret: JWT_SECRET,
    refreshTokenSecret: REFRESH_TOKEN_SECRET,
    accessTokenExpiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || '15m',
    refreshTokenExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d',
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
  },
  rateLimit: {
    authWindowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 min
    authMax: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '5', 10), // 5 attempts
  },
  email: {
    verificationExpiresIn: parseInt(process.env.EMAIL_VERIFICATION_EXPIRES_IN || '86400000', 10), // 24h
    fromAddress: process.env.EMAIL_FROM || 'noreply@ledger.local',
  },
  cookies: {
    secure: cookieSecure,
    sameSite,
  },
} as const;
