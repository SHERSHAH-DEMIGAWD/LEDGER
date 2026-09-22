import { useState } from 'react';
import { Link } from 'react-router-dom';
import { authApi } from '../services/authApi';

export function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'BRAND' | 'CREATOR'>('BRAND');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (loading) return;
    setLoading(true); setError(null);
    try { await authApi.register({ email: email.trim(), password, role }); setSuccess(true); }
    catch (err) { setError(err instanceof Error ? err.message : 'Registration failed. Please try again.'); }
    finally { setLoading(false); }
  }
  return (
    <div className="login-page">
      <Link to="/login" className="auth-wordmark">ledger</Link>
      <main className="login-page__content">
        <section className="login-page__panel" aria-labelledby="register-title">
          <header className="login-page__head"><p className="transaction-eyebrow">Begin a shared record</p><h1 id="register-title" className="transaction-title">{success ? 'You’re on record.' : 'Good work. Clear terms.'}</h1><p className="transaction-intro">{success ? 'Check your email to verify your account, then sign in to Ledger.' : 'An account for the agreements you make and the work you put into them.'}</p></header>
          {success ? <div role="status"><p className="transaction-note">Verification sent to {email}.</p><Link className="transaction-button transaction-button--primary" to="/login">Go to sign in →</Link></div> : <form onSubmit={submit} className="login-page__register">
            <div className="transaction-field"><label htmlFor="register-email">Email address</label><input id="register-email" type="email" required autoComplete="email" disabled={loading} value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div className="transaction-field"><label htmlFor="register-password">Password</label><input id="register-password" type="password" autoComplete="new-password" required minLength={8} disabled={loading} value={password} onChange={(e) => setPassword(e.target.value)} aria-describedby="password-hint" /><span id="password-hint" className="transaction-field-hint">At least 8 characters, including uppercase, lowercase and a number.</span></div>
            <fieldset className="auth-role"><legend>I’m joining as a</legend><div>{(['BRAND', 'CREATOR'] as const).map((value) => <label key={value}><input type="radio" name="role" value={value} checked={role === value} disabled={loading} onChange={() => setRole(value)} />{value === 'BRAND' ? 'Brand' : 'Creator'}</label>)}</div></fieldset>
            {error && <div className="transaction-error" role="alert">{error}</div>}
            <button type="submit" className="transaction-button transaction-button--primary" disabled={loading} aria-busy={loading}>{loading ? 'Creating account…' : 'Create account →'}</button>
          </form>}
          <p className="login-page__foot">Already on record? <Link className="transaction-link" to="/login">Sign in →</Link></p>
        </section>
      </main>
      <p className="auth-caption">People. Work. Value. <span>On record.</span></p>
    </div>
  );
}
