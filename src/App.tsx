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
import { KeyRound } from 'lucide-react';
import { PublicLandingPage } from './components/landing/PublicLandingPage';
import { isPublicLandingLocation } from './utils/authRoute';

const readLocationKey = () =>
  typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search}` : '/';

const EkklesphereMain: React.FC = () => {
  const {
    currentUser,
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
        <div className="min-h-screen w-full max-w-full overflow-x-hidden flex flex-col bg-[#E6E7F0] dark:bg-[#0D0D22] text-[#1D1B3A] dark:text-[#F2F2FA]">
          <div className="flex-1 w-full px-2 sm:px-4 md:px-6 lg:px-8 py-8 flex flex-col items-center justify-center">
            <div className="max-w-md w-full mb-4 p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-700 dark:text-indigo-300 text-xs text-center font-medium">
              The Creator Console is restricted to Platform Creators. Please log in with your Creator credentials below.
            </div>
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
        <div className="flex-1 w-full px-2 sm:px-4 md:px-6 lg:px-8">
          <UnifiedAuthScreen onBackToLanding={() => navigateTo('/')} />
        </div>
      ) : (
        <>
          {(currentUser.role === 'admin' ||
            currentUser.role === 'pastor' ||
            currentUser.role === 'super_admin' ||
            currentUser.role === 'creator' ||
            currentUser.role === 'finance') && <AdminDashboard />}
          {currentUser.role === 'usher' && <UsherTool />}
          {(currentUser.role === 'member' || currentUser.role === 'group_leader') && <MemberApp />}
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

export default function App() {
  return (
    <EkklesphereProvider>
      <EkklesphereMain />
    </EkklesphereProvider>
  );
}
