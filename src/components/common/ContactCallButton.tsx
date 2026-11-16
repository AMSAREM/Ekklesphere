import React, { useState } from 'react';
import { PhoneCall } from 'lucide-react';
import { buildTelHref } from '../../utils/phoneCall';
import { ContactCallModal } from './ContactCallModal';

export interface ContactCallButtonProps {
  contactName: string;
  contactPhone?: string | null;
  contactEmail?: string | null;
  contactRole?: string | null;
  contactGroup?: string | null;
  label?: string;
  compact?: boolean;
  className?: string;
  onLogOutcome?: (outcome: string, markResolved: boolean) => void | Promise<void>;
  onTriggerSms?: () => void;
}

export const ContactCallButton: React.FC<ContactCallButtonProps> = ({
  contactName,
  contactPhone,
  contactEmail,
  contactRole,
  contactGroup,
  label = 'Call',
  compact = false,
  className,
  onLogOutcome,
  onTriggerSms,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const telHref = buildTelHref(contactPhone);

  const defaultClass = compact
    ? `p-1.5 rounded-lg text-xs font-bold transition-colors inline-flex items-center justify-center gap-1 cursor-pointer ${
        telHref
          ? 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
          : 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
      }`
    : `px-3 py-1.5 min-h-[34px] rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer ${
        telHref
          ? 'bg-[#6D5CF2] hover:bg-[#5B4BE0] text-white'
          : 'bg-slate-100 dark:bg-white/5 text-slate-400 dark:text-slate-500'
      }`;

  return (
    <>
      {telHref ? (
        <a
          href={telHref}
          onClick={() => setIsOpen(true)}
          title={`Call ${contactName} (${contactPhone})`}
          aria-label={`Call ${contactName}`}
          className={className || defaultClass}
        >
          <PhoneCall className="w-3.5 h-3.5 shrink-0" />
          {!compact && <span>{label}</span>}
        </a>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          title={`No phone number for ${contactName}`}
          aria-label={`No phone number for ${contactName}`}
          className={className || defaultClass}
        >
          <PhoneCall className="w-3.5 h-3.5 shrink-0" />
          {!compact && <span>{label}</span>}
        </button>
      )}

      <ContactCallModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        contactName={contactName}
        contactPhone={contactPhone}
        contactEmail={contactEmail}
        contactRole={contactRole}
        contactGroup={contactGroup}
        onLogOutcome={onLogOutcome}
        onTriggerSms={onTriggerSms}
      />
    </>
  );
};
