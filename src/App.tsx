import React from 'react';
import { EkklesphereProvider, useEkklesphere } from './context/EkklesphereContext';
import { HelpDocsModal } from './components/navigation/HelpDocsModal';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { MemberApp } from './components/member/MemberApp';
import { UsherTool } from './components/usher/UsherTool';
import { UnifiedAuthScreen } from './components/auth/UnifiedAuthScreen';

import { AppHeader } from './components/navigation/AppHeader';
import { SystemSettingsModal } from './components/settings/SystemSettingsModal';
import { LandingPage } from './components/landing/LandingPage';
import { CreatorsPanel } from './components/creator/CreatorsPanel';

const EkklesphereMain: React.FC = () => {
  const { currentUser, toastMessage, viewMode } = useEkklesphere();

  // If Creator Console view is active - only verified creator login can access
  if (viewMode === 'creator') {
    const isCreatorAllowed =
      Boolean(currentUser) &&
      (currentUser?.role === 'super_admin' ||
        currentUser?.role === 'creator' ||
        Boolean(currentUser?.is_creator) ||
        Boolean(
          import.meta.env.VITE_CREATOR_EMAIL &&
            currentUser?.email?.toLowerCase() === (import.meta.env.VITE_CREATOR_EMAIL as string).toLowerCase()
        ));

    if (!isCreatorAllowed) {
      return (
        <div className="min-h-screen w-full max-w-full overflow-x-hidden flex flex-col bg-[#E6E7F0] dark:bg-[#0D0D22] text-[#1D1B3A] dark:text-[#F2F2FA]">
          <div className="flex-1 w-full px-2 sm:px-4 md:px-6 lg:px-8 py-8 flex flex-col items-center justify-center">
            <div className="max-w-md w-full mb-4 p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-700 dark:text-indigo-300 text-xs text-center font-medium">
              The Creator Console is restricted to Platform Creators. Please log in with your Creator credentials below.
            </div>
            <UnifiedAuthScreen />
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen w-full max-w-full overflow-x-clip flex flex-col bg-[#F8F9FD] dark:bg-[#0B0B1A] text-[#1D1B3A] dark:text-[#F2F2FA] transition-colors duration-200">
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

  // If Public Landing Page view is active
  if (viewMode === 'landing') {
    return (
      <div className="min-h-screen w-full max-w-full overflow-x-hidden flex flex-col bg-[#F8F9FD] dark:bg-[#0A0A18] text-[#1D1B3A] dark:text-[#F2F2FA] transition-colors duration-200">
        <LandingPage />
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

  // Standard Church Application Portals View (viewMode === 'app')
  return (
    <div className="min-h-screen w-full max-w-full overflow-x-clip flex flex-col bg-[#F8F9FD] dark:bg-[#0D0D22] text-[#1D1B3A] dark:text-[#F2F2FA] transition-colors duration-200">
      {/* Help Modal */}
      {currentUser && <HelpDocsModal />}

      {/* Global System Settings Modal across all portals */}
      {currentUser && <SystemSettingsModal />}

      {/* Top Application Portal Header */}
      {currentUser && <AppHeader />}

      {/* Role-governed portal rendering */}
      {!currentUser ? (
        <div className="flex-1 w-full px-2 sm:px-4 md:px-6 lg:px-8">
          <UnifiedAuthScreen />
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
