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
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
        {/* Brand & Church Name */}
        <div className="flex items-center gap-3 shrink-0">
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
        </div>

        {/* Unified Portal Selector */}
        <nav className="flex items-center gap-1 bg-black/30 p-1 rounded-xl border border-white/10" aria-label="Portal Navigation">
          <button
            onClick={() => setActivePortal('admin')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activePortal === 'admin'
                ? 'bg-[#6D5CF2] text-white shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Admin Dashboard</span>
          </button>

          <button
            onClick={() => setActivePortal('member')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activePortal === 'member'
                ? 'bg-[#6D5CF2] text-white shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Member Mobile App</span>
          </button>

          <button
            onClick={() => setActivePortal('usher')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activePortal === 'usher'
                ? 'bg-[#6D5CF2] text-white shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <QrCode className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Usher PWA</span>
            {!isUsherOnline && (
              <span className="w-2 h-2 rounded-full bg-amber-400" title="Offline mode" />
            )}
          </button>

          <button
            onClick={() => setActivePortal('simulator')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activePortal === 'simulator'
                ? 'bg-[#6D5CF2] text-white shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <Radio className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Proximity Radar</span>
          </button>
        </nav>

        {/* Right Actions: Live Service Status & Theme Toggle */}
        <div className="flex items-center gap-3 shrink-0 text-xs">
          <div className="hidden lg:flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1 text-slate-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>{currentService.name.split(',')[0]}</span>
            <span className="text-white font-bold tabular-nums">
              {totalCheckedInCount} / {expectedAttendance}
            </span>
          </div>

          <div className="hidden md:flex items-center gap-1.5 text-slate-400 text-[11px]" title="Ghana Data Protection Act (Act 843) Compliant">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Act 843</span>
          </div>

          <button
            onClick={toggleTheme}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/15 text-slate-300 hover:text-white flex items-center justify-center transition-colors"
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
