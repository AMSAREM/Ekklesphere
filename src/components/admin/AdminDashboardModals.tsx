import React, { useState, useEffect } from 'react';
import { X, Send, PhoneCall, Check, Download, Settings } from 'lucide-react';
import {
  ChurchGroup,
  FollowupTask,
  Person,
  ServiceInstance,
  SystemSettings,
} from '../../types/ekklesphere';
import { MemberAvatar } from '../common/MemberAvatar';
import {
  formatFollowupDueDateLabel,
  memberMatchesChurchGroup,
  resolveFollowupAssignee,
} from '../../utils/settingsConnections';
import { computeServiceBinaryStatus } from '../../utils/serviceStatus';

export interface AddServiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultDate: string;
  systemSettings: SystemSettings;
  onSubmitService: (params: {
    name: string;
    date: string;
    startsAt: string;
    endsAt: string;
    expectedAttendance: number;
    dwellMinutes: number;
  }) => Promise<void>;
  onNotify: (msg: string) => void;
  formatDateLabel: (isoDate?: string, includeYear?: boolean) => string;
}

export const AddServiceModal = React.memo<AddServiceModalProps>(
  ({
    isOpen,
    onClose,
    defaultDate,
    systemSettings,
    onSubmitService,
    onNotify,
    formatDateLabel,
  }) => {
    const [name, setName] = useState('Sunday Main Service');
    const [date, setDate] = useState(defaultDate);
    const [startsAt, setStartsAt] = useState('08:00');
    const [endsAt, setEndsAt] = useState('10:30');
    const [expectedAttendance, setExpectedAttendance] = useState('');
    const [dwellMinutes, setDwellMinutes] = useState(
      String(systemSettings.dwellTimeMinutes || 5)
    );
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
      if (isOpen) {
        setDate(defaultDate);
        setDwellMinutes(String(systemSettings.dwellTimeMinutes || 5));
      }
    }, [isOpen, defaultDate, systemSettings.dwellTimeMinutes]);

    if (!isOpen) return null;

    const handleSubmit = async () => {
      if (!name.trim()) {
        onNotify('Please enter a service name');
        return;
      }
      if (!date) {
        onNotify('Please select a service date');
        return;
      }
      setIsSaving(true);
      try {
        const parsedAllowance = Number(dwellMinutes);
        await onSubmitService({
          name: name.trim(),
          date,
          startsAt: startsAt || '08:00',
          endsAt: endsAt || '10:30',
          expectedAttendance: Number(expectedAttendance) || 0,
          dwellMinutes:
            Number.isFinite(parsedAllowance) && parsedAllowance >= 0
              ? parsedAllowance
              : systemSettings.dwellTimeMinutes ?? 5,
        });
        onClose();
      } catch (err: any) {
        onNotify(err?.message || 'Could not schedule service');
      } finally {
        setIsSaving(false);
      }
    };

    return (
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
        <div className="bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-xl border border-[#E9EBF5] dark:border-[#2D2D55] max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
              Schedule New Service
            </h3>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close schedule service modal"
              className="text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="space-y-3 text-xs">
            <div>
              <label
                htmlFor="new-service-name"
                className="block font-semibold mb-1 text-[#1D1B3A] dark:text-[#F2F2FA]"
              >
                Service Name
              </label>
              <input
                id="new-service-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Sunday First Service"
                className="w-full min-h-[44px] p-2.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] bg-slate-50 dark:bg-black/20 text-[#1D1B3A] dark:text-[#F2F2FA]"
              />
            </div>
            <div>
              <label
                htmlFor="new-service-date"
                className="block font-semibold mb-1 text-[#1D1B3A] dark:text-[#F2F2FA]"
              >
                Service Date
              </label>
              <input
                id="new-service-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full min-h-[44px] p-2.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] bg-slate-50 dark:bg-black/20 text-[#1D1B3A] dark:text-[#F2F2FA] tabular-nums"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label
                  htmlFor="new-service-start"
                  className="block font-semibold mb-1 text-[#1D1B3A] dark:text-[#F2F2FA]"
                >
                  Start Time
                </label>
                <input
                  id="new-service-start"
                  type="time"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                  className="w-full min-h-[44px] p-2.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] bg-slate-50 dark:bg-black/20 text-[#1D1B3A] dark:text-[#F2F2FA] tabular-nums"
                />
              </div>
              <div>
                <label
                  htmlFor="new-service-end"
                  className="block font-semibold mb-1 text-[#1D1B3A] dark:text-[#F2F2FA]"
                >
                  End Time
                </label>
                <input
                  id="new-service-end"
                  type="time"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                  className="w-full min-h-[44px] p-2.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] bg-slate-50 dark:bg-black/20 text-[#1D1B3A] dark:text-[#F2F2FA] tabular-nums"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label
                  htmlFor="new-service-expected"
                  className="block font-semibold mb-1 text-[#1D1B3A] dark:text-[#F2F2FA]"
                >
                  Expected Attendance
                </label>
                <input
                  id="new-service-expected"
                  type="number"
                  min="0"
                  value={expectedAttendance}
                  onChange={(e) => setExpectedAttendance(e.target.value)}
                  placeholder="Optional"
                  className="w-full min-h-[44px] p-2.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] bg-slate-50 dark:bg-black/20 text-[#1D1B3A] dark:text-[#F2F2FA] tabular-nums"
                />
              </div>
              <div>
                <label
                  htmlFor="new-service-dwell"
                  className="block font-semibold mb-1 text-[#1D1B3A] dark:text-[#F2F2FA]"
                >
                  Allowance Duration (Min)
                </label>
                <input
                  id="new-service-dwell"
                  type="number"
                  min="0"
                  value={dwellMinutes}
                  onChange={(e) => setDwellMinutes(e.target.value)}
                  className="w-full min-h-[44px] p-2.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] bg-slate-50 dark:bg-black/20 text-[#1D1B3A] dark:text-[#F2F2FA] tabular-nums"
                />
              </div>
            </div>
            <span className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] block leading-relaxed">
              Scheduled for{' '}
              <strong className="text-[#1D1B3A] dark:text-[#F2F2FA]">
                {formatDateLabel(date, true)}
              </strong>{' '}
              · Status is <strong className="text-emerald-600 dark:text-emerald-400">Live</strong> from{' '}
              {startsAt || '08:00'} until {endsAt || '10:30'} plus{' '}
              {dwellMinutes === '' ? systemSettings.dwellTimeMinutes : dwellMinutes} min allowance, and{' '}
              <strong className="text-[#1D1B3A] dark:text-[#F2F2FA]">Closed</strong> outside that window.
            </span>
          </div>
          <div className="flex gap-2 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] text-xs font-bold text-[#666A86] dark:text-[#A9ACC8] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={handleSubmit}
              className="flex-1 py-2.5 rounded-xl bg-[#6D5CF2] text-white text-xs font-bold disabled:opacity-60 cursor-pointer"
            >
              {isSaving ? 'Saving...' : 'Create Service'}
            </button>
          </div>
        </div>
      </div>
    );
  }
);

export interface EditableServiceTarget {
  id: string;
  name: string;
  date?: string;
  startsAt: string;
  endsAt: string;
  expectedAttendance: number;
  dwellMinutes?: number;
  startTimeIso?: string;
  endTimeIso?: string;
  manualClosed?: boolean;
  status: 'live' | 'closed';
}

export interface EditServiceModalProps {
  isOpen: boolean;
  service: EditableServiceTarget | null;
  defaultAllowanceMinutes: number;
  onClose: () => void;
  onSaveService: (
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
  ) => Promise<void>;
  onNotify: (msg: string) => void;
  formatDateLabel: (isoDate?: string, includeYear?: boolean) => string;
}

export const EditServiceModal = React.memo<EditServiceModalProps>(
  ({
    isOpen,
    service,
    defaultAllowanceMinutes,
    onClose,
    onSaveService,
    onNotify,
    formatDateLabel,
  }) => {
    const [name, setName] = useState('');
    const [date, setDate] = useState('');
    const [startsAt, setStartsAt] = useState('08:00');
    const [endsAt, setEndsAt] = useState('10:30');
    const [expectedAttendance, setExpectedAttendance] = useState('');
    const [dwellMinutes, setDwellMinutes] = useState('5');
    const [statusMode, setStatusMode] = useState<'auto' | 'closed'>('auto');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
      if (isOpen && service) {
        setName(service.name || '');
        setDate(service.date || new Date().toISOString().split('T')[0]);
        setStartsAt(service.startsAt || '08:00');
        setEndsAt(service.endsAt || '10:30');
        setExpectedAttendance(
          service.expectedAttendance > 0 ? String(service.expectedAttendance) : ''
        );
        setDwellMinutes(String(service.dwellMinutes ?? defaultAllowanceMinutes ?? 5));
        const isInWindowIfActive =
          computeServiceBinaryStatus({
            date: service.date,
            startsAt: service.startsAt,
            endsAt: service.endsAt,
            startTimeIso: service.startTimeIso,
            endTimeIso: service.endTimeIso,
            allowanceMinutes: service.dwellMinutes ?? defaultAllowanceMinutes ?? 5,
            rawStatus: 'active',
          }) === 'live';
        const isForceClosed =
          typeof service.manualClosed === 'boolean'
            ? service.manualClosed
            : service.status === 'closed' && isInWindowIfActive;
        setStatusMode(isForceClosed ? 'closed' : 'auto');
      }
    }, [isOpen, service, defaultAllowanceMinutes]);

    if (!isOpen || !service) return null;

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!name.trim()) {
        onNotify('Please enter a service name');
        return;
      }
      if (!date) {
        onNotify('Please select a service date');
        return;
      }
      const parsedAllowance = Math.max(0, Number(dwellMinutes) || 0);
      setIsSaving(true);
      try {
        await onSaveService(service.id, {
          name: name.trim(),
          date,
          startsAt: startsAt || '08:00',
          endsAt: endsAt || '10:30',
          expectedAttendance: Math.max(0, Number(expectedAttendance) || 0),
          dwellMinutes: parsedAllowance,
          status: statusMode === 'closed' ? 'closed' : 'live',
        });
        onClose();
      } catch (err: any) {
        onNotify(err?.message || 'Could not update service');
      } finally {
        setIsSaving(false);
      }
    };

    return (
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
        <form
          onSubmit={handleSubmit}
          className="bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-xl border border-[#E9EBF5] dark:border-[#2D2D55] max-h-[90vh] overflow-y-auto"
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                Edit Service Window &amp; Allowance
              </h3>
              <p className="text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
                Service status is strictly Live or Closed based on time set + allowance duration.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close edit service modal"
              className="text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label
                htmlFor="edit-service-name"
                className="block font-semibold mb-1 text-[#1D1B3A] dark:text-[#F2F2FA]"
              >
                Service Name
              </label>
              <input
                id="edit-service-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full min-h-[44px] p-2.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] bg-slate-50 dark:bg-black/20 text-[#1D1B3A] dark:text-[#F2F2FA]"
              />
            </div>

            <div>
              <label
                htmlFor="edit-service-date"
                className="block font-semibold mb-1 text-[#1D1B3A] dark:text-[#F2F2FA]"
              >
                Service Date
              </label>
              <input
                id="edit-service-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full min-h-[44px] p-2.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] bg-slate-50 dark:bg-black/20 text-[#1D1B3A] dark:text-[#F2F2FA] tabular-nums"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label
                  htmlFor="edit-service-start"
                  className="block font-semibold mb-1 text-[#1D1B3A] dark:text-[#F2F2FA]"
                >
                  Start Time
                </label>
                <input
                  id="edit-service-start"
                  type="time"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                  className="w-full min-h-[44px] p-2.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] bg-slate-50 dark:bg-black/20 text-[#1D1B3A] dark:text-[#F2F2FA] tabular-nums"
                />
              </div>
              <div>
                <label
                  htmlFor="edit-service-end"
                  className="block font-semibold mb-1 text-[#1D1B3A] dark:text-[#F2F2FA]"
                >
                  End Time
                </label>
                <input
                  id="edit-service-end"
                  type="time"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                  className="w-full min-h-[44px] p-2.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] bg-slate-50 dark:bg-black/20 text-[#1D1B3A] dark:text-[#F2F2FA] tabular-nums"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label
                  htmlFor="edit-service-expected"
                  className="block font-semibold mb-1 text-[#1D1B3A] dark:text-[#F2F2FA]"
                >
                  Expected Attendance
                </label>
                <input
                  id="edit-service-expected"
                  type="number"
                  min="0"
                  value={expectedAttendance}
                  onChange={(e) => setExpectedAttendance(e.target.value)}
                  placeholder="Optional"
                  className="w-full min-h-[44px] p-2.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] bg-slate-50 dark:bg-black/20 text-[#1D1B3A] dark:text-[#F2F2FA] tabular-nums"
                />
              </div>
              <div>
                <label
                  htmlFor="edit-service-dwell"
                  className="block font-semibold mb-1 text-[#1D1B3A] dark:text-[#F2F2FA]"
                >
                  Allowance Duration (Min)
                </label>
                <input
                  id="edit-service-dwell"
                  type="number"
                  min="0"
                  value={dwellMinutes}
                  onChange={(e) => setDwellMinutes(e.target.value)}
                  className="w-full min-h-[44px] p-2.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] bg-slate-50 dark:bg-black/20 text-[#1D1B3A] dark:text-[#F2F2FA] tabular-nums"
                />
              </div>
            </div>

            <div>
              <span className="block font-semibold mb-1 text-[#1D1B3A] dark:text-[#F2F2FA]">
                Register Status Rule
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setStatusMode('auto')}
                  className={`py-2 px-3 rounded-xl border font-semibold cursor-pointer transition-colors ${
                    statusMode === 'auto'
                      ? 'bg-[#6D5CF2] border-[#6D5CF2] text-white'
                      : 'bg-slate-50 dark:bg-black/20 border-[#E9EBF5] dark:border-[#2D2D55] text-[#666A86] dark:text-[#A9ACC8]'
                  }`}
                >
                  Live (By Window)
                </button>
                <button
                  type="button"
                  onClick={() => setStatusMode('closed')}
                  className={`py-2 px-3 rounded-xl border font-semibold cursor-pointer transition-colors ${
                    statusMode === 'closed'
                      ? 'bg-[#1D1B3A] dark:bg-white text-white dark:text-[#1D1B3A] border-transparent'
                      : 'bg-slate-50 dark:bg-black/20 border-[#E9EBF5] dark:border-[#2D2D55] text-[#666A86] dark:text-[#A9ACC8]'
                  }`}
                >
                  Force Closed
                </button>
              </div>
            </div>

            <span className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] block leading-relaxed tabular-nums">
              {formatDateLabel(date, true)} · {startsAt}–{endsAt} (+{Math.max(0, Number(dwellMinutes) || 0)} min allowance). Outside this window, or when Force Closed, status displays as Closed.
            </span>
          </div>

          <div className="flex gap-2 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] text-xs font-bold text-[#666A86] dark:text-[#A9ACC8] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 py-2.5 rounded-xl bg-[#6D5CF2] text-white text-xs font-bold disabled:opacity-60 cursor-pointer"
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    );
  }
);

export interface BroadcastModalProps {
  isOpen: boolean;
  onClose: () => void;
  members: Person[];
  churchGroups: ChurchGroup[];
  churchName?: string;
  serviceStartsAt: string;
  absenteeThresholdServices?: number;
  smsGatewayProvider?: string;
  smsSenderId?: string;
  enablePushNotifications?: boolean;
  onOpenGatewaySettings?: () => void;
  onNotify: (msg: string) => void;
}

export const BroadcastModal = React.memo<BroadcastModalProps>(
  ({
    isOpen,
    onClose,
    members,
    churchGroups,
    churchName,
    serviceStartsAt,
    absenteeThresholdServices = 2,
    smsGatewayProvider,
    smsSenderId,
    enablePushNotifications = true,
    onOpenGatewaySettings,
    onNotify,
  }) => {
    const [channel, setChannel] = useState<'push' | 'sms' | 'email'>('push');
    const [audience, setAudience] = useState('all');
    const [subject, setSubject] = useState('Service Reminder');
    const [body, setBody] = useState('');

    useEffect(() => {
      if (isOpen) {
        setBody(
          `Welcome to ${churchName || 'church'}! Service begins at ${serviceStartsAt}. If you have auto check-in enabled, your arrival will be marked automatically.`
        );
      }
    }, [isOpen, churchName, serviceStartsAt]);

    if (!isOpen) return null;

    const safeThreshold = Math.max(1, absenteeThresholdServices || 2);
    const activeGroups = churchGroups.filter((g) => g.active !== false);
    const absentMembersCount = members.filter((m) => (m.consecutiveAbsences || 0) >= safeThreshold).length;
    const visitorsCount = members.filter((m) => m.status === 'visitor').length;

    const getRecipientCount = (): number => {
      if (audience === 'all') return members.length;
      if (audience === 'absent') return absentMembersCount;
      if (audience === 'visitors') return visitorsCount;
      return members.filter((m) => memberMatchesChurchGroup(m, audience)).length;
    };

    const recipientCount = getRecipientCount();

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (channel === 'push' && !enablePushNotifications) {
        onNotify('Push broadcasts are paused in System Settings → Gateways. Switch to SMS/Email or re-enable Push.');
        return;
      }
      const routeHint =
        channel === 'sms' && smsGatewayProvider
          ? ` via ${smsGatewayProvider}${smsSenderId ? ` (${smsSenderId})` : ''}`
          : '';
      onNotify(
        `Broadcast queued via ${channel.toUpperCase()}${routeHint} to ${recipientCount} recipient${recipientCount === 1 ? '' : 's'} (${audience}).`
      );
      onClose();
    };

    return (
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
        <form
          onSubmit={handleSubmit}
          className="bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-xl border border-[#E9EBF5] dark:border-[#2D2D55] max-h-[90vh] overflow-y-auto"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
              Message Members
            </h3>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close message modal"
              className="text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label className="block font-semibold mb-1 text-[#1D1B3A] dark:text-[#F2F2FA]">
                Delivery Channel
              </label>
              <div className="flex gap-2">
                {(['push', 'sms', 'email'] as const).map((ch) => (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => setChannel(ch)}
                    className={`flex-1 py-2 rounded-xl font-bold uppercase transition-all cursor-pointer ${
                      channel === ch
                        ? 'bg-[#6D5CF2] text-white'
                        : 'bg-slate-100 dark:bg-black/20 text-[#666A86] dark:text-[#A9ACC8]'
                    }`}
                  >
                    {ch}
                  </button>
                ))}
              </div>
              <div className="mt-1.5 flex items-center justify-between text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
                <span>
                  {channel === 'sms'
                    ? `Gateway: ${smsGatewayProvider || 'Default SMS'} · Sender ID: ${smsSenderId || 'CHURCH'}`
                    : channel === 'push'
                    ? enablePushNotifications
                      ? 'Web & Mobile Push Engine Active'
                      : 'Push Notifications paused in Settings'
                    : 'SMTP Church Digest Dispatch'}
                </span>
                {onOpenGatewaySettings && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenGatewaySettings();
                    }}
                    className="text-[#6D5CF2] dark:text-[#8C7DFF] font-semibold hover:underline inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Settings className="w-3 h-3" />
                    <span>Gateways</span>
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="block font-semibold mb-1 text-[#1D1B3A] dark:text-[#F2F2FA]">
                Audience ({recipientCount} matched)
              </label>
              <select
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] bg-slate-50 dark:bg-black/20 text-[#1D1B3A] dark:text-[#F2F2FA]"
              >
                <option value="all">All registered members ({members.length})</option>
                <option value="absent">
                  Absent {safeThreshold}+ services ({absentMembersCount})
                </option>
                <option value="visitors">
                  Registered visitors ({visitorsCount})
                </option>
                {activeGroups.map((g) => {
                  const cnt = members.filter((m) => memberMatchesChurchGroup(m, g.name)).length;
                  const catLabel =
                    g.category === 'ministry'
                      ? 'Ministry'
                      : g.category === 'fellowship'
                      ? 'Fellowship'
                      : 'Cell';
                  return (
                    <option key={g.id} value={g.name}>
                      [{catLabel}] {g.name} ({cnt})
                    </option>
                  );
                })}
              </select>
            </div>

            <div>
              <label className="block font-semibold mb-1 text-[#1D1B3A] dark:text-[#F2F2FA]">
                Subject
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] bg-slate-50 dark:bg-black/20 text-[#1D1B3A] dark:text-[#F2F2FA]"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1 text-[#1D1B3A] dark:text-[#F2F2FA]">
                Message Body
              </label>
              <textarea
                rows={4}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] bg-slate-50 dark:bg-black/20 text-[#1D1B3A] dark:text-[#F2F2FA]"
              />
            </div>
          </div>

          <div className="flex gap-2 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] text-xs font-bold text-[#666A86] dark:text-[#A9ACC8] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 rounded-xl bg-[#6D5CF2] text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              Send Broadcast
            </button>
          </div>
        </form>
      </div>
    );
  }
);

export interface FollowupQueueModalProps {
  isOpen: boolean;
  onClose: () => void;
  followupTasks: FollowupTask[];
  members: Person[];
  absenteeThresholdServices?: number;
  firstTimerFollowupHours?: number;
  autoAssignCellLeaders?: boolean;
  onOpenPastoralSettings?: () => void;
  onResolveTask: (id: string, outcome: string) => void;
  onNotify: (msg: string) => void;
}

export const FollowupQueueModal = React.memo<FollowupQueueModalProps>(
  ({
    isOpen,
    onClose,
    followupTasks,
    members,
    absenteeThresholdServices = 2,
    firstTimerFollowupHours = 24,
    autoAssignCellLeaders = true,
    onOpenPastoralSettings,
    onResolveTask,
    onNotify,
  }) => {
    if (!isOpen) return null;

    const memberById = new Map(members.map((m) => [m.id, m]));
    const threshold = Math.max(1, absenteeThresholdServices || 2);

    return (
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-white dark:bg-[#1D1D3D] rounded-3xl max-w-2xl w-full p-6 shadow-xl border border-[#E9EBF5] dark:border-[#2D2D55] max-h-[85vh] flex flex-col">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-lg font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                Pastoral Care Follow-up Queue
              </h3>
              <p className="text-xs text-[#666A86] dark:text-[#A9ACC8]">
                Active Rules: {threshold}+ absences alert · Visitors within {firstTimerFollowupHours}h ·{' '}
                {autoAssignCellLeaders
                  ? 'Auto-routing to Group/Cell Leaders enabled'
                  : 'Assigned directly to Senior Pastor'}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {onOpenPastoralSettings && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenPastoralSettings();
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[11px] font-bold text-[#6D5CF2] dark:text-[#8C7DFF] inline-flex items-center gap-1 cursor-pointer"
                >
                  <Settings className="w-3 h-3" />
                  <span>Pastoral Rules</span>
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close pastoral follow-up queue"
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs">
            {followupTasks.length === 0 ? (
              <div className="text-center py-10 text-[#666A86] dark:text-[#A9ACC8]">
                No pastoral follow-up tasks in the queue yet.
              </div>
            ) : (
              followupTasks.map((t) => {
                const person = memberById.get(t.personId);
                return (
                  <div
                    key={t.id}
                    className="p-4 rounded-2xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <MemberAvatar
                        src={person?.imageUrl}
                        name={t.personName}
                        initials={person?.avatarInitials}
                        sizeClass="w-9 h-9"
                        textClass="text-xs font-bold"
                      />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mb-0.5">
                          <strong className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                            {t.personName}
                          </strong>
                          <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                            ·{' '}
                            {t.reason === 'absent_3'
                              ? 'Absent 3 Weeks'
                              : t.reason === 'absent_2'
                              ? 'Absent 2 Weeks'
                              : 'First Timer'}
                          </span>
                        </div>
                        <div className="text-[#666A86] dark:text-[#A9ACC8]">
                          {t.groupName} · Assigned to:{' '}
                          <strong className="text-[#1D1B3A] dark:text-[#F2F2FA]">
                            {t.assignedToName}
                          </strong>
                        </div>
                        {t.outcome && (
                          <div className="mt-1 text-emerald-600 dark:text-emerald-400">
                            Outcome: {t.outcome}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {t.status === 'open' ? (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              onNotify(`Dialing ${t.personName}...`);
                              onResolveTask(t.id, 'Contacted via phone.');
                            }}
                            className="bg-[#6D5CF2] text-white px-3 py-1.5 rounded-xl font-bold flex items-center gap-1 whitespace-nowrap cursor-pointer"
                          >
                            <PhoneCall className="w-3.5 h-3.5" />
                            Log Call
                          </button>
                          <button
                            type="button"
                            onClick={() => onResolveTask(t.id, 'Excused absence')}
                            className="bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#666A86] dark:text-[#A9ACC8] px-3 py-1.5 rounded-xl font-semibold whitespace-nowrap cursor-pointer"
                          >
                            Mark Excused
                          </button>
                        </>
                      ) : (
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                          <Check className="w-4 h-4" /> Resolved
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="pt-4 mt-3 border-t border-[#E9EBF5] dark:border-[#2D2D55] flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-[#6D5CF2] hover:bg-[#5A48DE] text-white font-bold text-xs transition-colors cursor-pointer"
            >
              Close Queue
            </button>
          </div>
        </div>
      </div>
    );
  }
);

export interface NewAssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  members: Person[];
  churchGroups?: ChurchGroup[];
  systemSettings?: SystemSettings;
  onCreateTask: (
    personId: string,
    reason: 'absent_2' | 'absent_3' | 'first_timer' | 'manual',
    notes?: string
  ) => void;
  onNotify: (msg: string) => void;
}

export const NewAssignmentModal = React.memo<NewAssignmentModalProps>(
  ({ isOpen, onClose, members, churchGroups = [], systemSettings, onCreateTask, onNotify }) => {
    const [memberId, setMemberId] = useState('');
    const [reason, setReason] = useState<'absent_2' | 'absent_3' | 'first_timer' | 'manual'>(
      'absent_3'
    );
    const [notes, setNotes] = useState('');

    if (!isOpen) return null;

    const selectedPerson = members.find((m) => m.id === memberId);
    const threshold = Math.max(1, systemSettings?.absenteeThresholdServices || 2);
    const previewAssignee =
      selectedPerson && systemSettings
        ? resolveFollowupAssignee(selectedPerson, churchGroups, systemSettings, reason)
        : null;
    const previewDueOn = systemSettings
      ? formatFollowupDueDateLabel(reason, systemSettings.firstTimerFollowupHours, threshold)
      : 'In 3 days';

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!memberId) {
        onNotify('Please select a member');
        return;
      }
      onCreateTask(memberId, reason, notes);
      setMemberId('');
      setNotes('');
      onClose();
    };

    return (
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
        <form
          onSubmit={handleSubmit}
          className="bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-xl border border-[#E9EBF5] dark:border-[#2D2D55] max-h-[90vh] overflow-y-auto"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
              New Care Assignment
            </h3>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close new assignment modal"
              className="text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label className="block font-semibold mb-1 text-[#1D1B3A] dark:text-[#F2F2FA]">
                Member
              </label>
              <select
                value={memberId}
                onChange={(e) => setMemberId(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] bg-slate-50 dark:bg-black/20 text-[#1D1B3A] dark:text-[#F2F2FA]"
              >
                <option value="">Select member...</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.firstName} {m.lastName} ({m.homeCellGroup || m.groupName})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold mb-1 text-[#1D1B3A] dark:text-[#F2F2FA]">
                Reason
              </label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value as any)}
                className="w-full p-2.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] bg-slate-50 dark:bg-black/20 text-[#1D1B3A] dark:text-[#F2F2FA]"
              >
                <option value="absent_3">Absent {threshold + 1}+ consecutive services (Pastoral Escalation)</option>
                <option value="absent_2">Absent {threshold} consecutive services (Group / Cell Leader)</option>
                <option value="first_timer">
                  First-time visitor welcome (Due within {systemSettings?.firstTimerFollowupHours || 24}h)
                </option>
                <option value="manual">Manual care inquiry</option>
              </select>
            </div>

            {previewAssignee && (
              <div className="p-2.5 rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
                Auto-routed via Settings to{' '}
                <strong className="text-[#1D1B3A] dark:text-[#F2F2FA]">{previewAssignee.assignedToName}</strong>{' '}
                ({previewAssignee.groupName}) · Due: <strong>{previewDueOn}</strong>
              </div>
            )}

            <div>
              <label className="block font-semibold mb-1 text-[#1D1B3A] dark:text-[#F2F2FA]">
                Notes / Context
              </label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Check on family wellbeing after hospitalization"
                className="w-full p-2.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] bg-slate-50 dark:bg-black/20 text-[#1D1B3A] dark:text-[#F2F2FA]"
              />
            </div>
          </div>

          <div className="flex gap-2 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] text-xs font-bold text-[#666A86] dark:text-[#A9ACC8] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 rounded-xl bg-[#6D5CF2] text-white text-xs font-bold cursor-pointer"
            >
              Assign Task
            </button>
          </div>
        </form>
      </div>
    );
  }
);

export interface ExportCsvModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentService: ServiceInstance;
  onConfirmExport: () => void;
}

export const ExportCsvModal = React.memo<ExportCsvModalProps>(
  ({ isOpen, onClose, currentService, onConfirmExport }) => {
    if (!isOpen) return null;

    return (
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
        <div className="bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl max-w-sm w-full p-5 sm:p-6 shadow-xl border border-[#E9EBF5] dark:border-[#2D2D55] text-center max-h-[90vh] overflow-y-auto">
          <div className="w-12 h-12 rounded-2xl bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] mx-auto flex items-center justify-center mb-3">
            <Download className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
            Download Attendance Export
          </h3>
          <p className="text-xs text-[#666A86] dark:text-[#A9ACC8] mb-4 leading-relaxed">
            Generates a full audit register for {currentService.name.split(',')[0]} including
            member names, cell groups, and check-in methods.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] text-xs font-bold text-[#666A86] dark:text-[#A9ACC8] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirmExport}
              className="flex-1 py-2.5 rounded-xl bg-[#6D5CF2] text-white text-xs font-bold cursor-pointer"
            >
              Download CSV
            </button>
          </div>
        </div>
      </div>
    );
  }
);
