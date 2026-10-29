import React from 'react';
import { EkklesphereProvider, useEkklesphere } from './context/EkklesphereContext';
import { HelpDocsModal } from './components/navigation/HelpDocsModal';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { MemberApp } from './components/member/MemberApp';
import { UsherTool } from './components/usher/UsherTool';
import { UnifiedAuthScreen } from './components/auth/UnifiedAuthScreen';

const EkklesphereMain: React.FC = () => {
  const { currentUser, toastMessage } = useEkklesphere();

  return (
    <div className="min-h-screen flex flex-col bg-[#E6E7F0] dark:bg-[#0D0D22] text-[#1D1B3A] dark:text-[#F2F2FA] transition-colors duration-200">
      {/* Help Modal */}
      {currentUser && <HelpDocsModal />}

      {/* Main Content Canvas with single unified header inside the active role view */}
      <main className="flex-1 px-3 sm:px-6 py-2 sm:py-4 w-full max-w-[1440px] mx-auto">
        {!currentUser ? (
          <UnifiedAuthScreen />
        ) : (
          <>
            {currentUser.role === 'admin' && <AdminDashboard />}
            {currentUser.role === 'usher' && <UsherTool />}
            {currentUser.role === 'member' && <MemberApp />}
          </>
        )}
      </main>

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
