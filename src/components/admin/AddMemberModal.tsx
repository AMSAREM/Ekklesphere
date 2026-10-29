import React, { useState } from 'react';
import { useEkklesphere } from '../../context/EkklesphereContext';
import { Person, MemberStatus } from '../../types/ekklesphere';
import { X, UserPlus, Check, Sparkles, Phone, Mail, Users, Shield, FileText } from 'lucide-react';

interface AddMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMemberAdded?: (member: Person) => void;
  initialData?: Person | null;
}

const COMMON_CELL_GROUPS = [
  'Osu North cell',
  'Ridge Fellowship',
  'Cantonments Cell',
  'Choir & Music Ministry',
  'Youth & Young Adults',
  'Ushers & Greeters',
  'Men’s Fellowship',
  'Women of Faith',
  'Media & Tech Team',
  'Children’s Ministry Workers',
];

export const AddMemberModal: React.FC<AddMemberModalProps> = ({
  isOpen,
  onClose,
  onMemberAdded,
  initialData,
}) => {
  const { addMember, updateMember, showToast } = useEkklesphere();

  const [firstName, setFirstName] = useState(initialData?.firstName || '');
  const [lastName, setLastName] = useState(initialData?.lastName || '');
  const [preferredName, setPreferredName] = useState(initialData?.preferredName || '');
  const [phone, setPhone] = useState(initialData?.phoneE164 || '');
  const [email, setEmail] = useState(initialData?.email || '');
  const [groupName, setGroupName] = useState(initialData?.groupName || 'Osu North cell');
  const [customGroup, setCustomGroup] = useState('');
  const [isCustomGroup, setIsCustomGroup] = useState(false);
  const [status, setStatus] = useState<MemberStatus>(initialData?.status || 'member');
  const [householdRole, setHouseholdRole] = useState<'head' | 'spouse' | 'child' | 'other'>(
    initialData?.householdRole || 'head'
  );
  const [autoCheckinOptedIn, setAutoCheckinOptedIn] = useState(
    initialData ? initialData.autoCheckinOptedIn : true
  );
  const [notes, setNotes] = useState(initialData?.notes || '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (!isOpen) return null;

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!firstName.trim()) newErrors.firstName = 'First name is required';
    if (!lastName.trim()) newErrors.lastName = 'Last name is required';
    if (!phone.trim()) {
      newErrors.phone = 'Phone number is required';
    } else {
      const cleanPhone = phone.replace(/[\s-()]/g, '');
      if (cleanPhone.length < 9) {
        newErrors.phone = 'Please enter a valid phone number';
      }
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = 'Please enter a valid email address';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const formatE164 = (raw: string) => {
    let clean = raw.trim().replace(/[\s-()]/g, '');
    if (clean.startsWith('0')) {
      clean = '+233' + clean.slice(1);
    } else if (!clean.startsWith('+')) {
      clean = '+233' + clean;
    }
    return clean;
  };

  const handleSubmit = (e?: React.FormEvent, addAnother: boolean = false) => {
    if (e) e.preventDefault();
    if (!validate()) return;

    const finalGroup = isCustomGroup && customGroup.trim() ? customGroup.trim() : groupName;
    const finalPhone = formatE164(phone);

    if (initialData) {
      updateMember(initialData.id, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        preferredName: preferredName.trim() || undefined,
        phoneE164: finalPhone,
        email: email.trim() || undefined,
        groupName: finalGroup,
        status,
        householdRole,
        autoCheckinOptedIn,
        notes: notes.trim() || undefined,
      });
      onClose();
    } else {
      const created = addMember({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        preferredName: preferredName.trim() || undefined,
        phoneE164: finalPhone,
        email: email.trim() || undefined,
        groupName: finalGroup,
        status,
        householdRole,
        autoCheckinOptedIn,
        consecutiveAbsences: 0,
        notes: notes.trim() || undefined,
      });

      if (onMemberAdded) {
        onMemberAdded(created);
      }

      if (addAnother) {
        // Reset form for next entry
        setFirstName('');
        setLastName('');
        setPreferredName('');
        setPhone('');
        setEmail('');
        setNotes('');
        setErrors({});
        showToast('Member added! Ready for next entry.');
      } else {
        onClose();
      }
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-member-modal-title"
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150"
    >
      <div className="bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl max-w-xl w-full p-5 sm:p-7 shadow-2xl border border-[#E9EBF5] dark:border-[#2D2D55] my-auto max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#E9EBF5] dark:border-[#2D2D55] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] flex items-center justify-center">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h2
                id="add-member-modal-title"
                className="text-lg sm:text-xl font-bold text-[#1D1B3A] dark:text-[#F2F2FA]"
              >
                {initialData ? 'Edit Member Profile' : 'Add New Member'}
              </h2>
              <p className="text-xs text-[#666A86] dark:text-[#A9ACC8]">
                Enrolls member into Accra Central church directory & automated proximity check-in.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={(e) => handleSubmit(e, false)} className="space-y-4 pt-4 overflow-y-auto flex-1 pr-1">
          {/* First & Last Name */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                First Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="e.g. Kwesi"
                className={`w-full px-3 py-2 text-xs rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border ${
                  errors.firstName ? 'border-rose-500' : 'border-[#E9EBF5] dark:border-[#2D2D55]'
                } text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]`}
              />
              {errors.firstName && <p className="text-[10px] text-rose-500 mt-0.5">{errors.firstName}</p>}
            </div>

            <div>
              <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                Last Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="e.g. Mensah"
                className={`w-full px-3 py-2 text-xs rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border ${
                  errors.lastName ? 'border-rose-500' : 'border-[#E9EBF5] dark:border-[#2D2D55]'
                } text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]`}
              />
              {errors.lastName && <p className="text-[10px] text-rose-500 mt-0.5">{errors.lastName}</p>}
            </div>
          </div>

          {/* Preferred Name (Optional) */}
          <div>
            <label className="block text-xs font-semibold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
              Preferred Name / Alias <span className="text-[#666A86] dark:text-[#A9ACC8] font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={preferredName}
              onChange={(e) => setPreferredName(e.target.value)}
              placeholder="e.g. Uncle Kwesi"
              className="w-full px-3 py-2 text-xs rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
            />
          </div>

          {/* Contact Information */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-[#6D5CF2]" />
                <span>Phone (E.164)</span>
                <span className="text-rose-500">*</span>
              </label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="024 123 4567 or +233..."
                className={`w-full px-3 py-2 text-xs rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border ${
                  errors.phone ? 'border-rose-500' : 'border-[#E9EBF5] dark:border-[#2D2D55]'
                } text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2] font-mono`}
              />
              {errors.phone ? (
                <p className="text-[10px] text-rose-500 mt-0.5">{errors.phone}</p>
              ) : (
                <p className="text-[10px] text-[#666A86] dark:text-[#A9ACC8] mt-0.5">
                  Format: Ghana 02X... or +233...
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-[#6D5CF2]" />
                <span>Email Address</span>
                <span className="text-[#666A86] dark:text-[#A9ACC8] font-normal">(optional)</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="member@example.com"
                className={`w-full px-3 py-2 text-xs rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border ${
                  errors.email ? 'border-rose-500' : 'border-[#E9EBF5] dark:border-[#2D2D55]'
                } text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]`}
              />
              {errors.email && <p className="text-[10px] text-rose-500 mt-0.5">{errors.email}</p>}
            </div>
          </div>

          {/* Cell Group & Household */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-[#6D5CF2]" />
                <span>Cell Group / Fellowship</span>
              </label>
              {!isCustomGroup ? (
                <div className="space-y-1.5">
                  <select
                    value={groupName}
                    onChange={(e) => {
                      if (e.target.value === '__other__') {
                        setIsCustomGroup(true);
                      } else {
                        setGroupName(e.target.value);
                      }
                    }}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                  >
                    {COMMON_CELL_GROUPS.map((grp) => (
                      <option key={grp} value={grp}>
                        {grp}
                      </option>
                    ))}
                    <option value="__other__">+ Enter custom group...</option>
                  </select>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customGroup}
                    onChange={(e) => setCustomGroup(e.target.value)}
                    placeholder="Enter group name..."
                    className="flex-1 px-3 py-2 text-xs rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                  />
                  <button
                    type="button"
                    onClick={() => setIsCustomGroup(false)}
                    className="px-2.5 py-1 text-xs rounded-xl bg-slate-200 dark:bg-white/10 text-[#666A86] hover:text-[#1D1B3A] dark:hover:text-white"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                Household Role
              </label>
              <select
                value={householdRole}
                onChange={(e) => setHouseholdRole(e.target.value as 'head' | 'spouse' | 'child' | 'other')}
                className="w-full px-3 py-2 text-xs rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
              >
                <option value="head">Family Head / Primary</option>
                <option value="spouse">Spouse</option>
                <option value="child">Child / Dependent</option>
                <option value="other">Individual / Other</option>
              </select>
            </div>
          </div>

          {/* Membership Status & Proximity Consent */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 p-3 rounded-2xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55]">
            <div>
              <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                Membership Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as MemberStatus)}
                className="w-full px-3 py-1.5 text-xs rounded-xl bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
              >
                <option value="member">Confirmed Member</option>
                <option value="visitor">First-time / Recent Visitor</option>
                <option value="inactive">Inactive / Needs Follow-up</option>
              </select>
            </div>

            <div className="flex flex-col justify-center">
              <label className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                Proximity Auto Check-in
              </label>
              <label className="flex items-center gap-2 cursor-pointer mt-1">
                <input
                  type="checkbox"
                  checked={autoCheckinOptedIn}
                  onChange={(e) => setAutoCheckinOptedIn(e.target.checked)}
                  className="w-4 h-4 text-[#6D5CF2] rounded focus:ring-[#6D5CF2] accent-[#6D5CF2]"
                />
                <span className="text-xs text-[#5B5F7A] dark:text-[#A9ACC8]">
                  Opt-in (Ghana Act 843 compliant)
                </span>
              </label>
            </div>
          </div>

          {/* Pastoral Notes */}
          <div>
            <label className="block text-xs font-semibold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-[#6D5CF2]" />
              <span>Pastoral Care Notes / Background</span>
              <span className="text-[#666A86] dark:text-[#A9ACC8] font-normal">(private to leaders)</span>
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Baptized in 2024, joins choir rehearsal Thursdays, lives near Danquah Circle..."
              className="w-full px-3 py-2 text-xs rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
            />
          </div>

          {/* Form Actions Footer */}
          <div className="pt-3 border-t border-[#E9EBF5] dark:border-[#2D2D55] flex flex-wrap items-center justify-end gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
            >
              Cancel
            </button>

            {!initialData && (
              <button
                type="button"
                onClick={() => handleSubmit(undefined, true)}
                className="px-3.5 py-2 text-xs font-bold text-[#6D5CF2] dark:text-[#8C7DFF] bg-[#EFEDFF] dark:bg-[#2A2A55] hover:bg-[#E2DEFF] dark:hover:bg-[#343468] rounded-xl transition-all cursor-pointer"
              >
                Save & Add Another
              </button>
            )}

            <button
              type="submit"
              className="px-5 py-2 text-xs font-bold text-white bg-[#6D5CF2] hover:bg-[#5b4be0] rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer active:scale-98"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{initialData ? 'Save Changes' : 'Register Member'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
