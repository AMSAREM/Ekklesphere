import React, { useMemo, useState } from 'react';
import {
  RefreshCw,
  Download,
  Search,
  UserPlus,
  Upload,
  Check,
  Undo2,
  Calendar as CalendarIcon,
} from 'lucide-react';
import { useEkklesphere } from '../../context/EkklesphereContext';
import { AttendanceRecord, CheckinMethod, Person } from '../../types/ekklesphere';

interface LiveAttendanceInsightsProps {
  onOpenAddMember?: () => void;
  onOpenImportModal?: () => void;
}

interface VelocityBucket {
  key: string;
  label: string;
  startMin: number;
  endMin: number;
  count: number;
  isAfterGrace: boolean;
  isServiceStart: boolean;
}

const parseTimeToMinutes = (raw?: string): number | null => {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();

  // ISO timestamp e.g. 2026-11-01T08:12:00.000Z
  if (trimmed.includes('T')) {
    const dt = new Date(trimmed);
    if (!Number.isNaN(dt.getTime())) {
      return dt.getHours() * 60 + dt.getMinutes();
    }
  }

  // 12-hour or 24-hour time e.g. "08:15", "08:15 AM", "2:30 PM"
  const ampmMatch = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (ampmMatch) {
    let h = Number(ampmMatch[1]);
    const m = Number(ampmMatch[2]);
    const meridiem = ampmMatch[3]?.toUpperCase();
    if (meridiem === 'PM' && h < 12) h += 12;
    if (meridiem === 'AM' && h === 12) h = 0;
    if (h >= 0 && h < 24 && m >= 0 && m < 60) {
      return h * 60 + m;
    }
  }

  return null;
};

const formatMinutesLabel = (mins: number): string => {
  const normalized = ((mins % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const formatServiceDate = (isoDate?: string): string => {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate || '';
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return isoDate;
  return dt.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const CHANNEL_META: Array<{
  id: 'geofence' | 'beacon' | 'usher' | 'posted_qr' | 'manual';
  label: string;
  methods: CheckinMethod[];
  automated: boolean;
}> = [
  { id: 'geofence', label: 'GPS Geofence Dwell', methods: ['geofence'], automated: true },
  { id: 'beacon', label: 'Entrance BLE Beacon', methods: ['beacon'], automated: true },
  { id: 'usher', label: 'Usher Door Station', methods: ['usher'], automated: false },
  { id: 'posted_qr', label: 'Sanctuary QR Pass', methods: ['posted_qr'], automated: false },
  { id: 'manual', label: 'Manual & Self Check-In', methods: ['manual', 'email_link'], automated: false },
];

export const LiveAttendanceInsights: React.FC<LiveAttendanceInsightsProps> = ({
  onOpenAddMember,
  onOpenImportModal,
}) => {
  const {
    services,
    activeServiceId,
    setActiveServiceId,
    currentService,
    members,
    attendanceRecords,
    telemetrySummary,
    systemSettings,
    autoCheckinOptedInCount,
    optInPercentage,
    checkInPerson,
    removeCheckIn,
    addFollowupTask,
    refreshLivePremise,
    setIsAddServiceOpen,
    showToast,
  } = useEkklesphere();

  const [scopeMode, setScopeMode] = useState<'active' | 'all'>('active');
  const [groupDimension, setGroupDimension] = useState<'group' | 'department' | 'demographics'>('group');
  const [tableTab, setTableTab] = useState<'checked_in' | 'unarrived' | 'at_risk'>('checked_in');
  const [methodFilter, setMethodFilter] = useState<'all' | 'geofence' | 'beacon' | 'usher' | 'manual'>('all');
  const [tableSearch, setTableSearch] = useState('');
  const [quickMemberId, setQuickMemberId] = useState('');
  const [quickMethod, setQuickMethod] = useState<CheckinMethod>('usher');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const memberById = useMemo(() => {
    const map = new Map<string, Person>();
    for (const m of members) {
      map.set(m.id, m);
    }
    return map;
  }, [members]);

  // Scoped attendance records: match active service or include legacy records if only one service exists
  const scopedRecords = useMemo(() => {
    if (scopeMode === 'all') return attendanceRecords;
    return attendanceRecords.filter(
      (r) =>
        r.serviceInstanceId === currentService.id ||
        (!r.serviceInstanceId && services.length <= 1)
    );
  }, [attendanceRecords, scopeMode, currentService.id, services.length]);

  const checkedInPersonIds = useMemo(
    () => new Set(scopedRecords.map((r) => r.personId)),
    [scopedRecords]
  );

  const serviceStartMin = useMemo(
    () => parseTimeToMinutes(currentService.startsAt) ?? 8 * 60,
    [currentService.startsAt]
  );

  const graceCutoffMin = serviceStartMin + 15;

  // Compute punctuality per record using either explicit `late` boolean or timestamp comparison against service start + 15m
  const enrichedRecords = useMemo(() => {
    return scopedRecords.map((rec) => {
      const person = memberById.get(rec.personId);
      const arrivalMin = parseTimeToMinutes(rec.checkedInIso) ?? parseTimeToMinutes(rec.checkedInAt);
      const computedLate =
        rec.late || (arrivalMin !== null && scopeMode === 'active' && arrivalMin > graceCutoffMin);
      const displayName =
        person
          ? `${person.firstName} ${person.lastName}`.trim()
          : rec.personName || 'Registered Attendee';
      return {
        record: rec,
        person,
        displayName,
        arrivalMin,
        isLate: computedLate,
      };
    });
  }, [scopedRecords, memberById, scopeMode, graceCutoffMin]);

  const totalCheckedIn = enrichedRecords.length;
  const expectedCount =
    currentService.expectedAttendance > 0 ? currentService.expectedAttendance : members.length;
  const turnoutPct =
    expectedCount > 0 ? Math.min(100, Math.round((totalCheckedIn / expectedCount) * 100)) : 0;
  const remainingSeats = Math.max(0, expectedCount - totalCheckedIn);

  const lateCount = enrichedRecords.filter((r) => r.isLate).length;
  const onTimeCount = Math.max(0, totalCheckedIn - lateCount);
  const punctualityPct =
    totalCheckedIn > 0 ? Math.round((onTimeCount / totalCheckedIn) * 100) : 0;

  const automatedCount = enrichedRecords.filter(
    (r) => r.record.method === 'geofence' || r.record.method === 'beacon'
  ).length;
  const assistedCount = Math.max(0, totalCheckedIn - automatedCount);
  const automatedSharePct =
    totalCheckedIn > 0 ? Math.round((automatedCount / totalCheckedIn) * 100) : 0;

  const checkedInVisitorsCount = enrichedRecords.filter(
    (r) => r.person?.status === 'visitor'
  ).length;

  const absenteeThreshold = Math.max(1, systemSettings.absenteeThresholdServices || 2);

  const unarrivedMembers = useMemo(
    () => members.filter((m) => !checkedInPersonIds.has(m.id)),
    [members, checkedInPersonIds]
  );

  const atRiskAbsentees = useMemo(
    () => unarrivedMembers.filter((m) => (m.consecutiveAbsences || 0) >= absenteeThreshold),
    [unarrivedMembers, absenteeThreshold]
  );

  // 15-minute arrival velocity buckets anchored around service start (-30m to +75m)
  const velocityBuckets = useMemo<VelocityBucket[]>(() => {
    const anchorStart = serviceStartMin - 30;
    const buckets: VelocityBucket[] = [];

    for (let i = 0; i < 8; i++) {
      const bStart = anchorStart + i * 15;
      const bEnd = bStart + 15;
      buckets.push({
        key: `b-${i}`,
        label:
          i === 0
            ? `≤${formatMinutesLabel(bEnd)}`
            : i === 7
            ? `${formatMinutesLabel(bStart)}+`
            : formatMinutesLabel(bStart),
        startMin: bStart,
        endMin: bEnd,
        count: 0,
        isAfterGrace: bStart >= graceCutoffMin,
        isServiceStart: bStart === serviceStartMin,
      });
    }

    for (const item of enrichedRecords) {
      if (item.arrivalMin === null) {
        buckets[2].count += 1;
        continue;
      }
      if (item.arrivalMin < buckets[0].endMin) {
        buckets[0].count += 1;
      } else if (item.arrivalMin >= buckets[buckets.length - 1].startMin) {
        buckets[buckets.length - 1].count += 1;
      } else {
        const idx = Math.min(
          buckets.length - 1,
          Math.max(0, Math.floor((item.arrivalMin - anchorStart) / 15))
        );
        buckets[idx].count += 1;
      }
    }

    return buckets;
  }, [enrichedRecords, serviceStartMin, graceCutoffMin]);

  const maxBucketCount = useMemo(
    () => Math.max(1, ...velocityBuckets.map((b) => b.count)),
    [velocityBuckets]
  );

  const peakWindowLabel = useMemo(() => {
    const top = velocityBuckets.reduce<VelocityBucket | null>(
      (best, cur) => (cur.count > 0 && (!best || cur.count > best.count) ? cur : best),
      null
    );
    if (!top) return 'Awaiting arrivals';
    return `${formatMinutesLabel(top.startMin)}–${formatMinutesLabel(top.endMin)} (${top.count})`;
  }, [velocityBuckets]);

  // Channel distribution breakdown
  const channelStats = useMemo(() => {
    return CHANNEL_META.map((ch) => {
      const matching = enrichedRecords.filter((r) => ch.methods.includes(r.record.method));
      const count = matching.length;
      const sharePct = totalCheckedIn > 0 ? Math.round((count / totalCheckedIn) * 100) : 0;
      const avgConf =
        count > 0
          ? Math.round(
              matching.reduce((sum, r) => sum + (r.record.confidence || 95), 0) / count
            )
          : 0;
      return {
        ...ch,
        count,
        sharePct,
        avgConf,
      };
    });
  }, [enrichedRecords, totalCheckedIn]);

  // Group / Department / Demographics turnout breakdown
  const segmentTurnout = useMemo(() => {
    if (groupDimension === 'demographics') {
      const categories = [
        {
          name: 'Congregation Members',
          membersList: members.filter((m) => m.status !== 'visitor'),
        },
        {
          name: 'First-Time & Returning Visitors',
          membersList: members.filter((m) => m.status === 'visitor'),
        },
        {
          name: 'Female',
          membersList: members.filter((m) => (m.gender || '').toLowerCase() === 'female'),
        },
        {
          name: 'Male',
          membersList: members.filter((m) => (m.gender || '').toLowerCase() === 'male'),
        },
      ].filter((c) => c.membersList.length > 0);

      return categories.map((c) => {
        const total = c.membersList.length;
        const present = c.membersList.filter((m) => checkedInPersonIds.has(m.id)).length;
        const pct = total > 0 ? Math.round((present / total) * 100) : 0;
        return { name: c.name, present, total, pct };
      });
    }

    const map = new Map<string, { present: number; total: number }>();
    for (const m of members) {
      const rawKey =
        groupDimension === 'group'
          ? m.groupName || m.homeCellGroup || 'Unassigned Cell'
          : m.department || 'General Congregation';
      const key = rawKey.trim() || 'Unassigned';
      const entry = map.get(key) || { present: 0, total: 0 };
      entry.total += 1;
      if (checkedInPersonIds.has(m.id)) {
        entry.present += 1;
      }
      map.set(key, entry);
    }

    return Array.from(map.entries())
      .map(([name, val]) => ({
        name,
        present: val.present,
        total: val.total,
        pct: val.total > 0 ? Math.round((val.present / val.total) * 100) : 0,
      }))
      .sort((a, b) => b.present - a.present || b.total - a.total);
  }, [members, checkedInPersonIds, groupDimension]);

  // Mean verification confidence & GPS distance
  const avgConfidence = useMemo(() => {
    if (enrichedRecords.length === 0) return 0;
    const sum = enrichedRecords.reduce((acc, r) => acc + (r.record.confidence || 95), 0);
    return Math.round(sum / enrichedRecords.length);
  }, [enrichedRecords]);

  const avgGpsDistance = useMemo(() => {
    const distances = enrichedRecords
      .map((r) => r.record.distanceM)
      .filter((d): d is number => typeof d === 'number' && Number.isFinite(d));
    if (distances.length === 0) return null;
    return Math.round((distances.reduce((a, b) => a + b, 0) / distances.length) * 10) / 10;
  }, [enrichedRecords]);

  // Filtered table rows
  const filteredCheckedInRows = useMemo(() => {
    const q = tableSearch.trim().toLowerCase();
    return enrichedRecords.filter((item) => {
      if (methodFilter !== 'all') {
        if (methodFilter === 'manual') {
          if (
            item.record.method !== 'manual' &&
            item.record.method !== 'posted_qr' &&
            item.record.method !== 'email_link'
          ) {
            return false;
          }
        } else if (item.record.method !== methodFilter) {
          return false;
        }
      }
      if (!q) return true;
      const group = item.person?.groupName || '';
      const dept = item.person?.department || '';
      const phone = item.person?.phoneE164 || '';
      return (
        item.displayName.toLowerCase().includes(q) ||
        group.toLowerCase().includes(q) ||
        dept.toLowerCase().includes(q) ||
        phone.includes(q)
      );
    });
  }, [enrichedRecords, methodFilter, tableSearch]);

  const filteredMemberRows = useMemo(() => {
    const base = tableTab === 'at_risk' ? atRiskAbsentees : unarrivedMembers;
    const q = tableSearch.trim().toLowerCase();
    if (!q) return base;
    return base.filter((m) => {
      const fullName = `${m.firstName} ${m.lastName}`.toLowerCase();
      return (
        fullName.includes(q) ||
        (m.groupName || '').toLowerCase().includes(q) ||
        (m.department || '').toLowerCase().includes(q) ||
        (m.phoneE164 || '').includes(q)
      );
    });
  }, [tableTab, atRiskAbsentees, unarrivedMembers, tableSearch]);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshLivePremise();
      showToast('Live attendance insights synchronized');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleQuickRecordCheckin = () => {
    const targetId = quickMemberId || unarrivedMembers[0]?.id;
    if (!targetId) {
      showToast('All registered members are already checked in');
      return;
    }
    const conf = quickMethod === 'beacon' ? 96 : quickMethod === 'geofence' ? 88 : 95;
    const ok = checkInPerson(targetId, quickMethod, conf, 'Recorded from Live Attendance Insights');
    if (ok) {
      setQuickMemberId('');
    }
  };

  const handleExportInsightsCsv = () => {
    const headers = [
      'Attendee',
      'Status',
      'Cell Group',
      'Department',
      'Phone',
      'Checked In Time',
      'Punctuality',
      'Channel',
      'Confidence (%)',
      'GPS Distance (m)',
      'Service Session',
      'Service Date',
    ];

    const presentRows = enrichedRecords.map((item) => [
      `"${item.displayName.replace(/"/g, '""')}"`,
      '"Present"',
      `"${(item.person?.groupName || 'Unassigned').replace(/"/g, '""')}"`,
      `"${(item.person?.department || 'General').replace(/"/g, '""')}"`,
      `"${item.person?.phoneE164 || ''}"`,
      `"${item.record.checkedInAt || ''}"`,
      `"${item.isLate ? 'Late' : 'On Time'}"`,
      `"${item.record.method}"`,
      String(item.record.confidence || 95),
      item.record.distanceM != null ? String(item.record.distanceM) : '',
      `"${currentService.name.replace(/"/g, '""')}"`,
      `"${currentService.date || ''}"`,
    ]);

    const absentRows = unarrivedMembers.map((m) => [
      `"${`${m.firstName} ${m.lastName}`.trim().replace(/"/g, '""')}"`,
      `"Not Arrived (${m.consecutiveAbsences || 0} prior missed)"`,
      `"${(m.groupName || 'Unassigned').replace(/"/g, '""')}"`,
      `"${(m.department || 'General').replace(/"/g, '""')}"`,
      `"${m.phoneE164 || ''}"`,
      '""',
      '""',
      '""',
      '""',
      '""',
      `"${currentService.name.replace(/"/g, '""')}"`,
      `"${currentService.date || ''}"`,
    ]);

    const csvBody = [headers.join(','), ...presentRows.map((r) => r.join(',')), ...absentRows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvBody], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `ekklesphere-live-insights-${currentService.date || new Date().toISOString().split('T')[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Live attendance insights exported as CSV');
  };

  const formatMethodLabel = (method: AttendanceRecord['method']): string => {
    switch (method) {
      case 'geofence':
        return 'GPS Geofence';
      case 'beacon':
        return 'BLE Beacon';
      case 'usher':
        return 'Usher Desk';
      case 'posted_qr':
        return 'QR Pass';
      case 'email_link':
        return 'Email Link';
      default:
        return 'Manual';
    }
  };

  return (
    <div className="space-y-5">
      {/* Workspace Header & Session Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[#E9EBF5] dark:border-[#2D2D55]">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1D1B3A] dark:text-[#F2F2FA]">
            Live Attendance Insights
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#666A86] dark:text-[#A9ACC8] tabular-nums">
            <span>{systemSettings.campusName || 'PIWC KWADASO'}</span>
            <span aria-hidden="true">·</span>
            <span>
              {scopeMode === 'all'
                ? `All Sessions (${services.length})`
                : `${currentService.name}${currentService.date ? ` (${formatServiceDate(currentService.date)})` : ''}`}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {currentService.startsAt}–{currentService.endsAt} (15m punctuality grace)
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Service Session Selector */}
          <div className="flex items-center gap-1.5">
            <label htmlFor="insights-service-select" className="sr-only">
              Select worship service session
            </label>
            <select
              id="insights-service-select"
              value={scopeMode === 'all' ? '__all__' : activeServiceId}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '__all__') {
                  setScopeMode('all');
                } else {
                  setScopeMode('active');
                  setActiveServiceId(val);
                }
              }}
              className="min-h-[40px] px-3 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-[#1D1D3D] text-[#1D1B3A] dark:text-[#F2F2FA] border border-[#E9EBF5] dark:border-[#2D2D55] outline-none focus:border-[#6D5CF2]"
            >
              {services.map((svc) => (
                <option key={svc.id} value={svc.id}>
                  {svc.name}
                  {svc.date ? ` · ${formatServiceDate(svc.date)}` : ''} ({svc.startsAt})
                </option>
              ))}
              <option value="__all__">All Recorded Sessions</option>
            </select>
          </div>

          <button
            type="button"
            onClick={() => setIsAddServiceOpen(true)}
            className="min-h-[40px] px-3 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-[#1D1D3D] text-[#1D1B3A] dark:text-[#F2F2FA] border border-[#E9EBF5] dark:border-[#2D2D55] hover:bg-slate-50 dark:hover:bg-white/5 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <CalendarIcon className="w-3.5 h-3.5 text-[#6D5CF2]" />
            <span>Schedule Service</span>
          </button>

          <button
            type="button"
            onClick={handleManualRefresh}
            className="min-h-[40px] px-3 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-[#1D1D3D] text-[#1D1B3A] dark:text-[#F2F2FA] border border-[#E9EBF5] dark:border-[#2D2D55] hover:bg-slate-50 dark:hover:bg-white/5 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#6D5CF2] ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Sync Now</span>
          </button>

          <button
            type="button"
            onClick={handleExportInsightsCsv}
            className="min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#6D5CF2] hover:bg-[#5b4be0] text-white transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download CSV</span>
          </button>
        </div>
      </div>

      {/* Quick Arrival Check-In Bar (Real-Time Check-In Action) */}
      <div className="bg-white dark:bg-[#1D1D3D] rounded-2xl p-4 border border-[#E9EBF5] dark:border-[#2D2D55] flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="text-xs">
          <p className="font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
            Record Live Arrival
          </p>
          <p className="text-[#666A86] dark:text-[#A9ACC8]">
            {members.length === 0
              ? 'Add or import your congregation roster to start tracking live session arrivals.'
              : unarrivedMembers.length === 0
              ? 'Every member in your directory is checked in for this session.'
              : `${unarrivedMembers.length} registered ${unarrivedMembers.length === 1 ? 'member' : 'members'} awaiting arrival for ${currentService.name}.`}
          </p>
        </div>

        {members.length === 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            {onOpenAddMember && (
              <button
                type="button"
                onClick={onOpenAddMember}
                className="min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#6D5CF2] hover:bg-[#5b4be0] text-white inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Add First Member</span>
              </button>
            )}
            {onOpenImportModal && (
              <button
                type="button"
                onClick={onOpenImportModal}
                className="min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Import CSV Roster</span>
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="quick-checkin-member" className="sr-only">
              Select member to check in
            </label>
            <select
              id="quick-checkin-member"
              value={quickMemberId}
              onChange={(e) => setQuickMemberId(e.target.value)}
              disabled={unarrivedMembers.length === 0}
              className="min-h-[40px] px-3 py-2 rounded-xl text-xs bg-[#F6F7FC] dark:bg-[#14142E] text-[#1D1B3A] dark:text-[#F2F2FA] border border-[#E9EBF5] dark:border-[#2D2D55] outline-none focus:border-[#6D5CF2] min-w-[200px]"
            >
              <option value="">
                {unarrivedMembers.length > 0
                  ? `Select member (${unarrivedMembers[0].firstName} ${unarrivedMembers[0].lastName}…)`
                  : 'All members checked in'}
              </option>
              {unarrivedMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.firstName} {m.lastName} · {m.groupName || 'General'}
                </option>
              ))}
            </select>

            <label htmlFor="quick-checkin-method" className="sr-only">
              Check-in channel
            </label>
            <select
              id="quick-checkin-method"
              value={quickMethod}
              onChange={(e) => setQuickMethod(e.target.value as CheckinMethod)}
              disabled={unarrivedMembers.length === 0}
              className="min-h-[40px] px-3 py-2 rounded-xl text-xs bg-[#F6F7FC] dark:bg-[#14142E] text-[#1D1B3A] dark:text-[#F2F2FA] border border-[#E9EBF5] dark:border-[#2D2D55] outline-none focus:border-[#6D5CF2]"
            >
              <option value="usher">Usher Desk</option>
              <option value="geofence">GPS Geofence</option>
              <option value="beacon">BLE Beacon</option>
              <option value="posted_qr">Sanctuary QR</option>
              <option value="manual">Manual</option>
            </select>

            <button
              type="button"
              onClick={handleQuickRecordCheckin}
              disabled={unarrivedMembers.length === 0}
              className="min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#6D5CF2] hover:bg-[#5b4be0] disabled:opacity-50 text-white inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Check In Member</span>
            </button>
          </div>
        )}
      </div>

      {/* 4-Column Full-Width KPI Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* KPI 1: Sanctuary Turnout */}
        <div className="bg-white dark:bg-[#1D1D3D] rounded-2xl p-5 border border-[#E9EBF5] dark:border-[#2D2D55] flex flex-col justify-between">
          <div>
            <p className="text-xs font-semibold text-[#666A86] dark:text-[#A9ACC8]">
              Sanctuary Turnout
            </p>
            <div className="mt-2 flex items-baseline gap-2 tabular-nums">
              <span className="text-3xl font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                {totalCheckedIn}
              </span>
              <span className="text-sm text-[#666A86] dark:text-[#A9ACC8]">
                / {expectedCount} expected ({turnoutPct}%)
              </span>
            </div>
          </div>
          <div className="mt-4">
            <div className="w-full h-1.5 rounded-full bg-[#EFEDFF] dark:bg-[#2A2A55] overflow-hidden">
              <div
                className="h-full bg-[#6D5CF2] rounded-full transition-opacity duration-200"
                style={{ width: `${turnoutPct}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-[#666A86] dark:text-[#A9ACC8] tabular-nums">
              <span>{members.length} registered roster</span>
              <span>{remainingSeats} remaining</span>
            </div>
          </div>
        </div>

        {/* KPI 2: Punctuality & Peak Flow */}
        <div className="bg-white dark:bg-[#1D1D3D] rounded-2xl p-5 border border-[#E9EBF5] dark:border-[#2D2D55] flex flex-col justify-between">
          <div>
            <p className="text-xs font-semibold text-[#666A86] dark:text-[#A9ACC8]">
              On-Time Punctuality
            </p>
            <div className="mt-2 flex items-baseline gap-2 tabular-nums">
              <span className="text-3xl font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                {punctualityPct}%
              </span>
              <span className="text-sm text-[#666A86] dark:text-[#A9ACC8]">
                {onTimeCount} on time · {lateCount} late
              </span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-[#E9EBF5] dark:border-[#2D2D55] flex items-center justify-between text-xs text-[#666A86] dark:text-[#A9ACC8] tabular-nums">
            <span>Peak 15m window</span>
            <span className="font-semibold text-[#1D1B3A] dark:text-[#F2F2FA]">
              {peakWindowLabel}
            </span>
          </div>
        </div>

        {/* KPI 3: Automated vs Assisted */}
        <div className="bg-white dark:bg-[#1D1D3D] rounded-2xl p-5 border border-[#E9EBF5] dark:border-[#2D2D55] flex flex-col justify-between">
          <div>
            <p className="text-xs font-semibold text-[#666A86] dark:text-[#A9ACC8]">
              Automated Proximity Share
            </p>
            <div className="mt-2 flex items-baseline gap-2 tabular-nums">
              <span className="text-3xl font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                {automatedSharePct}%
              </span>
              <span className="text-sm text-[#666A86] dark:text-[#A9ACC8]">
                {automatedCount} auto · {assistedCount} assisted
              </span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-[#E9EBF5] dark:border-[#2D2D55] flex items-center justify-between text-xs text-[#666A86] dark:text-[#A9ACC8] tabular-nums">
            <span>Consent opt-in</span>
            <span className="font-semibold text-[#1D1B3A] dark:text-[#F2F2FA]">
              {autoCheckinOptedInCount}/{members.length} ({optInPercentage}%)
            </span>
          </div>
        </div>

        {/* KPI 4: Visitors & Pastoral Watch */}
        <div className="bg-white dark:bg-[#1D1D3D] rounded-2xl p-5 border border-[#E9EBF5] dark:border-[#2D2D55] flex flex-col justify-between">
          <div>
            <p className="text-xs font-semibold text-[#666A86] dark:text-[#A9ACC8]">
              Visitors & Absence Watch
            </p>
            <div className="mt-2 flex items-baseline gap-2 tabular-nums">
              <span className="text-3xl font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                {atRiskAbsentees.length}
              </span>
              <span className="text-sm text-[#666A86] dark:text-[#A9ACC8]">
                at-risk · {checkedInVisitorsCount} {checkedInVisitorsCount === 1 ? 'visitor' : 'visitors'} present
              </span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-[#E9EBF5] dark:border-[#2D2D55] flex items-center justify-between text-xs">
            <span className="text-[#666A86] dark:text-[#A9ACC8] tabular-nums">
              Threshold: {absenteeThreshold}+ missed
            </span>
            <button
              type="button"
              onClick={() => setTableTab('at_risk')}
              className="font-semibold text-[#6D5CF2] dark:text-[#8C7DFF] hover:underline cursor-pointer"
            >
              Review watchlist
            </button>
          </div>
        </div>
      </section>

      {/* Primary 2-Column Analytics Split: Arrival Velocity Timeline + Check-In Channels */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Arrival Velocity by 15-Minute Window */}
        <div className="lg:col-span-7 bg-white dark:bg-[#1D1D3D] rounded-2xl p-5 border border-[#E9EBF5] dark:border-[#2D2D55] flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
              <div>
                <h2 className="text-base font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                  Arrival Velocity Timeline
                </h2>
                <p className="text-xs text-[#666A86] dark:text-[#A9ACC8] tabular-nums">
                  15-minute arrival intervals anchored to {currentService.startsAt} service start
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs text-[#666A86] dark:text-[#A9ACC8]">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-[#6D5CF2]" />
                  On time
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-amber-500" />
                  After +15m grace
                </span>
              </div>
            </div>

            {totalCheckedIn === 0 ? (
              <div className="py-12 px-4 text-center border border-dashed border-[#E9EBF5] dark:border-[#2D2D55] rounded-xl">
                <p className="text-sm font-semibold text-[#1D1B3A] dark:text-[#F2F2FA]">
                  No arrivals recorded for this session yet
                </p>
                <p className="text-xs text-[#666A86] dark:text-[#A9ACC8] mt-1 max-w-md mx-auto">
                  As members enter the {systemSettings.innerGeofenceMeters}m sanctuary geofence, scan a door QR pass, or check in at the usher desk, 15-minute arrival velocity bars will populate live.
                </p>
              </div>
            ) : (
              <div className="pt-4 pb-2">
                <div className="grid grid-cols-8 gap-2 sm:gap-3 items-end h-44 pt-6 border-b border-[#E9EBF5] dark:border-[#2D2D55]">
                  {velocityBuckets.map((bucket) => {
                    const heightPct =
                      bucket.count > 0 ? Math.max(12, Math.round((bucket.count / maxBucketCount) * 100)) : 4;
                    return (
                      <div key={bucket.key} className="flex flex-col items-center justify-end h-full">
                        <span className="text-xs font-mono font-semibold text-[#1D1B3A] dark:text-[#F2F2FA] tabular-nums mb-1.5">
                          {bucket.count > 0 ? bucket.count : ''}
                        </span>
                        <div className="w-full max-w-[38px] flex-1 flex items-end justify-center">
                          <div
                            title={`${bucket.label}: ${bucket.count} check-ins`}
                            className={`w-full rounded-t-md transition-opacity duration-200 ${
                              bucket.count === 0
                                ? 'bg-slate-100 dark:bg-white/5'
                                : bucket.isAfterGrace
                                ? 'bg-amber-500'
                                : 'bg-[#6D5CF2]'
                            }`}
                            style={{ height: `${heightPct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="grid grid-cols-8 gap-2 sm:gap-3 mt-2 text-center">
                  {velocityBuckets.map((bucket) => (
                    <div key={`${bucket.key}-lbl`} className="min-w-0">
                      <span
                        className={`block text-[11px] font-mono tabular-nums truncate ${
                          bucket.isServiceStart
                            ? 'font-bold text-[#6D5CF2] dark:text-[#8C7DFF]'
                            : 'text-[#666A86] dark:text-[#A9ACC8]'
                        }`}
                      >
                        {bucket.label}
                      </span>
                      {bucket.isServiceStart && (
                        <span className="block text-[10px] font-semibold text-[#6D5CF2] dark:text-[#8C7DFF]">
                          Start
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-[#E9EBF5] dark:border-[#2D2D55] flex flex-wrap items-center justify-between gap-2 text-xs text-[#666A86] dark:text-[#A9ACC8] tabular-nums">
            <span>
              Early & on-time arrivals: <strong className="text-[#1D1B3A] dark:text-[#F2F2FA]">{onTimeCount}</strong>
            </span>
            <span>
              Late arrivals (&gt;{formatMinutesLabel(graceCutoffMin)}):{' '}
              <strong className="text-[#1D1B3A] dark:text-[#F2F2FA]">{lateCount}</strong>
            </span>
          </div>
        </div>

        {/* Check-In Channel Distribution */}
        <div className="lg:col-span-5 bg-white dark:bg-[#1D1D3D] rounded-2xl p-5 border border-[#E9EBF5] dark:border-[#2D2D55] flex flex-col justify-between">
          <div>
            <div className="mb-4">
              <h2 className="text-base font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                Check-In Channel Mix
              </h2>
              <p className="text-xs text-[#666A86] dark:text-[#A9ACC8]">
                Verification source share and mean signal confidence
              </p>
            </div>

            <div className="divide-y divide-[#E9EBF5] dark:divide-[#2D2D55]">
              {channelStats.map((ch) => (
                <div key={ch.id} className="py-2.5 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2 text-xs mb-1.5">
                    <span className="font-semibold text-[#1D1B3A] dark:text-[#F2F2FA]">
                      {ch.label}
                    </span>
                    <span className="font-mono text-[#666A86] dark:text-[#A9ACC8] tabular-nums">
                      {ch.count} ({ch.sharePct}%)
                      {ch.count > 0 ? ` · ${ch.avgConf}% conf` : ''}
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-[#F6F7FC] dark:bg-[#14142E] overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        ch.automated ? 'bg-[#4FBF98]' : 'bg-[#6D5CF2]'
                      }`}
                      style={{ width: `${ch.sharePct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[#E9EBF5] dark:border-[#2D2D55] flex items-center justify-between text-xs text-[#666A86] dark:text-[#A9ACC8] tabular-nums">
            <span>Mean verification confidence</span>
            <span className="font-mono font-semibold text-[#1D1B3A] dark:text-[#F2F2FA]">
              {totalCheckedIn > 0 ? `${avgConfidence}%` : '—'}
            </span>
          </div>
        </div>
      </section>

      {/* Secondary 2-Column Split: Group/Department Turnout + GPS Signal Integrity */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Cell Group & Department Turnout */}
        <div className="lg:col-span-7 bg-white dark:bg-[#1D1D3D] rounded-2xl p-5 border border-[#E9EBF5] dark:border-[#2D2D55] flex flex-col justify-between">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-base font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                  Congregation Turnout Breakdown
                </h2>
                <p className="text-xs text-[#666A86] dark:text-[#A9ACC8]">
                  Attendance participation across cells, ministries, and member status
                </p>
              </div>

              <div className="inline-flex items-center p-1 rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] self-start">
                {(
                  [
                    { id: 'group', label: 'Cell Groups' },
                    { id: 'department', label: 'Departments' },
                    { id: 'demographics', label: 'Demographics' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setGroupDimension(tab.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      groupDimension === tab.id
                        ? 'bg-white dark:bg-[#1D1D3D] text-[#1D1B3A] dark:text-[#F2F2FA] shadow-2xs'
                        : 'text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-[#F2F2FA]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {segmentTurnout.length === 0 ? (
              <div className="py-10 px-4 text-center border border-dashed border-[#E9EBF5] dark:border-[#2D2D55] rounded-xl">
                <p className="text-sm font-semibold text-[#1D1B3A] dark:text-[#F2F2FA]">
                  No roster segments available yet
                </p>
                <p className="text-xs text-[#666A86] dark:text-[#A9ACC8] mt-1">
                  Register members with their cell group and department to compare live turnout rates.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[#E9EBF5] dark:divide-[#2D2D55] max-h-64 overflow-y-auto pr-1">
                {segmentTurnout.map((seg) => (
                  <div key={seg.name} className="py-2.5 first:pt-0 last:pb-0">
                    <div className="flex items-center justify-between gap-2 text-xs mb-1.5">
                      <span className="font-semibold text-[#1D1B3A] dark:text-[#F2F2FA] truncate">
                        {seg.name}
                      </span>
                      <span className="font-mono text-[#666A86] dark:text-[#A9ACC8] tabular-nums shrink-0">
                        {seg.present}/{seg.total} ({seg.pct}%)
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-[#F6F7FC] dark:bg-[#14142E] overflow-hidden">
                      <div
                        className="h-full bg-[#6D5CF2] rounded-full"
                        style={{ width: `${seg.pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-[#E9EBF5] dark:border-[#2D2D55] flex items-center justify-between text-xs text-[#666A86] dark:text-[#A9ACC8] tabular-nums">
            <span>Active segments tracked: {segmentTurnout.length}</span>
            <span>Unarrived roster: {unarrivedMembers.length}</span>
          </div>
        </div>

        {/* Proximity & GPS Signal Integrity */}
        <div className="lg:col-span-5 bg-white dark:bg-[#1D1D3D] rounded-2xl p-5 border border-[#E9EBF5] dark:border-[#2D2D55] flex flex-col justify-between">
          <div>
            <div className="mb-4">
              <h2 className="text-base font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                Proximity & GPS Signal Integrity
              </h2>
              <p className="text-xs text-[#666A86] dark:text-[#A9ACC8]">
                Haversine perimeter audit ({systemSettings.innerGeofenceMeters}m inner ·{' '}
                {systemSettings.dwellTimeMinutes}m dwell)
              </p>
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-3 pb-4 border-b border-[#E9EBF5] dark:border-[#2D2D55] text-xs tabular-nums">
              <div className="flex items-center justify-between">
                <span className="text-[#666A86] dark:text-[#A9ACC8]">Accepted signals</span>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  {telemetrySummary.accepted}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#666A86] dark:text-[#A9ACC8]">Flagged margin</span>
                <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                  {telemetrySummary.flagged}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#666A86] dark:text-[#A9ACC8]">Rejected outside</span>
                <span className="font-mono font-bold text-rose-600 dark:text-rose-400">
                  {telemetrySummary.rejected}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#666A86] dark:text-[#A9ACC8]">Mock GPS blocked</span>
                <span className="font-mono font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                  {telemetrySummary.mockAttempts}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#666A86] dark:text-[#A9ACC8]">Mean GPS distance</span>
                <span className="font-mono font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                  {avgGpsDistance !== null ? `${avgGpsDistance} m` : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#666A86] dark:text-[#A9ACC8]">Avg session dwell</span>
                <span className="font-mono font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                  {telemetrySummary.avgDwellMinutes !== null
                    ? `${telemetrySummary.avgDwellMinutes} min`
                    : '—'}
                </span>
              </div>
            </div>

            <div className="mt-3">
              <p className="text-xs font-semibold text-[#1D1B3A] dark:text-[#F2F2FA] mb-2">
                Recent Perimeter Events
              </p>
              {telemetrySummary.recentSignals.length === 0 ? (
                <p className="text-xs text-[#666A86] dark:text-[#A9ACC8] py-4">
                  No raw GPS boundary pings logged in this server window yet. Mobile geofence arrivals will stream here automatically.
                </p>
              ) : (
                <div className="divide-y divide-[#E9EBF5] dark:divide-[#2D2D55] max-h-40 overflow-y-auto">
                  {telemetrySummary.recentSignals.slice(0, 5).map((sig) => (
                    <div
                      key={sig.id}
                      className="py-2 flex items-center justify-between gap-2 text-xs tabular-nums"
                    >
                      <div className="min-w-0">
                        <span className="font-semibold text-[#1D1B3A] dark:text-[#F2F2FA] truncate block">
                          {sig.person_name || sig.person_id || 'Member Device'}
                        </span>
                        <span className="text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
                          {sig.source}
                          {sig.distance_m !== null ? ` · ${sig.distance_m}m` : ''}
                        </span>
                      </div>
                      <span
                        className={`font-mono text-[11px] font-semibold shrink-0 ${
                          sig.status === 'accepted'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : sig.status === 'flagged'
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {sig.status === 'accepted'
                          ? 'Accepted'
                          : sig.status === 'flagged'
                          ? 'Flagged'
                          : 'Rejected'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[#E9EBF5] dark:border-[#2D2D55] flex items-center justify-between text-xs text-[#666A86] dark:text-[#A9ACC8] tabular-nums">
            <span>Total telemetry pings</span>
            <span className="font-mono font-semibold text-[#1D1B3A] dark:text-[#F2F2FA]">
              {telemetrySummary.totalSignals}
            </span>
          </div>
        </div>
      </section>

      {/* Live Arrival Feed & Absentee Watchlist Data Grid */}
      <section className="bg-white dark:bg-[#1D1D3D] rounded-2xl border border-[#E9EBF5] dark:border-[#2D2D55] overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-[#E9EBF5] dark:border-[#2D2D55] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Segmented View Selector */}
          <div className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55]">
            <button
              type="button"
              onClick={() => setTableTab('checked_in')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 tabular-nums cursor-pointer ${
                tableTab === 'checked_in'
                  ? 'bg-white dark:bg-[#1D1D3D] text-[#1D1B3A] dark:text-[#F2F2FA] shadow-2xs'
                  : 'text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-[#F2F2FA]'
              }`}
            >
              Checked-In Feed ({totalCheckedIn})
            </button>
            <button
              type="button"
              onClick={() => setTableTab('unarrived')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 tabular-nums cursor-pointer ${
                tableTab === 'unarrived'
                  ? 'bg-white dark:bg-[#1D1D3D] text-[#1D1B3A] dark:text-[#F2F2FA] shadow-2xs'
                  : 'text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-[#F2F2FA]'
              }`}
            >
              Not Yet Arrived ({unarrivedMembers.length})
            </button>
            <button
              type="button"
              onClick={() => setTableTab('at_risk')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 tabular-nums cursor-pointer ${
                tableTab === 'at_risk'
                  ? 'bg-white dark:bg-[#1D1D3D] text-[#1D1B3A] dark:text-[#F2F2FA] shadow-2xs'
                  : 'text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-[#F2F2FA]'
              }`}
            >
              At-Risk Absentees ({atRiskAbsentees.length})
            </button>
          </div>

          {/* Method Filters + Search Input */}
          <div className="flex flex-wrap items-center gap-2">
            {tableTab === 'checked_in' && (
              <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55]">
                {(
                  [
                    { id: 'all', label: 'All' },
                    { id: 'geofence', label: 'Geofence' },
                    { id: 'beacon', label: 'Beacon' },
                    { id: 'usher', label: 'Usher' },
                    { id: 'manual', label: 'QR / Manual' },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setMethodFilter(f.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      methodFilter === f.id
                        ? 'bg-white dark:bg-[#1D1D3D] text-[#1D1B3A] dark:text-[#F2F2FA] shadow-2xs'
                        : 'text-[#666A86] dark:text-[#A9ACC8]'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            )}

            <div className="relative min-w-[210px] flex-1 sm:flex-initial">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#666A86] dark:text-[#A9ACC8] pointer-events-none" />
              <input
                type="text"
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                placeholder="Filter by name, cell, phone..."
                aria-label="Filter attendance insights table"
                className="w-full min-h-[38px] pl-8 pr-3 py-1.5 rounded-xl text-xs bg-[#F6F7FC] dark:bg-[#14142E] text-[#1D1B3A] dark:text-[#F2F2FA] border border-[#E9EBF5] dark:border-[#2D2D55] outline-none focus:border-[#6D5CF2]"
              />
            </div>
          </div>
        </div>

        {/* Data Grid */}
        <div className="overflow-x-auto">
          {tableTab === 'checked_in' ? (
            filteredCheckedInRows.length === 0 ? (
              <div className="py-12 px-4 text-center">
                <p className="text-sm font-semibold text-[#1D1B3A] dark:text-[#F2F2FA]">
                  {totalCheckedIn === 0
                    ? 'No live check-ins recorded yet'
                    : 'No checked-in attendees match your current filter'}
                </p>
                <p className="text-xs text-[#666A86] dark:text-[#A9ACC8] mt-1">
                  {totalCheckedIn === 0
                    ? 'Use the Record Live Arrival bar above or the Usher Door Station to log arrivals.'
                    : 'Clear the search filter or switch channel tabs to view all arrivals.'}
                </p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E9EBF5] dark:border-[#2D2D55] bg-[#F6F7FC] dark:bg-[#14142E] text-[11px] font-semibold text-[#666A86] dark:text-[#A9ACC8]">
                    <th className="py-3 px-4">Attendee</th>
                    <th className="py-3 px-4">Cell Group · Department</th>
                    <th className="py-3 px-4">Arrival Time</th>
                    <th className="py-3 px-4">Channel</th>
                    <th className="py-3 px-4 text-right">Signal</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E9EBF5] dark:divide-[#2D2D55] text-xs">
                  {filteredCheckedInRows.map(({ record, person, displayName, isLate }) => (
                    <tr
                      key={record.id}
                      className="hover:bg-[#F6F7FC]/70 dark:hover:bg-white/5 transition-colors"
                    >
                      <td className="py-3 px-4 font-semibold text-[#1D1B3A] dark:text-[#F2F2FA]">
                        {displayName}
                        {person?.status === 'visitor' && (
                          <span className="ml-2 text-[11px] font-normal text-[#6D5CF2] dark:text-[#8C7DFF]">
                            · Visitor
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-[#666A86] dark:text-[#A9ACC8]">
                        {person?.groupName || 'General'}
                        {person?.department ? ` · ${person.department}` : ''}
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-[#1D1B3A] dark:text-[#F2F2FA]">
                        <span>{record.checkedInAt}</span>
                        <span
                          className={`ml-2 font-sans text-[11px] font-semibold ${
                            isLate
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {isLate ? 'Late' : 'On Time'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-[#1D1B3A] dark:text-[#F2F2FA]">
                        {formatMethodLabel(record.method)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-[#666A86] dark:text-[#A9ACC8]">
                        {record.confidence || 95}%
                        {record.distanceM != null ? ` · ${record.distanceM}m` : ''}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => removeCheckIn(record.personId)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[34px] rounded-lg text-xs font-semibold text-[#666A86] dark:text-[#A9ACC8] hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                        >
                          <Undo2 className="w-3.5 h-3.5" />
                          <span>Undo</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : filteredMemberRows.length === 0 ? (
            <div className="py-12 px-4 text-center">
              <p className="text-sm font-semibold text-[#1D1B3A] dark:text-[#F2F2FA]">
                {tableTab === 'at_risk'
                  ? 'No at-risk absentees right now'
                  : members.length === 0
                  ? 'Congregation directory is empty'
                  : 'Every matching member has arrived'}
              </p>
              <p className="text-xs text-[#666A86] dark:text-[#A9ACC8] mt-1">
                {tableTab === 'at_risk'
                  ? `Members who miss ${absenteeThreshold} or more consecutive services without checking in appear here automatically.`
                  : 'All registered members matching this view are accounted for.'}
              </p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E9EBF5] dark:border-[#2D2D55] bg-[#F6F7FC] dark:bg-[#14142E] text-[11px] font-semibold text-[#666A86] dark:text-[#A9ACC8]">
                  <th className="py-3 px-4">Member</th>
                  <th className="py-3 px-4">Cell Group · Department</th>
                  <th className="py-3 px-4">Phone</th>
                  <th className="py-3 px-4">Absence Streak</th>
                  <th className="py-3 px-4">Proximity Mode</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E9EBF5] dark:divide-[#2D2D55] text-xs">
                {filteredMemberRows.map((m) => {
                  const absences = m.consecutiveAbsences || 0;
                  return (
                    <tr
                      key={m.id}
                      className="hover:bg-[#F6F7FC]/70 dark:hover:bg-white/5 transition-colors"
                    >
                      <td className="py-3 px-4 font-semibold text-[#1D1B3A] dark:text-[#F2F2FA]">
                        {m.firstName} {m.lastName}
                      </td>
                      <td className="py-3 px-4 text-[#666A86] dark:text-[#A9ACC8]">
                        {m.groupName || 'General'}
                        {m.department ? ` · ${m.department}` : ''}
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-[#666A86] dark:text-[#A9ACC8]">
                        {m.phoneE164 || '—'}
                      </td>
                      <td className="py-3 px-4 tabular-nums">
                        <span
                          className={
                            absences >= absenteeThreshold
                              ? 'font-semibold text-rose-600 dark:text-rose-400'
                              : 'text-[#666A86] dark:text-[#A9ACC8]'
                          }
                        >
                          {absences === 0
                            ? '0 missed'
                            : `Missed ${absences} ${absences === 1 ? 'service' : 'services'}`}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-[#666A86] dark:text-[#A9ACC8]">
                        {m.autoCheckinOptedIn ? 'Auto Geofence' : 'Manual Check-In'}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              checkInPerson(m.id, 'usher', 95, 'Checked in from Attendance Insights')
                            }
                            className="px-2.5 py-1.5 min-h-[34px] rounded-lg text-xs font-semibold bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] hover:bg-[#6D5CF2] hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            Check In
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              addFollowupTask(
                                m.id,
                                absences >= 3 ? 'absent_3' : 'absent_2',
                                'Assigned from Live Attendance Insights watchlist'
                              )
                            }
                            className="px-2.5 py-1.5 min-h-[34px] rounded-lg text-xs font-semibold border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] hover:bg-slate-50 dark:hover:bg-white/5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            Assign Care
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
};
