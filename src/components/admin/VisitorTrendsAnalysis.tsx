import React, { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ComposedChart,
  Line,
} from 'recharts';
import {
  ArrowUpRight,
  CheckCircle2,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import { useEkklesphere } from '../../context/EkklesphereContext';
import {
  AttendanceRecord,
  ThirtyDayAttendanceTrendResponse,
} from '../../types/ekklesphere';
import {
  computeVisitorAnalytics,
  VisitorWeeklyTrendBucket,
} from '../../utils/visitorAnalytics';
import { MemberAvatar } from '../common/MemberAvatar';
import { ContactCallButton } from '../common/ContactCallButton';

type VisitorLensTab = 'weekly' | 'services' | 'funnel';
type VisitorFilterMode = 'all' | 'first_timer' | 'returning' | 'needs_followup';

interface VisitorTrendsAnalysisProps {
  onOpenVisitorDirectory?: () => void;
}

interface CustomVisitorTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: VisitorWeeklyTrendBucket }>;
}

const VisitorWeeklyTooltip: React.FC<CustomVisitorTooltipProps> = ({ active, payload }) => {
  if (!active || !payload || payload.length === 0) return null;
  const bucket = payload[0]?.payload;
  if (!bucket) return null;

  return (
    <div className="bg-white dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] rounded-2xl p-3.5 shadow-[0_12px_32px_rgba(29,27,58,0.16)] min-w-[215px] tabular-nums">
      <div className="pb-2 mb-2 border-b border-[#E9EBF5] dark:border-[#2D2D55]">
        <p className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
          {bucket.fullRangeLabel}
        </p>
        <p className="text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
          {bucket.isCurrentWeek ? 'Current week' : 'Past week'} · {bucket.visitorSharePct}% of turnout
        </p>
      </div>

      <div className="space-y-1.5 text-xs">
        <div className="flex items-center justify-between gap-4">
          <span className="text-[#666A86] dark:text-[#A9ACC8]">First-time check-ins</span>
          <span className="font-bold text-[#4FBF98]">{bucket.firstTimeCheckins}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-[#666A86] dark:text-[#A9ACC8]">Returning visitors</span>
          <span className="font-bold text-[#6D5CF2] dark:text-[#8C7DFF]">
            {bucket.returningCheckins}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-[#666A86] dark:text-[#A9ACC8]">New profiles registered</span>
          <span className="font-semibold text-[#F59E0B]">{bucket.newRegistrations}</span>
        </div>
        <div className="flex items-center justify-between gap-4 pt-1 border-t border-[#E9EBF5] dark:border-[#2D2D55]">
          <span className="text-[#666A86] dark:text-[#A9ACC8]">Total visitor visits</span>
          <span className="font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
            {bucket.totalVisitorCheckins}
          </span>
        </div>
      </div>
    </div>
  );
};

export const VisitorTrendsAnalysis: React.FC<VisitorTrendsAnalysisProps> = ({
  onOpenVisitorDirectory,
}) => {
  const {
    theme,
    members,
    attendanceRecords,
    services,
    currentService,
    followupTasks,
    currentUser,
    isSessionVerified,
    handleUnauthorizedSession,
    addFollowupTask,
    resolveFollowupTask,
    updateMember,
    showToast,
  } = useEkklesphere();

  const [activeLens, setActiveLens] = useState<VisitorLensTab>('weekly');
  const [listFilter, setListFilter] = useState<VisitorFilterMode>('all');
  const [serverHistoricalRecords, setServerHistoricalRecords] = useState<AttendanceRecord[]>([]);
  const [promotingId, setPromotingId] = useState<string | null>(null);

  const isDark = theme === 'dark';

  useEffect(() => {
    let cancelled = false;
    if (!isSessionVerified || !currentUser?.token) return;

    fetch('/api/attendance/weekly-trend', {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${currentUser.token}`,
      },
    })
      .then((res) => {
        if (handleUnauthorizedSession(res.status)) return null;
        return res.ok ? (res.json() as Promise<ThirtyDayAttendanceTrendResponse>) : null;
      })
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
    isSessionVerified,
    attendanceRecords.length,
    services.length,
    currentUser?.token,
    currentUser?.tenant_id,
    currentUser?.campus_id,
    handleUnauthorizedSession,
  ]);

  const mergedAttendanceRecords = useMemo(() => {
    const byKey = new Map<string, AttendanceRecord>();
    for (const rec of serverHistoricalRecords) {
      byKey.set(`${rec.serviceInstanceId || 'svc'}::${rec.personId}`, rec);
    }
    for (const rec of attendanceRecords) {
      byKey.set(`${rec.serviceInstanceId || 'svc'}::${rec.personId}`, rec);
    }
    return Array.from(byKey.values());
  }, [serverHistoricalRecords, attendanceRecords]);

  const analytics = useMemo(
    () =>
      computeVisitorAnalytics({
        members,
        attendanceRecords: mergedAttendanceRecords,
        services,
        currentService,
        followupTasks,
      }),
    [members, mergedAttendanceRecords, services, currentService, followupTasks]
  );

  const filteredVisitors = useMemo(() => {
    return analytics.visitorProfiles.filter((item) => {
      if (listFilter === 'first_timer') return item.visitCount <= 1;
      if (listFilter === 'returning') return item.visitCount >= 2;
      if (listFilter === 'needs_followup') {
        return item.followupState === 'unassigned' || item.followupState === 'open';
      }
      return true;
    });
  }, [analytics.visitorProfiles, listFilter]);

  const handleAssignFirstTimerCare = async (personId: string, fullName: string) => {
    try {
      await addFollowupTask(
        personId,
        'first_timer',
        `Visitor trends follow-up assigned for ${fullName}`
      );
      showToast(`First-timer pastoral follow-up created for ${fullName}.`);
    } catch {
      showToast('Could not assign follow-up task right now.');
    }
  };

  const handlePromoteToMember = async (personId: string, fullName: string) => {
    setPromotingId(personId);
    try {
      const todayIso = new Date().toISOString().slice(0, 10);
      await updateMember(personId, {
        status: 'member',
        dateOfMembership: todayIso,
      });
      showToast(`${fullName} has been welcomed into full membership.`);
    } catch {
      showToast('Could not update membership status right now.');
    } finally {
      setPromotingId(null);
    }
  };

  const axisTickColor = isDark ? '#A9ACC8' : '#666A86';
  const gridStrokeColor = isDark ? '#2D2D55' : '#E9EBF5';

  return (
    <section
      id="visitor-trends-analysis"
      aria-label="Visitor Trends and Retention Analysis"
      className="bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-xs border border-[#E9EBF5] dark:border-[#2D2D55]"
    >
      {/* Header & Mode Switcher */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <h2 className="text-base sm:text-lg font-bold text-[#1D1B3A] dark:text-[#F2F2FA] leading-snug">
              Visitor Trends &amp; Retention Analysis
            </h2>
          </div>
          <p className="text-xs text-[#666A86] dark:text-[#A9ACC8] mt-0.5 tabular-nums">
            6-week arrival flow, return rate &amp; first-timer pastoral conversion · {analytics.windowLabel}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            role="tablist"
            aria-label="Visitor analytics view"
            className="inline-flex items-center gap-0.5 p-1 rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55]"
          >
            {(
              [
                { id: 'weekly', label: 'Weekly Trend' },
                { id: 'services', label: 'By Service' },
                { id: 'funnel', label: 'Retention & Channels' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeLens === tab.id}
                onClick={() => setActiveLens(tab.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeLens === tab.id
                    ? 'bg-[#6D5CF2] text-white shadow-xs'
                    : 'text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {onOpenVisitorDirectory && (
            <button
              type="button"
              onClick={onOpenVisitorDirectory}
              className="inline-flex items-center gap-1 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] px-3 py-1.5 text-xs font-semibold text-[#1D1B3A] dark:text-[#F2F2FA] hover:border-[#6D5CF2]/60 transition-colors cursor-pointer"
            >
              <span>Visitor Directory</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-[#6D5CF2]" />
            </button>
          )}
        </div>
      </div>

      {/* 4-Column Visitor KPI Summary Ribbon */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 py-3.5 my-4 border-y border-[#E9EBF5] dark:border-[#2D2D55] tabular-nums">
        <div>
          <span className="text-[11px] font-medium text-[#666A86] dark:text-[#A9ACC8] block">
            Registered Visitors
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-xl sm:text-2xl font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
              {analytics.totalVisitors}
            </span>
            <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
              +{analytics.newVisitors30d} in 30d
            </span>
          </div>
        </div>

        <div>
          <span className="text-[11px] font-medium text-[#666A86] dark:text-[#A9ACC8] block">
            Visitor Return Rate (2+ Visits)
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-xl sm:text-2xl font-bold text-[#6D5CF2] dark:text-[#8C7DFF]">
              {analytics.retentionRatePct}%
            </span>
            <span className="text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
              {analytics.returningVisitorsCount} returning · {analytics.firstTimeOnlyCount} first-time
            </span>
          </div>
        </div>

        <div>
          <span className="text-[11px] font-medium text-[#666A86] dark:text-[#A9ACC8] block">
            First-Timer Follow-Up Rate
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-xl sm:text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {analytics.followupCompletionPct}%
            </span>
            <span className="text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
              {analytics.firstTimerTasksCompletedCount}/{analytics.firstTimerTasksTotal} cared for
            </span>
          </div>
        </div>

        <div>
          <span className="text-[11px] font-medium text-[#666A86] dark:text-[#A9ACC8] block">
            Active Service Visitor Share
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-xl sm:text-2xl font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
              {analytics.activeServiceVisitorsCount}
            </span>
            <span className="text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
              {analytics.activeServiceVisitorSharePct}% of turnout
              {analytics.weekOverWeekDelta !== 0
                ? ` · ${analytics.weekOverWeekDelta > 0 ? `+${analytics.weekOverWeekDelta}` : analytics.weekOverWeekDelta} wk`
                : ''}
            </span>
          </div>
        </div>
      </div>

      {/* Main Analytics Lens Area */}
      {activeLens === 'weekly' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
          <div className="lg:col-span-8 flex flex-col">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3 text-xs">
              <span className="font-semibold text-[#1D1B3A] dark:text-[#F2F2FA]">
                Weekly Visitor Arrivals vs. New Registrations
              </span>
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-[#4FBF98]" />
                  First-Time Visits
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-[#6D5CF2]" />
                  Returning Visits
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-0.5 bg-[#F59E0B]" />
                  New Profiles
                </span>
              </div>
            </div>

            <div className="h-[235px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={analytics.weeklyBuckets}
                  margin={{ top: 10, right: 8, left: -18, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStrokeColor} />
                  <XAxis
                    dataKey="shortLabel"
                    tick={{ fill: axisTickColor, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: axisTickColor, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<VisitorWeeklyTooltip />} />
                  <Bar
                    dataKey="firstTimeCheckins"
                    stackId="visitors"
                    fill="#4FBF98"
                    radius={[0, 0, 4, 4]}
                    maxBarSize={36}
                  />
                  <Bar
                    dataKey="returningCheckins"
                    stackId="visitors"
                    fill="#6D5CF2"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={36}
                  />
                  <Line
                    type="monotone"
                    dataKey="newRegistrations"
                    stroke="#F59E0B"
                    strokeWidth={2.5}
                    dot={{ r: 3.5, fill: '#F59E0B', strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="lg:col-span-4 rounded-2xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] p-4 flex flex-col justify-between">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#666A86] dark:text-[#A9ACC8]">
                Pastoral Insights
              </h3>

              <div className="mt-3 space-y-3 text-xs tabular-nums">
                <div className="border-b border-[#E9EBF5] dark:border-[#2D2D55] pb-2.5">
                  <div className="text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
                    Peak Visitor Service
                  </div>
                  <div className="mt-0.5 font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                    {analytics.peakVisitorService
                      ? `${analytics.peakVisitorService.name} (${analytics.peakVisitorService.count} visitors)`
                      : 'No visitor check-ins recorded yet'}
                  </div>
                </div>

                <div className="border-b border-[#E9EBF5] dark:border-[#2D2D55] pb-2.5">
                  <div className="text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
                    30-Day Visitor Visits
                  </div>
                  <div className="mt-0.5 font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                    {analytics.totalVisitorCheckins30d} checked in ·{' '}
                    {analytics.needsFollowupCount} awaiting outreach
                  </div>
                </div>

                <div>
                  <div className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] mb-1.5">
                    Top Areas Visited
                  </div>
                  {analytics.topInterestGroups.length === 0 ? (
                    <p className="text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
                      Register visitors with departments or home cells to surface ministry interest.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {analytics.topInterestGroups.map((grp) => (
                        <div key={grp.name} className="flex items-center justify-between gap-2">
                          <span className="truncate font-medium text-[#1D1B3A] dark:text-[#F2F2FA]">
                            {grp.name}
                          </span>
                          <span className="font-mono text-[11px] font-bold text-[#6D5CF2] dark:text-[#8C7DFF]">
                            {grp.count} ({grp.pct}%)
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeLens === 'services' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-6 h-[240px] min-w-0">
            {analytics.serviceComparisons.length === 0 ? (
              <div className="h-full rounded-2xl border border-dashed border-[#E9EBF5] dark:border-[#2D2D55] flex items-center justify-center text-xs text-[#666A86] dark:text-[#A9ACC8]">
                No scheduled services available to compare visitor turnout.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={analytics.serviceComparisons.slice(0, 6)}
                  margin={{ top: 10, right: 10, left: -18, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStrokeColor} />
                  <XAxis
                    dataKey="serviceName"
                    tick={{ fill: axisTickColor, fontSize: 10 }}
                    tickFormatter={(v: string) => (v.length > 14 ? `${v.slice(0, 12)}…` : v)}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: axisTickColor, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip />
                  <Bar
                    dataKey="firstTimeVisitors"
                    name="First-Time Visitors"
                    stackId="svc"
                    fill="#4FBF98"
                    maxBarSize={36}
                  />
                  <Bar
                    dataKey="returningVisitors"
                    name="Returning Visitors"
                    stackId="svc"
                    fill="#6D5CF2"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={36}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="lg:col-span-6 overflow-x-auto rounded-2xl border border-[#E9EBF5] dark:border-[#2D2D55]">
            <table className="w-full text-left text-xs border-collapse tabular-nums">
              <thead className="bg-[#F6F7FC] dark:bg-[#14142E] border-b border-[#E9EBF5] dark:border-[#2D2D55] text-[#666A86] dark:text-[#A9ACC8]">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">Service / Event</th>
                  <th className="py-2.5 px-3 font-semibold text-right">1st-Time</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Returning</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Total Visitors</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E9EBF5] dark:divide-[#2D2D55]">
                {analytics.serviceComparisons.slice(0, 6).map((row) => (
                  <tr key={row.serviceId}>
                    <td className="py-2.5 px-3 font-semibold text-[#1D1B3A] dark:text-[#F2F2FA]">
                      <div className="truncate max-w-[180px]">{row.serviceName}</div>
                      {row.date && (
                        <div className="text-[10px] font-normal text-[#666A86] dark:text-[#A9ACC8]">
                          {row.date}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                      {row.firstTimeVisitors}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-[#6D5CF2] dark:text-[#8C7DFF] font-semibold">
                      {row.returningVisitors}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                      {row.visitorCheckins}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-[#666A86] dark:text-[#A9ACC8]">
                      {row.visitorSharePct}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeLens === 'funnel' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-7 space-y-3 tabular-nums">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#666A86] dark:text-[#A9ACC8]">
              Visitor Journey Conversion Funnel
            </h3>
            {analytics.funnelStages.map((stage) => (
              <div
                key={stage.id}
                className="rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] bg-[#F6F7FC] dark:bg-[#14142E] p-3"
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <div>
                    <span className="font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                      {stage.label}
                    </span>
                    <span className="ml-2 text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
                      {stage.description}
                    </span>
                  </div>
                  <span className="font-mono font-bold text-[#6D5CF2] dark:text-[#8C7DFF]">
                    {stage.count} ({stage.pctOfRegistered}%)
                  </span>
                </div>
                <div className="mt-2 h-2 w-full rounded-full bg-[#E9EBF5] dark:bg-[#2D2D55] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#6D5CF2] transition-all duration-300"
                    style={{ width: `${stage.pctOfRegistered}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="lg:col-span-5 rounded-2xl border border-[#E9EBF5] dark:border-[#2D2D55] bg-[#F6F7FC] dark:bg-[#14142E] p-4 tabular-nums">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#666A86] dark:text-[#A9ACC8]">
              Visitor Check-In Channels
            </h3>
            {analytics.channels.length === 0 ? (
              <p className="mt-4 text-xs text-[#666A86] dark:text-[#A9ACC8]">
                Check visitors in via Usher Desk, Sanctuary QR, or Proximity to track arrival channels.
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                {analytics.channels.map((ch) => (
                  <div key={ch.method}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-semibold text-[#1D1B3A] dark:text-[#F2F2FA]">
                        {ch.label}
                      </span>
                      <span className="font-mono text-[#666A86] dark:text-[#A9ACC8]">
                        {ch.count} ({ch.pct}%)
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-[#E9EBF5] dark:bg-[#2D2D55] overflow-hidden">
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
        </div>
      )}

      {/* Actionable Visitor Follow-Up & Conversion Cohort Strip */}
      <div className="mt-6 pt-5 border-t border-[#E9EBF5] dark:border-[#2D2D55]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-3">
          <div>
            <h3 className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
              Visitor Follow-Up &amp; Membership Pipeline
            </h3>
            <p className="text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
              Reach out directly to recent guests, log care calls, or transition returning visitors to full members.
            </p>
          </div>

          <div
            role="tablist"
            aria-label="Filter visitor cohort"
            className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] self-start sm:self-auto"
          >
            {(
              [
                { id: 'all', label: `All (${analytics.totalVisitors})` },
                { id: 'first_timer', label: 'First-Timers' },
                { id: 'returning', label: `Returning (${analytics.returningVisitorsCount})` },
                { id: 'needs_followup', label: `Needs Care (${analytics.needsFollowupCount})` },
              ] as const
            ).map((filterItem) => (
              <button
                key={filterItem.id}
                type="button"
                role="tab"
                aria-selected={listFilter === filterItem.id}
                onClick={() => setListFilter(filterItem.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums ${
                  listFilter === filterItem.id
                    ? 'bg-[#6D5CF2] text-white'
                    : 'text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-white'
                }`}
              >
                {filterItem.label}
              </button>
            ))}
          </div>
        </div>

        {filteredVisitors.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#E9EBF5] dark:border-[#2D2D55] bg-[#F6F7FC] dark:bg-[#14142E] py-6 px-4 text-center text-xs text-[#666A86] dark:text-[#A9ACC8]">
            No visitors match this cohort filter yet.
          </div>
        ) : (
          <div className="divide-y divide-[#E9EBF5] dark:divide-[#2D2D55] rounded-2xl border border-[#E9EBF5] dark:border-[#2D2D55] overflow-hidden">
            {filteredVisitors.slice(0, 6).map((item) => {
              const fullName = `${item.person.firstName} ${item.person.lastName}`.trim();
              return (
                <div
                  key={item.person.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 bg-white dark:bg-[#1D1D3D] hover:bg-[#F8F9FD] dark:hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <MemberAvatar
                      src={item.person.imageUrl}
                      name={fullName}
                      initials={item.person.avatarInitials}
                      sizeClass="w-9 h-9"
                      textClass="text-xs font-bold"
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-bold text-[#1D1B3A] dark:text-[#F2F2FA] truncate">
                          {fullName}
                        </span>
                        <span className="text-[#666A86] dark:text-[#A9ACC8] tabular-nums">
                          {item.visitCount === 0
                            ? 'Registered'
                            : item.visitCount === 1
                            ? '1 visit'
                            : `${item.visitCount} visits`}
                        </span>
                        <span aria-hidden="true" className="text-[#666A86]/50">
                          ·
                        </span>
                        <span
                          className={`font-semibold ${
                            item.followupState === 'resolved' || item.followupState === 'contacted'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : item.followupState === 'open'
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {item.followupState === 'resolved'
                            ? 'Follow-up resolved'
                            : item.followupState === 'contacted'
                            ? 'Contacted'
                            : item.followupState === 'open'
                            ? `Assigned (${item.followupTask?.assignedToName || 'Care team'})`
                            : 'Needs care assignment'}
                        </span>
                      </div>
                      <div className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] truncate tabular-nums">
                        {item.person.department || item.person.homeCellGroup || item.person.groupName || 'Visitor'}
                        {item.lastVisitDate ? ` · Last attended ${item.lastVisitDate}` : ''}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <ContactCallButton
                      compact
                      contactName={fullName}
                      contactPhone={item.person.phoneE164 || item.person.phoneNumber}
                      contactEmail={item.person.email}
                      contactGroup={item.person.groupName || 'Visitor'}
                      label="Call"
                      onLogOutcome={
                        item.followupTask
                          ? async (outcome, markResolved) => {
                              await resolveFollowupTask(
                                item.followupTask!.id,
                                outcome,
                                markResolved ? 'resolved' : 'contacted'
                              );
                            }
                          : undefined
                      }
                    />

                    {!item.followupTask && (
                      <button
                        type="button"
                        onClick={() => handleAssignFirstTimerCare(item.person.id, fullName)}
                        className="inline-flex items-center gap-1 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] px-2.5 py-1.5 text-[11px] font-semibold text-[#1D1B3A] dark:text-[#F2F2FA] hover:border-[#6D5CF2]/60 cursor-pointer"
                      >
                        <UserCheck className="w-3.5 h-3.5 text-[#6D5CF2]" />
                        <span>Assign Care</span>
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={promotingId === item.person.id}
                      onClick={() => handlePromoteToMember(item.person.id, fullName)}
                      className="inline-flex items-center gap-1 rounded-xl bg-[#EFEDFF] dark:bg-[#2A2A55] px-2.5 py-1.5 text-[11px] font-bold text-[#6D5CF2] dark:text-[#9D90FF] hover:bg-[#6D5CF2] hover:text-white disabled:opacity-50 transition-colors cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{promotingId === item.person.id ? 'Updating…' : 'Promote to Member'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};
