import React, { useCallback, useEffect, useState } from 'react';
import { EkklesphereProvider, useEkklesphere } from './context/EkklesphereContext';
import { HelpDocsModal } from './components/navigation/HelpDocsModal';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { MemberApp } from './components/member/MemberApp';
import { UsherTool } from './components/usher/UsherTool';
import { UnifiedAuthScreen } from './components/auth/UnifiedAuthScreen';

import { AppHeader } from './components/navigation/AppHeader';
import { SystemSettingsModal } from './components/settings/SystemSettingsModal';
import { ChurchHomePage } from './components/home/ChurchHomePage';
import { CreatorsPanel } from './components/creator/CreatorsPanel';
import { ChangePasswordModal } from './components/auth/ChangePasswordModal';
import { SessionTimeoutModal } from './components/auth/SessionTimeoutModal';
import { Download, KeyRound, X } from 'lucide-react';
import { PublicLandingPage } from './components/landing/PublicLandingPage';
import { isPublicLandingLocation } from './utils/authRoute';
import { canMonitorPastoralCare } from './constants/portfolios';
import { usePWAInstall } from './hooks/usePWAInstall';

const readLocationKey = () =>
  typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search}` : '/';

const EkklesphereMain: React.FC = () => {
  const {
    currentUser,
    activePortal,
    isVerifyingSession,
    toastMessage,
    viewMode,
    isChangePasswordModalOpen,
    setIsChangePasswordModalOpen,
  } = useEkklesphere();

  const [locationKey, setLocationKey] = useState<string>(readLocationKey);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handlePopState = () => {
      setLocationKey(readLocationKey());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateTo = useCallback((targetPath: string) => {
    if (typeof window === 'undefined') return;
    const url = new URL(targetPath, window.location.origin);
    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    window.history.pushState({}, '', nextUrl);
    setLocationKey(`${url.pathname}${url.search}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, []);

  const [currentPathname, currentSearch = ''] = locationKey.split('?');
  const isPublicRoot = isPublicLandingLocation(
    currentPathname,
    currentSearch ? `?${currentSearch}` : ''
  );

  if (isPublicRoot) {
    return <PublicLandingPage onNavigate={navigateTo} />;
  }

  // If Creator Console view is active - only verified creator login can access
  if (viewMode === 'creator') {
    if (isVerifyingSession) {
      return (
        <div className="min-h-screen w-full flex items-center justify-center bg-[#F8F9FD] dark:bg-[#0B0B1A] text-[#1D1B3A] dark:text-[#F2F2FA]">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-[#6D5CF2] border-t-transparent animate-spin" />
            <p className="text-xs font-semibold text-[#666A86] dark:text-[#A9ACC8]">
              Verifying session...
            </p>
          </div>
        </div>
      );
    }

    const isCreatorAllowed =
      Boolean(currentUser) &&
      (currentUser?.role === 'super_admin' ||
        currentUser?.role === 'creator' ||
        Boolean(currentUser?.is_creator));

    if (!isCreatorAllowed) {
      return (
        <div className="min-h-screen w-full max-w-full overflow-x-clip flex flex-col bg-[#f7f3ec] dark:bg-[#0D0D22] text-[#0b1f33] dark:text-[#F2F2FA]">
          <div className="w-full px-3 sm:px-6 pt-5 flex justify-center">
            <div className="max-w-[1060px] w-full p-3.5 rounded-2xl bg-[#fffdf9] dark:bg-[#191938] border border-[#e3ddd2] dark:border-[#2E2E58] text-[#0b1f33] dark:text-[#D9DCF0] text-xs text-center font-medium shadow-xs">
              The Creator Console is restricted to Platform Creators. Sign in with your Creator credentials below.
            </div>
          </div>
          <div className="flex-1 w-full">
            <UnifiedAuthScreen onBackToLanding={() => navigateTo('/')} />
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen w-full max-w-full overflow-x-clip flex flex-col bg-[#F8F9FD] dark:bg-[#0B0B1A] text-[#1D1B3A] dark:text-[#F2F2FA] transition-colors duration-200">
        {currentUser && <ChangePasswordModal />}
        {currentUser && <SessionTimeoutModal />}
        <CreatorsPanel />
        {toastMessage && (
          <div
            role="status"
            aria-live="polite"
            className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white dark:bg-[#1D1B3A] text-[#1D1B3A] dark:text-white px-5 py-2.5 rounded-2xl text-xs font-bold shadow-xl z-50 animate-in fade-in slide-in-from-bottom-2 border border-slate-200 dark:border-white/10 flex items-center gap-2"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>{toastMessage}</span>
          </div>
        )}
      </div>
    );
  }

  // Public / Member Church Home route (/home or ?church=slug)
  if (viewMode === 'home') {
    return (
      <div className="min-h-screen w-full max-w-full overflow-x-clip flex flex-col transition-colors duration-200">
        <ChurchHomePage />
        {toastMessage && (
          <div
            role="status"
            aria-live="polite"
            className="fixed bottom-20 min-[760px]:bottom-6 left-1/2 -translate-x-1/2 bg-white dark:bg-[#15221D] text-[#16221D] dark:text-white px-5 py-2.5 rounded-2xl text-xs font-bold shadow-xl z-50 border border-black/10 dark:border-white/15 flex items-center gap-2"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>{toastMessage}</span>
          </div>
        )}
      </div>
    );
  }

  // Standard Church Application Portals View (viewMode === 'app')
  if (isVerifyingSession) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#F8F9FD] dark:bg-[#0D0D22] text-[#1D1B3A] dark:text-[#F2F2FA]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-[#6D5CF2] border-t-transparent animate-spin" />
          <p className="text-xs font-semibold text-[#666A86] dark:text-[#A9ACC8]">
            Verifying session...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-clip flex flex-col bg-[#F8F9FD] dark:bg-[#0D0D22] text-[#1D1B3A] dark:text-[#F2F2FA] transition-colors duration-200">
      {/* Help Modal */}
      {currentUser && <HelpDocsModal />}

      {/* Global System Settings Modal across all portals */}
      {currentUser && <SystemSettingsModal />}

      {/* Password Update Modal */}
      {currentUser && <ChangePasswordModal />}

      {/* Idle Session Timeout Countdown Modal */}
      {currentUser && <SessionTimeoutModal />}

      {/* Top Application Portal Header */}
      {currentUser && <AppHeader />}

      {/* Reminder banner when signed in with temporary onboarding password */}
      {currentUser?.mustChangePassword && !isChangePasswordModalOpen && (
        <div className="w-full bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800/60 px-4 py-2.5">
          <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-2 text-xs text-amber-900 dark:text-amber-200">
            <span>
              You are signed in with your temporary onboarding password. Set a personal password to protect your account.
            </span>
            <button
              type="button"
              onClick={() => setIsChangePasswordModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#6D5CF2] hover:bg-[#5b4be0] text-white font-bold transition-colors cursor-pointer"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Set Personal Password</span>
            </button>
          </div>
        </div>
      )}

      {/* Role-governed portal rendering */}
      {!currentUser ? (
        <div className="flex-1 w-full">
          <UnifiedAuthScreen onBackToLanding={() => navigateTo('/')} />
        </div>
      ) : (
        <>
          {currentUser.role === 'usher' ? (
            <UsherTool />
          ) : activePortal === 'member' ? (
            <MemberApp />
          ) : canMonitorPastoralCare(currentUser) || currentUser.role === 'finance' ? (
            <AdminDashboard />
          ) : (
            <MemberApp />
          )}
        </>
      )}

      {/* Global Toast Notification */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#1D1B3A] text-white px-5 py-2.5 rounded-2xl text-xs font-bold shadow-2xl z-50 animate-in fade-in slide-in-from-bottom-2 border border-white/10 flex items-center gap-2"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};

interface AppErrorBoundaryState {
  hasError: boolean;
}

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  AppErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full flex items-center justify-center bg-[#F8F9FD] dark:bg-[#0D0D22] text-[#1D1B3A] dark:text-[#F2F2FA] p-4">
          <div className="max-w-md w-full rounded-3xl bg-white dark:bg-[#1C1C3C] border border-[#E3E5F2] dark:border-[#2D2D55] p-6 shadow-xl text-center space-y-4">
            <h1 className="text-lg font-bold">Something went wrong</h1>
            <p className="text-xs text-[#5B5F7A] dark:text-[#A9ACC8]">
              An unexpected display issue interrupted this view. Reloading the portal restores your session cleanly.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-4 py-2.5 rounded-xl bg-[#6D5CF2] hover:bg-[#5B4BE0] text-white text-xs font-bold cursor-pointer"
              >
                Reload App
              </button>
              <button
                type="button"
                onClick={() => {
                  this.setState({ hasError: false });
                  window.history.replaceState({}, '', '/app?auth=login');
                }}
                className="px-4 py-2.5 rounded-xl border border-[#E3E5F2] dark:border-[#2D2D55] text-xs font-bold cursor-pointer"
              >
                Back to Sign In
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const StandaloneInstallBanner: React.FC = () => {
  const { isInstallable, isInstalled, isInstalling, isInIframe, promptInstall } = usePWAInstall();
  const [dismissed, setDismissed] = useState(false);

  const hasInstallIntent =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('pwa_install') === '1';

  const clearInstallParam = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has('pwa_install')) {
        url.searchParams.delete('pwa_install');
        window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
      }
    } catch {
      // ignore URL cleanup error
    }
  }, []);

  if (!hasInstallIntent || dismissed || isInstalled || isInIframe || !isInstallable) {
    return null;
  }

  return (
    <div
      role="region"
      aria-label="Install Ekklesphere App"
      className="fixed bottom-4 right-4 z-[90] max-w-sm w-[calc(100%-32px)] rounded-2xl bg-[#0b1f33] dark:bg-[#19193A] text-white border border-white/15 shadow-2xl p-4 flex items-center justify-between gap-3"
    >
      <div className="min-w-0">
        <p className="text-xs font-bold">Ekklesphere is ready to install</p>
        <p className="text-[11px] text-white/75 mt-0.5">
          Tap once to add Ekklesphere to your device.
        </p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          disabled={isInstalling}
          onClick={async () => {
            const res = await promptInstall();
            if (res.outcome === 'accepted') {
              clearInstallParam();
            }
          }}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#6D5CF2] hover:bg-[#5B4BE0] text-white text-xs font-bold cursor-pointer whitespace-nowrap disabled:opacity-70"
        >
          <Download className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{isInstalling ? 'Installing...' : 'Install Now'}</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setDismissed(true);
            clearInstallParam();
          }}
          aria-label="Dismiss install banner"
          className="w-8 h-8 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default function App() {
  return (
    <AppErrorBoundary>
      <EkklesphereProvider>
        <EkklesphereMain />
        <StandaloneInstallBanner />
      </EkklesphereProvider>
    </AppErrorBoundary>
  );
}
