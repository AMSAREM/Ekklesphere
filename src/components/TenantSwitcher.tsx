// src/components/TenantSwitcher.tsx - Multi-Tenant Organization Switcher
import React from 'react';
import { useEkklesphere } from '../context/EkklesphereContext';
import { Building2, Check, ShieldCheck } from 'lucide-react';

export const TenantSwitcher: React.FC = () => {
  const { currentUser, tenants, impersonateTenant } = useEkklesphere();

  // CRITICAL SECURITY ENFORCEMENT:
  // Tenant switching across arbitrary church campuses/tenants is strictly restricted to verified
  // 'super_admin' or 'creator' roles in Supabase. Backdoors have been permanently purged.
  const isSuperAdmin = currentUser?.role === 'super_admin' || currentUser?.role === 'creator';

  if (!isSuperAdmin) {
    return null;
  }

  return (
    <div className="relative inline-block text-left">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800/80 border border-zinc-700 rounded-lg text-xs text-zinc-300">
        <Building2 className="w-4 h-4 text-indigo-400" />
        <span className="font-semibold text-white">Active Tenant:</span>
        <select
          onChange={(e) => {
            if (e.target.value) impersonateTenant(e.target.value);
          }}
          className="bg-transparent text-white border-none focus:outline-none cursor-pointer"
        >
          {tenants.map((t) => (
            <option key={t.id} value={t.id} className="bg-zinc-900 text-white">
              {t.name}
            </option>
          ))}
        </select>
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" aria-label="Super-Admin Authorized" />
      </div>
    </div>
  );
};
