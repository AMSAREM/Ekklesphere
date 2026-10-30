import React, { useState, useRef, useEffect } from 'react';
import { useEkklesphere } from '../../context/EkklesphereContext';
import {
  Radio,
  Sun,
  Moon,
  HelpCircle,
  LogOut,
  ChevronDown,
  ShieldCheck,
  X,
  Grid,
  CheckSquare,
  Plus,
  Search,
  Bell,
  Settings,
  Download,
  Sliders,
  Globe,
} from 'lucide-react';

export const AppHeader: React.FC = () => {
  const {
    currentUser,
    logout,
    theme,
    setTheme,
    toggleTheme,
    adminSubTab,
    setAdminSubTab,
    searchQuery,
    setSearchQuery,
    setIsHelpModalOpen,
    setIsSettingsModalOpen,
    setIsAddServiceOpen,
    setIsFollowupModalOpen,
    followupTasks,
    members,
    checkInPerson,
    totalCheckedInCount,
    expectedAttendance,
    attendancePercentage,
    showToast,
    systemSettings,
    setViewMode,
  } = useEkklesphere();

  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isNotifDropdownOpen, setIsNotifDropdownOpen] = useState(false);

  const userMenuRef = useRef<HTMLDivElement>(null);
  const notifMenuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isMobileSearchOpen) {
      setTimeout(() => mobileSearchInputRef.current?.focus(), 50);
    }
  }, [isMobileSearchOpen]);

  const openFollowupCount = followupTasks.filter((t) => t.status === 'open').length;

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

  // Keyboard shortcut (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        setIsSearchFocused(true);
      }
      if (e.key === 'Escape') {
        setIsSearchFocused(false);
        setIsUserMenuOpen(false);
        setIsMobileMenuOpen(false);
        setIsMobileSearchOpen(false);
        setIsNotifDropdownOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);


  const adminTabs: Array<{
    id: 'dashboard' | 'workflows' | 'proximity' | 'integrations';
    label: string;
    icon: React.ReactNode;
  }> = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: <Grid className="w-4 h-4 text-[#6D5CF2]" />,
    },
    {
      id: 'workflows',
      label: 'Workflows',
      icon: <CheckSquare className="w-4 h-4 text-[#6D5CF2]" />,
    },
    {
      id: 'proximity',
      label: 'Proximity',
      icon: <Radio className="w-4 h-4 text-[#6D5CF2]" />,
    },
    {
      id: 'integrations',
      label: 'Integrations',
      icon: <Plus className="w-4 h-4 text-[#6D5CF2]" />,
    },
  ];

  const matchingMembers = searchQuery.trim()
    ? members
        .filter(
          (m) =>
            `${m.firstName} ${m.lastName}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
            m.phoneE164.includes(searchQuery) ||
            m.groupName.toLowerCase().includes(searchQuery.toLowerCase())
        )
        .slice(0, 5)
    : [];

  const handleExportCSV = () => {
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      ['Member,Phone,Group,Status,ConsecutiveAbsences,AutoCheckin']
        .concat(
          members.map(
            (m) =>
              `"${m.firstName} ${m.lastName}","${m.phoneE164}","${m.groupName}","${m.status}",${m.consecutiveAbsences},${m.autoCheckinOptedIn}`
          )
        )
        .join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `ekklesphere-attendance-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Attendance report exported as CSV');
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-[#F6F7FC]/90 dark:bg-[#14142E]/90 backdrop-blur-md border-b border-[#E9EBF5] dark:border-[#2D2D55] transition-colors duration-200">
      <div className="max-w-[1440px] mx-auto px-3 sm:px-5 lg:px-8 h-16 flex items-center justify-between gap-3 sm:gap-4">
        {/* Left: Brand Identity */}
        <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
          <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-[#6D5CF2] to-[#8C7DFF] text-white flex items-center justify-center shadow-[0_4px_12px_rgba(109,92,242,0.25)] transition-transform hover:scale-105">
            <Radio className="w-4.5 h-4.5" />
          </div>
          <span className="font-extrabold text-base sm:text-lg tracking-tight text-[#1D1B3A] dark:text-[#F2F2FA]">
            Ekklesphere
          </span>
        </div>

        {/* Center: Navigation Tabs & Search */}
        <div className="hidden lg:flex items-center gap-3 xl:gap-4 flex-1 justify-center max-w-2xl">
          {currentUser?.role === 'admin' && (
            <nav
              aria-label="Admin Sections"
              className="flex items-center p-1 rounded-2xl bg-slate-200/50 dark:bg-white/5 border border-slate-200/60 dark:border-white/10 shadow-2xs"
            >
              {adminTabs.map((tab) => {
                const isActive = adminSubTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setAdminSubTab(tab.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-all duration-150 ${
                      isActive
                        ? 'bg-white dark:bg-[#1D1D3D] text-[#1D1B3A] dark:text-[#F2F2FA] font-bold shadow-xs'
                        : 'text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-[#F2F2FA] hover:bg-white/50 dark:hover:bg-white/5'
                    }`}
                  >
                    {tab.icon}
                    <span className="hidden xl:inline">{tab.label}</span>
                    <span className="xl:hidden">{tab.id === 'dashboard' ? 'Dash' : tab.label}</span>
                  </button>
                );
              })}
            </nav>
          )}

          {/* Clean Search Bar */}
          <div className="relative flex-1 max-w-[200px] xl:max-w-[240px] focus-within:max-w-[280px] transition-all duration-200">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#666A86] dark:text-[#A9ACC8] pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              placeholder="Search..."
              className="w-full pl-8 pr-10 py-1.5 bg-white dark:bg-[#1D1D3D] hover:border-[#6D5CF2]/40 focus:border-[#6D5CF2] rounded-xl text-xs text-[#1D1B3A] dark:text-[#F2F2FA] border border-[#E9EBF5] dark:border-[#2D2D55] outline-none shadow-2xs transition-all placeholder-[#666A86] dark:placeholder-[#A9ACC8]"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {searchQuery ? (
                <button
                  onClick={() => setSearchQuery('')}
                  className="p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              ) : (
                <kbd className="hidden xl:inline-block px-1.5 py-0.5 text-[9px] font-mono text-[#666A86] dark:text-[#A9ACC8] bg-slate-100 dark:bg-white/10 rounded border border-[#E9EBF5] dark:border-[#2D2D55]">
                  ⌘K
                </kbd>
              )}
            </div>

            {/* Instant Search Results Dropdown */}
            {isSearchFocused && searchQuery.trim().length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-2 bg-white dark:bg-[#1D1D3D] rounded-2xl shadow-2xl border border-[#E9EBF5] dark:border-[#2D2D55] p-2 z-50 animate-in fade-in slide-in-from-top-2 max-h-72 overflow-y-auto">
                <div className="flex items-center justify-between px-2 py-1 text-[10px] font-bold text-[#666A86] dark:text-[#A9ACC8] border-b border-[#E9EBF5] dark:border-[#2D2D55] mb-1">
                  <span>Matches ({matchingMembers.length})</span>
                  <button
                    onClick={() => setIsSearchFocused(false)}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                  >
                    Close
                  </button>
                </div>
                {matchingMembers.length === 0 ? (
                  <p className="text-center text-xs text-[#666A86] dark:text-[#A9ACC8] py-4">
                    No members found matching "{searchQuery}"
                  </p>
                ) : (
                  matchingMembers.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-[#6D5CF2]/15 text-[#6D5CF2] text-xs font-bold flex items-center justify-center">
                          {m.avatarInitials}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                            {m.firstName} {m.lastName}
                          </p>
                          <p className="text-[10px] text-[#666A86] dark:text-[#A9ACC8]">
                            {m.phoneE164} · {m.groupName}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          checkInPerson(m.id, 'manual', 95, 'Header quick check-in');
                          setIsSearchFocused(false);
                          setSearchQuery('');
                          showToast(`Checked in ${m.firstName} ${m.lastName}`);
                        }}
                        className="px-2 py-1 rounded-lg bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] hover:bg-[#6D5CF2] hover:text-white text-[11px] font-bold transition-all cursor-pointer"
                      >
                        Check In
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: Controls & Actions */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {/* Search Toggle Button */}
          <button
            onClick={() => {
              if (window.innerWidth >= 1024 && searchInputRef.current) {
                searchInputRef.current.focus();
                setIsSearchFocused(true);
                showToast('Search active (⌘K)');
              } else {
                setIsMobileSearchOpen((prev) => !prev);
              }
            }}
            aria-expanded={isMobileSearchOpen}
            aria-label="Toggle search input"
            title="Search members or commands (⌘K)"
            className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
              isMobileSearchOpen
                ? 'bg-[#6D5CF2] text-white shadow-xs'
                : 'text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5'
            }`}
          >
            <Search className="w-4 h-4" />
          </button>

          {/* Live Attendance Tally (Large screens) */}
          {currentUser && (
            <div className="hidden 2xl:flex items-center gap-1.5 text-xs text-[#666A86] dark:text-[#A9ACC8] px-2.5 py-1 rounded-full bg-slate-100 dark:bg-white/5 border border-[#E9EBF5] dark:border-white/5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-medium">Attendance:</span>
              <span className="font-bold text-[#1D1B3A] dark:text-[#F2F2FA] font-mono tabular-nums">
                {totalCheckedInCount}/{expectedAttendance}
              </span>
              <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                ({attendancePercentage}%)
              </span>
            </div>
          )}

          {/* Simple Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
            title={theme === 'dark' ? 'Switch to Light mode' : 'Switch to Dark mode'}
            aria-label="Toggle color theme"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4" />
            )}
          </button>

          {/* Simple Notifications Bell */}
          <div className="relative" ref={notifMenuRef}>
            <button
              onClick={() => setIsNotifDropdownOpen(!isNotifDropdownOpen)}
              className="relative w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
              title="Sanctuary Alerts & Follow-ups"
              aria-label="Notifications"
            >
              <Bell className="w-4 h-4" />
              {openFollowupCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#EF5A6F] ring-2 ring-white dark:ring-[#14142E]" />
              )}
            </button>

            {/* Notifications Popover with Bleed-Protection */}
            {isNotifDropdownOpen && (
              <div className="absolute right-0 mt-2 w-[calc(100vw-24px)] sm:w-80 max-w-[340px] bg-white dark:bg-[#1D1D3D] rounded-2xl shadow-2xl border border-[#E9EBF5] dark:border-[#2D2D55] p-3 z-50 animate-in fade-in slide-in-from-top-2">
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
                      <p className="font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">Geofence Auto Check-ins</p>
                      <p className="text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
                        Members entering within 100m ring dwell verified.
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
                      All care follow-ups are resolved!
                    </p>
                  )}
                </div>
                <button
                  onClick={() => {
                    setIsNotifDropdownOpen(false);
                    setIsFollowupModalOpen(true);
                  }}
                  className="w-full mt-2.5 py-1.5 rounded-xl bg-[#6D5CF2] text-white text-xs font-bold hover:bg-[#5b4be0] transition-colors cursor-pointer"
                >
                  View Follow-up Tasks
                </button>
              </div>
            )}
          </div>

          {/* User Profile Pill & Dropdown */}
          {currentUser && (
            <div className="relative ml-0.5" ref={userMenuRef}>
              <button
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className="flex items-center gap-1.5 sm:gap-2 p-1 sm:pl-1.5 sm:pr-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
                aria-expanded={isUserMenuOpen}
                aria-haspopup="true"
                aria-label="User account menu"
              >
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-[#6D5CF2] text-white text-xs font-bold flex items-center justify-center shadow-xs shrink-0">
                  {currentUser.initials}
                </div>
                <span className="hidden md:inline-block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] max-w-[80px] truncate leading-tight">
                  {currentUser.name.split(' ')[0]}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-[#666A86] dark:text-[#A9ACC8] shrink-0" />
              </button>

              {/* User Dropdown Menu with Bleed-Protection */}
              {isUserMenuOpen && (
                <div className="absolute right-0 mt-2 w-[calc(100vw-24px)] sm:w-64 max-w-[280px] bg-white dark:bg-[#1D1D3D] rounded-2xl shadow-2xl border border-[#E9EBF5] dark:border-[#2D2D55] py-2 z-50 animate-in fade-in zoom-in-95">
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


                  {/* System Settings, Creator & Help Links */}
                  <div className="px-2 py-1.5 border-b border-[#E9EBF5] dark:border-[#2D2D55] space-y-0.5">
                    <button
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        setViewMode('creator');
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-bold text-[#6D5CF2] dark:text-[#A594FD] hover:bg-[#EFEDFF] dark:hover:bg-[#1E1C38] transition-all cursor-pointer"
                    >
                      <Sliders className="w-3.5 h-3.5" />
                      <span>Creators Panel (Tenants/Licenses)</span>
                    </button>
                    <button
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        setViewMode('landing');
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs text-[#1D1B3A] dark:text-[#F2F2FA] hover:bg-slate-50 dark:hover:bg-white/5 transition-all cursor-pointer"
                    >
                      <Globe className="w-3.5 h-3.5 text-blue-500" />
                      <span>Public Landing Page</span>
                    </button>
                    <button
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        setIsSettingsModalOpen(true);
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs text-[#1D1B3A] dark:text-[#F2F2FA] hover:bg-slate-50 dark:hover:bg-white/5 transition-all cursor-pointer"
                    >
                      <Settings className="w-3.5 h-3.5 text-[#666A86] dark:text-[#A9ACC8]" />
                      <span>Church Settings</span>
                    </button>
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
          )}
        </div>
      </div>

      {/* Expandable Search Bar (Appears on mobile/tablet when search icon is clicked) */}
      {isMobileSearchOpen && (
        <div className="lg:hidden px-3 sm:px-6 py-2.5 bg-white dark:bg-[#1D1D3D] border-t border-[#E9EBF5] dark:border-[#2D2D55] shadow-md animate-in slide-in-from-top-2">
          <div className="relative max-w-xl mx-auto">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#666A86] dark:text-[#A9ACC8]" />
            <input
              ref={mobileSearchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search members, phone, groups..."
              className="w-full pl-9 pr-9 py-2 bg-slate-100 dark:bg-black/20 rounded-xl text-xs text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]/30 border border-transparent focus:border-[#6D5CF2]"
              autoFocus
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Live Matching Results Dropdown for Mobile/Tablet */}
          {searchQuery.trim().length > 0 && (
            <div className="mt-2 max-w-xl mx-auto max-h-60 overflow-y-auto space-y-1">
              {matchingMembers.length === 0 ? (
                <p className="text-center text-xs text-[#666A86] dark:text-[#A9ACC8] py-3">
                  No members found matching "{searchQuery}"
                </p>
              ) : (
                matchingMembers.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-[#6D5CF2]/15 text-[#6D5CF2] text-xs font-bold flex items-center justify-center">
                        {m.avatarInitials}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                          {m.firstName} {m.lastName}
                        </p>
                        <p className="text-[10px] text-[#666A86] dark:text-[#A9ACC8]">
                          {m.phoneE164} · {m.groupName}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        checkInPerson(m.id, 'manual', 95, 'Header quick check-in');
                        setIsMobileSearchOpen(false);
                        setSearchQuery('');
                        showToast(`Checked in ${m.firstName} ${m.lastName}`);
                      }}
                      className="px-2 py-1 rounded-lg bg-[#6D5CF2] text-white text-[11px] font-bold shadow-xs cursor-pointer hover:bg-[#5b4be0]"
                    >
                      Check In
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* Mobile Drawer (Responsive Navigation Drawer for < 1024px screens) */}
      {currentUser && isMobileMenuOpen && (
        <div className="lg:hidden fixed inset-x-0 top-14 sm:top-16 bottom-0 bg-black/40 backdrop-blur-xs z-50 animate-in fade-in" onClick={() => setIsMobileMenuOpen(false)}>
          <div
            className="w-full max-w-sm ml-auto h-full bg-[#F6F7FC] dark:bg-[#14142E] shadow-2xl p-4 overflow-y-auto border-l border-[#E9EBF5] dark:border-[#2D2D55] flex flex-col justify-between"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-4">
              {/* Header inside drawer */}
              <div className="flex items-center justify-between pb-3 border-b border-[#E9EBF5] dark:border-[#2D2D55]">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-[#6D5CF2] text-white flex items-center justify-center font-bold text-xs">
                    {currentUser.initials}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">{currentUser.name}</p>
                    <p className="text-[10px] text-[#6D5CF2] dark:text-[#8C7DFF] font-medium capitalize">{currentUser.role} Portal</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Navigation Tabs (Dashboard, Workflows, Proximity, Integrations) */}
              {currentUser.role === 'admin' && (
                <div>
                  <p className="text-[10px] font-bold text-[#666A86] dark:text-[#A9ACC8] uppercase tracking-wider mb-2">
                    Admin Navigation
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {adminTabs.map((tab) => {
                      const isActive = adminSubTab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          onClick={() => {
                            setAdminSubTab(tab.id);
                            setIsMobileMenuOpen(false);
                          }}
                          className={`flex items-center gap-2 p-2.5 min-h-[44px] rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            isActive
                              ? 'bg-[#6D5CF2] text-white shadow-xs'
                              : 'bg-white dark:bg-[#1D1D3D] text-[#1D1B3A] dark:text-[#F2F2FA] border border-[#E9EBF5] dark:border-[#2D2D55]'
                          }`}
                        >
                          {tab.icon}
                          <span>{tab.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}


              {/* Quick Actions in Drawer */}
              <div>
                <p className="text-[10px] font-bold text-[#666A86] dark:text-[#A9ACC8] uppercase tracking-wider mb-2">
                  Quick Actions
                </p>
                <div className="space-y-1.5">
                  <button
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      setIsAddServiceOpen(true);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 min-h-[44px] rounded-xl bg-white dark:bg-[#1D1D3D] text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] border border-[#E9EBF5] dark:border-[#2D2D55]"
                  >
                    <Plus className="w-4 h-4 text-[#6D5CF2]" />
                    <span>Add New Service</span>
                  </button>
                  <button
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      handleExportCSV();
                    }}
                    className="w-full flex items-center justify-between px-3 py-2.5 min-h-[44px] rounded-xl bg-white dark:bg-[#1D1D3D] text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] border border-[#E9EBF5] dark:border-[#2D2D55]"
                  >
                    <div className="flex items-center gap-2.5">
                      <Download className="w-4 h-4 text-[#6D5CF2]" />
                      <span>Export Attendance CSV</span>
                    </div>
                    <span className="px-1.5 py-0.5 rounded-md bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] text-[10px] font-bold">
                      CSV
                    </span>
                  </button>
                  <button
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      setIsFollowupModalOpen(true);
                    }}
                    className="w-full flex items-center justify-between px-3 py-2.5 min-h-[44px] rounded-xl bg-white dark:bg-[#1D1D3D] text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] border border-[#E9EBF5] dark:border-[#2D2D55]"
                  >
                    <div className="flex items-center gap-2.5">
                      <Bell className="w-4 h-4 text-[#6D5CF2]" />
                      <span>Follow-up Care Tasks</span>
                    </div>
                    {openFollowupCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-bold">
                        {openFollowupCount}
                      </span>
                    )}
                  </button>
                </div>
              </div>

              {/* Segmented Light / Dark Toggle in Drawer */}
              <div className="pt-2">
                <p className="text-[10px] font-bold text-[#666A86] dark:text-[#A9ACC8] uppercase tracking-wider mb-2">
                  Appearance Mode
                </p>
                <div className="grid grid-cols-2 gap-2 bg-slate-200/60 dark:bg-black/30 p-1 rounded-xl">
                  <button
                    onClick={() => setTheme('light')}
                    className={`flex items-center justify-center gap-2 py-2 min-h-[44px] rounded-lg text-xs font-bold transition-all ${
                      theme === 'light'
                        ? 'bg-white text-[#6D5CF2] shadow-xs'
                        : 'text-[#666A86] dark:text-[#A9ACC8]'
                    }`}
                  >
                    <Sun className="w-4 h-4 text-amber-500" />
                    <span>Light Mode</span>
                  </button>
                  <button
                    onClick={() => setTheme('dark')}
                    className={`flex items-center justify-center gap-2 py-2 min-h-[44px] rounded-lg text-xs font-bold transition-all ${
                      theme === 'dark'
                        ? 'bg-[#2A2A55] text-[#8C7DFF] shadow-xs'
                        : 'text-[#666A86] dark:text-[#A9ACC8]'
                    }`}
                  >
                    <Moon className="w-4 h-4 text-indigo-400" />
                    <span>Dark Mode</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Bottom Actions inside drawer */}
            <div className="pt-4 mt-4 border-t border-[#E9EBF5] dark:border-[#2D2D55] space-y-2">
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  setIsSettingsModalOpen(true);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 min-h-[44px] rounded-xl text-xs font-semibold text-[#1D1B3A] dark:text-[#F2F2FA] hover:bg-slate-200/50 dark:hover:bg-white/5 transition-all"
              >
                <Settings className="w-4 h-4" />
                <span>Church & System Settings</span>
              </button>
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  setIsHelpModalOpen(true);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 min-h-[44px] rounded-xl text-xs font-semibold text-[#1D1B3A] dark:text-[#F2F2FA] hover:bg-slate-200/50 dark:hover:bg-white/5 transition-all"
              >
                <HelpCircle className="w-4 h-4" />
                <span>Help & Ghana Act 843 Guides</span>
              </button>
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  logout();
                }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 min-h-[44px] rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-950/50 transition-all"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out of Account</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
