import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useEkklesphere } from '../../context/EkklesphereContext';
import { computeDashboardAnalytics } from '../../utils/dashboardAnalytics';
import {
  filterMembersForLeaderPicker,
  getMemberFullName,
  isAssignedLeaderName,
  normalizeSettingLabel,
  resolveMemberLeaderInput,
} from '../../utils/settingsConnections';
import { getCanonicalMemberId } from '../member/DigitalMemberCard';
import { MemberAvatar } from '../common/MemberAvatar';
import { UserManagement } from '../UserManagement';
import { compressImageFile } from '../../utils/imageCompression';
import { resolveDisplayImageUrl } from '../../utils/imageUrl';
import {
  SystemSettings,
  ChurchGroup,
  ChurchGroupCategory,
  ChurchGroupCategoryDefinition,
  ChurchGroupLeadershipHistoryEntry,
  GroupCategoryColor,
  Person,
  ConsolePlan,
  LicenseEvaluationResult,
  LicenseTier,
  SystemLicense,
  BillingCycle,
  PaymentMethod,
} from '../../types/ekklesphere';
import {
  BUILT_IN_GROUP_CATEGORIES,
  CUSTOM_GROUP_CATEGORY_PRESETS,
  GROUP_CATEGORY_COLOR_OPTIONS,
  ResolvedChurchGroupItem,
  expandAllAutomaticChurchGroups,
  getAllGroupCategories,
  getGroupCategoryMeta,
  getGroupCategoryStyles,
  isDepartmentLikeCategory,
  isMonthBornCategory,
  normalizeGroupCategorySlug,
  pluralizeCategoryLabel,
  sanitizeCustomGroupCategories,
} from '../../shared/groupCategories';
import { resolveMemberBirthFields } from '../../utils/birthMonth';
import {
  Building2,
  Radio,
  HeartHandshake,
  ShieldCheck,
  Send,
  Save,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Sliders,
  MapPin,
  Clock,
  Bell,
  Smartphone,
  CreditCard,
  FileText,
  HelpCircle,
  Sparkles,
  X,
  Users,
  Plus,
  Search,
  Edit3,
  Trash2,
  Check,
  Phone,
  Mail,
  Calendar,
  Filter,
  Eye,
  UserCheck,
  ChevronRight,
  ExternalLink,
  Layers,
  MessageSquare,
  Navigation,
  Crosshair,
  Shield,
  BarChart3,
  History,
  ArrowRight,
  RefreshCw,
  KeyRound,
  EyeOff,
  Copy,
  Lock,
  Upload,
} from 'lucide-react';

interface SystemSettingsPanelProps {
  onClose?: () => void;
  isModal?: boolean;
}

export const SystemSettingsPanel: React.FC<SystemSettingsPanelProps> = ({ onClose, isModal }) => {
  const {
    currentUser,
    isSessionVerified,
    handleUnauthorizedSession,
    systemSettings,
    systemSettingsStorageBackend,
    isSyncingSystemSettings,
    updateSystemSettings,
    resetSystemSettings,
    communicationStatus,
    saveTenantGatewayKeys,
    testPaystackGateway,
    sendTestSmsGateway,
    sendTestEmailGateway,
    autoAssignAbsentees,
    isAutoAssigningAbsentees,
    setChurchPremiseLocation,
    clearChurchPremiseLocation,
    showToast,
    auditLogs,
    refreshAuditLogs,
    churchGroups,
    leadershipHistory,
    isLoadingLeadershipHistory,
    refreshLeadershipHistory,
    addChurchGroup,
    updateChurchGroup,
    deleteChurchGroup,
    toggleChurchGroupStatus,
    getGroupMembers,
    members,
    attendanceRecords,
    services,
    currentService,
    followupTasks,
    donations,
    pushPermissionStatus,
    pushSubscribersCount,
    requestPushPermission,
    sendTestPushNotification,
    requestedSettingsTab,
    requestOpenAnalytics,
    setAdminSubTab,
  } = useEkklesphere();

  const isSettingsAdmin =
    currentUser?.role === 'admin' ||
    currentUser?.role === 'super_admin' ||
    currentUser?.role === 'creator';

  const [activeTab, setActiveTab] = useState<'general' | 'groups' | 'proximity' | 'pastoral' | 'privacy' | 'gateways' | 'staff' | 'billing'>(
    requestedSettingsTab?.tab || 'general'
  );

  const structureAnalytics = useMemo(
    () =>
      computeDashboardAnalytics({
        members,
        attendanceRecords,
        services,
        currentService,
        churchGroups,
        followupTasks,
        donations,
        systemSettings,
      }),
    [members, attendanceRecords, services, currentService, churchGroups, followupTasks, donations, systemSettings]
  );

  const groupMetricsByName = useMemo(() => {
    const map = new Map<string, (typeof structureAnalytics.groups)[number]>();
    for (const row of structureAnalytics.groups) {
      map.set(normalizeSettingLabel(row.name).toLowerCase(), row);
    }
    return map;
  }, [structureAnalytics.groups]);

  const unconfiguredRosterGroups = useMemo(
    () => structureAnalytics.groups.filter((g) => !g.isConfiguredInDb),
    [structureAnalytics.groups]
  );
  const [billingPlans, setBillingPlans] = useState<ConsolePlan[]>([]);
  const [licenseEval, setLicenseEval] = useState<LicenseEvaluationResult | null>(null);
  const [currentLicense, setCurrentLicense] = useState<SystemLicense | null>(null);
  const [isLoadingBilling, setIsLoadingBilling] = useState(false);
  const [isUpgradingPlan, setIsUpgradingPlan] = useState(false);
  const [upgradeTier, setUpgradeTier] = useState<LicenseTier>('ministry_pro');
  const [upgradeCycle, setUpgradeCycle] = useState<BillingCycle>('annual');
  const [upgradeMethod, setUpgradeMethod] = useState<PaymentMethod>('momo');
  const [upgradeReference, setUpgradeReference] = useState('');

  const loadBillingDetails = useCallback(async () => {
    if (!isSessionVerified || !currentUser?.token || !isSettingsAdmin) return;
    setIsLoadingBilling(true);
    try {
      const res = await fetch('/api/organisation/plans', {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${currentUser.token}`,
        },
      });
      if (handleUnauthorizedSession(res.status)) return;
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data?.plans)) setBillingPlans(data.plans);
      if (data?.evaluation) {
        setLicenseEval(data.evaluation);
        if (data.evaluation.tier) setUpgradeTier(data.evaluation.tier);
      }
      if (data?.license) setCurrentLicense(data.license);
    } catch {
      // ignore transient network failures
    } finally {
      setIsLoadingBilling(false);
    }
  }, [isSessionVerified, currentUser?.token, isSettingsAdmin]);

  useEffect(() => {
    loadBillingDetails();
  }, [loadBillingDetails]);

  const handleUpgradePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    const token =
      currentUser?.token ||
      (typeof window !== 'undefined' ? localStorage.getItem('ekklesphere_token') : null);
    if (!token) {
      showToast('Sign in as an organisation administrator to upgrade.');
      return;
    }
    if (!upgradeReference.trim() || upgradeReference.trim().length < 2) {
      showToast('Enter your payment or transaction reference.');
      return;
    }

    setIsUpgradingPlan(true);
    try {
      const res = await fetch('/api/organisation/upgrade', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          tier: upgradeTier,
          billingCycle: upgradeCycle,
          paymentMethod: upgradeMethod,
          paymentReference: upgradeReference.trim(),
          currency: 'USD',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data?.message || 'Could not process plan upgrade.');
        return;
      }
      if (data?.evaluation) setLicenseEval(data.evaluation);
      if (data?.license) setCurrentLicense(data.license);
      setUpgradeReference('');
      showToast(`Subscription upgraded to ${upgradeTier.replace('_', ' ')}!`);
    } catch {
      showToast('Network error upgrading subscription.');
    } finally {
      setIsUpgradingPlan(false);
    }
  };
  const [formData, setFormData] = useState<SystemSettings>({ ...systemSettings });
  const [hasChanges, setHasChanges] = useState(false);
  const hasChangesRef = useRef(false);
  const focusedFieldRef = useRef<string | null>(null);
  const lastSyncedSettingsRef = useRef<SystemSettings>({ ...systemSettings });
  const lastHandledSettingsNonceRef = useRef<number | null>(null);
  const testEmailTouchedRef = useRef(false);

  const [lastSavedTime, setLastSavedTime] = useState<string>('Just now');
  const [isCapturingGps, setIsCapturingGps] = useState(false);
  const [gpsCaptureError, setGpsCaptureError] = useState<string | null>(null);
  const [latInput, setLatInput] = useState<string>(
    systemSettings.campusLatitude != null ? String(systemSettings.campusLatitude) : ''
  );
  const [lngInput, setLngInput] = useState<string>(
    systemSettings.campusLongitude != null ? String(systemSettings.campusLongitude) : ''
  );
  const [outerGeofenceDraft, setOuterGeofenceDraft] = useState<string>(
    String(systemSettings.outerGeofenceMeters ?? 300)
  );
  const [innerGeofenceDraft, setInnerGeofenceDraft] = useState<string>(
    String(systemSettings.innerGeofenceMeters ?? 100)
  );
  const [dwellTimeDraft, setDwellTimeDraft] = useState<string>(
    String(systemSettings.dwellTimeMinutes ?? 5)
  );
  const [bleBeaconDraft, setBleBeaconDraft] = useState<string>(
    String(systemSettings.bleBeaconRssiThreshold ?? -70)
  );
  const [beforeWindowDraft, setBeforeWindowDraft] = useState<string>(
    String(systemSettings.serviceWindowBeforeMinutes ?? 45)
  );
  const [afterWindowDraft, setAfterWindowDraft] = useState<string>(
    String(systemSettings.serviceWindowAfterMinutes ?? 30)
  );

  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDeleteGroupId, setConfirmDeleteGroupId] = useState<string | null>(null);
  const [sharedMapLink, setSharedMapLink] = useState('');
  const [isResolvingMapLink, setIsResolvingMapLink] = useState(false);
  const [isTestingSms, setIsTestingSms] = useState(false);
  const [testSmsRecipientPhone, setTestSmsRecipientPhone] = useState('');
  const [testEmailRecipient, setTestEmailRecipient] = useState(
    systemSettings.contactEmail || currentUser?.email || ''
  );
  const [isTestingEmail, setIsTestingEmail] = useState(false);

  // Per-tenant encrypted gateway credentials (Arkesel & Paystack)
  const [arkeselApiKeyInput, setArkeselApiKeyInput] = useState('');
  const [showArkeselKey, setShowArkeselKey] = useState(false);
  const [isSavingArkeselKey, setIsSavingArkeselKey] = useState(false);

  const [paystackPublicKeyInput, setPaystackPublicKeyInput] = useState(
    communicationStatus.paystackPublicKey || ''
  );
  const [paystackSecretKeyInput, setPaystackSecretKeyInput] = useState('');
  const [showPaystackSecret, setShowPaystackSecret] = useState(false);
  const [isSavingPaystackKeys, setIsSavingPaystackKeys] = useState(false);
  const [isTestingPaystack, setIsTestingPaystack] = useState(false);
  const [isUploadingChurchLogo, setIsUploadingChurchLogo] = useState(false);
  const churchLogoFileInputRef = useRef<HTMLInputElement>(null);

  const handleChurchLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('Please select a PNG, JPG, or WebP logo image.');
      return;
    }
    setIsUploadingChurchLogo(true);
    try {
      const compressed = await compressImageFile(file, {
        maxDimension: 256,
        maxDataUrlBytes: 28000,
        initialQuality: 0.86,
        square: false,
      });
      hasChangesRef.current = true;
      setHasChanges(true);
      setFormData((prev) => ({ ...prev, churchLogoUrl: compressed }));
      showToast('Church logo ready. Click Save Settings to apply across portals.');
    } catch {
      showToast('Could not process the selected logo image.');
    } finally {
      setIsUploadingChurchLogo(false);
      if (churchLogoFileInputRef.current) churchLogoFileInputRef.current.value = '';
    }
  };

  useEffect(() => {
    if (communicationStatus.paystackPublicKey !== undefined) {
      setPaystackPublicKeyInput(communicationStatus.paystackPublicKey || '');
    }
  }, [communicationStatus.paystackPublicKey]);

  const syncNumericDraftsFromSettings = useCallback(
    (source: SystemSettings, skipFocused = true) => {
      const focused = skipFocused ? focusedFieldRef.current : null;
      if (focused !== 'outerGeofenceMeters') {
        setOuterGeofenceDraft(String(source.outerGeofenceMeters ?? 300));
      }
      if (focused !== 'innerGeofenceMeters') {
        setInnerGeofenceDraft(String(source.innerGeofenceMeters ?? 100));
      }
      if (focused !== 'dwellTimeMinutes') {
        setDwellTimeDraft(String(source.dwellTimeMinutes ?? 5));
      }
      if (focused !== 'bleBeaconRssiThreshold') {
        setBleBeaconDraft(String(source.bleBeaconRssiThreshold ?? -70));
      }
      if (focused !== 'serviceWindowBeforeMinutes') {
        setBeforeWindowDraft(String(source.serviceWindowBeforeMinutes ?? 45));
      }
      if (focused !== 'serviceWindowAfterMinutes') {
        setAfterWindowDraft(String(source.serviceWindowAfterMinutes ?? 30));
      }
    },
    []
  );

  useEffect(() => {
    hasChangesRef.current = hasChanges;
  }, [hasChanges]);

  useEffect(() => {
    if (!testEmailTouchedRef.current && !testEmailRecipient) {
      const fallback = (systemSettings.contactEmail || currentUser?.email || '').trim();
      if (fallback) {
        setTestEmailRecipient(fallback);
      }
    }
  }, [systemSettings.contactEmail, currentUser?.email, testEmailRecipient]);

  useEffect(() => {
    if (hasChangesRef.current || hasChanges) return;
    if (JSON.stringify(lastSyncedSettingsRef.current) === JSON.stringify(systemSettings)) {
      return;
    }
    lastSyncedSettingsRef.current = { ...systemSettings };
    setFormData({ ...systemSettings });
    if (focusedFieldRef.current !== 'lat') {
      setLatInput(systemSettings.campusLatitude != null ? String(systemSettings.campusLatitude) : '');
    }
    if (focusedFieldRef.current !== 'lng') {
      setLngInput(systemSettings.campusLongitude != null ? String(systemSettings.campusLongitude) : '');
    }
    syncNumericDraftsFromSettings(systemSettings, true);
  }, [systemSettings, hasChanges, syncNumericDraftsFromSettings]);

  useEffect(() => {
    const sanitized = sanitizeCustomGroupCategories(systemSettings.customGroupCategories);
    const sanitizedJson = JSON.stringify(sanitized);
    setFormData((prev) => {
      if (JSON.stringify(prev.customGroupCategories || []) === sanitizedJson) {
        return prev;
      }
      return {
        ...prev,
        customGroupCategories: sanitized,
      };
    });
  }, [systemSettings.customGroupCategories]);

  const customGroupCategories = useMemo(
    () => sanitizeCustomGroupCategories(systemSettings.customGroupCategories),
    [systemSettings.customGroupCategories]
  );

  const allGroupCategories = useMemo(
    () => getAllGroupCategories(customGroupCategories, churchGroups, leadershipHistory),
    [customGroupCategories, churchGroups, leadershipHistory]
  );

  const effectiveChurchGroups = useMemo(
    () => expandAllAutomaticChurchGroups(churchGroups, allGroupCategories),
    [churchGroups, allGroupCategories]
  );

  const birthAssignedMembersCount = useMemo(
    () =>
      members.filter((m) =>
        Boolean(
          resolveMemberBirthFields({
            dateOfBirth: m.dateOfBirth,
            monthOfBirth: m.monthOfBirth,
            birthMonthGroup: m.birthMonthGroup,
          }).monthOfBirth
        )
      ).length,
    [members]
  );

  // Groups Management Local States
  const [groupFilterCategory, setGroupFilterCategory] = useState<'all' | ChurchGroupCategory>('all');
  const [groupFilterStatus, setGroupFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [groupSearchQuery, setGroupSearchQuery] = useState('');
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [viewingMembersGroup, setViewingMembersGroup] = useState<ResolvedChurchGroupItem | null>(null);

  const filteredEffectiveGroups = useMemo(() => {
    const q = groupSearchQuery.trim().toLowerCase();
    return effectiveChurchGroups.filter((group) => {
      if (groupFilterCategory !== 'all' && group.category !== groupFilterCategory) return false;
      if (groupFilterStatus === 'active' && !group.active) return false;
      if (groupFilterStatus === 'inactive' && group.active) return false;
      if (!q) return true;
      return (
        group.name.toLowerCase().includes(q) ||
        group.leaderName.toLowerCase().includes(q) ||
        (group.meetingLocation && group.meetingLocation.toLowerCase().includes(q)) ||
        (group.meetingDay && group.meetingDay.toLowerCase().includes(q)) ||
        (group.description && group.description.toLowerCase().includes(q))
      );
    });
  }, [effectiveChurchGroups, groupFilterCategory, groupFilterStatus, groupSearchQuery]);

  // Custom Group Category Creation & Management States
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [catLabel, setCatLabel] = useState('');
  const [catPluralLabel, setCatPluralLabel] = useState('');
  const [catDescription, setCatDescription] = useState('');
  const [catColor, setCatColor] = useState<GroupCategoryColor>('violet');
  const [catError, setCatError] = useState<string | null>(null);
  const [isSavingCategory, setIsSavingCategory] = useState(false);

  // Inline Quick Category Creator inside Add/Edit Group Modal
  const [showInlineCategoryCreator, setShowInlineCategoryCreator] = useState(false);
  const [inlineCatLabel, setInlineCatLabel] = useState('');
  const [inlineCatDesc, setInlineCatDesc] = useState('');
  const [inlineCatColor, setInlineCatColor] = useState<GroupCategoryColor>('violet');
  const [inlineCatError, setInlineCatError] = useState<string | null>(null);
  const [isSavingInlineCat, setIsSavingInlineCat] = useState(false);

  // Leadership Change History Local States
  const [historyFilterCategory, setHistoryFilterCategory] = useState<'all' | ChurchGroupCategory>('all');
  const [historyFilterGroupId, setHistoryFilterGroupId] = useState<string>('all');
  const [historyFilterRole, setHistoryFilterRole] = useState<'all' | 'primary_leader' | 'assistant_leader'>('all');
  const [historySearchQuery, setHistorySearchQuery] = useState('');
  const leadershipHistorySectionRef = React.useRef<HTMLDivElement | null>(null);

  // Group Form State
  const [groupName, setGroupName] = useState('');
  const [groupCategory, setGroupCategory] = useState<ChurchGroupCategory>('cell_group');
  const [groupLeader, setGroupLeader] = useState('');
  const [groupLeaderMemberId, setGroupLeaderMemberId] = useState('');
  const [groupLeaderPhone, setGroupLeaderPhone] = useState('');
  const [groupLeaderEmail, setGroupLeaderEmail] = useState('');
  const [groupAssistant, setGroupAssistant] = useState('');
  const [groupAssistantMemberId, setGroupAssistantMemberId] = useState('');
  const [leaderChangeReason, setLeaderChangeReason] = useState('');
  const [groupDay, setGroupDay] = useState('Wednesdays');
  const [groupTime, setGroupTime] = useState('18:30 - 19:45');
  const [groupLocation, setGroupLocation] = useState('');
  const [groupDemographic, setGroupDemographic] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [groupActive, setGroupActive] = useState(true);
  const [groupErrors, setGroupErrors] = useState<Record<string, string>>({});
  const [isSavingGroup, setIsSavingGroup] = useState(false);

  // Member Combobox States for Primary & Assistant Leaders
  const [leaderDropdownOpen, setLeaderDropdownOpen] = useState(false);
  const [assistantDropdownOpen, setAssistantDropdownOpen] = useState(false);
  const [leaderHighlightIdx, setLeaderHighlightIdx] = useState(0);
  const [assistantHighlightIdx, setAssistantHighlightIdx] = useState(0);

  const primaryLeaderResolution = useMemo(
    () =>
      resolveMemberLeaderInput(members, {
        memberId: groupLeaderMemberId || undefined,
        inputName: groupLeader,
        requireMatch: true,
      }),
    [members, groupLeaderMemberId, groupLeader]
  );

  const assistantLeaderResolution = useMemo(
    () =>
      resolveMemberLeaderInput(members, {
        memberId: groupAssistantMemberId || undefined,
        inputName: groupAssistant,
        requireMatch: false,
      }),
    [members, groupAssistantMemberId, groupAssistant]
  );

  const primaryLeaderSuggestions = useMemo(
    () =>
      filterMembersForLeaderPicker(members, groupLeader, {
        excludeMemberId: groupAssistantMemberId || undefined,
        limit: 10,
      }),
    [members, groupLeader, groupAssistantMemberId]
  );

  const assistantLeaderSuggestions = useMemo(
    () =>
      filterMembersForLeaderPicker(members, groupAssistant, {
        excludeMemberId: primaryLeaderResolution.member?.id || groupLeaderMemberId || undefined,
        limit: 10,
      }),
    [members, groupAssistant, primaryLeaderResolution.member?.id, groupLeaderMemberId]
  );

  const editingGroupOriginal = useMemo(
    () => (editingGroupId ? churchGroups.find((g) => g.id === editingGroupId) || null : null),
    [editingGroupId, churchGroups]
  );

  const hasLeadershipChangedInModal = useMemo(() => {
    if (!editingGroupOriginal) return false;
    const prevPrimary = normalizeSettingLabel(editingGroupOriginal.leaderName).toLowerCase();
    const nextPrimary = normalizeSettingLabel(
      primaryLeaderResolution.canonicalName || groupLeader
    ).toLowerCase();
    const prevPrimaryId = (editingGroupOriginal.leaderMemberId || '').trim();
    const nextPrimaryId = (primaryLeaderResolution.member?.id || groupLeaderMemberId || '').trim();
    const primaryChanged =
      prevPrimaryId && nextPrimaryId
        ? prevPrimaryId !== nextPrimaryId
        : prevPrimary !== nextPrimary;

    const prevAssistant = normalizeSettingLabel(editingGroupOriginal.assistantLeader).toLowerCase();
    const nextAssistant = normalizeSettingLabel(
      assistantLeaderResolution.canonicalName || groupAssistant
    ).toLowerCase();
    const prevAssistantId = (editingGroupOriginal.assistantLeaderMemberId || '').trim();
    const nextAssistantId = (
      assistantLeaderResolution.member?.id ||
      groupAssistantMemberId ||
      ''
    ).trim();
    const assistantChanged =
      prevAssistantId && nextAssistantId
        ? prevAssistantId !== nextAssistantId
        : prevAssistant !== nextAssistant;

    return primaryChanged || assistantChanged;
  }, [
    editingGroupOriginal,
    primaryLeaderResolution,
    groupLeader,
    groupLeaderMemberId,
    assistantLeaderResolution,
    groupAssistant,
    groupAssistantMemberId,
  ]);

  const handleSelectPrimaryLeader = useCallback(
    (member: Person) => {
      const fullName = getMemberFullName(member);
      setGroupLeader(fullName);
      setGroupLeaderMemberId(member.id);
      setGroupLeaderPhone(member.phoneE164 || '');
      setGroupLeaderEmail(member.email || '');
      setLeaderDropdownOpen(false);
      setLeaderHighlightIdx(0);
      setGroupErrors((prev) => {
        if (!prev.leader && !prev.form) return prev;
        const { leader: _l, form: _f, ...rest } = prev;
        return rest;
      });
    },
    []
  );

  const handleSelectAssistantLeader = useCallback(
    (member: Person) => {
      const fullName = getMemberFullName(member);
      setGroupAssistant(fullName);
      setGroupAssistantMemberId(member.id);
      setAssistantDropdownOpen(false);
      setAssistantHighlightIdx(0);
      setGroupErrors((prev) => {
        if (!prev.assistantLeader && !prev.form) return prev;
        const { assistantLeader: _a, form: _f, ...rest } = prev;
        return rest;
      });
    },
    []
  );

  const openCategoryModal = useCallback((catToEdit?: ChurchGroupCategoryDefinition) => {
    if (catToEdit) {
      setEditingCategoryId(catToEdit.id);
      setCatLabel(catToEdit.label);
      setCatPluralLabel(catToEdit.pluralLabel || pluralizeCategoryLabel(catToEdit.label));
      setCatDescription(catToEdit.description || '');
      setCatColor(catToEdit.color || 'violet');
    } else {
      setEditingCategoryId(null);
      setCatLabel('');
      setCatPluralLabel('');
      setCatDescription('');
      setCatColor('violet');
    }
    setCatError(null);
    setIsSavingCategory(false);
    setIsCategoryModalOpen(true);
  }, []);

  const handleSaveCustomCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSettingsAdmin) {
      showToast('Only administrators can create or edit group categories.');
      return;
    }

    const cleanLabel = catLabel.trim().replace(/\s+/g, ' ');
    if (!cleanLabel) {
      setCatError('Category name is required (e.g. Department, Month Born).');
      return;
    }

    const targetSlug = editingCategoryId || normalizeGroupCategorySlug(cleanLabel);
    if (!targetSlug) {
      setCatError('Enter a valid category name containing letters or numbers.');
      return;
    }

    if (BUILT_IN_GROUP_CATEGORIES.some((b) => b.id === targetSlug)) {
      setCatError(`"${cleanLabel}" matches a built-in category. Choose a distinct name.`);
      return;
    }

    if (!editingCategoryId && customGroupCategories.some((c) => c.id === targetSlug)) {
      setCatError(`Category "${cleanLabel}" already exists.`);
      return;
    }

    const nextEntry: ChurchGroupCategoryDefinition = {
      id: targetSlug,
      label: cleanLabel.slice(0, 48),
      pluralLabel: (catPluralLabel.trim() || pluralizeCategoryLabel(cleanLabel)).slice(0, 56),
      description: (catDescription.trim() || 'Custom Category').slice(0, 100),
      color: catColor,
      isBuiltIn: false,
      createdAt:
        customGroupCategories.find((c) => c.id === targetSlug)?.createdAt ||
        new Date().toISOString(),
    };

    const nextCustomList = editingCategoryId
      ? customGroupCategories.map((c) => (c.id === editingCategoryId ? nextEntry : c))
      : [...customGroupCategories, nextEntry];

    setIsSavingCategory(true);
    setCatError(null);
    try {
      const ok = await updateSystemSettings({ customGroupCategories: nextCustomList });
      if (!ok) {
        setCatError('Could not save category to database. Please try again.');
        return;
      }
      showToast(
        editingCategoryId
          ? `Category "${nextEntry.label}" updated`
          : `Category "${nextEntry.label}" created`
      );
      setEditingCategoryId(null);
      setCatLabel('');
      setCatPluralLabel('');
      setCatDescription('');
      setCatColor('violet');
    } finally {
      setIsSavingCategory(false);
    }
  };

  const handleDeleteCustomCategory = async (categoryId: string) => {
    if (!isSettingsAdmin) {
      showToast('Only administrators can remove custom categories.');
      return;
    }
    const groupsUsingCategory = churchGroups.filter((g) => g.category === categoryId).length;
    if (groupsUsingCategory > 0) {
      setCatError(
        `Cannot delete this category while ${groupsUsingCategory} group${
          groupsUsingCategory === 1 ? '' : 's'
        } are assigned to it. Reassign those groups first.`
      );
      return;
    }

    const target = customGroupCategories.find((c) => c.id === categoryId);
    const nextCustomList = customGroupCategories.filter((c) => c.id !== categoryId);
    setIsSavingCategory(true);
    setCatError(null);
    try {
      const ok = await updateSystemSettings({ customGroupCategories: nextCustomList });
      if (!ok) {
        setCatError('Could not delete category from database.');
        return;
      }
      if (groupFilterCategory === categoryId) setGroupFilterCategory('all');
      if (historyFilterCategory === categoryId) setHistoryFilterCategory('all');
      if (groupCategory === categoryId) setGroupCategory('cell_group');
      showToast(`Removed category "${target?.label || categoryId}"`);
    } finally {
      setIsSavingCategory(false);
    }
  };

  const handleInlineCreateCategory = async () => {
    if (!isSettingsAdmin) {
      showToast('Only administrators can create group categories.');
      return;
    }
    const cleanLabel = inlineCatLabel.trim().replace(/\s+/g, ' ');
    if (!cleanLabel) {
      setInlineCatError('Enter a category name (e.g. Department or Month Born).');
      return;
    }

    const slug = normalizeGroupCategorySlug(cleanLabel);
    if (!slug) {
      setInlineCatError('Enter a valid category name with letters or numbers.');
      return;
    }
    if (BUILT_IN_GROUP_CATEGORIES.some((b) => b.id === slug)) {
      setGroupCategory(slug);
      setShowInlineCategoryCreator(false);
      setInlineCatLabel('');
      setInlineCatDesc('');
      setInlineCatError(null);
      return;
    }
    const existing = customGroupCategories.find((c) => c.id === slug);
    if (existing) {
      setGroupCategory(existing.id);
      setShowInlineCategoryCreator(false);
      setInlineCatLabel('');
      setInlineCatDesc('');
      setInlineCatError(null);
      return;
    }

    const nextEntry: ChurchGroupCategoryDefinition = {
      id: slug,
      label: cleanLabel.slice(0, 48),
      pluralLabel: pluralizeCategoryLabel(cleanLabel).slice(0, 56),
      description: (inlineCatDesc.trim() || 'Custom Category').slice(0, 100),
      color: inlineCatColor,
      isBuiltIn: false,
      createdAt: new Date().toISOString(),
    };

    setIsSavingInlineCat(true);
    setInlineCatError(null);
    try {
      const ok = await updateSystemSettings({
        customGroupCategories: [...customGroupCategories, nextEntry],
      });
      if (!ok) {
        setInlineCatError('Could not save custom category.');
        return;
      }
      setGroupCategory(nextEntry.id);
      setShowInlineCategoryCreator(false);
      setInlineCatLabel('');
      setInlineCatDesc('');
      setInlineCatError(null);
      showToast(`Category "${nextEntry.label}" added and selected`);
    } finally {
      setIsSavingInlineCat(false);
    }
  };

  const openAddGroupModal = useCallback((category: ChurchGroupCategory = 'cell_group', prefillName?: string) => {
    setEditingGroupId(null);
    setGroupName(prefillName || '');
    setGroupCategory(category);
    setGroupLeader('');
    setGroupLeaderMemberId('');
    setGroupLeaderPhone('');
    setGroupLeaderEmail('');
    setGroupAssistant('');
    setGroupAssistantMemberId('');
    setLeaderChangeReason('');
    setGroupDay(
      category === 'cell_group'
        ? 'Wednesdays'
        : category === 'ministry'
        ? 'Saturdays'
        : isMonthBornCategory(category)
        ? 'Monthly Fellowship'
        : 'Monthly 2nd Saturday'
    );
    setGroupTime(
      category === 'cell_group'
        ? '18:30 - 19:45'
        : isMonthBornCategory(category)
        ? ''
        : '16:00 - 17:30'
    );
    setGroupLocation('');
    setGroupDemographic('');
    setGroupDescription('');
    setGroupActive(true);
    setGroupErrors({});
    setShowInlineCategoryCreator(false);
    setInlineCatLabel('');
    setInlineCatDesc('');
    setInlineCatError(null);
    setLeaderDropdownOpen(false);
    setAssistantDropdownOpen(false);
    setLeaderHighlightIdx(0);
    setAssistantHighlightIdx(0);
    setIsSavingGroup(false);
    setIsGroupModalOpen(true);
  }, []);

  const openEditGroupModal = useCallback(
    (group: ChurchGroup) => {
      const resolvedPrimary = resolveMemberLeaderInput(members, {
        memberId: group.leaderMemberId,
        inputName: group.leaderName,
        requireMatch: true,
      });
      const resolvedAssistant = resolveMemberLeaderInput(members, {
        memberId: group.assistantLeaderMemberId,
        inputName: group.assistantLeader,
        requireMatch: false,
      });

      setEditingGroupId(group.id);
      setGroupName(group.name);
      setGroupCategory(group.category);
      setGroupLeader(resolvedPrimary.canonicalName || group.leaderName);
      setGroupLeaderMemberId(resolvedPrimary.member?.id || '');
      setGroupLeaderPhone(group.leaderPhone || resolvedPrimary.member?.phoneE164 || '');
      setGroupLeaderEmail(group.leaderEmail || resolvedPrimary.member?.email || '');
      setGroupAssistant(resolvedAssistant.canonicalName || group.assistantLeader || '');
      setGroupAssistantMemberId(resolvedAssistant.member?.id || '');
      setLeaderChangeReason('');
      setGroupDay(group.meetingDay || '');
      setGroupTime(group.meetingTime || '');
      setGroupLocation(group.meetingLocation || '');
      setGroupDemographic(group.targetDemographic || '');
      setGroupDescription(group.description);
      setGroupActive(group.active);
      setGroupErrors({});
      setShowInlineCategoryCreator(false);
      setInlineCatLabel('');
      setInlineCatDesc('');
      setInlineCatError(null);
      setLeaderDropdownOpen(false);
      setAssistantDropdownOpen(false);
      setLeaderHighlightIdx(0);
      setAssistantHighlightIdx(0);
      setIsSavingGroup(false);
      setIsGroupModalOpen(true);
    },
    [members]
  );

  useEffect(() => {
    if (!requestedSettingsTab?.tab) return;
    if (lastHandledSettingsNonceRef.current === requestedSettingsTab.nonce) return;
    lastHandledSettingsNonceRef.current = requestedSettingsTab.nonce;
    setActiveTab(requestedSettingsTab.tab);
    const intent = requestedSettingsTab.groupIntent;
    if (requestedSettingsTab.tab === 'groups' && intent) {
      if (intent.mode === 'edit' && intent.groupId) {
        const target = churchGroups.find((g) => g.id === intent.groupId);
        if (target) {
          openEditGroupModal(target);
        }
      } else if (intent.mode === 'create') {
        openAddGroupModal(intent.prefillCategory || 'cell_group', intent.prefillName);
      }
    }
  }, [requestedSettingsTab, churchGroups, openAddGroupModal, openEditGroupModal]);

  const handleSaveGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    if (!groupName.trim()) errors.name = 'Group name is required';

    const primaryRes = resolveMemberLeaderInput(members, {
      memberId: groupLeaderMemberId || undefined,
      inputName: groupLeader,
      requireMatch: true,
    });
    if (primaryRes.status !== 'matched' || !primaryRes.member) {
      errors.leader =
        primaryRes.error || 'Primary leader must be selected from your enrolled members list.';
    }

    const cleanAssistant = groupAssistant.trim();
    const assistantRes = cleanAssistant
      ? resolveMemberLeaderInput(members, {
          memberId: groupAssistantMemberId || undefined,
          inputName: cleanAssistant,
          requireMatch: false,
        })
      : { status: 'empty' as const };

    if (cleanAssistant) {
      if (assistantRes.status !== 'matched' || !assistantRes.member) {
        errors.assistantLeader =
          assistantRes.error ||
          'Assistant / Co-Leader must match an enrolled member or be left blank.';
      } else if (primaryRes.member && assistantRes.member.id === primaryRes.member.id) {
        errors.assistantLeader =
          'Assistant / Co-Leader must be a different member from the Primary Leader.';
      }
    }

    if (Object.keys(errors).length > 0) {
      setGroupErrors(errors);
      return;
    }

    const primaryMember = primaryRes.member!;
    const assistantMember = assistantRes.status === 'matched' ? assistantRes.member : undefined;

    setIsSavingGroup(true);
    try {
      const result = editingGroupId
        ? await updateChurchGroup(editingGroupId, {
            name: groupName.trim(),
            category: groupCategory,
            leaderName: getMemberFullName(primaryMember),
            leaderMemberId: primaryMember.id,
            leaderPhone: groupLeaderPhone.trim() || primaryMember.phoneE164 || undefined,
            leaderEmail: groupLeaderEmail.trim() || primaryMember.email || undefined,
            assistantLeader: assistantMember ? getMemberFullName(assistantMember) : '',
            assistantLeaderMemberId: assistantMember ? assistantMember.id : undefined,
            leadershipChangeReason: leaderChangeReason.trim() || undefined,
            meetingDay: groupDay.trim() || undefined,
            meetingTime: groupTime.trim() || undefined,
            meetingLocation: groupLocation.trim() || undefined,
            targetDemographic: groupDemographic.trim() || undefined,
            description: groupDescription.trim(),
            active: groupActive,
          })
        : await addChurchGroup({
            name: groupName.trim(),
            category: groupCategory,
            leaderName: getMemberFullName(primaryMember),
            leaderMemberId: primaryMember.id,
            leaderPhone: groupLeaderPhone.trim() || primaryMember.phoneE164 || undefined,
            leaderEmail: groupLeaderEmail.trim() || primaryMember.email || undefined,
            assistantLeader: assistantMember ? getMemberFullName(assistantMember) : undefined,
            assistantLeaderMemberId: assistantMember ? assistantMember.id : undefined,
            meetingDay: groupDay.trim() || undefined,
            meetingTime: groupTime.trim() || undefined,
            meetingLocation: groupLocation.trim() || undefined,
            targetDemographic: groupDemographic.trim() || undefined,
            description: groupDescription.trim(),
            active: groupActive,
          });

      if (!result.ok) {
        setGroupErrors({
          [result.field || 'form']:
            result.message || 'Could not save church group. Please check member selection.',
        });
        return;
      }

      setIsGroupModalOpen(false);
    } finally {
      setIsSavingGroup(false);
    }
  };

  const handleChange = <K extends keyof SystemSettings>(key: K, value: SystemSettings[K]) => {
    hasChangesRef.current = true;
    setHasChanges(true);
    setFormData((prev) => (prev[key] === value ? prev : { ...prev, [key]: value }));
  };

  const handleNumericDraftInput = (
    key:
      | 'outerGeofenceMeters'
      | 'innerGeofenceMeters'
      | 'dwellTimeMinutes'
      | 'bleBeaconRssiThreshold'
      | 'serviceWindowBeforeMinutes'
      | 'serviceWindowAfterMinutes',
    rawValue: string,
    setDraft: React.Dispatch<React.SetStateAction<string>>,
    min: number,
    max: number,
    allowNegative = false
  ) => {
    const pattern = allowNegative ? /^-?\d*$/ : /^\d*$/;
    if (!pattern.test(rawValue)) return;
    setDraft(rawValue);
    hasChangesRef.current = true;
    setHasChanges(true);
    if (rawValue === '' || rawValue === '-') return;
    const parsed = parseInt(rawValue, 10);
    if (!Number.isNaN(parsed) && Number.isFinite(parsed) && parsed >= min && parsed <= max) {
      setFormData((prev) => (prev[key] === parsed ? prev : { ...prev, [key]: parsed }));
    }
  };

  const commitNumericDraftOnBlur = (
    key:
      | 'outerGeofenceMeters'
      | 'innerGeofenceMeters'
      | 'dwellTimeMinutes'
      | 'bleBeaconRssiThreshold'
      | 'serviceWindowBeforeMinutes'
      | 'serviceWindowAfterMinutes',
    rawValue: string,
    setDraft: React.Dispatch<React.SetStateAction<string>>,
    min: number,
    max: number,
    fallback: number
  ) => {
    if (focusedFieldRef.current === key) {
      focusedFieldRef.current = null;
    }
    const parsed = parseInt(rawValue, 10);
    const currentFallback =
      typeof formData[key] === 'number' && Number.isFinite(formData[key]) ? formData[key] : fallback;
    const nextVal =
      rawValue.trim() === '' || rawValue.trim() === '-' || Number.isNaN(parsed)
        ? currentFallback
        : Math.max(min, Math.min(max, parsed));
    setDraft(String(nextVal));
    if (formData[key] !== nextVal) {
      hasChangesRef.current = true;
      setHasChanges(true);
      setFormData((prev) => ({ ...prev, [key]: nextVal }));
    }
  };

  const parseDraftOrClamp = (rawValue: string, currentVal: number, min: number, max: number) => {
    const parsed = parseInt(rawValue, 10);
    if (rawValue.trim() === '' || rawValue.trim() === '-' || Number.isNaN(parsed)) {
      return Math.max(min, Math.min(max, currentVal));
    }
    return Math.max(min, Math.min(max, parsed));
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!isSettingsAdmin) {
      showToast('Access Denied: Only administrators can modify church geofence parameters.');
      return;
    }
    const committedOuter = parseDraftOrClamp(outerGeofenceDraft, formData.outerGeofenceMeters, 50, 5000);
    const committedInner = parseDraftOrClamp(innerGeofenceDraft, formData.innerGeofenceMeters, 10, 1000);
    const committedDwell = parseDraftOrClamp(dwellTimeDraft, formData.dwellTimeMinutes, 1, 60);
    const committedBle = parseDraftOrClamp(bleBeaconDraft, formData.bleBeaconRssiThreshold, -95, -40);
    const committedBefore = parseDraftOrClamp(
      beforeWindowDraft,
      formData.serviceWindowBeforeMinutes,
      15,
      90
    );
    const committedAfter = parseDraftOrClamp(
      afterWindowDraft,
      formData.serviceWindowAfterMinutes,
      15,
      60
    );

    let updatedPayload: SystemSettings = {
      ...formData,
      outerGeofenceMeters: Math.max(committedOuter, committedInner),
      innerGeofenceMeters: committedInner,
      dwellTimeMinutes: committedDwell,
      bleBeaconRssiThreshold: committedBle,
      serviceWindowBeforeMinutes: committedBefore,
      serviceWindowAfterMinutes: committedAfter,
    };

    if (latInput.trim() !== '' && lngInput.trim() !== '') {
      const parsedLat = Number(latInput);
      const parsedLng = Number(lngInput);
      if (
        Number.isNaN(parsedLat) ||
        Number.isNaN(parsedLng) ||
        parsedLat < -90 ||
        parsedLat > 90 ||
        parsedLng < -180 ||
        parsedLng > 180
      ) {
        setGpsCaptureError('Enter valid Latitude (-90 to 90) and Longitude (-180 to 180).');
        showToast('Invalid GPS coordinates entered');
        return;
      }
      updatedPayload = {
        ...updatedPayload,
        campusLatitude: parsedLat,
        campusLongitude: parsedLng,
      };
      await setChurchPremiseLocation({
        lat: parsedLat,
        lng: parsedLng,
        accuracyM: updatedPayload.campusLocationAccuracyM ?? null,
        churchName: updatedPayload.churchName,
        campusName: updatedPayload.campusName,
        campusAddress: updatedPayload.campusAddress,
        innerGeofenceMeters: updatedPayload.innerGeofenceMeters,
        outerGeofenceMeters: updatedPayload.outerGeofenceMeters,
        dwellTimeMinutes: updatedPayload.dwellTimeMinutes,
      });
    }

    const ok = await updateSystemSettings(updatedPayload);
    if (ok) {
      lastSyncedSettingsRef.current = { ...updatedPayload };
      hasChangesRef.current = false;
      setFormData(updatedPayload);
      syncNumericDraftsFromSettings(updatedPayload, false);
      setHasChanges(false);
      setGpsCaptureError(null);
      setLastSavedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    }
  };

  const handleCaptureCurrentPremiseGps = () => {
    if (!navigator.geolocation) {
      setGpsCaptureError('Browser geolocation is not available on this device.');
      return;
    }
    setIsCapturingGps(true);
    setGpsCaptureError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        const accuracyM = Math.round(pos.coords.accuracy * 10) / 10;

        setLatInput(String(lat));
        setLngInput(String(lng));
        const nextForm: SystemSettings = {
          ...formData,
          campusLatitude: lat,
          campusLongitude: lng,
          campusLocationAccuracyM: accuracyM,
          campusLocationUpdatedAt: new Date().toISOString(),
        };
        setFormData(nextForm);
        await setChurchPremiseLocation({
          lat,
          lng,
          accuracyM,
          churchName: nextForm.churchName,
          campusName: nextForm.campusName,
          campusAddress: nextForm.campusAddress,
          innerGeofenceMeters: nextForm.innerGeofenceMeters,
          outerGeofenceMeters: nextForm.outerGeofenceMeters,
          dwellTimeMinutes: nextForm.dwellTimeMinutes,
        });
        lastSyncedSettingsRef.current = { ...nextForm };
        hasChangesRef.current = false;
        setHasChanges(false);
        setIsCapturingGps(false);
      },
      (err) => {
        setIsCapturingGps(false);
        if (err.code === err.PERMISSION_DENIED) {
          setGpsCaptureError('Location permission denied. Allow location access in your browser or enter coordinates manually below.');
        } else {
          setGpsCaptureError(`Could not acquire GPS fix: ${err.message}`);
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const handleSaveManualCoordinates = async () => {
    const parsedLat = Number(latInput);
    const parsedLng = Number(lngInput);
    if (
      latInput.trim() === '' ||
      lngInput.trim() === '' ||
      Number.isNaN(parsedLat) ||
      Number.isNaN(parsedLng) ||
      parsedLat < -90 ||
      parsedLat > 90 ||
      parsedLng < -180 ||
      parsedLng > 180
    ) {
      setGpsCaptureError('Please enter valid Latitude (-90 to 90) and Longitude (-180 to 180).');
      return;
    }
    setGpsCaptureError(null);
    const ok = await setChurchPremiseLocation({
      lat: parsedLat,
      lng: parsedLng,
      accuracyM: null,
      churchName: formData.churchName,
      campusName: formData.campusName,
      campusAddress: formData.campusAddress,
      innerGeofenceMeters: formData.innerGeofenceMeters,
      outerGeofenceMeters: formData.outerGeofenceMeters,
      dwellTimeMinutes: formData.dwellTimeMinutes,
    });
    if (ok) {
      const updatedTimestamp = new Date().toISOString();
      setFormData((prev) => {
        const next = {
          ...prev,
          campusLatitude: parsedLat,
          campusLongitude: parsedLng,
          campusLocationAccuracyM: null,
          campusLocationUpdatedAt: updatedTimestamp,
        };
        lastSyncedSettingsRef.current = next;
        return next;
      });
      hasChangesRef.current = false;
      setHasChanges(false);
    }
  };

  const handleResolveSharedMapLink = async () => {
    if (!sharedMapLink.trim()) {
      setGpsCaptureError('Paste a shared Google Maps or WhatsApp location link first.');
      return;
    }
    setIsResolvingMapLink(true);
    setGpsCaptureError(null);
    try {
      const token =
        currentUser?.token ||
        (typeof window !== 'undefined' ? localStorage.getItem('ekklesphere_token') : null);
      const res = await fetch('/api/campus-premise/resolve-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ input: sharedMapLink.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setGpsCaptureError(data.message || 'Could not extract coordinates from that shared link.');
        return;
      }

      const updatedCampusName =
        data.placeName && (!formData.campusName || formData.campusName === 'Main Church Premise')
          ? data.placeName
          : formData.campusName;

      setLatInput(String(data.lat));
      setLngInput(String(data.lng));

      const ok = await setChurchPremiseLocation({
        lat: data.lat,
        lng: data.lng,
        accuracyM: null,
        churchName: formData.churchName,
        campusName: updatedCampusName,
        campusAddress: formData.campusAddress,
        innerGeofenceMeters: formData.innerGeofenceMeters,
        outerGeofenceMeters: formData.outerGeofenceMeters,
        dwellTimeMinutes: formData.dwellTimeMinutes,
      });

      if (ok) {
        const updatedTimestamp = new Date().toISOString();
        setFormData((prev) => {
          const next = {
            ...prev,
            campusName: updatedCampusName,
            campusLatitude: data.lat,
            campusLongitude: data.lng,
            campusLocationAccuracyM: null,
            campusLocationUpdatedAt: updatedTimestamp,
          };
          lastSyncedSettingsRef.current = next;
          return next;
        });
        setSharedMapLink('');
        hasChangesRef.current = false;
        setHasChanges(false);
      }
    } catch (err: unknown) {
      setGpsCaptureError(err instanceof Error ? err.message : 'Failed to resolve shared Google Maps link.');
    } finally {
      setIsResolvingMapLink(false);
    }
  };

  const handleClearPremise = async () => {
    await clearChurchPremiseLocation();
    setLatInput('');
    setLngInput('');
    setFormData((prev) => {
      const next = {
        ...prev,
        campusLatitude: null,
        campusLongitude: null,
        campusLocationAccuracyM: null,
        campusLocationUpdatedAt: null,
      };
      lastSyncedSettingsRef.current = next;
      return next;
    });
    hasChangesRef.current = false;
    setHasChanges(false);
  };

  const handleReset = async () => {
    if (!confirmReset) {
      setConfirmReset(true);
      setTimeout(() => setConfirmReset(false), 4000);
      return;
    }
    await resetSystemSettings();
    setConfirmReset(false);
    setLatInput('');
    setLngInput('');
    hasChangesRef.current = false;
    setHasChanges(false);
  };

  const renderPremiseGpsSetupCard = () => {
    const isConfigured = formData.campusLatitude != null && formData.campusLongitude != null;
    return (
      <div
        className={`rounded-2xl p-4 sm:p-5 border-2 transition-all space-y-4 ${
          isConfigured
            ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-400/50 dark:border-emerald-700/60'
            : 'bg-amber-50/60 dark:bg-amber-950/20 border-amber-400/60 dark:border-amber-700/60'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-extrabold uppercase tracking-wider text-[#1D1B3A] dark:text-[#F2F2FA] flex items-center gap-1.5">
                <Crosshair className="w-4 h-4 text-[#6D5CF2]" />
                <span>Church Premise GPS Coordinates (Live Geofence Anchor)</span>
              </span>
              {isConfigured ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Live Premise Active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-800 dark:text-amber-300 text-[11px] font-bold">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Not Set Yet — Required for Live Check-in
                </span>
              )}
            </div>
            <p className="text-xs text-[#666A86] dark:text-[#A9ACC8] mt-1">
              Stand on your church premise and tap <b>Use My Current GPS Location</b>, or enter exact Latitude &amp; Longitude below. All member devices immediately verify attendance against this point.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              type="button"
              onClick={handleCaptureCurrentPremiseGps}
              disabled={isCapturingGps}
              className="px-4 py-2.5 rounded-xl bg-[#6D5CF2] hover:bg-[#5b4be0] text-white text-xs font-bold shadow-sm flex items-center gap-2 transition-all cursor-pointer active:scale-95 disabled:opacity-60"
            >
              <Navigation className={`w-3.5 h-3.5 ${isCapturingGps ? 'animate-spin' : ''}`} />
              <span>{isCapturingGps ? 'Capturing Live GPS...' : 'Use My Current GPS Location'}</span>
            </button>
            {isConfigured && (
              <button
                type="button"
                onClick={handleClearPremise}
                className="px-3 py-2.5 rounded-xl bg-white dark:bg-[#14142E] hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50 text-xs font-bold transition-all cursor-pointer"
              >
                Clear Pin
              </button>
            )}
          </div>
        </div>

        {isConfigured && (
          <div className="p-3 rounded-xl bg-white dark:bg-[#14142E] border border-emerald-200 dark:border-emerald-900/50 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <MapPin className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">{formData.campusName || 'Church Premise'}:</span>
              <span className="font-mono font-bold text-emerald-700 dark:text-emerald-300">
                {formData.campusLatitude?.toFixed(6)}, {formData.campusLongitude?.toFixed(6)}
              </span>
              {formData.campusLocationAccuracyM != null && (
                <span className="text-[11px] font-mono text-[#666A86] dark:text-[#A9ACC8]">
                  (±{formData.campusLocationAccuracyM}m GPS accuracy)
                </span>
              )}
            </div>
            <span className="text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
              Active Perimeter: <b className="text-[#1D1B3A] dark:text-white">{formData.innerGeofenceMeters}m</b>
              {formData.campusLocationUpdatedAt
                ? ` · Updated ${new Date(formData.campusLocationUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                : ''}
            </span>
          </div>
        )}

        {gpsCaptureError && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{gpsCaptureError}</span>
          </div>
        )}

        {/* Paste Shared Google Maps / WhatsApp Location Link */}
        <div className="pt-1">
          <label className="block text-[11px] font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
            Paste Shared Google Maps or WhatsApp Location Link
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              placeholder="e.g. https://maps.app.goo.gl/... or https://maps.google.com/?q=5.6037,-0.1870"
              value={sharedMapLink}
              onChange={(e) => setSharedMapLink(e.target.value)}
              className="flex-1 px-3 py-2 text-xs rounded-xl bg-white dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
            />
            <button
              type="button"
              onClick={handleResolveSharedMapLink}
              disabled={isResolvingMapLink}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 shrink-0 disabled:opacity-60"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>{isResolvingMapLink ? 'Resolving...' : 'Extract & Pin Link'}</span>
            </button>
          </div>
        </div>

        {/* Manual Latitude / Longitude Entry */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end pt-1">
          <div>
            <label className="block text-[11px] font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
              Premise Latitude (-90 to 90)
            </label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="e.g. 5.603717"
              value={latInput}
              onFocus={() => {
                focusedFieldRef.current = 'lat';
              }}
              onBlur={() => {
                if (focusedFieldRef.current === 'lat') focusedFieldRef.current = null;
              }}
              onChange={(e) => {
                const next = e.target.value;
                if (!/^-?\d*(\.\d*)?$/.test(next)) return;
                setLatInput(next);
                hasChangesRef.current = true;
                setHasChanges(true);
              }}
              className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-white dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
              Premise Longitude (-180 to 180)
            </label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="e.g. -0.186964"
              value={lngInput}
              onFocus={() => {
                focusedFieldRef.current = 'lng';
              }}
              onBlur={() => {
                if (focusedFieldRef.current === 'lng') focusedFieldRef.current = null;
              }}
              onChange={(e) => {
                const next = e.target.value;
                if (!/^-?\d*(\.\d*)?$/.test(next)) return;
                setLngInput(next);
                hasChangesRef.current = true;
                setHasChanges(true);
              }}
              className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-white dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
            />
          </div>
          <button
            type="button"
            onClick={handleSaveManualCoordinates}
            className="px-4 py-2 rounded-xl bg-[#1D1B3A] dark:bg-[#2A2A55] hover:bg-[#2b2855] text-white text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 h-[34px]"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Pin Coordinates</span>
          </button>
        </div>
      </div>
    );
  };

  const handleTestSms = async () => {
    if (!isSettingsAdmin && currentUser?.role !== 'pastor') {
      showToast('Only church admins or pastors can dispatch SMS gateway tests.');
      return;
    }
    setIsTestingSms(true);
    try {
      await sendTestSmsGateway(
        formData.smsGatewayProvider,
        formData.smsSenderId,
        testSmsRecipientPhone.trim() || formData.contactPhone?.trim() || undefined
      );
    } finally {
      setIsTestingSms(false);
    }
  };

  const handleTestEmail = async () => {
    if (!isSettingsAdmin && currentUser?.role !== 'pastor') {
      showToast('Only church admins or pastors can dispatch email gateway tests.');
      return;
    }
    const targetEmail = (testEmailRecipient || formData.contactEmail || currentUser?.email || '').trim();
    if (!targetEmail) {
      showToast('Enter a recipient email address to send a Resend test email.');
      return;
    }
    setIsTestingEmail(true);
    try {
      await sendTestEmailGateway({
        recipientEmail: targetEmail,
        fromEmail: formData.emailFromAddress?.trim() || undefined,
        fromName: formData.emailSenderName?.trim() || formData.churchName?.trim() || undefined,
      });
    } finally {
      setIsTestingEmail(false);
    }
  };

  const handleSaveArkeselKey = async () => {
    if (!isSettingsAdmin) {
      showToast('Only church admins can update tenant SMS API keys.');
      return;
    }
    const cleanKey = arkeselApiKeyInput.trim();
    if (!cleanKey) {
      showToast('Enter your church Arkesel API key before saving.');
      return;
    }
    setIsSavingArkeselKey(true);
    try {
      const res = await saveTenantGatewayKeys({ arkeselApiKey: cleanKey });
      if (res.success) {
        setArkeselApiKeyInput('');
        setShowArkeselKey(false);
      }
    } finally {
      setIsSavingArkeselKey(false);
    }
  };

  const handleClearArkeselKey = async () => {
    if (!isSettingsAdmin) return;
    setIsSavingArkeselKey(true);
    try {
      await saveTenantGatewayKeys({ clearArkeselApiKey: true });
      setArkeselApiKeyInput('');
    } finally {
      setIsSavingArkeselKey(false);
    }
  };

  const handleSavePaystackKeys = async () => {
    if (!isSettingsAdmin) {
      showToast('Only church admins can update tenant Paystack API keys.');
      return;
    }
    const pub = paystackPublicKeyInput.trim();
    const sec = paystackSecretKeyInput.trim();
    if (!pub && !sec) {
      showToast('Enter your Paystack Public Key and/or Secret Key to save.');
      return;
    }
    setIsSavingPaystackKeys(true);
    try {
      const res = await saveTenantGatewayKeys({
        ...(pub ? { paystackPublicKey: pub } : {}),
        ...(sec ? { paystackSecretKey: sec } : {}),
      });
      if (res.success) {
        setPaystackSecretKeyInput('');
        setShowPaystackSecret(false);
      }
    } finally {
      setIsSavingPaystackKeys(false);
    }
  };

  const handleClearPaystackKeys = async () => {
    if (!isSettingsAdmin) return;
    setIsSavingPaystackKeys(true);
    try {
      const res = await saveTenantGatewayKeys({ clearPaystackKeys: true });
      if (res.success) {
        setPaystackPublicKeyInput('');
        setPaystackSecretKeyInput('');
      }
    } finally {
      setIsSavingPaystackKeys(false);
    }
  };

  const handleTestPaystack = async () => {
    setIsTestingPaystack(true);
    try {
      await testPaystackGateway();
    } finally {
      setIsTestingPaystack(false);
    }
  };

  const handleExportAudit = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(auditLogs, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `ekklesphere-audit-log-${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast('Audit log JSON exported successfully');
  };

  return (
    <div className="space-y-4 sm:space-y-5 w-full min-w-0 animate-in fade-in duration-200">
      {/* Top Header Card */}
      <div className="bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-[#E9EBF5] dark:border-[#2D2D55] shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3.5 sm:gap-4 min-w-0">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <span className="text-xs font-semibold text-[#666A86] dark:text-[#A9ACC8]">
              System & Campus Parameters
            </span>
            <span className="text-[#666A86] dark:text-[#A9ACC8]" aria-hidden="true">·</span>
            <span className="text-xs font-bold text-[#6D5CF2] dark:text-[#8C7DFF]">
              Ghana Act 843 Compliant
            </span>
          </div>
          <h2 className="text-lg sm:text-2xl font-bold tracking-tight text-[#1D1B3A] dark:text-[#F2F2FA]">
            System Settings
          </h2>
          <p className="text-xs text-[#666A86] dark:text-[#A9ACC8] mt-1 max-w-xl leading-relaxed">
            Configure church profile, PostGIS geofence radii, BLE signal thresholds, pastoral care alert rules, and communications gateways.
          </p>
        </div>

        <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap lg:justify-end shrink-0">
          {hasChanges && (
            <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2.5 py-1.5 rounded-xl flex items-center gap-1 border border-amber-500/20 whitespace-nowrap">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              Unsaved changes
            </span>
          )}
          <button
            type="button"
            onClick={handleReset}
            className={`min-h-[38px] px-3 sm:px-3.5 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              confirmReset
                ? 'bg-rose-600 text-white border-rose-600'
                : 'bg-[#F6F7FC] dark:bg-[#14142E] hover:bg-slate-200 dark:hover:bg-white/10 text-[#666A86] dark:text-[#A9ACC8] border-[#E9EBF5] dark:border-[#2D2D55]'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5 shrink-0" />
            <span>{confirmReset ? 'Click Again to Confirm Reset' : 'Reset Defaults'}</span>
          </button>
          <button
            type="button"
            disabled={isSyncingSystemSettings}
            onClick={() => handleSave()}
            className={`min-h-[38px] px-3.5 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer shadow-sm disabled:opacity-60 ${
              hasChanges
                ? 'bg-[#6D5CF2] hover:bg-[#5b4be0] text-white'
                : 'bg-[#6D5CF2]/90 hover:bg-[#6D5CF2] text-white'
            }`}
          >
            <Save className="w-3.5 h-3.5 shrink-0" />
            <span>{isSyncingSystemSettings ? 'Saving...' : 'Save Settings'}</span>
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Settings"
              className="min-h-[38px] min-w-[38px] p-2 rounded-xl text-[#666A86] hover:text-[#1D1B3A] dark:text-[#A9ACC8] dark:hover:text-white bg-[#F6F7FC] dark:bg-[#14142E] hover:bg-slate-200 dark:hover:bg-white/10 border border-[#E9EBF5] dark:border-[#2D2D55] transition-all flex items-center justify-center cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Settings Navigation Tabs */}
      <div
        role="tablist"
        aria-label="System Settings Navigation"
        className="grid grid-cols-2 sm:grid-cols-4 xl:flex xl:flex-wrap items-stretch xl:items-center gap-1.5 sm:gap-2 p-1.5 rounded-2xl bg-white/80 dark:bg-[#1D1D3D]/80 border border-[#E9EBF5] dark:border-[#2D2D55] shadow-xs w-full min-w-0"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'general'}
          onClick={() => setActiveTab('general')}
          className={`min-h-[40px] min-w-0 flex items-center justify-start xl:justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-2 rounded-xl text-[11px] sm:text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'general'
              ? 'bg-[#6D5CF2] text-white shadow-xs'
              : 'bg-[#F6F7FC]/70 dark:bg-[#14142E]/70 xl:bg-transparent xl:dark:bg-transparent text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-[#F2F2FA] hover:bg-[#F6F7FC] dark:hover:bg-[#14142E]'
          }`}
        >
          <Building2 className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Campus Profile</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'groups'}
          onClick={() => setActiveTab('groups')}
          className={`min-h-[40px] min-w-0 flex items-center justify-start xl:justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-2 rounded-xl text-[11px] sm:text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'groups'
              ? 'bg-[#6D5CF2] text-white shadow-xs'
              : 'bg-[#F6F7FC]/70 dark:bg-[#14142E]/70 xl:bg-transparent xl:dark:bg-transparent text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-[#F2F2FA] hover:bg-[#F6F7FC] dark:hover:bg-[#14142E]'
          }`}
        >
          <Users className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Ministries &amp; Cell Groups</span>
          <span
            className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold shrink-0 tabular-nums ${
              activeTab === 'groups'
                ? 'bg-white/20 text-white'
                : 'bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF]'
            }`}
          >
            {churchGroups.length}
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'proximity'}
          onClick={() => setActiveTab('proximity')}
          className={`min-h-[40px] min-w-0 flex items-center justify-start xl:justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-2 rounded-xl text-[11px] sm:text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'proximity'
              ? 'bg-[#6D5CF2] text-white shadow-xs'
              : 'bg-[#F6F7FC]/70 dark:bg-[#14142E]/70 xl:bg-transparent xl:dark:bg-transparent text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-[#F2F2FA] hover:bg-[#F6F7FC] dark:hover:bg-[#14142E]'
          }`}
        >
          <Radio className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Proximity &amp; Geofencing</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'pastoral'}
          onClick={() => setActiveTab('pastoral')}
          className={`min-h-[40px] min-w-0 flex items-center justify-start xl:justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-2 rounded-xl text-[11px] sm:text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'pastoral'
              ? 'bg-[#6D5CF2] text-white shadow-xs'
              : 'bg-[#F6F7FC]/70 dark:bg-[#14142E]/70 xl:bg-transparent xl:dark:bg-transparent text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-[#F2F2FA] hover:bg-[#F6F7FC] dark:hover:bg-[#14142E]'
          }`}
        >
          <HeartHandshake className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Pastoral Care Rules</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'privacy'}
          onClick={() => setActiveTab('privacy')}
          className={`min-h-[40px] min-w-0 flex items-center justify-start xl:justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-2 rounded-xl text-[11px] sm:text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'privacy'
              ? 'bg-[#6D5CF2] text-white shadow-xs'
              : 'bg-[#F6F7FC]/70 dark:bg-[#14142E]/70 xl:bg-transparent xl:dark:bg-transparent text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-[#F2F2FA] hover:bg-[#F6F7FC] dark:hover:bg-[#14142E]'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Privacy &amp; Governance</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'gateways'}
          onClick={() => setActiveTab('gateways')}
          className={`min-h-[40px] min-w-0 flex items-center justify-start xl:justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-2 rounded-xl text-[11px] sm:text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'gateways'
              ? 'bg-[#6D5CF2] text-white shadow-xs'
              : 'bg-[#F6F7FC]/70 dark:bg-[#14142E]/70 xl:bg-transparent xl:dark:bg-transparent text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-[#F2F2FA] hover:bg-[#F6F7FC] dark:hover:bg-[#14142E]'
          }`}
        >
          <Send className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">SMS &amp; Paystack Gateways</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'staff'}
          onClick={() => setActiveTab('staff')}
          className={`min-h-[40px] min-w-0 flex items-center justify-start xl:justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-2 rounded-xl text-[11px] sm:text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'staff'
              ? 'bg-[#6D5CF2] text-white shadow-xs'
              : 'bg-[#F6F7FC]/70 dark:bg-[#14142E]/70 xl:bg-transparent xl:dark:bg-transparent text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-[#F2F2FA] hover:bg-[#F6F7FC] dark:hover:bg-[#14142E]'
          }`}
        >
          <Shield className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Users &amp; Credentials</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'billing'}
          onClick={() => setActiveTab('billing')}
          className={`min-h-[40px] min-w-0 flex items-center justify-start xl:justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-2 rounded-xl text-[11px] sm:text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'billing'
              ? 'bg-[#6D5CF2] text-white shadow-xs'
              : 'bg-[#F6F7FC]/70 dark:bg-[#14142E]/70 xl:bg-transparent xl:dark:bg-transparent text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-[#F2F2FA] hover:bg-[#F6F7FC] dark:hover:bg-[#14142E]'
          }`}
        >
          <CreditCard className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Plan &amp; Upgrade</span>
          {licenseEval?.status === 'trial' && (
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold shrink-0 ${
                activeTab === 'billing'
                  ? 'bg-white/20 text-white'
                  : 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
              }`}
            >
              Trial
            </span>
          )}
        </button>
      </div>

      {/* Main Form Content */}
      <form onSubmit={handleSave} className="space-y-5">
        {/* TAB 1: General & Campus Profile */}
        {activeTab === 'general' && (
          <div className="bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl p-5 sm:p-7 border border-[#E9EBF5] dark:border-[#2D2D55] shadow-xs space-y-5">
            {renderPremiseGpsSetupCard()}

            <div>
              <h3 className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA] flex items-center gap-2 mb-1">
                <Building2 className="w-4 h-4 text-[#6D5CF2]" />
                <span>Church & Campus Identity</span>
              </h3>
              <p className="text-xs text-[#666A86] dark:text-[#A9ACC8]">
                These details appear across the Member mobile app, Usher check-in tool, and pastoral broadcast notifications.
              </p>
            </div>

            <div className="rounded-2xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3.5">
              <div className="w-14 h-14 rounded-2xl bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] flex items-center justify-center overflow-hidden shrink-0 p-1 shadow-xs">
                {resolveDisplayImageUrl(formData.churchLogoUrl, 'thumb') ? (
                  <img
                    src={resolveDisplayImageUrl(formData.churchLogoUrl, 'thumb')!}
                    alt={formData.churchName ? `${formData.churchName} logo` : 'Church logo'}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-contain rounded-xl"
                  />
                ) : (
                  <Building2 className="w-6 h-6 text-[#6D5CF2]" />
                )}
              </div>

              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                      Church Logo / Crest
                    </span>
                    <span className="block text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
                      Shown alongside your church name in the Admin Dashboard and public home page.
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <input
                      ref={churchLogoFileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      onChange={handleChurchLogoFileChange}
                      className="hidden"
                    />
                    <button
                      type="button"
                      disabled={isUploadingChurchLogo}
                      onClick={() => churchLogoFileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#6D5CF2] hover:bg-[#5b4be0] text-white text-[11px] font-bold cursor-pointer transition-colors disabled:opacity-60"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>{isUploadingChurchLogo ? 'Processing...' : 'Upload Logo'}</span>
                    </button>
                    {formData.churchLogoUrl && (
                      <button
                        type="button"
                        onClick={() => handleChange('churchLogoUrl', '')}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Remove</span>
                      </button>
                    )}
                  </div>
                </div>
                <input
                  type="url"
                  value={
                    formData.churchLogoUrl?.startsWith('data:')
                      ? ''
                      : formData.churchLogoUrl ?? ''
                  }
                  onChange={(e) => handleChange('churchLogoUrl', e.target.value)}
                  placeholder={
                    formData.churchLogoUrl?.startsWith('data:')
                      ? 'Uploaded logo stored (or paste an image URL to replace)'
                      : 'Or paste logo image URL (https://... or Google Drive share link)'
                  }
                  className="w-full px-3 py-1.5 text-xs rounded-xl bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                  Church Organization Name
                </label>
                <input
                  type="text"
                  value={formData.churchName ?? ''}
                  onChange={(e) => handleChange('churchName', e.target.value)}
                  className="w-full px-3.5 py-2 text-xs rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                  Campus Name
                </label>
                <input
                  type="text"
                  value={formData.campusName ?? ''}
                  onChange={(e) => handleChange('campusName', e.target.value)}
                  className="w-full px-3.5 py-2 text-xs rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-[#6D5CF2]" />
                  <span>Physical Sanctuary Address</span>
                </label>
                <input
                  type="text"
                  value={formData.campusAddress ?? ''}
                  onChange={(e) => handleChange('campusAddress', e.target.value)}
                  className="w-full px-3.5 py-2 text-xs rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                  Senior Pastor / Head Minister
                </label>
                <input
                  type="text"
                  value={formData.seniorPastor ?? ''}
                  onChange={(e) => handleChange('seniorPastor', e.target.value)}
                  className="w-full px-3.5 py-2 text-xs rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                  Contact Phone (E.164)
                </label>
                <input
                  type="text"
                  value={formData.contactPhone ?? ''}
                  onChange={(e) => handleChange('contactPhone', e.target.value)}
                  className="w-full px-3.5 py-2 text-xs rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2] font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                  Administrative Email
                </label>
                <input
                  type="email"
                  value={formData.contactEmail ?? ''}
                  onChange={(e) => handleChange('contactEmail', e.target.value)}
                  className="w-full px-3.5 py-2 text-xs rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                    Timezone
                  </label>
                  <select
                    value={formData.timezone}
                    onChange={(e) => handleChange('timezone', e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                  >
                    <option value="Africa/Accra (GMT)">Africa/Accra (GMT)</option>
                    <option value="Africa/Lagos (WAT)">Africa/Lagos (WAT)</option>
                    <option value="Africa/Nairobi (EAT)">Africa/Nairobi (EAT)</option>
                    <option value="Europe/London (BST/GMT)">Europe/London</option>
                    <option value="America/New_York (EST)">America/New_York (EST)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                    Currency
                  </label>
                  <select
                    value={formData.currency}
                    onChange={(e) => handleChange('currency', e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                  >
                    <option value="GHS (Ghana Cedi)">GHS (Ghana Cedi)</option>
                    <option value="USD ($)">USD ($)</option>
                    <option value="GBP (£)">GBP (£)</option>
                    <option value="EUR (€)">EUR (€)</option>
                    <option value="NGN (₦)">NGN (₦)</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: Ministries, Fellowships & Cell Groups Management */}
        {activeTab === 'groups' && (
          <div className="space-y-4 sm:space-y-5 min-w-0 animate-in fade-in duration-200">
            {/* Top Overview & Action Header Card */}
            <div className="bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-[#E9EBF5] dark:border-[#2D2D55] shadow-xs min-w-0">
              <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-4 sm:pb-5 border-b border-[#E9EBF5] dark:border-[#2D2D55]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1">
                    <span className="w-2 h-2 rounded-full bg-[#6D5CF2] shrink-0" />
                    <span className="text-xs font-semibold text-[#666A86] dark:text-[#A9ACC8]">
                      Congregational Structure &amp; Leadership
                    </span>
                    <span className="text-[#666A86] dark:text-[#A9ACC8]" aria-hidden="true">·</span>
                    <span className="text-xs font-bold text-[#6D5CF2] dark:text-[#8C7DFF] truncate">
                      {formData.campusName || systemSettings.campusName}
                    </span>
                  </div>
                  <h3 className="text-base sm:text-lg font-bold text-[#1D1B3A] dark:text-[#F2F2FA] flex items-center gap-2">
                    <Users className="w-5 h-5 text-[#6D5CF2] shrink-0" />
                    <span>Ministries, Departments &amp; Group Categories</span>
                  </h3>
                  <p className="text-xs text-[#666A86] dark:text-[#A9ACC8] mt-1 max-w-2xl leading-relaxed">
                    Administrate ministries, departments, fellowships, cell groups, month-born bands, and custom categories. Leadership, schedules, and categories flow directly into Congregation &amp; Ministry Analytics.
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap xl:justify-end shrink-0">
                  <button
                    type="button"
                    onClick={() => requestOpenAnalytics({ lens: 'ministries' })}
                    className="min-h-[38px] bg-[#EFEDFF] dark:bg-[#2A2A55] hover:bg-[#E2DEFF] dark:hover:bg-[#343468] text-[#6D5CF2] dark:text-[#8C7DFF] rounded-xl px-3 sm:px-3.5 py-2 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <BarChart3 className="w-3.5 h-3.5 shrink-0" />
                    <span>Ministry Analytics</span>
                  </button>
                  {isSettingsAdmin && (
                    <button
                      type="button"
                      onClick={() => openCategoryModal()}
                      className="min-h-[38px] bg-[#F6F7FC] dark:bg-[#14142E] hover:border-[#6D5CF2] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] rounded-xl px-3 sm:px-3.5 py-2 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <Layers className="w-3.5 h-3.5 text-[#6D5CF2] shrink-0" />
                      <span>
                        Categories ({allGroupCategories.length})
                      </span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      openAddGroupModal(
                        groupFilterCategory !== 'all' ? groupFilterCategory : 'cell_group'
                      )
                    }
                    className="min-h-[38px] bg-[#6D5CF2] hover:bg-[#5b4be0] text-white rounded-xl px-3.5 sm:px-4 py-2 text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer whitespace-nowrap active:scale-95"
                  >
                    <Plus className="w-3.5 h-3.5 shrink-0" />
                    <span>Add New Group</span>
                  </button>
                </div>
              </div>

              {/* Group Metric KPI Cards (Built-in + Admin Custom Categories) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-3.5 mt-4 sm:mt-5 tabular-nums">
                {/* 1. Total Groups & Leadership Coverage */}
                <div
                  onClick={() => setGroupFilterCategory('all')}
                  className={`min-w-0 p-3.5 sm:p-4 rounded-2xl border transition-all cursor-pointer ${
                    groupFilterCategory === 'all'
                      ? 'bg-[#EFEDFF]/60 dark:bg-[#2A2A55]/40 border-[#6D5CF2]'
                      : 'bg-[#F6F7FC] dark:bg-[#14142E] border-[#E9EBF5] dark:border-[#2D2D55] hover:border-[#6D5CF2]/50'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs text-[#666A86] dark:text-[#A9ACC8]">
                    <span className="font-semibold">Configured Structure</span>
                    <Layers className="w-4 h-4 text-[#6D5CF2]" />
                  </div>
                  <div className="font-mono text-2xl font-extrabold text-[#1D1B3A] dark:text-[#F2F2FA] mt-1">
                    {effectiveChurchGroups.length}
                  </div>
                  <div className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] mt-1 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                    <span className="truncate">
                      {allGroupCategories.length} categories ·{' '}
                      {structureAnalytics.leadership.leadershipCoveragePct}% covered
                    </span>
                  </div>
                </div>

                {allGroupCategories.map((cat) => {
                  const catGroups = effectiveChurchGroups.filter((g) => g.category === cat.id);
                  const catCount = catGroups.length;
                  const isMonthBornCat = isMonthBornCategory(cat.id);
                  const monthBornAssignedLeads = isMonthBornCat
                    ? catGroups.filter((g) => isAssignedLeaderName(g.leaderName)).length
                    : 0;
                  const styles = getGroupCategoryStyles(cat.color);
                  const isActive = groupFilterCategory === cat.id;
                  const subNote =
                    cat.id === 'ministry'
                      ? structureAnalytics.leadership.unconfiguredDepartmentsCount > 0
                        ? `${structureAnalytics.leadership.unconfiguredDepartmentsCount} roster dept(s) need lead`
                        : `${structureAnalytics.namedDepartmentsCount} active departments tracked`
                      : cat.id === 'fellowship'
                      ? `${structureAnalytics.leadership.coLedGroupsCount} co-led across structure`
                      : cat.id === 'cell_group'
                      ? unconfiguredRosterGroups.length > 0
                        ? `${unconfiguredRosterGroups.length} roster group(s) unconfigured`
                        : 'All roster cells configured'
                      : isMonthBornCat
                      ? members.length > 0
                        ? `${birthAssignedMembersCount}/${members.length} assigned · ${monthBornAssignedLeads}/12 leads`
                        : `12 auto birth-month groups · ${monthBornAssignedLeads}/12 leads`
                      : `${catCount} configured group${catCount === 1 ? '' : 's'}`;

                  return (
                    <div
                      key={cat.id}
                      onClick={() => setGroupFilterCategory(cat.id)}
                      className={`min-w-0 p-3.5 sm:p-4 rounded-2xl border transition-all cursor-pointer ${
                        isActive
                          ? styles.kpiActiveClass
                          : `bg-[#F6F7FC] dark:bg-[#14142E] border-[#E9EBF5] dark:border-[#2D2D55] ${styles.kpiHoverClass}`
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-xs text-[#666A86] dark:text-[#A9ACC8]">
                        <span className="font-semibold truncate">{cat.pluralLabel || cat.label}</span>
                        <span className={`text-[11px] font-bold truncate shrink-0 ${styles.kpiLabelClass}`}>
                          {cat.description || (cat.isBuiltIn ? cat.label : 'Custom')}
                        </span>
                      </div>
                      <div className={`font-mono text-2xl font-extrabold mt-1 ${styles.kpiValueClass}`}>
                        {catCount}
                      </div>
                      <div className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] mt-1 truncate">
                        {subNote}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {unconfiguredRosterGroups.length > 0 && (
              <div className="bg-amber-50/70 dark:bg-amber-950/20 rounded-2xl p-4 sm:p-5 border border-amber-300/70 dark:border-amber-800/50 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA] flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                      <span>Discovered Roster Groups Missing Pastoral Leadership ({unconfiguredRosterGroups.length})</span>
                    </h4>
                    <p className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] mt-0.5">
                      Members in your directory belong to these groups or departments, but no leader or meeting schedule is configured yet.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => requestOpenAnalytics({ lens: 'ministries' })}
                    className="text-xs font-bold text-[#6D5CF2] dark:text-[#8C7DFF] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Inspect in Analytics
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {unconfiguredRosterGroups.map((ug) => (
                    <div
                      key={`${ug.category}-${ug.name}`}
                      className="bg-white dark:bg-[#1D1D3D] rounded-xl p-3 border border-amber-200 dark:border-amber-800/50 flex items-center justify-between gap-2.5 tabular-nums"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] truncate">
                          {ug.name}
                        </div>
                        <div className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] font-mono">
                          {ug.totalMembers} members · {ug.presentCount} live ({ug.turnoutPct}%)
                          {ug.atRiskCount > 0 ? ` · ${ug.atRiskCount} at-risk` : ''}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => openAddGroupModal(ug.category, ug.name)}
                        className="px-2.5 py-1.5 rounded-lg bg-[#6D5CF2] hover:bg-[#5b4be0] text-white text-[11px] font-bold whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Assign Lead
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Filter, Search & Quick Category Selector Toolbar */}
            <div className="bg-white dark:bg-[#1D1D3D] rounded-2xl p-3.5 sm:p-4 border border-[#E9EBF5] dark:border-[#2D2D55] shadow-xs flex flex-col xl:flex-row xl:items-center justify-between gap-3 min-w-0">
              {/* Category Filter Pills */}
              <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                <button
                  type="button"
                  onClick={() => setGroupFilterCategory('all')}
                  className={`min-h-[34px] px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                    groupFilterCategory === 'all'
                      ? 'bg-[#6D5CF2] text-white shadow-xs'
                      : 'bg-[#F6F7FC] dark:bg-[#14142E] text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-[#F2F2FA]'
                  }`}
                >
                  All ({effectiveChurchGroups.length})
                </button>
                {allGroupCategories.map((cat) => {
                  const count = effectiveChurchGroups.filter((g) => g.category === cat.id).length;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setGroupFilterCategory(cat.id)}
                      className={`min-h-[34px] px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                        groupFilterCategory === cat.id
                          ? 'bg-[#6D5CF2] text-white shadow-xs'
                          : 'bg-[#F6F7FC] dark:bg-[#14142E] text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-[#F2F2FA]'
                      }`}
                    >
                      {cat.pluralLabel || cat.label} ({count})
                    </button>
                  );
                })}
                {isSettingsAdmin && (
                  <button
                    type="button"
                    onClick={() => openCategoryModal()}
                    className="min-h-[34px] px-2.5 py-1.5 rounded-xl text-xs font-bold border border-dashed border-[#6D5CF2]/50 text-[#6D5CF2] dark:text-[#8C7DFF] hover:bg-[#EFEDFF] dark:hover:bg-[#2A2A55] transition-all whitespace-nowrap cursor-pointer inline-flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3 shrink-0" />
                    <span>New Category</span>
                  </button>
                )}
              </div>

              {/* Search & Status Filter */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full xl:w-auto shrink-0">
                <div className="relative flex-1 sm:w-64 min-w-0">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#666A86] dark:text-[#A9ACC8]" />
                  <input
                    type="text"
                    placeholder="Search by name, leader, location..."
                    value={groupSearchQuery}
                    onChange={(e) => setGroupSearchQuery(e.target.value)}
                    className="w-full min-h-[38px] pl-8 pr-8 py-1.5 text-xs rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] placeholder-[#666A86] dark:placeholder-[#A9ACC8] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                  />
                  {groupSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setGroupSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <select
                  value={groupFilterStatus}
                  onChange={(e) => setGroupFilterStatus(e.target.value as any)}
                  className="w-full sm:w-auto min-h-[38px] px-2.5 py-1.5 text-xs rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2] font-semibold"
                >
                  <option value="all">All Statuses</option>
                  <option value="active">Active Only</option>
                  <option value="inactive">Inactive Only</option>
                </select>
              </div>
            </div>

            {/* Groups Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
              {filteredEffectiveGroups.map((group) => {
                const enrolledMembers = getGroupMembers(group.name);
                const analyticRow = groupMetricsByName.get(normalizeSettingLabel(group.name).toLowerCase());
                const threshold = Math.max(1, Number(systemSettings.absenteeThresholdServices) || 2);
                const checkedInIds = structureAnalytics.activeService.checkedInPersonIds;
                const presentFallback = enrolledMembers.filter((m) => checkedInIds.has(m.id)).length;
                const atRiskFallback = enrolledMembers.filter(
                  (m) => !checkedInIds.has(m.id) && (m.consecutiveAbsences || 0) >= threshold
                ).length;
                const enrolledIdSet = new Set(enrolledMembers.map((m) => m.id));
                const openFollowupFallback = followupTasks.filter(
                  (t) =>
                    t.status === 'open' &&
                    (enrolledIdSet.has(t.personId) ||
                      normalizeSettingLabel(t.groupName).toLowerCase() ===
                        normalizeSettingLabel(group.name).toLowerCase())
                ).length;

                const liveMetrics = analyticRow || {
                  totalMembers: enrolledMembers.length,
                  presentCount: presentFallback,
                  turnoutPct:
                    enrolledMembers.length > 0
                      ? Math.round((presentFallback / enrolledMembers.length) * 100)
                      : 0,
                  atRiskCount: atRiskFallback,
                  openFollowupCount: openFollowupFallback,
                };
                const hasAssignedLead = isAssignedLeaderName(group.leaderName);
                const catMeta = getGroupCategoryMeta(group.category, customGroupCategories);
                const catStyles = getGroupCategoryStyles(catMeta.color);
                const isVirtualAutoMonth = Boolean(group.isAutoBirthMonthVirtual);
                const isVirtualAutoDemographic = Boolean(group.isAutoDemographicVirtual);
                const isVirtualAutoGroup = isVirtualAutoMonth || isVirtualAutoDemographic;
                const autoBadgeText = isVirtualAutoMonth
                  ? 'Auto · Birthdate'
                  : group.autoDemographicKind === 'youth'
                  ? 'Auto · Under 35'
                  : 'Auto · Gender';
                const autoBadgeTitle = isVirtualAutoMonth
                  ? 'Automatically assigned from member birthdates'
                  : group.autoDemographicKind === 'youth'
                  ? 'Automatically includes every member aged under 35 from Date of Birth'
                  : 'Automatically includes every member of this gender';

                return (
                  <div
                    key={group.id}
                    className="min-w-0 bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-[#E9EBF5] dark:border-[#2D2D55] shadow-xs flex flex-col justify-between hover:shadow-md transition-all group"
                  >
                    <div>
                      {/* Top Badges & Status Toggle */}
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase ${catStyles.badgeClass}`}
                        >
                          {catMeta.label}
                        </span>

                        <div className="flex items-center gap-1.5">
                          {isVirtualAutoGroup ? (
                            <span
                              className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                              title={autoBadgeTitle}
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              <span>{autoBadgeText}</span>
                            </span>
                          ) : (
                            <>
                              {group.autoDemographicKind && (
                                <span
                                  className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/10 text-[#6D5CF2] dark:text-[#9D90FF]"
                                  title={
                                    group.autoDemographicKind === 'youth'
                                      ? 'Auto-enrolled: every member under 35'
                                      : 'Auto-enrolled by member gender'
                                  }
                                >
                                  {group.autoDemographicKind === 'youth' ? 'Auto <35' : 'Auto Gender'}
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => toggleChurchGroupStatus(group.id)}
                                className={`flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full transition-all cursor-pointer ${
                                  group.active
                                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20'
                                    : 'bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-slate-400 hover:bg-slate-300 dark:hover:bg-white/20'
                                }`}
                                title={group.active ? 'Click to deactivate' : 'Click to activate'}
                              >
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    group.active ? 'bg-emerald-500' : 'bg-slate-400'
                                  }`}
                                />
                                <span>{group.active ? 'Active' : 'Inactive'}</span>
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Title & Description */}
                      <h4 className="text-base font-bold text-[#1D1B3A] dark:text-[#F2F2FA] leading-tight mb-1.5">
                        {group.name}
                      </h4>
                      <p className="text-xs text-[#666A86] dark:text-[#A9ACC8] line-clamp-2 leading-relaxed mb-3.5">
                        {group.description}
                      </p>

                      {/* Leader & Assistant */}
                      <div className="bg-[#F6F7FC] dark:bg-[#14142E] rounded-xl p-3 border border-[#E9EBF5] dark:border-[#2D2D55] mb-3 space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-[#666A86] dark:text-[#A9ACC8] font-medium">Primary Leader</span>
                          {hasAssignedLead ? (
                            <span className="font-bold text-[#1D1B3A] dark:text-[#F2F2FA] flex items-center gap-1.5">
                              <span className="w-5 h-5 rounded-full bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] font-bold text-[9px] flex items-center justify-center shrink-0">
                                {group.leaderName
                                  .split(' ')
                                  .map((n) => n[0])
                                  .slice(0, 2)
                                  .join('')}
                              </span>
                              <span>{group.leaderName}</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                isVirtualAutoGroup
                                  ? openAddGroupModal(group.category, group.name)
                                  : openEditGroupModal(group)
                              }
                              className="text-[11px] font-bold text-amber-700 dark:text-amber-300 hover:underline cursor-pointer"
                            >
                              Assign Leader
                            </button>
                          )}
                        </div>

                        {group.leaderPhone && (
                          <div className="flex items-center justify-between text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
                            <span className="flex items-center gap-1">
                              <Phone className="w-3 h-3 text-[#6D5CF2]" />
                              <span>Phone</span>
                            </span>
                            <a
                              href={`tel:${group.leaderPhone.replace(/\s+/g, '')}`}
                              className="font-mono text-[#6D5CF2] dark:text-[#8C7DFF] hover:underline"
                            >
                              {group.leaderPhone}
                            </a>
                          </div>
                        )}

                        {group.assistantLeader && (
                          <div className="flex items-center justify-between text-[11px] text-[#666A86] dark:text-[#A9ACC8] pt-1 border-t border-[#E9EBF5] dark:border-[#2D2D55]">
                            <span>Assistant / Co-Leader</span>
                            <span className="font-medium text-[#1D1B3A] dark:text-[#F2F2FA]">
                              {group.assistantLeader}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Live Turnout & Pastoral Care Snapshot (Synced with Dashboard Analytics) */}
                      <div className="grid grid-cols-3 gap-2 rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] px-2.5 py-2 mb-3 text-center tabular-nums">
                        <div>
                          <div className="text-[10px] font-semibold text-[#666A86] dark:text-[#A9ACC8]">
                            Enrolled
                          </div>
                          <div className="font-mono text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                            {liveMetrics.totalMembers}
                          </div>
                        </div>
                        <div className="border-x border-[#E9EBF5] dark:border-[#2D2D55]">
                          <div className="text-[10px] font-semibold text-[#666A86] dark:text-[#A9ACC8]">
                            Live Turnout
                          </div>
                          <div className="font-mono text-xs font-bold text-[#6D5CF2] dark:text-[#8C7DFF]">
                            {`${liveMetrics.presentCount} (${liveMetrics.turnoutPct}%)`}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] font-semibold text-[#666A86] dark:text-[#A9ACC8]">
                            Care / Risk
                          </div>
                          <div
                            className={`font-mono text-xs font-bold ${
                              liveMetrics.atRiskCount + liveMetrics.openFollowupCount > 0
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-emerald-600 dark:text-emerald-400'
                            }`}
                          >
                            {`${liveMetrics.atRiskCount} / ${liveMetrics.openFollowupCount}`}
                          </div>
                        </div>
                      </div>

                      {/* Schedule & Venue Information */}
                      <div className="space-y-1.5 text-xs text-[#666A86] dark:text-[#A9ACC8] mb-4">
                        {(group.meetingDay || group.meetingTime) && (
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-[#6D5CF2] shrink-0" />
                            <span className="truncate">
                              {group.meetingDay} {group.meetingTime ? `· ${group.meetingTime}` : ''}
                            </span>
                          </div>
                        )}
                        {group.meetingLocation && (
                          <div className="flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                            <span className="truncate">{group.meetingLocation}</span>
                          </div>
                        )}
                        {group.targetDemographic && (
                          <div className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] italic">
                            Focus: {group.targetDemographic}
                          </div>
                        )}
                      </div>
                    </div>

                      {/* Card Footer with Members Count & Actions */}
                    <div className="pt-3 border-t border-[#E9EBF5] dark:border-[#2D2D55] flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2.5 min-w-0">
                        <button
                          type="button"
                          onClick={() => setViewingMembersGroup(group)}
                          className="text-xs font-bold text-[#6D5CF2] dark:text-[#8C7DFF] hover:underline flex items-center gap-1 cursor-pointer whitespace-nowrap"
                        >
                          <Users className="w-3.5 h-3.5" />
                          <span>{enrolledMembers.length} enrolled</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            requestOpenAnalytics({
                              lens: isDepartmentLikeCategory(group.category)
                                ? 'departments'
                                : isMonthBornCategory(group.category)
                                ? 'demographics'
                                : 'ministries',
                              searchQuery: group.name,
                              categoryFilter: group.category,
                            })
                          }
                          className="text-[11px] font-semibold text-[#666A86] dark:text-[#A9ACC8] hover:text-[#6D5CF2] dark:hover:text-[#8C7DFF] flex items-center gap-1 cursor-pointer whitespace-nowrap"
                          title="Inspect in Congregation & Ministry Analytics"
                        >
                          <BarChart3 className="w-3 h-3" />
                          <span>Analytics</span>
                        </button>
                        {!isVirtualAutoGroup && (
                          <button
                            type="button"
                            onClick={() => {
                              setHistoryFilterCategory(group.category);
                              setHistoryFilterGroupId(group.id);
                              setHistoryFilterRole('all');
                              leadershipHistorySectionRef.current?.scrollIntoView({
                                behavior: 'smooth',
                                block: 'start',
                              });
                            }}
                            className="text-[11px] font-semibold text-[#666A86] dark:text-[#A9ACC8] hover:text-[#6D5CF2] dark:hover:text-[#8C7DFF] flex items-center gap-1 cursor-pointer whitespace-nowrap"
                            title="View Leadership Change History"
                          >
                            <History className="w-3 h-3" />
                            <span>History</span>
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            isVirtualAutoGroup
                              ? openAddGroupModal(group.category, group.name)
                              : openEditGroupModal(group)
                          }
                          className="p-1.5 rounded-lg text-[#666A86] dark:text-[#A9ACC8] hover:text-[#6D5CF2] hover:bg-[#EFEDFF] dark:hover:bg-[#2A2A55] transition-colors cursor-pointer"
                          title={isVirtualAutoGroup ? 'Assign Leader & Schedule' : 'Edit Group'}
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        {!isVirtualAutoGroup && (
                          <button
                            type="button"
                            onClick={() => {
                              if (confirmDeleteGroupId === group.id) {
                                deleteChurchGroup(group.id);
                                setConfirmDeleteGroupId(null);
                              } else {
                                setConfirmDeleteGroupId(group.id);
                                setTimeout(() => setConfirmDeleteGroupId(null), 3500);
                              }
                            }}
                            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                              confirmDeleteGroupId === group.id
                                ? 'bg-rose-600 text-white'
                                : 'text-[#666A86] dark:text-[#A9ACC8] hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40'
                            }`}
                            title={confirmDeleteGroupId === group.id ? 'Click again to confirm delete' : 'Delete Group'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Empty Search State */}
            {filteredEffectiveGroups.length === 0 && (
              <div className="bg-white dark:bg-[#1D1D3D] rounded-2xl p-10 text-center border border-[#E9EBF5] dark:border-[#2D2D55]">
                <Users className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                <h4 className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">No matching groups found</h4>
                <p className="text-xs text-[#666A86] dark:text-[#A9ACC8] mt-1 max-w-sm mx-auto">
                  Try adjusting your search query or category filters, or click "Add New Group" to create one.
                </p>
                <button
                  type="button"
                  onClick={() =>
                    openAddGroupModal(
                      groupFilterCategory !== 'all' ? groupFilterCategory : 'cell_group'
                    )
                  }
                  className="mt-4 bg-[#6D5CF2] text-white rounded-xl px-4 py-2 text-xs font-bold inline-flex items-center gap-1.5 shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create Group</span>
                </button>
              </div>
            )}

            {/* Leadership Change History Panel (All Categories: Built-in + Custom) */}
            {(() => {
              const historyCountByCat = new Map<string, number>();
              for (const h of leadershipHistory) {
                const key = String(h.category || 'cell_group').toLowerCase();
                historyCountByCat.set(key, (historyCountByCat.get(key) || 0) + 1);
              }

              const groupOptionsMap = new Map<string, { id: string; name: string; category: ChurchGroupCategory }>();
              for (const g of churchGroups) {
                groupOptionsMap.set(g.id, { id: g.id, name: g.name, category: g.category });
              }
              for (const h of leadershipHistory) {
                if (!groupOptionsMap.has(h.groupId)) {
                  groupOptionsMap.set(h.groupId, {
                    id: h.groupId,
                    name: h.groupName,
                    category: h.category,
                  });
                }
              }
              const groupOptions = Array.from(groupOptionsMap.values())
                .filter((opt) => historyFilterCategory === 'all' || opt.category === historyFilterCategory)
                .sort((a, b) => a.name.localeCompare(b.name));

              const filteredHistory = leadershipHistory.filter((entry) => {
                if (historyFilterCategory !== 'all' && entry.category !== historyFilterCategory) return false;
                if (historyFilterGroupId !== 'all' && entry.groupId !== historyFilterGroupId) return false;
                if (historyFilterRole !== 'all' && entry.role !== historyFilterRole) return false;
                if (!historySearchQuery.trim()) return true;
                const q = historySearchQuery.toLowerCase();
                return (
                  entry.groupName.toLowerCase().includes(q) ||
                  (entry.previousLeaderName || '').toLowerCase().includes(q) ||
                  (entry.newLeaderName || '').toLowerCase().includes(q) ||
                  (entry.changedByName || '').toLowerCase().includes(q) ||
                  (entry.changedByEmail || '').toLowerCase().includes(q) ||
                  (entry.reason || '').toLowerCase().includes(q)
                );
              });

              const formatCategoryText = (cat: ChurchGroupCategory) =>
                getGroupCategoryMeta(cat, customGroupCategories).label;

              const formatActionText = (action: ChurchGroupLeadershipHistoryEntry['action']) => {
                switch (action) {
                  case 'assigned':
                    return 'Appointed';
                  case 'changed':
                    return 'Handover';
                  case 'removed':
                    return 'Cleared';
                  case 'group_deleted':
                    return 'Group Deleted';
                  default:
                    return action;
                }
              };

              return (
                <div
                  ref={leadershipHistorySectionRef}
                  className="bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-[#E9EBF5] dark:border-[#2D2D55] shadow-xs space-y-4 min-w-0"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="text-sm sm:text-base font-bold text-[#1D1B3A] dark:text-[#F2F2FA] flex items-center gap-2">
                        <History className="w-4 h-4 text-[#6D5CF2] shrink-0" />
                        <span>Leadership Change History (All Categories)</span>
                      </h4>
                      <p className="text-xs text-[#666A86] dark:text-[#A9ACC8] mt-0.5">
                        Verified audit trail of primary and assistant leadership changes across all built-in and custom group categories.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => refreshLeadershipHistory()}
                      disabled={isLoadingLeadershipHistory}
                      className="min-h-[36px] px-3 py-1.5 rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-xs font-semibold text-[#1D1B3A] dark:text-[#F2F2FA] hover:border-[#6D5CF2] flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60 self-start sm:self-auto"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isLoadingLeadershipHistory ? 'animate-spin' : ''}`} />
                      <span>Refresh Log</span>
                    </button>
                  </div>

                  {/* Category Tabs & Filters */}
                  <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 pt-1">
                    <div className="flex flex-wrap items-center gap-1.5 min-w-0 tabular-nums">
                      {[
                        { id: 'all' as const, label: 'All Categories', count: leadershipHistory.length },
                        ...allGroupCategories.map((cat) => ({
                          id: cat.id,
                          label: cat.pluralLabel || cat.label,
                          count: historyCountByCat.get(cat.id) || 0,
                        })),
                      ].map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => {
                            setHistoryFilterCategory(tab.id);
                            setHistoryFilterGroupId('all');
                          }}
                          className={`min-h-[32px] px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                            historyFilterCategory === tab.id
                              ? 'bg-[#6D5CF2] text-white'
                              : 'bg-[#F6F7FC] dark:bg-[#14142E] text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-[#F2F2FA]'
                          }`}
                        >
                          {tab.label} ({tab.count})
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2 w-full xl:w-auto shrink-0">
                      <select
                        value={historyFilterGroupId}
                        onChange={(e) => setHistoryFilterGroupId(e.target.value)}
                        aria-label="Filter leadership history by group"
                        className="w-full sm:w-auto sm:max-w-[200px] min-h-[36px] px-2.5 py-1.5 text-xs rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] font-semibold outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                      >
                        <option value="all">All Groups</option>
                        {groupOptions.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                      </select>

                      <select
                        value={historyFilterRole}
                        onChange={(e) => setHistoryFilterRole(e.target.value as any)}
                        aria-label="Filter leadership history by role"
                        className="w-full sm:w-auto min-h-[36px] px-2.5 py-1.5 text-xs rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] font-semibold outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                      >
                        <option value="all">All Roles</option>
                        <option value="primary_leader">Primary Leader</option>
                        <option value="assistant_leader">Assistant Leader</option>
                      </select>

                      <div className="relative w-full sm:w-56">
                        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#666A86] dark:text-[#A9ACC8]" />
                        <input
                          type="text"
                          placeholder="Search leader, group, reason..."
                          value={historySearchQuery}
                          onChange={(e) => setHistorySearchQuery(e.target.value)}
                          className="w-full pl-8 pr-7 py-1.5 text-xs rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] placeholder-[#666A86] dark:placeholder-[#A9ACC8] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                        />
                        {historySearchQuery && (
                          <button
                            type="button"
                            onClick={() => setHistorySearchQuery('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Dense SaaS History Table */}
                  {filteredHistory.length > 0 ? (
                    <div className="overflow-x-auto rounded-2xl border border-[#E9EBF5] dark:border-[#2D2D55]">
                      <table className="w-full text-left border-collapse text-xs tabular-nums">
                        <thead className="bg-[#F6F7FC] dark:bg-[#14142E] text-[11px] font-bold text-[#666A86] dark:text-[#A9ACC8] border-b border-[#E9EBF5] dark:border-[#2D2D55]">
                          <tr>
                            <th className="py-2.5 px-3 whitespace-nowrap">Timestamp</th>
                            <th className="py-2.5 px-3 whitespace-nowrap">Group</th>
                            <th className="py-2.5 px-3 whitespace-nowrap">Category</th>
                            <th className="py-2.5 px-3 whitespace-nowrap">Role &amp; Event</th>
                            <th className="py-2.5 px-3 whitespace-nowrap">Leadership Transition</th>
                            <th className="py-2.5 px-3 whitespace-nowrap">Reason &amp; Recorded By</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E9EBF5] dark:divide-[#2D2D55]">
                          {filteredHistory.map((entry) => {
                            const formattedDate = (() => {
                              const d = new Date(entry.createdAt);
                              if (Number.isNaN(d.getTime())) return entry.createdAt;
                              return d.toLocaleString(undefined, {
                                year: 'numeric',
                                month: 'short',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                              });
                            })();

                            return (
                              <tr
                                key={entry.id}
                                className="min-h-[44px] hover:bg-[#F6F7FC]/70 dark:hover:bg-[#14142E]/60 transition-colors"
                              >
                                <td className="py-2.5 px-3 font-mono text-[11px] text-[#666A86] dark:text-[#A9ACC8] whitespace-nowrap">
                                  {formattedDate}
                                </td>
                                <td className="py-2.5 px-3 font-bold text-[#1D1B3A] dark:text-[#F2F2FA] whitespace-nowrap">
                                  {entry.groupName}
                                </td>
                                <td className="py-2.5 px-3 whitespace-nowrap">
                                  <span
                                    className={`text-[11px] font-bold ${
                                      getGroupCategoryStyles(
                                        getGroupCategoryMeta(entry.category, customGroupCategories).color
                                      ).textClass
                                    }`}
                                  >
                                    {formatCategoryText(entry.category)}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 whitespace-nowrap">
                                  <div className="font-semibold text-[#1D1B3A] dark:text-[#F2F2FA]">
                                    {entry.role === 'primary_leader' ? 'Primary Leader' : 'Assistant Leader'}
                                  </div>
                                  <div
                                    className={`text-[11px] font-semibold ${
                                      entry.action === 'assigned'
                                        ? 'text-emerald-600 dark:text-emerald-400'
                                        : entry.action === 'changed'
                                        ? 'text-[#6D5CF2] dark:text-[#8C7DFF]'
                                        : 'text-rose-600 dark:text-rose-400'
                                    }`}
                                  >
                                    {formatActionText(entry.action)}
                                  </div>
                                </td>
                                <td className="py-2.5 px-3">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span
                                      className={`${
                                        entry.previousLeaderName
                                          ? 'text-[#666A86] dark:text-[#A9ACC8]'
                                          : 'italic text-slate-400 dark:text-slate-500'
                                      }`}
                                    >
                                      {entry.previousLeaderName || 'Unassigned'}
                                    </span>
                                    <ArrowRight className="w-3 h-3 text-[#666A86] dark:text-[#A9ACC8] shrink-0" />
                                    <span
                                      className={`font-bold ${
                                        entry.newLeaderName
                                          ? 'text-[#1D1B3A] dark:text-[#F2F2FA]'
                                          : 'italic text-rose-600 dark:text-rose-400'
                                      }`}
                                    >
                                      {entry.newLeaderName || 'None'}
                                    </span>
                                  </div>
                                </td>
                                <td className="py-2.5 px-3">
                                  {entry.reason && (
                                    <div className="text-[#1D1B3A] dark:text-[#F2F2FA] font-medium">
                                      {entry.reason}
                                    </div>
                                  )}
                                  <div className="text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
                                    By {entry.changedByName || entry.changedByEmail || 'Administrator'}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="py-8 px-4 text-center rounded-2xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55]">
                      <History className="w-7 h-7 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                      <p className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                        {leadershipHistory.length === 0
                          ? 'No leadership transitions recorded yet'
                          : 'No leadership changes match the selected filters'}
                      </p>
                      <p className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] mt-1 max-w-md mx-auto">
                        {leadershipHistory.length === 0
                          ? 'Creating groups or updating Primary / Assistant leaders in Ministries, Fellowships, or Cell Groups automatically logs an immutable history entry here.'
                          : 'Try clearing category, group, role, or search filters to view all recorded transitions.'}
                      </p>
                      {leadershipHistory.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setHistoryFilterCategory('all');
                            setHistoryFilterGroupId('all');
                            setHistoryFilterRole('all');
                            setHistorySearchQuery('');
                          }}
                          className="mt-3 px-3.5 py-1.5 rounded-xl bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] text-xs font-bold cursor-pointer"
                        >
                          Clear Filters
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Connected Modules Summary Bar */}
            <div className="bg-white dark:bg-[#1D1D3D] rounded-2xl p-4 border border-[#E9EBF5] dark:border-[#2D2D55] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div>
                <div className="font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                  Connected Across Ekklesphere Modules
                </div>
                <p className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] mt-0.5">
                  Active Ministries feed Department selectors &amp; Leadership Analytics; Cell Groups &amp; Fellowships sync to Directory filters, Live Insights, Usher Check-in, Registration, and Pastoral Care.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                <button
                  type="button"
                  onClick={() => requestOpenAnalytics({ lens: 'ministries' })}
                  className="px-3.5 py-2 rounded-xl bg-[#6D5CF2] hover:bg-[#5b4be0] text-white font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Open Ministry Analytics
                </button>
                <button
                  type="button"
                  onClick={() => setAdminSubTab('workflows')}
                  className="px-3.5 py-2 rounded-xl bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] font-bold hover:bg-[#E2DEFF] dark:hover:bg-[#343468] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Open Directory
                </button>
              </div>
            </div>
          </div>
        )}


        {/* TAB 2: Proximity & Geofencing Automation */}
        {activeTab === 'proximity' && (
          <div className="space-y-5">
            <div className="bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl p-5 sm:p-7 border border-[#E9EBF5] dark:border-[#2D2D55] shadow-xs space-y-6">
              {renderPremiseGpsSetupCard()}

              <div>
                <h3 className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA] flex items-center gap-2 mb-1">
                  <Radio className="w-4 h-4 text-[#6D5CF2]" />
                  <span>Two-Tier Proximity Radar Engine</span>
                </h3>
                <p className="text-xs text-[#666A86] dark:text-[#A9ACC8]">
                  Calibrate the outer approach wake-up circle and inner sanctuary dwell perimeter around your configured church premise coordinates.
                </p>
              </div>

              {/* Interactive Visual Radar Simulator Card */}
              <div className="bg-[#F6F7FC] dark:bg-[#14142E] rounded-2xl p-4 sm:p-5 border border-[#E9EBF5] dark:border-[#2D2D55]">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-4">
                  <div>
                    <h4 className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                      Campus Radar Visualization (Live Geometry)
                    </h4>
                    <p className="text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
                      Outer Geofence: <strong className="text-[#6D5CF2]">{formData.outerGeofenceMeters}m</strong> · Inner Perimeter: <strong className="text-emerald-500">{formData.innerGeofenceMeters}m</strong> · Dwell Required: <strong className="text-[#1D1B3A] dark:text-white">{formData.dwellTimeMinutes} mins</strong>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[11px] font-bold">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      PostGIS GPS Active
                    </span>
                  </div>
                </div>

                {/* SVG Visual Representation */}
                <div className="relative w-full h-44 bg-white dark:bg-[#1A1A38] rounded-xl flex items-center justify-center overflow-hidden border border-[#E9EBF5] dark:border-[#2D2D55]/60">
                  {/* Grid Lines */}
                  <div className="absolute inset-0 bg-[radial-gradient(#6D5CF2_1px,transparent_1px)] [background-size:16px_16px] opacity-15" />
                  
                  {/* Outer Geofence Ring */}
                  <div
                    style={{
                      width: `${Math.min(260, Math.max(140, (formData.outerGeofenceMeters / 1000) * 260))}px`,
                      height: `${Math.min(260, Math.max(140, (formData.outerGeofenceMeters / 1000) * 260))}px`,
                    }}
                    className="rounded-full border-2 border-dashed border-[#6D5CF2]/50 bg-[#6D5CF2]/5 flex items-center justify-center transition-all duration-300 relative group"
                  >
                    <span className="absolute top-1 text-[9px] font-bold text-[#6D5CF2] tracking-wider uppercase">
                      Outer Ring ({formData.outerGeofenceMeters}m Approach)
                    </span>

                    {/* Inner Geofence Ring */}
                    <div
                      style={{
                        width: `${Math.min(130, Math.max(60, (formData.innerGeofenceMeters / 300) * 130))}px`,
                        height: `${Math.min(130, Math.max(60, (formData.innerGeofenceMeters / 300) * 130))}px`,
                      }}
                      className="rounded-full border-2 border-emerald-500/70 bg-emerald-500/15 flex items-center justify-center transition-all duration-300 relative"
                    >
                      <span className="absolute bottom-1 text-[8px] font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                        Inner ({formData.innerGeofenceMeters}m)
                      </span>

                      {/* Sanctuary Center Marker */}
                      <div className="w-6 h-6 rounded-full bg-[#6D5CF2] text-white flex items-center justify-center shadow-md animate-pulse">
                        <MapPin className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sliders & Direct Numeric Calibration */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
                <div>
                  <div className="flex items-center justify-between gap-2 text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1.5">
                    <span>Outer Geofence Radius (Approach Wake-up)</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <input
                        type="text"
                        inputMode="numeric"
                        aria-label="Outer Geofence Radius in meters"
                        value={outerGeofenceDraft}
                        onFocus={() => {
                          focusedFieldRef.current = 'outerGeofenceMeters';
                        }}
                        onChange={(e) =>
                          handleNumericDraftInput(
                            'outerGeofenceMeters',
                            e.target.value,
                            setOuterGeofenceDraft,
                            50,
                            5000
                          )
                        }
                        onBlur={() =>
                          commitNumericDraftOnBlur(
                            'outerGeofenceMeters',
                            outerGeofenceDraft,
                            setOuterGeofenceDraft,
                            50,
                            5000,
                            300
                          )
                        }
                        className="w-16 px-2 py-1 text-xs font-mono text-right rounded-lg bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#6D5CF2] dark:text-[#8C7DFF] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                      />
                      <span className="text-[11px] font-mono text-[#666A86] dark:text-[#A9ACC8]">m</span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min="150"
                    max="800"
                    step="50"
                    value={Math.min(800, Math.max(150, formData.outerGeofenceMeters))}
                    onChange={(e) => {
                      const next = parseInt(e.target.value, 10);
                      setOuterGeofenceDraft(String(next));
                      handleChange('outerGeofenceMeters', next);
                    }}
                    className="w-full accent-[#6D5CF2] cursor-pointer"
                  />
                  <p className="text-[10px] text-[#666A86] dark:text-[#A9ACC8] mt-1">
                    Wakes device background task when member arrives within this distance of {formData.campusName || systemSettings.campusName}.
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2 text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1.5">
                    <span>Inner Perimeter Radius (Sanctuary Grounds)</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <input
                        type="text"
                        inputMode="numeric"
                        aria-label="Inner Perimeter Radius in meters"
                        value={innerGeofenceDraft}
                        onFocus={() => {
                          focusedFieldRef.current = 'innerGeofenceMeters';
                        }}
                        onChange={(e) =>
                          handleNumericDraftInput(
                            'innerGeofenceMeters',
                            e.target.value,
                            setInnerGeofenceDraft,
                            10,
                            1000
                          )
                        }
                        onBlur={() =>
                          commitNumericDraftOnBlur(
                            'innerGeofenceMeters',
                            innerGeofenceDraft,
                            setInnerGeofenceDraft,
                            10,
                            1000,
                            100
                          )
                        }
                        className="w-16 px-2 py-1 text-xs font-mono text-right rounded-lg bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-emerald-600 dark:text-emerald-400 outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                      />
                      <span className="text-[11px] font-mono text-[#666A86] dark:text-[#A9ACC8]">m</span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min="30"
                    max="200"
                    step="10"
                    value={Math.min(200, Math.max(30, formData.innerGeofenceMeters))}
                    onChange={(e) => {
                      const next = parseInt(e.target.value, 10);
                      setInnerGeofenceDraft(String(next));
                      handleChange('innerGeofenceMeters', next);
                    }}
                    className="w-full accent-emerald-500 cursor-pointer"
                  />
                  <p className="text-[10px] text-[#666A86] dark:text-[#A9ACC8] mt-1">
                    Sanctuary gates perimeter where dwell timer begins counting down.
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2 text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1.5">
                    <span>Mandatory Dwell Verification Time</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <input
                        type="text"
                        inputMode="numeric"
                        aria-label="Mandatory Dwell Verification Time in minutes"
                        value={dwellTimeDraft}
                        onFocus={() => {
                          focusedFieldRef.current = 'dwellTimeMinutes';
                        }}
                        onChange={(e) =>
                          handleNumericDraftInput(
                            'dwellTimeMinutes',
                            e.target.value,
                            setDwellTimeDraft,
                            1,
                            60
                          )
                        }
                        onBlur={() =>
                          commitNumericDraftOnBlur(
                            'dwellTimeMinutes',
                            dwellTimeDraft,
                            setDwellTimeDraft,
                            1,
                            60,
                            5
                          )
                        }
                        className="w-14 px-2 py-1 text-xs font-mono text-right rounded-lg bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                      />
                      <span className="text-[11px] font-mono text-[#666A86] dark:text-[#A9ACC8]">min</span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="15"
                    step="1"
                    value={Math.min(15, Math.max(1, formData.dwellTimeMinutes))}
                    onChange={(e) => {
                      const next = parseInt(e.target.value, 10);
                      setDwellTimeDraft(String(next));
                      handleChange('dwellTimeMinutes', next);
                    }}
                    className="w-full accent-[#6D5CF2] cursor-pointer"
                  />
                  <p className="text-[10px] text-[#666A86] dark:text-[#A9ACC8] mt-1">
                    Member must remain inside perimeter for this duration to confirm attendance.
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2 text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1.5">
                    <span>BLE Beacon Sensitivity Threshold</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <input
                        type="text"
                        inputMode="text"
                        aria-label="BLE Beacon Sensitivity Threshold in dBm"
                        value={bleBeaconDraft}
                        onFocus={() => {
                          focusedFieldRef.current = 'bleBeaconRssiThreshold';
                        }}
                        onChange={(e) =>
                          handleNumericDraftInput(
                            'bleBeaconRssiThreshold',
                            e.target.value,
                            setBleBeaconDraft,
                            -95,
                            -40,
                            true
                          )
                        }
                        onBlur={() =>
                          commitNumericDraftOnBlur(
                            'bleBeaconRssiThreshold',
                            bleBeaconDraft,
                            setBleBeaconDraft,
                            -95,
                            -40,
                            -70
                          )
                        }
                        className="w-16 px-2 py-1 text-xs font-mono text-right rounded-lg bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-indigo-600 dark:text-indigo-400 outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                      />
                      <span className="text-[11px] font-mono text-[#666A86] dark:text-[#A9ACC8]">dBm</span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min="-85"
                    max="-50"
                    step="5"
                    value={Math.min(-50, Math.max(-85, formData.bleBeaconRssiThreshold))}
                    onChange={(e) => {
                      const next = parseInt(e.target.value, 10);
                      setBleBeaconDraft(String(next));
                      handleChange('bleBeaconRssiThreshold', next);
                    }}
                    className="w-full accent-indigo-500 cursor-pointer"
                  />
                  <p className="text-[10px] text-[#666A86] dark:text-[#A9ACC8] mt-1">
                    Required signal strength from sanctuary door beacon (-70 dBm standard).
                  </p>
                </div>
              </div>

              {/* Service Window Timers */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-[#E9EBF5] dark:border-[#2D2D55]">
                <div>
                  <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                    Pre-Service Check-in Window (Minutes Before)
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={beforeWindowDraft}
                    onFocus={() => {
                      focusedFieldRef.current = 'serviceWindowBeforeMinutes';
                    }}
                    onChange={(e) =>
                      handleNumericDraftInput(
                        'serviceWindowBeforeMinutes',
                        e.target.value,
                        setBeforeWindowDraft,
                        15,
                        90
                      )
                    }
                    onBlur={() =>
                      commitNumericDraftOnBlur(
                        'serviceWindowBeforeMinutes',
                        beforeWindowDraft,
                        setBeforeWindowDraft,
                        15,
                        90,
                        45
                      )
                    }
                    className="w-full px-3.5 py-2 text-xs font-mono rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                  />
                  <p className="text-[10px] text-[#666A86] dark:text-[#A9ACC8] mt-0.5">
                    Range: 15–90 min (e.g. 45 min allows early arrivals and choir rehearsal check-in).
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                    Post-Service Grace Window (Minutes After)
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={afterWindowDraft}
                    onFocus={() => {
                      focusedFieldRef.current = 'serviceWindowAfterMinutes';
                    }}
                    onChange={(e) =>
                      handleNumericDraftInput(
                        'serviceWindowAfterMinutes',
                        e.target.value,
                        setAfterWindowDraft,
                        15,
                        60
                      )
                    }
                    onBlur={() =>
                      commitNumericDraftOnBlur(
                        'serviceWindowAfterMinutes',
                        afterWindowDraft,
                        setAfterWindowDraft,
                        15,
                        60,
                        30
                      )
                    }
                    className="w-full px-3.5 py-2 text-xs font-mono rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                  />
                  <p className="text-[10px] text-[#666A86] dark:text-[#A9ACC8] mt-0.5">
                    Range: 15–60 min (keeps check-in active for delayed arrivals or usher reconciliation).
                  </p>
                </div>
              </div>

              {/* Toggle: Drive-by Protection */}
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55]">
                <div className="max-w-lg">
                  <div className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                    Drive-by Speed & False-Positive Filter
                  </div>
                  <p className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] mt-0.5">
                    Discards proximity events if the device moves faster than 15 km/h across the perimeter, preventing false check-ins from passing road traffic.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer ml-4">
                  <input
                    type="checkbox"
                    checked={formData.driveByProtection}
                    onChange={(e) => handleChange('driveByProtection', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-300 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#6D5CF2]" />
                </label>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: Pastoral Care Rules */}
        {activeTab === 'pastoral' && (
          <div className="bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl p-5 sm:p-7 border border-[#E9EBF5] dark:border-[#2D2D55] shadow-xs space-y-6">
            <div>
              <h3 className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA] flex items-center gap-2 mb-1">
                <HeartHandshake className="w-4 h-4 text-[#6D5CF2]" />
                <span>Automated Pastoral Care & Retention Triggers</span>
              </h3>
              <p className="text-xs text-[#666A86] dark:text-[#A9ACC8]">
                Proactive rules that automatically generate care tasks when members miss consecutive services.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                  Consecutive Absences Alert Threshold
                </label>
                <select
                  value={formData.absenteeThresholdServices}
                  onChange={(e) => handleChange('absenteeThresholdServices', parseInt(e.target.value, 10))}
                  className="w-full px-3.5 py-2 text-xs rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                >
                  <option value={1}>1 Missed Service (Immediate Outreach &amp; Reminder)</option>
                  <option value={2}>2 Consecutive Services (Early Warning · Recommended)</option>
                  <option value={3}>3 Consecutive Services (Critical Inactivity Flag)</option>
                  <option value={4}>4 Consecutive Services</option>
                </select>
                <p className="text-[10px] text-[#666A86] dark:text-[#A9ACC8] mt-1">
                  Once reached, a follow-up assignment is dispatched to the pastoral care queue.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                  First-Timer Welcome Follow-up SLA
                </label>
                <select
                  value={formData.firstTimerFollowupHours}
                  onChange={(e) => handleChange('firstTimerFollowupHours', parseInt(e.target.value, 10))}
                  className="w-full px-3.5 py-2 text-xs rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                >
                  <option value={24}>Within 24 Hours (Best Practice for Visitor Retention)</option>
                  <option value={48}>Within 48 Hours</option>
                  <option value={72}>Within 72 Hours</option>
                </select>
                <p className="text-[10px] text-[#666A86] dark:text-[#A9ACC8] mt-1">
                  Due date assigned to the Welcome Team when a visitor registers at the door.
                </p>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55]">
                <div>
                  <div className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                    Auto-Message Absent Members
                  </div>
                  <p className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] mt-0.5">
                    Automatically sends a personalized check-in message when a service closes for active members who missed it (honoring explicit SMS/email opt-outs).
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer ml-4 shrink-0">
                  <input
                    type="checkbox"
                    checked={formData.autoMessageAbsentMembers ?? true}
                    onChange={(e) => handleChange('autoMessageAbsentMembers', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-300 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#6D5CF2]" />
                </label>
              </div>

              {(formData.autoMessageAbsentMembers ?? true) && (
                <div className="p-4 rounded-2xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                        Absent Member Outreach Channel
                      </label>
                      <select
                        value={formData.absentMemberMessageChannel || 'sms_and_email'}
                        onChange={(e) =>
                          handleChange(
                            'absentMemberMessageChannel',
                            e.target.value as 'sms_and_email' | 'sms' | 'email'
                          )
                        }
                        className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                      >
                        <option value="sms_and_email">Arkesel SMS + Resend Email</option>
                        <option value="sms">Arkesel SMS Only</option>
                        <option value="email">Resend Email Only</option>
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                        Personalized Absent Member Message Template
                      </label>
                      <textarea
                        rows={3}
                        value={formData.absentMemberMessageTemplate ?? ''}
                        onChange={(e) => handleChange('absentMemberMessageTemplate', e.target.value)}
                        placeholder="Shalom {{firstName}}, we missed you at {{serviceName}} at {{churchName}}..."
                        className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                      />
                      <p className="text-[10px] text-[#666A86] dark:text-[#A9ACC8] mt-1">
                        Placeholders: <code className="font-mono">{'{{firstName}}'}</code>,{' '}
                        <code className="font-mono">{'{{serviceName}}'}</code>,{' '}
                        <code className="font-mono">{'{{churchName}}'}</code>,{' '}
                        <code className="font-mono">{'{{missedCount}}'}</code>,{' '}
                        <code className="font-mono">{'{{contactPhone}}'}</code>
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55]">
                <div>
                  <div className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                    Auto-Send Pastoral Care Reminders to Leaders in Charge
                  </div>
                  <p className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] mt-0.5">
                    Sends SMS, email, and portal reminders to assigned Cell Leaders, Elders, Deacons, and Pastors whenever a follow-up task is created, monitored by the Administrator, Pastor, Presiding Elder, and Associate Pastor.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer ml-4 shrink-0">
                  <input
                    type="checkbox"
                    checked={formData.autoSendLeaderCareReminders ?? true}
                    onChange={(e) => handleChange('autoSendLeaderCareReminders', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-300 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#6D5CF2]" />
                </label>
              </div>

              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55]">
                <div>
                  <div className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                    Auto-Assign Care Tasks to Cell Group Leaders
                  </div>
                  <p className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] mt-0.5">
                    Automatically directs absentee follow-ups to assigned home cell, ministry, or youth leaders rather than centralized pastors.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer ml-4 shrink-0">
                  <input
                    type="checkbox"
                    checked={formData.autoAssignCellLeaders}
                    onChange={(e) => handleChange('autoAssignCellLeaders', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-300 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#6D5CF2]" />
                </label>
              </div>

              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55]">
                <div>
                  <div className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                    Push Notification Alerts for Leaders
                  </div>
                  <p className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] mt-0.5">
                    Pings usher heads and pastoral ministers immediately when an attendance anomaly or critical absentee flag is logged.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer ml-4 shrink-0">
                  <input
                    type="checkbox"
                    checked={formData.enablePushNotifications}
                    onChange={(e) => handleChange('enablePushNotifications', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-300 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#6D5CF2]" />
                </label>
              </div>

              {/* Connected Pastoral Routing Preview & Auto-Assign Action */}
              <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="min-w-0">
                  <span className="font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                    Live Care Routing:{' '}
                  </span>
                  <span className="text-[#666A86] dark:text-[#A9ACC8]">
                    {formData.autoAssignCellLeaders
                      ? `${churchGroups.filter((g) => g.active && g.leaderName).length} active group leaders + Church Officers (Deacon, Deaconess, Elder, Pastor) load-balanced automatically`
                      : `All new care tasks assign directly to ${formData.seniorPastor || 'Pastoral Care Team'}`}
                    {' · '}Visitor SLA: Within {formData.firstTimerFollowupHours}h
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3 shrink-0">
                  <button
                    type="button"
                    disabled={isAutoAssigningAbsentees}
                    onClick={() => autoAssignAbsentees({ silent: false })}
                    className="px-3 py-1.5 rounded-xl bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#9D90FF] font-bold hover:opacity-90 transition-opacity whitespace-nowrap cursor-pointer disabled:opacity-60"
                  >
                    {isAutoAssigningAbsentees ? 'Auto-Assigning...' : 'Auto-Assign Absentees Now'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('groups')}
                    className="text-xs font-bold text-[#6D5CF2] dark:text-[#8C7DFF] hover:underline whitespace-nowrap cursor-pointer"
                  >
                    Review Group Leaders
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: Privacy & Governance */}
        {activeTab === 'privacy' && (
          <div className="bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl p-5 sm:p-7 border border-[#E9EBF5] dark:border-[#2D2D55] shadow-xs space-y-6">
            <div>
              <h3 className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA] flex items-center gap-2 mb-1">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                <span>Data Protection & Ghana Act 843 Governance</span>
              </h3>
              <p className="text-xs text-[#666A86] dark:text-[#A9ACC8]">
                Enforces member data rights, explicit consent toggles, and secure audit retention in accordance with Ghana Data Protection Commission standards.
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55]">
                <div className="max-w-lg">
                  <div className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                    Strict Explicit Consent Requirement
                  </div>
                  <p className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] mt-0.5">
                    Prohibits automated proximity scanning on members until they affirmatively tap "Agree & Opt In" inside their mobile experience.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer ml-4">
                  <input
                    type="checkbox"
                    checked={formData.requireExplicitConsent}
                    onChange={(e) => handleChange('requireExplicitConsent', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-300 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#6D5CF2]" />
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                    Audit Log & Proximity Signal Retention Period
                  </label>
                  <select
                    value={formData.auditLogRetentionDays}
                    onChange={(e) => handleChange('auditLogRetentionDays', parseInt(e.target.value, 10))}
                    className="w-full px-3.5 py-2 text-xs rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                  >
                    <option value={30}>30 Days (Privacy-First Minimum)</option>
                    <option value={90}>90 Days (Quarterly Audit Recommended)</option>
                    <option value={180}>180 Days (Half-Yearly)</option>
                    <option value={365}>365 Days (Annual Compliance)</option>
                  </select>
                  <p className="text-[10px] text-[#666A86] dark:text-[#A9ACC8] mt-1">
                    Signals and raw GPS lat/lng approach breadcrumbs older than this period are purged automatically.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                    User Idle Session Timeout
                  </label>
                  <select
                    value={formData.sessionTimeoutMinutes ?? 30}
                    onChange={(e) => handleChange('sessionTimeoutMinutes', parseInt(e.target.value, 10))}
                    className="w-full px-3.5 py-2 text-xs rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                  >
                    <option value={15}>15 Minutes (High Security)</option>
                    <option value={30}>30 Minutes (Recommended Default)</option>
                    <option value={60}>60 Minutes (1 Hour)</option>
                    <option value={120}>120 Minutes (2 Hours Service Window)</option>
                    <option value={240}>240 Minutes (4 Hours Extended Staff Shift)</option>
                    <option value={0}>Disabled (Standard 24h JWT Expiry)</option>
                  </select>
                  <p className="text-[10px] text-[#666A86] dark:text-[#A9ACC8] mt-1">
                    Automatically signs out inactive Admin, Usher, and Member sessions after showing a 60-second warning prompt.
                  </p>
                </div>
              </div>
            </div>

            {/* Audit Log Tools */}
            <div className="pt-3 border-t border-[#E9EBF5] dark:border-[#2D2D55] flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                  System Audit Trail & Compliance Export
                </div>
                <div className="text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
                  {auditLogs.length} verified security audit logs stored in Supabase for {formData.campusName || systemSettings.campusName || 'this organisation'}.
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => refreshAuditLogs()}
                  className="px-3 py-2 rounded-xl text-xs font-bold bg-[#F6F7FC] dark:bg-[#14142E] text-[#1D1B3A] dark:text-[#F2F2FA] border border-[#E9EBF5] dark:border-[#2D2D55] hover:bg-slate-200 dark:hover:bg-white/10 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Refresh Logs</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportAudit}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] hover:bg-[#E2DEFF] dark:hover:bg-[#343468] transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Export Audit JSON</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: Gateways (SMS & Payment) */}
        {activeTab === 'gateways' && (
          <div className="bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl p-5 sm:p-7 border border-[#E9EBF5] dark:border-[#2D2D55] shadow-xs space-y-6">
            <div>
              <h3 className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA] flex items-center gap-2 mb-1">
                <Send className="w-4 h-4 text-[#6D5CF2]" />
                <span>Communication &amp; Mobile Money Gateways</span>
              </h3>
              <p className="text-xs text-[#666A86] dark:text-[#A9ACC8]">
                Configure your church&apos;s own Arkesel SMS API key, Paystack merchant keys, and Resend email settings. Secret keys are encrypted at rest with AES-256-GCM per tenant and never returned to the browser.
              </p>
            </div>

            {/* SMS Gateway (Arkesel API) */}
            <div className="p-4 rounded-2xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] flex items-center gap-1.5">
                    <span>SMS Broadcast Gateway (Arkesel API)</span>
                    {communicationStatus.arkeselKeyMasked && (
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#5B5F7A] dark:text-[#A9ACC8]">
                        {communicationStatus.arkeselKeyMasked}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
                    {communicationStatus.arkeselSource === 'tenant'
                      ? 'Using your church’s encrypted Arkesel API key stored for this tenant.'
                      : communicationStatus.arkeselSource === 'platform_env'
                      ? 'Falling back to platform environment ARKESEL_API_KEY. Save a tenant key below to bill your own Arkesel account.'
                      : 'Enter your church’s Arkesel API v2 key below to enable live SMS broadcasts.'}
                  </div>
                </div>
                <span
                  className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                    communicationStatus.arkeselConfigured
                      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                      : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                  }`}
                >
                  {communicationStatus.arkeselSource === 'tenant'
                    ? 'Tenant Arkesel Key Active'
                    : communicationStatus.arkeselConfigured
                    ? 'Platform Env Key Active'
                    : 'Arkesel Key Needed'}
                </span>
              </div>

              {/* Per-Tenant Arkesel API Key Input */}
              <div className="p-3.5 rounded-xl bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-[#6D5CF2]" />
                    <span>Tenant Arkesel API Key (Write-Only)</span>
                  </label>
                  <span className="text-[10px] font-medium text-[#666A86] dark:text-[#A9ACC8] flex items-center gap-1">
                    <Lock className="w-3 h-3" />
                    <span>AES-256-GCM Encrypted</span>
                  </span>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1 min-w-0">
                    <input
                      type={showArkeselKey ? 'text' : 'password'}
                      autoComplete="off"
                      value={arkeselApiKeyInput}
                      onChange={(e) => setArkeselApiKeyInput(e.target.value)}
                      placeholder={
                        communicationStatus.arkeselSource === 'tenant' && communicationStatus.arkeselKeyMasked
                          ? `Saved (${communicationStatus.arkeselKeyMasked}) — enter new key to replace`
                          : 'Paste your church Arkesel API v2 key'
                      }
                      className="w-full pr-9 pl-3.5 py-2 text-xs rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2] font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowArkeselKey((prev) => !prev)}
                      aria-label={showArkeselKey ? 'Hide Arkesel API key' : 'Show Arkesel API key'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#666A86] hover:text-[#1D1B3A] dark:text-[#A9ACC8] cursor-pointer"
                    >
                      {showArkeselKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={isSavingArkeselKey || !arkeselApiKeyInput.trim() || !isSettingsAdmin}
                      onClick={handleSaveArkeselKey}
                      className="px-3.5 py-2 rounded-xl text-xs font-bold bg-[#6D5CF2] hover:bg-[#5B4BE0] text-white transition-all cursor-pointer disabled:opacity-50"
                    >
                      {isSavingArkeselKey ? 'Encrypting...' : 'Save Arkesel Key'}
                    </button>
                    {communicationStatus.arkeselSource === 'tenant' && (
                      <button
                        type="button"
                        disabled={isSavingArkeselKey || !isSettingsAdmin}
                        onClick={handleClearArkeselKey}
                        title="Remove tenant Arkesel API key"
                        className="px-2.5 py-2 rounded-xl text-xs font-semibold border border-rose-200 dark:border-rose-800/60 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-all cursor-pointer disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                    Primary SMS Gateway Provider
                  </label>
                  <select
                    value={formData.smsGatewayProvider}
                    onChange={(e) => handleChange('smsGatewayProvider', e.target.value)}
                    className="w-full px-3.5 py-2 text-xs rounded-xl bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                  >
                    <option value="Arkesel SMS">Arkesel SMS API (Recommended)</option>
                    <option value="Hubtel Ghana">Hubtel Ghana</option>
                    <option value="Twilio Global">Twilio Global Messaging</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                    SMS Sender ID (Mask)
                  </label>
                  <input
                    type="text"
                    maxLength={11}
                    value={formData.smsSenderId ?? ''}
                    onChange={(e) => {
                      const el = e.target;
                      const start = el.selectionStart;
                      const end = el.selectionEnd;
                      const upper = el.value.toUpperCase().slice(0, 11);
                      handleChange('smsSenderId', upper);
                      requestAnimationFrame(() => {
                        if (document.activeElement === el && start !== null && end !== null) {
                          el.setSelectionRange(start, end);
                        }
                      });
                    }}
                    placeholder={communicationStatus.defaultSmsSenderId || 'EKKLESPHERE'}
                    className="w-full px-3.5 py-2 text-xs rounded-xl bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2] font-mono uppercase"
                  />
                  <p className="text-[10px] text-[#666A86] dark:text-[#A9ACC8] mt-1">
                    Max 11 alphanumeric NCA-approved characters.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                    Test SMS Recipient (Optional)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="tel"
                      value={testSmsRecipientPhone}
                      onChange={(e) => setTestSmsRecipientPhone(e.target.value)}
                      placeholder={formData.contactPhone || '+233240000000'}
                      className="flex-1 min-w-0 px-3 py-2 text-xs rounded-xl bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2] font-mono"
                    />
                    <button
                      type="button"
                      disabled={isTestingSms}
                      onClick={handleTestSms}
                      className="px-3 py-2 rounded-xl text-xs font-bold bg-[#6D5CF2] hover:bg-[#5B4BE0] text-white transition-all cursor-pointer whitespace-nowrap disabled:opacity-60"
                    >
                      {isTestingSms ? 'Sending...' : 'Send Test'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Paystack & Mobile Money Payment Gateway (Per-Tenant Keys) */}
            <div className="p-4 rounded-2xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] flex items-center gap-1.5">
                    <CreditCard className="w-4 h-4 text-[#6D5CF2]" />
                    <span>Paystack &amp; Mobile Money Giving Gateway</span>
                    {communicationStatus.paystackSecretMasked && (
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#5B5F7A] dark:text-[#A9ACC8]">
                        {communicationStatus.paystackSecretMasked}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
                    Route tithes, offerings, and MTN MoMo / Telecel Cash directly to this church&apos;s Paystack merchant account. Settlement: {formData.currency || 'GHS (Ghana Cedi)'}.
                  </div>
                </div>
                <span
                  className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                    communicationStatus.paystackConfigured
                      ? communicationStatus.paystackMode === 'live'
                        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                        : 'bg-sky-500/10 text-sky-700 dark:text-sky-300'
                      : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                  }`}
                >
                  {communicationStatus.paystackConfigured
                    ? communicationStatus.paystackMode === 'live'
                      ? 'Paystack Live Ready'
                      : 'Paystack Test Mode'
                    : 'Paystack Keys Needed'}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                    Paystack Public Key
                  </label>
                  <input
                    type="text"
                    autoComplete="off"
                    value={paystackPublicKeyInput}
                    onChange={(e) => setPaystackPublicKeyInput(e.target.value)}
                    placeholder="pk_live_... or pk_test_..."
                    className="w-full px-3.5 py-2 text-xs rounded-xl bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2] font-mono"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                      Paystack Secret Key (Write-Only)
                    </label>
                    <span className="text-[10px] text-[#666A86] dark:text-[#A9ACC8] flex items-center gap-1">
                      <Lock className="w-3 h-3" />
                      <span>Encrypted</span>
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      type={showPaystackSecret ? 'text' : 'password'}
                      autoComplete="off"
                      value={paystackSecretKeyInput}
                      onChange={(e) => setPaystackSecretKeyInput(e.target.value)}
                      placeholder={
                        communicationStatus.paystackConfigured && communicationStatus.paystackSecretMasked
                          ? `Saved (${communicationStatus.paystackSecretMasked}) — enter new key to replace`
                          : 'sk_live_... or sk_test_...'
                      }
                      className="w-full pr-9 pl-3.5 py-2 text-xs rounded-xl bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2] font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPaystackSecret((prev) => !prev)}
                      aria-label={showPaystackSecret ? 'Hide Paystack secret key' : 'Show Paystack secret key'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#666A86] hover:text-[#1D1B3A] dark:text-[#A9ACC8] cursor-pointer"
                    >
                      {showPaystackSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Paystack Webhook URL + Actions */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-1">
                <div className="flex-1 min-w-0 p-2.5 rounded-xl bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#666A86] dark:text-[#A9ACC8]">
                      Paystack Webhook URL (Paste in Paystack Dashboard)
                    </div>
                    <div className="text-[11px] font-mono text-[#1D1B3A] dark:text-[#F2F2FA] truncate">
                      {`${typeof window !== 'undefined' ? window.location.origin : ''}/api/giving/webhooks/paystack/${currentUser?.organization_id || currentUser?.tenant_id || ''}`}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const webhookUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/api/giving/webhooks/paystack/${currentUser?.organization_id || currentUser?.tenant_id || ''}`;
                      navigator.clipboard?.writeText(webhookUrl);
                      showToast('Paystack webhook URL copied to clipboard');
                    }}
                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-[#F6F7FC] dark:bg-[#14142E] hover:bg-[#EFEDFF] text-[#6D5CF2] flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    <Copy className="w-3 h-3" />
                    <span>Copy</span>
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={
                      isSavingPaystackKeys ||
                      (!paystackPublicKeyInput.trim() && !paystackSecretKeyInput.trim()) ||
                      !isSettingsAdmin
                    }
                    onClick={handleSavePaystackKeys}
                    className="px-3.5 py-2 rounded-xl text-xs font-bold bg-[#6D5CF2] hover:bg-[#5B4BE0] text-white transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isSavingPaystackKeys ? 'Saving...' : 'Save Paystack Keys'}
                  </button>
                  <button
                    type="button"
                    disabled={isTestingPaystack || !communicationStatus.paystackConfigured}
                    onClick={handleTestPaystack}
                    className="px-3.5 py-2 rounded-xl text-xs font-bold border border-[#E9EBF5] dark:border-[#2D2D55] bg-white dark:bg-[#1D1D3D] hover:bg-[#EFEDFF] dark:hover:bg-[#2A2A55] text-[#1D1B3A] dark:text-[#F2F2FA] transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isTestingPaystack ? 'Verifying...' : 'Verify Paystack API'}
                  </button>
                  {communicationStatus.paystackSource === 'tenant' && (
                    <button
                      type="button"
                      disabled={isSavingPaystackKeys || !isSettingsAdmin}
                      onClick={handleClearPaystackKeys}
                      title="Remove tenant Paystack keys"
                      className="px-2.5 py-2 rounded-xl text-xs font-semibold border border-rose-200 dark:border-rose-800/60 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-all cursor-pointer disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Email Gateway (Resend API) */}
            <div className="p-4 rounded-2xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                    Email Delivery Gateway (Resend API)
                  </div>
                  <div className="text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
                    Authenticated server-side via <span className="font-mono">RESEND_API_KEY</span>.
                  </div>
                </div>
                <span
                  className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                    communicationStatus.resendConfigured
                      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                      : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                  }`}
                >
                  {communicationStatus.resendConfigured ? 'Resend API Ready' : 'Set RESEND_API_KEY in Env'}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                    Sender Display Name
                  </label>
                  <input
                    type="text"
                    value={formData.emailSenderName || ''}
                    onChange={(e) => handleChange('emailSenderName', e.target.value)}
                    placeholder={formData.churchName || communicationStatus.defaultFromName || 'Ekklesphere Church'}
                    className="w-full px-3.5 py-2 text-xs rounded-xl bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                    Verified From Email Address
                  </label>
                  <input
                    type="email"
                    value={formData.emailFromAddress || ''}
                    onChange={(e) => handleChange('emailFromAddress', e.target.value)}
                    placeholder={communicationStatus.defaultFromEmail || 'noreply@yourchurch.org'}
                    className="w-full px-3.5 py-2 text-xs rounded-xl bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2] font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                    Test Recipient Email
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={testEmailRecipient}
                      onChange={(e) => {
                        testEmailTouchedRef.current = true;
                        setTestEmailRecipient(e.target.value);
                      }}
                      placeholder={formData.contactEmail || currentUser?.email || 'pastor@church.org'}
                      className="flex-1 min-w-0 px-3 py-2 text-xs rounded-xl bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2] font-mono"
                    />
                    <button
                      type="button"
                      disabled={isTestingEmail}
                      onClick={handleTestEmail}
                      className="px-3 py-2 rounded-xl text-xs font-bold bg-[#6D5CF2] hover:bg-[#5B4BE0] text-white transition-all cursor-pointer whitespace-nowrap disabled:opacity-60"
                    >
                      {isTestingEmail ? 'Sending...' : 'Send Email'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Gateway status badges */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="p-3.5 rounded-2xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                    communicationStatus.paystackConfigured
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                  }`}>
                    {communicationStatus.paystackConfigured ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : (
                      <AlertCircle className="w-4 h-4" />
                    )}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                      Paystack &amp; MTN MoMo Checkout
                    </div>
                    <div className="text-[10px] text-[#666A86] dark:text-[#A9ACC8]">
                      Settlement currency: {formData.currency || 'GHS (Ghana Cedi)'}
                    </div>
                  </div>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  communicationStatus.paystackConfigured
                    ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10'
                    : 'text-amber-600 dark:text-amber-400 bg-amber-500/10'
                }`}>
                  {communicationStatus.paystackConfigured ? 'Connected' : 'Setup Needed'}
                </span>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] flex items-center justify-center">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                      Supabase Postgres Synchronization
                    </div>
                    <div className="text-[10px] text-[#666A86] dark:text-[#A9ACC8]">
                      {systemSettingsStorageBackend === 'supabase'
                        ? 'Multi-tenant Postgres RLS active'
                        : 'Sandbox in-memory persistence active'}
                    </div>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-[#6D5CF2] dark:text-[#8C7DFF] bg-[#6D5CF2]/10 px-2 py-0.5 rounded-full">
                  {systemSettingsStorageBackend === 'supabase' ? 'Connected' : 'Sandbox'}
                </span>
              </div>
            </div>

            {/* Web Push Notification Gateway Engine (Brief Section 2.1 & 3.3) */}
            <div className="pt-4 border-t border-[#E9EBF5] dark:border-[#2D2D55] space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] flex items-center gap-1.5">
                    <Bell className="w-4 h-4 text-[#6D5CF2]" />
                    <span>Web Push & Mobile Arrival Engine (FCM / APNs)</span>
                  </h4>
                  <p className="text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
                    Sends high-priority time-sensitive arrival confirmations, absence alerts, and service reminders.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-[#5B5F7A] dark:text-[#A9ACC8]">
                    {pushSubscribersCount} device{pushSubscribersCount === 1 ? '' : 's'} registered
                  </span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.enablePushNotifications}
                      onChange={(e) => handleChange('enablePushNotifications', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-300 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#6D5CF2]" />
                  </label>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="text-xs">
                  <div className="font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                    Browser Service Worker Status
                  </div>
                  <div className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] mt-0.5">
                    Permission: <strong className="uppercase">{pushPermissionStatus}</strong> · Service Worker: <strong className="text-emerald-600 dark:text-emerald-400">/sw.js Active</strong>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  {pushPermissionStatus !== 'granted' && (
                    <button
                      type="button"
                      onClick={() => requestPushPermission()}
                      className="flex-1 sm:flex-none px-3.5 py-2 rounded-xl text-xs font-bold bg-[#6D5CF2] hover:bg-[#5b4be0] text-white shadow-sm transition-all cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <Bell className="w-3.5 h-3.5" />
                      <span>Enable on this terminal</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => sendTestPushNotification()}
                    className="flex-1 sm:flex-none px-3.5 py-2 rounded-xl text-xs font-bold bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] hover:bg-[#E2DEFF] dark:hover:bg-[#343468] transition-all cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Send Broadcast Test Push</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Save Bar Footer (for system parameters) */}
        {activeTab !== 'groups' && activeTab !== 'billing' && activeTab !== 'staff' && (
          <div className="p-4 rounded-2xl bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] flex items-center justify-between gap-4">
            <div className="text-xs text-[#666A86] dark:text-[#A9ACC8]">
              Last saved: <span className="font-semibold text-[#1D1B3A] dark:text-[#F2F2FA]">{lastSavedTime}</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleReset}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSyncingSystemSettings}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-[#6D5CF2] hover:bg-[#5b4be0] text-white flex items-center gap-1.5 shadow-sm transition-all cursor-pointer disabled:opacity-60"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSyncingSystemSettings ? 'Saving...' : 'Save System Settings'}</span>
              </button>
            </div>
          </div>
        )}
      </form>

      {/* TAB: Church Staff & RBAC Provisioning */}
      {activeTab === 'staff' && (
        <div className="animate-in fade-in duration-200">
          <UserManagement />
        </div>
      )}

      {/* TAB 7: Plan Status, Free Trial Countdown & Self-Service Upgrade */}
      {activeTab === 'billing' && (
        <div className="space-y-5 animate-in fade-in duration-200">
          {/* Current Subscription Banner */}
          <div className="bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl p-5 sm:p-7 border border-[#E9EBF5] dark:border-[#2D2D55] shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#E9EBF5] dark:border-[#2D2D55]">
              <div>
                <h3 className="text-base font-extrabold text-[#1D1B3A] dark:text-[#F2F2FA] flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-[#6D5CF2]" />
                  <span>Organisation Subscription &amp; Trial Status</span>
                </h3>
                <p className="text-xs text-[#666A86] dark:text-[#A9ACC8] mt-0.5">
                  Start with a 14-day free trial and upgrade your edition or billing cycle anytime without losing church data.
                </p>
              </div>
              {licenseEval && (
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wide shrink-0 ${
                    licenseEval.status === 'active'
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                      : licenseEval.status === 'trial'
                      ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                      : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                  }`}
                >
                  {licenseEval.status === 'trial'
                    ? `Free Trial · ${licenseEval.daysRemaining ?? 0}d left`
                    : licenseEval.status}
                </span>
              )}
            </div>

            {isLoadingBilling ? (
              <div className="text-xs text-[#666A86] dark:text-[#A9ACC8] py-4">
                Loading live subscription limits...
              </div>
            ) : licenseEval ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3.5 rounded-2xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55]">
                  <span className="text-[#666A86] dark:text-[#A9ACC8] block">Current Edition</span>
                  <strong className="text-sm font-extrabold text-[#1D1B3A] dark:text-white capitalize">
                    {(licenseEval.tier || 'grace_starter').replace(/_/g, ' ')}
                  </strong>
                </div>
                <div className="p-3.5 rounded-2xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55]">
                  <span className="text-[#666A86] dark:text-[#A9ACC8] block">Member Seats</span>
                  <strong className="text-sm font-extrabold text-[#1D1B3A] dark:text-white">
                    {licenseEval.seatsUsed} / {licenseEval.seatsLimit}
                  </strong>
                </div>
                <div className="p-3.5 rounded-2xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55]">
                  <span className="text-[#666A86] dark:text-[#A9ACC8] block">Campus Sites</span>
                  <strong className="text-sm font-extrabold text-[#1D1B3A] dark:text-white">
                    {licenseEval.sitesUsed} / {licenseEval.sitesLimit}
                  </strong>
                </div>
                <div className="p-3.5 rounded-2xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55]">
                  <span className="text-[#666A86] dark:text-[#A9ACC8] block">Renewal / Trial End</span>
                  <strong className="text-sm font-extrabold text-[#1D1B3A] dark:text-white">
                    {licenseEval.expiresDate || currentLicense?.expiresDate || '—'}
                  </strong>
                </div>
              </div>
            ) : (
              <div className="text-xs text-[#666A86] dark:text-[#A9ACC8]">
                Sign in with an organisation administrator account to view live licensing details.
              </div>
            )}
          </div>

          {/* Self-Service Plan Upgrade Form */}
          <form
            onSubmit={handleUpgradePlan}
            className="bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl p-5 sm:p-7 border border-[#E9EBF5] dark:border-[#2D2D55] shadow-xs space-y-5"
          >
            <div>
              <h4 className="text-sm font-extrabold text-[#1D1B3A] dark:text-[#F2F2FA]">
                Upgrade or Activate Paid License
              </h4>
              <p className="text-xs text-[#666A86] dark:text-[#A9ACC8] mt-0.5">
                Choose the plan tier that matches your congregation size and record your Mobile Money or Bank payment reference to activate immediately.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              {(billingPlans.length > 0
                ? billingPlans
                : [
                    {
                      id: 'grace_starter' as LicenseTier,
                      name: 'Grace Starter',
                      description: 'Single-campus sanctuaries up to 250 members.',
                      monthlyCostUSD: 19,
                      annualCostUSD: 180,
                      seatsLimit: 250,
                      sitesLimit: 1,
                    },
                    {
                      id: 'ministry_pro' as LicenseTier,
                      name: 'Ministry Pro',
                      description: 'Pastoral care, SMS/Push alerts, BLE beacons & MoMo giving.',
                      monthlyCostUSD: 49,
                      annualCostUSD: 480,
                      seatsLimit: 800,
                      sitesLimit: 3,
                    },
                    {
                      id: 'cathedral_enterprise' as LicenseTier,
                      name: 'Cathedral Enterprise',
                      description: 'Multi-campus governance, custom domains & audit SLA.',
                      monthlyCostUSD: 119,
                      annualCostUSD: 1200,
                      seatsLimit: 2500,
                      sitesLimit: 15,
                    },
                  ]
              ).map((plan) => {
                const selected = upgradeTier === plan.id;
                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => setUpgradeTier(plan.id)}
                    className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                      selected
                        ? 'bg-[#EFEDFF]/80 dark:bg-[#24204E] border-[#6D5CF2] shadow-sm'
                        : 'bg-[#F6F7FC] dark:bg-[#14142E] border-[#E9EBF5] dark:border-[#2D2D55] hover:border-[#6D5CF2]/50'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-extrabold text-sm text-[#1D1B3A] dark:text-white">
                          {plan.name}
                        </span>
                        {selected && <CheckCircle2 className="w-4 h-4 text-[#6D5CF2] shrink-0" />}
                      </div>
                      <p className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] mt-1">
                        {plan.description}
                      </p>
                    </div>
                    <div className="pt-2 border-t border-slate-200/60 dark:border-white/10">
                      <div className="text-sm font-black text-[#6D5CF2] dark:text-[#A594FD]">
                        ${upgradeCycle === 'monthly' ? plan.monthlyCostUSD : plan.annualCostUSD}{' '}
                        <span className="text-[11px] font-semibold text-[#666A86] dark:text-[#A9ACC8]">
                          / {upgradeCycle === 'monthly' ? 'month' : 'year'}
                        </span>
                      </div>
                      <div className="text-[10px] text-[#666A86] dark:text-[#A9ACC8] mt-0.5">
                        Up to {plan.seatsLimit.toLocaleString()} seats · {plan.sitesLimit} campus site(s)
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                  Billing Cycle
                </label>
                <select
                  value={upgradeCycle}
                  onChange={(e) => setUpgradeCycle(e.target.value as BillingCycle)}
                  className="w-full px-3 py-2 rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] font-semibold"
                >
                  <option value="monthly">Monthly</option>
                  <option value="annual">Annual (Best Value)</option>
                  <option value="lifetime">Lifetime Sanctuary</option>
                </select>
              </div>
              <div>
                <label className="block font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                  Payment Method
                </label>
                <select
                  value={upgradeMethod}
                  onChange={(e) => setUpgradeMethod(e.target.value as PaymentMethod)}
                  className="w-full px-3 py-2 rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] font-semibold"
                >
                  <option value="momo">Mobile Money (MTN / Telecel / AT)</option>
                  <option value="bank">Bank Transfer / Card</option>
                  <option value="cash">Church Office Settlement</option>
                </select>
              </div>
              <div>
                <label className="block font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                  Transaction Reference *
                </label>
                <input
                  type="text"
                  required
                  value={upgradeReference}
                  onChange={(e) => setUpgradeReference(e.target.value)}
                  placeholder="e.g. MOMO-983412 or INV-2026"
                  className="w-full px-3 py-2 rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] font-mono"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isUpgradingPlan}
                className="px-5 py-2.5 rounded-xl bg-[#6D5CF2] hover:bg-[#5b4be0] disabled:opacity-60 text-white text-xs font-extrabold shadow-md shadow-[#6D5CF2]/25 flex items-center gap-2 cursor-pointer transition-all"
              >
                <Sparkles className="w-4 h-4" />
                <span>{isUpgradingPlan ? 'Activating Plan...' : 'Upgrade & Activate Plan'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 1: Add / Edit Church Group */}
      {isGroupModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
        >
          <div
            className="bg-white dark:bg-[#1D1D3D] rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-[#E9EBF5] dark:border-[#2D2D55] animate-in zoom-in-95 duration-150 my-auto max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#E9EBF5] dark:border-[#2D2D55]">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                  {editingGroupId ? 'Edit Congregational Group' : 'Add New Congregational Group'}
                </h3>
                <p className="text-xs text-[#666A86] dark:text-[#A9ACC8]">
                  Set leadership, schedule, meeting venue, and group classification.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsGroupModalOpen(false)}
                className="p-1.5 rounded-xl text-[#666A86] dark:text-[#A9ACC8] hover:bg-slate-100 dark:hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveGroup} className="space-y-4 text-xs">
              {/* Category Selection Cards */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label className="block font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                    Group Category <span className="text-rose-500">*</span>
                  </label>
                  {isSettingsAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowInlineCategoryCreator((prev) => !prev);
                        setInlineCatError(null);
                      }}
                      className="text-[11px] font-bold text-[#6D5CF2] dark:text-[#8C7DFF] hover:underline inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>{showInlineCategoryCreator ? 'Close Category Form' : 'Create New Category'}</span>
                    </button>
                  )}
                </div>

                {showInlineCategoryCreator && isSettingsAdmin && (
                  <div className="mb-3 p-3 rounded-2xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#6D5CF2]/40 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                        Quick Create Custom Category
                      </span>
                      <div className="flex items-center gap-1 flex-wrap">
                        {CUSTOM_GROUP_CATEGORY_PRESETS.filter(
                          (p) => !customGroupCategories.some((c) => c.id === normalizeGroupCategorySlug(p.label))
                        )
                          .slice(0, 2)
                          .map((preset) => (
                            <button
                              key={preset.label}
                              type="button"
                              onClick={() => {
                                setInlineCatLabel(preset.label);
                                setInlineCatDesc(preset.description);
                                setInlineCatColor(preset.color);
                                setInlineCatError(null);
                              }}
                              className="px-2 py-0.5 rounded-lg bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[10px] font-semibold text-[#6D5CF2] dark:text-[#8C7DFF] hover:border-[#6D5CF2] cursor-pointer"
                            >
                              + {preset.label}
                            </button>
                          ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="text"
                        placeholder="Category Name (e.g. Department, Month Born)"
                        value={inlineCatLabel}
                        onChange={(e) => {
                          setInlineCatLabel(e.target.value);
                          setInlineCatError(null);
                        }}
                        className="w-full px-2.5 py-1.5 rounded-xl bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-xs text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                      />
                      <input
                        type="text"
                        placeholder="Short Subtitle (e.g. Birth Month Wing)"
                        value={inlineCatDesc}
                        onChange={(e) => setInlineCatDesc(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-xl bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-xs text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                      />
                    </div>

                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-semibold text-[#666A86] dark:text-[#A9ACC8]">
                          Color:
                        </span>
                        {GROUP_CATEGORY_COLOR_OPTIONS.map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setInlineCatColor(opt.id)}
                            title={opt.label}
                            className={`w-4 h-4 rounded-full ${opt.swatchClass} cursor-pointer transition-transform ${
                              inlineCatColor === opt.id
                                ? 'ring-2 ring-offset-1 ring-[#6D5CF2] scale-110'
                                : 'opacity-70 hover:opacity-100'
                            }`}
                          />
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={handleInlineCreateCategory}
                        disabled={isSavingInlineCat}
                        className="px-3 py-1 rounded-lg bg-[#6D5CF2] hover:bg-[#5b4be0] text-white text-[11px] font-bold cursor-pointer disabled:opacity-60"
                      >
                        {isSavingInlineCat ? 'Saving...' : 'Save Category'}
                      </button>
                    </div>
                    {inlineCatError && (
                      <p className="text-[10px] text-rose-500 font-semibold">{inlineCatError}</p>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {allGroupCategories.map((cat) => {
                    const styles = getGroupCategoryStyles(cat.color);
                    const selected = groupCategory === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => {
                          setGroupCategory(cat.id);
                          if (groupErrors.category || groupErrors.form) {
                            setGroupErrors((prev) => {
                              const { category: _c, form: _f, ...rest } = prev;
                              return rest;
                            });
                          }
                        }}
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                          selected
                            ? styles.modalCardActiveClass
                            : 'bg-[#F6F7FC] dark:bg-[#14142E] border-[#E9EBF5] dark:border-[#2D2D55] text-[#666A86] dark:text-[#A9ACC8]'
                        }`}
                      >
                        <div className="font-bold flex items-center justify-between gap-1">
                          <span className="truncate">{cat.label}</span>
                          {selected && <Check className={`w-3.5 h-3.5 shrink-0 ${styles.modalCheckClass}`} />}
                        </div>
                        <div className="text-[10px] mt-0.5 opacity-80 truncate">
                          {cat.description || (cat.isBuiltIn ? cat.label : 'Custom Category')}
                        </div>
                      </button>
                    );
                  })}
                </div>
                {groupErrors.category && (
                  <p className="text-[11px] text-rose-600 dark:text-rose-400 font-semibold mt-1.5">
                    {groupErrors.category}
                  </p>
                )}
              </div>

              {/* Group Name */}
              <div>
                <label className="block font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                  Group / Ministry Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Choir & Music Ministry, Men’s Fellowship, Home Cell"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border ${
                    groupErrors.name ? 'border-rose-500' : 'border-[#E9EBF5] dark:border-[#2D2D55]'
                  } text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]`}
                />
                {groupErrors.name && <p className="text-[10px] text-rose-500 mt-1">{groupErrors.name}</p>}
              </div>

              {/* Leaders Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="relative">
                  <label className="block font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                    Primary Leader Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    role="combobox"
                    aria-expanded={leaderDropdownOpen}
                    aria-autocomplete="list"
                    aria-controls="primary-leader-member-listbox"
                    placeholder="Search enrolled member by name, ID, or phone..."
                    value={groupLeader}
                    onFocus={() => {
                      setLeaderDropdownOpen(true);
                      setLeaderHighlightIdx(0);
                    }}
                    onBlur={() => {
                      setTimeout(() => setLeaderDropdownOpen(false), 150);
                    }}
                    onChange={(e) => {
                      const nextVal = e.target.value;
                      setGroupLeader(nextVal);
                      const exactMatch = resolveMemberLeaderInput(members, {
                        inputName: nextVal,
                        requireMatch: true,
                      });
                      if (exactMatch.status === 'matched' && exactMatch.member) {
                        setGroupLeaderMemberId(exactMatch.member.id);
                        if (!groupLeaderPhone.trim() && exactMatch.member.phoneE164) {
                          setGroupLeaderPhone(exactMatch.member.phoneE164);
                        }
                        if (!groupLeaderEmail.trim() && exactMatch.member.email) {
                          setGroupLeaderEmail(exactMatch.member.email);
                        }
                      } else {
                        setGroupLeaderMemberId('');
                      }
                      setLeaderDropdownOpen(true);
                      setLeaderHighlightIdx(0);
                      if (groupErrors.leader || groupErrors.form) {
                        setGroupErrors((prev) => {
                          const { leader: _l, form: _f, ...rest } = prev;
                          return rest;
                        });
                      }
                    }}
                    onKeyDown={(e) => {
                      if (!leaderDropdownOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
                        setLeaderDropdownOpen(true);
                        return;
                      }
                      if (!leaderDropdownOpen) return;
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setLeaderHighlightIdx((prev) =>
                          primaryLeaderSuggestions.length > 0
                            ? (prev + 1) % primaryLeaderSuggestions.length
                            : 0
                        );
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setLeaderHighlightIdx((prev) =>
                          primaryLeaderSuggestions.length > 0
                            ? (prev - 1 + primaryLeaderSuggestions.length) %
                              primaryLeaderSuggestions.length
                            : 0
                        );
                      } else if (e.key === 'Enter' && primaryLeaderSuggestions.length > 0) {
                        const target = primaryLeaderSuggestions[leaderHighlightIdx];
                        if (target) {
                          e.preventDefault();
                          handleSelectPrimaryLeader(target);
                        }
                      } else if (e.key === 'Escape') {
                        setLeaderDropdownOpen(false);
                      }
                    }}
                    autoComplete="off"
                    className={`w-full px-3 py-2 rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border ${
                      groupErrors.leader ||
                      (groupLeader.trim() && !leaderDropdownOpen && primaryLeaderResolution.status !== 'matched')
                        ? 'border-rose-500'
                        : primaryLeaderResolution.status === 'matched'
                        ? 'border-emerald-500/80'
                        : 'border-[#E9EBF5] dark:border-[#2D2D55]'
                    } text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]`}
                  />

                  {leaderDropdownOpen && (
                    <div
                      id="primary-leader-member-listbox"
                      role="listbox"
                      className="absolute left-0 right-0 top-[62px] z-30 max-h-52 overflow-y-auto rounded-xl bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] shadow-xl p-1 space-y-0.5"
                    >
                      {members.length === 0 ? (
                        <div className="p-2.5 text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
                          No enrolled members found yet. Add members in Directory first.
                        </div>
                      ) : primaryLeaderSuggestions.length === 0 ? (
                        <div className="p-2.5 text-[11px] text-rose-600 dark:text-rose-400">
                          No member matches "{groupLeader}". Only enrolled members can lead groups.
                        </div>
                      ) : (
                        primaryLeaderSuggestions.map((m, idx) => {
                          const fullName = getMemberFullName(m);
                          const memberCode = getCanonicalMemberId(m);
                          const isSelected = primaryLeaderResolution.member?.id === m.id;
                          return (
                            <button
                              key={m.id}
                              type="button"
                              role="option"
                              aria-selected={isSelected}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                handleSelectPrimaryLeader(m);
                              }}
                              className={`w-full px-2.5 py-2 rounded-lg text-left flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                                idx === leaderHighlightIdx || isSelected
                                  ? 'bg-[#EFEDFF] dark:bg-[#2A2A55]'
                                  : 'hover:bg-[#F6F7FC] dark:hover:bg-[#14142E]'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <MemberAvatar
                                  src={m.imageUrl}
                                  name={fullName}
                                  initials={m.avatarInitials}
                                  sizeClass="w-6 h-6"
                                  textClass="text-[9px] font-bold"
                                />
                                <div className="min-w-0">
                                  <div className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] truncate">
                                    {fullName}
                                  </div>
                                  <div className="text-[10px] text-[#666A86] dark:text-[#A9ACC8] truncate">
                                    {m.department || m.homeCellGroup || m.groupName || 'Congregation'}
                                    {m.phoneE164 ? ` · ${m.phoneE164}` : ''}
                                  </div>
                                </div>
                              </div>
                              <span className="font-mono text-[10px] text-[#6D5CF2] dark:text-[#8C7DFF] whitespace-nowrap shrink-0 tabular-nums">
                                {memberCode}
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}

                  {primaryLeaderResolution.status === 'matched' && primaryLeaderResolution.member ? (
                    <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1 tabular-nums">
                      <UserCheck className="w-3 h-3 shrink-0" />
                      <span>
                        Verified member · <span className="font-mono">{getCanonicalMemberId(primaryLeaderResolution.member)}</span>
                      </span>
                    </p>
                  ) : groupErrors.leader ? (
                    <p className="text-[10px] text-rose-500 mt-1">{groupErrors.leader}</p>
                  ) : groupLeader.trim() ? (
                    <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">
                      Select an enrolled member from the directory dropdown to validate.
                    </p>
                  ) : (
                    <p className="text-[10px] text-[#666A86] dark:text-[#A9ACC8] mt-1">
                      Must match a member in your directory ({members.length} enrolled).
                    </p>
                  )}
                </div>

                <div>
                  <label className="block font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                    Leader Phone (Ghana / International)
                  </label>
                  <input
                    type="text"
                    placeholder="+233 24 111 2233"
                    value={groupLeaderPhone}
                    onChange={(e) => setGroupLeaderPhone(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                    Leader Email (Optional)
                  </label>
                  <input
                    type="email"
                    placeholder="leader@church.org"
                    value={groupLeaderEmail}
                    onChange={(e) => setGroupLeaderEmail(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                  />
                </div>

                <div className="relative">
                  <label className="block font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                    Assistant / Co-Leader (Optional)
                  </label>
                  <input
                    type="text"
                    role="combobox"
                    aria-expanded={assistantDropdownOpen}
                    aria-autocomplete="list"
                    aria-controls="assistant-leader-member-listbox"
                    placeholder="Search enrolled member (or leave blank)"
                    value={groupAssistant}
                    onFocus={() => {
                      setAssistantDropdownOpen(true);
                      setAssistantHighlightIdx(0);
                    }}
                    onBlur={() => {
                      setTimeout(() => setAssistantDropdownOpen(false), 150);
                    }}
                    onChange={(e) => {
                      const nextVal = e.target.value;
                      setGroupAssistant(nextVal);
                      if (!nextVal.trim()) {
                        setGroupAssistantMemberId('');
                      } else {
                        const exactMatch = resolveMemberLeaderInput(members, {
                          inputName: nextVal,
                          requireMatch: false,
                        });
                        setGroupAssistantMemberId(
                          exactMatch.status === 'matched' && exactMatch.member
                            ? exactMatch.member.id
                            : ''
                        );
                      }
                      setAssistantDropdownOpen(true);
                      setAssistantHighlightIdx(0);
                      if (groupErrors.assistantLeader || groupErrors.form) {
                        setGroupErrors((prev) => {
                          const { assistantLeader: _a, form: _f, ...rest } = prev;
                          return rest;
                        });
                      }
                    }}
                    onKeyDown={(e) => {
                      if (!assistantDropdownOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
                        setAssistantDropdownOpen(true);
                        return;
                      }
                      if (!assistantDropdownOpen) return;
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setAssistantHighlightIdx((prev) =>
                          assistantLeaderSuggestions.length > 0
                            ? (prev + 1) % assistantLeaderSuggestions.length
                            : 0
                        );
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setAssistantHighlightIdx((prev) =>
                          assistantLeaderSuggestions.length > 0
                            ? (prev - 1 + assistantLeaderSuggestions.length) %
                              assistantLeaderSuggestions.length
                            : 0
                        );
                      } else if (e.key === 'Enter' && assistantLeaderSuggestions.length > 0) {
                        const target = assistantLeaderSuggestions[assistantHighlightIdx];
                        if (target) {
                          e.preventDefault();
                          handleSelectAssistantLeader(target);
                        }
                      } else if (e.key === 'Escape') {
                        setAssistantDropdownOpen(false);
                      }
                    }}
                    autoComplete="off"
                    className={`w-full px-3 py-2 rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border ${
                      groupErrors.assistantLeader
                        ? 'border-rose-500'
                        : assistantLeaderResolution.status === 'matched'
                        ? 'border-emerald-500/80'
                        : 'border-[#E9EBF5] dark:border-[#2D2D55]'
                    } text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]`}
                  />

                  {assistantDropdownOpen && (
                    <div
                      id="assistant-leader-member-listbox"
                      role="listbox"
                      className="absolute left-0 right-0 top-[62px] z-30 max-h-48 overflow-y-auto rounded-xl bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] shadow-xl p-1 space-y-0.5"
                    >
                      {members.length === 0 ? (
                        <div className="p-2.5 text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
                          No enrolled members available yet.
                        </div>
                      ) : assistantLeaderSuggestions.length === 0 ? (
                        <div className="p-2.5 text-[11px] text-rose-600 dark:text-rose-400">
                          No other member matches "{groupAssistant}".
                        </div>
                      ) : (
                        assistantLeaderSuggestions.map((m, idx) => {
                          const fullName = getMemberFullName(m);
                          const memberCode = getCanonicalMemberId(m);
                          const isSelected = assistantLeaderResolution.member?.id === m.id;
                          return (
                            <button
                              key={m.id}
                              type="button"
                              role="option"
                              aria-selected={isSelected}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                handleSelectAssistantLeader(m);
                              }}
                              className={`w-full px-2.5 py-2 rounded-lg text-left flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                                idx === assistantHighlightIdx || isSelected
                                  ? 'bg-[#EFEDFF] dark:bg-[#2A2A55]'
                                  : 'hover:bg-[#F6F7FC] dark:hover:bg-[#14142E]'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <MemberAvatar
                                  src={m.imageUrl}
                                  name={fullName}
                                  initials={m.avatarInitials}
                                  sizeClass="w-6 h-6"
                                  textClass="text-[9px] font-bold"
                                />
                                <div className="min-w-0">
                                  <div className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] truncate">
                                    {fullName}
                                  </div>
                                  <div className="text-[10px] text-[#666A86] dark:text-[#A9ACC8] truncate">
                                    {m.department || m.homeCellGroup || m.groupName || 'Congregation'}
                                  </div>
                                </div>
                              </div>
                              <span className="font-mono text-[10px] text-[#6D5CF2] dark:text-[#8C7DFF] whitespace-nowrap shrink-0 tabular-nums">
                                {memberCode}
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}

                  {assistantLeaderResolution.status === 'matched' && assistantLeaderResolution.member ? (
                    <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1 tabular-nums">
                      <UserCheck className="w-3 h-3 shrink-0" />
                      <span>
                        Verified member · <span className="font-mono">{getCanonicalMemberId(assistantLeaderResolution.member)}</span>
                      </span>
                    </p>
                  ) : groupErrors.assistantLeader ? (
                    <p className="text-[10px] text-rose-500 mt-1">{groupErrors.assistantLeader}</p>
                  ) : groupAssistant.trim() ? (
                    <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">
                      Select an enrolled member or clear to remove assistant leader.
                    </p>
                  ) : null}
                </div>
              </div>

              {editingGroupId && hasLeadershipChangedInModal && (
                <div>
                  <label className="block font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                    Reason / Note for Leadership Change (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Annual leadership rotation, handover, new appointment"
                    value={leaderChangeReason}
                    onChange={(e) => setLeaderChangeReason(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#6D5CF2]/40 text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                  />
                  <p className="text-[10px] text-[#666A86] dark:text-[#A9ACC8] mt-1">
                    Recorded permanently in the Leadership Change History for{' '}
                    {getGroupCategoryMeta(groupCategory, customGroupCategories).pluralLabel ||
                      getGroupCategoryMeta(groupCategory, customGroupCategories).label}.
                  </p>
                </div>
              )}

              {/* Schedule Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                    Meeting Day / Frequency
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Wednesdays, Every 2nd Saturday"
                    value={groupDay}
                    onChange={(e) => setGroupDay(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                  />
                </div>

                <div>
                  <label className="block font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                    Meeting Time Window
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 18:30 - 19:45, 08:00 - 10:00"
                    value={groupTime}
                    onChange={(e) => setGroupTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                  />
                </div>
              </div>

              {/* Meeting Location */}
              <div>
                <label className="block font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                  Meeting Location / Venue Address
                </label>
                <input
                  type="text"
                  placeholder="e.g. Main Sanctuary Hall, Home Cell Venue, Online / Hybrid"
                  value={groupLocation}
                  onChange={(e) => setGroupLocation(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                />
              </div>

              {/* Demographic / Target focus */}
              <div>
                <label className="block font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                  Target Audience / Demographics Focus
                </label>
                <input
                  type="text"
                  placeholder="e.g. Vocalists, Married couples, Young Adults (Ages 18-35)"
                  value={groupDemographic}
                  onChange={(e) => setGroupDemographic(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                  Purpose & Description
                </label>
                <textarea
                  rows={2}
                  placeholder="Describe the mission, objectives, or activities of this group..."
                  value={groupDescription}
                  onChange={(e) => setGroupDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                />
              </div>

              {/* Active Toggle */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="groupActiveToggle"
                  checked={groupActive}
                  onChange={(e) => setGroupActive(e.target.checked)}
                  className="w-4 h-4 rounded text-[#6D5CF2] focus:ring-[#6D5CF2] cursor-pointer"
                />
                <label htmlFor="groupActiveToggle" className="text-xs font-semibold text-[#1D1B3A] dark:text-[#F2F2FA] cursor-pointer">
                  Group is actively meeting and available in roster selectors
                </label>
              </div>

              {(groupErrors.form || groupErrors.category) && (
                <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-[11px] font-semibold text-rose-700 dark:text-rose-300">
                  {groupErrors.form || groupErrors.category}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#E9EBF5] dark:border-[#2D2D55]">
                <button
                  type="button"
                  onClick={() => setIsGroupModalOpen(false)}
                  disabled={isSavingGroup}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-white disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingGroup}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-[#6D5CF2] hover:bg-[#5b4be0] text-white shadow-sm flex items-center gap-1.5 cursor-pointer active:scale-95 disabled:opacity-60 whitespace-nowrap"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>
                    {isSavingGroup
                      ? 'Validating & Saving...'
                      : editingGroupId
                      ? 'Update Group'
                      : 'Save Group'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: View Enrolled Members in Group */}
      {viewingMembersGroup && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
        >
          <div
            className="bg-white dark:bg-[#1D1D3D] rounded-3xl max-w-xl w-full p-5 sm:p-6 shadow-2xl border border-[#E9EBF5] dark:border-[#2D2D55] animate-in zoom-in-95 duration-150 my-auto max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-[#E9EBF5] dark:border-[#2D2D55]">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  {(() => {
                    const meta = getGroupCategoryMeta(viewingMembersGroup.category, customGroupCategories);
                    const styles = getGroupCategoryStyles(meta.color);
                    return (
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${styles.badgeClass}`}
                      >
                        {meta.label}
                      </span>
                    );
                  })()}
                  <span className="text-xs text-[#666A86] dark:text-[#A9ACC8]">·</span>
                  <span className="text-xs text-[#666A86] dark:text-[#A9ACC8]">
                    Leader: <strong className="text-[#1D1B3A] dark:text-[#F2F2FA]">{viewingMembersGroup.leaderName}</strong>
                  </span>
                </div>
                <h3 className="text-base sm:text-lg font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                  {viewingMembersGroup.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setViewingMembersGroup(null)}
                className="p-1.5 rounded-xl text-[#666A86] dark:text-[#A9ACC8] hover:bg-slate-100 dark:hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body / Members List */}
            <div className="flex-1 overflow-y-auto py-4 space-y-2.5">
              <div className="text-xs font-semibold text-[#666A86] dark:text-[#A9ACC8] flex items-center justify-between">
                <span>Enrolled Congregation Members</span>
                <span className="font-bold text-[#6D5CF2] dark:text-[#8C7DFF]">
                  {getGroupMembers(viewingMembersGroup.name).length} members
                </span>
              </div>

              {getGroupMembers(viewingMembersGroup.name).length > 0 ? (
                <div className="space-y-2">
                  {getGroupMembers(viewingMembersGroup.name).map((m) => (
                    <div
                      key={m.id}
                      className="p-3 rounded-2xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <MemberAvatar
                          src={m.imageUrl}
                          name={`${m.firstName} ${m.lastName}`}
                          initials={m.avatarInitials}
                          sizeClass="w-8 h-8"
                          textClass="text-xs font-bold"
                        />
                        <div className="min-w-0 truncate">
                          <div className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] truncate">
                            {m.firstName} {m.lastName} {m.preferredName ? `(${m.preferredName})` : ''}
                          </div>
                          <div className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] font-mono">
                            {m.phoneE164}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 text-right">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold capitalize ${
                            m.status === 'member'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                          }`}
                        >
                          {m.status}
                        </span>
                        <span
                          className={`text-[10px] font-bold ${
                            m.autoCheckinOptedIn
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-slate-400'
                          }`}
                        >
                          {m.autoCheckinOptedIn ? 'Auto In' : 'Manual'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center bg-[#F6F7FC] dark:bg-[#14142E] rounded-2xl p-6 border border-[#E9EBF5] dark:border-[#2D2D55]">
                  <Users className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                  <p className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                    No members currently assigned to {viewingMembersGroup.name}
                  </p>
                  <p className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] mt-1 max-w-xs mx-auto">
                    {isMonthBornCategory(viewingMembersGroup.category)
                      ? `Members whose Date of Birth or Month of Birth matches ${viewingMembersGroup.birthMonthName || viewingMembersGroup.name} are automatically assigned here.`
                      : 'You can assign members to this group when registering new members or editing existing members in the Roster.'}
                  </p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="pt-3 border-t border-[#E9EBF5] dark:border-[#2D2D55] flex items-center justify-between">
              <span className="text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
                Meeting Day: <strong className="text-[#1D1B3A] dark:text-[#F2F2FA]">{viewingMembersGroup.meetingDay || 'Not set'}</strong>
              </span>
              <button
                type="button"
                onClick={() => setViewingMembersGroup(null)}
                className="px-4 py-1.5 rounded-xl text-xs font-bold bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] hover:bg-[#6D5CF2] hover:text-white transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Create & Manage Congregational Group Categories */}
      {isCategoryModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
        >
          <div
            className="bg-white dark:bg-[#1D1D3D] rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-[#E9EBF5] dark:border-[#2D2D55] animate-in zoom-in-95 duration-150 my-auto max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#E9EBF5] dark:border-[#2D2D55]">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                  {editingCategoryId ? 'Edit Group Category' : 'Manage Group Categories'}
                </h3>
                <p className="text-xs text-[#666A86] dark:text-[#A9ACC8]">
                  Create distinct categories such as Departments, Month Born groups, or Age Bands.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCategoryModalOpen(false)}
                className="p-1.5 rounded-xl text-[#666A86] dark:text-[#A9ACC8] hover:bg-slate-100 dark:hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCustomCategory} className="space-y-3.5 text-xs pb-5 border-b border-[#E9EBF5] dark:border-[#2D2D55]">
              {!editingCategoryId && (
                <div>
                  <span className="block text-[11px] font-semibold text-[#666A86] dark:text-[#A9ACC8] mb-1.5">
                    Quick Templates
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {CUSTOM_GROUP_CATEGORY_PRESETS.map((preset) => {
                      const slug = normalizeGroupCategorySlug(preset.label);
                      const alreadyAdded = customGroupCategories.some((c) => c.id === slug);
                      return (
                        <button
                          key={preset.label}
                          type="button"
                          disabled={alreadyAdded}
                          onClick={() => {
                            setCatLabel(preset.label);
                            setCatPluralLabel(preset.pluralLabel);
                            setCatDescription(preset.description);
                            setCatColor(preset.color);
                            setCatError(null);
                          }}
                          className={`px-2.5 py-1 rounded-xl border text-[11px] font-semibold transition-colors ${
                            alreadyAdded
                              ? 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-400 cursor-not-allowed'
                              : 'bg-[#F6F7FC] dark:bg-[#14142E] border-[#E9EBF5] dark:border-[#2D2D55] text-[#6D5CF2] dark:text-[#8C7DFF] hover:border-[#6D5CF2] cursor-pointer'
                          }`}
                        >
                          {alreadyAdded ? `✓ ${preset.label}` : `+ ${preset.label}`}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                    Category Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Department, Month Born"
                    value={catLabel}
                    onChange={(e) => {
                      const next = e.target.value;
                      setCatLabel(next);
                      if (!editingCategoryId && !catPluralLabel.trim()) {
                        setCatPluralLabel('');
                      }
                      setCatError(null);
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                  />
                </div>

                <div>
                  <label className="block font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                    Plural Tab Label
                  </label>
                  <input
                    type="text"
                    placeholder={catLabel ? pluralizeCategoryLabel(catLabel) : 'e.g. Departments'}
                    value={catPluralLabel}
                    onChange={(e) => setCatPluralLabel(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                  Description / Classification Note
                </label>
                <input
                  type="text"
                  placeholder="e.g. Operational department unit or Birth-month fellowship"
                  value={catDescription}
                  onChange={(e) => setCatDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                />
              </div>

              <div>
                <span className="block font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1.5">
                  Accent Color
                </span>
                <div className="flex items-center gap-2 flex-wrap">
                  {GROUP_CATEGORY_COLOR_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setCatColor(opt.id)}
                      className={`px-2.5 py-1 rounded-xl border text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer transition-colors ${
                        catColor === opt.id
                          ? 'bg-[#EFEDFF] dark:bg-[#2A2A55] border-[#6D5CF2] text-[#6D5CF2] dark:text-[#8C7DFF]'
                          : 'bg-[#F6F7FC] dark:bg-[#14142E] border-[#E9EBF5] dark:border-[#2D2D55] text-[#666A86] dark:text-[#A9ACC8]'
                      }`}
                    >
                      <span className={`w-2.5 h-2.5 rounded-full ${opt.swatchClass}`} />
                      <span>{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {catError && (
                <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-[11px] font-semibold text-rose-700 dark:text-rose-300">
                  {catError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                {editingCategoryId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCategoryId(null);
                      setCatLabel('');
                      setCatPluralLabel('');
                      setCatDescription('');
                      setCatColor('violet');
                      setCatError(null);
                    }}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-white cursor-pointer"
                  >
                    Cancel Edit
                  </button>
                )}
                <button
                  type="submit"
                  disabled={isSavingCategory}
                  className="px-4 py-2 rounded-xl bg-[#6D5CF2] hover:bg-[#5b4be0] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>
                    {isSavingCategory
                      ? 'Saving...'
                      : editingCategoryId
                      ? 'Update Category'
                      : 'Create Category'}
                  </span>
                </button>
              </div>
            </form>

            {/* Configured Categories Directory */}
            <div className="pt-4 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                  Configured Categories ({allGroupCategories.length})
                </span>
                <span className="text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
                  Synced to Supabase
                </span>
              </div>

              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {allGroupCategories.map((cat) => {
                  const styles = getGroupCategoryStyles(cat.color);
                  const dbGroupCount = churchGroups.filter((g) => g.category === cat.id).length;
                  const count = effectiveChurchGroups.filter((g) => g.category === cat.id).length;
                  const isCustomConfigured = customGroupCategories.some((c) => c.id === cat.id);

                  return (
                    <div
                      key={cat.id}
                      className="p-2.5 rounded-2xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] flex items-center justify-between gap-2.5"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${styles.badgeClass}`}>
                            {cat.label}
                          </span>
                          <span className="text-[11px] font-mono text-[#666A86] dark:text-[#A9ACC8] tabular-nums">
                            {isMonthBornCategory(cat.id)
                              ? `12 auto groups (${dbGroupCount} custom)`
                              : `${count} ${count === 1 ? 'group' : 'groups'}`}
                          </span>
                        </div>
                        <div className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] mt-1 truncate">
                          {cat.description || cat.pluralLabel}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {cat.isBuiltIn ? (
                          <span className="text-[10px] font-semibold text-[#666A86] dark:text-[#A9ACC8] px-2">
                            Built-in
                          </span>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => openCategoryModal(cat)}
                              className="p-1.5 rounded-lg text-[#666A86] dark:text-[#A9ACC8] hover:text-[#6D5CF2] hover:bg-[#EFEDFF] dark:hover:bg-[#2A2A55] cursor-pointer"
                              title="Edit category"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            {isCustomConfigured && (
                              <button
                                type="button"
                                onClick={() => handleDeleteCustomCategory(cat.id)}
                                disabled={isSavingCategory || dbGroupCount > 0}
                                className="p-1.5 rounded-lg text-[#666A86] dark:text-[#A9ACC8] hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                title={
                                  dbGroupCount > 0
                                    ? `Cannot delete while ${dbGroupCount} group(s) use this category`
                                    : 'Delete custom category'
                                }
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

