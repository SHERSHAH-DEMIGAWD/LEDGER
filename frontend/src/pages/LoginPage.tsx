import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { authApi } from '../services/authApi';
import { DEV_PERSONAS_ENABLED } from '../services/auth';
import { SEED_USERS } from '../config/seedUsers';

export function LoginPage() {
  const { user, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const destination = (location.state as { from?: string } | null)?.from;
  const from = destination?.startsWith('/') && !destination.startsWith('//') ? destination : '/';
  if (user) return <Navigate to={from} replace />;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const result = await authApi.login(email.trim(), password);
      signIn({ ...result.user, name: result.user.name || result.user.email.split('@')[0], password: '', blurb: result.user.role }, { accessToken: result.accessToken });
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed. Please try again.');
    } finally { setLoading(false); }
  }
  return (
    <div className="login-page">
      <Link to="/login" className="auth-wordmark" aria-label="Ledger sign in">ledger</Link>
      <main className="login-page__content">
        <section className="login-page__panel" aria-labelledby="login-title">
          <header className="login-page__head">
            <p className="transaction-eyebrow">Trust, on record</p>
            <h1 id="login-title" className="transaction-title">Welcome<br />back.</h1>
            <p className="transaction-intro">A shared record.<br />A clearer way to work together.</p>
          </header>
          <form onSubmit={submit} className="login-page__register">
            <div className="transaction-field"><label htmlFor="login-email">Email address</label><input id="login-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} disabled={loading} /></div>
            <div className="transaction-field"><label htmlFor="login-password">Password</label><input id="login-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} disabled={loading} /></div>
            {error && <div className="transaction-error" role="alert">{error}</div>}
            <button className="transaction-button transaction-button--primary" type="submit" disabled={loading} aria-busy={loading}>{loading ? 'Signing in…' : 'Sign in →'}</button>
          </form>
          <p className="login-page__foot">New to Ledger? <Link className="transaction-link" to="/register">Create an account →</Link></p>
          {DEV_PERSONAS_ENABLED && <details className="auth-personas"><summary>Development personas</summary>{SEED_USERS.map((persona) => <button type="button" key={persona.id} disabled={loading} onClick={() => { signIn(persona); navigate(from, { replace: true }); }}>{persona.name}<span>{persona.role}</span></button>)}</details>}
        </section>
      </main>
      <p className="auth-caption">People. Work. Value. <span>On record.</span></p>
    </div>
  );
}
