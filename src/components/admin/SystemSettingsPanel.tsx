import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import {
  SystemSettings,
  ChurchGroup,
  ChurchGroupCategory,
  ChurchGroupLeadershipHistoryEntry,
  Person,
  ConsolePlan,
  LicenseEvaluationResult,
  LicenseTier,
  SystemLicense,
  BillingCycle,
  PaymentMethod,
} from '../../types/ekklesphere';
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
  const [lastSavedTime, setLastSavedTime] = useState<string>('Just now');
  const [isCapturingGps, setIsCapturingGps] = useState(false);
  const [gpsCaptureError, setGpsCaptureError] = useState<string | null>(null);
  const [latInput, setLatInput] = useState<string>(
    systemSettings.campusLatitude != null ? String(systemSettings.campusLatitude) : ''
  );
  const [lngInput, setLngInput] = useState<string>(
    systemSettings.campusLongitude != null ? String(systemSettings.campusLongitude) : ''
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

  React.useEffect(() => {
    if (!hasChanges) {
      setFormData({ ...systemSettings });
      setLatInput(systemSettings.campusLatitude != null ? String(systemSettings.campusLatitude) : '');
      setLngInput(systemSettings.campusLongitude != null ? String(systemSettings.campusLongitude) : '');
    }
  }, [systemSettings, hasChanges]);

  // Groups Management Local States
  const [groupFilterCategory, setGroupFilterCategory] = useState<'all' | 'ministry' | 'fellowship' | 'cell_group'>('all');
  const [groupFilterStatus, setGroupFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [groupSearchQuery, setGroupSearchQuery] = useState('');
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [viewingMembersGroup, setViewingMembersGroup] = useState<ChurchGroup | null>(null);

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
    setGroupDay(category === 'cell_group' ? 'Wednesdays' : category === 'ministry' ? 'Saturdays' : 'Monthly 2nd Saturday');
    setGroupTime(category === 'cell_group' ? '18:30 - 19:45' : '16:00 - 17:30');
    setGroupLocation('');
    setGroupDemographic('');
    setGroupDescription('');
    setGroupActive(true);
    setGroupErrors({});
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
    setFormData((prev) => {
      const next = { ...prev, [key]: value };
      setHasChanges(true);
      return next;
    });
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!isSettingsAdmin) {
      showToast('Access Denied: Only administrators can modify church geofence parameters.');
      return;
    }
    let updatedPayload: SystemSettings = { ...formData };

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
      setFormData(updatedPayload);
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
      setFormData((prev) => ({
        ...prev,
        campusLatitude: parsedLat,
        campusLongitude: parsedLng,
        campusLocationAccuracyM: null,
        campusLocationUpdatedAt: new Date().toISOString(),
      }));
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
        setFormData((prev) => ({
          ...prev,
          campusName: updatedCampusName,
          campusLatitude: data.lat,
          campusLongitude: data.lng,
          campusLocationAccuracyM: null,
          campusLocationUpdatedAt: new Date().toISOString(),
        }));
        setSharedMapLink('');
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
    setFormData((prev) => ({
      ...prev,
      campusLatitude: null,
      campusLongitude: null,
      campusLocationAccuracyM: null,
      campusLocationUpdatedAt: null,
    }));
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
              type="number"
              step="any"
              placeholder="e.g. 5.603717"
              value={latInput}
              onChange={(e) => {
                setLatInput(e.target.value);
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
              type="number"
              step="any"
              placeholder="e.g. -0.186964"
              value={lngInput}
              onChange={(e) => {
                setLngInput(e.target.value);
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
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Top Header Card */}
      <div className="bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-[#E9EBF5] dark:border-[#2D2D55] shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-semibold text-[#666A86] dark:text-[#A9ACC8]">
              System & Campus Parameters
            </span>
            <span className="text-[#666A86] dark:text-[#A9ACC8]">·</span>
            <span className="text-xs font-bold text-[#6D5CF2] dark:text-[#8C7DFF]">
              Ghana Act 843 Compliant
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1D1B3A] dark:text-[#F2F2FA]">
            System Settings
          </h2>
          <p className="text-xs text-[#666A86] dark:text-[#A9ACC8] mt-1 max-w-xl">
            Configure church profile, PostGIS geofence radii, BLE signal thresholds, pastoral care alert rules, and communications gateways.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
          {hasChanges && (
            <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-xl flex items-center gap-1 border border-amber-500/20">
              <AlertCircle className="w-3.5 h-3.5" />
              Unsaved changes
            </span>
          )}
          <button
            type="button"
            onClick={handleReset}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 cursor-pointer ${
              confirmReset
                ? 'bg-rose-600 text-white border-rose-600'
                : 'bg-[#F6F7FC] dark:bg-[#14142E] hover:bg-slate-200 dark:hover:bg-white/10 text-[#666A86] dark:text-[#A9ACC8] border-[#E9EBF5] dark:border-[#2D2D55]'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{confirmReset ? 'Click Again to Confirm Reset' : 'Reset Defaults'}</span>
          </button>
          <button
            type="button"
            disabled={isSyncingSystemSettings}
            onClick={() => handleSave()}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-60 ${
              hasChanges
                ? 'bg-[#6D5CF2] hover:bg-[#5b4be0] text-white scale-102'
                : 'bg-[#6D5CF2]/90 hover:bg-[#6D5CF2] text-white'
            }`}
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSyncingSystemSettings ? 'Saving...' : 'Save Settings'}</span>
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Settings"
              className="p-2 rounded-xl text-[#666A86] hover:text-[#1D1B3A] dark:text-[#A9ACC8] dark:hover:text-white bg-[#F6F7FC] dark:bg-[#14142E] hover:bg-slate-200 dark:hover:bg-white/10 border border-[#E9EBF5] dark:border-[#2D2D55] transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Settings Navigation Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        <button
          onClick={() => setActiveTab('general')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'general'
              ? 'bg-[#6D5CF2] text-white shadow-xs'
              : 'bg-white dark:bg-[#1D1D3D] text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-[#F2F2FA] border border-[#E9EBF5] dark:border-[#2D2D55]'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          <span>Campus Profile</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('groups')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'groups'
              ? 'bg-[#6D5CF2] text-white shadow-xs'
              : 'bg-white dark:bg-[#1D1D3D] text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-[#F2F2FA] border border-[#E9EBF5] dark:border-[#2D2D55]'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Ministries & Cell Groups</span>
          <span
            className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
              activeTab === 'groups'
                ? 'bg-white/20 text-white'
                : 'bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF]'
            }`}
          >
            {churchGroups.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('proximity')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'proximity'
              ? 'bg-[#6D5CF2] text-white shadow-xs'
              : 'bg-white dark:bg-[#1D1D3D] text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-[#F2F2FA] border border-[#E9EBF5] dark:border-[#2D2D55]'
          }`}
        >
          <Radio className="w-3.5 h-3.5" />
          <span>Proximity & Geofencing</span>
        </button>

        <button
          onClick={() => setActiveTab('pastoral')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'pastoral'
              ? 'bg-[#6D5CF2] text-white shadow-xs'
              : 'bg-white dark:bg-[#1D1D3D] text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-[#F2F2FA] border border-[#E9EBF5] dark:border-[#2D2D55]'
          }`}
        >
          <HeartHandshake className="w-3.5 h-3.5" />
          <span>Pastoral Care Rules</span>
        </button>

        <button
          onClick={() => setActiveTab('privacy')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'privacy'
              ? 'bg-[#6D5CF2] text-white shadow-xs'
              : 'bg-white dark:bg-[#1D1D3D] text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-[#F2F2FA] border border-[#E9EBF5] dark:border-[#2D2D55]'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Privacy & Governance</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('gateways')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'gateways'
              ? 'bg-[#6D5CF2] text-white shadow-xs'
              : 'bg-white dark:bg-[#1D1D3D] text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-[#F2F2FA] border border-[#E9EBF5] dark:border-[#2D2D55]'
          }`}
        >
          <Send className="w-3.5 h-3.5" />
          <span>SMS & Paystack Gateways</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('staff')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'staff'
              ? 'bg-[#6D5CF2] text-white shadow-xs'
              : 'bg-white dark:bg-[#1D1D3D] text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-[#F2F2FA] border border-[#E9EBF5] dark:border-[#2D2D55]'
          }`}
        >
          <Shield className="w-3.5 h-3.5" />
          <span>Users &amp; Credentials</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('billing')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'billing'
              ? 'bg-[#6D5CF2] text-white shadow-xs'
              : 'bg-white dark:bg-[#1D1D3D] text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-[#F2F2FA] border border-[#E9EBF5] dark:border-[#2D2D55]'
          }`}
        >
          <CreditCard className="w-3.5 h-3.5" />
          <span>Plan &amp; Upgrade</span>
          {licenseEval?.status === 'trial' && (
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                  Church Organization Name
                </label>
                <input
                  type="text"
                  value={formData.churchName}
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
                  value={formData.campusName}
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
                  value={formData.campusAddress}
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
                  value={formData.seniorPastor}
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
                  value={formData.contactPhone}
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
                  value={formData.contactEmail}
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
          <div className="space-y-5 animate-in fade-in duration-200">
            {/* Top Overview & Action Header Card */}
            <div className="bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl p-5 sm:p-7 border border-[#E9EBF5] dark:border-[#2D2D55] shadow-xs">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-[#E9EBF5] dark:border-[#2D2D55]">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-2 h-2 rounded-full bg-[#6D5CF2]" />
                    <span className="text-xs font-semibold text-[#666A86] dark:text-[#A9ACC8]">
                      Congregational Structure & Leadership
                    </span>
                    <span className="text-[#666A86] dark:text-[#A9ACC8]">·</span>
                    <span className="text-xs font-bold text-[#6D5CF2] dark:text-[#8C7DFF]">
                      {formData.campusName || systemSettings.campusName}
                    </span>
                  </div>
                  <h3 className="text-base sm:text-lg font-bold text-[#1D1B3A] dark:text-[#F2F2FA] flex items-center gap-2">
                    <Users className="w-5 h-5 text-[#6D5CF2]" />
                    <span>Ministries, Fellowships & Cell Groups</span>
                  </h3>
                  <p className="text-xs text-[#666A86] dark:text-[#A9ACC8] mt-1 max-w-2xl leading-relaxed">
                    Administrate church functional departments, demographic fellowships, and neighborhood home cell small groups. Leadership, schedules, and venues flow directly into Congregation &amp; Ministry Analytics.
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                  <button
                    type="button"
                    onClick={() => requestOpenAnalytics({ lens: 'ministries' })}
                    className="bg-[#EFEDFF] dark:bg-[#2A2A55] hover:bg-[#E2DEFF] dark:hover:bg-[#343468] text-[#6D5CF2] dark:text-[#8C7DFF] rounded-xl px-3.5 py-2 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <BarChart3 className="w-3.5 h-3.5" />
                    <span>Ministry Analytics</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openAddGroupModal('cell_group')}
                    className="bg-[#6D5CF2] hover:bg-[#5b4be0] text-white rounded-xl px-4 py-2 text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer whitespace-nowrap shrink-0 active:scale-95"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add New Group</span>
                  </button>
                </div>
              </div>

              {/* Group Metric KPI Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mt-5 tabular-nums">
                {/* 1. Total Groups & Leadership Coverage */}
                <div
                  onClick={() => setGroupFilterCategory('all')}
                  className={`p-3.5 sm:p-4 rounded-2xl border transition-all cursor-pointer ${
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
                    {churchGroups.length}
                  </div>
                  <div className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] mt-1 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                    <span className="truncate">
                      {structureAnalytics.leadership.distinctLeadersCount} leaders ·{' '}
                      {structureAnalytics.leadership.leadershipCoveragePct}% roster covered
                    </span>
                  </div>
                </div>

                {/* 2. Ministries */}
                <div
                  onClick={() => setGroupFilterCategory('ministry')}
                  className={`p-3.5 sm:p-4 rounded-2xl border transition-all cursor-pointer ${
                    groupFilterCategory === 'ministry'
                      ? 'bg-[#EFEDFF]/60 dark:bg-[#2A2A55]/40 border-[#6D5CF2]'
                      : 'bg-[#F6F7FC] dark:bg-[#14142E] border-[#E9EBF5] dark:border-[#2D2D55] hover:border-[#6D5CF2]/50'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs text-[#666A86] dark:text-[#A9ACC8]">
                    <span className="font-semibold">Ministries</span>
                    <span className="text-[11px] font-bold text-[#6D5CF2] dark:text-[#8C7DFF]">
                      Departments
                    </span>
                  </div>
                  <div className="font-mono text-2xl font-extrabold text-[#6D5CF2] dark:text-[#8C7DFF] mt-1">
                    {churchGroups.filter((g) => g.category === 'ministry').length}
                  </div>
                  <div className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] mt-1 truncate">
                    {structureAnalytics.leadership.unconfiguredDepartmentsCount > 0
                      ? `${structureAnalytics.leadership.unconfiguredDepartmentsCount} roster dept(s) need lead`
                      : `${structureAnalytics.namedDepartmentsCount} active departments tracked`}
                  </div>
                </div>

                {/* 3. Fellowships */}
                <div
                  onClick={() => setGroupFilterCategory('fellowship')}
                  className={`p-3.5 sm:p-4 rounded-2xl border transition-all cursor-pointer ${
                    groupFilterCategory === 'fellowship'
                      ? 'bg-sky-50 dark:bg-sky-950/30 border-sky-400'
                      : 'bg-[#F6F7FC] dark:bg-[#14142E] border-[#E9EBF5] dark:border-[#2D2D55] hover:border-sky-400/50'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs text-[#666A86] dark:text-[#A9ACC8]">
                    <span className="font-semibold">Fellowships</span>
                    <span className="text-[11px] font-bold text-sky-700 dark:text-sky-300">
                      Demographic
                    </span>
                  </div>
                  <div className="font-mono text-2xl font-extrabold text-sky-600 dark:text-sky-400 mt-1">
                    {churchGroups.filter((g) => g.category === 'fellowship').length}
                  </div>
                  <div className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] mt-1 truncate">
                    {structureAnalytics.leadership.coLedGroupsCount} co-led across structure
                  </div>
                </div>

                {/* 4. Cell Groups */}
                <div
                  onClick={() => setGroupFilterCategory('cell_group')}
                  className={`p-3.5 sm:p-4 rounded-2xl border transition-all cursor-pointer ${
                    groupFilterCategory === 'cell_group'
                      ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-500'
                      : 'bg-[#F6F7FC] dark:bg-[#14142E] border-[#E9EBF5] dark:border-[#2D2D55] hover:border-emerald-500/50'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs text-[#666A86] dark:text-[#A9ACC8]">
                    <span className="font-semibold">Cell Groups</span>
                    <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                      Home Cells
                    </span>
                  </div>
                  <div className="font-mono text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">
                    {churchGroups.filter((g) => g.category === 'cell_group').length}
                  </div>
                  <div className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] mt-1 truncate">
                    {unconfiguredRosterGroups.length > 0
                      ? `${unconfiguredRosterGroups.length} roster group(s) unconfigured`
                      : 'All roster cells configured'}
                  </div>
                </div>
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
            <div className="bg-white dark:bg-[#1D1D3D] rounded-2xl p-4 border border-[#E9EBF5] dark:border-[#2D2D55] shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
              {/* Category Filter Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
                <button
                  type="button"
                  onClick={() => setGroupFilterCategory('all')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                    groupFilterCategory === 'all'
                      ? 'bg-[#6D5CF2] text-white shadow-xs'
                      : 'bg-[#F6F7FC] dark:bg-[#14142E] text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-[#F2F2FA]'
                  }`}
                >
                  All ({churchGroups.length})
                </button>
                <button
                  type="button"
                  onClick={() => setGroupFilterCategory('ministry')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                    groupFilterCategory === 'ministry'
                      ? 'bg-[#6D5CF2] text-white shadow-xs'
                      : 'bg-[#F6F7FC] dark:bg-[#14142E] text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-[#F2F2FA]'
                  }`}
                >
                  Ministries ({churchGroups.filter((g) => g.category === 'ministry').length})
                </button>
                <button
                  type="button"
                  onClick={() => setGroupFilterCategory('fellowship')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                    groupFilterCategory === 'fellowship'
                      ? 'bg-[#6D5CF2] text-white shadow-xs'
                      : 'bg-[#F6F7FC] dark:bg-[#14142E] text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-[#F2F2FA]'
                  }`}
                >
                  Fellowships ({churchGroups.filter((g) => g.category === 'fellowship').length})
                </button>
                <button
                  type="button"
                  onClick={() => setGroupFilterCategory('cell_group')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                    groupFilterCategory === 'cell_group'
                      ? 'bg-[#6D5CF2] text-white shadow-xs'
                      : 'bg-[#F6F7FC] dark:bg-[#14142E] text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-[#F2F2FA]'
                  }`}
                >
                  Cell Groups ({churchGroups.filter((g) => g.category === 'cell_group').length})
                </button>
              </div>

              {/* Search & Status Filter */}
              <div className="flex items-center gap-2 flex-1 md:flex-initial">
                <div className="relative flex-1 sm:w-64">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#666A86] dark:text-[#A9ACC8]" />
                  <input
                    type="text"
                    placeholder="Search by name, leader, location..."
                    value={groupSearchQuery}
                    onChange={(e) => setGroupSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-8 py-1.5 text-xs rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] placeholder-[#666A86] dark:placeholder-[#A9ACC8] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
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
                  className="px-2.5 py-1.5 text-xs rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2] font-semibold"
                >
                  <option value="all">All Statuses</option>
                  <option value="active">Active Only</option>
                  <option value="inactive">Inactive Only</option>
                </select>
              </div>
            </div>

            {/* Groups Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {churchGroups
                .filter((group) => {
                  if (groupFilterCategory !== 'all' && group.category !== groupFilterCategory) return false;
                  if (groupFilterStatus === 'active' && !group.active) return false;
                  if (groupFilterStatus === 'inactive' && group.active) return false;
                  if (!groupSearchQuery.trim()) return true;
                  const q = groupSearchQuery.toLowerCase();
                  return (
                    group.name.toLowerCase().includes(q) ||
                    group.leaderName.toLowerCase().includes(q) ||
                    (group.meetingLocation && group.meetingLocation.toLowerCase().includes(q)) ||
                    (group.meetingDay && group.meetingDay.toLowerCase().includes(q)) ||
                    (group.description && group.description.toLowerCase().includes(q))
                  );
                })
                .map((group) => {
                  const enrolledMembers = getGroupMembers(group.name);
                  const liveMetrics = groupMetricsByName.get(normalizeSettingLabel(group.name).toLowerCase());
                  const hasAssignedLead = isAssignedLeaderName(group.leaderName);
                  const isMinistry = group.category === 'ministry';
                  const isFellowship = group.category === 'fellowship';

                  return (
                    <div
                      key={group.id}
                      className="bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl p-5 border border-[#E9EBF5] dark:border-[#2D2D55] shadow-xs flex flex-col justify-between hover:shadow-md transition-all group"
                    >
                      <div>
                        {/* Top Badges & Status Toggle */}
                        <div className="flex items-center justify-between gap-2 mb-3">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase ${
                              isMinistry
                                ? 'bg-[#EFEDFF] text-[#6D5CF2] dark:bg-[#2A2A55] dark:text-[#8C7DFF]'
                                : isFellowship
                                ? 'bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300'
                                : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                            }`}
                          >
                            {isMinistry ? 'Ministry' : isFellowship ? 'Fellowship' : 'Cell Group'}
                          </span>

                          <div className="flex items-center gap-1.5">
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
                                onClick={() => openEditGroupModal(group)}
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
                              {liveMetrics?.totalMembers ?? enrolledMembers.length}
                            </div>
                          </div>
                          <div className="border-x border-[#E9EBF5] dark:border-[#2D2D55]">
                            <div className="text-[10px] font-semibold text-[#666A86] dark:text-[#A9ACC8]">
                              Live Turnout
                            </div>
                            <div className="font-mono text-xs font-bold text-[#6D5CF2] dark:text-[#8C7DFF]">
                              {liveMetrics ? `${liveMetrics.presentCount} (${liveMetrics.turnoutPct}%)` : '0 (0%)'}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] font-semibold text-[#666A86] dark:text-[#A9ACC8]">
                              Care / Risk
                            </div>
                            <div
                              className={`font-mono text-xs font-bold ${
                                (liveMetrics?.atRiskCount || 0) + (liveMetrics?.openFollowupCount || 0) > 0
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-emerald-600 dark:text-emerald-400'
                              }`}
                            >
                              {liveMetrics ? `${liveMetrics.atRiskCount} / ${liveMetrics.openFollowupCount}` : '0 / 0'}
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
                      <div className="pt-3 border-t border-[#E9EBF5] dark:border-[#2D2D55] flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
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
                                lens: group.category === 'ministry' ? 'departments' : 'ministries',
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
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => openEditGroupModal(group)}
                            className="p-1.5 rounded-lg text-[#666A86] dark:text-[#A9ACC8] hover:text-[#6D5CF2] hover:bg-[#EFEDFF] dark:hover:bg-[#2A2A55] transition-colors cursor-pointer"
                            title="Edit Group"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
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
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* Empty Search State */}
            {churchGroups.filter((group) => {
              if (groupFilterCategory !== 'all' && group.category !== groupFilterCategory) return false;
              if (groupFilterStatus === 'active' && !group.active) return false;
              if (groupFilterStatus === 'inactive' && group.active) return false;
              if (!groupSearchQuery.trim()) return true;
              const q = groupSearchQuery.toLowerCase();
              return (
                group.name.toLowerCase().includes(q) ||
                group.leaderName.toLowerCase().includes(q) ||
                (group.meetingLocation && group.meetingLocation.toLowerCase().includes(q))
              );
            }).length === 0 && (
              <div className="bg-white dark:bg-[#1D1D3D] rounded-2xl p-10 text-center border border-[#E9EBF5] dark:border-[#2D2D55]">
                <Users className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                <h4 className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">No matching groups found</h4>
                <p className="text-xs text-[#666A86] dark:text-[#A9ACC8] mt-1 max-w-sm mx-auto">
                  Try adjusting your search query or category filters, or click "Add New Group" to create one.
                </p>
                <button
                  type="button"
                  onClick={() => openAddGroupModal('cell_group')}
                  className="mt-4 bg-[#6D5CF2] text-white rounded-xl px-4 py-2 text-xs font-bold inline-flex items-center gap-1.5 shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create Group</span>
                </button>
              </div>
            )}

            {/* Leadership Change History Panel (All Categories: Ministries, Fellowships, Cell Groups) */}
            {(() => {
              const categoryCounts = {
                all: leadershipHistory.length,
                ministry: leadershipHistory.filter((h) => h.category === 'ministry').length,
                fellowship: leadershipHistory.filter((h) => h.category === 'fellowship').length,
                cell_group: leadershipHistory.filter((h) => h.category === 'cell_group').length,
              };

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
                cat === 'ministry' ? 'Ministry' : cat === 'fellowship' ? 'Fellowship' : 'Cell Group';

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
                  className="bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl p-5 sm:p-6 border border-[#E9EBF5] dark:border-[#2D2D55] shadow-xs space-y-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm sm:text-base font-bold text-[#1D1B3A] dark:text-[#F2F2FA] flex items-center gap-2">
                        <History className="w-4 h-4 text-[#6D5CF2] shrink-0" />
                        <span>Leadership Change History (All Categories)</span>
                      </h4>
                      <p className="text-xs text-[#666A86] dark:text-[#A9ACC8] mt-0.5">
                        Verified audit trail of primary and assistant leadership changes across Ministries, Fellowships, and Cell Groups.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => refreshLeadershipHistory()}
                      disabled={isLoadingLeadershipHistory}
                      className="px-3 py-1.5 rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-xs font-semibold text-[#1D1B3A] dark:text-[#F2F2FA] hover:border-[#6D5CF2] flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isLoadingLeadershipHistory ? 'animate-spin' : ''}`} />
                      <span>Refresh Log</span>
                    </button>
                  </div>

                  {/* Category Tabs & Filters */}
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-1">
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0 tabular-nums">
                      {(
                        [
                          { id: 'all', label: 'All Categories', count: categoryCounts.all },
                          { id: 'ministry', label: 'Ministries', count: categoryCounts.ministry },
                          { id: 'fellowship', label: 'Fellowships', count: categoryCounts.fellowship },
                          { id: 'cell_group', label: 'Cell Groups', count: categoryCounts.cell_group },
                        ] as const
                      ).map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => {
                            setHistoryFilterCategory(tab.id);
                            setHistoryFilterGroupId('all');
                          }}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                            historyFilterCategory === tab.id
                              ? 'bg-[#6D5CF2] text-white'
                              : 'bg-[#F6F7FC] dark:bg-[#14142E] text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-[#F2F2FA]'
                          }`}
                        >
                          {tab.label} ({tab.count})
                        </button>
                      ))}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={historyFilterGroupId}
                        onChange={(e) => setHistoryFilterGroupId(e.target.value)}
                        aria-label="Filter leadership history by group"
                        className="px-2.5 py-1.5 text-xs rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] font-semibold outline-none focus:ring-2 focus:ring-[#6D5CF2] max-w-[200px]"
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
                        className="px-2.5 py-1.5 text-xs rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] font-semibold outline-none focus:ring-2 focus:ring-[#6D5CF2]"
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
                                      entry.category === 'ministry'
                                        ? 'text-[#6D5CF2] dark:text-[#8C7DFF]'
                                        : entry.category === 'fellowship'
                                        ? 'text-sky-600 dark:text-sky-400'
                                        : 'text-emerald-600 dark:text-emerald-400'
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

              {/* Sliders & Calibration */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
                <div>
                  <div className="flex items-center justify-between text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1.5">
                    <span>Outer Geofence Radius (Approach Wake-up)</span>
                    <span className="text-[#6D5CF2] font-mono text-xs">{formData.outerGeofenceMeters} meters</span>
                  </div>
                  <input
                    type="range"
                    min="150"
                    max="800"
                    step="50"
                    value={formData.outerGeofenceMeters}
                    onChange={(e) => handleChange('outerGeofenceMeters', parseInt(e.target.value, 10))}
                    className="w-full accent-[#6D5CF2] cursor-pointer"
                  />
                  <p className="text-[10px] text-[#666A86] dark:text-[#A9ACC8] mt-1">
                    Wakes device background task when member arrives within this distance of {formData.campusName || systemSettings.campusName}.
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1.5">
                    <span>Inner Perimeter Radius (Sanctuary Grounds)</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-mono text-xs">{formData.innerGeofenceMeters} meters</span>
                  </div>
                  <input
                    type="range"
                    min="30"
                    max="200"
                    step="10"
                    value={formData.innerGeofenceMeters}
                    onChange={(e) => handleChange('innerGeofenceMeters', parseInt(e.target.value, 10))}
                    className="w-full accent-emerald-500 cursor-pointer"
                  />
                  <p className="text-[10px] text-[#666A86] dark:text-[#A9ACC8] mt-1">
                    Sanctuary gates perimeter where dwell timer begins counting down.
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1.5">
                    <span>Mandatory Dwell Verification Time</span>
                    <span className="text-[#1D1B3A] dark:text-[#F2F2FA] font-mono text-xs">{formData.dwellTimeMinutes} minutes</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="15"
                    step="1"
                    value={formData.dwellTimeMinutes}
                    onChange={(e) => handleChange('dwellTimeMinutes', parseInt(e.target.value, 10))}
                    className="w-full accent-[#6D5CF2] cursor-pointer"
                  />
                  <p className="text-[10px] text-[#666A86] dark:text-[#A9ACC8] mt-1">
                    Member must remain inside perimeter for this duration to confirm attendance.
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1.5">
                    <span>BLE Beacon Sensitivity Threshold</span>
                    <span className="text-indigo-600 dark:text-indigo-400 font-mono text-xs">{formData.bleBeaconRssiThreshold} dBm</span>
                  </div>
                  <input
                    type="range"
                    min="-85"
                    max="-50"
                    step="5"
                    value={formData.bleBeaconRssiThreshold}
                    onChange={(e) => handleChange('bleBeaconRssiThreshold', parseInt(e.target.value, 10))}
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
                    type="number"
                    min="15"
                    max="90"
                    value={formData.serviceWindowBeforeMinutes}
                    onChange={(e) => handleChange('serviceWindowBeforeMinutes', parseInt(e.target.value, 10) || 45)}
                    className="w-full px-3.5 py-2 text-xs rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                  />
                  <p className="text-[10px] text-[#666A86] dark:text-[#A9ACC8] mt-0.5">
                    E.g. 45 min allows early arrivals and choir rehearsal check-in.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                    Post-Service Grace Window (Minutes After)
                  </label>
                  <input
                    type="number"
                    min="15"
                    max="60"
                    value={formData.serviceWindowAfterMinutes}
                    onChange={(e) => handleChange('serviceWindowAfterMinutes', parseInt(e.target.value, 10) || 30)}
                    className="w-full px-3.5 py-2 text-xs rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                  />
                  <p className="text-[10px] text-[#666A86] dark:text-[#A9ACC8] mt-0.5">
                    Keeps check-in active for delayed arrivals or usher reconciliation.
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
                    Auto-Assign Care Tasks to Cell Group Leaders
                  </div>
                  <p className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] mt-0.5">
                    Automatically directs absentee follow-ups to assigned home cell, ministry, or youth leaders rather than centralized pastors.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer ml-4">
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
                <label className="relative inline-flex items-center cursor-pointer ml-4">
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
                <span>Communication & Mobile Money Gateways</span>
              </h3>
              <p className="text-xs text-[#666A86] dark:text-[#A9ACC8]">
                Configure Arkesel SMS broadcasts, Resend transactional &amp; pastoral emails, and Mobile Money webhooks. Server API keys remain encrypted in environment secrets.
              </p>
            </div>

            {/* SMS Gateway (Arkesel API) */}
            <div className="p-4 rounded-2xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                    SMS Broadcast Gateway (Arkesel API)
                  </div>
                  <div className="text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
                    Authenticated server-side via <span className="font-mono">ARKESEL_API_KEY</span>.
                  </div>
                </div>
                <span
                  className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                    communicationStatus.arkeselConfigured
                      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                      : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                  }`}
                >
                  {communicationStatus.arkeselConfigured ? 'Arkesel API Ready' : 'Set ARKESEL_API_KEY in Env'}
                </span>
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
                    value={formData.smsSenderId}
                    onChange={(e) => handleChange('smsSenderId', e.target.value.toUpperCase())}
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
                      onChange={(e) => setTestEmailRecipient(e.target.value)}
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
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                      Paystack & MTN MoMo Webhook
                    </div>
                    <div className="text-[10px] text-[#666A86] dark:text-[#A9ACC8]">
                      Settlement currency: {formData.currency || 'GHS (Ghana Cedi)'}
                    </div>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                  Verified
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
                <label className="block font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1.5">
                  Group Category <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setGroupCategory('cell_group')}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      groupCategory === 'cell_group'
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-900 dark:text-emerald-200'
                        : 'bg-[#F6F7FC] dark:bg-[#14142E] border-[#E9EBF5] dark:border-[#2D2D55] text-[#666A86] dark:text-[#A9ACC8]'
                    }`}
                  >
                    <div className="font-bold flex items-center justify-between">
                      <span>Cell Group</span>
                      {groupCategory === 'cell_group' && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                    </div>
                    <div className="text-[10px] mt-0.5 opacity-80">Home Small Group</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setGroupCategory('ministry')}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      groupCategory === 'ministry'
                        ? 'bg-[#EFEDFF] dark:bg-[#2A2A55] border-[#6D5CF2] text-[#6D5CF2] dark:text-[#8C7DFF]'
                        : 'bg-[#F6F7FC] dark:bg-[#14142E] border-[#E9EBF5] dark:border-[#2D2D55] text-[#666A86] dark:text-[#A9ACC8]'
                    }`}
                  >
                    <div className="font-bold flex items-center justify-between">
                      <span>Ministry</span>
                      {groupCategory === 'ministry' && <Check className="w-3.5 h-3.5 text-[#6D5CF2]" />}
                    </div>
                    <div className="text-[10px] mt-0.5 opacity-80">Department Unit</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setGroupCategory('fellowship')}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      groupCategory === 'fellowship'
                        ? 'bg-sky-50 dark:bg-sky-950/40 border-sky-400 text-sky-900 dark:text-sky-200'
                        : 'bg-[#F6F7FC] dark:bg-[#14142E] border-[#E9EBF5] dark:border-[#2D2D55] text-[#666A86] dark:text-[#A9ACC8]'
                    }`}
                  >
                    <div className="font-bold flex items-center justify-between">
                      <span>Fellowship</span>
                      {groupCategory === 'fellowship' && <Check className="w-3.5 h-3.5 text-sky-600" />}
                    </div>
                    <div className="text-[10px] mt-0.5 opacity-80">Demographic Wing</div>
                  </button>
                </div>
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
                    Recorded permanently in the Leadership Change History for {groupCategory.replace('_', ' ')}s.
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

              {groupErrors.form && (
                <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-[11px] font-semibold text-rose-700 dark:text-rose-300">
                  {groupErrors.form}
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
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                      viewingMembersGroup.category === 'ministry'
                        ? 'bg-[#EFEDFF] text-[#6D5CF2] dark:bg-[#2A2A55] dark:text-[#8C7DFF]'
                        : viewingMembersGroup.category === 'fellowship'
                        ? 'bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300'
                        : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                    }`}
                  >
                    {viewingMembersGroup.category.replace('_', ' ')}
                  </span>
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
                    You can assign members to this group when registering new members or editing existing members in the Roster.
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
    </div>
  );
};

