import React from 'react';
import { useEkklesphere } from '../context/EkklesphereContext';
import { LayoutDashboard, Smartphone, QrCode, Radio, Sun, Moon, ShieldCheck, Church } from 'lucide-react';

export const PortalHeader: React.FC = () => {
  const {
    activePortal,
    setActivePortal,
    theme,
    toggleTheme,
    totalCheckedInCount,
    expectedAttendance,
    isUsherOnline,
    currentService,
  } = useEkklesphere();

  return (
    <header className="sticky top-0 z-40 w-full bg-[#1D1B3A] text-white border-b border-indigo-950/60 shadow-md">
      <div className="max-w-[1440px] mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-2 sm:gap-4 overflow-hidden">
        {/* Brand & Church Name */}
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#6D5CF2] to-[#8C7DFF] flex items-center justify-center text-white shadow-sm shadow-indigo-500/30 shrink-0">
            <Church className="w-4 h-4" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-xs sm:text-sm tracking-tight flex items-center gap-1.5 text-white whitespace-nowrap">
              Ekklesphere
              <span className="hidden xs:inline-block text-[9px] sm:text-[10px] font-semibold text-emerald-400 bg-emerald-950/70 border border-emerald-800/60 px-1.5 py-0.5 rounded-md">
                Accra Central
              </span>
            </span>
          </div>
        </div>

        {/* Unified Portal Selector with horizontal scroll safety on tiny screens */}
        <nav
          className="flex items-center gap-1 bg-black/35 p-1 rounded-xl border border-white/10 overflow-x-auto max-w-[55%] sm:max-w-none scrollbar-none"
          aria-label="Portal Navigation"
        >
          <button
            onClick={() => setActivePortal('admin')}
            className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-all ${
              activePortal === 'admin'
                ? 'bg-[#6D5CF2] text-white shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
            title="Admin Management Dashboard"
          >
            <LayoutDashboard className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden md:inline">Admin Dashboard</span>
            <span className="md:hidden text-[11px]">Admin</span>
          </button>

          <button
            onClick={() => setActivePortal('member')}
            className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-all ${
              activePortal === 'member'
                ? 'bg-[#6D5CF2] text-white shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
            title="Member Self-Service Mobile App"
          >
            <Smartphone className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden md:inline">Member App</span>
            <span className="md:hidden text-[11px]">Member</span>
          </button>

          <button
            onClick={() => setActivePortal('usher')}
            className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-all ${
              activePortal === 'usher'
                ? 'bg-[#6D5CF2] text-white shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
            title="Usher Door Scanner PWA"
          >
            <QrCode className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden md:inline">Usher Tool</span>
            <span className="md:hidden text-[11px]">Usher</span>
            {!isUsherOnline && (
              <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" title="Offline mode active" />
            )}
          </button>

          <button
            onClick={() => setActivePortal('simulator')}
            className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-all ${
              activePortal === 'simulator'
                ? 'bg-[#6D5CF2] text-white shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
            title="2D Proximity & Geofence Radar"
          >
            <Radio className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="hidden md:inline">Radar Sim</span>
            <span className="md:hidden text-[11px]">Radar</span>
          </button>
        </nav>

        {/* Right Actions: Live Tally & Theme Toggle */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0 text-xs">
          <div className="hidden lg:flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1 text-slate-300 whitespace-nowrap">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <span className="truncate max-w-[140px]">{currentService.name.split(',')[0]}</span>
            <span className="text-white font-bold tabular-nums">
              {totalCheckedInCount} / {expectedAttendance}
            </span>
          </div>

          <div
            className="hidden xl:flex items-center gap-1.5 text-slate-400 text-[11px] whitespace-nowrap"
            title="Ghana Data Protection Act (Act 843) Compliant"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Act 843</span>
          </div>

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
