// src/components/UserManagement.tsx - Church RBAC User Management Component
import React, { useState, useEffect, useCallback } from 'react';
import { useEkklesphere } from '../context/EkklesphereContext';
import { Shield, UserPlus, RefreshCw, KeyRound, Copy, Check, Users } from 'lucide-react';
import { ChurchRole } from '../../lib/auth';

export interface ManagedUser {
  id: string;
  memberId?: string;
  email?: string;
  phoneE164?: string;
  role: ChurchRole;
  organizationId: string;
  fullName: string;
  status: 'active' | 'suspended';
  mustChangePassword?: boolean;
  lastLoginAt?: string | null;
  createdAt?: string;
}

export const UserManagement: React.FC = () => {
  const { currentUser, showToast } = useEkklesphere();
  const [selectedRole, setSelectedRole] = useState<ChurchRole>('pastor');
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [staffList, setStaffList] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [provisionedCred, setProvisionedCred] = useState<{
    email: string;
    role: ChurchRole;
    temporaryPassword?: string;
  } | null>(null);
  const [copiedPass, setCopiedPass] = useState(false);

  const isSuperAdmin = currentUser?.role === 'super_admin' || currentUser?.role === 'creator';
  const canManageUsers = isSuperAdmin || currentUser?.role === 'admin' || currentUser?.role === 'pastor';
  const canCreateUsers = isSuperAdmin || currentUser?.role === 'admin';

  const getStaffHeaders = useCallback((): HeadersInit => {
    const token =
      currentUser?.token ||
      (typeof window !== 'undefined' ? localStorage.getItem('ekklesphere_token') : null);
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }, [currentUser?.token]);

  const fetchStaff = useCallback(async () => {
    if (!canManageUsers) return;
    setLoading(true);
    try {
      const res = await fetch('/api/staff', { headers: getStaffHeaders() });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (Array.isArray(data?.staff)) {
          setStaffList(data.staff);
        }
      }
    } catch {
      // keep existing list
    } finally {
      setLoading(false);
    }
  }, [canManageUsers, getStaffHeaders]);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff, currentUser?.organization_id]);

  if (!canManageUsers) {
    return (
      <div className="p-8 text-center bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-500/20 rounded-2xl">
        <Shield className="w-12 h-12 text-rose-500 dark:text-rose-400 mx-auto mb-3" />
        <h3 className="text-lg font-semibold text-[#1D1B3A] dark:text-white">Access Denied</h3>
        <p className="text-sm text-[#666A86] dark:text-[#A9ACC8] mt-1">
          You need administrative credentials to manage system users.
        </p>
      </div>
    );
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setProvisionedCred(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/staff', {
        method: 'POST',
        headers: getStaffHeaders(),
        body: JSON.stringify({
          fullName: newName.trim(),
          email: newEmail.trim().toLowerCase(),
          phone: newPhone.trim() || undefined,
          role: selectedRole,
          ...(newPassword.trim() ? { password: newPassword.trim() } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.staff) {
        const msg = data?.message || 'Could not provision church staff account.';
        setErrorMsg(msg);
        showToast(msg);
        return;
      }

      setProvisionedCred({
        email: data.staff.email || newEmail.trim().toLowerCase(),
        role: data.staff.role,
        temporaryPassword: data.temporaryPassword,
      });
      showToast(`Church staff account saved in Supabase for ${data.staff.fullName} (${data.staff.role}).`);
      setNewEmail('');
      setNewName('');
      setNewPhone('');
      setNewPassword('');
      await fetchStaff();
    } catch {
      const msg = 'Network error provisioning staff account.';
      setErrorMsg(msg);
      showToast(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base sm:text-lg font-extrabold text-[#1D1B3A] dark:text-[#F2F2FA] flex items-center gap-2">
            <Shield className="w-5 h-5 text-[#6D5CF2]" />
            <span>Church Staff & Access Management</span>
          </h2>
          <p className="text-xs text-[#666A86] dark:text-[#A9ACC8] mt-0.5">
            Role-based access control for pastors, ushers, cell leaders, finance officers, and administrators.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isSuperAdmin && (
            <span className="px-3 py-1 bg-[#EFEDFF] dark:bg-[#2A2A55] border border-[#6D5CF2]/30 text-[#6D5CF2] dark:text-[#8C7DFF] text-xs rounded-full font-bold">
              Platform Super-Admin Scope
            </span>
          )}
          <button
            type="button"
            onClick={fetchStaff}
            disabled={loading}
            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {canCreateUsers && (
        <form
          onSubmit={handleCreateUser}
          className="bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] rounded-2xl p-5 space-y-4 shadow-xs"
        >
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#1D1B3A] dark:text-[#F2F2FA] flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-emerald-500" />
            <span>Provision Church Staff Account</span>
          </h3>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/50 text-xs font-semibold text-rose-700 dark:text-rose-300">
              {errorMsg}
            </div>
          )}

          {provisionedCred && (
            <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 text-xs space-y-1.5">
              <div className="font-bold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5" />
                <span>Staff account provisioned in Supabase ({provisionedCred.role})</span>
              </div>
              <div className="text-emerald-800 dark:text-emerald-300">
                Email: <span className="font-mono font-bold">{provisionedCred.email}</span>
              </div>
              {provisionedCred.temporaryPassword && (
                <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
                  <span>Temporary Password:</span>
                  <code className="px-2 py-0.5 rounded bg-white dark:bg-[#14142E] font-mono font-bold">
                    {provisionedCred.temporaryPassword}
                  </code>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(provisionedCred.temporaryPassword || '');
                      setCopiedPass(true);
                      setTimeout(() => setCopiedPass(false), 1800);
                    }}
                    className="p-1 rounded hover:bg-emerald-100 dark:hover:bg-emerald-900/40"
                    title="Copy temporary password"
                  >
                    {copiedPass ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            <input
              type="text"
              placeholder="Full Name *"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="px-3.5 py-2 bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] rounded-xl text-xs text-[#1D1B3A] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#6D5CF2]"
              required
            />
            <input
              type="email"
              placeholder="Official Email *"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="px-3.5 py-2 bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] rounded-xl text-xs text-[#1D1B3A] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#6D5CF2]"
              required
            />
            <input
              type="tel"
              placeholder="Phone (optional)"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              className="px-3.5 py-2 bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] rounded-xl text-xs text-[#1D1B3A] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#6D5CF2]"
            />
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value as ChurchRole)}
              className="px-3.5 py-2 bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] rounded-xl text-xs text-[#1D1B3A] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#6D5CF2]"
            >
              <option value="pastor">Pastor / Ministry Lead</option>
              <option value="usher">Door Usher / Greeter</option>
              <option value="group_leader">Cell / Fellowship Leader</option>
              <option value="finance">Finance Officer</option>
              <option value="admin">Church Administrator</option>
              {isSuperAdmin && <option value="super_admin">Platform Super Admin</option>}
            </select>
            <input
              type="password"
              placeholder="Password (min 8, or auto)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={8}
              className="px-3.5 py-2 bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] rounded-xl text-xs text-[#1D1B3A] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#6D5CF2]"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 bg-[#6D5CF2] hover:bg-[#5b4be0] text-white text-xs font-bold rounded-xl transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-60"
          >
            <UserPlus className="w-4 h-4" />
            <span>{submitting ? 'Provisioning...' : 'Create Staff User'}</span>
          </button>
        </form>
      )}

      <div className="bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] rounded-2xl p-5 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#1D1B3A] dark:text-[#F2F2FA] flex items-center gap-2">
            <Users className="w-4 h-4 text-[#6D5CF2]" />
            <span>Provisioned Staff Accounts ({staffList.length})</span>
          </h3>
        </div>

        {staffList.length === 0 ? (
          <p className="text-xs text-[#666A86] dark:text-[#A9ACC8] py-4 text-center">
            {loading ? 'Loading staff directory from database...' : 'No additional staff accounts provisioned yet.'}
          </p>
        ) : (
          <div className="divide-y divide-[#E9EBF5] dark:divide-[#2D2D55]">
            {staffList.map((u) => (
              <div key={u.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div>
                  <div className="font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">{u.fullName}</div>
                  <div className="text-[#666A86] dark:text-[#A9ACC8]">
                    {u.email || 'No email'}
                    {u.phoneE164 ? ` · ${u.phoneE164}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-lg bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] font-bold uppercase text-[10px]">
                    {u.role.replace('_', ' ')}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                      u.status === 'active'
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                        : 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'
                    }`}
                  >
                    {u.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
