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
        background: 'var(--color-surface-base)',
        gap: 'var(--space-6)',
      }}
    >
      {/* Logo / heading */}
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 'var(--space-2)',
            marginBottom: 'var(--space-3)',
          }}
        >
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="6" fill="var(--color-surface-3)" />
            <path
              d="M8 10h16M8 16h12M8 22h8"
              stroke="var(--color-text-primary)"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          <span style={{ fontWeight: 600, fontSize: 'var(--text-lg)' }}>
            Ledger
          </span>
        </div>
        <h1
          style={{
            fontSize: 'var(--text-xl)',
            fontWeight: 700,
            margin: 0,
            color: 'var(--color-text-primary)',
          }}
        >
          Sign in to your account
        </h1>
      </div>

      {/* Card */}
      <div
        style={{
          width: '100%',
          maxWidth: '480px',
          background: 'var(--color-surface-1)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-6)',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        {IS_DEV && SEED_USERS.length > 0 ? (
          <>
            <p
              style={{
                fontSize: 'var(--text-sm)',
                color: 'var(--color-text-secondary)',
                margin: '0 0 var(--space-4)',
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
                        letterSpacing: '0.06em',
                        color: 'var(--color-text-muted)',
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
                            padding: '10px 12px',
                            background:
                              selectedUser?.id === u.id
                                ? 'var(--color-surface-3)'
                                : 'var(--color-surface-2)',
                            border: `1px solid ${
                              selectedUser?.id === u.id
                                ? 'var(--color-accent)'
                                : 'var(--color-border)'
                            }`,
                            borderRadius: 'var(--radius-md)',
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
                              color: 'var(--color-text-muted)',
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
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                style={{
                  padding: '8px 12px',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--text-sm)',
                  background: 'var(--color-surface-base)',
                  color: 'var(--color-text-primary)',
                }}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                style={{
                  padding: '8px 12px',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--text-sm)',
                  background: 'var(--color-surface-base)',
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
                background: 'var(--color-accent)',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                fontWeight: 600,
                fontSize: 'var(--text-sm)',
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
              color: 'var(--color-error)',
            }}
          >
            {error}
          </div>
        )}
      </div>

      {/* Register link */}
      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)', margin: 0 }}>
        Don&apos;t have an account?{' '}
        <a href="/register" style={{ color: 'var(--color-accent)', textDecoration: 'underline' }}>
          Create one
        </a>
      </p>
    </div>
  );
}
