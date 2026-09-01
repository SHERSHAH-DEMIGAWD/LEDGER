/**
 * pages/LoginPage.tsx
 *
 * Login page with persona quick-select for development.
 *
 * UX: When the user is not signed in, the app redirects here. The page shows
 * a list of seed users grouped by role so the developer can "log in" as any
 * persona with a single click. No password entry is needed in dev mode.
 *
 * In production (no seed users), a regular email/password form is shown.
 */

import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  SEED_USERS,
  SEED_USERS_BY_ROLE,
  type SeedUser,
} from '../config/seedUsers';

const IS_DEV = import.meta.env.DEV;

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn } = useAuth();

  const [selectedUser, setSelectedUser] = useState<SeedUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Where to send the user after a successful login.
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const handleDevLogin = async (user: SeedUser) => {
    setSelectedUser(user);
    setLoading(true);
    setError(null);

    // Simulate a brief network delay so the button gives feedback.
    await new Promise((r) => setTimeout(r, 300));

    signIn(user);
    navigate(from, { replace: true });
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Email and password are required.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        credentials: 'include',
      });

      const body = await res.json();

      if (!res.ok || !body.success) {
        setError(body.error?.message ?? 'Login failed. Please try again.');
        return;
      }

      const { accessToken, user: userData } = body.data;

      // Find matching seed user for display name (if any).
      const seedUser = SEED_USERS.find((u) => u.email === userData.email);

      signIn(
        seedUser ?? {
          id: userData.id,
          email: userData.email,
          name: userData.email.split('@')[0],
          role: userData.role,
          password: '',
          blurb: userData.role,
        },
        { accessToken },
      );

      navigate(from, { replace: true });
    } catch {
      setError('Unable to reach the server. Is the backend running?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-6)',
        background: 'var(--color-institution-navy)',
        gap: 'var(--space-6)',
      }}
    >
      {/* Logo / heading */}
      <div style={{ textAlign: 'center' }}>
        {/* Ledger institutional seal */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 'var(--space-3)',
            marginBottom: 'var(--space-4)',
          }}
        >
          <svg width="44" height="44" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="22" stroke="var(--color-gold)" strokeWidth="1.5" opacity="0.7" />
            <circle cx="24" cy="24" r="18" stroke="var(--color-gold)" strokeWidth="0.75" opacity="0.4" />
            <rect x="12" y="14" width="24" height="20" rx="1.5" stroke="var(--color-gold)" strokeWidth="1.5" fill="none" />
            <line x1="12" y1="20" x2="36" y2="20" stroke="var(--color-gold)" strokeWidth="1" opacity="0.7" />
            <line x1="16" y1="24" x2="30" y2="24" stroke="var(--color-gold)" strokeWidth="0.75" opacity="0.5" />
            <line x1="16" y1="28" x2="28" y2="28" stroke="var(--color-gold)" strokeWidth="0.75" opacity="0.5" />
          </svg>
          <div style={{ textAlign: 'left' }}>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--text-2xl)',
                fontWeight: 600,
                color: 'var(--color-text-on-dark)',
                lineHeight: 1.1,
              }}
            >
              Ledger
            </div>
            <div
              style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--color-gold)',
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                marginTop: 2,
              }}
            >
              Records &amp; Contracts
            </div>
          </div>
        </div>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--text-xl)',
            fontWeight: 600,
            margin: 0,
            color: 'var(--color-text-on-dark)',
            letterSpacing: '-0.01em',
          }}
        >
          Sign in to your account
        </h1>
      </div>

      {/* Card — parchment on navy */}
      <div
        style={{
          width: '100%',
          maxWidth: '480px',
          background: 'var(--color-parchment-cream)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-sm)',
          padding: 'var(--space-6)',
          boxShadow: 'var(--shadow-xl)',
          position: 'relative',
        }}
      >
        {/* Subtle corner ornament */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: 40,
            height: 40,
            overflow: 'hidden',
            pointerEvents: 'none',
          }}
          aria-hidden
        >
          <div
            style={{
              position: 'absolute',
              top: -1,
              right: -1,
              width: 24,
              height: 24,
              borderTop: '1px solid var(--color-gold)',
              borderRight: '1px solid var(--color-gold)',
              opacity: 0.3,
            }}
          />
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            width: 40,
            height: 40,
            overflow: 'hidden',
            pointerEvents: 'none',
          }}
          aria-hidden
        >
          <div
            style={{
              position: 'absolute',
              bottom: -1,
              left: -1,
              width: 24,
              height: 24,
              borderBottom: '1px solid var(--color-gold)',
              borderLeft: '1px solid var(--color-gold)',
              opacity: 0.3,
            }}
          />
        </div>
        {IS_DEV && SEED_USERS.length > 0 ? (
          <>
            {/* Archival section header for dev list */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                marginBottom: 'var(--space-3)',
              }}
            >
              <div
                style={{
                  width: 4,
                  height: 4,
                  background: 'var(--color-gold)',
                  borderRadius: '50%',
                }}
              />
              <span
                style={{
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.14em',
                  color: 'var(--color-text-tertiary)',
                }}
              >
                Development Personas
              </span>
            </div>
            <p
              style={{
                fontSize: 'var(--text-sm)',
                color: 'var(--color-text-secondary)',
                margin: '0 0 var(--space-4)',
                fontStyle: 'italic',
              }}
            >
              Click any persona below to sign in instantly. No password needed in
              development.
            </p>

            {/* Dev: role-grouped persona list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              {(Object.entries(SEED_USERS_BY_ROLE) as [string, SeedUser[]][]).map(
                ([role, users]) => (
                  <div key={role}>
                    <div
                      style={{
                        fontSize: 'var(--text-xs)',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        color: 'var(--color-text-tertiary)',
                        marginBottom: 'var(--space-2)',
                      }}
                    >
                      {role}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                      {users.map((u) => (
                        <button
                          key={u.id}
                          onClick={() => handleDevLogin(u)}
                          disabled={loading}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            width: '100%',
                            padding: '9px 12px',
                            background:
                              selectedUser?.id === u.id
                                ? 'var(--color-surface-3)'
                                : 'var(--color-parchment-warm)',
                            border: `1px solid ${
                              selectedUser?.id === u.id
                                ? 'var(--color-gold)'
                                : 'var(--color-border)'
                            }`,
                            borderRadius: 'var(--radius-sm)',
                            cursor: loading ? 'wait' : 'pointer',
                            textAlign: 'left',
                            transition: 'all 0.15s',
                            opacity: loading && selectedUser?.id !== u.id ? 0.5 : 1,
                          }}
                        >
                          <div>
                            <div
                              style={{
                                fontSize: 'var(--text-sm)',
                                fontWeight: 500,
                                color: 'var(--color-text-primary)',
                              }}
                            >
                              {u.name}
                            </div>
                            <div
                              style={{
                                fontSize: 'var(--text-xs)',
                                color: 'var(--color-text-tertiary)',
                              }}
                            >
                              {u.email}
                            </div>
                          </div>
                          <div
                            style={{
                              fontSize: 'var(--text-xs)',
                              color: 'var(--color-text-faint)',
                              textTransform: 'uppercase',
                              letterSpacing: '0.04em',
                            }}
                          >
                            {u.blurb}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ),
              )}
            </div>
          </>
        ) : (
          // Production: real email/password form
          <form onSubmit={handleFormSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--color-text-secondary)' }}>Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                style={{
                  padding: '8px 12px',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 'var(--text-sm)',
                  background: 'var(--color-parchment-warm)',
                  color: 'var(--color-text-primary)',
                }}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--color-text-secondary)' }}>Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                style={{
                  padding: '8px 12px',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 'var(--text-sm)',
                  background: 'var(--color-parchment-warm)',
                  color: 'var(--color-text-primary)',
                }}
              />
            </label>

            {error && (
              <div
                style={{
                  fontSize: 'var(--text-sm)',
                  color: 'var(--color-error)',
                  background: 'color-mix(in srgb, var(--color-error) 10%, transparent)',
                  padding: 'var(--space-2) var(--space-3)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid color-mix(in srgb, var(--color-error) 30%, transparent)',
                }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '10px 16px',
                background: 'var(--color-institution-navy)',
                color: 'var(--color-text-on-dark)',
                border: '1px solid var(--color-institution-navy)',
                borderRadius: 'var(--radius-sm)',
                fontWeight: 500,
                fontSize: 'var(--text-sm)',
                letterSpacing: '0.02em',
                cursor: loading ? 'wait' : 'pointer',
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        )}

        {/* Error banner for dev mode */}
        {error && IS_DEV && (
          <div
            style={{
              marginTop: 'var(--space-3)',
              fontSize: 'var(--text-sm)',
              color: 'var(--color-status-disputed)',
            }}
          >
            {error}
          </div>
        )}
      </div>

      {/* Register link */}
      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-on-dark-secondary)', margin: 0 }}>
        Don&apos;t have an account?{' '}
        <a href="/register" style={{ color: 'var(--color-gold-pale)', textDecoration: 'underline' }}>
          Create one
        </a>
      </p>
    </div>
  );
}
