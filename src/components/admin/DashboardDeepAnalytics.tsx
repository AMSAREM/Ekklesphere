import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  Search,
  ArrowUpRight,
  Users,
  Building2,
  HeartHandshake,
  Calendar,
  Settings,
  Plus,
  UserPlus,
  History,
  Edit3,
  Power,
  Trash2,
  ClipboardList,
} from 'lucide-react';
import { DashboardAnalyticsResult } from '../../utils/dashboardAnalytics';
import { ChurchGroupCategory } from '../../types/ekklesphere';

export type AnalyticsLens = 'all' | 'departments' | 'ministries' | 'demographics' | 'services';

interface DashboardDeepAnalyticsProps {
  analytics: DashboardAnalyticsResult;
  theme: 'light' | 'dark';
  activeLens: AnalyticsLens;
  onChangeLens: (lens: AnalyticsLens) => void;
  onInspectDepartment: (departmentName: string) => void;
  onInspectGroup: (groupName: string) => void;
  onSelectService: (serviceId: string) => void;
  onOpenSettings: () => void;
  onAddMember: () => void;
  onAddService: () => void;
  onOpenServiceHistory?: () => void;
  onOpenServiceRegister?: (serviceId: string) => void;
  onToggleServiceStatus?: (serviceId: string, nextStatus: 'live' | 'closed') => void;
  onEditService?: (serviceId: string) => void;
  onDeleteService?: (serviceId: string) => void;
}

const CATEGORY_LABELS: Record<ChurchGroupCategory, string> = {
  ministry: 'Ministry',
  fellowship: 'Fellowship',
  cell_group: 'Cell Group',
};

const BINARY_STATUS_LABELS: Record<'live' | 'closed', { label: string; colorClass: string; dotClass: string }> = {
  live: {
    label: 'Live',
    colorClass: 'text-emerald-600 dark:text-emerald-400',
    dotClass: 'bg-emerald-500',
  },
  closed: {
    label: 'Closed',
    colorClass: 'text-[#666A86] dark:text-[#A9ACC8]',
    dotClass: 'bg-slate-400 dark:bg-slate-500',
  },
};

export const DashboardDeepAnalytics: React.FC<DashboardDeepAnalyticsProps> = React.memo(({
  analytics,
  theme,
  activeLens,
  onChangeLens,
  onInspectDepartment,
  onInspectGroup,
  onSelectService,
  onOpenSettings,
  onAddMember,
  onAddService,
  onOpenServiceHistory,
  onOpenServiceRegister,
  onToggleServiceStatus,
  onEditService,
  onDeleteService,
}) => {
  const [filterQuery, setFilterQuery] = useState('');
  const [groupCategoryFilter, setGroupCategoryFilter] = useState<'all' | ChurchGroupCategory>('all');
  const [deptSortKey, setDeptSortKey] = useState<'members' | 'turnout'>('members');
  const [confirmDeleteSvcId, setConfirmDeleteSvcId] = useState<string | null>(null);

  const queryLower = filterQuery.trim().toLowerCase();

  const filteredDepartments = useMemo(() => {
    const base = analytics.departments.filter((d) =>
      queryLower ? d.name.toLowerCase().includes(queryLower) : true
    );
    return [...base].sort((a, b) =>
      deptSortKey === 'turnout'
        ? b.turnoutPct - a.turnoutPct || b.totalMembers - a.totalMembers
        : b.totalMembers - a.totalMembers || b.turnoutPct - a.turnoutPct
    );
  }, [analytics.departments, queryLower, deptSortKey]);

  const topDepartmentChartData = useMemo(
    () =>
      filteredDepartments.slice(0, 8).map((d) => ({
        name: d.name.length > 18 ? `${d.name.slice(0, 16)}…` : d.name,
        fullName: d.name,
        present: d.presentCount,
        absent: d.absentCount,
        total: d.totalMembers,
        turnoutPct: d.turnoutPct,
      })),
    [filteredDepartments]
  );

  const filteredGroups = useMemo(() => {
    return analytics.groups.filter((g) => {
      if (groupCategoryFilter !== 'all' && g.category !== groupCategoryFilter) {
        return false;
      }
      if (!queryLower) return true;
      return (
        g.name.toLowerCase().includes(queryLower) ||
        g.leaderName.toLowerCase().includes(queryLower) ||
        (g.meetingDay && g.meetingDay.toLowerCase().includes(queryLower))
      );
    });
  }, [analytics.groups, groupCategoryFilter, queryLower]);

  const filteredServices = useMemo(() => {
    if (!queryLower) return analytics.serviceComparisons;
    return analytics.serviceComparisons.filter(
      (s) =>
        s.name.toLowerCase().includes(queryLower) ||
        (s.date && s.date.toLowerCase().includes(queryLower))
    );
  }, [analytics.serviceComparisons, queryLower]);

  const axisTickColor = theme === 'dark' ? '#A9ACC8' : '#666A86';
  const gridStrokeColor = theme === 'dark' ? '#2D2D55' : '#E9EBF5';

  const lensOptions: Array<{ id: AnalyticsLens; label: string }> = [
    { id: 'all', label: 'All Insights' },
    { id: 'departments', label: 'Departments' },
    { id: 'ministries', label: 'Ministries & Groups' },
    { id: 'demographics', label: 'Demographics & Health' },
    { id: 'services', label: 'Services' },
  ];

  return (
    <section
      aria-label="In-Depth Congregation and Service Analytics"
      className="bg-white dark:bg-[#1D1D3D] rounded-3xl border border-[#E9EBF5] dark:border-[#2D2D55] p-5 sm:p-6 space-y-6"
    >
      {/* Top Analytics Header & Controls */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-5 border-b border-[#E9EBF5] dark:border-[#2D2D55]">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-[#1D1B3A] dark:text-[#F2F2FA] tracking-tight">
            Congregation &amp; Ministry Analytics
          </h2>
          <p className="text-xs text-[#666A86] dark:text-[#A9ACC8] mt-1 tabular-nums">
            <span>Active: {analytics.activeService.name}</span>
            <span className="mx-1.5" aria-hidden="true">·</span>
            <span>{analytics.membership.totalMembers} members</span>
            <span className="mx-1.5" aria-hidden="true">·</span>
            <span>{analytics.namedDepartmentsCount} departments</span>
            <span className="mx-1.5" aria-hidden="true">·</span>
            <span>{analytics.groupCounts.ministries} ministries</span>
            <span className="mx-1.5" aria-hidden="true">·</span>
            <span>{analytics.groupCounts.cellGroups} cell groups</span>
          </p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
          {/* Search filter */}
          <div className="relative min-w-[210px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#666A86] dark:text-[#A9ACC8]" />
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Filter departments, ministries..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] placeholder-[#666A86] dark:placeholder-[#A9ACC8] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
            />
          </div>

          {/* Segmented Lens Switcher */}
          <div
            role="tablist"
            aria-label="Analytics lens"
            className="flex items-center gap-1 p-1 rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] overflow-x-auto"
          >
            {lensOptions.map((opt) => (
              <button
                key={opt.id}
                type="button"
                role="tab"
                aria-selected={activeLens === opt.id}
                onClick={() => onChangeLens(opt.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeLens === opt.id
                    ? 'bg-white dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#F2F2FA] shadow-xs'
                    : 'text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* SECTION 1: DEPARTMENTS BREAKDOWN & LIVE TURNOUT */}
      {(activeLens === 'all' || activeLens === 'departments') && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-[#6D5CF2] shrink-0" />
              <div>
                <h3 className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                  Department Roster &amp; Active Service Turnout
                </h3>
                <p className="text-xs text-[#666A86] dark:text-[#A9ACC8]">
                  Headcount, attendance rate for {analytics.activeService.name}, auto check-in readiness, and repeat absences by department.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 p-1 rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55]">
                <button
                  type="button"
                  onClick={() => setDeptSortKey('members')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer whitespace-nowrap ${
                    deptSortKey === 'members'
                      ? 'bg-white dark:bg-[#2A2A55] text-[#1D1B3A] dark:text-white shadow-xs'
                      : 'text-[#666A86] dark:text-[#A9ACC8]'
                  }`}
                >
                  Sort by Size
                </button>
                <button
                  type="button"
                  onClick={() => setDeptSortKey('turnout')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer whitespace-nowrap ${
                    deptSortKey === 'turnout'
                      ? 'bg-white dark:bg-[#2A2A55] text-[#1D1B3A] dark:text-white shadow-xs'
                      : 'text-[#666A86] dark:text-[#A9ACC8]'
                  }`}
                >
                  Sort by Turnout %
                </button>
              </div>
              <button
                type="button"
                onClick={onOpenSettings}
                className="px-3 py-1.5 rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-xs font-semibold text-[#1D1B3A] dark:text-[#F2F2FA] hover:border-[#6D5CF2]/50 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5 text-[#6D5CF2]" />
                <span>Manage Departments</span>
              </button>
            </div>
          </div>

          {filteredDepartments.length === 0 ? (
            <div className="py-10 px-4 text-center rounded-2xl bg-[#F6F7FC] dark:bg-[#14142E] border border-dashed border-[#E9EBF5] dark:border-[#2D2D55]">
              <p className="text-xs font-semibold text-[#1D1B3A] dark:text-[#F2F2FA]">
                No department records match your current view
              </p>
              <p className="text-xs text-[#666A86] dark:text-[#A9ACC8] mt-1 mb-3">
                Enroll or import members with department assignments to unlock departmental analytics.
              </p>
              <button
                type="button"
                onClick={onAddMember}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#6D5CF2] hover:bg-[#5B4BE0] text-white text-xs font-semibold cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Add Member</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
              {/* Left: Recharts Stacked Present vs Absent Chart */}
              <div className="xl:col-span-5 bg-[#F8F9FD] dark:bg-[#14142E] rounded-2xl border border-[#E9EBF5] dark:border-[#2D2D55] p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-[#1D1B3A] dark:text-[#F2F2FA]">
                    Top Departments — Present vs Unarrived
                  </span>
                  <div className="flex items-center gap-3 text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2 h-2 rounded-xs bg-[#4FBF98]" />
                      Present
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2 h-2 rounded-xs bg-[#CBD5E1] dark:bg-[#3A3A6A]" />
                      Absent
                    </span>
                  </div>
                </div>
                <div className="h-[270px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={topDepartmentChartData}
                      layout="vertical"
                      margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={gridStrokeColor} />
                      <XAxis
                        type="number"
                        allowDecimals={false}
                        tick={{ fontSize: 11, fill: axisTickColor }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={118}
                        tick={{ fontSize: 11, fill: axisTickColor }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        cursor={{ fill: theme === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(109,92,242,0.05)' }}
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const row = payload[0]?.payload;
                          return (
                            <div className="bg-white dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] rounded-xl p-3 shadow-lg text-xs tabular-nums">
                              <p className="font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                                {row.fullName}
                              </p>
                              <p className="text-emerald-600 dark:text-emerald-400">
                                Present: {row.present} ({row.turnoutPct}%)
                              </p>
                              <p className="text-[#666A86] dark:text-[#A9ACC8]">
                                Absent: {row.absent} · Total: {row.total}
                              </p>
                            </div>
                          );
                        }}
                      />
                      <Bar dataKey="present" stackId="dept" fill="#4FBF98" radius={[0, 0, 0, 0]} />
                      <Bar
                        dataKey="absent"
                        stackId="dept"
                        fill={theme === 'dark' ? '#343463' : '#DCE0F0'}
                        radius={[0, 4, 4, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Right: High-Density Department Matrix Table */}
              <div className="xl:col-span-7 overflow-x-auto rounded-2xl border border-[#E9EBF5] dark:border-[#2D2D55]">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-[#F6F7FC] dark:bg-[#14142E] border-b border-[#E9EBF5] dark:border-[#2D2D55] text-[#666A86] dark:text-[#A9ACC8]">
                    <tr>
                      <th className="py-2.5 px-3.5 font-semibold">Department</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Members</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Share</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Present</th>
                      <th className="py-2.5 px-3 font-semibold min-w-[115px]">Turnout</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Auto Opt-In</th>
                      <th className="py-2.5 px-3.5 font-semibold text-right">At-Risk</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E9EBF5] dark:divide-[#2D2D55] tabular-nums">
                    {filteredDepartments.map((dept) => (
                      <tr
                        key={dept.name}
                        onClick={() => onInspectDepartment(dept.name)}
                        className="hover:bg-[#F8F9FD] dark:hover:bg-white/[0.03] transition-colors cursor-pointer group"
                        title={`View ${dept.name} members in directory`}
                      >
                        <td className="py-2.5 px-3.5 font-semibold text-[#1D1B3A] dark:text-[#F2F2FA]">
                          <span className="inline-flex items-center gap-1 group-hover:text-[#6D5CF2] dark:group-hover:text-[#9D90FF]">
                            <span className="truncate max-w-[190px]">{dept.name}</span>
                            <ArrowUpRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-semibold text-[#1D1B3A] dark:text-[#F2F2FA]">
                          {dept.totalMembers}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-[#666A86] dark:text-[#A9ACC8]">
                          {dept.shareOfRosterPct}%
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                          {dept.presentCount}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 rounded-full bg-[#EFEDFF] dark:bg-[#2A2A55] overflow-hidden">
                              <div
                                className="h-full rounded-full bg-[#4FBF98]"
                                style={{ width: `${dept.turnoutPct}%` }}
                              />
                            </div>
                            <span className="font-mono text-[11px] font-semibold text-[#1D1B3A] dark:text-[#F2F2FA] w-8 text-right">
                              {dept.turnoutPct}%
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-[#666A86] dark:text-[#A9ACC8]">
                          {dept.autoCheckinPct}%
                        </td>
                        <td className="py-2.5 px-3.5 text-right font-mono">
                          <span
                            className={
                              dept.atRiskCount > 0
                                ? 'font-semibold text-rose-600 dark:text-rose-400'
                                : 'text-[#666A86] dark:text-[#A9ACC8]'
                            }
                          >
                            {dept.atRiskCount}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SECTION 2: MINISTRIES, FELLOWSHIPS & HOME CELL GROUPS */}
      {(activeLens === 'all' || activeLens === 'ministries') && (
        <div
          className={`space-y-4 ${
            activeLens === 'all' ? 'pt-6 border-t border-[#E9EBF5] dark:border-[#2D2D55]' : ''
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <HeartHandshake className="w-4 h-4 text-[#6D5CF2] shrink-0" />
              <div>
                <h3 className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                  Ministries, Fellowships &amp; Cell Groups
                </h3>
                <p className="text-xs text-[#666A86] dark:text-[#A9ACC8]">
                  Active campus ministries ({analytics.groupCounts.ministries}), fellowships ({analytics.groupCounts.fellowships}), and home cells ({analytics.groupCounts.cellGroups}).
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 p-1 rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55]">
                {(
                  [
                    { id: 'all', label: `All (${analytics.groupCounts.total})` },
                    { id: 'ministry', label: `Ministries (${analytics.groupCounts.ministries})` },
                    { id: 'fellowship', label: `Fellowships (${analytics.groupCounts.fellowships})` },
                    { id: 'cell_group', label: `Cells (${analytics.groupCounts.cellGroups})` },
                  ] as const
                ).map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setGroupCategoryFilter(cat.id)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums ${
                      groupCategoryFilter === cat.id
                        ? 'bg-white dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-white shadow-xs'
                        : 'text-[#666A86] dark:text-[#A9ACC8]'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={onOpenSettings}
                className="px-3 py-1.5 rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-xs font-semibold text-[#1D1B3A] dark:text-[#F2F2FA] hover:border-[#6D5CF2]/50 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5 text-[#6D5CF2]" />
                <span>Manage Groups</span>
              </button>
            </div>
          </div>

          {filteredGroups.length === 0 ? (
            <div className="py-10 px-4 text-center rounded-2xl bg-[#F6F7FC] dark:bg-[#14142E] border border-dashed border-[#E9EBF5] dark:border-[#2D2D55]">
              <p className="text-xs font-semibold text-[#1D1B3A] dark:text-[#F2F2FA]">
                No ministries or groups configured yet
              </p>
              <p className="text-xs text-[#666A86] dark:text-[#A9ACC8] mt-1 mb-3">
                Create ministries, fellowships, or cell groups in System Settings to track leadership and attendance participation.
              </p>
              <button
                type="button"
                onClick={onOpenSettings}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#6D5CF2] hover:bg-[#5B4BE0] text-white text-xs font-semibold cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Configure Ministries</span>
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-[#E9EBF5] dark:border-[#2D2D55]">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-[#F6F7FC] dark:bg-[#14142E] border-b border-[#E9EBF5] dark:border-[#2D2D55] text-[#666A86] dark:text-[#A9ACC8]">
                  <tr>
                    <th className="py-2.5 px-3.5 font-semibold">Ministry / Group</th>
                    <th className="py-2.5 px-3 font-semibold">Category</th>
                    <th className="py-2.5 px-3 font-semibold">Leader</th>
                    <th className="py-2.5 px-3 font-semibold">Schedule</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Members</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Present</th>
                    <th className="py-2.5 px-3 font-semibold min-w-[120px]">Active Turnout</th>
                    <th className="py-2.5 px-3.5 font-semibold text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E9EBF5] dark:divide-[#2D2D55] tabular-nums">
                  {filteredGroups.map((group) => (
                    <tr
                      key={group.id}
                      onClick={() => onInspectGroup(group.name)}
                      className="hover:bg-[#F8F9FD] dark:hover:bg-white/[0.03] transition-colors cursor-pointer group"
                      title={`View members in ${group.name}`}
                    >
                      <td className="py-2.5 px-3.5 font-semibold text-[#1D1B3A] dark:text-[#F2F2FA]">
                        <span className="inline-flex items-center gap-1 group-hover:text-[#6D5CF2] dark:group-hover:text-[#9D90FF]">
                          <span className="truncate max-w-[180px]">{group.name}</span>
                          <ArrowUpRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-[#666A86] dark:text-[#A9ACC8]">
                        {CATEGORY_LABELS[group.category]}
                      </td>
                      <td className="py-2.5 px-3 text-[#1D1B3A] dark:text-[#F2F2FA] truncate max-w-[140px]">
                        {group.leaderName}
                      </td>
                      <td className="py-2.5 px-3 text-[#666A86] dark:text-[#A9ACC8] whitespace-nowrap">
                        {group.meetingDay || group.meetingTime
                          ? [group.meetingDay, group.meetingTime].filter(Boolean).join(' · ')
                          : 'Flexible schedule'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-[#1D1B3A] dark:text-[#F2F2FA]">
                        {group.totalMembers}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                        {group.presentCount}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full bg-[#EFEDFF] dark:bg-[#2A2A55] overflow-hidden">
                            <div
                              className="h-full rounded-full bg-[#6D5CF2]"
                              style={{ width: `${group.turnoutPct}%` }}
                            />
                          </div>
                          <span className="font-mono text-[11px] font-semibold text-[#1D1B3A] dark:text-[#F2F2FA] w-8 text-right">
                            {group.turnoutPct}%
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3.5 text-right">
                        <span
                          className={`text-[11px] font-semibold ${
                            group.active
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-[#666A86] dark:text-[#A9ACC8]'
                          }`}
                        >
                          {group.active ? 'Active' : 'Paused'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* SECTION 3: DEMOGRAPHICS, CHECK-IN TELEMETRY & RECORD HEALTH */}
      {(activeLens === 'all' || activeLens === 'demographics') && (
        <div
          className={`space-y-4 ${
            activeLens === 'all' ? 'pt-6 border-t border-[#E9EBF5] dark:border-[#2D2D55]' : ''
          }`}
        >
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-[#6D5CF2] shrink-0" />
            <div>
              <h3 className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                Demographics, Check-In Channels &amp; Directory Completeness
              </h3>
              <p className="text-xs text-[#666A86] dark:text-[#A9ACC8]">
                Congregation makeup, active service arrival channels, and data quality coverage across Supabase records.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-[#E9EBF5] dark:divide-[#2D2D55] rounded-2xl border border-[#E9EBF5] dark:border-[#2D2D55] bg-[#F8F9FD] dark:bg-[#14142E]">
            {/* Column 1: Active Service Check-in Channels */}
            <div className="p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                  Arrival Channels ({analytics.activeService.name})
                </span>
                <span className="font-mono text-xs text-[#666A86] dark:text-[#A9ACC8] tabular-nums">
                  {analytics.activeService.attendanceCount} check-ins
                </span>
              </div>

              {analytics.activeService.channels.length === 0 ? (
                <p className="text-xs text-[#666A86] dark:text-[#A9ACC8] py-6">
                  No check-ins recorded yet for this service. Auto proximity, QR scans, and usher check-ins will appear here.
                </p>
              ) : (
                <div className="flex items-center gap-4">
                  <div className="w-28 h-28 shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsPieChart>
                        <Pie
                          data={analytics.activeService.channels}
                          dataKey="count"
                          nameKey="label"
                          innerRadius={28}
                          outerRadius={48}
                          paddingAngle={2}
                          stroke="none"
                        >
                          {analytics.activeService.channels.map((ch) => (
                            <Cell key={ch.method} fill={ch.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const item = payload[0].payload;
                            return (
                              <div className="bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] rounded-lg px-2.5 py-1.5 text-xs shadow-md tabular-nums">
                                <span className="font-semibold text-[#1D1B3A] dark:text-white">
                                  {item.label}: {item.count} ({item.pct}%)
                                </span>
                              </div>
                            );
                          }}
                        />
                      </RechartsPieChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="flex-1 space-y-2 min-w-0 tabular-nums">
                    {analytics.activeService.channels.map((ch) => (
                      <div key={ch.method} className="flex items-center justify-between gap-2 text-xs">
                        <span className="inline-flex items-center gap-1.5 text-[#1D1B3A] dark:text-[#F2F2FA] truncate">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: ch.color }}
                          />
                          <span className="truncate">{ch.label}</span>
                        </span>
                        <span className="font-mono font-semibold text-[#666A86] dark:text-[#A9ACC8] shrink-0">
                          {ch.count} ({ch.pct}%)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Column 2: Congregation Demographics & Giving */}
            <div className="p-4 sm:p-5 space-y-4 tabular-nums">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                  Membership Composition
                </span>
                <span className="font-mono text-xs text-[#666A86] dark:text-[#A9ACC8]">
                  {analytics.membership.birthdaysThisMonthCount} birthdays this month
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="bg-white dark:bg-[#1D1D3D] rounded-xl p-2.5 border border-[#E9EBF5] dark:border-[#2D2D55]">
                  <span className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] block">Members</span>
                  <span className="font-mono text-base font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                    {analytics.membership.activeStatusCount}
                  </span>
                </div>
                <div className="bg-white dark:bg-[#1D1D3D] rounded-xl p-2.5 border border-[#E9EBF5] dark:border-[#2D2D55]">
                  <span className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] block">Visitors</span>
                  <span className="font-mono text-base font-bold text-[#6D5CF2] dark:text-[#8C7DFF]">
                    {analytics.membership.visitorsCount}
                  </span>
                </div>
                <div className="bg-white dark:bg-[#1D1D3D] rounded-xl p-2.5 border border-[#E9EBF5] dark:border-[#2D2D55]">
                  <span className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] block">Inactive</span>
                  <span className="font-mono text-base font-bold text-[#666A86] dark:text-[#A9ACC8]">
                    {analytics.membership.inactiveCount}
                  </span>
                </div>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between text-[#666A86] dark:text-[#A9ACC8]">
                  <span>Gender Split</span>
                  <span className="text-[#1D1B3A] dark:text-[#F2F2FA] font-medium">
                    {analytics.membership.genderBreakdown.length > 0
                      ? analytics.membership.genderBreakdown
                          .map((g) => `${g.label} ${g.pct}% (${g.count})`)
                          .join(' · ')
                      : 'No records'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[#666A86] dark:text-[#A9ACC8]">
                  <span>Marital Status</span>
                  <span className="text-[#1D1B3A] dark:text-[#F2F2FA] font-medium truncate max-w-[230px]">
                    {analytics.membership.maritalBreakdown.length > 0
                      ? analytics.membership.maritalBreakdown
                          .slice(0, 2)
                          .map((m) => `${m.label} ${m.pct}%`)
                          .join(' · ')
                      : 'No records'}
                  </span>
                </div>
                {analytics.giving.donationsCount > 0 && (
                  <div className="flex items-center justify-between text-[#666A86] dark:text-[#A9ACC8]">
                    <span>Recorded Giving</span>
                    <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                      GHS {analytics.giving.totalPaidGhs.toLocaleString()} ({analytics.giving.donationsCount})
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Column 3: Data Completeness & Auto Check-In Coverage */}
            <div className="p-4 sm:p-5 space-y-2.5 tabular-nums">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                  Directory Health &amp; Coverage
                </span>
                <span className="text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
                  % of {analytics.membership.totalMembers}
                </span>
              </div>

              {[
                {
                  label: 'Phone Contact',
                  pct: analytics.membership.completeness.phonePct,
                  count: analytics.membership.completeness.phoneCount,
                  color: '#4FBF98',
                },
                {
                  label: 'Auto Check-In Opt-In',
                  pct: analytics.membership.autoCheckinPct,
                  count: analytics.membership.autoCheckinCount,
                  color: '#6D5CF2',
                },
                {
                  label: 'Digital Address (GPS)',
                  pct: analytics.membership.completeness.digitalAddressPct,
                  count: analytics.membership.completeness.digitalAddressCount,
                  color: '#59C3C3',
                },
                {
                  label: 'Member Photos',
                  pct: analytics.membership.completeness.photoPct,
                  count: analytics.membership.completeness.photoCount,
                  color: '#8C7DFF',
                },
                {
                  label: 'Birthdates Logged',
                  pct: analytics.membership.completeness.birthdayPct,
                  count: analytics.membership.completeness.birthdayCount,
                  color: '#F59E0B',
                },
              ].map((metric) => (
                <div key={metric.label} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#666A86] dark:text-[#A9ACC8]">{metric.label}</span>
                    <span className="font-mono font-semibold text-[#1D1B3A] dark:text-[#F2F2FA]">
                      {metric.pct}% ({metric.count})
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white dark:bg-[#1D1D3D] overflow-hidden border border-[#E9EBF5] dark:border-[#2D2D55]">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{ width: `${metric.pct}%`, backgroundColor: metric.color }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SECTION 4: MULTI-SERVICE & EVENT COMPARISON */}
      {(activeLens === 'all' || activeLens === 'services') && (
        <div
          className={`space-y-4 ${
            activeLens === 'all' ? 'pt-6 border-t border-[#E9EBF5] dark:border-[#2D2D55]' : ''
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#6D5CF2] shrink-0" />
              <div>
                <h3 className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                  Scheduled Services &amp; Events Comparison
                </h3>
                <p className="text-xs text-[#666A86] dark:text-[#A9ACC8]">
                  Click any service or event below to set it as the active focus across the entire dashboard.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {onOpenServiceHistory && (
                <button
                  type="button"
                  onClick={onOpenServiceHistory}
                  className="px-3 py-1.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] bg-white dark:bg-[#1D1D3D] text-[#1D1B3A] dark:text-[#F2F2FA] text-xs font-semibold hover:border-[#6D5CF2]/50 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <History className="w-3.5 h-3.5 text-[#6D5CF2]" />
                  <span>Full Service History</span>
                </button>
              )}
              <button
                type="button"
                onClick={onAddService}
                className="px-3 py-1.5 rounded-xl bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#9D90FF] text-xs font-semibold hover:opacity-90 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Schedule Service / Event</span>
              </button>
            </div>
          </div>

          {filteredServices.length === 0 ? (
            <div className="py-8 px-4 text-center rounded-2xl bg-[#F6F7FC] dark:bg-[#14142E] border border-dashed border-[#E9EBF5] dark:border-[#2D2D55]">
              <p className="text-xs text-[#666A86] dark:text-[#A9ACC8]">
                No scheduled services or events match your filter.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-[#E9EBF5] dark:border-[#2D2D55]">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-[#F6F7FC] dark:bg-[#14142E] border-b border-[#E9EBF5] dark:border-[#2D2D55] text-[#666A86] dark:text-[#A9ACC8]">
                  <tr>
                    <th className="py-2.5 px-3.5 font-semibold">Service / Event</th>
                    <th className="py-2.5 px-3 font-semibold">Window &amp; Allowance</th>
                    <th className="py-2.5 px-3 font-semibold">Status</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Checked In</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Expected</th>
                    <th className="py-2.5 px-3 font-semibold min-w-[110px]">Target Fill</th>
                    <th className="py-2.5 px-3 font-semibold text-right">On-Time</th>
                    <th className="py-2.5 px-3.5 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E9EBF5] dark:divide-[#2D2D55] tabular-nums">
                  {filteredServices.map((svc) => {
                    const binaryKey = svc.binaryStatus === 'live' ? 'live' : 'closed';
                    const statusInfo = BINARY_STATUS_LABELS[binaryKey];
                    const isConfirmingDelete = confirmDeleteSvcId === svc.id;
                    return (
                      <tr
                        key={svc.id}
                        onClick={() => onSelectService(svc.id)}
                        className={`transition-colors cursor-pointer ${
                          svc.isActive
                            ? 'bg-[#EFEDFF]/60 dark:bg-[#2A2A55]/50'
                            : 'hover:bg-[#F8F9FD] dark:hover:bg-white/[0.03]'
                        }`}
                      >
                        <td className="py-2.5 px-3.5 font-semibold text-[#1D1B3A] dark:text-[#F2F2FA]">
                          <span>{svc.name}</span>
                          {svc.isActive && (
                            <span className="ml-2 text-[11px] font-semibold text-[#6D5CF2] dark:text-[#9D90FF]">
                              · Active
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-[#666A86] dark:text-[#A9ACC8] whitespace-nowrap">
                          {svc.date ? `${svc.date} · ` : ''}
                          {svc.startsAt}–{svc.endsAt}{' '}
                          <span className="font-mono text-[11px]">(+{svc.dwellMinutes}m)</span>
                        </td>
                        <td className={`py-2.5 px-3 font-semibold whitespace-nowrap ${statusInfo.colorClass}`}>
                          <span className="inline-flex items-center gap-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dotClass}`} />
                            <span>{statusInfo.label}</span>
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-semibold text-[#1D1B3A] dark:text-[#F2F2FA]">
                          {svc.checkedInCount}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-[#666A86] dark:text-[#A9ACC8]">
                          {svc.expectedAttendance}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 rounded-full bg-[#EFEDFF] dark:bg-[#2A2A55] overflow-hidden">
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
                        <td className="py-2.5 px-3 text-right font-mono text-[#666A86] dark:text-[#A9ACC8]">
                          {svc.onTimePct}%
                        </td>
                        <td
                          className="py-2.5 px-3.5 text-right whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="inline-flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                onOpenServiceRegister
                                  ? onOpenServiceRegister(svc.id)
                                  : onSelectService(svc.id)
                              }
                              title="Open Service Register"
                              aria-label={`Open register for ${svc.name}`}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-[#E9EBF5] dark:border-[#2D2D55] bg-white dark:bg-[#1D1D3D] text-[#1D1B3A] dark:text-[#F2F2FA] hover:border-[#6D5CF2]/60 text-[11px] font-semibold cursor-pointer"
                            >
                              <ClipboardList className="w-3 h-3 text-[#6D5CF2]" />
                              <span>Register</span>
                            </button>

                            {onToggleServiceStatus && (
                              <button
                                type="button"
                                onClick={() =>
                                  onToggleServiceStatus(
                                    svc.id,
                                    binaryKey === 'live' ? 'closed' : 'live'
                                  )
                                }
                                title={binaryKey === 'live' ? 'Close service' : 'Reopen service'}
                                aria-label={
                                  binaryKey === 'live' ? `Close ${svc.name}` : `Reopen ${svc.name}`
                                }
                                className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer ${
                                  binaryKey === 'live'
                                    ? 'border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300'
                                    : 'border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
                                }`}
                              >
                                <Power className="w-3 h-3" />
                                <span>{binaryKey === 'live' ? 'Close' : 'Reopen'}</span>
                              </button>
                            )}

                            {onEditService && (
                              <button
                                type="button"
                                onClick={() => onEditService(svc.id)}
                                title="Edit time window and allowance"
                                aria-label={`Edit ${svc.name}`}
                                className="p-1.5 rounded-lg border border-[#E9EBF5] dark:border-[#2D2D55] bg-white dark:bg-[#1D1D3D] text-[#666A86] dark:text-[#A9ACC8] hover:text-[#6D5CF2] cursor-pointer"
                              >
                                <Edit3 className="w-3 h-3" />
                              </button>
                            )}

                            {onDeleteService &&
                              (isConfirmingDelete ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setConfirmDeleteSvcId(null);
                                    onDeleteService(svc.id);
                                  }}
                                  className="px-2 py-1 rounded-lg bg-rose-600 text-white text-[11px] font-bold cursor-pointer"
                                >
                                  Confirm
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteSvcId(svc.id)}
                                  title="Delete service"
                                  aria-label={`Delete ${svc.name}`}
                                  className="p-1.5 rounded-lg border border-[#E9EBF5] dark:border-[#2D2D55] bg-white dark:bg-[#1D1D3D] text-[#666A86] dark:text-[#A9ACC8] hover:text-rose-600 cursor-pointer"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
});
