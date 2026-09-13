/**
 * Login page — Entry Point to Ledger's institutional world.
 * Uses master background (ledger-master-bg.png) as the environment.
 * Content positioned in dark negative space on left side.
 * Preserves all existing functionality: dev persona selection, sign-in form.
 */
import { useState, type FormEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { MasterBackground } from '../components/MasterBackground';
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

  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const handleDevLogin = async (user: SeedUser) => {
    if (loading) return;
    setSelectedUser(user);
    setLoading(true);
    setError(null);
    await new Promise((r) => setTimeout(r, 300));
    signIn(user);
    navigate(from, { replace: true });
  };

  const handleFormSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;
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

  const personaCount = SEED_USERS.length;
  const personaTotal = String(personaCount).padStart(2, '0');
  const isDevPersonaMode = IS_DEV && personaCount > 0;

  let personaIndex = 0;
  const personaGroups = (Object.entries(SEED_USERS_BY_ROLE) as [string, SeedUser[]][]).map(([role, users]) => {
    return users.map((u) => {
      personaIndex += 1;
      return { user: u, role, index: personaIndex };
    });
  });

  return (
    <div className="login-page">
      <MasterBackground />

      <main className="login-page__content">
        <section className="login-page__panel">
          <header className="login-page__head">
            <div className="login-page__eyebrow">
              <span className="login-page__seal" aria-hidden="true" />
              <span>Folio 01 — Access Register</span>
              <span className="login-page__eyebrow-meta">{isDevPersonaMode ? personaTotal : 'Live'}</span>
            </div>
            <div className="login-page__rule" />
            <h1 className="login-page__wordmark">Ledger</h1>
            <p className="login-page__tagline">Records & Contracts</p>
            <h2 className="login-page__intro">Sign in to your account.</h2>
            {isDevPersonaMode && (
              <p className="login-page__intro-sub">
                Choose a development persona to enter the register instantly.
              </p>
            )}
          </header>

          {isDevPersonaMode ? (
            <div className="login-page__register">
              <div className="login-page__register-head">
                <span>Development Personas</span>
                <span className="login-page__count">{personaTotal}</span>
              </div>
              <div className="login-page__rule" />
              <div className="login-page__persona-list">
                {personaGroups.map((rows) => (
                  <div className="login-page__role" key={rows[0].role}>
                    <div className="login-page__role-label">{rows[0].role}</div>
                    <div className="login-page__persona-list">
                      {rows.map((row) => {
                        const isSelected = selectedUser?.id === row.user.id;
                        return (
                          <button
                            key={row.user.id}
                            type="button"
                            className={[
                              'login-page__persona-btn',
                              isSelected ? 'is-selected' : '',
                            ].join(' ')}
                            onClick={() => handleDevLogin(row.user)}
                            disabled={loading}
                            aria-current={isSelected ? 'true' : undefined}
                          >
                            <span className="login-page__index">{String(row.index).padStart(2, '0')}</span>
                            <span className="login-page__name">{row.user.name}</span>
                            <span className="login-page__email">{row.user.email}</span>
                            <span className="login-page__role-tag">{row.role}</span>
                            <span className="login-page__arrow">→</span>
                            {loading && isSelected && (
                              <span className="login-page__status" aria-live="polite">
                                Authenticating
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              {error && IS_DEV && (
                <div className="login-page__error" role="alert">
                  {error}
                </div>
              )}
            </div>
          ) : (
            <form className="login-page__register" onSubmit={handleFormSubmit} noValidate>
              <div className="login-page__register-head">
                <span>Secure Access</span>
                <span className="login-page__count">Live</span>
              </div>
              <div className="login-page__rule" />
              <div className="login-page__field">
                <label htmlFor="login-email">Email</label>
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>
              <div className="login-page__field">
                <label htmlFor="login-password">Password</label>
                <input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>
              {error && (
                <div className="login-page__error" role="alert">
                  {error}
                </div>
              )}
              <button type="submit" className="login-page__submit" disabled={loading}>
                {loading ? 'Authenticating…' : 'Sign in'}
              </button>
            </form>
          )}

          <footer className="login-page__foot">
            <span>Not yet a registered entry?</span>
            <a href="/register" className="login-page__register-link">
              Create one →
            </a>
          </footer>
        </section>
      </main>
    </div>
  );
}
