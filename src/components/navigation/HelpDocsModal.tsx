import React, { useEffect } from 'react';
import { useEkklesphere } from '../../context/EkklesphereContext';
import {
  X,
  ShieldCheck,
  Radio,
  QrCode,
  Users,
  Smartphone,
  Lock,
  FileText,
  CheckCircle2,
} from 'lucide-react';

export const HelpDocsModal: React.FC = () => {
  const { isHelpModalOpen, setIsHelpModalOpen, systemSettings } = useEkklesphere();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isHelpModalOpen) {
        setIsHelpModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isHelpModalOpen, setIsHelpModalOpen]);

  if (!isHelpModalOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-2xl max-h-[85vh] bg-white dark:bg-[#1A1A3A] rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden text-[#1D1B3A] dark:text-[#F2F2FA]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-[#6D5CF2] dark:text-[#8C7DFF] flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h2 id="help-modal-title" className="text-base font-bold">
                Ekklesphere Documentation & Guide
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {systemSettings.churchName} · Operating System Architecture
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsHelpModalOpen(false)}
            aria-label="Close documentation dialog"
            className="w-8 h-8 rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 hover:text-slate-600 dark:hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 text-xs text-slate-600 dark:text-slate-300">
          {/* Section 1: Act 843 Privacy */}
          <div className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 space-y-2">
            <div className="flex items-center gap-2 font-bold text-emerald-800 dark:text-emerald-300">
              <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>Ghana Data Protection Act (Act 843) Compliance</span>
            </div>
            <p className="leading-relaxed text-emerald-900/90 dark:text-emerald-200/90">
              Under Act 843, church membership signifies religious belief, making it special personal data. Ekklesphere strictly enforces location privacy by design:
            </p>
            <ul className="space-y-1 list-disc list-inside text-emerald-800/90 dark:text-emerald-300/90">
              <li>Raw GPS traces are never uploaded or tracked away from church premises.</li>
              <li>Only entrance arrival signals are verified against the active service window.</li>
              <li>Members can revoke automated check-in consent at any time in one tap.</li>
            </ul>
          </div>

          {/* Section 2: Proximity Pipeline */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 font-bold text-sm text-[#1D1B3A] dark:text-[#F2F2FA]">
              <Radio className="w-4 h-4 text-[#6D5CF2]" />
              <span>How Proximity Auto Check-In Operates</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#14142E] border border-slate-200/80 dark:border-slate-800">
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-500 block mb-1">
                  1. 300m Outer Ring
                </span>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  OS geofence wakes the app upon campus approach inside the active service window.
                </p>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#14142E] border border-slate-200/80 dark:border-slate-800">
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-500 block mb-1">
                  2. 100m Dwell Check
                </span>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  A 5-minute dwell filter confirms presence so drive-by traffic is not counted.
                </p>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#14142E] border border-slate-200/80 dark:border-slate-800">
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-500 block mb-1">
                  3. BLE Beacon Sighting
                </span>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Entrance door Bluetooth beacon delivers high-confidence immediate check-in.
                </p>
              </div>
            </div>
          </div>

          {/* Section 3: Usher Station */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 font-bold text-sm text-[#1D1B3A] dark:text-[#F2F2FA]">
              <QrCode className="w-4 h-4 text-amber-500" />
              <span>Usher Door PWA & Offline Queue</span>
            </div>
            <p className="leading-relaxed">
              Door stewards can scan member QR cards or search attendees by phone number. When network connectivity drops, check-ins are queued locally with cryptographic UUIDs and automatically synchronized once reconnected.
            </p>
          </div>

          {/* Section 4: Roles & Access Control */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 font-bold text-sm text-[#1D1B3A] dark:text-[#F2F2FA]">
              <Lock className="w-4 h-4 text-indigo-500" />
              <span>Role-Based Access Control (RBAC)</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#14142E] border border-slate-200/80 dark:border-slate-800 space-y-1.5 text-[11px]">
              <div>
                <b className="text-slate-700 dark:text-slate-200">Pastor / Admin:</b> Full access to attendance analytics, pastoral care follow-up workflows, and message broadcasts.
              </div>
              <div>
                <b className="text-slate-700 dark:text-slate-200">Usher:</b> Door search, visitor onboarding, offline sync, and real-time attendance counter.
              </div>
              <div>
                <b className="text-slate-700 dark:text-slate-200">Member:</b> Personal QR badge, automated check-in consent toggle, event RSVPs, and Mobile Money tithe giving.
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 bg-slate-50 dark:bg-[#14142E] border-t border-slate-200 dark:border-slate-800 flex justify-end">
          <button
            onClick={() => setIsHelpModalOpen(false)}
            className="px-4 py-2 rounded-xl bg-[#6D5CF2] hover:bg-[#5A48DE] text-white text-xs font-bold transition-all shadow-sm"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
