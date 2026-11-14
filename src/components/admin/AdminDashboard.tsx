import React, { useState, useRef, useEffect } from 'react';
import { useEkklesphere } from '../../context/EkklesphereContext';
import {
  Grid,
  Users,
  PieChart,
  Bell,
  Calendar as CalendarIcon,
  Mail,
  CheckSquare,
  MessageCircle,
  Search,
  Settings,
  Trash2,
  Edit3,
  Clock,
  Plus,
  Share2,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  Download,
  PhoneCall,
  Check,
  X,
  Send,
  Radio,
  HelpCircle,
  ChevronDown,
  LogOut,
  Sparkles,
  ShieldCheck,
  UserPlus,
  Filter,
  QrCode,
  Smartphone,
  Upload,
  Building2,
  HeartHandshake,
  ArrowUpRight,
} from 'lucide-react';
import { ProximitySimulator } from '../simulator/ProximitySimulator';
import { AddMemberModal } from './AddMemberModal';
import { SystemSettingsPanel } from './SystemSettingsPanel';
import { MemberDirectoryTable } from './MemberDirectoryTable';
import { ImportMembersModal } from './ImportMembersModal';
import { LiveAttendanceInsights } from './LiveAttendanceInsights';
import { WeeklyAttendanceTrendChart } from './WeeklyAttendanceTrendChart';
import { MemberAttendanceFrequencyChart } from './MemberAttendanceFrequencyChart';
import { DashboardDeepAnalytics, AnalyticsLens } from './DashboardDeepAnalytics';
import { computeDashboardAnalytics } from '../../utils/dashboardAnalytics';
import { Person } from '../../types/ekklesphere';
import { MemberAvatar } from '../common/MemberAvatar';

export const AdminDashboard: React.FC = () => {

  const {
    theme,
    setTheme,
    toggleTheme,
    adminSubTab,
    setAdminSubTab,
    searchQuery,
    setSearchQuery,
    isAddServiceOpen,
    setIsAddServiceOpen,
    isFollowupModalOpen,
    setIsFollowupModalOpen,
    members,
    totalCheckedInCount,
    expectedAttendance,
    attendancePercentage,
    optInPercentage,
    checkInPerson,
    showToast,
    followupTasks,
    resolveFollowupTask,
    addFollowupTask,
    currentService,
    services,
    setActiveServiceId,
    activeServiceId,
    currentUser,
    logout,
    setIsHelpModalOpen,
    deleteMember,
    validateMemberImportRemote,
    batchImportMembers,
    attendanceRecords,
    telemetrySummary,
    systemSettings,
    autoCheckinOptedInCount,
    auditLogs,
    churchGroups,
    donations,
    addService,
    deleteService,
  } = useEkklesphere();

  // Active sub-navigation tabs inside Admin
  const [activeTab, setActiveTab] = useState<'dashboard' | 'insights' | 'workflows' | 'members' | 'integrations' | 'proximity' | 'settings'>('dashboard');
  const [activeModule, setActiveModule] = useState<'dashboard' | 'attendance' | 'members' | 'services' | 'followup' | 'messages' | 'settings'>('dashboard');
  const [insightsInitialTab, setInsightsInitialTab] = useState<'checked_in' | 'unarrived' | 'at_risk'>('checked_in');
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [analyticsLens, setAnalyticsLens] = useState<AnalyticsLens>('all');
  const analyticsSectionRef = useRef<HTMLDivElement>(null);
  const [directoryDeptFilter, setDirectoryDeptFilter] = useState<string | null>(null);
  const [directoryGroupFilter, setDirectoryGroupFilter] = useState<string | null>(null);

  // Sync activeTab with adminSubTab from header
  useEffect(() => {
    if (adminSubTab) {
      setActiveTab(adminSubTab as any);
      if (adminSubTab === 'workflows') {
        setActiveModule('members');
      } else if (adminSubTab === 'insights') {
        setActiveModule('attendance');
      } else if (adminSubTab === 'dashboard') {
        setActiveModule('dashboard');
      } else if (adminSubTab === 'settings') {
        setActiveModule('settings');
      }
    }
  }, [adminSubTab]);

  const dashboardAnalytics = React.useMemo(
    () =>
      computeDashboardAnalytics({
        members,
        attendanceRecords,
        services,
        currentService,
        churchGroups,
        followupTasks,
        donations,
        systemSettings,
      }),
    [
      members,
      attendanceRecords,
      services,
      currentService,
      churchGroups,
      followupTasks,
      donations,
      systemSettings,
    ]
  );

  const checkedInMemberIds = dashboardAnalytics.activeService.checkedInPersonIds;
  const openFollowupCount = dashboardAnalytics.membership.openFollowupCount;

  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<Person | null>(null);

  // Notifications clear state
  const [notificationsCleared, setNotificationsCleared] = useState(false);

  const getLocalIsoDate = (d: Date = new Date()): string => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const formatServiceDate = (isoDate?: string, includeYear: boolean = false): string => {
    if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate || '';
    const [y, m, d] = isoDate.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    if (Number.isNaN(dt.getTime())) return isoDate;
    return dt.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      ...(includeYear ? { year: 'numeric' } : {}),
    });
  };

  // Calendar week & day selector (live current week)
  const [weekOffset, setWeekOffset] = useState<number>(0);
  const [selectedDateIso, setSelectedDateIso] = useState<string>(() => getLocalIsoDate());

  // Modals
  const [isMessageModalOpen, setIsMessageModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isNewAssignmentOpen, setIsNewAssignmentOpen] = useState(false);
  const [selectedCareTask, setSelectedCareTask] = useState<string | null>(null);

  // Schedule new service form state
  const [newServiceName, setNewServiceName] = useState('Sunday Main Service');
  const [newServiceDate, setNewServiceDate] = useState<string>(() => getLocalIsoDate());
  const [newServiceTime, setNewServiceTime] = useState('08:00');
  const [newServiceEndTime, setNewServiceEndTime] = useState('10:30');
  const [newServiceExpected, setNewServiceExpected] = useState('');
  const [newServiceDwell, setNewServiceDwell] = useState(String(systemSettings.dwellTimeMinutes || 5));
  const [isCreatingService, setIsCreatingService] = useState(false);

  // Pre-fill service date from selected calendar date when opening Schedule New Service modal
  useEffect(() => {
    if (isAddServiceOpen) {
      setNewServiceDate(selectedDateIso || getLocalIsoDate());
    }
  }, [isAddServiceOpen, selectedDateIso]);

  // New assignment form state
  const [newAssignMemberId, setNewAssignMemberId] = useState('');
  const [newAssignReason, setNewAssignReason] = useState<'absent_2' | 'absent_3' | 'first_timer' | 'manual'>('absent_3');
  const [newAssignNotes, setNewAssignNotes] = useState('');

  // Broadcast message form state
  const [broadcastChannel, setBroadcastChannel] = useState<'push' | 'sms' | 'email'>('push');
  const [broadcastAudience, setBroadcastAudience] = useState('all');
  const [broadcastSubject, setBroadcastSubject] = useState('Service Reminder');
  const [broadcastBody, setBroadcastBody] = useState('');

  useEffect(() => {
    setBroadcastBody(
      `Welcome to ${systemSettings.churchName || 'church'}! Service begins at ${currentService.startsAt}. If you have auto check-in enabled, your arrival will be marked automatically.`
    );
  }, [systemSettings.churchName, currentService.startsAt]);

  const weekDays = React.useMemo(() => {
    const base = new Date();
    base.setDate(base.getDate() + weekOffset * 7);
    const dayOfWeek = base.getDay(); // 0=Sun..6=Sat
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(base);
    monday.setDate(base.getDate() + mondayOffset);

    const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return names.map((name, idx) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + idx);
      return {
        name,
        date: d.getDate(),
        iso: getLocalIsoDate(d),
        fullDate: d,
      };
    });
  }, [weekOffset]);

  const weekRangeLabel = React.useMemo(() => {
    if (weekDays.length === 0) return '';
    const first = weekDays[0].fullDate;
    const last = weekDays[6].fullDate;
    const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    return `${fmt(first)} - ${fmt(last)}`;
  }, [weekDays]);

  const manualCheckinCount = dashboardAnalytics.membership.manualCheckinCount;
  const manualCheckinPercentage = dashboardAnalytics.membership.manualCheckinPct;
  const isPremiseConfigured =
    systemSettings.campusLatitude !== null && systemSettings.campusLongitude !== null;
  const openTasks = followupTasks.filter((t) => t.status === 'open');
  const primaryOpenTask = openTasks[0] || null;

  const liveInsightsPreview = {
    total: dashboardAnalytics.activeService.attendanceCount,
    attendanceCount: dashboardAnalytics.activeService.attendanceCount,
    attendancePct: dashboardAnalytics.activeService.turnoutPct,
    absenteeCount: dashboardAnalytics.activeService.absenteeCount,
    absenteePct: dashboardAnalytics.activeService.absenteePct,
    absenteeBaseline:
      members.length > 0 ? members.length : dashboardAnalytics.activeService.expectedAttendance,
    onTime: dashboardAnalytics.activeService.onTimeCount,
    late: dashboardAnalytics.activeService.lateCount,
    punctualityPct: dashboardAnalytics.activeService.punctualityPct,
    autoCount: dashboardAnalytics.activeService.autoCount,
    assistedCount: dashboardAnalytics.activeService.assistedCount,
    atRiskCount: dashboardAnalytics.activeService.atRiskCount,
  };

  const jumpToAnalyticsLens = (lens: AnalyticsLens) => {
    setAnalyticsLens(lens);
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        analyticsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  };

  const openFilteredDirectory = (opts: { department?: string | null; group?: string | null }) => {
    setDirectoryDeptFilter(opts.department ?? 'all');
    setDirectoryGroupFilter(opts.group ?? 'all');
    setActiveTab('workflows');
    setActiveModule('members');
    setAdminSubTab('workflows');
  };

  const handleQuickArrivalCheckin = () => {
    setDirectoryDeptFilter('all');
    setDirectoryGroupFilter('all');
    setActiveTab('workflows');
    setActiveModule('members');
    setAdminSubTab('workflows');
    showToast(
      members.length > 0
        ? 'Select a member from the live directory to check in.'
        : 'Add members first to begin recording live check-ins.'
    );
  };

  const handleCreateServiceSubmit = async () => {
    if (!newServiceName.trim()) {
      showToast('Please enter a service name');
      return;
    }
    if (!newServiceDate) {
      showToast('Please select a service date');
      return;
    }
    setIsCreatingService(true);
    try {
      await addService({
        name: newServiceName.trim(),
        date: newServiceDate,
        startsAt: newServiceTime || '08:00',
        endsAt: newServiceEndTime || '10:30',
        expectedAttendance: Number(newServiceExpected) || 0,
        dwellMinutes: Number(newServiceDwell) || systemSettings.dwellTimeMinutes || 5,
      });
      setSelectedDateIso(newServiceDate);
      setIsAddServiceOpen(false);
    } catch (err: any) {
      showToast(err?.message || 'Could not schedule service');
    } finally {
      setIsCreatingService(false);
    }
  };

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
    setIsExportModalOpen(false);
  };

  const handleBroadcastSend = (e: React.FormEvent) => {
    e.preventDefault();
    showToast(`Broadcast sent via ${broadcastChannel.toUpperCase()} to ${broadcastAudience}!`);
    setIsMessageModalOpen(false);
  };

  const handleCreateAssignment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAssignMemberId) {
      showToast('Please select a member');
      return;
    }
    addFollowupTask(newAssignMemberId, newAssignReason, newAssignNotes);
    setIsNewAssignmentOpen(false);
    setNewAssignMemberId('');
    setNewAssignNotes('');
  };

  return (
    <main className="relative max-w-[1360px] w-full mx-auto my-1.5 sm:my-3 lg:my-4 bg-[#F6F7FC] dark:bg-[#14142E] rounded-2xl sm:rounded-3xl lg:rounded-[36px] pt-4 sm:pt-6 pb-24 sm:pb-28 lg:pb-8 px-3 sm:px-6 lg:pl-[88px] lg:pr-8 shadow-lg lg:shadow-[0_20px_60px_rgba(60,50,140,0.12)] border border-[#E9EBF5] dark:border-[#2D2D55] min-h-[calc(100vh-80px)] lg:min-h-[900px] transition-all duration-200">
      {/* Signature Purple Navigation Bar - Fixed to Left Screen Edge on Desktop & Centered Floating Pill on Mobile */}
      {/* Signature Purple Navigation Bar - Responsive Floating Dock on Mobile & Left Tab on Desktop */}
      <aside
        aria-label="Admin Module Navigation"
        className="fixed z-50 bottom-2 sm:bottom-4 left-1/2 -translate-x-1/2 lg:translate-x-0 lg:bottom-auto lg:top-20 lg:left-0 w-[calc(100%-20px)] max-w-md lg:w-[64px] bg-[#6D5CF2]/95 dark:bg-[#5E4EE0]/95 backdrop-blur-xl rounded-2xl sm:rounded-full lg:rounded-r-[28px] lg:rounded-l-none grid grid-cols-5 lg:flex lg:flex-col items-center justify-items-center sm:justify-center lg:justify-start gap-1 sm:gap-2 lg:gap-3 px-2 py-1.5 sm:px-4 sm:py-2 lg:py-6 lg:px-0 pb-[max(0.375rem,env(safe-area-inset-bottom))] lg:pb-6 shadow-[0_12px_36px_rgba(40,30,120,0.35)] lg:shadow-[0_12px_32px_rgba(40,30,120,0.25)] border border-white/20 lg:border-none transition-all duration-200 select-none touch-manipulation"
      >
        {/* 1. Dashboard Overview */}
        <div className="relative group w-full flex justify-center">
          <button
            onClick={() => {
              setActiveTab('dashboard');
              setActiveModule('dashboard');
              setAdminSubTab('dashboard');
            }}
            aria-label="Dashboard Overview"
            aria-current={activeTab === 'dashboard' && activeModule === 'dashboard' ? 'page' : undefined}
            className={`w-full max-w-[56px] min-h-[46px] lg:min-w-0 lg:w-11 lg:h-11 px-1 py-1 lg:px-0 rounded-xl sm:rounded-full lg:rounded-[14px] flex flex-col lg:flex-row items-center justify-center gap-0.5 transition-all duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2 active:scale-95 ${
              activeTab === 'dashboard' && activeModule === 'dashboard'
                ? 'bg-white text-[#6D5CF2] shadow-[0_4px_12px_rgba(40,30,120,0.25)] font-bold'
                : 'text-white/80 hover:text-white hover:bg-white/15'
            }`}
          >
            <Grid className="w-4.5 h-4.5 sm:w-5 sm:h-5 shrink-0" />
            <span className="lg:hidden text-[10px] leading-tight font-semibold tracking-tight">Dash</span>
          </button>
          <span className="hidden lg:group-hover:flex items-center gap-1.5 absolute left-[70px] top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-white dark:bg-[#1D1D3D] text-[#1D1B3A] dark:text-[#F2F2FA] border border-slate-200 dark:border-white/10 text-xs font-bold rounded-xl shadow-xl pointer-events-none whitespace-nowrap z-50 animate-in fade-in slide-in-from-left-2 duration-150">
            <span>Dashboard</span>
          </span>
        </div>

        {/* 2. Live Attendance Insights */}
        <div className="relative group w-full flex justify-center">
          <button
            onClick={() => {
              setActiveTab('insights');
              setActiveModule('attendance');
              setAdminSubTab('insights');
            }}
            aria-label="Live Attendance Insights"
            aria-current={activeTab === 'insights' ? 'page' : undefined}
            className={`relative w-full max-w-[56px] min-h-[46px] lg:min-w-0 lg:w-11 lg:h-11 px-1 py-1 lg:px-0 rounded-xl sm:rounded-full lg:rounded-[14px] flex flex-col lg:flex-row items-center justify-center gap-0.5 transition-all duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2 active:scale-95 ${
              activeTab === 'insights'
                ? 'bg-white text-[#6D5CF2] shadow-[0_4px_12px_rgba(40,30,120,0.25)] font-bold'
                : 'text-white/80 hover:text-white hover:bg-white/15'
            }`}
          >
            <PieChart className="w-4.5 h-4.5 sm:w-5 sm:h-5 shrink-0" />
            <span className="lg:hidden text-[10px] leading-tight font-semibold tracking-tight">Insights</span>
          </button>
          <span className="hidden lg:group-hover:flex items-center gap-1.5 absolute left-[70px] top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-white dark:bg-[#1D1D3D] text-[#1D1B3A] dark:text-[#F2F2FA] border border-slate-200 dark:border-white/10 text-xs font-bold rounded-xl shadow-xl pointer-events-none whitespace-nowrap z-50 animate-in fade-in slide-in-from-left-2 duration-150 tabular-nums">
            <span>Live Insights ({attendancePercentage}%)</span>
          </span>
        </div>

        {/* 3. Members & Roster */}
        <div className="relative group w-full flex justify-center">
          <button
            onClick={() => {
              setDirectoryDeptFilter('all');
              setDirectoryGroupFilter('all');
              setActiveTab('workflows');
              setActiveModule('members');
              setAdminSubTab('workflows');
            }}
            aria-label="Members Directory"
            aria-current={activeTab === 'workflows' ? 'page' : undefined}
            className={`w-full max-w-[56px] min-h-[46px] lg:min-w-0 lg:w-11 lg:h-11 px-1 py-1 lg:px-0 rounded-xl sm:rounded-full lg:rounded-[14px] flex flex-col lg:flex-row items-center justify-center gap-0.5 transition-all duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2 active:scale-95 ${
              activeTab === 'workflows'
                ? 'bg-white text-[#6D5CF2] shadow-[0_4px_12px_rgba(40,30,120,0.25)] font-bold'
                : 'text-white/80 hover:text-white hover:bg-white/15'
            }`}
          >
            <Users className="w-4.5 h-4.5 sm:w-5 sm:h-5 shrink-0" />
            <span className="lg:hidden text-[10px] leading-tight font-semibold tracking-tight">Members</span>
          </button>
          <span className="hidden lg:group-hover:flex items-center gap-1.5 absolute left-[70px] top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-white dark:bg-[#1D1D3D] text-[#1D1B3A] dark:text-[#F2F2FA] border border-slate-200 dark:border-white/10 text-xs font-bold rounded-xl shadow-xl pointer-events-none whitespace-nowrap z-50 animate-in fade-in slide-in-from-left-2 duration-150">
            <span>Members & Roster</span>
            <span className="px-1.5 py-0.2 bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200 text-[10px] rounded-full font-bold tabular-nums">
              {members.length}
            </span>
          </span>
        </div>

        {/* 4. Proximity & Geofencing Radar */}
        <div className="relative group w-full flex justify-center">
          <button
            onClick={() => {
              setActiveTab('proximity');
              setAdminSubTab('proximity');
              showToast('Proximity & Geofencing Radar Suite active');
            }}
            aria-label="Proximity Radar"
            aria-current={activeTab === 'proximity' ? 'page' : undefined}
            className={`w-full max-w-[56px] min-h-[46px] lg:min-w-0 lg:w-11 lg:h-11 px-1 py-1 lg:px-0 rounded-xl sm:rounded-full lg:rounded-[14px] flex flex-col lg:flex-row items-center justify-center gap-0.5 transition-all duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2 active:scale-95 ${
              activeTab === 'proximity'
                ? 'bg-white text-[#6D5CF2] shadow-[0_4px_12px_rgba(40,30,120,0.25)] font-bold'
                : 'text-white/80 hover:text-white hover:bg-white/15'
            }`}
          >
            <Radio className="w-4.5 h-4.5 sm:w-5 sm:h-5 shrink-0" />
            <span className="lg:hidden text-[10px] leading-tight font-semibold tracking-tight">Radar</span>
          </button>
          <span className="hidden lg:group-hover:flex items-center gap-1.5 absolute left-[70px] top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-white dark:bg-[#1D1D3D] text-[#1D1B3A] dark:text-[#F2F2FA] border border-slate-200 dark:border-white/10 text-xs font-bold rounded-xl shadow-xl pointer-events-none whitespace-nowrap z-50 animate-in fade-in slide-in-from-left-2 duration-150">
            <span>Proximity Radar</span>
          </span>
        </div>

        {/* 5. System Settings */}
        <div className="relative group w-full flex justify-center">
          <button
            onClick={() => {
              setActiveTab('settings');
              setActiveModule('settings');
              setAdminSubTab('settings');
              showToast('System & Campus Settings');
            }}
            aria-label="System Settings"
            aria-current={activeTab === 'settings' ? 'page' : undefined}
            className={`w-full max-w-[56px] min-h-[46px] lg:min-w-0 lg:w-11 lg:h-11 px-1 py-1 lg:px-0 rounded-xl sm:rounded-full lg:rounded-[14px] flex flex-col lg:flex-row items-center justify-center gap-0.5 transition-all duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2 active:scale-95 ${
              activeTab === 'settings'
                ? 'bg-white text-[#6D5CF2] shadow-[0_4px_12px_rgba(40,30,120,0.25)] font-bold'
                : 'text-white/80 hover:text-white hover:bg-white/15'
            }`}
          >
            <Settings className="w-4.5 h-4.5 sm:w-5 sm:h-5 shrink-0" />
            <span className="lg:hidden text-[10px] leading-tight font-semibold tracking-tight">Settings</span>
          </button>
          <span className="hidden lg:group-hover:flex items-center gap-1.5 absolute left-[70px] top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-white dark:bg-[#1D1D3D] text-[#1D1B3A] dark:text-[#F2F2FA] border border-slate-200 dark:border-white/10 text-xs font-bold rounded-xl shadow-xl pointer-events-none whitespace-nowrap z-50 animate-in fade-in slide-in-from-left-2 duration-150">
            <span>System Settings</span>
          </span>
        </div>
      </aside>

      {/* Main Content & Active Views */}
      <div className="flex-1 min-w-0 w-full">




        {/* Main Content View based on Tab */}
        {activeTab === 'dashboard' && (
        <>
          {/* 1. DOMINANT FOCAL ANCHOR: Active Service / Event Command Hero */}
          <section
            aria-label="Active Service and Event Command Hero"
            className="bg-[#1D1B3A] dark:bg-[#19193A] text-white rounded-3xl border border-[#2F2D59] p-5 sm:p-6 my-2 sm:my-4"
          >
            {/* Top Context Bar: Greeting, Campus, Window & Active Service Switcher */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-4 border-b border-white/10">
              <div className="min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/80 tabular-nums">
                <span className="font-semibold text-white">
                  Hi, {currentUser?.name ? currentUser.name.split(' ')[0] : 'Leader'}
                </span>
                <span aria-hidden="true" className="text-white/40">·</span>
                <span className="font-semibold text-[#4FBF98]">
                  {currentService.status === 'open'
                    ? 'Active Service Live'
                    : currentService.status === 'closed'
                    ? 'Completed Service / Event'
                    : 'Scheduled Active Event'}
                </span>
                {systemSettings.campusName && (
                  <>
                    <span aria-hidden="true" className="text-white/40">·</span>
                    <span className="truncate max-w-[200px]">{systemSettings.campusName}</span>
                  </>
                )}
                <span aria-hidden="true" className="text-white/40">·</span>
                <span>
                  {currentService.date
                    ? formatServiceDate(currentService.date, true)
                    : 'Current Schedule'}{' '}
                  · {currentService.startsAt}–{currentService.endsAt}
                </span>
              </div>

              {/* Service Switcher & Primary Operational Actions */}
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {services.length > 0 && (
                  <select
                    aria-label="Switch active service or event"
                    value={activeServiceId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setActiveServiceId(nextId);
                      const target = services.find((s) => s.id === nextId);
                      if (target?.date) setSelectedDateIso(target.date);
                    }}
                    className="bg-white/10 hover:bg-white/15 text-white border border-white/15 rounded-xl px-3 py-1.5 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#8C7DFF] cursor-pointer max-w-[220px]"
                  >
                    {services.map((svc) => (
                      <option key={svc.id} value={svc.id} className="bg-[#1D1B3A] text-white">
                        {svc.name} {svc.date ? `(${svc.date})` : ''}
                      </option>
                    ))}
                  </select>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setInsightsInitialTab('checked_in');
                    setActiveTab('insights');
                    setActiveModule('attendance');
                    setAdminSubTab('insights');
                  }}
                  className="inline-flex items-center gap-1.5 bg-[#6D5CF2] hover:bg-[#5B4BE0] text-white rounded-xl px-3.5 py-1.5 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
                >
                  <PieChart className="w-3.5 h-3.5" />
                  <span>Live Insights</span>
                </button>

                <button
                  type="button"
                  onClick={handleQuickArrivalCheckin}
                  className="inline-flex items-center gap-1.5 bg-white text-[#1D1B3A] hover:bg-white/90 rounded-xl px-3.5 py-1.5 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Check className="w-3.5 h-3.5 text-[#6D5CF2]" />
                  <span>Check People In</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsAddServiceOpen(true)}
                  className="inline-flex items-center gap-1.5 bg-white/10 hover:bg-white/15 border border-white/15 text-white rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Service</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsExportModalOpen(true)}
                  className="inline-flex items-center gap-1.5 bg-white/10 hover:bg-white/15 border border-white/15 text-white rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                  title="Export Attendance CSV"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Export</span>
                </button>
              </div>
            </div>

            {/* Dominant Active Service Title & Live Capacity Bar */}
            <div className="pt-4 pb-2 flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div className="min-w-0">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-white/60 block mb-1">
                  Active Service / Event Focus
                </span>
                <h1 className="text-2xl sm:text-3xl lg:text-[34px] font-bold tracking-tight text-white leading-tight truncate">
                  {currentService.name}
                </h1>
              </div>

              <div className="w-full md:w-72 shrink-0 tabular-nums">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-white/75 font-medium">Live Attendance Target</span>
                  <span className="font-mono font-bold text-white">
                    {liveInsightsPreview.attendancePct}% ({liveInsightsPreview.attendanceCount}/
                    {dashboardAnalytics.activeService.expectedAttendance})
                  </span>
                </div>
                <div className="h-2 rounded-full bg-white/10 overflow-hidden flex">
                  <div
                    className="h-full bg-[#4FBF98] transition-all duration-300"
                    style={{ width: `${liveInsightsPreview.attendancePct}%` }}
                  />
                </div>
              </div>
            </div>

            {/* 4-Column Hairline Telemetry Strip inside Hero */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-0 sm:divide-x divide-white/10 pt-4 mt-3 border-t border-white/10 tabular-nums">
              <button
                type="button"
                onClick={() => {
                  setInsightsInitialTab('checked_in');
                  setActiveTab('insights');
                  setActiveModule('attendance');
                  setAdminSubTab('insights');
                }}
                className="sm:pr-5 text-left group cursor-pointer"
              >
                <span className="text-[11px] font-semibold text-white/65 group-hover:text-white transition-colors block">
                  Checked In Present
                </span>
                <span className="font-mono text-2xl sm:text-3xl font-bold text-[#4FBF98] mt-1 block">
                  {liveInsightsPreview.attendanceCount}
                </span>
                <span className="text-[11px] text-white/65 mt-0.5 block">
                  {liveInsightsPreview.attendancePct}% of {dashboardAnalytics.activeService.expectedAttendance} expected
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setInsightsInitialTab('unarrived');
                  setActiveTab('insights');
                  setActiveModule('attendance');
                  setAdminSubTab('insights');
                }}
                className="sm:px-5 text-left group cursor-pointer"
              >
                <span className="text-[11px] font-semibold text-white/65 group-hover:text-white transition-colors block">
                  Unarrived / Absent
                </span>
                <span className="font-mono text-2xl sm:text-3xl font-bold text-[#FF7B8E] mt-1 block">
                  {liveInsightsPreview.absenteeCount}
                </span>
                <span className="text-[11px] text-white/65 mt-0.5 block">
                  {liveInsightsPreview.absenteePct}% of {liveInsightsPreview.absenteeBaseline} · {liveInsightsPreview.atRiskCount} repeat
                </span>
              </button>

              <div className="sm:px-5">
                <span className="text-[11px] font-semibold text-white/65 block">
                  On-Time Punctuality
                </span>
                <span className="font-mono text-2xl sm:text-3xl font-bold text-white mt-1 block">
                  {liveInsightsPreview.punctualityPct}%
                </span>
                <span className="text-[11px] text-white/65 mt-0.5 block">
                  {liveInsightsPreview.onTime} on-time · {liveInsightsPreview.late} late arrivals
                </span>
              </div>

              <div className="sm:pl-5">
                <span className="text-[11px] font-semibold text-white/65 block">
                  Arrival Channel Split
                </span>
                <span className="font-mono text-2xl sm:text-3xl font-bold text-white mt-1 block">
                  {liveInsightsPreview.autoCount} / {liveInsightsPreview.assistedCount}
                </span>
                <span className="text-[11px] text-white/65 mt-0.5 block">
                  Auto proximity / Door &amp; QR ({optInPercentage}% auto ready)
                </span>
              </div>
            </div>
          </section>

          {/* 2. CONGREGATIONAL STRUCTURE & READINESS 4-COLUMN KPI STRIP */}
          <section
            aria-label="Membership, Departments, Ministries, and Pastoral Readiness"
            className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 my-4 tabular-nums"
          >
            {/* Card 1: Membership Count */}
            <button
              type="button"
              onClick={() => openFilteredDirectory({ department: 'all', group: 'all' })}
              className="bg-white dark:bg-[#1D1D3D] rounded-2xl border border-[#E9EBF5] dark:border-[#2D2D55] hover:border-[#6D5CF2]/60 p-4 text-left transition-colors group cursor-pointer flex flex-col justify-between"
            >
              <div className="flex items-center justify-between gap-2 w-full">
                <span className="text-xs font-semibold text-[#666A86] dark:text-[#A9ACC8]">
                  Membership Count
                </span>
                <Users className="w-4 h-4 text-[#6D5CF2] shrink-0" />
              </div>
              <div className="my-2">
                <span className="font-mono text-2xl sm:text-3xl font-bold text-[#1D1B3A] dark:text-[#F2F2FA] block leading-none">
                  {dashboardAnalytics.membership.totalMembers}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 text-[11px] text-[#666A86] dark:text-[#A9ACC8] w-full">
                <span className="truncate">
                  {dashboardAnalytics.membership.activeStatusCount} active ·{' '}
                  {dashboardAnalytics.membership.visitorsCount} visitors
                </span>
                <ArrowUpRight className="w-3.5 h-3.5 text-[#6D5CF2] opacity-70 group-hover:opacity-100 shrink-0" />
              </div>
            </button>

            {/* Card 2: Departments */}
            <button
              type="button"
              onClick={() => jumpToAnalyticsLens('departments')}
              className="bg-white dark:bg-[#1D1D3D] rounded-2xl border border-[#E9EBF5] dark:border-[#2D2D55] hover:border-[#6D5CF2]/60 p-4 text-left transition-colors group cursor-pointer flex flex-col justify-between"
            >
              <div className="flex items-center justify-between gap-2 w-full">
                <span className="text-xs font-semibold text-[#666A86] dark:text-[#A9ACC8]">
                  Departments
                </span>
                <Building2 className="w-4 h-4 text-[#6D5CF2] shrink-0" />
              </div>
              <div className="my-2">
                <span className="font-mono text-2xl sm:text-3xl font-bold text-[#1D1B3A] dark:text-[#F2F2FA] block leading-none">
                  {dashboardAnalytics.namedDepartmentsCount}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 text-[11px] text-[#666A86] dark:text-[#A9ACC8] w-full">
                <span className="truncate">
                  {dashboardAnalytics.topDepartment
                    ? `Top: ${dashboardAnalytics.topDepartment.name} (${dashboardAnalytics.topDepartment.totalMembers})`
                    : 'No departments assigned'}
                </span>
                <ArrowUpRight className="w-3.5 h-3.5 text-[#6D5CF2] opacity-70 group-hover:opacity-100 shrink-0" />
              </div>
            </button>

            {/* Card 3: Ministries & Groups */}
            <button
              type="button"
              onClick={() => jumpToAnalyticsLens('ministries')}
              className="bg-white dark:bg-[#1D1D3D] rounded-2xl border border-[#E9EBF5] dark:border-[#2D2D55] hover:border-[#6D5CF2]/60 p-4 text-left transition-colors group cursor-pointer flex flex-col justify-between"
            >
              <div className="flex items-center justify-between gap-2 w-full">
                <span className="text-xs font-semibold text-[#666A86] dark:text-[#A9ACC8]">
                  Ministries &amp; Groups
                </span>
                <HeartHandshake className="w-4 h-4 text-[#6D5CF2] shrink-0" />
              </div>
              <div className="my-2 flex items-baseline gap-2">
                <span className="font-mono text-2xl sm:text-3xl font-bold text-[#1D1B3A] dark:text-[#F2F2FA] leading-none">
                  {dashboardAnalytics.groupCounts.ministries}
                </span>
                <span className="text-xs font-semibold text-[#666A86] dark:text-[#A9ACC8]">
                  ministries ({dashboardAnalytics.groupCounts.total} total)
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 text-[11px] text-[#666A86] dark:text-[#A9ACC8] w-full">
                <span className="truncate">
                  {dashboardAnalytics.groupCounts.fellowships} fellowships ·{' '}
                  {dashboardAnalytics.groupCounts.cellGroups} cell groups
                </span>
                <ArrowUpRight className="w-3.5 h-3.5 text-[#6D5CF2] opacity-70 group-hover:opacity-100 shrink-0" />
              </div>
            </button>

            {/* Card 4: Pastoral Care & Campus Readiness */}
            <button
              type="button"
              onClick={() => setIsFollowupModalOpen(true)}
              className="bg-white dark:bg-[#1D1D3D] rounded-2xl border border-[#E9EBF5] dark:border-[#2D2D55] hover:border-[#6D5CF2]/60 p-4 text-left transition-colors group cursor-pointer flex flex-col justify-between"
            >
              <div className="flex items-center justify-between gap-2 w-full">
                <span className="text-xs font-semibold text-[#666A86] dark:text-[#A9ACC8]">
                  Pastoral Care &amp; GPS
                </span>
                <CheckSquare className="w-4 h-4 text-[#6D5CF2] shrink-0" />
              </div>
              <div className="my-2 flex items-baseline gap-2">
                <span className="font-mono text-2xl sm:text-3xl font-bold text-[#1D1B3A] dark:text-[#F2F2FA] leading-none">
                  {openFollowupCount}
                </span>
                <span className="text-xs font-semibold text-[#666A86] dark:text-[#A9ACC8]">
                  open follow-ups
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 text-[11px] text-[#666A86] dark:text-[#A9ACC8] w-full">
                <span className="truncate">
                  {dashboardAnalytics.activeService.atRiskCount} repeat absentees · GPS{' '}
                  {isPremiseConfigured ? 'Active' : 'Unset'}
                </span>
                <ArrowUpRight className="w-3.5 h-3.5 text-[#6D5CF2] opacity-70 group-hover:opacity-100 shrink-0" />
              </div>
            </button>
          </section>

          {/* 3. QUICK OPERATIONS ACTION BAR */}
          <div className="flex flex-wrap items-center justify-between gap-2 my-3 px-1">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditingMember(null);
                  setIsAddMemberOpen(true);
                }}
                className="inline-flex items-center gap-1.5 bg-[#6D5CF2] hover:bg-[#5B4BE0] text-white rounded-xl px-3.5 py-2 text-xs font-bold transition-colors cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Add Member</span>
              </button>
              <button
                type="button"
                onClick={() => setIsImportModalOpen(true)}
                className="inline-flex items-center gap-1.5 bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] hover:border-[#6D5CF2]/50 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-[#6D5CF2]" />
                <span>Import Roster</span>
              </button>
              <button
                type="button"
                onClick={() => setIsMessageModalOpen(true)}
                className="inline-flex items-center gap-1.5 bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] hover:border-[#6D5CF2]/50 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors cursor-pointer"
              >
                <MessageCircle className="w-3.5 h-3.5 text-[#6D5CF2]" />
                <span>Broadcast Message</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('proximity')}
                className="inline-flex items-center gap-1.5 bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] hover:border-[#6D5CF2]/50 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors cursor-pointer"
              >
                <Radio className="w-3.5 h-3.5 text-[#6D5CF2]" />
                <span>Proximity Radar</span>
              </button>
            </div>
            <span className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] tabular-nums">
              Auto readiness: {optInPercentage}% ({autoCheckinOptedInCount}/{members.length})
            </span>
          </div>

          {/* 4. IN-DEPTH CONGREGATION & SERVICE ANALYTICS SUITE */}
          <div ref={analyticsSectionRef} className="my-4 sm:my-5">
            <DashboardDeepAnalytics
              analytics={dashboardAnalytics}
              theme={theme}
              activeLens={analyticsLens}
              onChangeLens={setAnalyticsLens}
              onInspectDepartment={(dept) => openFilteredDirectory({ department: dept, group: 'all' })}
              onInspectGroup={(grp) => openFilteredDirectory({ group: grp, department: 'all' })}
              onSelectService={(svcId) => {
                setActiveServiceId(svcId);
                const target = services.find((s) => s.id === svcId);
                if (target?.date) setSelectedDateIso(target.date);
                showToast(`Active focus switched to ${target?.name || 'selected service'}`);
              }}
              onOpenSettings={() => {
                setActiveTab('settings');
                setActiveModule('settings');
                setAdminSubTab('settings');
              }}
              onAddMember={() => {
                setEditingMember(null);
                setIsAddMemberOpen(true);
              }}
              onAddService={() => setIsAddServiceOpen(true)}
            />
          </div>

          {/* 5. 30-DAY WEEKLY ATTENDANCE TREND */}
          <div className="grid grid-cols-1 lg:grid-cols-6 gap-4 sm:gap-5 my-4 sm:my-5 items-stretch">
            <div className="lg:col-span-6">
              <WeeklyAttendanceTrendChart
                onOpenInsights={() => {
                  setInsightsInitialTab('checked_in');
                  setActiveTab('insights');
                  setActiveModule('attendance');
                  setAdminSubTab('insights');
                }}
                onQuickCheckin={handleQuickArrivalCheckin}
              />
            </div>
          </div>

          {/* 6. MEMBER ATTENDANCE FREQUENCY VISUALIZER */}
          <div className="mb-4 sm:mb-5">
            <MemberAttendanceFrequencyChart
              onOpenFollowup={(memberId) => {
                const targetMember = members.find((m) => m.id === memberId);
                if (targetMember) {
                  addFollowupTask(
                    memberId,
                    'manual',
                    `Follow-up requested from attendance frequency review: ${targetMember.firstName} ${targetMember.lastName}`
                  );
                  showToast(`Care task assigned for ${targetMember.firstName} ${targetMember.lastName}`);
                }
                setIsFollowupModalOpen(true);
              }}
            />
          </div>

          {/* Cards Grid: Responsive across mobile (1 col), tablet (2 cols), desktop (6 cols) */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 sm:gap-5">
            {/* 1. Notifications Card (Live Audit & Check-in Feed) */}
            <section id="notifications-card" className="md:col-span-1 lg:col-span-2 bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-[0_10px_30px_rgba(60,50,140,0.07)] border border-[#E9EBF5] dark:border-[#2D2D55] flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">Notifications</h2>
                  {auditLogs.length > 0 && (
                    <button
                      onClick={() => {
                        setNotificationsCleared(!notificationsCleared);
                        showToast(notificationsCleared ? 'Notifications restored' : 'Notifications cleared');
                      }}
                      className="text-xs font-semibold text-[#666A86] dark:text-[#A9ACC8] hover:text-[#EF5A6F] flex items-center gap-1 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      {notificationsCleared ? 'Restore' : 'Clear'}
                    </button>
                  )}
                </div>

                {!notificationsCleared && auditLogs.length > 0 ? (
                  <div className="space-y-2.5">
                    {auditLogs.slice(0, 3).map((log) => (
                      <div
                        key={log.id}
                        className="bg-[#F6F7FC] dark:bg-[#14142E] rounded-2xl p-3 border border-[#E9EBF5] dark:border-[#2D2D55]"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="flex items-center gap-1.5 text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                            <span className="w-2 h-2 rounded-full bg-[#4FBF98]" />
                            {log.action}
                          </span>
                          <span className="text-[10px] font-semibold text-[#666A86] dark:text-[#A9ACC8]">
                            {log.timestamp}
                          </span>
                        </div>
                        <div className="text-xs text-[#666A86] dark:text-[#A9ACC8] line-clamp-2">
                          {log.details}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 px-2 text-xs text-[#666A86] dark:text-[#A9ACC8] bg-[#F6F7FC] dark:bg-[#14142E] rounded-2xl border border-dashed border-[#E9EBF5] dark:border-[#2D2D55]">
                    <Bell className="w-5 h-5 text-[#6D5CF2] mx-auto mb-2 opacity-80" />
                    <p className="font-semibold text-[#1D1B3A] dark:text-[#F2F2FA] mb-0.5">
                      No live notifications yet
                    </p>
                    <p className="text-[11px]">
                      Real-time member check-ins, visitor registrations, and premise updates will appear here.
                    </p>
                  </div>
                )}
              </div>
            </section>

            {/* 2. Assignments Card (Live Pastoral Care Queue) */}
            <section className="md:col-span-1 lg:col-span-2 bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-[0_10px_30px_rgba(60,50,140,0.07)] border border-[#E9EBF5] dark:border-[#2D2D55] flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">Assignments</h2>
                  <button
                    onClick={() => setIsFollowupModalOpen(true)}
                    className="text-xs font-semibold text-[#666A86] dark:text-[#A9ACC8] hover:text-[#6D5CF2] flex items-center gap-1"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    View all ({openFollowupCount})
                  </button>
                </div>

                {primaryOpenTask ? (
                  <>
                    <div className="flex items-center gap-2 mb-2.5">
                      <span className="bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] text-xs font-semibold px-2 py-0.5 rounded-md">
                        Pastoral care
                      </span>
                      <span className="bg-[#F6F7FC] dark:bg-[#14142E] text-[#666A86] dark:text-[#A9ACC8] text-xs font-semibold px-2 py-0.5 rounded-md">
                        {primaryOpenTask.groupName}
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-[#1D1B3A] dark:text-[#F2F2FA] leading-snug mb-3">
                      Follow up with {primaryOpenTask.personName}
                    </h3>

                    <div className="flex items-center justify-between gap-2 mb-4">
                      <span className="bg-[#7AD3B6]/20 text-[#12503D] dark:text-[#7AD3B6] text-xs font-bold px-3 py-1 rounded-full">
                        {primaryOpenTask.reason === 'first_timer'
                          ? 'First-timer welcome'
                          : primaryOpenTask.reason === 'absent_3'
                          ? 'Absent 3 weeks'
                          : primaryOpenTask.reason === 'absent_2'
                          ? 'Absent 2 weeks'
                          : 'Care check'}
                      </span>
                      <span className="bg-[#FFE2E6] dark:bg-[#4A2229] text-[#C9314F] dark:text-[#FF9AAA] text-xs font-bold px-3 py-1 rounded-full">
                        Open
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-3 border-t border-[#E9EBF5] dark:border-[#2D2D55]">
                      <span className="text-[#666A86] dark:text-[#A9ACC8]">Assigned to</span>
                      <span className="font-semibold text-[#1D1B3A] dark:text-[#F2F2FA]">
                        {primaryOpenTask.assignedToName}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8 px-2 text-xs text-[#666A86] dark:text-[#A9ACC8] bg-[#F6F7FC] dark:bg-[#14142E] rounded-2xl border border-dashed border-[#E9EBF5] dark:border-[#2D2D55]">
                    <CheckSquare className="w-5 h-5 text-[#6D5CF2] mx-auto mb-2 opacity-80" />
                    <p className="font-semibold text-[#1D1B3A] dark:text-[#F2F2FA] mb-0.5">
                      No open care assignments
                    </p>
                    <p className="text-[11px]">
                      Visitor welcomes and absence follow-ups will queue here automatically.
                    </p>
                  </div>
                )}
              </div>

              <button
                onClick={() => setIsNewAssignmentOpen(true)}
                className="mt-4 w-full border-2 border-dashed border-[#CBC6F7] dark:border-[#3B3B72] rounded-2xl py-3 text-xs font-bold text-[#6D5CF2] dark:text-[#8C7DFF] flex items-center justify-center gap-1.5 hover:bg-[#EFEDFF]/40 dark:hover:bg-[#2A2A55]/20 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add new assignment
              </button>
            </section>

            {/* 3. Calendar & Timeline (Live Current Week) */}
            <section className="md:col-span-2 lg:col-span-2 bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-[0_10px_30px_rgba(60,50,140,0.07)] border border-[#E9EBF5] dark:border-[#2D2D55] flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">{weekRangeLabel}</h2>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setIsAddServiceOpen(true)}
                      className="px-2 py-1 rounded-lg bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] text-[11px] font-bold hover:opacity-90 transition-opacity flex items-center gap-1 cursor-pointer mr-1"
                    >
                      <Plus className="w-3 h-3" />
                      Schedule
                    </button>
                    <button
                      onClick={() => setWeekOffset((w) => w - 1)}
                      className="p-1 rounded-lg text-[#666A86] hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer"
                      aria-label="Previous week"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setWeekOffset((w) => w + 1)}
                      className="p-1 rounded-lg text-[#666A86] hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer"
                      aria-label="Next week"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* 7-day selector */}
                <div className="grid grid-cols-7 gap-1 text-center mb-4">
                  {weekDays.map((d) => {
                    const hasServiceOnDay = services.some((s) => s.date === d.iso);
                    const isSelected = selectedDateIso === d.iso;
                    return (
                      <button
                        key={d.iso}
                        onClick={() => setSelectedDateIso(d.iso)}
                        className={`flex flex-col items-center py-1.5 rounded-xl transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-[#6D5CF2] text-white shadow-sm font-bold'
                            : 'text-[#666A86] dark:text-[#A9ACC8] hover:bg-slate-100 dark:hover:bg-white/5'
                        }`}
                      >
                        <span className="text-[10px] uppercase font-semibold">{d.name}</span>
                        <b className="text-xs">{d.date}</b>
                        <span
                          className={`w-1.5 h-1.5 rounded-full mt-0.5 ${
                            hasServiceOnDay
                              ? isSelected
                                ? 'bg-white'
                                : 'bg-[#6D5CF2]'
                              : 'bg-transparent'
                          }`}
                        />
                      </button>
                    );
                  })}
                </div>

                {/* Live scheduled services list */}
                <div className="space-y-2 max-h-[210px] overflow-y-auto pr-0.5">
                  {services.length === 0 ? (
                    <div className="bg-[#F6F7FC] dark:bg-[#14142E] rounded-2xl p-3 border border-dashed border-[#E9EBF5] dark:border-[#2D2D55] text-center text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
                      No worship services scheduled in database yet.
                    </div>
                  ) : (
                    services.map((svc) => {
                      const isSelectedDay = svc.date === selectedDateIso;
                      return (
                        <div
                          key={svc.id}
                          className={`w-full bg-[#F6F7FC] dark:bg-[#14142E] rounded-2xl p-2.5 flex items-center gap-2.5 border transition-all ${
                            svc.id === activeServiceId
                              ? 'border-[#6D5CF2] ring-1 ring-[#6D5CF2]/30'
                              : isSelectedDay
                              ? 'border-[#CBC6F7] dark:border-[#3B3B72]'
                              : 'border-[#E9EBF5] dark:border-[#2D2D55]'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setActiveServiceId(svc.id);
                              if (svc.date) setSelectedDateIso(svc.date);
                            }}
                            className="flex-1 min-w-0 flex items-center gap-2.5 text-left cursor-pointer"
                          >
                            <div className="w-8 h-8 rounded-xl bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] flex items-center justify-center shrink-0">
                              <CalendarIcon className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <b className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] truncate">
                                {svc.name}
                              </b>
                              <span className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] block truncate">
                                {svc.date ? `${formatServiceDate(svc.date)} · ` : ''}
                                {svc.startsAt} - {svc.endsAt}
                                {systemSettings.campusName ? ` · ${systemSettings.campusName}` : ''}
                              </span>
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              void deleteService(svc.id);
                            }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors shrink-0 cursor-pointer"
                            title="Delete service from database"
                            aria-label={`Delete ${svc.name}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="pt-3 mt-3 border-t border-[#E9EBF5] dark:border-[#2D2D55] text-xs text-[#666A86] dark:text-[#A9ACC8] flex justify-between items-center gap-2">
                <span>Active Service:</span>
                <span className="font-bold text-[#6D5CF2] truncate">
                  {currentService.name}
                  {currentService.date ? ` (${formatServiceDate(currentService.date)})` : ''}
                </span>
              </div>
            </section>

            {/* 4. Live Session Readiness (Tablet Span 2, Desktop Span 3) */}
            <section className="md:col-span-2 lg:col-span-3 bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-[0_10px_30px_rgba(60,50,140,0.07)] border border-[#E9EBF5] dark:border-[#2D2D55]">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-base font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">Live readiness</h2>
                  <div className="flex -space-x-2">
                    {members.slice(0, 3).map((m) => (
                      <MemberAvatar
                        key={m.id}
                        src={m.imageUrl}
                        name={`${m.firstName} ${m.lastName}`}
                        initials={m.avatarInitials}
                        sizeClass="w-6 h-6"
                        textClass="text-[10px] font-bold"
                        bgClass="bg-[#6D5CF2] text-white"
                        borderClass="border-2 border-white dark:border-[#1D1D3D]"
                      />
                    ))}
                    {members.length === 0 && currentUser && (
                      <MemberAvatar
                        src={currentUser.avatar}
                        name={currentUser.name}
                        initials={currentUser.initials}
                        sizeClass="w-6 h-6"
                        textClass="text-[10px] font-bold"
                        bgClass="bg-[#6D5CF2] text-white"
                        borderClass="border-2 border-white dark:border-[#1D1D3D]"
                      />
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs font-semibold text-[#666A86] dark:text-[#A9ACC8]">
                  <button
                    onClick={() => {
                      setActiveTab('settings');
                      setActiveModule('settings');
                    }}
                    className="hover:text-[#1D1B3A] dark:hover:text-white flex items-center gap-1"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    Configure
                  </button>
                </div>
              </div>

              {/* Readiness Row 1: Premise Geofence */}
              <div className="p-3 rounded-2xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] mb-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <b className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">Church Premise Geofence</b>
                  <em className="text-[11px] not-italic text-[#666A86] dark:text-[#A9ACC8]">
                    {systemSettings.campusName} · {systemSettings.innerGeofenceMeters}m inner radius
                  </em>
                </div>
                <div className="flex items-center gap-2 text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] min-w-[120px]">
                  <span>{isPremiseConfigured ? '100%' : '0%'}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-[#EFEDFF] dark:bg-[#2A2A55] overflow-hidden">
                    <div
                      className="h-full bg-[#4FBF98] rounded-full transition-all"
                      style={{ width: isPremiseConfigured ? '100%' : '0%' }}
                    />
                  </div>
                </div>
                <span className="text-xs text-[#666A86] dark:text-[#A9ACC8] font-semibold">
                  {isPremiseConfigured ? 'Active' : 'Unset'}
                </span>
              </div>

              {/* Readiness Row 2: Congregation Roster */}
              <div className="p-3 rounded-2xl bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] mb-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <b className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">Congregation Roster</b>
                  <em className="text-[11px] not-italic text-[#666A86] dark:text-[#A9ACC8]">
                    Supabase live member directory
                  </em>
                </div>
                <div className="flex items-center gap-2 text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] min-w-[120px]">
                  <span>{members.length > 0 ? '100%' : '0%'}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-[#EFEDFF] dark:bg-[#2A2A55] overflow-hidden">
                    <div
                      className="h-full bg-[#6D5CF2] rounded-full transition-all"
                      style={{ width: members.length > 0 ? '100%' : '0%' }}
                    />
                  </div>
                </div>
                <span className="text-xs text-[#666A86] dark:text-[#A9ACC8] font-semibold tabular-nums">
                  {members.length} {members.length === 1 ? 'member' : 'members'}
                </span>
              </div>

              {/* Readiness Row 3: Live Session Check-ins & Absentees */}
              <div className="p-3 rounded-2xl bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <b className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">Live Service Check-ins</b>
                  <em className="text-[11px] not-italic text-[#666A86] dark:text-[#A9ACC8]">
                    {currentService.name} ({currentService.date ? `${formatServiceDate(currentService.date)} · ` : ''}{currentService.startsAt}{currentService.endsAt ? ` – ${currentService.endsAt}` : ''})
                  </em>
                </div>
                <div className="flex items-center gap-2 text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] min-w-[120px] tabular-nums">
                  <span>{liveInsightsPreview.attendancePct}%</span>
                  <div className="flex-1 h-1.5 rounded-full bg-[#EFEDFF] dark:bg-[#2A2A55] overflow-hidden">
                    <div
                      className="h-full bg-[#6D5CF2] rounded-full transition-all"
                      style={{ width: `${liveInsightsPreview.attendancePct}%` }}
                    />
                  </div>
                </div>
                <span className="text-xs text-[#666A86] dark:text-[#A9ACC8] font-semibold tabular-nums">
                  {liveInsightsPreview.attendanceCount} present · {liveInsightsPreview.absenteeCount} absent
                </span>
              </div>
            </section>

            {/* 5. Auto Check-In Opt-In Card */}
            <section className="md:col-span-1 lg:col-span-1 bg-[#6D5CF2] text-white rounded-2xl sm:rounded-3xl p-4 sm:p-5 flex flex-col items-center justify-between text-center shadow-[0_10px_30px_rgba(109,92,242,0.3)]">
              <svg className="w-16 h-16 sm:w-20 sm:h-20 mb-1" viewBox="0 0 84 84" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="20" y="38" width="44" height="30" rx="5" fill="#8C7DFF" />
                <rect x="16" y="30" width="52" height="12" rx="4" fill="#8C7DFF" />
                <path d="M42 30v38M42 30c-8-12-18-6-12 0M42 30c8-12 18-6 12 0" />
                <path d="M10 18v8M6 22h8M72 14v6M69 17h6" />
              </svg>
              <div>
                <h2 className="text-sm sm:text-base font-bold mb-1">Auto check-in</h2>
                <p className="text-xs text-white/90 leading-snug mb-3">
                  {members.length === 0
                    ? 'Enroll members to enable automated proximity arrival.'
                    : `${manualCheckinPercentage}% of members (${manualCheckinCount}) currently sign in manually.`}
                </p>
              </div>
              <button
                onClick={() => {
                  if (members.length === 0) {
                    setEditingMember(null);
                    setIsAddMemberOpen(true);
                  } else {
                    setIsMessageModalOpen(true);
                  }
                }}
                className="w-full bg-white hover:bg-white/95 text-[#6D5CF2] rounded-xl py-2 text-xs font-extrabold transition-all shadow-sm cursor-pointer"
              >
                {members.length === 0 ? 'Add first member' : 'Invite members'}
              </button>
            </section>

            {/* 6. Quick Broadcast & Live Premise Status */}
            <div className="md:col-span-1 lg:col-span-2 flex flex-col gap-4">
              {/* Quick Broadcast Card */}
              <section className="bg-white dark:bg-[#1D1D3D] rounded-3xl p-4 sm:p-5 shadow-[0_10px_30px_rgba(60,50,140,0.07)] border border-[#E9EBF5] dark:border-[#2D2D55] flex-1 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <h2 className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                      Congregation Outreach
                    </h2>
                    <MessageCircle className="w-4 h-4 text-[#6D5CF2]" />
                  </div>
                  <p className="text-xs text-[#666A86] dark:text-[#A9ACC8] leading-relaxed mb-3">
                    Send service reminders, follow-up notes, or department notices via Push, SMS, or email.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsMessageModalOpen(true)}
                  className="w-full bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] rounded-xl py-2 text-xs font-bold hover:opacity-90 transition-all cursor-pointer"
                >
                  Compose Broadcast
                </button>
              </section>

              {/* Live Premise & Geofence Card */}
              <section className="bg-white dark:bg-[#1D1D3D] rounded-3xl p-4 shadow-[0_10px_30px_rgba(60,50,140,0.07)] border border-[#E9EBF5] dark:border-[#2D2D55]">
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA] truncate">
                    {systemSettings.campusName || 'Church Premise'}
                  </h2>
                  <span
                    className={`text-[11px] font-semibold ${
                      isPremiseConfigured ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
                    }`}
                  >
                    {isPremiseConfigured ? 'Active' : 'Unset'}
                  </span>
                </div>
                <span className="text-xs text-[#666A86] dark:text-[#A9ACC8] font-mono block tabular-nums">
                  {isPremiseConfigured
                    ? `${systemSettings.campusLatitude?.toFixed(6)}, ${systemSettings.campusLongitude?.toFixed(6)}`
                    : 'GPS coordinates not pinned'}
                </span>
                <p className="text-xs text-[#666A86] dark:text-[#A9ACC8] my-2 leading-relaxed tabular-nums">
                  Inner perimeter: {systemSettings.innerGeofenceMeters}m · Dwell rule: {systemSettings.dwellTimeMinutes} min
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setActiveTab('proximity')}
                    className="flex-1 bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] rounded-xl py-1.5 text-xs font-bold hover:opacity-90 transition-all cursor-pointer"
                  >
                    Live Radar
                  </button>
                  <button
                    onClick={() => {
                      setActiveTab('settings');
                      setActiveModule('settings');
                    }}
                    className="flex-1 bg-[#6D5CF2] text-white rounded-xl py-1.5 text-xs font-bold hover:bg-[#5b4be0] transition-all cursor-pointer"
                  >
                    Edit Premise
                  </button>
                </div>
              </section>
            </div>
          </div>
        </>
      )}

      {/* Live Attendance Insights Workspace */}
      {activeTab === 'insights' && (
        <div className="mt-4">
          <LiveAttendanceInsights
            initialTableTab={insightsInitialTab}
            onOpenAddMember={() => {
              setEditingMember(null);
              setIsAddMemberOpen(true);
            }}
            onOpenImportModal={() => setIsImportModalOpen(true)}
          />
        </div>
      )}

      {/* Workflows / Members Directory Tab: Complete 28 Columns Table & Care Workflows */}
      {(activeTab === 'workflows' || activeTab === 'members') && (
        <div className="mt-4 space-y-5">
          <MemberDirectoryTable
            members={members}
            onAddMember={() => {
              setEditingMember(null);
              setIsAddMemberOpen(true);
            }}
            onEditMember={(m) => {
              setEditingMember(m);
              setIsAddMemberOpen(true);
            }}
            onDeleteMember={(id) => {
              deleteMember(id);
            }}
            onOpenImportModal={() => setIsImportModalOpen(true)}
            onCheckinMember={(id) => {
              checkInPerson(id, 'usher', 95);
            }}
            checkedInIds={checkedInMemberIds}
            initialDepartmentFilter={directoryDeptFilter}
            initialGroupFilter={directoryGroupFilter}
          />
        </div>
      )}

      {/* Integrations Tab: Beacons, Webhooks, Paystack, Geofence Config */}
      {activeTab === 'integrations' && (
        <div className="mt-4 space-y-5">
          <div>
            <h2 className="text-xl font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
              Hardware & Service Integrations
            </h2>
            <p className="text-xs text-[#666A86] dark:text-[#A9ACC8]">
              Manage entrance BLE beacons, PostGIS geofence rings, SMS gateways (Hubtel/Arkesel), and Paystack.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Geofence Engine */}
            <div className="bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-[#E9EBF5] dark:border-[#2D2D55] shadow-sm">
              <h3 className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-2 flex items-center justify-between">
                <span>PostGIS Campus Geofencing</span>
                <span className={`w-2.5 h-2.5 rounded-full ${isPremiseConfigured ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              </h3>
              <p className="text-xs text-[#666A86] dark:text-[#A9ACC8] mb-3">
                Outer Ring: {systemSettings.outerGeofenceMeters} m (App approach wake-up)
                <br />
                Inner Ring: {systemSettings.innerGeofenceMeters} m ({systemSettings.dwellTimeMinutes}-min dwell required)
              </p>
              <div className="bg-[#F6F7FC] dark:bg-[#14142E] p-2.5 rounded-xl text-xs font-mono text-[#6D5CF2] dark:text-[#8C7DFF] mb-3">
                {isPremiseConfigured
                  ? `POINT(${systemSettings.campusLatitude?.toFixed(6)}, ${systemSettings.campusLongitude?.toFixed(6)})`
                  : 'Unconfigured — Set Premise GPS'}
              </div>
              <button
                onClick={() =>
                  showToast(
                    isPremiseConfigured
                      ? `Geofence verified at ${systemSettings.campusName}`
                      : 'Please pin your Church Premise GPS in System Settings first.'
                  )
                }
                className="w-full bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] rounded-xl py-2 text-xs font-bold cursor-pointer hover:opacity-90 transition-all"
              >
                Test Radius Accuracy
              </button>
            </div>

            {/* BLE Beacons */}
            <div className="bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-[#E9EBF5] dark:border-[#2D2D55] shadow-sm">
              <h3 className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-2 flex items-center justify-between">
                <span>Entrance BLE Beacons</span>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              </h3>
              <p className="text-xs text-[#666A86] dark:text-[#A9ACC8] mb-3">
                UUID: b7826da4-4d5e...
                <br />
                Major: 1 · Minor: 101 (Main Sanctuary Door)
              </p>
              <div className="bg-[#F6F7FC] dark:bg-[#14142E] p-2.5 rounded-xl text-xs text-[#666A86] dark:text-[#A9ACC8] mb-3">
                Scanned only inside service window to protect battery.
              </div>
              <button
                onClick={() => showToast('Entrance Beacon pinged: Signal strength -58 dBm (Strong)')}
                className="w-full bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] rounded-xl py-2 text-xs font-bold cursor-pointer hover:opacity-90 transition-all"
              >
                Ping Beacon
              </button>
            </div>

            {/* Paystack & MoMo */}
            <div className="bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-[#E9EBF5] dark:border-[#2D2D55] shadow-sm">
              <h3 className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-2 flex items-center justify-between">
                <span>Paystack & Mobile Money</span>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              </h3>
              <p className="text-xs text-[#666A86] dark:text-[#A9ACC8] mb-3">
                MTN Mobile Money, Telecel Cash & Cards active with automated webhook verification.
              </p>
              <div className="bg-[#F6F7FC] dark:bg-[#14142E] p-2.5 rounded-xl text-xs text-[#666A86] dark:text-[#A9ACC8] mb-3">
                Settlement Currency: GHS (Ghana Cedis)
              </div>
              <button
                onClick={() => showToast('Payment gateway webhook verified')}
                className="w-full bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] rounded-xl py-2 text-xs font-bold cursor-pointer hover:opacity-90 transition-all"
              >
                Test MoMo Webhook
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Proximity & Geofencing Radar Diagnostic Suite */}
      {activeTab === 'proximity' && (
        <div className="mt-4 animate-in fade-in">
          <ProximitySimulator />
        </div>
      )}

      {/* System Settings & Campus Parameters Suite */}
      {activeTab === 'settings' && (
        <div className="mt-4 animate-in fade-in">
          <SystemSettingsPanel />
        </div>
      )}
      </div>

      {/* MODAL 1: Add New Service */}
      {isAddServiceOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-xl border border-[#E9EBF5] dark:border-[#2D2D55] max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">Schedule New Service</h3>
              <button onClick={() => setIsAddServiceOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <label htmlFor="new-service-name" className="block font-semibold mb-1 text-[#1D1B3A] dark:text-[#F2F2FA]">
                  Service Name
                </label>
                <input
                  id="new-service-name"
                  type="text"
                  value={newServiceName}
                  onChange={(e) => setNewServiceName(e.target.value)}
                  placeholder="e.g. Sunday First Service"
                  className="w-full min-h-[44px] p-2.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] bg-slate-50 dark:bg-black/20 text-[#1D1B3A] dark:text-[#F2F2FA]"
                />
              </div>
              <div>
                <label htmlFor="new-service-date" className="block font-semibold mb-1 text-[#1D1B3A] dark:text-[#F2F2FA]">
                  Service Date
                </label>
                <input
                  id="new-service-date"
                  type="date"
                  value={newServiceDate}
                  onChange={(e) => setNewServiceDate(e.target.value)}
                  className="w-full min-h-[44px] p-2.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] bg-slate-50 dark:bg-black/20 text-[#1D1B3A] dark:text-[#F2F2FA] tabular-nums"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="new-service-start" className="block font-semibold mb-1 text-[#1D1B3A] dark:text-[#F2F2FA]">
                    Start Time
                  </label>
                  <input
                    id="new-service-start"
                    type="time"
                    value={newServiceTime}
                    onChange={(e) => setNewServiceTime(e.target.value)}
                    className="w-full min-h-[44px] p-2.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] bg-slate-50 dark:bg-black/20 text-[#1D1B3A] dark:text-[#F2F2FA] tabular-nums"
                  />
                </div>
                <div>
                  <label htmlFor="new-service-end" className="block font-semibold mb-1 text-[#1D1B3A] dark:text-[#F2F2FA]">
                    End Time
                  </label>
                  <input
                    id="new-service-end"
                    type="time"
                    value={newServiceEndTime}
                    onChange={(e) => setNewServiceEndTime(e.target.value)}
                    className="w-full min-h-[44px] p-2.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] bg-slate-50 dark:bg-black/20 text-[#1D1B3A] dark:text-[#F2F2FA] tabular-nums"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="new-service-expected" className="block font-semibold mb-1 text-[#1D1B3A] dark:text-[#F2F2FA]">
                    Expected Attendance
                  </label>
                  <input
                    id="new-service-expected"
                    type="number"
                    min="0"
                    value={newServiceExpected}
                    onChange={(e) => setNewServiceExpected(e.target.value)}
                    placeholder="Optional"
                    className="w-full min-h-[44px] p-2.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] bg-slate-50 dark:bg-black/20 text-[#1D1B3A] dark:text-[#F2F2FA] tabular-nums"
                  />
                </div>
                <div>
                  <label htmlFor="new-service-dwell" className="block font-semibold mb-1 text-[#1D1B3A] dark:text-[#F2F2FA]">
                    Dwell Rule (Minutes)
                  </label>
                  <input
                    id="new-service-dwell"
                    type="number"
                    min="1"
                    value={newServiceDwell}
                    onChange={(e) => setNewServiceDwell(e.target.value)}
                    className="w-full min-h-[44px] p-2.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] bg-slate-50 dark:bg-black/20 text-[#1D1B3A] dark:text-[#F2F2FA] tabular-nums"
                  />
                </div>
              </div>
              <div>
                <span className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] block">
                  Scheduled for <b className="text-[#1D1B3A] dark:text-[#F2F2FA]">{formatServiceDate(newServiceDate, true)}</b> · Geofence auto check-in operates from {newServiceTime || '08:00'} to {newServiceEndTime || '10:30'} ({newServiceDwell || systemSettings.dwellTimeMinutes} min dwell inside {systemSettings.innerGeofenceMeters}m perimeter).
                </span>
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setIsAddServiceOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] text-xs font-bold text-[#666A86] dark:text-[#A9ACC8]"
              >
                Cancel
              </button>
              <button
                disabled={isCreatingService}
                onClick={handleCreateServiceSubmit}
                className="flex-1 py-2.5 rounded-xl bg-[#6D5CF2] text-white text-xs font-bold shadow-sm disabled:opacity-60 cursor-pointer"
              >
                {isCreatingService ? 'Saving...' : 'Create Service'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Broadcast Messages */}
      {isMessageModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <form
            onSubmit={handleBroadcastSend}
            className="bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-xl border border-[#E9EBF5] dark:border-[#2D2D55] max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">Message Members</h3>
              <button type="button" onClick={() => setIsMessageModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold mb-1 text-[#1D1B3A] dark:text-[#F2F2FA]">Delivery Channel</label>
                <div className="flex gap-2">
                  {(['push', 'sms', 'email'] as const).map((ch) => (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => setBroadcastChannel(ch)}
                      className={`flex-1 py-2 rounded-xl font-bold uppercase transition-all ${
                        broadcastChannel === ch
                          ? 'bg-[#6D5CF2] text-white'
                          : 'bg-slate-100 dark:bg-black/20 text-[#666A86] dark:text-[#A9ACC8]'
                      }`}
                    >
                      {ch}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1 text-[#1D1B3A] dark:text-[#F2F2FA]">Audience</label>
                <select
                  value={broadcastAudience}
                  onChange={(e) => setBroadcastAudience(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] bg-slate-50 dark:bg-black/20 text-[#1D1B3A] dark:text-[#F2F2FA]"
                >
                  <option value="all">All registered members ({members.length})</option>
                  <option value="absent">
                    Absent members ({members.filter((m) => m.consecutiveAbsences >= 2).length})
                  </option>
                  <option value="visitors">
                    Registered visitors ({members.filter((m) => m.status === 'visitor').length})
                  </option>
                  {churchGroups.map((g) => (
                    <option key={g.id} value={g.name}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold mb-1 text-[#1D1B3A] dark:text-[#F2F2FA]">Subject</label>
                <input
                  type="text"
                  value={broadcastSubject}
                  onChange={(e) => setBroadcastSubject(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] bg-slate-50 dark:bg-black/20 text-[#1D1B3A] dark:text-[#F2F2FA]"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1 text-[#1D1B3A] dark:text-[#F2F2FA]">Message Body</label>
                <textarea
                  rows={4}
                  value={broadcastBody}
                  onChange={(e) => setBroadcastBody(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] bg-slate-50 dark:bg-black/20 text-[#1D1B3A] dark:text-[#F2F2FA]"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                type="button"
                onClick={() => setIsMessageModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] text-xs font-bold text-[#666A86] dark:text-[#A9ACC8]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-xl bg-[#6D5CF2] text-white text-xs font-bold shadow-sm flex items-center justify-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                Send Broadcast
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 3: Follow-up Queue & Outcome Log */}
      {isFollowupModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1D1D3D] rounded-3xl max-w-2xl w-full p-6 shadow-xl border border-[#E9EBF5] dark:border-[#2D2D55] max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                  Pastoral Care Follow-up Queue
                </h3>
                <p className="text-xs text-[#666A86] dark:text-[#A9ACC8]">
                  Automated absence triggers: 2 weeks = Cell leader, 3 weeks = Pastoral team.
                </p>
              </div>
              <button onClick={() => setIsFollowupModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs">
              {followupTasks.length === 0 ? (
                <div className="text-center py-10 text-[#666A86] dark:text-[#A9ACC8]">
                  No pastoral follow-up tasks in the queue yet.
                </div>
              ) : (
                followupTasks.map((t) => (
                  <div
                    key={t.id}
                    className="p-4 rounded-2xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <b className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">{t.personName}</b>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#FFE2E6] text-[#C9314F]">
                          {t.reason === 'absent_3'
                            ? 'Absent 3 Weeks'
                            : t.reason === 'absent_2'
                            ? 'Absent 2 Weeks'
                            : 'First Timer'}
                        </span>
                      </div>
                      <div className="text-[#666A86] dark:text-[#A9ACC8]">
                        {t.groupName} · Assigned to: <b className="text-[#1D1B3A] dark:text-[#F2F2FA]">{t.assignedToName}</b>
                      </div>
                      {t.outcome && (
                        <div className="mt-1 text-emerald-600 dark:text-emerald-400 italic">Outcome: {t.outcome}</div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {t.status === 'open' ? (
                        <>
                          <button
                            onClick={() => {
                              showToast(`Dialing ${t.personName}...`);
                              resolveFollowupTask(t.id, 'Contacted via phone.');
                            }}
                            className="bg-[#6D5CF2] text-white px-3 py-1.5 rounded-xl font-bold flex items-center gap-1 shadow-sm"
                          >
                            <PhoneCall className="w-3.5 h-3.5" />
                            Log Call
                          </button>
                          <button
                            onClick={() => resolveFollowupTask(t.id, 'Excused absence')}
                            className="bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#666A86] px-3 py-1.5 rounded-xl font-semibold"
                          >
                            Mark Excused
                          </button>
                        </>
                      ) : (
                        <span className="text-emerald-500 font-bold flex items-center gap-1">
                          <Check className="w-4 h-4" /> Resolved
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-4 mt-3 border-t border-[#E9EBF5] dark:border-[#2D2D55] flex justify-end">
              <button
                onClick={() => setIsFollowupModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-[#6D5CF2] hover:bg-[#5A48DE] text-white font-bold text-xs shadow-sm transition-colors cursor-pointer"
              >
                Close Queue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: New Assignment */}
      {isNewAssignmentOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <form
            onSubmit={handleCreateAssignment}
            className="bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-xl border border-[#E9EBF5] dark:border-[#2D2D55] max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">New Care Assignment</h3>
              <button type="button" onClick={() => setIsNewAssignmentOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold mb-1 text-[#1D1B3A] dark:text-[#F2F2FA]">Member</label>
                <select
                  value={newAssignMemberId}
                  onChange={(e) => setNewAssignMemberId(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] bg-slate-50 dark:bg-black/20 text-[#1D1B3A] dark:text-[#F2F2FA]"
                >
                  <option value="">Select member...</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.firstName} {m.lastName} ({m.groupName})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold mb-1 text-[#1D1B3A] dark:text-[#F2F2FA]">Reason</label>
                <select
                  value={newAssignReason}
                  onChange={(e) => setNewAssignReason(e.target.value as any)}
                  className="w-full p-2.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] bg-slate-50 dark:bg-black/20 text-[#1D1B3A] dark:text-[#F2F2FA]"
                >
                  <option value="absent_3">Absent 3 consecutive weeks (Pastoral Care)</option>
                  <option value="absent_2">Absent 2 consecutive weeks (Cell Leader)</option>
                  <option value="first_timer">First-time visitor welcome</option>
                  <option value="manual">Manual care inquiry</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold mb-1 text-[#1D1B3A] dark:text-[#F2F2FA]">Notes / Context</label>
                <textarea
                  rows={3}
                  value={newAssignNotes}
                  onChange={(e) => setNewAssignNotes(e.target.value)}
                  placeholder="e.g. Check on family wellbeing after hospitalization"
                  className="w-full p-2.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] bg-slate-50 dark:bg-black/20 text-[#1D1B3A] dark:text-[#F2F2FA]"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                type="button"
                onClick={() => setIsNewAssignmentOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] text-xs font-bold text-[#666A86] dark:text-[#A9ACC8]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-xl bg-[#6D5CF2] text-white text-xs font-bold shadow-sm"
              >
                Assign Task
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 5: Export CSV confirmation */}
      {isExportModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl max-w-sm w-full p-5 sm:p-6 shadow-xl border border-[#E9EBF5] dark:border-[#2D2D55] text-center max-h-[90vh] overflow-y-auto">
            <div className="w-12 h-12 rounded-2xl bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] mx-auto flex items-center justify-center mb-3">
              <Download className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
              Download Attendance Export
            </h3>
            <p className="text-xs text-[#666A86] dark:text-[#A9ACC8] mb-4 leading-relaxed">
              Generates a full audit register for {currentService.name.split(',')[0]} including member names,
              cell groups, and check-in methods.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setIsExportModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] text-xs font-bold text-[#666A86] dark:text-[#A9ACC8]"
              >
                Cancel
              </button>
              <button
                onClick={handleExportCSV}
                className="flex-1 py-2.5 rounded-xl bg-[#6D5CF2] text-white text-xs font-bold shadow-sm"
              >
                Download CSV
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 6: Add / Edit Member Modal */}
      <AddMemberModal
        isOpen={isAddMemberOpen}
        onClose={() => {
          setIsAddMemberOpen(false);
          setEditingMember(null);
        }}
        initialData={editingMember}
      />

      {/* MODAL 7: Import Members with Validation */}
      <ImportMembersModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onValidateRemote={validateMemberImportRemote}
        onImportComplete={(imported, options) => batchImportMembers(imported, options)}
        existingMembers={members}
      />
    </main>
  );
};

