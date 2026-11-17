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
  UserCheck,
  RefreshCw,
  Wallet,
  ShieldCheck,
  Mail,
  Smartphone,
  Activity,
  QrCode,
  Scan,
} from 'lucide-react';
import { ProximitySimulator } from '../simulator/ProximitySimulator';
import { UserManagement } from '../UserManagement';
import { AddMemberModal } from './AddMemberModal';
import { MemberQrScannerModal } from '../member/MemberQrScannerModal';
import { SystemSettingsPanel } from './SystemSettingsPanel';
import { MemberDirectoryTable } from './MemberDirectoryTable';
import { ImportMembersModal } from './ImportMembersModal';
import { LiveAttendanceInsights } from './LiveAttendanceInsights';
import { WeeklyAttendanceTrendChart } from './WeeklyAttendanceTrendChart';
import { VisitorTrendsAnalysis } from './VisitorTrendsAnalysis';
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
import { ServiceQrModal, ServiceQrTarget } from './ServiceQrModal';
import { computeDashboardAnalytics } from '../../utils/dashboardAnalytics';
import { ChurchGroupCategory, Person } from '../../types/ekklesphere';
import { MemberAvatar } from '../common/MemberAvatar';
import { ContactCallButton } from '../common/ContactCallButton';
import { getImageFallbackUrls } from '../../utils/imageUrl';
import { computeServiceBinaryStatus, isPlaceholderServiceId } from '../../utils/serviceStatus';

type AdminNavTab =
  | 'dashboard'
  | 'history'
  | 'insights'
  | 'workflows'
  | 'users'
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

function shuffleMembersRandomly(list: Person[]): Person[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export const AdminDashboard: React.FC = () => {
  const {
    theme,
    adminSubTab,
    setAdminSubTab,
    requestOpenSettings,
    requestedAnalyticsTarget,
    isAddServiceOpen,
    setIsAddServiceOpen,
    isFollowupModalOpen,
    setIsFollowupModalOpen,
    members,
    visitorsCount,
    serviceVisitorsCount,
    attendancePercentage,
    optInPercentage,
    checkInPerson,
    showToast,
    followupTasks,
    resolveFollowupTask,
    addFollowupTask,
    autoAssignAbsentees,
    isAutoAssigningAbsentees,
    communicationStatus,
    sendCommunicationBroadcast,
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
  const [externalAnalyticsQuery, setExternalAnalyticsQuery] = useState<string | undefined>(undefined);
  const [externalAnalyticsCategory, setExternalAnalyticsCategory] = useState<
    'all' | ChurchGroupCategory | undefined
  >(undefined);
  const [externalAnalyticsNonce, setExternalAnalyticsNonce] = useState<number>(0);
  const analyticsSectionRef = useRef<HTMLDivElement>(null);

  const [directoryDeptFilter, setDirectoryDeptFilter] = useState<string | null>(null);
  const [directoryGroupFilter, setDirectoryGroupFilter] = useState<string | null>(null);
  const [directoryBirthMonthFilter, setDirectoryBirthMonthFilter] = useState<string | null>(null);
  const [directoryStatusFilter, setDirectoryStatusFilter] = useState<
    'all' | 'member' | 'visitor' | 'officers'
  >('all');
  const [directoryDisplayMode, setDirectoryDisplayMode] = useState<'table' | 'photos'>('table');

  // Lightbox for clicking any member portrait directly from Dashboard
  const [photoPreviewMember, setPhotoPreviewMember] = useState<Person | null>(null);
  const [editingServiceTarget, setEditingServiceTarget] = useState<EditableServiceTarget | null>(null);
  const [qrServiceTarget, setQrServiceTarget] = useState<ServiceQrTarget | null>(null);
  const [isAdminQrScannerOpen, setIsAdminQrScannerOpen] = useState(false);
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

  useEffect(() => {
    if (!requestedAnalyticsTarget) return;
    setActiveTab('dashboard');
    setSectionFilter((prev) => (prev === 'operations' ? 'all' : prev));
    setAnalyticsLens(requestedAnalyticsTarget.lens);
    setExternalAnalyticsQuery(requestedAnalyticsTarget.searchQuery ?? '');
    setExternalAnalyticsCategory(requestedAnalyticsTarget.categoryFilter ?? 'all');
    setExternalAnalyticsNonce(requestedAnalyticsTarget.nonce);
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        analyticsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }, [requestedAnalyticsTarget]);

  const navigateTab = useCallback(
    (
      tab:
        | 'dashboard'
        | 'history'
        | 'insights'
        | 'workflows'
        | 'users'
        | 'integrations'
        | 'proximity'
        | 'settings'
    ) => {
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

  const [photoShuffleTick, setPhotoShuffleTick] = useState<number>(() => Math.random());

  useEffect(() => {
    if (activeTab !== 'dashboard') return;
    setPhotoShuffleTick((n) => n + 1);
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'dashboard' || photoPreviewMember || uploadedPhotoMembers.length <= 1) {
      return;
    }
    const timer = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      setPhotoShuffleTick((n) => n + 1);
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [activeTab, photoPreviewMember, uploadedPhotoMembers.length]);

  const shuffledPhotoMembers = useMemo(() => {
    void photoShuffleTick;
    return shuffleMembersRandomly(uploadedPhotoMembers);
  }, [uploadedPhotoMembers, photoShuffleTick]);

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

  const openCareQueueList = useMemo(
    () => followupTasks.filter((t) => t.status === 'open' || t.status === 'contacted'),
    [followupTasks]
  );

  const primaryOpenTask = openCareQueueList[0] || null;

  const primaryTaskPerson = useMemo(
    () =>
      primaryOpenTask
        ? members.find((m) => m.id === primaryOpenTask.personId) || null
        : null,
    [primaryOpenTask, members]
  );

  const repeatAbsenteeWatchlist = useMemo(() => {
    const threshold = Math.max(1, systemSettings.absenteeThresholdServices || 2);
    return members
      .filter(
        (m) =>
          !checkedInMemberIds.has(m.id) &&
          (m.consecutiveAbsences || 0) >= threshold
      )
      .sort((a, b) => (b.consecutiveAbsences || 0) - (a.consecutiveAbsences || 0))
      .slice(0, 4);
  }, [members, checkedInMemberIds, systemSettings.absenteeThresholdServices]);

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
    (opts: {
      department?: string | null;
      group?: string | null;
      birthMonthGroup?: string | null;
      status?: 'all' | 'member' | 'visitor' | 'officers';
      displayMode?: 'table' | 'photos';
    }) => {
      setDirectoryDeptFilter(opts.department ?? 'all');
      setDirectoryGroupFilter(opts.group ?? 'all');
      setDirectoryBirthMonthFilter(opts.birthMonthGroup ?? 'all');
      setDirectoryStatusFilter(opts.status ?? 'all');
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
      const created = await addService(params);
      setSelectedDateIso(params.date);
      return created;
    },
    [addService]
  );

  const photoPreviewUrl = useMemo(() => {
    if (!photoPreviewMember?.imageUrl) return null;
    const candidates = getImageFallbackUrls(photoPreviewMember.imageUrl, 'full');
    return candidates[0] || photoPreviewMember.imageUrl;
  }, [photoPreviewMember]);

  return (
    <main className="relative max-w-[1440px] w-[calc(100%-10px)] sm:w-[calc(100%-20px)] lg:w-[calc(100%-24px)] mx-auto my-1.5 sm:my-2.5 lg:my-3 bg-[#F6F7FC] dark:bg-[#14142E] rounded-2xl sm:rounded-3xl pt-3 sm:pt-4 pb-24 sm:pb-24 lg:pb-6 px-3 sm:px-5 lg:pl-[80px] lg:pr-5 shadow-xs border border-[#E9EBF5] dark:border-[#2D2D55] min-h-[calc(100dvh-76px)] min-w-0 overflow-x-clip transition-colors duration-200">
      {/* Left Navigation Rail (Desktop) & Bottom Dock (Mobile) */}
      <aside
        aria-label="Admin Module Navigation"
        className="fixed z-50 bottom-2 sm:bottom-4 left-1/2 -translate-x-1/2 lg:translate-x-0 lg:bottom-auto lg:top-20 lg:left-0 w-[calc(100%-16px)] max-w-lg lg:w-[64px] bg-[#6D5CF2] dark:bg-[#5E4EE0] rounded-2xl sm:rounded-full lg:rounded-r-[28px] lg:rounded-l-none grid grid-cols-6 lg:flex lg:flex-col items-center justify-items-center lg:justify-start gap-1 sm:gap-1.5 lg:gap-3 px-1.5 py-1.5 sm:px-3 sm:py-2 lg:py-6 lg:px-0 pb-[max(0.375rem,env(safe-area-inset-bottom))] lg:pb-6 shadow-md border border-white/15 lg:border-none select-none touch-manipulation"
      >
        {/* 1. Dashboard Overview */}
        <div className="relative group w-full min-w-0 flex justify-center">
          <button
            type="button"
            onClick={() => navigateTab('dashboard')}
            aria-label="Dashboard Overview"
            aria-current={activeTab === 'dashboard' ? 'page' : undefined}
            className={`w-full max-w-[56px] min-w-0 min-h-[44px] lg:w-11 lg:h-11 px-1 py-1 lg:px-0 rounded-xl lg:rounded-[14px] flex flex-col lg:flex-row items-center justify-center gap-0.5 transition-colors cursor-pointer ${
              activeTab === 'dashboard'
                ? 'bg-white text-[#6D5CF2] font-bold shadow-xs'
                : 'text-white/85 hover:text-white hover:bg-white/15'
            }`}
          >
            <Grid className="w-4.5 h-4.5 shrink-0" />
            <span className="lg:hidden text-[10px] leading-tight font-semibold truncate max-w-full">Dash</span>
          </button>
          <span className="hidden lg:group-hover:flex items-center absolute left-[70px] top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-white dark:bg-[#1D1D3D] text-[#1D1B3A] dark:text-[#F2F2FA] border border-[#E9EBF5] dark:border-[#2D2D55] text-xs font-bold rounded-xl shadow-md pointer-events-none whitespace-nowrap z-50">
            Dashboard
          </span>
        </div>

        {/* 2. Service History Archive */}
        <div className="relative group w-full min-w-0 flex justify-center">
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
        <div className="relative group w-full min-w-0 flex justify-center">
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
        <div className="relative group w-full min-w-0 flex justify-center">
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
        <div className="relative group w-full min-w-0 flex justify-center">
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
        <div className="relative group w-full min-w-0 flex justify-center">
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
              <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3.5 pb-4 border-b border-white/10">
                <div className="min-w-0 flex flex-col gap-0.5">
                  {(() => {
                    const tenantName = (
                      systemSettings.churchName ||
                      currentUser?.organizationName ||
                      ''
                    ).trim();
                    const hour = new Date(tickNowMs).getHours();
                    const greeting =
                      hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
                    const rawName = (currentUser?.name || 'Administrator').trim();
                    return tenantName ? (
                      <>
                        <h2
                          title={tenantName}
                          className="text-lg sm:text-xl font-bold tracking-tight text-white truncate"
                        >
                          {tenantName}
                        </h2>
                        <p className="text-xs sm:text-sm font-medium text-[#C4BDFF] truncate">
                          {greeting}, {rawName}
                        </p>
                      </>
                    ) : (
                      <h2 className="text-base sm:text-lg font-semibold tracking-tight text-white truncate">
                        {greeting}, {rawName}
                      </h2>
                    );
                  })()}
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
                      className="h-8 bg-white/10 hover:bg-white/15 text-white border border-white/15 rounded-lg px-2.5 text-[11px] font-semibold outline-none focus:ring-2 focus:ring-[#8C7DFF] cursor-pointer max-w-[210px] truncate"
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
                    className="h-8 inline-flex items-center gap-1.5 bg-white/10 hover:bg-white/15 border border-white/15 text-white rounded-lg px-3 text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <History className="w-3.5 h-3.5 text-[#8C7DFF]" aria-hidden="true" />
                    <span>History</span>
                  </button>

                  <button
                    type="button"
                    disabled={!currentService?.id || isPlaceholderServiceId(currentService.id)}
                    title={
                      currentService?.id && !isPlaceholderServiceId(currentService.id)
                        ? `Show Check-In QR for ${currentService.name}`
                        : 'Schedule a service first to generate a QR code'
                    }
                    onClick={() => {
                      if (!currentService?.id || isPlaceholderServiceId(currentService.id)) return;
                      setQrServiceTarget({
                        id: currentService.id,
                        name: currentService.name,
                        date: currentService.date,
                        startsAt: currentService.startsAt,
                        endsAt: currentService.endsAt,
                        dwellMinutes:
                          currentService.dwellMinutes ?? systemSettings.dwellTimeMinutes ?? 5,
                        status: currentService.status,
                      });
                    }}
                    className="h-8 inline-flex items-center gap-1.5 bg-white/10 hover:bg-white/15 disabled:opacity-45 disabled:cursor-not-allowed border border-white/15 text-white rounded-lg px-3 text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <QrCode className="w-3.5 h-3.5 text-[#8C7DFF]" aria-hidden="true" />
                    <span>Service QR</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsAdminQrScannerOpen(true)}
                    title="Scan Member Pass or Service Check-In QR"
                    className="h-8 inline-flex items-center gap-1.5 bg-white/10 hover:bg-white/15 border border-white/15 text-white rounded-lg px-3 text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Scan className="w-3.5 h-3.5 text-[#8C7DFF]" aria-hidden="true" />
                    <span>Scan QR</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setInsightsInitialTab('checked_in');
                      navigateTab('insights');
                    }}
                    className="h-8 inline-flex items-center gap-1.5 bg-[#6D5CF2] hover:bg-[#5B4BE0] text-white rounded-lg px-3 text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <PieChart className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Live Insights</span>
                  </button>

                  <button
                    type="button"
                    disabled={!hasScheduledService}
                    title={hasScheduledService ? 'Check members in' : checkInEligibility.message}
                    onClick={handleQuickArrivalCheckin}
                    className="h-8 inline-flex items-center gap-1.5 bg-white text-[#1D1B3A] hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg px-3.5 text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Check className="w-3.5 h-3.5 text-[#6D5CF2]" aria-hidden="true" />
                    <span>Check People In</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsAddServiceOpen(true)}
                    className="h-8 inline-flex items-center gap-1.5 bg-white/10 hover:bg-white/15 border border-white/15 text-white rounded-lg px-3 text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Add Service</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsExportModalOpen(true)}
                    className="h-8 inline-flex items-center gap-1.5 bg-white/10 hover:bg-white/15 border border-white/15 text-white rounded-lg px-2.5 text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    title="Export Attendance CSV"
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
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

              {/* 5-Column Hairline Telemetry Strip inside Hero */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-0 sm:divide-x divide-white/10 pt-3.5 mt-2.5 border-t border-white/10 tabular-nums">
                <button
                  type="button"
                  onClick={() => {
                    setInsightsInitialTab('checked_in');
                    navigateTab('insights');
                  }}
                  className="sm:pr-4 text-left group cursor-pointer"
                >
                  <span className="text-[11px] font-semibold text-white/65 group-hover:text-white transition-colors block">
                    Checked In Present
                  </span>
                  <span className="font-mono text-2xl font-bold text-[#4FBF98] mt-0.5 block">
                    {liveInsightsPreview.attendanceCount}
                  </span>
                  <span className="text-[11px] text-white/65 block truncate">
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
                  className="sm:px-4 text-left group cursor-pointer"
                >
                  <span className="text-[11px] font-semibold text-white/65 group-hover:text-white transition-colors block">
                    Unarrived / Absent
                  </span>
                  <span className="font-mono text-2xl font-bold text-[#FF7B8E] mt-0.5 block">
                    {liveInsightsPreview.absenteeCount}
                  </span>
                  <span className="text-[11px] text-white/65 block truncate">
                    {liveInsightsPreview.absenteePct}% · {liveInsightsPreview.atRiskCount} repeat
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    openFilteredDirectory({
                      department: 'all',
                      group: 'all',
                      status: 'visitor',
                      displayMode: 'table',
                    })
                  }
                  className="sm:px-4 text-left group cursor-pointer"
                >
                  <span className="text-[11px] font-semibold text-white/65 group-hover:text-white transition-colors block">
                    Service Visitors
                  </span>
                  <span className="font-mono text-2xl font-bold text-[#F4D58B] mt-0.5 block">
                    {serviceVisitorsCount}
                  </span>
                  <span className="text-[11px] text-white/65 block truncate">
                    {visitorsCount} registered guests
                  </span>
                </button>

                <div className="sm:px-4">
                  <span className="text-[11px] font-semibold text-white/65 block">
                    On-Time Punctuality
                  </span>
                  <span className="font-mono text-2xl font-bold text-white mt-0.5 block">
                    {liveInsightsPreview.punctualityPct}%
                  </span>
                  <span className="text-[11px] text-white/65 block truncate">
                    {liveInsightsPreview.onTime} on-time · {liveInsightsPreview.late} late
                  </span>
                </div>

                <div className="sm:pl-4 col-span-2 sm:col-span-1">
                  <span className="text-[11px] font-semibold text-white/65 block">
                    Arrival Channel Split
                  </span>
                  <span className="font-mono text-2xl font-bold text-white mt-0.5 block">
                    {liveInsightsPreview.autoCount} / {liveInsightsPreview.assistedCount}
                  </span>
                  <span className="text-[11px] text-white/65 block truncate">
                    Auto GPS / Door ({optInPercentage}% ready)
                  </span>
                </div>
              </div>
            </section>

            {/* 2. HIGH-DENSITY 8-TILE EXECUTIVE KPI MATRIX */}
            <section
              aria-label="Congregation, Visitors, Leadership, Giving, and Operations KPIs"
              className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2.5 my-3 tabular-nums"
            >
              <button
                type="button"
                onClick={() =>
                  openFilteredDirectory({
                    department: 'all',
                    group: 'all',
                    status: 'all',
                    displayMode: 'table',
                  })
                }
                className="bg-white dark:bg-[#1D1D3D] rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] hover:border-[#6D5CF2]/60 p-3 text-left transition-colors group cursor-pointer flex flex-col justify-between min-w-0"
              >
                <div className="flex items-center justify-between gap-1.5 w-full">
                  <span className="text-[11px] font-semibold text-[#666A86] dark:text-[#A9ACC8] truncate">
                    Roster
                  </span>
                  <Users className="w-3.5 h-3.5 text-[#6D5CF2] shrink-0" />
                </div>
                <span className="font-mono text-xl sm:text-2xl font-bold text-[#1D1B3A] dark:text-[#F2F2FA] my-1 leading-none">
                  {dashboardAnalytics.membership.totalMembers}
                </span>
                <span className="text-[10px] text-[#666A86] dark:text-[#A9ACC8] truncate">
                  {dashboardAnalytics.membership.activeStatusCount} active ·{' '}
                  {dashboardAnalytics.membership.inactiveCount} inactive
                </span>
              </button>

              <button
                type="button"
                onClick={() =>
                  openFilteredDirectory({
                    department: 'all',
                    group: 'all',
                    status: 'visitor',
                    displayMode: 'table',
                  })
                }
                className="bg-white dark:bg-[#1D1D3D] rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] hover:border-emerald-500/60 p-3 text-left transition-colors group cursor-pointer flex flex-col justify-between min-w-0"
              >
                <div className="flex items-center justify-between gap-1.5 w-full">
                  <span className="text-[11px] font-semibold text-[#666A86] dark:text-[#A9ACC8] truncate">
                    Visitors
                  </span>
                  <UserPlus className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                </div>
                <span className="font-mono text-xl sm:text-2xl font-bold text-emerald-600 dark:text-emerald-400 my-1 leading-none">
                  {visitorsCount}
                </span>
                <span className="text-[10px] text-[#666A86] dark:text-[#A9ACC8] truncate">
                  {serviceVisitorsCount} checked in today
                </span>
              </button>

              <button
                type="button"
                onClick={() =>
                  openFilteredDirectory({
                    department: 'all',
                    group: 'all',
                    status: 'officers',
                    displayMode: 'table',
                  })
                }
                className="bg-white dark:bg-[#1D1D3D] rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] hover:border-[#6D5CF2]/60 p-3 text-left transition-colors group cursor-pointer flex flex-col justify-between min-w-0"
              >
                <div className="flex items-center justify-between gap-1.5 w-full">
                  <span className="text-[11px] font-semibold text-[#666A86] dark:text-[#A9ACC8] truncate">
                    Officers
                  </span>
                  <ShieldCheck className="w-3.5 h-3.5 text-[#6D5CF2] shrink-0" />
                </div>
                <span className="font-mono text-xl sm:text-2xl font-bold text-[#1D1B3A] dark:text-[#F2F2FA] my-1 leading-none">
                  {dashboardAnalytics.membership.officersCount}
                </span>
                <span className="text-[10px] text-[#666A86] dark:text-[#A9ACC8] truncate">
                  {dashboardAnalytics.leadership.distinctLeadersCount} cell/min leads
                </span>
              </button>

              <button
                type="button"
                onClick={() => jumpToAnalyticsLens('departments')}
                className="bg-white dark:bg-[#1D1D3D] rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] hover:border-[#6D5CF2]/60 p-3 text-left transition-colors group cursor-pointer flex flex-col justify-between min-w-0"
              >
                <div className="flex items-center justify-between gap-1.5 w-full">
                  <span className="text-[11px] font-semibold text-[#666A86] dark:text-[#A9ACC8] truncate">
                    Departments
                  </span>
                  <Building2 className="w-3.5 h-3.5 text-[#6D5CF2] shrink-0" />
                </div>
                <span className="font-mono text-xl sm:text-2xl font-bold text-[#1D1B3A] dark:text-[#F2F2FA] my-1 leading-none">
                  {dashboardAnalytics.namedDepartmentsCount}
                </span>
                <span className="text-[10px] text-[#666A86] dark:text-[#A9ACC8] truncate">
                  {dashboardAnalytics.topDepartment
                    ? `${dashboardAnalytics.topDepartment.name} (${dashboardAnalytics.topDepartment.totalMembers})`
                    : 'No departments'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => jumpToAnalyticsLens('ministries')}
                className="bg-white dark:bg-[#1D1D3D] rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] hover:border-[#6D5CF2]/60 p-3 text-left transition-colors group cursor-pointer flex flex-col justify-between min-w-0"
              >
                <div className="flex items-center justify-between gap-1.5 w-full">
                  <span className="text-[11px] font-semibold text-[#666A86] dark:text-[#A9ACC8] truncate">
                    Groups &amp; Cells
                  </span>
                  <HeartHandshake className="w-3.5 h-3.5 text-[#6D5CF2] shrink-0" />
                </div>
                <span className="font-mono text-xl sm:text-2xl font-bold text-[#1D1B3A] dark:text-[#F2F2FA] my-1 leading-none">
                  {dashboardAnalytics.groupCounts.total}
                </span>
                <span className="text-[10px] text-[#666A86] dark:text-[#A9ACC8] truncate">
                  {dashboardAnalytics.leadership.leadershipCoveragePct}% covered ·{' '}
                  {dashboardAnalytics.groupCounts.cellGroups} cells
                </span>
              </button>

              <button
                type="button"
                onClick={() => setIsFollowupModalOpen(true)}
                className="bg-white dark:bg-[#1D1D3D] rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] hover:border-amber-500/60 p-3 text-left transition-colors group cursor-pointer flex flex-col justify-between min-w-0"
              >
                <div className="flex items-center justify-between gap-1.5 w-full">
                  <span className="text-[11px] font-semibold text-[#666A86] dark:text-[#A9ACC8] truncate">
                    Care Queue
                  </span>
                  <CheckSquare className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                </div>
                <span className="font-mono text-xl sm:text-2xl font-bold text-[#1D1B3A] dark:text-[#F2F2FA] my-1 leading-none">
                  {openFollowupCount}
                </span>
                <span className="text-[10px] text-[#666A86] dark:text-[#A9ACC8] truncate">
                  {dashboardAnalytics.activeService.atRiskCount} repeat absentees
                </span>
              </button>

              <button
                type="button"
                onClick={() => jumpToAnalyticsLens('demographics')}
                className="bg-white dark:bg-[#1D1D3D] rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] hover:border-emerald-500/60 p-3 text-left transition-colors group cursor-pointer flex flex-col justify-between min-w-0"
              >
                <div className="flex items-center justify-between gap-1.5 w-full">
                  <span className="text-[11px] font-semibold text-[#666A86] dark:text-[#A9ACC8] truncate">
                    Stewardship
                  </span>
                  <Wallet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                </div>
                <span className="font-mono text-lg sm:text-xl font-bold text-[#1D1B3A] dark:text-[#F2F2FA] my-1 leading-none truncate">
                  {dashboardAnalytics.giving.totalPaidGhs > 0
                    ? `GHS ${dashboardAnalytics.giving.totalPaidGhs.toLocaleString()}`
                    : 'GHS 0'}
                </span>
                <span className="text-[10px] text-[#666A86] dark:text-[#A9ACC8] truncate">
                  {dashboardAnalytics.giving.donationsCount} paid ·{' '}
                  {dashboardAnalytics.giving.topFundName || 'No fund activity'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => navigateTab('settings')}
                className="bg-white dark:bg-[#1D1D3D] rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] hover:border-[#6D5CF2]/60 p-3 text-left transition-colors group cursor-pointer flex flex-col justify-between min-w-0"
              >
                <div className="flex items-center justify-between gap-1.5 w-full">
                  <span className="text-[11px] font-semibold text-[#666A86] dark:text-[#A9ACC8] truncate">
                    Gateways &amp; GPS
                  </span>
                  <Activity className="w-3.5 h-3.5 text-[#6D5CF2] shrink-0" />
                </div>
                <span className="font-mono text-lg sm:text-xl font-bold text-[#1D1B3A] dark:text-[#F2F2FA] my-1 leading-none">
                  {isPremiseConfigured ? 'GPS Live' : 'GPS Unset'}
                </span>
                <span className="text-[10px] text-[#666A86] dark:text-[#A9ACC8] truncate">
                  SMS {communicationStatus.arkeselConfigured ? 'On' : 'Off'} · Email{' '}
                  {communicationStatus.resendConfigured ? 'On' : 'Off'}
                </span>
              </button>
            </section>

            {/* 3. QUICK OPERATIONS ACTION BAR & OVERVIEW SECTION FILTER */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2 my-2.5 px-0.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setEditingMember(null);
                    setIsAddMemberOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 bg-[#6D5CF2] hover:bg-[#5B4BE0] text-white rounded-xl px-3 py-1.5 text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Add Member</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsImportModalOpen(true)}
                  className="inline-flex items-center gap-1.5 bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] hover:border-[#6D5CF2]/50 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 text-[#6D5CF2]" />
                  <span>Import</span>
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
                  className="inline-flex items-center gap-1.5 bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] hover:border-[#6D5CF2]/50 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums"
                >
                  <Camera className="w-3.5 h-3.5 text-[#6D5CF2]" />
                  <span>Photos ({uploadedPhotoMembers.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSectionFilter('analytics');
                    setTimeout(() => {
                      document
                        .getElementById('visitor-trends-analysis')
                        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 50);
                  }}
                  className="inline-flex items-center gap-1.5 bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] hover:border-emerald-500/60 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums"
                >
                  <UserPlus className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Visitor Trends ({visitorsCount})</span>
                </button>
                <button
                  type="button"
                  disabled={isAutoAssigningAbsentees}
                  onClick={() => autoAssignAbsentees({ silent: false })}
                  className="inline-flex items-center gap-1.5 bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] hover:border-[#6D5CF2]/50 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                >
                  <UserCheck className="w-3.5 h-3.5 text-[#6D5CF2]" />
                  <span>Auto-Assign Care</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsMessageModalOpen(true)}
                  className="inline-flex items-center gap-1.5 bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] hover:border-[#6D5CF2]/50 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <MessageCircle className="w-3.5 h-3.5 text-[#6D5CF2]" />
                  <span>Broadcast</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigateTab('proximity')}
                  className="inline-flex items-center gap-1.5 bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] hover:border-[#6D5CF2]/50 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
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

            {/* 4. COMPACT UPLOADED PORTRAITS STRIP */}
            <section
              aria-label="Uploaded Member Photos"
              className="bg-white dark:bg-[#1D1D3D] rounded-2xl border border-[#E9EBF5] dark:border-[#2D2D55] p-3.5 shadow-xs my-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                <div className="flex items-center gap-2">
                  <Camera className="w-4 h-4 text-[#6D5CF2] shrink-0" />
                  <h2 className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                    Congregation Portraits
                  </h2>
                  <span className="text-xs font-mono font-semibold text-[#666A86] dark:text-[#A9ACC8] tabular-nums">
                    ({uploadedPhotoMembers.length}/{members.length})
                  </span>
                </div>

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
                  <span>Full Photo Directory</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {uploadedPhotoMembers.length === 0 ? (
                <div className="py-3.5 px-4 rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-dashed border-[#E9EBF5] dark:border-[#2D2D55] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="text-xs text-[#666A86] dark:text-[#A9ACC8]">
                    <span className="font-semibold text-[#1D1B3A] dark:text-[#F2F2FA] block">
                      No uploaded member photos yet
                    </span>
                    Upload photos when adding or editing a member and they appear here automatically.
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingMember(members[0] || null);
                      setIsAddMemberOpen(true);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#9D90FF] text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {members.length > 0 ? 'Upload Photo' : 'Add Member'}
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
                  {shuffledPhotoMembers.slice(0, 10).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setPhotoPreviewMember(m)}
                      className="group text-left p-1.5 rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] hover:border-[#6D5CF2]/60 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center justify-center mb-1">
                        <MemberAvatar
                          src={m.imageUrl}
                          name={`${m.firstName} ${m.lastName}`}
                          initials={m.avatarInitials}
                          sizeClass="w-10 h-10"
                          textClass="text-xs font-bold"
                        />
                      </div>
                      <span className="block text-[11px] font-semibold text-[#1D1B3A] dark:text-[#F2F2FA] truncate text-center">
                        {m.firstName}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {/* 5. DENSE EXECUTIVE ANALYTICS COCKPIT + TREND CHARTS */}
            {(sectionFilter === 'all' || sectionFilter === 'analytics') && (
              <div className="space-y-3 my-3">
                {/* 12-Col Analytics Split: 30-Day Trend + Executive Departments / Channel Mix / Completeness */}
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-3 items-stretch">
                  <div className="xl:col-span-6 flex flex-col [&>section]:flex-1">
                    <WeeklyAttendanceTrendChart
                      onOpenInsights={() => {
                        setInsightsInitialTab('checked_in');
                        navigateTab('insights');
                      }}
                      onQuickCheckin={handleQuickArrivalCheckin}
                    />
                  </div>

                  {/* Executive Departments, Arrival Channels & Directory Health Panel */}
                  <section
                    aria-label="Department Leaderboard, Arrival Channels, and Data Health"
                    className="xl:col-span-6 bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-xs border border-[#E9EBF5] dark:border-[#2D2D55] flex flex-col justify-between gap-4 tabular-nums"
                  >
                    {/* Department Turnout Leaderboard */}
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2.5">
                        <div>
                          <h2 className="text-sm sm:text-base font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                            Department Turnout Leaderboard
                          </h2>
                          <p className="text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
                            Live presence across ministries · Click any row to inspect roster
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => jumpToAnalyticsLens('departments')}
                          className="text-xs font-semibold text-[#6D5CF2] dark:text-[#9D90FF] hover:underline whitespace-nowrap cursor-pointer"
                        >
                          All ({dashboardAnalytics.departments.length})
                        </button>
                      </div>

                      {dashboardAnalytics.departments.length === 0 ? (
                        <div className="py-4 px-3 rounded-xl border border-dashed border-[#E9EBF5] dark:border-[#2D2D55] text-xs text-[#666A86] dark:text-[#A9ACC8] text-center">
                          Assign members to church departments to track live ministry turnout.
                        </div>
                      ) : (
                        <div className="divide-y divide-[#E9EBF5] dark:divide-[#2D2D55] border-y border-[#E9EBF5] dark:border-[#2D2D55]">
                          {dashboardAnalytics.departments.slice(0, 4).map((dept) => (
                            <button
                              key={dept.name}
                              type="button"
                              onClick={() =>
                                openFilteredDirectory({
                                  department: dept.name,
                                  group: 'all',
                                  displayMode: 'table',
                                })
                              }
                              className="w-full py-2 px-1 flex items-center justify-between gap-3 text-left hover:bg-[#F6F7FC] dark:hover:bg-white/[0.03] transition-colors cursor-pointer"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2 text-xs">
                                  <span className="font-bold text-[#1D1B3A] dark:text-[#F2F2FA] truncate">
                                    {dept.name}
                                  </span>
                                  <span className="font-mono text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
                                    {dept.presentCount}/{dept.totalMembers} ({dept.turnoutPct}%)
                                  </span>
                                </div>
                                <div className="mt-1 h-1.5 w-full rounded-full bg-[#EFEDFF] dark:bg-[#2A2A55] overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-[#6D5CF2]"
                                    style={{ width: `${dept.turnoutPct}%` }}
                                  />
                                </div>
                              </div>
                              <ArrowUpRight className="w-3.5 h-3.5 text-[#666A86] shrink-0" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* 2-Col Lower Sub-Grid: Arrival Channels + Directory Completeness */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-[#E9EBF5] dark:border-[#2D2D55]">
                      <div>
                        <div className="flex items-center justify-between text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-2">
                          <span>Active Channel Mix</span>
                          <span className="font-mono text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
                            {liveInsightsPreview.attendanceCount} total
                          </span>
                        </div>
                        {dashboardAnalytics.activeService.channels.length === 0 ? (
                          <p className="text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
                            Check-ins across Geofence, Beacon, QR, and Usher Desk appear here.
                          </p>
                        ) : (
                          <div className="space-y-1.5">
                            {dashboardAnalytics.activeService.channels.slice(0, 4).map((ch) => (
                              <div key={ch.method} className="text-[11px]">
                                <div className="flex items-center justify-between mb-0.5">
                                  <span className="text-[#1D1B3A] dark:text-[#F2F2FA] font-medium">
                                    {ch.label}
                                  </span>
                                  <span className="font-mono font-semibold text-[#666A86] dark:text-[#A9ACC8]">
                                    {ch.count} ({ch.pct}%)
                                  </span>
                                </div>
                                <div className="h-1.5 w-full rounded-full bg-[#F6F7FC] dark:bg-[#14142E] overflow-hidden">
                                  <div
                                    className="h-full rounded-full"
                                    style={{ width: `${ch.pct}%`, backgroundColor: ch.color }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div>
                        <div className="flex items-center justify-between text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-2">
                          <span>Directory Completeness</span>
                          <span className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400">
                            {dashboardAnalytics.membership.birthdaysThisMonthCount} b&apos;days mo.
                          </span>
                        </div>
                        <div className="space-y-1.5 text-[11px]">
                          {[
                            {
                              label: 'Phone E.164',
                              pct: dashboardAnalytics.membership.completeness.phonePct,
                              color: '#4FBF98',
                            },
                            {
                              label: 'Email Contact',
                              pct: dashboardAnalytics.membership.completeness.emailPct,
                              color: '#6D5CF2',
                            },
                            {
                              label: 'Digital Address',
                              pct: dashboardAnalytics.membership.completeness.digitalAddressPct,
                              color: '#59C3C3',
                            },
                            {
                              label: 'Profile Photo',
                              pct: dashboardAnalytics.membership.completeness.photoPct,
                              color: '#F59E0B',
                            },
                          ].map((metric) => (
                            <div key={metric.label}>
                              <div className="flex items-center justify-between mb-0.5">
                                <span className="text-[#1D1B3A] dark:text-[#F2F2FA] font-medium">
                                  {metric.label}
                                </span>
                                <span className="font-mono font-semibold text-[#666A86] dark:text-[#A9ACC8]">
                                  {metric.pct}%
                                </span>
                              </div>
                              <div className="h-1.5 w-full rounded-full bg-[#F6F7FC] dark:bg-[#14142E] overflow-hidden">
                                <div
                                  className="h-full rounded-full"
                                  style={{ width: `${metric.pct}%`, backgroundColor: metric.color }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </section>
                </div>

                {/* 12-Col Analytics Split: Visitor Trends & Retention + Member Attendance Frequency */}
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-3 items-stretch">
                  <div className="xl:col-span-7 flex flex-col [&>section]:flex-1">
                    <VisitorTrendsAnalysis
                      onOpenVisitorDirectory={() =>
                        openFilteredDirectory({
                          department: 'all',
                          group: 'all',
                          status: 'visitor',
                          displayMode: 'table',
                        })
                      }
                    />
                  </div>

                  <div className="xl:col-span-5 flex flex-col [&>section]:flex-1">
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
                </div>

                <div ref={analyticsSectionRef}>
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
                    onInspectBirthMonthGroup={(birthMonthGroup) =>
                      openFilteredDirectory({
                        birthMonthGroup,
                        department: 'all',
                        group: 'all',
                        displayMode: 'table',
                      })
                    }
                    onSelectService={handleSelectServiceFromChild}
                    onOpenSettings={(groupIntent) => requestOpenSettings('groups', groupIntent)}
                    externalFilterQuery={externalAnalyticsQuery}
                    externalCategoryFilter={externalAnalyticsCategory}
                    externalFilterNonce={externalAnalyticsNonce}
                    customGroupCategories={systemSettings.customGroupCategories}
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
                    onOpenServiceQr={(svcId) => {
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
                      setQrServiceTarget({
                        id: target.id,
                        name: target.name,
                        date: target.date,
                        startsAt: target.startsAt,
                        endsAt: target.endsAt,
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
              </div>
            )}

            {/* 6. DENSE 12-COLUMN PASTORAL CARE & OPERATIONS COMMAND GRID */}
            {(sectionFilter === 'all' || sectionFilter === 'operations') && (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-3">
                {/* Pastoral Care Queue (up to 4 stacked items) */}
                <section className="md:col-span-1 xl:col-span-4 bg-white dark:bg-[#1D1D3D] rounded-2xl p-4 shadow-xs border border-[#E9EBF5] dark:border-[#2D2D55] flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div>
                        <h2 className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                          Pastoral Care Queue ({openFollowupCount})
                        </h2>
                        <p className="text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
                          Active absentee &amp; first-timer assignments
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          disabled={isAutoAssigningAbsentees}
                          onClick={() => autoAssignAbsentees({ silent: false })}
                          className="text-[11px] font-bold text-[#6D5CF2] dark:text-[#8C7DFF] hover:underline flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        >
                          {isAutoAssigningAbsentees ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <UserCheck className="w-3 h-3" />
                          )}
                          <span>Auto</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsFollowupModalOpen(true)}
                          className="text-[11px] font-semibold text-[#666A86] dark:text-[#A9ACC8] hover:text-[#6D5CF2] cursor-pointer"
                        >
                          All
                        </button>
                      </div>
                    </div>

                    {openCareQueueList.length === 0 ? (
                      <div className="text-center py-8 px-3 text-xs text-[#666A86] dark:text-[#A9ACC8] bg-[#F6F7FC] dark:bg-[#14142E] rounded-xl border border-dashed border-[#E9EBF5] dark:border-[#2D2D55]">
                        <CheckSquare className="w-5 h-5 text-[#6D5CF2] mx-auto mb-1.5 opacity-80" />
                        <p className="font-semibold text-[#1D1B3A] dark:text-[#F2F2FA]">
                          No open care assignments
                        </p>
                        <p className="text-[11px] mt-0.5">
                          Visitor welcomes &amp; absence escalations queue here automatically.
                        </p>
                      </div>
                    ) : (
                      <div className="divide-y divide-[#E9EBF5] dark:divide-[#2D2D55] border-y border-[#E9EBF5] dark:border-[#2D2D55]">
                        {openCareQueueList.slice(0, 4).map((task) => {
                          const linkedMember = members.find((m) => m.id === task.personId);
                          return (
                            <div
                              key={task.id}
                              className="py-2.5 flex items-center justify-between gap-2.5"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 text-xs">
                                  <span className="font-bold text-[#1D1B3A] dark:text-[#F2F2FA] truncate">
                                    {task.personName}
                                  </span>
                                  <span className="text-[10px] font-semibold text-[#6D5CF2] dark:text-[#8C7DFF] shrink-0">
                                    ·{' '}
                                    {task.reason === 'first_timer'
                                      ? 'Visitor'
                                      : task.reason === 'absent_3'
                                      ? '3+ Wks'
                                      : task.reason === 'absent_2'
                                      ? '2 Wks'
                                      : 'Care'}
                                  </span>
                                </div>
                                <div className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] truncate">
                                  To: {task.assignedToName}
                                  {task.assignedToRole ? ` (${task.assignedToRole})` : ''}
                                </div>
                              </div>

                              <ContactCallButton
                                compact
                                contactName={task.personName}
                                contactPhone={
                                  task.personPhone ||
                                  linkedMember?.phoneE164 ||
                                  linkedMember?.phoneNumber
                                }
                                contactEmail={task.personEmail || linkedMember?.email}
                                contactGroup={task.groupName}
                                onLogOutcome={async (outcome, markResolved) => {
                                  await resolveFollowupTask(
                                    task.id,
                                    outcome,
                                    markResolved ? 'resolved' : 'contacted'
                                  );
                                }}
                              />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsNewAssignmentOpen(true)}
                    className="mt-3 w-full border border-dashed border-[#CBC6F7] dark:border-[#3B3B72] rounded-xl py-2 text-xs font-bold text-[#6D5CF2] dark:text-[#8C7DFF] flex items-center justify-center gap-1.5 hover:bg-[#EFEDFF]/40 dark:hover:bg-[#2A2A55]/20 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Care Assignment</span>
                  </button>
                </section>

                {/* Repeat Absentee Watchlist + Live Audit Activity */}
                <section
                  id="notifications-card"
                  className="md:col-span-1 xl:col-span-3 bg-white dark:bg-[#1D1D3D] rounded-2xl p-4 shadow-xs border border-[#E9EBF5] dark:border-[#2D2D55] flex flex-col justify-between gap-4"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <h2 className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                        Absentee Watchlist
                      </h2>
                      <button
                        type="button"
                        onClick={() => {
                          setInsightsInitialTab('at_risk');
                          navigateTab('insights');
                        }}
                        className="text-[11px] font-semibold text-[#6D5CF2] dark:text-[#9D90FF] hover:underline cursor-pointer"
                      >
                        Insights
                      </button>
                    </div>

                    {repeatAbsenteeWatchlist.length === 0 ? (
                      <div className="py-3 px-3 rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
                        No unarrived members at threshold ({systemSettings.absenteeThresholdServices}+ missed).
                      </div>
                    ) : (
                      <div className="divide-y divide-[#E9EBF5] dark:divide-[#2D2D55] tabular-nums">
                        {repeatAbsenteeWatchlist.map((m) => (
                          <div
                            key={m.id}
                            className="py-2 flex items-center justify-between gap-2 text-xs"
                          >
                            <div className="min-w-0">
                              <span className="font-semibold text-[#1D1B3A] dark:text-[#F2F2FA] truncate block">
                                {m.firstName} {m.lastName}
                              </span>
                              <span className="text-[10px] text-rose-600 dark:text-rose-400 font-semibold">
                                {m.consecutiveAbsences} missed · {m.groupName || 'General'}
                              </span>
                            </div>
                            <ContactCallButton
                              compact
                              contactName={`${m.firstName} ${m.lastName}`.trim()}
                              contactPhone={m.phoneE164 || m.phoneNumber}
                              contactEmail={m.email}
                              contactGroup={m.groupName}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="pt-3 border-t border-[#E9EBF5] dark:border-[#2D2D55]">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-[#666A86] dark:text-[#A9ACC8]">
                        Activity Log
                      </h3>
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
                          className="text-[11px] font-semibold text-[#666A86] dark:text-[#A9ACC8] hover:text-[#EF5A6F] flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                          {notificationsCleared ? 'Restore' : 'Clear'}
                        </button>
                      )}
                    </div>

                    {!notificationsCleared && auditLogs.length > 0 ? (
                      <div className="space-y-2">
                        {auditLogs.slice(0, 3).map((log) => (
                          <div
                            key={log.id}
                            className="bg-[#F6F7FC] dark:bg-[#14142E] rounded-xl px-2.5 py-2 border border-[#E9EBF5] dark:border-[#2D2D55]"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-bold text-[#1D1B3A] dark:text-[#F2F2FA] truncate">
                                {log.action}
                              </span>
                              <span className="text-[10px] font-mono text-[#666A86] dark:text-[#A9ACC8] tabular-nums shrink-0">
                                {log.timestamp}
                              </span>
                            </div>
                            <div className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] truncate">
                              {log.details}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-4 px-2 text-[11px] text-[#666A86] dark:text-[#A9ACC8] bg-[#F6F7FC] dark:bg-[#14142E] rounded-xl border border-dashed border-[#E9EBF5] dark:border-[#2D2D55]">
                        <Bell className="w-4 h-4 text-[#6D5CF2] mx-auto mb-1 opacity-80" />
                        No live activity events yet.
                      </div>
                    )}
                  </div>
                </section>

                {/* Service Calendar & Schedule Card (3 cols) */}
                <section className="md:col-span-1 xl:col-span-3 bg-white dark:bg-[#1D1D3D] rounded-2xl p-4 shadow-xs border border-[#E9EBF5] dark:border-[#2D2D55] flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2.5">
                      <h2 className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                        {weekRangeLabel}
                      </h2>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setIsAddServiceOpen(true)}
                          className="px-2 py-1 rounded-lg bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] text-[11px] font-bold hover:opacity-90 flex items-center gap-1 cursor-pointer mr-1"
                        >
                          <Plus className="w-3 h-3" />
                          New
                        </button>
                        <button
                          type="button"
                          onClick={() => setWeekOffset((w) => w - 1)}
                          className="p-1 rounded-lg text-[#666A86] hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer"
                          aria-label="Previous week"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setWeekOffset((w) => w + 1)}
                          className="p-1 rounded-lg text-[#666A86] hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer"
                          aria-label="Next week"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-7 gap-1 text-center mb-3">
                      {weekDays.map((d) => {
                        const hasServiceOnDay = serviceDatesSet.has(d.iso);
                        const isSelected = selectedDateIso === d.iso;
                        return (
                          <button
                            key={d.iso}
                            type="button"
                            onClick={() => setSelectedDateIso(d.iso)}
                            className={`flex flex-col items-center py-1 rounded-xl transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-[#6D5CF2] text-white font-bold'
                                : 'text-[#666A86] dark:text-[#A9ACC8] hover:bg-slate-100 dark:hover:bg-white/5'
                            }`}
                          >
                            <span className="text-[9px] uppercase font-semibold">{d.name}</span>
                            <b className="text-xs tabular-nums">{d.date}</b>
                            <span
                              className={`w-1 h-1 rounded-full mt-0.5 ${
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

                    <div className="space-y-1.5 max-h-[190px] overflow-y-auto pr-0.5">
                      {services.length === 0 ? (
                        <div className="bg-[#F6F7FC] dark:bg-[#14142E] rounded-xl p-3 border border-dashed border-[#E9EBF5] dark:border-[#2D2D55] text-center text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
                          No worship services scheduled yet.
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
                              className={`w-full bg-[#F6F7FC] dark:bg-[#14142E] rounded-xl p-2 flex items-center gap-2 border transition-colors ${
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
                                className="flex-1 min-w-0 text-left cursor-pointer"
                              >
                                <div className="flex items-center gap-1.5">
                                  <b className="text-[11px] font-bold text-[#1D1B3A] dark:text-[#F2F2FA] truncate">
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
                                <span className="text-[10px] text-[#666A86] dark:text-[#A9ACC8] block truncate tabular-nums">
                                  {svc.date ? `${formatServiceDate(svc.date)} · ` : ''}
                                  {svc.startsAt}–{svc.endsAt}
                                </span>
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setQrServiceTarget({
                                    id: svc.id,
                                    name: svc.name,
                                    date: svc.date,
                                    startsAt: svc.startsAt,
                                    endsAt: svc.endsAt,
                                    dwellMinutes: allowance,
                                    status: svcBinaryStatus,
                                  })
                                }
                                className="p-1 rounded-lg text-slate-400 hover:text-[#6D5CF2] cursor-pointer"
                                title="Show Service Check-In QR"
                                aria-label={`Show check-in QR for ${svc.name}`}
                              >
                                <QrCode className="w-3 h-3" />
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
                                className="p-1 rounded-lg text-slate-400 hover:text-[#6D5CF2] cursor-pointer"
                                title="Edit window and allowance"
                                aria-label={`Edit ${svc.name}`}
                              >
                                <Edit3 className="w-3 h-3" />
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
                                  className="px-1.5 py-0.5 rounded bg-rose-600 text-white text-[10px] font-bold cursor-pointer"
                                >
                                  Confirm
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteCalendarSvcId(svc.id)}
                                  className="p-1 rounded-lg text-slate-400 hover:text-rose-500 cursor-pointer"
                                  title="Delete service"
                                  aria-label={`Delete ${svc.name}`}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  <div className="pt-2.5 mt-2.5 border-t border-[#E9EBF5] dark:border-[#2D2D55] text-xs flex justify-between items-center gap-2">
                    <button
                      type="button"
                      onClick={() => navigateTab('history')}
                      className="font-bold text-[#6D5CF2] dark:text-[#9D90FF] hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <History className="w-3.5 h-3.5" />
                      <span>History Archive ({services.length})</span>
                    </button>
                  </div>
                </section>

                {/* Comms Gateways, Auto Check-In & Premise Telemetry (2 cols) */}
                <section className="md:col-span-1 xl:col-span-2 bg-white dark:bg-[#1D1D3D] rounded-2xl p-4 shadow-xs border border-[#E9EBF5] dark:border-[#2D2D55] flex flex-col justify-between gap-3 tabular-nums">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h2 className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                        Gateways &amp; GPS
                      </h2>
                      <button
                        type="button"
                        onClick={() => navigateTab('settings')}
                        className="text-[11px] font-semibold text-[#6D5CF2] dark:text-[#9D90FF] hover:underline cursor-pointer"
                      >
                        Settings
                      </button>
                    </div>

                    <div className="space-y-2 text-[11px]">
                      <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-[#F6F7FC] dark:bg-[#14142E]">
                        <span className="inline-flex items-center gap-1.5 font-semibold text-[#1D1B3A] dark:text-[#F2F2FA]">
                          <Smartphone className="w-3.5 h-3.5 text-[#6D5CF2]" />
                          Arkesel SMS
                        </span>
                        <span
                          className={`font-bold ${
                            communicationStatus.arkeselConfigured
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          {communicationStatus.arkeselConfigured ? 'Ready' : 'Env Unset'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-[#F6F7FC] dark:bg-[#14142E]">
                        <span className="inline-flex items-center gap-1.5 font-semibold text-[#1D1B3A] dark:text-[#F2F2FA]">
                          <Mail className="w-3.5 h-3.5 text-[#6D5CF2]" />
                          Resend Email
                        </span>
                        <span
                          className={`font-bold ${
                            communicationStatus.resendConfigured
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          {communicationStatus.resendConfigured ? 'Ready' : 'Env Unset'}
                        </span>
                      </div>

                      <div className="p-2 rounded-xl bg-[#F6F7FC] dark:bg-[#14142E]">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-[#1D1B3A] dark:text-[#F2F2FA]">
                            Auto Check-In Opt-In
                          </span>
                          <span className="font-mono font-bold text-[#6D5CF2] dark:text-[#8C7DFF]">
                            {optInPercentage}%
                          </span>
                        </div>
                        <div className="text-[10px] text-[#666A86] dark:text-[#A9ACC8] mt-0.5">
                          {autoCheckinOptedInCount} auto · {manualCheckinCount} manual
                        </div>
                      </div>

                      <div className="p-2 rounded-xl bg-[#F6F7FC] dark:bg-[#14142E]">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-[#1D1B3A] dark:text-[#F2F2FA] truncate">
                            {systemSettings.campusName || 'Premise'}
                          </span>
                          <span
                            className={`font-bold ${
                              isPremiseConfigured
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-amber-600 dark:text-amber-400'
                            }`}
                          >
                            {isPremiseConfigured ? 'Pinned' : 'Unset'}
                          </span>
                        </div>
                        <div className="text-[10px] font-mono text-[#666A86] dark:text-[#A9ACC8] mt-0.5 truncate">
                          {isPremiseConfigured
                            ? `${systemSettings.campusLatitude?.toFixed(4)}, ${systemSettings.campusLongitude?.toFixed(4)} (${systemSettings.innerGeofenceMeters}m)`
                            : `Radius ${systemSettings.innerGeofenceMeters}m · ${systemSettings.dwellTimeMinutes}m dwell`}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setIsMessageModalOpen(true)}
                      className="bg-[#6D5CF2] hover:bg-[#5B4BE0] text-white rounded-xl py-1.5 text-[11px] font-bold transition-colors cursor-pointer"
                    >
                      Broadcast
                    </button>
                    <button
                      type="button"
                      onClick={() => navigateTab('proximity')}
                      className="bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] rounded-xl py-1.5 text-[11px] font-bold hover:opacity-90 transition-opacity cursor-pointer"
                    >
                      Live Radar
                    </button>
                  </div>
                </section>
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
              initialBirthMonthGroupFilter={directoryBirthMonthFilter}
              initialStatusFilter={directoryStatusFilter}
              initialDisplayMode={directoryDisplayMode}
            />
          </div>
        )}

        {/* Users & Member Credentials Tab */}
        {activeTab === 'users' && (
          <div className="mt-4">
            <UserManagement />
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
        onOpenServiceQr={setQrServiceTarget}
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
        onOpenServiceQr={setQrServiceTarget}
        onNotify={showToast}
        formatDateLabel={formatServiceDate}
      />

      <ServiceQrModal
        isOpen={Boolean(qrServiceTarget)}
        service={qrServiceTarget}
        onClose={() => setQrServiceTarget(null)}
      />

      <MemberQrScannerModal
        isOpen={isAdminQrScannerOpen}
        onClose={() => setIsAdminQrScannerOpen(false)}
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
        emailFromAddress={systemSettings.emailFromAddress}
        emailSenderName={systemSettings.emailSenderName}
        enablePushNotifications={systemSettings.enablePushNotifications}
        communicationStatus={communicationStatus}
        onSendBroadcast={sendCommunicationBroadcast}
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
        isAutoAssigning={isAutoAssigningAbsentees}
        onAutoAssignAbsentees={() => autoAssignAbsentees({ silent: false })}
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
