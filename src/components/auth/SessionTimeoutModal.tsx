import React, { useEffect, useState } from 'react';
import { Clock, LogOut, ShieldAlert, RefreshCw } from 'lucide-react';
import { useEkklesphere } from '../../context/EkklesphereContext';

function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const SessionTimeoutModal: React.FC = () => {
  const {
    currentUser,
    sessionTimeoutMinutes,
    sessionWarningSecondsLeft,
    extendUserSession,
    logout,
  } = useEkklesphere();
  const [isExtending, setIsExtending] = useState(false);

  useEffect(() => {
    if (sessionWarningSecondsLeft === null) {
      setIsExtending(false);
    }
  }, [sessionWarningSecondsLeft]);

  if (!currentUser || sessionWarningSecondsLeft === null) {
    return null;
  }

  const warningWindowSeconds = sessionTimeoutMinutes <= 2 ? 20 : 60;
  const progressPercent = Math.max(
    0,
    Math.min(100, (sessionWarningSecondsLeft / warningWindowSeconds) * 100)
  );

  const handleStaySignedIn = async () => {
    setIsExtending(true);
    try {
      await extendUserSession();
    } finally {
      setIsExtending(false);
    }
  };

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="session-timeout-title"
      aria-describedby="session-timeout-desc"
      className="fixed inset-0 z-[100] bg-slate-950/65 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div className="w-full max-w-md rounded-3xl bg-white dark:bg-[#191936] border border-slate-200 dark:border-white/15 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="h-1.5 w-full bg-slate-200 dark:bg-white/10 overflow-hidden">
          <div
            className="h-full bg-amber-500 transition-all duration-1000 ease-linear"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="p-6 space-y-4">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-amber-100 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800/70 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <h2
                  id="session-timeout-title"
                  className="text-base font-extrabold text-[#1D1B3A] dark:text-[#F2F2FA]"
                >
                  Session Expiring Soon
                </h2>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 text-xs font-extrabold tabular-nums">
                  <Clock className="w-3.5 h-3.5" />
                  {formatCountdown(sessionWarningSecondsLeft)}
                </span>
              </div>
              <p
                id="session-timeout-desc"
                className="text-xs text-[#666A86] dark:text-[#A9ACC8] mt-1 leading-relaxed"
              >
                For account security, inactive sessions automatically sign out after{' '}
                <strong className="text-[#1D1B3A] dark:text-white">
                  {sessionTimeoutMinutes} min
                </strong>
                . Click <strong>Stay Signed In</strong> to continue working.
              </p>
            </div>
          </div>

          <div className="rounded-2xl bg-[#F6F7FC] dark:bg-[#12122A] border border-[#E9EBF5] dark:border-[#2D2D55] px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs">
            <div className="min-w-0">
              <div className="font-bold text-[#1D1B3A] dark:text-[#F2F2FA] truncate">
                {currentUser.name}
              </div>
              <div className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] truncate">
                {currentUser.email}
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-lg bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold uppercase shrink-0">
              {currentUser.role.replace('_', ' ')}
            </span>
          </div>

          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => logout({ reason: 'manual' })}
              className="px-4 py-2.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] text-xs font-bold text-[#666A86] dark:text-[#A9ACC8] hover:bg-slate-100 dark:hover:bg-white/10 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out Now</span>
            </button>
            <button
              type="button"
              onClick={handleStaySignedIn}
              disabled={isExtending}
              className="px-5 py-2.5 rounded-xl bg-[#6D5CF2] hover:bg-[#5B4AE0] disabled:opacity-60 text-white text-xs font-bold shadow-md shadow-indigo-500/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isExtending ? 'animate-spin' : ''}`} />
              <span>{isExtending ? 'Extending...' : 'Stay Signed In'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
