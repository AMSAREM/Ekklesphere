import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  User,
  MapPin,
  Users,
  Heart,
  Calendar,
  Camera,
  Loader2,
  AlertCircle,
  Check,
  Phone,
} from 'lucide-react';
import { Person } from '../../types/ekklesphere';
import { useEkklesphere } from '../../context/EkklesphereContext';
import { MemberAvatar } from '../common/MemberAvatar';
import { compressImageFile } from '../../utils/imageCompression';
import {
  findMatchingChurchGroup,
  mergeSelectableCellGroups,
  mergeSelectableDepartments,
} from '../../utils/settingsConnections';
import { CHURCH_PORTFOLIO_OPTIONS, CHURCH_PORTFOLIOS } from '../../constants/portfolios';
import {
  BIRTH_MONTH_NAMES,
  deriveMonthOfBirth,
  formatBirthMonthGroupName,
  resolveMemberBirthFields,
} from '../../utils/birthMonth';

interface MemberProfileEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  member?: Person | null;
  fallbackName?: string;
  fallbackEmail?: string;
  fallbackPhone?: string;
  fallbackPhotoUrl?: string | null;
}

type EditorTabId = 'identity' | 'residence' | 'church' | 'family' | 'milestones';

const COMMON_CELL_GROUPS = [
  'General Congregation',
  'Main Sanctuary Cell',
  'Choir & Music Ministry',
  'Youth & Young Adults',
  'Ushers & Greeters',
  'Men’s Fellowship',
  'Women’s Fellowship',
  'Media & Tech Team',
  'Children’s Ministry Workers',
];

const COMMON_DEPARTMENTS = [
  'General Congregation',
  'Choir & Music Ministry',
  'Ushering Ministry',
  'Media & IT Team',
  'Hospitality & Greeters',
  'Children Ministry',
  'Finance & Audit',
  'Protocol & Security',
  'Evangelism & Outreach',
];

const EDITOR_TABS: { id: EditorTabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'identity', label: 'Identity', icon: User },
  { id: 'residence', label: 'Residence', icon: MapPin },
  { id: 'church', label: 'Church', icon: Users },
  { id: 'family', label: 'Family', icon: Heart },
  { id: 'milestones', label: 'Milestones', icon: Calendar },
];

export const MemberProfileEditorModal: React.FC<MemberProfileEditorModalProps> = ({
  isOpen,
  onClose,
  member,
  fallbackName,
  fallbackEmail,
  fallbackPhone,
  fallbackPhotoUrl,
}) => {
  const { updateOwnProfile, members, churchGroups, systemSettings, currentUser, showToast } =
    useEkklesphere();

  const [activeTab, setActiveTab] = useState<EditorTabId>('identity');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Derive fallback name parts cleanly
  const defaultNameParts = useMemo(() => {
    const clean = (fallbackName || currentUser?.name || '').trim();
    const parts = clean.split(/\s+/).filter(Boolean);
    return {
      first: parts[0] || '',
      last: parts.slice(1).join(' ') || '',
    };
  }, [fallbackName, currentUser?.name]);

  // Form state
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [preferredName, setPreferredName] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | 'other'>('other');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [monthOfBirth, setMonthOfBirth] = useState('');
  const [email, setEmail] = useState('');
  const [phoneE164, setPhoneE164] = useState('');
  const [occupation, setOccupation] = useState('');
  const [imageUrl, setImageUrl] = useState('');

  const [placeOfResidence, setPlaceOfResidence] = useState('');
  const [specificLocation, setSpecificLocation] = useState('');
  const [residentialDigitalAddress, setResidentialDigitalAddress] = useState('');
  const [hometown, setHometown] = useState('');

  const [homeCellGroup, setHomeCellGroup] = useState('General Congregation');
  const [department, setDepartment] = useState('General Congregation');
  const [portfolio, setPortfolio] = useState('Member');
  const [customPortfolio, setCustomPortfolio] = useState('');
  const [squads, setSquads] = useState('');

  const [maritalStatus, setMaritalStatus] = useState('Single');
  const [spouseName, setSpouseName] = useState('');
  const [numberOfChildren, setNumberOfChildren] = useState<string>('0');
  const [emergencyContactPerson, setEmergencyContactPerson] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');

  const [dateOfSalvation, setDateOfSalvation] = useState('');
  const [dateOfBaptism, setDateOfBaptism] = useState('');
  const [dateOfMarriage, setDateOfMarriage] = useState('');
  const [remarks, setRemarks] = useState('');

  const cellGroupOptions = useMemo(() => {
    const merged = mergeSelectableCellGroups(churchGroups, members, COMMON_CELL_GROUPS);
    const set = new Set<string>(merged);
    if (homeCellGroup) set.add(homeCellGroup);
    return Array.from(set);
  }, [churchGroups, members, homeCellGroup]);

  const departmentOptions = useMemo(() => {
    const merged = mergeSelectableDepartments(churchGroups, members, COMMON_DEPARTMENTS);
    const set = new Set<string>(merged);
    if (department) set.add(department);
    return Array.from(set);
  }, [churchGroups, members, department]);

  useEffect(() => {
    if (!isOpen) return;
    setErrorMessage(null);
    setActiveTab('identity');

    setFirstName(member?.firstName || defaultNameParts.first);
    setMiddleName(member?.middleName || '');
    setLastName(member?.lastName || defaultNameParts.last);
    setPreferredName(member?.preferredName || '');
    setGender(
      member?.gender === 'male' || member?.gender === 'female' || member?.gender === 'other'
        ? member.gender
        : 'other'
    );
    setDateOfBirth(member?.dateOfBirth || '');
    setMonthOfBirth(
      resolveMemberBirthFields({
        dateOfBirth: member?.dateOfBirth,
        monthOfBirth: member?.monthOfBirth,
        birthMonthGroup: member?.birthMonthGroup,
      }).monthOfBirth || ''
    );
    setEmail(member?.email || fallbackEmail || currentUser?.email || '');
    setPhoneE164(member?.phoneE164 || fallbackPhone || currentUser?.phone || '');
    setOccupation(member?.occupation || '');
    setImageUrl(member?.imageUrl || fallbackPhotoUrl || '');

    setPlaceOfResidence(member?.placeOfResidence || '');
    setSpecificLocation(member?.specificLocation || '');
    setResidentialDigitalAddress(member?.residentialDigitalAddress || '');
    setHometown(member?.hometown || '');

    setHomeCellGroup(member?.homeCellGroup || member?.groupName || 'General Congregation');
    setDepartment(member?.department || 'General Congregation');
    const rawPortfolio = (member?.designation || member?.officerName || 'Member').trim();
    const matchedPortfolio = CHURCH_PORTFOLIOS.find(
      (p) => p.toLowerCase() === rawPortfolio.toLowerCase()
    );
    setPortfolio(matchedPortfolio || (rawPortfolio ? 'Other' : 'Member'));
    setCustomPortfolio(matchedPortfolio ? '' : rawPortfolio);
    setSquads(member?.squads || '');

    setMaritalStatus(member?.maritalStatus || 'Single');
    setSpouseName(member?.spouseName || '');
    setNumberOfChildren(
      typeof member?.numberOfChildren === 'number' ? String(member.numberOfChildren) : '0'
    );
    setEmergencyContactPerson(member?.emergencyContactPerson || '');
    setEmergencyContactPhone(member?.emergencyContactPhone || '');

    setDateOfSalvation(member?.dateOfSalvation || '');
    setDateOfBaptism(member?.dateOfBaptism || '');
    setDateOfMarriage(member?.dateOfMarriage || '');
    setRemarks(member?.remarks || member?.notes || '');
  }, [isOpen, member, defaultNameParts, fallbackEmail, fallbackPhone, fallbackPhotoUrl, currentUser]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSaving) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, isSaving, onClose]);

  if (!isOpen) return null;

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('Please select a JPG, PNG, or WebP image.');
      return;
    }
    setIsUploadingPhoto(true);
    try {
      const compressed = await compressImageFile(file, {
        maxDimension: 256,
        maxDataUrlBytes: 28000,
        initialQuality: 0.82,
        square: true,
      });
      setImageUrl(compressed);
    } catch {
      showToast('Could not process selected image.');
    } finally {
      setIsUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanFirst = firstName.trim();
    const cleanLast = lastName.trim();
    if (!cleanFirst || !cleanLast) {
      setActiveTab('identity');
      setErrorMessage('First name and last name are required.');
      return;
    }

    const cleanEmail = email.trim();
    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setActiveTab('identity');
      setErrorMessage('Please enter a valid email address.');
      return;
    }

    const parsedChildren = Math.max(0, Math.min(50, Math.trunc(Number(numberOfChildren) || 0)));
    const nextGroup = homeCellGroup.trim() || 'General Congregation';
    const nextDept = department.trim() || 'General Congregation';

    const nextPortfolio =
      (portfolio === 'Other' ? customPortfolio.trim() : portfolio.trim()) || 'Member';

    const resolvedBirth = resolveMemberBirthFields({
      dateOfBirth: dateOfBirth.trim() || undefined,
      monthOfBirth: monthOfBirth.trim() || undefined,
    });

    setIsSaving(true);
    try {
      await updateOwnProfile({
        firstName: cleanFirst,
        middleName: middleName.trim(),
        lastName: cleanLast,
        preferredName: preferredName.trim() || `${cleanFirst} ${cleanLast}`.trim(),
        gender,
        dateOfBirth: dateOfBirth.trim(),
        monthOfBirth: resolvedBirth.monthOfBirth || '',
        birthMonthGroup: resolvedBirth.birthMonthGroup || '',
        email: cleanEmail,
        phoneE164: phoneE164.trim(),
        phoneNumber: phoneE164.trim(),
        occupation: occupation.trim(),
        imageUrl: imageUrl.trim(),
        placeOfResidence: placeOfResidence.trim(),
        specificLocation: specificLocation.trim(),
        residentialDigitalAddress: residentialDigitalAddress.trim(),
        hometown: hometown.trim(),
        homeCellGroup: nextGroup,
        groupName: nextGroup,
        department: nextDept,
        officerName: nextPortfolio,
        designation: nextPortfolio,
        squads: squads.trim(),
        maritalStatus: maritalStatus.trim() || 'Single',
        spouseName: maritalStatus.toLowerCase() === 'married' ? spouseName.trim() : '',
        numberOfChildren: parsedChildren,
        emergencyContactPerson: emergencyContactPerson.trim(),
        emergencyContactPhone: emergencyContactPhone.trim(),
        dateOfSalvation: dateOfSalvation.trim(),
        dateOfBaptism: dateOfBaptism.trim(),
        dateOfMarriage: maritalStatus.toLowerCase() === 'married' ? dateOfMarriage.trim() : '',
        remarks: remarks.trim(),
      });
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Could not save your member profile.');
    } finally {
      setIsSaving(false);
    }
  };

  const groupLeadPreview = findMatchingChurchGroup(churchGroups, {
    groupName: homeCellGroup,
    homeCellGroup,
    department,
  });
  const matchedLeadInfo = groupLeadPreview.ministryGroup || groupLeadPreview.cellOrFellowshipGroup;

  const inputClass =
    'w-full min-w-0 min-h-[42px] px-3 py-2 rounded-xl text-sm bg-[#F8F9FD] dark:bg-[#14142E] text-[#1D1B3A] dark:text-[#F2F2FA] border border-[#E3E5F2] dark:border-[#2D2D55] outline-none focus:border-[#6D5CF2] focus:ring-2 focus:ring-[#6D5CF2]/20 transition-colors';
  const labelClass =
    'block text-xs font-semibold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1.5';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="member-profile-editor-title"
      onClick={() => !isSaving && onClose()}
      className="fixed inset-0 z-[70] bg-black/65 backdrop-blur-xs flex items-center justify-center p-2.5 sm:p-4 animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[92dvh] bg-white dark:bg-[#1C1C3C] rounded-2xl sm:rounded-3xl border border-[#E3E5F2] dark:border-[#2D2D55] shadow-2xl flex flex-col overflow-hidden min-w-0"
      >
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-[#E3E5F2] dark:border-[#2D2D55] flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h2
              id="member-profile-editor-title"
              className="text-base sm:text-lg font-bold tracking-tight text-[#1D1B3A] dark:text-[#F2F2FA] truncate"
            >
              Edit My Member Details
            </h2>
            <p className="text-xs text-[#5B5F7A] dark:text-[#A9ACC8] truncate">
              Update your personal, contact, residence, family, and church records.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            aria-label="Close member profile editor"
            className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-[#5B5F7A] dark:text-[#A9ACC8] flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Section Tabs */}
        <div
          role="tablist"
          aria-label="Member profile sections"
          className="px-4 sm:px-6 py-2.5 border-b border-[#E3E5F2] dark:border-[#2D2D55] bg-[#F8F9FD] dark:bg-[#161632] flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0"
        >
          {EDITOR_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.id)}
                className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-[#6D5CF2] text-white shadow-xs'
                    : 'text-[#5B5F7A] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-white hover:bg-white dark:hover:bg-white/5'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 space-y-5">
            {errorMessage && (
              <div
                role="alert"
                className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            {activeTab === 'identity' && (
              <div className="space-y-4">
                {/* Profile photo row */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-3.5 pb-4 border-b border-[#E3E5F2] dark:border-[#2D2D55]">
                  <MemberAvatar
                    src={imageUrl}
                    name={`${firstName} ${lastName}`.trim() || 'Member'}
                    initials={`${firstName[0] || 'M'}${lastName[0] || ''}`.toUpperCase()}
                    sizeClass="w-16 h-16"
                    textClass="text-lg font-bold"
                  />
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <p className="text-xs font-semibold text-[#1D1B3A] dark:text-[#F2F2FA]">
                      Member Profile Photo
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={handlePhotoUpload}
                        className="sr-only"
                        aria-label="Upload member profile photo"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploadingPhoto}
                        className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#9D90FF] text-xs font-semibold flex items-center gap-1.5 hover:bg-[#E2DFFF] dark:hover:bg-[#343468] transition-colors cursor-pointer"
                      >
                        {isUploadingPhoto ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Camera className="w-3.5 h-3.5" />
                        )}
                        <span>{imageUrl ? 'Change Photo' : 'Upload Photo'}</span>
                      </button>
                      {imageUrl && (
                        <button
                          type="button"
                          onClick={() => setImageUrl('')}
                          className="min-h-[38px] px-3 py-1.5 rounded-xl border border-[#E3E5F2] dark:border-[#2D2D55] text-xs font-semibold text-[#5B5F7A] dark:text-[#A9ACC8] hover:text-rose-600 transition-colors cursor-pointer"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  <div className="min-w-0">
                    <label htmlFor="mpe-first-name" className={labelClass}>
                      First Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      id="mpe-first-name"
                      type="text"
                      required
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className={inputClass}
                      placeholder="First name"
                    />
                  </div>
                  <div className="min-w-0">
                    <label htmlFor="mpe-middle-name" className={labelClass}>
                      Middle Name
                    </label>
                    <input
                      id="mpe-middle-name"
                      type="text"
                      value={middleName}
                      onChange={(e) => setMiddleName(e.target.value)}
                      className={inputClass}
                      placeholder="Optional"
                    />
                  </div>
                  <div className="min-w-0">
                    <label htmlFor="mpe-last-name" className={labelClass}>
                      Last Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      id="mpe-last-name"
                      type="text"
                      required
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className={inputClass}
                      placeholder="Last name"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="min-w-0">
                    <label htmlFor="mpe-preferred-name" className={labelClass}>
                      Preferred / Display Name
                    </label>
                    <input
                      id="mpe-preferred-name"
                      type="text"
                      value={preferredName}
                      onChange={(e) => setPreferredName(e.target.value)}
                      className={inputClass}
                      placeholder="How you'd like to be addressed"
                    />
                  </div>
                  <div className="min-w-0">
                    <label htmlFor="mpe-occupation" className={labelClass}>
                      Occupation / Profession
                    </label>
                    <input
                      id="mpe-occupation"
                      type="text"
                      value={occupation}
                      onChange={(e) => setOccupation(e.target.value)}
                      className={inputClass}
                      placeholder="e.g. Teacher, Software Engineer"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="min-w-0">
                    <label htmlFor="mpe-email" className={labelClass}>
                      Email Address
                    </label>
                    <input
                      id="mpe-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={inputClass}
                      placeholder="you@example.com"
                    />
                  </div>
                  <div className="min-w-0">
                    <label htmlFor="mpe-phone" className={labelClass}>
                      Phone Number
                    </label>
                    <input
                      id="mpe-phone"
                      type="tel"
                      value={phoneE164}
                      onChange={(e) => setPhoneE164(e.target.value)}
                      className={inputClass}
                      placeholder="+233 24 000 0000"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  <div className="min-w-0">
                    <label htmlFor="mpe-gender" className={labelClass}>
                      Gender
                    </label>
                    <select
                      id="mpe-gender"
                      value={gender}
                      onChange={(e) => setGender(e.target.value as 'male' | 'female' | 'other')}
                      className={inputClass}
                    >
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Prefer not to say / Other</option>
                    </select>
                  </div>
                  <div className="min-w-0">
                    <label htmlFor="mpe-dob" className={labelClass}>
                      Date of Birth
                    </label>
                    <input
                      id="mpe-dob"
                      type="date"
                      value={dateOfBirth}
                      onChange={(e) => {
                        const nextDob = e.target.value;
                        setDateOfBirth(nextDob);
                        const derived = deriveMonthOfBirth(nextDob, undefined);
                        if (derived) {
                          setMonthOfBirth(derived);
                        } else if (!nextDob) {
                          setMonthOfBirth('');
                        }
                      }}
                      className={inputClass}
                    />
                  </div>
                  <div className="min-w-0">
                    <label htmlFor="mpe-mob" className={labelClass}>
                      Month of Birth
                    </label>
                    <select
                      id="mpe-mob"
                      value={deriveMonthOfBirth(dateOfBirth, monthOfBirth) || ''}
                      disabled={Boolean(deriveMonthOfBirth(dateOfBirth, undefined))}
                      onChange={(e) => setMonthOfBirth(e.target.value)}
                      className={`${inputClass} disabled:opacity-80`}
                    >
                      <option value="">Select month...</option>
                      {BIRTH_MONTH_NAMES.map((mName) => (
                        <option key={mName} value={mName}>
                          {mName}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {(() => {
                  const resolved = resolveMemberBirthFields({ dateOfBirth, monthOfBirth });
                  const groupLabel = formatBirthMonthGroupName(resolved.monthOfBirth);
                  return (
                    <div className="px-3.5 py-2.5 rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E3E5F2] dark:border-[#2D2D55] flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="text-[#5B5F7A] dark:text-[#A9ACC8]">
                        Automatic Birth Month Fellowship Group
                      </span>
                      <span className="font-bold text-[#6D5CF2] dark:text-[#9D90FF]">
                        {groupLabel || 'Assigned automatically when Date or Month of Birth is saved'}
                      </span>
                    </div>
                  );
                })()}
              </div>
            )}

            {activeTab === 'residence' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="min-w-0">
                    <label htmlFor="mpe-residence" className={labelClass}>
                      City / Area of Residence
                    </label>
                    <input
                      id="mpe-residence"
                      type="text"
                      value={placeOfResidence}
                      onChange={(e) => setPlaceOfResidence(e.target.value)}
                      className={inputClass}
                      placeholder="e.g. East Legon, Accra"
                    />
                  </div>
                  <div className="min-w-0">
                    <label htmlFor="mpe-digital-address" className={labelClass}>
                      Digital GPS / Postal Address
                    </label>
                    <input
                      id="mpe-digital-address"
                      type="text"
                      value={residentialDigitalAddress}
                      onChange={(e) => setResidentialDigitalAddress(e.target.value)}
                      className={inputClass}
                      placeholder="e.g. GA-123-4567"
                    />
                  </div>
                </div>

                <div className="min-w-0">
                  <label htmlFor="mpe-specific-location" className={labelClass}>
                    Street / Landmark Directions
                  </label>
                  <input
                    id="mpe-specific-location"
                    type="text"
                    value={specificLocation}
                    onChange={(e) => setSpecificLocation(e.target.value)}
                    className={inputClass}
                    placeholder="House number, street name, or nearby landmark"
                  />
                </div>

                <div className="min-w-0">
                  <label htmlFor="mpe-hometown" className={labelClass}>
                    Hometown / Origin
                  </label>
                  <input
                    id="mpe-hometown"
                    type="text"
                    value={hometown}
                    onChange={(e) => setHometown(e.target.value)}
                    className={inputClass}
                    placeholder="e.g. Kumasi, Ashanti Region"
                  />
                </div>
              </div>
            )}

            {activeTab === 'church' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="min-w-0">
                    <label htmlFor="mpe-cell-group" className={labelClass}>
                      Cell / Fellowship Group
                    </label>
                    <select
                      id="mpe-cell-group"
                      value={homeCellGroup}
                      onChange={(e) => setHomeCellGroup(e.target.value)}
                      className={inputClass}
                    >
                      {cellGroupOptions.map((group) => (
                        <option key={group} value={group}>
                          {group}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="min-w-0">
                    <label htmlFor="mpe-department" className={labelClass}>
                      Serving Ministry / Department
                    </label>
                    <select
                      id="mpe-department"
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      className={inputClass}
                    >
                      {departmentOptions.map((dept) => (
                        <option key={dept} value={dept}>
                          {dept}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {matchedLeadInfo && (
                  <div className="p-3 rounded-xl bg-[#F8F9FD] dark:bg-[#14142E] border border-[#E3E5F2] dark:border-[#2D2D55] text-xs text-[#5B5F7A] dark:text-[#A9ACC8] flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-[#6D5CF2] shrink-0" />
                    <span className="min-w-0">
                      Group Lead:{' '}
                      <strong className="text-[#1D1B3A] dark:text-[#F2F2FA]">
                        {matchedLeadInfo.leaderName || systemSettings.seniorPastor || 'Church Office'}
                      </strong>
                      {matchedLeadInfo.meetingDay ? ` · ${matchedLeadInfo.meetingDay}` : ''}
                      {matchedLeadInfo.meetingTime ? ` ${matchedLeadInfo.meetingTime}` : ''}
                    </span>
                  </div>
                )}

                <div className="min-w-0">
                  <label htmlFor="mpe-portfolio" className={labelClass}>
                    Church Portfolio / Designation
                  </label>
                  <select
                    id="mpe-portfolio"
                    value={portfolio}
                    onChange={(e) => setPortfolio(e.target.value)}
                    className={inputClass}
                  >
                    {CHURCH_PORTFOLIO_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                    <option value="Other">Other (Specify Custom...)</option>
                  </select>
                  {portfolio === 'Other' && (
                    <input
                      type="text"
                      value={customPortfolio}
                      onChange={(e) => setCustomPortfolio(e.target.value)}
                      className={`${inputClass} mt-2`}
                      placeholder="Enter your church portfolio or role"
                    />
                  )}
                </div>

                <div className="min-w-0">
                  <label htmlFor="mpe-squads" className={labelClass}>
                    Service Teams / Volunteer Interests
                  </label>
                  <input
                    id="mpe-squads"
                    type="text"
                    value={squads}
                    onChange={(e) => setSquads(e.target.value)}
                    className={inputClass}
                    placeholder="e.g. Choir, Sound Engineering, Intercessory Team"
                  />
                </div>
              </div>
            )}

            {activeTab === 'family' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="min-w-0">
                    <label htmlFor="mpe-marital-status" className={labelClass}>
                      Marital Status
                    </label>
                    <select
                      id="mpe-marital-status"
                      value={maritalStatus}
                      onChange={(e) => setMaritalStatus(e.target.value)}
                      className={inputClass}
                    >
                      <option value="Single">Single</option>
                      <option value="Married">Married</option>
                      <option value="Engaged">Engaged</option>
                      <option value="Widowed">Widowed</option>
                      <option value="Divorced">Divorced</option>
                    </select>
                  </div>

                  <div className="min-w-0">
                    <label htmlFor="mpe-children" className={labelClass}>
                      Number of Children
                    </label>
                    <input
                      id="mpe-children"
                      type="number"
                      min={0}
                      max={50}
                      value={numberOfChildren}
                      onChange={(e) => setNumberOfChildren(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </div>

                {maritalStatus.toLowerCase() === 'married' && (
                  <div className="min-w-0">
                    <label htmlFor="mpe-spouse" className={labelClass}>
                      Spouse Full Name
                    </label>
                    <input
                      id="mpe-spouse"
                      type="text"
                      value={spouseName}
                      onChange={(e) => setSpouseName(e.target.value)}
                      className={inputClass}
                      placeholder="Spouse name"
                    />
                  </div>
                )}

                <div className="pt-2 border-t border-[#E3E5F2] dark:border-[#2D2D55] grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="min-w-0">
                    <label htmlFor="mpe-emergency-person" className={labelClass}>
                      Emergency Contact Name
                    </label>
                    <input
                      id="mpe-emergency-person"
                      type="text"
                      value={emergencyContactPerson}
                      onChange={(e) => setEmergencyContactPerson(e.target.value)}
                      className={inputClass}
                      placeholder="Next of kin or emergency contact"
                    />
                  </div>

                  <div className="min-w-0">
                    <label htmlFor="mpe-emergency-phone" className={labelClass}>
                      Emergency Contact Phone
                    </label>
                    <input
                      id="mpe-emergency-phone"
                      type="tel"
                      value={emergencyContactPhone}
                      onChange={(e) => setEmergencyContactPhone(e.target.value)}
                      className={inputClass}
                      placeholder="+233 20 000 0000"
                    />
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'milestones' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="min-w-0">
                    <label htmlFor="mpe-salvation" className={labelClass}>
                      Date of Salvation
                    </label>
                    <input
                      id="mpe-salvation"
                      type="date"
                      value={dateOfSalvation}
                      onChange={(e) => setDateOfSalvation(e.target.value)}
                      className={inputClass}
                    />
                  </div>

                  <div className="min-w-0">
                    <label htmlFor="mpe-baptism" className={labelClass}>
                      Date of Water Baptism
                    </label>
                    <input
                      id="mpe-baptism"
                      type="date"
                      value={dateOfBaptism}
                      onChange={(e) => setDateOfBaptism(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </div>

                {maritalStatus.toLowerCase() === 'married' && (
                  <div className="min-w-0">
                    <label htmlFor="mpe-marriage-date" className={labelClass}>
                      Marriage Anniversary Date
                    </label>
                    <input
                      id="mpe-marriage-date"
                      type="date"
                      value={dateOfMarriage}
                      onChange={(e) => setDateOfMarriage(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                )}

                <div className="min-w-0">
                  <label htmlFor="mpe-remarks" className={labelClass}>
                    Pastoral Notes / Prayer Focus
                  </label>
                  <textarea
                    id="mpe-remarks"
                    rows={3}
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    className={`${inputClass} min-h-[88px] py-2.5 resize-y`}
                    placeholder="Share any helpful updates, dietary/accessibility notes, or prayer focuses with your church care team."
                  />
                </div>
              </div>
            )}
          </div>

          {/* Sticky Footer */}
          <div className="px-4 sm:px-6 py-3.5 border-t border-[#E3E5F2] dark:border-[#2D2D55] bg-[#F8F9FD] dark:bg-[#161632] flex flex-wrap items-center justify-end gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="min-h-[42px] px-4 py-2 rounded-xl border border-[#E3E5F2] dark:border-[#2D2D55] bg-white dark:bg-[#1C1C3C] text-xs sm:text-sm font-semibold text-[#5B5F7A] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-white transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="min-h-[42px] px-5 py-2 rounded-xl bg-[#6D5CF2] hover:bg-[#5B4BE0] text-white text-xs sm:text-sm font-semibold flex items-center gap-2 transition-colors disabled:opacity-60 cursor-pointer shadow-xs"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving Details...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Save Member Details</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
