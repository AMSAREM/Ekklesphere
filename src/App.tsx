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

  // If Creator Console view is active
  if (viewMode === 'creator') {
    const isCreatorAllowed = currentUser?.role === 'super_admin' || currentUser?.role === 'creator';
    if (!isCreatorAllowed) {
      return (
        <div className="min-h-screen w-full flex items-center justify-center bg-[#0D0D22] text-[#F2F2FA] p-4">
          <div className="max-w-md w-full bg-[#171738] p-6 rounded-2xl border border-rose-500/30 text-center space-y-4">
            <div className="w-12 h-12 rounded-xl bg-rose-500/10 text-rose-400 mx-auto flex items-center justify-center font-bold text-xl">
              !
            </div>
            <h2 className="text-lg font-bold">Access Restricted</h2>
            <p className="text-xs text-zinc-400">
              The Creators Panel is strictly restricted to platform <strong>super_admin</strong> and <strong>creator</strong> roles. Your current role is <span className="text-amber-400 font-semibold">{currentUser?.role || 'unauthenticated'}</span>.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-xl bg-[#6D5CF2] text-white text-xs font-bold hover:bg-[#5b4be0] transition-colors cursor-pointer"
            >
              Return to Safe Portal
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen w-full max-w-full overflow-x-hidden flex flex-col bg-[#F5F6FA] dark:bg-[#0B0B1A] text-[#1D1B3A] dark:text-[#F2F2FA] transition-colors duration-200">
        <CreatorsPanel />
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
  }

  // If Public Landing Page view is active
  if (viewMode === 'landing') {
    return (
      <div className="min-h-screen w-full max-w-full overflow-x-hidden flex flex-col bg-[#F5F6FA] dark:bg-[#0A0A18] text-[#1D1B3A] dark:text-[#F2F2FA] transition-colors duration-200">
        <LandingPage />
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
  }

  // Standard Church Application Portals View (viewMode === 'app')
  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden flex flex-col bg-[#E6E7F0] dark:bg-[#0D0D22] text-[#1D1B3A] dark:text-[#F2F2FA] transition-colors duration-200">
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
