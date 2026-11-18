import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import {
  isSupabaseBrowserConfigured,
  signInWithSupabaseGoogle,
  signOutSupabaseBrowser,
  supabaseBrowserClient,
} from '../lib/supabase';
import {
  Person,
  ServiceInstance,
  AttendanceRecord,
  FollowupTask,
  Donation,
  AuditLogItem,
  CheckinMethod,
  UserRole,
  AuthUser,
  SystemSettings,
  ChurchGroup,
  ChurchGroupCategory,
  ChurchGroupLeadershipHistoryEntry,
  AppViewMode,
  TenantChurch,
  SystemLicense,
  LicenseTier,
  TenantStatus,
  BillingCycle,
  LandingPageConfig,
  LiveTelemetrySummary,
  ChurchWallPost,
  AuthActionResult,
  PastoralCareDispatch,
  PastoralCareMonitorSummary,
  ServiceAbsenceSweepResult,
} from '../types/ekklesphere';
import { canMonitorPastoralCare } from '../constants/portfolios';
import { pushNotificationService } from '../services/pushNotificationService';
import {
  validateMemberImportBatch,
  type ImportDuplicateMode,
  type MemberImportValidationSummary,
  type ValidatedImportRow,
} from '../shared/memberImportValidation';
import {
  computeServiceBinaryStatus,
  evaluateServiceCheckInEligibility,
  isPlaceholderServiceId,
  type ServiceCheckInEligibility,
} from '../utils/serviceStatus';
import {
  formatFollowupDueDateLabel,
  getCurrencyDisplay,
  memberMatchesChurchGroup,
  resolveFollowupAssignee,
  type AnalyticsJumpTarget,
  type SettingsGroupIntent,
  type SettingsTabId,
} from '../utils/settingsConnections';
import {
  parseServiceQrPayload,
  type ParsedServiceQrPayload,
} from '../utils/serviceQr';
import { resolveMemberBirthFields } from '../utils/birthMonth';
import {
  normalizeMemberDepartmentFields,
  resolveMemberDepartments,
} from '../utils/memberDepartments';

export interface ServiceQrCheckInResult {
  ok: boolean;
  message: string;
  alreadyCheckedIn?: boolean;
  serviceId?: string;
  serviceName?: string;
  record?: AttendanceRecord;
}


export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  churchName: '',
  campusName: '',
  campusAddress: '',
  campusLatitude: null,
  campusLongitude: null,
  campusLocationAccuracyM: null,
  campusLocationUpdatedAt: null,
  seniorPastor: '',
  contactEmail: '',
  contactPhone: '',
  timezone: 'Africa/Accra (GMT)',
  currency: 'GHS (Ghana Cedi)',
  outerGeofenceMeters: 300,
  innerGeofenceMeters: 100,
  dwellTimeMinutes: 5,
  serviceWindowBeforeMinutes: 45,
  serviceWindowAfterMinutes: 30,
  bleBeaconRssiThreshold: -70,
  driveByProtection: true,
  absenteeThresholdServices: 2,
  firstTimerFollowupHours: 24,
  autoAssignCellLeaders: true,
  autoMessageAbsentMembers: true,
  absentMemberMessageChannel: 'sms_and_email',
  absentMemberMessageTemplate:
    'Shalom {{firstName}}, we missed you at {{serviceName}} at {{churchName}}. You are deeply valued in our church family. Reach our care team anytime on {{contactPhone}}.',
  autoSendLeaderCareReminders: true,
  requireExplicitConsent: true,
  auditLogRetentionDays: 90,
  sessionTimeoutMinutes: 30,
  smsGatewayProvider: 'Arkesel SMS',
  smsSenderId: 'EKKLESPHERE',
  emailGatewayProvider: 'Resend Email',
  emailFromAddress: '',
  emailSenderName: '',
  enablePushNotifications: true,
  customGroupCategories: [],
};

function areSystemSettingsEqual(a: SystemSettings, b: SystemSettings): boolean {
  if (a === b) return true;
  if (
    (a.churchName || '') !== (b.churchName || '') ||
    (a.campusName || '') !== (b.campusName || '') ||
    (a.campusAddress || '') !== (b.campusAddress || '') ||
    (a.campusLatitude ?? null) !== (b.campusLatitude ?? null) ||
    (a.campusLongitude ?? null) !== (b.campusLongitude ?? null) ||
    (a.campusLocationAccuracyM ?? null) !== (b.campusLocationAccuracyM ?? null) ||
    (a.campusLocationUpdatedAt ?? null) !== (b.campusLocationUpdatedAt ?? null) ||
    (a.seniorPastor || '') !== (b.seniorPastor || '') ||
    (a.contactEmail || '') !== (b.contactEmail || '') ||
    (a.contactPhone || '') !== (b.contactPhone || '') ||
    a.timezone !== b.timezone ||
    a.currency !== b.currency ||
    a.outerGeofenceMeters !== b.outerGeofenceMeters ||
    a.innerGeofenceMeters !== b.innerGeofenceMeters ||
    a.dwellTimeMinutes !== b.dwellTimeMinutes ||
    a.serviceWindowBeforeMinutes !== b.serviceWindowBeforeMinutes ||
    a.serviceWindowAfterMinutes !== b.serviceWindowAfterMinutes ||
    a.bleBeaconRssiThreshold !== b.bleBeaconRssiThreshold ||
    a.driveByProtection !== b.driveByProtection ||
    a.absenteeThresholdServices !== b.absenteeThresholdServices ||
    a.firstTimerFollowupHours !== b.firstTimerFollowupHours ||
    a.autoAssignCellLeaders !== b.autoAssignCellLeaders ||
    (a.autoMessageAbsentMembers ?? true) !== (b.autoMessageAbsentMembers ?? true) ||
    (a.absentMemberMessageChannel || 'sms_and_email') !==
      (b.absentMemberMessageChannel || 'sms_and_email') ||
    (a.absentMemberMessageTemplate || '') !== (b.absentMemberMessageTemplate || '') ||
    (a.autoSendLeaderCareReminders ?? true) !== (b.autoSendLeaderCareReminders ?? true) ||
    a.requireExplicitConsent !== b.requireExplicitConsent ||
    a.auditLogRetentionDays !== b.auditLogRetentionDays ||
    (a.sessionTimeoutMinutes ?? 30) !== (b.sessionTimeoutMinutes ?? 30) ||
    a.smsGatewayProvider !== b.smsGatewayProvider ||
    a.smsSenderId !== b.smsSenderId ||
    a.emailGatewayProvider !== b.emailGatewayProvider ||
    (a.emailFromAddress || '') !== (b.emailFromAddress || '') ||
    (a.emailSenderName || '') !== (b.emailSenderName || '') ||
    a.enablePushNotifications !== b.enablePushNotifications
  ) {
    return false;
  }
  const catsA = a.customGroupCategories || [];
  const catsB = b.customGroupCategories || [];
  if (catsA.length !== catsB.length) return false;
  return JSON.stringify(catsA) === JSON.stringify(catsB);
}

function normalizePersonRecord(input: Partial<Person> | Record<string, unknown>): Person {
  const raw = (input || {}) as Partial<Person> & Record<string, unknown>;
  const firstName = String(raw.firstName ?? raw.first_name ?? 'Member').trim() || 'Member';
  const lastName = String(raw.lastName ?? raw.last_name ?? '').trim();
  const phoneE164 = String(raw.phoneE164 ?? raw.phone_e164 ?? raw.phoneNumber ?? raw.phone ?? '').trim();
  const groupName =
    String(raw.groupName ?? raw.group_name ?? raw.homeCellGroup ?? raw.home_cell_group ?? 'General Congregation').trim() ||
    'General Congregation';
  const avatarInitials =
    String(raw.avatarInitials ?? raw.avatar_initials ?? '').trim() ||
    `${firstName[0] || 'M'}${lastName[0] || ''}`.toUpperCase() ||
    'MB';
  const rawImg = [
    raw.imageUrl,
    raw.image_url,
    raw.photo_url,
    raw.photoUrl,
    raw.avatar,
    raw.image,
  ].find((val) => typeof val === 'string' && val.trim().length > 0);
  const imageUrl = typeof rawImg === 'string' ? rawImg.trim() : undefined;

  const rawDob =
    typeof raw.dateOfBirth === 'string'
      ? raw.dateOfBirth
      : typeof raw.date_of_birth === 'string'
      ? raw.date_of_birth
      : undefined;
  const birthFields = resolveMemberBirthFields({
    dateOfBirth: rawDob,
    monthOfBirth:
      typeof raw.monthOfBirth === 'string'
        ? raw.monthOfBirth
        : typeof raw.month_of_birth === 'string'
        ? raw.month_of_birth
        : undefined,
    birthMonthGroup:
      typeof raw.birthMonthGroup === 'string'
        ? raw.birthMonthGroup
        : typeof raw.birth_month_group === 'string'
        ? raw.birth_month_group
        : undefined,
  });

  const deptFields = normalizeMemberDepartmentFields({
    department: typeof raw.department === 'string' ? raw.department : undefined,
    departments: Array.isArray(raw.departments) ? (raw.departments as string[]) : undefined,
  });

  return {
    ...(raw as Person),
    id: String(raw.id || `mem-${Date.now()}`),
    tenantId: String(raw.tenantId ?? raw.tenant_id ?? '00000000-0000-0000-0000-000000000001'),
    firstName,
    lastName,
    phoneE164,
    groupName,
    homeCellGroup: String(raw.homeCellGroup ?? raw.home_cell_group ?? groupName),
    department: deptFields.department,
    departments: deptFields.departments,
    dateOfBirth: rawDob || (raw as Person).dateOfBirth,
    monthOfBirth: birthFields.monthOfBirth ?? (raw as Person).monthOfBirth,
    birthMonthGroup: birthFields.birthMonthGroup ?? (raw as Person).birthMonthGroup,
    avatarInitials,
    imageUrl,
    officerName: raw.officerName ?? raw.designation ? String(raw.officerName ?? raw.designation) : undefined,
    designation: raw.designation ?? raw.officerName ? String(raw.designation ?? raw.officerName) : undefined,
    status: (raw.status as Person['status']) || 'member',
    consecutiveAbsences: typeof raw.consecutiveAbsences === 'number' ? raw.consecutiveAbsences : 0,
    autoCheckinOptedIn: Boolean(raw.autoCheckinOptedIn ?? raw.auto_checkin_opted_in ?? false),
    joinedOn: String(raw.joinedOn ?? raw.joined_on ?? new Date().toISOString().split('T')[0]),
  };
}

export interface CommunicationGatewayStatusState {
  arkeselConfigured: boolean;
  arkeselSource?: 'tenant' | 'platform_env' | 'none';
  arkeselKeyMasked?: string | null;
  resendConfigured: boolean;
  paystackConfigured?: boolean;
  paystackSource?: 'tenant' | 'platform_env' | 'none';
  paystackPublicKey?: string;
  paystackSecretMasked?: string | null;
  paystackMode?: 'live' | 'test' | 'unconfigured';
  defaultSmsSenderId: string;
  defaultFromEmail: string;
  defaultFromName: string;
}

interface EkklesphereContextType {
  // Push Notifications (Web Push & Sanctuary Radar Confirmations)
  pushPermissionStatus: NotificationPermission | 'unsupported';
  isPushSubscribed: boolean;
  pushSubscribersCount: number;
  requestPushPermission: () => Promise<boolean>;
  sendTestPushNotification: (title?: string, body?: string) => Promise<boolean>;

  // Authentication & Unified Role System
  currentUser: AuthUser | null;
  isSessionVerified: boolean;
  isVerifyingSession: boolean;
  handleUnauthorizedSession: (status: number, reason?: 'timeout' | 'unauthorized') => boolean;
  setCurrentUser: (user: AuthUser | null) => void;
  login: (user: AuthUser) => void;
  loginWithCredentials: (identifier: string, password: string) => Promise<AuthActionResult>;
  signInWithGoogle: () => Promise<void>;
  isGoogleAuthLoading: boolean;
  googleAuthError: string | null;
  clearGoogleAuthError: () => void;
  registerMember: (params: {
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
    password: string;
    groupName?: string;
    autoCheckinOptedIn?: boolean;
    organizationSlug?: string;
  }) => Promise<AuthActionResult>;
  registerOrganisation: (params: {
    organizationName: string;
    orgType?: 'church' | 'organisation';
    city?: string;
    country?: string;
    adminFirstName: string;
    adminLastName: string;
    email: string;
    phone?: string;
    password: string;
    trialPlan?: LicenseTier;
  }) => Promise<AuthActionResult>;
  logout: (options?: { reason?: 'manual' | 'timeout' }) => void;
  sessionTimeoutMinutes: number;
  sessionWarningSecondsLeft: number | null;
  sessionExpiredNotice: string | null;
  clearSessionExpiredNotice: () => void;
  extendUserSession: () => Promise<void>;
  changePassword: (
    currentPassword: string,
    newPassword: string,
    confirmPassword?: string
  ) => Promise<AuthActionResult>;
  switchUserRole: (role: UserRole) => void;

  // Navigation & Layout Shell
  activePortal: 'admin' | 'member' | 'usher' | 'simulator';
  setActivePortal: (portal: 'admin' | 'member' | 'usher' | 'simulator') => void;
  isSidebarCollapsed: boolean;
  setIsSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  toggleSidebar: () => void;
  isMobileNavOpen: boolean;
  setIsMobileNavOpen: React.Dispatch<React.SetStateAction<boolean>>;
  adminSubTab: 'dashboard' | 'history' | 'insights' | 'workflows' | 'users' | 'pastoral' | 'integrations' | 'proximity' | 'settings';
  setAdminSubTab: (tab: 'dashboard' | 'history' | 'insights' | 'workflows' | 'users' | 'pastoral' | 'integrations' | 'proximity' | 'settings') => void;
  requestedSettingsTab: { tab: SettingsTabId; groupIntent?: SettingsGroupIntent; nonce: number } | null;
  requestOpenSettings: (tab: SettingsTabId, groupIntent?: SettingsGroupIntent) => void;
  requestedUserTarget: {
    memberId?: string;
    searchQuery?: string;
    filter?: 'all' | 'members' | 'staff' | 'has_login' | 'unprovisioned' | 'temp_password' | 'suspended';
    nonce: number;
  } | null;
  requestOpenUserManagement: (target?: {
    memberId?: string;
    searchQuery?: string;
    filter?: 'all' | 'members' | 'staff' | 'has_login' | 'unprovisioned' | 'temp_password' | 'suspended';
  }) => void;
  requestedAnalyticsTarget: AnalyticsJumpTarget | null;
  requestOpenAnalytics: (target?: Omit<AnalyticsJumpTarget, 'nonce'>) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  isAddServiceOpen: boolean;
  setIsAddServiceOpen: (open: boolean) => void;
  isFollowupModalOpen: boolean;
  setIsFollowupModalOpen: (open: boolean) => void;
  isHelpModalOpen: boolean;
  setIsHelpModalOpen: (open: boolean) => void;
  isSettingsModalOpen: boolean;
  setIsSettingsModalOpen: (open: boolean) => void;
  isChangePasswordModalOpen: boolean;
  setIsChangePasswordModalOpen: (open: boolean) => void;
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
  toggleTheme: () => void;

  // Active Service
  activeServiceId: string;
  setActiveServiceId: (id: string) => void;
  services: ServiceInstance[];
  currentService: ServiceInstance;
  hasScheduledService: boolean;
  checkInEligibility: ServiceCheckInEligibility;
  refreshServices: () => Promise<void>;
  addService: (params: {
    name: string;
    date?: string;
    startsAt: string;
    endsAt?: string;
    expectedAttendance?: number;
    dwellMinutes?: number;
  }) => Promise<ServiceInstance>;
  updateService: (
    serviceId: string,
    updates: {
      name?: string;
      date?: string;
      startsAt?: string;
      endsAt?: string;
      expectedAttendance?: number;
      dwellMinutes?: number;
      status?: 'live' | 'closed';
    }
  ) => Promise<void>;
  deleteService: (serviceId: string) => Promise<void>;

  // People & Members
  members: Person[];
  visitorsCount: number;
  serviceVisitorsCount: number;
  refreshMembers: () => Promise<void>;
  addVisitor: (name: string, phone: string, howHeard: string, preferredGroupName?: string) => Promise<void>;
  addMember: (memberData: Omit<Person, 'id' | 'tenantId' | 'avatarInitials' | 'joinedOn'>) => Promise<Person>;
  validateMemberImportRemote: (
    candidateMembers: Record<string, unknown>[],
    duplicateMode?: ImportDuplicateMode
  ) => Promise<{
    summary: MemberImportValidationSummary;
    rows: ValidatedImportRow[];
    license?: {
      allowed: boolean;
      code: string;
      message: string;
      seatsUsed: number;
      seatsLimit: number;
      remainingSeats: number | null;
      wouldExceedSeatLimit: boolean;
    };
    source: 'server' | 'local';
  }>;
  batchImportMembers: (
    newMembers: Person[],
    options?: { duplicateMode?: ImportDuplicateMode }
  ) => Promise<Person[]>;
  updateMember: (memberId: string, updates: Partial<Person>) => Promise<Person>;
  updateOwnProfile: (updates: Partial<Person>) => Promise<Person>;
  deleteMember: (memberId: string) => Promise<void>;
  updateMemberConsent: (autoCheckin: boolean, push: boolean, sms: boolean, email: boolean) => Promise<void>;

  // System Settings & Live Church Premise Location (Supabase Postgres RLS)
  systemSettings: SystemSettings;
  systemSettingsStorageBackend: 'supabase' | 'sandbox_ephemeral';
  isSyncingSystemSettings: boolean;
  refreshSystemSettings: () => Promise<void>;
  updateSystemSettings: (newSettings: Partial<SystemSettings>) => Promise<boolean>;
  resetSystemSettings: () => Promise<boolean>;
  communicationStatus: CommunicationGatewayStatusState;
  refreshCommunicationStatus: () => Promise<void>;
  saveTenantGatewayKeys: (patch: {
    arkeselApiKey?: string;
    clearArkeselApiKey?: boolean;
    paystackPublicKey?: string;
    paystackSecretKey?: string;
    clearPaystackKeys?: boolean;
  }) => Promise<{ success: boolean; message: string }>;
  testPaystackGateway: () => Promise<{ success: boolean; mode?: 'live' | 'test' | 'unconfigured'; message: string }>;
  sendTestSmsGateway: (
    provider: string,
    senderId: string,
    recipientPhone?: string
  ) => Promise<{ success: boolean; message: string }>;
  sendTestEmailGateway: (params: {
    recipientEmail: string;
    fromEmail?: string;
    fromName?: string;
  }) => Promise<{ success: boolean; message: string }>;
  sendCommunicationBroadcast: (params: {
    channel: 'push' | 'sms' | 'email';
    audience: string;
    subject: string;
    body: string;
  }) => Promise<{ success: boolean; sentCount?: number; message: string }>;
  setChurchPremiseLocation: (params: {
    lat: number;
    lng: number;
    accuracyM?: number | null;
    churchName?: string;
    campusName?: string;
    campusAddress?: string;
    innerGeofenceMeters?: number;
    outerGeofenceMeters?: number;
    dwellTimeMinutes?: number;
  }) => Promise<boolean>;
  clearChurchPremiseLocation: () => Promise<void>;
  refreshLivePremise: () => Promise<void>;

  // Ministries, Fellowships & Cell Groups Management (Supabase Postgres RLS)
  churchGroups: ChurchGroup[];
  leadershipHistory: ChurchGroupLeadershipHistoryEntry[];
  isLoadingLeadershipHistory: boolean;
  refreshChurchGroups: () => Promise<void>;
  refreshLeadershipHistory: () => Promise<void>;
  addChurchGroup: (
    group: Omit<ChurchGroup, 'id' | 'createdAt'>
  ) => Promise<{ ok: boolean; group?: ChurchGroup; field?: string; message?: string }>;
  updateChurchGroup: (
    id: string,
    updates: Partial<ChurchGroup> & { leadershipChangeReason?: string }
  ) => Promise<{ ok: boolean; group?: ChurchGroup; field?: string; message?: string }>;
  deleteChurchGroup: (id: string) => void;
  toggleChurchGroupStatus: (id: string) => void;
  getGroupMembers: (groupName: string) => Person[];



  // Attendance Records & Metrics
  attendanceRecords: AttendanceRecord[];
  totalCheckedInCount: number;
  expectedAttendance: number;
  attendancePercentage: number;
  autoCheckinOptedInCount: number;
  totalMembersCount: number;
  optInPercentage: number;
  telemetrySummary: LiveTelemetrySummary;

  // Check-in Actions
  checkInPerson: (
    personId: string,
    method: CheckinMethod,
    confidence?: number,
    note?: string,
    serviceIdOverride?: string
  ) => boolean;
  checkInPersonAsync: (
    personId: string,
    method: CheckinMethod,
    confidence?: number,
    note?: string,
    serviceIdOverride?: string
  ) => Promise<boolean>;
  checkInWithServiceQr: (
    payload: string | ParsedServiceQrPayload,
    targetPersonIdOverride?: string
  ) => Promise<ServiceQrCheckInResult>;
  removeCheckIn: (personId: string, serviceIdOverride?: string) => Promise<void>;

  // Usher PWA Offline simulation
  isUsherOnline: boolean;
  setIsUsherOnline: (online: boolean) => void;
  pendingSyncCount: number;
  syncUsherCheckins: () => number;

  // Proximity Simulator
  proximityStage: 0 | 1 | 2 | 3; // 0=Outside, 1=300m Outer, 2=100m Inner/Dwell, 3=Checked In
  dwellTimerSeconds: number;
  isBeaconDetected: boolean;
  setIsBeaconDetected: (detected: boolean) => void;
  advanceProximityStage: () => void;
  resetProximity: () => void;
  triggerBeaconScan: () => void;
  triggerDwellComplete: () => void;

  // Follow-up & Pastoral Care
  followupTasks: FollowupTask[];
  isAutoAssigningAbsentees: boolean;
  pastoralMonitor: PastoralCareMonitorSummary | null;
  isLoadingPastoralMonitor: boolean;
  isRunningAbsenceSweep: boolean;
  isSendingLeaderReminders: boolean;
  myLeaderReminders: { tasks: FollowupTask[]; dispatches: PastoralCareDispatch[] };
  fetchPastoralMonitor: () => Promise<PastoralCareMonitorSummary | null>;
  fetchMyLeaderReminders: () => Promise<{ tasks: FollowupTask[]; dispatches: PastoralCareDispatch[] }>;
  runAbsenceSweep: (options?: {
    eventId?: string;
    force?: boolean;
  }) => Promise<ServiceAbsenceSweepResult | null>;
  sendLeaderCareReminders: (options?: {
    taskId?: string;
    leaderName?: string;
  }) => Promise<{ sentCount: number; message?: string }>;
  acknowledgeLeaderReminder: (taskId: string) => Promise<FollowupTask | null>;
  resolveFollowupTask: (
    taskId: string,
    outcome: string,
    nextStatus?: 'open' | 'contacted' | 'resolved' | 'dismissed'
  ) => Promise<void>;
  updateFollowupTask: (
    taskId: string,
    patch: {
      status?: 'open' | 'contacted' | 'resolved' | 'dismissed';
      outcome?: string;
      assignedToName?: string;
      notes?: string;
    }
  ) => Promise<FollowupTask | null>;
  deleteFollowupTask: (taskId: string) => Promise<boolean>;
  addFollowupTask: (personId: string, reason: 'absent_2' | 'absent_3' | 'first_timer' | 'manual', notes: string) => Promise<void>;
  autoAssignAbsentees: (options?: {
    unarrivedMemberIds?: string[];
    silent?: boolean;
  }) => Promise<{ assignedCount: number; message?: string }>;

  // Member App States
  memberConsents: {
    autoCheckin: boolean;
    push: boolean;
    sms: boolean;
    email: boolean;
  };
  memberRsvps: Record<string, boolean>;
  toggleRsvp: (eventName: string, eventId?: string) => Promise<void>;
  donations: Donation[];
  submitDonation: (amountGhs: number, fund: string, method: 'MTN MoMo' | 'Telecel Cash' | 'Card') => Promise<boolean>;
  initializePaystackGiving: (params: {
    amountGhs: number;
    fundName: string;
    provider: 'MTN MoMo' | 'Telecel Cash' | 'Card';
    email?: string;
  }) => Promise<{
    success: boolean;
    authorizationUrl?: string;
    reference?: string;
    publicKey?: string;
    mode?: 'live' | 'test' | 'unconfigured';
    message?: string;
  }>;
  verifyPaystackGiving: (reference: string) => Promise<{
    success: boolean;
    verified: boolean;
    status?: 'paid' | 'pending' | 'failed';
    message: string;
  }>;
  churchWallPosts: ChurchWallPost[];
  refreshChurchWallPosts: () => Promise<void>;
  addChurchWallPost: (input: {
    message: string;
    category?: 'birthday' | 'testimony' | 'celebration';
    targetMemberId?: string;
    targetMemberName?: string;
  }) => Promise<ChurchWallPost>;
  toggleChurchWallAmen: (postId: string) => Promise<void>;

  // Audit Logs & Toasts
  auditLogs: AuditLogItem[];
  refreshAuditLogs: () => Promise<void>;
  toastMessage: string | null;
  showToast: (msg: string) => void;

  // Platform View Navigation
  viewMode: AppViewMode;
  setViewMode: (mode: AppViewMode) => void;

  // Multi-Tenant Platform Management
  tenants: TenantChurch[];
  addTenant: (data: Omit<TenantChurch, 'id' | 'createdAt'>) => void;
  updateTenant: (id: string, updates: Partial<TenantChurch>) => void;
  toggleTenantStatus: (id: string) => void;
  deleteTenant: (id: string) => void;
  impersonateTenant: (target: TenantChurch | string) => void;

  // License Orchestration
  licenses: SystemLicense[];
  renewLicense: (licenseId: string, durationMonths: number) => void;
  updateLicense: (id: string, updates: Partial<SystemLicense>) => void;
  issueLicense: (tenantId: string, tier: LicenseTier, billingCycle: BillingCycle) => SystemLicense;

  // Landing Page CMS Config
  landingConfig: LandingPageConfig;
  updateLandingConfig: (updates: Partial<LandingPageConfig>) => void;
  resetLandingConfig: () => void;
}

export const DEFAULT_LANDING_CONFIG: LandingPageConfig = {
  heroTitle: 'Next-Gen Presence Radar & Sovereign Church Management',
  heroSubtitle:
    'Real-time automated geofence attendance, multi-role pastoral dashboards, usher door check-in station, and personal congregation mobile passes.',
  announcementBadge: 'Ekklesphere Sovereign Geofence Radar Live',
  isAnnouncementActive: true,
  contactSalesEmail: 'contact@ekklesphere.platform',
  demoEnabled: false,
  showcaseHeadline: 'Transforming Sanctuary Operations with Sovereign Geofence Radar',
  featuredStats: {
    congregationsServed: 'Live',
    checkinsRecorded: 'Real-Time',
    proximityAccuracy: '100m Dwell',
    networkUptime: '99.98%',
  },
};

const formatLocalDateIso = (d: Date = new Date()): string => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const formatDisplayDateLabel = (isoDate?: string): string => {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate || '';
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return isoDate;
  return dt.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
};

const UNSCHEDULED_SERVICE_PLACEHOLDER: ServiceInstance = {
  id: '',
  serviceId: '',
  campusId: '00000000-0000-0000-0000-000000000001',
  name: 'No Service Scheduled',
  date: '',
  startsAt: '--:--',
  endsAt: '--:--',
  status: 'closed',
  expectedAttendance: 0,
};

const DEMO_USER_IDS = new Set(['u-admin-1', 'u-usher-1', 'u-member-1']);
const DEMO_USER_EMAILS = new Set([
  'pastor.david@ekklesphere.org',
  'samuel.usher@ekklesphere.org',
  'ama.mensah@gmail.com',
]);

const EkklesphereContext = createContext<EkklesphereContextType | undefined>(undefined);

const getUsableLocalToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('ekklesphere_token')?.trim();
    if (!raw) return null;
    const parts = raw.split('.');
    if (parts.length !== 3 || !parts[1]) {
      localStorage.removeItem('ekklesphere_token');
      localStorage.removeItem('ekklesphere_user');
      return null;
    }
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded)) as { exp?: number };
    if (typeof payload?.exp === 'number' && payload.exp * 1000 <= Date.now()) {
      localStorage.removeItem('ekklesphere_token');
      localStorage.removeItem('ekklesphere_user');
      return null;
    }
    return raw;
  } catch {
    return null;
  }
};

const SESSION_LAST_ACTIVITY_KEY = 'ekklesphere_last_activity_at';
const SESSION_EXPIRED_NOTICE_KEY = 'ekklesphere_session_timeout_notice';
const DEFAULT_IDLE_TIMEOUT_MINUTES = 30;

function normalizeClientSessionTimeoutMinutes(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return DEFAULT_IDLE_TIMEOUT_MINUTES;
  if (num <= 0) return 0;
  return Math.max(1, Math.min(480, Math.round(num)));
}

export const EkklesphereProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => {
    try {
      const usableToken = getUsableLocalToken();
      const saved = localStorage.getItem('ekklesphere_user');
      if (usableToken && saved) {
        const parsed: AuthUser = JSON.parse(saved);
        if (
          parsed &&
          !DEMO_USER_IDS.has(parsed.id) &&
          !DEMO_USER_EMAILS.has((parsed.email || '').toLowerCase())
        ) {
          return { ...parsed, token: parsed.token || usableToken };
        }
      }
      localStorage.removeItem('ekklesphere_user');
    } catch {
      // ignore invalid storage
    }
    return null;
  });

  const [isSessionVerified, setIsSessionVerified] = useState<boolean>(false);
  const [isVerifyingSession, setIsVerifyingSession] = useState<boolean>(() => Boolean(getUsableLocalToken()));
  const [sessionWarningSecondsLeft, setSessionWarningSecondsLeft] = useState<number | null>(null);
  const [sessionTimeoutOverrideMinutes, setSessionTimeoutOverrideMinutes] = useState<number | null>(null);
  const [sessionExpiredNotice, setSessionExpiredNotice] = useState<string | null>(() => {
    try {
      return typeof window !== 'undefined' ? sessionStorage.getItem(SESSION_EXPIRED_NOTICE_KEY) : null;
    } catch {
      return null;
    }
  });
  const currentUserRef = useRef<AuthUser | null>(currentUser);
  currentUserRef.current = currentUser;
  const lastActivityAtRef = useRef<number>(Date.now());
  const lastKeepaliveAtRef = useRef<number>(Date.now());
  const keepaliveInFlightRef = useRef<boolean>(false);

  const clearSessionExpiredNotice = () => {
    setSessionExpiredNotice(null);
    try {
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem(SESSION_EXPIRED_NOTICE_KEY);
      }
    } catch {}
  };

  const [activePortalState, setActivePortalState] = useState<'admin' | 'member' | 'usher' | 'simulator'>('admin');

  // Role-enforced portal switcher: prevents unauthorized role traversal
  const setActivePortal = (portal: 'admin' | 'member' | 'usher' | 'simulator') => {
    if (!currentUser) {
      setActivePortalState(portal);
      return;
    }

    if (currentUser.role === 'member' && portal !== 'member') {
      showToast('Access Restricted: Members only have access to the Member Portal.');
      return;
    }

    if (currentUser.role === 'usher' && portal !== 'usher') {
      showToast('Access Restricted: Ushers only have access to the Door Check-in Station.');
      return;
    }

    setActivePortalState(portal);
  };

  const activePortal = activePortalState;

  // Sync active portal immediately whenever current user's role changes
  useEffect(() => {
    if (currentUser) {
      if (currentUser.role === 'admin') setActivePortalState('admin');
      else if (currentUser.role === 'usher') setActivePortalState('usher');
      else if (currentUser.role === 'member') setActivePortalState('member');
    }
  }, [currentUser?.role]);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 1280;
    }
    return false;
  });
  const [isMobileNavOpen, setIsMobileNavOpen] = useState<boolean>(false);
  const [adminSubTab, setAdminSubTab] = useState<'dashboard' | 'history' | 'insights' | 'workflows' | 'users' | 'pastoral' | 'integrations' | 'proximity' | 'settings'>('dashboard');
  const [requestedSettingsTab, setRequestedSettingsTab] = useState<{
    tab: SettingsTabId;
    groupIntent?: SettingsGroupIntent;
    nonce: number;
  } | null>(null);
  const requestOpenSettings = (tab: SettingsTabId, groupIntent?: SettingsGroupIntent) => {
    setActivePortal('admin');
    setAdminSubTab('settings');
    setRequestedSettingsTab({ tab, groupIntent, nonce: Date.now() });
  };
  const [requestedUserTarget, setRequestedUserTarget] = useState<{
    memberId?: string;
    searchQuery?: string;
    filter?: 'all' | 'members' | 'staff' | 'has_login' | 'unprovisioned' | 'temp_password' | 'suspended';
    nonce: number;
  } | null>(null);
  const requestOpenUserManagement = (target?: {
    memberId?: string;
    searchQuery?: string;
    filter?: 'all' | 'members' | 'staff' | 'has_login' | 'unprovisioned' | 'temp_password' | 'suspended';
  }) => {
    setActivePortal('admin');
    setAdminSubTab('users');
    setRequestedUserTarget({
      memberId: target?.memberId,
      searchQuery: target?.searchQuery,
      filter: target?.filter,
      nonce: Date.now(),
    });
  };
  const [requestedAnalyticsTarget, setRequestedAnalyticsTarget] = useState<AnalyticsJumpTarget | null>(null);
  const requestOpenAnalytics = (target?: Omit<AnalyticsJumpTarget, 'nonce'>) => {
    setActivePortal('admin');
    setAdminSubTab('dashboard');
    setRequestedAnalyticsTarget({
      lens: target?.lens || 'ministries',
      searchQuery: target?.searchQuery,
      categoryFilter: target?.categoryFilter,
      nonce: Date.now(),
    });
  };
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isAddServiceOpen, setIsAddServiceOpen] = useState<boolean>(false);
  const [isFollowupModalOpen, setIsFollowupModalOpen] = useState<boolean>(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState<boolean>(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState<boolean>(false);
  const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] = useState<boolean>(false);

  // Platform view navigation: '/' defaults to the Ekklesphere App ('app');
  // '/home' (or ?church=...) renders ChurchHomePage; '/creator' is Creator Console.
  const resolveRouteViewMode = (): AppViewMode | null => {
    if (typeof window === 'undefined') return null;
    const path = window.location.pathname.toLowerCase();
    const params = new URLSearchParams(window.location.search);
    const viewParam = params.get('view')?.toLowerCase();

    if (path === '/home' || viewParam === 'home' || params.has('church')) {
      return 'home';
    }
    if (
      path === '/app' ||
      path === '/login' ||
      path === '/signin' ||
      path === '/signup' ||
      path === '/register' ||
      path === '/portal' ||
      viewParam === 'app' ||
      params.has('auth')
    ) {
      return 'app';
    }
    if (path === '/creator' || path === '/console' || viewParam === 'creator') {
      return 'creator';
    }
    return null;
  };

  const [viewMode, setViewModeState] = useState<AppViewMode>(() => {
    const fromRoute = resolveRouteViewMode();
    if (fromRoute) return fromRoute;

    try {
      const saved = localStorage.getItem('ekklesphere_view_mode');
      if (saved === 'app' || saved === 'creator') {
        return saved as AppViewMode;
      }
    } catch {
      // fallback
    }
    return 'app';
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handlePopState = () => {
      const next = resolveRouteViewMode();
      setViewModeState(next || 'app');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const setViewMode = (mode: AppViewMode, actingUser?: AuthUser | null) => {
    const userToCheck = actingUser !== undefined ? actingUser : currentUser;
    const isCreatorAllowed =
      userToCheck?.role === 'super_admin' ||
      userToCheck?.role === 'creator' ||
      userToCheck?.verifiedRole === 'super_admin' ||
      userToCheck?.verifiedRole === 'creator' ||
      Boolean(userToCheck?.is_creator);

    if (mode === 'creator' && !isCreatorAllowed) {
      showToast('Access Denied: Creator console requires Super Admin or Creator role.');
      return;
    }
    setViewModeState(mode);
    try {
      localStorage.setItem('ekklesphere_view_mode', mode);
      if (typeof window !== 'undefined') {
        const nextPath =
          mode === 'home'
            ? '/home'
            : mode === 'creator'
            ? '/creator'
            : '/app';
        if (window.location.pathname.toLowerCase() !== nextPath) {
          window.history.pushState({}, '', `${nextPath}${window.location.search}`);
        }
      }
    } catch {
      // ignore
    }
  };

  const getAuthHeaders = (extraHeaders?: Record<string, string>): Record<string, string> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...extraHeaders,
    };
    const token =
      currentUser?.token ||
      (typeof window !== 'undefined' ? localStorage.getItem('ekklesphere_token') : null);
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  };

  const handleUnauthorizedSession = (
    status: number,
    reason?: 'timeout' | 'unauthorized'
  ): boolean => {
    if (status !== 401) return false;
    setIsSessionVerified(false);
    setIsVerifyingSession(false);
    setSessionWarningSecondsLeft(null);
    setSessionTimeoutOverrideMinutes(null);
    setCurrentUser(null);
    if (reason === 'timeout') {
      const msg = 'Your session timed out due to inactivity. Please sign in again to continue.';
      setSessionExpiredNotice(msg);
      try {
        if (typeof window !== 'undefined') {
          sessionStorage.setItem(SESSION_EXPIRED_NOTICE_KEY, msg);
        }
      } catch {}
    }
    try {
      localStorage.removeItem('ekklesphere_token');
      localStorage.removeItem('ekklesphere_user');
      localStorage.removeItem(SESSION_LAST_ACTIVITY_KEY);
    } catch {}
    return true;
  };

  // Multi-Tenant Platform Management (loaded strictly from server/Supabase API)
  const [tenants, setTenants] = useState<TenantChurch[]>([]);
  const [licenses, setLicenses] = useState<SystemLicense[]>([]);

  const [landingConfig, setLandingConfig] = useState<LandingPageConfig>(() => {
    try {
      const saved = localStorage.getItem('ekklesphere_landing_config');
      if (saved) {
        return { ...DEFAULT_LANDING_CONFIG, ...JSON.parse(saved) };
      }
    } catch {
      // fallback
    }
    return DEFAULT_LANDING_CONFIG;
  });

  const addTenant = (data: Omit<TenantChurch, 'id' | 'createdAt'>) => {
    const newId = `t-${Date.now()}`;
    const newTenant: TenantChurch = {
      ...data,
      id: newId,
      createdAt: new Date().toISOString(),
    };
    setTenants((prev) => {
      const updated = [newTenant, ...prev];
      try {
        localStorage.setItem('ekklesphere_tenants', JSON.stringify(updated));
      } catch {}
      return updated;
    });
    issueLicense(newId, data.licenseTier, data.billingCycle);
    showToast(`Tenant "${data.name}" provisioned successfully`);
  };

  const updateTenant = (id: string, updates: Partial<TenantChurch>) => {
    setTenants((prev) => {
      const updated = prev.map((t) => (t.id === id ? { ...t, ...updates } : t));
      try {
        localStorage.setItem('ekklesphere_tenants', JSON.stringify(updated));
      } catch {}
      return updated;
    });
    showToast('Tenant configuration saved');
  };

  const toggleTenantStatus = (id: string) => {
    setTenants((prev) => {
      const updated = prev.map((t) => {
        if (t.id !== id) return t;
        const nextStatus: TenantStatus = t.status === 'active' ? 'suspended' : 'active';
        return { ...t, status: nextStatus };
      });
      try {
        localStorage.setItem('ekklesphere_tenants', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  const deleteTenant = (id: string) => {
    setTenants((prev) => {
      const updated = prev.filter((t) => t.id !== id);
      try {
        localStorage.setItem('ekklesphere_tenants', JSON.stringify(updated));
      } catch {}
      return updated;
    });
    setLicenses((prev) => {
      const updated = prev.filter((l) => l.tenantId !== id);
      try {
        localStorage.setItem('ekklesphere_licenses', JSON.stringify(updated));
      } catch {}
      return updated;
    });
    showToast('Tenant removed');
  };

  const impersonateTenant = (target: TenantChurch | string) => {
    const tenant = typeof target === 'string' ? tenants.find((t) => t.id === target) : target;
    if (!tenant) return;
    setCurrentUser((prev) => {
      if (!prev) return prev;
      const updated: AuthUser = { ...prev, organizationName: tenant.name };
      try {
        localStorage.setItem('ekklesphere_user', JSON.stringify(updated));
      } catch {}
      return updated;
    });
    updateSystemSettings({
      churchName: tenant.name,
      campusName: `${tenant.name} (${tenant.campusCode})`,
      seniorPastor: tenant.seniorPastor,
      contactEmail: tenant.contactEmail,
      contactPhone: tenant.contactPhone,
      outerGeofenceMeters: tenant.geofenceRadiusMeters,
    });
    setViewMode('app');
    showToast(`Switched workspace to ${tenant.name}`);
  };

  const issueLicense = (tenantId: string, tier: LicenseTier, billingCycle: BillingCycle): SystemLicense => {
    const matchedTenant = tenants.find((t) => t.id === tenantId);
    const tenantName = matchedTenant ? matchedTenant.name : 'Organisation';
    const prefix = tenantName.replace(/[^A-Za-z0-9]/g, '').substring(0, 6).toUpperCase() || 'EKKLE';
    const key = `LIC-${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const now = new Date();
    const expires = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

    const newLicense: SystemLicense = {
      id: `lic-${Date.now()}`,
      key,
      tier,
      tenantId,
      tenantName,
      seatsLimit: tier === 'cathedral_enterprise' ? 2000 : tier === 'ministry_pro' ? 800 : 250,
      status: 'active',
      issuedDate: now.toISOString().split('T')[0],
      expiresDate: expires.toISOString().split('T')[0],
      billingCycle,
      annualCostUSD: tier === 'cathedral_enterprise' ? 1200 : tier === 'ministry_pro' ? 480 : 180,
      enabledFeatures: [
        'Geofence Radar v2',
        'Door Usher Headcount',
        'GhanaPost GPS & 28-Field Registry',
        ...(tier !== 'grace_starter' ? ['Mobile Giving MoMo', 'SMS & Push Notifications'] : []),
        ...(tier === 'cathedral_enterprise' ? ['Custom Domain', 'Multi-Campus Sync', 'Audit Trail'] : []),
      ],
    };

    setLicenses((prev) => {
      const updated = [newLicense, ...prev];
      try {
        localStorage.setItem('ekklesphere_licenses', JSON.stringify(updated));
      } catch {}
      return updated;
    });

    return newLicense;
  };

  const renewLicense = (licenseId: string, durationMonths: number = 12) => {
    setLicenses((prev) => {
      const updated = prev.map((lic) => {
        if (lic.id !== licenseId) return lic;
        const currentExpiry = new Date(lic.expiresDate);
        const newExpiry = new Date(
          (isNaN(currentExpiry.getTime()) ? new Date() : currentExpiry).getTime() +
            durationMonths * 30 * 24 * 60 * 60 * 1000
        );
        return {
          ...lic,
          status: 'active' as const,
          expiresDate: newExpiry.toISOString().split('T')[0],
        };
      });
      try {
        localStorage.setItem('ekklesphere_licenses', JSON.stringify(updated));
      } catch {}
      return updated;
    });
    showToast('License successfully renewed');
  };

  const updateLicense = (id: string, updates: Partial<SystemLicense>) => {
    setLicenses((prev) => {
      const updated = prev.map((l) => (l.id === id ? { ...l, ...updates } : l));
      try {
        localStorage.setItem('ekklesphere_licenses', JSON.stringify(updated));
      } catch {}
      return updated;
    });
    showToast('License terms updated');
  };

  const updateLandingConfig = (updates: Partial<LandingPageConfig>) => {
    setLandingConfig((prev) => {
      const updated = { ...prev, ...updates };
      try {
        localStorage.setItem('ekklesphere_landing_config', JSON.stringify(updated));
      } catch {}
      return updated;
    });
    showToast('Landing page CMS saved');
  };

  const resetLandingConfig = () => {
    setLandingConfig(DEFAULT_LANDING_CONFIG);
    try {
      localStorage.removeItem('ekklesphere_landing_config');
    } catch {}
    showToast('Landing page settings reset to defaults');
  };

  const toggleSidebar = () => {
    setIsSidebarCollapsed((prev) => !prev);
  };

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768 && window.innerWidth < 1280) {
        setIsSidebarCollapsed(true);
      }
      if (window.innerWidth >= 768) {
        setIsMobileNavOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [isGoogleAuthLoading, setIsGoogleAuthLoading] = useState(false);
  const [googleAuthError, setGoogleAuthError] = useState<string | null>(null);

  const clearGoogleAuthError = () => setGoogleAuthError(null);

  const buildAuthUserFromServer = (
    payload: {
      id: string;
      email: string;
      name: string;
      role: UserRole;
      designation?: string;
      organizationId?: string;
      organization_id?: string;
      organizationName?: string;
      tenant_id?: string;
      isCreator?: boolean;
      is_creator?: boolean;
      username?: string;
      avatar?: string;
      mustChangePassword?: boolean;
    },
    token: string,
    orgNameOverride?: string
  ): AuthUser => {
    const role = payload.role;
    const isCreator = Boolean(
      payload.isCreator || payload.is_creator || role === 'creator' || role === 'super_admin'
    );
    const orgId = (payload.organizationId || payload.organization_id || payload.tenant_id || '').toLowerCase() || undefined;
    const resolvedOrgName =
      (orgNameOverride || payload.organizationName || systemSettings.churchName || '').trim() || undefined;
    const matchedMember = members.find(
      (m) => m.id === payload.id || (payload.email && (m.email || '').toLowerCase() === payload.email.toLowerCase())
    );
    const resolvedDesignation =
      (payload.designation || matchedMember?.designation || matchedMember?.officerName || '').trim() || undefined;
    const displayName = (payload.name || payload.email?.split('@')[0] || 'Ekklesphere User').trim();
    const initials =
      displayName
        .split(' ')
        .filter(Boolean)
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase() || 'EU';

    const canOversight = canMonitorPastoralCare({
      role,
      designation: resolvedDesignation,
      is_creator: isCreator,
    });

    return {
      id: payload.id,
      name: displayName,
      email: payload.email || '',
      role,
      verifiedRole: role,
      designation: resolvedDesignation,
      is_creator: isCreator,
      mustChangePassword: Boolean(payload.mustChangePassword),
      token,
      username: payload.username,
      avatar: payload.avatar || matchedMember?.imageUrl,
      initials,
      memberId: matchedMember?.id || payload.id,
      organization_id: orgId,
      tenant_id: orgId,
      organizationName: resolvedOrgName,
      campusName: systemSettings.campusName || 'Main Campus',
      title:
        role === 'creator' || role === 'super_admin'
          ? 'Platform Creator & Owner'
          : resolvedDesignation
          ? resolvedDesignation
          : role === 'admin' || role === 'pastor'
          ? 'Administrator / Executive Pastor'
          : role === 'usher'
          ? 'Door Steward / Usher'
          : matchedMember?.groupName
          ? `Member (${matchedMember.groupName})`
          : 'Congregation Member',
      permissions:
        role === 'creator' || role === 'super_admin'
          ? ['all_access', 'creator_console', 'pastoral_care', 'service_management', 'system_settings']
          : role === 'admin' || role === 'pastor'
          ? ['all_access', 'pastoral_care', 'service_management', 'system_settings']
          : canOversight
          ? ['pastoral_care', 'member_portal', 'proximity_checkin', 'giving', 'rsvp']
          : role === 'usher'
          ? ['checkin_members', 'register_visitors', 'offline_sync', 'proximity_radar']
          : ['member_portal', 'proximity_checkin', 'giving', 'rsvp'],
    };
  };

  const login = (user: AuthUser) => {
    const verifiedUser: AuthUser = {
      ...user,
      verifiedRole: user.verifiedRole || user.role,
    };
    const now = Date.now();
    lastActivityAtRef.current = now;
    lastKeepaliveAtRef.current = now;
    setSessionWarningSecondsLeft(null);
    clearSessionExpiredNotice();
    setCurrentUser(verifiedUser);
    setIsVerifyingSession(false);
    setIsSessionVerified(Boolean(verifiedUser.token));
    if (verifiedUser.role === 'creator' || verifiedUser.role === 'super_admin' || verifiedUser.is_creator) {
      setViewMode('creator', verifiedUser);
    } else {
      setViewMode('app', verifiedUser);
    }
    try {
      localStorage.setItem('ekklesphere_user', JSON.stringify(verifiedUser));
      localStorage.setItem(SESSION_LAST_ACTIVITY_KEY, String(now));
      if (verifiedUser.token) {
        localStorage.setItem('ekklesphere_token', verifiedUser.token);
      }
    } catch {
      // ignore
    }

    if (canMonitorPastoralCare(verifiedUser) || verifiedUser.role === 'finance') {
      setActivePortalState('admin');
    } else if (verifiedUser.role === 'usher') {
      setActivePortalState('usher');
    } else {
      setActivePortalState('member');
    }
  };

  const exchangeSupabaseAccessToken = async (accessToken: string): Promise<boolean> => {
    const res = await fetch('/api/auth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({}),
    });

    if (!res.ok) return false;
    const data = await res.json();
    if (!data?.token || !data?.user) return false;

    if (typeof data.idleTimeoutMinutes === 'number') {
      setSessionTimeoutOverrideMinutes(normalizeClientSessionTimeoutMinutes(data.idleTimeoutMinutes));
    }
    const resolvedOrgName = (data.organization?.name || data.organizationName || data.user?.organizationName || '').trim();
    if (resolvedOrgName) {
      setSystemSettings((prev) => {
        const nextSettings: SystemSettings = { ...prev, churchName: resolvedOrgName };
        try {
          localStorage.setItem('ekklesphere_system_settings', JSON.stringify(nextSettings));
        } catch {}
        return nextSettings;
      });
    }
    const authUser = buildAuthUserFromServer(data.user, data.token, resolvedOrgName || undefined);
    login(authUser);
    showToast(`Signed in as ${authUser.name}`);
    return true;
  };

  const signInWithGoogle = async () => {
    setIsGoogleAuthLoading(true);
    setGoogleAuthError(null);
    try {
      if (!isSupabaseBrowserConfigured) {
        const msg =
          'Google OAuth via Supabase is not configured in this preview environment (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). Sign in using your registered account credentials below.';
        setGoogleAuthError(msg);
        showToast(msg);
        return;
      }
      await signInWithSupabaseGoogle();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setGoogleAuthError(errMsg || 'Google OAuth sign-in could not be initiated.');
      showToast('Google sign-in could not start. Use account credentials below.');
    } finally {
      setIsGoogleAuthLoading(false);
    }
  };

  const logout = (options?: { reason?: 'manual' | 'timeout' }) => {
    const reason = options?.reason || 'manual';
    const existingToken =
      currentUserRef.current?.token ||
      currentUser?.token ||
      (typeof window !== 'undefined' ? localStorage.getItem('ekklesphere_token') : null);
    if (existingToken) {
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${existingToken}` },
      }).catch(() => {});
    }
    setIsSessionVerified(false);
    setIsVerifyingSession(false);
    setSessionWarningSecondsLeft(null);
    setSessionTimeoutOverrideMinutes(null);
    setCurrentUser(null);
    setGoogleAuthError(null);
    setIsChangePasswordModalOpen(false);
    setSystemSettings(DEFAULT_SYSTEM_SETTINGS);
    setChurchGroups([]);
    setLeadershipHistory([]);
    setMembers([]);
    setRawServices([]);
    setAttendanceRecords([]);
    setAuditLogs([]);
    setDonations([]);
    setFollowupTasks([]);
    setPastoralMonitor(null);
    setMyLeaderReminders({ tasks: [], dispatches: [] });
    setMemberConsents({ autoCheckin: true, push: true, sms: false, email: true });
    setMemberRsvps({});
    setPushSubscribersCount(0);
    try {
      signOutSupabaseBrowser().catch(() => {});
      localStorage.removeItem('ekklesphere_user');
      localStorage.removeItem('ekklesphere_token');
      localStorage.removeItem(SESSION_LAST_ACTIVITY_KEY);
      localStorage.removeItem('ekklesphere_view_mode');
      localStorage.removeItem('ekklesphere_system_settings');
      localStorage.removeItem('ekklesphere_church_groups');
      localStorage.removeItem('ekklesphere_tenants');
      localStorage.removeItem('ekklesphere_members');
      localStorage.removeItem('ekklesphere_services');
      localStorage.removeItem('ekklesphere_active_service_id');
      localStorage.removeItem('ekklesphere_licenses');
      localStorage.removeItem('ekklesphere_landing_config');
    } catch {
      // ignore
    }
    if (reason === 'timeout') {
      const timeoutMsg =
        'Your session timed out due to inactivity. Please sign in again to continue.';
      setSessionExpiredNotice(timeoutMsg);
      try {
        if (typeof window !== 'undefined') {
          sessionStorage.setItem(SESSION_EXPIRED_NOTICE_KEY, timeoutMsg);
        }
      } catch {}
    } else {
      clearSessionExpiredNotice();
    }
    setViewModeState('app');
    try {
      if (typeof window !== 'undefined') {
        const currentPath = window.location.pathname.toLowerCase();
        if (currentPath === '/creator' || currentPath === '/console' || currentPath === '/') {
          window.history.replaceState({}, '', '/app?auth=login');
          window.dispatchEvent(new PopStateEvent('popstate'));
        }
      }
    } catch {
      // ignore
    }
    showToast(
      reason === 'timeout'
        ? 'Session timed out due to inactivity.'
        : 'Signed out of Ekklesphere'
    );
  };

  const extendUserSession = async (): Promise<void> => {
    const now = Date.now();
    lastActivityAtRef.current = now;
    setSessionWarningSecondsLeft(null);
    try {
      localStorage.setItem(SESSION_LAST_ACTIVITY_KEY, String(now));
    } catch {}

    const activeUser = currentUserRef.current;
    const token =
      activeUser?.token ||
      (typeof window !== 'undefined' ? localStorage.getItem('ekklesphere_token') : null);
    if (!token || keepaliveInFlightRef.current) return;

    keepaliveInFlightRef.current = true;
    try {
      const res = await fetch('/api/auth/session/keepalive', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.status === 401) {
        logout({ reason: 'timeout' });
        return;
      }
      if (!res.ok) return;
      const data = await res.json().catch(() => ({}));
      lastKeepaliveAtRef.current = Date.now();
      if (typeof data?.idleTimeoutMinutes === 'number') {
        setSessionTimeoutOverrideMinutes(
          normalizeClientSessionTimeoutMinutes(data.idleTimeoutMinutes)
        );
      }
      if (data?.token && typeof data.token === 'string') {
        setCurrentUser((prev) => {
          if (!prev) return prev;
          const updated: AuthUser = { ...prev, token: data.token };
          try {
            localStorage.setItem('ekklesphere_token', data.token);
            localStorage.setItem('ekklesphere_user', JSON.stringify(updated));
          } catch {}
          return updated;
        });
      }
    } catch {
      // ignore transient keepalive errors; client countdown keeps running safely
    } finally {
      keepaliveInFlightRef.current = false;
    }
  };

  const changePassword = async (
    currentPassword: string,
    newPassword: string,
    confirmPassword?: string
  ): Promise<AuthActionResult> => {
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          currentPassword,
          newPassword,
          ...(confirmPassword !== undefined ? { confirmPassword } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        const errorMsg = data?.message || 'Could not update password.';
        showToast(errorMsg);
        return {
          ok: false,
          error: errorMsg,
          code: data?.code || 'PASSWORD_CHANGE_FAILED',
        };
      }

      setCurrentUser((prev) => {
        if (!prev) return prev;
        const updated: AuthUser = { ...prev, mustChangePassword: false };
        try {
          localStorage.setItem('ekklesphere_user', JSON.stringify(updated));
        } catch {}
        return updated;
      });
      setIsChangePasswordModalOpen(false);
      showToast('Password updated! Your personal password is now active.');
      return { ok: true };
    } catch {
      const msg = 'Unable to reach server to change password.';
      showToast(msg);
      return { ok: false, error: msg, code: 'NETWORK_ERROR' };
    }
  };

  const switchUserRole = (role: UserRole) => {
    if (!currentUser) return;
    const baseRole = currentUser.verifiedRole || currentUser.role;
    const isCreator = Boolean(
      currentUser.is_creator || baseRole === 'creator' || baseRole === 'super_admin'
    );
    const isAdmin = isCreator || baseRole === 'admin' || baseRole === 'pastor';

    // Strict least-privilege view switching: members can never switch into Admin/Usher portals
    if (!isAdmin) {
      if (baseRole === 'usher' && (role === 'usher' || role === 'member')) {
        // Usher can preview Member portal, nothing higher
      } else if (role !== baseRole) {
        showToast('Access Restricted: Only church administrators can preview other portals.');
        return;
      }
    }

    if ((role === 'creator' || role === 'super_admin') && !isCreator) {
      showToast('Access Denied: Creator role requires verified Creator privileges.');
      return;
    }

    const updatedUser: AuthUser = {
      ...currentUser,
      role,
      verifiedRole: baseRole,
      title:
        role === 'admin' || role === 'pastor'
          ? 'Administrator / Executive Pastor'
          : role === 'usher'
          ? 'Door Steward / Usher'
          : 'Congregation Member',
      permissions:
        role === 'admin' || role === 'pastor'
          ? ['all_access', 'pastoral_care', 'service_management', 'system_settings']
          : role === 'usher'
          ? ['checkin_members', 'register_visitors', 'offline_sync', 'proximity_radar']
          : ['member_portal', 'proximity_checkin', 'giving', 'rsvp'],
    };
    login(updatedUser);
    if (role === 'usher') {
      setActivePortalState('usher');
    } else if (role === 'member' || role === 'group_leader') {
      setActivePortalState('member');
    } else {
      setActivePortalState('admin');
    }
  };

  const loginWithCredentials = async (
    identifier: string,
    password: string
  ): Promise<AuthActionResult> => {
    const trimmedId = identifier.trim();
    const trimmedPass = password.trim();
    if (!trimmedId || !trimmedPass) {
      const msg = 'Email/username and password are required.';
      showToast(msg);
      return { ok: false, error: msg, code: 'INVALID_CREDENTIALS' };
    }

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: trimmedId,
          password: trimmedPass,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.token || !data?.user) {
        const errorMsg = data?.message || 'Invalid credentials.';
        showToast(errorMsg);
        return {
          ok: false,
          error: errorMsg,
          code: data?.code || 'INVALID_CREDENTIALS',
          retryAfterSeconds: data?.retryAfterSeconds,
        };
      }

      if (typeof data.idleTimeoutMinutes === 'number') {
        setSessionTimeoutOverrideMinutes(normalizeClientSessionTimeoutMinutes(data.idleTimeoutMinutes));
      }
      const resolvedOrgName = (data.organization?.name || data.organizationName || data.user?.organizationName || '').trim();
      if (resolvedOrgName) {
        setSystemSettings((prev) => {
          const nextSettings: SystemSettings = { ...prev, churchName: resolvedOrgName };
          try {
            localStorage.setItem('ekklesphere_system_settings', JSON.stringify(nextSettings));
          } catch {}
          return nextSettings;
        });
      }
      const authUser = buildAuthUserFromServer(
        {
          ...data.user,
          mustChangePassword: Boolean(data.mustChangePassword ?? data.user.mustChangePassword),
        },
        data.token,
        resolvedOrgName || undefined
      );
      login(authUser);
      if (authUser.mustChangePassword) {
        setIsChangePasswordModalOpen(true);
        showToast(`Welcome, ${authUser.name}! Please set your personal password.`);
      } else {
        showToast(`Welcome back, ${authUser.name}`);
      }
      return { ok: true };
    } catch {
      const msg = 'Authentication service unreachable. Please check your connection.';
      showToast(msg);
      return { ok: false, error: msg, code: 'NETWORK_ERROR' };
    }
  };

  const registerMember = async (params: {
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
    password: string;
    groupName?: string;
    autoCheckinOptedIn?: boolean;
    organizationSlug?: string;
  }): Promise<AuthActionResult> => {
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: params.firstName.trim(),
          lastName: params.lastName.trim(),
          email: params.email?.trim() || '',
          phone: params.phone?.trim() || '',
          password: params.password,
          groupName: params.groupName || 'General Congregation',
          autoCheckinOptedIn: params.autoCheckinOptedIn ?? true,
          organizationSlug: params.organizationSlug?.trim() || undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.token || !data?.user) {
        const errorMsg = data?.message || 'Registration failed. Please verify your details.';
        showToast(errorMsg);
        return {
          ok: false,
          error: errorMsg,
          code: data?.code || 'REGISTRATION_FAILED',
        };
      }

      const savedPerson = normalizePersonRecord({
        id: data.user.id,
        tenantId: data.user.organizationId,
        firstName: params.firstName.trim(),
        lastName: params.lastName.trim(),
        email: data.user.email,
        phoneE164: data.user.phoneE164,
        groupName: params.groupName || 'General Congregation',
        autoCheckinOptedIn: params.autoCheckinOptedIn ?? true,
        status: 'member',
      });
      setMembers((prev) => [savedPerson, ...prev.filter((m) => m.id !== savedPerson.id)]);

      if (typeof data.idleTimeoutMinutes === 'number') {
        setSessionTimeoutOverrideMinutes(normalizeClientSessionTimeoutMinutes(data.idleTimeoutMinutes));
      }
      const resolvedOrgName = (data.organization?.name || data.organizationName || data.user?.organizationName || '').trim();
      if (resolvedOrgName) {
        setSystemSettings((prev) => {
          const nextSettings: SystemSettings = { ...prev, churchName: resolvedOrgName };
          try {
            localStorage.setItem('ekklesphere_system_settings', JSON.stringify(nextSettings));
          } catch {}
          return nextSettings;
        });
      }
      const authUser = buildAuthUserFromServer(
        data.user,
        data.token,
        resolvedOrgName || undefined
      );
      login(authUser);
      showToast(`Welcome to ${resolvedOrgName || systemSettings.churchName || 'Ekklesphere'}, ${params.firstName.trim()}!`);
      return { ok: true };
    } catch {
      const msg = 'Unable to reach the registration server. Please try again.';
      showToast(msg);
      return { ok: false, error: msg, code: 'NETWORK_ERROR' };
    }
  };

  const registerOrganisation = async (params: {
    organizationName: string;
    orgType?: 'church' | 'organisation';
    city?: string;
    country?: string;
    adminFirstName: string;
    adminLastName: string;
    email: string;
    phone?: string;
    password: string;
    trialPlan?: LicenseTier;
  }): Promise<AuthActionResult> => {
    try {
      const res = await fetch('/api/auth/register-organisation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationName: params.organizationName.trim(),
          orgType: params.orgType || 'church',
          city: params.city?.trim() || 'Accra',
          country: params.country?.trim() || 'Ghana',
          adminFirstName: params.adminFirstName.trim(),
          adminLastName: params.adminLastName.trim(),
          email: params.email.trim().toLowerCase(),
          phone: params.phone?.trim() || '',
          password: params.password,
          trialPlan: params.trialPlan || 'grace_starter',
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.token || !data?.user) {
        const errorMsg =
          data?.message || 'Organisation trial sign-up failed. Please verify your details.';
        showToast(errorMsg);
        return {
          ok: false,
          error: errorMsg,
          code: data?.code || 'ORGANISATION_REGISTRATION_FAILED',
        };
      }

      if (data.organization) {
        setSystemSettings((prev) => {
          const nextSettings: SystemSettings = {
            ...prev,
            churchName: data.organization.name || params.organizationName.trim(),
            campusName: data.organization.city
              ? `${data.organization.city} Main Campus`
              : prev.campusName || 'Main Campus',
            seniorPastor: `${params.adminFirstName.trim()} ${params.adminLastName.trim()}`.trim(),
            contactEmail: data.user.email || params.email.trim().toLowerCase(),
            contactPhone: data.user.phoneE164 || params.phone?.trim() || prev.contactPhone,
          };
          try {
            localStorage.setItem('ekklesphere_system_settings', JSON.stringify(nextSettings));
          } catch {}
          return nextSettings;
        });
      }

      const founderMember = normalizePersonRecord({
        id: data.user.id,
        tenantId: data.user.organizationId,
        firstName: params.adminFirstName.trim(),
        lastName: params.adminLastName.trim(),
        email: data.user.email,
        phoneE164: data.user.phoneE164,
        groupName: 'Church Leadership',
        autoCheckinOptedIn: false,
        status: 'member',
      });
      setMembers([founderMember]);

      if (typeof data.idleTimeoutMinutes === 'number') {
        setSessionTimeoutOverrideMinutes(normalizeClientSessionTimeoutMinutes(data.idleTimeoutMinutes));
      }
      const authUser = buildAuthUserFromServer(
        data.user,
        data.token,
        data.organization?.name || params.organizationName.trim()
      );
      login(authUser);
      showToast(
        `${data.organization?.name || params.organizationName.trim()} 14-day free trial activated! You can upgrade anytime in Settings.`
      );
      return { ok: true };
    } catch {
      const msg = 'Unable to reach the registration server. Please try again.';
      showToast(msg);
      return { ok: false, error: msg, code: 'NETWORK_ERROR' };
    }
  };

  const [theme, setThemeState] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem('ekklesphere_theme');
      if (saved === 'dark' || saved === 'light') {
        return saved;
      }
      if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
      }
    } catch {
      // fallback
    }
    return 'light';
  });
  const [activeServiceId, setActiveServiceId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('ekklesphere_active_service_id');
      if (saved && !isPlaceholderServiceId(saved)) return saved;
    } catch {}
    return '';
  });
  const [serviceClockMs, setServiceClockMs] = useState<number>(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => {
      setServiceClockMs(Date.now());
    }, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const [rawServices, setRawServices] = useState<ServiceInstance[]>(() => {
    try {
      const saved = localStorage.getItem('ekklesphere_services');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter((s: ServiceInstance) => s && !isPlaceholderServiceId(s.id));
        }
      }
    } catch {}
    return [];
  });
  const [members, setMembers] = useState<Person[]>(() => {
    try {
      const saved = localStorage.getItem('ekklesphere_members');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((item) => normalizePersonRecord(item));
        }
      }
    } catch {}
    return [];
  });
  const [systemSettingsStorageBackend, setSystemSettingsStorageBackend] = useState<'supabase' | 'sandbox_ephemeral'>('supabase');
  const [isSyncingSystemSettings, setIsSyncingSystemSettings] = useState(false);
  const [systemSettings, setSystemSettings] = useState<SystemSettings>(() => {
    try {
      const saved = localStorage.getItem('ekklesphere_system_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        const cleaned: SystemSettings = {
          ...DEFAULT_SYSTEM_SETTINGS,
          ...parsed,
          churchName:
            parsed.churchName === 'Ekklesphere Sanctuary' ||
            parsed.churchName === 'Primary Church Organization'
              ? ''
              : parsed.churchName || '',
          campusName: parsed.campusName === 'Accra Central' ? '' : parsed.campusName || '',
          seniorPastor:
            parsed.seniorPastor === 'Pastor David Osei' ? '' : parsed.seniorPastor || '',
          contactEmail:
            parsed.contactEmail === 'admin@ekklesphere.org' ? '' : parsed.contactEmail || '',
          contactPhone:
            parsed.contactPhone === '+233 24 123 4567' ? '' : parsed.contactPhone || '',
        };
        localStorage.setItem('ekklesphere_system_settings', JSON.stringify(cleaned));
        return cleaned;
      }
    } catch {
      // fallback
    }
    return DEFAULT_SYSTEM_SETTINGS;
  });

  useEffect(() => {
    let active = true;

    // 1. Validate stored JWT against backend (/api/auth/me) so expired or tampered tokens fail closed
    const storedToken = getUsableLocalToken();
    if (storedToken) {
      setIsVerifyingSession(true);
      fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${storedToken}` },
      })
        .then(async (res) => {
          if (!active) return;
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            const timedOut =
              errData?.error === 'session_timed_out' || errData?.code === 'SESSION_TIMEOUT';
            if (timedOut) {
              const timeoutMsg =
                'Your previous session timed out due to inactivity. Please sign in again.';
              setSessionExpiredNotice(timeoutMsg);
              try {
                sessionStorage.setItem(SESSION_EXPIRED_NOTICE_KEY, timeoutMsg);
              } catch {}
            }
            localStorage.removeItem('ekklesphere_token');
            localStorage.removeItem('ekklesphere_user');
            localStorage.removeItem(SESSION_LAST_ACTIVITY_KEY);
            setIsSessionVerified(false);
            setCurrentUser(null);
            return;
          }
          const data = await res.json();
          if (data?.user && active) {
            const now = Date.now();
            lastActivityAtRef.current = now;
            lastKeepaliveAtRef.current = now;
            try {
              localStorage.setItem(SESSION_LAST_ACTIVITY_KEY, String(now));
            } catch {}
            if (typeof data.idleTimeoutMinutes === 'number') {
              setSessionTimeoutOverrideMinutes(
                normalizeClientSessionTimeoutMinutes(data.idleTimeoutMinutes)
              );
            }
            const resolvedOrgName = (
              data.organization?.name ||
              data.organizationName ||
              data.user?.organizationName ||
              ''
            ).trim();
            if (resolvedOrgName) {
              setSystemSettings((prev) => {
                if (prev.churchName?.trim() === resolvedOrgName) return prev;
                const nextSettings: SystemSettings = {
                  ...prev,
                  churchName: prev.churchName?.trim() || resolvedOrgName,
                };
                try {
                  localStorage.setItem('ekklesphere_system_settings', JSON.stringify(nextSettings));
                } catch {}
                return nextSettings;
              });
            }
            const hydrated = buildAuthUserFromServer(
              {
                id: data.user.id,
                email: data.user.email,
                name: data.user.name,
                role: data.user.role,
                designation:
                  data.user.designation ||
                  data.memberProfile?.designation ||
                  data.memberProfile?.officerName,
                organizationId: data.organizationId || data.user.organization_id,
                organizationName: resolvedOrgName || undefined,
                isCreator: data.isCreator,
                avatar: data.user.avatar || data.memberProfile?.imageUrl,
                mustChangePassword: Boolean(data.mustChangePassword ?? data.user.mustChangePassword),
              },
              storedToken,
              resolvedOrgName || undefined
            );
            setCurrentUser(hydrated);
            setIsSessionVerified(true);
            localStorage.setItem('ekklesphere_user', JSON.stringify(hydrated));
            if (data.memberProfile?.id) {
              const normalizedProfile = normalizePersonRecord(data.memberProfile);
              setMembers((prev) => {
                const exists = prev.some((m) => m.id === normalizedProfile.id);
                return exists
                  ? prev.map((m) => (m.id === normalizedProfile.id ? { ...m, ...normalizedProfile } : m))
                  : [normalizedProfile, ...prev];
              });
            }
          }
        })
        .catch(() => {})
        .finally(() => {
          if (active) {
            setIsVerifyingSession(false);
          }
        });
    } else {
      // Zero-trust rule: never retain cached user/organisation state without a verifiable Bearer token
      setIsSessionVerified(false);
      setIsVerifyingSession(false);
      try {
        localStorage.removeItem('ekklesphere_user');
        localStorage.removeItem('ekklesphere_system_settings');
        localStorage.removeItem('ekklesphere_tenants');
        localStorage.removeItem('ekklesphere_members');
        localStorage.removeItem('ekklesphere_services');
        localStorage.removeItem('ekklesphere_active_service_id');
        localStorage.removeItem('ekklesphere_church_groups');
        localStorage.removeItem('ekklesphere_licenses');
      } catch {}
      setSystemSettings(DEFAULT_SYSTEM_SETTINGS);
      setMembers([]);
      setRawServices([]);
      setChurchGroups([]);
      setLeadershipHistory([]);
      setAttendanceRecords([]);
      setDonations([]);
      setFollowupTasks([]);
      setPastoralMonitor(null);
      setMyLeaderReminders({ tasks: [], dispatches: [] });
      setMemberConsents({ autoCheckin: true, push: true, sms: false, email: true });
      setMemberRsvps({});
      if (currentUser) {
        setCurrentUser(null);
      }
    }

    // 2. Listen for Supabase OAuth redirects / auth state changes and exchange for backend JWT
    if (!supabaseBrowserClient) {
      return () => {
        active = false;
      };
    }

    const { data: authSub } = supabaseBrowserClient.auth.onAuthStateChange((_event, session) => {
      if (active && session?.access_token) {
        void exchangeSupabaseAccessToken(session.access_token);
      }
    });

    return () => {
      active = false;
      authSub?.subscription?.unsubscribe();
    };
  }, []);

  const effectiveSessionTimeoutMinutes = normalizeClientSessionTimeoutMinutes(
    sessionTimeoutOverrideMinutes ??
      systemSettings.sessionTimeoutMinutes ??
      DEFAULT_IDLE_TIMEOUT_MINUTES
  );

  // Sync override whenever org system settings load or update
  useEffect(() => {
    if (typeof systemSettings.sessionTimeoutMinutes === 'number') {
      setSessionTimeoutOverrideMinutes(
        normalizeClientSessionTimeoutMinutes(systemSettings.sessionTimeoutMinutes)
      );
    }
  }, [systemSettings.sessionTimeoutMinutes]);

  // Idle session timeout tracker across Member, Usher, Admin, and Creator sessions
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!currentUser?.token || effectiveSessionTimeoutMinutes <= 0) {
      setSessionWarningSecondsLeft(null);
      return;
    }

    const timeoutMs = effectiveSessionTimeoutMinutes * 60 * 1000;
    const warningWindowMs = timeoutMs <= 120_000 ? 20_000 : 60_000;
    const keepaliveIntervalMs = Math.min(4 * 60_000, Math.max(30_000, Math.floor(timeoutMs * 0.4)));

    const seedTimestamp = () => {
      const now = Date.now();
      let stored = 0;
      try {
        stored = Number(localStorage.getItem(SESSION_LAST_ACTIVITY_KEY) || 0);
      } catch {}
      if (!Number.isFinite(stored) || stored <= 0) {
        lastActivityAtRef.current = now;
        try {
          localStorage.setItem(SESSION_LAST_ACTIVITY_KEY, String(now));
        } catch {}
      } else {
        lastActivityAtRef.current = Math.max(lastActivityAtRef.current, stored);
      }
    };
    seedTimestamp();

    let lastMouseRecordAt = 0;
    let isWarningVisible = false;

    const recordUserActivity = (throttleMouse: boolean) => {
      // Once warning modal is visible, require deliberate Stay Signed In action or another tab activity
      if (isWarningVisible) return;
      const now = Date.now();
      if (throttleMouse && now - lastMouseRecordAt < 5000) return;
      if (throttleMouse) lastMouseRecordAt = now;
      lastActivityAtRef.current = now;
      try {
        localStorage.setItem(SESSION_LAST_ACTIVITY_KEY, String(now));
      } catch {}
    };

    const onExplicitActivity = () => recordUserActivity(false);
    const onPointerMove = () => recordUserActivity(true);

    const onStorageSync = (e: StorageEvent) => {
      if (e.key === 'ekklesphere_token' && !e.newValue) {
        handleUnauthorizedSession(401);
        return;
      }
      if (e.key === SESSION_LAST_ACTIVITY_KEY && e.newValue) {
        const parsed = Number(e.newValue);
        if (Number.isFinite(parsed) && parsed > lastActivityAtRef.current) {
          lastActivityAtRef.current = parsed;
          isWarningVisible = false;
          setSessionWarningSecondsLeft(null);
        }
      }
    };

    const evaluateSession = () => {
      if (!currentUserRef.current?.token) {
        setSessionWarningSecondsLeft(null);
        return;
      }
      const now = Date.now();
      const elapsedMs = now - lastActivityAtRef.current;
      const remainingMs = timeoutMs - elapsedMs;

      if (remainingMs <= 0) {
        isWarningVisible = false;
        setSessionWarningSecondsLeft(null);
        logout({ reason: 'timeout' });
        return;
      }

      if (remainingMs <= warningWindowMs) {
        isWarningVisible = true;
        setSessionWarningSecondsLeft(Math.max(1, Math.ceil(remainingMs / 1000)));
        return;
      }

      if (isWarningVisible) {
        isWarningVisible = false;
        setSessionWarningSecondsLeft(null);
      }

      // Periodically refresh sliding session token when user has been active recently
      if (
        now - lastActivityAtRef.current < 30_000 &&
        now - lastKeepaliveAtRef.current >= keepaliveIntervalMs &&
        !keepaliveInFlightRef.current
      ) {
        void extendUserSession();
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        try {
          const stored = Number(localStorage.getItem(SESSION_LAST_ACTIVITY_KEY) || 0);
          if (Number.isFinite(stored) && stored > lastActivityAtRef.current) {
            lastActivityAtRef.current = stored;
          }
        } catch {}
        evaluateSession();
      }
    };

    window.addEventListener('mousedown', onExplicitActivity, { passive: true });
    window.addEventListener('keydown', onExplicitActivity, { passive: true });
    window.addEventListener('touchstart', onExplicitActivity, { passive: true });
    window.addEventListener('pointerdown', onExplicitActivity, { passive: true });
    window.addEventListener('scroll', onExplicitActivity, { passive: true });
    window.addEventListener('mousemove', onPointerMove, { passive: true });
    window.addEventListener('storage', onStorageSync);
    document.addEventListener('visibilitychange', onVisibilityChange);

    evaluateSession();
    const intervalId = window.setInterval(evaluateSession, 1000);

    return () => {
      window.removeEventListener('mousedown', onExplicitActivity);
      window.removeEventListener('keydown', onExplicitActivity);
      window.removeEventListener('touchstart', onExplicitActivity);
      window.removeEventListener('pointerdown', onExplicitActivity);
      window.removeEventListener('scroll', onExplicitActivity);
      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('storage', onStorageSync);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.clearInterval(intervalId);
    };
  }, [currentUser?.id, currentUser?.token, effectiveSessionTimeoutMinutes]);

  const [churchGroups, setChurchGroups] = useState<ChurchGroup[]>(() => {
    try {
      const saved = localStorage.getItem('ekklesphere_church_groups');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const liveOnly = parsed.filter(
            (g: ChurchGroup) =>
              g &&
              typeof g.id === 'string' &&
              !g.id.startsWith('grp-min-') &&
              !g.id.startsWith('grp-fel-') &&
              !g.id.startsWith('grp-cell-')
          );
          localStorage.setItem('ekklesphere_church_groups', JSON.stringify(liveOnly));
          return liveOnly;
        }
      }
    } catch {
      // fallback
    }
    return [];
  });

  const [leadershipHistory, setLeadershipHistory] = useState<ChurchGroupLeadershipHistoryEntry[]>([]);
  const [isLoadingLeadershipHistory, setIsLoadingLeadershipHistory] = useState(false);
  const [followupTasks, setFollowupTasks] = useState<FollowupTask[]>([]);
  const [isAutoAssigningAbsentees, setIsAutoAssigningAbsentees] = useState(false);
  const [pastoralMonitor, setPastoralMonitor] = useState<PastoralCareMonitorSummary | null>(null);
  const [isLoadingPastoralMonitor, setIsLoadingPastoralMonitor] = useState(false);
  const [isRunningAbsenceSweep, setIsRunningAbsenceSweep] = useState(false);
  const [isSendingLeaderReminders, setIsSendingLeaderReminders] = useState(false);
  const [myLeaderReminders, setMyLeaderReminders] = useState<{
    tasks: FollowupTask[];
    dispatches: PastoralCareDispatch[];
  }>({ tasks: [], dispatches: [] });
  const [communicationStatus, setCommunicationStatus] = useState<CommunicationGatewayStatusState>({
    arkeselConfigured: false,
    arkeselSource: 'none',
    arkeselKeyMasked: null,
    resendConfigured: false,
    paystackConfigured: false,
    paystackSource: 'none',
    paystackPublicKey: '',
    paystackSecretMasked: null,
    paystackMode: 'unconfigured',
    defaultSmsSenderId: 'EKKLESPHERE',
    defaultFromEmail: 'onboarding@resend.dev',
    defaultFromName: 'Ekklesphere Church',
  });
  const autoAssignSyncedRef = useRef<string>('');
  const [isUsherOnline, setIsUsherOnline] = useState<boolean>(true);
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(0);


  // Proximity simulator states
  const [proximityStage, setProximityStage] = useState<0 | 1 | 2 | 3>(0);
  const [dwellTimerSeconds, setDwellTimerSeconds] = useState<number>(300); // 5 min
  const [isBeaconDetected, setIsBeaconDetected] = useState<boolean>(false);

  // Member App states
  const [memberConsents, setMemberConsents] = useState({
    autoCheckin: true,
    push: true,
    sms: false,
    email: true,
  });
  const [memberRsvps, setMemberRsvps] = useState<Record<string, boolean>>({});
  const [donations, setDonations] = useState<Donation[]>([]);

  // Real live attendance records synchronized across devices via /api/campus-premise & /api/live-checkins
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [telemetrySummary, setTelemetrySummary] = useState<LiveTelemetrySummary>({
    totalSignals: 0,
    accepted: 0,
    flagged: 0,
    rejected: 0,
    mockAttempts: 0,
    openShifts: 0,
    avgDwellMinutes: null,
    recentSignals: [],
  });

  // Web Push Notification States & Service Worker Integration
  const [pushPermissionStatus, setPushPermissionStatus] = useState<NotificationPermission | 'unsupported'>(
    () => pushNotificationService.getPermissionStatus()
  );
  const [isPushSubscribed, setIsPushSubscribed] = useState<boolean>(
    () => pushNotificationService.getPermissionStatus() === 'granted'
  );
  const [pushSubscribersCount, setPushSubscribersCount] = useState<number>(0);

  // Initialize Service Worker & load push subscribers when authenticated as staff
  useEffect(() => {
    if (pushNotificationService.isSupported()) {
      pushNotificationService.registerServiceWorker().catch(() => {});
      setPushPermissionStatus(pushNotificationService.getPermissionStatus());
    }

    if (!isSessionVerified) return;

    const token =
      currentUser?.token ||
      (typeof window !== 'undefined' ? localStorage.getItem('ekklesphere_token') : null);
    const role = currentUser?.verifiedRole || currentUser?.role;
    const canViewSubscribers =
      role === 'admin' || role === 'pastor' || role === 'super_admin' || role === 'creator';
    if (!token || !canViewSubscribers) {
      return;
    }

    fetch('/api/notifications/subscriptions', {
      headers: getAuthHeaders(),
    })
      .then((res) => {
        if (handleUnauthorizedSession(res.status)) return null;
        return res.ok ? res.json() : null;
      })
      .then((data) => {
        if (data && typeof data.subscribersCount === 'number') {
          setPushSubscribersCount(data.subscribersCount);
        }
      })
      .catch(() => {});
  }, [isSessionVerified, currentUser?.id, currentUser?.organization_id, currentUser?.role, currentUser?.token]);

  const requestPushPermission = async (): Promise<boolean> => {
    if (!pushNotificationService.isSupported()) {
      showToast('Push notifications are not supported by your current browser.');
      return false;
    }

    const result = await pushNotificationService.requestPermission();
    setPushPermissionStatus(result);

    if (result === 'granted') {
      setIsPushSubscribed(true);
      const subSuccess = await pushNotificationService.subscribeToPush(
        currentUser?.memberId || currentUser?.id,
        currentUser?.name
      );
      if (subSuccess) {
        setPushSubscribersCount((c) => Math.max(c + 1, 1));
      }
      showToast('Push notifications enabled for arrival & service alerts!');
      return true;
    } else if (result === 'denied') {
      setIsPushSubscribed(false);
      showToast('Notification permission was blocked. You can re-enable it in browser settings.');
      return false;
    }
    return false;
  };

  const sendTestPushNotification = async (customTitle?: string, customBody?: string): Promise<boolean> => {
    const memberName = currentUser?.name || 'Member';
    const title = customTitle || `Welcome, ${memberName.split(' ')[0]}!`;
    const body =
      customBody ||
      `You are checked in for ${currentService.name} at ${systemSettings.campusName}. Sanctuary presence confirmed.`;

    const ok = await pushNotificationService.showLocalNotification({
      title,
      body,
      icon: '/icon.svg',
      tag: 'test-push',
      data: { url: '/', type: 'arrival_checkin' },
    });

    // Also trigger server dispatch for authenticated tenant logging
    const token =
      currentUser?.token ||
      (typeof window !== 'undefined' ? localStorage.getItem('ekklesphere_token') : null);
    if (token) {
      fetch('/api/notifications/test-push', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ personName: memberName }),
      }).catch(() => {});
    }

    if (ok) {
      showToast('Test push notification displayed on your device!');
    } else {
      showToast('Please allow notifications when prompted by your browser.');
    }
    return ok;
  };

  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((current) => (current === msg ? null : current));
    }, 2800);
  };

  // Synchronize document classes and localStorage whenever theme changes
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.setAttribute('data-theme', 'dark');
      document.documentElement.style.colorScheme = 'dark';
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.setAttribute('data-theme', 'light');
      document.documentElement.style.colorScheme = 'light';
    }
    try {
      localStorage.setItem('ekklesphere_theme', theme);
    } catch {
      // ignore
    }
  }, [theme]);

  const setTheme = (t: 'light' | 'dark') => {
    setThemeState(t);
  };

  const toggleTheme = () => {
    setThemeState((prev) => {
      const next = prev === 'light' ? 'dark' : 'light';
      showToast(`Switched to ${next === 'dark' ? 'Dark' : 'Light'} Mode`);
      return next;
    });
  };

  const services = React.useMemo<ServiceInstance[]>(() => {
    return rawServices.map((svc) => {
      if (svc.status === 'cancelled' || svc.status === 'closed') {
        return {
          ...svc,
          manualClosed: svc.manualClosed ?? svc.status === 'closed',
        };
      }
      const allowance = svc.dwellMinutes ?? systemSettings.dwellTimeMinutes ?? 5;
      const binary = computeServiceBinaryStatus({
        date: svc.date,
        startsAt: svc.startsAt,
        endsAt: svc.endsAt,
        startTimeIso: svc.startTimeIso,
        endTimeIso: svc.endTimeIso,
        allowanceMinutes: allowance,
        rawStatus: 'active',
        nowMs: serviceClockMs,
      });
      return {
        ...svc,
        status: binary === 'live' ? 'open' : 'closed',
        manualClosed: false,
      };
    });
  }, [rawServices, serviceClockMs, systemSettings.dwellTimeMinutes]);

  const currentService = React.useMemo(
    () => services.find((s) => s.id === activeServiceId) || services[0] || UNSCHEDULED_SERVICE_PLACEHOLDER,
    [services, activeServiceId]
  );

  const checkInEligibility = React.useMemo(
    () =>
      evaluateServiceCheckInEligibility(services, activeServiceId, currentService, {
        nowMs: serviceClockMs,
        defaultAllowanceMinutes: systemSettings.dwellTimeMinutes,
      }),
    [services, activeServiceId, currentService, serviceClockMs, systemSettings.dwellTimeMinutes]
  );
  const hasScheduledService = checkInEligibility.eligible;

  // Real-time attendance metrics scoped to the active service (zero synthetic baseline)
  const activeServiceAttendanceRecords = React.useMemo(() => {
    if (!currentService.id) return [];
    return attendanceRecords.filter(
      (r) =>
        r.serviceInstanceId === currentService.id ||
        (!r.serviceInstanceId && services.length === 1)
    );
  }, [attendanceRecords, currentService.id, services.length]);
  const totalCheckedInCount = activeServiceAttendanceRecords.length;
  const expectedAttendance =
    currentService.expectedAttendance > 0 ? currentService.expectedAttendance : members.length;
  const attendancePercentage =
    expectedAttendance > 0
      ? Math.min(100, Math.round((totalCheckedInCount / expectedAttendance) * 100))
      : 0;

  const totalMembersCount = members.length;
  const visitorsCount = React.useMemo(
    () => members.filter((m) => m.status === 'visitor').length,
    [members]
  );
  const serviceVisitorsCount = React.useMemo(() => {
    const checkedInIds = new Set(activeServiceAttendanceRecords.map((r) => r.personId));
    return members.filter((m) => m.status === 'visitor' && checkedInIds.has(m.id)).length;
  }, [members, activeServiceAttendanceRecords]);
  const autoCheckinOptedInCount = React.useMemo(
    () => members.filter((m) => m.autoCheckinOptedIn).length,
    [members]
  );
  const optInPercentage =
    totalMembersCount > 0 ? Math.round((autoCheckinOptedInCount / totalMembersCount) * 100) : 0;

  // Check-in action (handles offline queue vs instant online server sync with Supabase verification + rollback)
  const executeCheckIn = (
    personId: string,
    method: CheckinMethod,
    confidence: number = 90,
    note?: string,
    serviceIdOverride?: string
  ): { started: boolean; promise: Promise<boolean> } => {
    const eligibility = evaluateServiceCheckInEligibility(
      services,
      serviceIdOverride || activeServiceId,
      currentService,
      {
        nowMs: Date.now(),
        defaultAllowanceMinutes: systemSettings.dwellTimeMinutes,
      }
    );
    if (!eligibility.eligible || !eligibility.service) {
      showToast(eligibility.message);
      return { started: false, promise: Promise.resolve(false) };
    }

    const targetService = eligibility.service;
    const targetServiceId = targetService.id;
    const existing = attendanceRecords.find(
      (r) => r.personId === personId && r.serviceInstanceId === targetServiceId
    );
    if (existing) {
      return { started: false, promise: Promise.resolve(false) };
    }

    const person = members.find((m) => m.id === personId);
    const personFullName = person ? `${person.firstName} ${person.lastName}`.trim() : currentUser?.name || 'Member';
    const now = new Date();
    let isLate = false;
    if (!targetService.date || targetService.date === formatLocalDateIso(now)) {
      const [sh, sm] = (targetService.startsAt || '').split(':').map(Number);
      const allowance = Math.max(1, Number(targetService.dwellMinutes ?? 15) || 15);
      if (Number.isFinite(sh) && Number.isFinite(sm)) {
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const graceDeadlineMinutes = sh * 60 + sm + allowance;
        if (currentMinutes > graceDeadlineMinutes) {
          isLate = true;
        }
      }
    }

    const newRecord: AttendanceRecord = {
      id: `rec-${personId}-${Date.now()}`,
      tenantId: 'tenant-live',
      personId,
      personName: personFullName,
      serviceInstanceId: targetServiceId,
      campusId: '00000000-0000-0000-0000-000000000001',
      method,
      confidence,
      checkedInAt: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      checkedInIso: now.toISOString(),
      late: isLate,
      note,
      waitingToSync: !isUsherOnline,
    };

    const auditEntry = {
      id: `log-${Date.now()}`,
      actor: method === 'usher' ? 'Usher Desk' : `${person?.firstName || personFullName} Device`,
      action: 'Attendance Recorded',
      entityType: 'AttendanceRecord' as const,
      timestamp: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      details: note || `Method: ${method}, Confidence: ${confidence}%`,
    };

    setAttendanceRecords((prev) => [newRecord, ...prev]);

    if (!isUsherOnline) {
      setPendingSyncCount((c) => c + 1);
      setAuditLogs((prev) => [auditEntry, ...prev]);
      showToast(`${person?.firstName || 'Member'} saved locally. Will sync when online.`);
      return { started: true, promise: Promise.resolve(true) };
    }

    const syncPromise = (async (): Promise<boolean> => {
      try {
        const res = await fetch('/api/live-checkins', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            ...newRecord,
            personName: personFullName,
            recordedBy: currentUser?.name,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setAttendanceRecords((prev) => prev.filter((r) => r.id !== newRecord.id));
          showToast(data?.message || `Could not save check-in to database (HTTP ${res.status}).`);
          return false;
        }

        const resolvedRecord = data?.record;
        const resolvedServiceId = resolvedRecord?.serviceInstanceId || targetServiceId;
        if (resolvedRecord && (resolvedServiceId !== targetServiceId || resolvedRecord.id !== newRecord.id)) {
          setAttendanceRecords((prev) =>
            prev.map((r) =>
              r.id === newRecord.id
                ? {
                    ...r,
                    id: resolvedRecord.id || r.id,
                    serviceInstanceId: resolvedServiceId,
                    waitingToSync: false,
                  }
                : r
            )
          );
        }

        setAuditLogs((prev) => [auditEntry, ...prev]);
        showToast(`${person?.firstName || personFullName} checked in (${method})`);

        // Trigger automatic Arrival Web Push Notification (Brief Section 3.3 & 6.2)
        if (systemSettings.enablePushNotifications && memberConsents.push) {
          pushNotificationService
            .notifyArrivalCheckin(personFullName, targetService.name, method)
            .catch((err) => console.warn('[Push] Arrival push notification skipped:', err));
        }

        return true;
      } catch (err) {
        console.warn('Could not sync check-in to server:', err);
        setAttendanceRecords((prev) => prev.filter((r) => r.id !== newRecord.id));
        showToast('Network error saving attendance check-in to database.');
        return false;
      }
    })();

    return { started: true, promise: syncPromise };
  };

  const checkInPerson = (
    personId: string,
    method: CheckinMethod,
    confidence: number = 90,
    note?: string,
    serviceIdOverride?: string
  ): boolean => {
    const { started, promise } = executeCheckIn(personId, method, confidence, note, serviceIdOverride);
    void promise;
    return started;
  };

  const checkInPersonAsync = async (
    personId: string,
    method: CheckinMethod,
    confidence: number = 90,
    note?: string,
    serviceIdOverride?: string
  ): Promise<boolean> => {
    const { promise } = executeCheckIn(personId, method, confidence, note, serviceIdOverride);
    return promise;
  };

  const checkInWithServiceQr = async (
    payload: string | ParsedServiceQrPayload,
    targetPersonIdOverride?: string
  ): Promise<ServiceQrCheckInResult> => {
    const parsed: ParsedServiceQrPayload | null =
      typeof payload === 'string'
        ? parseServiceQrPayload(payload, services)
        : payload?.serviceId
        ? payload
        : null;

    if (!parsed || !parsed.serviceId || isPlaceholderServiceId(parsed.serviceId)) {
      const msg = 'Unrecognized service QR code. Please scan an active service check-in QR.';
      showToast(msg);
      return { ok: false, message: msg };
    }

    const token =
      currentUser?.token ||
      (typeof window !== 'undefined' ? localStorage.getItem('ekklesphere_token') : null);
    if (!token) {
      const msg = 'Please sign in first to complete service QR check-in.';
      showToast(msg);
      return { ok: false, message: msg, serviceId: parsed.serviceId };
    }

    const serviceId = parsed.serviceId.trim();

    if (!isUsherOnline) {
      const selfId =
        targetPersonIdOverride ||
        members.find(
          (m) =>
            m.id === currentUser?.id ||
            (currentUser?.email && m.email?.toLowerCase() === currentUser.email.toLowerCase())
        )?.id ||
        currentUser?.id;
      if (!selfId) {
        const msg = 'Cannot complete offline QR check-in without a member profile.';
        showToast(msg);
        return { ok: false, message: msg, serviceId };
      }
      const queued = await checkInPersonAsync(
        selfId,
        'posted_qr',
        99,
        'Queued via Service QR Check-in',
        serviceId
      );
      const localSvc = services.find((s) => s.id === serviceId);
      return {
        ok: queued,
        serviceId,
        serviceName: localSvc?.name,
        message: queued
          ? `Saved QR check-in locally for ${localSvc?.name || 'scheduled service'}.`
          : 'Service is not currently open for check-in.',
      };
    }

    try {
      const res = await fetch(`/api/events/${encodeURIComponent(serviceId)}/qr-checkin`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          qrToken: parsed.token || undefined,
          memberId: targetPersonIdOverride || undefined,
        }),
      });
      if (handleUnauthorizedSession(res.status)) {
        return { ok: false, message: 'Your session expired. Please sign in again.', serviceId };
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errMsg =
          data?.message || `Could not complete Service QR check-in (HTTP ${res.status}).`;
        showToast(errMsg);
        return { ok: false, message: errMsg, serviceId };
      }

      const returnedRecord = data?.record as AttendanceRecord | undefined;
      const serviceName = String(
        data?.service?.name ||
          services.find((s) => s.id === serviceId)?.name ||
          'Scheduled Service'
      );

      if (Array.isArray(data?.liveCheckins)) {
        setAttendanceRecords((prev) => {
          const pendingOffline = prev.filter((r) => r.waitingToSync);
          const merged = [...data.liveCheckins];
          for (const offlineRec of pendingOffline) {
            if (
              !merged.some(
                (r) =>
                  r.personId === offlineRec.personId &&
                  r.serviceInstanceId === offlineRec.serviceInstanceId
              )
            ) {
              merged.unshift(offlineRec);
            }
          }
          return merged;
        });
      } else if (returnedRecord) {
        setAttendanceRecords((prev) => [
          returnedRecord,
          ...prev.filter(
            (r) =>
              !(
                r.personId === returnedRecord.personId &&
                r.serviceInstanceId === returnedRecord.serviceInstanceId
              )
          ),
        ]);
      }

      if (services.some((s) => s.id === serviceId)) {
        setActiveServiceId(serviceId);
      }

      const alreadyCheckedIn = Boolean(data?.alreadyCheckedIn);
      const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const msg = alreadyCheckedIn
        ? `Already checked into ${serviceName}.`
        : `Checked into ${serviceName} via Service QR!`;

      if (!alreadyCheckedIn) {
        setAuditLogs((prev) => [
          {
            id: `log-qr-${Date.now()}`,
            actor: currentUser?.name || 'Member Device',
            action: 'Service QR Check-In',
            entityType: 'AttendanceRecord' as const,
            timestamp: nowTime,
            details: `${returnedRecord?.personName || currentUser?.name || 'Member'} · ${serviceName}`,
          },
          ...prev,
        ]);

        if (systemSettings.enablePushNotifications && memberConsents.push) {
          pushNotificationService
            .notifyArrivalCheckin(
              returnedRecord?.personName || currentUser?.name || 'Member',
              serviceName,
              'posted_qr'
            )
            .catch(() => {});
        }
      }

      showToast(msg);
      return {
        ok: true,
        alreadyCheckedIn,
        serviceId,
        serviceName,
        record: returnedRecord,
        message: msg,
      };
    } catch {
      const msg = 'Network error while verifying Service QR code.';
      showToast(msg);
      return { ok: false, message: msg, serviceId };
    }
  };

  // Capture deep-link Service QR check-in query params on load and execute once authenticated
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const sp = new URLSearchParams(window.location.search);
      const checkinKind = (sp.get('checkin') || '').trim().toLowerCase();
      const serviceId = (sp.get('serviceId') || sp.get('eventId') || '').trim();
      const token = (sp.get('token') || sp.get('qrToken') || '').trim();
      const orgId = (sp.get('orgId') || sp.get('organizationId') || '').trim();
      if (checkinKind === 'service' && serviceId) {
        sessionStorage.setItem(
          'ekklesphere_pending_qr_checkin',
          JSON.stringify({ serviceId, token: token || undefined, orgId: orgId || undefined })
        );
        sp.delete('checkin');
        sp.delete('serviceId');
        sp.delete('eventId');
        sp.delete('token');
        sp.delete('qrToken');
        sp.delete('orgId');
        sp.delete('organizationId');
        const nextQs = sp.toString();
        const targetPath = window.location.pathname === '/' ? '/app' : window.location.pathname;
        window.history.replaceState({}, '', `${targetPath}${nextQs ? `?${nextQs}` : ''}${window.location.hash}`);
      }
    } catch {
      // ignore sessionStorage / URL parse issues
    }
  }, []);

  useEffect(() => {
    if (!isSessionVerified || !currentUser?.token || typeof window === 'undefined') return;
    let rawPending: string | null = null;
    try {
      rawPending = sessionStorage.getItem('ekklesphere_pending_qr_checkin');
      if (rawPending) {
        sessionStorage.removeItem('ekklesphere_pending_qr_checkin');
      }
    } catch {
      rawPending = null;
    }
    if (!rawPending) return;
    try {
      const parsed = JSON.parse(rawPending) as ParsedServiceQrPayload;
      if (parsed?.serviceId) {
        void checkInWithServiceQr(parsed);
      }
    } catch {
      // ignore malformed payload
    }
  }, [isSessionVerified, currentUser?.id, currentUser?.token]);

  const removeCheckIn = async (personId: string, serviceIdOverride?: string): Promise<void> => {
    const targetServiceId = serviceIdOverride || activeServiceId;
    if (!targetServiceId || isPlaceholderServiceId(targetServiceId)) {
      return;
    }
    const person = members.find((m) => m.id === personId);
    try {
      const res = await fetch(
        `/api/live-checkins/${encodeURIComponent(personId)}?serviceId=${encodeURIComponent(targetServiceId)}`,
        {
          method: 'DELETE',
          headers: getAuthHeaders(),
        }
      );
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        showToast(errBody?.message || 'Could not remove check-in from database.');
        await refreshLivePremise();
        return;
      }
      setAttendanceRecords((prev) =>
        prev.filter(
          (r) => !(r.personId === personId && (!r.serviceInstanceId || r.serviceInstanceId === targetServiceId))
        )
      );
      showToast(`Check-in removed from database for ${person?.firstName || 'Member'}`);
    } catch (err) {
      console.warn('Could not remove check-in on server:', err);
      showToast('Network error removing check-in from database.');
      await refreshLivePremise();
    }
  };

  const refreshMembers = async (): Promise<void> => {
    const token =
      currentUser?.token ||
      (typeof window !== 'undefined' ? localStorage.getItem('ekklesphere_token') : null);
    if (!token) return;

    try {
      const res = await fetch('/api/members', { headers: getAuthHeaders() });
      if (handleUnauthorizedSession(res.status)) return;
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          const normalized = data.map((item) => normalizePersonRecord(item));
          setMembers(normalized);
          try {
            localStorage.setItem('ekklesphere_members', JSON.stringify(normalized));
          } catch {
            // ignore
          }
          return;
        }
      } else if (res.status === 403) {
        const selfRes = await fetch('/api/members/me/profile', { headers: getAuthHeaders() });
        if (handleUnauthorizedSession(selfRes.status)) return;
        if (selfRes.ok) {
          const selfData = await selfRes.json().catch(() => null);
          if (selfData?.profile) {
            const normalizedSelf = normalizePersonRecord(selfData.profile);
            setMembers((prev) => {
              const next = prev.some((m) => m.id === normalizedSelf.id)
                ? prev.map((m) => (m.id === normalizedSelf.id ? normalizedSelf : m))
                : [normalizedSelf];
              try {
                localStorage.setItem('ekklesphere_members', JSON.stringify(next));
              } catch {
                // ignore
              }
              return next;
            });
          }
          return;
        }
      }
    } catch (err) {
      // transient network warning
    }

    // Fallback: restore from localStorage on transient offline error only
    try {
      const saved = localStorage.getItem('ekklesphere_members');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setMembers(parsed.map((item) => normalizePersonRecord(item)));
        }
      }
    } catch {}
  };

  const addVisitor = async (
    name: string,
    phone: string,
    howHeard: string,
    preferredGroupName?: string
  ): Promise<void> => {
    const parts = name.trim().split(' ');
    const firstName = parts[0] || 'Visitor';
    const lastName = parts.slice(1).join(' ') || 'Guest';
    const cleanDigits = phone ? phone.replace(/\D/g, '') : '';
    const formattedPhone = phone
      ? phone.startsWith('+')
        ? phone.trim()
        : cleanDigits.startsWith('0')
        ? `+233${cleanDigits.slice(1)}`
        : `+233${cleanDigits}`
      : undefined;

    const cleanPreferred = preferredGroupName?.trim();
    const matchedPreferredGroup = cleanPreferred
      ? churchGroups.find((g) => g.name.trim().toLowerCase() === cleanPreferred.toLowerCase())
      : undefined;
    const assignedCellGroup =
      matchedPreferredGroup && matchedPreferredGroup.category !== 'ministry'
        ? matchedPreferredGroup.name
        : 'First-time Visitor';
    const assignedDepartment =
      matchedPreferredGroup && matchedPreferredGroup.category === 'ministry'
        ? matchedPreferredGroup.name
        : undefined;

    let savedPerson: Person | null = null;
    try {
      const res = await fetch('/api/members', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          firstName,
          lastName,
          phoneE164: formattedPhone,
          status: 'visitor',
          officerName: 'Guest',
          homeCellGroup: assignedCellGroup,
          groupName: matchedPreferredGroup ? matchedPreferredGroup.name : 'First-time Visitor',
          ...(assignedDepartment ? { department: assignedDepartment } : {}),
          autoCheckinOptedIn: false,
          consecutiveAbsences: 0,
          remarks: `Heard via: ${howHeard}`,
          notes: `Heard via: ${howHeard}`,
        }),
      });

      if (res.ok) {
        savedPerson = normalizePersonRecord(await res.json());
      }
    } catch {
      // offline or serverless fallback
    }

    if (!savedPerson) {
      const fallbackId = `vis-${Date.now()}`;
      savedPerson = {
        id: fallbackId,
        tenantId: '00000000-0000-0000-0000-000000000001',
        firstName,
        lastName,
        phoneE164: formattedPhone || '+233200000000',
        status: 'visitor',
        officerName: 'Guest',
        homeCellGroup: assignedCellGroup,
        groupName: matchedPreferredGroup ? matchedPreferredGroup.name : 'First-time Visitor',
        department: assignedDepartment,
        autoCheckinOptedIn: false,
        consecutiveAbsences: 0,
        remarks: `Heard via: ${howHeard}`,
        notes: `Heard via: ${howHeard}`,
        avatarInitials: `${firstName[0] || 'V'}${lastName[0] || 'G'}`.toUpperCase(),
        joinedOn: new Date().toISOString().split('T')[0],
      } as Person;
    }

    // Direct write to Firestore as cloud backup
    try {
      setDoc(doc(db, 'members', savedPerson.id), savedPerson, { merge: true }).catch(() => {});
    } catch {}

    setMembers((prev) => {
      const updated = [savedPerson!, ...prev.filter((m) => m.id !== savedPerson!.id)];
      try {
        localStorage.setItem('ekklesphere_members', JSON.stringify(updated));
      } catch {}
      return updated;
    });

    // Check them in only if a scheduled service is live within its active window
    const visitorEligibility = evaluateServiceCheckInEligibility(
      services,
      activeServiceId,
      currentService,
      {
        nowMs: Date.now(),
        defaultAllowanceMinutes: systemSettings.dwellTimeMinutes,
      }
    );
    if (visitorEligibility.eligible) {
      checkInPerson(savedPerson.id, 'usher', 95, `Visitor registration. Heard via ${howHeard}`);
    } else {
      showToast(`Visitor registered. Check-in skipped: ${visitorEligibility.message}`);
    }

    const resolvedVisitorRouting = resolveFollowupAssignee(
      savedPerson,
      churchGroups,
      systemSettings,
      'first_timer',
      'Welcome & Pastoral Care Team',
      members,
      followupTasks
    );
    const visitorAssignee = matchedPreferredGroup?.leaderName?.trim()
      ? matchedPreferredGroup.leaderName.trim()
      : resolvedVisitorRouting.assignedToName;
    const visitorDueOn = formatFollowupDueDateLabel(
      'first_timer',
      systemSettings.firstTimerFollowupHours,
      systemSettings.absenteeThresholdServices
    );

    // Create visitor follow-up task in Supabase
    try {
      const taskRes = await fetch('/api/followup-tasks', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          personId: savedPerson!.id,
          personName: name,
          groupName: matchedPreferredGroup?.name || 'Visitors Welcome Team',
          reason: 'first_timer',
          assignedToName: visitorAssignee,
          dueOn: visitorDueOn,
          notes: `First-time visitor check-in (${howHeard})${
            matchedPreferredGroup ? ` · Interest: ${matchedPreferredGroup.name}` : ''
          }`,
        }),
      });
      if (taskRes.ok) {
        const taskData = await taskRes.json().catch(() => null);
        if (taskData?.task) {
          setFollowupTasks((prev) => [taskData.task, ...prev]);
        }
      }
    } catch {
      // transient network failure ignored
    }

    showToast(
      `${name} saved to directory! Follow-up assigned to ${visitorAssignee} (${visitorDueOn}).`
    );
  };

  const addMember = async (
    memberData: Omit<Person, 'id' | 'tenantId' | 'avatarInitials' | 'joinedOn'>
  ): Promise<Person> => {
    let savedPerson: Person | null = null;
    let serverValidationError: Error | null = null;
    try {
      const res = await fetch('/api/members', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(memberData),
      });

      const body = await res.json().catch(() => null);
      if (res.ok) {
        if (body && typeof body === 'object' && 'id' in body) {
          savedPerson = normalizePersonRecord(body);
        }
      } else if (res.status === 401 || res.status === 403 || res.status === 400) {
        serverValidationError = new Error(body?.message || 'Could not register member.');
      }
    } catch {
      // offline or serverless fallback
    }

    if (serverValidationError) {
      throw serverValidationError;
    }

    if (!savedPerson || !savedPerson.id) {
      const fallbackId = `mem-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
      const initials = `${(memberData.firstName || '')[0] || ''}${(memberData.lastName || '')[0] || ''}`.toUpperCase() || 'M';
      savedPerson = {
        ...memberData,
        id: fallbackId,
        tenantId: '00000000-0000-0000-0000-000000000001',
        avatarInitials: initials,
        joinedOn: new Date().toISOString().split('T')[0],
      } as Person;
    }

    const onboardingCredentials = savedPerson.onboardingCredentials;
    const personForStorage: Person = { ...savedPerson };
    delete personForStorage.onboardingCredentials;

    // Direct write to Firestore as cloud backup
    try {
      setDoc(doc(db, 'members', personForStorage.id), personForStorage, { merge: true }).catch(() => {});
    } catch {}

    setMembers((prev) => {
      const updated = [personForStorage, ...prev.filter((m) => m.id !== personForStorage.id)];
      try {
        localStorage.setItem('ekklesphere_members', JSON.stringify(updated));
      } catch {}
      return updated;
    });

    setAuditLogs((prev) => [
      {
        id: `log-${Date.now()}`,
        actor: currentUser?.name || 'Administrator',
        action: 'Member registered',
        entityType: 'Person',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        details: onboardingCredentials?.provisioned
          ? `${personForStorage.firstName} ${personForStorage.lastName} saved with Member Portal credentials (${onboardingCredentials.identifiers.join(', ')})`
          : `${personForStorage.firstName} ${personForStorage.lastName} saved to database (${personForStorage.groupName})`,
      },
      ...prev,
    ]);

    if (onboardingCredentials?.provisioned && onboardingCredentials.temporaryPassword) {
      showToast(
        `${personForStorage.firstName} ${personForStorage.lastName} saved! Member login assigned (temp password: ${onboardingCredentials.temporaryPassword}).`
      );
    } else {
      showToast(`Member ${personForStorage.firstName} ${personForStorage.lastName} saved to database!`);
    }
    return savedPerson;
  };

  const validateMemberImportRemote = async (
    candidateMembers: Record<string, unknown>[],
    duplicateMode: ImportDuplicateMode = 'skip'
  ) => {
    const existingIndex = members.map((m) => ({
      id: m.id,
      memberId: m.memberId,
      phoneE164: m.phoneE164,
      email: m.email,
    }));

    const hasToken = Boolean(
      currentUser?.token ||
        (typeof window !== 'undefined' ? localStorage.getItem('ekklesphere_token') : null)
    );

    if (hasToken) {
      try {
        const res = await fetch('/api/members/import/validate', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ members: candidateMembers, duplicateMode }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.summary && Array.isArray(data?.rows)) {
            return {
              summary: data.summary as MemberImportValidationSummary,
              rows: data.rows as ValidatedImportRow[],
              license: data.license,
              source: 'server' as const,
            };
          }
        }
      } catch {
        // Fall through to client-side validation when network is unavailable
      }
    }

    const localResult = validateMemberImportBatch(
      candidateMembers,
      existingIndex,
      duplicateMode
    );
    return {
      ...localResult,
      source: 'local' as const,
    };
  };

  const batchImportMembers = async (
    newMembers: Person[],
    options?: { duplicateMode?: ImportDuplicateMode }
  ): Promise<Person[]> => {
    if (!newMembers || newMembers.length === 0) return [];
    const duplicateMode: ImportDuplicateMode = options?.duplicateMode || 'skip';

    let updatedRoster: Person[] = [];
    let importedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let credentialsProvisionedCount = 0;
    let temporaryPassword: string | undefined;

    const hasToken = Boolean(
      currentUser?.token ||
        (typeof window !== 'undefined' ? localStorage.getItem('ekklesphere_token') : null)
    );

    if (hasToken) {
      let res: Response | null = null;
      try {
        res = await fetch('/api/members/import', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ members: newMembers, duplicateMode }),
        });
      } catch {
        res = null;
      }

      if (res) {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const errMessage =
            data?.message || `Import failed with server status ${res.status}.`;
          showToast(errMessage);
          const err: any = new Error(errMessage);
          err.code = data?.code || data?.error;
          err.details = data?.details;
          err.status = res.status;
          throw err;
        }
        if (Array.isArray(data?.members)) {
          updatedRoster = data.members;
          importedCount = Number(data.importedCount ?? 0);
          updatedCount = Number(data.updatedCount ?? 0);
          skippedCount = Number(data.skippedCount ?? 0);
          credentialsProvisionedCount = Number(data.credentialsProvisionedCount ?? 0);
          temporaryPassword =
            typeof data.temporaryPassword === 'string' ? data.temporaryPassword : undefined;
        }
      }
    }

    if (updatedRoster.length === 0 && !hasToken) {
      const existingIndex = members.map((m) => ({
        id: m.id,
        memberId: m.memberId,
        phoneE164: m.phoneE164,
        email: m.email,
      }));
      const localValidated = validateMemberImportBatch(
        newMembers as unknown as Record<string, unknown>[],
        existingIndex,
        duplicateMode
      );

      if (
        localValidated.summary.newInserts === 0 &&
        localValidated.summary.updates === 0 &&
        localValidated.summary.invalid > 0
      ) {
        const firstErr =
          localValidated.rows.find((r) => !r.isValid)?.errors[0] ||
          'All rows failed validation.';
        showToast(firstErr);
        throw new Error(firstErr);
      }

      const nextMembers = [...members];
      for (const row of localValidated.rows) {
        if (row.action === 'insert') {
          const created = normalizePersonRecord({
            ...row.data,
            id: (row.data.id as string) || `m-import-${Date.now()}-${row.rowIndex}`,
          });
          nextMembers.unshift(created);
          importedCount += 1;
          try {
            setDoc(doc(db, 'members', created.id), created, { merge: true }).catch(() => {});
          } catch {}
        } else if (row.action === 'update' && row.matchedMemberId) {
          const idx = nextMembers.findIndex((m) => m.id === row.matchedMemberId);
          if (idx >= 0) {
            const merged = normalizePersonRecord({
              ...nextMembers[idx],
              ...row.data,
              id: nextMembers[idx].id,
            });
            nextMembers[idx] = merged;
            updatedCount += 1;
            try {
              setDoc(doc(db, 'members', merged.id), merged, { merge: true }).catch(() => {});
            } catch {}
          }
        } else if (row.action === 'skip') {
          skippedCount += 1;
        }
      }
      updatedRoster = nextMembers;
    }

    const normalizedRoster = updatedRoster.map((item) => normalizePersonRecord(item));
    setMembers(normalizedRoster);
    try {
      localStorage.setItem('ekklesphere_members', JSON.stringify(normalizedRoster));
    } catch {}

    const summaryParts: string[] = [];
    if (importedCount > 0) summaryParts.push(`${importedCount} added`);
    if (updatedCount > 0) summaryParts.push(`${updatedCount} updated`);
    if (skippedCount > 0) summaryParts.push(`${skippedCount} skipped`);
    const summaryLabel =
      summaryParts.length > 0 ? summaryParts.join(', ') : `${newMembers.length} processed`;
    const credsSuffix =
      credentialsProvisionedCount > 0
        ? ` (${credentialsProvisionedCount} member login${credentialsProvisionedCount === 1 ? '' : 's'} assigned${temporaryPassword ? ` · temp password: ${temporaryPassword}` : ''})`
        : '';

    setAuditLogs((prev) => [
      {
        id: `log-${Date.now()}`,
        actor: currentUser?.name || 'Administrator',
        action: 'Batch Member Import',
        entityType: 'Person',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        details: `Batch import (${duplicateMode} duplicates): ${summaryLabel}${credsSuffix}.`,
      },
      ...prev,
    ]);

    showToast(`Import complete: ${summaryLabel}${credsSuffix}.`);
    return normalizedRoster;
  };

  const buildSelfProfilePayload = (updates: Partial<Person>): Record<string, unknown> => {
    const allowedKeys: (keyof Person)[] = [
      'firstName',
      'middleName',
      'lastName',
      'preferredName',
      'email',
      'phoneE164',
      'phoneNumber',
      'gender',
      'dateOfBirth',
      'monthOfBirth',
      'birthMonthGroup',
      'placeOfResidence',
      'specificLocation',
      'residentialDigitalAddress',
      'hometown',
      'occupation',
      'maritalStatus',
      'spouseName',
      'numberOfChildren',
      'emergencyContactPerson',
      'emergencyContactPhone',
      'groupName',
      'homeCellGroup',
      'department',
      'departments',
      'squads',
      'dateOfSalvation',
      'dateOfBaptism',
      'dateOfMarriage',
      'remarks',
      'notes',
      'imageUrl',
      'autoCheckinOptedIn',
    ];
    const body: Record<string, unknown> = {};
    for (const key of allowedKeys) {
      if (updates[key] !== undefined) {
        body[key] = updates[key];
      }
    }
    return body;
  };

  const syncCurrentUserWithUpdatedMember = (updatedPerson: Person, targetMemberId?: string) => {
    setCurrentUser((prevUser) => {
      if (!prevUser) return prevUser;
      const matchesUser =
        prevUser.memberId === updatedPerson.id ||
        prevUser.id === updatedPerson.id ||
        (targetMemberId && prevUser.memberId === targetMemberId) ||
        (prevUser.email &&
          updatedPerson.email &&
          prevUser.email.toLowerCase() === updatedPerson.email.toLowerCase());
      if (!matchesUser) return prevUser;

      const nextName =
        `${updatedPerson.firstName || ''} ${updatedPerson.lastName || ''}`.trim() || prevUser.name;
      const nextInitials =
        updatedPerson.avatarInitials ||
        nextName
          .split(' ')
          .filter(Boolean)
          .map((p) => p[0])
          .slice(0, 2)
          .join('')
          .toUpperCase() ||
        prevUser.initials;

      const synced: AuthUser = {
        ...prevUser,
        name: nextName,
        email: updatedPerson.email || prevUser.email,
        phone: updatedPerson.phoneE164 || prevUser.phone,
        avatar: updatedPerson.imageUrl ?? prevUser.avatar,
        initials: nextInitials,
        memberId: updatedPerson.id,
      };
      try {
        localStorage.setItem('ekklesphere_user', JSON.stringify(synced));
      } catch {}
      return synced;
    });
  };

  const upsertMemberLocally = (updatedPerson: Person, previousId?: string) => {
    setMembers((prev) => {
      const hasMatch = prev.some(
        (m) => m.id === updatedPerson.id || (previousId && m.id === previousId)
      );
      const updated = hasMatch
        ? prev.map((m) =>
            m.id === updatedPerson.id || (previousId && m.id === previousId) ? updatedPerson : m
          )
        : [updatedPerson, ...prev];
      try {
        localStorage.setItem('ekklesphere_members', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  const updateOwnProfile = async (updates: Partial<Person>): Promise<Person> => {
    const payload = buildSelfProfilePayload(updates);
    let updatedPerson: Person | null = null;
    let serverErrorMessage: string | null = null;

    try {
      const selfRes = await fetch('/api/members/me/profile', {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });
      if (selfRes.ok) {
        const rawSelfUpdated = await selfRes.json().catch(() => null);
        if (rawSelfUpdated) updatedPerson = normalizePersonRecord(rawSelfUpdated);
      } else {
        const errBody = await selfRes.json().catch(() => ({}));
        serverErrorMessage = errBody?.message || `Could not save profile update (HTTP ${selfRes.status})`;
      }
    } catch {
      serverErrorMessage = 'Network error saving your profile.';
    }

    if (serverErrorMessage && !updatedPerson) {
      showToast(serverErrorMessage);
      throw new Error(serverErrorMessage);
    }

    if (!updatedPerson) {
      throw new Error('Could not save profile update.');
    }

    upsertMemberLocally(updatedPerson, currentUser?.memberId);
    syncCurrentUserWithUpdatedMember(updatedPerson, currentUser?.memberId);

    setAuditLogs((prev) => [
      {
        id: `log-${Date.now()}`,
        actor: `${updatedPerson!.firstName} ${updatedPerson!.lastName}`.trim() || currentUser?.name || 'Member',
        action: 'Profile updated',
        entityType: 'Person',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        details: 'Member updated personal church profile details',
      },
      ...prev,
    ]);

    showToast('Your member details have been saved!');
    return updatedPerson;
  };

  const updateMember = async (memberId: string, updates: Partial<Person>): Promise<Person> => {
    const existing = members.find((m) => m.id === memberId);
    const mergedPayload = existing ? { ...existing, ...updates } : updates;

    let updatedPerson: Person | null = null;
    let serverErrorMessage: string | null = null;
    try {
      const canUseAdminEndpoint =
        currentUser?.role === 'admin' ||
        currentUser?.role === 'pastor' ||
        currentUser?.role === 'super_admin' ||
        currentUser?.role === 'creator' ||
        currentUser?.is_creator;

      if (canUseAdminEndpoint) {
        const res = await fetch(`/api/members/${encodeURIComponent(memberId)}`, {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify(mergedPayload),
        });

        if (res.ok) {
          const rawUpdated = await res.json().catch(() => null);
          if (rawUpdated) updatedPerson = normalizePersonRecord(rawUpdated);
        } else {
          const errBody = await res.json().catch(() => ({}));
          serverErrorMessage = errBody?.message || `Could not save member update (HTTP ${res.status})`;
        }
      }

      if (!updatedPerson && !serverErrorMessage) {
        const selfRes = await fetch('/api/members/me/profile', {
          method: 'PATCH',
          headers: getAuthHeaders(),
          body: JSON.stringify(buildSelfProfilePayload(updates)),
        });
        if (selfRes.ok) {
          const rawSelfUpdated = await selfRes.json().catch(() => null);
          if (rawSelfUpdated) updatedPerson = normalizePersonRecord(rawSelfUpdated);
        } else {
          const errBody = await selfRes.json().catch(() => ({}));
          serverErrorMessage = errBody?.message || `Could not save profile update (HTTP ${selfRes.status})`;
        }
      }
    } catch {
      // network offline fallback allowed below
    }

    if (serverErrorMessage && !updatedPerson) {
      showToast(serverErrorMessage);
      throw new Error(serverErrorMessage);
    }

    if (!updatedPerson) {
      updatedPerson = normalizePersonRecord(mergedPayload as Person);
    }

    // Direct write to Firestore as cloud backup
    try {
      setDoc(doc(db, 'members', updatedPerson.id), updatedPerson, { merge: true }).catch(() => {});
    } catch {}

    upsertMemberLocally(updatedPerson, memberId);
    syncCurrentUserWithUpdatedMember(updatedPerson, memberId);

    setAuditLogs((prev) => [
      {
        id: `log-${Date.now()}`,
        actor: currentUser?.name || 'Administrator',
        action: 'Member updated',
        entityType: 'Person',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        details: `Updated ${updatedPerson!.firstName} ${updatedPerson!.lastName} in database`,
      },
      ...prev,
    ]);

    showToast(`Member ${updatedPerson.firstName} ${updatedPerson.lastName} updated in database!`);
    return updatedPerson;
  };

  const deleteMember = async (memberId: string): Promise<void> => {
    const memberToDelete = members.find((m) => m.id === memberId);
    try {
      const res = await fetch(`/api/members/${encodeURIComponent(memberId)}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        showToast(errBody?.message || 'Could not delete member from database.');
        await refreshMembers();
        return;
      }
    } catch (err) {
      console.error('Error deleting member:', err);
      showToast('Network error deleting member from database.');
      return;
    }

    // Delete from Firestore mirror if configured
    try {
      deleteDoc(doc(db, 'members', memberId)).catch(() => {});
    } catch {}

    setMembers((prev) => {
      const updated = prev.filter((m) => m.id !== memberId);
      try {
        localStorage.setItem('ekklesphere_members', JSON.stringify(updated));
      } catch {}
      return updated;
    });

    setAttendanceRecords((prev) => prev.filter((r) => r.personId !== memberId));
    showToast(
      `Member ${memberToDelete ? `${memberToDelete.firstName} ${memberToDelete.lastName}` : ''} permanently deleted from database`
    );
  };

  const serverPremiseUnavailableErrorsRef = useRef(0);
  const premisePollTicksRef = useRef(0);

  const refreshSystemSettings = async (): Promise<void> => {
    const token =
      currentUser?.token ||
      (typeof window !== 'undefined' ? localStorage.getItem('ekklesphere_token') : null);
    if (!token) return;

    setIsSyncingSystemSettings(true);
    try {
      const res = await fetch('/api/system-settings', {
        headers: getAuthHeaders(),
      });
      if (handleUnauthorizedSession(res.status)) return;
      if (!res.ok) return;
      const data = await res.json();
      if (data?.storageBackend) {
        setSystemSettingsStorageBackend(data.storageBackend);
      }
      if (data?.settings) {
        const fallbackOrgName = (
          data.settings.churchName ||
          data.organization?.name ||
          currentUserRef.current?.organizationName ||
          ''
        ).trim();
        const merged: SystemSettings = {
          ...DEFAULT_SYSTEM_SETTINGS,
          ...data.settings,
          churchName: fallbackOrgName,
        };
        setSystemSettings((prev) => {
          if (areSystemSettingsEqual(prev, merged)) {
            return prev;
          }
          try {
            localStorage.setItem('ekklesphere_system_settings', JSON.stringify(merged));
          } catch {}
          return merged;
        });
      }
    } catch {
      // ignore transient network errors
    } finally {
      setIsSyncingSystemSettings(false);
    }
  };

  const refreshChurchGroups = async (): Promise<void> => {
    const token =
      currentUser?.token ||
      (typeof window !== 'undefined' ? localStorage.getItem('ekklesphere_token') : null);
    if (!token) return;

    try {
      const res = await fetch('/api/church-groups', {
        headers: getAuthHeaders(),
      });
      if (handleUnauthorizedSession(res.status)) return;
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data?.groups)) {
        setChurchGroups(data.groups);
        try {
          localStorage.setItem('ekklesphere_church_groups', JSON.stringify(data.groups));
        } catch {}
      }
    } catch {
      // ignore transient network errors
    }
  };

  const refreshLeadershipHistory = async (): Promise<void> => {
    const token =
      currentUser?.token ||
      (typeof window !== 'undefined' ? localStorage.getItem('ekklesphere_token') : null);
    if (!token) return;

    setIsLoadingLeadershipHistory(true);
    try {
      const res = await fetch('/api/church-groups/leadership-history?limit=250', {
        headers: getAuthHeaders(),
      });
      if (handleUnauthorizedSession(res.status)) return;
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data?.history)) {
        setLeadershipHistory(data.history);
      }
    } catch {
      // ignore transient network errors
    } finally {
      setIsLoadingLeadershipHistory(false);
    }
  };

  const refreshAuditLogs = async (): Promise<void> => {
    const token =
      currentUser?.token ||
      (typeof window !== 'undefined' ? localStorage.getItem('ekklesphere_token') : null);
    const role = currentUser?.verifiedRole || currentUser?.role;
    const isStaff =
      role === 'admin' || role === 'pastor' || role === 'super_admin' || role === 'creator';
    if (!token || !isStaff) return;

    try {
      const res = await fetch('/api/system-settings/audit-logs', {
        headers: getAuthHeaders(),
      });
      if (handleUnauthorizedSession(res.status)) return;
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data?.auditLogs)) {
        const mapped: AuditLogItem[] = data.auditLogs.map((item: any) => ({
          id: String(item.id),
          actor: String(item.actor || 'System'),
          action: String(item.action || 'audit.event'),
          entityType: String(item.entityType || 'Organization'),
          timestamp: String(item.timestamp || new Date().toISOString()),
          details: String(item.details || ''),
        }));
        setAuditLogs(mapped);
      }
    } catch {
      // ignore transient network errors
    }
  };

  const refreshLivePremise = async () => {
    const token =
      currentUser?.token ||
      (typeof window !== 'undefined' ? localStorage.getItem('ekklesphere_token') : null);
    if (!token) {
      return;
    }

    premisePollTicksRef.current += 1;
    if (
      serverPremiseUnavailableErrorsRef.current >= 2 &&
      premisePollTicksRef.current % 8 !== 0
    ) {
      return;
    }

    try {
      let serverData: any = null;
      try {
        const res = await fetch('/api/campus-premise', {
          headers: getAuthHeaders(),
        });
        if (handleUnauthorizedSession(res.status)) return;
        if (res.ok) {
          serverData = await res.json();
          serverPremiseUnavailableErrorsRef.current = 0;
        } else {
          serverPremiseUnavailableErrorsRef.current += 1;
        }
      } catch {
        serverPremiseUnavailableErrorsRef.current += 1;
      }

      if (serverData?.premiseSettings) {
        const ps = serverData.premiseSettings;
        setSystemSettings((prev) => {
          const nextChurchName = ps.churchName || prev.churchName;
          const nextCampusName = ps.campusName || prev.campusName;
          const nextCampusAddress = ps.campusAddress ?? prev.campusAddress;
          const nextLat = typeof ps.lat === 'number' ? ps.lat : null;
          const nextLng = typeof ps.lng === 'number' ? ps.lng : null;
          const nextAcc =
            typeof ps.accuracyM === 'number' ? ps.accuracyM : prev.campusLocationAccuracyM ?? null;
          const nextUpdatedAt = ps.updatedAt || null;
          const nextInner = ps.innerGeofenceMeters ?? prev.innerGeofenceMeters;
          const nextOuter = ps.outerGeofenceMeters ?? prev.outerGeofenceMeters;
          const nextDwell = ps.dwellTimeMinutes ?? prev.dwellTimeMinutes;

          if (
            (prev.churchName || '') === (nextChurchName || '') &&
            (prev.campusName || '') === (nextCampusName || '') &&
            (prev.campusAddress || '') === (nextCampusAddress || '') &&
            (prev.campusLatitude ?? null) === nextLat &&
            (prev.campusLongitude ?? null) === nextLng &&
            (prev.campusLocationAccuracyM ?? null) === nextAcc &&
            (prev.campusLocationUpdatedAt ?? null) === (nextUpdatedAt ?? null) &&
            prev.innerGeofenceMeters === nextInner &&
            prev.outerGeofenceMeters === nextOuter &&
            prev.dwellTimeMinutes === nextDwell
          ) {
            return prev;
          }

          const next: SystemSettings = {
            ...prev,
            churchName: nextChurchName,
            campusName: nextCampusName,
            campusAddress: nextCampusAddress,
            campusLatitude: nextLat,
            campusLongitude: nextLng,
            campusLocationAccuracyM: nextAcc,
            campusLocationUpdatedAt: nextUpdatedAt,
            innerGeofenceMeters: nextInner,
            outerGeofenceMeters: nextOuter,
            dwellTimeMinutes: nextDwell,
          };
          try {
            localStorage.setItem('ekklesphere_system_settings', JSON.stringify(next));
          } catch {}
          return next;
        });
      } else if (serverData?.configured === false) {
        setSystemSettings((prev) => {
          if ((prev.campusLatitude ?? null) === null && (prev.campusLongitude ?? null) === null) {
            return prev;
          }
          const next = {
            ...prev,
            campusLatitude: null,
            campusLongitude: null,
            campusLocationAccuracyM: null,
            campusLocationUpdatedAt: null,
          };
          try {
            localStorage.setItem('ekklesphere_system_settings', JSON.stringify(next));
          } catch {}
          return next;
        });
      }

      if (serverData && Array.isArray(serverData.liveCheckins)) {
        setAttendanceRecords((prev) => {
          const offlineQueued = prev.filter((r) => r.waitingToSync);
          const serverKeys = new Set(
            serverData.liveCheckins.map(
              (r: AttendanceRecord) => `${r.serviceInstanceId || ''}::${r.personId}`
            )
          );
          const remainingOffline = offlineQueued.filter(
            (r) => !serverKeys.has(`${r.serviceInstanceId || ''}::${r.personId}`)
          );
          const combined: AttendanceRecord[] = [...remainingOffline, ...serverData.liveCheckins];

          if (
            combined.length === prev.length &&
            combined.every(
              (item, idx) =>
                item.id === prev[idx]?.id &&
                item.personId === prev[idx]?.personId &&
                item.serviceInstanceId === prev[idx]?.serviceInstanceId &&
                item.checkedInIso === prev[idx]?.checkedInIso &&
                item.method === prev[idx]?.method &&
                Boolean(item.waitingToSync) === Boolean(prev[idx]?.waitingToSync)
            )
          ) {
            return prev;
          }
          return combined;
        });
      }

      if (serverData?.telemetrySummary) {
        const nextSum = serverData.telemetrySummary;
        setTelemetrySummary((prev) => {
          if (
            prev.totalSignals === nextSum.totalSignals &&
            prev.accepted === nextSum.accepted &&
            prev.flagged === nextSum.flagged &&
            prev.rejected === nextSum.rejected &&
            prev.mockAttempts === nextSum.mockAttempts &&
            prev.openShifts === nextSum.openShifts &&
            prev.avgDwellMinutes === nextSum.avgDwellMinutes &&
            (prev.recentSignals?.length || 0) === (nextSum.recentSignals?.length || 0) &&
            prev.recentSignals?.[0]?.id === nextSum.recentSignals?.[0]?.id
          ) {
            return prev;
          }
          return nextSum;
        });
      }
    } catch {
      // ignore transient network errors
    }
  };

  const parseTimeDisplay = (raw: unknown, fallback: string): string => {
    if (typeof raw !== 'string' || !raw.trim()) return fallback;
    const trimmed = raw.trim();
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(trimmed)) {
      const [h, m] = trimmed.split(':');
      return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
    }
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return `${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')}`;
    }
    return fallback;
  };

  const mapDbEventToService = (ev: any): ServiceInstance => {
    const rawStart = ev.start_time || ev.starts_at;
    const rawEnd = ev.end_time || ev.ends_at;
    const startStr = parseTimeDisplay(rawStart, '08:00');
    const endStr = parseTimeDisplay(rawEnd, '10:30');

    let dateStr = '';
    if (typeof rawStart === 'string' && rawStart.includes('T')) {
      const parsedStart = new Date(rawStart);
      if (!Number.isNaN(parsedStart.getTime())) {
        dateStr = formatLocalDateIso(parsedStart);
      }
    }
    if (!dateStr && typeof ev.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ev.date)) {
      dateStr = ev.date;
    }
    if (!dateStr) {
      dateStr = formatLocalDateIso();
    }

    let expectedCount = Number(ev.expected_attendance) || 0;
    if (!expectedCount && typeof ev.description === 'string') {
      const match = ev.description.match(/Expected attendance:\s*(\d+)/i);
      if (match) expectedCount = Number(match[1]) || 0;
    }

    const allowanceMinutes = Math.max(
      0,
      Number(ev.dwell_min ?? ev.dwellMinutes ?? ev.allowance_minutes ?? 0) || 0
    );
    const startTimeIso = typeof rawStart === 'string' && rawStart.includes('T') ? rawStart : undefined;
    const endTimeIso = typeof rawEnd === 'string' && rawEnd.includes('T') ? rawEnd : undefined;

    const rawDbStatus = String(ev.status || '').trim().toLowerCase();
    const isManualClosed = rawDbStatus === 'closed' || rawDbStatus === 'completed';
    let mappedStatus: ServiceInstance['status'];
    if (rawDbStatus === 'cancelled') {
      mappedStatus = 'cancelled';
    } else if (isManualClosed) {
      mappedStatus = 'closed';
    } else {
      mappedStatus = 'scheduled';
    }

    return {
      id: ev.id,
      serviceId: ev.id,
      campusId: ev.site_id || ev.campus_id || '00000000-0000-0000-0000-000000000001',
      name: ev.name || 'Worship Service',
      date: dateStr,
      startsAt: startStr,
      endsAt: endStr,
      startTimeIso,
      endTimeIso,
      dwellMinutes: allowanceMinutes,
      status: mappedStatus,
      manualClosed: isManualClosed,
      expectedAttendance: expectedCount,
    };
  };

  const refreshServices = async (): Promise<void> => {
    const token =
      currentUser?.token ||
      (typeof window !== 'undefined' ? localStorage.getItem('ekklesphere_token') : null);
    if (!token) return;

    const pickDefaultServiceId = (list: ServiceInstance[], prev: string): string => {
      if (list.length === 0) return '';
      if (list.some((s) => s.id === prev)) return prev;
      const nowMs = Date.now();
      const firstLive = list.find(
        (s) =>
          computeServiceBinaryStatus({
            date: s.date,
            startsAt: s.startsAt,
            endsAt: s.endsAt,
            startTimeIso: s.startTimeIso,
            endTimeIso: s.endTimeIso,
            allowanceMinutes: s.dwellMinutes ?? systemSettings.dwellTimeMinutes ?? 5,
            rawStatus:
              s.status === 'closed' || s.status === 'cancelled' ? s.status : 'active',
            nowMs,
          }) === 'live'
      );
      return firstLive?.id || list[0].id;
    };

    try {
      const res = await fetch('/api/events', { headers: getAuthHeaders() });
      if (handleUnauthorizedSession(res.status)) return;
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          const mapped = data.map(mapDbEventToService);
          setRawServices(mapped);
          setServiceClockMs(Date.now());
          try {
            localStorage.setItem('ekklesphere_services', JSON.stringify(mapped));
          } catch {}
          setActiveServiceId((prev) => {
            const nextId = pickDefaultServiceId(mapped, prev);
            try {
              if (nextId) localStorage.setItem('ekklesphere_active_service_id', nextId);
              else localStorage.removeItem('ekklesphere_active_service_id');
            } catch {}
            return nextId;
          });
          return;
        }
      }
    } catch {
      // ignore transient network errors
    }

    // Fallback: restore from localStorage on transient offline error only
    try {
      const saved = localStorage.getItem('ekklesphere_services');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const clean = parsed.filter((s: ServiceInstance) => s && !isPlaceholderServiceId(s.id));
          setRawServices(clean);
          setServiceClockMs(Date.now());
          if (clean.length > 0) {
            setActiveServiceId((prev) => pickDefaultServiceId(clean, prev));
          } else {
            setActiveServiceId('');
          }
        }
      }
    } catch {}
  };

  const addService = async (params: {
    name: string;
    date?: string;
    startsAt: string;
    endsAt?: string;
    expectedAttendance?: number;
    dwellMinutes?: number;
  }): Promise<ServiceInstance> => {
    const serviceDate =
      params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date.trim())
        ? params.date.trim()
        : formatLocalDateIso();
    const startClock = params.startsAt || '08:00';
    const endClock = params.endsAt || '10:30';

    const [yyyy, mm, dd] = serviceDate.split('-').map(Number);
    const [sh, sm] = startClock.split(':').map((v) => Number(v) || 0);
    const [eh, em] = endClock.split(':').map((v) => Number(v) || 0);

    const localStart = new Date(yyyy, mm - 1, dd, sh, sm, 0, 0);
    let localEnd = new Date(yyyy, mm - 1, dd, eh, em, 0, 0);
    if (localEnd.getTime() <= localStart.getTime()) {
      localEnd = new Date(localEnd.getTime() + 24 * 60 * 60 * 1000);
    }

    let created: ServiceInstance | null = null;
    let serverErrorMsg: string | null = null;

    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          ...params,
          date: serviceDate,
          startsAt: startClock,
          endsAt: endClock,
          startTimeIso: localStart.toISOString(),
          endTimeIso: localEnd.toISOString(),
        }),
      });

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        created = {
          ...mapDbEventToService(data),
          date: serviceDate,
          startsAt: startClock,
          endsAt: endClock,
          expectedAttendance: params.expectedAttendance ?? 0,
        };
      } else {
        const errBody = await res.json().catch(() => ({}));
        serverErrorMsg = errBody?.message || `Failed to save service (HTTP ${res.status})`;
      }
    } catch {
      // network offline fallback allowed below
    }

    if (serverErrorMsg) {
      throw new Error(serverErrorMsg);
    }

    const allowanceMinutes = Math.max(
      0,
      Number(params.dwellMinutes ?? systemSettings.dwellTimeMinutes ?? 5) || 0
    );

    if (!created) {
      const newId = `svc-${Date.now()}`;
      created = {
        id: newId,
        serviceId: newId,
        campusId: '00000000-0000-0000-0000-000000000001',
        name: params.name || 'Worship Service',
        date: serviceDate,
        startsAt: startClock,
        endsAt: endClock,
        startTimeIso: localStart.toISOString(),
        endTimeIso: localEnd.toISOString(),
        dwellMinutes: allowanceMinutes,
        status: 'scheduled',
        manualClosed: false,
        expectedAttendance: params.expectedAttendance ?? 0,
      };
    }

    // Direct write to Firestore as cloud backup
    try {
      setDoc(doc(db, 'events', created.id), {
        id: created.id,
        serviceId: created.serviceId,
        campusId: created.campusId,
        name: created.name,
        date: created.date,
        startsAt: created.startsAt,
        endsAt: created.endsAt,
        startTimeIso: created.startTimeIso || localStart.toISOString(),
        endTimeIso: created.endTimeIso || localEnd.toISOString(),
        status: created.status,
        expectedAttendance: created.expectedAttendance,
        dwellMinutes: allowanceMinutes,
        createdAt: new Date().toISOString(),
      }, { merge: true }).catch(() => {});
    } catch {}

    setServiceClockMs(Date.now());
    setRawServices((prev) => {
      const withoutPlaceholder = prev.filter((s) => !isPlaceholderServiceId(s.id));
      const updated = [...withoutPlaceholder, created!];
      try {
        localStorage.setItem('ekklesphere_services', JSON.stringify(updated));
      } catch {}
      return updated;
    });

    setActiveServiceId(created.id);
    try {
      localStorage.setItem('ekklesphere_active_service_id', created.id);
    } catch {}

    showToast(
      `Scheduled "${created.name}" for ${formatDisplayDateLabel(created.date)} (${created.startsAt}${created.endsAt ? ` – ${created.endsAt}` : ''})`
    );
    return created;
  };

  const updateService = async (
    serviceId: string,
    updates: {
      name?: string;
      date?: string;
      startsAt?: string;
      endsAt?: string;
      expectedAttendance?: number;
      dwellMinutes?: number;
      status?: 'live' | 'closed';
    }
  ): Promise<void> => {
    const existing = rawServices.find((s) => s.id === serviceId);
    const serviceDate =
      updates.date && /^\d{4}-\d{2}-\d{2}$/.test(updates.date.trim())
        ? updates.date.trim()
        : existing?.date || formatLocalDateIso();
    const startClock = updates.startsAt || existing?.startsAt || '08:00';
    const endClock = updates.endsAt || existing?.endsAt || '10:30';
    const allowanceMinutes = Math.max(
      0,
      Number(updates.dwellMinutes ?? existing?.dwellMinutes ?? systemSettings.dwellTimeMinutes ?? 5) || 0
    );

    const [yyyy, mm, dd] = serviceDate.split('-').map(Number);
    const [sh, sm] = startClock.split(':').map((v) => Number(v) || 0);
    const [eh, em] = endClock.split(':').map((v) => Number(v) || 0);
    const localStart = new Date(yyyy, mm - 1, dd, sh, sm, 0, 0);
    let localEnd = new Date(yyyy, mm - 1, dd, eh, em, 0, 0);
    if (localEnd.getTime() <= localStart.getTime()) {
      localEnd = new Date(localEnd.getTime() + 24 * 60 * 60 * 1000);
    }

    const payload: Record<string, unknown> = {
      name: updates.name?.trim() || existing?.name || 'Worship Service',
      date: serviceDate,
      startsAt: startClock,
      endsAt: endClock,
      startTimeIso: localStart.toISOString(),
      endTimeIso: localEnd.toISOString(),
      dwellMinutes: allowanceMinutes,
      allowanceMinutes,
      expectedAttendance:
        typeof updates.expectedAttendance === 'number'
          ? updates.expectedAttendance
          : existing?.expectedAttendance ?? 0,
    };
    if (updates.status) {
      payload.status = updates.status === 'closed' ? 'closed' : 'active';
    }

    const isPlaceholderId =
      isPlaceholderServiceId(serviceId) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(serviceId);

    let mappedUpdated: ServiceInstance | null = null;
    let closeAbsenceSweep: ServiceAbsenceSweepResult | null = null;
    try {
      let res: Response;
      if (isPlaceholderId) {
        // Materialize local placeholder service directly in Supabase `events`
        res = await fetch('/api/events', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`/api/events/${encodeURIComponent(serviceId)}`, {
          method: 'PATCH',
          headers: getAuthHeaders(),
          body: JSON.stringify(payload),
        });
        if (res.status === 404 && !existing?.id?.includes('-')) {
          res = await fetch('/api/events', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(payload),
          });
        }
      }
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        mappedUpdated = mapDbEventToService(data);
        if (data?.absenceSweep) {
          closeAbsenceSweep = data.absenceSweep as ServiceAbsenceSweepResult;
        }
      } else {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody?.message || `Failed to update service (HTTP ${res.status})`);
      }
    } catch (err: any) {
      if (err?.message && !/failed to fetch|network/i.test(err.message)) {
        throw err;
      }
    }

    if (!mappedUpdated) {
      mappedUpdated = {
        ...(existing || {
          id: serviceId,
          serviceId,
          campusId: '00000000-0000-0000-0000-000000000001',
        }),
        name: String(payload.name),
        date: serviceDate,
        startsAt: startClock,
        endsAt: endClock,
        startTimeIso: localStart.toISOString(),
        endTimeIso: localEnd.toISOString(),
        dwellMinutes: allowanceMinutes,
        status: updates.status === 'closed' ? 'closed' : 'scheduled',
        manualClosed: updates.status === 'closed',
        expectedAttendance: Number(payload.expectedAttendance) || 0,
      };
    }

    const updatedBinaryStatus = computeServiceBinaryStatus({
      date: mappedUpdated.date,
      startsAt: mappedUpdated.startsAt,
      endsAt: mappedUpdated.endsAt,
      startTimeIso: mappedUpdated.startTimeIso,
      endTimeIso: mappedUpdated.endTimeIso,
      allowanceMinutes: mappedUpdated.dwellMinutes ?? allowanceMinutes,
      rawStatus:
        mappedUpdated.status === 'closed' || mappedUpdated.status === 'cancelled'
          ? mappedUpdated.status
          : 'active',
      nowMs: Date.now(),
    });

    try {
      setDoc(
        doc(db, 'events', mappedUpdated.id),
        {
          id: mappedUpdated.id,
          name: mappedUpdated.name,
          date: mappedUpdated.date,
          startsAt: mappedUpdated.startsAt,
          endsAt: mappedUpdated.endsAt,
          startTimeIso: mappedUpdated.startTimeIso,
          endTimeIso: mappedUpdated.endTimeIso,
          dwellMinutes: allowanceMinutes,
          status: updatedBinaryStatus === 'live' ? 'open' : 'closed',
          expectedAttendance: mappedUpdated.expectedAttendance,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      ).catch(() => {});
    } catch {}

    setServiceClockMs(Date.now());
    setRawServices((prev) => {
      const hasOriginal = prev.some((s) => s.id === serviceId);
      const updated = hasOriginal
        ? prev.map((s) => (s.id === serviceId ? mappedUpdated! : s))
        : [...prev.filter((s) => !isPlaceholderServiceId(s.id)), mappedUpdated!];
      try {
        localStorage.setItem('ekklesphere_services', JSON.stringify(updated));
      } catch {}
      return updated;
    });

    if (mappedUpdated.id !== serviceId) {
      setAttendanceRecords((prev) =>
        prev.map((r) =>
          r.serviceInstanceId === serviceId ? { ...r, serviceInstanceId: mappedUpdated!.id } : r
        )
      );
      setActiveServiceId((curr) => {
        const nextId = curr === serviceId ? mappedUpdated!.id : curr;
        try {
          localStorage.setItem('ekklesphere_active_service_id', nextId);
        } catch {}
        return nextId;
      });
    }

    if (closeAbsenceSweep) {
      if (Array.isArray(closeAbsenceSweep.allTasks)) {
        setFollowupTasks(closeAbsenceSweep.allTasks);
      }
      refreshMembers().catch(() => {});
      if (pastoralMonitor) {
        fetchPastoralMonitor().catch(() => {});
      }
      showToast(
        closeAbsenceSweep.message ||
          `Closed "${mappedUpdated.name}": ${closeAbsenceSweep.memberMessagesSent} absent alert(s), ${closeAbsenceSweep.leaderRemindersSent} leader reminder(s).`
      );
    } else {
      showToast(
        `Updated "${mappedUpdated.name}" (${updatedBinaryStatus === 'live' ? 'Live' : 'Closed'})`
      );
    }
  };

  const deleteService = async (serviceId: string): Promise<void> => {
    const svcToDelete = rawServices.find((s) => s.id === serviceId);
    const isPlaceholderId =
      isPlaceholderServiceId(serviceId) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(serviceId);

    if (!isPlaceholderId) {
      try {
        const res = await fetch(`/api/events/${encodeURIComponent(serviceId)}`, {
          method: 'DELETE',
          headers: getAuthHeaders(),
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          showToast(errBody?.message || 'Could not delete scheduled service from database.');
          await refreshServices();
          return;
        }
      } catch (err) {
        console.error('Error deleting service:', err);
        showToast('Network error deleting service from database.');
        return;
      }
    }

    try {
      deleteDoc(doc(db, 'events', serviceId)).catch(() => {});
    } catch {}

    setRawServices((prev) => {
      const updated = prev.filter((s) => s.id !== serviceId);
      try {
        localStorage.setItem('ekklesphere_services', JSON.stringify(updated));
      } catch {}
      setActiveServiceId((curr) => {
        const nextId = curr === serviceId ? updated[0]?.id || '' : curr;
        try {
          if (nextId) localStorage.setItem('ekklesphere_active_service_id', nextId);
          else localStorage.removeItem('ekklesphere_active_service_id');
        } catch {}
        return nextId;
      });
      return updated;
    });
    setAttendanceRecords((prev) => prev.filter((r) => r.serviceInstanceId !== serviceId));
    showToast(`Service "${svcToDelete?.name || 'Event'}" deleted from database`);
  };

  const refreshDonations = async (): Promise<void> => {
    const token =
      currentUser?.token ||
      (typeof window !== 'undefined' ? localStorage.getItem('ekklesphere_token') : null);
    if (!token) return;
    try {
      const res = await fetch('/api/donations', { headers: getAuthHeaders() });
      if (handleUnauthorizedSession(res.status)) return;
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (Array.isArray(data?.donations)) {
          setDonations(data.donations);
        }
      }
    } catch {
      // ignore transient network errors
    }
  };

  const refreshFollowupTasks = async (): Promise<void> => {
    const token =
      currentUser?.token ||
      (typeof window !== 'undefined' ? localStorage.getItem('ekklesphere_token') : null);
    const role = currentUser?.verifiedRole || currentUser?.role;
    const isStaff =
      canMonitorPastoralCare(currentUser) ||
      role === 'admin' ||
      role === 'pastor' ||
      role === 'usher' ||
      role === 'group_leader' ||
      role === 'super_admin' ||
      role === 'creator';
    if (!token || !isStaff) return;
    try {
      const res = await fetch('/api/followup-tasks', { headers: getAuthHeaders() });
      if (handleUnauthorizedSession(res.status)) return;
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (Array.isArray(data?.tasks)) {
          setFollowupTasks(data.tasks);
        }
      }
    } catch {
      // ignore transient network errors
    }
  };

  const refreshMemberConsentsAndRsvps = async (): Promise<void> => {
    const token =
      currentUser?.token ||
      (typeof window !== 'undefined' ? localStorage.getItem('ekklesphere_token') : null);
    if (!token) return;
    try {
      const [cRes, rRes] = await Promise.all([
        fetch('/api/consents/me', { headers: getAuthHeaders() }).catch(() => null),
        fetch('/api/rsvps/me', { headers: getAuthHeaders() }).catch(() => null),
      ]);
      if ((cRes && handleUnauthorizedSession(cRes.status)) || (rRes && handleUnauthorizedSession(rRes.status))) {
        return;
      }
      if (cRes?.ok) {
        const cData = await cRes.json().catch(() => ({}));
        if (cData?.consents) {
          setMemberConsents(cData.consents);
        }
      }
      if (rRes?.ok) {
        const rData = await rRes.json().catch(() => ({}));
        if (rData?.rsvps && typeof rData.rsvps === 'object') {
          setMemberRsvps(rData.rsvps);
        }
      }
    } catch {
      // ignore transient errors
    }
  };

  useEffect(() => {
    if (!isSessionVerified || !currentUser?.token) {
      return;
    }
    refreshSystemSettings();
    refreshCommunicationStatus();
    refreshChurchGroups();
    refreshLeadershipHistory();
    refreshAuditLogs();
    refreshLivePremise();
    refreshMembers();
    refreshServices();
    refreshDonations();
    refreshFollowupTasks();
    refreshMemberConsentsAndRsvps();
    const interval = setInterval(refreshLivePremise, 4000);
    return () => clearInterval(interval);
  }, [isSessionVerified, currentUser?.id, currentUser?.organization_id, currentUser?.token]);

  const setChurchPremiseLocation = async (params: {
    lat: number;
    lng: number;
    accuracyM?: number | null;
    churchName?: string;
    campusName?: string;
    campusAddress?: string;
    innerGeofenceMeters?: number;
    outerGeofenceMeters?: number;
    dwellTimeMinutes?: number;
  }): Promise<boolean> => {
    try {
      serverPremiseUnavailableErrorsRef.current = 0;
      const parsedLat = typeof params.lat === 'number' ? params.lat : parseFloat(String(params.lat));
      const parsedLng = typeof params.lng === 'number' ? params.lng : parseFloat(String(params.lng));

      if (
        !Number.isFinite(parsedLat) ||
        !Number.isFinite(parsedLng) ||
        parsedLat < -90 ||
        parsedLat > 90 ||
        parsedLng < -180 ||
        parsedLng > 180
      ) {
        showToast('Valid latitude (-90 to 90) and longitude (-180 to 180) are required.');
        return false;
      }

      const churchName = (params.churchName || systemSettings.churchName || '').trim();
      const campusName = (params.campusName || systemSettings.campusName || 'Main Campus').trim();
      const campusAddress = params.campusAddress ?? systemSettings.campusAddress ?? '';
      const innerGeofenceMeters = Math.max(10, Number(params.innerGeofenceMeters ?? systemSettings.innerGeofenceMeters ?? 50));
      const outerGeofenceMeters = Math.max(25, Number(params.outerGeofenceMeters ?? systemSettings.outerGeofenceMeters ?? 300));
      const dwellTimeMinutes = Math.max(1, Number(params.dwellTimeMinutes ?? systemSettings.dwellTimeMinutes ?? 5));
      const accuracyM =
        params.accuracyM != null && !Number.isNaN(Number(params.accuracyM))
          ? Math.max(0, Number(params.accuracyM))
          : null;

      const payload = {
        lat: parsedLat,
        lng: parsedLng,
        accuracyM,
        churchName,
        campusName,
        campusAddress,
        innerGeofenceMeters,
        outerGeofenceMeters: Math.max(outerGeofenceMeters, innerGeofenceMeters),
        dwellTimeMinutes,
        updatedBy: currentUser?.name || 'Administrator',
      };

      // Persist campus premise location directly to Supabase-backed API server
      let ps: any = null;
      const res = await fetch('/api/campus-premise', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorJson = await res.json().catch(() => ({}));
        showToast(errorJson?.message || 'Could not save church premise location.');
        return false;
      }

      const data = await res.json();
      ps = data.premiseSettings;

      setSystemSettings((prev) => {
        const updated: SystemSettings = {
          ...prev,
          churchName: ps?.churchName ?? payload.churchName,
          campusName: ps?.campusName ?? payload.campusName,
          campusAddress: ps?.campusAddress ?? payload.campusAddress,
          campusLatitude: parsedLat,
          campusLongitude: parsedLng,
          campusLocationAccuracyM: accuracyM,
          campusLocationUpdatedAt: ps?.updatedAt || new Date().toISOString(),
          innerGeofenceMeters: payload.innerGeofenceMeters,
          outerGeofenceMeters: payload.outerGeofenceMeters,
          dwellTimeMinutes: payload.dwellTimeMinutes,
        };
        try {
          localStorage.setItem('ekklesphere_system_settings', JSON.stringify(updated));
        } catch {}
        return updated;
      });

      refreshAuditLogs().catch(() => {});

      showToast(
        `Church premise pinned at (${parsedLat.toFixed(5)}, ${parsedLng.toFixed(5)}) · ${payload.innerGeofenceMeters}m radius`
      );
      return true;
    } catch (err) {
      console.error('Error setting church premise location:', err);
      showToast('Error saving church premise location.');
      return false;
    }
  };

  const clearChurchPremiseLocation = async (): Promise<void> => {
    try {
      const res = await fetch('/api/campus-premise', {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        showToast(errData?.message || 'Could not clear church premise location.');
        return;
      }

      setSystemSettings((prev) => {
        const updated: SystemSettings = {
          ...prev,
          campusLatitude: null,
          campusLongitude: null,
          campusLocationAccuracyM: null,
          campusLocationUpdatedAt: null,
        };
        try {
          localStorage.setItem('ekklesphere_system_settings', JSON.stringify(updated));
        } catch {}
        return updated;
      });
      refreshAuditLogs().catch(() => {});
      showToast('Church premise GPS location cleared');
    } catch (err) {
      console.error('Error clearing church premise location:', err);
    }
  };

  const updateSystemSettings = async (newSettings: Partial<SystemSettings>): Promise<boolean> => {
    setSystemSettings((prev) => {
      const optimisticNext: SystemSettings = {
        ...prev,
        ...newSettings,
      };
      if (areSystemSettingsEqual(prev, optimisticNext)) return prev;
      try {
        localStorage.setItem('ekklesphere_system_settings', JSON.stringify(optimisticNext));
      } catch {}
      return optimisticNext;
    });

    setIsSyncingSystemSettings(true);
    try {
      const res = await fetch('/api/system-settings', {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(newSettings),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data?.message || 'Could not save system settings to database.');
        refreshSystemSettings().catch(() => {});
        return false;
      }

      if (data?.storageBackend) {
        setSystemSettingsStorageBackend(data.storageBackend);
      }
      if (data?.settings) {
        const synced: SystemSettings = {
          ...DEFAULT_SYSTEM_SETTINGS,
          ...data.settings,
        };
        setSystemSettings((prev) => {
          if (areSystemSettingsEqual(prev, synced)) return prev;
          try {
            localStorage.setItem('ekklesphere_system_settings', JSON.stringify(synced));
          } catch {}
          return synced;
        });
      }

      refreshAuditLogs().catch(() => {});
      showToast('System & Campus settings saved to Supabase database');
      return true;
    } catch (err) {
      console.warn('Could not persist system settings:', err);
      showToast('Network error saving system settings.');
      return false;
    } finally {
      setIsSyncingSystemSettings(false);
    }
  };

  const resetSystemSettings = async (): Promise<boolean> => {
    setIsSyncingSystemSettings(true);
    try {
      const res = await fetch('/api/system-settings/reset', {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data?.message || 'Could not reset system settings.');
        return false;
      }

      const next: SystemSettings = {
        ...DEFAULT_SYSTEM_SETTINGS,
        ...(data?.settings || {}),
      };
      setSystemSettings(next);
      if (data?.storageBackend) {
        setSystemSettingsStorageBackend(data.storageBackend);
      }
      try {
        localStorage.setItem('ekklesphere_system_settings', JSON.stringify(next));
      } catch {}
      refreshAuditLogs().catch(() => {});
      showToast('System settings reset to defaults. Please set your Church Premise GPS location.');
      return true;
    } catch {
      showToast('Network error resetting system settings.');
      return false;
    } finally {
      setIsSyncingSystemSettings(false);
    }
  };

  const refreshCommunicationStatus = async (): Promise<void> => {
    try {
      const res = await fetch('/api/communications/status', { headers: getAuthHeaders() });
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      if (data?.success) {
        setCommunicationStatus({
          arkeselConfigured: Boolean(data.arkeselConfigured),
          arkeselSource: data.arkeselSource || 'none',
          arkeselKeyMasked: data.arkeselKeyMasked ?? null,
          resendConfigured: Boolean(data.resendConfigured),
          paystackConfigured: Boolean(data.paystackConfigured),
          paystackSource: data.paystackSource || 'none',
          paystackPublicKey: String(data.paystackPublicKey || ''),
          paystackSecretMasked: data.paystackSecretMasked ?? null,
          paystackMode: data.paystackMode || 'unconfigured',
          defaultSmsSenderId: String(data.defaultSmsSenderId || 'EKKLESPHERE'),
          defaultFromEmail: String(data.defaultFromEmail || 'onboarding@resend.dev'),
          defaultFromName: String(data.defaultFromName || 'Ekklesphere Church'),
        });
      }
    } catch {
      // keep fallback status
    }
  };

  const saveTenantGatewayKeys = async (patch: {
    arkeselApiKey?: string;
    clearArkeselApiKey?: boolean;
    paystackPublicKey?: string;
    paystackSecretKey?: string;
    clearPaystackKeys?: boolean;
  }): Promise<{ success: boolean; message: string }> => {
    try {
      const res = await fetch('/api/system-settings/gateways', {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(patch),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        const msg = data?.message || 'Could not save tenant gateway credentials.';
        showToast(msg);
        return { success: false, message: msg };
      }
      if (data?.gateways) {
        setCommunicationStatus((prev) => ({
          ...prev,
          arkeselConfigured: Boolean(data.gateways.arkeselConfigured),
          arkeselSource: data.gateways.arkeselSource || 'none',
          arkeselKeyMasked: data.gateways.arkeselKeyMasked ?? null,
          paystackConfigured: Boolean(data.gateways.paystackConfigured),
          paystackSource: data.gateways.paystackSource || 'none',
          paystackPublicKey: String(data.gateways.paystackPublicKey || ''),
          paystackSecretMasked: data.gateways.paystackSecretMasked ?? null,
          paystackMode: data.gateways.paystackMode || 'unconfigured',
        }));
      } else {
        await refreshCommunicationStatus();
      }
      refreshAuditLogs().catch(() => {});
      const msg = data?.message || 'Encrypted tenant gateway credentials saved.';
      showToast(msg);
      return { success: true, message: msg };
    } catch {
      const msg = 'Network error saving tenant gateway keys.';
      showToast(msg);
      return { success: false, message: msg };
    }
  };

  const testPaystackGateway = async (): Promise<{
    success: boolean;
    mode?: 'live' | 'test' | 'unconfigured';
    message: string;
  }> => {
    try {
      const res = await fetch('/api/system-settings/test-paystack', {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        const msg = data?.message || 'Paystack API verification failed.';
        showToast(msg);
        return { success: false, mode: data?.mode, message: msg };
      }
      const msg = data?.message || 'Paystack API connection verified.';
      showToast(msg);
      refreshAuditLogs().catch(() => {});
      return { success: true, mode: data?.mode, message: msg };
    } catch {
      const msg = 'Network error verifying Paystack API.';
      showToast(msg);
      return { success: false, message: msg };
    }
  };

  const sendTestSmsGateway = async (
    provider: string,
    senderId: string,
    recipientPhone?: string
  ): Promise<{ success: boolean; message: string }> => {
    try {
      const res = await fetch('/api/system-settings/test-sms', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          provider,
          senderId,
          ...(recipientPhone?.trim() ? { recipientPhone: recipientPhone.trim() } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        const msg = data?.message || 'Could not dispatch test SMS.';
        showToast(msg);
        return { success: false, message: msg };
      }
      const msg =
        data.message ||
        `Test SMS dispatched via ${provider} using Sender ID: "${senderId.toUpperCase()}"`;
      showToast(msg);
      refreshAuditLogs().catch(() => {});
      return { success: true, message: msg };
    } catch {
      const msg = 'Network error dispatching test SMS.';
      showToast(msg);
      return { success: false, message: msg };
    }
  };

  const sendTestEmailGateway = async (params: {
    recipientEmail: string;
    fromEmail?: string;
    fromName?: string;
  }): Promise<{ success: boolean; message: string }> => {
    try {
      const res = await fetch('/api/system-settings/test-email', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          provider: systemSettings.emailGatewayProvider || 'Resend Email',
          recipientEmail: params.recipientEmail.trim(),
          ...(params.fromEmail?.trim() ? { fromEmail: params.fromEmail.trim() } : {}),
          ...(params.fromName?.trim() ? { fromName: params.fromName.trim() } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        const msg = data?.message || 'Could not send test email via Resend.';
        showToast(msg);
        return { success: false, message: msg };
      }
      const msg = data.message || `Test email sent via Resend to ${params.recipientEmail}`;
      showToast(msg);
      refreshAuditLogs().catch(() => {});
      return { success: true, message: msg };
    } catch {
      const msg = 'Network error dispatching test email.';
      showToast(msg);
      return { success: false, message: msg };
    }
  };

  const sendCommunicationBroadcast = async (params: {
    channel: 'push' | 'sms' | 'email';
    audience: string;
    subject: string;
    body: string;
  }): Promise<{ success: boolean; sentCount?: number; message: string }> => {
    try {
      const res = await fetch('/api/communications/broadcast', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(params),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        const msg = data?.message || 'Could not deliver broadcast message.';
        showToast(msg);
        return { success: false, message: msg };
      }
      const msg = data.message || 'Broadcast sent successfully.';
      showToast(msg);
      refreshAuditLogs().catch(() => {});
      return { success: true, sentCount: data.sentCount, message: msg };
    } catch {
      const msg = 'Network error sending broadcast.';
      showToast(msg);
      return { success: false, message: msg };
    }
  };

  const addChurchGroup = async (
    groupData: Omit<ChurchGroup, 'id' | 'createdAt'>
  ): Promise<{ ok: boolean; group?: ChurchGroup; field?: string; message?: string }> => {
    try {
      const res = await fetch('/api/church-groups', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(groupData),
      });
      if (handleUnauthorizedSession(res.status)) {
        return { ok: false, message: 'Your session expired. Please sign in again.' };
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.group) {
        const msg = data?.message || 'Could not save church group to database.';
        showToast(msg);
        return { ok: false, field: data?.field, message: msg };
      }
      setChurchGroups((prev) => {
        const updated = [data.group, ...prev.filter((g) => g.id !== data.group.id)];
        try {
          localStorage.setItem('ekklesphere_church_groups', JSON.stringify(updated));
        } catch {}
        return updated;
      });
      refreshLeadershipHistory().catch(() => {});
      refreshAuditLogs().catch(() => {});
      showToast(`${data.group.name} saved to Supabase`);
      return { ok: true, group: data.group };
    } catch {
      const msg = 'Network error saving church group.';
      showToast(msg);
      return { ok: false, message: msg };
    }
  };

  const updateChurchGroup = async (
    id: string,
    updates: Partial<ChurchGroup> & { leadershipChangeReason?: string }
  ): Promise<{ ok: boolean; group?: ChurchGroup; field?: string; message?: string }> => {
    const existingGroup = churchGroups.find((g) => g.id === id);
    const oldName = existingGroup?.name?.trim() || '';
    const nextName = updates.name?.trim() || '';

    try {
      const res = await fetch(`/api/church-groups/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(updates),
      });
      if (handleUnauthorizedSession(res.status)) {
        return { ok: false, message: 'Your session expired. Please sign in again.' };
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.group) {
        const msg = data?.message || 'Could not update church group.';
        showToast(msg);
        return { ok: false, field: data?.field, message: msg };
      }

      const savedGroup: ChurchGroup = data.group;
      setChurchGroups((prev) => {
        const synced = prev.map((g) => (g.id === id ? savedGroup : g));
        try {
          localStorage.setItem('ekklesphere_church_groups', JSON.stringify(synced));
        } catch {}
        return synced;
      });

      const resolvedNextName = (savedGroup.name || nextName).trim();
      if (oldName && resolvedNextName && oldName.toLowerCase() !== resolvedNextName.toLowerCase()) {
        const oldLower = oldName.toLowerCase();
        setMembers((prev) => {
          const syncedMembers = prev.map((m) => {
            const matchesGroup = (m.groupName || '').trim().toLowerCase() === oldLower;
            const matchesCell = (m.homeCellGroup || '').trim().toLowerCase() === oldLower;
            const currentDepts = resolveMemberDepartments(m);
            const hasMatchingDept =
              currentDepts.some((d) => d.trim().toLowerCase() === oldLower) ||
              (m.department || '').trim().toLowerCase() === oldLower;
            if (!matchesGroup && !matchesCell && !hasMatchingDept) return m;

            const nextDeptFields = hasMatchingDept
              ? normalizeMemberDepartmentFields({
                  departments: currentDepts.map((d) =>
                    d.trim().toLowerCase() === oldLower ? resolvedNextName : d
                  ),
                })
              : null;

            return {
              ...m,
              ...(matchesGroup ? { groupName: resolvedNextName } : {}),
              ...(matchesCell ? { homeCellGroup: resolvedNextName } : {}),
              ...(nextDeptFields
                ? {
                    department: nextDeptFields.department,
                    departments: nextDeptFields.departments,
                  }
                : {}),
            };
          });
          try {
            localStorage.setItem('ekklesphere_members', JSON.stringify(syncedMembers));
          } catch {}
          return syncedMembers;
        });
      }

      refreshLeadershipHistory().catch(() => {});
      refreshAuditLogs().catch(() => {});
      showToast(`${savedGroup.name || 'Group'} updated`);
      return { ok: true, group: savedGroup };
    } catch {
      const msg = 'Network error updating church group.';
      showToast(msg);
      return { ok: false, message: msg };
    }
  };

  const deleteChurchGroup = (id: string) => {
    const groupToDelete = churchGroups.find((g) => g.id === id);
    setChurchGroups((prev) => {
      const updated = prev.filter((g) => g.id !== id);
      try {
        localStorage.setItem('ekklesphere_church_groups', JSON.stringify(updated));
      } catch {}
      return updated;
    });

    fetch(`/api/church-groups/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          showToast(data?.message || 'Could not delete church group.');
          refreshChurchGroups().catch(() => {});
          return;
        }
        refreshLeadershipHistory().catch(() => {});
        refreshAuditLogs().catch(() => {});
        showToast(`Removed "${groupToDelete?.name || 'Group'}"`);
      })
      .catch(() => {
        showToast('Network error removing church group.');
        refreshChurchGroups().catch(() => {});
      });
  };

  const toggleChurchGroupStatus = (id: string) => {
    const group = churchGroups.find((g) => g.id === id);
    if (!group) return;
    const newStatus = !group.active;
    updateChurchGroup(id, { active: newStatus });
  };

  const getGroupMembers = (groupName: string): Person[] => {
    return members.filter((m) => memberMatchesChurchGroup(m, groupName));
  };



  const syncUsherCheckins = (): number => {
    if (!isUsherOnline) {
      showToast('Cannot sync while offline. Reconnect first.');
      return 0;
    }
    const queued = attendanceRecords.filter((r) => r.waitingToSync);
    if (queued.length === 0) {
      setPendingSyncCount(0);
      showToast('No pending offline check-ins to sync.');
      return 0;
    }

    void (async () => {
      let syncedCount = 0;
      let rejectedCount = 0;
      let lastRejectMsg = '';
      const rejectedIds = new Set<string>();
      const syncedIds = new Set<string>();

      for (const rec of queued) {
        const person = members.find((m) => m.id === rec.personId);
        try {
          const res = await fetch('/api/live-checkins', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
              ...rec,
              waitingToSync: false,
              personName: person ? `${person.firstName} ${person.lastName}`.trim() : 'Member',
              recordedBy: currentUser?.name,
            }),
          });
          if (res.ok) {
            syncedIds.add(rec.id);
            syncedCount += 1;
          } else {
            const errBody = await res.json().catch(() => ({}));
            rejectedIds.add(rec.id);
            rejectedCount += 1;
            if (errBody?.message) lastRejectMsg = errBody.message;
          }
        } catch {
          // Leave in pending queue if network failed again
        }
      }

      setAttendanceRecords((prev) =>
        prev
          .filter((r) => !rejectedIds.has(r.id))
          .map((r) => (syncedIds.has(r.id) ? { ...r, waitingToSync: false } : r))
      );
      setPendingSyncCount((prev) => Math.max(0, prev - syncedCount - rejectedCount));

      if (rejectedCount > 0 && syncedCount > 0) {
        showToast(
          `Synced ${syncedCount} check-in${syncedCount === 1 ? '' : 's'}; ${rejectedCount} blocked (${lastRejectMsg || 'service closed'}).`
        );
      } else if (rejectedCount > 0) {
        showToast(
          lastRejectMsg ||
            `Could not sync ${rejectedCount} check-in${rejectedCount === 1 ? '' : 's'}: service is closed or unscheduled.`
        );
      } else if (syncedCount > 0) {
        showToast(`Synced ${syncedCount} check-in${syncedCount === 1 ? '' : 's'} to server.`);
      } else {
        showToast('Network error syncing offline check-ins. Please try again.');
      }
    })();

    return queued.length;
  };

  const updateMemberConsent = async (
    autoCheckin: boolean,
    push: boolean,
    sms: boolean,
    email: boolean
  ): Promise<void> => {
    const previous = memberConsents;
    const nextConsents = { autoCheckin, push, sms, email };
    setMemberConsents(nextConsents);
    const targetMemberId = currentUser?.memberId || currentUser?.id;
    if (targetMemberId) {
      setMembers((prev) =>
        prev.map((m) => (m.id === targetMemberId ? { ...m, autoCheckinOptedIn: autoCheckin } : m))
      );
    }

    try {
      const res = await fetch('/api/consents/me', {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(nextConsents),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        setMemberConsents(previous);
        showToast(errBody?.message || 'Could not save privacy consent preferences to database.');
        return;
      }
      const data = await res.json().catch(() => null);
      if (data?.consents) {
        setMemberConsents(data.consents);
      }
      showToast(
        autoCheckin
          ? 'Auto check-in activated. Location is used only when arriving at church.'
          : 'Auto check-in deactivated. Background location is stopped.'
      );
    } catch {
      setMemberConsents(previous);
      showToast('Network error saving privacy consent preferences.');
    }
  };

  const toggleRsvp = async (eventName: string, eventId?: string): Promise<void> => {
    const nextAttending = !memberRsvps[eventName];
    try {
      const res = await fetch('/api/rsvps/me', {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          eventTitle: eventName,
          ...(eventId ? { eventId } : {}),
          attending: nextAttending,
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        showToast(errBody?.message || 'Could not update RSVP in database.');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (data?.rsvps && typeof data.rsvps === 'object') {
        setMemberRsvps(data.rsvps);
      } else {
        setMemberRsvps((prev) => ({ ...prev, [eventName]: nextAttending }));
      }
      showToast(nextAttending ? `RSVP confirmed for ${eventName}` : `RSVP removed for ${eventName}`);
    } catch {
      showToast('Network error updating event RSVP.');
    }
  };

  const submitDonation = async (
    amountGhs: number,
    fund: string,
    method: 'MTN MoMo' | 'Telecel Cash' | 'Card'
  ): Promise<boolean> => {
    try {
      const res = await fetch('/api/donations', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          amountGhs,
          fundName: fund,
          fundId: fund.toLowerCase().replace(/\s+/g, '-'),
          provider: method,
          method: method === 'Card' ? 'card' : 'momo',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.donation) {
        showToast(data?.message || 'Could not record donation in database.');
        return false;
      }
      setDonations((prev) => [data.donation, ...prev.filter((d) => d.id !== data.donation.id)]);
      const activeCurrency = getCurrencyDisplay(systemSettings.currency).code;
      showToast(`Thank you! ${activeCurrency} ${amountGhs} given to ${fund} via ${method}.`);
      return true;
    } catch {
      showToast('Network error submitting donation.');
      return false;
    }
  };

  const initializePaystackGiving = async (params: {
    amountGhs: number;
    fundName: string;
    provider: 'MTN MoMo' | 'Telecel Cash' | 'Card';
    email?: string;
  }): Promise<{
    success: boolean;
    authorizationUrl?: string;
    reference?: string;
    publicKey?: string;
    mode?: 'live' | 'test' | 'unconfigured';
    message?: string;
  }> => {
    try {
      const res = await fetch('/api/giving/paystack/initialize', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          amountGhs: params.amountGhs,
          fundName: params.fundName,
          fundId: params.fundName.toLowerCase().replace(/\s+/g, '-'),
          provider: params.provider,
          ...(params.email ? { email: params.email } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        const msg = data?.message || 'Could not initialize Paystack checkout.';
        showToast(msg);
        return { success: false, message: msg };
      }
      if (data?.donation) {
        setDonations((prev) => [data.donation, ...prev.filter((d) => d.id !== data.donation.id)]);
      }
      return {
        success: true,
        authorizationUrl: data.authorizationUrl,
        reference: data.reference,
        publicKey: data.publicKey,
        mode: data.mode,
      };
    } catch {
      const msg = 'Network error initializing Paystack checkout.';
      showToast(msg);
      return { success: false, message: msg };
    }
  };

  const verifyPaystackGiving = async (
    reference: string
  ): Promise<{
    success: boolean;
    verified: boolean;
    status?: 'paid' | 'pending' | 'failed';
    message: string;
  }> => {
    try {
      const res = await fetch('/api/giving/paystack/verify', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ reference }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        const msg = data?.message || 'Could not verify Paystack transaction.';
        showToast(msg);
        return { success: false, verified: false, message: msg };
      }
      if (data?.donation) {
        setDonations((prev) => [
          data.donation,
          ...prev.filter((d) => d.id !== data.donation.id && d.reference !== data.reference),
        ]);
      } else {
        refreshDonations().catch(() => {});
      }
      showToast(data.message || 'Paystack transaction verified.');
      return {
        success: true,
        verified: Boolean(data.verified),
        status: data.status,
        message: data.message || 'Payment status updated.',
      };
    } catch {
      const msg = 'Network error verifying Paystack payment.';
      showToast(msg);
      return { success: false, verified: false, message: msg };
    }
  };

  const activeWallOrgKey = currentUser?.organization_id || currentUser?.tenant_id || 'default';
  const [churchWallPosts, setChurchWallPosts] = useState<ChurchWallPost[]>(() => {
    try {
      const saved = localStorage.getItem(`ekklesphere_church_wall_${activeWallOrgKey}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore
    }
    return [];
  });

  const persistWallCache = (posts: ChurchWallPost[]) => {
    try {
      localStorage.setItem(`ekklesphere_church_wall_${activeWallOrgKey}`, JSON.stringify(posts));
    } catch {
      // ignore
    }
  };

  const refreshChurchWallPosts = async () => {
    if (!currentUser) return;
    try {
      const res = await fetch('/api/church-wall', {
        headers: getAuthHeaders(),
      });
      if (handleUnauthorizedSession(res.status)) return;
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.posts)) {
          setChurchWallPosts(data.posts);
          persistWallCache(data.posts);
        }
      }
    } catch {
      // keep cached posts when offline
    }
  };

  useEffect(() => {
    if (isSessionVerified && currentUser?.token) {
      refreshChurchWallPosts();
    }
  }, [isSessionVerified, currentUser?.id, currentUser?.organization_id, currentUser?.token]);

  const addChurchWallPost = async (input: {
    message: string;
    category?: 'birthday' | 'testimony' | 'celebration';
    targetMemberId?: string;
    targetMemberName?: string;
  }): Promise<ChurchWallPost> => {
    const cleanMessage = input.message.trim();
    const authorName = currentUser?.name || 'Church Member';
    const fallbackPost: ChurchWallPost = {
      id: `wall-${Date.now()}`,
      organizationId: activeWallOrgKey,
      authorId: currentUser?.memberId || currentUser?.id || 'member',
      authorName,
      authorInitials:
        currentUser?.initials ||
        authorName
          .split(' ')
          .filter(Boolean)
          .slice(0, 2)
          .map((p) => p[0]?.toUpperCase() || '')
          .join('') ||
        'MB',
      authorAvatar: currentUser?.avatar,
      category: input.category || 'birthday',
      message: cleanMessage,
      targetMemberId: input.targetMemberId,
      targetMemberName: input.targetMemberName,
      createdAt: new Date().toISOString(),
      amens: [],
    };

    let createdPost = fallbackPost;
    try {
      const res = await fetch('/api/church-wall', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          message: cleanMessage,
          category: input.category || 'birthday',
          targetMemberId: input.targetMemberId,
          targetMemberName: input.targetMemberName,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.post) {
          createdPost = {
            ...data.post,
            authorAvatar: data.post.authorAvatar || currentUser?.avatar,
          };
        }
      }
    } catch {
      // fallback to local post when offline
    }

    setChurchWallPosts((prev) => {
      const next = [createdPost, ...prev.filter((p) => p.id !== createdPost.id)];
      persistWallCache(next);
      return next;
    });
    showToast('Birthday celebration shared to the Church Wall!');
    return createdPost;
  };

  const toggleChurchWallAmen = async (postId: string) => {
    const actorId = currentUser?.id || currentUser?.memberId || 'member';
    setChurchWallPosts((prev) => {
      const next = prev.map((post) => {
        if (post.id !== postId) return post;
        const already = post.amens.includes(actorId);
        return {
          ...post,
          amens: already ? post.amens.filter((id) => id !== actorId) : [...post.amens, actorId],
        };
      });
      persistWallCache(next);
      return next;
    });

    try {
      const res = await fetch(`/api/church-wall/${encodeURIComponent(postId)}/amen`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.post) {
          setChurchWallPosts((prev) => {
            const next = prev.map((p) => (p.id === postId ? { ...p, amens: data.post.amens } : p));
            persistWallCache(next);
            return next;
          });
        }
      }
    } catch {
      // optimistic local reaction already applied
    }
  };

  const resolveFollowupTask = async (
    taskId: string,
    outcome: string,
    nextStatus: 'open' | 'contacted' | 'resolved' | 'dismissed' = 'resolved'
  ): Promise<void> => {
    try {
      const res = await fetch(`/api/followup-tasks/${encodeURIComponent(taskId)}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status: nextStatus, outcome }),
      });
      if (handleUnauthorizedSession(res.status)) return;
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.task) {
        showToast(data?.message || 'Could not update follow-up task in database.');
        return;
      }
      setFollowupTasks((prev) => prev.map((t) => (t.id === taskId ? data.task : t)));
      showToast(
        nextStatus === 'resolved'
          ? `Care task marked resolved: ${outcome}`
          : `Care call logged (${nextStatus}): ${outcome}`
      );
    } catch {
      showToast('Network error updating follow-up task.');
    }
  };

  const updateFollowupTask = async (
    taskId: string,
    patch: {
      status?: 'open' | 'contacted' | 'resolved' | 'dismissed';
      outcome?: string;
      assignedToName?: string;
      notes?: string;
    }
  ): Promise<FollowupTask | null> => {
    try {
      const res = await fetch(`/api/followup-tasks/${encodeURIComponent(taskId)}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify(patch),
      });
      if (handleUnauthorizedSession(res.status)) return null;
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.task) {
        showToast(data?.message || 'Could not update follow-up task.');
        return null;
      }
      setFollowupTasks((prev) => prev.map((t) => (t.id === taskId ? data.task : t)));
      showToast(`Care assignment updated for ${data.task.personName}.`);
      return data.task;
    } catch {
      showToast('Network error updating follow-up task.');
      return null;
    }
  };

  const deleteFollowupTask = async (taskId: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/followup-tasks/${encodeURIComponent(taskId)}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (handleUnauthorizedSession(res.status)) return false;
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data?.message || 'Could not delete follow-up task.');
        return false;
      }
      setFollowupTasks((prev) => prev.filter((t) => t.id !== taskId));
      showToast('Care assignment deleted.');
      return true;
    } catch {
      showToast('Network error deleting follow-up task.');
      return false;
    }
  };

  const addFollowupTask = async (
    personId: string,
    reason: 'absent_2' | 'absent_3' | 'first_timer' | 'manual',
    notes: string
  ): Promise<void> => {
    const person = members.find((m) => m.id === personId);
    const {
      assignedToName,
      groupName,
      assignedToMemberId,
      assignedToRole,
      assignedToPhone,
    } = resolveFollowupAssignee(
      person,
      churchGroups,
      systemSettings,
      reason,
      currentUser?.name,
      members,
      followupTasks
    );
    const dueOn = formatFollowupDueDateLabel(
      reason,
      systemSettings.firstTimerFollowupHours,
      systemSettings.absenteeThresholdServices
    );
    try {
      const res = await fetch('/api/followup-tasks', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          personId,
          personName: person ? `${person.firstName} ${person.lastName}`.trim() : 'Member',
          personPhone: person?.phoneE164 || person?.phoneNumber || undefined,
          personEmail: person?.email || undefined,
          groupName,
          reason,
          assignedToName,
          assignedToMemberId,
          assignedToRole,
          assignedToPhone,
          dueOn,
          notes,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.task) {
        showToast(data?.message || 'Could not save follow-up task to database.');
        return;
      }
      setFollowupTasks((prev) => [data.task, ...prev.filter((t) => t.id !== data.task.id)]);
      showToast(
        `Follow-up assigned to ${assignedToName}${
          assignedToRole ? ` (${assignedToRole})` : ''
        } (${dueOn}) for ${data.task.personName}`
      );
    } catch {
      showToast('Network error creating follow-up task.');
    }
  };

  const autoAssignAbsentees = async (options?: {
    unarrivedMemberIds?: string[];
    silent?: boolean;
  }): Promise<{ assignedCount: number; message?: string }> => {
    setIsAutoAssigningAbsentees(true);
    try {
      const res = await fetch('/api/followup-tasks/auto-assign-absentees', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          ...(options?.unarrivedMemberIds?.length
            ? { unarrivedMemberIds: options.unarrivedMemberIds }
            : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        const msg = data?.message || 'Could not auto-assign absentee members.';
        if (!options?.silent) showToast(msg);
        return { assignedCount: 0, message: msg };
      }
      if (Array.isArray(data.allTasks)) {
        setFollowupTasks(data.allTasks);
      }
      const count = Number(data.assignedCount || 0);
      if (!options?.silent) {
        showToast(
          count > 0
            ? `Auto-assigned ${count} absentee member${
                count === 1 ? '' : 's'
              } to church officers and group leaders.`
            : 'All threshold absentees already have active pastoral care assignments.'
        );
      } else if (count > 0) {
        showToast(
          `Pastoral Care: Auto-assigned ${count} absentee member${
            count === 1 ? '' : 's'
          } to officers & leaders.`
        );
      }
      return { assignedCount: count };
    } catch {
      if (!options?.silent) showToast('Network error auto-assigning absentee follow-ups.');
      return { assignedCount: 0 };
    } finally {
      setIsAutoAssigningAbsentees(false);
    }
  };

  const fetchPastoralMonitor = async (): Promise<PastoralCareMonitorSummary | null> => {
    const token =
      currentUser?.token ||
      (typeof window !== 'undefined' ? localStorage.getItem('ekklesphere_token') : null);
    if (!token || !canMonitorPastoralCare(currentUser)) return null;
    setIsLoadingPastoralMonitor(true);
    try {
      const res = await fetch('/api/pastoral-care/monitor', {
        headers: getAuthHeaders(),
      });
      if (handleUnauthorizedSession(res.status)) return null;
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.monitor) {
        return null;
      }
      setPastoralMonitor(data.monitor);
      if (Array.isArray(data.monitor.tasks)) {
        setFollowupTasks(data.monitor.tasks);
      }
      return data.monitor as PastoralCareMonitorSummary;
    } catch {
      return null;
    } finally {
      setIsLoadingPastoralMonitor(false);
    }
  };

  const fetchMyLeaderReminders = async (): Promise<{
    tasks: FollowupTask[];
    dispatches: PastoralCareDispatch[];
  }> => {
    const token =
      currentUser?.token ||
      (typeof window !== 'undefined' ? localStorage.getItem('ekklesphere_token') : null);
    if (!token) return { tasks: [], dispatches: [] };
    try {
      const res = await fetch('/api/pastoral-care/my-reminders', {
        headers: getAuthHeaders(),
      });
      if (handleUnauthorizedSession(res.status)) return { tasks: [], dispatches: [] };
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { tasks: [], dispatches: [] };
      const next = {
        tasks: Array.isArray(data.tasks) ? data.tasks : [],
        dispatches: Array.isArray(data.dispatches) ? data.dispatches : [],
      };
      setMyLeaderReminders(next);
      return next;
    } catch {
      return { tasks: [], dispatches: [] };
    }
  };

  const runAbsenceSweep = async (options?: {
    eventId?: string;
    force?: boolean;
  }): Promise<ServiceAbsenceSweepResult | null> => {
    setIsRunningAbsenceSweep(true);
    try {
      const res = await fetch('/api/pastoral-care/run-absence-sweep', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          ...(options?.eventId ? { eventId: options.eventId } : {}),
          ...(options?.force !== undefined ? { force: options.force } : {}),
        }),
      });
      if (handleUnauthorizedSession(res.status)) return null;
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        showToast(data?.message || 'Could not execute absence sweep.');
        return null;
      }
      if (Array.isArray(data.allTasks)) {
        setFollowupTasks(data.allTasks);
      }
      await Promise.all([
        refreshMembers().catch(() => {}),
        fetchPastoralMonitor().catch(() => {}),
        refreshAuditLogs().catch(() => {}),
      ]);
      showToast(data.message || 'Absence outreach and pastoral leader reminders completed.');
      return data as ServiceAbsenceSweepResult;
    } catch {
      showToast('Network error running absence outreach sweep.');
      return null;
    } finally {
      setIsRunningAbsenceSweep(false);
    }
  };

  const sendLeaderCareReminders = async (options?: {
    taskId?: string;
    leaderName?: string;
  }): Promise<{ sentCount: number; message?: string }> => {
    setIsSendingLeaderReminders(true);
    try {
      const res = await fetch('/api/pastoral-care/send-leader-reminders', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          ...(options?.taskId ? { taskId: options.taskId } : {}),
          ...(options?.leaderName ? { leaderName: options.leaderName } : {}),
        }),
      });
      if (handleUnauthorizedSession(res.status)) return { sentCount: 0 };
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        const msg = data?.message || 'Could not dispatch leader pastoral reminders.';
        showToast(msg);
        return { sentCount: 0, message: msg };
      }
      if (Array.isArray(data.allTasks)) {
        setFollowupTasks(data.allTasks);
      }
      await Promise.all([
        fetchPastoralMonitor().catch(() => {}),
        refreshAuditLogs().catch(() => {}),
      ]);
      const count = Number(data.sentCount || 0);
      showToast(
        count > 0
          ? `Sent pastoral care reminder${count === 1 ? '' : 's'} to ${count} leader${count === 1 ? '' : 's'} in charge.`
          : 'No open or contacted tasks matched for reminder dispatch.'
      );
      return { sentCount: count };
    } catch {
      showToast('Network error sending leader pastoral care reminders.');
      return { sentCount: 0 };
    } finally {
      setIsSendingLeaderReminders(false);
    }
  };

  const acknowledgeLeaderReminder = async (taskId: string): Promise<FollowupTask | null> => {
    try {
      const res = await fetch(`/api/followup-tasks/${encodeURIComponent(taskId)}/acknowledge`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      if (handleUnauthorizedSession(res.status)) return null;
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.task) {
        showToast(data?.message || 'Could not acknowledge pastoral care reminder.');
        return null;
      }
      setFollowupTasks((prev) => prev.map((t) => (t.id === taskId ? data.task : t)));
      setMyLeaderReminders((prev) => ({
        ...prev,
        tasks: prev.tasks.map((t) => (t.id === taskId ? data.task : t)),
      }));
      showToast(`Acknowledged pastoral care reminder for ${data.task.personName}.`);
      return data.task as FollowupTask;
    } catch {
      showToast('Network error acknowledging pastoral reminder.');
      return null;
    }
  };

  // Automatically trigger idempotent absentee->officer/leader assignment once per session/org when threshold absentees exist
  useEffect(() => {
    if (!isSessionVerified || !currentUser?.token) return;
    if (
      !canMonitorPastoralCare(currentUser) &&
      !['admin', 'pastor', 'group_leader', 'super_admin', 'creator'].includes(currentUser.role)
    ) {
      return;
    }
    if (members.length === 0) return;
    const threshold = Math.max(1, Number(systemSettings.absenteeThresholdServices) || 2);
    const activeOpenIds = new Set(
      followupTasks
        .filter((t) => t.status === 'open' || t.status === 'contacted')
        .map((t) => String(t.personId))
    );
    const pendingAbsenteeIds = members
      .filter(
        (m) =>
          m.status !== 'inactive' &&
          m.status !== 'transferred' &&
          m.status !== 'deceased' &&
          (m.consecutiveAbsences || 0) >= threshold &&
          !activeOpenIds.has(String(m.id))
      )
      .map((m) => m.id)
      .sort();

    if (pendingAbsenteeIds.length === 0) return;
    const signature = `${currentUser.organization_id || 'org'}:${threshold}:${pendingAbsenteeIds.join(',')}`;
    if (autoAssignSyncedRef.current === signature) return;
    autoAssignSyncedRef.current = signature;

    autoAssignAbsentees({ silent: true }).catch(() => {});
  }, [
    isSessionVerified,
    currentUser?.token,
    currentUser?.role,
    currentUser?.designation,
    currentUser?.organization_id,
    members,
    followupTasks,
    systemSettings.absenteeThresholdServices,
  ]);

  // Proximity simulator engine
  const advanceProximityStage = () => {
    if (proximityStage === 0) {
      setProximityStage(1);
      showToast(`Woke app on outer geofence (${systemSettings.outerGeofenceMeters}m). Approach signal sent.`);
    } else if (proximityStage === 1) {
      setProximityStage(2);
      setDwellTimerSeconds(systemSettings.dwellTimeMinutes * 60);
      showToast(`Entered inner ring (${systemSettings.innerGeofenceMeters}m). Dwell timer started.`);
    } else if (proximityStage === 2) {
      triggerDwellComplete();
    }
  };

  const triggerBeaconScan = () => {
    const targetId = currentUser?.memberId || currentUser?.id || 'live-device';
    const ok = checkInPerson(targetId, 'beacon', 95, 'BLE Entrance Beacon sighted inside service window');
    if (!ok) return;
    setIsBeaconDetected(true);
    setProximityStage(3);
    showToast('Entrance BLE beacon detected! Immediate check-in confirmed.');
  };

  const triggerDwellComplete = () => {
    const targetId = currentUser?.memberId || currentUser?.id || 'live-device';
    const ok = checkInPerson(
      targetId,
      'geofence',
      85,
      `${systemSettings.dwellTimeMinutes}-minute dwell verified at ${systemSettings.campusName}`
    );
    if (!ok) return;
    setProximityStage(3);
    setDwellTimerSeconds(0);
    showToast(`Dwell verified (${systemSettings.dwellTimeMinutes} mins). Auto check-in completed.`);
  };

  const resetProximity = () => {
    const targetId = currentUser?.memberId || currentUser?.id || 'live-device';
    setProximityStage(0);
    setDwellTimerSeconds(systemSettings.dwellTimeMinutes * 60);
    setIsBeaconDetected(false);
    removeCheckIn(targetId);
    showToast(`Proximity reset. Person is outside ${systemSettings.campusName} (>${systemSettings.outerGeofenceMeters}m).`);
  };

  const contextValue = React.useMemo<EkklesphereContextType>(
    () => ({
      currentUser,
      isSessionVerified,
      isVerifyingSession,
      handleUnauthorizedSession,
      setCurrentUser,
      login,
      loginWithCredentials,
      signInWithGoogle,
      isGoogleAuthLoading,
      googleAuthError,
      clearGoogleAuthError,
      registerMember,
      registerOrganisation,
      logout,
      sessionTimeoutMinutes: effectiveSessionTimeoutMinutes,
      sessionWarningSecondsLeft,
      sessionExpiredNotice,
      clearSessionExpiredNotice,
      extendUserSession,
      changePassword,
      switchUserRole,
      pushPermissionStatus,
      isPushSubscribed,
      pushSubscribersCount,
      requestPushPermission,
      sendTestPushNotification,
      activePortal,
      setActivePortal,
      isSidebarCollapsed,
      setIsSidebarCollapsed,
      toggleSidebar,
      isMobileNavOpen,
      setIsMobileNavOpen,
      adminSubTab,
      setAdminSubTab,
      requestedSettingsTab,
      requestOpenSettings,
      requestedUserTarget,
      requestOpenUserManagement,
      requestedAnalyticsTarget,
      requestOpenAnalytics,
      searchQuery,
      setSearchQuery,
      isAddServiceOpen,
      setIsAddServiceOpen,
      isFollowupModalOpen,
      setIsFollowupModalOpen,
      isHelpModalOpen,
      setIsHelpModalOpen,
      isSettingsModalOpen,
      setIsSettingsModalOpen,
      isChangePasswordModalOpen,
      setIsChangePasswordModalOpen,
      theme,
      setTheme,
      toggleTheme,
      activeServiceId,
      setActiveServiceId,
      services,
      currentService,
      hasScheduledService,
      checkInEligibility,
      refreshServices,
      addService,
      updateService,
      deleteService,
      members,
      visitorsCount,
      serviceVisitorsCount,
      refreshMembers,
      addVisitor,
      addMember,
      validateMemberImportRemote,
      batchImportMembers,
      updateMember,
      updateOwnProfile,
      deleteMember,
      updateMemberConsent,
      systemSettings,
      systemSettingsStorageBackend,
      isSyncingSystemSettings,
      refreshSystemSettings,
      updateSystemSettings,
      resetSystemSettings,
      communicationStatus,
      refreshCommunicationStatus,
      saveTenantGatewayKeys,
      testPaystackGateway,
      sendTestSmsGateway,
      sendTestEmailGateway,
      sendCommunicationBroadcast,
      setChurchPremiseLocation,
      clearChurchPremiseLocation,
      refreshLivePremise,
      churchGroups,
      leadershipHistory,
      isLoadingLeadershipHistory,
      refreshChurchGroups,
      refreshLeadershipHistory,
      addChurchGroup,
      updateChurchGroup,
      deleteChurchGroup,
      toggleChurchGroupStatus,
      getGroupMembers,
      attendanceRecords,
      totalCheckedInCount,
      expectedAttendance,
      attendancePercentage,
      autoCheckinOptedInCount,
      totalMembersCount,
      optInPercentage,
      telemetrySummary,
      checkInPerson,
      checkInPersonAsync,
      checkInWithServiceQr,
      removeCheckIn,
      isUsherOnline,
      setIsUsherOnline,
      pendingSyncCount,
      syncUsherCheckins,
      proximityStage,
      dwellTimerSeconds,
      isBeaconDetected,
      setIsBeaconDetected,
      advanceProximityStage,
      resetProximity,
      triggerBeaconScan,
      triggerDwellComplete,
      followupTasks,
      isAutoAssigningAbsentees,
      pastoralMonitor,
      isLoadingPastoralMonitor,
      isRunningAbsenceSweep,
      isSendingLeaderReminders,
      myLeaderReminders,
      fetchPastoralMonitor,
      fetchMyLeaderReminders,
      runAbsenceSweep,
      sendLeaderCareReminders,
      acknowledgeLeaderReminder,
      resolveFollowupTask,
      updateFollowupTask,
      deleteFollowupTask,
      addFollowupTask,
      autoAssignAbsentees,
      memberConsents,
      memberRsvps,
      toggleRsvp,
      donations,
      submitDonation,
      initializePaystackGiving,
      verifyPaystackGiving,
      churchWallPosts,
      refreshChurchWallPosts,
      addChurchWallPost,
      toggleChurchWallAmen,
      auditLogs,
      refreshAuditLogs,
      toastMessage,
      showToast,
      viewMode,
      setViewMode,
      tenants,
      addTenant,
      updateTenant,
      toggleTenantStatus,
      deleteTenant,
      impersonateTenant,
      licenses,
      renewLicense,
      updateLicense,
      issueLicense,
      landingConfig,
      updateLandingConfig,
      resetLandingConfig,
    }),
    // Recompute value object only when data/UI state slices actually change
    [
      currentUser,
      isSessionVerified,
      isVerifyingSession,
      effectiveSessionTimeoutMinutes,
      sessionWarningSecondsLeft,
      sessionExpiredNotice,
      isGoogleAuthLoading,
      googleAuthError,
      pushPermissionStatus,
      isPushSubscribed,
      pushSubscribersCount,
      activePortal,
      isSidebarCollapsed,
      isMobileNavOpen,
      adminSubTab,
      requestedSettingsTab,
      requestedUserTarget,
      requestedAnalyticsTarget,
      searchQuery,
      isAddServiceOpen,
      isFollowupModalOpen,
      isHelpModalOpen,
      isSettingsModalOpen,
      isChangePasswordModalOpen,
      theme,
      activeServiceId,
      services,
      currentService,
      hasScheduledService,
      checkInEligibility,
      members,
      visitorsCount,
      serviceVisitorsCount,
      systemSettings,
      systemSettingsStorageBackend,
      isSyncingSystemSettings,
      communicationStatus,
      churchGroups,
      attendanceRecords,
      totalCheckedInCount,
      expectedAttendance,
      attendancePercentage,
      autoCheckinOptedInCount,
      totalMembersCount,
      optInPercentage,
      telemetrySummary,
      isUsherOnline,
      pendingSyncCount,
      proximityStage,
      dwellTimerSeconds,
      isBeaconDetected,
      followupTasks,
      isAutoAssigningAbsentees,
      pastoralMonitor,
      isLoadingPastoralMonitor,
      isRunningAbsenceSweep,
      isSendingLeaderReminders,
      myLeaderReminders,
      memberConsents,
      memberRsvps,
      donations,
      churchWallPosts,
      auditLogs,
      toastMessage,
      viewMode,
      tenants,
      licenses,
      landingConfig,
    ]
  );

  return (
    <EkklesphereContext.Provider value={contextValue}>
      {children}
    </EkklesphereContext.Provider>
  );
};

export const useEkklesphere = () => {
  const context = useContext(EkklesphereContext);
  if (!context) {
    throw new Error('useEkklesphere must be used within an EkklesphereProvider');
  }
  return context;
};
