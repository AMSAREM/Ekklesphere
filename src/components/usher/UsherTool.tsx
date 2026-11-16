import React, { useState } from 'react';
import { useEkklesphere } from '../../context/EkklesphereContext';
import {
  QrCode,
  Search,
  UserPlus,
  Wifi,
  WifiOff,
  Check,
  AlertTriangle,
  X,
  Users,
  Clock,
  Sparkles,
  RefreshCw,
  Phone,
  UserCheck,
  Settings,
  Camera,
  CameraOff,
} from 'lucide-react';
import { getCanonicalMemberId, findMemberByScannedId } from '../member/DigitalMemberCard';
import { CameraQrScanner } from '../common/CameraQrScanner';
import { MemberAvatar } from '../common/MemberAvatar';
import { ContactCallButton } from '../common/ContactCallButton';
import { getMemberPortfolio } from '../../constants/portfolios';
import { memberMatchesChurchGroup } from '../../utils/settingsConnections';
import { ServiceQrModal } from '../admin/ServiceQrModal';
import { parseServiceQrPayload } from '../../utils/serviceQr';
import { isPlaceholderServiceId } from '../../utils/serviceStatus';

export const UsherTool: React.FC = () => {
  const {
    services,
    activeServiceId,
    setActiveServiceId,
    currentService,
    hasScheduledService,
    checkInEligibility,
    members,
    totalCheckedInCount,
    expectedAttendance,
    visitorsCount,
    serviceVisitorsCount,
    addVisitor,
    checkInPerson,
    checkInWithServiceQr,
    isUsherOnline,
    setIsUsherOnline,
    pendingSyncCount,
    syncUsherCheckins,
    attendanceRecords,
    showToast,
    setIsSettingsModalOpen,
    isSettingsModalOpen,
    systemSettings,
    churchGroups,
    currentUser,
  } = useEkklesphere();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'unchecked' | 'checked'>('all');
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>('all');
  const [isVisitorSheetOpen, setIsVisitorSheetOpen] = useState(false);
  const [visitorName, setVisitorName] = useState('');
  const [visitorPhone, setVisitorPhone] = useState('');
  const [visitorHowHeard, setVisitorHowHeard] = useState('Invited by a member');
  const [visitorPreferredGroup, setVisitorPreferredGroup] = useState('');

  // Green full-screen confirmation overlay state
  const [confirmationMember, setConfirmationMember] = useState<{
    name: string;
    group: string;
    initials: string;
    imageUrl?: string;
    isOfflineSaved: boolean;
  } | null>(null);

  const [scannedIdInput, setScannedIdInput] = useState('');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isServiceQrModalOpen, setIsServiceQrModalOpen] = useState(false);

  const isMemberCheckedInForService = (personId: string) =>
    Boolean(currentService.id) &&
    attendanceRecords.some(
      (r) =>
        r.personId === personId &&
        (r.serviceInstanceId === currentService.id || (!r.serviceInstanceId && services.length === 1))
    );

  const activeSettingsGroups = churchGroups.filter((g) => g.active !== false);

  // Filter members based on search, group/ministry filter, and status tabs
  const filteredMembers = members.filter((m) => {
    const isChecked = isMemberCheckedInForService(m.id);

    if (filterMode === 'unchecked' && isChecked) return false;
    if (filterMode === 'checked' && !isChecked) return false;
    if (selectedGroupFilter !== 'all' && !memberMatchesChurchGroup(m, selectedGroupFilter)) {
      return false;
    }

    const q = searchQuery.toLowerCase().replace(/\s/g, '');
    if (!q) return true;
    const nameMatch = `${m.firstName || ''}${m.lastName || ''}`.toLowerCase().includes(q);
    const phoneMatch = (m.phoneE164 || m.phoneNumber || '').replace(/\D/g, '').includes(q);
    const groupMatch = `${m.groupName || ''} ${m.homeCellGroup || ''} ${m.department || ''}`.toLowerCase().includes(q);
    const memberIdMatch = getCanonicalMemberId(m).toLowerCase().replace(/\s/g, '').includes(q);
    return nameMatch || phoneMatch || groupMatch || memberIdMatch;
  });

  const uncheckedMembers = members.filter((m) => !isMemberCheckedInForService(m.id));

  const handleScanClick = () => {
    if (!hasScheduledService) {
      showToast(checkInEligibility.message);
      return;
    }
    if (members.length === 0) {
      showToast('No registered members in the roster yet. Add a member or visitor first.');
      return;
    }
    const unchecked = uncheckedMembers[0];
    if (!unchecked) {
      showToast('All registered members in the roster are already checked in!');
      return;
    }
    triggerCheckIn(unchecked.id);
  };

  const triggerCheckIn = (
    personId: string,
    method: 'usher' | 'posted_qr' = 'usher'
  ): boolean => {
    if (!hasScheduledService) {
      showToast(checkInEligibility.message);
      return false;
    }
    const person = members.find((m) => m.id === personId);
    if (!person) return false;

    const noteText =
      method === 'posted_qr' ? 'Member QR pass scanned at door' : 'Usher scanner audit';
    const started = checkInPerson(personId, method, 98, noteText);
    if (!started) return false;

    setConfirmationMember({
      name: `${person.firstName || ''} ${person.lastName || ''}`.trim() || 'Registered Member',
      group: person.groupName || person.homeCellGroup || 'General Congregation',
      initials: person.avatarInitials || 'MB',
      imageUrl: person.imageUrl,
      isOfflineSaved: !isUsherOnline,
    });

    setTimeout(() => {
      setConfirmationMember(null);
    }, 1800);
    return true;
  };

  const handleVisitorSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!visitorName.trim()) {
      showToast('Please enter visitor name');
      return;
    }
    addVisitor(visitorName, visitorPhone, visitorHowHeard, visitorPreferredGroup || undefined);
    setIsVisitorSheetOpen(false);
    setVisitorName('');
    setVisitorPhone('');
    setVisitorPreferredGroup('');
  };

  const formatPhone = (phone?: string | null) => {
    if (!phone || typeof phone !== 'string' || !phone.trim()) {
      return 'No phone';
    }
    const clean = phone.trim().replace('+233', '0');
    return clean.replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3');
  };

  const attendancePercentage = Math.min(Math.round((totalCheckedInCount / (expectedAttendance || 1)) * 100), 100);

  return (
    <main className="relative max-w-[1360px] w-[calc(100%-12px)] sm:w-[calc(100%-24px)] lg:w-[calc(100%-32px)] mx-auto my-1.5 sm:my-3 lg:my-4 bg-[#F6F7FC] dark:bg-[#14142E] rounded-2xl sm:rounded-3xl lg:rounded-[36px] pt-4 sm:pt-6 pb-24 sm:pb-28 lg:pb-8 px-3 sm:px-6 lg:pl-[88px] lg:pr-8 shadow-lg lg:shadow-[0_20px_60px_rgba(60,50,140,0.12)] border border-[#E9EBF5] dark:border-[#2D2D55] min-h-[calc(100dvh-76px)] min-w-0 overflow-x-clip transition-all duration-200">
      {/* Signature Purple Navigation Bar - Responsive Floating Dock on Mobile & Left Tab on Desktop */}
      <aside
        aria-label="Usher Station Navigation"
        className="fixed z-50 bottom-2 sm:bottom-4 left-1/2 -translate-x-1/2 lg:translate-x-0 lg:bottom-auto lg:top-20 lg:left-0 w-[calc(100%-16px)] max-w-md lg:w-[64px] bg-[#6D5CF2]/95 dark:bg-[#5E4EE0]/95 backdrop-blur-xl rounded-2xl sm:rounded-full lg:rounded-r-[28px] lg:rounded-l-none grid grid-cols-5 lg:flex lg:flex-col items-center justify-items-center sm:justify-center lg:justify-start gap-1 sm:gap-2 lg:gap-2.5 px-1.5 py-1.5 sm:px-4 sm:py-2 lg:py-5 lg:px-0 pb-[max(0.375rem,env(safe-area-inset-bottom))] lg:pb-5 shadow-[0_12px_36px_rgba(40,30,120,0.35)] lg:shadow-[0_12px_32px_rgba(40,30,120,0.25)] border border-white/20 lg:border-none transition-all duration-200 select-none touch-manipulation"
      >
        {/* 1. Roster */}
        <div className="relative group w-full min-w-0 flex justify-center">
          <button
            onClick={() => {
              setFilterMode('all');
              setSearchQuery('');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            aria-label="Door Roster"
            aria-current={filterMode === 'all' && !isVisitorSheetOpen ? 'page' : undefined}
            className={`w-full max-w-[56px] min-w-0 min-h-[46px] lg:min-w-0 lg:w-11 lg:h-11 px-1 py-1 lg:px-0 rounded-xl sm:rounded-full lg:rounded-[14px] flex flex-col lg:flex-row items-center justify-center gap-0.5 transition-all duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2 active:scale-95 ${
              filterMode === 'all' && !isVisitorSheetOpen
                ? 'bg-white text-[#6D5CF2] shadow-[0_4px_12px_rgba(40,30,120,0.25)] font-bold'
                : 'text-white/80 hover:text-white hover:bg-white/15'
            }`}
          >
            <Users className="w-4.5 h-4.5 sm:w-5 sm:h-5 shrink-0" />
            <span className="lg:hidden text-[10px] leading-tight font-semibold tracking-tight truncate max-w-full">Roster</span>
          </button>
          <span className="hidden lg:group-hover:flex items-center gap-1.5 absolute left-[70px] top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-white dark:bg-[#1D1D3D] text-[#1D1B3A] dark:text-[#F2F2FA] border border-slate-200 dark:border-white/10 text-xs font-bold rounded-xl shadow-xl pointer-events-none whitespace-nowrap z-50 animate-in fade-in slide-in-from-left-2 duration-150">
            <span>Roster</span>
          </span>
        </div>

        {/* 2. Camera Scanner */}
        <div className="relative group w-full min-w-0 flex justify-center">
          <button
            onClick={() => {
              if (!hasScheduledService && !isCameraActive) {
                showToast(checkInEligibility.message);
                return;
              }
              setIsCameraActive((prev) => !prev);
              document.getElementById('usher-scanner-card')?.scrollIntoView({ behavior: 'smooth' });
            }}
            aria-label="Camera Scanner"
            aria-current={isCameraActive ? 'page' : undefined}
            className={`w-full max-w-[56px] min-h-[46px] lg:min-w-0 lg:w-11 lg:h-11 px-1 py-1 lg:px-0 rounded-xl sm:rounded-full lg:rounded-[14px] flex flex-col lg:flex-row items-center justify-center gap-0.5 transition-all duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2 active:scale-95 ${
              isCameraActive
                ? 'bg-white text-[#6D5CF2] shadow-[0_4px_12px_rgba(40,30,120,0.25)] font-bold'
                : 'text-white/80 hover:text-white hover:bg-white/15'
            }`}
          >
            <Camera className="w-4.5 h-4.5 sm:w-5 sm:h-5 shrink-0" />
            <span className="lg:hidden text-[10px] leading-tight font-semibold tracking-tight">Camera</span>
          </button>
          <span className="hidden lg:group-hover:flex items-center gap-1.5 absolute left-[70px] top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-white dark:bg-[#1D1D3D] text-[#1D1B3A] dark:text-[#F2F2FA] border border-slate-200 dark:border-white/10 text-xs font-bold rounded-xl shadow-xl pointer-events-none whitespace-nowrap z-50 animate-in fade-in slide-in-from-left-2 duration-150">
            <span>{isCameraActive ? 'Stop Camera' : 'Camera Scanner'}</span>
          </span>
        </div>

        {/* 3. Register Visitor */}
        <div className="relative group w-full min-w-0 flex justify-center">
          <button
            onClick={() => setIsVisitorSheetOpen(true)}
            aria-label="Register Visitor"
            aria-current={isVisitorSheetOpen ? 'page' : undefined}
            className={`w-full max-w-[56px] min-h-[46px] lg:min-w-0 lg:w-11 lg:h-11 px-1 py-1 lg:px-0 rounded-xl sm:rounded-full lg:rounded-[14px] flex flex-col lg:flex-row items-center justify-center gap-0.5 transition-all duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2 active:scale-95 ${
              isVisitorSheetOpen
                ? 'bg-white text-[#6D5CF2] shadow-[0_4px_12px_rgba(40,30,120,0.25)] font-bold'
                : 'text-white/80 hover:text-white hover:bg-white/15'
            }`}
          >
            <UserPlus className="w-4.5 h-4.5 sm:w-5 sm:h-5 shrink-0" />
            <span className="lg:hidden text-[10px] leading-tight font-semibold tracking-tight">Visitor</span>
          </button>
          <span className="hidden lg:group-hover:flex items-center gap-1.5 absolute left-[70px] top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-white dark:bg-[#1D1D3D] text-[#1D1B3A] dark:text-[#F2F2FA] border border-slate-200 dark:border-white/10 text-xs font-bold rounded-xl shadow-xl pointer-events-none whitespace-nowrap z-50 animate-in fade-in slide-in-from-left-2 duration-150">
            <span>Register Visitor</span>
          </span>
        </div>

        {/* 4. Sync Queue */}
        <div className="relative group w-full min-w-0 flex justify-center">
          <button
            onClick={() => {
              const count = syncUsherCheckins();
              showToast(count > 0 ? `Synced ${count} check-ins to cloud` : 'Offline queue already in sync');
            }}
            aria-label="Sync Offline Queue"
            className="relative w-full max-w-[56px] min-h-[46px] lg:min-w-0 lg:w-11 lg:h-11 px-1 py-1 lg:px-0 rounded-xl sm:rounded-full lg:rounded-[14px] flex flex-col lg:flex-row items-center justify-center gap-0.5 text-white/80 hover:text-white hover:bg-white/15 transition-all duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2 active:scale-95"
          >
            <RefreshCw className="w-4.5 h-4.5 sm:w-5 sm:h-5 shrink-0" />
            {pendingSyncCount > 0 && (
              <span className="absolute top-0.5 right-1 sm:-top-1 sm:-right-1 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center border-2 border-[#6D5CF2] shadow-xs">
                {pendingSyncCount}
              </span>
            )}
            <span className="lg:hidden text-[10px] leading-tight font-semibold tracking-tight">Sync</span>
          </button>
          <span className="hidden lg:group-hover:flex items-center gap-1.5 absolute left-[70px] top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-white dark:bg-[#1D1D3D] text-[#1D1B3A] dark:text-[#F2F2FA] border border-slate-200 dark:border-white/10 text-xs font-bold rounded-xl shadow-xl pointer-events-none whitespace-nowrap z-50 animate-in fade-in slide-in-from-left-2 duration-150">
            <span>Sync Queue</span>
            {pendingSyncCount > 0 && (
              <span className="px-1.5 py-0.2 bg-red-500 text-white text-[10px] rounded-full font-black">
                {pendingSyncCount} Pending
              </span>
            )}
          </span>
        </div>

        {/* 5. System Settings */}
        <div className="relative group w-full min-w-0 flex justify-center">
          <button
            onClick={() => setIsSettingsModalOpen(true)}
            aria-label="Station Settings"
            aria-current={isSettingsModalOpen ? 'page' : undefined}
            className={`w-full max-w-[56px] min-h-[46px] lg:min-w-0 lg:w-11 lg:h-11 px-1 py-1 lg:px-0 rounded-xl sm:rounded-full lg:rounded-[14px] flex flex-col lg:flex-row items-center justify-center gap-0.5 transition-all duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2 active:scale-95 ${
              isSettingsModalOpen
                ? 'bg-white text-[#6D5CF2] shadow-[0_4px_12px_rgba(40,30,120,0.25)] font-bold'
                : 'text-white/80 hover:text-white hover:bg-white/15'
            }`}
          >
            <Settings className="w-4.5 h-4.5 sm:w-5 sm:h-5 shrink-0" />
            <span className="lg:hidden text-[10px] leading-tight font-semibold tracking-tight">Settings</span>
          </button>
          <span className="hidden lg:group-hover:flex items-center gap-1.5 absolute left-[70px] top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-white dark:bg-[#1D1D3D] text-[#1D1B3A] dark:text-[#F2F2FA] border border-slate-200 dark:border-white/10 text-xs font-bold rounded-xl shadow-xl pointer-events-none whitespace-nowrap z-50 animate-in fade-in slide-in-from-left-2 duration-150">
            <span>Station Settings</span>
          </span>
        </div>
      </aside>

      {/* Main Station Content */}
      <div className="flex-1 min-w-0 w-full">

      {/* Top Station Header & Status Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5 pb-4 border-b border-[#E3E5F2] dark:border-[#2D2D55]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold shadow-sm">
            <QrCode className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            {(() => {
              const tenantName = (
                systemSettings.churchName ||
                currentUser?.organizationName ||
                ''
              ).trim();
              const campusLabel = (systemSettings.campusName || '').trim();
              const showCampus =
                Boolean(campusLabel) &&
                campusLabel.toLowerCase() !== tenantName.toLowerCase();
              return tenantName ? (
                <p
                  title={tenantName}
                  className="text-xs sm:text-sm font-bold tracking-tight text-[#5E4AE3] dark:text-[#9D92FF] truncate mb-0.5"
                >
                  {tenantName}
                  {showCampus && (
                    <span className="font-medium text-[#5B5F7A] dark:text-[#A9ACC8]">
                      {' '}
                      · {campusLabel}
                    </span>
                  )}
                </p>
              ) : null;
            })()}
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                Door Steward & Check-in Station
              </h1>
              <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-[11px] font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                Live Entrance Station
              </span>
            </div>
          </div>
        </div>

        {/* Controls: Service Selector & Network Toggle */}
        <div className="flex items-center gap-2.5 self-stretch sm:self-auto">
          {/* Service Selector */}
          {services.length > 0 ? (
            <select
              id="svc-select"
              value={activeServiceId}
              onChange={(e) => setActiveServiceId(e.target.value)}
              className="flex-1 sm:flex-none bg-white dark:bg-[#1C1C3C] border border-[#E3E5F2] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] rounded-2xl px-3.5 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-[#6C5CE7]"
            >
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}{s.date ? ` (${s.date} · ${s.startsAt})` : ` (${s.startsAt})`}
                </option>
              ))}
            </select>
          ) : (
            <div className="flex-1 sm:flex-none bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-200 rounded-2xl px-3.5 py-2 text-xs font-bold">
              No Service Scheduled
            </div>
          )}

          {/* Service Check-in QR Code Button */}
          {services.length > 0 && currentService?.id && !isPlaceholderServiceId(currentService.id) && (
            <button
              type="button"
              onClick={() => setIsServiceQrModalOpen(true)}
              className="px-3 py-2 rounded-2xl bg-[#EEEBFF] dark:bg-[#2A2A55] text-[#6C5CE7] dark:text-[#9D90FF] border border-[#6C5CE7]/25 text-xs font-bold flex items-center gap-1.5 hover:opacity-90 transition-opacity cursor-pointer whitespace-nowrap shrink-0"
              title={`Show Check-In QR Poster for ${currentService.name}`}
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>Service QR</span>
            </button>
          )}

          {/* Network Toggle Button */}
          <button
            onClick={() => {
              const next = !isUsherOnline;
              setIsUsherOnline(next);
              showToast(next ? 'Connection restored (Online Mode)' : 'Switched to Offline Mode');
            }}
            className={`px-3 py-2 rounded-2xl text-xs font-bold border transition-all flex items-center gap-1.5 shadow-sm ${
              isUsherOnline
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                : 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300'
            }`}
            title="Toggle between online and offline simulation"
          >
            {isUsherOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            <span>{isUsherOnline ? 'Online' : 'Offline'}</span>
          </button>
        </div>
      </div>

      {/* Responsive Metrics Bar (Grid adapts from 2 to 4 cols) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-5">
        <div className="bg-[#6C5CE7] dark:bg-[#7D6DF8] text-white rounded-3xl p-4 sm:p-5 shadow-md flex flex-col justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-white/80">Checked In</span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-3xl sm:text-4xl font-extrabold tracking-tight tabular-nums">
              {totalCheckedInCount}
            </span>
            <span className="text-xs text-white/80 font-bold">{attendancePercentage}%</span>
          </div>
          <div className="w-full bg-white/20 h-1.5 rounded-full mt-2 overflow-hidden">
            <div className="bg-white h-full rounded-full transition-all duration-300" style={{ width: `${attendancePercentage}%` }} />
          </div>
        </div>

        <button
          type="button"
          onClick={() => setFilterMode('unchecked')}
          className="bg-white dark:bg-[#1C1C3C] border border-[#E3E5F2] dark:border-[#2D2D55] hover:border-rose-400/50 rounded-3xl p-4 sm:p-5 shadow-sm flex flex-col justify-between text-left transition-colors cursor-pointer"
        >
          <span className="text-[11px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
            Absentee Count
          </span>
          <span className="text-3xl sm:text-4xl font-extrabold text-[#1D1B3A] dark:text-[#F2F2FA] tracking-tight tabular-nums mt-1">
            {members.length > 0 ? uncheckedMembers.length : Math.max(0, expectedAttendance - totalCheckedInCount)}
          </span>
          <span className="text-[11px] text-[#5B5F7A] dark:text-[#A9ACC8] mt-2 tabular-nums">
            Expected seating: <b className="text-[#1D1B3A] dark:text-[#F2F2FA]">{expectedAttendance}</b>
          </span>
        </button>

        <div className="bg-white dark:bg-[#1C1C3C] border border-[#E3E5F2] dark:border-[#2D2D55] rounded-3xl p-4 sm:p-5 shadow-sm flex flex-col justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            Visitors Count
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-3xl sm:text-4xl font-extrabold text-emerald-600 dark:text-emerald-400 tracking-tight tabular-nums">
              {visitorsCount}
            </span>
            <span className="text-[11px] font-semibold text-[#5B5F7A] dark:text-[#A9ACC8] tabular-nums">
              ({serviceVisitorsCount} today)
            </span>
          </div>
          <button
            onClick={() => setIsVisitorSheetOpen(true)}
            className="text-[11px] font-bold text-[#6C5CE7] dark:text-[#8C7DFF] hover:underline mt-2 text-left cursor-pointer"
          >
            + Register visitor
          </button>
        </div>

        <div className="bg-white dark:bg-[#1C1C3C] border border-[#E3E5F2] dark:border-[#2D2D55] rounded-3xl p-4 sm:p-5 shadow-sm flex flex-col justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#5B5F7A] dark:text-[#A9ACC8]">
            Sync Queue
          </span>
          <div className="flex items-center gap-2 mt-1">
            <span
              className={`text-2xl sm:text-3xl font-extrabold tracking-tight tabular-nums ${
                pendingSyncCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-[#1D1B3A] dark:text-[#F2F2FA]'
              }`}
            >
              {pendingSyncCount}
            </span>
            <span className="text-xs text-[#5B5F7A] dark:text-[#A9ACC8]">pending</span>
          </div>
          <div className="mt-2">
            {isUsherOnline && pendingSyncCount > 0 ? (
              <button
                onClick={syncUsherCheckins}
                className="text-[11px] font-bold text-[#6C5CE7] hover:underline flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Sync records now</span>
              </button>
            ) : (
              <span className="text-[11px] text-[#5B5F7A] dark:text-[#A9ACC8]">
                {isUsherOnline ? 'All synced to Cloud' : 'Queued on device'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Offline Pending Sync Alert Banner */}
      {(!isUsherOnline || pendingSyncCount > 0) && (
        <div className="bg-[#FFEFD0] dark:bg-[#3D2E10] text-[#8A5700] dark:text-[#F5B84A] rounded-2xl p-3.5 mb-5 flex items-center justify-between gap-3 text-xs font-semibold shadow-sm">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              {!isUsherOnline
                ? `Station running offline. ${pendingSyncCount} check-in${pendingSyncCount === 1 ? '' : 's'} cached securely in local storage.`
                : `${pendingSyncCount} offline check-in${pendingSyncCount === 1 ? '' : 's'} ready to synchronize with church database.`}
            </span>
          </div>
          {isUsherOnline && pendingSyncCount > 0 && (
            <button
              onClick={syncUsherCheckins}
              className="bg-[#8A5700] hover:bg-[#6e4600] text-white px-3.5 py-1.5 rounded-xl font-bold transition-all shadow-sm shrink-0"
            >
              Sync now
            </button>
          )}
        </div>
      )}

      {/* Unscheduled / Closed Service Check-in Block Alert */}
      {!hasScheduledService && (
        <div
          role="alert"
          className="bg-amber-50 dark:bg-amber-950/35 border border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200 rounded-2xl p-3.5 mb-5 flex items-center gap-2.5 text-xs font-semibold shadow-sm"
        >
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>{checkInEligibility.message}</span>
        </div>
      )}

      {/* Main 2-Column Workstation Layout on Desktop/Tablets */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column (5 cols on lg): Scanner, Quick Check-in & Visitor Registration */}
        <div className="lg:col-span-5 space-y-4">
          {/* Main High-Contrast Scanner Viewfinder */}
          <div
            id="usher-scanner-card"
            className="bg-white dark:bg-[#151528] text-slate-800 dark:text-white rounded-3xl p-4 sm:p-5 border border-[#E9EBF5] dark:border-indigo-900/30 shadow-[0_10px_30px_rgba(60,50,140,0.07)] dark:shadow-lg relative overflow-hidden flex flex-col justify-between"
          >
            {/* Viewfinder: Live Camera or Standby Card */}
            {isCameraActive && hasScheduledService ? (
              <div className="relative aspect-4/3 w-full rounded-2xl overflow-hidden shadow-inner mb-3">
                <CameraQrScanner
                  onScan={(code) => {
                    const matched = findMemberByScannedId(members, code);
                    if (matched) {
                      if (triggerCheckIn(matched.id, 'posted_qr')) {
                        showToast(`Checked in ${matched.firstName} ${matched.lastName} via QR!`);
                      }
                      return;
                    }
                    const svcQr = parseServiceQrPayload(code, services);
                    if (svcQr) {
                      void checkInWithServiceQr(svcQr);
                      return;
                    }
                    showToast(`Scanned Code: "${code}" (No matching member pass or service QR found)`);
                  }}
                  isActive={isCameraActive && hasScheduledService}
                  className="w-full h-full"
                  reticleSize="sm"
                  instructionsText="Point at member pass"
                />
              </div>
            ) : (
              <div className="relative border-2 border-dashed border-indigo-200 dark:border-[#6C5CE7]/60 rounded-2xl p-5 sm:p-6 flex flex-col items-center justify-center gap-3 bg-indigo-50/50 dark:bg-black/20 text-center mb-3">
                <div className="w-14 h-14 rounded-2xl bg-[#6C5CE7]/15 dark:bg-[#6C5CE7]/20 flex items-center justify-center text-[#6D5CF2] dark:text-[#8C7DFF]">
                  <QrCode className="w-8 h-8 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">Digital Member Pass Scanner</h3>
                  <p className="text-xs text-slate-500 dark:text-white/70 max-w-xs mt-0.5">
                    Activate camera scanner to scan QR passes & barcodes automatically
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!hasScheduledService}
                  onClick={() => setIsCameraActive(true)}
                  className="mt-1 px-4 py-2 rounded-xl bg-[#6D5CF2] hover:bg-[#5b4be0] disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer active:scale-95"
                >
                  <Camera className="w-4 h-4" />
                  <span>{hasScheduledService ? 'Activate Camera Scanner' : 'Schedule Service to Scan'}</span>
                </button>
              </div>
            )}

            {/* Direct Member ID / QR Wedge Scanner Input */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!hasScheduledService) {
                  showToast(checkInEligibility.message);
                  return;
                }
                if (!scannedIdInput.trim()) return;
                const matched = findMemberByScannedId(members, scannedIdInput);
                if (matched) {
                  triggerCheckIn(matched.id, 'posted_qr');
                  setScannedIdInput('');
                } else {
                  const svcQr = parseServiceQrPayload(scannedIdInput, services);
                  if (svcQr) {
                    void checkInWithServiceQr(svcQr);
                    setScannedIdInput('');
                  } else {
                    showToast(`No member or service found matching "${scannedIdInput.trim()}"`);
                  }
                }
              }}
              className="pt-1 flex items-center gap-2"
            >
              <input
                type="text"
                value={scannedIdInput}
                onChange={(e) => setScannedIdInput(e.target.value)}
                placeholder="Scan or enter Member ID (e.g. MEM-...)"
                aria-label="Scan or enter Member ID"
                className="flex-1 min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-white/10 border border-slate-200 dark:border-white/15 text-xs text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-white/50 font-mono outline-none focus:border-[#6D5CF2] dark:focus:border-[#8C7DFF] focus:bg-white"
              />
              <button
                type="submit"
                disabled={!hasScheduledService}
                title={hasScheduledService ? 'Verify and check in member' : checkInEligibility.message}
                className="min-h-[44px] px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0 shadow-xs"
              >
                Verify ID
              </button>
            </form>

            {/* Scan Action Buttons */}
            <div className="pt-3 flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                disabled={!hasScheduledService && !isCameraActive}
                onClick={() => setIsCameraActive((prev) => !prev)}
                className={`flex-1 min-h-[44px] py-3 px-4 rounded-2xl text-white text-xs sm:text-sm font-bold shadow-md flex items-center justify-center gap-2 transition-all active:scale-[0.98] whitespace-nowrap cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                  isCameraActive
                    ? 'bg-rose-600 hover:bg-rose-500'
                    : 'bg-[#6C5CE7] hover:bg-[#5b4be0]'
                }`}
              >
                {isCameraActive ? (
                  <>
                    <CameraOff className="w-4 h-4 shrink-0" />
                    <span>Stop Camera</span>
                  </>
                ) : (
                  <>
                    <Camera className="w-4 h-4 shrink-0" />
                    <span>Activate Camera Scanner</span>
                  </>
                )}
              </button>
              <button
                type="button"
                disabled={!hasScheduledService}
                onClick={handleScanClick}
                className="min-h-[44px] py-3 px-4 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/20 text-slate-700 dark:text-white border border-slate-200 dark:border-transparent text-xs font-bold flex items-center justify-center gap-2 transition-all whitespace-nowrap cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                title={hasScheduledService ? 'Quick check in next member' : checkInEligibility.message}
              >
                <UserCheck className="w-4 h-4 shrink-0" />
                <span>Next</span>
              </button>
              <button
                type="button"
                onClick={() => setIsVisitorSheetOpen(true)}
                className="min-h-[44px] py-3 px-4 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/20 text-slate-700 dark:text-white border border-slate-200 dark:border-transparent text-xs font-bold flex items-center justify-center gap-2 transition-all whitespace-nowrap cursor-pointer"
              >
                <UserPlus className="w-4 h-4 shrink-0" />
                <span>+ Visitor</span>
              </button>
            </div>
          </div>

          {/* Quick Registration & Help Card */}
          <div className="bg-white dark:bg-[#1C1C3C] border border-[#E3E5F2] dark:border-[#2D2D55] rounded-3xl p-5 shadow-sm space-y-3">
            <h3 className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] uppercase tracking-wide flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-[#6C5CE7]" />
              <span>Door Steward Protocol</span>
            </h3>
            <ul className="text-xs text-[#5B5F7A] dark:text-[#A9ACC8] space-y-2">
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#6C5CE7] mt-1.5 shrink-0" />
                <span>Members with automatic proximity check-in are logged automatically upon entering.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#6C5CE7] mt-1.5 shrink-0" />
                <span>First-time guests should be registered to trigger automated pastoral welcome SMS.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#6C5CE7] mt-1.5 shrink-0" />
                <span>Network dropouts do not stop check-ins; local queue syncs immediately upon reconnect.</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Right Column (7 cols on lg): Live Roster, Search & Quick Check-in */}
        <div className="lg:col-span-7 space-y-4">
          {/* Search & Filter Header */}
          <div className="bg-white dark:bg-[#1C1C3C] border border-[#E3E5F2] dark:border-[#2D2D55] rounded-3xl p-4 shadow-sm space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                placeholder="Search name, Member ID, phone (+233), or cell group..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && searchQuery.trim()) {
                    const exact = findMemberByScannedId(members, searchQuery);
                    if (exact) {
                      e.preventDefault();
                      triggerCheckIn(exact.id);
                      setSearchQuery('');
                    }
                  }
                }}
                className="w-full bg-slate-50 dark:bg-black/20 border border-[#E3E5F2] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] rounded-2xl pl-10 pr-4 py-2.5 text-xs sm:text-sm outline-none focus:ring-2 focus:ring-[#6C5CE7]"
              />
            </div>

            {/* Filter Tabs & Ministry/Cell Group Filter */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold">
              <div className="flex items-center gap-1.5 overflow-x-auto">
                {[
                  { id: 'all', label: `All Members (${members.length})` },
                  { id: 'unchecked', label: `Unchecked (${uncheckedMembers.length})` },
                  { id: 'checked', label: `Checked In (${members.length - uncheckedMembers.length})` },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setFilterMode(tab.id as any)}
                    className={`px-3 py-1.5 rounded-xl transition-all shrink-0 cursor-pointer ${
                      filterMode === tab.id
                        ? 'bg-[#6C5CE7] text-white shadow-sm'
                        : 'text-[#5B5F7A] dark:text-[#A9ACC8] hover:bg-slate-100 dark:hover:bg-white/5'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {activeSettingsGroups.length > 0 && (
                <select
                  aria-label="Filter roster by ministry or cell group"
                  value={selectedGroupFilter}
                  onChange={(e) => setSelectedGroupFilter(e.target.value)}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-black/20 border border-[#E3E5F2] dark:border-[#2D2D55] text-[11px] font-semibold text-[#1D1B3A] dark:text-[#F2F2FA] outline-none"
                >
                  <option value="all">All Ministries &amp; Cells</option>
                  {activeSettingsGroups.map((g) => (
                    <option key={g.id} value={g.name}>
                      {g.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Members List */}
          <ul className="space-y-2.5 max-h-[620px] overflow-y-auto pr-1" role="list">
            {filteredMembers.length > 0 ? (
              filteredMembers.map((m) => {
                const record = currentService.id
                  ? attendanceRecords.find(
                      (r) =>
                        r.personId === m.id &&
                        (r.serviceInstanceId === currentService.id ||
                          (!r.serviceInstanceId && services.length === 1))
                    )
                  : undefined;
                const isChecked = !!record;
                const isWaitingSync = record?.waitingToSync;

                return (
                  <li
                    key={m.id}
                    className="bg-white dark:bg-[#1C1C3C] border border-[#E3E5F2] dark:border-[#2D2D55] rounded-3xl p-3 sm:p-3.5 flex items-center justify-between gap-3 shadow-sm hover:border-[#6C5CE7]/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <MemberAvatar
                        src={m.imageUrl}
                        name={`${m.firstName} ${m.lastName}`}
                        initials={m.avatarInitials || 'MB'}
                        sizeClass="w-11 h-11 rounded-2xl"
                        textClass="text-sm font-bold"
                        bgClass="bg-[#EEEBFF] dark:bg-[#2A2A55] text-[#6C5CE7] dark:text-[#8C7DFF]"
                        borderClass="border border-[#E3E5F2] dark:border-[#2D2D55]"
                      />
                      <div className="min-w-0">
                        <b className="block text-xs sm:text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA] truncate">
                          {m.firstName} {m.lastName}
                        </b>
                        <div className="flex items-center gap-2 text-[11px] text-[#5B5F7A] dark:text-[#A9ACC8] truncate mt-0.5">
                          <span className="font-mono tabular-nums">{getCanonicalMemberId(m)}</span>
                          <span>·</span>
                          <span className="font-mono">{formatPhone(m.phoneE164 || m.phoneNumber)}</span>
                          <span>·</span>
                          <span className="truncate">
                            {m.groupName || m.homeCellGroup || 'General Congregation'}
                            {m.department &&
                            m.department !== 'General Congregation' &&
                            m.department !== (m.groupName || m.homeCellGroup)
                              ? ` · ${m.department}`
                              : ''}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      {(m.phoneE164 || m.phoneNumber || m.email) && (
                        <ContactCallButton
                          compact
                          contactName={`${m.firstName} ${m.lastName}`.trim()}
                          contactPhone={m.phoneE164 || m.phoneNumber}
                          contactEmail={m.email}
                          contactRole={getMemberPortfolio(m)}
                          contactGroup={m.groupName || m.homeCellGroup}
                        />
                      )}
                      {isChecked ? (
                        <span
                          className={`text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1.5 ${
                            isWaitingSync
                              ? 'bg-[#FFEFD0] text-[#8A5700] dark:bg-[#3D2E10] dark:text-[#F5B84A]'
                              : 'bg-[#DDF5EC] text-[#1E7A5F] dark:bg-[#16382F] dark:text-[#5FD3AB]'
                          }`}
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>{isWaitingSync ? 'Waiting to sync' : 'Checked In'}</span>
                        </span>
                      ) : (
                        <button
                          onClick={() => triggerCheckIn(m.id)}
                          disabled={!hasScheduledService}
                          title={hasScheduledService ? `Check in ${m.firstName}` : checkInEligibility.message}
                          className="bg-[#6C5CE7] hover:bg-[#5b4be0] disabled:opacity-45 disabled:cursor-not-allowed text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer"
                        >
                          {hasScheduledService ? 'Check in' : 'Unavailable'}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })
            ) : (
              <li className="bg-white dark:bg-[#1C1C3C] border border-[#E3E5F2] dark:border-[#2D2D55] rounded-3xl p-8 text-center text-xs text-[#5B5F7A] dark:text-[#A9ACC8] space-y-2">
                <p>No member found matching "{searchQuery}".</p>
                <button
                  onClick={() => setIsVisitorSheetOpen(true)}
                  className="px-4 py-2 rounded-xl bg-[#6C5CE7] text-white font-bold"
                >
                  Register as new visitor
                </button>
              </li>
            )}
          </ul>
        </div>
      </div>

      {/* FULLSCREEN GREEN CONFIRMATION FLASH MODAL */}
      {confirmationMember && (
        <div
          onClick={() => setConfirmationMember(null)}
          className="fixed inset-0 z-50 bg-[#1E7A5F] text-white flex flex-col items-center justify-center p-6 text-center cursor-pointer animate-in fade-in duration-200"
          role="status"
          aria-live="assertive"
        >
          <MemberAvatar
            src={confirmationMember.imageUrl}
            name={confirmationMember.name}
            initials={confirmationMember.initials}
            sizeClass="w-28 h-28 mb-4 shadow-2xl animate-in zoom-in-75"
            textClass="text-4xl font-black"
            bgClass="bg-white text-[#1E7A5F]"
            borderClass="border-4 border-white/80"
          />
          <h2 className="text-3xl sm:text-4xl font-extrabold mb-1 tracking-tight">{confirmationMember.name}</h2>
          <p className="text-lg opacity-95">{confirmationMember.group}</p>
          <p className="text-base font-bold bg-white/20 px-5 py-1.5 rounded-full mt-4">
            {confirmationMember.isOfflineSaved ? 'Saved locally · Will sync when online' : 'Verified & Checked In'}
          </p>
          <span className="text-xs opacity-75 mt-6">Tap anywhere to dismiss</span>
        </div>
      )}

      {/* ADD VISITOR MODAL DIALOG */}
      {isVisitorSheetOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 animate-in fade-in">
          <form
            onSubmit={handleVisitorSubmit}
            className="bg-white dark:bg-[#1C1C3C] w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-4 animate-in zoom-in-95"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">Register First-Time Visitor</h2>
                <p className="text-xs text-[#5B5F7A] dark:text-[#A9ACC8]">
                  Quick entrance capture. Follow-up assigned within {systemSettings.firstTimerFollowupHours || 24}h via{' '}
                  {systemSettings.smsGatewayProvider || 'Pastoral Care'}.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsVisitorSheetOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
                aria-label="Close dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold mb-1.5 text-[#1D1B3A] dark:text-[#F2F2FA]">Full Name</label>
              <input
                type="text"
                placeholder="e.g. Sena Glover"
                value={visitorName}
                onChange={(e) => setVisitorName(e.target.value)}
                autoFocus
                className="w-full p-3 rounded-2xl border border-[#E3E5F2] dark:border-[#2D2D55] bg-slate-50 dark:bg-black/20 text-xs font-medium text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6C5CE7]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold mb-1.5 text-[#1D1B3A] dark:text-[#F2F2FA]">Phone Number</label>
              <input
                type="tel"
                placeholder="024 123 4567"
                value={visitorPhone}
                onChange={(e) => setVisitorPhone(e.target.value)}
                className="w-full p-3 rounded-2xl border border-[#E3E5F2] dark:border-[#2D2D55] bg-slate-50 dark:bg-black/20 text-xs font-mono font-medium text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6C5CE7]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold mb-1.5 text-[#1D1B3A] dark:text-[#F2F2FA]">
                How did they hear about {systemSettings.churchName || 'this church'}?
              </label>
              <select
                value={visitorHowHeard}
                onChange={(e) => setVisitorHowHeard(e.target.value)}
                className="w-full p-3 rounded-2xl border border-[#E3E5F2] dark:border-[#2D2D55] bg-slate-50 dark:bg-black/20 text-xs font-medium text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6C5CE7]"
              >
                <option>Invited by a member</option>
                <option>Social media / Livestream</option>
                <option>Walked past campus</option>
                <option>Flyer / Community event</option>
                <option>Other</option>
              </select>
            </div>

            {activeSettingsGroups.length > 0 && (
              <div>
                <label className="block text-xs font-bold mb-1.5 text-[#1D1B3A] dark:text-[#F2F2FA]">
                  Connect to Ministry / Cell Group (Optional)
                </label>
                <select
                  value={visitorPreferredGroup}
                  onChange={(e) => setVisitorPreferredGroup(e.target.value)}
                  className="w-full p-3 rounded-2xl border border-[#E3E5F2] dark:border-[#2D2D55] bg-slate-50 dark:bg-black/20 text-xs font-medium text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6C5CE7]"
                >
                  <option value="">Welcome &amp; Visitors Team (Default)</option>
                  {activeSettingsGroups.map((g) => (
                    <option key={g.id} value={g.name}>
                      {g.name} (Leader: {g.leaderName})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setIsVisitorSheetOpen(false)}
                className="flex-1 py-3 rounded-2xl border border-[#E3E5F2] dark:border-[#2D2D55] text-xs font-bold text-[#5B5F7A] dark:text-[#A9ACC8] hover:bg-slate-50 dark:hover:bg-black/20"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-3 rounded-2xl bg-[#6C5CE7] hover:bg-[#5b4be0] text-white text-xs font-bold shadow-md transition-all"
              >
                Save & Check In
              </button>
            </div>
          </form>
        </div>
      )}

      <ServiceQrModal
        isOpen={isServiceQrModalOpen}
        service={
          currentService?.id && !isPlaceholderServiceId(currentService.id)
            ? currentService
            : null
        }
        onClose={() => setIsServiceQrModalOpen(false)}
      />
      </div>
    </main>
  );
};
