import React, { useState, useEffect } from 'react';
import {
  X,
  Send,
  Check,
  Download,
  Settings,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  UserCheck,
  QrCode,
  Clock,
  Edit3,
  Trash2,
  Bell,
} from 'lucide-react';
import {
  ChurchGroup,
  FollowupTask,
  Person,
  ServiceInstance,
  SystemSettings,
} from '../../types/ekklesphere';
import { MemberAvatar } from '../common/MemberAvatar';
import { ContactCallButton } from '../common/ContactCallButton';
import { isPastoralOfficerOrLeader } from '../../constants/portfolios';
import {
  formatFollowupDueDateLabel,
  memberMatchesChurchGroup,
  resolveFollowupAssignee,
} from '../../utils/settingsConnections';
import { computeServiceBinaryStatus } from '../../utils/serviceStatus';
import type { ServiceQrTarget } from './ServiceQrModal';

function getLiveWindowPreset(): { date: string; startsAt: string; endsAt: string } {
  const now = new Date();
  const end = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = now.getFullYear();
  const mm = pad(now.getMonth() + 1);
  const dd = pad(now.getDate());
  return {
    date: `${yyyy}-${mm}-${dd}`,
    startsAt: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    endsAt: `${pad(end.getHours())}:${pad(end.getMinutes())}`,
  };
}

export interface CommunicationStatusSnapshot {
  arkeselConfigured: boolean;
  resendConfigured: boolean;
  defaultSmsSenderId: string;
  defaultFromEmail: string;
  defaultFromName: string;
}

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
  }) => Promise<ServiceInstance | void>;
  onOpenServiceQr?: (service: ServiceQrTarget) => void;
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
    onOpenServiceQr,
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
    const [createdService, setCreatedService] = useState<ServiceQrTarget | null>(null);

    useEffect(() => {
      if (isOpen) {
        setDate(defaultDate);
        setDwellMinutes(String(systemSettings.dwellTimeMinutes || 5));
        setCreatedService(null);
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
        const created = await onSubmitService({
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
        if (created && created.id && onOpenServiceQr) {
          setCreatedService({
            id: created.id,
            name: created.name,
            date: created.date,
            startsAt: created.startsAt,
            endsAt: created.endsAt,
            dwellMinutes: created.dwellMinutes,
            status: created.status,
          });
        } else {
          onClose();
        }
      } catch (err: any) {
        onNotify(err?.message || 'Could not schedule service');
      } finally {
        setIsSaving(false);
      }
    };

    return (
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
        <div className="bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-xl border border-[#E9EBF5] dark:border-[#2D2D55] max-h-[90dvh] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
              {createdService ? 'Service Scheduled' : 'Schedule New Service'}
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

          {createdService ? (
            <div className="space-y-4 text-xs">
              <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/35 border border-emerald-200 dark:border-emerald-800/60 space-y-1.5">
                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-bold">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{createdService.name} is ready for check-ins</span>
                </div>
                <p className="text-[#5B5F7A] dark:text-[#A9ACC8] tabular-nums">
                  {formatDateLabel(createdService.date, true)} · {createdService.startsAt}–
                  {createdService.endsAt} (+{createdService.dwellMinutes ?? 5} min allowance)
                </p>
              </div>
              <p className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] leading-relaxed">
                Open the signed Check-In QR poster right away to project on screen, print for entrance desks, or share the check-in link with members.
              </p>
              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] text-xs font-bold text-[#666A86] dark:text-[#A9ACC8] cursor-pointer"
                >
                  Done
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const target = createdService;
                    onClose();
                    onOpenServiceQr?.(target);
                  }}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-[#6D5CF2] hover:bg-[#5B4BE0] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <QrCode className="w-3.5 h-3.5" />
                  <span>Open Check-In QR</span>
                </button>
              </div>
            </div>
          ) : (
            <>
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
                  <div className="flex items-center justify-between mb-1">
                    <label
                      htmlFor="new-service-date"
                      className="block font-semibold text-[#1D1B3A] dark:text-[#F2F2FA]"
                    >
                      Service Date
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const preset = getLiveWindowPreset();
                        setDate(preset.date);
                        setStartsAt(preset.startsAt);
                        setEndsAt(preset.endsAt);
                      }}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-[#6D5CF2] dark:text-[#9D90FF] hover:underline cursor-pointer"
                    >
                      <Clock className="w-3 h-3" />
                      <span>Set Live Now (+2h)</span>
                    </button>
                  </div>
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
            </>
          )}
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
  onOpenServiceQr?: (service: ServiceQrTarget) => void;
  onDeleteService?: (serviceId: string) => Promise<void> | void;
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
    onOpenServiceQr,
    onDeleteService,
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
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

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
        setConfirmDelete(false);
        setIsDeleting(false);
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
          className="bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-xl border border-[#E9EBF5] dark:border-[#2D2D55] max-h-[90dvh] overflow-y-auto"
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
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor="edit-service-date"
                  className="block font-semibold text-[#1D1B3A] dark:text-[#F2F2FA]"
                >
                  Service Date
                </label>
                <button
                  type="button"
                  onClick={() => {
                    const preset = getLiveWindowPreset();
                    setDate(preset.date);
                    setStartsAt(preset.startsAt);
                    setEndsAt(preset.endsAt);
                    setStatusMode('auto');
                  }}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-[#6D5CF2] dark:text-[#9D90FF] hover:underline cursor-pointer"
                >
                  <Clock className="w-3 h-3" />
                  <span>Set Live Now (+2h)</span>
                </button>
              </div>
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

          <div className="flex flex-wrap gap-2 mt-6">
            {onOpenServiceQr && (
              <button
                type="button"
                onClick={() => {
                  const target: ServiceQrTarget = {
                    id: service.id,
                    name: name.trim() || service.name,
                    date,
                    startsAt,
                    endsAt,
                    dwellMinutes: Math.max(0, Number(dwellMinutes) || 0),
                    status: statusMode === 'closed' ? 'closed' : 'live',
                  };
                  onClose();
                  onOpenServiceQr(target);
                }}
                className="py-2.5 px-3 rounded-xl bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#9D90FF] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>Check-In QR</span>
              </button>
            )}
            {onDeleteService && (
              confirmDelete ? (
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={async () => {
                    setIsDeleting(true);
                    try {
                      await onDeleteService(service.id);
                      onClose();
                    } finally {
                      setIsDeleting(false);
                      setConfirmDelete(false);
                    }
                  }}
                  className="py-2.5 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold inline-flex items-center gap-1 cursor-pointer disabled:opacity-60"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{isDeleting ? 'Deleting...' : 'Confirm Delete'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="py-2.5 px-3 rounded-xl border border-rose-200 dark:border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </button>
              )
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] text-xs font-bold text-[#666A86] dark:text-[#A9ACC8] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || isDeleting}
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
  emailFromAddress?: string;
  emailSenderName?: string;
  enablePushNotifications?: boolean;
  communicationStatus?: CommunicationStatusSnapshot;
  onSendBroadcast?: (params: {
    channel: 'push' | 'sms' | 'email';
    audience: string;
    subject: string;
    body: string;
  }) => Promise<{ success: boolean; sentCount?: number; message: string }>;
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
    emailFromAddress,
    emailSenderName,
    enablePushNotifications = true,
    communicationStatus,
    onSendBroadcast,
    onOpenGatewaySettings,
    onNotify,
  }) => {
    const [channel, setChannel] = useState<'push' | 'sms' | 'email'>('push');
    const [audience, setAudience] = useState('all');
    const [subject, setSubject] = useState('Service Reminder');
    const [body, setBody] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [sendError, setSendError] = useState<string | null>(null);

    useEffect(() => {
      if (isOpen) {
        setSendError(null);
        setIsSending(false);
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
    const officersCount = members.filter((m) => isPastoralOfficerOrLeader(m)).length;

    const getRecipientCount = (): number => {
      if (audience === 'all') return members.length;
      if (audience === 'absent') return absentMembersCount;
      if (audience === 'visitors') return visitorsCount;
      if (audience === 'officers') return officersCount;
      return members.filter((m) => memberMatchesChurchGroup(m, audience)).length;
    };

    const recipientCount = getRecipientCount();

    const effectiveSenderId =
      smsSenderId || communicationStatus?.defaultSmsSenderId || 'EKKLESPHERE';
    const effectiveFromEmail =
      emailFromAddress || communicationStatus?.defaultFromEmail || 'Env default sender';
    const effectiveFromName =
      emailSenderName || churchName || communicationStatus?.defaultFromName || 'Church Office';

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (isSending) return;
      setSendError(null);

      if (channel === 'push' && !enablePushNotifications) {
        const msg =
          'Push broadcasts are paused in System Settings → Gateways. Switch to SMS/Email or re-enable Push.';
        setSendError(msg);
        onNotify(msg);
        return;
      }

      if (!body.trim()) {
        setSendError('Please enter a message body before sending.');
        return;
      }

      if (recipientCount === 0) {
        setSendError('No members match this audience filter.');
        return;
      }

      if (onSendBroadcast) {
        setIsSending(true);
        try {
          const result = await onSendBroadcast({
            channel,
            audience,
            subject: subject.trim() || 'Church Notice',
            body: body.trim(),
          });
          if (!result.success) {
            setSendError(result.message || 'Broadcast delivery failed.');
            return;
          }
          onClose();
        } finally {
          setIsSending(false);
        }
        return;
      }

      const routeHint =
        channel === 'sms'
          ? ` via ${smsGatewayProvider || 'Arkesel SMS'} (${effectiveSenderId})`
          : channel === 'email'
          ? ` via Resend Email (${effectiveFromName})`
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
          className="bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-xl border border-[#E9EBF5] dark:border-[#2D2D55] max-h-[90dvh] overflow-y-auto"
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

          {sendError && (
            <div className="mb-3 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/50 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{sendError}</span>
            </div>
          )}

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
                    onClick={() => {
                      setChannel(ch);
                      setSendError(null);
                    }}
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
              <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
                <span className="inline-flex items-center gap-1.5 min-w-0">
                  {channel === 'sms' ? (
                    <>
                      <span
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-bold text-[10px] ${
                          communicationStatus?.arkeselConfigured
                            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                            : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                        }`}
                      >
                        {communicationStatus?.arkeselConfigured ? (
                          <CheckCircle2 className="w-3 h-3" />
                        ) : (
                          <AlertCircle className="w-3 h-3" />
                        )}
                        {communicationStatus?.arkeselConfigured ? 'Arkesel API Ready' : 'Env Key Needed'}
                      </span>
                      <span className="truncate">
                        {smsGatewayProvider || 'Arkesel SMS'} · Sender: {effectiveSenderId}
                      </span>
                    </>
                  ) : channel === 'email' ? (
                    <>
                      <span
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-bold text-[10px] ${
                          communicationStatus?.resendConfigured
                            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                            : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                        }`}
                      >
                        {communicationStatus?.resendConfigured ? (
                          <CheckCircle2 className="w-3 h-3" />
                        ) : (
                          <AlertCircle className="w-3 h-3" />
                        )}
                        {communicationStatus?.resendConfigured ? 'Resend API Ready' : 'Env Key Needed'}
                      </span>
                      <span className="truncate">
                        {effectiveFromName} ({effectiveFromEmail})
                      </span>
                    </>
                  ) : (
                    <span>
                      {enablePushNotifications
                        ? 'Web & Mobile Push Engine Active'
                        : 'Push Notifications paused in Settings'}
                    </span>
                  )}
                </span>
                {onOpenGatewaySettings && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenGatewaySettings();
                    }}
                    className="text-[#6D5CF2] dark:text-[#8C7DFF] font-semibold hover:underline inline-flex items-center gap-1 cursor-pointer shrink-0"
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
                <option value="officers">
                  Church Officers &amp; Leaders ({officersCount})
                </option>
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
              disabled={isSending}
              className="flex-1 py-2.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] text-xs font-bold text-[#666A86] dark:text-[#A9ACC8] cursor-pointer disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSending}
              className="flex-1 py-2.5 rounded-xl bg-[#6D5CF2] hover:bg-[#5B4BE0] text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isSending ? 'Sending...' : 'Send Broadcast'}</span>
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
  isAutoAssigning?: boolean;
  onAutoAssignAbsentees?: () => Promise<unknown> | void;
  onOpenPastoralSettings?: () => void;
  onResolveTask: (
    id: string,
    outcome: string,
    nextStatus?: 'open' | 'contacted' | 'resolved' | 'dismissed'
  ) => void | Promise<void>;
  onEditTask?: (
    id: string,
    patch: {
      status?: 'open' | 'contacted' | 'resolved' | 'dismissed';
      outcome?: string;
      assignedToName?: string;
      notes?: string;
    }
  ) => Promise<unknown> | void;
  onDeleteTask?: (id: string) => Promise<unknown> | void;
  onSendTaskReminder?: (taskId: string) => Promise<unknown> | void;
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
    isAutoAssigning = false,
    onAutoAssignAbsentees,
    onOpenPastoralSettings,
    onResolveTask,
    onEditTask,
    onDeleteTask,
    onSendTaskReminder,
  }) => {
    const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
    const [editAssignee, setEditAssignee] = useState('');
    const [editStatus, setEditStatus] = useState<'open' | 'contacted' | 'resolved' | 'dismissed'>('open');
    const [editOutcome, setEditOutcome] = useState('');
    const [editNotes, setEditNotes] = useState('');
    const [isSavingEdit, setIsSavingEdit] = useState(false);
    const [remindingTaskId, setRemindingTaskId] = useState<string | null>(null);
    const [confirmDeleteTaskId, setConfirmDeleteTaskId] = useState<string | null>(null);

    useEffect(() => {
      if (!confirmDeleteTaskId) return;
      const timer = setTimeout(() => setConfirmDeleteTaskId(null), 5000);
      return () => clearTimeout(timer);
    }, [confirmDeleteTaskId]);

    useEffect(() => {
      if (!isOpen) {
        setEditingTaskId(null);
        setConfirmDeleteTaskId(null);
      }
    }, [isOpen]);

    if (!isOpen) return null;

    const memberById = new Map(members.map((m) => [m.id, m]));
    const threshold = Math.max(1, absenteeThresholdServices || 2);

    const startEditTask = (t: FollowupTask) => {
      setEditingTaskId(t.id);
      setEditAssignee(t.assignedToName || '');
      setEditStatus(t.status);
      setEditOutcome(t.outcome || '');
      setEditNotes(t.notes || '');
      setConfirmDeleteTaskId(null);
    };

    const handleSaveTaskEdit = async (taskId: string) => {
      if (!onEditTask) return;
      setIsSavingEdit(true);
      try {
        await onEditTask(taskId, {
          assignedToName: editAssignee.trim() || undefined,
          status: editStatus,
          outcome: editOutcome.trim(),
          notes: editNotes.trim(),
        });
        setEditingTaskId(null);
      } finally {
        setIsSavingEdit(false);
      }
    };

    return (
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
        <div className="bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl max-w-2xl w-full p-5 sm:p-6 shadow-xl border border-[#E9EBF5] dark:border-[#2D2D55] max-h-[88dvh] flex flex-col">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                Pastoral Care Follow-up Queue
              </h3>
              <p className="text-xs text-[#666A86] dark:text-[#A9ACC8]">
                Active Rules: {threshold}+ absences alert · Visitors within {firstTimerFollowupHours}h ·{' '}
                {autoAssignCellLeaders
                  ? 'Auto-routing to Officers & Cell Leaders enabled'
                  : 'Assigned directly to Senior Pastor'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {onAutoAssignAbsentees && (
                <button
                  type="button"
                  disabled={isAutoAssigning}
                  onClick={() => onAutoAssignAbsentees()}
                  className="px-2.5 py-1.5 rounded-xl bg-[#EFEDFF] dark:bg-[#2A2A55] border border-[#6D5CF2]/20 text-[11px] font-bold text-[#6D5CF2] dark:text-[#9D90FF] inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  {isAutoAssigning ? (
                    <RefreshCw className="w-3 h-3 animate-spin" />
                  ) : (
                    <UserCheck className="w-3 h-3" />
                  )}
                  <span>{isAutoAssigning ? 'Assigning...' : 'Auto-Assign Absentees'}</span>
                </button>
              )}
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
                const personPhone = t.personPhone || person?.phoneE164 || person?.phoneNumber;
                const personEmail = t.personEmail || person?.email;
                const isActiveTask = t.status === 'open' || t.status === 'contacted';
                const isEditing = editingTaskId === t.id;

                return (
                  <div
                    key={t.id}
                    className="p-4 rounded-2xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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
                                : t.reason === 'first_timer'
                                ? 'First Timer'
                                : 'Pastoral Care'}
                            </span>
                            {t.status === 'contacted' && (
                              <span className="px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-300 text-[10px] font-bold">
                                Contacted
                              </span>
                            )}
                            {t.autoAssigned && (
                              <span className="px-1.5 py-0.5 rounded-md bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#9D90FF] text-[10px] font-bold">
                                Auto-Routed
                              </span>
                            )}
                          </div>
                          <div className="text-[#666A86] dark:text-[#A9ACC8]">
                            {t.groupName} · Assigned to:{' '}
                            <strong className="text-[#1D1B3A] dark:text-[#F2F2FA]">
                              {t.assignedToName}
                            </strong>
                            {t.assignedToRole ? ` (${t.assignedToRole})` : ''}
                          </div>
                          {personPhone && (
                            <div className="text-[11px] font-mono text-[#666A86] dark:text-[#A9ACC8] mt-0.5">
                              {personPhone}
                            </div>
                          )}
                          {t.notes && (
                            <div className="mt-1 text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
                              Notes: {t.notes}
                            </div>
                          )}
                          {((t.reminderCount ?? 0) > 0 || t.acknowledgedAt || t.serviceName) && (
                            <div className="mt-1 text-[11px] text-[#666A86] dark:text-[#A9ACC8] tabular-nums">
                              {t.serviceName ? `${t.serviceName} · ` : ''}
                              Reminders sent: <strong className="text-[#1D1B3A] dark:text-[#F2F2FA]">{t.reminderCount ?? 0}</strong>
                              {t.lastReminderAt
                                ? ` · Last: ${new Date(t.lastReminderAt).toLocaleString('en-GB', {
                                    day: 'numeric',
                                    month: 'short',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}`
                                : ''}
                              {t.acknowledgedAt ? ' · Acknowledged by leader' : ''}
                            </div>
                          )}
                          {t.outcome && (
                            <div className="mt-1 text-emerald-600 dark:text-emerald-400">
                              Outcome: {t.outcome}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        {isActiveTask ? (
                          <>
                            <ContactCallButton
                              contactName={t.personName}
                              contactPhone={personPhone}
                              contactEmail={personEmail}
                              contactGroup={t.groupName}
                              label="Call"
                              onLogOutcome={async (outcome, markResolved) => {
                                await onResolveTask(
                                  t.id,
                                  outcome,
                                  markResolved ? 'resolved' : 'contacted'
                                );
                              }}
                            />
                            {onSendTaskReminder && (
                              <button
                                type="button"
                                disabled={remindingTaskId === t.id}
                                onClick={async () => {
                                  setRemindingTaskId(t.id);
                                  try {
                                    await onSendTaskReminder(t.id);
                                  } finally {
                                    setRemindingTaskId(null);
                                  }
                                }}
                                className="bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#9D90FF] px-2.5 py-1.5 min-h-[34px] rounded-xl font-bold whitespace-nowrap cursor-pointer disabled:opacity-60 inline-flex items-center gap-1"
                              >
                                {remindingTaskId === t.id ? (
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Bell className="w-3 h-3" />
                                )}
                                <span>{remindingTaskId === t.id ? 'Sending...' : 'Remind Leader'}</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onResolveTask(t.id, 'Excused absence', 'resolved')}
                              className="bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#666A86] dark:text-[#A9ACC8] px-2.5 py-1.5 min-h-[34px] rounded-xl font-semibold whitespace-nowrap cursor-pointer hover:border-emerald-400"
                            >
                              {t.status === 'contacted' ? 'Mark Resolved' : 'Mark Excused'}
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onResolveTask(t.id, t.outcome || 'Reopened for follow-up', 'open')}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[34px] rounded-xl bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 font-bold cursor-pointer hover:opacity-90"
                            title="Click to reopen care task"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Resolved</span>
                          </button>
                        )}

                        {onEditTask && (
                          <button
                            type="button"
                            onClick={() => (isEditing ? setEditingTaskId(null) : startEditTask(t))}
                            title="Edit follow-up assignment"
                            aria-label={`Edit task for ${t.personName}`}
                            className={`p-2 min-h-[34px] rounded-xl border transition-colors cursor-pointer ${
                              isEditing
                                ? 'bg-[#6D5CF2] text-white border-[#6D5CF2]'
                                : 'bg-white dark:bg-[#1D1D3D] border-[#E9EBF5] dark:border-[#2D2D55] text-[#666A86] dark:text-[#A9ACC8] hover:text-[#6D5CF2]'
                            }`}
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {onDeleteTask && (
                          confirmDeleteTaskId === t.id ? (
                            <button
                              type="button"
                              onClick={async () => {
                                setConfirmDeleteTaskId(null);
                                await onDeleteTask(t.id);
                              }}
                              className="px-2.5 py-1.5 min-h-[34px] rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold cursor-pointer"
                            >
                              Confirm
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteTaskId(t.id)}
                              title="Delete care assignment"
                              aria-label={`Delete task for ${t.personName}`}
                              className="p-2 min-h-[34px] rounded-xl bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-slate-400 hover:text-rose-600 hover:border-rose-300 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )
                        )}
                      </div>
                    </div>

                    {isEditing && (
                      <div className="pt-3 border-t border-[#E9EBF5] dark:border-[#2D2D55] grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-[11px] font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                            Assigned Officer / Leader
                          </label>
                          <input
                            type="text"
                            value={editAssignee}
                            onChange={(e) => setEditAssignee(e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                            Status
                          </label>
                          <select
                            value={editStatus}
                            onChange={(e) =>
                              setEditStatus(
                                e.target.value as 'open' | 'contacted' | 'resolved' | 'dismissed'
                              )
                            }
                            className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-xs font-semibold"
                          >
                            <option value="open">Open</option>
                            <option value="contacted">Contacted</option>
                            <option value="resolved">Resolved</option>
                            <option value="dismissed">Dismissed</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                            Outcome Summary
                          </label>
                          <input
                            type="text"
                            value={editOutcome}
                            onChange={(e) => setEditOutcome(e.target.value)}
                            placeholder="Call or visit outcome..."
                            className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                            Care Notes
                          </label>
                          <input
                            type="text"
                            value={editNotes}
                            onChange={(e) => setEditNotes(e.target.value)}
                            placeholder="Pastoral care notes..."
                            className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-xs"
                          />
                        </div>
                        <div className="sm:col-span-2 flex justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => setEditingTaskId(null)}
                            className="px-3 py-1.5 rounded-lg border border-[#E9EBF5] dark:border-[#2D2D55] text-[11px] font-semibold text-[#666A86] dark:text-[#A9ACC8] cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={isSavingEdit}
                            onClick={() => handleSaveTaskEdit(t.id)}
                            className="px-3 py-1.5 rounded-lg bg-[#6D5CF2] hover:bg-[#5b4be0] text-white text-[11px] font-bold cursor-pointer disabled:opacity-60"
                          >
                            {isSavingEdit ? 'Saving...' : 'Save Changes'}
                          </button>
                        </div>
                      </div>
                    )}
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
          className="bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-xl border border-[#E9EBF5] dark:border-[#2D2D55] max-h-[90dvh] overflow-y-auto"
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
        <div className="bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl max-w-sm w-full p-5 sm:p-6 shadow-xl border border-[#E9EBF5] dark:border-[#2D2D55] text-center max-h-[90dvh] overflow-y-auto">
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
