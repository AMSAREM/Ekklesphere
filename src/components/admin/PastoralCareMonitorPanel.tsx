import React, { useEffect, useMemo, useState } from 'react';
import { useEkklesphere } from '../../context/EkklesphereContext';
import {
  BellRing,
  Check,
  CheckCircle2,
  Clock,
  HeartHandshake,
  Mail,
  MessageSquare,
  RefreshCw,
  Send,
  Settings,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { ContactCallButton } from '../common/ContactCallButton';
import type { FollowupTask, PastoralCareDispatch } from '../../types/ekklesphere';

type DispatchFilter = 'all' | 'absent_member_alert' | 'leader_reminder';

function formatRelativeOrIso(iso?: string | null): string {
  if (!iso) return 'Never';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  return dt.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDispatchStatusLabel(status: PastoralCareDispatch['status']): {
  label: string;
  toneClass: string;
} {
  switch (status) {
    case 'sent':
      return {
        label: 'Delivered',
        toneClass: 'text-emerald-700 dark:text-emerald-400',
      };
    case 'skipped_opt_out':
      return {
        label: 'Member Opted Out',
        toneClass: 'text-slate-600 dark:text-slate-400',
      };
    case 'skipped_no_contact':
      return {
        label: 'Missing Phone / Email',
        toneClass: 'text-amber-700 dark:text-amber-400',
      };
    case 'skipped_unconfigured':
      return {
        label: 'Gateway Key Unset',
        toneClass: 'text-amber-700 dark:text-amber-400',
      };
    case 'failed':
      return {
        label: 'Delivery Failed',
        toneClass: 'text-rose-700 dark:text-rose-400',
      };
    default:
      return {
        label: String(status),
        toneClass: 'text-[#666A86] dark:text-[#A9ACC8]',
      };
  }
}

function formatChannelLabel(channel: PastoralCareDispatch['channel']): string {
  switch (channel) {
    case 'sms':
      return 'Arkesel SMS';
    case 'email':
      return 'Resend Email';
    case 'in_app':
      return 'Leader Portal Alert';
    default:
      return String(channel);
  }
}

export const PastoralCareMonitorPanel: React.FC = () => {
  const {
    services,
    currentService,
    members,
    followupTasks,
    pastoralMonitor,
    isLoadingPastoralMonitor,
    isRunningAbsenceSweep,
    isSendingLeaderReminders,
    fetchPastoralMonitor,
    runAbsenceSweep,
    sendLeaderCareReminders,
    resolveFollowupTask,
    requestOpenSettings,
    systemSettings,
    communicationStatus,
  } = useEkklesphere();

  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [forceResweep, setForceResweep] = useState(false);
  const [dispatchFilter, setDispatchFilter] = useState<DispatchFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLeaderFilter, setSelectedLeaderFilter] = useState<string | null>(null);
  const [remindingLeaderKey, setRemindingLeaderKey] = useState<string | null>(null);

  useEffect(() => {
    fetchPastoralMonitor().catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedEventId && currentService?.id) {
      setSelectedEventId(currentService.id);
    }
  }, [currentService?.id, selectedEventId]);

  const effectiveTasks: FollowupTask[] = pastoralMonitor?.tasks || followupTasks;
  const dispatches: PastoralCareDispatch[] = pastoralMonitor?.dispatches || [];
  const leaderScorecard = pastoralMonitor?.leaderScorecard || [];
  const processedSet = useMemo(
    () => new Set(pastoralMonitor?.processedEventIds || []),
    [pastoralMonitor?.processedEventIds]
  );

  const stats = pastoralMonitor?.stats || {
    openTasksCount: effectiveTasks.filter((t) => t.status === 'open').length,
    contactedTasksCount: effectiveTasks.filter((t) => t.status === 'contacted').length,
    resolvedTasksCount: effectiveTasks.filter((t) => t.status === 'resolved').length,
    resolutionRatePct: (() => {
      const active = effectiveTasks.filter(
        (t) => t.status === 'open' || t.status === 'contacted' || t.status === 'resolved'
      );
      if (active.length === 0) return 100;
      const done = active.filter((t) => t.status === 'resolved').length;
      return Math.round((done / active.length) * 100);
    })(),
    absentMemberMessagesSent: dispatches.filter(
      (d) => d.dispatchType === 'absent_member_alert' && d.status === 'sent'
    ).length,
    leaderRemindersSent: dispatches.filter(
      (d) => d.dispatchType === 'leader_reminder' && d.status === 'sent'
    ).length,
    totalDispatches: dispatches.length,
  };

  const filteredDispatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return dispatches.filter((d) => {
      if (dispatchFilter !== 'all' && d.dispatchType !== dispatchFilter) return false;
      if (!q) return true;
      return (
        d.recipientName.toLowerCase().includes(q) ||
        d.memberName.toLowerCase().includes(q) ||
        d.messageBody.toLowerCase().includes(q) ||
        (d.serviceName || '').toLowerCase().includes(q)
      );
    });
  }, [dispatches, dispatchFilter, searchQuery]);

  const activeLeaderTasks = useMemo(() => {
    if (!selectedLeaderFilter) return [];
    const target = selectedLeaderFilter.trim().toLowerCase();
    return effectiveTasks.filter(
      (t) => (t.assignedToName || '').trim().toLowerCase() === target
    );
  }, [effectiveTasks, selectedLeaderFilter]);

  const handleRunSweep = async () => {
    await runAbsenceSweep({
      eventId: selectedEventId || undefined,
      force: forceResweep,
    });
    setForceResweep(false);
  };

  const handleRemindLeader = async (leaderName: string) => {
    setRemindingLeaderKey(leaderName.toLowerCase());
    try {
      await sendLeaderCareReminders({ leaderName });
    } finally {
      setRemindingLeaderKey(null);
    }
  };

  const memberById = useMemo(() => {
    const map = new Map<string, (typeof members)[number]>();
    for (const m of members) map.set(m.id, m);
    return map;
  }, [members]);

  return (
    <div className="space-y-5">
      {/* Header & Command Actions */}
      <section className="bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl p-5 sm:p-6 border border-[#E9EBF5] dark:border-[#2D2D55] shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-[#666A86] dark:text-[#A9ACC8] mb-1">
              <ShieldCheck className="w-3.5 h-3.5 text-[#6D5CF2] shrink-0" />
              <span>Oversight Portal</span>
              <span aria-hidden="true">·</span>
              <span>Administrator · Pastor · Presiding Elder · Associate Pastor</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1D1B3A] dark:text-[#F2F2FA]">
              Pastoral Care Automation &amp; Follow-up Monitor
            </h1>
            <p className="text-xs text-[#666A86] dark:text-[#A9ACC8] mt-1 max-w-3xl leading-relaxed">
              Automatically sends caring outreach messages to members absent from services and dispatches follow-up reminders to assigned cell leaders, ministry heads, deacons, and elders.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => fetchPastoralMonitor()}
              disabled={isLoadingPastoralMonitor}
              className="px-3 py-2 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] bg-[#F6F7FC] dark:bg-[#14142E] hover:bg-slate-100 dark:hover:bg-white/5 text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingPastoralMonitor ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              onClick={() => requestOpenSettings('pastoral')}
              className="px-3 py-2 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] bg-[#F6F7FC] dark:bg-[#14142E] hover:bg-slate-100 dark:hover:bg-white/5 text-xs font-bold text-[#6D5CF2] dark:text-[#9D90FF] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Pastoral Rules</span>
            </button>
            <button
              type="button"
              onClick={() => sendLeaderCareReminders()}
              disabled={isSendingLeaderReminders || stats.openTasksCount + stats.contactedTasksCount === 0}
              className="px-3.5 py-2 rounded-xl bg-[#EFEDFF] dark:bg-[#2A2A55] hover:opacity-90 text-xs font-bold text-[#6D5CF2] dark:text-[#9D90FF] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
            >
              <BellRing className="w-3.5 h-3.5" />
              <span>
                {isSendingLeaderReminders ? 'Sending Reminders...' : 'Send All Leader Reminders'}
              </span>
            </button>
            <button
              type="button"
              onClick={handleRunSweep}
              disabled={isRunningAbsenceSweep}
              className="px-4 py-2 rounded-xl bg-[#6D5CF2] hover:bg-[#5B4BE0] text-white text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
            >
              <Send className="w-3.5 h-3.5" />
              <span>
                {isRunningAbsenceSweep ? 'Running Sweep...' : 'Run Absence Sweep & Notify'}
              </span>
            </button>
          </div>
        </div>

        {/* Service Sweep Controls & Gateway Readiness Strip */}
        <div className="mt-4 pt-4 border-t border-[#E9EBF5] dark:border-[#2D2D55] flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="sweep-service-select" className="font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
              Target Service:
            </label>
            <select
              id="sweep-service-select"
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
              className="px-3 py-1.5 rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-xs font-semibold text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
            >
              <option value="">Latest Closed / Active Service</option>
              {services
                .filter((s) => Boolean(s.id))
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.date}){processedSet.has(s.id) ? ' · Swept' : ''}
                  </option>
                ))}
            </select>
            <label className="inline-flex items-center gap-1.5 text-[#666A86] dark:text-[#A9ACC8] cursor-pointer">
              <input
                type="checkbox"
                checked={forceResweep}
                onChange={(e) => setForceResweep(e.target.checked)}
                className="rounded border-[#CBC6F7] text-[#6D5CF2] focus:ring-[#6D5CF2]"
              />
              <span>Force re-sweep if already processed</span>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#666A86] dark:text-[#A9ACC8] tabular-nums">
            <span>
              Absentee Alert:{' '}
              <strong className="text-[#1D1B3A] dark:text-[#F2F2FA]">
                {systemSettings.autoMessageAbsentMembers !== false ? 'Automatic' : 'Paused'}
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Threshold:{' '}
              <strong className="text-[#1D1B3A] dark:text-[#F2F2FA]">
                {systemSettings.absenteeThresholdServices} missed
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Arkesel SMS:{' '}
              <strong
                className={
                  communicationStatus.arkeselConfigured
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-amber-700 dark:text-amber-400'
                }
              >
                {communicationStatus.arkeselConfigured ? 'Ready' : 'Key Unset'}
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Resend Email:{' '}
              <strong
                className={
                  communicationStatus.resendConfigured
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-[#666A86] dark:text-[#A9ACC8]'
                }
              >
                {communicationStatus.resendConfigured ? 'Ready' : 'Optional'}
              </strong>
            </span>
          </div>
        </div>
      </section>

      {/* 5-Column KPI Summary Strip */}
      <section aria-label="Pastoral Care Key Metrics" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="bg-white dark:bg-[#1D1D3D] rounded-2xl p-4 border border-[#E9EBF5] dark:border-[#2D2D55]">
          <div className="text-[11px] font-semibold text-[#666A86] dark:text-[#A9ACC8]">
            Absent Member Messages
          </div>
          <div className="mt-1.5 text-2xl font-bold text-[#1D1B3A] dark:text-[#F2F2FA] tabular-nums">
            {stats.absentMemberMessagesSent}
          </div>
          <div className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] mt-0.5">
            Caring SMS / Email sent
          </div>
        </div>

        <div className="bg-white dark:bg-[#1D1D3D] rounded-2xl p-4 border border-[#E9EBF5] dark:border-[#2D2D55]">
          <div className="text-[11px] font-semibold text-[#666A86] dark:text-[#A9ACC8]">
            Leader Reminders Sent
          </div>
          <div className="mt-1.5 text-2xl font-bold text-[#6D5CF2] dark:text-[#9D90FF] tabular-nums">
            {stats.leaderRemindersSent}
          </div>
          <div className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] mt-0.5">
            SMS, email &amp; portal alerts
          </div>
        </div>

        <div className="bg-white dark:bg-[#1D1D3D] rounded-2xl p-4 border border-[#E9EBF5] dark:border-[#2D2D55]">
          <div className="text-[11px] font-semibold text-[#666A86] dark:text-[#A9ACC8]">
            Open Care Tasks
          </div>
          <div className="mt-1.5 text-2xl font-bold text-rose-600 dark:text-rose-400 tabular-nums">
            {stats.openTasksCount}
          </div>
          <div className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] mt-0.5">
            Awaiting leader contact
          </div>
        </div>

        <div className="bg-white dark:bg-[#1D1D3D] rounded-2xl p-4 border border-[#E9EBF5] dark:border-[#2D2D55]">
          <div className="text-[11px] font-semibold text-[#666A86] dark:text-[#A9ACC8]">
            Contacted / In Progress
          </div>
          <div className="mt-1.5 text-2xl font-bold text-amber-600 dark:text-amber-400 tabular-nums">
            {stats.contactedTasksCount}
          </div>
          <div className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] mt-0.5">
            Leader acknowledged or called
          </div>
        </div>

        <div className="col-span-2 sm:col-span-1 bg-white dark:bg-[#1D1D3D] rounded-2xl p-4 border border-[#E9EBF5] dark:border-[#2D2D55]">
          <div className="text-[11px] font-semibold text-[#666A86] dark:text-[#A9ACC8]">
            Resolution Rate
          </div>
          <div className="mt-1.5 text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
            {stats.resolutionRatePct}%
          </div>
          <div className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] mt-0.5 tabular-nums">
            {stats.resolvedTasksCount} care cases resolved
          </div>
        </div>
      </section>

      {/* Leader-in-Charge Accountability Scorecard */}
      <section className="bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl p-5 sm:p-6 border border-[#E9EBF5] dark:border-[#2D2D55] shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h2 className="text-base font-bold text-[#1D1B3A] dark:text-[#F2F2FA] flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-[#6D5CF2]" />
              <span>Leader-in-Charge Follow-up Accountability</span>
            </h2>
            <p className="text-xs text-[#666A86] dark:text-[#A9ACC8]">
              Monitor which cell leaders, ministry heads, deacons, and elders have followed up on assigned members.
            </p>
          </div>
          {selectedLeaderFilter && (
            <button
              type="button"
              onClick={() => setSelectedLeaderFilter(null)}
              className="text-xs font-bold text-[#6D5CF2] dark:text-[#9D90FF] hover:underline cursor-pointer self-start sm:self-auto"
            >
              Close Leader Task Drilldown
            </button>
          )}
        </div>

        {isLoadingPastoralMonitor && leaderScorecard.length === 0 ? (
          <div className="py-8 text-center text-xs text-[#666A86] dark:text-[#A9ACC8]">
            Loading leader accountability metrics...
          </div>
        ) : leaderScorecard.length === 0 ? (
          <div className="py-10 text-center border border-dashed border-[#E9EBF5] dark:border-[#2D2D55] rounded-2xl bg-[#F6F7FC] dark:bg-[#14142E]">
            <HeartHandshake className="w-6 h-6 text-[#6D5CF2] mx-auto mb-2" />
            <p className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
              No follow-up assignments logged yet
            </p>
            <p className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] mt-1">
              Close a service or click &ldquo;Run Absence Sweep &amp; Notify&rdquo; above to automatically message absent members and notify leaders in charge.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#E9EBF5] dark:border-[#2D2D55] text-[11px] font-semibold text-[#666A86] dark:text-[#A9ACC8]">
                  <th className="py-2.5 pr-3">Leader in Charge</th>
                  <th className="py-2.5 px-3 text-right">Open</th>
                  <th className="py-2.5 px-3 text-right">Contacted</th>
                  <th className="py-2.5 px-3 text-right">Resolved</th>
                  <th className="py-2.5 px-3 text-right">Reminders</th>
                  <th className="py-2.5 px-3">Last Reminded</th>
                  <th className="py-2.5 pl-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E9EBF5] dark:divide-[#2D2D55]">
                {leaderScorecard.map((row) => {
                  const isSelected =
                    selectedLeaderFilter?.toLowerCase() === row.leaderName.toLowerCase();
                  const hasPending = row.openCount + row.contactedCount > 0;
                  const isBusy = remindingLeaderKey === row.leaderName.toLowerCase();
                  return (
                    <tr
                      key={row.leaderName}
                      className={`hover:bg-[#F6F7FC]/70 dark:hover:bg-white/[0.02] transition-colors ${
                        isSelected ? 'bg-[#EFEDFF]/40 dark:bg-[#2A2A55]/30' : ''
                      }`}
                    >
                      <td className="py-3 pr-3">
                        <div className="font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                          {row.leaderName}
                        </div>
                        <div className="text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
                          {row.leaderRole || 'Pastoral Leader'}
                          {row.leaderPhone ? ` · ${row.leaderPhone}` : ''}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right font-bold tabular-nums text-rose-600 dark:text-rose-400">
                        {row.openCount}
                      </td>
                      <td className="py-3 px-3 text-right font-bold tabular-nums text-amber-600 dark:text-amber-400">
                        {row.contactedCount}
                      </td>
                      <td className="py-3 px-3 text-right font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                        {row.resolvedCount}
                      </td>
                      <td className="py-3 px-3 text-right font-semibold tabular-nums text-[#1D1B3A] dark:text-[#F2F2FA]">
                        {row.remindersSent}
                      </td>
                      <td className="py-3 px-3 text-[#666A86] dark:text-[#A9ACC8] tabular-nums whitespace-nowrap">
                        {formatRelativeOrIso(row.lastReminderAt)}
                      </td>
                      <td className="py-3 pl-3 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedLeaderFilter(isSelected ? null : row.leaderName)
                            }
                            className="px-2.5 py-1.5 rounded-lg border border-[#E9EBF5] dark:border-[#2D2D55] bg-white dark:bg-[#14142E] text-[11px] font-semibold text-[#1D1B3A] dark:text-[#F2F2FA] hover:border-[#6D5CF2] whitespace-nowrap cursor-pointer"
                          >
                            {isSelected ? 'Hide Cases' : `Cases (${row.totalAssigned})`}
                          </button>
                          <button
                            type="button"
                            disabled={!hasPending || isBusy || isSendingLeaderReminders}
                            onClick={() => handleRemindLeader(row.leaderName)}
                            className="px-2.5 py-1.5 rounded-lg bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#9D90FF] text-[11px] font-bold hover:opacity-90 whitespace-nowrap cursor-pointer disabled:opacity-40"
                          >
                            {isBusy ? 'Sending...' : 'Remind'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Selected Leader Case Drilldown */}
        {selectedLeaderFilter && (
          <div className="mt-4 pt-4 border-t border-[#E9EBF5] dark:border-[#2D2D55]">
            <h3 className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-2">
              Assigned Cases for {selectedLeaderFilter} ({activeLeaderTasks.length})
            </h3>
            <div className="divide-y divide-[#E9EBF5] dark:divide-[#2D2D55] border-y border-[#E9EBF5] dark:border-[#2D2D55]">
              {activeLeaderTasks.map((task) => {
                const person = memberById.get(task.personId);
                const phone = task.personPhone || person?.phoneE164 || person?.phoneNumber;
                const email = task.personEmail || person?.email;
                const isDone = task.status === 'resolved' || task.status === 'dismissed';
                return (
                  <div
                    key={task.id}
                    className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                          {task.personName}
                        </span>
                        <span className="text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
                          {task.groupName} · Status:{' '}
                          <strong className="capitalize">{task.status}</strong> · Reminders:{' '}
                          <span className="tabular-nums">{task.reminderCount || 0}</span>
                        </span>
                      </div>
                      {task.notes && (
                        <p className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] mt-0.5">
                          {task.notes}
                        </p>
                      )}
                      {task.acknowledgedAt && (
                        <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5">
                          Leader acknowledged: {formatRelativeOrIso(task.acknowledgedAt)}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {!isDone && (
                        <>
                          <ContactCallButton
                            compact
                            contactName={task.personName}
                            contactPhone={phone}
                            contactEmail={email}
                            contactGroup={task.groupName}
                            onLogOutcome={async (outcome, markResolved) => {
                              await resolveFollowupTask(
                                task.id,
                                outcome,
                                markResolved ? 'resolved' : 'contacted'
                              );
                              fetchPastoralMonitor().catch(() => {});
                            }}
                          />
                          <button
                            type="button"
                            onClick={async () => {
                              await resolveFollowupTask(
                                task.id,
                                'Verified resolved in oversight monitor',
                                'resolved'
                              );
                              fetchPastoralMonitor().catch(() => {});
                            }}
                            className="px-2.5 py-1.5 rounded-lg border border-[#E9EBF5] dark:border-[#2D2D55] text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Check className="w-3 h-3" />
                            <span>Resolve</span>
                          </button>
                        </>
                      )}
                      {isDone && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Completed</span>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* Automated Dispatch & Reminder Ledger */}
      <section className="bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl p-5 sm:p-6 border border-[#E9EBF5] dark:border-[#2D2D55] shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-[#1D1B3A] dark:text-[#F2F2FA] flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-[#6D5CF2]" />
              <span>Automated Absent-Member Messages &amp; Leader Reminder Log</span>
            </h2>
            <p className="text-xs text-[#666A86] dark:text-[#A9ACC8]">
              Full audit log of caring messages sent to absent members and pastoral reminders dispatched to leaders.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 p-1 bg-[#F6F7FC] dark:bg-[#14142E] rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55]">
              {(
                [
                  { id: 'all', label: `All (${dispatches.length})` },
                  { id: 'absent_member_alert', label: 'Absent Members' },
                  { id: 'leader_reminder', label: 'Leader Reminders' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setDispatchFilter(tab.id)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    dispatchFilter === tab.id
                      ? 'bg-white dark:bg-[#1D1D3D] text-[#6D5CF2] dark:text-[#9D90FF] shadow-2xs font-bold'
                      : 'text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search member or leader..."
              className="px-3 py-1.5 rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-xs text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
            />
          </div>
        </div>

        {filteredDispatches.length === 0 ? (
          <div className="py-10 text-center border border-dashed border-[#E9EBF5] dark:border-[#2D2D55] rounded-2xl bg-[#F6F7FC] dark:bg-[#14142E] text-xs text-[#666A86] dark:text-[#A9ACC8]">
            No automated outreach messages or reminders match the current filter yet.
          </div>
        ) : (
          <div className="divide-y divide-[#E9EBF5] dark:divide-[#2D2D55] border-y border-[#E9EBF5] dark:border-[#2D2D55]">
            {filteredDispatches.slice(0, 60).map((d) => {
              const statusMeta = formatDispatchStatusLabel(d.status);
              return (
                <div key={d.id} className="py-3 flex flex-col gap-1 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
                      <span className="font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                        {d.dispatchType === 'absent_member_alert'
                          ? `Member Outreach · ${d.recipientName}`
                          : `Leader Reminder · ${d.recipientName}`}
                      </span>
                      <span className="text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
                        {d.recipientRole ? `${d.recipientRole} · ` : ''}
                        {formatChannelLabel(d.channel)}
                        {d.serviceName ? ` · ${d.serviceName}` : ''}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] tabular-nums shrink-0">
                      <span className={`font-bold ${statusMeta.toneClass}`}>
                        {statusMeta.label}
                      </span>
                      <span aria-hidden="true" className="text-[#CBC6F7]">
                        ·
                      </span>
                      <span className="text-[#666A86] dark:text-[#A9ACC8] inline-flex items-center gap-1">
                        {d.channel === 'email' ? (
                          <Mail className="w-3 h-3" />
                        ) : (
                          <Clock className="w-3 h-3" />
                        )}
                        {formatRelativeOrIso(d.createdAt)}
                      </span>
                    </div>
                  </div>

                  <p className="text-[11px] text-[#1D1B3A]/85 dark:text-[#F2F2FA]/85 leading-relaxed">
                    {d.messageBody}
                  </p>
                  {d.errorMessage && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-400">
                      Note: {d.errorMessage}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
