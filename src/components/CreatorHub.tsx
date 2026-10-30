// src/components/CreatorHub.tsx - Vendor Master Portal
import React from 'react';
import { useEkklesphere } from '../context/EkklesphereContext';
import { CreatorsPanel } from './creator/CreatorsPanel';
import { ShieldAlert } from 'lucide-react';

export const CreatorHub: React.FC = () => {
  const { currentUser } = useEkklesphere();

  // CRITICAL SECURITY ENFORCEMENT (Step 2):
  // Access is governed strictly by the user's authenticated Supabase role ('creator' or 'super_admin'),
  // NEVER by hardcoded usernames like 'elena' or 'elena_master'.
  const isAuthorized = currentUser?.role === 'creator' || currentUser?.role === 'super_admin';

  if (!isAuthorized) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center p-6 text-center">
        <ShieldAlert className="w-16 h-16 text-red-500 mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">Restricted Vendor Hub</h2>
        <p className="text-zinc-400 max-w-md text-sm">
          Access to the Creator Hub is strictly limited to accounts holding the 'creator' or 'super_admin' role in Supabase.
        </p>
      </div>
    );
  }

  return <CreatorsPanel />;
};
