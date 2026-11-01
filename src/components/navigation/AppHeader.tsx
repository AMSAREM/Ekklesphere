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
  Check,
  Sliders,
  Settings,
  Bell,
  Sparkles,
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
    setIsSettingsModalOpen,
    viewMode,
    setViewMode,
    followupTasks,
    setIsFollowupModalOpen,
    members,
    attendanceRecords,
  } = useEkklesphere();

  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isNotifDropdownOpen, setIsNotifDropdownOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const notifMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (userMenuRef.current && !userMenuRef.current.contains(target)) {
        setIsUserMenuOpen(false);
      }
      if (notifMenuRef.current && !notifMenuRef.current.contains(target)) {
        setIsNotifDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const openFollowupCount = followupTasks.filter((t) => t.status === 'open').length;
  const checkedInMemberIds = new Set(attendanceRecords.map((r) => r.personId));
  const checkedInMembersCount = members.filter((m) => checkedInMemberIds.has(m.id)).length;
  const headerAbsenteeCount =
    members.length > 0
      ? Math.max(0, members.length - checkedInMembersCount)
      : Math.max(0, expectedAttendance - totalCheckedInCount);

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

  const getRoleDisplayName = (role?: string) => {
    switch (role) {
      case 'admin':
      case 'super_admin':
      case 'pastor':
        return 'Admin Portal';
      case 'usher':
        return 'Usher Station';
      case 'member':
      case 'group_leader':
        return 'Member App';
      case 'creator':
        return 'Creator Console';
      default:
        return 'Church Portal';
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-[#F6F7FC]/95 dark:bg-[#14142E]/95 backdrop-blur-md border-b border-[#E9EBF5] dark:border-[#2D2D55] transition-colors duration-200">
      <div className="max-w-[1440px] mx-auto px-3 sm:px-5 lg:px-8 h-14 flex items-center justify-between gap-2 sm:gap-4">
        {/* Left: Brand Identity & Active Campus Pill */}
        <div className="flex items-center gap-2.5 sm:gap-3.5 shrink-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#6D5CF2] to-[#8C7DFF] text-white flex items-center justify-center shadow-xs">
            <Radio className="w-4 h-4" />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-base sm:text-lg tracking-tight text-[#1D1B3A] dark:text-[#F2F2FA]">
              Ekklesphere
            </span>
            <div className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-200/60 dark:bg-white/10 text-[11px] font-medium text-[#666A86] dark:text-[#A9ACC8]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="truncate max-w-[140px]">{systemSettings?.campusName || 'Accra Central'}</span>
            </div>
            {/* Active Role Tag */}
            {currentUser && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#6D5CF2]/10 text-[#6D5CF2] dark:text-[#A594FD] text-[10px] font-bold">
                {getRoleDisplayName(currentUser.role)}
              </span>
            )}
          </div>
        </div>

        {/* Center: Live Attendance & Role Context (Clean and works across all roles) */}
        <div className="hidden md:flex items-center gap-3">
          {currentUser && (
            <div className="flex items-center gap-2.5 px-3 py-1 rounded-xl bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-xs shadow-2xs">
              <span className="text-[#666A86] dark:text-[#A9ACC8] font-medium">
                {currentUser.role === 'usher' ? 'Door Check-ins:' : 'Attendance:'}
              </span>
              <span className="font-bold text-[#1D1B3A] dark:text-[#F2F2FA] font-mono tabular-nums">
                {totalCheckedInCount}
                <span className="text-[#666A86] dark:text-[#A9ACC8] font-normal">/{expectedAttendance}</span>
              </span>
              <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                {attendancePercentage}%
              </span>
              {currentUser.role === 'admin' && headerAbsenteeCount > 0 && (
                <>
                  <span className="text-slate-300 dark:text-slate-600">|</span>
                  <span className="text-[11px] text-rose-500 font-medium">
                    {headerAbsenteeCount} absent
                  </span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Right: Uncluttered Utility Controls & Seamless Role Switcher */}
        <div className="flex items-center gap-1 sm:gap-2">
          {/* Quick Role Switcher Buttons (Desktop/Tablet) */}
          {currentUser && (
            <div className="hidden lg:flex items-center p-0.5 rounded-xl bg-slate-200/60 dark:bg-white/5 border border-slate-200/80 dark:border-white/10">
              {roles.map((item) => {
                const isActive =
                  currentUser.role === item.role ||
                  (item.role === 'admin' && (currentUser.role === 'super_admin' || currentUser.role === 'pastor')) ||
                  (item.role === 'member' && currentUser.role === 'group_leader');
                return (
                  <button
                    key={item.role}
                    onClick={() => {
                      switchUserRole(item.role);
                      showToast(`Switched to ${item.label} view`);
                    }}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      isActive
                        ? 'bg-white dark:bg-[#1D1D3D] text-[#6D5CF2] dark:text-[#A594FD] shadow-xs font-bold'
                        : 'text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-white'
                    }`}
                    title={`Switch to ${item.label} Portal`}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Platform Creator Quick Access Button */}
          {currentUser &&
            (currentUser.role === 'super_admin' ||
              currentUser.role === 'creator' ||
              currentUser.is_creator ||
              currentUser.email?.toLowerCase() === 'amoakoemmanuel2020@gmail.com' ||
              currentUser.email?.toLowerCase() === 'elenamends@gmail.com' ||
              currentUser.email?.toLowerCase() === 'elenaamoako70@gmail.com') && (
              <button
                onClick={() => setViewMode(viewMode === 'creator' ? 'app' : 'creator')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer ${
                  viewMode === 'creator'
                    ? 'bg-[#6D5CF2] text-white'
                    : 'bg-[#6D5CF2]/10 hover:bg-[#6D5CF2]/20 text-[#6D5CF2] dark:text-[#A594FD] border border-[#6D5CF2]/30'
                }`}
                title="Toggle Platform Creator Console"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Creator</span>
              </button>
            )}

          {/* Theme Switcher Toggle (Light / Dark Mode) */}
          <button
            onClick={toggleTheme}
            className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-200/60 dark:bg-[#202042] hover:bg-slate-300/70 dark:hover:bg-[#2A2A55] text-[#1D1B3A] dark:text-[#F2F2FA] transition-all cursor-pointer border border-[#E9EBF5] dark:border-[#2D2D55] shadow-2xs"
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

          {/* Notifications Bell for Sanctuary Alerts */}
          {currentUser && (
            <div className="relative" ref={notifMenuRef}>
              <button
                onClick={() => setIsNotifDropdownOpen(!isNotifDropdownOpen)}
                className="relative w-8 h-8 rounded-xl flex items-center justify-center text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
                title="Sanctuary Alerts & Follow-ups"
                aria-label="Notifications"
              >
                <Bell className="w-4 h-4" />
                {openFollowupCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#EF5A6F] ring-2 ring-white dark:ring-[#14142E]" />
                )}
              </button>

              {/* Notifications Popover */}
              {isNotifDropdownOpen && (
                <div className="absolute right-0 mt-2 w-72 sm:w-80 bg-white dark:bg-[#1D1D3D] rounded-2xl shadow-2xl border border-[#E9EBF5] dark:border-[#2D2D55] p-3 z-50 animate-in fade-in slide-in-from-top-2">
                  <div className="flex items-center justify-between pb-2 border-b border-[#E9EBF5] dark:border-[#2D2D55] mb-2">
                    <span className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">Sanctuary Alerts</span>
                    <span className="text-[10px] font-semibold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                      Radar Active
                    </span>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="p-2 rounded-xl bg-slate-50 dark:bg-white/5 flex items-start gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 mt-1 shrink-0" />
                      <div>
                        <p className="font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">Geofence Auto Check-in</p>
                        <p className="text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
                          Proximity radar is active for {systemSettings?.campusName || 'Accra Central'}.
                        </p>
                      </div>
                    </div>
                    {openFollowupCount > 0 ? (
                      <div className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/30 flex items-start gap-2">
                        <span className="w-2 h-2 rounded-full bg-rose-500 mt-1 shrink-0" />
                        <div>
                          <p className="font-bold text-rose-700 dark:text-rose-300">
                            {openFollowupCount} Pastoral Follow-ups
                          </p>
                          <p className="text-[11px] text-rose-600 dark:text-rose-400">
                            Members absent for 2–3 consecutive services.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-center text-[11px] text-[#666A86] dark:text-[#A9ACC8] py-2">
                        All care follow-ups are up to date!
                      </p>
                    )}
                  </div>
                  {currentUser.role === 'admin' && (
                    <button
                      onClick={() => {
                        setIsNotifDropdownOpen(false);
                        setIsFollowupModalOpen(true);
                      }}
                      className="w-full mt-2.5 py-1.5 rounded-xl bg-[#6D5CF2] text-white text-xs font-bold hover:bg-[#5b4be0] transition-colors cursor-pointer"
                    >
                      View Follow-up Tasks
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Help Guide Button */}
          {currentUser && (
            <button
              onClick={() => setIsHelpModalOpen(true)}
              className="w-8 h-8 rounded-xl flex items-center justify-center text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
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
                className="flex items-center gap-1.5 sm:gap-2 py-1 pl-1.5 pr-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
                aria-expanded={isUserMenuOpen}
                aria-haspopup="true"
                aria-label="User account menu"
              >
                <div className="w-7 h-7 rounded-lg bg-[#6D5CF2] text-white text-xs font-bold flex items-center justify-center shadow-xs">
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
                      {currentUser.title || getRoleDisplayName(currentUser.role)}
                    </div>
                  </div>

                  {/* Switch Role Quick Links (Available in all roles!) */}
                  <div className="px-2 py-1.5 border-b border-[#E9EBF5] dark:border-[#2D2D55]">
                    <div className="text-[10px] font-bold text-[#666A86] dark:text-[#A9ACC8] uppercase px-2 py-1 tracking-wider">
                      Switch Active Portal
                    </div>
                    {roles.map((item) => {
                      const isActive =
                        currentUser.role === item.role ||
                        (item.role === 'admin' &&
                          (currentUser.role === 'super_admin' || currentUser.role === 'pastor')) ||
                        (item.role === 'member' && currentUser.role === 'group_leader');
                      return (
                        <button
                          key={item.role}
                          onClick={() => {
                            switchUserRole(item.role);
                            setIsUserMenuOpen(false);
                            showToast(`Switched to ${item.label} mode`);
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                            isActive
                              ? 'bg-indigo-50 dark:bg-indigo-950/50 text-[#6D5CF2] dark:text-[#8C7DFF]'
                              : 'text-[#1D1B3A] dark:text-[#F2F2FA] hover:bg-slate-50 dark:hover:bg-white/5'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {item.icon}
                            <span>{item.label} Portal</span>
                          </div>
                          {isActive && <Check className="w-3.5 h-3.5 text-[#6D5CF2]" />}
                        </button>
                      );
                    })}
                  </div>

                  {/* System Settings & Help Options */}
                  <div className="px-2 py-1.5 border-b border-[#E9EBF5] dark:border-[#2D2D55]">
                    {currentUser.role === 'admin' && (
                      <button
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          setIsSettingsModalOpen(true);
                        }}
                        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs text-[#1D1B3A] dark:text-[#F2F2FA] hover:bg-slate-50 dark:hover:bg-white/5 transition-all cursor-pointer"
                      >
                        <Settings className="w-3.5 h-3.5 text-[#666A86] dark:text-[#A9ACC8]" />
                        <span>System Settings</span>
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        setIsHelpModalOpen(true);
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs text-[#1D1B3A] dark:text-[#F2F2FA] hover:bg-slate-50 dark:hover:bg-white/5 transition-all cursor-pointer"
                    >
                      <HelpCircle className="w-3.5 h-3.5 text-[#666A86] dark:text-[#A9ACC8]" />
                      <span>Help & Documentation</span>
                    </button>
                  </div>

                  {/* Sign Out */}
                  <div className="px-2 pt-1">
                    <button
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        logout();
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
};
