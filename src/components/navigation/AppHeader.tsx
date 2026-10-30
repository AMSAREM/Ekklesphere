import React, { useState, useRef, useEffect } from 'react';
import { useEkklesphere } from '../../context/EkklesphereContext';
import { UserRole } from '../../types/ekklesphere';
import {
  Radio,
  Sun,
  Moon,
  HelpCircle,
  LogOut,
  ChevronDown,
  LayoutDashboard,
  Smartphone,
  QrCode,
  ShieldCheck,
  Menu,
  X,
  Check,
} from 'lucide-react';

export const AppHeader: React.FC = () => {
  const {
    currentUser,
    switchUserRole,
    logout,
    theme,
    toggleTheme,
    setIsHelpModalOpen,
    totalCheckedInCount,
    expectedAttendance,
    attendancePercentage,
    currentService,
    showToast,
    systemSettings,
  } = useEkklesphere();

  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const roles: Array<{ role: UserRole; label: string; icon: React.ReactNode }> = [
    {
      role: 'admin',
      label: 'Admin',
      icon: <LayoutDashboard className="w-3.5 h-3.5" />,
    },
    {
      role: 'usher',
      label: 'Usher',
      icon: <QrCode className="w-3.5 h-3.5" />,
    },
    {
      role: 'member',
      label: 'Member',
      icon: <Smartphone className="w-3.5 h-3.5" />,
    },
  ];

  return (
    <header className="sticky top-0 z-40 w-full bg-[#F6F7FC]/90 dark:bg-[#14142E]/90 backdrop-blur-md border-b border-[#E9EBF5] dark:border-[#2D2D55] transition-colors duration-200">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-4">
        {/* Left: Brand Identity */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-8 h-8 rounded-xl bg-[#6D5CF2] text-white flex items-center justify-center shadow-xs">
            <Radio className="w-4 h-4" />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-base tracking-tight text-[#1D1B3A] dark:text-[#F2F2FA]">
              Ekklesphere
            </span>
            <div className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-200/60 dark:bg-white/10 text-[11px] font-medium text-[#666A86] dark:text-[#A9ACC8]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>{systemSettings?.campusName || 'Accra Central'}</span>
            </div>
          </div>
        </div>

        {/* Center: Quick Portal Switcher Pills */}
        {currentUser && (
          <nav aria-label="Portal Navigation" className="hidden md:flex items-center gap-1 bg-slate-200/50 dark:bg-white/5 p-1 rounded-2xl border border-[#E9EBF5] dark:border-[#2D2D55]">
            {roles.map((item) => (
              <button
                key={item.role}
                onClick={() => {
                  switchUserRole(item.role);
                  showToast(`Switched to ${item.label} portal`);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  currentUser.role === item.role
                    ? 'bg-[#6D5CF2] text-white shadow-xs'
                    : 'text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-[#F2F2FA]'
                }`}
              >
                {item.icon}
                <span>{item.label} Portal</span>
              </button>
            ))}
          </nav>
        )}

        {/* Right: Uncluttered Utility Controls */}
        <div className="flex items-center gap-1 sm:gap-2">
          {/* Subtle Live Attendance Tally (Large screens) */}
          {currentUser && (
            <div className="hidden xl:flex items-center gap-2 text-xs text-[#666A86] dark:text-[#A9ACC8] pr-2 mr-1 border-r border-[#E9EBF5] dark:border-[#2D2D55]">
              <span>Attendance:</span>
              <span className="font-bold text-[#1D1B3A] dark:text-[#F2F2FA] font-mono tabular-nums">
                {totalCheckedInCount}/{expectedAttendance}
              </span>
              <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1 rounded">
                {attendancePercentage}%
              </span>
            </div>
          )}

          {/* Theme Switcher Toggle (Light / Dark Mode) */}
          <button
            onClick={toggleTheme}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-200/60 dark:bg-[#202042] hover:bg-slate-300/70 dark:hover:bg-[#2A2A55] text-[#1D1B3A] dark:text-[#F2F2FA] transition-all cursor-pointer border border-[#E9EBF5] dark:border-[#2D2D55] shadow-2xs"
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
            aria-label={`Toggle theme (Currently ${theme === 'dark' ? 'Dark' : 'Light'} mode)`}
          >
            {theme === 'dark' ? (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-400 fill-amber-400/20" />
                <span className="text-[11px] font-medium hidden sm:inline text-amber-300">Light</span>
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5 text-indigo-600 fill-indigo-600/20" />
                <span className="text-[11px] font-medium hidden sm:inline text-[#666A86]">Dark</span>
              </>
            )}
          </button>

          {/* Help Guide Ghost Button */}
          {currentUser && (
            <button
              onClick={() => setIsHelpModalOpen(true)}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
              title="Help & Guides"
              aria-label="Help Documentation"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          )}

          {/* User Profile Dropdown Button */}
          {currentUser ? (
            <div className="relative ml-1" ref={userMenuRef}>
              <button
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className="flex items-center gap-2 py-1 pl-1.5 pr-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
                aria-expanded={isUserMenuOpen}
                aria-haspopup="true"
                aria-label="User account menu"
              >
                <div className="w-7 h-7 rounded-lg bg-[#6D5CF2] text-white text-xs font-bold flex items-center justify-center">
                  {currentUser.initials}
                </div>
                <span className="hidden sm:inline text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                  {currentUser.name.split(' ')[0]}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-[#666A86] dark:text-[#A9ACC8] hidden sm:block" />
              </button>

              {/* User Dropdown Menu */}
              {isUserMenuOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-[#1D1D3D] rounded-2xl shadow-2xl border border-[#E9EBF5] dark:border-[#2D2D55] py-2 z-50 animate-in fade-in zoom-in-95">
                  <div className="px-4 py-2 border-b border-[#E9EBF5] dark:border-[#2D2D55]">
                    <div className="font-bold text-xs text-[#1D1B3A] dark:text-[#F2F2FA]">
                      {currentUser.name}
                    </div>
                    <div className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] truncate">
                      {currentUser.email}
                    </div>
                    <div className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-[#6D5CF2] dark:text-[#8C7DFF] text-[10px] font-bold">
                      <ShieldCheck className="w-3 h-3" />
                      {currentUser.title}
                    </div>
                  </div>

                  {/* Switch Role Quick Links */}
                  <div className="px-2 py-1.5 border-b border-[#E9EBF5] dark:border-[#2D2D55]">
                    <div className="text-[10px] font-bold text-[#666A86] dark:text-[#A9ACC8] uppercase px-2 py-1 tracking-wider">
                      Switch Active Portal
                    </div>
                    {roles.map((item) => (
                      <button
                        key={item.role}
                        onClick={() => {
                          switchUserRole(item.role);
                          setIsUserMenuOpen(false);
                          showToast(`Switched to ${item.label} mode`);
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                          currentUser.role === item.role
                            ? 'bg-indigo-50 dark:bg-indigo-950/50 text-[#6D5CF2] dark:text-[#8C7DFF]'
                            : 'text-[#1D1B3A] dark:text-[#F2F2FA] hover:bg-slate-50 dark:hover:bg-white/5'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {item.icon}
                          <span>{item.label} Portal</span>
                        </div>
                        {currentUser.role === item.role && <Check className="w-3.5 h-3.5 text-[#6D5CF2]" />}
                      </button>
                    ))}
                  </div>

                  {/* Theme Switcher in Dropdown */}
                  <div className="px-2 py-1.5 border-b border-[#E9EBF5] dark:border-[#2D2D55]">
                    <div className="text-[10px] font-bold text-[#666A86] dark:text-[#A9ACC8] uppercase px-2 py-1 tracking-wider">
                      Appearance
                    </div>
                    <button
                      onClick={() => {
                        toggleTheme();
                      }}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-semibold text-[#1D1B3A] dark:text-[#F2F2FA] hover:bg-slate-50 dark:hover:bg-white/5 transition-all cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        {theme === 'dark' ? (
                          <Sun className="w-3.5 h-3.5 text-amber-400" />
                        ) : (
                          <Moon className="w-3.5 h-3.5 text-indigo-500" />
                        )}
                        <span>{theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</span>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded-md font-medium bg-black/5 dark:bg-white/10 text-[#666A86] dark:text-[#A9ACC8]">
                        Toggle
                      </span>
                    </button>
                  </div>

                  <div className="px-2 pt-1">
                    <button
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        logout();
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all cursor-pointer"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs font-semibold text-[#666A86] dark:text-[#A9ACC8]">
              Accra Central Church
            </div>
          )}

          {/* Mobile Menu Toggle Button */}
          {currentUser && (
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden w-8 h-8 rounded-lg flex items-center justify-center text-[#1D1B3A] dark:text-[#F2F2FA] hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              aria-label="Toggle mobile navigation menu"
            >
              {isMobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>

      {/* Mobile Drawer */}
      {currentUser && isMobileMenuOpen && (
        <div className="md:hidden px-4 py-3 bg-[#F6F7FC] dark:bg-[#14142E] border-t border-[#E9EBF5] dark:border-[#2D2D55] animate-in slide-in-from-top-2">
          <div className="text-[11px] font-bold text-[#666A86] dark:text-[#A9ACC8] mb-2 uppercase tracking-wider">
            Switch Portal & Role
          </div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {roles.map((item) => (
              <button
                key={item.role}
                onClick={() => {
                  switchUserRole(item.role);
                  setIsMobileMenuOpen(false);
                  showToast(`Switched to ${item.label} mode`);
                }}
                className={`flex flex-col items-center gap-1 p-2 rounded-xl text-center text-xs font-bold border transition-all ${
                  currentUser.role === item.role
                    ? 'bg-white dark:bg-[#6D5CF2] border-[#6D5CF2] text-[#6D5CF2] dark:text-white shadow-xs'
                    : 'bg-white/50 dark:bg-[#1D1D3D]/50 border-[#E9EBF5] dark:border-[#2D2D55] text-[#666A86] dark:text-[#A9ACC8]'
                }`}
              >
                {item.icon}
                <span className="text-[11px]">{item.label}</span>
              </button>
            ))}
          </div>

          {/* Mobile Theme Toggle */}
          <div className="flex items-center justify-between py-2 border-t border-[#E9EBF5] dark:border-[#2D2D55]">
            <span className="text-xs font-semibold text-[#1D1B3A] dark:text-[#F2F2FA]">Appearance</span>
            <button
              onClick={toggleTheme}
              className="flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold bg-slate-200/60 dark:bg-[#202042] text-[#1D1B3A] dark:text-[#F2F2FA]"
            >
              {theme === 'dark' ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-indigo-500" />}
              <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
            </button>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-[#E9EBF5] dark:border-[#2D2D55] text-xs">
            <span className="text-[#666A86] dark:text-[#A9ACC8] truncate max-w-[200px]">
              {currentService.name}
            </span>
            <span className="font-bold text-[#1D1B3A] dark:text-[#F2F2FA] font-mono">
              {totalCheckedInCount}/{expectedAttendance}
            </span>
          </div>
        </div>
      )}
    </header>
  );
};
