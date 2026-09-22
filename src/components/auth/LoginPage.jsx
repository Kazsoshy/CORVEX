import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { login as apiLogin, getEntryPathForRole } from '../../api/authService.js';
import logo from '../../assets/corvex-logo.png';
import bgImage from '../../assets/corvex-bg.png';
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
