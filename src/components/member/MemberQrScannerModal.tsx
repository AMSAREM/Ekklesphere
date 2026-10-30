import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Camera,
  Flashlight,
  RefreshCw,
  QrCode,
  CheckCircle2,
  Users,
  Search,
  Sparkles,
  MapPin,
  Clock,
  ShieldCheck,
  ChevronRight,
  ArrowLeft,
  Scan,
  Volume2,
  VolumeX,
  AlertCircle
} from 'lucide-react';
import { Person } from '../../types/ekklesphere';
import { useEkklesphere } from '../../context/EkklesphereContext';

interface MemberQrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserMember?: Person;
}

export const MemberQrScannerModal: React.FC<MemberQrScannerModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { members, checkInPerson, attendanceRecords, showToast, currentService } = useEkklesphere();

  const [activeMode, setActiveMode] = useState<'scanner' | 'my_code'>('scanner');
  const [flashlightOn, setFlashlightOn] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isScanning, setIsScanning] = useState(true);
  const [scannedMember, setScannedMember] = useState<Person | null>(null);
  const [scannedSessionList, setScannedSessionList] = useState<{ member: Person; time: string }[]>([]);
  const [searchFilter, setSearchFilter] = useState('');
  const [fellowshipContext, setFellowshipContext] = useState<string>('Sunday Service');
  const [isAutoScanning, setIsAutoScanning] = useState(false);

  const autoScanTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (autoScanTimerRef.current) clearTimeout(autoScanTimerRef.current);
    };
  }, []);

  if (!isOpen) return null;

  const playScanBeep = () => {
    if (!soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(987.77, ctx.currentTime); // B5 note
      osc.frequency.setValueAtTime(1318.51, ctx.currentTime + 0.08); // E6 note
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
      osc.start();
      osc.stop(ctx.currentTime + 0.22);

      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([40, 20, 40]);
      }
    } catch {
      // AudioContext unavailable or blocked by browser policy
    }
  };

  const handleProcessScan = (targetMember: Person) => {
    setIsScanning(false);
    setIsAutoScanning(false);
    playScanBeep();

    // Check if member already checked in
    const isAlreadyCheckedIn = attendanceRecords.some((r) => r.personId === targetMember.id);

    if (!isAlreadyCheckedIn) {
      checkInPerson(targetMember.id, 'posted_qr', 98, `Scanned in ${fellowshipContext}`);
    }

    setScannedMember(targetMember);
    setScannedSessionList((prev) => {
      if (prev.some((item) => item.member.id === targetMember.id)) {
        return prev;
      }
      return [
        {
          member: targetMember,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        },
        ...prev,
      ];
    });

    showToast(`Scanned ${targetMember.firstName} ${targetMember.lastName} (${targetMember.groupName || targetMember.homeCellGroup})`);
  };

  const handleAutoScanSimulation = () => {
    setIsAutoScanning(true);
    setIsScanning(true);
    setScannedMember(null);

    // Pick a random member from the list
    const candidateMembers = members.filter((m) => m.id !== 'm1');
    const randomMember = candidateMembers[Math.floor(Math.random() * candidateMembers.length)] || members[0];

    autoScanTimerRef.current = setTimeout(() => {
      if (randomMember) {
        handleProcessScan(randomMember);
      }
    }, 1400);
  };

  const handleResetScanner = () => {
    setScannedMember(null);
    setIsScanning(true);
    setIsAutoScanning(false);
  };

  // Filter candidates for quick simulation pills
  const availableMembers = members.filter((m) => {
    if (!searchFilter.trim()) return true;
    const q = searchFilter.toLowerCase();
    return (
      m.firstName.toLowerCase().includes(q) ||
      m.lastName.toLowerCase().includes(q) ||
      (m.memberId && m.memberId.toLowerCase().includes(q)) ||
      (m.homeCellGroup && m.homeCellGroup.toLowerCase().includes(q)) ||
      (m.groupName && m.groupName.toLowerCase().includes(q))
    );
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-[#0F0E1D] text-white rounded-3xl shadow-2xl border border-white/10 flex flex-col max-h-[94vh] overflow-hidden">
        {/* Top Header / Mode Switcher */}
        <div className="p-4 sm:p-5 border-b border-white/10 flex items-center justify-between shrink-0 bg-white/[0.02]">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-2xl bg-[#6D5CF2] text-white flex items-center justify-center shadow-lg shadow-[#6D5CF2]/30">
              <Scan className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Check-in Scanner
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Live
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                Fellowship & attendance QR code reader
              </p>
            </div>
          </div>

          {/* Right Top Buttons */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`p-2 rounded-xl text-xs transition-colors cursor-pointer ${
                soundEnabled ? 'text-emerald-400 bg-white/5' : 'text-slate-500 bg-white/5'
              }`}
              title={soundEnabled ? 'Beep sound enabled' : 'Muted'}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Mode Selector Segment */}
        <div className="px-4 pt-3 pb-2 flex items-center gap-2 bg-[#0F0E1D] border-b border-white/5 shrink-0">
          <button
            onClick={() => {
              setActiveMode('scanner');
              handleResetScanner();
            }}
            className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeMode === 'scanner'
                ? 'bg-[#6D5CF2] text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Camera className="w-4 h-4" />
            <span>Camera Scanner</span>
          </button>

          <button
            onClick={() => setActiveMode('my_code')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeMode === 'my_code'
                ? 'bg-[#6D5CF2] text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <QrCode className="w-4 h-4" />
            <span>My Pass Code</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {activeMode === 'scanner' && (
            <div className="space-y-4">
              {/* Event / Fellowship Gathering Target Pill */}
              <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-2xl bg-white/5 border border-white/10 text-xs">
                <span className="text-slate-400 text-[11px] font-semibold">Gathering:</span>
                <select
                  value={fellowshipContext}
                  onChange={(e) => setFellowshipContext(e.target.value)}
                  className="bg-transparent text-white font-bold text-xs outline-none cursor-pointer text-right"
                >
                  <option value="Sunday Service" className="bg-[#1C1C3C] text-white">
                    {currentService.name.split(',')[0]} (Main Sanctuary)
                  </option>
                  <option value="Osu North Cell Meeting" className="bg-[#1C1C3C] text-white">
                    Osu North Cell Meeting
                  </option>
                  <option value="Choir Rehearsal" className="bg-[#1C1C3C] text-white">
                    Choir Rehearsal
                  </option>
                  <option value="Youth Fellowship" className="bg-[#1C1C3C] text-white">
                    Youth Fellowship
                  </option>
                  <option value="Midweek Prayer" className="bg-[#1C1C3C] text-white">
                    Midweek Prayer & Communion
                  </option>
                </select>
              </div>

              {/* CAMERA SIMULATION VIEWFINDER HUD */}
              <div className="relative aspect-4/3 w-full rounded-3xl overflow-hidden bg-black border-2 border-white/15 shadow-2xl flex items-center justify-center">
                {/* Simulated Lens Feed Background */}
                <div
                  className={`absolute inset-0 bg-gradient-to-br from-[#121124] via-[#1A1833] to-[#0A0914] ${
                    flashlightOn ? 'brightness-125 saturate-150' : 'brightness-100'
                  } transition-all duration-300`}
                >
                  {/* Subtle Grid texture for camera sensor simulation */}
                  <div
                    className="absolute inset-0 opacity-15"
                    style={{
                      backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.2) 1px, transparent 0)',
                      backgroundSize: '24px 24px',
                    }}
                  />
                  {flashlightOn && (
                    <div className="absolute inset-0 bg-radial from-amber-200/20 via-transparent to-transparent pointer-events-none" />
                  )}
                </div>

                {/* Top Camera Controls Overlay */}
                <div className="absolute top-3 left-3 right-3 flex items-center justify-between z-20">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-[10px] font-mono text-emerald-400">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
                    <span>CAMERA ACTIVE (1080p · {facingMode === 'environment' ? 'BACK' : 'FRONT'})</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setFlashlightOn(!flashlightOn)}
                      className={`p-2 rounded-full backdrop-blur-md border transition-all cursor-pointer ${
                        flashlightOn
                          ? 'bg-amber-400 text-black border-amber-300 shadow-lg shadow-amber-400/50'
                          : 'bg-black/60 text-white/80 border-white/10 hover:text-white'
                      }`}
                      title={flashlightOn ? 'Flashlight On' : 'Turn on Flashlight'}
                    >
                      <Flashlight className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))}
                      className="p-2 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-white/80 hover:text-white transition-all cursor-pointer"
                      title="Flip Camera Lens"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* RETICLE TARGET VIEWFINDER BOX */}
                <div className="relative w-48 h-48 sm:w-56 sm:h-56 z-10 flex items-center justify-center">
                  {/* Four Corner Reticles */}
                  <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-[#6D5CF2] rounded-tl-xl" />
                  <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-[#6D5CF2] rounded-tr-xl" />
                  <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-[#6D5CF2] rounded-bl-xl" />
                  <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-[#6D5CF2] rounded-br-xl" />

                  {/* Animated Laser Scanning Line */}
                  {isScanning && !scannedMember && (
                    <div
                      className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-[#59C3C3] to-transparent shadow-[0_0_12px_#59C3C3] animate-pulse"
                      style={{
                        animation: 'scanSweep 2.2s ease-in-out infinite alternate',
                      }}
                    />
                  )}

                  {/* Center QR watermark silhouette */}
                  <div className="opacity-20 flex flex-col items-center justify-center text-white pointer-events-none">
                    <QrCode className="w-20 h-20" />
                  </div>

                  {/* Scanning Status Badge */}
                  <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap">
                    <span className="px-3 py-1 rounded-full bg-black/70 backdrop-blur-md text-[11px] font-bold text-white/90 border border-white/10 flex items-center gap-1.5">
                      {isAutoScanning ? (
                        <>
                          <RefreshCw className="w-3 h-3 text-[#59C3C3] animate-spin" />
                          <span>Locking onto QR Code...</span>
                        </>
                      ) : (
                        <>
                          <Scan className="w-3 h-3 text-[#6D5CF2]" />
                          <span>Align member QR code inside square</span>
                        </>
                      )}
                    </span>
                  </div>
                </div>

                {/* Bottom Trigger Action Bar */}
                <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between z-20">
                  <span className="text-[10px] text-slate-400 font-mono">
                    Auto-detects Ekklesphere Badges
                  </span>

                  <button
                    onClick={handleAutoScanSimulation}
                    disabled={isAutoScanning}
                    className="px-3 py-1.5 rounded-xl bg-[#6D5CF2] hover:bg-[#5b4be0] text-white text-xs font-bold shadow-md flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 active:scale-95"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    <span>Auto-Scan Camera Demo</span>
                  </button>
                </div>
              </div>

              {/* SCAN RESULT CONFIRMATION CARD (when a member is scanned) */}
              {scannedMember && (
                <div className="p-4 rounded-3xl bg-emerald-950/40 border border-emerald-500/40 animate-in zoom-in-95 duration-200 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {scannedMember.imageUrl ? (
                        <img
                          src={scannedMember.imageUrl}
                          alt={scannedMember.firstName}
                          className="w-12 h-12 rounded-2xl object-cover border-2 border-emerald-400 shadow-md"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-300 font-bold text-base flex items-center justify-center border-2 border-emerald-400 shadow-md">
                          {scannedMember.avatarInitials}
                        </div>
                      )}
                      <div>
                        <div className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          <h3 className="text-sm font-bold text-white">
                            {scannedMember.firstName} {scannedMember.lastName}
                          </h3>
                        </div>
                        <p className="text-xs text-emerald-300/90 font-mono">
                          ID: {scannedMember.memberId || `ACC-${scannedMember.id.slice(0, 6)}`}
                        </p>
                        <p className="text-[11px] text-slate-300 mt-0.5">
                          {scannedMember.groupName || scannedMember.homeCellGroup} · {scannedMember.department || 'General'}
                        </p>
                      </div>
                    </div>

                    <span className="px-2.5 py-1 rounded-full bg-emerald-500 text-white text-[10px] font-extrabold uppercase tracking-wider">
                      Verified
                    </span>
                  </div>

                  <div className="pt-2 border-t border-emerald-500/20 flex items-center justify-between text-xs text-slate-300">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Recorded for: {fellowshipContext}</span>
                    </span>

                    <button
                      onClick={handleResetScanner}
                      className="px-3 py-1.5 rounded-xl bg-white text-[#1D1B3A] text-xs font-bold hover:bg-slate-100 transition-colors cursor-pointer"
                    >
                      Scan Next Member
                    </button>
                  </div>
                </div>
              )}

              {/* SIMULATION SELECTOR PILLS: Click any member to simulate scanning their badge */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-[#6D5CF2]" />
                    <span>Or Tap to Simulate Scanning Member Badge:</span>
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {availableMembers.length} members available
                  </span>
                </div>

                {/* Quick Search filter */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Quick search member name, ID, or cell..."
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 outline-none focus:border-[#6D5CF2]"
                  />
                </div>

                {/* Carousel of available members */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
                  {availableMembers.slice(0, 9).map((member) => {
                    const isChecked = attendanceRecords.some((r) => r.personId === member.id);
                    return (
                      <button
                        key={member.id}
                        onClick={() => handleProcessScan(member)}
                        className="p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-left transition-all group cursor-pointer flex flex-col justify-between"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="w-6 h-6 rounded-full bg-[#6D5CF2]/20 text-[#8C7DFF] font-bold text-[10px] flex items-center justify-center">
                            {member.avatarInitials}
                          </span>
                          {isChecked ? (
                            <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-400 font-bold">
                              Present
                            </span>
                          ) : (
                            <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-white/10 text-slate-400">
                              Scan
                            </span>
                          )}
                        </div>
                        <div>
                          <b className="block text-xs font-bold text-white truncate group-hover:text-[#8C7DFF]">
                            {member.firstName} {member.lastName}
                          </b>
                          <small className="text-[10px] text-slate-400 truncate block">
                            {member.homeCellGroup || member.groupName}
                          </small>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* RECENTLY SCANNED IN THIS SESSION DRAWER */}
              {scannedSessionList.length > 0 && (
                <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-300">
                      Scanned in this session ({scannedSessionList.length})
                    </span>
                    <span className="text-[10px] text-emerald-400 font-mono">Synced to records</span>
                  </div>

                  <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                    {scannedSessionList.map((item, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-white/5 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span className="font-medium text-white truncate max-w-[180px]">
                            {item.member.firstName} {item.member.lastName}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">{item.time}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* MY PASS CODE TAB (Personal entry code) */}
          {activeMode === 'my_code' && (
            <div className="space-y-4 text-center py-2">
              <div>
                <h3 className="text-base font-bold text-white">Your Personal QR Pass Code</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Ama Owusu · Member ID: ACC-2023-001 · Accra Central Church
                </p>
              </div>

              {/* High-contrast Digital QR Code */}
              <div className="bg-white p-5 rounded-3xl w-56 h-56 mx-auto flex items-center justify-center border-4 border-[#6D5CF2] shadow-2xl">
                <svg className="w-full h-full" viewBox="0 0 100 100">
                  <rect x="5" y="5" width="28" height="28" fill="#000" rx="3" />
                  <rect x="9" y="9" width="20" height="20" fill="#fff" rx="2" />
                  <rect x="13" y="13" width="12" height="12" fill="#000" rx="1" />

                  <rect x="67" y="5" width="28" height="28" fill="#000" rx="3" />
                  <rect x="71" y="9" width="20" height="20" fill="#fff" rx="2" />
                  <rect x="75" y="13" width="12" height="12" fill="#000" rx="1" />

                  <rect x="5" y="67" width="28" height="28" fill="#000" rx="3" />
                  <rect x="9" y="71" width="20" height="20" fill="#fff" rx="2" />
                  <rect x="13" y="75" width="12" height="12" fill="#000" rx="1" />

                  <rect x="40" y="8" width="6" height="6" fill="#000" />
                  <rect x="52" y="8" width="6" height="6" fill="#000" />
                  <rect x="40" y="20" width="6" height="6" fill="#000" />
                  <rect x="46" y="26" width="6" height="6" fill="#000" />
                  <rect x="40" y="40" width="12" height="12" fill="#6D5CF2" rx="2" />
                  <rect x="10" y="44" width="6" height="6" fill="#000" />
                  <rect x="22" y="44" width="6" height="6" fill="#000" />
                  <rect x="68" y="44" width="6" height="6" fill="#000" />
                  <rect x="80" y="44" width="6" height="6" fill="#000" />
                  <rect x="44" y="60" width="6" height="6" fill="#000" />
                  <rect x="56" y="60" width="6" height="6" fill="#000" />
                  <rect x="68" y="72" width="6" height="6" fill="#000" />
                  <rect x="80" y="80" width="12" height="12" fill="#000" />
                </svg>
              </div>

              <div>
                <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-950/60 px-3 py-1 rounded-full border border-emerald-500/30">
                  AMA-OWUSU-ACC-2023-001
                </span>
                <span className="block text-[11px] text-slate-400 mt-2">
                  Present this QR code to fellow members or door stewards to verify check-in.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Modal Bottom Actions */}
        <div className="p-4 border-t border-white/10 bg-white/[0.02] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Ghana Act 843 Secure Check-in</span>
          </div>

          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-all cursor-pointer"
          >
            Close Scanner
          </button>
        </div>
      </div>
    </div>
  );
};
