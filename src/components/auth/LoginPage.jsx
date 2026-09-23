import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { login as apiLogin, getEntryPathForRole } from '../../api/authService.js';
import logo from '../../assets/corvex-logo.png';
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
      if (data.success && data.user && data.token) {
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
    <div className="login-page">
      <div className="login-page-backdrop" aria-hidden="true">
        <img src={bgImage} alt="" className="login-page-backdrop-image" />
        <div className="login-page-backdrop-overlay" />
      </div>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        className="login-shell"
      >
        <aside className="login-visual" aria-hidden="true">
          <img src={bgImage} alt="" className="login-visual-image" />
          <div className="login-visual-overlay" />
          <div className="login-visual-brand">
            <img src={logo} alt="Corvex" className="login-visual-logo" />
            <span>CORVEX</span>
          </div>
        </aside>

        <div className="login-form-panel">
          <div className="login-form-inner">
            <div className="login-brand-row">
              </div>

            <h1 className="login-heading">Welcome back</h1>
            <p className="login-subtitle">
              Sign in to continue to your Corvex account.
            </p>

            <AnimatePresence>
              {apiError && (
                <motion.div
                  initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                  animate={{ opacity: 1, height: 'auto', marginBottom: 20 }}
                  exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                  className="login-api-error-box"
                >
                  <AlertCircle size={18} className="shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{apiError}</span>
                </motion.div>
              )}
            </AnimatePresence>

            <form onSubmit={handleLogin} noValidate className="login-form-wrapper">
              <div className="login-input-group">
                <label htmlFor="login-email" className="login-label">Email</label>
                <div className="relative w-full group">
                  <span className="login-input-icon">
                    <Mail {...fieldIconProps} />
                  </span>
                  <input
                    id="login-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email"
                    className={`login-input ${errors.email ? 'has-error' : ''}`}
                    autoComplete="username"
                    disabled={loading}
                  />
                </div>
                {errors.email && <span className="login-error-message">{errors.email}</span>}
              </div>

              <div className="login-input-group">
                <label htmlFor="login-password" className="login-label">Password</label>
                <div className="relative w-full group">
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
                {errors.password && <span className="login-error-message">{errors.password}</span>}
                <button
                  type="button"
                  className="login-link login-forgot"
                  onClick={() => navigate('/password-reset')}
                >
                  Forgot password?
                </button>
              </div>

              <button
                type="submit"
                className="login-submit-button"
                disabled={loading}
              >
                {loading ? <span className="login-spinner" aria-hidden="true" /> : 'Sign In'}
              </button>
            </form>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default LoginPage;
