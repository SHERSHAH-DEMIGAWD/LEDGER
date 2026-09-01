/**
 * pages/RegisterPage.tsx
 *
 * Registration page for new users.
 *
 * Submits a real registration request to the backend. The backend creates
 * the user, sends a verification email, and (in the dev mock email service)
 * logs the verification URL to the server console.
 *
 * After successful registration the user is sent to a confirmation screen
 * that explains the email-verification step.
 */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

type Role = 'BRAND' | 'CREATOR';

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api';

export function RegisterPage() {
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('BRAND');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, role }),
      });

      const body = await res.json();

      if (!res.ok || !body.success) {
        setError(body.error?.message ?? 'Registration failed. Please try again.');
        return;
      }

      setSuccess(true);
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
      <div style={{ textAlign: 'center' }}>
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
          Create your Ledger account
        </h1>
      </div>

      <div
        style={{
          width: '100%',
          maxWidth: '420px',
          background: 'var(--color-parchment-warm)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--space-6)',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        {success ? (
          <div style={{ textAlign: 'center' }}>
            <p
              style={{
                fontSize: 'var(--text-md)',
                color: 'var(--color-text-primary)',
                margin: '0 0 var(--space-4)',
              }}
            >
              Account created
            </p>
            <p
              style={{
                fontSize: 'var(--text-sm)',
                color: 'var(--color-text-secondary)',
                margin: '0 0 var(--space-5)',
              }}
            >
              Check your email to verify the account. In development, the
              verification URL is logged to the server console.
            </p>
            <button
              onClick={() => navigate('/login')}
              style={{
                padding: '10px 16px',
                background: 'var(--color-institution-navy)',
                color: 'var(--color-text-on-dark)',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                fontWeight: 600,
                fontSize: 'var(--text-sm)',
                cursor: 'pointer',
              }}
            >
              Go to sign-in
            </button>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
          >
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
                autoComplete="new-password"
                required
                minLength={8}
                placeholder="At least 8 chars, with upper/lower/digit"
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

            <fieldset
              style={{
                border: 'none',
                padding: 0,
                margin: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-2)',
              }}
            >
              <legend style={{ fontSize: 'var(--text-sm)', fontWeight: 500, padding: 0 }}>
                Account type
              </legend>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                {(['BRAND', 'CREATOR'] as const).map((r) => (
                  <button
                    type="button"
                    key={r}
                    onClick={() => setRole(r)}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      background:
                        role === r
                          ? 'var(--color-institution-navy)'
                          : 'var(--color-parchment)',
                      color: role === r
                        ? 'var(--color-text-on-dark)'
                        : 'var(--color-text-primary)',
                      border: `1px solid ${
                        role === r
                          ? 'var(--color-institution-navy)'
                          : 'var(--color-border)'
                      }`,
                      borderRadius: 'var(--radius-sm)',
                      fontWeight: role === r ? 600 : 500,
                      fontSize: 'var(--text-sm)',
                      cursor: 'pointer',
                    }}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </fieldset>

            {error && (
              <div
                style={{
                  fontSize: 'var(--text-sm)',
                  color: 'var(--color-status-disputed)',
                  background: 'var(--color-status-disputed-bg)',
                  padding: 'var(--space-2) var(--space-3)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-status-disputed)',
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
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                fontWeight: 600,
                fontSize: 'var(--text-sm)',
                cursor: loading ? 'wait' : 'pointer',
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>
        )}
      </div>

      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-on-dark-secondary)', margin: 0 }}>
        Already have an account?{' '}
        <Link to="/login" style={{ color: 'var(--color-gold-pale)', textDecoration: 'underline' }}>
          Sign in
        </Link>
      </p>
    </div>
  );
}
