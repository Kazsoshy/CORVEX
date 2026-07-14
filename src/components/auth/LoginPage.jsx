import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { login as apiLogin, getEntryPathForRole } from '../../api/authService.js';
import logo from '../../assets/corvex-logo.png'; // Imported the logo
import './LoginPage.css';

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
      if (data.success && data.user) {
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
        setApiError('Cannot connect to server. Using offline mode.');
      } else {
        setApiError(msg || 'An error occurred. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }, [email, password, navigate]);

  return (
    <div className="login-page-container">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="login-glass-card"
      >
        {/* Logo Section */}
          <img src={logo} alt="Corvex Logo" className="login-logo-img"/>
       

        <h1 className="login-heading">CORVEX</h1>
        <p className="login-subtitle">
          Welcome back! Please sign in to your account.
        </p>




        <AnimatePresence>
          {apiError && (
            <motion.div 
              initial={{ opacity: 0, height: 0, marginBottom: 0 }}
              animate={{ opacity: 1, height: 'auto', marginBottom: 24 }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              className="login-api-error-box"
            >
              <AlertCircle size={18} />
              <span>{apiError}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <form onSubmit={handleLogin} noValidate className="login-form-wrapper">
          <div className="login-input-group">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Your email"
              className={`login-input ${errors.email ? 'has-error' : ''}`}
              autoComplete="username"
              disabled={loading}
            />
            <Mail size={18} className="login-input-icon" />
            {errors.email && <span className="login-error-message">{errors.email}</span>}
          </div>

          <div className="login-input-group">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className={`login-input ${errors.password ? 'has-error' : ''}`}
              autoComplete="current-password"
              disabled={loading}
            />
            <Lock size={18} className="login-input-icon" />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
            {errors.password && <span className="login-error-message">{errors.password}</span>}
          </div>

          <button 
            type="submit" 
            className="login-submit-button" 
            disabled={loading}
          >
            {loading ? (
              <span className="login-spinner" />
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        <div className="login-secondary-actions">
          <button className="login-link" onClick={() => navigate('/password-reset')}>
            Forgot Password
          </button>
          
          <div className="login-divider" />
          
          <button className="login-link" style={{ color: '#ffffff' }}>
            Create Account
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export default LoginPage;