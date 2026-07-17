import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { login as apiLogin, getEntryPathForRole } from '../../api/authService.js';
import logo from '../../assets/corvex-logo.png'; // Imported the logo
import './LoginPage.css';

// ── Offline demo accounts ─────────────────────────────────────────────────────
// Used when the backend is unreachable. Mirrors reset_passwords.js credentials.
const OFFLINE_CREDENTIALS = {
  'marcus.santos@corvex.ph':      'SuperAdmin@2026',
  'corazon.v@corvex.ph':          'SuperAdmin@2026',
  'elena.mercado@corvex.ph':      'OpManager@2026',
  'roberto.villanueva@corvex.ph': 'BranchMgr@2026',
  'miguel.f@corvex.ph':           'BranchMgr@2026',
  'grace.t@corvex.ph':            'BranchMgr@2026',
  'ana.r@corvex.ph':              'InvStaff@2026',
  'florencia.r@corvex.ph':        'InvStaff@2026',
  'carlos.m@corvex.ph':           'Sales@2026',
  'jane.s@corvex.ph':             'Sales@2026',
  'maria.dc@corvex.ph':           'Collector@2026',
  'luntiang.tahanan@email.com':   'Client@2026',
};

const OFFLINE_USERS = [
  // Super Admins
  {
    id: 1, fullName: 'Marcus Santos', username: 'marcus.santos',
    email: 'marcus.santos@corvex.ph', employeeId: 'SA-0001', avatarInitials: 'MS', status: 'Active',
    role: { id: 1, name: 'Super Admin', slug: 'super_admin' }, branch: null,
  },
  {
    id: 2, fullName: 'Corazon Villanueva', username: 'corazon.v',
    email: 'corazon.v@corvex.ph', employeeId: 'SA-0002', avatarInitials: 'CV', status: 'Active',
    role: { id: 1, name: 'Super Admin', slug: 'super_admin' }, branch: null,
  },
  // Operating Managers
  {
    id: 3, fullName: 'Elena Mercado', username: 'elena.mercado',
    email: 'elena.mercado@corvex.ph', employeeId: 'OM-2001', avatarInitials: 'EM', status: 'Active',
    role: { id: 2, name: 'Operating Manager', slug: 'operating_manager' }, branch: null,
  },
  // Branch Managers
  {
    id: 10, fullName: 'Roberto Villanueva', username: 'roberto.v',
    email: 'roberto.villanueva@corvex.ph', employeeId: 'BM-0001', avatarInitials: 'RV', status: 'Active',
    role: { id: 7, name: 'Branch Manager', slug: 'branch_manager' },
    branch: { id: 1, name: 'Davao City Branch' },
  },
  {
    id: 11, fullName: 'Miguel Flores', username: 'miguel.flores',
    email: 'miguel.f@corvex.ph', employeeId: 'BM-0002', avatarInitials: 'MF', status: 'Active',
    role: { id: 7, name: 'Branch Manager', slug: 'branch_manager' },
    branch: { id: 2, name: 'General Santos Branch' },
  },
  {
    id: 12, fullName: 'Grace Tan', username: 'grace.tan',
    email: 'grace.t@corvex.ph', employeeId: 'BM-0003', avatarInitials: 'GT', status: 'Active',
    role: { id: 7, name: 'Branch Manager', slug: 'branch_manager' },
    branch: { id: 3, name: 'Davao Oriental Branch' },
  },
  // Inventory Staff
  {
    id: 20, fullName: 'Ana Reyes', username: 'ana.reyes',
    email: 'ana.r@corvex.ph', employeeId: 'WH-3051', avatarInitials: 'AR', status: 'Active',
    role: { id: 3, name: 'Inventory Staff', slug: 'inventory_staff' },
    branch: { id: 3, name: 'Davao Oriental Branch' },
  },
  {
    id: 21, fullName: 'Florencia Ramos', username: 'florencia.ramos',
    email: 'florencia.r@corvex.ph', employeeId: 'WH-3053', avatarInitials: 'FR', status: 'Active',
    role: { id: 3, name: 'Inventory Staff', slug: 'inventory_staff' },
    branch: { id: 1, name: 'Davao City Branch' },
  },
  // Sales Staff
  {
    id: 22, fullName: 'Carlos Mendoza', username: 'carlos.mendoza',
    email: 'carlos.m@corvex.ph', employeeId: 'SA-1087', avatarInitials: 'CM', status: 'Active',
    role: { id: 4, name: 'Sales Staff', slug: 'sales_staff' },
    branch: { id: 2, name: 'General Santos Branch' },
  },
  {
    id: 23, fullName: 'Jane Smith', username: 'jane.smith',
    email: 'jane.s@corvex.ph', employeeId: 'SA-1088', avatarInitials: 'JS', status: 'Active',
    role: { id: 4, name: 'Sales Staff', slug: 'sales_staff' },
    branch: { id: 1, name: 'Davao City Branch' },
  },
  // Collector
  {
    id: 24, fullName: 'Maria Dela Cruz', username: 'maria.delacruz',
    email: 'maria.dc@corvex.ph', employeeId: 'COL-2048', avatarInitials: 'MD', status: 'Active',
    role: { id: 5, name: 'Collector', slug: 'collector' },
    branch: { id: 1, name: 'Davao City Branch' },
  },
  // Client
  {
    id: 25, fullName: 'Luntiang Tahanan Interiors', username: 'luntiang.tahanan',
    email: 'luntiang.tahanan@email.com', employeeId: null, avatarInitials: 'LT', status: 'Active',
    role: { id: 6, name: 'Client', slug: 'client' },
    branch: { id: 1, name: 'Davao City Branch' },
  },
];

function resolveOfflineUser(email, password) {
  const lowerEmail = email.toLowerCase();
  const expectedPassword = OFFLINE_CREDENTIALS[lowerEmail];
  if (!expectedPassword || password !== expectedPassword) return null;
  return OFFLINE_USERS.find((u) => u.email.toLowerCase() === lowerEmail) ?? null;
}
// ─────────────────────────────────────────────────────────────────────────────

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
        // Server unreachable — attempt offline demo login
        const offlineUser = resolveOfflineUser(email.trim(), password);
        if (offlineUser) {
          localStorage.setItem('corvex_user', JSON.stringify(offlineUser));
          navigate(getEntryPathForRole(offlineUser.role.slug));
        } else {
          setApiError('Cannot connect to server. Use a demo account (e.g. roberto.villanueva@corvex.ph / BranchMgr@2026).');
        }
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