import React, { useState, useRef, useEffect } from 'react';
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react';
import {
  User,
  Copy,
  Check,
  Download,
  Maximize2,
  X,
  Camera,
  CheckCircle2,
  QrCode,
} from 'lucide-react';
import { Person } from '../../types/ekklesphere';

/**
 * Generates a clean, deterministic Member ID string when a member record
 * does not yet have an explicit `memberId` assigned.
 */
export function getCanonicalMemberId(
  member?: Pick<Person, 'id' | 'memberId'> | null,
  fallbackId?: string
): string {
  if (member?.memberId && member.memberId.trim().length > 0) {
    return member.memberId.trim().toUpperCase();
  }
  const raw = (member?.id || fallbackId || 'MEMBER').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (!raw || raw === 'UNLINKEDMEMBER') {
    return 'MEM-GUEST01';
  }
  return raw.startsWith('MEM') ? raw.slice(0, 12) : `MEM-${raw.slice(0, 8)}`;
}

/**
 * Resolves a Person from the church roster using a scanned QR payload or typed Member ID.
 */
export function findMemberByScannedId(members: Person[], rawInput: string): Person | undefined {
  const cleaned = rawInput.trim();
  if (!cleaned) return undefined;

  // Support both raw Member ID and structured URI/prefix formats if ever scanned
  const extracted = cleaned
    .replace(/^ekklesphere:\/\/member\//i, '')
    .replace(/^EKKLESPHERE:MEMBER:/i, '')
    .trim()
    .toUpperCase();

  return members.find((m) => {
    const canonical = getCanonicalMemberId(m).toUpperCase();
    const explicitId = (m.memberId || '').trim().toUpperCase();
    const internalId = (m.id || '').trim().toUpperCase();
    const shortLegacyId = internalId ? `MEM-${internalId.slice(0, 6)}` : '';

    return (
      canonical === extracted ||
      (explicitId.length > 0 && explicitId === extracted) ||
      (internalId.length > 0 && internalId === extracted) ||
      (shortLegacyId.length > 0 && shortLegacyId === extracted)
    );
  });
}

export interface DigitalMemberCardProps {
  memberId: string;
  fullName: string;
  photoUrl?: string | null;
  initials: string;
  churchName: string;
  campusName: string;
  groupName: string;
  department?: string;
  joinedOn?: string;
  activeServiceName: string;
  isCheckedIn: boolean;
  checkedInAt?: string;
  onUpdatePhoto?: (dataUrl: string) => Promise<void> | void;
  onOpenScanner?: () => void;
  onNotify?: (message: string) => void;
}

export const DigitalMemberCard: React.FC<DigitalMemberCardProps> = ({
  memberId,
  fullName,
  photoUrl,
  initials,
  churchName,
  campusName,
  groupName,
  department,
  joinedOn,
  activeServiceName,
  isCheckedIn,
  checkedInAt,
  onUpdatePhoto,
  onOpenScanner,
  onNotify,
}) => {
  const [imageError, setImageError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isPassModalOpen, setIsPassModalOpen] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const exportQrCanvasRef = useRef<HTMLCanvasElement>(null);

  // Reset image error whenever photoUrl changes
  useEffect(() => {
    setImageError(false);
  }, [photoUrl]);

  // Close pass modal on Escape key
  useEffect(() => {
    if (!isPassModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsPassModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPassModalOpen]);

  const validPhotoUrl = photoUrl && photoUrl.trim().length > 0 && !imageError ? photoUrl.trim() : null;

  const handleCopyMemberId = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(memberId);
      }
      setCopied(true);
      onNotify?.(`Copied Member ID ${memberId}`);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      onNotify?.(`Member ID: ${memberId}`);
    }
  };

  const handlePhotoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onUpdatePhoto) return;

    if (!file.type.startsWith('image/')) {
      onNotify?.('Please select a valid image file (JPG, PNG, or WebP).');
      return;
    }

    setIsUploadingPhoto(true);
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = async () => {
        try {
          // Resize to a crisp 256x256 square avatar so storage stays fast and compact
          const canvas = document.createElement('canvas');
          const targetSize = 256;
          canvas.width = targetSize;
          canvas.height = targetSize;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            const minSide = Math.min(img.width, img.height);
            const sx = (img.width - minSide) / 2;
            const sy = (img.height - minSide) / 2;
            ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, targetSize, targetSize);
            const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.86);
            await onUpdatePhoto(compressedDataUrl);
            setImageError(false);
            onNotify?.('Member card photo updated.');
          }
        } finally {
          setIsUploadingPhoto(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      };
      img.onerror = () => {
        setIsUploadingPhoto(false);
        onNotify?.('Unable to process selected image.');
      };
      img.src = String(reader.result);
    };
    reader.onerror = () => {
      setIsUploadingPhoto(false);
      onNotify?.('Unable to read image file.');
    };
    reader.readAsDataURL(file);
  };

  const handleDownloadCard = () => {
    const qrSourceCanvas = exportQrCanvasRef.current;
    if (!qrSourceCanvas) {
      onNotify?.('QR code is still preparing. Please try again.');
      return;
    }

    const cardCanvas = document.createElement('canvas');
    cardCanvas.width = 720;
    cardCanvas.height = 960;
    const ctx = cardCanvas.getContext('2d');
    if (!ctx) return;

    // Card Background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, cardCanvas.width, cardCanvas.height);

    // Top Header Band
    ctx.fillStyle = '#1D1B3A';
    ctx.fillRect(0, 0, cardCanvas.width, 168);

    // Subtle Accent Rule
    ctx.fillStyle = '#6D5CF2';
    ctx.fillRect(0, 168, cardCanvas.width, 8);

    // Church Title
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(churchName, cardCanvas.width / 2, 78);

    ctx.fillStyle = '#C6C8E4';
    ctx.font = '500 20px sans-serif';
    ctx.fillText(`${campusName} · Digital Member Card`, cardCanvas.width / 2, 118);

    // Member Full Name
    ctx.fillStyle = '#1D1B3A';
    ctx.font = 'bold 38px sans-serif';
    ctx.fillText(fullName, cardCanvas.width / 2, 256);

    // Fellowship / Department Meta
    ctx.fillStyle = '#5B5F7A';
    ctx.font = '500 22px sans-serif';
    const metaLine = [groupName, department].filter(Boolean).join(' · ');
    ctx.fillText(metaLine || 'Registered Congregation Member', cardCanvas.width / 2, 298);

    // QR Code Container Frame
    const qrSize = 380;
    const qrX = (cardCanvas.width - qrSize) / 2;
    const qrY = 348;

    ctx.strokeStyle = '#E3E5F2';
    ctx.lineWidth = 3;
    ctx.strokeRect(qrX - 20, qrY - 20, qrSize + 40, qrSize + 40);
    ctx.drawImage(qrSourceCanvas, qrX, qrY, qrSize, qrSize);

    // Member ID Label & Monospace Code
    ctx.fillStyle = '#5B5F7A';
    ctx.font = '600 18px sans-serif';
    ctx.fillText('Member ID', cardCanvas.width / 2, 808);

    ctx.fillStyle = '#1D1B3A';
    ctx.font = 'bold 34px monospace';
    ctx.fillText(memberId, cardCanvas.width / 2, 852);

    ctx.fillStyle = '#666A86';
    ctx.font = '500 17px sans-serif';
    ctx.fillText('Present this QR code at on-site event registration', cardCanvas.width / 2, 908);

    const dataUrl = cardCanvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `member-card-${memberId.toLowerCase()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    onNotify?.('Digital Member Card downloaded as PNG.');
  };

  const renderProfileAvatar = (size: 'card' | 'modal') => {
    const dimensions =
      size === 'modal'
        ? 'w-20 h-20 rounded-2xl'
        : 'w-20 h-20 sm:w-24 sm:h-24 rounded-2xl';

    return (
      <div className="relative shrink-0">
        {validPhotoUrl ? (
          <img
            src={validPhotoUrl}
            alt={`${fullName} profile photo`}
            referrerPolicy="no-referrer"
            onError={() => setImageError(true)}
            className={`${dimensions} object-cover border border-[#E3E5F2] dark:border-[#2D2D55] bg-slate-100 dark:bg-[#25254B]`}
          />
        ) : (
          <div
            role="img"
            aria-label={`${fullName} profile photo placeholder`}
            className={`${dimensions} bg-[#F2F3FA] dark:bg-[#25254B] border border-[#DCE0F2] dark:border-[#343463] flex flex-col items-center justify-center text-[#4F43C2] dark:text-[#A599FF] select-none`}
          >
            <User className="w-7 h-7 sm:w-8 sm:h-8 stroke-[1.8] opacity-85" />
            <span className="mt-0.5 text-[11px] font-bold tracking-tight text-[#5B5F7A] dark:text-[#C5C8E6]">
              {initials || 'MB'}
            </span>
          </div>
        )}

        {size === 'card' && onUpdatePhoto && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handlePhotoFileChange}
              className="sr-only"
              aria-label="Upload member profile photo"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingPhoto}
              title={validPhotoUrl ? 'Change profile photo' : 'Add profile photo'}
              aria-label={validPhotoUrl ? 'Change profile photo' : 'Add profile photo'}
              className="absolute -bottom-2 -right-2 w-8 h-8 rounded-xl bg-white dark:bg-[#1C1C3C] border border-[#DCE0F2] dark:border-[#3A3A6A] text-[#1D1B3A] dark:text-[#F2F2FA] hover:border-[#6D5CF2] hover:text-[#6D5CF2] dark:hover:text-[#9D90FF] shadow-xs flex items-center justify-center transition-colors cursor-pointer"
            >
              <Camera className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
    );
  };

  return (
    <>
      <section
        aria-label="Digital Member Card"
        className="bg-white dark:bg-[#1C1C3C] rounded-3xl border border-[#E3E5F2] dark:border-[#2D2D55] shadow-xs overflow-hidden"
      >
        {/* Credential Header Bar */}
        <div className="px-5 sm:px-7 py-3.5 bg-[#F8F9FD] dark:bg-[#171733] border-b border-[#E3E5F2] dark:border-[#2D2D55] flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs text-[#5B5F7A] dark:text-[#A9ACC8] min-w-0">
            <span className="font-semibold text-[#1D1B3A] dark:text-[#F2F2FA] truncate">
              {churchName}
            </span>
            <span aria-hidden="true">·</span>
            <span className="truncate">{campusName}</span>
            <span className="hidden sm:inline" aria-hidden="true">
              ·
            </span>
            <span className="hidden sm:inline">Digital Member Card</span>
          </div>

          <div className="flex items-center gap-1.5 text-xs">
            {isCheckedIn ? (
              <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>
                  Checked in for {activeServiceName}
                  {checkedInAt ? ` · ${checkedInAt}` : ''}
                </span>
              </span>
            ) : (
              <span className="text-[#5B5F7A] dark:text-[#A9ACC8]">
                Active event: <strong className="font-semibold text-[#1D1B3A] dark:text-[#F2F2FA]">{activeServiceName}</strong>
              </span>
            )}
          </div>
        </div>

        {/* Main 2-Zone Credential Body */}
        <div className="p-5 sm:p-7 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-center">
          {/* Left Zone: Photo, Name, Member ID, Metadata & Actions */}
          <div className="lg:col-span-7 flex flex-col justify-between space-y-5 min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-5">
              {renderProfileAvatar('card')}

              <div className="min-w-0 flex-1 space-y-1.5">
                <p className="text-xs font-medium text-[#5B5F7A] dark:text-[#A9ACC8]">
                  Registered Member Pass
                </p>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1D1B3A] dark:text-[#F2F2FA] truncate">
                  {fullName}
                </h2>

                {/* Member ID Row */}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-0.5">
                  <span className="text-xs text-[#5B5F7A] dark:text-[#A9ACC8]">Member ID</span>
                  <span className="font-mono font-bold text-sm sm:text-base text-[#1D1B3A] dark:text-[#F2F2FA] tabular-nums tracking-tight">
                    {memberId}
                  </span>
                </div>

                {/* Clean Unboxed Metadata */}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#5B5F7A] dark:text-[#A9ACC8] pt-0.5">
                  <span>{groupName}</span>
                  {department && department !== groupName && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{department}</span>
                    </>
                  )}
                  {joinedOn && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">Member since {joinedOn}</span>
                    </>
                  )}
                  {!validPhotoUrl && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>Placeholder photo active</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Ergonomic Touch Actions (>= 44px targets, single-line labels) */}
            <div className="pt-2 border-t border-[#E3E5F2] dark:border-[#2D2D55] flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => setIsPassModalOpen(true)}
                className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[#6D5CF2] hover:bg-[#5B4BE0] text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer whitespace-nowrap shrink-0 shadow-xs"
              >
                <Maximize2 className="w-4 h-4 shrink-0" />
                <span>Present at Door</span>
              </button>

              <button
                type="button"
                onClick={handleCopyMemberId}
                className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[#F4F5FB] dark:bg-white/5 hover:bg-[#E9ECF8] dark:hover:bg-white/10 text-[#1D1B3A] dark:text-[#F2F2FA] border border-[#E3E5F2] dark:border-[#2D2D55] text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>Copied ID</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-[#5B5F7A] dark:text-[#A9ACC8] shrink-0" />
                    <span>Copy Member ID</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleDownloadCard}
                className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[#F4F5FB] dark:bg-white/5 hover:bg-[#E9ECF8] dark:hover:bg-white/10 text-[#1D1B3A] dark:text-[#F2F2FA] border border-[#E3E5F2] dark:border-[#2D2D55] text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Download className="w-4 h-4 text-[#5B5F7A] dark:text-[#A9ACC8] shrink-0" />
                <span>Save Card</span>
              </button>

              {onOpenScanner && (
                <button
                  type="button"
                  onClick={onOpenScanner}
                  className="min-h-[44px] px-3.5 py-2.5 rounded-xl text-[#6D5CF2] dark:text-[#9D90FF] hover:bg-[#6D5CF2]/10 text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <QrCode className="w-4 h-4 shrink-0" />
                  <span>Open Scanner</span>
                </button>
              )}
            </div>
          </div>

          {/* Right Zone: High-Contrast Optical QR Scan Pad */}
          <div className="lg:col-span-5 flex flex-col items-center lg:items-end justify-center">
            <div className="w-full sm:w-auto flex flex-col items-center p-4 sm:p-5 rounded-2xl bg-[#F8F9FD] dark:bg-[#15152E] border border-[#E3E5F2] dark:border-[#2D2D55]">
              {/* Pure White Quiet-Zone Pad for Instant Camera & Hardware QR Reads */}
              <button
                type="button"
                onClick={() => setIsPassModalOpen(true)}
                aria-label={`Enlarge scannable QR code for Member ID ${memberId}`}
                className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs hover:shadow-md transition-shadow cursor-pointer focus-visible:outline-2 focus-visible:outline-[#6D5CF2] focus-visible:outline-offset-2"
              >
                <QRCodeSVG
                  value={memberId}
                  size={164}
                  level="H"
                  bgColor="#FFFFFF"
                  fgColor="#111827"
                  marginSize={2}
                  title={`Member ID QR code for ${fullName} (${memberId})`}
                />
              </button>

              <div className="mt-3 text-center space-y-0.5">
                <p className="font-mono font-bold text-xs text-[#1D1B3A] dark:text-[#F2F2FA] tabular-nums">
                  {memberId}
                </p>
                <p className="text-[11px] text-[#5B5F7A] dark:text-[#A9ACC8]">
                  Scan at door for instant event check-in
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Offscreen High-Res QR Canvas for PNG Download */}
        <div className="sr-only" aria-hidden="true">
          <QRCodeCanvas
            ref={exportQrCanvasRef}
            value={memberId}
            size={512}
            level="H"
            bgColor="#FFFFFF"
            fgColor="#111827"
            marginSize={3}
          />
        </div>
      </section>

      {/* Full-Screen High-Contrast Event Registration Pass Modal */}
      {isPassModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="On-Site Event Registration Pass"
          onClick={() => setIsPassModalOpen(false)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white text-[#1D1B3A] rounded-3xl shadow-2xl border border-slate-200 overflow-hidden"
          >
            {/* Top Bar */}
            <div className="px-5 py-4 bg-[#1D1B3A] text-white flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-slate-300 truncate">{churchName}</p>
                <h3 className="text-base font-bold truncate">On-Site Event Registration Pass</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsPassModalOpen(false)}
                aria-label="Close registration pass"
                className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Pass Content (Always High-Brightness White Surface for Door Scanners) */}
            <div className="p-6 flex flex-col items-center text-center space-y-5">
              <div className="flex items-center gap-3.5 w-full text-left pb-4 border-b border-slate-200">
                {renderProfileAvatar('modal')}
                <div className="min-w-0 flex-1">
                  <h4 className="text-lg font-bold text-[#1D1B3A] truncate">{fullName}</h4>
                  <p className="font-mono font-bold text-sm text-[#4F43C2] tabular-nums mt-0.5">
                    {memberId}
                  </p>
                  <p className="text-xs text-[#5B5F7A] truncate mt-0.5">
                    {groupName} · {campusName}
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-white border-2 border-slate-200 shadow-xs">
                <QRCodeSVG
                  value={memberId}
                  size={232}
                  level="H"
                  bgColor="#FFFFFF"
                  fgColor="#0F172A"
                  marginSize={2}
                  title={`Member ID QR Code: ${memberId}`}
                />
              </div>

              <div className="space-y-1">
                <p className="text-xs font-semibold text-[#1D1B3A]">
                  Event: {activeServiceName}
                </p>
                <p className="text-xs text-[#5B5F7A]">
                  Hold steady toward the usher camera or barcode scanner
                </p>
              </div>

              <div className="w-full pt-2 grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={handleDownloadCard}
                  className="min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#1D1B3A] text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-4 h-4 shrink-0" />
                  <span>Save PNG</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsPassModalOpen(false)}
                  className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[#6D5CF2] hover:bg-[#5B4BE0] text-white text-xs font-semibold flex items-center justify-center transition-colors cursor-pointer whitespace-nowrap"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
