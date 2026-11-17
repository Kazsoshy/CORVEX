import React, { useState, useCallback, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Lock, Eye, EyeOff, AlertCircle, ArrowRight } from 'lucide-react';
import {
  login as apiLogin,
  getEntryPathForRole,
  getCurrentUser,
  completeRequiredPasswordChange,
  logout as clearSession,
} from '../../api/authService.js';
import { consumeAuthNotice } from '../../api/sessionActivity.js';
import whiteLogo from '../../assets/corvex-logo.png';
import bgImage from '../../assets/corvex-bg.png';
import './LoginPage.css';

const fieldIconProps = {
  size: 18,
  strokeWidth: 1.75,
  className: 'login-field-icon',
  'aria-hidden': true,
};

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [loading, setLoading] = useState(false);

  const [mustChange, setMustChange] = useState(() => {
    const stored = getCurrentUser();
    return Boolean(stored?.mustChangePassword && localStorage.getItem('corvex_token'));
  });
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    const notice = consumeAuthNotice();
    if (notice) setApiError(notice);
  }, []);

  const handlePasswordChange = useCallback(async (e) => {
    e?.preventDefault();
    const next = {};
    if (!currentPassword) next.currentPassword = 'Enter the temporary password you were given';
    if (newPassword.length < 8) next.newPassword = 'Use at least 8 characters';
    else if (newPassword === currentPassword) next.newPassword = 'Choose a password different from the temporary one';
    if (confirmPassword !== newPassword) next.confirmPassword = 'Passwords do not match';
    setErrors(next);
    if (Object.keys(next).length) return;

    setApiError('');
    setLoading(true);
    try {
      await completeRequiredPasswordChange(currentPassword, newPassword, confirmPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      navigate(getEntryPathForRole(getCurrentUser()?.role?.slug));
    } catch (err) {
      if (!err?.response) setApiError('Cannot connect to the server.');
      else if (err.response.status === 401 && !localStorage.getItem('corvex_token')) {
        setMustChange(false);
        setApiError(err.response.data?.message || 'Your session ended. Sign in again with your temporary password.');
      } else {
        setApiError(err.response.data?.message || 'Could not update your password.');
      }
    } finally {
      setLoading(false);
    }
  }, [currentPassword, newPassword, confirmPassword, navigate]);

  const cancelPasswordChange = () => {
    clearSession();
    setMustChange(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setErrors({});
    setApiError('');
  };

  const handleLogin = useCallback(async (e) => {
    e?.preventDefault();
    const newErrors = {};
    if (!email.trim()) newErrors.email = 'Email is required';
    if (!password.trim()) newErrors.password = 'Password is required';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    setApiError('');
    setLoading(true);

    try {
      const data = await apiLogin(email.trim(), password);
      if (data.success && data.user && data.token && data.user.mustChangePassword) {
        setCurrentPassword(password);
        setPassword('');
        setMustChange(true);
      } else if (data.success && data.user && data.token) {
        const entryPath = getEntryPathForRole(data.user.role?.slug);
        navigate(entryPath);
      } else {
        setApiError(data.message || 'Login failed. Please try again.');
      }
    } catch (err) {
      const msg = err?.response?.data?.message;
      if (err?.response?.status === 401 || err?.response?.status === 403) {
        setApiError(msg || 'Invalid email or password.');
      } else if (!err?.response) {
        setApiError('Cannot connect to the server.');
      } else {
        setApiError(msg || 'An error occurred. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }, [email, password, navigate]);

  return (
    <div className="login-page login-page--split">
      <div className="login-shell login-shell--split">
        <aside className="login-visual" aria-label="CORVEX branding">
          <img
            src={bgImage}
            alt="CORVEX commercial furniture showroom interior"
            className="login-visual-image"
          />
          <div className="login-visual-overlay" aria-hidden="true" />

          <Link to="/" className="login-visual-brand" aria-label="Go to CORVEX landing page">
            <div className="login-visual-logo-wrap">
              <img src={whiteLogo} alt="CORVEX logo" className="login-visual-logo" />
            </div>
            <div className="login-visual-brand-text">
              <span className="login-visual-brand-name">CORVEX</span>
            </div>
          </Link>

          <div className="login-visual-copy">
            <h2 className="login-visual-headline">
              Smarter Operations.
              <br />
              Stronger Supply Chains.
            </h2>
            <p className="login-visual-sub">
              CORVEX helps you manage inventory, track field operations, and keep your business moving forward.
            </p>
          </div>
        </aside>

        <div className="login-form-panel">
          <motion.div
            className="login-form-inner"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="login-form-header">
              <h1 className="login-heading">{mustChange ? 'Set your password' : 'Welcome back'}</h1>
              <p className="login-subtitle">
                {mustChange
                  ? 'You signed in with a temporary password. Choose your own password to continue.'
                  : 'Sign in to continue to your Corvex account.'}
              </p>
            </div>

            <AnimatePresence>
              {apiError && (
                <motion.div
                  initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                  animate={{ opacity: 1, height: 'auto', marginBottom: 20 }}
                  exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                  className="login-api-error-box"
                  role="alert"
                >
                  <AlertCircle size={18} className="shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{apiError}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {mustChange ? (
              <form onSubmit={handlePasswordChange} noValidate className="login-form-wrapper">
                {[
                  { id: 'currentPassword', label: 'Temporary password', value: currentPassword, set: setCurrentPassword, auto: 'current-password' },
                  { id: 'newPassword', label: 'New password', value: newPassword, set: setNewPassword, auto: 'new-password' },
                  { id: 'confirmPassword', label: 'Confirm new password', value: confirmPassword, set: setConfirmPassword, auto: 'new-password' },
                ].map((field) => (
                  <div className="login-input-group" key={field.id}>
                    <label htmlFor={`pw-${field.id}`} className="login-label">{field.label}</label>
                    <div className="login-input-control group">
                      <span className="login-input-icon">
                        <Lock {...fieldIconProps} />
                      </span>
                      <input
                        id={`pw-${field.id}`}
                        type={showPassword ? 'text' : 'password'}
                        value={field.value}
                        onChange={(e) => field.set(e.target.value)}
                        className={`login-input login-input-password ${errors[field.id] ? 'has-error' : ''}`}
                        autoComplete={field.auto}
                        disabled={loading}
                        aria-invalid={!!errors[field.id]}
                      />
                      {field.id === 'newPassword' ? (
                        <button
                          type="button"
                          className="password-toggle"
                          onClick={() => setShowPassword(!showPassword)}
                          aria-label={showPassword ? 'Hide passwords' : 'Show passwords'}
                        >
                          {showPassword ? <EyeOff {...fieldIconProps} /> : <Eye {...fieldIconProps} />}
                        </button>
                      ) : null}
                    </div>
                    {errors[field.id] && (
                      <span className="login-error-message" role="alert">{errors[field.id]}</span>
                    )}
                  </div>
                ))}
                <button type="submit" className="login-submit-button" disabled={loading}>
                  {loading ? <span className="login-spinner" aria-hidden="true" /> : (
                    <>
                      <span>Save password and continue</span>
                      <ArrowRight size={18} strokeWidth={2} aria-hidden="true" />
                    </>
                  )}
                </button>
                <button type="button" className="login-link" onClick={cancelPasswordChange} disabled={loading}>
                  Back to sign in
                </button>
              </form>
            ) : (
            <form onSubmit={handleLogin} noValidate className="login-form-wrapper">
              <div className="login-input-group">
                <label htmlFor="login-email" className="login-label">Email</label>
                <div className="login-input-control group">
                  <span className="login-input-icon">
                    <Mail {...fieldIconProps} />
                  </span>
                  <input
                    id="login-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email address"
                    className={`login-input ${errors.email ? 'has-error' : ''}`}
                    autoComplete="username"
                    disabled={loading}
                    aria-invalid={!!errors.email}
                    aria-describedby={errors.email ? 'login-email-error' : undefined}
                  />
                </div>
                {errors.email && (
                  <span id="login-email-error" className="login-error-message" role="alert">
                    {errors.email}
                  </span>
                )}
              </div>

              <div className="login-input-group">
                <div className="login-label-row">
                  <label htmlFor="login-password" className="login-label">Password</label>
                  <button
                    type="button"
                    className="login-link login-forgot"
                    onClick={() => navigate('/password-reset')}
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="login-input-control group">
                  <span className="login-input-icon">
                    <Lock {...fieldIconProps} />
                  </span>
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className={`login-input login-input-password ${errors.password ? 'has-error' : ''}`}
                    autoComplete="current-password"
                    disabled={loading}
                    aria-invalid={!!errors.password}
                    aria-describedby={errors.password ? 'login-password-error' : undefined}
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff {...fieldIconProps} /> : <Eye {...fieldIconProps} />}
                  </button>
                </div>
                {errors.password && (
                  <span id="login-password-error" className="login-error-message" role="alert">
                    {errors.password}
                  </span>
                )}
              </div>

              <button
                type="submit"
                className="login-submit-button"
                disabled={loading}
              >
                {loading ? (
                  <span className="login-spinner" aria-hidden="true" />
                ) : (
                  <>
                    <span>Sign In</span>
                    <ArrowRight size={18} strokeWidth={2} aria-hidden="true" />
                  </>
                )}
              </button>
            </form>
            )}

            <p className="login-secure-note">
              <Lock size={13} strokeWidth={2} aria-hidden="true" />
              <span>Your account is secure and protected.</span>
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
