import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { login as apiLogin, getEntryPathForRole } from '../../api/authService.js';
import logo from '../../assets/corvex-logo.png';
import bgImage from '../../assets/corvex-bg.png';
import './LoginPage.css';

// ── Offline demo accounts ─────────────────────────────────────────────────────
// Used when the backend is unreachable. Mirrors reset_passwords.js credentials.
const OFFLINE_CREDENTIALS = {
  'marcus.santos@corvex.ph':      'Corvex@2026',
  'corazon.v@corvex.ph':          'Corvex@2026',
  'elena.mercado@corvex.ph':      'Corvex@2026',
  'roberto.villanueva@corvex.ph': 'Corvex@2026',
  'miguel.f@corvex.ph':           'Corvex@2026',
  'grace.t@corvex.ph':            'Corvex@2026',
  'ana.r@corvex.ph':              'Corvex@2026',
  'florencia.r@corvex.ph':        'Corvex@2026',
  'carlos.m@corvex.ph':           'Corvex@2026',
  'jane.s@corvex.ph':             'Corvex@2026',
  'maria.dc@corvex.ph':           'Corvex@2026',
  'luntiang.tahanan@email.com':   'Corvex@2026',
};

// IDs must match the live database (see backend/migrations/002_seed_data.sql)
// so offline sessions still work once the API is reachable again.
const OFFLINE_USERS = [
  {
    id: 1, fullName: 'Corazon Villanueva', username: 'corazon.v',
    email: 'corazon.v@corvex.ph', employeeId: 'SA-0002', avatarInitials: 'CV', status: 'Active',
    role: { id: 1, name: 'Super Admin', slug: 'super_admin' }, branch: null,
  },
  {
    id: 2, fullName: 'Elena Mercado', username: 'elena.mercado',
    email: 'elena.mercado@corvex.ph', employeeId: 'OM-2001', avatarInitials: 'EM', status: 'Active',
    role: { id: 2, name: 'Operating Manager', slug: 'operating_manager' }, branch: null,
  },
  {
    id: 3, fullName: 'Roberto Villanueva', username: 'roberto.v',
    email: 'roberto.villanueva@corvex.ph', employeeId: 'BM-0001', avatarInitials: 'RV', status: 'Active',
    role: { id: 7, name: 'Branch Manager', slug: 'branch_manager' },
    branch: { id: 1, name: 'Davao City Branch' },
  },
  {
    id: 4, fullName: 'Miguel Flores', username: 'miguel.flores',
    email: 'miguel.f@corvex.ph', employeeId: 'BM-0002', avatarInitials: 'MF', status: 'Active',
    role: { id: 7, name: 'Branch Manager', slug: 'branch_manager' },
    branch: { id: 2, name: 'General Santos Branch' },
  },
  {
    id: 5, fullName: 'Grace Tan', username: 'grace.tan',
    email: 'grace.t@corvex.ph', employeeId: 'BM-0003', avatarInitials: 'GT', status: 'Active',
    role: { id: 7, name: 'Branch Manager', slug: 'branch_manager' },
    branch: { id: 3, name: 'Davao Oriental Branch' },
  },
  {
    id: 6, fullName: 'Ana Reyes', username: 'ana.reyes',
    email: 'ana.r@corvex.ph', employeeId: 'WH-3051', avatarInitials: 'AR', status: 'Active',
    role: { id: 3, name: 'Inventory Staff', slug: 'inventory_staff' },
    branch: { id: 3, name: 'Davao Oriental Branch' },
  },
  {
    id: 7, fullName: 'Jane Smith', username: 'jane.smith',
    email: 'jane.s@corvex.ph', employeeId: 'SA-1088', avatarInitials: 'JS', status: 'Active',
    role: { id: 4, name: 'Sales Staff', slug: 'sales_staff' },
    branch: { id: 1, name: 'Davao City Branch' },
  },
  {
    id: 10, fullName: 'Maria Dela Cruz', username: 'maria.delacruz',
    email: 'maria.dc@corvex.ph', employeeId: 'COL-2048', avatarInitials: 'MD', status: 'Active',
    role: { id: 5, name: 'Collector', slug: 'collector' },
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
          setApiError('Cannot connect to server. Use a demo account (e.g. roberto.villanueva@corvex.ph / Corvex@2026).');
        }
      } else {
        setApiError(msg || 'An error occurred. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }, [email, password, navigate]);

  return (
    <div 
      className="min-h-screen w-full flex items-center justify-center relative overflow-hidden font-sans bg-cover bg-center bg-no-repeat bg-[#020617]"
      style={{ backgroundImage: `url(${bgImage})` }}
    >
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-[420px] mx-4 p-8 sm:p-12 bg-slate-900/70 backdrop-blur-2xl border border-slate-700/50 rounded-[2rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)] flex flex-col items-center"
      >

        <img src={logo} alt="Corvex Logo" className="h-12 w-auto object-contain mb-4" />
        <p className="text-[15px] text-slate-400 text-center mb-10 font-medium">
          Welcome back! Please sign in to your account.
        </p>

        <AnimatePresence>
          {apiError && (
            <motion.div 
              initial={{ opacity: 0, height: 0, marginBottom: 0 }}
              animate={{ opacity: 1, height: 'auto', marginBottom: 24 }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              className="w-full bg-red-500/10 border border-red-500/20 rounded-xl p-3.5 flex items-start gap-3 text-red-400 text-sm overflow-hidden"
            >
              <AlertCircle size={18} className="shrink-0 mt-0.5" />
              <span className="leading-relaxed">{apiError}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <form onSubmit={handleLogin} noValidate className="w-full flex flex-col gap-5">
          <div className="flex flex-col gap-5">
            <div className="relative w-full group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500 group-focus-within:text-blue-500 transition-colors">
                <Mail size={18} />
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email address"
                className={`w-full bg-slate-950/50 border ${errors.email ? 'border-red-500/50 focus:border-red-500 focus:ring-red-500/20' : 'border-slate-700/50 hover:border-slate-600 focus:border-blue-500 focus:ring-blue-500/20'} rounded-xl py-3.5 pl-11 pr-4 text-[15px] text-white placeholder-slate-500 focus:outline-none focus:ring-[3px] transition-all duration-200`}
                autoComplete="username"
                disabled={loading}
              />
              {errors.email && <span className="block text-red-400 text-xs mt-2 ml-1 font-medium">{errors.email}</span>}
            </div>

            <div className="relative w-full group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500 group-focus-within:text-blue-500 transition-colors">
                <Lock size={18} />
              </div>
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className={`w-full bg-slate-950/50 border ${errors.password ? 'border-red-500/50 focus:border-red-500 focus:ring-red-500/20' : 'border-slate-700/50 hover:border-slate-600 focus:border-blue-500 focus:ring-blue-500/20'} rounded-xl py-3.5 pl-11 pr-12 text-[15px] text-white placeholder-slate-500 focus:outline-none focus:ring-[3px] transition-all duration-200`}
                autoComplete="current-password"
                disabled={loading}
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-500 hover:text-slate-300 transition-colors focus:outline-none"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
              {errors.password && <span className="block text-red-400 text-xs mt-2 ml-1 font-medium">{errors.password}</span>}
            </div>
          </div>

          <button 
            type="submit" 
            className="w-full mt-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-[15px] py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all duration-200 shadow-[0_4px_14px_rgba(37,99,235,0.25)] hover:shadow-[0_6px_20px_rgba(37,99,235,0.35)] disabled:opacity-70 disabled:cursor-not-allowed transform hover:-translate-y-0.5 active:translate-y-0" 
            disabled={loading}
          >
            {loading ? (
              <div className="w-5 h-5 border-[2.5px] border-white/20 border-t-white rounded-full animate-spin" />
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        <div className="w-full mt-8 flex flex-col items-center gap-6">
          <button className="text-[14px] font-medium text-slate-400 hover:text-white transition-colors focus:outline-none" onClick={() => navigate('/password-reset')}>
            Forgot password?
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export default LoginPage;
