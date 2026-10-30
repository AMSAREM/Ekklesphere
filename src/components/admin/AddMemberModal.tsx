import React, { useState, useEffect, useMemo } from 'react';
import { useEkklesphere } from '../../context/EkklesphereContext';
import { Person, MemberStatus } from '../../types/ekklesphere';
import {
  X,
  UserPlus,
  Check,
  Users,
  MapPin,
  Calendar,
  Heart,
  Shield,
  Loader2,
  AlertCircle,
} from 'lucide-react';

interface AddMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMemberAdded?: (member: Person) => void;
  initialData?: Person | null;
}

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

export const COMMON_DESIGNATIONS = [
  'Member',
  'Deacon',
  'Deaconess',
  'Elder',
  'Pastor',
  'Senior Pastor',
  'Associate Pastor',
  'Youth Pastor',
  'Cell Leader',
  'Ministry Leader',
  'Department Head',
  'Usher Captain',
  'Other',
] as const;

export const AddMemberModal: React.FC<AddMemberModalProps> = ({
  isOpen,
  onClose,
  onMemberAdded,
  initialData,
}) => {
  const { addMember, updateMember, showToast, churchGroups, systemSettings } = useEkklesphere();

  const [activeTab, setActiveTab] = useState<'basic' | 'location' | 'church' | 'family' | 'spiritual'>('basic');

  const cellGroupOptions = useMemo(() => {
    const dynamicCells = churchGroups
      .filter((g) => g.category === 'cell_group' || g.category === 'fellowship')
      .map((g) => g.name);
    const set = new Set<string>([...dynamicCells, ...COMMON_CELL_GROUPS]);
    if (initialData?.homeCellGroup) set.add(initialData.homeCellGroup);
    if (initialData?.groupName) set.add(initialData.groupName);
    return Array.from(set);
  }, [churchGroups, initialData]);

  const departmentOptions = useMemo(() => {
    const dynamicMinistries = churchGroups
      .filter((g) => g.category === 'ministry')
      .map((g) => g.name);
    const set = new Set<string>(['General Congregation', ...dynamicMinistries, ...COMMON_DEPARTMENTS]);
    if (initialData?.department) set.add(initialData.department);
    return Array.from(set);
  }, [churchGroups, initialData]);

  // 1. Identity & Contact
  const [firstName, setFirstName] = useState(initialData?.firstName || '');
  const [middleName, setMiddleName] = useState(initialData?.middleName || '');
  const [lastName, setLastName] = useState(initialData?.lastName || '');
  const [memberId, setMemberId] = useState(initialData?.memberId || '');
  const [gender, setGender] = useState(initialData?.gender || 'male');
  const [dateOfBirth, setDateOfBirth] = useState(initialData?.dateOfBirth || '');
  const [monthOfBirth, setMonthOfBirth] = useState(initialData?.monthOfBirth || '');
  const [phone, setPhone] = useState(initialData?.phoneE164 || '');
  const [email, setEmail] = useState(initialData?.email || '');

  // 2. Location & Residence
  const [placeOfResidence, setPlaceOfResidence] = useState(initialData?.placeOfResidence || '');
  const [specificLocation, setSpecificLocation] = useState(initialData?.specificLocation || '');
  const [residentialDigitalAddress, setResidentialDigitalAddress] = useState(
    initialData?.residentialDigitalAddress || ''
  );
  const [hometown, setHometown] = useState(initialData?.hometown || '');

  // 3. Church & Squads
  const [homeCellGroup, setHomeCellGroup] = useState(
    initialData?.homeCellGroup || initialData?.groupName || cellGroupOptions[0] || 'General Congregation'
  );
  const [squads, setSquads] = useState(initialData?.squads || '');
  const [department, setDepartment] = useState(initialData?.department || 'General Congregation');

  // Designation dropdown state & custom fallback
  const initialOfficer = initialData?.officerName || 'Member';
  const matchedPredefined = COMMON_DESIGNATIONS.find(
    (d) => d.toLowerCase() === initialOfficer.trim().toLowerCase()
  );
  const [officerName, setOfficerName] = useState<string>(
    matchedPredefined || (initialData?.officerName ? 'Other' : 'Member')
  );
  const [customOfficerName, setCustomOfficerName] = useState<string>(
    matchedPredefined ? '' : (initialData?.officerName || '')
  );

  const [occupation, setOccupation] = useState(initialData?.occupation || '');
  const [remarks, setRemarks] = useState(initialData?.remarks || initialData?.notes || '');
  const [status, setStatus] = useState<MemberStatus>(initialData?.status || 'member');
  const [autoCheckinOptedIn, setAutoCheckinOptedIn] = useState(
    initialData ? initialData.autoCheckinOptedIn : true
  );

  // 4. Family & Emergency
  const [maritalStatus, setMaritalStatus] = useState(initialData?.maritalStatus || 'Single');
  const [spouseName, setSpouseName] = useState(initialData?.spouseName || '');
  const [numberOfChildren, setNumberOfChildren] = useState<number>(initialData?.numberOfChildren ?? 0);
  const [emergencyContactPerson, setEmergencyContactPerson] = useState(
    initialData?.emergencyContactPerson || ''
  );
  const [emergencyContactPhone, setEmergencyContactPhone] = useState(
    initialData?.emergencyContactPhone || ''
  );
  const [imageUrl, setImageUrl] = useState(initialData?.imageUrl || '');

  // 5. Spiritual Milestones
  const [dateOfSalvation, setDateOfSalvation] = useState(initialData?.dateOfSalvation || '');
  const [dateOfBaptism, setDateOfBaptism] = useState(initialData?.dateOfBaptism || '');
  const [dateOfMarriage, setDateOfMarriage] = useState(initialData?.dateOfMarriage || '');
  const [dateOfMembership, setDateOfMembership] = useState(
    initialData?.dateOfMembership || initialData?.joinedOn || new Date().toISOString().split('T')[0]
  );

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [savingMode, setSavingMode] = useState<'close' | 'another' | null>(null);

  const resetFormFields = (source?: Person | null) => {
    setActiveTab('basic');
    setErrors({});
    setSubmitError(null);
    setSavingMode(null);

    setFirstName(source?.firstName || '');
    setMiddleName(source?.middleName || '');
    setLastName(source?.lastName || '');
    setMemberId(source?.memberId || '');
    setGender(source?.gender || 'male');
    setDateOfBirth(source?.dateOfBirth || '');
    setMonthOfBirth(source?.monthOfBirth || '');
    setPhone(source?.phoneE164 || '');
    setEmail(source?.email || '');

    setPlaceOfResidence(source?.placeOfResidence || '');
    setSpecificLocation(source?.specificLocation || '');
    setResidentialDigitalAddress(source?.residentialDigitalAddress || '');
    setHometown(source?.hometown || '');

    setHomeCellGroup(source?.homeCellGroup || source?.groupName || cellGroupOptions[0] || 'General Congregation');
    setSquads(source?.squads || '');
    setDepartment(source?.department || 'General Congregation');

    const srcOfficer = source?.officerName || 'Member';
    const matched = COMMON_DESIGNATIONS.find(
      (d) => d.toLowerCase() === srcOfficer.trim().toLowerCase()
    );
    setOfficerName(matched || (source?.officerName ? 'Other' : 'Member'));
    setCustomOfficerName(matched ? '' : (source?.officerName || ''));

    setOccupation(source?.occupation || '');
    setRemarks(source?.remarks || source?.notes || '');
    setStatus(source?.status || 'member');
    setAutoCheckinOptedIn(source ? source.autoCheckinOptedIn : true);

    setMaritalStatus(source?.maritalStatus || 'Single');
    setSpouseName(source?.spouseName || '');
    setNumberOfChildren(source?.numberOfChildren ?? 0);
    setEmergencyContactPerson(source?.emergencyContactPerson || '');
    setEmergencyContactPhone(source?.emergencyContactPhone || '');
    setImageUrl(source?.imageUrl || '');

    setDateOfSalvation(source?.dateOfSalvation || '');
    setDateOfBaptism(source?.dateOfBaptism || '');
    setDateOfMarriage(source?.dateOfMarriage || '');
    setDateOfMembership(
      source?.dateOfMembership || source?.joinedOn || new Date().toISOString().split('T')[0]
    );
  };

  useEffect(() => {
    if (isOpen) {
      resetFormFields(initialData);
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!firstName.trim()) newErrors.firstName = 'First name is required';
    if (!lastName.trim()) newErrors.lastName = 'Last name is required';
    if (!phone.trim()) {
      newErrors.phone = 'Phone number is required';
    } else {
      const cleanPhone = phone.replace(/[\s\-()]/g, '');
      if (cleanPhone.length < 9) {
        newErrors.phone = 'Please enter a valid phone number';
      }
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      newErrors.email = 'Please enter a valid email address';
    }

    // Designation validation
    const resolvedOfficer = officerName === 'Other' ? customOfficerName.trim() : officerName.trim();
    if (!resolvedOfficer) {
      newErrors.officerName = 'Designation is required';
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      if (newErrors.firstName || newErrors.lastName || newErrors.phone || newErrors.email) {
        setActiveTab('basic');
      } else if (newErrors.officerName) {
        setActiveTab('church');
      }
      const firstErrorMsg = Object.values(newErrors)[0];
      setSubmitError(firstErrorMsg);
      return false;
    }

    setSubmitError(null);
    return true;
  };

  const formatE164 = (raw: string) => {
    let clean = raw.trim().replace(/[\s\-()]/g, '');
    if (clean.startsWith('0')) {
      clean = '+233' + clean.slice(1);
    } else if (!clean.startsWith('+')) {
      clean = '+233' + clean;
    }
    return clean;
  };

  const generateDefaultMemberCode = () => {
    const rawChurch = (systemSettings?.churchName || 'CHURCH').trim();
    const prefix =
      rawChurch
        .split(/\s+/)
        .map((w) => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 4) || 'MEM';
    return `${prefix}-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;
  };

  const handleSubmit = async (e?: React.FormEvent, addAnother: boolean = false) => {
    if (e) e.preventDefault();
    if (savingMode !== null) return;
    if (!validate()) return;

    const finalPhone = formatE164(phone);
    const generatedId = memberId.trim() || generateDefaultMemberCode();
    const finalOfficer = officerName === 'Other' ? customOfficerName.trim() : officerName.trim();

    const memberPayload: Partial<Person> = {
      firstName: firstName.trim(),
      middleName: middleName.trim() || undefined,
      lastName: lastName.trim(),
      specificLocation: specificLocation.trim() || undefined,
      remarks: remarks.trim() || undefined,
      memberId: generatedId,
      squads: squads.trim() || undefined,
      department: department.trim() || 'General Congregation',
      officerName: finalOfficer || 'Member',
      gender,
      dateOfBirth: dateOfBirth || undefined,
      phoneE164: finalPhone,
      phoneNumber: finalPhone,
      placeOfResidence: placeOfResidence.trim() || undefined,
      residentialDigitalAddress: residentialDigitalAddress.trim() || undefined,
      hometown: hometown.trim() || undefined,
      occupation: occupation.trim() || undefined,
      homeCellGroup: homeCellGroup.trim(),
      groupName: homeCellGroup.trim(),
      monthOfBirth:
        monthOfBirth ||
        (dateOfBirth
          ? new Date(`${dateOfBirth}T00:00:00Z`).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' })
          : undefined),
      maritalStatus,
      spouseName: maritalStatus === 'Married' ? spouseName.trim() || undefined : undefined,
      numberOfChildren: Number(numberOfChildren) || 0,
      emergencyContactPerson: emergencyContactPerson.trim() || undefined,
      emergencyContactPhone: emergencyContactPhone.trim() || undefined,
      imageUrl: imageUrl.trim() || undefined,
      dateOfBaptism: dateOfBaptism || undefined,
      dateOfMarriage: dateOfMarriage || undefined,
      dateOfSalvation: dateOfSalvation || undefined,
      dateOfMembership: dateOfMembership || new Date().toISOString().split('T')[0],
      email: email.trim() || undefined,
      status,
      autoCheckinOptedIn,
      notes: remarks.trim() || undefined,
    };

    setSavingMode(addAnother ? 'another' : 'close');
    setSubmitError(null);

    try {
      if (initialData) {
        await updateMember(initialData.id, memberPayload);
        setSavingMode(null);
        onClose();
      } else {
        const created = await addMember(
          memberPayload as Omit<Person, 'id' | 'tenantId' | 'avatarInitials' | 'joinedOn'>
        );
        if (onMemberAdded) onMemberAdded(created);
        setSavingMode(null);

        if (addAnother) {
          // Reset member-specific fields while keeping cell group & department handy for batch entry
          const preservedCell = homeCellGroup;
          const preservedDept = department;
          resetFormFields(null);
          setHomeCellGroup(preservedCell);
          setDepartment(preservedDept);
          showToast(`${created.firstName} ${created.lastName} saved to database! Ready for next member.`);
        } else {
          onClose();
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not save member to database.';
      setSubmitError(msg);
      showToast(msg);
      setSavingMode(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] rounded-3xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-[#E9EBF5] dark:border-[#2D2D55] flex items-center justify-between shrink-0 bg-slate-50/50 dark:bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#6D5CF2]/10 dark:bg-[#6D5CF2]/20 flex items-center justify-center text-[#6D5CF2]">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                {initialData ? 'Edit Member Record' : 'Register New Church Member'}
              </h2>
              <p className="text-xs text-[#666A86] dark:text-[#A9ACC8]">
                Complete 28-field demographic, church & spiritual profile
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Category Navigation */}
        <div className="flex items-center gap-1.5 px-5 py-2.5 border-b border-[#E9EBF5] dark:border-[#2D2D55] bg-white dark:bg-[#14142E] overflow-x-auto shrink-0 scrollbar-none">
          {[
            { id: 'basic', label: '1. Identity & Contact', icon: Users },
            { id: 'location', label: '2. Residence & GPS', icon: MapPin },
            { id: 'church', label: '3. Church & Squads', icon: Shield },
            { id: 'family', label: '4. Family & Emergency', icon: Heart },
            { id: 'spiritual', label: '5. Spiritual Dates', icon: Calendar },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-[#6D5CF2] text-white shadow-xs'
                    : 'text-[#666A86] dark:text-[#A9ACC8] hover:bg-slate-100 dark:hover:bg-white/5'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {submitError && (
          <div className="mx-5 mt-3 px-3.5 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 flex items-center gap-2 text-xs font-semibold text-rose-600 dark:text-rose-400 shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{submitError}</span>
          </div>
        )}

        {/* Modal Form Body */}
        <form noValidate onSubmit={(e) => handleSubmit(e, false)} className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* TAB 1: IDENTITY & CONTACT */}
          {activeTab === 'basic' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                    FIRST NAME <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => {
                      setFirstName(e.target.value);
                      if (errors.firstName) setErrors((prev) => ({ ...prev, firstName: '' }));
                    }}
                    placeholder="e.g. Kwame"
                    className={`w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-[#1D1D3D] border ${
                      errors.firstName
                        ? 'border-rose-500 focus:ring-rose-500'
                        : 'border-[#E9EBF5] dark:border-[#2D2D55] focus:ring-[#6D5CF2]'
                    } text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2`}
                  />
                  {errors.firstName && <span className="text-[10px] text-rose-500">{errors.firstName}</span>}
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                    MIDDLE NAME
                  </label>
                  <input
                    type="text"
                    value={middleName}
                    onChange={(e) => setMiddleName(e.target.value)}
                    placeholder="e.g. Kofi"
                    className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                    LASTNAME <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => {
                      setLastName(e.target.value);
                      if (errors.lastName) setErrors((prev) => ({ ...prev, lastName: '' }));
                    }}
                    placeholder="Surname / Family name"
                    className={`w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-[#1D1D3D] border ${
                      errors.lastName
                        ? 'border-rose-500 focus:ring-rose-500'
                        : 'border-[#E9EBF5] dark:border-[#2D2D55] focus:ring-[#6D5CF2]'
                    } text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2`}
                  />
                  {errors.lastName && <span className="text-[10px] text-rose-500">{errors.lastName}</span>}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                    PHONE NUMBER <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      if (errors.phone) setErrors((prev) => ({ ...prev, phone: '' }));
                    }}
                    placeholder="024 123 4567"
                    className={`w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-[#1D1D3D] border ${
                      errors.phone
                        ? 'border-rose-500 focus:ring-rose-500'
                        : 'border-[#E9EBF5] dark:border-[#2D2D55] focus:ring-[#6D5CF2]'
                    } text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2`}
                  />
                  {errors.phone && <span className="text-[10px] text-rose-500">{errors.phone}</span>}
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                    ID (MEMBERSHIP CARD)
                  </label>
                  <input
                    type="text"
                    value={memberId}
                    onChange={(e) => setMemberId(e.target.value)}
                    placeholder="MEM-2026-001"
                    className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none font-mono focus:ring-2 focus:ring-[#6D5CF2]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                    GENDER
                  </label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                  >
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                    DATE OF BIRTH
                  </label>
                  <input
                    type="date"
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                    MONTH OF BIRTH
                  </label>
                  <input
                    type="text"
                    value={monthOfBirth}
                    onChange={(e) => setMonthOfBirth(e.target.value)}
                    placeholder="e.g. May"
                    className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                    EMAIL ADDRESS
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (errors.email) setErrors((prev) => ({ ...prev, email: '' }));
                    }}
                    placeholder="member@domain.org"
                    className={`w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-[#1D1D3D] border ${
                      errors.email
                        ? 'border-rose-500 focus:ring-rose-500'
                        : 'border-[#E9EBF5] dark:border-[#2D2D55] focus:ring-[#6D5CF2]'
                    } text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2`}
                  />
                  {errors.email && <span className="text-[10px] text-rose-500">{errors.email}</span>}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: RESIDENCE & LOCATION */}
          {activeTab === 'location' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                    PLACE OF RESIDENCE
                  </label>
                  <input
                    type="text"
                    value={placeOfResidence}
                    onChange={(e) => setPlaceOfResidence(e.target.value)}
                    placeholder="e.g. Kwadaso, Kumasi"
                    className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                    RESIDENTIAL/DIGITAL ADDRESS (GhanaPost GPS)
                  </label>
                  <input
                    type="text"
                    value={residentialDigitalAddress}
                    onChange={(e) => setResidentialDigitalAddress(e.target.value)}
                    placeholder="AK-000-0000"
                    className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] font-mono outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                    SPECIFIC LOCATION (Landmark / Area)
                  </label>
                  <input
                    type="text"
                    value={specificLocation}
                    onChange={(e) => setSpecificLocation(e.target.value)}
                    placeholder="Nearest landmark or junction"
                    className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                    HOMETOWN
                  </label>
                  <input
                    type="text"
                    value={hometown}
                    onChange={(e) => setHometown(e.target.value)}
                    placeholder="e.g. Akuapem Akropong, Kumasi"
                    className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: CHURCH & SQUADS */}
          {activeTab === 'church' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                    HOME CELL GROUP
                  </label>
                  <select
                    value={homeCellGroup}
                    onChange={(e) => setHomeCellGroup(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                  >
                    {cellGroupOptions.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                    DEPARTMENT / MINISTRY
                  </label>
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                  >
                    {departmentOptions.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                    SQUADS
                  </label>
                  <input
                    type="text"
                    value={squads}
                    onChange={(e) => setSquads(e.target.value)}
                    placeholder="e.g. Squad Alpha, Praisers"
                    className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                    MEMBERS/OFFICERS NAME (Designation) <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={officerName}
                    onChange={(e) => {
                      setOfficerName(e.target.value);
                      if (errors.officerName) {
                        setErrors((prev) => ({ ...prev, officerName: '' }));
                      }
                    }}
                    className={`w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-[#1D1D3D] border ${
                      errors.officerName
                        ? 'border-rose-500 focus:ring-rose-500 ring-1 ring-rose-500'
                        : 'border-[#E9EBF5] dark:border-[#2D2D55] focus:ring-[#6D5CF2]'
                    } text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 cursor-pointer font-medium transition-all`}
                  >
                    <option value="Member">Member</option>
                    <option value="Deacon">Deacon</option>
                    <option value="Deaconess">Deaconess</option>
                    <option value="Elder">Elder</option>
                    <option value="Pastor">Pastor</option>
                    <option value="Senior Pastor">Senior Pastor</option>
                    <option value="Associate Pastor">Associate Pastor</option>
                    <option value="Youth Pastor">Youth Pastor</option>
                    <option value="Cell Leader">Cell Leader</option>
                    <option value="Ministry Leader">Ministry Leader</option>
                    <option value="Department Head">Department Head</option>
                    <option value="Usher Captain">Usher Captain</option>
                    <option value="Other">Other (Specify Custom...)</option>
                  </select>

                  {officerName === 'Other' && (
                    <div className="mt-2 animate-in fade-in slide-in-from-top-1 duration-150">
                      <input
                        type="text"
                        value={customOfficerName}
                        onChange={(e) => {
                          setCustomOfficerName(e.target.value);
                          if (errors.officerName) {
                            setErrors((prev) => ({ ...prev, officerName: '' }));
                          }
                        }}
                        placeholder="Type custom designation (e.g. Protocol Lead)"
                        className={`w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-[#1D1D3D] border ${
                          errors.officerName
                            ? 'border-rose-500 focus:ring-rose-500 ring-1 ring-rose-500'
                            : 'border-[#E9EBF5] dark:border-[#2D2D55] focus:ring-[#6D5CF2]'
                        } text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2`}
                      />
                    </div>
                  )}

                  {errors.officerName && (
                    <span className="text-[10px] text-rose-500 mt-1 block font-semibold">
                      {errors.officerName}
                    </span>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                    OCCUPATION
                  </label>
                  <input
                    type="text"
                    value={occupation}
                    onChange={(e) => setOccupation(e.target.value)}
                    placeholder="e.g. Civil Engineer, Teacher"
                    className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                  REMARKS / PASTORAL NOTES
                </label>
                <textarea
                  rows={2}
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Additional pastoral notes or special responsibilities..."
                  className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                />
              </div>
            </div>
          )}

          {/* TAB 4: FAMILY & EMERGENCY */}
          {activeTab === 'family' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                    MARITAL STATUS
                  </label>
                  <select
                    value={maritalStatus}
                    onChange={(e) => setMaritalStatus(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                  >
                    <option value="Single">Single</option>
                    <option value="Married">Married</option>
                    <option value="Widowed">Widowed</option>
                    <option value="Divorced">Divorced</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                    NAME OF SPOUSE
                  </label>
                  <input
                    type="text"
                    disabled={maritalStatus !== 'Married'}
                    value={spouseName}
                    onChange={(e) => setSpouseName(e.target.value)}
                    placeholder="Spouse full name"
                    className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2] disabled:opacity-40"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                    NUMBER OF CHILDREN
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={numberOfChildren}
                    onChange={(e) => setNumberOfChildren(parseInt(e.target.value, 10) || 0)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                    NAME OF PERSON TO CONTACT IN CASE OF EMERGENCY
                  </label>
                  <input
                    type="text"
                    value={emergencyContactPerson}
                    onChange={(e) => setEmergencyContactPerson(e.target.value)}
                    placeholder="Emergency contact full name"
                    className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                    EMERGENCY (Phone / Contact)
                  </label>
                  <input
                    type="tel"
                    value={emergencyContactPhone}
                    onChange={(e) => setEmergencyContactPhone(e.target.value)}
                    placeholder="+233 24 411 2233"
                    className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] font-mono outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                  IMAGE (Photo URL)
                </label>
                <input
                  type="url"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://.../photo.jpg"
                  className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                />
              </div>
            </div>
          )}

          {/* TAB 5: SPIRITUAL MILESTONES */}
          {activeTab === 'spiritual' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                    DATE OF SALVATION
                  </label>
                  <input
                    type="date"
                    value={dateOfSalvation}
                    onChange={(e) => setDateOfSalvation(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                    DATE OF BAPTISM
                  </label>
                  <input
                    type="date"
                    value={dateOfBaptism}
                    onChange={(e) => setDateOfBaptism(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                    DATE OF MARRIAGE
                  </label>
                  <input
                    type="date"
                    value={dateOfMarriage}
                    onChange={(e) => setDateOfMarriage(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                    DATE OF MEMBERSHIP
                  </label>
                  <input
                    type="date"
                    value={dateOfMembership}
                    onChange={(e) => setDateOfMembership(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                  />
                </div>
              </div>

              {/* Proximity Auto Check-in Consent */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.02] border border-[#E9EBF5] dark:border-[#2D2D55] flex items-center justify-between">
                <div>
                  <b className="text-xs text-[#1D1B3A] dark:text-[#F2F2FA] block">
                    Proximity Auto Check-in Consent (Ghana Act 843)
                  </b>
                  <p className="text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
                    Member explicitly consents to automated geofence and BLE beacon arrival detection.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={autoCheckinOptedIn}
                  onChange={(e) => setAutoCheckinOptedIn(e.target.checked)}
                  className="w-4 h-4 rounded text-[#6D5CF2] focus:ring-[#6D5CF2]"
                />
              </div>
            </div>
          )}

          {/* Form Footer Action Buttons */}
          <div className="pt-4 border-t border-[#E9EBF5] dark:border-[#2D2D55] flex items-center justify-between">
            <div className="flex gap-1.5">
              {activeTab !== 'basic' && (
                <button
                  type="button"
                  onClick={() => {
                    const allTabs: ('basic' | 'location' | 'church' | 'family' | 'spiritual')[] = [
                      'basic',
                      'location',
                      'church',
                      'family',
                      'spiritual',
                    ];
                    const idx = allTabs.indexOf(activeTab);
                    if (idx > 0) setActiveTab(allTabs[idx - 1]);
                  }}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold text-[#666A86] dark:text-[#A9ACC8] hover:bg-slate-100 dark:hover:bg-white/5"
                >
                  Previous
                </button>
              )}
              {activeTab !== 'spiritual' && (
                <button
                  type="button"
                  onClick={() => {
                    const allTabs: ('basic' | 'location' | 'church' | 'family' | 'spiritual')[] = [
                      'basic',
                      'location',
                      'church',
                      'family',
                      'spiritual',
                    ];
                    const idx = allTabs.indexOf(activeTab);
                    if (idx < allTabs.length - 1) setActiveTab(allTabs[idx + 1]);
                  }}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold text-[#6D5CF2] bg-[#EFEDFF] dark:bg-[#2A2A55]"
                >
                  Next Step
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={savingMode !== null}
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-bold text-[#666A86] dark:text-[#A9ACC8] hover:bg-slate-100 dark:hover:bg-white/5 disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>

              {!initialData && (
                <button
                  type="button"
                  disabled={savingMode !== null}
                  onClick={(e) => handleSubmit(e, true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] hover:bg-[#E2DEFF] active:scale-[0.98] disabled:opacity-60 transition-all cursor-pointer"
                >
                  {savingMode === 'another' ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Save & Add Another</span>
                  )}
                </button>
              )}

              <button
                type="submit"
                disabled={savingMode !== null}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold bg-[#6D5CF2] text-white hover:bg-[#5b4be0] active:scale-[0.98] disabled:opacity-60 shadow-sm transition-all cursor-pointer"
              >
                {savingMode === 'close' ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>{initialData ? 'Update Member' : 'Register Member'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
