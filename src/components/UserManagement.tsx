// src/components/UserManagement.tsx - Unified Member & Staff User Credentials + RBAC Management
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useEkklesphere } from '../context/EkklesphereContext';
import {
  Shield,
  UserPlus,
  RefreshCw,
  KeyRound,
  Copy,
  Check,
  Users,
  Search,
  UserCheck,
  Ban,
  RotateCcw,
  Lock,
  Mail,
  Phone,
  X,
  Edit3,
  Trash2,
} from 'lucide-react';
import { ChurchRole } from '../../lib/auth';
import { CHURCH_PORTFOLIO_OPTIONS, CHURCH_PORTFOLIOS } from '../constants/portfolios';
import { ContactCallButton } from './common/ContactCallButton';

export type CredentialStatus =
  | 'active'
  | 'temp_password'
  | 'suspended'
  | 'locked'
  | 'unprovisioned';

export type UserFilterMode =
  | 'all'
  | 'members'
  | 'staff'
  | 'has_login'
  | 'unprovisioned'
  | 'temp_password'
  | 'suspended';

export interface ManagedUser {
  id: string;
  memberId?: string;
  memberCode?: string;
  organizationId: string;
  fullName: string;
  email?: string;
  username?: string;
  phoneE164?: string;
  role: ChurchRole;
  accountCategory: 'member' | 'staff';
  hasCredentials: boolean;
  credentialStatus: CredentialStatus;
  status: 'active' | 'suspended';
  mustChangePassword?: boolean;
  lastLoginAt?: string | null;
  createdAt?: string;
  homeCellGroup?: string;
  department?: string;
  designation?: string;
}

const ROLE_LABELS: Record<ChurchRole, string> = {
  member: 'Member',
  group_leader: 'Cell / Group Leader',
  usher: 'Door Usher / Greeter',
  finance: 'Finance Officer',
  pastor: 'Pastor / Ministry Lead',
  admin: 'Church Administrator',
  super_admin: 'Platform Super Admin',
  creator: 'Platform Creator',
};

const FILTER_OPTIONS: Array<{ id: UserFilterMode; label: string }> = [
  { id: 'all', label: 'All Accounts' },
  { id: 'members', label: 'Members' },
  { id: 'staff', label: 'Staff & Leaders' },
  { id: 'has_login', label: 'Active Login' },
  { id: 'unprovisioned', label: 'No Credentials' },
  { id: 'temp_password', label: 'Temp Password' },
  { id: 'suspended', label: 'Suspended / Locked' },
];

export const UserManagement: React.FC = () => {
  const {
    currentUser,
    isSessionVerified,
    handleUnauthorizedSession,
    showToast,
    members,
    refreshMembers,
    requestedUserTarget,
  } = useEkklesphere();

  const formRef = useRef<HTMLFormElement>(null);

  const [usersList, setUsersList] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filter & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<UserFilterMode>('all');

  // Form state for issuing, editing, or resetting credentials
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [confirmDeleteUserId, setConfirmDeleteUserId] = useState<string | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string>('');
  const [selectedRole, setSelectedRole] = useState<ChurchRole>('member');
  const [selectedDesignation, setSelectedDesignation] = useState<string>('Member');
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [requirePasswordChange, setRequirePasswordChange] = useState(true);
  const lastAppliedTargetNonceRef = useRef<number | null>(null);

  const [provisionedCred, setProvisionedCred] = useState<{
    fullName: string;
    identifier: string;
    email?: string;
    phoneE164?: string;
    role: ChurchRole;
    temporaryPassword?: string;
    resetExisting: boolean;
    mustChangePassword: boolean;
  } | null>(null);
  const [copiedField, setCopiedField] = useState<'pass' | 'bundle' | null>(null);

  const isSuperAdmin = currentUser?.role === 'super_admin' || currentUser?.role === 'creator';
  const canManageUsers =
    isSuperAdmin || currentUser?.role === 'admin' || currentUser?.role === 'pastor';
  const canCreateUsers = isSuperAdmin || currentUser?.role === 'admin';

  const getAuthHeaders = useCallback((): HeadersInit => {
    const token =
      currentUser?.token ||
      (typeof window !== 'undefined' ? localStorage.getItem('ekklesphere_token') : null);
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }, [currentUser?.token]);

  const fetchUsers = useCallback(async () => {
    if (!isSessionVerified || !currentUser?.token || !canManageUsers) return;
    setLoading(true);
    try {
      const res = await fetch('/api/users', { headers: getAuthHeaders() });
      if (handleUnauthorizedSession(res.status)) return;
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (Array.isArray(data?.users)) {
          setUsersList(data.users);
        }
      }
    } catch {
      // preserve current list on transient network failure
    } finally {
      setLoading(false);
    }
  }, [isSessionVerified, currentUser?.token, canManageUsers, getAuthHeaders, handleUnauthorizedSession]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers, currentUser?.organization_id, members.length]);

  useEffect(() => {
    if (!confirmDeleteUserId) return;
    const t = setTimeout(() => setConfirmDeleteUserId(null), 5000);
    return () => clearTimeout(t);
  }, [confirmDeleteUserId]);

  const populateCredentialFormFromMember = useCallback(
    (
      memberOrUser: {
        memberId?: string;
        id?: string;
        fullName?: string;
        firstName?: string;
        lastName?: string;
        email?: string;
        phoneE164?: string;
        role?: ChurchRole;
        designation?: string;
        officerName?: string;
      },
      mode: 'credentials' | 'edit' = 'credentials'
    ) => {
      const resolvedMemberId =
        memberOrUser.memberId ||
        (memberOrUser.id && members.some((m) => m.id === memberOrUser.id) ? memberOrUser.id : '');
      const computedName =
        memberOrUser.fullName ||
        `${memberOrUser.firstName || ''} ${memberOrUser.lastName || ''}`.trim();

      setEditingUserId(mode === 'edit' ? (memberOrUser.id || memberOrUser.memberId || null) : null);
      setSelectedAccountId(memberOrUser.id || memberOrUser.memberId || null);
      setSelectedMemberId(resolvedMemberId);
      setNewName(computedName);
      setNewEmail(memberOrUser.email || '');
      setNewPhone(memberOrUser.phoneE164 || '');
      setSelectedRole(memberOrUser.role || 'member');
      setSelectedDesignation(
        memberOrUser.designation || memberOrUser.officerName || 'Member'
      );
      setNewPassword('');
      setRequirePasswordChange(true);
      setErrorMsg(null);

      if (typeof window !== 'undefined') {
        window.requestAnimationFrame(() => {
          formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
    },
    [members]
  );

  // Respond cleanly when opened from Member Directory ("Manage Login & Credentials")
  useEffect(() => {
    if (!requestedUserTarget) return;
    if (lastAppliedTargetNonceRef.current === requestedUserTarget.nonce) return;

    if (requestedUserTarget.memberId) {
      const matchedUser = usersList.find(
        (u) => u.memberId === requestedUserTarget.memberId || u.id === requestedUserTarget.memberId
      );
      if (matchedUser) {
        lastAppliedTargetNonceRef.current = requestedUserTarget.nonce;
        setFilterMode(requestedUserTarget.filter || 'all');
        if (requestedUserTarget.searchQuery !== undefined) {
          setSearchQuery(requestedUserTarget.searchQuery);
        }
        populateCredentialFormFromMember(matchedUser);
        return;
      }
      const matchedMember = members.find(
        (m) => m.id === requestedUserTarget.memberId || m.memberId === requestedUserTarget.memberId
      );
      if (matchedMember) {
        lastAppliedTargetNonceRef.current = requestedUserTarget.nonce;
        setFilterMode(requestedUserTarget.filter || 'all');
        if (requestedUserTarget.searchQuery !== undefined) {
          setSearchQuery(requestedUserTarget.searchQuery);
        }
        populateCredentialFormFromMember({
          memberId: matchedMember.id,
          firstName: matchedMember.firstName,
          lastName: matchedMember.lastName,
          email: matchedMember.email,
          phoneE164: matchedMember.phoneE164,
          role: ((matchedMember as { role?: ChurchRole }).role) || 'member',
          designation: matchedMember.designation || matchedMember.officerName || 'Member',
        });
      }
      return;
    }

    lastAppliedTargetNonceRef.current = requestedUserTarget.nonce;
    setFilterMode(requestedUserTarget.filter || 'all');
    if (requestedUserTarget.searchQuery !== undefined) {
      setSearchQuery(requestedUserTarget.searchQuery);
    }
  }, [requestedUserTarget, usersList, members, populateCredentialFormFromMember]);

  const clearFormSelection = () => {
    setEditingUserId(null);
    setSelectedAccountId(null);
    setSelectedMemberId('');
    setNewName('');
    setNewEmail('');
    setNewPhone('');
    setSelectedRole('member');
    setSelectedDesignation('Member');
    setNewPassword('');
    setRequirePasswordChange(true);
    setErrorMsg(null);
  };

  const handleMemberPickerChange = (memberIdValue: string) => {
    if (!memberIdValue) {
      clearFormSelection();
      return;
    }
    const existingUser = usersList.find(
      (u) => u.memberId === memberIdValue || u.id === memberIdValue
    );
    if (existingUser) {
      populateCredentialFormFromMember(existingUser);
      return;
    }
    const mem = members.find((m) => m.id === memberIdValue);
    if (mem) {
      populateCredentialFormFromMember({
        memberId: mem.id,
        firstName: mem.firstName,
        lastName: mem.lastName,
        email: mem.email,
        phoneE164: mem.phoneE164,
        role: ((mem as { role?: ChurchRole }).role) || 'member',
        designation: mem.designation || mem.officerName || 'Member',
      });
    }
  };

  const stats = useMemo(() => {
    let membersCount = 0;
    let staffCount = 0;
    let activeLoginCount = 0;
    let tempPasswordCount = 0;
    let unprovisionedCount = 0;
    let suspendedCount = 0;

    for (const u of usersList) {
      if (u.role === 'member') membersCount += 1;
      else staffCount += 1;

      if (u.hasCredentials) {
        if (u.credentialStatus === 'suspended' || u.credentialStatus === 'locked') {
          suspendedCount += 1;
        } else if (u.credentialStatus === 'temp_password') {
          tempPasswordCount += 1;
          activeLoginCount += 1;
        } else {
          activeLoginCount += 1;
        }
      } else {
        unprovisionedCount += 1;
      }
    }

    return {
      total: usersList.length,
      membersCount,
      staffCount,
      activeLoginCount,
      tempPasswordCount,
      unprovisionedCount,
      suspendedCount,
    };
  }, [usersList]);

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return usersList.filter((u) => {
      if (filterMode === 'members' && u.role !== 'member') return false;
      if (filterMode === 'staff' && u.role === 'member') return false;
      if (filterMode === 'has_login' && !u.hasCredentials) return false;
      if (filterMode === 'unprovisioned' && u.hasCredentials) return false;
      if (filterMode === 'temp_password' && u.credentialStatus !== 'temp_password') return false;
      if (
        filterMode === 'suspended' &&
        u.credentialStatus !== 'suspended' &&
        u.credentialStatus !== 'locked'
      ) {
        return false;
      }

      if (!q) return true;
      return (
        u.fullName.toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.phoneE164 || '').toLowerCase().includes(q) ||
        (u.memberCode || '').toLowerCase().includes(q) ||
        (u.homeCellGroup || '').toLowerCase().includes(q) ||
        (u.department || '').toLowerCase().includes(q) ||
        (u.designation || '').toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q)
      );
    });
  }, [usersList, searchQuery, filterMode]);

  if (!canManageUsers) {
    return (
      <div className="p-8 text-center bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-500/20 rounded-2xl">
        <Shield className="w-12 h-12 text-rose-500 dark:text-rose-400 mx-auto mb-3" />
        <h3 className="text-lg font-semibold text-[#1D1B3A] dark:text-white">Access Denied</h3>
        <p className="text-sm text-[#666A86] dark:text-[#A9ACC8] mt-1">
          You need administrative or pastoral credentials to view or manage user accounts.
        </p>
      </div>
    );
  }

  const handleSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setProvisionedCred(null);

    const trimmedName = newName.trim();
    const trimmedEmail = newEmail.trim().toLowerCase();
    const trimmedPhone = newPhone.trim();
    const trimmedPassword = newPassword.trim();

    if (!trimmedName) {
      const msg = 'Full name is required.';
      setErrorMsg(msg);
      showToast(msg);
      return;
    }

    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      const msg = 'Please enter a valid email address.';
      setErrorMsg(msg);
      showToast(msg);
      return;
    }

    if (trimmedPassword && trimmedPassword.length < 8) {
      const msg = 'Custom password must be at least 8 characters long.';
      setErrorMsg(msg);
      showToast(msg);
      return;
    }

    // If editing an existing user profile without typing a new password, save profile via PATCH /api/users/:id
    if (editingUserId && !trimmedPassword) {
      if (!trimmedEmail && !trimmedPhone) {
        const msg = 'Please keep at least an email address or phone number.';
        setErrorMsg(msg);
        showToast(msg);
        return;
      }

      setSubmitting(true);
      try {
        const patchPayload = {
          fullName: trimmedName,
          email: trimmedEmail,
          phone: trimmedPhone,
          role: selectedRole,
          designation: selectedDesignation || 'Member',
        };
        const res = await fetch(`/api/users/${encodeURIComponent(editingUserId)}`, {
          method: 'PATCH',
          headers: getAuthHeaders(),
          body: JSON.stringify(patchPayload),
        });
        if (handleUnauthorizedSession(res.status)) return;
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.user) {
          const msg = data?.message || 'Could not update user account in Supabase.';
          setErrorMsg(msg);
          showToast(msg);
          return;
        }
        setUsersList((prev) => prev.map((row) => (row.id === editingUserId ? data.user : row)));
        showToast(`Updated ${data.user.fullName} in Supabase.`);
        clearFormSelection();
        await Promise.all([fetchUsers(), refreshMembers?.()]);
      } catch {
        const msg = 'Network error updating user profile in Supabase.';
        setErrorMsg(msg);
        showToast(msg);
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (!selectedMemberId && !selectedAccountId && !trimmedEmail && !trimmedPhone) {
      const msg = 'Select a member or enter an email address or phone number.';
      setErrorMsg(msg);
      showToast(msg);
      return;
    }
    if (!trimmedEmail && !trimmedPhone) {
      const msg = 'Please provide at least an email address or phone number for sign-in.';
      setErrorMsg(msg);
      showToast(msg);
      return;
    }

    setSubmitting(true);
    try {
      const credentialTargetId = editingUserId || selectedAccountId;
      const payload = {
        ...(credentialTargetId ? { credentialId: credentialTargetId } : {}),
        ...(selectedMemberId ? { memberId: selectedMemberId } : {}),
        fullName: trimmedName,
        ...(trimmedEmail ? { email: trimmedEmail } : {}),
        ...(trimmedPhone ? { phone: trimmedPhone } : {}),
        role: selectedRole,
        designation: selectedDesignation || 'Member',
        ...(trimmedPassword ? { password: trimmedPassword } : {}),
        requirePasswordChange,
      };

      const res = await fetch('/api/users/credentials', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });
      if (handleUnauthorizedSession(res.status)) return;

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.user) {
        const msg = data?.message || 'Could not save user login credentials to Supabase.';
        setErrorMsg(msg);
        showToast(msg);
        return;
      }

      const savedUser = data.user as ManagedUser;
      const loginIdentifier = savedUser.email || savedUser.phoneE164 || savedUser.fullName;
      setProvisionedCred({
        fullName: savedUser.fullName,
        identifier: loginIdentifier,
        email: savedUser.email,
        phoneE164: savedUser.phoneE164,
        role: savedUser.role,
        temporaryPassword: data.temporaryPassword,
        resetExisting: Boolean(data.resetExisting),
        mustChangePassword: Boolean(savedUser.mustChangePassword),
      });

      showToast(
        data.resetExisting
          ? `Credentials & data updated in Supabase for ${savedUser.fullName} (${ROLE_LABELS[savedUser.role] || savedUser.role}).`
          : `Saved & issued login in Supabase for ${savedUser.fullName} (${ROLE_LABELS[savedUser.role] || savedUser.role}).`
      );

      clearFormSelection();
      await Promise.all([fetchUsers(), refreshMembers?.()]);
    } catch {
      const msg = 'Network error saving user credentials to Supabase.';
      setErrorMsg(msg);
      showToast(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRoleUpdate = async (user: ManagedUser, nextRole: ChurchRole) => {
    if (nextRole === user.role || !canCreateUsers) return;
    setBusyUserId(user.id);
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(user.id)}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ role: nextRole }),
      });
      if (handleUnauthorizedSession(res.status)) return;
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.user) {
        showToast(data?.message || 'Failed to update user role.');
        return;
      }
      setUsersList((prev) => prev.map((row) => (row.id === user.id ? data.user : row)));
      showToast(`${user.fullName}'s role updated to ${ROLE_LABELS[nextRole] || nextRole}.`);
      await refreshMembers?.();
    } catch {
      showToast('Network error updating user role.');
    } finally {
      setBusyUserId(null);
    }
  };

  const handleDesignationUpdate = async (user: ManagedUser, nextDesignation: string) => {
    if (nextDesignation === (user.designation || 'Member') || !canCreateUsers) return;
    setBusyUserId(user.id);
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(user.id)}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ designation: nextDesignation }),
      });
      if (handleUnauthorizedSession(res.status)) return;
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.user) {
        showToast(data?.message || 'Failed to update church portfolio.');
        return;
      }
      setUsersList((prev) => prev.map((row) => (row.id === user.id ? data.user : row)));
      showToast(`${user.fullName}'s church portfolio set to ${nextDesignation}.`);
      await refreshMembers?.();
    } catch {
      showToast('Network error updating church portfolio.');
    } finally {
      setBusyUserId(null);
    }
  };

  const handleToggleAccountStatus = async (user: ManagedUser) => {
    if (!canCreateUsers) return;
    const isCurrentlyBlocked =
      user.status === 'suspended' || user.credentialStatus === 'locked';
    const targetStatus: 'active' | 'suspended' = isCurrentlyBlocked ? 'active' : 'suspended';

    setBusyUserId(user.id);
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(user.id)}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status: targetStatus }),
      });
      if (handleUnauthorizedSession(res.status)) return;
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.user) {
        showToast(data?.message || 'Failed to update account access status.');
        return;
      }
      setUsersList((prev) => prev.map((row) => (row.id === user.id ? data.user : row)));
      showToast(
        targetStatus === 'active'
          ? `${user.fullName}'s login access reactivated.`
          : `${user.fullName}'s login access suspended.`
      );
    } catch {
      showToast('Network error updating account access status.');
    } finally {
      setBusyUserId(null);
    }
  };

  const handleDeleteUserAccount = async (user: ManagedUser) => {
    if (!canCreateUsers) return;
    setConfirmDeleteUserId(null);
    setBusyUserId(user.id);
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(user.id)}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (handleUnauthorizedSession(res.status)) return;
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data?.message || 'Failed to delete user account.');
        return;
      }
      setUsersList((prev) => prev.filter((row) => row.id !== user.id));
      if (editingUserId === user.id || selectedMemberId === (user.memberId || user.id)) {
        clearFormSelection();
      }
      showToast(`Deleted user account for ${user.fullName}.`);
      await refreshMembers?.();
    } catch {
      showToast('Network error deleting user account.');
    } finally {
      setBusyUserId(null);
    }
  };

  const renderCredentialBadge = (u: ManagedUser) => {
    if (!u.hasCredentials || u.credentialStatus === 'unprovisioned') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/50">
          No Credentials Yet
        </span>
      );
    }
    if (u.credentialStatus === 'suspended') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800/50">
          <Ban className="w-3 h-3" />
          Suspended
        </span>
      );
    }
    if (u.credentialStatus === 'locked') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800/50">
          <Lock className="w-3 h-3" />
          Locked
        </span>
      );
    }
    if (u.credentialStatus === 'temp_password') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-[#EFEDFF] text-[#6D5CF2] border border-[#6D5CF2]/30 dark:bg-[#2A2A55] dark:text-[#9D90FF]">
          <KeyRound className="w-3 h-3" />
          Temp Password Active
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800/50">
        <UserCheck className="w-3 h-3" />
        Active Login
      </span>
    );
  };

  const selectedTargetHasLogin = useMemo(() => {
    if (!selectedMemberId && !selectedAccountId) return false;
    return usersList.some(
      (u) =>
        (u.id === selectedAccountId ||
          (selectedMemberId && (u.memberId === selectedMemberId || u.id === selectedMemberId))) &&
        u.hasCredentials
    );
  }, [selectedMemberId, selectedAccountId, usersList]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg sm:text-xl font-extrabold text-[#1D1B3A] dark:text-[#F2F2FA] flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-[#6D5CF2]" />
            <span>Member &amp; Staff User Credentials</span>
          </h2>
          <p className="text-xs text-[#666A86] dark:text-[#A9ACC8] mt-0.5">
            View member and staff login status, issue or reset temporary passwords, suspend access, and assign congregation roles.
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
            onClick={fetchUsers}
            disabled={loading}
            className="min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] flex items-center gap-1.5 cursor-pointer hover:border-[#6D5CF2]/40 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Live Credential Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3 min-w-0 w-full">
        <button
          type="button"
          onClick={() => setFilterMode('all')}
          className={`min-w-0 text-left p-3 sm:p-3.5 rounded-2xl border transition-all cursor-pointer ${
            filterMode === 'all'
              ? 'bg-[#EFEDFF] dark:bg-[#25234A] border-[#6D5CF2] shadow-xs'
              : 'bg-white dark:bg-[#1D1D3D] border-[#E9EBF5] dark:border-[#2D2D55]'
          }`}
        >
          <span className="text-[11px] font-semibold text-[#666A86] dark:text-[#A9ACC8] block truncate">
            Total Directory Users
          </span>
          <strong className="text-xl font-extrabold text-[#1D1B3A] dark:text-white tabular-nums">
            {stats.total}
          </strong>
          <span className="text-[10px] text-[#666A86] dark:text-[#A9ACC8] block mt-0.5 tabular-nums truncate">
            {stats.membersCount} members · {stats.staffCount} staff
          </span>
        </button>

        <button
          type="button"
          onClick={() => setFilterMode('has_login')}
          className={`min-w-0 text-left p-3 sm:p-3.5 rounded-2xl border transition-all cursor-pointer ${
            filterMode === 'has_login'
              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-500 shadow-xs'
              : 'bg-white dark:bg-[#1D1D3D] border-[#E9EBF5] dark:border-[#2D2D55]'
          }`}
        >
          <span className="text-[11px] font-semibold text-[#666A86] dark:text-[#A9ACC8] block truncate">
            Active Logins
          </span>
          <strong className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">
            {stats.activeLoginCount}
          </strong>
          <span className="text-[10px] text-[#666A86] dark:text-[#A9ACC8] block mt-0.5 truncate">
            Ready to sign in
          </span>
        </button>

        <button
          type="button"
          onClick={() => setFilterMode('temp_password')}
          className={`min-w-0 text-left p-3 sm:p-3.5 rounded-2xl border transition-all cursor-pointer ${
            filterMode === 'temp_password'
              ? 'bg-[#EFEDFF] dark:bg-[#25234A] border-[#6D5CF2] shadow-xs'
              : 'bg-white dark:bg-[#1D1D3D] border-[#E9EBF5] dark:border-[#2D2D55]'
          }`}
        >
          <span className="text-[11px] font-semibold text-[#666A86] dark:text-[#A9ACC8] block truncate">
            Temp Password
          </span>
          <strong className="text-xl font-extrabold text-[#6D5CF2] dark:text-[#9D90FF] tabular-nums">
            {stats.tempPasswordCount}
          </strong>
          <span className="text-[10px] text-[#666A86] dark:text-[#A9ACC8] block mt-0.5 truncate">
            Password change on next login
          </span>
        </button>

        <button
          type="button"
          onClick={() => setFilterMode('unprovisioned')}
          className={`min-w-0 text-left p-3 sm:p-3.5 rounded-2xl border transition-all cursor-pointer ${
            filterMode === 'unprovisioned'
              ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-500 shadow-xs'
              : 'bg-white dark:bg-[#1D1D3D] border-[#E9EBF5] dark:border-[#2D2D55]'
          }`}
        >
          <span className="text-[11px] font-semibold text-[#666A86] dark:text-[#A9ACC8] block truncate">
            No Credentials Yet
          </span>
          <strong className="text-xl font-extrabold text-amber-600 dark:text-amber-400 tabular-nums">
            {stats.unprovisionedCount}
          </strong>
          <span className="text-[10px] text-[#666A86] dark:text-[#A9ACC8] block mt-0.5 truncate">
            Needs email/phone login
          </span>
        </button>

        <button
          type="button"
          onClick={() => setFilterMode('suspended')}
          className={`col-span-2 sm:col-span-2 lg:col-span-1 min-w-0 text-left p-3 sm:p-3.5 rounded-2xl border transition-all cursor-pointer ${
            filterMode === 'suspended'
              ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-500 shadow-xs'
              : 'bg-white dark:bg-[#1D1D3D] border-[#E9EBF5] dark:border-[#2D2D55]'
          }`}
        >
          <span className="text-[11px] font-semibold text-[#666A86] dark:text-[#A9ACC8] block truncate">
            Suspended / Locked
          </span>
          <strong className="text-xl font-extrabold text-rose-600 dark:text-rose-400 tabular-nums">
            {stats.suspendedCount}
          </strong>
          <span className="text-[10px] text-[#666A86] dark:text-[#A9ACC8] block mt-0.5 truncate">
            Blocked or rate-locked
          </span>
        </button>
      </div>

      {/* Issue / Reset Credentials Form (Admin & Super Admin) */}
      {canCreateUsers && (
        <form
          ref={formRef}
          noValidate
          onSubmit={handleSaveCredentials}
          className="bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] rounded-2xl sm:rounded-3xl p-5 space-y-4 shadow-xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#1D1B3A] dark:text-[#F2F2FA] flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-[#6D5CF2]" />
                <span>
                  {editingUserId
                    ? `Edit User Account — ${newName || 'Selected Account'}`
                    : selectedMemberId
                    ? selectedTargetHasLogin
                      ? `Reset Credentials & Role — ${newName || 'Selected Member'}`
                      : `Issue Login Credentials — ${newName || 'Selected Member'}`
                    : 'Issue Member / Staff Login Credentials'}
                </span>
              </h3>
              <p className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] mt-0.5">
                {editingUserId
                  ? 'Update name, email, phone, portfolio, or access role directly — or enter a new password below to reset login credentials.'
                  : 'Pick an enrolled congregation member to issue or reset their login, or create a brand-new user account.'}
              </p>
            </div>
            {(selectedMemberId || editingUserId) && (
              <button
                type="button"
                onClick={clearFormSelection}
                className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-white flex items-center gap-1 cursor-pointer"
              >
                <X className="w-3 h-3" />
                <span>{editingUserId ? 'Cancel Edit' : 'Clear Selection'}</span>
              </button>
            )}
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/50 text-xs font-semibold text-rose-700 dark:text-rose-300">
              {errorMsg}
            </div>
          )}

          {provisionedCred && (
            <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 text-xs space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-bold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4" />
                  <span>
                    {provisionedCred.resetExisting
                      ? `Credentials updated in Supabase for ${provisionedCred.fullName}`
                      : `Credentials issued in Supabase for ${provisionedCred.fullName}`}
                  </span>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-white dark:bg-[#14142E] text-emerald-700 dark:text-emerald-300 font-bold text-[10px]">
                  {ROLE_LABELS[provisionedCred.role] || provisionedCred.role}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-emerald-800 dark:text-emerald-300">
                {provisionedCred.email && (
                  <span>
                    Email: <code className="font-mono font-bold">{provisionedCred.email}</code>
                  </span>
                )}
                {provisionedCred.phoneE164 && (
                  <span>
                    Phone: <code className="font-mono font-bold">{provisionedCred.phoneE164}</code>
                  </span>
                )}
              </div>

              {provisionedCred.temporaryPassword ? (
                <div className="flex flex-wrap items-center gap-2 text-emerald-900 dark:text-emerald-200 pt-1">
                  <span className="font-semibold">Temporary Password:</span>
                  <code className="px-2.5 py-1 rounded-lg bg-white dark:bg-[#14142E] border border-emerald-200 dark:border-emerald-800 font-mono font-bold text-sm">
                    {provisionedCred.temporaryPassword}
                  </code>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(provisionedCred.temporaryPassword || '');
                      setCopiedField('pass');
                      setTimeout(() => setCopiedField(null), 1800);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-white dark:bg-[#14142E] border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 font-bold flex items-center gap-1 cursor-pointer"
                    title="Copy temporary password"
                  >
                    {copiedField === 'pass' ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Password</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const summary = `Ekklesphere Login Details\nName: ${provisionedCred.fullName}\nRole: ${
                        ROLE_LABELS[provisionedCred.role] || provisionedCred.role
                      }\nLogin: ${provisionedCred.identifier}\nTemporary Password: ${
                        provisionedCred.temporaryPassword
                      }`;
                      navigator.clipboard?.writeText(summary);
                      setCopiedField('bundle');
                      setTimeout(() => setCopiedField(null), 1800);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    {copiedField === 'bundle' ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Copied Details</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Full Invite</span>
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <p className="text-emerald-800 dark:text-emerald-300">
                  Custom password saved.{' '}
                  {provisionedCred.mustChangePassword
                    ? 'User will be prompted to set a personal password on next login.'
                    : 'User can sign in immediately with the password set above.'}
                </p>
              )}
            </div>
          )}

          {/* Target Enrolled Member Picker */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
            <div className="sm:col-span-2 lg:col-span-2">
              <label className="block text-[11px] font-bold text-[#666A86] dark:text-[#A9ACC8] mb-1">
                Target Member / User
              </label>
              <select
                aria-label="Select enrolled member or create new user"
                value={selectedMemberId || selectedAccountId || ''}
                onChange={(e) => handleMemberPickerChange(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] rounded-xl text-xs text-[#1D1B3A] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#6D5CF2]"
              >
                <option value="">— Create New User / Staff Account —</option>
                {usersList.map((u) => (
                  <option key={u.id} value={u.memberId || u.id}>
                    {u.fullName}
                    {u.memberCode ? ` (${u.memberCode})` : ''}
                    {u.hasCredentials ? ' · Has Login' : ' · No Credentials'}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#666A86] dark:text-[#A9ACC8] mb-1">
                Full Name *
              </label>
              <input
                type="text"
                placeholder="e.g. Kwame Boateng"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full min-h-[42px] px-3.5 py-2 bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] rounded-xl text-xs text-[#1D1B3A] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#666A86] dark:text-[#A9ACC8] mb-1">
                Sign-in Email
              </label>
              <input
                type="email"
                placeholder="member@church.org"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="w-full min-h-[42px] px-3.5 py-2 bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] rounded-xl text-xs text-[#1D1B3A] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#6D5CF2]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#666A86] dark:text-[#A9ACC8] mb-1">
                Phone Number (E.164 or local)
              </label>
              <input
                type="tel"
                placeholder="+233240000000"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                className="w-full min-h-[42px] px-3.5 py-2 bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] rounded-xl text-xs text-[#1D1B3A] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#6D5CF2]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#666A86] dark:text-[#A9ACC8] mb-1">
                Church Portfolio
              </label>
              <select
                aria-label="Select church portfolio"
                value={selectedDesignation}
                onChange={(e) => setSelectedDesignation(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] rounded-xl text-xs text-[#1D1B3A] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#6D5CF2]"
              >
                {CHURCH_PORTFOLIO_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#666A86] dark:text-[#A9ACC8] mb-1">
                Access Role *
              </label>
              <select
                aria-label="Select access role"
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value as ChurchRole)}
                className="w-full min-h-[42px] px-3 py-2 bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] rounded-xl text-xs text-[#1D1B3A] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#6D5CF2]"
              >
                <option value="member">Member (Member Portal)</option>
                <option value="group_leader">Cell / Fellowship Leader</option>
                <option value="usher">Door Usher / Greeter</option>
                <option value="finance">Finance Officer</option>
                <option value="pastor">Pastor / Ministry Lead</option>
                <option value="admin">Church Administrator</option>
                {isSuperAdmin && <option value="super_admin">Platform Super Admin</option>}
              </select>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-1">
              <input
                type="password"
                placeholder="Custom password (min 8 chars) — leave blank to auto-generate temporary password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={8}
                className="sm:max-w-md w-full min-h-[42px] px-3.5 py-2 bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] rounded-xl text-xs text-[#1D1B3A] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#6D5CF2]"
              />
              <label className="inline-flex items-center gap-2 text-xs text-[#666A86] dark:text-[#A9ACC8] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={requirePasswordChange}
                  onChange={(e) => setRequirePasswordChange(e.target.checked)}
                  className="rounded text-[#6D5CF2] focus:ring-[#6D5CF2]"
                />
                <span>Require personal password change on next sign-in</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="min-h-[44px] px-5 py-2.5 bg-[#6D5CF2] hover:bg-[#5b4be0] text-white text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 whitespace-nowrap"
            >
              {editingUserId && !newPassword.trim() ? (
                <Edit3 className="w-4 h-4" />
              ) : (selectedMemberId || selectedAccountId) && selectedTargetHasLogin ? (
                <RotateCcw className="w-4 h-4" />
              ) : (
                <KeyRound className="w-4 h-4" />
              )}
              <span>
                {submitting
                  ? 'Updating Supabase...'
                  : editingUserId && !newPassword.trim()
                  ? 'Save Changes to Supabase'
                  : (selectedMemberId || selectedAccountId) && selectedTargetHasLogin
                  ? 'Reset Credentials & Update Supabase'
                  : 'Issue Credentials & Save to Supabase'}
              </span>
            </button>
          </div>
        </form>
      )}

      {/* Search, Filters & Directory List */}
      <div className="bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] rounded-2xl sm:rounded-3xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-[#6D5CF2]" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#1D1B3A] dark:text-[#F2F2FA]">
              User Accounts &amp; Member Credentials ({filteredUsers.length} of {usersList.length})
            </h3>
          </div>

          <div className="relative w-full lg:max-w-sm">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#666A86] dark:text-[#A9ACC8]" />
            <input
              type="text"
              placeholder="Search name, email, phone, member ID, cell..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full min-h-[40px] pl-8 pr-8 py-1.5 text-xs rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] placeholder-[#666A86] dark:placeholder-[#A9ACC8] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setFilterMode(opt.id)}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-colors cursor-pointer ${
                filterMode === opt.id
                  ? 'bg-[#6D5CF2] text-white shadow-xs'
                  : 'bg-[#F6F7FC] dark:bg-[#14142E] text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-white border border-[#E9EBF5] dark:border-[#2D2D55]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {filteredUsers.length === 0 ? (
          <div className="py-10 text-center text-xs text-[#666A86] dark:text-[#A9ACC8]">
            {loading
              ? 'Loading member & staff user accounts from Supabase...'
              : 'No member or staff accounts match your current search or filter.'}
          </div>
        ) : (
          <div className="divide-y divide-[#E9EBF5] dark:divide-[#2D2D55]">
            {filteredUsers.map((u) => {
              const isSelf =
                Boolean(currentUser?.id) &&
                (u.id === currentUser?.id || u.memberId === currentUser?.id);
              const isBlocked = u.status === 'suspended' || u.credentialStatus === 'locked';
              const isBusy = busyUserId === u.id;

              return (
                <div
                  key={u.id}
                  className="py-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs"
                >
                  {/* Person & Contact Metadata */}
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-extrabold text-sm text-[#1D1B3A] dark:text-[#F2F2FA]">
                        {u.fullName}
                      </span>
                      {u.memberCode && (
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-[#14142E] text-[#666A86] dark:text-[#A9ACC8] font-mono text-[10px] font-bold">
                          {u.memberCode}
                        </span>
                      )}
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          u.accountCategory === 'member'
                            ? 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300'
                            : 'bg-[#EFEDFF] text-[#6D5CF2] dark:bg-[#2A2A55] dark:text-[#9D90FF]'
                        }`}
                      >
                        {u.accountCategory === 'member' ? 'Member' : 'Staff / Leader'}
                      </span>
                      {u.designation && u.designation !== 'Member' && (
                        <span className="px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 text-[10px] font-bold">
                          {u.designation}
                        </span>
                      )}
                      {renderCredentialBadge(u)}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[#666A86] dark:text-[#A9ACC8]">
                      <span className="inline-flex items-center gap-1">
                        <Mail className="w-3 h-3" />
                        <span className="font-mono">{u.email || 'No email on file'}</span>
                      </span>
                      {u.phoneE164 && (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          <span className="font-mono">{u.phoneE164}</span>
                        </span>
                      )}
                      {(u.homeCellGroup || u.department) && (
                        <span>
                          {[u.homeCellGroup, u.department].filter(Boolean).join(' · ')}
                        </span>
                      )}
                      {u.lastLoginAt && (
                        <span className="text-[11px]">
                          Last login:{' '}
                          {new Date(u.lastLoginAt).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Portfolio + Role Selector + Call + Credential & Access Actions */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {(u.phoneE164 || u.email) && (
                      <ContactCallButton
                        compact
                        contactName={u.fullName}
                        contactPhone={u.phoneE164}
                        contactEmail={u.email}
                        contactRole={u.designation || ROLE_LABELS[u.role]}
                        contactGroup={u.homeCellGroup || u.department}
                      />
                    )}

                    {canCreateUsers && (
                      <select
                        aria-label={`Church portfolio for ${u.fullName}`}
                        value={u.designation || 'Member'}
                        disabled={isBusy}
                        onChange={(e) => handleDesignationUpdate(u, e.target.value)}
                        className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] font-semibold text-xs outline-none focus:ring-2 focus:ring-[#6D5CF2] cursor-pointer disabled:opacity-50"
                      >
                        {!CHURCH_PORTFOLIOS.some(
                          (p) => p.toLowerCase() === (u.designation || 'Member').toLowerCase()
                        ) && (
                          <option value={u.designation || 'Member'}>
                            {u.designation || 'Member'}
                          </option>
                        )}
                        {CHURCH_PORTFOLIO_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    )}

                    {canCreateUsers ? (
                      <select
                        aria-label={`Role for ${u.fullName}`}
                        value={u.role}
                        disabled={isBusy}
                        onChange={(e) => handleRoleUpdate(u, e.target.value as ChurchRole)}
                        className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] font-bold text-xs outline-none focus:ring-2 focus:ring-[#6D5CF2] cursor-pointer disabled:opacity-50"
                      >
                        <option value="member">Member</option>
                        <option value="group_leader">Cell / Group Leader</option>
                        <option value="usher">Door Usher</option>
                        <option value="finance">Finance Officer</option>
                        <option value="pastor">Pastor</option>
                        <option value="admin">Church Admin</option>
                        {(isSuperAdmin || u.role === 'super_admin') && (
                          <option value="super_admin">Platform Super Admin</option>
                        )}
                      </select>
                    ) : (
                      <span className="px-2.5 py-1 rounded-lg bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] font-bold uppercase text-[10px]">
                        {ROLE_LABELS[u.role] || u.role.replace('_', ' ')}
                      </span>
                    )}

                    {canCreateUsers && (
                      <>
                        <button
                          type="button"
                          onClick={() => populateCredentialFormFromMember(u, 'edit')}
                          title={`Edit ${u.fullName}'s profile & role`}
                          aria-label={`Edit ${u.fullName}`}
                          className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-[#F6F7FC] hover:bg-[#EFEDFF] dark:bg-[#14142E] dark:hover:bg-[#2A2A55] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] font-bold text-xs flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-[#6D5CF2]" />
                          <span>Edit</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => populateCredentialFormFromMember(u, 'credentials')}
                          className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#EFEDFF] hover:bg-[#E2DEFF] dark:bg-[#2A2A55] dark:hover:bg-[#35356B] text-[#6D5CF2] dark:text-[#A398FF] font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          {u.hasCredentials ? (
                            <>
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>Reset Password</span>
                            </>
                          ) : (
                            <>
                              <KeyRound className="w-3.5 h-3.5" />
                              <span>Issue Login</span>
                            </>
                          )}
                        </button>

                        {u.hasCredentials && !isSelf && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleToggleAccountStatus(u)}
                            className={`min-h-[38px] px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 ${
                              isBlocked
                                ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50'
                                : 'bg-amber-50 hover:bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50'
                            }`}
                          >
                            {isBlocked ? (
                              <>
                                <UserCheck className="w-3.5 h-3.5" />
                                <span>Reactivate</span>
                              </>
                            ) : (
                              <>
                                <Ban className="w-3.5 h-3.5" />
                                <span>Suspend</span>
                              </>
                            )}
                          </button>
                        )}

                        {!isSelf && (
                          confirmDeleteUserId === u.id ? (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleDeleteUserAccount(u)}
                              className="min-h-[38px] px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Confirm</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => setConfirmDeleteUserId(u.id)}
                              title={`Delete ${u.fullName}`}
                              aria-label={`Delete ${u.fullName}`}
                              className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:hover:bg-rose-950/70 dark:text-rose-300 border border-rose-200 dark:border-rose-800/50 font-bold text-xs flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete</span>
                            </button>
                          )
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
