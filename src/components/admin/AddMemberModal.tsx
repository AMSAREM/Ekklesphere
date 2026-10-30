import React, { useState } from 'react';
import { useEkklesphere } from '../../context/EkklesphereContext';
import { Person, MemberStatus } from '../../types/ekklesphere';
import {
  X,
  UserPlus,
  Check,
  Phone,
  Mail,
  Users,
  MapPin,
  Calendar,
  Heart,
  Shield,
  Briefcase,
  FileText,
  Clock,
  Sparkles
} from 'lucide-react';

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
  const { addMember, updateMember, showToast } = useEkklesphere();

  const [activeTab, setActiveTab] = useState<'basic' | 'location' | 'church' | 'family' | 'spiritual'>('basic');

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
    initialData?.homeCellGroup || initialData?.groupName || 'Osu North cell'
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

    // Designation validation
    const resolvedOfficer = officerName === 'Other' ? customOfficerName.trim() : officerName.trim();
    if (!resolvedOfficer) {
      newErrors.officerName = 'Designation is required';
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

    const finalPhone = formatE164(phone);
    const generatedId = memberId.trim() || `ACC-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;
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
      monthOfBirth: monthOfBirth || (dateOfBirth ? new Date(dateOfBirth).toLocaleString('default', { month: 'long' }) : undefined),
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

    if (initialData) {
      updateMember(initialData.id, memberPayload);
      onClose();
    } else {
      const created = addMember(memberPayload as Omit<Person, 'id' | 'tenantId' | 'avatarInitials' | 'joinedOn'>);
      if (onMemberAdded) onMemberAdded(created);

      if (addAnother) {
        setFirstName('');
        setMiddleName('');
        setLastName('');
        setPhone('');
        setEmail('');
        setSpecificLocation('');
        setResidentialDigitalAddress('');
        showToast('Member added! Form reset for next entry.');
      } else {
        onClose();
      }
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

        {/* Modal Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
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
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="e.g. Kwame"
                    className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
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
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="e.g. Mensah"
                    className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
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
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="024 123 4567"
                    className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
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
                    placeholder="ACC-2024-001"
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
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="kwame@example.com"
                    className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                  />
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
                    placeholder="e.g. Osu RE, Accra"
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
                    placeholder="GA-032-8812"
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
                    placeholder="Near Danquah Circle, opposite Shell station"
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
                    {COMMON_CELL_GROUPS.map((g) => (
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
                    {COMMON_DEPARTMENTS.map((d) => (
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
                    placeholder="e.g. Akosua Mensah"
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
                    placeholder="e.g. Mrs. Grace Mensah"
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
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-bold text-[#666A86] dark:text-[#A9ACC8] hover:bg-slate-100 dark:hover:bg-white/5"
              >
                Cancel
              </button>

              {!initialData && (
                <button
                  type="button"
                  onClick={(e) => handleSubmit(e, true)}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] hover:bg-[#E2DEFF] transition-all"
                >
                  Save & Add Another
                </button>
              )}

              <button
                type="submit"
                className="px-5 py-2 rounded-xl text-xs font-bold bg-[#6D5CF2] text-white hover:bg-[#5b4be0] shadow-sm transition-all"
              >
                {initialData ? 'Update Member' : 'Register Member'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
