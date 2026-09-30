import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { activatePortalAccount, fetchPortalInvitation } from '../../api/customerPortalService.js';
import logo from '../../assets/corvex-logo.png';
import './LoginPage.css';

export function ActivatePortalPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const navigate = useNavigate();
  const [invite, setInvite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    async function load() {
      if (!token) {
        setError('Missing activation token.');
        setLoading(false);
        return;
      }
      const result = await fetchPortalInvitation(token);
      if (result.success) {
        setInvite(result.data);
      } else {
        setError(result.message || 'Invalid activation link.');
      }
      setLoading(false);
    }
    load();
  }, [token]);

  async function handleActivate(e) {
    e.preventDefault();
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    setError('');
    const result = await activatePortalAccount({
      token,
      password,
      confirm_password: confirmPassword,
    });
    setSubmitting(false);
    if (!result.success) {
      setError(result.message || 'Activation failed.');
      return;
    }
    setDone(true);
  }

  return (
    <div className="login-page">
      <div className="login-shell" style={{ maxWidth: 480 }}>
        <div className="login-form-panel" style={{ width: '100%' }}>
          <img src={logo} alt="Corvex" style={{ height: 40, marginBottom: 16 }} />
          <h2>Activate Customer Portal</h2>
          {loading ? <p className="muted">Validating invitation…</p> : null}
          {!loading && error && !invite && !done ? (
            <p className="form-error" role="alert">{error}</p>
          ) : null}
          {done ? (
            <>
              <p>Your account is active. Sign in with your email and the password you just created.</p>
              <button type="button" className="button" onClick={() => navigate('/login')}>Go to Login</button>
            </>
          ) : null}
          {!loading && invite && !done ? (
            <>
              <p className="muted">
                Account <strong>{invite.customerCode}</strong> ({invite.customerName}) was registered by your sales representative.
                Create your password to access the customer portal.
              </p>
              <p><strong>Email:</strong> {invite.email}</p>
              <form onSubmit={handleActivate}>
                <label>
                  Password
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
                </label>
                <label>
                  Confirm password
                  <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" />
                </label>
                {error ? <p className="form-error" role="alert">{error}</p> : null}
                <button type="submit" className="button" disabled={submitting}>
                  {submitting ? 'Activating…' : 'Activate My Account'}
                </button>
              </form>
            </>
          ) : null}
          <p style={{ marginTop: 24 }}>
            <Link to="/login">Back to login</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
