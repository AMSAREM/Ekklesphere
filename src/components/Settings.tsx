// src/components/Settings.tsx - System Settings Component
import React from 'react';
import { useEkklesphere } from '../context/EkklesphereContext';
import { SystemSettingsPanel } from './admin/SystemSettingsPanel';
import { ShieldCheck, Lock } from 'lucide-react';

export const Settings: React.FC = () => {
  const { currentUser } = useEkklesphere();

  // CRITICAL SECURITY ENFORCEMENT (Step 2):
  // Administrative configuration rights are granted exclusively via user role from Supabase,
  // never via arbitrary username string checks.
  const hasSettingsAccess =
    currentUser?.role === 'super_admin' ||
    currentUser?.role === 'creator' ||
    currentUser?.role === 'admin' ||
    currentUser?.role === 'pastor';

  if (!hasSettingsAccess) {
    return (
      <div className="p-8 text-center bg-zinc-900 border border-zinc-800 rounded-xl">
        <Lock className="w-10 h-10 text-amber-500 mx-auto mb-2" />
        <h3 className="text-base font-semibold text-white">Protected Settings</h3>
        <p className="text-xs text-zinc-400 mt-1">
          Administrator privileges are required to modify tenant configurations.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-indigo-400" />
            System & Campus Settings
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Configured with Supabase single source of truth and Row Level Security.
          </p>
        </div>
      </div>
      <SystemSettingsPanel />
    </div>
  );
};
