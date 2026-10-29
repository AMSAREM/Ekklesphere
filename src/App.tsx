import React from 'react';
import { EkklesphereProvider, useEkklesphere } from './context/EkklesphereContext';
import { HelpDocsModal } from './components/navigation/HelpDocsModal';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { MemberApp } from './components/member/MemberApp';
import { UsherTool } from './components/usher/UsherTool';
import { UnifiedAuthScreen } from './components/auth/UnifiedAuthScreen';

import { AppHeader } from './components/navigation/AppHeader';
import { SystemSettingsModal } from './components/settings/SystemSettingsModal';

const EkklesphereMain: React.FC = () => {
  const { currentUser, toastMessage } = useEkklesphere();

  return (
    <div className="min-h-screen flex flex-col bg-[#E6E7F0] dark:bg-[#0D0D22] text-[#1D1B3A] dark:text-[#F2F2FA] transition-colors duration-200">
      {/* Help Modal */}
      {currentUser && <HelpDocsModal />}

      {/* Global System Settings Modal across all portals */}
      {currentUser && <SystemSettingsModal />}

      {/* Optimized Unified App Header */}
      {currentUser && <AppHeader />}

      {/* Main role view optimized across desktop, tablet, and mobile */}
      <div className="flex-1 w-full px-2 sm:px-4 md:px-6 lg:px-8">
        {!currentUser ? (
          <UnifiedAuthScreen />
        ) : (
          <>
            {currentUser.role === 'admin' && <AdminDashboard />}
            {currentUser.role === 'usher' && <UsherTool />}
            {currentUser.role === 'member' && <MemberApp />}
          </>
        )}
      </div>

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
