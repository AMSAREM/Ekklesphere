import React, { useState, useRef, useEffect } from 'react';
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
  ChevronDown,
  LogOut,
  LayoutDashboard,
  Smartphone,
  Sparkles,
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
    currentUser,
    logout,
    switchUserRole,
  } = useEkklesphere();

  const [isUsherMenuOpen, setIsUsherMenuOpen] = useState(false);
  const usherMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (usherMenuRef.current && !usherMenuRef.current.contains(event.target as Node)) {
        setIsUsherMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const [searchQuery, setSearchQuery] = useState('');
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

  // Filter members based on search
  const filteredMembers = members.filter((m) => {
    const q = searchQuery.toLowerCase().replace(/\s/g, '');
    if (!q) return true;
    const nameMatch = `${m.firstName}${m.lastName}`.toLowerCase().includes(q);
    const phoneMatch = m.phoneE164.replace(/\D/g, '').includes(q);
    return nameMatch || phoneMatch;
  });

  const handleScanClick = () => {
    // Pick the first unchecked member from the list
    const unchecked = members.find((m) => !attendanceRecords.some((r) => r.personId === m.id));
    if (!unchecked) {
      showToast('All listed members are checked in!');
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
  };

  const formatPhone = (phone: string) => {
    const clean = phone.replace('+233', '0');
    return clean.replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3');
  };

  return (
    <div className="max-w-[640px] mx-auto py-4 px-4 font-['Plus_Jakarta_Sans',sans-serif]">
      {/* Top Identity & Role Bar */}
      <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-[#E3E5F2] dark:border-[#2D2D55]">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-500 flex items-center justify-center font-bold">
            <QrCode className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA] leading-tight">
              Door Attendance Scanner
            </h1>
            <p className="text-[11px] text-[#5B5F7A] dark:text-[#A9ACC8]">
              Accra Central Church · Door Steward
            </p>
          </div>
        </div>

        {/* User Role Switcher Pill */}
        {currentUser && (
          <div className="relative" ref={usherMenuRef}>
            <button
              onClick={() => setIsUsherMenuOpen((prev) => !prev)}
              className="flex items-center gap-1.5 pl-2 pr-2.5 py-1 rounded-xl bg-white dark:bg-[#1C1C3C] hover:bg-slate-50 dark:hover:bg-white/5 border border-[#E3E5F2] dark:border-[#2D2D55] text-xs font-semibold text-[#1D1B3A] dark:text-[#F2F2FA] shadow-sm transition-all"
            >
              <div className="w-5 h-5 rounded-md bg-amber-500 text-white flex items-center justify-center font-bold text-[10px]">
                {currentUser.initials}
              </div>
              <span>{currentUser.name.split(' ')[0]}</span>
              <span className="text-[9px] uppercase font-bold px-1 py-0.2 rounded bg-amber-50 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                Usher
              </span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {isUsherMenuOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-[#1A1A3A] text-[#1D1B3A] dark:text-[#F2F2FA] rounded-2xl shadow-xl border border-[#E3E5F2] dark:border-[#2D2D55] p-3 z-50 animate-in fade-in slide-in-from-top-2">
                <div className="text-[10px] uppercase font-bold text-slate-400 px-2 py-1 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-amber-500" />
                  <span>Switch Active Profile:</span>
                </div>

                <div className="space-y-1 mb-2">
                  <button
                    onClick={() => {
                      switchUserRole('admin');
                      setIsUsherMenuOpen(false);
                    }}
                    className="w-full flex items-center justify-between p-2 rounded-xl text-xs font-semibold hover:bg-slate-100 dark:hover:bg-white/5 text-[#1D1B3A] dark:text-[#F2F2FA]"
                  >
                    <div className="flex items-center gap-2">
                      <LayoutDashboard className="w-3.5 h-3.5 text-[#6D5CF2]" />
                      <span>Pastor David (Admin)</span>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      switchUserRole('member');
                      setIsUsherMenuOpen(false);
                    }}
                    className="w-full flex items-center justify-between p-2 rounded-xl text-xs font-semibold hover:bg-slate-100 dark:hover:bg-white/5 text-[#1D1B3A] dark:text-[#F2F2FA]"
                  >
                    <div className="flex items-center gap-2">
                      <Smartphone className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Ama Mensah (Member)</span>
                    </div>
                  </button>
                </div>

                <div className="pt-2 border-t border-[#E3E5F2] dark:border-[#2D2D55]">
                  <button
                    onClick={() => {
                      logout();
                      setIsUsherMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2 p-1.5 rounded-lg text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Top Bar: Service selector & Online/Offline switch */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex-1">
          <label htmlFor="svc-select" className="block text-xs font-semibold text-[#5B5F7A] dark:text-[#A9ACC8] mb-1">
            Service
          </label>
          <select
            id="svc-select"
            value={activeServiceId}
            onChange={(e) => setActiveServiceId(e.target.value)}
            className="w-full bg-white dark:bg-[#1C1C3C] border border-[#E3E5F2] dark:border-[#2D2D55] text-[#1B1B3A] dark:text-[#F2F2FA] rounded-2xl px-4 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-[#6C5CE7]"
          >
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {/* Network Toggle */}
        <div className="flex items-center gap-2 pt-5">
          <span className="text-xs font-bold text-[#1B1B3A] dark:text-[#F2F2FA]">
            {isUsherOnline ? 'Online' : 'Offline'}
          </span>
          <button
            onClick={() => {
              const next = !isUsherOnline;
              setIsUsherOnline(next);
              showToast(next ? 'Connection restored (Online)' : 'Switched to Offline Mode');
            }}
            className={`w-13 h-7 rounded-full transition-colors relative flex items-center px-1 ${
              isUsherOnline ? 'bg-[#1E7A5F]' : 'bg-[#B14A3A]'
            }`}
            title="Toggle network connection simulation"
            aria-label="Toggle Online/Offline"
          >
            <span
              className={`w-5 h-5 rounded-full bg-white shadow-md transition-transform flex items-center justify-center text-[10px] ${
                isUsherOnline ? 'translate-x-6 text-[#1E7A5F]' : 'translate-x-0 text-[#B14A3A]'
              }`}
            >
              {isUsherOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            </span>
          </button>
        </div>
      </div>

      {/* Vibrant Count Box */}
      <div className="bg-[#6C5CE7] dark:bg-[#8C7DFF] text-white rounded-[28px] p-6 flex items-center justify-between shadow-lg shadow-indigo-500/20 mb-3">
        <div>
          <small className="block opacity-90 text-xs font-semibold uppercase tracking-wider">Checked in</small>
          <span className="text-5xl font-extrabold tracking-tight tabular-nums">{totalCheckedInCount}</span>
        </div>
        <div className="text-right">
          <small className="block opacity-90 text-xs">Expected {expectedAttendance}</small>
          <small className="block text-emerald-200 font-semibold text-xs mt-1">
            {visitorsCount} first-time {visitorsCount === 1 ? 'visitor' : 'visitors'}
          </small>
        </div>
      </div>

      {/* Offline Pending Sync Banner */}
      {(!isUsherOnline || pendingSyncCount > 0) && (
        <div className="bg-[#FFEFD0] dark:bg-[#3D2E10] text-[#8A5700] dark:text-[#F5B84A] rounded-2xl p-3.5 mb-3 flex items-center justify-between gap-3 text-xs font-semibold shadow-sm">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              {!isUsherOnline
                ? `Offline. ${pendingSyncCount} check-in${pendingSyncCount === 1 ? '' : 's'} saved on this phone.`
                : `${pendingSyncCount} check-in${pendingSyncCount === 1 ? '' : 's'} ready to sync.`}
            </span>
          </div>
          {isUsherOnline && pendingSyncCount > 0 && (
            <button
              onClick={syncUsherCheckins}
              className="bg-[#8A5700] hover:bg-[#6e4600] text-white px-3 py-1.5 rounded-xl font-bold transition-all shadow-sm"
            >
              Sync now
            </button>
          )}
        </div>
      )}

      {/* Big High-Contrast Scan Button */}
      <button
        onClick={handleScanClick}
        className="w-full bg-[#1B1B3A] dark:bg-[#1C1C3C] border-2 border-indigo-900/30 text-white rounded-[28px] min-h-[120px] p-4 flex flex-col items-center justify-center gap-2 hover:bg-[#282855] transition-all shadow-lg active:scale-[0.99] mb-4 group"
      >
        <QrCode className="w-10 h-10 group-hover:scale-110 transition-transform text-[#6C5CE7] dark:text-[#8C7DFF]" />
        <span className="text-xl sm:text-2xl font-bold tracking-tight">Scan member code</span>
      </button>

      {/* Search & Add Visitor Row */}
      <div className="flex gap-2.5 items-center mb-4">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            placeholder="Search name or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white dark:bg-[#1C1C3C] border border-[#E3E5F2] dark:border-[#2D2D55] text-[#1B1B3A] dark:text-[#F2F2FA] rounded-2xl pl-11 pr-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#6C5CE7]"
          />
        </div>
        <button
          onClick={() => setIsVisitorSheetOpen(true)}
          className="bg-[#6C5CE7] hover:bg-[#5b4be0] text-white rounded-2xl px-4 py-3 text-sm font-bold flex items-center gap-1.5 shrink-0 shadow-sm"
        >
          <UserPlus className="w-4 h-4" />
          Add visitor
        </button>
      </div>

      {/* Members List */}
      <ul className="space-y-2.5" role="list">
        {filteredMembers.length > 0 ? (
          filteredMembers.map((m) => {
            const record = attendanceRecords.find((r) => r.personId === m.id);
            const isChecked = !!record;
            const isWaitingSync = record?.waitingToSync;

            return (
              <li
                key={m.id}
                className="bg-white dark:bg-[#1C1C3C] border border-[#E3E5F2] dark:border-[#2D2D55] rounded-2xl p-3 sm:p-3.5 flex items-center gap-3 shadow-sm"
              >
                <div className="w-11 h-11 rounded-full bg-[#EEEBFF] dark:bg-[#2A2A55] text-[#6C5CE7] dark:text-[#8C7DFF] font-bold text-sm flex items-center justify-center shrink-0">
                  {m.avatarInitials}
                </div>
                <div className="flex-1 min-w-0">
                  <b className="block text-sm font-bold text-[#1B1B3A] dark:text-[#F2F2FA] truncate">
                    {m.firstName} {m.lastName}
                  </b>
                  <span className="text-xs text-[#5B5F7A] dark:text-[#A9ACC8] block truncate">
                    {formatPhone(m.phoneE164)} · {m.groupName}
                  </span>
                </div>

                {isChecked ? (
                  <span
                    className={`text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1 shrink-0 ${
                      isWaitingSync
                        ? 'bg-[#FFEFD0] text-[#8A5700] dark:bg-[#3D2E10] dark:text-[#F5B84A]'
                        : 'bg-[#DDF5EC] text-[#1E7A5F] dark:bg-[#16382F] dark:text-[#5FD3AB]'
                    }`}
                  >
                    <Check className="w-3.5 h-3.5" />
                    {isWaitingSync ? 'Waiting to sync' : 'Checked in'}
                  </span>
                ) : (
                  <button
                    onClick={() => triggerCheckIn(m.id)}
                    className="bg-[#6C5CE7] hover:bg-[#5b4be0] text-white px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 shadow-sm"
                  >
                    Check in
                  </button>
                )}
              </li>
            );
          })
        ) : (
          <li className="text-center py-10 text-xs text-[#5B5F7A] dark:text-[#A9ACC8]">
            No member found matching "{searchQuery}". Tap "Add visitor" to register them.
          </li>
        )}
      </ul>

      {/* FULLSCREEN GREEN CONFIRMATION FLASH MODAL */}
      {confirmationMember && (
        <div
          onClick={() => setConfirmationMember(null)}
          className="fixed inset-0 z-50 bg-[#1E7A5F] text-white flex flex-col items-center justify-center p-6 text-center cursor-pointer animate-in fade-in duration-200"
          role="status"
          aria-live="assertive"
        >
          <div className="w-28 h-28 rounded-full bg-white text-[#1E7A5F] text-4xl font-black flex items-center justify-center shadow-xl mb-4">
            {confirmationMember.initials}
          </div>
          <h2 className="text-3xl font-extrabold mb-1 tracking-tight">{confirmationMember.name}</h2>
          <p className="text-lg opacity-95">{confirmationMember.group}</p>
          <p className="text-base font-bold bg-white/20 px-4 py-1 rounded-full mt-4">
            {confirmationMember.isOfflineSaved ? 'Saved locally. Will sync when online' : 'Checked in'}
          </p>
          <span className="text-xs opacity-75 mt-6">Tap anywhere to dismiss</span>
        </div>
      )}

      {/* ADD VISITOR BOTTOM SHEET */}
      {isVisitorSheetOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 flex items-end justify-center">
          <form
            onSubmit={handleVisitorSubmit}
            className="bg-white dark:bg-[#1C1C3C] w-full max-w-[640px] rounded-t-[32px] p-6 shadow-2xl space-y-4 animate-in slide-in-from-bottom"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-[#1B1B3A] dark:text-[#F2F2FA]">Add first-time visitor</h2>
                <p className="text-xs text-[#5B5F7A] dark:text-[#A9ACC8]">
                  Takes under a minute. They get a thank-you message tomorrow.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsVisitorSheetOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1 text-[#1B1B3A] dark:text-[#F2F2FA]">Full name</label>
              <input
                type="text"
                placeholder="e.g. Sena Glover"
                value={visitorName}
                onChange={(e) => setVisitorName(e.target.value)}
                autoFocus
                className="w-full p-3 rounded-xl border border-[#E3E5F2] dark:border-[#2D2D55] bg-slate-50 dark:bg-black/20 text-xs font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1 text-[#1B1B3A] dark:text-[#F2F2FA]">Phone number</label>
              <input
                type="tel"
                placeholder="024 123 4567"
                value={visitorPhone}
                onChange={(e) => setVisitorPhone(e.target.value)}
                className="w-full p-3 rounded-xl border border-[#E3E5F2] dark:border-[#2D2D55] bg-slate-50 dark:bg-black/20 text-xs font-medium font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1 text-[#1B1B3A] dark:text-[#F2F2FA]">
                How did they hear about us?
              </label>
              <select
                value={visitorHowHeard}
                onChange={(e) => setVisitorHowHeard(e.target.value)}
                className="w-full p-3 rounded-xl border border-[#E3E5F2] dark:border-[#2D2D55] bg-slate-50 dark:bg-black/20 text-xs font-medium"
              >
                <option>Invited by a member</option>
                <option>Social media</option>
                <option>Walked past</option>
                <option>Other</option>
              </select>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsVisitorSheetOpen(false)}
                className="flex-1 py-3 rounded-xl border border-[#E3E5F2] dark:border-[#2D2D55] text-xs font-bold text-[#5B5F7A] dark:text-[#A9ACC8]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-3 rounded-xl bg-[#6C5CE7] text-white text-xs font-bold shadow-md"
              >
                Save visitor
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
