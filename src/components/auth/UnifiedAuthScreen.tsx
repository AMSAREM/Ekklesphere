import React, { useState, useEffect } from 'react';
import { useEkklesphere } from '../../context/EkklesphereContext';
import {
  ShieldCheck,
  UserCheck,
  Lock,
  Mail,
  UserPlus,
  KeyRound,
  AlertCircle,
  X,
  Eye,
  EyeOff,
  Loader2,
  Building2,
} from 'lucide-react';

export const UnifiedAuthScreen: React.FC = () => {
  const {
    loginWithCredentials,
    registerMember,
    signInWithGoogle,
    isGoogleAuthLoading,
    googleAuthError,
    clearGoogleAuthError,
    systemSettings,
    churchGroups,
    showToast,
  } = useEkklesphere();

  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');

  // Login form state (roles are resolved strictly on the backend from verified DB records)
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Register form state
  const [regFirstName, setRegFirstName] = useState('');
  const [regLastName, setRegLastName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('+233 ');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [regGroup, setRegGroup] = useState('General Congregation');
  const [regOrgSlug, setRegOrgSlug] = useState('');
  const [regAutoCheckin, setRegAutoCheckin] = useState(true);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [lockoutSeconds, setLockoutSeconds] = useState<number>(0);

  useEffect(() => {
    if (lockoutSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setLockoutSeconds((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [lockoutSeconds]);

  const handleTabSwitch = (nextTab: 'login' | 'register') => {
    setActiveTab(nextTab);
    setAuthError(null);
  };

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    if (!loginEmail.trim()) {
      setAuthError('Please enter your account email, phone number, or username.');
      return;
    }
    if (!loginPassword) {
      setAuthError('Please enter your password.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await loginWithCredentials(loginEmail, loginPassword);
      if (!res.ok) {
        setAuthError(res.error || 'Authentication failed. Check your credentials.');
        if (res.retryAfterSeconds && res.retryAfterSeconds > 0) {
          setLockoutSeconds(res.retryAfterSeconds);
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    if (!regFirstName.trim() || !regLastName.trim()) {
      setAuthError('Please enter your first and last name.');
      return;
    }
    if (!regEmail.trim() && !regPhone.trim()) {
      setAuthError('Please enter either an email address or phone number.');
      return;
    }
    if (regPassword.length < 8) {
      setAuthError('Password must be at least 8 characters long.');
      return;
    }
    if (regPassword !== regConfirmPassword) {
      setAuthError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await registerMember({
        firstName: regFirstName,
        lastName: regLastName,
        email: regEmail.trim() || undefined,
        phone: regPhone.trim() || undefined,
        password: regPassword,
        groupName: regGroup,
        autoCheckinOptedIn: regAutoCheckin,
        organizationSlug: regOrgSlug.trim() || undefined,
      });
      if (!res.ok) {
        setAuthError(res.error || 'Registration could not be completed.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="w-full min-h-[calc(100vh-5rem)] flex items-center justify-center py-4 sm:py-6 px-3 sm:px-4">
      <div className="w-full max-w-4xl bg-white dark:bg-[#14142E] rounded-3xl border border-[#E3E5F2] dark:border-[#2D2D55] shadow-2xl overflow-hidden transition-all duration-300">
        {/* Header Hero Banner */}
        <div className="bg-gradient-to-r from-indigo-50/90 via-purple-50/70 to-white dark:from-[#1D1B3A] dark:via-[#2A2356] dark:to-[#6D5CF2] text-slate-900 dark:text-white p-6 sm:p-8 relative overflow-hidden border-b border-[#E3E5F2] dark:border-white/10">
          <div className="absolute right-0 top-0 translate-x-10 -translate-y-10 w-72 h-72 bg-[#6D5CF2]/15 dark:bg-[#6D5CF2]/20 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/90 dark:bg-white/10 backdrop-blur-md border border-indigo-200/80 dark:border-white/15 text-xs font-semibold text-slate-800 dark:text-white shadow-xs">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Verified Identity Gateway</span>
                <span className="text-slate-400 dark:text-white/60">·</span>
                <span className="text-indigo-600 dark:text-emerald-300 font-bold">
                  {systemSettings.churchName || 'Ekklesphere Sanctuary'}
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                Sign In to Ekklesphere
              </h1>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 max-w-xl">
                Access permissions and your assigned portal (Leadership, Usher Station, or Member Mobile Pass) are automatically verified from your church record.
              </p>
            </div>

            <div className="flex md:flex-col items-end gap-2 shrink-0">
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-white/10 text-[11px] font-medium text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-400/20">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>RLS & Rate-Limit Protected</span>
              </div>
              <div className="text-[11px] text-slate-500 dark:text-white/60">
                Server-Enforced RBAC
              </div>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="flex items-center gap-2 mt-6 pt-4 border-t border-slate-200/80 dark:border-white/15">
            <button
              type="button"
              onClick={() => handleTabSwitch('login')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'login'
                  ? 'bg-[#6D5CF2] text-white shadow-md shadow-indigo-500/25'
                  : 'bg-white/80 dark:bg-white/10 text-slate-700 dark:text-white/80 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-white/20 border border-slate-200 dark:border-transparent'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Sign In with Credentials</span>
            </button>

            <button
              type="button"
              onClick={() => handleTabSwitch('register')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'register'
                  ? 'bg-[#6D5CF2] text-white shadow-md shadow-indigo-500/25'
                  : 'bg-white/80 dark:bg-white/10 text-slate-700 dark:text-white/80 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-white/20 border border-slate-200 dark:border-transparent'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Join as Member</span>
            </button>
          </div>
        </div>

        {/* Supabase Google OAuth Hero Bar */}
        <div className="mx-6 sm:mx-8 mt-6 p-4 rounded-2xl bg-gradient-to-r from-indigo-50 via-purple-50 to-emerald-50 dark:from-[#1D1A3F] dark:via-[#1E1B38] dark:to-[#172B28] border border-indigo-200/80 dark:border-indigo-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white dark:bg-[#2A2A4A] shadow-md flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-700">
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
            </div>
            <div>
              <h3 className="font-bold text-xs sm:text-sm text-[#1D1B3A] dark:text-[#F2F2FA] flex items-center gap-1.5">
                Sign in with Google
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                  Supabase Auth
                </span>
              </h3>
              <p className="text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
                Single sign-on via Supabase Auth for {systemSettings.churchName || 'Ekklesphere'}.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={signInWithGoogle}
            disabled={isGoogleAuthLoading}
            className="sm:shrink-0 flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-[#1D1B3A] dark:bg-[#2A2A55] dark:hover:bg-[#34346A] dark:text-white font-bold text-xs shadow-md border border-slate-200 dark:border-slate-700 transition-all hover:scale-102 cursor-pointer disabled:opacity-60"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>{isGoogleAuthLoading ? 'Redirecting...' : 'Continue with Google'}</span>
          </button>
        </div>

        {googleAuthError && (
          <div className="mx-6 sm:mx-8 mt-3 p-4 rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/30 border border-amber-300 dark:border-amber-800/70 shadow-sm space-y-2 text-xs text-amber-950 dark:text-amber-100">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-amber-900 dark:text-amber-200">
                    Supabase OAuth Notice
                  </h4>
                  <p className="mt-0.5 text-[11px] text-amber-800 dark:text-amber-300/90 leading-relaxed">
                    {googleAuthError}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={clearGoogleAuthError}
                aria-label="Dismiss notice"
                className="text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-200 p-0.5 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Content Body */}
        <div className="p-6 sm:p-8">
          {authError && (
            <div
              role="alert"
              className="max-w-lg mx-auto mb-5 p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/70 flex items-start gap-2.5 text-xs text-rose-900 dark:text-rose-200"
            >
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1 space-y-0.5">
                <p className="font-semibold">{authError}</p>
                {lockoutSeconds > 0 && (
                  <p className="text-[11px] text-rose-700 dark:text-rose-300">
                    Security cooldown active: retry in {Math.floor(lockoutSeconds / 60)}m{' '}
                    {String(lockoutSeconds % 60).padStart(2, '0')}s.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* CREDENTIALS LOGIN */}
          {activeTab === 'login' && (
            <div className="max-w-md mx-auto space-y-5">
              <div className="text-center space-y-1">
                <h2 className="text-lg font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                  Account Sign In
                </h2>
                <p className="text-xs text-[#666A86] dark:text-[#A9ACC8]">
                  Your role and church organization are assigned securely from the database upon login.
                </p>
              </div>

              <form onSubmit={handleCredentialsSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="login-identifier"
                    className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1.5"
                  >
                    Email, Phone, or Username
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="login-identifier"
                      type="text"
                      required
                      autoComplete="username"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      placeholder="name@church.org or +233240000000"
                      className="w-full pl-10 pr-4 py-2.5 text-xs rounded-xl border border-[#E3E5F2] dark:border-[#2D2D55] bg-white dark:bg-[#1A1A3A] text-[#1D1B3A] dark:text-[#F2F2FA] focus:outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="login-password"
                    className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1.5"
                  >
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="login-password"
                      type={showLoginPassword ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="w-full pl-10 pr-10 py-2.5 text-xs rounded-xl border border-[#E3E5F2] dark:border-[#2D2D55] bg-white dark:bg-[#1A1A3A] text-[#1D1B3A] dark:text-[#F2F2FA] focus:outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPassword((prev) => !prev)}
                      aria-label={showLoginPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                    >
                      {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting || lockoutSeconds > 0}
                  className="w-full py-3 rounded-xl bg-[#6D5CF2] hover:bg-[#5A48DE] disabled:opacity-60 text-white font-bold text-xs shadow-lg shadow-indigo-500/30 flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <UserCheck className="w-4 h-4" />
                  )}
                  <span>
                    {isSubmitting
                      ? 'Verifying Credentials...'
                      : lockoutSeconds > 0
                      ? `Locked (${lockoutSeconds}s)`
                      : 'Sign In & Open Portal'}
                  </span>
                </button>
              </form>
            </div>
          )}

          {/* REGISTER NEW MEMBER */}
          {activeTab === 'register' && (
            <div className="max-w-lg mx-auto space-y-5">
              <div className="text-center space-y-1">
                <h2 className="text-lg font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                  Create Your Congregation Account
                </h2>
                <p className="text-xs text-[#666A86] dark:text-[#A9ACC8]">
                  New self-registrations are provisioned as congregation members with password-protected sign-in.
                </p>
              </div>

              <form onSubmit={handleRegisterSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="reg-first-name"
                      className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1"
                    >
                      First Name
                    </label>
                    <input
                      id="reg-first-name"
                      type="text"
                      required
                      value={regFirstName}
                      onChange={(e) => setRegFirstName(e.target.value)}
                      placeholder="e.g. Kwabena"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-[#E3E5F2] dark:border-[#2D2D55] bg-white dark:bg-[#1A1A3A] text-[#1D1B3A] dark:text-[#F2F2FA] focus:outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="reg-last-name"
                      className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1"
                    >
                      Last Name
                    </label>
                    <input
                      id="reg-last-name"
                      type="text"
                      required
                      value={regLastName}
                      onChange={(e) => setRegLastName(e.target.value)}
                      placeholder="e.g. Agyemang"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-[#E3E5F2] dark:border-[#2D2D55] bg-white dark:bg-[#1A1A3A] text-[#1D1B3A] dark:text-[#F2F2FA] focus:outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="reg-email"
                      className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1"
                    >
                      Email Address
                    </label>
                    <input
                      id="reg-email"
                      type="email"
                      required
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="kwabena@example.com"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-[#E3E5F2] dark:border-[#2D2D55] bg-white dark:bg-[#1A1A3A] text-[#1D1B3A] dark:text-[#F2F2FA] focus:outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="reg-phone"
                      className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1"
                    >
                      Phone (Ghana MoMo)
                    </label>
                    <input
                      id="reg-phone"
                      type="tel"
                      value={regPhone}
                      onChange={(e) => setRegPhone(e.target.value)}
                      placeholder="+233 24 000 0000"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-[#E3E5F2] dark:border-[#2D2D55] bg-white dark:bg-[#1A1A3A] text-[#1D1B3A] dark:text-[#F2F2FA] focus:outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="reg-password"
                      className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1"
                    >
                      Password (min. 8 chars)
                    </label>
                    <div className="relative">
                      <input
                        id="reg-password"
                        type={showRegPassword ? 'text' : 'password'}
                        required
                        minLength={8}
                        autoComplete="new-password"
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        placeholder="Create strong password"
                        className="w-full px-3 pr-9 py-2 text-xs rounded-xl border border-[#E3E5F2] dark:border-[#2D2D55] bg-white dark:bg-[#1A1A3A] text-[#1D1B3A] dark:text-[#F2F2FA] focus:outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowRegPassword((prev) => !prev)}
                        aria-label={showRegPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        {showRegPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label
                      htmlFor="reg-confirm-password"
                      className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1"
                    >
                      Confirm Password
                    </label>
                    <input
                      id="reg-confirm-password"
                      type={showRegPassword ? 'text' : 'password'}
                      required
                      minLength={8}
                      autoComplete="new-password"
                      value={regConfirmPassword}
                      onChange={(e) => setRegConfirmPassword(e.target.value)}
                      placeholder="Repeat password"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-[#E3E5F2] dark:border-[#2D2D55] bg-white dark:bg-[#1A1A3A] text-[#1D1B3A] dark:text-[#F2F2FA] focus:outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="reg-group"
                      className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1"
                    >
                      Cell / Fellowship Group
                    </label>
                    <select
                      id="reg-group"
                      value={regGroup}
                      onChange={(e) => setRegGroup(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-[#E3E5F2] dark:border-[#2D2D55] bg-white dark:bg-[#1A1A3A] text-[#1D1B3A] dark:text-[#F2F2FA] focus:outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                    >
                      <option value="General Congregation">General Congregation</option>
                      {churchGroups.map((g) => (
                        <option key={g.id} value={g.name}>
                          {g.name}
                        </option>
                      ))}
                      <option value="Youth Fellowship">Youth Fellowship</option>
                      <option value="Choir & Music">Choir & Music</option>
                      <option value="Ushering Ministry">Ushering Ministry</option>
                      <option value="Men’s Fellowship">Men’s Fellowship</option>
                      <option value="Women’s Fellowship">Women’s Fellowship</option>
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="reg-org-slug"
                      className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1"
                    >
                      Church Code (optional)
                    </label>
                    <div className="relative">
                      <Building2 className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        id="reg-org-slug"
                        type="text"
                        value={regOrgSlug}
                        onChange={(e) => setRegOrgSlug(e.target.value)}
                        placeholder="e.g. accra-central"
                        className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-[#E3E5F2] dark:border-[#2D2D55] bg-white dark:bg-[#1A1A3A] text-[#1D1B3A] dark:text-[#F2F2FA] focus:outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-[#EFEDFF] dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900/60 rounded-xl p-3.5 flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="autoCheckinConsent"
                    checked={regAutoCheckin}
                    onChange={(e) => setRegAutoCheckin(e.target.checked)}
                    className="mt-0.5 rounded text-[#6D5CF2] focus:ring-[#6D5CF2]"
                  />
                  <label htmlFor="autoCheckinConsent" className="text-xs text-[#1D1B3A] dark:text-[#F2F2FA] cursor-pointer">
                    <span className="font-bold block">Opt-in to Automated Proximity Check-in</span>
                    <span className="text-[#666A86] dark:text-[#A9ACC8] text-[11px] block mt-0.5">
                      Your phone will automatically acknowledge your presence when you arrive at{' '}
                      {systemSettings.campusName || 'church'} via the active campus geofence.
                    </span>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold text-xs shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <UserPlus className="w-4 h-4" />
                  )}
                  <span>{isSubmitting ? 'Creating Account...' : 'Create Account & Enter Member App'}</span>
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </main>
  );
};
