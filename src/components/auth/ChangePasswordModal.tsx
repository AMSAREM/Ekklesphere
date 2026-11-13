import React, { useState, useEffect } from 'react';
import { useEkklesphere } from '../../context/EkklesphereContext';
import { Lock, Eye, EyeOff, KeyRound, AlertCircle, CheckCircle2, X, Loader2 } from 'lucide-react';

export const ChangePasswordModal: React.FC = () => {
  const {
    currentUser,
    isChangePasswordModalOpen,
    setIsChangePasswordModalOpen,
    changePassword,
  } = useEkklesphere();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isChangePasswordModalOpen) {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setErrorMessage(null);
      setIsSubmitting(false);
    }
  }, [isChangePasswordModalOpen]);

  useEffect(() => {
    if (!isChangePasswordModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        setIsChangePasswordModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isChangePasswordModalOpen, isSubmitting, setIsChangePasswordModalOpen]);

  if (!isChangePasswordModalOpen || !currentUser) return null;

  const isTemporaryOnboardingPassword = Boolean(currentUser.mustChangePassword);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!currentPassword.trim()) {
      setErrorMessage('Please enter your current or temporary onboarding password.');
      return;
    }
    if (newPassword.trim().length < 8) {
      setErrorMessage('New password must be at least 8 characters long.');
      return;
    }
    if (newPassword.trim() === currentPassword.trim()) {
      setErrorMessage('Please choose a new password that differs from your current password.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage('New password and confirmation do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await changePassword(currentPassword, newPassword, confirmPassword);
      if (!result.ok) {
        setErrorMessage(result.error || 'Could not update your password.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="change-password-title"
    >
      <div className="w-full max-w-md bg-white dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] rounded-3xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E9EBF5] dark:border-[#2D2D55] flex items-center justify-between bg-slate-50/60 dark:bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#6D5CF2]/10 dark:bg-[#6D5CF2]/20 text-[#6D5CF2] dark:text-[#8C7DFF] flex items-center justify-center shrink-0">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h2
                id="change-password-title"
                className="text-base font-bold text-[#1D1B3A] dark:text-[#F2F2FA]"
              >
                {isTemporaryOnboardingPassword ? 'Set Your Personal Password' : 'Change Account Password'}
              </h2>
              <p className="text-xs text-[#666A86] dark:text-[#A9ACC8] truncate max-w-[260px]">
                {currentUser.email || currentUser.name}
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => setIsChangePasswordModalOpen(false)}
            aria-label="Close password modal"
            className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {isTemporaryOnboardingPassword && (
            <div className="p-3.5 rounded-2xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
              Your account was automatically provisioned with a temporary onboarding password. Update it now to keep your Member Portal account private.
            </div>
          )}

          {errorMessage && (
            <div
              role="alert"
              className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 flex items-start gap-2 text-xs text-rose-700 dark:text-rose-300"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div>
            <label
              htmlFor="cp-current-password"
              className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1.5"
            >
              {isTemporaryOnboardingPassword ? 'Temporary Onboarding Password' : 'Current Password'}
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="cp-current-password"
                type={showCurrent ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder={
                  isTemporaryOnboardingPassword
                    ? 'Enter your assigned temporary password'
                    : 'Enter current password'
                }
                className="w-full pl-10 pr-10 py-2.5 text-xs rounded-xl border border-[#E3E5F2] dark:border-[#2D2D55] bg-white dark:bg-[#1A1A3A] text-[#1D1B3A] dark:text-[#F2F2FA] focus:outline-none focus:ring-2 focus:ring-[#6D5CF2]"
              />
              <button
                type="button"
                onClick={() => setShowCurrent((v) => !v)}
                aria-label={showCurrent ? 'Hide current password' : 'Show current password'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label
              htmlFor="cp-new-password"
              className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1.5"
            >
              New Personal Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="cp-new-password"
                type={showNew ? 'text' : 'password'}
                autoComplete="new-password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full pl-10 pr-10 py-2.5 text-xs rounded-xl border border-[#E3E5F2] dark:border-[#2D2D55] bg-white dark:bg-[#1A1A3A] text-[#1D1B3A] dark:text-[#F2F2FA] focus:outline-none focus:ring-2 focus:ring-[#6D5CF2]"
              />
              <button
                type="button"
                onClick={() => setShowNew((v) => !v)}
                aria-label={showNew ? 'Hide new password' : 'Show new password'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label
              htmlFor="cp-confirm-password"
              className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1.5"
            >
              Confirm New Password
            </label>
            <div className="relative">
              <CheckCircle2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="cp-confirm-password"
                type={showConfirm ? 'text' : 'password'}
                autoComplete="new-password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your new password"
                className="w-full pl-10 pr-10 py-2.5 text-xs rounded-xl border border-[#E3E5F2] dark:border-[#2D2D55] bg-white dark:bg-[#1A1A3A] text-[#1D1B3A] dark:text-[#F2F2FA] focus:outline-none focus:ring-2 focus:ring-[#6D5CF2]"
              />
              <button
                type="button"
                onClick={() => setShowConfirm((v) => !v)}
                aria-label={showConfirm ? 'Hide confirmation password' : 'Show confirmation password'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => setIsChangePasswordModalOpen(false)}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-[#666A86] dark:text-[#A9ACC8] hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
            >
              {isTemporaryOnboardingPassword ? 'Later' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold bg-[#6D5CF2] text-white hover:bg-[#5b4be0] disabled:opacity-60 shadow-sm transition-all cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Updating...</span>
                </>
              ) : (
                <span>Update Password</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
