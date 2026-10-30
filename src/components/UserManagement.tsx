// src/components/UserManagement.tsx - Church RBAC User Management Component
import React, { useState } from 'react';
import { useEkklesphere } from '../context/EkklesphereContext';
import { Shield, UserPlus } from 'lucide-react';
import { ChurchRole } from '../../lib/auth';

export interface ManagedUser {
  id: string;
  email: string;
  role: ChurchRole;
  campus_id: string;
  name: string;
  status: 'active' | 'suspended';
}

export const UserManagement: React.FC = () => {
  const { currentUser, showToast } = useEkklesphere();
  const [selectedRole, setSelectedRole] = useState<ChurchRole>('pastor');
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');

  const isSuperAdmin = currentUser?.role === 'super_admin' || currentUser?.role === 'creator';
  const canManageUsers = isSuperAdmin || currentUser?.role === 'admin';

  if (!canManageUsers) {
    return (
      <div className="p-8 text-center bg-red-950/20 border border-red-500/20 rounded-xl">
        <Shield className="w-12 h-12 text-red-400 mx-auto mb-3" />
        <h3 className="text-lg font-semibold text-white">Access Denied</h3>
        <p className="text-sm text-zinc-400 mt-1">
          You need administrative credentials to manage system users.
        </p>
      </div>
    );
  }

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    showToast(`Church staff account created for ${newName} (${newEmail}) with role ${selectedRole}.`);
    setNewEmail('');
    setNewName('');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-indigo-400" />
            Church Staff & Access Management
          </h2>
          <p className="text-sm text-zinc-400 mt-0.5">
            Role-based access control for pastors, ushers, group leaders, finance, and administrators.
          </p>
        </div>
        {isSuperAdmin && (
          <span className="px-3 py-1 bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs rounded-full font-medium">
            Platform Super-Admin Scope
          </span>
        )}
      </div>

      <form onSubmit={handleCreateUser} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-emerald-400" />
          Provision Church Staff Account
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input
            type="text"
            placeholder="Full Name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
            required
          />
          <input
            type="email"
            placeholder="Official Email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
            required
          />
          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value as ChurchRole)}
            className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
          >
            <option value="pastor">Pastor / Ministry Lead</option>
            <option value="usher">Door Usher / Greeter</option>
            <option value="group_leader">Cell / Fellowship Leader</option>
            <option value="finance">Finance Officer</option>
            <option value="admin">Church Administrator</option>
            {isSuperAdmin && <option value="super_admin">Platform Super Admin</option>}
          </select>
        </div>
        <button
          type="submit"
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
        >
          <UserPlus className="w-4 h-4" />
          Create Staff User
        </button>
      </form>
    </div>
  );
};
