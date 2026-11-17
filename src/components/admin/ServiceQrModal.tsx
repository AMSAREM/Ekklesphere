import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  QrCode,
  Download,
  Copy,
  Check,
  Printer,
  RefreshCw,
  AlertCircle,
  Clock,
} from 'lucide-react';
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react';
import { useEkklesphere } from '../../context/EkklesphereContext';
import { buildServiceQrCheckInUrl, formatServiceShortCode } from '../../utils/serviceQr';

export interface ServiceQrTarget {
  id: string;
  name: string;
  date?: string;
  startsAt?: string;
  endsAt?: string;
  dwellMinutes?: number;
  status?: string;
}

interface ServiceQrModalProps {
  isOpen: boolean;
  service: ServiceQrTarget | null;
  onClose: () => void;
}

interface ServerQrMetadata {
  serviceId: string;
  serviceName: string;
  date?: string;
  allowanceMinutes?: number;
  status: 'live' | 'closed';
  closesAtIso?: string | null;
  organizationId: string;
  shortCode: string;
  qrToken: string;
  qrPayload: string;
  checkInPath: string;
  checkInUrl: string;
}

function formatReadableDate(isoDate?: string): string {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate || 'Scheduled Service';
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return isoDate;
  return dt.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export const ServiceQrModal: React.FC<ServiceQrModalProps> = ({
  isOpen,
  service,
  onClose,
}) => {
  const { currentUser, systemSettings, showToast } = useEkklesphere();
  const [qrMeta, setQrMeta] = useState<ServerQrMetadata | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedPayload, setCopiedPayload] = useState(false);
  const canvasWrapperRef = useRef<HTMLDivElement>(null);

  const fetchServiceQr = async (serviceId: string) => {
    const token =
      currentUser?.token ||
      (typeof window !== 'undefined' ? localStorage.getItem('ekklesphere_token') : null);
    if (!token) {
      setErrorMsg('Authentication token unavailable. Please sign in again.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/events/${encodeURIComponent(serviceId)}/qr`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(data?.message || `Could not load service QR code (HTTP ${res.status}).`);
        setQrMeta(null);
        return;
      }
      setQrMeta(data as ServerQrMetadata);
    } catch {
      setErrorMsg('Network error while generating signed service QR code.');
      setQrMeta(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen || !service?.id) {
      setQrMeta(null);
      setErrorMsg(null);
      setCopiedLink(false);
      setCopiedPayload(false);
      return;
    }
    void fetchServiceQr(service.id);
  }, [isOpen, service?.id]);

  if (!isOpen || !service) return null;

  const tenantName = (
    systemSettings.churchName ||
    currentUser?.organizationName ||
    'Ekklesphere'
  ).trim();
  const campusName = (systemSettings.campusName || '').trim();
  const displayStatus = qrMeta?.status || (service.status === 'closed' || service.status === 'cancelled' ? 'closed' : 'live');
  const shortCode = qrMeta?.shortCode || formatServiceShortCode(service.id);
  const effectiveUrl = qrMeta?.qrToken
    ? buildServiceQrCheckInUrl({
        origin: typeof window !== 'undefined' ? window.location.origin : '',
        serviceId: service.id,
        qrToken: qrMeta.qrToken,
        organizationId: qrMeta.organizationId,
      })
    : '';

  const timeRange =
    service.startsAt && service.endsAt
      ? `${service.startsAt} – ${service.endsAt}`
      : service.startsAt || '';
  const dateLabel = formatReadableDate(qrMeta?.date || service.date);

  const handleCopyLink = async () => {
    if (!effectiveUrl) return;
    try {
      await navigator.clipboard.writeText(effectiveUrl);
      setCopiedLink(true);
      showToast(`Check-in link copied for ${service.name}`);
      window.setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      showToast('Clipboard access unavailable — use Download Poster or scan directly.');
    }
  };

  const handleCopyPayload = async () => {
    const payloadValue = qrMeta?.qrPayload || effectiveUrl;
    if (!payloadValue) return;
    try {
      await navigator.clipboard.writeText(payloadValue);
      setCopiedPayload(true);
      showToast(`Signed QR code copied for ${service.name}`);
      window.setTimeout(() => setCopiedPayload(false), 2500);
    } catch {
      showToast('Clipboard access unavailable — copy the check-in link instead.');
    }
  };

  const handleDownloadPoster = () => {
    if (!effectiveUrl) return;
    const qrCanvas = canvasWrapperRef.current?.querySelector('canvas');
    if (!qrCanvas) {
      showToast('QR code canvas not ready yet.');
      return;
    }

    const width = 760;
    const height = 980;
    const outCanvas = document.createElement('canvas');
    outCanvas.width = width;
    outCanvas.height = height;
    const ctx = outCanvas.getContext('2d');
    if (!ctx) return;

    // Background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);

    // Top dark header
    ctx.fillStyle = '#1D1B3A';
    ctx.fillRect(0, 0, width, 200);

    // Tenant name
    ctx.fillStyle = '#C4BDFF';
    ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(tenantName.toUpperCase(), width / 2, 62);

    // Service title
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 34px system-ui, -apple-system, sans-serif';
    const titleText = service.name.length > 34 ? `${service.name.slice(0, 32)}…` : service.name;
    ctx.fillText(titleText, width / 2, 118);

    // Schedule line
    ctx.fillStyle = '#D6D9EC';
    ctx.font = '600 19px system-ui, -apple-system, sans-serif';
    const metaLine = [dateLabel, timeRange, campusName].filter(Boolean).join('  ·  ');
    ctx.fillText(metaLine.slice(0, 62), width / 2, 160);

    // QR quiet frame
    ctx.strokeStyle = '#E3E5F2';
    ctx.lineWidth = 4;
    ctx.strokeRect(140, 248, 480, 480);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(142, 250, 476, 476);

    // Draw crisp high-res QR code
    ctx.drawImage(qrCanvas, 170, 278, 420, 420);

    // Instructions & Code footer
    ctx.fillStyle = '#1D1B3A';
    ctx.font = 'bold 26px system-ui, -apple-system, sans-serif';
    ctx.fillText('Scan to Check In', width / 2, 792);

    ctx.fillStyle = '#5B5F7A';
    ctx.font = '500 18px system-ui, -apple-system, sans-serif';
    ctx.fillText(
      'Open your phone camera or the Ekklesphere member scanner',
      width / 2,
      830
    );

    ctx.fillStyle = '#6D5CF2';
    ctx.font = 'bold 22px ui-monospace, SFMono-Regular, monospace';
    ctx.fillText(shortCode, width / 2, 886);

    ctx.fillStyle = '#8F93AD';
    ctx.font = '500 14px system-ui, -apple-system, sans-serif';
    ctx.fillText('Signed attendance check-in pass · Verified at entrance', width / 2, 932);

    const pngUrl = outCanvas.toDataURL('image/png');
    const slug = service.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    const link = document.createElement('a');
    link.download = `${slug || 'service'}-checkin-qr.png`;
    link.href = pngUrl;
    link.click();
    showToast(`Downloaded Check-In QR poster for ${service.name}`);
  };

  const handlePrint = () => {
    if (typeof window !== 'undefined' && typeof window.print === 'function') {
      window.print();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="service-qr-modal-title"
    >
      <div className="w-full max-w-md bg-white dark:bg-[#1D1D3D] rounded-3xl border border-[#E9EBF5] dark:border-[#2D2D55] shadow-2xl overflow-hidden flex flex-col max-h-[92dvh]">
        {/* Header */}
        <div className="px-5 py-4 bg-[#1D1B3A] text-white flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-[#C4BDFF] truncate">
              {tenantName}
              {campusName && campusName.toLowerCase() !== tenantName.toLowerCase()
                ? ` · ${campusName}`
                : ''}
            </p>
            <h3
              id="service-qr-modal-title"
              className="text-base font-bold tracking-tight text-white truncate mt-0.5"
            >
              {service.name}
            </h3>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-white/80 mt-0.5 tabular-nums">
              <span>{dateLabel}</span>
              {timeRange && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{timeRange}</span>
                </>
              )}
              <span aria-hidden="true">·</span>
              <span
                className={
                  displayStatus === 'live' ? 'text-emerald-300 font-semibold' : 'text-amber-300 font-semibold'
                }
              >
                {displayStatus === 'live' ? 'Live Check-In Open' : 'Window Closed'}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Service QR Modal"
            className="p-2 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {displayStatus !== 'live' && (
            <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/35 border border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-2">
              <Clock className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
              <span>
                This service is currently outside its live check-in window. Scans will be accepted once it is Live.
              </span>
            </div>
          )}

          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-xs text-[#666A86] dark:text-[#A9ACC8]">
              <div className="w-8 h-8 rounded-full border-2 border-[#6D5CF2] border-t-transparent animate-spin" />
              <span>Generating signed service check-in QR code...</span>
            </div>
          ) : errorMsg ? (
            <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-rose-800 dark:text-rose-200 text-xs space-y-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
                <span>{errorMsg}</span>
              </div>
              <button
                type="button"
                onClick={() => void fetchServiceQr(service.id)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry</span>
              </button>
            </div>
          ) : effectiveUrl ? (
            <>
              {/* High-contrast crisp white quiet-zone QR card */}
              <div className="bg-white p-5 rounded-3xl border border-[#E9EBF5] shadow-sm flex flex-col items-center text-center">
                <QRCodeSVG
                  value={effectiveUrl}
                  size={224}
                  level="H"
                  bgColor="#FFFFFF"
                  fgColor="#111827"
                  marginSize={2}
                  title={`Service check-in QR code for ${service.name}`}
                />
                <div className="mt-3 pt-3 border-t border-slate-100 w-full flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-medium">Staff Ref Code</span>
                  <span className="font-mono font-bold text-[#1D1B3A] tabular-nums">
                    {shortCode}
                  </span>
                </div>
              </div>

              {/* Hidden high-resolution canvas used strictly for downloadable PNG poster */}
              <div ref={canvasWrapperRef} className="hidden" aria-hidden="true">
                <QRCodeCanvas
                  value={effectiveUrl}
                  size={420}
                  level="H"
                  bgColor="#FFFFFF"
                  fgColor="#111827"
                  marginSize={2}
                />
              </div>

              <p className="text-xs text-[#666A86] dark:text-[#A9ACC8] text-center leading-relaxed">
                Members can scan this QR code with their phone camera or inside any Ekklesphere Check-In Scanner to mark attendance for{' '}
                <span className="font-semibold text-[#1D1B3A] dark:text-[#F2F2FA]">
                  {service.name}
                </span>
                .
              </p>

              {/* Check-in Link & Signed Code Copy Controls */}
              <div className="p-2.5 rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-mono text-[#666A86] dark:text-[#A9ACC8] truncate flex-1 min-w-[140px]">
                  {effectiveUrl}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={handleCopyPayload}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[11px] font-semibold text-[#1D1B3A] dark:text-[#F2F2FA] hover:border-[#6D5CF2] cursor-pointer whitespace-nowrap shrink-0"
                  >
                    {copiedPayload ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-500" />
                        <span>Code Copied</span>
                      </>
                    ) : (
                      <>
                        <QrCode className="w-3 h-3 text-[#6D5CF2]" />
                        <span>Copy Code</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[11px] font-semibold text-[#1D1B3A] dark:text-[#F2F2FA] hover:border-[#6D5CF2] cursor-pointer whitespace-nowrap shrink-0"
                  >
                    {copiedLink ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-500" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3 text-[#6D5CF2]" />
                        <span>Copy Link</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 border-t border-[#E9EBF5] dark:border-[#2D2D55] bg-[#F8F9FD] dark:bg-[#14142E] flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            disabled={!effectiveUrl}
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] bg-white dark:bg-[#1D1D3D] text-xs font-semibold text-[#1D1B3A] dark:text-[#F2F2FA] hover:border-[#6D5CF2]/60 disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Printer className="w-3.5 h-3.5 text-[#6D5CF2]" />
            <span>Print</span>
          </button>

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              disabled={!effectiveUrl}
              onClick={handleDownloadPoster}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#6D5CF2] hover:bg-[#5B4BE0] disabled:opacity-50 text-white text-xs font-bold cursor-pointer whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Poster PNG</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
