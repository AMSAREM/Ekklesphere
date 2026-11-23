import React, { useState, useEffect } from 'react';
import { useEkklesphere } from '../../context/EkklesphereContext';
import {
  UserCheck,
  Lock,
  Mail,
  UserPlus,
  AlertCircle,
  X,
  Eye,
  EyeOff,
  Loader2,
  Building2,
  CheckCircle2,
  ArrowLeft,
  ExternalLink,
} from 'lucide-react';
import type { LicenseTier } from '../../types/ekklesphere';
import { AuthTabMode, resolveAuthTabFromLocation } from '../../utils/authRoute';
import { BrandLogo } from '../common/BrandLogo';
import { PWAInstallButton } from '../common/PWAInstallButton';

interface UnifiedAuthScreenProps {
  initialTab?: AuthTabMode;
  onBackToLanding?: () => void;
}

const AUTH_SCENES: Record<
  AuthTabMode,
  {
    image: string;
    alt: string;
    kicker: string;
    headline: string;
    description: string;
  }
> = {
  login: {
    image: '/landing-page/images/ekklesphere-worship.jpg',
    alt: 'A congregation gathered together in worship',
    kicker: 'Welcome back',
    headline: 'Every member known, welcomed, and cared for.',
    description:
      'Sign in to open your church leadership console, usher door station, or personal member pass.',
  },
  register: {
    image: '/landing-page/images/ekklesphere-volunteer.jpg',
    alt: 'Church volunteers welcoming members together',
    kicker: 'Congregation access',
    headline: 'Step into community with your church family.',
    description:
      'Create your member profile for campus check-ins, service updates, and giving history.',
  },
  org_signup: {
    image: '/landing-page/images/ekklesphere-team.jpg',
    alt: 'Church leadership and ministry team planning together',
    kicker: '14-day church trial',
    headline: 'A calmer home for ministry teams and pastoral care.',
    description:
      'Launch your church workspace in minutes with attendance tracking, groups, and member portals.',
  },
};

const GoogleMark: React.FC<{ className?: string }> = ({ className = 'w-4 h-4 shrink-0' }) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
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
);

export const UnifiedAuthScreen: React.FC<UnifiedAuthScreenProps> = ({
  initialTab,
  onBackToLanding,
}) => {
  const {
    loginWithCredentials,
    registerMember,
    registerOrganisation,
    signInWithGoogle,
    isGoogleAuthLoading,
    googleAuthError,
    googleAuthPopupUrl,
    clearGoogleAuthError,
    sessionExpiredNotice,
    clearSessionExpiredNotice,
    systemSettings,
    churchGroups,
    showToast,
  } = useEkklesphere();

  const [activeTab, setActiveTab] = useState<AuthTabMode>(() =>
    initialTab || resolveAuthTabFromLocation()
  );
  const [sceneImageError, setSceneImageError] = useState<Record<string, boolean>>({});

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
  const [regAutoCheckin, setRegAutoCheckin] = useState(!systemSettings.requireExplicitConsent);

  // Organisation Trial Sign Up form state
  const [orgName, setOrgName] = useState('');
  const [orgType, setOrgType] = useState<'church' | 'organisation'>('church');
  const [orgCity, setOrgCity] = useState('Accra');
  const [orgCountry, setOrgCountry] = useState('Ghana');
  const [orgAdminFirstName, setOrgAdminFirstName] = useState('');
  const [orgAdminLastName, setOrgAdminLastName] = useState('');
  const [orgEmail, setOrgEmail] = useState('');
  const [orgPhone, setOrgPhone] = useState('+233 ');
  const [orgPassword, setOrgPassword] = useState('');
  const [orgConfirmPassword, setOrgConfirmPassword] = useState('');
  const resolvePlanFromUrl = (): LicenseTier => {
    if (typeof window === 'undefined') return 'ministry_pro';
    const raw = new URLSearchParams(window.location.search).get('plan');
    if (raw === 'grace_starter' || raw === 'ministry_pro' || raw === 'cathedral_enterprise') {
      return raw;
    }
    return 'ministry_pro';
  };

  const [orgTrialPlan, setOrgTrialPlan] = useState<LicenseTier>(resolvePlanFromUrl);
  const [showOrgPassword, setShowOrgPassword] = useState(false);

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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncTabFromUrl = () => {
      const resolved = resolveAuthTabFromLocation();
      setActiveTab(resolved);
      const rawPlan = new URLSearchParams(window.location.search).get('plan');
      if (
        rawPlan === 'grace_starter' ||
        rawPlan === 'ministry_pro' ||
        rawPlan === 'cathedral_enterprise'
      ) {
        setOrgTrialPlan(rawPlan);
      }
      setAuthError(null);
    };
    window.addEventListener('popstate', syncTabFromUrl);
    return () => window.removeEventListener('popstate', syncTabFromUrl);
  }, []);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  const handleTabSwitch = (nextTab: AuthTabMode) => {
    setActiveTab(nextTab);
    setAuthError(null);
    try {
      if (typeof window !== 'undefined') {
        const currentPath = window.location.pathname.toLowerCase();
        const url = new URL(window.location.href);
        if (
          currentPath === '/app' ||
          currentPath === '/login' ||
          currentPath === '/signin' ||
          currentPath === '/signup' ||
          currentPath === '/register' ||
          url.searchParams.has('view')
        ) {
          const authQuery = nextTab === 'register' ? 'signup' : nextTab;
          url.searchParams.set('auth', authQuery);
          if (
            currentPath === '/login' ||
            currentPath === '/signin' ||
            currentPath === '/signup' ||
            currentPath === '/register'
          ) {
            url.pathname = '/app';
          }
          window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
        }
      }
    } catch {
      // ignore history errors
    }
  };

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    clearSessionExpiredNotice();

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

  const handleOrgSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    if (orgName.trim().length < 2) {
      setAuthError('Please enter your church or organisation name.');
      return;
    }
    if (!orgAdminFirstName.trim() || !orgAdminLastName.trim()) {
      setAuthError('Please enter the primary administrator first and last name.');
      return;
    }
    if (!orgEmail.trim()) {
      setAuthError('A valid administrator email address is required.');
      return;
    }
    if (orgPassword.length < 8) {
      setAuthError('Password must be at least 8 characters long.');
      return;
    }
    if (orgPassword !== orgConfirmPassword) {
      setAuthError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await registerOrganisation({
        organizationName: orgName.trim(),
        orgType,
        city: orgCity.trim() || 'Accra',
        country: orgCountry.trim() || 'Ghana',
        adminFirstName: orgAdminFirstName.trim(),
        adminLastName: orgAdminLastName.trim(),
        email: orgEmail.trim().toLowerCase(),
        phone: orgPhone.trim() || undefined,
        password: orgPassword,
        trialPlan: orgTrialPlan,
      });
      if (!res.ok) {
        setAuthError(res.error || 'Could not complete organisation trial sign-up.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const customChurchName =
    systemSettings.churchName?.trim() &&
    systemSettings.churchName.trim() !== 'Ekklesphere Sanctuary'
      ? systemSettings.churchName.trim()
      : null;

  const scene = AUTH_SCENES[activeTab];
  const hasPhoto = !sceneImageError[scene.image];

  const inputClassName =
    'w-full min-h-[44px] px-3.5 py-2.5 text-sm rounded-xl border border-[#ddd7cb] dark:border-[#2E2E58] bg-[#fcfbf8] dark:bg-[#191938] text-[#0b1f33] dark:text-[#F2F2FA] placeholder:text-[#868b99] dark:placeholder:text-slate-500 focus:bg-white dark:focus:bg-[#1E1E44] focus:outline-none focus:ring-2 focus:ring-[#9c6912]/35 dark:focus:ring-[#6D5CF2]/60 focus:border-[#0b1f33] dark:focus:border-[#6D5CF2] transition-colors';

  const labelClassName =
    'block text-xs font-semibold text-[#1f3145] dark:text-[#D9DCF0] mb-1.5';

  return (
    <main className="w-full min-h-screen flex items-center justify-center py-4 sm:py-8 px-3 sm:px-6 bg-[#f7f3ec] dark:bg-[#0D0D22] transition-colors">
      <div className="w-full max-w-[1060px] bg-[#fffdf9] dark:bg-[#14142E] rounded-3xl border border-[#e3ddd2] dark:border-[#2A2A4F] shadow-[0_24px_64px_-24px_rgba(11,31,51,0.18)] dark:shadow-[0_24px_64px_-24px_rgba(0,0,0,0.65)] overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-stretch">
        {/* Left Sanctuary Storytelling Panel */}
        <aside className="lg:col-span-5 relative min-h-[210px] sm:min-h-[240px] lg:min-h-[600px] bg-gradient-to-br from-[#0b1f33] via-[#132c47] to-[#1a2244] text-white flex flex-col justify-between p-6 sm:p-8 overflow-hidden">
          {hasPhoto && (
            <img
              src={scene.image}
              alt={scene.alt}
              referrerPolicy="no-referrer"
              onError={() =>
                setSceneImageError((prev) => ({ ...prev, [scene.image]: true }))
              }
              className="absolute inset-0 w-full h-full object-cover object-center"
            />
          )}
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-t from-[#081624]/95 via-[#0b1f33]/60 to-[#0b1f33]/40"
          />

          <div className="relative z-10 flex items-center justify-between gap-3">
            <BrandLogo size="sm" surface="dark" />
            {onBackToLanding && (
              <button
                type="button"
                onClick={onBackToLanding}
                className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 rounded-lg bg-white/12 hover:bg-white/22 backdrop-blur-sm border border-white/20 text-xs font-semibold text-white transition-colors cursor-pointer whitespace-nowrap"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Home</span>
              </button>
            )}
          </div>

          <div className="relative z-10 space-y-3 pt-10 lg:pt-0">
            <p className="text-xs font-semibold tracking-wide text-[#f0c76e]">
              {customChurchName ? `${customChurchName} · ${scene.kicker}` : scene.kicker}
            </p>
            <h2 className="font-display text-2xl sm:text-[28px] lg:text-[32px] font-medium tracking-[-0.02em] leading-[1.14] text-white text-balance">
              {scene.headline}
            </h2>
            <p className="hidden sm:block text-xs sm:text-[13px] text-white/85 leading-relaxed max-w-sm">
              {scene.description}
            </p>

            <div className="hidden lg:flex items-center justify-between gap-3 pt-4 mt-2 border-t border-white/15">
              <PWAInstallButton
                variant="auth-dark"
                onInstalled={() => showToast('Ekklesphere installed on your device!')}
              />
              <span className="text-[11px] font-medium text-white/75 whitespace-nowrap">
                Worship · Care · Community
              </span>
            </div>
          </div>
        </aside>

        {/* Right Interactive Auth Workspace */}
        <section className="lg:col-span-7 p-6 sm:p-9 lg:p-11 flex flex-col justify-center min-w-0">
          <div className="space-y-1.5">
            <h1 className="font-display text-2xl sm:text-[28px] font-semibold tracking-[-0.02em] text-[#0b1f33] dark:text-[#F2F2FA]">
              {activeTab === 'register'
                ? 'Create member pass'
                : activeTab === 'org_signup'
                ? 'Launch your church workspace'
                : 'Sign in to your portal'}
            </h1>
            <p className="text-xs sm:text-sm text-[#586272] dark:text-[#A9ACC8]">
              {activeTab === 'register'
                ? 'Register with Google or your church email and phone number.'
                : activeTab === 'org_signup'
                ? '14-day free trial with no card required. Upgrade anytime in settings.'
                : 'Continue with Google or sign in using your church credentials.'}
            </p>
          </div>

          {/* Underlined Editorial Mode Navigation */}
          <div
            role="tablist"
            aria-label="Authentication mode"
            className="flex items-center gap-6 border-b border-[#e8e2d7] dark:border-[#26264B] mt-5 mb-6 overflow-x-auto no-scrollbar"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'login'}
              onClick={() => handleTabSwitch('login')}
              className={`relative min-h-[42px] pb-2.5 text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'login'
                  ? 'text-[#0b1f33] dark:text-white'
                  : 'text-[#6c7585] dark:text-[#8E92B5] hover:text-[#0b1f33] dark:hover:text-white'
              }`}
            >
              <span>Sign In</span>
              {activeTab === 'login' && (
                <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-[#9c6912] dark:bg-[#8C7DFF]" />
              )}
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'register'}
              onClick={() => handleTabSwitch('register')}
              className={`relative min-h-[42px] pb-2.5 text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'register'
                  ? 'text-[#0b1f33] dark:text-white'
                  : 'text-[#6c7585] dark:text-[#8E92B5] hover:text-[#0b1f33] dark:hover:text-white'
              }`}
            >
              <span>Join Church</span>
              {activeTab === 'register' && (
                <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-[#9c6912] dark:bg-[#8C7DFF]" />
              )}
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'org_signup'}
              onClick={() => handleTabSwitch('org_signup')}
              className={`relative min-h-[42px] pb-2.5 text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'org_signup'
                  ? 'text-[#0b1f33] dark:text-white'
                  : 'text-[#6c7585] dark:text-[#8E92B5] hover:text-[#0b1f33] dark:hover:text-white'
              }`}
            >
              <span>Church Trial</span>
              {activeTab === 'org_signup' && (
                <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-[#9c6912] dark:bg-[#8C7DFF]" />
              )}
            </button>
          </div>

          {/* Notices & Errors */}
          {sessionExpiredNotice && (
            <div
              role="status"
              className="mb-4 p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/70 flex items-start justify-between gap-2.5 text-xs text-amber-950 dark:text-amber-200"
            >
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Session Expired</p>
                  <p className="text-[11px] text-amber-800 dark:text-amber-300/90 mt-0.5">
                    {sessionExpiredNotice}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={clearSessionExpiredNotice}
                aria-label="Dismiss session timeout notice"
                className="text-amber-700 dark:text-amber-300 hover:text-amber-950 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {googleAuthError && (
            <div
              role="alert"
              className="mb-4 p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/70 text-xs text-amber-950 dark:text-amber-100 space-y-2.5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-amber-900 dark:text-amber-200">
                      Google Sign-In Notice
                    </p>
                    <p className="mt-0.5 text-[11px] text-amber-800 dark:text-amber-300/90 leading-relaxed">
                      {googleAuthError}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={clearGoogleAuthError}
                  aria-label="Dismiss Google sign-in notice"
                  className="text-amber-700 dark:text-amber-300 hover:text-amber-950 dark:hover:text-amber-100 p-1 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              {googleAuthPopupUrl && (
                <a
                  href={googleAuthPopupUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 min-h-[38px] px-3.5 py-2 rounded-lg bg-[#0b1f33] dark:bg-[#6D5CF2] hover:bg-[#143454] dark:hover:bg-[#5A48DE] text-white text-xs font-semibold transition-colors whitespace-nowrap"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open Google Sign-In Window</span>
                </a>
              )}
            </div>
          )}

          {authError && (
            <div
              role="alert"
              className="mb-4 p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/70 flex items-start gap-2.5 text-xs text-rose-900 dark:text-rose-200"
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

          {/* Federated Google Sign-In (Sign In & Member Registration) */}
          {(activeTab === 'login' || activeTab === 'register') && (
            <div className="mb-5 space-y-4">
              <button
                type="button"
                onClick={signInWithGoogle}
                disabled={isGoogleAuthLoading}
                className="w-full min-h-[46px] flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-xl bg-white hover:bg-[#f7f4ee] text-[#0b1f33] dark:bg-[#1E1E42] dark:hover:bg-[#272754] dark:text-white font-semibold text-sm border border-[#d9d2c5] dark:border-[#343466] shadow-xs transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap"
              >
                {isGoogleAuthLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-[#9c6912] dark:text-[#8C7DFF]" />
                ) : (
                  <GoogleMark className="w-4 h-4 shrink-0" />
                )}
                <span>
                  {isGoogleAuthLoading ? 'Connecting to Google...' : 'Continue with Google'}
                </span>
              </button>

              <div className="relative flex items-center">
                <div className="flex-grow border-t border-[#e8e2d7] dark:border-[#26264B]" />
                <span className="shrink-0 px-3 text-[11px] font-medium text-[#707887] dark:text-[#8E92B5]">
                  {activeTab === 'register'
                    ? 'or register with email or phone'
                    : 'or sign in with church credentials'}
                </span>
                <div className="flex-grow border-t border-[#e8e2d7] dark:border-[#26264B]" />
              </div>
            </div>
          )}

          {/* CREDENTIALS LOGIN */}
          {activeTab === 'login' && (
            <form onSubmit={handleCredentialsSubmit} className="space-y-4">
              <div>
                <label htmlFor="login-identifier" className={labelClassName}>
                  Email, Phone, or Username
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-[#868b99] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="login-identifier"
                    type="text"
                    required
                    autoComplete="username"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="name@church.org or +233240000000"
                    className={`${inputClassName} pl-10 pr-4`}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="login-password" className={labelClassName}>
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#868b99] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="login-password"
                    type={showLoginPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Enter your password"
                    className={`${inputClassName} pl-10 pr-11`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword((prev) => !prev)}
                    aria-label={showLoginPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 min-w-[36px] min-h-[36px] flex items-center justify-center text-[#707887] hover:text-[#0b1f33] dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer rounded-lg"
                  >
                    {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting || lockoutSeconds > 0}
                className="w-full min-h-[46px] py-2.5 px-4 rounded-xl bg-[#0b1f33] hover:bg-[#133252] dark:bg-[#6D5CF2] dark:hover:bg-[#5A48DE] disabled:opacity-60 text-white font-semibold text-sm shadow-sm flex items-center justify-center gap-2 cursor-pointer transition-colors whitespace-nowrap"
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
          )}

          {/* REGISTER NEW MEMBER */}
          {activeTab === 'register' && (
            <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="reg-first-name" className={labelClassName}>
                    First Name
                  </label>
                  <input
                    id="reg-first-name"
                    type="text"
                    required
                    value={regFirstName}
                    onChange={(e) => setRegFirstName(e.target.value)}
                    placeholder="e.g. Kwabena"
                    className={inputClassName}
                  />
                </div>
                <div>
                  <label htmlFor="reg-last-name" className={labelClassName}>
                    Last Name
                  </label>
                  <input
                    id="reg-last-name"
                    type="text"
                    required
                    value={regLastName}
                    onChange={(e) => setRegLastName(e.target.value)}
                    placeholder="e.g. Agyemang"
                    className={inputClassName}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="reg-email" className={labelClassName}>
                    Email Address
                  </label>
                  <input
                    id="reg-email"
                    type="email"
                    required
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="kwabena@example.com"
                    className={inputClassName}
                  />
                </div>
                <div>
                  <label htmlFor="reg-phone" className={labelClassName}>
                    Phone (Ghana MoMo)
                  </label>
                  <input
                    id="reg-phone"
                    type="tel"
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    placeholder="+233 24 000 0000"
                    className={inputClassName}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="reg-password" className={labelClassName}>
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
                      className={`${inputClassName} pr-10`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegPassword((prev) => !prev)}
                      aria-label={showRegPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 min-w-[34px] min-h-[34px] flex items-center justify-center text-[#707887] hover:text-[#0b1f33] dark:text-slate-400 cursor-pointer rounded-lg"
                    >
                      {showRegPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label htmlFor="reg-confirm-password" className={labelClassName}>
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
                    className={inputClassName}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="reg-group" className={labelClassName}>
                    Cell / Fellowship Group
                  </label>
                  <select
                    id="reg-group"
                    value={regGroup}
                    onChange={(e) => setRegGroup(e.target.value)}
                    className={inputClassName}
                  >
                    <option value="General Congregation">General Congregation</option>
                    {churchGroups.filter((g) => g.active !== false).length > 0 ? (
                      churchGroups
                        .filter((g) => g.active !== false)
                        .map((g) => (
                          <option key={g.id} value={g.name}>
                            {g.name} (
                            {g.category === 'ministry'
                              ? 'Ministry'
                              : g.category === 'fellowship'
                              ? 'Fellowship'
                              : 'Cell Group'}
                            )
                          </option>
                        ))
                    ) : (
                      <>
                        <option value="Youth Fellowship">Youth Fellowship</option>
                        <option value="Choir & Music">Choir &amp; Music</option>
                        <option value="Ushering Ministry">Ushering Ministry</option>
                        <option value="Men’s Fellowship">Men’s Fellowship</option>
                        <option value="Women’s Fellowship">Women’s Fellowship</option>
                      </>
                    )}
                  </select>
                </div>
                <div>
                  <label htmlFor="reg-org-slug" className={labelClassName}>
                    Church Code (optional)
                  </label>
                  <div className="relative">
                    <Building2 className="w-4 h-4 text-[#868b99] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="reg-org-slug"
                      type="text"
                      value={regOrgSlug}
                      onChange={(e) => setRegOrgSlug(e.target.value)}
                      placeholder="e.g. your-church-slug"
                      className={`${inputClassName} pl-9`}
                    />
                  </div>
                </div>
              </div>

              <div className="bg-[#f6f1e6] dark:bg-indigo-950/30 border border-[#e3dac9] dark:border-indigo-900/60 rounded-xl p-3 flex items-start gap-2.5">
                <input
                  type="checkbox"
                  id="autoCheckinConsent"
                  checked={regAutoCheckin}
                  onChange={(e) => setRegAutoCheckin(e.target.checked)}
                  className="mt-0.5 rounded text-[#0b1f33] dark:text-[#6D5CF2] focus:ring-[#9c6912]"
                />
                <label
                  htmlFor="autoCheckinConsent"
                  className="text-xs text-[#0b1f33] dark:text-[#F2F2FA] cursor-pointer leading-snug"
                >
                  <span className="font-semibold block">
                    Opt in to campus proximity check-in
                    {systemSettings.requireExplicitConsent ? ' (explicit consent)' : ''}
                  </span>
                  <span className="text-[#586272] dark:text-[#A9ACC8] text-[11px] block mt-0.5">
                    Confirms attendance when arriving within {systemSettings.innerGeofenceMeters}m of{' '}
                    {systemSettings.campusName || 'church'}.
                  </span>
                </label>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full min-h-[46px] py-2.5 px-4 rounded-xl bg-[#0b1f33] hover:bg-[#133252] dark:bg-emerald-600 dark:hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold text-sm shadow-sm flex items-center justify-center gap-2 cursor-pointer transition-colors whitespace-nowrap"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <UserPlus className="w-4 h-4" />
                )}
                <span>
                  {isSubmitting ? 'Creating Account...' : 'Create Account & Enter Member App'}
                </span>
              </button>
            </form>
          )}

          {/* START ORGANISATION FREE TRIAL */}
          {activeTab === 'org_signup' && (
            <form onSubmit={handleOrgSignupSubmit} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label htmlFor="org-signup-name" className={labelClassName}>
                    Church / Organisation Name *
                  </label>
                  <input
                    id="org-signup-name"
                    type="text"
                    required
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    placeholder="e.g. Grace Fountain Sanctuary"
                    className={inputClassName}
                  />
                </div>
                <div>
                  <label htmlFor="org-signup-type" className={labelClassName}>
                    Entity Type
                  </label>
                  <select
                    id="org-signup-type"
                    value={orgType}
                    onChange={(e) => setOrgType(e.target.value as 'church' | 'organisation')}
                    className={inputClassName}
                  >
                    <option value="church">Church / Ministry</option>
                    <option value="organisation">Organisation / NGO</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="org-signup-city" className={labelClassName}>
                    City
                  </label>
                  <input
                    id="org-signup-city"
                    type="text"
                    value={orgCity}
                    onChange={(e) => setOrgCity(e.target.value)}
                    placeholder="Accra"
                    className={inputClassName}
                  />
                </div>
                <div>
                  <label htmlFor="org-signup-country" className={labelClassName}>
                    Country
                  </label>
                  <input
                    id="org-signup-country"
                    type="text"
                    value={orgCountry}
                    onChange={(e) => setOrgCountry(e.target.value)}
                    placeholder="Ghana"
                    className={inputClassName}
                  />
                </div>
              </div>

              <div>
                <span className={labelClassName}>Trial Edition</span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  {[
                    {
                      id: 'grace_starter' as LicenseTier,
                      name: 'Grace Starter',
                      price: '$19/mo after trial',
                      limits: '250 seats · 1 site',
                    },
                    {
                      id: 'ministry_pro' as LicenseTier,
                      name: 'Ministry Pro',
                      price: '$49/mo after trial',
                      limits: '800 seats · 3 sites',
                    },
                    {
                      id: 'cathedral_enterprise' as LicenseTier,
                      name: 'Cathedral Enterprise',
                      price: '$119/mo after trial',
                      limits: '2,500 seats · 10 sites',
                    },
                  ].map((plan) => {
                    const selected = orgTrialPlan === plan.id;
                    return (
                      <button
                        key={plan.id}
                        type="button"
                        onClick={() => setOrgTrialPlan(plan.id)}
                        className={`p-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                          selected
                            ? 'bg-[#f6f1e6] dark:bg-[#23204E] border-[#9c6912] dark:border-[#6D5CF2]'
                            : 'bg-[#fcfbf8] dark:bg-[#1A1A3A] border-[#ddd7cb] dark:border-[#2D2D55] hover:border-[#9c6912]/50 dark:hover:border-[#6D5CF2]/50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-semibold text-[#0b1f33] dark:text-white">
                            {plan.name}
                          </span>
                          {selected && (
                            <CheckCircle2 className="w-3.5 h-3.5 text-[#9c6912] dark:text-[#6D5CF2] shrink-0" />
                          )}
                        </div>
                        <div className="text-[11px] font-semibold text-[#9c6912] dark:text-[#A594FD] mt-0.5 tabular-nums">
                          {plan.price}
                        </div>
                        <div className="text-[10px] text-[#586272] dark:text-[#A9ACC8] mt-0.5 tabular-nums">
                          {plan.limits}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="org-admin-first" className={labelClassName}>
                    Admin First Name *
                  </label>
                  <input
                    id="org-admin-first"
                    type="text"
                    required
                    value={orgAdminFirstName}
                    onChange={(e) => setOrgAdminFirstName(e.target.value)}
                    placeholder="e.g. Samuel"
                    className={inputClassName}
                  />
                </div>
                <div>
                  <label htmlFor="org-admin-last" className={labelClassName}>
                    Admin Last Name *
                  </label>
                  <input
                    id="org-admin-last"
                    type="text"
                    required
                    value={orgAdminLastName}
                    onChange={(e) => setOrgAdminLastName(e.target.value)}
                    placeholder="e.g. Owusu"
                    className={inputClassName}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="org-signup-email" className={labelClassName}>
                    Work / Church Email *
                  </label>
                  <input
                    id="org-signup-email"
                    type="email"
                    required
                    value={orgEmail}
                    onChange={(e) => setOrgEmail(e.target.value)}
                    placeholder="pastor@yourchurch.org"
                    className={inputClassName}
                  />
                </div>
                <div>
                  <label htmlFor="org-signup-phone" className={labelClassName}>
                    Phone Number (Optional)
                  </label>
                  <input
                    id="org-signup-phone"
                    type="tel"
                    value={orgPhone}
                    onChange={(e) => setOrgPhone(e.target.value)}
                    placeholder="+233 24 000 0000"
                    className={inputClassName}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="org-signup-password" className={labelClassName}>
                    Password (min. 8 chars) *
                  </label>
                  <div className="relative">
                    <input
                      id="org-signup-password"
                      type={showOrgPassword ? 'text' : 'password'}
                      required
                      minLength={8}
                      autoComplete="new-password"
                      value={orgPassword}
                      onChange={(e) => setOrgPassword(e.target.value)}
                      placeholder="Create strong password"
                      className={`${inputClassName} pr-10`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowOrgPassword((prev) => !prev)}
                      aria-label={showOrgPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 min-w-[34px] min-h-[34px] flex items-center justify-center text-[#707887] hover:text-[#0b1f33] dark:text-slate-400 cursor-pointer rounded-lg"
                    >
                      {showOrgPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label htmlFor="org-signup-confirm" className={labelClassName}>
                    Confirm Password *
                  </label>
                  <input
                    id="org-signup-confirm"
                    type={showOrgPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={orgConfirmPassword}
                    onChange={(e) => setOrgConfirmPassword(e.target.value)}
                    placeholder="Repeat password"
                    className={inputClassName}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full min-h-[46px] py-2.5 px-4 rounded-xl bg-[#0b1f33] hover:bg-[#133252] dark:bg-[#6D5CF2] dark:hover:bg-[#5A48DE] disabled:opacity-60 text-white font-semibold text-sm shadow-sm flex items-center justify-center gap-2 cursor-pointer transition-colors whitespace-nowrap"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Building2 className="w-4 h-4" />
                )}
                <span>
                  {isSubmitting
                    ? 'Provisioning Trial Workspace...'
                    : 'Start 14-Day Free Trial'}
                </span>
              </button>
            </form>
          )}

          {/* Mobile PWA Install footer */}
          <div className="mt-6 pt-4 border-t border-[#e8e2d7] dark:border-[#26264B] flex lg:hidden items-center justify-between gap-3">
            <PWAInstallButton
              variant="auth"
              onInstalled={() => showToast('Ekklesphere installed on your device!')}
            />
            <span className="text-[11px] font-medium text-[#707887] dark:text-[#8E92B5]">
              Worship · Care · Community
            </span>
          </div>
        </section>
      </div>
    </main>
  );
};

