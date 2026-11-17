import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Download,
  Share,
  PlusSquare,
  Smartphone,
  Monitor,
  ExternalLink,
  X,
  CheckCircle2,
} from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';

export type PWAInstallVariant = 'header' | 'menu' | 'landing' | 'landing-mobile' | 'auth' | 'card';

interface PWAInstallButtonProps {
  variant?: PWAInstallVariant;
  className?: string;
  onActionComplete?: () => void;
  onInstalled?: () => void;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  variant = 'header',
  className = '',
  onActionComplete,
  onInstalled,
}) => {
  const { isInstallable, isInstalled, isIOS, isInIframe, promptInstall } = usePWAInstall();
  const [showInstructionsModal, setShowInstructionsModal] = useState(false);

  // Hide once the app is already running in standalone installed mode
  if (isInstalled) {
    return null;
  }

  const handleInstallClick = async () => {
    if (isInstallable) {
      const result = await promptInstall();
      onActionComplete?.();
      if (result.outcome === 'accepted') {
        onInstalled?.();
      }
      return;
    }

    setShowInstructionsModal(true);
  };

  const renderTrigger = () => {
    switch (variant) {
      case 'menu':
        return (
          <button
            type="button"
            onClick={handleInstallClick}
            className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-[#6D5CF2] dark:text-[#A594FD] hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-all cursor-pointer ${className}`}
          >
            <span className="flex items-center gap-2">
              <Download className="w-3.5 h-3.5 shrink-0" />
              <span>Install App</span>
            </span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#6D5CF2]/10 text-[#6D5CF2] dark:text-[#A594FD]">
              {isInstallable ? 'Ready' : 'App'}
            </span>
          </button>
        );

      case 'landing':
        return (
          <button
            type="button"
            onClick={handleInstallClick}
            title="Install Ekklesphere App on your device"
            aria-label="Install Ekklesphere App"
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[#0b1f33]/20 bg-[#fffdf9]/80 px-3.5 py-2 text-xs font-bold text-[#0b1f33] shadow-xs transition-all hover:-translate-y-0.5 hover:border-[#0b1f33]/40 hover:bg-white cursor-pointer ${className}`}
          >
            <Download className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>Install App</span>
          </button>
        );

      case 'landing-mobile':
        return (
          <button
            type="button"
            onClick={handleInstallClick}
            className={`inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[#0b1f33]/25 bg-[#fffdf9] px-4 py-2 text-xs font-bold text-[#0b1f33] cursor-pointer ${className}`}
          >
            <Download className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>Install App</span>
          </button>
        );

      case 'auth':
        return (
          <button
            type="button"
            onClick={handleInstallClick}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#6D5CF2]/10 hover:bg-[#6D5CF2]/20 dark:bg-white/10 dark:hover:bg-white/20 border border-[#6D5CF2]/25 dark:border-white/20 text-[11px] font-bold text-[#5A48DE] dark:text-white transition-colors cursor-pointer whitespace-nowrap ${className}`}
          >
            <Download className="w-3.5 h-3.5 shrink-0" />
            <span>Install App</span>
          </button>
        );

      case 'card':
        return (
          <div
            className={`bg-gradient-to-br from-[#6D5CF2]/10 via-indigo-50/80 to-white dark:from-[#262152] dark:via-[#1C1C3C] dark:to-[#1C1C3C] rounded-3xl p-5 border border-[#6D5CF2]/25 dark:border-[#6D5CF2]/40 shadow-sm space-y-3 ${className}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#6D5CF2] text-white flex items-center justify-center shadow-md shadow-indigo-500/25 shrink-0">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] uppercase tracking-wide">
                    Install Ekklesphere App
                  </h2>
                  <p className="text-[11px] text-[#5B5F7A] dark:text-[#A9ACC8] mt-0.5">
                    Add to your home screen for one-tap sanctuary check-in and instant alerts.
                  </p>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleInstallClick}
              className="w-full py-2.5 rounded-2xl text-xs font-bold bg-[#6D5CF2] hover:bg-[#5b4be0] text-white flex items-center justify-center gap-2 shadow-md shadow-indigo-500/20 transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>{isIOS ? 'Add to iPhone Home Screen' : 'Install App on This Device'}</span>
            </button>
          </div>
        );

      case 'header':
      default:
        return (
          <button
            type="button"
            onClick={handleInstallClick}
            title="Install Ekklesphere App"
            aria-label="Install Ekklesphere App"
            className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-[#6D5CF2]/10 hover:bg-[#6D5CF2]/20 dark:bg-[#6D5CF2]/25 dark:hover:bg-[#6D5CF2]/35 border border-[#6D5CF2]/25 text-xs font-bold text-[#5A48DE] dark:text-[#A594FD] transition-colors cursor-pointer shrink-0 ${className}`}
          >
            <Download className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">Install App</span>
          </button>
        );
    }
  };

  const currentUrl = typeof window !== 'undefined' ? window.location.href : '/';

  const modal =
    showInstructionsModal && typeof document !== 'undefined'
      ? createPortal(
          <div
            data-pwa-install-modal="true"
            className="fixed inset-0 z-[120] bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pwa-install-modal-title"
          >
            <div className="w-full max-w-md rounded-3xl bg-white dark:bg-[#14142E] border border-[#E3E5F2] dark:border-[#2D2D55] shadow-2xl overflow-hidden text-[#1D1B3A] dark:text-[#F2F2FA]">
              <div className="flex items-center justify-between px-5 py-4 border-b border-[#E9EBF5] dark:border-[#2D2D55] bg-[#F8F9FD] dark:bg-[#1A1A3A]">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-[#6D5CF2] text-white flex items-center justify-center shadow-sm">
                    {isIOS ? <Smartphone className="w-4 h-4" /> : <Download className="w-4 h-4" />}
                  </div>
                  <div>
                    <h3 id="pwa-install-modal-title" className="text-sm font-bold">
                      {isIOS ? 'Install on iPhone / iPad' : 'Install Ekklesphere App'}
                    </h3>
                    <p className="text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
                      Fast standalone access from your home screen or desktop
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowInstructionsModal(false);
                    onActionComplete?.();
                  }}
                  aria-label="Close install instructions"
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-[#666A86] dark:text-[#A9ACC8] hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-4 text-xs">
                {isIOS ? (
                  <ol className="space-y-3 text-[#1D1B3A] dark:text-[#E2E4F5]">
                    <li className="flex items-start gap-3 p-3 rounded-2xl bg-[#F8F9FD] dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55]">
                      <span className="w-6 h-6 rounded-full bg-[#6D5CF2] text-white font-bold flex items-center justify-center shrink-0">
                        1
                      </span>
                      <div className="space-y-1">
                        <p className="font-bold flex items-center gap-1.5">
                          <span>Tap the Share icon</span>
                          <Share className="w-3.5 h-3.5 text-[#6D5CF2]" />
                        </p>
                        <p className="text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
                          Find the Share button in Safari’s bottom or top toolbar.
                        </p>
                      </div>
                    </li>
                    <li className="flex items-start gap-3 p-3 rounded-2xl bg-[#F8F9FD] dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55]">
                      <span className="w-6 h-6 rounded-full bg-[#6D5CF2] text-white font-bold flex items-center justify-center shrink-0">
                        2
                      </span>
                      <div className="space-y-1">
                        <p className="font-bold flex items-center gap-1.5">
                          <span>Choose “Add to Home Screen”</span>
                          <PlusSquare className="w-3.5 h-3.5 text-[#6D5CF2]" />
                        </p>
                        <p className="text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
                          Scroll the share sheet and tap Add to Home Screen, then tap Add.
                        </p>
                      </div>
                    </li>
                  </ol>
                ) : (
                  <div className="space-y-3">
                    {isInIframe && (
                      <div className="p-3.5 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800/70 space-y-2.5">
                        <p className="text-[11px] font-semibold text-indigo-950 dark:text-indigo-200 leading-relaxed">
                          Browser install prompts only appear when the app is opened directly in its own browser tab (not inside a preview frame).
                        </p>
                        <a
                          href={currentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl bg-[#6D5CF2] hover:bg-[#5A48DE] text-white font-bold text-xs shadow-sm transition-colors"
                        >
                          <span>Open in Full Browser Tab to Install</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    )}

                    <div className="space-y-2.5">
                      <div className="flex items-start gap-3 p-3 rounded-2xl bg-[#F8F9FD] dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55]">
                        <Smartphone className="w-4 h-4 text-[#6D5CF2] shrink-0 mt-0.5" />
                        <div>
                          <p className="font-bold">Android (Chrome / Edge)</p>
                          <p className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] mt-0.5">
                            Open your browser menu (<span className="font-mono">⋮</span>) and tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 p-3 rounded-2xl bg-[#F8F9FD] dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55]">
                        <Monitor className="w-4 h-4 text-[#6D5CF2] shrink-0 mt-0.5" />
                        <div>
                          <p className="font-bold">Desktop (Chrome / Edge)</p>
                          <p className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] mt-0.5">
                            Click the <strong>Install icon</strong> in the right side of the address bar or open browser menu → <strong>Cast, save, and share</strong> → <strong>Install Ekklesphere</strong>.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-[#E9EBF5] dark:border-[#2D2D55]">
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Offline & Push Ready</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setShowInstructionsModal(false);
                      onActionComplete?.();
                    }}
                    className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20 font-bold text-xs cursor-pointer"
                  >
                    Got it
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      {renderTrigger()}
      {modal}
    </>
  );
};
