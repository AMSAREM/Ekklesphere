import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  History,
  Calendar,
  Download,
  RefreshCw,
  Search,
  CheckCircle2,
  Clock,
  Plus,
  Users,
  ArrowUpRight,
  X,
  Edit3,
  Trash2,
  Power,
  UserPlus,
  UserMinus,
  ClipboardList,
  QrCode,
} from 'lucide-react';
import { useEkklesphere } from '../../context/EkklesphereContext';
import { MemberAvatar } from '../common/MemberAvatar';
import {
  BinaryServiceStatus,
  computeServiceBinaryStatus,
  evaluateServiceCheckInEligibility,
  formatAllowanceDeadline,
} from '../../utils/serviceStatus';
import { EditableServiceTarget, EditServiceModal } from './AdminDashboardModals';
import { ServiceQrModal, ServiceQrTarget } from './ServiceQrModal';

export interface ServiceHistoryAttendee {
  id: string;
  personId: string;
  name: string;
  imageUrl?: string;
  initials: string;
  groupName: string;
  department: string;
  status: string;
  method: string;
  checkedInAt: string;
  checkedInIso: string;
  late: boolean;
  confidence: number;
  distanceM: number | null;
}

export interface ServiceHistoryEntry {
  id: string;
  name: string;
  date: string;
  startsAt: string;
  endsAt: string;
  startTimeIso?: string;
  endTimeIso?: string;
  allowanceMinutes?: number;
  closesAtIso?: string | null;
  status: BinaryServiceStatus;
  rawStatus: string;
  expectedAttendance: number;
  totalCheckedIn: number;
  fillRatePct: number;
  onTimeCount: number;
  lateCount: number;
  onTimePct: number;
  autoProximityCount: number;
  assistedDoorCount: number;
  autoPct: number;
  avgConfidence: number;
  methodBreakdown: Record<string, number>;
  attendees: ServiceHistoryAttendee[];
}

export interface ServiceHistoryResponse {
  summary: {
    totalServices: number;
    liveServices: number;
    closedServices?: number;
    completedServices?: number;
    upcomingServices?: number;
    totalHistoricalCheckins: number;
    uniqueAttendees: number;
    averageAttendancePerService: number;
    peakServiceId: string | null;
    peakServiceName: string | null;
    peakServiceCount: number;
  };
  services: ServiceHistoryEntry[];
  timestamp?: string;
}

interface ServiceHistoryPanelProps {
  onSelectActiveService: (serviceId: string) => void;
  onAddService: () => void;
  onOpenInsights?: () => void;
}

const METHOD_LABELS: Record<string, string> = {
  geofence: 'Auto Geofence',
  beacon: 'BLE Beacon',
  usher: 'Usher Desk',
  posted_qr: 'Posted QR',
  manual: 'Manual',
  email_link: 'Email / Web Link',
};

const BINARY_STATUS_DISPLAY: Record<
  BinaryServiceStatus,
  { label: string; textClass: string; dotClass: string }
> = {
  live: {
    label: 'Live',
    textClass: 'text-emerald-600 dark:text-emerald-400',
    dotClass: 'bg-emerald-500',
  },
  closed: {
    label: 'Closed',
    textClass: 'text-[#666A86] dark:text-[#A9ACC8]',
    dotClass: 'bg-slate-400 dark:bg-slate-500',
  },
};

function formatDateReadable(iso: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || '—';
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return iso;
  return dt.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateInputLabel(isoDate?: string, includeYear: boolean = false): string {
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

export const ServiceHistoryPanel: React.FC<ServiceHistoryPanelProps> = ({
  onSelectActiveService,
  onAddService,
  onOpenInsights,
}) => {
  const {
    currentUser,
    isSessionVerified,
    handleUnauthorizedSession,
    services,
    attendanceRecords,
    members,
    activeServiceId,
    systemSettings,
    showToast,
    updateService,
    deleteService,
    checkInPersonAsync,
    removeCheckIn,
  } = useEkklesphere();

  const [historyData, setHistoryData] = useState<ServiceHistoryResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [statusFilter, setStatusFilter] = useState<'all' | BinaryServiceStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [attendeeSearch, setAttendeeSearch] = useState('');

  // Periodic clock tick (every 30s) so services automatically flip Live <-> Closed
  // as current time enters or exits [startsAt, endsAt + allowanceMinutes].
  const [tickNowMs, setTickNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => {
      setTickNowMs(Date.now());
    }, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  // Action controls state
  const [editingTarget, setEditingTarget] = useState<EditableServiceTarget | null>(null);
  const [qrTargetService, setQrTargetService] = useState<ServiceQrTarget | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyServiceId, setBusyServiceId] = useState<string | null>(null);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [removingPersonId, setRemovingPersonId] = useState<string | null>(null);
  const [isQuickCheckinOpen, setIsQuickCheckinOpen] = useState(false);
  const [quickCheckinMemberId, setQuickCheckinMemberId] = useState('');
  const [quickCheckinMethod, setQuickCheckinMethod] = useState<'usher' | 'manual' | 'posted_qr'>(
    'usher'
  );

  useEffect(() => {
    if (!confirmDeleteId) return;
    const timeout = window.setTimeout(() => setConfirmDeleteId(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [confirmDeleteId]);

  const fetchHistory = useCallback(async () => {
    if (!isSessionVerified || !currentUser?.token) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/services/history', {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${currentUser.token}`,
        },
      });
      if (handleUnauthorizedSession(res.status)) return;
      if (res.ok) {
        const data = (await res.json()) as ServiceHistoryResponse;
        if (data && Array.isArray(data.services)) {
          setHistoryData(data);
          setSelectedServiceId((prev) =>
            prev && data.services.some((s) => s.id === prev)
              ? prev
              : data.services[0]?.id || null
          );
          return;
        }
      }
    } catch {
      // Fall back cleanly to local context snapshot below
    } finally {
      setIsLoading(false);
    }
  }, [isSessionVerified, currentUser?.token]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory, services.length, attendanceRecords.length]);

  // Fallback derived snapshot from context when offline or before server reply arrives
  const fallbackHistory = useMemo<ServiceHistoryResponse>(() => {
    const memberMap = new Map(members.map((m) => [m.id, m]));
    const todayIso = new Date(tickNowMs).toISOString().split('T')[0];

    const entries: ServiceHistoryEntry[] = services
      .map((svc) => {
        const recs = attendanceRecords.filter((r) => r.serviceInstanceId === svc.id);
        let onTimeCount = 0;
        let lateCount = 0;
        let autoProximityCount = 0;
        let confSum = 0;
        const methodBreakdown: Record<string, number> = {};

        const attendees: ServiceHistoryAttendee[] = recs.map((r) => {
          const person = memberMap.get(r.personId);
          const name = person
            ? `${person.firstName} ${person.lastName}`.trim()
            : r.personName || 'Registered Member';
          if (r.late) lateCount += 1;
          else onTimeCount += 1;
          if (r.method === 'geofence' || r.method === 'beacon') autoProximityCount += 1;
          methodBreakdown[r.method] = (methodBreakdown[r.method] || 0) + 1;
          confSum += r.confidence || 95;

          return {
            id: r.id,
            personId: r.personId,
            name,
            imageUrl: person?.imageUrl,
            initials: person?.avatarInitials || name.slice(0, 2).toUpperCase(),
            groupName: person?.homeCellGroup || person?.groupName || 'General Congregation',
            department: person?.department || 'General',
            status: person?.status || 'member',
            method: r.method,
            checkedInAt: r.checkedInAt,
            checkedInIso: r.checkedInIso || r.checkedInAt || '',
            late: Boolean(r.late),
            confidence: r.confidence || 95,
            distanceM: r.distanceM ?? null,
          };
        });

        const totalCheckedIn = attendees.length;
        const expected = svc.expectedAttendance > 0 ? svc.expectedAttendance : members.length;
        const allowanceMinutes = svc.dwellMinutes ?? systemSettings.dwellTimeMinutes ?? 5;
        const binaryStatus = computeServiceBinaryStatus({
          date: svc.date || todayIso,
          startsAt: svc.startsAt || '08:00',
          endsAt: svc.endsAt || '10:30',
          startTimeIso: svc.startTimeIso,
          endTimeIso: svc.endTimeIso,
          allowanceMinutes,
          rawStatus: svc.status,
          nowMs: tickNowMs,
        });

        return {
          id: svc.id,
          name: svc.name,
          date: svc.date || todayIso,
          startsAt: svc.startsAt || '08:00',
          endsAt: svc.endsAt || '10:30',
          startTimeIso: svc.startTimeIso,
          endTimeIso: svc.endTimeIso,
          allowanceMinutes,
          status: binaryStatus,
          rawStatus: svc.status,
          expectedAttendance: expected,
          totalCheckedIn,
          fillRatePct:
            expected > 0 ? Math.min(100, Math.round((totalCheckedIn / expected) * 100)) : 0,
          onTimeCount,
          lateCount,
          onTimePct: totalCheckedIn > 0 ? Math.round((onTimeCount / totalCheckedIn) * 100) : 0,
          autoProximityCount,
          assistedDoorCount: Math.max(0, totalCheckedIn - autoProximityCount),
          autoPct:
            totalCheckedIn > 0 ? Math.round((autoProximityCount / totalCheckedIn) * 100) : 0,
          avgConfidence: totalCheckedIn > 0 ? Math.round(confSum / totalCheckedIn) : 0,
          methodBreakdown,
          attendees,
        };
      })
      .sort((a, b) =>
        a.date !== b.date ? b.date.localeCompare(a.date) : b.startsAt.localeCompare(a.startsAt)
      );

    let peak: ServiceHistoryEntry | null = null;
    let totalCheckins = 0;
    for (const e of entries) {
      totalCheckins += e.totalCheckedIn;
      if (!peak || e.totalCheckedIn > peak.totalCheckedIn) peak = e;
    }

    const liveServices = entries.filter((e) => e.status === 'live').length;
    const closedServices = entries.length - liveServices;

    return {
      summary: {
        totalServices: entries.length,
        liveServices,
        closedServices,
        completedServices: closedServices,
        upcomingServices: 0,
        totalHistoricalCheckins: totalCheckins,
        uniqueAttendees: new Set(attendanceRecords.map((r) => r.personId)).size,
        averageAttendancePerService:
          entries.length > 0 ? Math.round((totalCheckins / entries.length) * 10) / 10 : 0,
        peakServiceId: peak?.id || null,
        peakServiceName: peak?.name || null,
        peakServiceCount: peak?.totalCheckedIn || 0,
      },
      services: entries,
    };
  }, [services, attendanceRecords, members, systemSettings.dwellTimeMinutes, tickNowMs]);

  // Re-evaluate fetched server services using current tickNowMs + allowanceMinutes so UI is strictly Live | Closed
  const resolvedData = useMemo<ServiceHistoryResponse>(() => {
    const base = historyData || fallbackHistory;
    const liveRecomputedServices: ServiceHistoryEntry[] = base.services.map((svc) => {
      const ctxSvc = services.find((s) => s.id === svc.id);
      const allowanceMinutes =
        svc.allowanceMinutes ?? ctxSvc?.dwellMinutes ?? systemSettings.dwellTimeMinutes ?? 5;
      const status = computeServiceBinaryStatus({
        date: svc.date,
        startsAt: svc.startsAt,
        endsAt: svc.endsAt,
        startTimeIso: svc.startTimeIso || ctxSvc?.startTimeIso,
        endTimeIso: svc.endTimeIso || ctxSvc?.endTimeIso,
        allowanceMinutes,
        rawStatus: ctxSvc?.status || svc.rawStatus,
        nowMs: tickNowMs,
      });
      return {
        ...svc,
        allowanceMinutes,
        status,
      };
    });

    const liveCount = liveRecomputedServices.filter((s) => s.status === 'live').length;
    const closedCount = liveRecomputedServices.length - liveCount;

    return {
      ...base,
      summary: {
        ...base.summary,
        totalServices: liveRecomputedServices.length,
        liveServices: liveCount,
        closedServices: closedCount,
        completedServices: closedCount,
        upcomingServices: 0,
      },
      services: liveRecomputedServices,
    };
  }, [historyData, fallbackHistory, services, systemSettings.dwellTimeMinutes, tickNowMs]);

  const liveServicesCount = resolvedData.summary.liveServices;
  const closedServicesCount =
    resolvedData.summary.closedServices ??
    resolvedData.services.filter((s) => s.status === 'closed').length;

  const filteredServices = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return resolvedData.services.filter((svc) => {
      if (statusFilter !== 'all' && svc.status !== statusFilter) return false;
      if (!q) return true;
      return (
        svc.name.toLowerCase().includes(q) ||
        svc.date.includes(q) ||
        svc.attendees.some((a) => a.name.toLowerCase().includes(q))
      );
    });
  }, [resolvedData.services, statusFilter, searchQuery]);

  const selectedService = useMemo(() => {
    if (!filteredServices.length) return null;
    return (
      filteredServices.find((s) => s.id === selectedServiceId) ||
      filteredServices.find((s) => s.id === activeServiceId) ||
      filteredServices[0]
    );
  }, [filteredServices, selectedServiceId, activeServiceId]);

  const selectedServiceEligibility = useMemo(() => {
    if (!selectedService) {
      return evaluateServiceCheckInEligibility(services, null, null, {
        nowMs: tickNowMs,
        defaultAllowanceMinutes: systemSettings.dwellTimeMinutes,
      });
    }
    return evaluateServiceCheckInEligibility(services, selectedService.id, null, {
      nowMs: tickNowMs,
      defaultAllowanceMinutes: systemSettings.dwellTimeMinutes,
    });
  }, [services, selectedService, tickNowMs, systemSettings.dwellTimeMinutes]);

  useEffect(() => {
    if (!selectedServiceEligibility.eligible && isQuickCheckinOpen) {
      setIsQuickCheckinOpen(false);
    }
  }, [selectedServiceEligibility.eligible, isQuickCheckinOpen]);

  const filteredAttendees = useMemo(() => {
    if (!selectedService) return [];
    const q = attendeeSearch.trim().toLowerCase();
    if (!q) return selectedService.attendees;
    return selectedService.attendees.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.groupName.toLowerCase().includes(q) ||
        a.department.toLowerCase().includes(q) ||
        (METHOD_LABELS[a.method] || a.method).toLowerCase().includes(q)
    );
  }, [selectedService, attendeeSearch]);

  const unarrivedMembersForSelected = useMemo(() => {
    if (!selectedService) return [];
    const checkedIds = new Set(selectedService.attendees.map((a) => a.personId));
    return members.filter((m) => !checkedIds.has(m.id));
  }, [members, selectedService]);

  const handleToggleBinaryStatus = async (svc: ServiceHistoryEntry) => {
    const nextStatus: BinaryServiceStatus = svc.status === 'live' ? 'closed' : 'live';
    setBusyServiceId(svc.id);
    try {
      await updateService(svc.id, { status: nextStatus });
      await fetchHistory();
      if (nextStatus === 'live') {
        const wouldBeLiveNow =
          computeServiceBinaryStatus({
            date: svc.date,
            startsAt: svc.startsAt,
            endsAt: svc.endsAt,
            startTimeIso: svc.startTimeIso,
            endTimeIso: svc.endTimeIso,
            allowanceMinutes: svc.allowanceMinutes ?? systemSettings.dwellTimeMinutes ?? 5,
            rawStatus: 'active',
            nowMs: Date.now(),
          }) === 'live';
        if (!wouldBeLiveNow) {
          handleOpenEditModal(svc);
          showToast(
            'Service reopened in Supabase — adjust the time window or allowance duration below to make it Live right now.'
          );
        }
      }
    } catch (err: any) {
      showToast(err?.message || 'Could not update service status');
    } finally {
      setBusyServiceId(null);
    }
  };

  const handleOpenEditModal = (svc: ServiceHistoryEntry) => {
    setEditingTarget({
      id: svc.id,
      name: svc.name,
      date: svc.date,
      startsAt: svc.startsAt,
      endsAt: svc.endsAt,
      expectedAttendance: svc.expectedAttendance,
      dwellMinutes: svc.allowanceMinutes ?? systemSettings.dwellTimeMinutes ?? 5,
      status: svc.status,
    });
  };

  const handleSaveEditedService = async (
    serviceId: string,
    updates: {
      name: string;
      date: string;
      startsAt: string;
      endsAt: string;
      expectedAttendance: number;
      dwellMinutes: number;
      status?: 'live' | 'closed';
    }
  ) => {
    await updateService(serviceId, updates);
    await fetchHistory();
  };

  const handleDeleteService = async (serviceId: string) => {
    setBusyServiceId(serviceId);
    setConfirmDeleteId(null);
    try {
      await deleteService(serviceId);
      await fetchHistory();
      showToast('Service deleted');
    } catch (err: any) {
      showToast(err?.message || 'Could not delete service');
      throw err;
    } finally {
      setBusyServiceId(null);
    }
  };

  const handleDeleteServiceConfirmed = async (svc: ServiceHistoryEntry) => {
    await handleDeleteService(svc.id).catch(() => {});
  };

  const handleQuickCheckinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedService || isCheckingIn) return;
    if (!selectedServiceEligibility.eligible) {
      showToast(selectedServiceEligibility.message);
      return;
    }
    const targetId = quickCheckinMemberId || unarrivedMembersForSelected[0]?.id;
    if (!targetId) {
      showToast('Select a member to check in');
      return;
    }
    setIsCheckingIn(true);
    try {
      const ok = await checkInPersonAsync(
        targetId,
        quickCheckinMethod,
        95,
        'Recorded from Service Register',
        selectedService.id
      );
      if (ok) {
        setQuickCheckinMemberId('');
        setIsQuickCheckinOpen(false);
        await fetchHistory();
      }
    } finally {
      setIsCheckingIn(false);
    }
  };

  const handleRemoveAttendeeCheckin = async (personId: string, serviceId: string) => {
    if (removingPersonId) return;
    setRemovingPersonId(personId);
    try {
      await removeCheckIn(personId, serviceId);
      await fetchHistory();
    } finally {
      setRemovingPersonId(null);
    }
  };

  const handleExportAllHistoryCsv = () => {
    const header = [
      'Service Name',
      'Date',
      'Window',
      'Allowance (Min)',
      'Status',
      'Checked In',
      'Expected',
      'Fill Rate %',
      'On-Time %',
      'Auto Proximity %',
    ];
    const rows = filteredServices.map((s) => [
      `"${s.name.replace(/"/g, '""')}"`,
      s.date,
      `${s.startsAt}-${s.endsAt}`,
      s.allowanceMinutes ?? systemSettings.dwellTimeMinutes ?? 5,
      BINARY_STATUS_DISPLAY[s.status].label,
      s.totalCheckedIn,
      s.expectedAttendance,
      `${s.fillRatePct}%`,
      `${s.onTimePct}%`,
      `${s.autoPct}%`,
    ]);
    const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ekklesphere-service-register-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Service register exported as CSV');
  };

  const handleExportSelectedServiceRoster = (svc: ServiceHistoryEntry) => {
    const header = [
      'Member Name',
      'Cell Group',
      'Department',
      'Checked In At',
      'Timing',
      'Method',
      'Confidence %',
    ];
    const rows = svc.attendees.map((a) => [
      `"${a.name.replace(/"/g, '""')}"`,
      `"${a.groupName.replace(/"/g, '""')}"`,
      `"${a.department.replace(/"/g, '""')}"`,
      a.checkedInAt,
      a.late ? 'Late' : 'On Time',
      METHOD_LABELS[a.method] || a.method,
      `${a.confidence}%`,
    ]);
    const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${svc.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${svc.date}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`Exported attendance register for ${svc.name}`);
  };

  return (
    <div className="space-y-4">
      {/* Header & Top Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-[#1D1D3D] rounded-2xl border border-[#E9EBF5] dark:border-[#2D2D55] p-4 sm:p-5 shadow-xs">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-[#6D5CF2] shrink-0" />
            <h1 className="text-lg sm:text-xl font-bold text-[#1D1B3A] dark:text-[#F2F2FA] truncate">
              Service Register &amp; Attendance History
            </h1>
          </div>
          <p className="text-xs text-[#666A86] dark:text-[#A9ACC8] mt-1">
            Manage worship service registers. Each service status evaluates strictly as Live or Closed based on its scheduled time window and allowance duration.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={fetchHistory}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] bg-[#F6F7FC] dark:bg-[#14142E] text-xs font-semibold text-[#1D1B3A] dark:text-[#F2F2FA] hover:border-[#6D5CF2]/50 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#6D5CF2] ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            onClick={handleExportAllHistoryCsv}
            disabled={filteredServices.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] bg-white dark:bg-[#1D1D3D] text-xs font-semibold text-[#1D1B3A] dark:text-[#F2F2FA] hover:border-[#6D5CF2]/50 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5 text-[#6D5CF2]" />
            <span>Export Archive CSV</span>
          </button>

          <button
            type="button"
            onClick={onAddService}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#6D5CF2] hover:bg-[#5B4BE0] text-white text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Schedule Service</span>
          </button>
        </div>
      </div>

      {/* 4-Metric Hairline Summary Strip */}
      <section
        aria-label="Service Register Totals"
        className="bg-white dark:bg-[#1D1D3D] rounded-2xl border border-[#E9EBF5] dark:border-[#2D2D55] shadow-xs grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-[#E9EBF5] dark:divide-[#2D2D55] tabular-nums"
      >
        <div className="p-4">
          <span className="text-[11px] font-semibold text-[#666A86] dark:text-[#A9ACC8] block">
            Services Recorded
          </span>
          <span className="font-mono text-2xl font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mt-1 block">
            {resolvedData.summary.totalServices}
          </span>
          <span className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] mt-0.5 block">
            {liveServicesCount} live · {closedServicesCount} closed
          </span>
        </div>

        <div className="p-4">
          <span className="text-[11px] font-semibold text-[#666A86] dark:text-[#A9ACC8] block">
            Total Historical Check-Ins
          </span>
          <span className="font-mono text-2xl font-bold text-[#6D5CF2] dark:text-[#9D90FF] mt-1 block">
            {resolvedData.summary.totalHistoricalCheckins}
          </span>
          <span className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] mt-0.5 block">
            {resolvedData.summary.uniqueAttendees} unique attendees logged
          </span>
        </div>

        <div className="p-4">
          <span className="text-[11px] font-semibold text-[#666A86] dark:text-[#A9ACC8] block">
            Average Per Service
          </span>
          <span className="font-mono text-2xl font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mt-1 block">
            {resolvedData.summary.averageAttendancePerService}
          </span>
          <span className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] mt-0.5 block">
            Across recorded registers
          </span>
        </div>

        <div className="p-4">
          <span className="text-[11px] font-semibold text-[#666A86] dark:text-[#A9ACC8] block">
            Peak Service Turnout
          </span>
          <span className="font-mono text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1 block">
            {resolvedData.summary.peakServiceCount}
          </span>
          <span className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] mt-0.5 block truncate">
            {resolvedData.summary.peakServiceName || 'No attendance logged yet'}
          </span>
        </div>
      </section>

      {/* Filter & Search Toolbar (Strictly All / Live / Closed) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 min-w-0 w-full">
        <div
          role="tablist"
          aria-label="Filter service register by live or closed status"
          className="inline-flex items-center gap-1 p-1 rounded-xl bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] self-start max-w-full overflow-x-auto"
        >
          {(
            [
              { id: 'all', label: `All (${resolvedData.services.length})` },
              { id: 'live', label: `Live (${liveServicesCount})` },
              { id: 'closed', label: `Closed (${closedServicesCount})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={statusFilter === tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums ${
                statusFilter === tab.id
                  ? 'bg-[#6D5CF2] text-white'
                  : 'text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64 md:w-72 lg:w-80 min-w-0">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#666A86] dark:text-[#A9ACC8] pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search service, date, or attendee..."
            aria-label="Search service register"
            className="w-full min-h-[38px] pl-8 pr-8 py-1.5 rounded-xl text-xs bg-white dark:bg-[#1D1D3D] text-[#1D1B3A] dark:text-[#F2F2FA] border border-[#E9EBF5] dark:border-[#2D2D55] outline-none focus:border-[#6D5CF2]"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Clear service search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#666A86] hover:text-[#1D1B3A] dark:hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Main Split: Services Register Table + Selected Service Detail Register */}
      {filteredServices.length === 0 ? (
        <div className="bg-white dark:bg-[#1D1D3D] rounded-2xl border border-[#E9EBF5] dark:border-[#2D2D55] p-10 text-center">
          <Calendar className="w-8 h-8 text-[#6D5CF2] mx-auto mb-2.5 opacity-80" />
          <h2 className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
            {resolvedData.services.length === 0
              ? 'No worship services recorded yet'
              : 'No services match your current filter'}
          </h2>
          <p className="text-xs text-[#666A86] dark:text-[#A9ACC8] mt-1 max-w-md mx-auto">
            {resolvedData.services.length === 0
              ? 'Schedule your first service or record attendance check-ins to build a permanent register.'
              : 'Try clearing your search term or switching back to the All status view.'}
          </p>
          {resolvedData.services.length === 0 && (
            <button
              type="button"
              onClick={onAddService}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#6D5CF2] hover:bg-[#5B4BE0] text-white text-xs font-bold cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Schedule First Service</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
          {/* Services Register Table (7 cols on xl) */}
          <section
            aria-label="Services Register"
            className="xl:col-span-7 bg-white dark:bg-[#1D1D3D] rounded-2xl border border-[#E9EBF5] dark:border-[#2D2D55] shadow-xs overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-[#E9EBF5] dark:border-[#2D2D55] flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                Services Register ({filteredServices.length})
              </span>
              <span className="text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
                Status updates automatically from time window + allowance
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-[#F6F7FC] dark:bg-[#14142E] border-b border-[#E9EBF5] dark:border-[#2D2D55] text-[#666A86] dark:text-[#A9ACC8]">
                  <tr>
                    <th className="py-2.5 px-3.5 font-semibold">Service</th>
                    <th className="py-2.5 px-3 font-semibold">Window &amp; Allowance</th>
                    <th className="py-2.5 px-3 font-semibold">Status</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Headcount</th>
                    <th className="py-2.5 px-3 font-semibold min-w-[90px]">Fill</th>
                    <th className="py-2.5 px-3.5 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E9EBF5] dark:divide-[#2D2D55] tabular-nums">
                  {filteredServices.map((svc) => {
                    const isSelected = selectedService?.id === svc.id;
                    const st = BINARY_STATUS_DISPLAY[svc.status];
                    const allowanceMin =
                      svc.allowanceMinutes ?? systemSettings.dwellTimeMinutes ?? 5;
                    const isBusy = busyServiceId === svc.id;
                    const isConfirmingDelete = confirmDeleteId === svc.id;

                    return (
                      <tr
                        key={svc.id}
                        onClick={() => setSelectedServiceId(svc.id)}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-[#EFEDFF]/70 dark:bg-[#2A2A55]/60'
                            : 'hover:bg-[#F8F9FD] dark:hover:bg-white/[0.03]'
                        }`}
                      >
                        <td className="py-3 px-3.5">
                          <div className="font-semibold text-[#1D1B3A] dark:text-[#F2F2FA]">
                            {svc.name}
                          </div>
                          {svc.id === activeServiceId && (
                            <span className="text-[11px] font-semibold text-[#6D5CF2] dark:text-[#9D90FF]">
                              Dashboard Focus
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-[#666A86] dark:text-[#A9ACC8] whitespace-nowrap">
                          <span className="block text-[#1D1B3A] dark:text-[#F2F2FA] font-medium">
                            {formatDateReadable(svc.date)}
                          </span>
                          <span className="text-[11px] font-mono">
                            {svc.startsAt}–{svc.endsAt} · +{allowanceMin}m allowance
                          </span>
                        </td>
                        <td className={`py-3 px-3 font-semibold whitespace-nowrap ${st.textClass}`}>
                          <span className="inline-flex items-center gap-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full ${st.dotClass}`} />
                            <span>{st.label}</span>
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-semibold text-[#1D1B3A] dark:text-[#F2F2FA] whitespace-nowrap">
                          {svc.totalCheckedIn}
                          <span className="text-[#666A86] dark:text-[#A9ACC8] font-normal">
                            /{svc.expectedAttendance}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-1.5">
                            <div className="flex-1 h-1.5 rounded-full bg-[#EFEDFF] dark:bg-[#2A2A55] overflow-hidden min-w-[36px]">
                              <div
                                className="h-full rounded-full bg-[#4FBF98]"
                                style={{ width: `${svc.fillRatePct}%` }}
                              />
                            </div>
                            <span className="font-mono text-[11px] font-semibold text-[#1D1B3A] dark:text-[#F2F2FA] w-8 text-right">
                              {svc.fillRatePct}%
                            </span>
                          </div>
                        </td>
                        <td
                          className="py-2.5 px-3.5 text-right whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="inline-flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => setSelectedServiceId(svc.id)}
                              title="Open Service Register"
                              aria-label={`Open register for ${svc.name}`}
                              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-semibold transition-colors cursor-pointer ${
                                isSelected
                                  ? 'bg-[#6D5CF2] border-[#6D5CF2] text-white'
                                  : 'border-[#E9EBF5] dark:border-[#2D2D55] bg-white dark:bg-[#14142E] text-[#1D1B3A] dark:text-[#F2F2FA] hover:border-[#6D5CF2]/60'
                              }`}
                            >
                              <ClipboardList className="w-3 h-3" />
                              <span>Register</span>
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                setQrTargetService({
                                  id: svc.id,
                                  name: svc.name,
                                  date: svc.date,
                                  startsAt: svc.startsAt,
                                  endsAt: svc.endsAt,
                                  dwellMinutes: allowanceMin,
                                  status: svc.status,
                                })
                              }
                              title="Show Service Check-In QR Code"
                              aria-label={`Show check-in QR for ${svc.name}`}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-[#E9EBF5] dark:border-[#2D2D55] bg-white dark:bg-[#14142E] text-[#1D1B3A] dark:text-[#F2F2FA] hover:border-[#6D5CF2]/60 text-[11px] font-semibold transition-colors cursor-pointer"
                            >
                              <QrCode className="w-3 h-3 text-[#6D5CF2]" />
                              <span>QR</span>
                            </button>

                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleToggleBinaryStatus(svc)}
                              title={
                                svc.status === 'live'
                                  ? 'Close service register'
                                  : 'Set service live (within time + allowance window)'
                              }
                              aria-label={
                                svc.status === 'live'
                                  ? `Close ${svc.name}`
                                  : `Reopen ${svc.name}`
                              }
                              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-semibold transition-colors cursor-pointer disabled:opacity-50 ${
                                svc.status === 'live'
                                  ? 'border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40'
                                  : 'border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40'
                              }`}
                            >
                              <Power className="w-3 h-3" />
                              <span>{svc.status === 'live' ? 'Close' : 'Reopen'}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleOpenEditModal(svc)}
                              title="Edit time window and allowance duration"
                              aria-label={`Edit ${svc.name}`}
                              className="p-1.5 rounded-lg border border-[#E9EBF5] dark:border-[#2D2D55] bg-white dark:bg-[#14142E] text-[#666A86] dark:text-[#A9ACC8] hover:text-[#6D5CF2] hover:border-[#6D5CF2]/50 transition-colors cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              disabled={svc.attendees.length === 0}
                              onClick={() => handleExportSelectedServiceRoster(svc)}
                              title="Export service register CSV"
                              aria-label={`Export CSV for ${svc.name}`}
                              className="p-1.5 rounded-lg border border-[#E9EBF5] dark:border-[#2D2D55] bg-white dark:bg-[#14142E] text-[#666A86] dark:text-[#A9ACC8] hover:text-[#6D5CF2] hover:border-[#6D5CF2]/50 transition-colors cursor-pointer disabled:opacity-40"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>

                            {isConfirmingDelete ? (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleDeleteServiceConfirmed(svc)}
                                className="px-2 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold cursor-pointer"
                              >
                                Confirm
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => setConfirmDeleteId(svc.id)}
                                title="Delete service"
                                aria-label={`Delete ${svc.name}`}
                                className="p-1.5 rounded-lg border border-[#E9EBF5] dark:border-[#2D2D55] bg-white dark:bg-[#14142E] text-[#666A86] dark:text-[#A9ACC8] hover:text-rose-600 hover:border-rose-300 transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Selected Service Detail Register (5 cols on xl) */}
          {selectedService && (
            <section
              aria-label={`Attendee Register for ${selectedService.name}`}
              className="xl:col-span-5 bg-white dark:bg-[#1D1D3D] rounded-2xl border border-[#E9EBF5] dark:border-[#2D2D55] shadow-xs overflow-hidden"
            >
              <div className="p-4 border-b border-[#E9EBF5] dark:border-[#2D2D55] space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-[#666A86] dark:text-[#A9ACC8]">
                        Service Detail Register
                      </span>
                      <span aria-hidden="true" className="text-[#666A86]/40">·</span>
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] font-bold ${
                          BINARY_STATUS_DISPLAY[selectedService.status].textClass
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            BINARY_STATUS_DISPLAY[selectedService.status].dotClass
                          }`}
                        />
                        {BINARY_STATUS_DISPLAY[selectedService.status].label}
                      </span>
                    </div>
                    <h2 className="text-base font-bold text-[#1D1B3A] dark:text-[#F2F2FA] truncate mt-0.5">
                      {selectedService.name}
                    </h2>
                    <p className="text-xs text-[#666A86] dark:text-[#A9ACC8] tabular-nums">
                      {formatDateReadable(selectedService.date)} · {selectedService.startsAt}–
                      {selectedService.endsAt} (+
                      {selectedService.allowanceMinutes ?? systemSettings.dwellTimeMinutes ?? 5}m
                      allowance
                      {selectedService.status === 'live' && selectedService.closesAtIso
                        ? `, closes ${formatAllowanceDeadline(selectedService.closesAtIso) || ''}`
                        : ''}
                      )
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleExportSelectedServiceRoster(selectedService)}
                    disabled={selectedService.attendees.length === 0}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] text-[11px] font-semibold text-[#1D1B3A] dark:text-[#F2F2FA] hover:border-[#6D5CF2]/50 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                  >
                    <Download className="w-3 h-3 text-[#6D5CF2]" />
                    <span>CSV</span>
                  </button>
                </div>

                {/* Compact Service Breakdown Strip */}
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#E9EBF5] dark:border-[#2D2D55] text-xs tabular-nums">
                  <div>
                    <span className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] block">
                      Headcount
                    </span>
                    <span className="font-mono font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                      {selectedService.totalCheckedIn}/{selectedService.expectedAttendance}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] block">
                      On-Time / Late
                    </span>
                    <span className="font-mono font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                      {selectedService.onTimeCount} / {selectedService.lateCount}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] block">
                      Auto / Door
                    </span>
                    <span className="font-mono font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                      {selectedService.autoProximityCount} / {selectedService.assistedDoorCount}
                    </span>
                  </div>
                </div>

                {/* Register Action Bar */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <button
                    type="button"
                    disabled={!selectedServiceEligibility.eligible}
                    title={
                      selectedServiceEligibility.eligible
                        ? 'Record member check-in'
                        : selectedServiceEligibility.message
                    }
                    onClick={() => {
                      setIsQuickCheckinOpen((prev) => !prev);
                      if (!quickCheckinMemberId && unarrivedMembersForSelected[0]) {
                        setQuickCheckinMemberId(unarrivedMembersForSelected[0].id);
                      }
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#6D5CF2] hover:bg-[#5B4BE0] disabled:opacity-45 disabled:cursor-not-allowed text-white text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>{isQuickCheckinOpen ? 'Close Check-In' : 'Check In Member'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setQrTargetService({
                        id: selectedService.id,
                        name: selectedService.name,
                        date: selectedService.date,
                        startsAt: selectedService.startsAt,
                        endsAt: selectedService.endsAt,
                        dwellMinutes:
                          selectedService.allowanceMinutes ??
                          systemSettings.dwellTimeMinutes ??
                          5,
                        status: selectedService.status,
                      })
                    }
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] bg-white dark:bg-[#14142E] text-xs font-semibold text-[#1D1B3A] dark:text-[#F2F2FA] hover:border-[#6D5CF2]/60 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <QrCode className="w-3.5 h-3.5 text-[#6D5CF2]" />
                    <span>Check-in QR</span>
                  </button>

                  <button
                    type="button"
                    disabled={busyServiceId === selectedService.id}
                    onClick={() => handleToggleBinaryStatus(selectedService)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 ${
                      selectedService.status === 'live'
                        ? 'border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300'
                        : 'border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
                    }`}
                  >
                    <Power className="w-3.5 h-3.5" />
                    <span>
                      {selectedService.status === 'live' ? 'Close Service' : 'Set Live'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenEditModal(selectedService)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] text-xs font-semibold text-[#1D1B3A] dark:text-[#F2F2FA] hover:border-[#6D5CF2]/50 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-[#6D5CF2]" />
                    <span>Edit Window</span>
                  </button>

                  {selectedService.id !== activeServiceId && (
                    <button
                      type="button"
                      onClick={() => onSelectActiveService(selectedService.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#9D90FF] text-xs font-semibold hover:opacity-90 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Set Active</span>
                    </button>
                  )}

                  {onOpenInsights && (
                    <button
                      type="button"
                      onClick={() => {
                        onSelectActiveService(selectedService.id);
                        onOpenInsights();
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] text-xs font-semibold text-[#1D1B3A] dark:text-[#F2F2FA] hover:border-[#6D5CF2]/50 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <span>Live Insights</span>
                      <ArrowUpRight className="w-3.5 h-3.5 text-[#6D5CF2]" />
                    </button>
                  )}

                  {confirmDeleteId === selectedService.id ? (
                    <button
                      type="button"
                      disabled={busyServiceId === selectedService.id}
                      onClick={() => handleDeleteService(selectedService.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Confirm Delete</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busyServiceId === selectedService.id}
                      onClick={() => setConfirmDeleteId(selectedService.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-rose-200 dark:border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Service</span>
                    </button>
                  )}
                </div>

                {/* Inline Quick Check-In Drawer */}
                {isQuickCheckinOpen && (
                  <form
                    onSubmit={handleQuickCheckinSubmit}
                    className="p-3 rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                        Record Arrival into {selectedService.name}
                      </span>
                      <span className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] tabular-nums">
                        {unarrivedMembersForSelected.length} unarrived
                      </span>
                    </div>
                    {unarrivedMembersForSelected.length === 0 ? (
                      <p className="text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
                        All registered members are already checked into this service.
                      </p>
                    ) : (
                      <div className="flex flex-col sm:flex-row gap-2">
                        <select
                          aria-label="Select member to check in"
                          value={quickCheckinMemberId}
                          onChange={(e) => setQuickCheckinMemberId(e.target.value)}
                          className="flex-1 min-h-[36px] px-2.5 py-1.5 rounded-lg border border-[#E9EBF5] dark:border-[#2D2D55] bg-white dark:bg-[#1D1D3D] text-[#1D1B3A] dark:text-[#F2F2FA]"
                        >
                          <option value="">Choose member...</option>
                          {unarrivedMembersForSelected.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.firstName} {m.lastName} ({m.homeCellGroup || m.groupName})
                            </option>
                          ))}
                        </select>
                        <select
                          aria-label="Check-in method"
                          value={quickCheckinMethod}
                          onChange={(e) => setQuickCheckinMethod(e.target.value as any)}
                          className="min-h-[36px] px-2.5 py-1.5 rounded-lg border border-[#E9EBF5] dark:border-[#2D2D55] bg-white dark:bg-[#1D1D3D] text-[#1D1B3A] dark:text-[#F2F2FA]"
                        >
                          <option value="usher">Usher Desk</option>
                          <option value="manual">Manual</option>
                          <option value="posted_qr">Posted QR</option>
                        </select>
                        <button
                          type="submit"
                          disabled={isCheckingIn}
                          className="px-3 py-1.5 rounded-lg bg-[#6D5CF2] hover:bg-[#5B4BE0] text-white font-bold whitespace-nowrap cursor-pointer disabled:opacity-60"
                        >
                          {isCheckingIn ? 'Saving...' : 'Check In'}
                        </button>
                      </div>
                    )}
                  </form>
                )}

                {selectedService.attendees.length > 0 && (
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#666A86] pointer-events-none" />
                    <input
                      type="text"
                      value={attendeeSearch}
                      onChange={(e) => setAttendeeSearch(e.target.value)}
                      placeholder="Filter attendees in this service..."
                      aria-label="Filter attendees in selected service"
                      className="w-full min-h-[34px] pl-8 pr-3 py-1 rounded-xl text-xs bg-[#F6F7FC] dark:bg-[#14142E] text-[#1D1B3A] dark:text-[#F2F2FA] border border-[#E9EBF5] dark:border-[#2D2D55] outline-none focus:border-[#6D5CF2]"
                    />
                  </div>
                )}
              </div>

              {/* Attendee List with Uploaded Portraits & Remove Check-In Action */}
              <div className="max-h-[420px] overflow-y-auto divide-y divide-[#E9EBF5] dark:divide-[#2D2D55]">
                {selectedService.attendees.length === 0 ? (
                  <div className="p-8 text-center text-xs text-[#666A86] dark:text-[#A9ACC8]">
                    <Users className="w-6 h-6 text-[#6D5CF2] mx-auto mb-2 opacity-75" />
                    <p className="font-semibold text-[#1D1B3A] dark:text-[#F2F2FA]">
                      No attendance check-ins recorded for this service
                    </p>
                    <p className="mt-1 text-[11px]">
                      Use &ldquo;Check In Member&rdquo; above or record arrivals via the Usher Door Station.
                    </p>
                  </div>
                ) : filteredAttendees.length === 0 ? (
                  <div className="p-6 text-center text-xs text-[#666A86] dark:text-[#A9ACC8]">
                    No attendees match &ldquo;{attendeeSearch}&rdquo;.
                  </div>
                ) : (
                  filteredAttendees.map((att) => (
                    <div
                      key={att.id}
                      className="px-4 py-2.5 flex items-center justify-between gap-2.5 hover:bg-[#F8F9FD] dark:hover:bg-white/[0.03] transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <MemberAvatar
                          src={att.imageUrl}
                          name={att.name}
                          initials={att.initials}
                          sizeClass="w-8 h-8"
                          textClass="text-[11px] font-bold"
                        />
                        <div className="min-w-0">
                          <span className="text-xs font-semibold text-[#1D1B3A] dark:text-[#F2F2FA] block truncate">
                            {att.name}
                          </span>
                          <span className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] block truncate">
                            {att.groupName} · {METHOD_LABELS[att.method] || att.method}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 shrink-0">
                        <div className="text-right tabular-nums">
                          <span className="font-mono text-xs font-semibold text-[#1D1B3A] dark:text-[#F2F2FA] block">
                            {att.checkedInAt}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 text-[11px] font-semibold ${
                              att.late
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-emerald-600 dark:text-emerald-400'
                            }`}
                          >
                            <Clock className="w-3 h-3" />
                            {att.late ? 'Late' : 'On Time'}
                          </span>
                        </div>

                        <button
                          type="button"
                          disabled={removingPersonId === att.personId}
                          onClick={() =>
                            handleRemoveAttendeeCheckin(att.personId, selectedService.id)
                          }
                          title={`Remove check-in for ${att.name}`}
                          aria-label={`Remove check-in for ${att.name}`}
                          className="p-1.5 rounded-lg border border-[#E9EBF5] dark:border-[#2D2D55] text-[#666A86] dark:text-[#A9ACC8] hover:text-rose-600 hover:border-rose-300 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <UserMinus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          )}
        </div>
      )}

      <EditServiceModal
        isOpen={Boolean(editingTarget)}
        service={editingTarget}
        defaultAllowanceMinutes={systemSettings.dwellTimeMinutes ?? 5}
        onClose={() => setEditingTarget(null)}
        onSaveService={handleSaveEditedService}
        onDeleteService={handleDeleteService}
        onOpenServiceQr={setQrTargetService}
        onNotify={showToast}
        formatDateLabel={formatDateInputLabel}
      />

      <ServiceQrModal
        isOpen={Boolean(qrTargetService)}
        service={qrTargetService}
        onClose={() => setQrTargetService(null)}
      />
    </div>
  );
};
