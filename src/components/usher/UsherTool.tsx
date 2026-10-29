import React, { useState } from 'react';
import { useEkklesphere } from '../../context/EkklesphereContext';
import { QrCode, Search, UserPlus, Wifi, WifiOff, Check, AlertTriangle, X, Filter } from 'lucide-react';

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
  } = useEkklesphere();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'not_checked' | 'checked'>('all');
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

  // Filter members based on search and status
  const filteredMembers = members.filter((m) => {
    const isChecked = attendanceRecords.some((r) => r.personId === m.id);
    if (filterMode === 'not_checked' && isChecked) return false;
    if (filterMode === 'checked' && !isChecked) return false;

    const q = searchQuery.toLowerCase().replace(/\s/g, '');
    if (!q) return true;
    const nameMatch = `${m.firstName}${m.lastName}`.toLowerCase().includes(q);
    const phoneMatch = m.phoneE164.replace(/\D/g, '').includes(q);
    const groupMatch = m.groupName.toLowerCase().replace(/\s/g, '').includes(q);
    return nameMatch || phoneMatch || groupMatch;
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
    <div className="max-w-[640px] mx-auto py-4 sm:py-6 px-3 sm:px-4 font-['Plus_Jakarta_Sans',sans-serif]">
      {/* Top Bar: Service selector & Online/Offline switch */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex-1 min-w-0">
          <label htmlFor="svc-select" className="block text-xs font-semibold text-[#5B5F7A] dark:text-[#A9ACC8] mb-1">
            Service
          </label>
          <select
            id="svc-select"
            value={activeServiceId}
            onChange={(e) => setActiveServiceId(e.target.value)}
            className="w-full bg-white dark:bg-[#1C1C3C] border border-[#E3E5F2] dark:border-[#2D2D55] text-[#1B1B3A] dark:text-[#F2F2FA] rounded-2xl px-3.5 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-semibold outline-none focus:ring-2 focus:ring-[#6C5CE7] truncate"
          >
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {/* Network Toggle with min 44px touch target */}
        <div className="flex items-center gap-2 pt-5 shrink-0">
          <span className="text-xs font-bold text-[#1B1B3A] dark:text-[#F2F2FA]">
            {isUsherOnline ? 'Online' : 'Offline'}
          </span>
          <button
            onClick={() => {
              const next = !isUsherOnline;
              setIsUsherOnline(next);
              showToast(next ? 'Connection restored (Online)' : 'Switched to Offline Mode');
            }}
            className={`w-13 h-7 rounded-full transition-colors relative flex items-center px-1 shrink-0 ${
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
      <div className="bg-[#6C5CE7] dark:bg-[#8C7DFF] text-white rounded-[28px] p-5 sm:p-6 flex items-center justify-between shadow-lg shadow-indigo-500/20 mb-3">
        <div>
          <small className="block opacity-90 text-[11px] sm:text-xs font-semibold uppercase tracking-wider">
            Checked in
          </small>
          <span className="text-4xl sm:text-5xl font-extrabold tracking-tight tabular-nums">
            {totalCheckedInCount}
          </span>
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
        <div className="bg-[#FFEFD0] dark:bg-[#3D2E10] text-[#8A5700] dark:text-[#F5B84A] rounded-2xl p-3 sm:p-3.5 mb-3 flex items-center justify-between gap-3 text-xs font-semibold shadow-sm">
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span className="truncate">
              {!isUsherOnline
                ? `Offline. ${pendingSyncCount} check-in${pendingSyncCount === 1 ? '' : 's'} saved on this phone.`
                : `${pendingSyncCount} check-in${pendingSyncCount === 1 ? '' : 's'} ready to sync.`}
            </span>
          </div>
          {isUsherOnline && pendingSyncCount > 0 && (
            <button
              onClick={syncUsherCheckins}
              className="bg-[#8A5700] hover:bg-[#6e4600] text-white px-3 py-1.5 rounded-xl font-bold transition-all shadow-sm shrink-0 whitespace-nowrap"
            >
              Sync now
            </button>
          )}
        </div>
      )}

      {/* Big High-Contrast Scan Button */}
      <button
        onClick={handleScanClick}
        className="w-full bg-[#1B1B3A] dark:bg-[#1C1C3C] border-2 border-indigo-900/30 text-white rounded-[28px] min-h-[110px] sm:min-h-[120px] p-4 flex flex-col items-center justify-center gap-2 hover:bg-[#282855] transition-all shadow-lg active:scale-[0.99] mb-4 group"
      >
        <QrCode className="w-8 h-8 sm:w-10 sm:h-10 group-hover:scale-110 transition-transform text-[#6C5CE7] dark:text-[#8C7DFF] shrink-0" />
        <span className="text-lg sm:text-2xl font-bold tracking-tight">Scan member code</span>
      </button>

      {/* Filter Tabs & Search Bar */}
      <div className="space-y-2.5 mb-4">
        <div className="flex items-center gap-1.5 bg-white dark:bg-[#1C1C3C] p-1 rounded-2xl border border-[#E3E5F2] dark:border-[#2D2D55] text-xs font-semibold">
          <button
            onClick={() => setFilterMode('all')}
            className={`flex-1 py-1.5 rounded-xl transition-all ${
              filterMode === 'all'
                ? 'bg-[#6C5CE7] text-white shadow-sm'
                : 'text-[#5B5F7A] dark:text-[#A9ACC8]'
            }`}
          >
            All ({members.length})
          </button>
          <button
            onClick={() => setFilterMode('not_checked')}
            className={`flex-1 py-1.5 rounded-xl transition-all ${
              filterMode === 'not_checked'
                ? 'bg-[#6C5CE7] text-white shadow-sm'
                : 'text-[#5B5F7A] dark:text-[#A9ACC8]'
            }`}
          >
            Pending
          </button>
          <button
            onClick={() => setFilterMode('checked')}
            className={`flex-1 py-1.5 rounded-xl transition-all ${
              filterMode === 'checked'
                ? 'bg-[#6C5CE7] text-white shadow-sm'
                : 'text-[#5B5F7A] dark:text-[#A9ACC8]'
            }`}
          >
            Checked In
          </button>
        </div>

        {/* Search & Add Visitor Row */}
        <div className="flex gap-2 items-center">
          <div className="flex-1 relative min-w-0">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 shrink-0" />
            <input
              type="search"
              placeholder="Search name, phone, or group..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white dark:bg-[#1C1C3C] border border-[#E3E5F2] dark:border-[#2D2D55] text-[#1B1B3A] dark:text-[#F2F2FA] rounded-2xl pl-10 pr-4 py-2.5 sm:py-3 text-xs sm:text-sm outline-none focus:ring-2 focus:ring-[#6C5CE7]"
            />
          </div>
          <button
            onClick={() => setIsVisitorSheetOpen(true)}
            className="bg-[#6C5CE7] hover:bg-[#5b4be0] text-white rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-bold flex items-center gap-1.5 shrink-0 shadow-sm whitespace-nowrap"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add visitor</span>
          </button>
        </div>
      </div>

      {/* Members List with No-Bleed Guards */}
      <ul className="space-y-2 sm:space-y-2.5" role="list">
        {filteredMembers.length > 0 ? (
          filteredMembers.map((m) => {
            const record = attendanceRecords.find((r) => r.personId === m.id);
            const isChecked = !!record;
            const isWaitingSync = record?.waitingToSync;

            return (
              <li
                key={m.id}
                className="bg-white dark:bg-[#1C1C3C] border border-[#E3E5F2] dark:border-[#2D2D55] rounded-2xl p-3 sm:p-3.5 flex items-center justify-between gap-3 shadow-sm overflow-hidden"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-[#EEEBFF] dark:bg-[#2A2A55] text-[#6C5CE7] dark:text-[#8C7DFF] font-bold text-xs sm:text-sm flex items-center justify-center shrink-0">
                    {m.avatarInitials}
                  </div>
                  <div className="min-w-0">
                    <b className="block text-xs sm:text-sm font-bold text-[#1B1B3A] dark:text-[#F2F2FA] truncate">
                      {m.firstName} {m.lastName}
                    </b>
                    <span className="text-[11px] sm:text-xs text-[#5B5F7A] dark:text-[#A9ACC8] block truncate">
                      {formatPhone(m.phoneE164)} · {m.groupName}
                    </span>
                  </div>
                </div>

                {isChecked ? (
                  <span
                    className={`text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1 shrink-0 whitespace-nowrap ${
                      isWaitingSync
                        ? 'bg-[#FFEFD0] text-[#8A5700] dark:bg-[#3D2E10] dark:text-[#F5B84A]'
                        : 'bg-[#DDF5EC] text-[#1E7A5F] dark:bg-[#16382F] dark:text-[#5FD3AB]'
                    }`}
                  >
                    <Check className="w-3.5 h-3.5 shrink-0" />
                    <span>{isWaitingSync ? 'Waiting to sync' : 'Checked in'}</span>
                  </span>
                ) : (
                  <button
                    onClick={() => triggerCheckIn(m.id)}
                    className="bg-[#6C5CE7] hover:bg-[#5b4be0] text-white px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 shadow-sm whitespace-nowrap"
                  >
                    Check in
                  </button>
                )}
              </li>
            );
          })
        ) : (
          <li className="text-center py-10 text-xs text-[#5B5F7A] dark:text-[#A9ACC8] bg-white dark:bg-[#1C1C3C] rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
            No member found matching current filter. Tap "Add visitor" to register them.
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
          <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-white text-[#1E7A5F] text-3xl sm:text-4xl font-black flex items-center justify-center shadow-xl mb-4 shrink-0">
            {confirmationMember.initials}
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold mb-1 tracking-tight truncate max-w-[90vw]">
            {confirmationMember.name}
          </h2>
          <p className="text-base sm:text-lg opacity-95">{confirmationMember.group}</p>
          <p className="text-sm sm:text-base font-bold bg-white/20 px-4 py-1.5 rounded-full mt-4">
            {confirmationMember.isOfflineSaved ? 'Saved locally. Will sync when online' : 'Checked in'}
          </p>
          <span className="text-xs opacity-75 mt-6">Tap anywhere to dismiss</span>
        </div>
      )}

      {/* ADD VISITOR BOTTOM SHEET */}
      {isVisitorSheetOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 flex items-end justify-center p-2 sm:p-0">
          <form
            onSubmit={handleVisitorSubmit}
            className="bg-white dark:bg-[#1C1C3C] w-full max-w-[640px] rounded-t-[32px] p-5 sm:p-6 shadow-2xl space-y-4 animate-in slide-in-from-bottom"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-[#1B1B3A] dark:text-[#F2F2FA]">
                  Add first-time visitor
                </h2>
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
                className="w-full p-2.5 sm:p-3 rounded-xl border border-[#E3E5F2] dark:border-[#2D2D55] bg-slate-50 dark:bg-black/20 text-xs font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1 text-[#1B1B3A] dark:text-[#F2F2FA]">Phone number</label>
              <input
                type="tel"
                placeholder="024 123 4567"
                value={visitorPhone}
                onChange={(e) => setVisitorPhone(e.target.value)}
                className="w-full p-2.5 sm:p-3 rounded-xl border border-[#E3E5F2] dark:border-[#2D2D55] bg-slate-50 dark:bg-black/20 text-xs font-medium font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1 text-[#1B1B3A] dark:text-[#F2F2FA]">
                How did they hear about us?
              </label>
              <select
                value={visitorHowHeard}
                onChange={(e) => setVisitorHowHeard(e.target.value)}
                className="w-full p-2.5 sm:p-3 rounded-xl border border-[#E3E5F2] dark:border-[#2D2D55] bg-slate-50 dark:bg-black/20 text-xs font-medium"
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
                className="flex-1 py-2.5 sm:py-3 rounded-xl border border-[#E3E5F2] dark:border-[#2D2D55] text-xs font-bold text-[#5B5F7A] dark:text-[#A9ACC8]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 sm:py-3 rounded-xl bg-[#6D5CF2] text-white text-xs font-bold shadow-md"
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
