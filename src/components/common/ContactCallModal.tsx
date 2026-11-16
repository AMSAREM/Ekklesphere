import React, { useEffect, useState } from 'react';
import {
  PhoneCall,
  Copy,
  Check,
  X,
  Mail,
  MessageSquare,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { buildTelHref, formatPhoneForDisplay, normalizeDialablePhone } from '../../utils/phoneCall';

export interface ContactCallModalProps {
  isOpen: boolean;
  onClose: () => void;
  contactName: string;
  contactPhone?: string | null;
  contactEmail?: string | null;
  contactRole?: string | null;
  contactGroup?: string | null;
  onLogOutcome?: (outcome: string, markResolved: boolean) => void | Promise<void>;
  onTriggerSms?: () => void;
}

const QUICK_CALL_OUTCOMES = [
  { label: 'Answered · Spoken with member', resolve: true },
  { label: 'No answer · Left voicemail / will retry', resolve: false },
  { label: 'Requested pastoral visit / callback', resolve: false },
  { label: 'Excused absence (travelling / unwell)', resolve: true },
] as const;

export const ContactCallModal: React.FC<ContactCallModalProps> = ({
  isOpen,
  onClose,
  contactName,
  contactPhone,
  contactEmail,
  contactRole,
  contactGroup,
  onLogOutcome,
  onTriggerSms,
}) => {
  const [copied, setCopied] = useState(false);
  const [selectedOutcome, setSelectedOutcome] = useState<string>(QUICK_CALL_OUTCOMES[0].label);
  const [markResolved, setMarkResolved] = useState<boolean>(true);
  const [customOutcome, setCustomOutcome] = useState('');
  const [isSubmittingOutcome, setIsSubmittingOutcome] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setCopied(false);
    setSelectedOutcome(QUICK_CALL_OUTCOMES[0].label);
    setMarkResolved(true);
    setCustomOutcome('');
    setIsSubmittingOutcome(false);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const normalizedPhone = normalizeDialablePhone(contactPhone);
  const telHref = buildTelHref(contactPhone);
  const displayPhone = formatPhoneForDisplay(contactPhone);

  const handleCopyPhone = async () => {
    if (!normalizedPhone && !contactPhone) return;
    try {
      await navigator.clipboard.writeText(normalizedPhone || String(contactPhone));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard fallback silently ignored in restricted contexts
    }
  };

  const handleSaveOutcome = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onLogOutcome) return;
    const finalOutcome = (customOutcome.trim() || selectedOutcome).trim();
    if (!finalOutcome) return;
    setIsSubmittingOutcome(true);
    try {
      await onLogOutcome(finalOutcome, markResolved);
      onClose();
    } finally {
      setIsSubmittingOutcome(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="contact-call-modal-title"
      onClick={onClose}
      className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl border border-[#E9EBF5] dark:border-[#2D2D55] shadow-2xl overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-[#E9EBF5] dark:border-[#2D2D55] flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3
              id="contact-call-modal-title"
              className="text-base font-bold text-[#1D1B3A] dark:text-[#F2F2FA] truncate"
            >
              Call {contactName}
            </h3>
            <p className="text-xs text-[#666A86] dark:text-[#A9ACC8] truncate">
              {[contactRole, contactGroup].filter(Boolean).join(' · ') || 'Congregation Contact'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close call dialog"
            className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-[#666A86] dark:text-[#A9ACC8] flex items-center justify-center cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Phone dial box */}
          <div className="p-4 rounded-2xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#666A86] dark:text-[#A9ACC8] block">
                  Direct Telephone
                </span>
                <span className="font-mono text-lg font-bold text-[#1D1B3A] dark:text-[#F2F2FA] tabular-nums break-all">
                  {displayPhone}
                </span>
              </div>
              {telHref && (
                <button
                  type="button"
                  onClick={handleCopyPhone}
                  className="min-h-[38px] px-3 py-1.5 rounded-xl bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-xs font-semibold text-[#1D1B3A] dark:text-[#F2F2FA] hover:border-[#6D5CF2] flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-[#6D5CF2]" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {telHref ? (
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={telHref}
                  className="flex-1 min-h-[42px] px-4 py-2.5 rounded-xl bg-[#6D5CF2] hover:bg-[#5B4BE0] text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors shadow-xs"
                >
                  <PhoneCall className="w-4 h-4" />
                  <span>Dial {normalizedPhone} Now</span>
                </a>
                {onTriggerSms && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onTriggerSms();
                    }}
                    className="min-h-[42px] px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] hover:border-[#6D5CF2] flex items-center gap-1.5 cursor-pointer"
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-[#6D5CF2]" />
                    <span>SMS</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  No dialable phone number is on file for {contactName}. Add a phone number in Member Directory to call directly.
                </span>
              </div>
            )}

            {contactEmail && (
              <a
                href={`mailto:${contactEmail}`}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[#6D5CF2] dark:text-[#9D90FF] hover:underline"
              >
                <Mail className="w-3.5 h-3.5" />
                <span>{contactEmail}</span>
              </a>
            )}
          </div>

          {/* Pastoral Outcome Logging (when rendered for a Follow-up Task) */}
          {onLogOutcome && (
            <form onSubmit={handleSaveOutcome} className="space-y-3 pt-1">
              <div className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                Record Pastoral Call Outcome
              </div>
              <div className="space-y-1.5">
                {QUICK_CALL_OUTCOMES.map((opt) => (
                  <label
                    key={opt.label}
                    className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-xs cursor-pointer transition-colors ${
                      selectedOutcome === opt.label && !customOutcome.trim()
                        ? 'border-[#6D5CF2] bg-[#EFEDFF]/60 dark:bg-[#2A2A55]/60 text-[#1D1B3A] dark:text-[#F2F2FA] font-semibold'
                        : 'border-[#E9EBF5] dark:border-[#2D2D55] text-[#666A86] dark:text-[#A9ACC8]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="call-outcome"
                      checked={selectedOutcome === opt.label}
                      onChange={() => {
                        setSelectedOutcome(opt.label);
                        setMarkResolved(opt.resolve);
                      }}
                      className="text-[#6D5CF2] focus:ring-[#6D5CF2]"
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>

              <input
                type="text"
                value={customOutcome}
                onChange={(e) => setCustomOutcome(e.target.value)}
                placeholder="Or enter a custom pastoral call note..."
                className="w-full min-h-[40px] px-3 py-2 text-xs rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
              />

              <label className="flex items-center gap-2 text-xs text-[#666A86] dark:text-[#A9ACC8] cursor-pointer">
                <input
                  type="checkbox"
                  checked={markResolved}
                  onChange={(e) => setMarkResolved(e.target.checked)}
                  className="rounded text-[#6D5CF2] focus:ring-[#6D5CF2]"
                />
                <span>Mark this care assignment as resolved</span>
              </label>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 min-h-[40px] rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] text-xs font-bold text-[#666A86] dark:text-[#A9ACC8] cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingOutcome}
                  className="flex-1 min-h-[40px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isSubmittingOutcome ? 'Saving...' : 'Save Call Outcome'}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
