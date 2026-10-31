import React, { useState, useEffect, useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell,
  LabelList,
} from 'recharts';
import { ArrowUpRight, UserPlus } from 'lucide-react';
import { useEkklesphere } from '../../context/EkklesphereContext';
import {
  AttendanceRecord,
  ThirtyDayAttendanceTrendResponse,
  WeeklyAttendanceBucket,
} from '../../types/ekklesphere';

type TrendViewMode = 'total' | 'channels' | 'punctuality';

interface WeeklyAttendanceTrendChartProps {
  onOpenInsights?: () => void;
  onQuickCheckin?: () => void;
}

const formatLocalIso = (d: Date): string => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const formatShortWeek = (start: Date, end: Date): string => {
  const sDay = start.getDate();
  const eDay = end.getDate();
  const sMonth = start.toLocaleDateString('en-GB', { month: 'short' });
  const eMonth = end.toLocaleDateString('en-GB', { month: 'short' });
  if (sDay === eDay && sMonth === eMonth) return `${sDay} ${sMonth}`;
  if (sMonth === eMonth) return `${sDay}–${eDay} ${sMonth}`;
  return `${sDay} ${sMonth}–${eDay} ${eMonth}`;
};

const formatFullWeekRange = (start: Date, end: Date): string => {
  const sFmt = start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const eFmt = end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  if (formatLocalIso(start) === formatLocalIso(end)) {
    return end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  return `${sFmt} – ${eFmt}`;
};

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: WeeklyAttendanceBucket }>;
  congregationSize: number;
}

const CustomTrendTooltip: React.FC<CustomTooltipProps> = ({ active, payload, congregationSize }) => {
  if (!active || !payload || payload.length === 0) return null;
  const bucket = payload[0]?.payload;
  if (!bucket) return null;

  return (
    <div className="bg-white dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] rounded-2xl p-3.5 shadow-[0_12px_32px_rgba(29,27,58,0.16)] min-w-[210px] tabular-nums">
      <div className="pb-2 mb-2 border-b border-[#E9EBF5] dark:border-[#2D2D55]">
        <p className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
          {bucket.fullRangeLabel}
        </p>
        <p className="text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
          {bucket.isCurrentWeek ? 'Current week' : 'Past week'} · {bucket.servicesCount}{' '}
          {bucket.servicesCount === 1 ? 'service' : 'services'}
        </p>
      </div>

      <div className="space-y-1.5 text-xs">
        <div className="flex items-center justify-between gap-4">
          <span className="text-[#666A86] dark:text-[#A9ACC8]">Total check-ins</span>
          <span className="font-bold text-[#6D5CF2] dark:text-[#8C7DFF]">{bucket.totalCheckins}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-[#666A86] dark:text-[#A9ACC8]">Unique attendees</span>
          <span className="font-bold text-[#4FBF98]">
            {bucket.uniqueAttendees}
            {congregationSize > 0 ? ` (${bucket.engagementRatePct}%)` : ''}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-[#666A86] dark:text-[#A9ACC8]">Auto / Door & QR</span>
          <span className="font-semibold text-[#1D1B3A] dark:text-[#F2F2FA]">
            {bucket.autoProximityCount} / {bucket.assistedDoorCount}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-[#666A86] dark:text-[#A9ACC8]">On-time / Late</span>
          <span className="font-semibold text-[#1D1B3A] dark:text-[#F2F2FA]">
            {bucket.onTimeCount} / {bucket.lateCount}
          </span>
        </div>
      </div>
    </div>
  );
};

export const WeeklyAttendanceTrendChart: React.FC<WeeklyAttendanceTrendChartProps> = ({
  onOpenInsights,
  onQuickCheckin,
}) => {
  const {
    theme,
    attendanceRecords,
    services,
    members,
    expectedAttendance,
    currentUser,
    showToast,
  } = useEkklesphere();

  const [viewMode, setViewMode] = useState<TrendViewMode>('total');
  const [serverHistoricalRecords, setServerHistoricalRecords] = useState<AttendanceRecord[]>([]);

  const isDark = theme === 'dark';

  useEffect(() => {
    let cancelled = false;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-user-role': currentUser?.role || 'admin',
      'x-user-id': currentUser?.id || 'admin-client',
      'x-user-email': currentUser?.email || 'admin@church.org',
    };
    if (currentUser?.tenant_id) headers['x-tenant-id'] = currentUser.tenant_id;
    if (currentUser?.campus_id) headers['x-campus-id'] = currentUser.campus_id;

    fetch('/api/attendance/weekly-trend', { headers })
      .then((res) => (res.ok ? (res.json() as Promise<ThirtyDayAttendanceTrendResponse>) : null))
      .then((data) => {
        if (!cancelled && data && Array.isArray(data.historicalRecords)) {
          setServerHistoricalRecords(data.historicalRecords);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [
    attendanceRecords.length,
    services.length,
    currentUser?.role,
    currentUser?.id,
    currentUser?.email,
    currentUser?.tenant_id,
    currentUser?.campus_id,
  ]);

  const trendAnalytics = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const windowStart = new Date(today);
    windowStart.setDate(today.getDate() - 29);

    const startDateIso = formatLocalIso(windowStart);
    const endDateIso = formatLocalIso(today);

    const serviceDateMap = new Map<string, string>();
    for (const svc of services) {
      if (svc.id && svc.date && /^\d{4}-\d{2}-\d{2}$/.test(svc.date)) {
        serviceDateMap.set(svc.id, svc.date);
      }
    }

    const mergedRecords = new Map<string, AttendanceRecord>();
    for (const rec of serverHistoricalRecords) {
      const key = `${rec.serviceInstanceId || 'svc'}::${rec.personId}`;
      mergedRecords.set(key, rec);
    }
    for (const rec of attendanceRecords) {
      const key = `${rec.serviceInstanceId || 'svc'}::${rec.personId}`;
      mergedRecords.set(key, rec);
    }

    const rawBuckets: Array<{
      weekKey: string;
      startDate: string;
      endDate: string;
      shortLabel: string;
      fullRangeLabel: string;
      isCurrentWeek: boolean;
      records: AttendanceRecord[];
      serviceIds: Set<string>;
    }> = [];

    const cursor = new Date(windowStart);
    while (cursor.getTime() <= today.getTime()) {
      const bStart = new Date(cursor);
      const dow = bStart.getDay();
      const daysUntilSunday = dow === 0 ? 0 : 7 - dow;
      const candidateEnd = new Date(bStart);
      candidateEnd.setDate(bStart.getDate() + daysUntilSunday);
      const bEnd = candidateEnd.getTime() > today.getTime() ? new Date(today) : candidateEnd;

      const sIso = formatLocalIso(bStart);
      const eIso = formatLocalIso(bEnd);

      const serviceIds = new Set<string>();
      for (const [svcId, svcDate] of serviceDateMap.entries()) {
        if (svcDate >= sIso && svcDate <= eIso) {
          serviceIds.add(svcId);
        }
      }

      rawBuckets.push({
        weekKey: `${sIso}_${eIso}`,
        startDate: sIso,
        endDate: eIso,
        shortLabel: formatShortWeek(bStart, bEnd),
        fullRangeLabel: formatFullWeekRange(bStart, bEnd),
        isCurrentWeek: eIso === endDateIso,
        records: [],
        serviceIds,
      });

      cursor.setTime(bEnd.getTime());
      cursor.setDate(cursor.getDate() + 1);
    }

    const uniquePeople30d = new Set<string>();
    let totalCheckins30d = 0;

    for (const rec of mergedRecords.values()) {
      let resolvedDateIso = serviceDateMap.get(rec.serviceInstanceId) || '';
      if (!resolvedDateIso && rec.checkedInIso) {
        const dt = new Date(rec.checkedInIso);
        if (!Number.isNaN(dt.getTime())) {
          resolvedDateIso = formatLocalIso(dt);
        }
      }
      if (!resolvedDateIso) {
        resolvedDateIso = endDateIso;
      }

      if (resolvedDateIso < startDateIso || resolvedDateIso > endDateIso) {
        continue;
      }

      totalCheckins30d++;
      uniquePeople30d.add(rec.personId);

      const bucket = rawBuckets.find(
        (b) => resolvedDateIso >= b.startDate && resolvedDateIso <= b.endDate
      );
      if (bucket) {
        bucket.records.push(rec);
        if (rec.serviceInstanceId) {
          bucket.serviceIds.add(rec.serviceInstanceId);
        }
      }
    }

    const congregationBaseline = members.length > 0 ? members.length : expectedAttendance;
    let peakWeekLabel: string | null = null;
    let peakWeekCount = 0;
    let maxBarHeight = 0;

    const weeks: WeeklyAttendanceBucket[] = rawBuckets.map((b) => {
      const totalCheckins = b.records.length;
      const uniqueAttendees = new Set(b.records.map((r) => r.personId)).size;
      const lateCount = b.records.filter((r) => r.late).length;
      const onTimeCount = Math.max(0, totalCheckins - lateCount);
      const autoProximityCount = b.records.filter(
        (r) => r.method === 'geofence' || r.method === 'beacon'
      ).length;
      const assistedDoorCount = Math.max(0, totalCheckins - autoProximityCount);
      const engagementRatePct =
        congregationBaseline > 0
          ? Math.min(100, Math.round((uniqueAttendees / congregationBaseline) * 100))
          : 0;

      if (totalCheckins > peakWeekCount) {
        peakWeekCount = totalCheckins;
        peakWeekLabel = b.shortLabel;
      }
      if (totalCheckins > maxBarHeight) {
        maxBarHeight = totalCheckins;
      }

      return {
        weekKey: b.weekKey,
        startDate: b.startDate,
        endDate: b.endDate,
        shortLabel: b.shortLabel,
        fullRangeLabel: b.fullRangeLabel,
        isCurrentWeek: b.isCurrentWeek,
        totalCheckins,
        uniqueAttendees,
        onTimeCount,
        lateCount,
        autoProximityCount,
        assistedDoorCount,
        servicesCount: b.serviceIds.size,
        engagementRatePct,
      };
    });

    const currentWeekBucket = weeks[weeks.length - 1];
    const previousWeekBucket = weeks.length >= 2 ? weeks[weeks.length - 2] : null;
    const weekDelta =
      currentWeekBucket && previousWeekBucket
        ? currentWeekBucket.totalCheckins - previousWeekBucket.totalCheckins
        : 0;

    const avgWeekly =
      weeks.length > 0 ? Math.round((totalCheckins30d / weeks.length) * 10) / 10 : 0;

    const reachPct =
      members.length > 0
        ? Math.min(100, Math.round((uniquePeople30d.size / members.length) * 100))
        : 0;

    const windowLabel = `${windowStart.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
    })} – ${today.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
    })}`;

    const targetReference =
      congregationBaseline > 0 && congregationBaseline <= Math.max(maxBarHeight * 2.5, 25)
        ? congregationBaseline
        : 0;

    const yAxisMax = Math.max(5, maxBarHeight + Math.ceil(maxBarHeight * 0.2), targetReference);

    return {
      weeks,
      windowLabel,
      totalCheckins30d,
      uniqueAttendees30d: uniquePeople30d.size,
      reachPct,
      avgWeekly,
      peakWeekLabel,
      peakWeekCount,
      weekDelta,
      congregationBaseline,
      targetReference,
      yAxisMax,
    };
  }, [attendanceRecords, serverHistoricalRecords, services, members.length, expectedAttendance]);

  const handleBarClick = (bucket?: WeeklyAttendanceBucket) => {
    if (!bucket) return;
    if (bucket.totalCheckins > 0 && onOpenInsights) {
      onOpenInsights();
    } else {
      showToast(`${bucket.fullRangeLabel}: ${bucket.totalCheckins} check-ins recorded.`);
    }
  };

  return (
    <section
      aria-label="30-Day Weekly Attendance Trend"
      className="lg:col-span-4 bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-[0_10px_30px_rgba(60,50,140,0.07)] border border-[#E9EBF5] dark:border-[#2D2D55] flex flex-col justify-between"
    >
      <div>
        {/* Header & Segmented Mode Switcher */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-[#1D1B3A] dark:text-[#F2F2FA] leading-snug">
              30-Day Engagement Trend
            </h2>
            <p className="text-xs text-[#666A86] dark:text-[#A9ACC8] tabular-nums">
              Weekly church attendance · {trendAnalytics.windowLabel}
            </p>
          </div>

          <div
            role="tablist"
            aria-label="Weekly trend breakdown mode"
            className="inline-flex items-center gap-0.5 p-1 rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] self-start sm:self-auto shrink-0"
          >
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'total'}
              onClick={() => setViewMode('total')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                viewMode === 'total'
                  ? 'bg-[#6D5CF2] text-white shadow-xs'
                  : 'text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-[#F2F2FA]'
              }`}
            >
              Total
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'channels'}
              onClick={() => setViewMode('channels')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                viewMode === 'channels'
                  ? 'bg-[#6D5CF2] text-white shadow-xs'
                  : 'text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-[#F2F2FA]'
              }`}
            >
              Channels
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'punctuality'}
              onClick={() => setViewMode('punctuality')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                viewMode === 'punctuality'
                  ? 'bg-[#6D5CF2] text-white shadow-xs'
                  : 'text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-[#F2F2FA]'
              }`}
            >
              Punctuality
            </button>
          </div>
        </div>

        {/* Compact Pastoral Summary Ribbon */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-2.5 my-3 border-y border-[#E9EBF5] dark:border-[#2D2D55] tabular-nums">
          <div>
            <span className="text-[11px] font-medium text-[#666A86] dark:text-[#A9ACC8] block">
              30-Day Check-ins
            </span>
            <span className="text-sm sm:text-base font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
              {trendAnalytics.totalCheckins30d}
              {trendAnalytics.weekDelta !== 0 && (
                <span
                  className={`ml-1.5 text-[11px] font-semibold ${
                    trendAnalytics.weekDelta > 0 ? 'text-[#4FBF98]' : 'text-[#EF5A6F]'
                  }`}
                >
                  {trendAnalytics.weekDelta > 0
                    ? `+${trendAnalytics.weekDelta} wk`
                    : `${trendAnalytics.weekDelta} wk`}
                </span>
              )}
            </span>
          </div>

          <div>
            <span className="text-[11px] font-medium text-[#666A86] dark:text-[#A9ACC8] block">
              Unique Reach
            </span>
            <span className="text-sm sm:text-base font-bold text-[#4FBF98]">
              {trendAnalytics.uniqueAttendees30d}
              {members.length > 0 && (
                <span className="ml-1 text-[11px] font-semibold text-[#666A86] dark:text-[#A9ACC8]">
                  ({trendAnalytics.reachPct}%)
                </span>
              )}
            </span>
          </div>

          <div>
            <span className="text-[11px] font-medium text-[#666A86] dark:text-[#A9ACC8] block">
              Weekly Avg
            </span>
            <span className="text-sm sm:text-base font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
              {trendAnalytics.avgWeekly}
              <span className="ml-1 text-[11px] font-normal text-[#666A86] dark:text-[#A9ACC8]">
                / wk
              </span>
            </span>
          </div>

          <div>
            <span className="text-[11px] font-medium text-[#666A86] dark:text-[#A9ACC8] block">
              Peak Week
            </span>
            <span className="text-sm sm:text-base font-bold text-[#6D5CF2] dark:text-[#8C7DFF] truncate block">
              {trendAnalytics.peakWeekLabel
                ? `${trendAnalytics.peakWeekCount} · ${trendAnalytics.peakWeekLabel}`
                : '0 recorded'}
            </span>
          </div>
        </div>

        {/* Recharts Weekly Bar Chart */}
        <div className="w-full h-[185px] sm:h-[195px] min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={trendAnalytics.weeks}
              margin={{ top: 14, right: 8, left: -24, bottom: 2 }}
              barGap={6}
              barCategoryGap="26%"
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke={isDark ? '#2D2D55' : '#E9EBF5'}
              />
              <XAxis
                dataKey="shortLabel"
                axisLine={false}
                tickLine={false}
                tick={{
                  fill: isDark ? '#A9ACC8' : '#666A86',
                  fontSize: 11,
                  fontWeight: 600,
                }}
                dy={4}
              />
              <YAxis
                allowDecimals={false}
                domain={[0, trendAnalytics.yAxisMax]}
                axisLine={false}
                tickLine={false}
                tick={{
                  fill: isDark ? '#A9ACC8' : '#666A86',
                  fontSize: 11,
                }}
              />
              <Tooltip
                cursor={{
                  fill: isDark ? 'rgba(140, 125, 255, 0.08)' : 'rgba(109, 92, 242, 0.05)',
                  radius: 10,
                }}
                content={
                  <CustomTrendTooltip congregationSize={trendAnalytics.congregationBaseline} />
                }
              />

              {trendAnalytics.targetReference > 0 && (
                <ReferenceLine
                  y={trendAnalytics.targetReference}
                  stroke={isDark ? '#8C7DFF' : '#6D5CF2'}
                  strokeDasharray="4 4"
                  strokeOpacity={0.5}
                />
              )}

              {viewMode === 'total' && (
                <Bar
                  dataKey="totalCheckins"
                  name="Weekly Check-Ins"
                  radius={[10, 10, 10, 10]}
                  maxBarSize={42}
                  background={{
                    fill: isDark ? '#222246' : '#F4F5FC',
                    radius: 10,
                  }}
                  cursor="pointer"
                  onClick={(data) =>
                    handleBarClick(data?.payload || (data as unknown as WeeklyAttendanceBucket))
                  }
                >
                  {trendAnalytics.weeks.map((entry) => (
                    <Cell
                      key={`total-${entry.weekKey}`}
                      fill={
                        entry.isCurrentWeek
                          ? '#6D5CF2'
                          : isDark
                          ? '#7A6AF6'
                          : '#A599FA'
                      }
                    />
                  ))}
                  <LabelList
                    dataKey="totalCheckins"
                    position="top"
                    formatter={(val: unknown) => (Number(val) > 0 ? String(val) : '')}
                    style={{
                      fill: isDark ? '#F2F2FA' : '#1D1B3A',
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  />
                </Bar>
              )}

              {viewMode === 'channels' && (
                <>
                  <Bar
                    dataKey="autoProximityCount"
                    name="Auto Proximity"
                    fill="#6D5CF2"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={28}
                    background={{
                      fill: isDark ? '#222246' : '#F4F5FC',
                      radius: 6,
                    }}
                    cursor="pointer"
                    onClick={(data) =>
                      handleBarClick(data?.payload || (data as unknown as WeeklyAttendanceBucket))
                    }
                  />
                  <Bar
                    dataKey="assistedDoorCount"
                    name="Door & QR"
                    fill="#4FBF98"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={28}
                    background={{
                      fill: isDark ? '#222246' : '#F4F5FC',
                      radius: 6,
                    }}
                    cursor="pointer"
                    onClick={(data) =>
                      handleBarClick(data?.payload || (data as unknown as WeeklyAttendanceBucket))
                    }
                  />
                </>
              )}

              {viewMode === 'punctuality' && (
                <>
                  <Bar
                    dataKey="onTimeCount"
                    name="On-Time"
                    fill="#4FBF98"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={28}
                    background={{
                      fill: isDark ? '#222246' : '#F4F5FC',
                      radius: 6,
                    }}
                    cursor="pointer"
                    onClick={(data) =>
                      handleBarClick(data?.payload || (data as unknown as WeeklyAttendanceBucket))
                    }
                  />
                  <Bar
                    dataKey="lateCount"
                    name="Late Arrival"
                    fill="#F59E0B"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={28}
                    background={{
                      fill: isDark ? '#222246' : '#F4F5FC',
                      radius: 6,
                    }}
                    cursor="pointer"
                    onClick={(data) =>
                      handleBarClick(data?.payload || (data as unknown as WeeklyAttendanceBucket))
                    }
                  />
                </>
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Aligned Card Footer */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-3 mt-2 border-t border-[#E9EBF5] dark:border-[#2D2D55] text-xs text-[#666A86] dark:text-[#A9ACC8]">
        <div className="flex flex-wrap items-center gap-3.5">
          {viewMode === 'total' && (
            <>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#6D5CF2]" />
                <span>Current week</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#A599FA] dark:bg-[#7A6AF6]" />
                <span>Prior weeks</span>
              </span>
            </>
          )}
          {viewMode === 'channels' && (
            <>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#6D5CF2]" />
                <span>Auto proximity</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#4FBF98]" />
                <span>Door & QR</span>
              </span>
            </>
          )}
          {viewMode === 'punctuality' && (
            <>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#4FBF98]" />
                <span>On-time</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#F59E0B]" />
                <span>Late (+15m)</span>
              </span>
            </>
          )}
          {trendAnalytics.targetReference > 0 && (
            <span className="inline-flex items-center gap-1.5 tabular-nums">
              <span className="w-3 border-t border-dashed border-[#6D5CF2] dark:border-[#8C7DFF]" />
              <span>Target ({trendAnalytics.targetReference})</span>
            </span>
          )}
        </div>

        {trendAnalytics.totalCheckins30d === 0 && onQuickCheckin ? (
          <button
            type="button"
            onClick={onQuickCheckin}
            className="inline-flex items-center gap-1 text-xs font-bold text-[#6D5CF2] dark:text-[#8C7DFF] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Check in members</span>
          </button>
        ) : onOpenInsights ? (
          <button
            type="button"
            onClick={onOpenInsights}
            className="inline-flex items-center gap-1 text-xs font-bold text-[#6D5CF2] dark:text-[#8C7DFF] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span>Detailed roster</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        ) : null}
      </div>
    </section>
  );
};
