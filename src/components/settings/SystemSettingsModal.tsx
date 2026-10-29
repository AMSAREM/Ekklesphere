import React, { useEffect } from 'react';
import { useEkklesphere } from '../../context/EkklesphereContext';
import { SystemSettingsPanel } from '../admin/SystemSettingsPanel';

export const SystemSettingsModal: React.FC = () => {
  const { isSettingsModalOpen, setIsSettingsModalOpen } = useEkklesphere();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isSettingsModalOpen) {
        setIsSettingsModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSettingsModalOpen, setIsSettingsModalOpen]);

  if (!isSettingsModalOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="System Settings Configuration"
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 md:p-6 animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          setIsSettingsModalOpen(false);
        }
      }}
    >
      <div className="bg-[#F6F7FC] dark:bg-[#14142E] rounded-3xl max-w-5xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-[#E9EBF5] dark:border-[#2D2D55] overflow-y-auto p-3 sm:p-6 animate-in zoom-in-95 duration-150">
        <SystemSettingsPanel onClose={() => setIsSettingsModalOpen(false)} isModal />
      </div>
    </div>
  );
};
