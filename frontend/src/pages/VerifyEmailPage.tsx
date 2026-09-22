import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { authApi } from '../services/authApi';

/** Completes the verification link issued by the existing registration API. */
export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const request = useRef<{ token: string; promise: Promise<void> }>();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    if (!token) { setError('This verification link is missing its token. Open the complete link from your email.'); setStatus('error'); return; }
    if (request.current?.token !== token) request.current = { token, promise: authApi.verifyEmail(token) };
    request.current.promise.then(() => { if (active) setStatus('success'); }).catch((err: unknown) => { if (active) { setError(err instanceof Error ? err.message : 'Verification failed.'); setStatus('error'); } });
    return () => { active = false; };
  }, [token]);
  return <div className="login-page"><Link className="auth-wordmark" to="/login">ledger</Link><main className="login-page__content"><section className="login-page__panel"><p className="transaction-eyebrow">Account verification</p><h1 className="transaction-title">{status === 'success' ? 'Ready to begin.' : status === 'error' ? 'Check your link.' : 'Verifying…'}</h1>{status === 'error' ? <p className="transaction-error" role="alert">{error}</p> : <p className="transaction-intro" role="status">{status === 'success' ? 'Your email is verified. Sign in to start your record.' : 'Confirming your email address.'}</p>}<Link className="transaction-link" to="/login">Go to sign in →</Link></section></main></div>;
}
