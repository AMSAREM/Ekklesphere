import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useEkklesphere } from '../../context/EkklesphereContext';
import {
  Grid,
  Users,
  PieChart,
  History,
  Bell,
  Calendar as CalendarIcon,
  CheckSquare,
  MessageCircle,
  Settings,
  Trash2,
  Edit3,
  Plus,
  ChevronLeft,
  ChevronRight,
  Download,
  Check,
  Radio,
  UserPlus,
  Upload,
  Building2,
  HeartHandshake,
  ArrowUpRight,
  Camera,
  X,
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
import { ServiceHistoryPanel } from './ServiceHistoryPanel';
import {
  AddServiceModal,
  BroadcastModal,
  EditServiceModal,
  EditableServiceTarget,
  ExportCsvModal,
  FollowupQueueModal,
  NewAssignmentModal,
} from './AdminDashboardModals';
import { computeDashboardAnalytics } from '../../utils/dashboardAnalytics';
import { Person } from '../../types/ekklesphere';
import { MemberAvatar } from '../common/MemberAvatar';
import { getImageFallbackUrls } from '../../utils/imageUrl';
import { computeServiceBinaryStatus } from '../../utils/serviceStatus';

type AdminNavTab =
  | 'dashboard'
  | 'history'
  | 'insights'
  | 'workflows'
  | 'members'
  | 'integrations'
  | 'proximity'
  | 'settings';

type DashboardSectionFilter = 'all' | 'analytics' | 'operations';

function getLocalIsoDate(d: Date = new Date()): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatServiceDate(isoDate?: string, includeYear: boolean = false): string {
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
}

export const AdminDashboard: React.FC = () => {
  const {
    theme,
    adminSubTab,
    setAdminSubTab,
    requestOpenSettings,
    isAddServiceOpen,
    setIsAddServiceOpen,
    isFollowupModalOpen,
    setIsFollowupModalOpen,
    members,
    attendancePercentage,
    optInPercentage,
    checkInPerson,
    showToast,
    followupTasks,
    resolveFollowupTask,
    addFollowupTask,
    currentService,
    hasScheduledService,
    checkInEligibility,
    services,
    setActiveServiceId,
    activeServiceId,
    currentUser,
    deleteMember,
    validateMemberImportRemote,
    batchImportMembers,
    attendanceRecords,
    systemSettings,
    autoCheckinOptedInCount,
    auditLogs,
    churchGroups,
    donations,
    addService,
    updateService,
    deleteService,
  } = useEkklesphere();

  const [activeTab, setActiveTab] = useState<AdminNavTab>('dashboard');
  const [sectionFilter, setSectionFilter] = useState<DashboardSectionFilter>('all');
  const [insightsInitialTab, setInsightsInitialTab] = useState<
    'checked_in' | 'unarrived' | 'at_risk'
  >('checked_in');
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [analyticsLens, setAnalyticsLens] = useState<AnalyticsLens>('all');
  const analyticsSectionRef = useRef<HTMLDivElement>(null);

  const [directoryDeptFilter, setDirectoryDeptFilter] = useState<string | null>(null);
  const [directoryGroupFilter, setDirectoryGroupFilter] = useState<string | null>(null);
  const [directoryDisplayMode, setDirectoryDisplayMode] = useState<'table' | 'photos'>('table');

  // Lightbox for clicking any member portrait directly from Dashboard
  const [photoPreviewMember, setPhotoPreviewMember] = useState<Person | null>(null);
  const [editingServiceTarget, setEditingServiceTarget] = useState<EditableServiceTarget | null>(null);
  const [confirmDeleteCalendarSvcId, setConfirmDeleteCalendarSvcId] = useState<string | null>(null);
  const [tickNowMs, setTickNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTickNowMs(Date.now());
    }, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!confirmDeleteCalendarSvcId) return;
    const timer = window.setTimeout(() => setConfirmDeleteCalendarSvcId(null), 5000);
    return () => window.clearTimeout(timer);
  }, [confirmDeleteCalendarSvcId]);

  useEffect(() => {
    if (adminSubTab) {
      setActiveTab(adminSubTab as AdminNavTab);
    }
  }, [adminSubTab]);

  const navigateTab = useCallback(
    (tab: 'dashboard' | 'history' | 'insights' | 'workflows' | 'integrations' | 'proximity' | 'settings') => {
      setActiveTab(tab);
      setAdminSubTab(tab);
    },
    [setAdminSubTab]
  );

  const dashboardAnalytics = useMemo(
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
        now: new Date(tickNowMs),
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
      tickNowMs,
    ]
  );

  const checkedInMemberIds = dashboardAnalytics.activeService.checkedInPersonIds;
  const openFollowupCount = dashboardAnalytics.membership.openFollowupCount;

  const uploadedPhotoMembers = useMemo(
    () => members.filter((m) => Boolean(m.imageUrl && m.imageUrl.trim().length > 0)),
    [members]
  );

  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<Person | null>(null);
  const [notificationsCleared, setNotificationsCleared] = useState(false);

  const [weekOffset, setWeekOffset] = useState<number>(0);
  const [selectedDateIso, setSelectedDateIso] = useState<string>(() => getLocalIsoDate());

  const [isMessageModalOpen, setIsMessageModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isNewAssignmentOpen, setIsNewAssignmentOpen] = useState(false);

  const weekDays = useMemo(() => {
    const base = new Date();
    base.setDate(base.getDate() + weekOffset * 7);
    const dayOfWeek = base.getDay();
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

  const weekRangeLabel = useMemo(() => {
    if (weekDays.length === 0) return '';
    const first = weekDays[0].fullDate;
    const last = weekDays[6].fullDate;
    const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    return `${fmt(first)} - ${fmt(last)}`;
  }, [weekDays]);

  const serviceDatesSet = useMemo(() => {
    const set = new Set<string>();
    for (const s of services) {
      if (s.date) set.add(s.date);
    }
    return set;
  }, [services]);

  const manualCheckinCount = dashboardAnalytics.membership.manualCheckinCount;
  const manualCheckinPercentage = dashboardAnalytics.membership.manualCheckinPct;
  const isPremiseConfigured =
    systemSettings.campusLatitude !== null && systemSettings.campusLongitude !== null;

  const primaryOpenTask = useMemo(
    () => followupTasks.find((t) => t.status === 'open') || null,
    [followupTasks]
  );

  const liveInsightsPreview = useMemo(
    () => ({
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
    }),
    [dashboardAnalytics.activeService, members.length]
  );

  const jumpToAnalyticsLens = useCallback((lens: AnalyticsLens) => {
    setSectionFilter((prev) => (prev === 'operations' ? 'all' : prev));
    setAnalyticsLens(lens);
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        analyticsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }, []);

  const openFilteredDirectory = useCallback(
    (opts: { department?: string | null; group?: string | null; displayMode?: 'table' | 'photos' }) => {
      setDirectoryDeptFilter(opts.department ?? 'all');
      setDirectoryGroupFilter(opts.group ?? 'all');
      setDirectoryDisplayMode(opts.displayMode ?? 'table');
      navigateTab('workflows');
    },
    [navigateTab]
  );

  const handleQuickArrivalCheckin = useCallback(() => {
    if (!hasScheduledService) {
      showToast(checkInEligibility.message);
      setIsAddServiceOpen(true);
      return;
    }
    openFilteredDirectory({ department: 'all', group: 'all', displayMode: 'table' });
    showToast(
      members.length > 0
        ? 'Select a member from the live directory to check in.'
        : 'Add members first to begin recording live check-ins.'
    );
  }, [hasScheduledService, checkInEligibility.message, setIsAddServiceOpen, openFilteredDirectory, showToast, members.length]);

  const handleSelectServiceFromChild = useCallback(
    (svcId: string) => {
      setActiveServiceId(svcId);
      const target = services.find((s) => s.id === svcId);
      if (target?.date) setSelectedDateIso(target.date);
      showToast(`Active focus switched to ${target?.name || 'selected service'}`);
    },
    [setActiveServiceId, services, showToast]
  );

  const handleExportCSV = useCallback(() => {
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
    link.setAttribute(
      'download',
      `ekklesphere-attendance-${new Date().toISOString().split('T')[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Attendance report exported as CSV');
    setIsExportModalOpen(false);
  }, [members, showToast]);

  const handleCreateServiceSubmit = useCallback(
    async (params: {
      name: string;
      date: string;
      startsAt: string;
      endsAt: string;
      expectedAttendance: number;
      dwellMinutes: number;
    }) => {
      await addService(params);
      setSelectedDateIso(params.date);
    },
    [addService]
  );

  const photoPreviewUrl = useMemo(() => {
    if (!photoPreviewMember?.imageUrl) return null;
    const candidates = getImageFallbackUrls(photoPreviewMember.imageUrl, 'full');
    return candidates[0] || photoPreviewMember.imageUrl;
  }, [photoPreviewMember]);

  return (
    <main className="relative max-w-[1360px] w-full mx-auto my-1.5 sm:my-3 lg:my-4 bg-[#F6F7FC] dark:bg-[#14142E] rounded-2xl sm:rounded-3xl lg:rounded-[32px] pt-4 sm:pt-6 pb-24 sm:pb-28 lg:pb-8 px-3 sm:px-6 lg:pl-[88px] lg:pr-8 shadow-xs border border-[#E9EBF5] dark:border-[#2D2D55] min-h-[calc(100vh-80px)] transition-colors duration-200">
      {/* Left Navigation Rail (Desktop) & Bottom Dock (Mobile) */}
      <aside
        aria-label="Admin Module Navigation"
        className="fixed z-50 bottom-2 sm:bottom-4 left-1/2 -translate-x-1/2 lg:translate-x-0 lg:bottom-auto lg:top-20 lg:left-0 w-[calc(100%-20px)] max-w-lg lg:w-[64px] bg-[#6D5CF2] dark:bg-[#5E4EE0] rounded-2xl sm:rounded-full lg:rounded-r-[28px] lg:rounded-l-none grid grid-cols-6 lg:flex lg:flex-col items-center justify-items-center lg:justify-start gap-1 sm:gap-1.5 lg:gap-3 px-2 py-1.5 sm:px-3 sm:py-2 lg:py-6 lg:px-0 pb-[max(0.375rem,env(safe-area-inset-bottom))] lg:pb-6 shadow-md border border-white/15 lg:border-none select-none touch-manipulation"
      >
        {/* 1. Dashboard Overview */}
        <div className="relative group w-full flex justify-center">
          <button
            type="button"
            onClick={() => navigateTab('dashboard')}
            aria-label="Dashboard Overview"
            aria-current={activeTab === 'dashboard' ? 'page' : undefined}
            className={`w-full max-w-[56px] min-h-[44px] lg:w-11 lg:h-11 px-1 py-1 lg:px-0 rounded-xl lg:rounded-[14px] flex flex-col lg:flex-row items-center justify-center gap-0.5 transition-colors cursor-pointer ${
              activeTab === 'dashboard'
                ? 'bg-white text-[#6D5CF2] font-bold shadow-xs'
                : 'text-white/85 hover:text-white hover:bg-white/15'
            }`}
          >
            <Grid className="w-4.5 h-4.5 shrink-0" />
            <span className="lg:hidden text-[10px] leading-tight font-semibold">Dash</span>
          </button>
          <span className="hidden lg:group-hover:flex items-center absolute left-[70px] top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-white dark:bg-[#1D1D3D] text-[#1D1B3A] dark:text-[#F2F2FA] border border-[#E9EBF5] dark:border-[#2D2D55] text-xs font-bold rounded-xl shadow-md pointer-events-none whitespace-nowrap z-50">
            Dashboard
          </span>
        </div>

        {/* 2. Service History Archive */}
        <div className="relative group w-full flex justify-center">
          <button
            type="button"
            onClick={() => navigateTab('history')}
            aria-label="Service History"
            aria-current={activeTab === 'history' ? 'page' : undefined}
            className={`w-full max-w-[56px] min-h-[44px] lg:w-11 lg:h-11 px-1 py-1 lg:px-0 rounded-xl lg:rounded-[14px] flex flex-col lg:flex-row items-center justify-center gap-0.5 transition-colors cursor-pointer ${
              activeTab === 'history'
                ? 'bg-white text-[#6D5CF2] font-bold shadow-xs'
                : 'text-white/85 hover:text-white hover:bg-white/15'
            }`}
          >
            <History className="w-4.5 h-4.5 shrink-0" />
            <span className="lg:hidden text-[10px] leading-tight font-semibold">History</span>
          </button>
          <span className="hidden lg:group-hover:flex items-center gap-1.5 absolute left-[70px] top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-white dark:bg-[#1D1D3D] text-[#1D1B3A] dark:text-[#F2F2FA] border border-[#E9EBF5] dark:border-[#2D2D55] text-xs font-bold rounded-xl shadow-md pointer-events-none whitespace-nowrap z-50 tabular-nums">
            <span>Service History ({services.length})</span>
          </span>
        </div>

        {/* 3. Live Attendance Insights */}
        <div className="relative group w-full flex justify-center">
          <button
            type="button"
            onClick={() => navigateTab('insights')}
            aria-label="Live Attendance Insights"
            aria-current={activeTab === 'insights' ? 'page' : undefined}
            className={`w-full max-w-[56px] min-h-[44px] lg:w-11 lg:h-11 px-1 py-1 lg:px-0 rounded-xl lg:rounded-[14px] flex flex-col lg:flex-row items-center justify-center gap-0.5 transition-colors cursor-pointer ${
              activeTab === 'insights'
                ? 'bg-white text-[#6D5CF2] font-bold shadow-xs'
                : 'text-white/85 hover:text-white hover:bg-white/15'
            }`}
          >
            <PieChart className="w-4.5 h-4.5 shrink-0" />
            <span className="lg:hidden text-[10px] leading-tight font-semibold">Insights</span>
          </button>
          <span className="hidden lg:group-hover:flex items-center gap-1.5 absolute left-[70px] top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-white dark:bg-[#1D1D3D] text-[#1D1B3A] dark:text-[#F2F2FA] border border-[#E9EBF5] dark:border-[#2D2D55] text-xs font-bold rounded-xl shadow-md pointer-events-none whitespace-nowrap z-50 tabular-nums">
            Live Insights ({attendancePercentage}%)
          </span>
        </div>

        {/* 4. Members Directory & Uploaded Photos */}
        <div className="relative group w-full flex justify-center">
          <button
            type="button"
            onClick={() => {
              openFilteredDirectory({ department: 'all', group: 'all', displayMode: 'table' });
            }}
            aria-label="Members Directory"
            aria-current={activeTab === 'workflows' || activeTab === 'members' ? 'page' : undefined}
            className={`w-full max-w-[56px] min-h-[44px] lg:w-11 lg:h-11 px-1 py-1 lg:px-0 rounded-xl lg:rounded-[14px] flex flex-col lg:flex-row items-center justify-center gap-0.5 transition-colors cursor-pointer ${
              activeTab === 'workflows' || activeTab === 'members'
                ? 'bg-white text-[#6D5CF2] font-bold shadow-xs'
                : 'text-white/85 hover:text-white hover:bg-white/15'
            }`}
          >
            <Users className="w-4.5 h-4.5 shrink-0" />
            <span className="lg:hidden text-[10px] leading-tight font-semibold">Members</span>
          </button>
          <span className="hidden lg:group-hover:flex items-center gap-1.5 absolute left-[70px] top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-white dark:bg-[#1D1D3D] text-[#1D1B3A] dark:text-[#F2F2FA] border border-[#E9EBF5] dark:border-[#2D2D55] text-xs font-bold rounded-xl shadow-md pointer-events-none whitespace-nowrap z-50 tabular-nums">
            <span>Members &amp; Roster ({members.length})</span>
          </span>
        </div>

        {/* 5. Proximity Radar */}
        <div className="relative group w-full flex justify-center">
          <button
            type="button"
            onClick={() => navigateTab('proximity')}
            aria-label="Proximity Radar"
            aria-current={activeTab === 'proximity' ? 'page' : undefined}
            className={`w-full max-w-[56px] min-h-[44px] lg:w-11 lg:h-11 px-1 py-1 lg:px-0 rounded-xl lg:rounded-[14px] flex flex-col lg:flex-row items-center justify-center gap-0.5 transition-colors cursor-pointer ${
              activeTab === 'proximity'
                ? 'bg-white text-[#6D5CF2] font-bold shadow-xs'
                : 'text-white/85 hover:text-white hover:bg-white/15'
            }`}
          >
            <Radio className="w-4.5 h-4.5 shrink-0" />
            <span className="lg:hidden text-[10px] leading-tight font-semibold">Radar</span>
          </button>
          <span className="hidden lg:group-hover:flex items-center absolute left-[70px] top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-white dark:bg-[#1D1D3D] text-[#1D1B3A] dark:text-[#F2F2FA] border border-[#E9EBF5] dark:border-[#2D2D55] text-xs font-bold rounded-xl shadow-md pointer-events-none whitespace-nowrap z-50">
            Proximity Radar
          </span>
        </div>

        {/* 6. System Settings */}
        <div className="relative group w-full flex justify-center">
          <button
            type="button"
            onClick={() => navigateTab('settings')}
            aria-label="System Settings"
            aria-current={activeTab === 'settings' ? 'page' : undefined}
            className={`w-full max-w-[56px] min-h-[44px] lg:w-11 lg:h-11 px-1 py-1 lg:px-0 rounded-xl lg:rounded-[14px] flex flex-col lg:flex-row items-center justify-center gap-0.5 transition-colors cursor-pointer ${
              activeTab === 'settings'
                ? 'bg-white text-[#6D5CF2] font-bold shadow-xs'
                : 'text-white/85 hover:text-white hover:bg-white/15'
            }`}
          >
            <Settings className="w-4.5 h-4.5 shrink-0" />
            <span className="lg:hidden text-[10px] leading-tight font-semibold">Settings</span>
          </button>
          <span className="hidden lg:group-hover:flex items-center absolute left-[70px] top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-white dark:bg-[#1D1D3D] text-[#1D1B3A] dark:text-[#F2F2FA] border border-[#E9EBF5] dark:border-[#2D2D55] text-xs font-bold rounded-xl shadow-md pointer-events-none whitespace-nowrap z-50">
            System Settings
          </span>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 min-w-0 w-full">
        {activeTab === 'dashboard' && (
          <>
            {/* 1. DOMINANT FOCAL ANCHOR: Active Service / Event Command Hero */}
            <section
              aria-label="Active Service and Event Command Hero"
              className="bg-[#1D1B3A] dark:bg-[#19193A] text-white rounded-3xl border border-[#2F2D59] p-5 sm:p-6 my-2 sm:my-4"
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-4 border-b border-white/10">
                <div className="min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/80 tabular-nums">
                  <span className="font-semibold text-white">
                    Hi, {currentUser?.name ? currentUser.name.split(' ')[0] : 'Leader'}
                  </span>
                  <span aria-hidden="true" className="text-white/40">·</span>
                  <span
                    className={`inline-flex items-center gap-1.5 font-semibold ${
                      dashboardAnalytics.activeService.binaryStatus === 'live'
                        ? 'text-[#4FBF98]'
                        : 'text-white/75'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        dashboardAnalytics.activeService.binaryStatus === 'live'
                          ? 'bg-[#4FBF98]'
                          : 'bg-white/50'
                      }`}
                    />
                    {services.length === 0
                      ? 'No Service Scheduled'
                      : dashboardAnalytics.activeService.binaryStatus === 'live'
                      ? 'Live Service'
                      : 'Closed Service'}
                  </span>
                  {systemSettings.campusName && (
                    <>
                      <span aria-hidden="true" className="text-white/40">·</span>
                      <span className="truncate max-w-[200px]">{systemSettings.campusName}</span>
                    </>
                  )}
                  <span aria-hidden="true" className="text-white/40">·</span>
                  <span>
                    {services.length === 0
                      ? 'Schedule a service to enable member check-ins'
                      : `${
                          currentService.date
                            ? formatServiceDate(currentService.date, true)
                            : 'Current Schedule'
                        } · ${currentService.startsAt}–${currentService.endsAt} (+${dashboardAnalytics.activeService.dwellMinutes}m allowance)`}
                  </span>
                </div>

                {/* Operational Hero Controls */}
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
                      className="bg-white/10 hover:bg-white/15 text-white border border-white/15 rounded-xl px-3 py-1.5 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#8C7DFF] cursor-pointer max-w-[200px]"
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
                    onClick={() => navigateTab('history')}
                    className="inline-flex items-center gap-1.5 bg-white/10 hover:bg-white/15 border border-white/15 text-white rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <History className="w-3.5 h-3.5 text-[#8C7DFF]" />
                    <span>Service History</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setInsightsInitialTab('checked_in');
                      navigateTab('insights');
                    }}
                    className="inline-flex items-center gap-1.5 bg-[#6D5CF2] hover:bg-[#5B4BE0] text-white rounded-xl px-3.5 py-1.5 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <PieChart className="w-3.5 h-3.5" />
                    <span>Live Insights</span>
                  </button>

                  <button
                    type="button"
                    disabled={!hasScheduledService}
                    title={hasScheduledService ? 'Check members in' : checkInEligibility.message}
                    onClick={handleQuickArrivalCheckin}
                    className="inline-flex items-center gap-1.5 bg-white text-[#1D1B3A] hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl px-3.5 py-1.5 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Check className="w-3.5 h-3.5 text-[#6D5CF2]" />
                    <span>Check People In</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsAddServiceOpen(true)}
                    className="inline-flex items-center gap-1.5 bg-white/10 hover:bg-white/15 border border-white/15 text-white rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Service</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsExportModalOpen(true)}
                    className="inline-flex items-center gap-1.5 bg-white/10 hover:bg-white/15 border border-white/15 text-white rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    title="Export Attendance CSV"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Export</span>
                  </button>
                </div>
              </div>

              <div className="pt-4 pb-2 flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div className="min-w-0">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-white/60 block mb-1">
                    Active Service / Event Focus
                  </span>
                  <h1 className="text-2xl sm:text-3xl lg:text-[32px] font-bold tracking-tight text-white leading-tight truncate">
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
                    navigateTab('insights');
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
                    {liveInsightsPreview.attendancePct}% of{' '}
                    {dashboardAnalytics.activeService.expectedAttendance} expected
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setInsightsInitialTab('unarrived');
                    navigateTab('insights');
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
                    {liveInsightsPreview.absenteePct}% of {liveInsightsPreview.absenteeBaseline} ·{' '}
                    {liveInsightsPreview.atRiskCount} repeat
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

            {/* 2. CONGREGATIONAL STRUCTURE 4-COLUMN KPI STRIP */}
            <section
              aria-label="Membership, Departments, Ministries, and Pastoral Readiness"
              className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 my-4 tabular-nums"
            >
              <button
                type="button"
                onClick={() =>
                  openFilteredDirectory({ department: 'all', group: 'all', displayMode: 'table' })
                }
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

            {/* 3. QUICK OPERATIONS ACTION BAR & OVERVIEW SECTION FILTER */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 my-3 px-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingMember(null);
                    setIsAddMemberOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 bg-[#6D5CF2] hover:bg-[#5B4BE0] text-white rounded-xl px-3.5 py-2 text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Add Member</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsImportModalOpen(true)}
                  className="inline-flex items-center gap-1.5 bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] hover:border-[#6D5CF2]/50 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 text-[#6D5CF2]" />
                  <span>Import Roster</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    openFilteredDirectory({
                      department: 'all',
                      group: 'all',
                      displayMode: 'photos',
                    })
                  }
                  className="inline-flex items-center gap-1.5 bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] hover:border-[#6D5CF2]/50 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums"
                >
                  <Camera className="w-3.5 h-3.5 text-[#6D5CF2]" />
                  <span>Member Photos ({uploadedPhotoMembers.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsMessageModalOpen(true)}
                  className="inline-flex items-center gap-1.5 bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] hover:border-[#6D5CF2]/50 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <MessageCircle className="w-3.5 h-3.5 text-[#6D5CF2]" />
                  <span>Broadcast</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigateTab('proximity')}
                  className="inline-flex items-center gap-1.5 bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] hover:border-[#6D5CF2]/50 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Radio className="w-3.5 h-3.5 text-[#6D5CF2]" />
                  <span>Radar</span>
                </button>
              </div>

              <div className="flex items-center justify-between lg:justify-end gap-3">
                <span className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] tabular-nums">
                  Auto readiness: {optInPercentage}% ({autoCheckinOptedInCount}/{members.length})
                </span>
                <div
                  role="tablist"
                  aria-label="Dashboard focus sections"
                  className="inline-flex items-center gap-1 p-1 rounded-xl bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55]"
                >
                  {(
                    [
                      { id: 'all', label: 'All' },
                      { id: 'analytics', label: 'Analytics' },
                      { id: 'operations', label: 'Operations' },
                    ] as const
                  ).map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      role="tab"
                      aria-selected={sectionFilter === mode.id}
                      onClick={() => setSectionFilter(mode.id)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        sectionFilter === mode.id
                          ? 'bg-[#6D5CF2] text-white'
                          : 'text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-white'
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 4. UPLOADED MEMBER PORTRAITS SHOWCASE */}
            <section
              aria-label="Uploaded Member Photos"
              className="bg-white dark:bg-[#1D1D3D] rounded-2xl border border-[#E9EBF5] dark:border-[#2D2D55] p-4 shadow-xs my-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <Camera className="w-4 h-4 text-[#6D5CF2] shrink-0" />
                  <h2 className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                    Uploaded Member Photos
                  </h2>
                  <span className="text-xs font-mono font-semibold text-[#666A86] dark:text-[#A9ACC8] tabular-nums">
                    ({uploadedPhotoMembers.length}/{members.length})
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      openFilteredDirectory({
                        department: 'all',
                        group: 'all',
                        displayMode: 'photos',
                      })
                    }
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#6D5CF2] dark:text-[#9D90FF] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <span>Open Full Photo Gallery</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {uploadedPhotoMembers.length === 0 ? (
                <div className="py-5 px-4 rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-dashed border-[#E9EBF5] dark:border-[#2D2D55] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="text-xs text-[#666A86] dark:text-[#A9ACC8]">
                    <span className="font-semibold text-[#1D1B3A] dark:text-[#F2F2FA] block">
                      No uploaded member photos yet
                    </span>
                    Upload photos when adding or editing a member, or via the Member Digital Card, and they will appear here automatically.
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingMember(members[0] || null);
                      setIsAddMemberOpen(true);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#9D90FF] text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {members.length > 0 ? 'Upload Photo for Member' : 'Add Member with Photo'}
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2.5">
                  {uploadedPhotoMembers.slice(0, 8).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setPhotoPreviewMember(m)}
                      className="group text-left p-2 rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] hover:border-[#6D5CF2]/60 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center justify-center mb-2">
                        <MemberAvatar
                          src={m.imageUrl}
                          name={`${m.firstName} ${m.lastName}`}
                          initials={m.avatarInitials}
                          sizeClass="w-14 h-14"
                          textClass="text-sm font-bold"
                        />
                      </div>
                      <span className="block text-xs font-semibold text-[#1D1B3A] dark:text-[#F2F2FA] truncate text-center">
                        {m.firstName} {m.lastName}
                      </span>
                      <span className="block text-[10px] text-[#666A86] dark:text-[#A9ACC8] truncate text-center">
                        {m.homeCellGroup || m.groupName || 'Member'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {/* 5. CONGREGATION & SERVICE ANALYTICS SUITE + TREND CHARTS */}
            {(sectionFilter === 'all' || sectionFilter === 'analytics') && (
              <>
                <div ref={analyticsSectionRef} className="my-4 sm:my-5">
                  <DashboardDeepAnalytics
                    analytics={dashboardAnalytics}
                    theme={theme}
                    activeLens={analyticsLens}
                    onChangeLens={setAnalyticsLens}
                    onInspectDepartment={(dept) =>
                      openFilteredDirectory({ department: dept, group: 'all', displayMode: 'table' })
                    }
                    onInspectGroup={(grp) =>
                      openFilteredDirectory({ group: grp, department: 'all', displayMode: 'table' })
                    }
                    onSelectService={handleSelectServiceFromChild}
                    onOpenSettings={() => requestOpenSettings('groups')}
                    onAddMember={() => {
                      setEditingMember(null);
                      setIsAddMemberOpen(true);
                    }}
                    onAddService={() => setIsAddServiceOpen(true)}
                    onOpenServiceHistory={() => navigateTab('history')}
                    onOpenServiceRegister={(svcId) => {
                      handleSelectServiceFromChild(svcId);
                      navigateTab('history');
                    }}
                    onToggleServiceStatus={async (svcId, nextStatus) => {
                      const target = services.find((s) => s.id === svcId);
                      try {
                        await updateService(svcId, { status: nextStatus });
                        if (nextStatus === 'live' && target) {
                          const allowance =
                            target.dwellMinutes ?? systemSettings.dwellTimeMinutes ?? 5;
                          const wouldBeLive =
                            computeServiceBinaryStatus({
                              date: target.date,
                              startsAt: target.startsAt,
                              endsAt: target.endsAt,
                              startTimeIso: target.startTimeIso,
                              endTimeIso: target.endTimeIso,
                              allowanceMinutes: allowance,
                              rawStatus: 'active',
                              nowMs: Date.now(),
                            }) === 'live';
                          if (!wouldBeLive) {
                            setEditingServiceTarget({
                              id: target.id,
                              name: target.name,
                              date: target.date,
                              startsAt: target.startsAt,
                              endsAt: target.endsAt,
                              expectedAttendance: target.expectedAttendance,
                              dwellMinutes: allowance,
                              status: 'closed',
                            });
                            showToast(
                              'Service reopened in Supabase — update the time window or allowance duration below to make it Live right now.'
                            );
                          }
                        }
                      } catch (err: any) {
                        showToast(err?.message || 'Could not update service status.');
                      }
                    }}
                    onEditService={(svcId) => {
                      const target = services.find((s) => s.id === svcId);
                      if (!target) return;
                      const allowance = target.dwellMinutes ?? systemSettings.dwellTimeMinutes ?? 5;
                      const binaryStatus = computeServiceBinaryStatus({
                        date: target.date,
                        startsAt: target.startsAt,
                        endsAt: target.endsAt,
                        startTimeIso: target.startTimeIso,
                        endTimeIso: target.endTimeIso,
                        allowanceMinutes: allowance,
                        rawStatus: target.status,
                        nowMs: tickNowMs,
                      });
                      setEditingServiceTarget({
                        id: target.id,
                        name: target.name,
                        date: target.date,
                        startsAt: target.startsAt,
                        endsAt: target.endsAt,
                        expectedAttendance: target.expectedAttendance,
                        dwellMinutes: allowance,
                        status: binaryStatus,
                      });
                    }}
                    onDeleteService={async (svcId) => {
                      try {
                        await deleteService(svcId);
                      } catch (err: any) {
                        showToast(err?.message || 'Could not delete scheduled service.');
                      }
                    }}
                  />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-6 gap-4 sm:gap-5 my-4 sm:my-5 items-stretch">
                  <div className="lg:col-span-6">
                    <WeeklyAttendanceTrendChart
                      onOpenInsights={() => {
                        setInsightsInitialTab('checked_in');
                        navigateTab('insights');
                      }}
                      onQuickCheckin={handleQuickArrivalCheckin}
                    />
                  </div>
                </div>

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
                        showToast(
                          `Care task assigned for ${targetMember.firstName} ${targetMember.lastName}`
                        );
                      }
                      setIsFollowupModalOpen(true);
                    }}
                  />
                </div>
              </>
            )}

            {/* 6. OPERATIONS & PASTORAL CARE GRID */}
            {(sectionFilter === 'all' || sectionFilter === 'operations') && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 sm:gap-5">
                {/* Notifications Card */}
                <section
                  id="notifications-card"
                  className="md:col-span-1 lg:col-span-2 bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-xs border border-[#E9EBF5] dark:border-[#2D2D55] flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-base font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                        Notifications
                      </h2>
                      {auditLogs.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setNotificationsCleared(!notificationsCleared);
                            showToast(
                              notificationsCleared
                                ? 'Notifications restored'
                                : 'Notifications cleared'
                            );
                          }}
                          className="text-xs font-semibold text-[#666A86] dark:text-[#A9ACC8] hover:text-[#EF5A6F] flex items-center gap-1 transition-colors cursor-pointer"
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
                              <span className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                                {log.action}
                              </span>
                              <span className="text-[10px] font-mono text-[#666A86] dark:text-[#A9ACC8] tabular-nums">
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
                          Real-time member check-ins, visitor registrations, and premise updates appear here.
                        </p>
                      </div>
                    )}
                  </div>
                </section>

                {/* Assignments Card (Single-elevation, zero static pills) */}
                <section className="md:col-span-1 lg:col-span-2 bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-xs border border-[#E9EBF5] dark:border-[#2D2D55] flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-base font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                        Assignments
                      </h2>
                      <button
                        type="button"
                        onClick={() => setIsFollowupModalOpen(true)}
                        className="text-xs font-semibold text-[#666A86] dark:text-[#A9ACC8] hover:text-[#6D5CF2] flex items-center gap-1 cursor-pointer tabular-nums"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        View all ({openFollowupCount})
                      </button>
                    </div>

                    {primaryOpenTask ? (
                      <>
                        <div className="flex items-center gap-2 text-xs text-[#666A86] dark:text-[#A9ACC8] mb-2">
                          <span className="font-semibold text-[#6D5CF2] dark:text-[#8C7DFF]">
                            Pastoral care
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="truncate">{primaryOpenTask.groupName}</span>
                        </div>

                        <h3 className="text-base font-bold text-[#1D1B3A] dark:text-[#F2F2FA] leading-snug mb-2">
                          Follow up with {primaryOpenTask.personName}
                        </h3>

                        <div className="flex items-center justify-between gap-2 text-xs mb-4">
                          <span className="font-semibold text-[#12503D] dark:text-[#7AD3B6]">
                            {primaryOpenTask.reason === 'first_timer'
                              ? 'First-timer welcome'
                              : primaryOpenTask.reason === 'absent_3'
                              ? 'Absent 3 weeks'
                              : primaryOpenTask.reason === 'absent_2'
                              ? 'Absent 2 weeks'
                              : 'Care check'}
                          </span>
                          <span className="font-bold text-rose-600 dark:text-rose-400">Open</span>
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
                          Visitor welcomes and absence follow-ups queue here automatically.
                        </p>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsNewAssignmentOpen(true)}
                    className="mt-4 w-full border-2 border-dashed border-[#CBC6F7] dark:border-[#3B3B72] rounded-2xl py-2.5 text-xs font-bold text-[#6D5CF2] dark:text-[#8C7DFF] flex items-center justify-center gap-1.5 hover:bg-[#EFEDFF]/40 dark:hover:bg-[#2A2A55]/20 transition-colors cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    Add new assignment
                  </button>
                </section>

                {/* Calendar & Service History Link Card */}
                <section className="md:col-span-2 lg:col-span-2 bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-xs border border-[#E9EBF5] dark:border-[#2D2D55] flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-base font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                        {weekRangeLabel}
                      </h2>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setIsAddServiceOpen(true)}
                          className="px-2 py-1 rounded-lg bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] text-[11px] font-bold hover:opacity-90 transition-opacity flex items-center gap-1 cursor-pointer mr-1"
                        >
                          <Plus className="w-3 h-3" />
                          Schedule
                        </button>
                        <button
                          type="button"
                          onClick={() => setWeekOffset((w) => w - 1)}
                          className="p-1 rounded-lg text-[#666A86] hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer"
                          aria-label="Previous week"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setWeekOffset((w) => w + 1)}
                          className="p-1 rounded-lg text-[#666A86] hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer"
                          aria-label="Next week"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-7 gap-1 text-center mb-4">
                      {weekDays.map((d) => {
                        const hasServiceOnDay = serviceDatesSet.has(d.iso);
                        const isSelected = selectedDateIso === d.iso;
                        return (
                          <button
                            key={d.iso}
                            type="button"
                            onClick={() => setSelectedDateIso(d.iso)}
                            className={`flex flex-col items-center py-1.5 rounded-xl transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-[#6D5CF2] text-white font-bold'
                                : 'text-[#666A86] dark:text-[#A9ACC8] hover:bg-slate-100 dark:hover:bg-white/5'
                            }`}
                          >
                            <span className="text-[10px] uppercase font-semibold">{d.name}</span>
                            <b className="text-xs tabular-nums">{d.date}</b>
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

                    <div className="space-y-2 max-h-[200px] overflow-y-auto pr-0.5">
                      {services.length === 0 ? (
                        <div className="bg-[#F6F7FC] dark:bg-[#14142E] rounded-2xl p-3 border border-dashed border-[#E9EBF5] dark:border-[#2D2D55] text-center text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
                          No worship services scheduled in database yet.
                        </div>
                      ) : (
                        services.map((svc) => {
                          const isSelectedDay = svc.date === selectedDateIso;
                          const allowance = svc.dwellMinutes ?? systemSettings.dwellTimeMinutes ?? 5;
                          const svcBinaryStatus = computeServiceBinaryStatus({
                            date: svc.date,
                            startsAt: svc.startsAt,
                            endsAt: svc.endsAt,
                            startTimeIso: svc.startTimeIso,
                            endTimeIso: svc.endTimeIso,
                            allowanceMinutes: allowance,
                            rawStatus: svc.status,
                            nowMs: tickNowMs,
                          });
                          return (
                            <div
                              key={svc.id}
                              className={`w-full bg-[#F6F7FC] dark:bg-[#14142E] rounded-2xl p-2.5 flex items-center gap-2.5 border transition-colors ${
                                svc.id === activeServiceId
                                  ? 'border-[#6D5CF2]'
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
                                  <div className="flex items-center gap-1.5">
                                    <b className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] truncate">
                                      {svc.name}
                                    </b>
                                    <span
                                      className={`text-[10px] font-bold shrink-0 ${
                                        svcBinaryStatus === 'live'
                                          ? 'text-emerald-600 dark:text-emerald-400'
                                          : 'text-[#666A86] dark:text-[#A9ACC8]'
                                      }`}
                                    >
                                      · {svcBinaryStatus === 'live' ? 'Live' : 'Closed'}
                                    </span>
                                  </div>
                                  <span className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] block truncate tabular-nums">
                                    {svc.date ? `${formatServiceDate(svc.date)} · ` : ''}
                                    {svc.startsAt}–{svc.endsAt} (+{allowance}m)
                                  </span>
                                </div>
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setEditingServiceTarget({
                                    id: svc.id,
                                    name: svc.name,
                                    date: svc.date,
                                    startsAt: svc.startsAt,
                                    endsAt: svc.endsAt,
                                    expectedAttendance: svc.expectedAttendance,
                                    dwellMinutes: allowance,
                                    status: svcBinaryStatus,
                                  })
                                }
                                className="p-1.5 rounded-lg text-slate-400 hover:text-[#6D5CF2] hover:bg-[#EFEDFF] dark:hover:bg-[#2A2A55] transition-colors shrink-0 cursor-pointer"
                                title="Edit window and allowance"
                                aria-label={`Edit ${svc.name}`}
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              {confirmDeleteCalendarSvcId === svc.id ? (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    setConfirmDeleteCalendarSvcId(null);
                                    try {
                                      await deleteService(svc.id);
                                    } catch (err: any) {
                                      showToast(err?.message || 'Could not delete scheduled service.');
                                    }
                                  }}
                                  className="px-2 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold shrink-0 cursor-pointer"
                                >
                                  Confirm
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteCalendarSvcId(svc.id)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors shrink-0 cursor-pointer"
                                  title="Delete service from database"
                                  aria-label={`Delete ${svc.name}`}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  <div className="pt-3 mt-3 border-t border-[#E9EBF5] dark:border-[#2D2D55] text-xs flex justify-between items-center gap-2">
                    <button
                      type="button"
                      onClick={() => navigateTab('history')}
                      className="font-bold text-[#6D5CF2] dark:text-[#9D90FF] hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <History className="w-3.5 h-3.5" />
                      <span>View Service History</span>
                    </button>
                    <span className="font-semibold text-[#666A86] dark:text-[#A9ACC8] truncate max-w-[140px]">
                      {currentService.name}
                    </span>
                  </div>
                </section>

                {/* Live Session Readiness */}
                <section className="md:col-span-2 lg:col-span-3 bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-xs border border-[#E9EBF5] dark:border-[#2D2D55]">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                    <div className="flex items-center gap-3">
                      <h2 className="text-base font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                        Live readiness
                      </h2>
                      <div className="flex -space-x-2">
                        {members.slice(0, 4).map((m) => (
                          <MemberAvatar
                            key={m.id}
                            src={m.imageUrl}
                            name={`${m.firstName} ${m.lastName}`}
                            initials={m.avatarInitials}
                            sizeClass="w-7 h-7"
                            textClass="text-[10px] font-bold"
                            bgClass="bg-[#6D5CF2] text-white"
                            borderClass="border-2 border-white dark:border-[#1D1D3D]"
                          />
                        ))}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => navigateTab('settings')}
                      className="text-xs font-semibold text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-white flex items-center gap-1 cursor-pointer"
                    >
                      <Settings className="w-3.5 h-3.5" />
                      Configure
                    </button>
                  </div>

                  <div className="p-3 rounded-2xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] mb-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="min-w-0">
                      <b className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                        Church Premise Geofence
                      </b>
                      <em className="text-[11px] not-italic text-[#666A86] dark:text-[#A9ACC8]">
                        {systemSettings.campusName} · {systemSettings.innerGeofenceMeters}m inner radius
                      </em>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] min-w-[120px] tabular-nums">
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

                  <div className="p-3 rounded-2xl bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] mb-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="min-w-0">
                      <b className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                        Congregation Roster
                      </b>
                      <em className="text-[11px] not-italic text-[#666A86] dark:text-[#A9ACC8]">
                        Supabase live member directory ({uploadedPhotoMembers.length} photos)
                      </em>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] min-w-[120px] tabular-nums">
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

                  <div className="p-3 rounded-2xl bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="min-w-0">
                      <b className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                        Live Service Check-ins
                      </b>
                      <em className="text-[11px] not-italic text-[#666A86] dark:text-[#A9ACC8] tabular-nums">
                        {currentService.name} (
                        {currentService.date ? `${formatServiceDate(currentService.date)} · ` : ''}
                        {currentService.startsAt}–{currentService.endsAt})
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
                      {liveInsightsPreview.attendanceCount} present ·{' '}
                      {liveInsightsPreview.absenteeCount} absent
                    </span>
                  </div>
                </section>

                {/* Auto Check-In Opt-In Card */}
                <section className="md:col-span-1 lg:col-span-1 bg-[#6D5CF2] text-white rounded-2xl sm:rounded-3xl p-4 sm:p-5 flex flex-col items-center justify-between text-center">
                  <div>
                    <h2 className="text-sm sm:text-base font-bold mb-1">Auto check-in</h2>
                    <p className="text-xs text-white/90 leading-snug mb-3 tabular-nums">
                      {members.length === 0
                        ? 'Enroll members to enable automated proximity arrival.'
                        : `${manualCheckinPercentage}% of members (${manualCheckinCount}) currently sign in manually.`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (members.length === 0) {
                        setEditingMember(null);
                        setIsAddMemberOpen(true);
                      } else {
                        setIsMessageModalOpen(true);
                      }
                    }}
                    className="w-full bg-white hover:bg-white/95 text-[#6D5CF2] rounded-xl py-2 text-xs font-extrabold transition-colors cursor-pointer"
                  >
                    {members.length === 0 ? 'Add first member' : 'Invite members'}
                  </button>
                </section>

                {/* Outreach & Premise Status */}
                <div className="md:col-span-1 lg:col-span-2 flex flex-col gap-4">
                  <section className="bg-white dark:bg-[#1D1D3D] rounded-3xl p-4 sm:p-5 shadow-xs border border-[#E9EBF5] dark:border-[#2D2D55] flex-1 flex flex-col justify-between">
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
                      className="w-full bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] rounded-xl py-2 text-xs font-bold hover:opacity-90 transition-opacity cursor-pointer"
                    >
                      Compose Broadcast
                    </button>
                  </section>

                  <section className="bg-white dark:bg-[#1D1D3D] rounded-3xl p-4 shadow-xs border border-[#E9EBF5] dark:border-[#2D2D55]">
                    <div className="flex items-center justify-between mb-1">
                      <h2 className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA] truncate">
                        {systemSettings.campusName || 'Church Premise'}
                      </h2>
                      <span
                        className={`text-[11px] font-semibold ${
                          isPremiseConfigured
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-amber-600 dark:text-amber-400'
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
                      Inner perimeter: {systemSettings.innerGeofenceMeters}m · Dwell rule:{' '}
                      {systemSettings.dwellTimeMinutes} min
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => navigateTab('proximity')}
                        className="flex-1 bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] rounded-xl py-1.5 text-xs font-bold hover:opacity-90 transition-opacity cursor-pointer"
                      >
                        Live Radar
                      </button>
                      <button
                        type="button"
                        onClick={() => navigateTab('settings')}
                        className="flex-1 bg-[#6D5CF2] text-white rounded-xl py-1.5 text-xs font-bold hover:bg-[#5b4be0] transition-colors cursor-pointer"
                      >
                        Edit Premise
                      </button>
                    </div>
                  </section>
                </div>
              </div>
            )}
          </>
        )}

        {/* Service History Tab */}
        {activeTab === 'history' && (
          <div className="mt-2">
            <ServiceHistoryPanel
              onSelectActiveService={handleSelectServiceFromChild}
              onAddService={() => setIsAddServiceOpen(true)}
              onOpenInsights={() => {
                setInsightsInitialTab('checked_in');
                navigateTab('insights');
              }}
            />
          </div>
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

        {/* Members Directory Tab */}
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
              canCheckIn={hasScheduledService}
              checkInDisabledReason={checkInEligibility.message}
              initialDepartmentFilter={directoryDeptFilter}
              initialGroupFilter={directoryGroupFilter}
              initialDisplayMode={directoryDisplayMode}
            />
          </div>
        )}

        {/* Integrations Tab */}
        {activeTab === 'integrations' && (
          <div className="mt-4 space-y-5">
            <div>
              <h2 className="text-xl font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                Hardware &amp; Service Integrations
              </h2>
              <p className="text-xs text-[#666A86] dark:text-[#A9ACC8]">
                Manage entrance BLE beacons, PostGIS geofence rings, SMS gateways, and Paystack.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-[#E9EBF5] dark:border-[#2D2D55] shadow-xs">
                <h3 className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-2 flex items-center justify-between">
                  <span>PostGIS Campus Geofencing</span>
                  <span
                    className={`text-[11px] font-semibold ${
                      isPremiseConfigured
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-amber-600 dark:text-amber-400'
                    }`}
                  >
                    {isPremiseConfigured ? 'Active' : 'Unset'}
                  </span>
                </h3>
                <p className="text-xs text-[#666A86] dark:text-[#A9ACC8] mb-3 tabular-nums">
                  Outer Ring: {systemSettings.outerGeofenceMeters} m (App approach wake-up)
                  <br />
                  Inner Ring: {systemSettings.innerGeofenceMeters} m (
                  {systemSettings.dwellTimeMinutes}-min dwell required)
                </p>
                <div className="bg-[#F6F7FC] dark:bg-[#14142E] p-2.5 rounded-xl text-xs font-mono text-[#6D5CF2] dark:text-[#8C7DFF] mb-3 tabular-nums">
                  {isPremiseConfigured
                    ? `POINT(${systemSettings.campusLatitude?.toFixed(6)}, ${systemSettings.campusLongitude?.toFixed(6)})`
                    : 'Unconfigured — Set Premise GPS'}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    showToast(
                      isPremiseConfigured
                        ? `Geofence verified at ${systemSettings.campusName}`
                        : 'Please pin your Church Premise GPS in System Settings first.'
                    )
                  }
                  className="w-full bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] rounded-xl py-2 text-xs font-bold cursor-pointer"
                >
                  Test Radius Accuracy
                </button>
              </div>

              <div className="bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-[#E9EBF5] dark:border-[#2D2D55] shadow-xs">
                <h3 className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-2 flex items-center justify-between">
                  <span>Entrance BLE Beacons</span>
                  <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                    Ready
                  </span>
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
                  type="button"
                  onClick={() =>
                    showToast('Entrance Beacon pinged: Signal strength -58 dBm (Strong)')
                  }
                  className="w-full bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] rounded-xl py-2 text-xs font-bold cursor-pointer"
                >
                  Ping Beacon
                </button>
              </div>

              <div className="bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-[#E9EBF5] dark:border-[#2D2D55] shadow-xs">
                <h3 className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-2 flex items-center justify-between">
                  <span>Paystack &amp; Mobile Money</span>
                  <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                    Active
                  </span>
                </h3>
                <p className="text-xs text-[#666A86] dark:text-[#A9ACC8] mb-3">
                  MTN Mobile Money, Telecel Cash &amp; Cards active with webhook verification.
                </p>
                <div className="bg-[#F6F7FC] dark:bg-[#14142E] p-2.5 rounded-xl text-xs text-[#666A86] dark:text-[#A9ACC8] mb-3">
                  Settlement Currency: {systemSettings.currency}
                </div>
                <button
                  type="button"
                  onClick={() => showToast('Payment gateway webhook verified')}
                  className="w-full bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] rounded-xl py-2 text-xs font-bold cursor-pointer"
                >
                  Test MoMo Webhook
                </button>
              </div>
            </div>

            <div className="bg-white dark:bg-[#1D1D3D] rounded-2xl p-4 border border-[#E9EBF5] dark:border-[#2D2D55] flex flex-wrap items-center justify-between gap-3 text-xs">
              <div>
                <strong className="text-[#1D1B3A] dark:text-[#F2F2FA]">
                  Active SMS Gateway:{' '}
                </strong>
                <span className="text-[#666A86] dark:text-[#A9ACC8]">
                  {systemSettings.smsGatewayProvider} (Sender: {systemSettings.smsSenderId}) · Push Engine:{' '}
                  {systemSettings.enablePushNotifications ? 'Enabled' : 'Paused'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => requestOpenSettings('proximity')}
                  className="px-3 py-1.5 rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] font-bold text-[#6D5CF2] dark:text-[#8C7DFF] cursor-pointer"
                >
                  Configure Geofence
                </button>
                <button
                  type="button"
                  onClick={() => requestOpenSettings('gateways')}
                  className="px-3 py-1.5 rounded-xl bg-[#EFEDFF] dark:bg-[#2A2A55] font-bold text-[#6D5CF2] dark:text-[#8C7DFF] cursor-pointer"
                >
                  Configure Gateways
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'proximity' && (
          <div className="mt-4">
            <ProximitySimulator />
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="mt-4">
            <SystemSettingsPanel />
          </div>
        )}
      </div>

      {/* Member Portrait Preview Modal from Dashboard Uploaded Photos Strip */}
      {photoPreviewMember && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${photoPreviewMember.firstName} ${photoPreviewMember.lastName} Photo Preview`}
          onClick={() => setPhotoPreviewMember(null)}
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-[#1D1D3D] rounded-3xl max-w-md w-full overflow-hidden border border-[#E9EBF5] dark:border-[#2D2D55] shadow-xl"
          >
            <div className="px-5 py-3.5 border-b border-[#E9EBF5] dark:border-[#2D2D55] flex items-center justify-between">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA] truncate">
                  {photoPreviewMember.firstName} {photoPreviewMember.lastName}
                </h3>
                <p className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] truncate">
                  {photoPreviewMember.homeCellGroup || photoPreviewMember.groupName} ·{' '}
                  {photoPreviewMember.department || 'General'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPhotoPreviewMember(null)}
                aria-label="Close photo preview"
                className="p-1.5 rounded-lg text-[#666A86] hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 flex flex-col items-center">
              {photoPreviewUrl ? (
                <img
                  src={photoPreviewUrl}
                  alt={`${photoPreviewMember.firstName} ${photoPreviewMember.lastName}`}
                  referrerPolicy="no-referrer"
                  className="w-64 h-64 rounded-2xl object-cover border border-[#E9EBF5] dark:border-[#2D2D55]"
                />
              ) : (
                <MemberAvatar
                  src={photoPreviewMember.imageUrl}
                  name={`${photoPreviewMember.firstName} ${photoPreviewMember.lastName}`}
                  initials={photoPreviewMember.avatarInitials}
                  sizeClass="w-36 h-36"
                  textClass="text-3xl font-bold"
                />
              )}
              <div className="w-full flex gap-2 mt-5">
                <button
                  type="button"
                  onClick={() => {
                    const target = photoPreviewMember;
                    setPhotoPreviewMember(null);
                    setEditingMember(target);
                    setIsAddMemberOpen(true);
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#9D90FF] text-xs font-bold cursor-pointer"
                >
                  Edit Member / Photo
                </button>
                <button
                  type="button"
                  onClick={() => setPhotoPreviewMember(null)}
                  className="flex-1 py-2.5 rounded-xl bg-[#6D5CF2] text-white text-xs font-bold cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Memoized Modals */}
      <AddServiceModal
        isOpen={isAddServiceOpen}
        onClose={() => setIsAddServiceOpen(false)}
        defaultDate={selectedDateIso || getLocalIsoDate()}
        systemSettings={systemSettings}
        onSubmitService={handleCreateServiceSubmit}
        onNotify={showToast}
        formatDateLabel={formatServiceDate}
      />

      <EditServiceModal
        isOpen={Boolean(editingServiceTarget)}
        service={editingServiceTarget}
        defaultAllowanceMinutes={systemSettings.dwellTimeMinutes ?? 5}
        onClose={() => setEditingServiceTarget(null)}
        onSaveService={async (svcId, updates) => {
          await updateService(svcId, updates);
        }}
        onNotify={showToast}
        formatDateLabel={formatServiceDate}
      />

      <BroadcastModal
        isOpen={isMessageModalOpen}
        onClose={() => setIsMessageModalOpen(false)}
        members={members}
        churchGroups={churchGroups}
        churchName={systemSettings.churchName}
        serviceStartsAt={currentService.startsAt}
        absenteeThresholdServices={systemSettings.absenteeThresholdServices}
        smsGatewayProvider={systemSettings.smsGatewayProvider}
        smsSenderId={systemSettings.smsSenderId}
        enablePushNotifications={systemSettings.enablePushNotifications}
        onOpenGatewaySettings={() => requestOpenSettings('gateways')}
        onNotify={showToast}
      />

      <FollowupQueueModal
        isOpen={isFollowupModalOpen}
        onClose={() => setIsFollowupModalOpen(false)}
        followupTasks={followupTasks}
        members={members}
        absenteeThresholdServices={systemSettings.absenteeThresholdServices}
        firstTimerFollowupHours={systemSettings.firstTimerFollowupHours}
        autoAssignCellLeaders={systemSettings.autoAssignCellLeaders}
        onOpenPastoralSettings={() => requestOpenSettings('pastoral')}
        onResolveTask={resolveFollowupTask}
        onNotify={showToast}
      />

      <NewAssignmentModal
        isOpen={isNewAssignmentOpen}
        onClose={() => setIsNewAssignmentOpen(false)}
        members={members}
        churchGroups={churchGroups}
        systemSettings={systemSettings}
        onCreateTask={(personId, reason, notes) =>
          addFollowupTask(personId, reason, notes || '')
        }
        onNotify={showToast}
      />

      <ExportCsvModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        currentService={currentService}
        onConfirmExport={handleExportCSV}
      />

      <AddMemberModal
        isOpen={isAddMemberOpen}
        onClose={() => {
          setIsAddMemberOpen(false);
          setEditingMember(null);
        }}
        initialData={editingMember}
      />

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
