import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ReferenceLine,
} from 'recharts';
import {
  Calendar,
  User,
  ChevronDown,
  CheckCircle2,
  XCircle,
  Clock,
  Radio,
  Users,
  Search,
  Sparkles,
} from 'lucide-react';
import { useEkklesphere } from '../../context/EkklesphereContext';
import { AttendanceRecord, CheckinMethod, Person } from '../../types/ekklesphere';

export type FrequencyPeriod = '4w' | '8w' | '12w' | '24w';

interface MemberAttendanceFrequencyChartProps {
  initialMemberId?: string;
  onOpenFollowup?: (memberId: string) => void;
  className?: string;
}

interface MemberWeekSlot {
  weekKey: string;
  label: string;
  shortDate: string;
  startDateIso: string;
  endDateIso: string;
  attended: number; // 1 if attended, 0 if absent
  attendedLabel: string;
  method: CheckinMethod | 'none';
  methodLabel: string;
  late: boolean;
  confidence: number;
  timeLabel: string;
  fillColor: string;
}

interface CohortSlot {
  cohort: string;
  rangeLabel: string;
  count: number;
  percentage: number;
  fillColor: string;
}

const PERIOD_WEEKS: Record<FrequencyPeriod, number> = {
  '4w': 4,
  '8w': 8,
  '12w': 12,
  '24w': 24,
};

const METHOD_COLOR_MAP: Record<CheckinMethod | 'none', string> = {
  geofence: '#6D5CF2', // Primary Indigo
  beacon: '#4FBF98', // Mint Teal
  posted_qr: '#06B6D4', // Cyan
  usher: '#F59E0B', // Amber
  manual: '#8B5CF6', // Purple
  email_link: '#6366F1', // Indigo Light
  none: '#E2E8F0', // Neutral Light
};

const METHOD_DISPLAY_NAMES: Record<CheckinMethod | 'none', string> = {
  geofence: 'GPS Geofence Dwell',
  beacon: 'Entrance BLE Beacon',
  posted_qr: 'Sanctuary QR Code',
  usher: 'Usher Station Scan',
  manual: 'Manual Check-in',
  email_link: 'Email Portal Link',
  none: 'Absent (No Record)',
};

const formatLocalIso = (d: Date): string => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

export const MemberAttendanceFrequencyChart: React.FC<MemberAttendanceFrequencyChartProps> = ({
  initialMemberId,
  onOpenFollowup,
  className = '',
}) => {
  const { members, attendanceRecords, theme, services, showToast } = useEkklesphere();
  const isDark = theme === 'dark';

  const [period, setPeriod] = useState<FrequencyPeriod>('8w');
  const [viewMode, setViewMode] = useState<'individual' | 'cohorts'>('individual');
  const [selectedMemberId, setSelectedMemberId] = useState<string>(() => {
    if (initialMemberId && members.some((m) => m.id === initialMemberId)) {
      return initialMemberId;
    }
    // Prefer member with existing attendance records, or first member
    const activeWithRecord = members.find((m) =>
      attendanceRecords.some((r) => r.personId === m.id)
    );
    return activeWithRecord?.id || members[0]?.id || '';
  });
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [isMemberDropdownOpen, setIsMemberDropdownOpen] = useState(false);

  // Sync selectedMemberId if members change or none selected
  const activeMember = useMemo(() => {
    return members.find((m) => m.id === selectedMemberId) || members[0] || null;
  }, [members, selectedMemberId]);

  // Filter members for picker dropdown
  const filteredMemberList = useMemo(() => {
    if (!memberSearchQuery.trim()) return members.slice(0, 30);
    const q = memberSearchQuery.toLowerCase();
    return members
      .filter(
        (m) =>
          m.firstName.toLowerCase().includes(q) ||
          m.lastName.toLowerCase().includes(q) ||
          (m.phoneE164 && m.phoneE164.includes(q)) ||
          (m.groupName && m.groupName.toLowerCase().includes(q))
      )
      .slice(0, 30);
  }, [members, memberSearchQuery]);

  // Compute weeks slots anchored from today backwards
  const weeksCount = PERIOD_WEEKS[period];

  const weekRanges = useMemo(() => {
    const list: Array<{ start: Date; end: Date; weekIdx: number }> = [];
    const now = new Date();
    // Anchor to Sunday
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    for (let i = weeksCount - 1; i >= 0; i--) {
      const end = new Date(today);
      end.setDate(today.getDate() - i * 7);
      const start = new Date(end);
      start.setDate(end.getDate() - 6);
      list.push({ start, end, weekIdx: weeksCount - i });
    }
    return list;
  }, [weeksCount]);

  // Build individual attendance data per week for selected member
  const memberWeekData = useMemo<MemberWeekSlot[]>(() => {
    if (!activeMember) return [];

    const memberRecords = attendanceRecords.filter((r) => r.personId === activeMember.id);

    return weekRanges.map((range, idx) => {
      const startIso = formatLocalIso(range.start);
      const endIso = formatLocalIso(range.end);

      // Find if member attended within this week
      const record = memberRecords.find((rec) => {
        let recDate = '';
        if (rec.checkedInIso && rec.checkedInIso.includes('T')) {
          recDate = rec.checkedInIso.split('T')[0];
        } else if (rec.checkedInAt) {
          const parsed = new Date(rec.checkedInAt);
          if (!isNaN(parsed.getTime())) {
            recDate = formatLocalIso(parsed);
          }
        }
        if (!recDate && rec.serviceInstanceId) {
          const matchedService = services.find((s) => s.id === rec.serviceInstanceId);
          if (matchedService?.date) recDate = matchedService.date;
        }

        // Fallback for current active service check-in
        if (!recDate) {
          recDate = formatLocalIso(new Date());
        }

        return recDate >= startIso && recDate <= endIso;
      });

      const sLabel = range.end.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
      });

      const attended = record ? 1 : 0;
      const method = record?.method || 'none';
      const late = Boolean(record?.late);
      const confidence = record?.confidence || (record ? 95 : 0);

      const fillColor = attended
        ? METHOD_COLOR_MAP[method] || '#6D5CF2'
        : isDark
        ? '#25254B'
        : '#E2E8F0';

      return {
        weekKey: `w-${idx + 1}`,
        label: `W${idx + 1}`,
        shortDate: sLabel,
        startDateIso: startIso,
        endDateIso: endIso,
        attended,
        attendedLabel: attended ? 'Present' : 'Absent',
        method,
        methodLabel: METHOD_DISPLAY_NAMES[method] || 'No Check-in',
        late,
        confidence,
        timeLabel: record?.checkedInAt || '—',
        fillColor,
      };
    });
  }, [activeMember, attendanceRecords, weekRanges, services, isDark]);

  // Aggregate metrics for selected member
  const memberStats = useMemo(() => {
    if (!memberWeekData.length) {
      return {
        attendedWeeks: 0,
        totalWeeks: weeksCount,
        frequencyPct: 0,
        onTimePct: 100,
        currentStreak: 0,
        primaryMethod: 'None',
      };
    }

    const attendedWeeks = memberWeekData.filter((w) => w.attended === 1).length;
    const frequencyPct = Math.round((attendedWeeks / memberWeekData.length) * 100);

    const attendedItems = memberWeekData.filter((w) => w.attended === 1);
    const onTimeCount = attendedItems.filter((w) => !w.late).length;
    const onTimePct =
      attendedItems.length > 0 ? Math.round((onTimeCount / attendedItems.length) * 100) : 100;

    // Consecutive streak (from latest week backwards)
    let currentStreak = 0;
    for (let i = memberWeekData.length - 1; i >= 0; i--) {
      if (memberWeekData[i].attended === 1) {
        currentStreak++;
      } else {
        break;
      }
    }

    // Method breakdown
    const methodCounts = new Map<CheckinMethod, number>();
    for (const item of attendedItems) {
      if (item.method !== 'none') {
        methodCounts.set(item.method, (methodCounts.get(item.method) || 0) + 1);
      }
    }
    let topMethod: CheckinMethod | 'none' = 'none';
    let topCount = 0;
    for (const [m, count] of methodCounts.entries()) {
      if (count > topCount) {
        topCount = count;
        topMethod = m;
      }
    }

    return {
      attendedWeeks,
      totalWeeks: memberWeekData.length,
      frequencyPct,
      onTimePct,
      currentStreak,
      primaryMethod: topMethod !== 'none' ? METHOD_DISPLAY_NAMES[topMethod] : 'Awaiting check-in',
    };
  }, [memberWeekData, weeksCount]);

  // Congregation Cohort Distribution
  const cohortData = useMemo<CohortSlot[]>(() => {
    if (!members.length) return [];

    let regular = 0; // >= 75%
    let consistent = 0; // 50 - 74%
    let occasional = 0; // 25 - 49%
    let atRisk = 0; // < 25%

    const totalWeeks = weekRanges.length;

    for (const m of members) {
      const memberRecs = attendanceRecords.filter((r) => r.personId === m.id);
      let attendedCount = 0;

      for (const range of weekRanges) {
        const startIso = formatLocalIso(range.start);
        const endIso = formatLocalIso(range.end);
        const didAttend = memberRecs.some((rec) => {
          let recDate = rec.checkedInIso?.split('T')[0];
          if (!recDate && rec.checkedInAt) {
            const parsed = new Date(rec.checkedInAt);
            if (!isNaN(parsed.getTime())) recDate = formatLocalIso(parsed);
          }
          if (!recDate) recDate = formatLocalIso(new Date());
          return recDate >= startIso && recDate <= endIso;
        });
        if (didAttend) attendedCount++;
      }

      const freqPct = totalWeeks > 0 ? (attendedCount / totalWeeks) * 100 : 0;
      if (freqPct >= 75) regular++;
      else if (freqPct >= 50) consistent++;
      else if (freqPct >= 25) occasional++;
      else atRisk++;
    }

    const total = members.length;

    return [
      {
        cohort: 'Regular (75–100%)',
        rangeLabel: '3+ services per mo',
        count: regular,
        percentage: total > 0 ? Math.round((regular / total) * 100) : 0,
        fillColor: '#4FBF98', // Mint
      },
      {
        cohort: 'Consistent (50–74%)',
        rangeLabel: '2 services per mo',
        count: consistent,
        percentage: total > 0 ? Math.round((consistent / total) * 100) : 0,
        fillColor: '#6D5CF2', // Indigo
      },
      {
        cohort: 'Occasional (25–49%)',
        rangeLabel: '1 service per mo',
        count: occasional,
        percentage: total > 0 ? Math.round((occasional / total) * 100) : 0,
        fillColor: '#F59E0B', // Amber
      },
      {
        cohort: 'At-Risk (<25%)',
        rangeLabel: '0–1 service in period',
        count: atRisk,
        percentage: total > 0 ? Math.round((atRisk / total) * 100) : 0,
        fillColor: '#EF5A6F', // Rose Coral
      },
    ];
  }, [members, attendanceRecords, weekRanges]);

  return (
    <section
      className={`bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-[0_10px_30px_rgba(60,50,140,0.07)] border border-[#E9EBF5] dark:border-[#2D2D55] transition-colors ${className}`}
      aria-label="Member Attendance Frequency Visualization"
    >
      {/* Header Row: Title, View Switcher & Period Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 mb-4 border-b border-[#E9EBF5] dark:border-[#2D2D55]">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
              Member Attendance Frequency
            </h2>
            <span className="text-[11px] font-semibold text-[#666A86] dark:text-[#A9ACC8] font-mono tabular-nums">
              ({weeksCount} weeks)
            </span>
          </div>
          <p className="text-xs text-[#666A86] dark:text-[#A9ACC8] mt-0.5">
            Visualize individual member regularity, streaks, and check-in methods over selected periods.
          </p>
        </div>

        {/* View Toggle & Period Tabs */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Mode toggle */}
          <div className="inline-flex rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] p-0.5 border border-[#E9EBF5] dark:border-[#2D2D55]">
            <button
              type="button"
              onClick={() => setViewMode('individual')}
              className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                viewMode === 'individual'
                  ? 'bg-white dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] shadow-xs'
                  : 'text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-white'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <User className="w-3.5 h-3.5" />
                <span>Single Member</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('cohorts')}
              className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                viewMode === 'cohorts'
                  ? 'bg-white dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] shadow-xs'
                  : 'text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-white'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                <span>Congregation Cohorts</span>
              </span>
            </button>
          </div>

          {/* Period selector */}
          <div className="inline-flex rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] p-0.5 border border-[#E9EBF5] dark:border-[#2D2D55]">
            {(['4w', '8w', '12w', '24w'] as const).map((pKey) => (
              <button
                key={pKey}
                type="button"
                onClick={() => setPeriod(pKey)}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  period === pKey
                    ? 'bg-[#6D5CF2] text-white shadow-xs'
                    : 'text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-white'
                }`}
              >
                {pKey.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* INDIVIDUAL MEMBER VIEW CONTROLS */}
      {viewMode === 'individual' && (
        <div className="mb-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-[#F6F7FC] dark:bg-[#14142E] p-3 rounded-2xl border border-[#E9EBF5] dark:border-[#2D2D55]">
            {/* Member Dropdown Picker */}
            <div className="relative flex-1 max-w-md">
              <button
                type="button"
                onClick={() => setIsMemberDropdownOpen(!isMemberDropdownOpen)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-white dark:bg-[#1D1D3D] rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] text-left text-xs transition-all hover:border-[#6D5CF2] cursor-pointer"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] font-bold text-xs flex items-center justify-center shrink-0">
                    {activeMember
                      ? `${activeMember.firstName[0] || 'M'}${activeMember.lastName[0] || ''}`
                      : 'M'}
                  </div>
                  <div className="min-w-0">
                    <span className="font-bold text-[#1D1B3A] dark:text-[#F2F2FA] block truncate">
                      {activeMember
                        ? `${activeMember.firstName} ${activeMember.lastName}`
                        : 'Select Member'}
                    </span>
                    <span className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] block truncate font-mono">
                      {activeMember?.phoneE164 || activeMember?.groupName || 'Member'}
                    </span>
                  </div>
                </div>
                <ChevronDown className="w-4 h-4 text-[#666A86] dark:text-[#A9ACC8] shrink-0" />
              </button>

              {/* Dropdown Menu */}
              {isMemberDropdownOpen && (
                <div className="absolute left-0 right-0 top-full mt-1.5 z-40 bg-white dark:bg-[#1D1D3D] rounded-2xl border border-[#E9EBF5] dark:border-[#2D2D55] shadow-xl p-2 max-h-72 flex flex-col animate-in fade-in zoom-in-95 duration-100">
                  <div className="relative mb-2">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-[#666A86]" />
                    <input
                      type="text"
                      placeholder="Search member by name or phone..."
                      value={memberSearchQuery}
                      onChange={(e) => setMemberSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#F6F7FC] dark:bg-[#14142E] rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] focus:outline-none focus:border-[#6D5CF2]"
                      autoFocus
                    />
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-1 pr-1">
                    {filteredMemberList.map((m) => {
                      const isSelected = m.id === selectedMemberId;
                      const hasRecords = attendanceRecords.some((r) => r.personId === m.id);
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setSelectedMemberId(m.id);
                            setIsMemberDropdownOpen(false);
                            setMemberSearchQuery('');
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-left text-xs transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] font-bold'
                              : 'hover:bg-slate-50 dark:hover:bg-white/5 text-[#1D1B3A] dark:text-[#F2F2FA]'
                          }`}
                        >
                          <div className="truncate">
                            <span className="block truncate font-semibold">
                              {m.firstName} {m.lastName}
                            </span>
                            <span className="text-[10px] text-[#666A86] dark:text-[#A9ACC8] font-mono">
                              {m.phoneE164 || m.groupName || 'Member'}
                            </span>
                          </div>
                          {hasRecords && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
                              Active
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Quick Filter Shortcuts */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] text-[#666A86] dark:text-[#A9ACC8]">Quick pick:</span>
              <button
                type="button"
                onClick={() => {
                  const regular = members.find((m) => (m.consecutiveAbsences || 0) === 0);
                  if (regular) {
                    setSelectedMemberId(regular.id);
                    showToast(`Selected regular attender: ${regular.firstName} ${regular.lastName}`);
                  }
                }}
                className="px-2 py-1 rounded-lg text-[11px] font-bold bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] hover:text-[#6D5CF2] transition-colors cursor-pointer"
              >
                Top Attender
              </button>
              <button
                type="button"
                onClick={() => {
                  const atRiskMember = members.find((m) => (m.consecutiveAbsences || 0) >= 2);
                  if (atRiskMember) {
                    setSelectedMemberId(atRiskMember.id);
                    showToast(`Selected at-risk member: ${atRiskMember.firstName} ${atRiskMember.lastName}`);
                  } else {
                    showToast('No members currently at 2+ consecutive absences.');
                  }
                }}
                className="px-2 py-1 rounded-lg text-[11px] font-bold bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#EF5A6F] hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
              >
                At-Risk Member
              </button>
            </div>
          </div>

          {/* Key Metric Highlights for Selected Member */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-3">
            <div className="bg-[#F6F7FC] dark:bg-[#14142E] rounded-xl p-2.5 border border-[#E9EBF5] dark:border-[#2D2D55]">
              <span className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] block">
                Attendance Frequency
              </span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-xl font-bold font-mono text-[#6D5CF2] dark:text-[#8C7DFF]">
                  {memberStats.frequencyPct}%
                </span>
                <span className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] font-mono">
                  ({memberStats.attendedWeeks}/{memberStats.totalWeeks})
                </span>
              </div>
            </div>

            <div className="bg-[#F6F7FC] dark:bg-[#14142E] rounded-xl p-2.5 border border-[#E9EBF5] dark:border-[#2D2D55]">
              <span className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] block">
                Current Streak
              </span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-xl font-bold font-mono text-[#4FBF98]">
                  {memberStats.currentStreak}
                </span>
                <span className="text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
                  {memberStats.currentStreak === 1 ? 'service' : 'services in a row'}
                </span>
              </div>
            </div>

            <div className="bg-[#F6F7FC] dark:bg-[#14142E] rounded-xl p-2.5 border border-[#E9EBF5] dark:border-[#2D2D55]">
              <span className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] block">
                Punctuality Rate
              </span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-xl font-bold font-mono text-[#1D1B3A] dark:text-[#F2F2FA]">
                  {memberStats.onTimePct}%
                </span>
                <span className="text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
                  on-time
                </span>
              </div>
            </div>

            <div className="bg-[#F6F7FC] dark:bg-[#14142E] rounded-xl p-2.5 border border-[#E9EBF5] dark:border-[#2D2D55]">
              <span className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] block">
                Primary Check-in Mode
              </span>
              <div className="mt-0.5 text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] truncate">
                {memberStats.primaryMethod}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* RECHARTS CHART RENDERING */}
      <div className="w-full min-w-0" style={{ height: 230 }}>
        {viewMode === 'individual' ? (
          <ResponsiveContainer width="100%" height={230}>
            <BarChart
              data={memberWeekData}
              margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={isDark ? '#2D2D55' : '#E9EBF5'}
                vertical={false}
              />
              <XAxis
                dataKey="shortDate"
                tick={{ fill: isDark ? '#A9ACC8' : '#666A86', fontSize: 11 }}
                axisLine={{ stroke: isDark ? '#2D2D55' : '#E9EBF5' }}
                tickLine={false}
              />
              <YAxis
                domain={[0, 1]}
                ticks={[0, 1]}
                tickFormatter={(val) => (val === 1 ? 'Present' : 'Absent')}
                tick={{ fill: isDark ? '#A9ACC8' : '#666A86', fontSize: 10 }}
                axisLine={{ stroke: isDark ? '#2D2D55' : '#E9EBF5' }}
                tickLine={false}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload || !payload.length) return null;
                  const item = payload[0].payload as MemberWeekSlot;
                  return (
                    <div className="bg-white dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] rounded-xl p-3 shadow-xl text-xs min-w-[200px]">
                      <div className="pb-1.5 mb-1.5 border-b border-[#E9EBF5] dark:border-[#2D2D55] flex items-center justify-between">
                        <span className="font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                          {item.shortDate} ({item.label})
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                            item.attended
                              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400'
                              : 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {item.attendedLabel}
                        </span>
                      </div>
                      {item.attended === 1 ? (
                        <div className="space-y-1 font-mono text-[11px]">
                          <div className="flex justify-between">
                            <span className="text-[#666A86] dark:text-[#A9ACC8]">Method:</span>
                            <span className="font-semibold text-[#6D5CF2] dark:text-[#8C7DFF]">
                              {item.methodLabel}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[#666A86] dark:text-[#A9ACC8]">Punctuality:</span>
                            <span className={item.late ? 'text-[#EF5A6F]' : 'text-[#4FBF98]'}>
                              {item.late ? 'Late Arrival' : 'On-Time'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[#666A86] dark:text-[#A9ACC8]">Confidence:</span>
                            <span className="text-[#1D1B3A] dark:text-[#F2F2FA]">
                              {item.confidence}%
                            </span>
                          </div>
                        </div>
                      ) : (
                        <p className="text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
                          No arrival signal recorded for this week.
                        </p>
                      )}
                    </div>
                  );
                }}
              />
              <Bar dataKey="attended" radius={[6, 6, 0, 0]} maxBarSize={36}>
                {memberWeekData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fillColor} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height={230}>
            <BarChart
              data={cohortData}
              margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={isDark ? '#2D2D55' : '#E9EBF5'}
                vertical={false}
              />
              <XAxis
                dataKey="cohort"
                tick={{ fill: isDark ? '#A9ACC8' : '#666A86', fontSize: 11 }}
                axisLine={{ stroke: isDark ? '#2D2D55' : '#E9EBF5' }}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: isDark ? '#A9ACC8' : '#666A86', fontSize: 11 }}
                axisLine={{ stroke: isDark ? '#2D2D55' : '#E9EBF5' }}
                tickLine={false}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload || !payload.length) return null;
                  const item = payload[0].payload as CohortSlot;
                  return (
                    <div className="bg-white dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] rounded-xl p-3 shadow-xl text-xs min-w-[200px]">
                      <div className="pb-1.5 mb-1.5 border-b border-[#E9EBF5] dark:border-[#2D2D55]">
                        <span className="font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                          {item.cohort}
                        </span>
                        <span className="block text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
                          {item.rangeLabel}
                        </span>
                      </div>
                      <div className="flex justify-between font-mono text-[11px]">
                        <span className="text-[#666A86] dark:text-[#A9ACC8]">Members:</span>
                        <span className="font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                          {item.count} ({item.percentage}%)
                        </span>
                      </div>
                    </div>
                  );
                }}
              />
              <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={48}>
                {cohortData.map((entry, index) => (
                  <Cell key={`cohort-cell-${index}`} fill={entry.fillColor} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Legend & Footer Note */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 mt-3 border-t border-[#E9EBF5] dark:border-[#2D2D55] text-xs">
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
          {viewMode === 'individual' ? (
            <>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#6D5CF2]" />
                <span>Geofence Dwell</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#4FBF98]" />
                <span>BLE Beacon</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#06B6D4]" />
                <span>QR Pass</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#F59E0B]" />
                <span>Usher Door</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-300 dark:bg-slate-600" />
                <span>Absent</span>
              </span>
            </>
          ) : (
            <span>
              Showing full congregation frequency distribution across {members.length} registered members.
            </span>
          )}
        </div>

        {viewMode === 'individual' && activeMember && onOpenFollowup && (
          <button
            type="button"
            onClick={() => onOpenFollowup(activeMember.id)}
            className="text-[11px] font-bold text-[#6D5CF2] dark:text-[#8C7DFF] hover:underline cursor-pointer"
          >
            Create Follow-up Task →
          </button>
        )}
      </div>
    </section>
  );
};
