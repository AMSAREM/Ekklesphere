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
} from 'lucide-react';

export const UsherTool: React.FC = () => {
  const {
    services,
    activeServiceId,
    setActiveServiceId,
    currentService,
    members,
    totalCheckedInCount,
    expectedAttendance,
    visitorsCount,
    addVisitor,
    checkInPerson,
    isUsherOnline,
    setIsUsherOnline,
    pendingSyncCount,
    syncUsherCheckins,
    attendanceRecords,
    showToast,
    setIsSettingsModalOpen,
    isSettingsModalOpen,
  } = useEkklesphere();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'unchecked' | 'checked'>('all');
  const [isVisitorSheetOpen, setIsVisitorSheetOpen] = useState(false);
  const [visitorName, setVisitorName] = useState('');
  const [visitorPhone, setVisitorPhone] = useState('');
  const [visitorHowHeard, setVisitorHowHeard] = useState('Invited by a member');

  // Green full-screen confirmation overlay state
  const [confirmationMember, setConfirmationMember] = useState<{
    name: string;
    group: string;
    initials: string;
    isOfflineSaved: boolean;
  } | null>(null);

  // Filter members based on search and status tabs
  const filteredMembers = members.filter((m) => {
    const isChecked = attendanceRecords.some((r) => r.personId === m.id);

    if (filterMode === 'unchecked' && isChecked) return false;
    if (filterMode === 'checked' && !isChecked) return false;

    const q = searchQuery.toLowerCase().replace(/\s/g, '');
    if (!q) return true;
    const nameMatch = `${m.firstName}${m.lastName}`.toLowerCase().includes(q);
    const phoneMatch = m.phoneE164.replace(/\D/g, '').includes(q);
    const groupMatch = m.groupName.toLowerCase().includes(q);
    return nameMatch || phoneMatch || groupMatch;
  });

  const uncheckedMembers = members.filter((m) => !attendanceRecords.some((r) => r.personId === m.id));

  const handleScanClick = () => {
    // Pick the first unchecked member from the list
    const unchecked = uncheckedMembers[0];
    if (!unchecked) {
      showToast('All registered members in the roster are already checked in!');
      return;
    }
    triggerCheckIn(unchecked.id);
  };

  const triggerCheckIn = (personId: string) => {
    const person = members.find((m) => m.id === personId);
    if (!person) return;

    checkInPerson(personId, 'usher', 98, 'Usher scanner audit');

    setConfirmationMember({
      name: `${person.firstName} ${person.lastName}`,
      group: person.groupName,
      initials: person.avatarInitials,
      isOfflineSaved: !isUsherOnline,
    });

    setTimeout(() => {
      setConfirmationMember(null);
    }, 1800);
  };

  const handleVisitorSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!visitorName.trim()) {
      showToast('Please enter visitor name');
      return;
    }
    addVisitor(visitorName, visitorPhone, visitorHowHeard);
    setIsVisitorSheetOpen(false);
    setVisitorName('');
    setVisitorPhone('');
    showToast(`Visitor ${visitorName} registered! Welcome packet queued.`);
  };

  const formatPhone = (phone: string) => {
    const clean = phone.replace('+233', '0');
    return clean.replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3');
  };

  const attendancePercentage = Math.min(Math.round((totalCheckedInCount / (expectedAttendance || 1)) * 100), 100);

  return (
    <main className="relative max-w-[1360px] w-full mx-auto my-1.5 sm:my-3 lg:my-4 bg-[#F6F7FC] dark:bg-[#14142E] rounded-2xl sm:rounded-3xl lg:rounded-[36px] pt-4 sm:pt-6 pb-28 sm:pb-32 lg:pb-8 px-3 sm:px-6 lg:pr-8 lg:pl-0 shadow-lg lg:shadow-[0_20px_60px_rgba(60,50,140,0.12)] border border-[#E9EBF5] dark:border-[#2D2D55] min-h-[calc(100vh-80px)] lg:min-h-[900px] lg:flex lg:items-start transition-all duration-200">
      {/* Signature Purple Curved Navigation Bar - 5 Buttons */}
      <aside
        aria-label="Usher Station Navigation"
        className="fixed bottom-3 inset-x-3 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:bottom-4 lg:translate-x-0 lg:inset-x-auto lg:static lg:sticky lg:top-[84px] lg:self-start lg:w-[62px] lg:shrink-0 bg-[#6D5CF2] rounded-2xl sm:rounded-full lg:rounded-r-[32px] lg:rounded-l-none flex flex-row lg:flex-col items-center justify-around sm:justify-center lg:justify-start gap-1.5 sm:gap-3 p-2 lg:py-5 lg:px-0 z-30 side-curved-tab shadow-xl lg:shadow-[0_12px_32px_rgba(40,30,120,0.22)] border border-white/20 lg:border-none backdrop-blur-md lg:backdrop-blur-none max-w-[420px] sm:max-w-none mx-auto sm:mx-0"
      >
        {/* 1. Roster */}
        <div className="relative group">
          <button
            onClick={() => {
              setFilterMode('all');
              setSearchQuery('');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            aria-label="Door Roster"
            aria-current={filterMode === 'all' && !isVisitorSheetOpen ? 'page' : undefined}
            className={`w-10 h-10 sm:w-11 sm:h-11 rounded-[14px] flex items-center justify-center transition-all duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2 active:scale-95 ${
              filterMode === 'all' && !isVisitorSheetOpen
                ? 'bg-white text-[#6D5CF2] shadow-[0_6px_16px_rgba(30,20,90,0.28)] font-bold scale-105'
                : 'text-white/85 hover:text-white hover:bg-white/20'
            }`}
          >
            <Users className="w-5 h-5" />
          </button>
          <span className="hidden lg:group-hover:flex lg:group-focus-within:flex items-center gap-1.5 absolute left-[68px] top-1/2 -translate-y-1/2 px-3 py-1.5 bg-[#1D1B3A] dark:bg-[#F2F2FA] text-white dark:text-[#1D1B3A] text-xs font-bold rounded-xl shadow-xl pointer-events-none whitespace-nowrap z-50 animate-in fade-in slide-in-from-left-2 duration-150">
            <span>Roster</span>
          </span>
        </div>

        {/* 2. Quick Scan */}
        <div className="relative group">
          <button
            onClick={handleScanClick}
            aria-label="Scan Member QR Pass"
            className="w-10 h-10 sm:w-11 sm:h-11 rounded-[14px] flex items-center justify-center text-white/85 hover:text-white hover:bg-white/20 transition-all duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2 active:scale-95"
          >
            <QrCode className="w-5 h-5" />
          </button>
          <span className="hidden lg:group-hover:flex lg:group-focus-within:flex items-center gap-1.5 absolute left-[68px] top-1/2 -translate-y-1/2 px-3 py-1.5 bg-[#1D1B3A] dark:bg-[#F2F2FA] text-white dark:text-[#1D1B3A] text-xs font-bold rounded-xl shadow-xl pointer-events-none whitespace-nowrap z-50 animate-in fade-in slide-in-from-left-2 duration-150">
            <span>Scan Arrival</span>
          </span>
        </div>

        {/* 3. Register Visitor */}
        <div className="relative group">
          <button
            onClick={() => setIsVisitorSheetOpen(true)}
            aria-label="Register Visitor"
            aria-current={isVisitorSheetOpen ? 'page' : undefined}
            className={`w-10 h-10 sm:w-11 sm:h-11 rounded-[14px] flex items-center justify-center transition-all duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2 active:scale-95 ${
              isVisitorSheetOpen
                ? 'bg-white text-[#6D5CF2] shadow-[0_6px_16px_rgba(30,20,90,0.28)] font-bold scale-105'
                : 'text-white/85 hover:text-white hover:bg-white/20'
            }`}
          >
            <UserPlus className="w-5 h-5" />
          </button>
          <span className="hidden lg:group-hover:flex lg:group-focus-within:flex items-center gap-1.5 absolute left-[68px] top-1/2 -translate-y-1/2 px-3 py-1.5 bg-[#1D1B3A] dark:bg-[#F2F2FA] text-white dark:text-[#1D1B3A] text-xs font-bold rounded-xl shadow-xl pointer-events-none whitespace-nowrap z-50 animate-in fade-in slide-in-from-left-2 duration-150">
            <span>Register Visitor</span>
          </span>
        </div>

        {/* 4. Sync Queue */}
        <div className="relative group">
          <button
            onClick={() => {
              const count = syncUsherCheckins();
              showToast(count > 0 ? `Synced ${count} check-ins to cloud` : 'Offline queue already in sync');
            }}
            aria-label="Sync Offline Queue"
            className="relative w-10 h-10 sm:w-11 sm:h-11 rounded-[14px] flex items-center justify-center text-white/85 hover:text-white hover:bg-white/20 transition-all duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2 active:scale-95"
          >
            <RefreshCw className="w-5 h-5" />
            {pendingSyncCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center border-2 border-[#6D5CF2] shadow-xs">
                {pendingSyncCount}
              </span>
            )}
          </button>
          <span className="hidden lg:group-hover:flex lg:group-focus-within:flex items-center gap-1.5 absolute left-[68px] top-1/2 -translate-y-1/2 px-3 py-1.5 bg-[#1D1B3A] dark:bg-[#F2F2FA] text-white dark:text-[#1D1B3A] text-xs font-bold rounded-xl shadow-xl pointer-events-none whitespace-nowrap z-50 animate-in fade-in slide-in-from-left-2 duration-150">
            <span>Sync Queue</span>
            {pendingSyncCount > 0 && (
              <span className="px-1.5 py-0.2 bg-red-500 text-white text-[10px] rounded-full font-black">
                {pendingSyncCount} Pending
              </span>
            )}
          </span>
        </div>

        {/* 5. System Settings */}
        <div className="relative group">
          <button
            onClick={() => setIsSettingsModalOpen(true)}
            aria-label="Station Settings"
            aria-current={isSettingsModalOpen ? 'page' : undefined}
            className={`w-10 h-10 sm:w-11 sm:h-11 rounded-[14px] flex items-center justify-center transition-all duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2 active:scale-95 ${
              isSettingsModalOpen
                ? 'bg-white text-[#6D5CF2] shadow-[0_6px_16px_rgba(30,20,90,0.28)] font-bold scale-105'
                : 'text-white/85 hover:text-white hover:bg-white/20'
            }`}
          >
            <Settings className="w-5 h-5" />
          </button>
          <span className="hidden lg:group-hover:flex lg:group-focus-within:flex items-center gap-1.5 absolute left-[68px] top-1/2 -translate-y-1/2 px-3 py-1.5 bg-[#1D1B3A] dark:bg-[#F2F2FA] text-white dark:text-[#1D1B3A] text-xs font-bold rounded-xl shadow-xl pointer-events-none whitespace-nowrap z-50 animate-in fade-in slide-in-from-left-2 duration-150">
            <span>Station Settings</span>
          </span>
        </div>
      </aside>

      {/* Main Station Content */}
      <div className="flex-1 min-w-0 lg:pl-6">

      {/* Top Station Header & Status Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5 pb-4 border-b border-[#E3E5F2] dark:border-[#2D2D55]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold shadow-sm">
            <QrCode className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                Door Steward & Check-in Station
              </h1>
              <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-[11px] font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                Live Entrance Station
              </span>
            </div>
            <p className="text-xs text-[#5B5F7A] dark:text-[#A9ACC8]">
              Accra Central Church · Door 1 (Main Sanctuary Foyer)
            </p>
          </div>
        </div>

        {/* Controls: Service Selector & Network Toggle */}
        <div className="flex items-center gap-2.5 self-stretch sm:self-auto">
          {/* Service Selector */}
          <select
            id="svc-select"
            value={activeServiceId}
            onChange={(e) => setActiveServiceId(e.target.value)}
            className="flex-1 sm:flex-none bg-white dark:bg-[#1C1C3C] border border-[#E3E5F2] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] rounded-2xl px-3.5 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-[#6C5CE7]"
          >
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

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

        <div className="bg-white dark:bg-[#1C1C3C] border border-[#E3E5F2] dark:border-[#2D2D55] rounded-3xl p-4 sm:p-5 shadow-sm flex flex-col justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#5B5F7A] dark:text-[#A9ACC8]">
            Expected Seating
          </span>
          <span className="text-3xl sm:text-4xl font-extrabold text-[#1D1B3A] dark:text-[#F2F2FA] tracking-tight tabular-nums mt-1">
            {expectedAttendance}
          </span>
          <span className="text-[11px] text-[#5B5F7A] dark:text-[#A9ACC8] mt-2">
            Remaining: <b className="text-[#1D1B3A] dark:text-[#F2F2FA]">{Math.max(0, expectedAttendance - totalCheckedInCount)} seats</b>
          </span>
        </div>

        <div className="bg-white dark:bg-[#1C1C3C] border border-[#E3E5F2] dark:border-[#2D2D55] rounded-3xl p-4 sm:p-5 shadow-sm flex flex-col justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            First-Time Visitors
          </span>
          <span className="text-3xl sm:text-4xl font-extrabold text-emerald-600 dark:text-emerald-400 tracking-tight tabular-nums mt-1">
            {visitorsCount}
          </span>
          <button
            onClick={() => setIsVisitorSheetOpen(true)}
            className="text-[11px] font-bold text-[#6C5CE7] dark:text-[#8C7DFF] hover:underline mt-2 text-left"
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

      {/* Main 2-Column Workstation Layout on Desktop/Tablets */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column (5 cols on lg): Scanner, Quick Check-in & Visitor Registration */}
        <div className="lg:col-span-5 space-y-4">
          {/* Main High-Contrast Scanner Viewfinder */}
          <div className="bg-[#1B1B3A] dark:bg-[#151528] text-white rounded-3xl p-5 border border-indigo-900/30 shadow-lg relative overflow-hidden flex flex-col justify-between min-h-[260px]">
            {/* Viewfinder Graphic Overlay */}
            <div className="relative border-2 border-dashed border-[#6C5CE7]/60 rounded-2xl p-6 flex flex-col items-center justify-center gap-3 bg-black/20 text-center">
              <div className="w-14 h-14 rounded-2xl bg-[#6C5CE7]/20 flex items-center justify-center text-[#6C5CE7] dark:text-[#8C7DFF]">
                <QrCode className="w-8 h-8 animate-pulse" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Digital Member Pass Scanner</h3>
                <p className="text-xs text-white/70 max-w-xs mt-0.5">
                  Hold smartphone pass or printed member barcode up to camera
                </p>
              </div>
            </div>

            {/* Scan Action Buttons */}
            <div className="pt-4 flex flex-col sm:flex-row gap-2">
              <button
                onClick={handleScanClick}
                className="flex-1 py-3 px-4 rounded-2xl bg-[#6C5CE7] hover:bg-[#5b4be0] text-white text-xs sm:text-sm font-bold shadow-md flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
              >
                <QrCode className="w-4 h-4" />
                <span>Simulate Camera Scan</span>
              </button>
              <button
                onClick={() => setIsVisitorSheetOpen(true)}
                className="py-3 px-4 rounded-2xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center justify-center gap-2 transition-all"
              >
                <UserPlus className="w-4 h-4" />
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
                placeholder="Search member by name, phone (+233), or cell group..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 dark:bg-black/20 border border-[#E3E5F2] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] rounded-2xl pl-10 pr-4 py-2.5 text-xs sm:text-sm outline-none focus:ring-2 focus:ring-[#6C5CE7]"
              />
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto text-xs font-bold">
              {[
                { id: 'all', label: `All Members (${members.length})` },
                { id: 'unchecked', label: `Unchecked (${uncheckedMembers.length})` },
                { id: 'checked', label: `Checked In (${members.length - uncheckedMembers.length})` },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setFilterMode(tab.id as any)}
                  className={`px-3 py-1.5 rounded-xl transition-all shrink-0 ${
                    filterMode === tab.id
                      ? 'bg-[#6C5CE7] text-white shadow-sm'
                      : 'text-[#5B5F7A] dark:text-[#A9ACC8] hover:bg-slate-100 dark:hover:bg-white/5'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Members List */}
          <ul className="space-y-2.5 max-h-[620px] overflow-y-auto pr-1" role="list">
            {filteredMembers.length > 0 ? (
              filteredMembers.map((m) => {
                const record = attendanceRecords.find((r) => r.personId === m.id);
                const isChecked = !!record;
                const isWaitingSync = record?.waitingToSync;

                return (
                  <li
                    key={m.id}
                    className="bg-white dark:bg-[#1C1C3C] border border-[#E3E5F2] dark:border-[#2D2D55] rounded-3xl p-3 sm:p-3.5 flex items-center justify-between gap-3 shadow-sm hover:border-[#6C5CE7]/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-11 h-11 rounded-2xl bg-[#EEEBFF] dark:bg-[#2A2A55] text-[#6C5CE7] dark:text-[#8C7DFF] font-bold text-sm flex items-center justify-center shrink-0">
                        {m.avatarInitials}
                      </div>
                      <div className="min-w-0">
                        <b className="block text-xs sm:text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA] truncate">
                          {m.firstName} {m.lastName}
                        </b>
                        <div className="flex items-center gap-2 text-[11px] text-[#5B5F7A] dark:text-[#A9ACC8] truncate mt-0.5">
                          <span className="font-mono">{formatPhone(m.phoneE164)}</span>
                          <span>·</span>
                          <span className="truncate">{m.groupName}</span>
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0">
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
                          className="bg-[#6C5CE7] hover:bg-[#5b4be0] text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95"
                        >
                          Check in
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
          <div className="w-28 h-28 rounded-full bg-white text-[#1E7A5F] text-4xl font-black flex items-center justify-center shadow-2xl mb-4 animate-in zoom-in-75">
            {confirmationMember.initials}
          </div>
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
                  Quick entrance capture. Pastoral follow-up SMS dispatched tomorrow.
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
                How did they hear about Accra Central Church?
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
      </div>
    </main>
  );
};
