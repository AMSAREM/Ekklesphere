import React from 'react';
import { EkklesphereProvider, useEkklesphere } from './context/EkklesphereContext';
import { PortalHeader } from './components/PortalHeader';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { MemberApp } from './components/member/MemberApp';
import { UsherTool } from './components/usher/UsherTool';
import { ProximitySimulator } from './components/simulator/ProximitySimulator';

const EkklesphereMain: React.FC = () => {
  const { activePortal, toastMessage } = useEkklesphere();

  return (
    <div className="min-h-screen flex flex-col transition-colors duration-200">
      <PortalHeader />

      <main className="flex-1 px-3 sm:px-6 py-4 max-w-[1440px] w-full mx-auto">
        {activePortal === 'admin' && <AdminDashboard />}
        {activePortal === 'member' && <MemberApp />}
        {activePortal === 'usher' && <UsherTool />}
        {activePortal === 'simulator' && <ProximitySimulator />}
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
