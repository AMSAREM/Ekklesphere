import React, { useState } from 'react';
import { useEkklesphere, DEMO_USERS } from '../../context/EkklesphereContext';
import { UserRole } from '../../types/ekklesphere';
import {
  Church,
  ShieldCheck,
  LayoutDashboard,
  Smartphone,
  QrCode,
  Radio,
  UserCheck,
  Lock,
  Mail,
  UserPlus,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  KeyRound,
  Phone,
  Users,
} from 'lucide-react';

export const UnifiedAuthScreen: React.FC = () => {
  const {
    login,
    loginWithCredentials,
    registerMember,
    signInWithGoogle,
    isGoogleAuthLoading,
    showToast,
  } = useEkklesphere();

  const [activeTab, setActiveTab] = useState<'demo' | 'login' | 'register'>('demo');

  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [selectedRole, setSelectedRole] = useState<UserRole>('admin');

  // Register form state
  const [regFirstName, setRegFirstName] = useState('');
  const [regLastName, setRegLastName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('+233 ');
  const [regGroup, setRegGroup] = useState('Osu North cell');
  const [regAutoCheckin, setRegAutoCheckin] = useState(true);

  const handleCredentialsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail.trim()) {
      showToast('Please enter your email or username');
      return;
    }
    loginWithCredentials(loginEmail, loginPassword, selectedRole);
  };

  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!regFirstName.trim() || !regLastName.trim()) {
      showToast('Please enter your first and last name');
      return;
    }
    if (!regEmail.trim()) {
      showToast('Please enter your email address');
      return;
    }
    registerMember(regFirstName, regLastName, regEmail, regPhone, regGroup);
  };

  return (
    <div className="min-h-[calc(100vh-5rem)] flex items-center justify-center py-6 px-3 sm:px-4">
      <div className="w-full max-w-4xl bg-white dark:bg-[#14142E] rounded-3xl border border-[#E3E5F2] dark:border-[#2D2D55] shadow-2xl overflow-hidden transition-all duration-300">
        {/* Header Hero Banner */}
        <div className="bg-gradient-to-r from-[#1D1B3A] via-[#2A2356] to-[#6D5CF2] text-white p-6 sm:p-8 relative overflow-hidden">
          <div className="absolute right-0 top-0 translate-x-10 -translate-y-10 w-72 h-72 bg-[#6D5CF2]/20 rounded-full blur-3xl pointer-events-none" />
          
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-xs font-semibold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Role-Based Access Gateway</span>
                <span className="text-white/60">·</span>
                <span className="text-emerald-300">Accra Central Church</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                Role-Based Church Management
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 max-w-xl">
                Every role has its own dedicated portal and access permissions: Church Leadership & Pastoral Care, Door Usher Headcount Station, and Member Mobile Pass.
              </p>
            </div>

            <div className="flex md:flex-col items-end gap-2 shrink-0">
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 text-[11px] font-medium text-emerald-300 border border-emerald-400/20">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Act 843 Compliant</span>
              </div>
              <div className="text-[11px] text-white/60">
                Strict Role-Based Permissions
              </div>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="flex items-center gap-2 mt-6 pt-4 border-t border-white/15">
            <button
              onClick={() => setActiveTab('demo')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'demo'
                  ? 'bg-white text-[#1D1B3A] shadow-md shadow-black/20'
                  : 'bg-white/10 text-white/80 hover:text-white hover:bg-white/20'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Quick Demo Roles</span>
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-300 font-extrabold">
                Recommended
              </span>
            </button>

            <button
              onClick={() => setActiveTab('login')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'login'
                  ? 'bg-white text-[#1D1B3A] shadow-md shadow-black/20'
                  : 'bg-white/10 text-white/80 hover:text-white hover:bg-white/20'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Sign In with Credentials</span>
            </button>

            <button
              onClick={() => setActiveTab('register')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'register'
                  ? 'bg-white text-[#1D1B3A] shadow-md shadow-black/20'
                  : 'bg-white/10 text-white/80 hover:text-white hover:bg-white/20'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Join as Member</span>
            </button>
          </div>
        </div>

        {/* Quick Google Sign In Hero Bar */}
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
                  Firebase Auth
                </span>
              </h3>
              <p className="text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
                Authenticate with your personal Google credentials to access Accra Central portals.
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
            <span>{isGoogleAuthLoading ? 'Signing in...' : 'Sign in with Google'}</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 sm:p-8">
          {/* TAB 1: QUICK DEMO PROFILES */}
          {activeTab === 'demo' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                  Select your assigned role to access its dedicated portal
                </h2>
                <p className="text-xs text-[#666A86] dark:text-[#A9ACC8]">
                  Every role has its own dedicated portal, tools, and access boundaries. Sign in below to enter your workspace:
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* 1. Admin / Pastor Card */}
                <div className="group relative bg-[#F8F9FE] dark:bg-[#1A1A3A] border-2 border-indigo-100 dark:border-indigo-950/80 hover:border-[#6D5CF2] dark:hover:border-[#8C7DFF] rounded-2xl p-5 flex flex-col justify-between transition-all hover:shadow-xl hover:-translate-y-1">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-900/40 text-[#6D5CF2] dark:text-[#8C7DFF] flex items-center justify-center font-black text-sm shadow-inner">
                        DO
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#EFEDFF] dark:bg-indigo-950 text-[#6D5CF2] dark:text-[#8C7DFF] border border-indigo-200 dark:border-indigo-800">
                        ADMIN
                      </span>
                    </div>

                    <div>
                      <h3 className="font-bold text-sm text-[#1D1B3A] dark:text-[#F2F2FA]">
                        {DEMO_USERS.admin.name}
                      </h3>
                      <div className="text-[11px] font-medium text-[#666A86] dark:text-[#A9ACC8]">
                        Senior Pastor & Administrator
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {DEMO_USERS.admin.email}
                      </div>
                    </div>

                    <div className="pt-2 text-xs text-[#555870] dark:text-[#A9ACC8] space-y-1.5 border-t border-slate-200/60 dark:border-slate-800/60">
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <span>Executive service attendance tally</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <span>Pastoral care follow-up queue</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <span>Proximity radar diagnostic lab</span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => login(DEMO_USERS.admin)}
                    className="mt-5 w-full py-2.5 px-4 rounded-xl bg-[#6D5CF2] hover:bg-[#5A48DE] text-white text-xs font-bold shadow-md shadow-indigo-500/25 flex items-center justify-center gap-2 group-hover:scale-[1.02] transition-transform"
                  >
                    <LayoutDashboard className="w-4 h-4" />
                    <span>Open Leadership Suite</span>
                    <ArrowRight className="w-3.5 h-3.5 ml-auto" />
                  </button>
                </div>

                {/* 2. Usher Lead Card */}
                <div className="group relative bg-[#F8F9FE] dark:bg-[#1A1A3A] border-2 border-indigo-100 dark:border-indigo-950/80 hover:border-amber-500 dark:hover:border-amber-400 rounded-2xl p-5 flex flex-col justify-between transition-all hover:shadow-xl hover:-translate-y-1">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center font-black text-sm shadow-inner">
                        ST
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                        USHER
                      </span>
                    </div>

                    <div>
                      <h3 className="font-bold text-sm text-[#1D1B3A] dark:text-[#F2F2FA]">
                        {DEMO_USERS.usher.name}
                      </h3>
                      <div className="text-[11px] font-medium text-[#666A86] dark:text-[#A9ACC8]">
                        Ushering Lead & Door Steward
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {DEMO_USERS.usher.email}
                      </div>
                    </div>

                    <div className="pt-2 text-xs text-[#555870] dark:text-[#A9ACC8] space-y-1.5 border-t border-slate-200/60 dark:border-slate-800/60">
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <span>Rapid door attendee search</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <span>Offline check-in sync queue</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <span>Quick visitor onboarding</span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => login(DEMO_USERS.usher)}
                    className="mt-5 w-full py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-md shadow-amber-600/25 flex items-center justify-center gap-2 group-hover:scale-[1.02] transition-transform"
                  >
                    <QrCode className="w-4 h-4" />
                    <span>Open Door Station</span>
                    <ArrowRight className="w-3.5 h-3.5 ml-auto" />
                  </button>
                </div>

                {/* 3. Member Card */}
                <div className="group relative bg-[#F8F9FE] dark:bg-[#1A1A3A] border-2 border-indigo-100 dark:border-indigo-950/80 hover:border-emerald-500 dark:hover:border-emerald-400 rounded-2xl p-5 flex flex-col justify-between transition-all hover:shadow-xl hover:-translate-y-1">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-black text-sm shadow-inner">
                        AM
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                        MEMBER
                      </span>
                    </div>

                    <div>
                      <h3 className="font-bold text-sm text-[#1D1B3A] dark:text-[#F2F2FA]">
                        {DEMO_USERS.member.name}
                      </h3>
                      <div className="text-[11px] font-medium text-[#666A86] dark:text-[#A9ACC8]">
                        Member, Osu North Cell
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {DEMO_USERS.member.email}
                      </div>
                    </div>

                    <div className="pt-2 text-xs text-[#555870] dark:text-[#A9ACC8] space-y-1.5 border-t border-slate-200/60 dark:border-slate-800/60">
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <span>Auto proximity radar pass</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <span>MTN & Telecel MoMo giving</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <span>Calendar RSVP & personal QR</span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => login(DEMO_USERS.member)}
                    className="mt-5 w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-600/25 flex items-center justify-center gap-2 group-hover:scale-[1.02] transition-transform"
                  >
                    <Smartphone className="w-4 h-4" />
                    <span>Open Member Portal</span>
                    <ArrowRight className="w-3.5 h-3.5 ml-auto" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: CREDENTIALS LOGIN */}
          {activeTab === 'login' && (
            <div className="max-w-md mx-auto space-y-5">
              <div className="text-center space-y-1">
                <h2 className="text-lg font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                  Sign In to Ekklesphere
                </h2>
                <p className="text-xs text-[#666A86] dark:text-[#A9ACC8]">
                  Enter your church credentials and select your access destination.
                </p>
              </div>

              {/* Google 1-Click Action */}
              <button
                type="button"
                onClick={signInWithGoogle}
                disabled={isGoogleAuthLoading}
                className="w-full flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-xl bg-white hover:bg-slate-50 dark:bg-[#202042] dark:hover:bg-[#282855] text-slate-800 dark:text-slate-100 font-bold text-xs shadow-sm border border-slate-200 dark:border-slate-700 transition-all hover:scale-[1.01] cursor-pointer disabled:opacity-60"
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
                <span>{isGoogleAuthLoading ? 'Connecting to Google...' : 'Continue with Google'}</span>
              </button>

              <div className="flex items-center gap-3">
                <span className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">or sign in with password</span>
                <span className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
              </div>

              <form onSubmit={handleCredentialsSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1.5">
                    Account Email or Username
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      placeholder="e.g. pastor.david@ekklesphere.org"
                      className="w-full pl-10 pr-4 py-2.5 text-xs rounded-xl border border-[#E3E5F2] dark:border-[#2D2D55] bg-white dark:bg-[#1A1A3A] text-[#1D1B3A] dark:text-[#F2F2FA] focus:outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1.5">
                    Password or PIN
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-10 pr-4 py-2.5 text-xs rounded-xl border border-[#E3E5F2] dark:border-[#2D2D55] bg-white dark:bg-[#1A1A3A] text-[#1D1B3A] dark:text-[#F2F2FA] focus:outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1.5">
                    Select Access Role
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedRole('admin')}
                      className={`p-2.5 rounded-xl border text-xs font-semibold text-center transition-all ${
                        selectedRole === 'admin'
                          ? 'border-[#6D5CF2] bg-[#EFEDFF] dark:bg-indigo-950/60 text-[#6D5CF2] dark:text-[#8C7DFF]'
                          : 'border-[#E3E5F2] dark:border-[#2D2D55] text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      <LayoutDashboard className="w-4 h-4 mx-auto mb-1 text-[#6D5CF2]" />
                      <span>Admin</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedRole('usher')}
                      className={`p-2.5 rounded-xl border text-xs font-semibold text-center transition-all ${
                        selectedRole === 'usher'
                          ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                          : 'border-[#E3E5F2] dark:border-[#2D2D55] text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      <QrCode className="w-4 h-4 mx-auto mb-1 text-amber-500" />
                      <span>Usher</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedRole('member')}
                      className={`p-2.5 rounded-xl border text-xs font-semibold text-center transition-all ${
                        selectedRole === 'member'
                          ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                          : 'border-[#E3E5F2] dark:border-[#2D2D55] text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      <Smartphone className="w-4 h-4 mx-auto mb-1 text-emerald-500" />
                      <span>Member</span>
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-[#666A86] dark:text-[#A9ACC8]">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" defaultChecked className="rounded text-[#6D5CF2]" />
                    <span>Remember terminal</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setLoginEmail('pastor.david@ekklesphere.org');
                      setSelectedRole('admin');
                    }}
                    className="text-[#6D5CF2] dark:text-[#8C7DFF] hover:underline"
                  >
                    Fill demo admin
                  </button>
                </div>

                <button
                  type="submit"
                  className="w-full py-3 rounded-xl bg-[#6D5CF2] hover:bg-[#5A48DE] text-white font-bold text-xs shadow-lg shadow-indigo-500/30 flex items-center justify-center gap-2"
                >
                  <UserCheck className="w-4 h-4" />
                  <span>Authenticate & Open Portal</span>
                </button>
              </form>
            </div>
          )}

          {/* TAB 3: REGISTER NEW MEMBER */}
          {activeTab === 'register' && (
            <div className="max-w-lg mx-auto space-y-5">
              <div className="text-center space-y-1">
                <h2 className="text-lg font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                  Register as a Member of Accra Central
                </h2>
                <p className="text-xs text-[#666A86] dark:text-[#A9ACC8]">
                  Join the congregation database to enable your automated proximity pass, event check-in, and online giving.
                </p>
              </div>

              <form onSubmit={handleRegisterSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                      First Name
                    </label>
                    <input
                      type="text"
                      required
                      value={regFirstName}
                      onChange={(e) => setRegFirstName(e.target.value)}
                      placeholder="e.g. Kwabena"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-[#E3E5F2] dark:border-[#2D2D55] bg-white dark:bg-[#1A1A3A] text-[#1D1B3A] dark:text-[#F2F2FA] focus:outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                      Last Name
                    </label>
                    <input
                      type="text"
                      required
                      value={regLastName}
                      onChange={(e) => setRegLastName(e.target.value)}
                      placeholder="e.g. Agyemang"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-[#E3E5F2] dark:border-[#2D2D55] bg-white dark:bg-[#1A1A3A] text-[#1D1B3A] dark:text-[#F2F2FA] focus:outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                      Email Address
                    </label>
                    <input
                      type="email"
                      required
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="kwabena@example.com"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-[#E3E5F2] dark:border-[#2D2D55] bg-white dark:bg-[#1A1A3A] text-[#1D1B3A] dark:text-[#F2F2FA] focus:outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                      Phone (Ghana MoMo)
                    </label>
                    <input
                      type="tel"
                      required
                      value={regPhone}
                      onChange={(e) => setRegPhone(e.target.value)}
                      placeholder="+233 24 000 0000"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-[#E3E5F2] dark:border-[#2D2D55] bg-white dark:bg-[#1A1A3A] text-[#1D1B3A] dark:text-[#F2F2FA] focus:outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                    Cell / Fellowship Group
                  </label>
                  <select
                    value={regGroup}
                    onChange={(e) => setRegGroup(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-[#E3E5F2] dark:border-[#2D2D55] bg-white dark:bg-[#1A1A3A] text-[#1D1B3A] dark:text-[#F2F2FA] focus:outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                  >
                    <option value="Osu North cell">Osu North Cell</option>
                    <option value="Cantonments cell">Cantonments Cell</option>
                    <option value="Ridge & Airport cell">Ridge & Airport Cell</option>
                    <option value="Youth fellowship">Youth Fellowship</option>
                    <option value="Choir">Church Choir</option>
                    <option value="Ushers">Ushering Department</option>
                    <option value="Men’s fellowship">Men’s Fellowship</option>
                    <option value="Women’s fellowship">Women’s Fellowship</option>
                  </select>
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
                      Your phone will automatically acknowledge your presence when you arrive on Sunday morning via Bluetooth Beacon & Accra Central geofence.
                    </span>
                  </label>
                </div>

                <button
                  type="submit"
                  className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Join Congregation & Enter Member App</span>
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
