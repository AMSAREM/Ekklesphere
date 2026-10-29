import React, { useEffect, useState } from 'react';
import { useEkklesphere } from '../../context/EkklesphereContext';
import {
  LayoutDashboard,
  Users,
  QrCode,
  HeartHandshake,
  Radio,
  Smartphone,
  Mail,
  PanelLeftClose,
  PanelLeft,
  Sun,
  Moon,
  LogOut,
  HelpCircle,
  Church,
  X,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';

interface NavItemConfig {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  section: 'core' | 'operations' | 'comms';
  badge?: string | number;
  badgeColor?: string;
  onClick: () => void;
  isActive: boolean;
}

export const SidebarNavigation: React.FC = () => {
  const {
    currentUser,
    logout,
    activePortal,
    setActivePortal,
    isSidebarCollapsed,
    toggleSidebar,
    isMobileNavOpen,
    setIsMobileNavOpen,
    adminSubTab,
    setAdminSubTab,
    setIsHelpModalOpen,
    theme,
    toggleTheme,
    followupTasks,
    totalCheckedInCount,
    expectedAttendance,
    isUsherOnline,
    proximityStage,
  } = useEkklesphere();

  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);

  // Close mobile drawer on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isMobileNavOpen) {
          setIsMobileNavOpen(false);
        }
        setActiveTooltip(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobileNavOpen, setIsMobileNavOpen]);

  // Prevent background scroll when mobile drawer is open
  useEffect(() => {
    if (isMobileNavOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileNavOpen]);

  // Open task count
  const openFollowupsCount = followupTasks.filter((t) => t.status === 'open').length;

  // Maximum 6 top-level primary navigation items logically grouped
  const navItems: NavItemConfig[] = [
    // GROUP 1: CORE WORKSPACE
    {
      id: 'dashboard',
      label: 'Dashboard & Services',
      description: 'Executive overview, KPI rings, prep checklist',
      icon: LayoutDashboard,
      section: 'core',
      badge: `${totalCheckedInCount}/${expectedAttendance}`,
      badgeColor: 'bg-indigo-100 text-[#6D5CF2] dark:bg-indigo-950 dark:text-[#8C7DFF]',
      isActive: activePortal === 'admin' && adminSubTab === 'dashboard',
      onClick: () => {
        setActivePortal('admin');
        setAdminSubTab('dashboard');
        setIsMobileNavOpen(false);
      },
    },
    {
      id: 'directory',
      label: 'People & Directory',
      description: 'Congregation roster, cells & households',
      icon: Users,
      section: 'core',
      badge: '520',
      badgeColor: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
      isActive: activePortal === 'admin' && adminSubTab === 'integrations', // mapped to people/directory
      onClick: () => {
        setActivePortal('admin');
        setAdminSubTab('integrations');
        setIsMobileNavOpen(false);
      },
    },
    {
      id: 'usher',
      label: 'Door Check-in Station',
      description: 'Usher PWA, QR scanner & offline queue',
      icon: QrCode,
      section: 'core',
      badge: isUsherOnline ? 'Online' : 'Offline',
      badgeColor: isUsherOnline
        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
        : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
      isActive: activePortal === 'usher',
      onClick: () => {
        setActivePortal('usher');
        setIsMobileNavOpen(false);
      },
    },

    // GROUP 2: CARE & OPERATIONS
    {
      id: 'care',
      label: 'Pastoral Care Workflows',
      description: 'Absence triage & 2/3-week care calls',
      icon: HeartHandshake,
      section: 'operations',
      badge: openFollowupsCount > 0 ? `${openFollowupsCount} open` : undefined,
      badgeColor: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
      isActive: activePortal === 'admin' && adminSubTab === 'workflows',
      onClick: () => {
        setActivePortal('admin');
        setAdminSubTab('workflows');
        setIsMobileNavOpen(false);
      },
    },
    {
      id: 'radar',
      label: 'Proximity Radar & Beacons',
      description: 'BLE beacons & 100m/300m geofence monitor',
      icon: Radio,
      section: 'operations',
      badge: proximityStage === 3 ? 'Checked In' : proximityStage > 0 ? 'In Range' : 'Radar',
      badgeColor: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
      isActive: activePortal === 'simulator',
      onClick: () => {
        setActivePortal('simulator');
        setIsMobileNavOpen(false);
      },
    },
    {
      id: 'member',
      label: 'Member Mobile Experience',
      description: 'Member pass, MoMo giving & RSVPs',
      icon: Smartphone,
      section: 'operations',
      isActive: activePortal === 'member',
      onClick: () => {
        setActivePortal('member');
        setIsMobileNavOpen(false);
      },
    },

    // GROUP 3: COMMS & ANNOUNCEMENTS
    {
      id: 'comms',
      label: 'Communications & Alerts',
      description: 'SMS, push reminders & announcements',
      icon: Mail,
      section: 'comms',
      isActive: false,
      onClick: () => {
        setActivePortal('admin');
        setAdminSubTab('dashboard');
        setIsMobileNavOpen(false);
      },
    },
  ];

  // Helper to render navigation item
  const renderNavItem = (item: NavItemConfig, isMobileDrawer = false) => {
    const Icon = item.icon;
    const showExpanded = !isSidebarCollapsed || isMobileDrawer;

    return (
      <li key={item.id} className="relative list-none">
        <button
          onClick={item.onClick}
          onMouseEnter={() => !showExpanded && setActiveTooltip(item.id)}
          onMouseLeave={() => !showExpanded && setActiveTooltip(null)}
          onFocus={() => !showExpanded && setActiveTooltip(item.id)}
          onBlur={() => !showExpanded && setActiveTooltip(null)}
          aria-current={item.isActive ? 'page' : undefined}
          aria-label={item.label}
          className={`group w-full flex items-center rounded-2xl transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-[#6D5CF2] text-left relative ${
            showExpanded ? 'px-3 py-2.5 min-h-[46px] gap-3' : 'justify-center p-3 h-12 w-12 mx-auto'
          } ${
            item.isActive
              ? 'bg-[#EFEDFF] dark:bg-indigo-950/70 text-[#6D5CF2] dark:text-[#8C7DFF] font-bold shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/70 dark:hover:bg-white/5'
          }`}
        >
          {/* Active Accent Bar on Left */}
          {item.isActive && (
            <span
              className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full bg-[#6D5CF2] dark:bg-[#8C7DFF]"
              aria-hidden="true"
            />
          )}

          {/* Icon */}
          <Icon
            className={`shrink-0 transition-transform duration-200 group-hover:scale-105 ${
              showExpanded ? 'w-4 h-4' : 'w-5 h-5'
            } ${
              item.isActive
                ? 'text-[#6D5CF2] dark:text-[#8C7DFF]'
                : 'text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200'
            }`}
          />

          {/* Text Labels (Expanded State) */}
          {showExpanded && (
            <div className="flex-1 min-w-0 flex items-center justify-between gap-1.5">
              <span className="truncate text-xs font-semibold leading-tight">
                {item.label}
              </span>

              {item.badge && (
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0 uppercase tracking-tight ${
                    item.badgeColor || 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </div>
          )}

          {/* Collapsed Rail Hover-Peek Tooltip */}
          {!showExpanded && activeTooltip === item.id && (
            <div
              role="tooltip"
              className="absolute left-full ml-3 px-3 py-1.5 rounded-xl bg-[#1D1B3A] dark:bg-black text-white text-xs font-semibold shadow-2xl whitespace-nowrap z-50 pointer-events-none flex items-center gap-2 border border-white/10 animate-in fade-in zoom-in-95 duration-150"
            >
              <span>{item.label}</span>
              {item.badge && (
                <span
                  className={`text-[9px] font-bold px-1.5 py-0.2 rounded-md ${
                    item.badgeColor || 'bg-slate-700 text-white'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </div>
          )}
        </button>
      </li>
    );
  };

  // Reusable Sidebar Core Markup
  const renderSidebarContent = (isMobileDrawer = false) => {
    const showExpanded = !isSidebarCollapsed || isMobileDrawer;

    const coreItems = navItems.filter((i) => i.section === 'core');
    const opsItems = navItems.filter((i) => i.section === 'operations');
    const commsItems = navItems.filter((i) => i.section === 'comms');

    return (
      <div className="h-full flex flex-col justify-between select-none">
        {/* Top Header / Branding */}
        <div>
          <div
            className={`flex items-center gap-3 border-b border-[#E9EBF5] dark:border-[#2D2D55] ${
              showExpanded ? 'px-5 py-4' : 'justify-center py-4 px-2'
            }`}
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#6D5CF2] to-[#8C7DFF] flex items-center justify-center text-white shadow-sm shadow-indigo-500/30 shrink-0">
              <Church className="w-5 h-5" />
            </div>

            {showExpanded && (
              <div className="flex-1 min-w-0">
                <div className="font-extrabold text-sm tracking-tight text-[#1D1B3A] dark:text-[#F2F2FA] flex items-center gap-1.5">
                  <span>Ekklesphere</span>
                  <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 px-1 py-0.2 rounded">
                    Accra
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  Central Church OS
                </div>
              </div>
            )}

            {isMobileDrawer && (
              <button
                onClick={() => setIsMobileNavOpen(false)}
                aria-label="Close mobile navigation menu"
                className="w-8 h-8 rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 hover:text-slate-600 dark:hover:text-white flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Navigation Links with Group Headers */}
          <nav
            aria-label="Sidebar Primary Navigation"
            className="px-2.5 py-4 space-y-5 overflow-y-auto max-h-[calc(100vh-250px)]"
          >
            {/* 1. Core Workspace */}
            <div>
              {showExpanded ? (
                <div className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Workspace
                </div>
              ) : (
                <div className="w-6 h-px bg-slate-200 dark:bg-slate-800 mx-auto my-2" />
              )}
              <ul className="space-y-1">{coreItems.map((item) => renderNavItem(item, isMobileDrawer))}</ul>
            </div>

            {/* 2. Care & Operations */}
            <div>
              {showExpanded ? (
                <div className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Care & Proximity
                </div>
              ) : (
                <div className="w-6 h-px bg-slate-200 dark:bg-slate-800 mx-auto my-2" />
              )}
              <ul className="space-y-1">{opsItems.map((item) => renderNavItem(item, isMobileDrawer))}</ul>
            </div>

            {/* 3. Analytics & Comms */}
            <div>
              {showExpanded ? (
                <div className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Engagement
                </div>
              ) : (
                <div className="w-6 h-px bg-slate-200 dark:bg-slate-800 mx-auto my-2" />
              )}
              <ul className="space-y-1">{commsItems.map((item) => renderNavItem(item, isMobileDrawer))}</ul>
            </div>
          </nav>
        </div>

        {/* Anchored Bottom Footer Block */}
        <div className="p-3 border-t border-[#E9EBF5] dark:border-[#2D2D55] bg-slate-50/50 dark:bg-[#111129]/60">
          {/* User Profile Card */}
          {currentUser && (
            <div
              className={`rounded-2xl transition-all ${
                showExpanded ? 'p-2.5 mb-2 bg-white dark:bg-[#1A1A3A] border border-slate-200/80 dark:border-slate-800 shadow-xs' : 'mb-2 flex justify-center'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#6D5CF2] text-white flex items-center justify-center font-bold text-xs shadow-xs overflow-hidden shrink-0">
                  {currentUser.avatar ? (
                    <img
                      src={currentUser.avatar}
                      alt={currentUser.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    currentUser.initials
                  )}
                </div>

                {showExpanded && (
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] truncate">
                      {currentUser.name}
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 capitalize truncate">
                      {currentUser.role} · {currentUser.campusName.split(' ')[0]}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Action Row: Help, Theme, Logout, and Collapse Rail */}
          <div className={`flex items-center ${showExpanded ? 'justify-between px-1' : 'flex-col gap-2'}`}>
            {/* Help / Docs */}
            <button
              onClick={() => setIsHelpModalOpen(true)}
              aria-label="Open documentation and Act 843 compliance help"
              title="Help & Documentation"
              className="w-8 h-8 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/10 flex items-center justify-center transition-colors"
            >
              <HelpCircle className="w-4 h-4" />
            </button>

            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
              title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
              className="w-8 h-8 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/10 flex items-center justify-center transition-colors"
            >
              {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </button>

            {/* Logout */}
            <button
              onClick={logout}
              aria-label="Sign out of Ekklesphere"
              title="Sign out"
              className="w-8 h-8 rounded-xl text-rose-500 hover:text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center justify-center transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>

            {/* Collapse Rail Toggle (Desktop/Tablet only) */}
            {!isMobileDrawer && (
              <button
                onClick={toggleSidebar}
                aria-expanded={!isSidebarCollapsed}
                aria-label={isSidebarCollapsed ? 'Expand sidebar navigation' : 'Collapse sidebar to rail'}
                title={isSidebarCollapsed ? 'Expand sidebar (Ctrl+[)' : 'Collapse to rail'}
                className="w-8 h-8 rounded-xl text-slate-400 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/10 flex items-center justify-center transition-colors"
              >
                {isSidebarCollapsed ? <PanelLeft className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* 1. Permanent Desktop & Tablet Sidebar */}
      <aside
        role="navigation"
        aria-label="Main Navigation"
        className={`hidden md:block fixed top-0 left-0 bottom-0 z-30 bg-white dark:bg-[#14142E] border-r border-[#E9EBF5] dark:border-[#2D2D55] transition-all duration-250 ease-out shadow-xs ${
          isSidebarCollapsed ? 'w-[68px]' : 'w-[260px]'
        }`}
      >
        {renderSidebarContent(false)}
      </aside>

      {/* 2. Mobile Off-Canvas Slide-In Drawer with Dark Scrim */}
      {isMobileNavOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          {/* Semi-transparent dark backdrop scrim (45% opacity) */}
          <div
            onClick={() => setIsMobileNavOpen(false)}
            aria-hidden="true"
            className="fixed inset-0 bg-black/45 backdrop-blur-[2px] transition-opacity duration-250 animate-in fade-in"
          />

          {/* Slide-in drawer panel (max-width 340px, 82vw) */}
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Mobile Navigation Drawer"
            className="fixed inset-y-0 left-0 w-[82vw] max-w-[340px] bg-white dark:bg-[#14142E] shadow-2xl z-50 flex flex-col transition-transform duration-250 ease-out animate-in slide-in-from-left"
          >
            {renderSidebarContent(true)}
          </aside>
        </div>
      )}
    </>
  );
};
