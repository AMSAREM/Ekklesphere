import React, { useState, useRef, useEffect } from 'react';
import { useEkklesphere, DEMO_USERS } from '../context/EkklesphereContext';
import { UserRole } from '../types/ekklesphere';
import {
  LayoutDashboard,
  Smartphone,
  QrCode,
  Radio,
  Sun,
  Moon,
  ShieldCheck,
  Church,
  LogOut,
  ChevronDown,
  Sparkles,
  LogIn,
  KeyRound,
  Check,
  Menu,
  HelpCircle,
} from 'lucide-react';

export const PortalHeader: React.FC = () => {
  const {
    currentUser,
    logout,
    switchUserRole,
    activePortal,
    setActivePortal,
    isSidebarCollapsed,
    isMobileNavOpen,
    setIsMobileNavOpen,
    adminSubTab,
    setIsHelpModalOpen,
    theme,
    toggleTheme,
    totalCheckedInCount,
    expectedAttendance,
    isUsherOnline,
    currentService,
  } = useEkklesphere();

  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsAccountMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getRoleBadgeColor = (role?: UserRole) => {
    switch (role) {
      case 'admin':
        return 'bg-indigo-500/20 text-indigo-300 border-indigo-400/30';
      case 'usher':
        return 'bg-amber-500/20 text-amber-300 border-amber-400/30';
      case 'member':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30';
      default:
        return 'bg-slate-500/20 text-slate-300 border-slate-400/30';
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-[#1D1B3A] text-white border-b border-indigo-950/60 shadow-md">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3 sm:gap-4">
        {/* Mobile Drawer Button & Brand / Breadcrumbs */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {currentUser && (
            <button
              onClick={() => setIsMobileNavOpen(true)}
              aria-label="Open navigation sidebar"
              className="md:hidden flex items-center justify-center w-10 h-10 -ml-1 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 active:scale-95 transition-all"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}

          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#6D5CF2] to-[#8C7DFF] flex items-center justify-center text-white shadow-sm shadow-indigo-500/30">
            <Church className="w-4 h-4" />
          </div>

          <div className="flex flex-col">
            <span className="font-bold text-sm tracking-tight flex items-center gap-1.5 text-white">
              Ekklesphere
              <span className="text-[10px] font-medium text-emerald-400 bg-emerald-950/70 border border-emerald-800/60 px-1.5 py-0.2 rounded-md">
                Accra Central
              </span>
            </span>
          </div>

          {/* Contextual Breadcrumb */}
          {currentUser && (
            <div className="hidden lg:flex items-center gap-2 pl-3 ml-2 border-l border-white/15 text-xs text-slate-300">
              <span className="text-slate-400">Section:</span>
              <span className="font-semibold text-white">
                {activePortal === 'admin'
                  ? adminSubTab === 'workflows'
                    ? 'Pastoral Care Workflows'
                    : adminSubTab === 'integrations'
                    ? 'People & Directory'
                    : 'Executive Dashboard'
                  : activePortal === 'usher'
                  ? 'Door Check-in Station'
                  : activePortal === 'member'
                  ? 'Member Mobile Portal'
                  : 'Proximity Radar & Beacons'}
              </span>
            </div>
          )}
        </div>

        {/* Live Service Status Pill or Guest Indicator (Center) */}
        {currentUser ? (
          <div className="hidden sm:flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-slate-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="truncate max-w-[140px] md:max-w-none">{currentService.name.split(',')[0]}</span>
            <span className="text-white font-bold tabular-nums">
              {totalCheckedInCount} / {expectedAttendance}
            </span>
          </div>
        ) : (
          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-300 bg-white/5 px-3 py-1.5 rounded-xl border border-white/10">
            <KeyRound className="w-3.5 h-3.5 text-indigo-400" />
            <span>Authentication Portal · Select a role below</span>
          </div>
        )}

        {/* Right Actions: Attendance Tally, User Account Dropdown, & Theme Toggle */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0 text-xs">
          {/* Live Service Pill */}
          <div className="hidden xl:flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1 text-slate-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>{currentService.name.split(',')[0]}</span>
            <span className="text-white font-bold tabular-nums">
              {totalCheckedInCount} / {expectedAttendance}
            </span>
          </div>

          <div className="hidden 2xl:flex items-center gap-1.5 text-slate-400 text-[11px]" title="Ghana Data Protection Act (Act 843) Compliant">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Act 843</span>
          </div>

          {/* User Account / Role Switcher Menu */}
          {currentUser ? (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setIsAccountMenuOpen((prev) => !prev)}
                className="flex items-center gap-2 pl-2 pr-2.5 py-1 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-white transition-all focus:outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                aria-haspopup="true"
                aria-expanded={isAccountMenuOpen}
              >
                <div className="w-6 h-6 rounded-lg bg-[#6D5CF2] text-white flex items-center justify-center font-bold text-[11px] shadow-sm overflow-hidden shrink-0">
                  {currentUser.avatar ? (
                    <img src={currentUser.avatar} alt={currentUser.name} className="w-full h-full object-cover" />
                  ) : (
                    currentUser.initials
                  )}
                </div>
                <div className="hidden sm:flex flex-col text-left">
                  <span className="text-xs font-semibold leading-tight flex items-center gap-1">
                    {currentUser.name.split(' ')[0]}
                    <span className={`text-[9px] uppercase font-bold px-1 py-0.2 rounded border ${getRoleBadgeColor(currentUser.role)}`}>
                      {currentUser.role}
                    </span>
                  </span>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-300" />
              </button>

              {/* Account Dropdown Menu */}
              {isAccountMenuOpen && (
                <div className="absolute right-0 mt-2 w-72 bg-white dark:bg-[#1A1A3A] text-[#1D1B3A] dark:text-[#F2F2FA] rounded-2xl shadow-2xl border border-[#E3E5F2] dark:border-[#2D2D55] p-3 z-50 animate-in fade-in slide-in-from-top-2">
                  {/* User Info Header */}
                  <div className="p-2 border-b border-[#E3E5F2] dark:border-[#2D2D55] mb-2 flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#6D5CF2] text-white flex items-center justify-center font-bold text-xs shadow-sm overflow-hidden shrink-0">
                      {currentUser.avatar ? (
                        <img src={currentUser.avatar} alt={currentUser.name} className="w-full h-full object-cover" />
                      ) : (
                        currentUser.initials
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-sm text-[#1D1B3A] dark:text-[#F2F2FA] truncate">
                        {currentUser.name}
                      </div>
                      <div className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] font-medium truncate">
                        {currentUser.title}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                        {currentUser.email}
                      </div>
                      <div className="mt-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-indigo-50 dark:bg-indigo-950/60 text-[#6D5CF2] dark:text-[#8C7DFF] border border-indigo-200 dark:border-indigo-800">
                        <span>{currentUser.campusName}</span>
                      </div>
                    </div>
                  </div>

                  {/* Switch Role Fast Buttons */}
                  <div className="mb-2">
                    <div className="text-[10px] uppercase font-bold text-slate-400 px-2 py-1 flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-amber-500" />
                      <span>Switch Active Profile:</span>
                    </div>

                    <div className="space-y-1">
                      <button
                        onClick={() => {
                          switchUserRole('admin');
                          setIsAccountMenuOpen(false);
                        }}
                        className={`w-full flex items-center justify-between p-2 rounded-xl text-xs font-semibold transition-all ${
                          currentUser.role === 'admin'
                            ? 'bg-indigo-50 dark:bg-indigo-950/70 text-[#6D5CF2] dark:text-[#8C7DFF]'
                            : 'hover:bg-slate-100 dark:hover:bg-white/5 text-[#1D1B3A] dark:text-[#F2F2FA]'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <LayoutDashboard className="w-3.5 h-3.5 text-[#6D5CF2]" />
                          <span>Pastor David (Admin)</span>
                        </div>
                        {currentUser.role === 'admin' && <Check className="w-3.5 h-3.5 text-[#6D5CF2]" />}
                      </button>

                      <button
                        onClick={() => {
                          switchUserRole('usher');
                          setIsAccountMenuOpen(false);
                        }}
                        className={`w-full flex items-center justify-between p-2 rounded-xl text-xs font-semibold transition-all ${
                          currentUser.role === 'usher'
                            ? 'bg-amber-50 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300'
                            : 'hover:bg-slate-100 dark:hover:bg-white/5 text-[#1D1B3A] dark:text-[#F2F2FA]'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <QrCode className="w-3.5 h-3.5 text-amber-500" />
                          <span>Samuel Tetteh (Usher)</span>
                        </div>
                        {currentUser.role === 'usher' && <Check className="w-3.5 h-3.5 text-amber-500" />}
                      </button>

                      <button
                        onClick={() => {
                          switchUserRole('member');
                          setIsAccountMenuOpen(false);
                        }}
                        className={`w-full flex items-center justify-between p-2 rounded-xl text-xs font-semibold transition-all ${
                          currentUser.role === 'member'
                            ? 'bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300'
                            : 'hover:bg-slate-100 dark:hover:bg-white/5 text-[#1D1B3A] dark:text-[#F2F2FA]'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Smartphone className="w-3.5 h-3.5 text-emerald-500" />
                          <span>Ama Mensah (Member)</span>
                        </div>
                        {currentUser.role === 'member' && <Check className="w-3.5 h-3.5 text-emerald-500" />}
                      </button>
                    </div>
                  </div>

                  {/* Sign Out Button */}
                  <div className="pt-2 border-t border-[#E3E5F2] dark:border-[#2D2D55]">
                    <button
                      onClick={() => {
                        logout();
                        setIsAccountMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-2 p-2 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Sign Out / Change Account</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => logout()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#6D5CF2] hover:bg-[#5A48DE] text-white text-xs font-bold transition-all shadow-sm shadow-indigo-500/30"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Sign In</span>
            </button>
          )}

          {/* Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/15 text-slate-300 hover:text-white flex items-center justify-center transition-colors shrink-0"
            aria-label="Toggle theme"
            title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          >
            {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </header>
  );
};
