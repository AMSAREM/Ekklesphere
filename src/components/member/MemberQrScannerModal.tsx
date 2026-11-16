import React, { useState } from 'react';
import {
  X,
  Camera,
  Flashlight,
  RefreshCw,
  QrCode,
  CheckCircle2,
  Users,
  Search,
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
import { QRCodeSVG } from 'qrcode.react';
import { Person } from '../../types/ekklesphere';
import { useEkklesphere } from '../../context/EkklesphereContext';
import { getCanonicalMemberId, findMemberByScannedId } from './DigitalMemberCard';
import { CameraQrScanner } from '../common/CameraQrScanner';
import { MemberAvatar } from '../common/MemberAvatar';
import { parseServiceQrPayload } from '../../utils/serviceQr';

interface MemberQrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserMember?: Person;
}

export const MemberQrScannerModal: React.FC<MemberQrScannerModalProps> = ({
  isOpen,
  onClose,
  currentUserMember,
}) => {
  const {
    members,
    checkInPerson,
    checkInWithServiceQr,
    attendanceRecords,
    showToast,
    currentService,
    hasScheduledService,
    checkInEligibility,
    services,
    churchGroups,
    systemSettings,
    currentUser,
  } = useEkklesphere();

  const [activeMode, setActiveMode] = useState<'scanner' | 'my_code'>('scanner');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isScanning, setIsScanning] = useState(true);
  const [isVerifyingServiceQr, setIsVerifyingServiceQr] = useState(false);
  const [scannedMember, setScannedMember] = useState<Person | null>(null);
  const [scannedServiceResult, setScannedServiceResult] = useState<{
    ok: boolean;
    message: string;
    serviceName?: string;
    alreadyCheckedIn?: boolean;
  } | null>(null);
  const [scannedSessionList, setScannedSessionList] = useState<
    { id: string; label: string; time: string }[]
  >([]);
  const [searchFilter, setSearchFilter] = useState('');
  const [fellowshipContext, setFellowshipContext] = useState<string>(currentService.name);

  if (!isOpen) return null;

  const passHolderName = currentUserMember
    ? `${currentUserMember.firstName} ${currentUserMember.lastName}`
    : currentUser?.name || 'Registered Member';
  const passMemberId = getCanonicalMemberId(
    currentUserMember,
    currentUser?.memberId || currentUser?.id
  );

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

  const selectedGatheringServiceId =
    services.find((svc) => svc.name === fellowshipContext)?.id || undefined;

  const handleProcessScan = (targetMember: Person) => {
    const targetSvcId = selectedGatheringServiceId || currentService.id;
    if (!hasScheduledService && !selectedGatheringServiceId) {
      showToast(checkInEligibility.message);
      return;
    }

    setIsScanning(false);
    setScannedServiceResult(null);
    playScanBeep();

    const isAlreadyCheckedIn = attendanceRecords.some(
      (r) =>
        r.personId === targetMember.id &&
        (r.serviceInstanceId === targetSvcId ||
          (!r.serviceInstanceId && services.length === 1))
    );

    if (!isAlreadyCheckedIn) {
      const started = checkInPerson(
        targetMember.id,
        'posted_qr',
        98,
        `Scanned in ${fellowshipContext}`,
        selectedGatheringServiceId
      );
      if (!started) {
        setIsScanning(true);
        return;
      }
    }

    setScannedMember(targetMember);
    setScannedSessionList((prev) => {
      if (prev.some((item) => item.id === `mem-${targetMember.id}`)) {
        return prev;
      }
      return [
        {
          id: `mem-${targetMember.id}`,
          label: `${targetMember.firstName} ${targetMember.lastName}`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        },
        ...prev,
      ];
    });

    showToast(
      `Scanned ${targetMember.firstName} ${targetMember.lastName} (${targetMember.groupName || targetMember.homeCellGroup || 'General'})`
    );
  };

  const handleProcessServiceQr = async (decodedText: string) => {
    const svcPayload = parseServiceQrPayload(decodedText, services);
    if (!svcPayload) return false;

    setIsScanning(false);
    setScannedMember(null);
    setIsVerifyingServiceQr(true);
    try {
      const result = await checkInWithServiceQr(svcPayload);
      if (result.ok) {
        playScanBeep();
        setScannedSessionList((prev) => [
          {
            id: `svc-${result.serviceId || svcPayload.serviceId}-${Date.now()}`,
            label: `${result.serviceName || 'Scheduled Service'} (Self QR Check-in)`,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          },
          ...prev,
        ]);
      }
      setScannedServiceResult({
        ok: result.ok,
        message: result.message,
        serviceName: result.serviceName,
        alreadyCheckedIn: result.alreadyCheckedIn,
      });
    } finally {
      setIsVerifyingServiceQr(false);
    }
    return true;
  };

  const handleResetScanner = () => {
    setScannedMember(null);
    setScannedServiceResult(null);
    setIsScanning(true);
  };

  const handleDecodedString = (decodedText: string) => {
    const svcPayload = parseServiceQrPayload(decodedText, services);
    if (svcPayload) {
      void handleProcessServiceQr(decodedText);
      return;
    }

    const targetMember = findMemberByScannedId(members, decodedText);
    if (targetMember) {
      handleProcessScan(targetMember);
    } else {
      showToast(`Scanned Code: "${decodedText}" (No matching service QR or member pass found)`);
    }
  };

  // Filter registered members for badge verification
  const availableMembers = members.filter((m) => {
    if (!searchFilter.trim()) return true;
    const q = searchFilter.toLowerCase();
    const canonicalId = getCanonicalMemberId(m).toLowerCase();
    return (
      (m.firstName || '').toLowerCase().includes(q) ||
      (m.lastName || '').toLowerCase().includes(q) ||
      canonicalId.includes(q) ||
      (m.memberId && m.memberId.toLowerCase().includes(q)) ||
      (m.homeCellGroup && m.homeCellGroup.toLowerCase().includes(q)) ||
      (m.groupName && m.groupName.toLowerCase().includes(q))
    );
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-[#0F0E1D] text-white rounded-3xl shadow-2xl border border-white/10 flex flex-col max-h-[94dvh] overflow-hidden">
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
              {!hasScheduledService && (
                <div
                  role="alert"
                  className="p-3 rounded-2xl bg-amber-500/15 border border-amber-400/35 text-amber-200 text-xs flex items-start gap-2"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-300" />
                  <span>{checkInEligibility.message}</span>
                </div>
              )}

              {/* Event / Fellowship Gathering Target Pill */}
              <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-2xl bg-white/5 border border-white/10 text-xs">
                <span className="text-slate-400 text-[11px] font-semibold">Gathering:</span>
                <select
                  value={fellowshipContext}
                  onChange={(e) => setFellowshipContext(e.target.value)}
                  className="bg-transparent text-white font-bold text-xs outline-none cursor-pointer text-right"
                >
                  {services.map((svc) => (
                    <option key={svc.id} value={svc.name} className="bg-[#1C1C3C] text-white">
                      {svc.name} ({systemSettings.campusName})
                    </option>
                  ))}
                  {churchGroups.map((grp) => (
                    <option key={grp.id} value={grp.name} className="bg-[#1C1C3C] text-white">
                      {grp.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* LIVE HARDWARE CAMERA VIEWFINDER */}
              <CameraQrScanner
                onScan={handleDecodedString}
                soundEnabled={soundEnabled}
                onToggleSound={() => setSoundEnabled(!soundEnabled)}
                isActive={
                  activeMode === 'scanner' &&
                  isScanning &&
                  !scannedMember &&
                  !scannedServiceResult &&
                  !isVerifyingServiceQr
                }
                className="aspect-4/3 w-full"
                reticleSize="md"
                instructionsText={
                  isVerifyingServiceQr
                    ? 'Verifying Service Check-In QR...'
                    : 'Point at Service QR Poster or Member Pass'
                }
              />

              {/* SERVICE QR CHECK-IN CONFIRMATION OR ERROR BANNER */}
              {scannedServiceResult && (
                <div
                  className={`p-4 rounded-3xl border space-y-3 ${
                    scannedServiceResult.ok
                      ? 'bg-emerald-950/40 border-emerald-500/40'
                      : 'bg-rose-950/40 border-rose-500/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      {scannedServiceResult.ok ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <h3 className="text-sm font-bold text-white">
                          {scannedServiceResult.ok
                            ? scannedServiceResult.alreadyCheckedIn
                              ? 'Already Checked In'
                              : 'Service Check-In Verified'
                            : 'QR Check-In Declined'}
                        </h3>
                        <p className="text-xs text-slate-200 mt-0.5">
                          {scannedServiceResult.message}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-white/10 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={handleResetScanner}
                      className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold cursor-pointer"
                    >
                      Scan Another QR
                    </button>
                    {scannedServiceResult.ok && (
                      <button
                        type="button"
                        onClick={onClose}
                        className="px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-bold cursor-pointer"
                      >
                        Done
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* SCAN RESULT CONFIRMATION CARD (when a member is scanned) */}
              {scannedMember && (
                <div className="p-4 rounded-3xl bg-emerald-950/40 border border-emerald-500/40 animate-in zoom-in-95 duration-200 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <MemberAvatar
                        src={scannedMember.imageUrl}
                        name={`${scannedMember.firstName} ${scannedMember.lastName}`}
                        initials={scannedMember.avatarInitials}
                        sizeClass="w-12 h-12 rounded-2xl"
                        textClass="font-bold text-base"
                        bgClass="bg-emerald-500/20 text-emerald-300"
                        borderClass="border-2 border-emerald-400 shadow-md"
                      />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          <h3 className="text-sm font-bold text-white">
                            {scannedMember.firstName} {scannedMember.lastName}
                          </h3>
                        </div>
                        <p className="text-xs text-emerald-300/90 font-mono tabular-nums">
                          ID: {getCanonicalMemberId(scannedMember)}
                        </p>
                        <p className="text-[11px] text-slate-300 mt-0.5">
                          {scannedMember.groupName || scannedMember.homeCellGroup || 'General'} · {scannedMember.department || 'General'}
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

              {/* REGISTERED MEMBER ROSTER SELECTOR */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-[#6D5CF2]" />
                    <span>Select Registered Member Badge:</span>
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {availableMembers.length} members in roster
                  </span>
                </div>

                {/* Quick Search, Service QR Link Paste, or Hardware QR Scanner input */}
                <div className="relative flex gap-2">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Paste Service QR link/code or search member..."
                      value={searchFilter}
                      onChange={(e) => setSearchFilter(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && searchFilter.trim()) {
                          e.preventDefault();
                          const svcPayload = parseServiceQrPayload(searchFilter, services);
                          if (svcPayload) {
                            void handleProcessServiceQr(searchFilter);
                            setSearchFilter('');
                            return;
                          }
                          const exact = findMemberByScannedId(members, searchFilter);
                          if (exact) {
                            handleProcessScan(exact);
                            setSearchFilter('');
                          } else if (availableMembers.length === 1) {
                            handleProcessScan(availableMembers[0]);
                            setSearchFilter('');
                          } else {
                            showToast(`No service QR or member found for "${searchFilter.trim()}"`);
                          }
                        }
                      }}
                      className="w-full pl-8 pr-3 py-2 text-xs rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 outline-none focus:border-[#6D5CF2]"
                    />
                  </div>
                  {parseServiceQrPayload(searchFilter, services) && (
                    <button
                      type="button"
                      onClick={() => {
                        void handleProcessServiceQr(searchFilter);
                        setSearchFilter('');
                      }}
                      className="px-3 py-2 rounded-xl bg-[#6D5CF2] hover:bg-[#5B4BE0] text-white text-xs font-bold whitespace-nowrap cursor-pointer"
                    >
                      Verify QR
                    </button>
                  )}
                </div>

                {/* Carousel of available members */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
                  {availableMembers.slice(0, 9).map((member) => {
                    const isChecked =
                      Boolean(currentService.id) &&
                      attendanceRecords.some(
                        (r) =>
                          r.personId === member.id &&
                          (r.serviceInstanceId === currentService.id ||
                            (!r.serviceInstanceId && services.length === 1))
                      );
                    return (
                      <button
                        key={member.id}
                        disabled={!hasScheduledService}
                        title={hasScheduledService ? 'Scan member badge' : checkInEligibility.message}
                        onClick={() => handleProcessScan(member)}
                        className="p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 disabled:opacity-45 disabled:cursor-not-allowed border border-white/10 text-left transition-all group cursor-pointer flex flex-col justify-between"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <MemberAvatar
                            src={member.imageUrl}
                            name={`${member.firstName} ${member.lastName}`}
                            initials={member.avatarInitials}
                            sizeClass="w-7 h-7"
                            textClass="text-[10px] font-bold"
                            bgClass="bg-[#6D5CF2]/20 text-[#8C7DFF]"
                            borderClass="border border-white/15"
                          />
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
                    {scannedSessionList.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-white/5 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span className="font-medium text-white truncate max-w-[200px]">
                            {item.label}
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
                  {passHolderName} · Member ID: {passMemberId} · {systemSettings.churchName}
                </p>
              </div>

              {/* High-contrast Scannable Digital QR Code */}
              <div className="bg-white p-4 rounded-3xl w-56 h-56 mx-auto flex items-center justify-center border-4 border-[#6D5CF2] shadow-2xl">
                <QRCodeSVG
                  value={passMemberId}
                  size={184}
                  level="H"
                  bgColor="#FFFFFF"
                  fgColor="#111827"
                  marginSize={2}
                  title={`Member ID QR Code for ${passHolderName} (${passMemberId})`}
                />
              </div>

              <div>
                <span className="text-xs font-mono font-bold text-emerald-400 tabular-nums">
                  {passMemberId}
                </span>
                <span className="block text-[11px] text-slate-400 mt-1.5">
                  Present this QR code to door stewards for on-site event registration.
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
