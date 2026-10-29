import React from 'react';
import { EkklesphereProvider, useEkklesphere } from './context/EkklesphereContext';
import { PortalHeader } from './components/PortalHeader';
import { SidebarNavigation } from './components/navigation/SidebarNavigation';
import { HelpDocsModal } from './components/navigation/HelpDocsModal';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { MemberApp } from './components/member/MemberApp';
import { UsherTool } from './components/usher/UsherTool';
import { ProximitySimulator } from './components/simulator/ProximitySimulator';
import { UnifiedAuthScreen } from './components/auth/UnifiedAuthScreen';

const EkklesphereMain: React.FC = () => {
  const { currentUser, activePortal, isSidebarCollapsed, toastMessage } = useEkklesphere();

  return (
    <div className="min-h-screen flex flex-col bg-[#E6E7F0] dark:bg-[#0D0D22] text-[#1D1B3A] dark:text-[#F2F2FA] transition-colors duration-200">
      {/* 1. Sidebar Navigation (Rendered when authenticated) */}
      {currentUser && <SidebarNavigation />}
      {currentUser && <HelpDocsModal />}

      {/* 2. Main Content Canvas with dynamic margin matching the sidebar state */}
      <div
        className={`flex-1 flex flex-col min-w-0 transition-all duration-250 ease-out ${
          currentUser ? (isSidebarCollapsed ? 'md:ml-[68px]' : 'md:ml-[260px]') : ''
        }`}
      >
        <PortalHeader />

        <main className="flex-1 px-3 sm:px-6 py-4 w-full max-w-[1440px] mx-auto">
          {!currentUser ? (
            <UnifiedAuthScreen />
          ) : (
            <>
              {activePortal === 'admin' && <AdminDashboard />}
              {activePortal === 'member' && <MemberApp />}
              {activePortal === 'usher' && <UsherTool />}
              {activePortal === 'simulator' && <ProximitySimulator />}
            </>
          )}
        </main>
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
