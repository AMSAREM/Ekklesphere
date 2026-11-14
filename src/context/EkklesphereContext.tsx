import React, { createContext, useContext, useState, useEffect } from 'react';
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
} from '../types/ekklesphere';
import { pushNotificationService } from '../services/pushNotificationService';
import {
  validateMemberImportBatch,
  type ImportDuplicateMode,
  type MemberImportValidationSummary,
  type ValidatedImportRow,
} from '../shared/memberImportValidation';


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
  requireExplicitConsent: true,
  auditLogRetentionDays: 90,
  smsGatewayProvider: 'Hubtel Ghana',
  smsSenderId: 'EKKLESPHERE',
  enablePushNotifications: true,
};

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
  const rawImg = raw.imageUrl ?? raw.image_url ?? raw.photo_url ?? raw.photoUrl ?? raw.avatar;
  const imageUrl = typeof rawImg === 'string' && rawImg.trim().length > 0 ? rawImg.trim() : undefined;

  return {
    ...(raw as Person),
    id: String(raw.id || `mem-${Date.now()}`),
    tenantId: String(raw.tenantId ?? raw.tenant_id ?? '00000000-0000-0000-0000-000000000001'),
    firstName,
    lastName,
    phoneE164,
    groupName,
    homeCellGroup: String(raw.homeCellGroup ?? raw.home_cell_group ?? groupName),
    avatarInitials,
    imageUrl,
    status: (raw.status as Person['status']) || 'member',
    consecutiveAbsences: typeof raw.consecutiveAbsences === 'number' ? raw.consecutiveAbsences : 0,
    autoCheckinOptedIn: Boolean(raw.autoCheckinOptedIn ?? raw.auto_checkin_opted_in ?? false),
    joinedOn: String(raw.joinedOn ?? raw.joined_on ?? new Date().toISOString().split('T')[0]),
  };
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
  logout: () => void;
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
  adminSubTab: 'dashboard' | 'insights' | 'workflows' | 'integrations' | 'proximity' | 'settings';
  setAdminSubTab: (tab: 'dashboard' | 'insights' | 'workflows' | 'integrations' | 'proximity' | 'settings') => void;
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
  refreshServices: () => Promise<void>;
  addService: (params: {
    name: string;
    date?: string;
    startsAt: string;
    endsAt?: string;
    expectedAttendance?: number;
    dwellMinutes?: number;
  }) => Promise<void>;
  deleteService: (serviceId: string) => Promise<void>;

  // People & Members
  members: Person[];
  visitorsCount: number;
  refreshMembers: () => Promise<void>;
  addVisitor: (name: string, phone: string, howHeard: string) => Promise<void>;
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
  deleteMember: (memberId: string) => Promise<void>;
  updateMemberConsent: (autoCheckin: boolean, push: boolean, sms: boolean, email: boolean) => Promise<void>;

  // System Settings & Live Church Premise Location (Supabase Postgres RLS)
  systemSettings: SystemSettings;
  systemSettingsStorageBackend: 'supabase' | 'sandbox_ephemeral';
  isSyncingSystemSettings: boolean;
  refreshSystemSettings: () => Promise<void>;
  updateSystemSettings: (newSettings: Partial<SystemSettings>) => Promise<boolean>;
  resetSystemSettings: () => Promise<boolean>;
  sendTestSmsGateway: (provider: string, senderId: string) => Promise<{ success: boolean; message: string }>;
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
  refreshChurchGroups: () => Promise<void>;
  addChurchGroup: (group: Omit<ChurchGroup, 'id' | 'createdAt'>) => ChurchGroup;
  updateChurchGroup: (id: string, updates: Partial<ChurchGroup>) => void;
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
  checkInPerson: (personId: string, method: CheckinMethod, confidence?: number, note?: string) => boolean;
  removeCheckIn: (personId: string) => Promise<void>;

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
  resolveFollowupTask: (taskId: string, outcome: string) => Promise<void>;
  addFollowupTask: (personId: string, reason: 'absent_2' | 'absent_3' | 'first_timer' | 'manual', notes: string) => Promise<void>;

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

const LIVE_DEFAULT_SERVICE: ServiceInstance = {
  id: 'svc-live-main',
  serviceId: 'svc-live-main',
  campusId: '00000000-0000-0000-0000-000000000001',
  name: 'Main Worship Service',
  date: formatLocalDateIso(),
  startsAt: '08:00',
  endsAt: '10:30',
  status: 'open',
  expectedAttendance: 0,
};

const DEMO_USER_IDS = new Set(['u-admin-1', 'u-usher-1', 'u-member-1']);
const DEMO_USER_EMAILS = new Set([
  'pastor.david@ekklesphere.org',
  'samuel.usher@ekklesphere.org',
  'ama.mensah@gmail.com',
]);

const EkklesphereContext = createContext<EkklesphereContextType | undefined>(undefined);

export const EkklesphereProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => {
    try {
      const saved = localStorage.getItem('ekklesphere_user');
      if (saved) {
        const parsed: AuthUser = JSON.parse(saved);
        if (
          parsed &&
          !DEMO_USER_IDS.has(parsed.id) &&
          !DEMO_USER_EMAILS.has((parsed.email || '').toLowerCase())
        ) {
          return parsed;
        }
        localStorage.removeItem('ekklesphere_user');
      }
    } catch {
      // ignore invalid storage
    }
    return null;
  });

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
  const [adminSubTab, setAdminSubTab] = useState<'dashboard' | 'insights' | 'workflows' | 'integrations' | 'proximity' | 'settings'>('dashboard');
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
    if (path === '/app' || path === '/login' || path === '/portal' || viewParam === 'app') {
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
      organizationId?: string;
      organization_id?: string;
      tenant_id?: string;
      isCreator?: boolean;
      is_creator?: boolean;
      username?: string;
      avatar?: string;
      mustChangePassword?: boolean;
    },
    token: string,
    campusNameOverride?: string
  ): AuthUser => {
    const role = payload.role;
    const isCreator = Boolean(
      payload.isCreator || payload.is_creator || role === 'creator' || role === 'super_admin'
    );
    const orgId = (payload.organizationId || payload.organization_id || payload.tenant_id || '').toLowerCase() || undefined;
    const matchedMember = members.find(
      (m) => m.id === payload.id || (payload.email && (m.email || '').toLowerCase() === payload.email.toLowerCase())
    );
    const displayName = (payload.name || payload.email?.split('@')[0] || 'Ekklesphere User').trim();
    const initials =
      displayName
        .split(' ')
        .filter(Boolean)
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase() || 'EU';

    return {
      id: payload.id,
      name: displayName,
      email: payload.email || '',
      role,
      verifiedRole: role,
      is_creator: isCreator,
      mustChangePassword: Boolean(payload.mustChangePassword),
      token,
      username: payload.username,
      avatar: payload.avatar || matchedMember?.imageUrl,
      initials,
      memberId: matchedMember?.id || payload.id,
      organization_id: orgId,
      tenant_id: orgId,
      campusName: campusNameOverride || systemSettings.campusName || 'Main Campus',
      title:
        role === 'creator' || role === 'super_admin'
          ? 'Platform Creator & Owner'
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
    setCurrentUser(verifiedUser);
    if (verifiedUser.role === 'creator' || verifiedUser.role === 'super_admin' || verifiedUser.is_creator) {
      setViewMode('creator', verifiedUser);
    } else {
      setViewMode('app', verifiedUser);
    }
    try {
      localStorage.setItem('ekklesphere_user', JSON.stringify(verifiedUser));
      if (verifiedUser.token) {
        localStorage.setItem('ekklesphere_token', verifiedUser.token);
      }
    } catch {
      // ignore
    }

    if (
      verifiedUser.role === 'admin' ||
      verifiedUser.role === 'pastor' ||
      verifiedUser.role === 'creator' ||
      verifiedUser.role === 'super_admin'
    ) {
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

    const authUser = buildAuthUserFromServer(data.user, data.token);
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

  const logout = () => {
    const existingToken =
      currentUser?.token ||
      (typeof window !== 'undefined' ? localStorage.getItem('ekklesphere_token') : null);
    if (existingToken) {
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${existingToken}` },
      }).catch(() => {});
    }
    setCurrentUser(null);
    setGoogleAuthError(null);
    setIsChangePasswordModalOpen(false);
    setSystemSettings(DEFAULT_SYSTEM_SETTINGS);
    setChurchGroups([]);
    setMembers([]);
    setServices([]);
    setAttendanceRecords([]);
    setAuditLogs([]);
    setDonations([]);
    setFollowupTasks([]);
    setMemberConsents({ autoCheckin: true, push: true, sms: false, email: true });
    setMemberRsvps({});
    setPushSubscribersCount(0);
    try {
      signOutSupabaseBrowser().catch(() => {});
      localStorage.removeItem('ekklesphere_user');
      localStorage.removeItem('ekklesphere_token');
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
    setViewModeState('app');
    showToast('Signed out of Ekklesphere');
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

      const authUser = buildAuthUserFromServer(
        {
          ...data.user,
          mustChangePassword: Boolean(data.mustChangePassword ?? data.user.mustChangePassword),
        },
        data.token,
        data.organization?.name
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

      const authUser = buildAuthUserFromServer(
        data.user,
        data.token,
        data.organization?.name
      );
      login(authUser);
      showToast(`Welcome to ${data.organization?.name || systemSettings.churchName || 'Ekklesphere'}, ${params.firstName.trim()}!`);
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
      if (saved) return saved;
    } catch {}
    return LIVE_DEFAULT_SERVICE.id;
  });
  const [services, setServices] = useState<ServiceInstance[]>(() => {
    try {
      const saved = localStorage.getItem('ekklesphere_services');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed;
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
    const storedToken =
      typeof window !== 'undefined' ? localStorage.getItem('ekklesphere_token') : null;
    if (storedToken) {
      fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${storedToken}` },
      })
        .then(async (res) => {
          if (!active) return;
          if (!res.ok) {
            localStorage.removeItem('ekklesphere_token');
            localStorage.removeItem('ekklesphere_user');
            setCurrentUser(null);
            return;
          }
          const data = await res.json();
          if (data?.user && active) {
            const hydrated = buildAuthUserFromServer(
              {
                id: data.user.id,
                email: data.user.email,
                name: data.user.name,
                role: data.user.role,
                organizationId: data.organizationId || data.user.organization_id,
                isCreator: data.isCreator,
                avatar: data.user.avatar || data.memberProfile?.imageUrl,
                mustChangePassword: Boolean(data.mustChangePassword ?? data.user.mustChangePassword),
              },
              storedToken
            );
            setCurrentUser(hydrated);
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
        .catch(() => {});
    } else {
      // Zero-trust rule: never retain cached user/organisation state without a verifiable Bearer token
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
      setServices([]);
      setChurchGroups([]);
      setAttendanceRecords([]);
      setDonations([]);
      setFollowupTasks([]);
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
  const [visitorsCount, setVisitorsCount] = useState<number>(0);
  const [followupTasks, setFollowupTasks] = useState<FollowupTask[]>([]);
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
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && typeof data.subscribersCount === 'number') {
          setPushSubscribersCount(data.subscribersCount);
        }
      })
      .catch(() => {});
  }, [currentUser?.id, currentUser?.organization_id, currentUser?.role, currentUser?.token]);

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

  const currentService = services.find((s) => s.id === activeServiceId) || services[0] || LIVE_DEFAULT_SERVICE;

  // Real-time attendance metrics scoped to the active service (zero synthetic baseline)
  const activeServiceAttendanceRecords = attendanceRecords.filter(
    (r) =>
      r.serviceInstanceId === currentService.id ||
      (!r.serviceInstanceId && services.length <= 1)
  );
  const totalCheckedInCount = activeServiceAttendanceRecords.length;
  const expectedAttendance =
    currentService.expectedAttendance > 0 ? currentService.expectedAttendance : members.length;
  const attendancePercentage =
    expectedAttendance > 0
      ? Math.min(100, Math.round((totalCheckedInCount / expectedAttendance) * 100))
      : 0;

  const totalMembersCount = members.length;
  const autoCheckinOptedInCount = members.filter((m) => m.autoCheckinOptedIn).length;
  const optInPercentage =
    totalMembersCount > 0 ? Math.round((autoCheckinOptedInCount / totalMembersCount) * 100) : 0;

  // Check-in action (handles offline queue vs instant online server sync)
  const checkInPerson = (
    personId: string,
    method: CheckinMethod,
    confidence: number = 90,
    note?: string
  ): boolean => {
    const existing = attendanceRecords.find(
      (r) => r.personId === personId && r.serviceInstanceId === activeServiceId
    );
    if (existing) {
      return false; // Already checked in for this service
    }

    const person = members.find((m) => m.id === personId);
    const personFullName = person ? `${person.firstName} ${person.lastName}`.trim() : currentUser?.name || 'Member';
    const now = new Date();
    let isLate = false;
    if (!currentService.date || currentService.date === formatLocalDateIso(now)) {
      const [sh, sm] = (currentService.startsAt || '').split(':').map(Number);
      if (Number.isFinite(sh) && Number.isFinite(sm)) {
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const graceDeadlineMinutes = sh * 60 + sm + 15;
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
      serviceInstanceId: activeServiceId,
      campusId: '00000000-0000-0000-0000-000000000001',
      method,
      confidence,
      checkedInAt: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      checkedInIso: now.toISOString(),
      late: isLate,
      note,
      waitingToSync: !isUsherOnline,
    };

    setAttendanceRecords((prev) => [newRecord, ...prev]);

    if (!isUsherOnline) {
      setPendingSyncCount((c) => c + 1);
      showToast(`${person?.firstName || 'Member'} saved locally. Will sync when online.`);
    } else {
      fetch('/api/live-checkins', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          ...newRecord,
          personName: personFullName,
          recordedBy: currentUser?.name,
        }),
      }).catch((err) => console.warn('Could not sync check-in to server:', err));
      showToast(`${person?.firstName || personFullName} checked in (${method})`);

      // Trigger automatic Arrival Web Push Notification (Brief Section 3.3 & 6.2)
      if (systemSettings.enablePushNotifications && memberConsents.push) {
        pushNotificationService
          .notifyArrivalCheckin(personFullName, currentService.name, method)
          .catch((err) => console.warn('[Push] Arrival push notification skipped:', err));
      }
    }

    setAuditLogs((prev) => [
      {
        id: `log-${Date.now()}`,
        actor: method === 'usher' ? 'Usher Desk' : `${person?.firstName || personFullName} Device`,
        action: 'Attendance Recorded',
        entityType: 'AttendanceRecord',
        timestamp: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        details: note || `Method: ${method}, Confidence: ${confidence}%`,
      },
      ...prev,
    ]);

    return true;
  };

  const removeCheckIn = async (personId: string): Promise<void> => {
    const person = members.find((m) => m.id === personId);
    try {
      const res = await fetch(
        `/api/live-checkins/${encodeURIComponent(personId)}?serviceId=${encodeURIComponent(activeServiceId)}`,
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
          (r) => !(r.personId === personId && (!r.serviceInstanceId || r.serviceInstanceId === activeServiceId))
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

  const addVisitor = async (name: string, phone: string, howHeard: string): Promise<void> => {
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
          homeCellGroup: 'First-time Visitor',
          groupName: 'First-time Visitor',
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
        homeCellGroup: 'First-time Visitor',
        groupName: 'First-time Visitor',
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

    setVisitorsCount((c) => c + 1);
    setMembers((prev) => {
      const updated = [savedPerson!, ...prev.filter((m) => m.id !== savedPerson!.id)];
      try {
        localStorage.setItem('ekklesphere_members', JSON.stringify(updated));
      } catch {}
      return updated;
    });

    // Check them in immediately
    checkInPerson(savedPerson.id, 'usher', 95, `Visitor registration. Heard via ${howHeard}`);

    // Create visitor follow-up task in Supabase
    try {
      const taskRes = await fetch('/api/followup-tasks', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          personId: savedPerson!.id,
          personName: name,
          groupName: 'Visitors Welcome Team',
          reason: 'first_timer',
          assignedToName: systemSettings.seniorPastor || 'Welcome & Pastoral Care Team',
          dueOn: 'Tomorrow 10:00 AM',
          notes: `First-time visitor check-in (${howHeard})`,
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

    showToast(`${name} saved to directory! Welcome follow-up task created.`);
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

  const updateMember = async (memberId: string, updates: Partial<Person>): Promise<Person> => {
    const existing = members.find((m) => m.id === memberId);
    const mergedPayload = existing ? { ...existing, ...updates } : updates;

    let updatedPerson: Person | null = null;
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
        }
      }

      if (!updatedPerson) {
        const selfRes = await fetch('/api/members/me/profile', {
          method: 'PATCH',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            imageUrl: updates.imageUrl,
            dateOfBirth: updates.dateOfBirth,
            preferredName: updates.preferredName,
          }),
        });
        if (selfRes.ok) {
          const rawSelfUpdated = await selfRes.json().catch(() => null);
          if (rawSelfUpdated) updatedPerson = normalizePersonRecord(rawSelfUpdated);
        }
      }
    } catch {
      // fallback
    }

    if (!updatedPerson) {
      updatedPerson = normalizePersonRecord(mergedPayload as Person);
    }

    // Direct write to Firestore as cloud backup
    try {
      setDoc(doc(db, 'members', memberId), updatedPerson, { merge: true }).catch(() => {});
    } catch {}

    setMembers((prev) => {
      const updated = prev.map((m) => (m.id === memberId ? updatedPerson! : m));
      try {
        localStorage.setItem('ekklesphere_members', JSON.stringify(updated));
      } catch {}
      return updated;
    });

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

  let serverPremiseUnavailableErrors = 0;
  let premisePollTicks = 0;

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
      if (!res.ok) return;
      const data = await res.json();
      if (data?.storageBackend) {
        setSystemSettingsStorageBackend(data.storageBackend);
      }
      if (data?.settings) {
        const merged: SystemSettings = {
          ...DEFAULT_SYSTEM_SETTINGS,
          ...data.settings,
        };
        setSystemSettings(merged);
        try {
          localStorage.setItem('ekklesphere_system_settings', JSON.stringify(merged));
        } catch {}
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

    premisePollTicks++;
    if (serverPremiseUnavailableErrors >= 2 && premisePollTicks % 8 !== 0) {
      return;
    }

    try {
      let serverData: any = null;
      try {
        const res = await fetch('/api/campus-premise', {
          headers: getAuthHeaders(),
        });
        if (res.ok) {
          serverData = await res.json();
          serverPremiseUnavailableErrors = 0;
        } else {
          serverPremiseUnavailableErrors++;
        }
      } catch {
        serverPremiseUnavailableErrors++;
      }

      if (serverData?.premiseSettings) {
        const ps = serverData.premiseSettings;
        setSystemSettings((prev) => {
          const next: SystemSettings = {
            ...prev,
            churchName: ps.churchName || prev.churchName,
            campusName: ps.campusName || prev.campusName,
            campusAddress: ps.campusAddress ?? prev.campusAddress,
            campusLatitude: typeof ps.lat === 'number' ? ps.lat : null,
            campusLongitude: typeof ps.lng === 'number' ? ps.lng : null,
            campusLocationAccuracyM: typeof ps.accuracyM === 'number' ? ps.accuracyM : null,
            campusLocationUpdatedAt: ps.updatedAt || null,
            innerGeofenceMeters: ps.innerGeofenceMeters ?? prev.innerGeofenceMeters,
            outerGeofenceMeters: ps.outerGeofenceMeters ?? prev.outerGeofenceMeters,
            dwellTimeMinutes: ps.dwellTimeMinutes ?? prev.dwellTimeMinutes,
          };
          try {
            localStorage.setItem('ekklesphere_system_settings', JSON.stringify(next));
          } catch {}
          return next;
        });
      } else if (serverData?.configured === false) {
        setSystemSettings((prev) => {
          if (prev.campusLatitude === null && prev.campusLongitude === null) return prev;
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
          return [...remainingOffline, ...serverData.liveCheckins];
        });
      }

      if (serverData?.telemetrySummary) {
        setTelemetrySummary(serverData.telemetrySummary);
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

    const mappedStatus: ServiceInstance['status'] =
      ev.status === 'closed' || ev.status === 'completed'
        ? 'closed'
        : ev.status === 'cancelled'
        ? 'cancelled'
        : ev.status === 'scheduled' || ev.status === 'draft'
        ? 'scheduled'
        : 'open';

    return {
      id: ev.id,
      serviceId: ev.id,
      campusId: ev.site_id || ev.campus_id || '00000000-0000-0000-0000-000000000001',
      name: ev.name || 'Worship Service',
      date: dateStr,
      startsAt: startStr,
      endsAt: endStr,
      status: mappedStatus,
      expectedAttendance: expectedCount,
    };
  };

  const refreshServices = async (): Promise<void> => {
    const token =
      currentUser?.token ||
      (typeof window !== 'undefined' ? localStorage.getItem('ekklesphere_token') : null);
    if (!token) return;

    try {
      const res = await fetch('/api/events', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          const mapped = data.map(mapDbEventToService);
          setServices(mapped);
          try {
            localStorage.setItem('ekklesphere_services', JSON.stringify(mapped));
          } catch {}
          setActiveServiceId((prev) =>
            mapped.length === 0
              ? LIVE_DEFAULT_SERVICE.id
              : mapped.some((s) => s.id === prev)
              ? prev
              : mapped[0].id
          );
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
          setServices(parsed);
          if (parsed.length > 0) {
            setActiveServiceId((prev) =>
              parsed.some((s: ServiceInstance) => s.id === prev) ? prev : parsed[0].id
            );
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
  }): Promise<void> => {
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
        status: serviceDate > formatLocalDateIso() ? 'scheduled' : 'open',
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
        status: created.status,
        expectedAttendance: created.expectedAttendance,
        dwellMinutes: params.dwellMinutes ?? 5,
        createdAt: new Date().toISOString(),
      }, { merge: true }).catch(() => {});
    } catch {}

    setServices((prev) => {
      const withoutPlaceholder = prev.filter((s) => s.id !== LIVE_DEFAULT_SERVICE.id);
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
  };

  const deleteService = async (serviceId: string): Promise<void> => {
    const svcToDelete = services.find((s) => s.id === serviceId);
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

    try {
      deleteDoc(doc(db, 'events', serviceId)).catch(() => {});
    } catch {}

    setServices((prev) => {
      const updated = prev.filter((s) => s.id !== serviceId);
      try {
        localStorage.setItem('ekklesphere_services', JSON.stringify(updated));
      } catch {}
      setActiveServiceId((curr) =>
        curr === serviceId ? updated[0]?.id || LIVE_DEFAULT_SERVICE.id : curr
      );
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
      role === 'admin' ||
      role === 'pastor' ||
      role === 'usher' ||
      role === 'group_leader' ||
      role === 'super_admin' ||
      role === 'creator';
    if (!token || !isStaff) return;
    try {
      const res = await fetch('/api/followup-tasks', { headers: getAuthHeaders() });
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
    refreshSystemSettings();
    refreshChurchGroups();
    refreshAuditLogs();
    refreshLivePremise();
    refreshMembers();
    refreshServices();
    refreshDonations();
    refreshFollowupTasks();
    refreshMemberConsentsAndRsvps();
    const interval = setInterval(refreshLivePremise, 4000);
    return () => clearInterval(interval);
  }, [currentUser?.id, currentUser?.organization_id, currentUser?.token]);

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
      serverPremiseUnavailableErrors = 0;
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
    const optimisticNext: SystemSettings = {
      ...systemSettings,
      ...newSettings,
    };
    setSystemSettings(optimisticNext);
    try {
      localStorage.setItem('ekklesphere_system_settings', JSON.stringify(optimisticNext));
    } catch {}

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
        setSystemSettings(synced);
        try {
          localStorage.setItem('ekklesphere_system_settings', JSON.stringify(synced));
        } catch {}
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

  const sendTestSmsGateway = async (
    provider: string,
    senderId: string
  ): Promise<{ success: boolean; message: string }> => {
    try {
      const res = await fetch('/api/system-settings/test-sms', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ provider, senderId }),
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

  const addChurchGroup = (groupData: Omit<ChurchGroup, 'id' | 'createdAt'>): ChurchGroup => {
    const tempId = `temp-grp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const optimisticGroup: ChurchGroup = {
      ...groupData,
      id: tempId,
      createdAt: new Date().toISOString().split('T')[0],
    };

    setChurchGroups((prev) => {
      const updated = [optimisticGroup, ...prev];
      try {
        localStorage.setItem('ekklesphere_church_groups', JSON.stringify(updated));
      } catch {}
      return updated;
    });

    fetch('/api/church-groups', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(groupData),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.group) {
          showToast(data?.message || 'Could not save church group to database.');
          refreshChurchGroups().catch(() => {});
          return;
        }
        setChurchGroups((prev) => {
          const replaced = prev.map((g) => (g.id === tempId ? data.group : g));
          try {
            localStorage.setItem('ekklesphere_church_groups', JSON.stringify(replaced));
          } catch {}
          return replaced;
        });
        refreshAuditLogs().catch(() => {});
        showToast(`${data.group.name} saved to Supabase`);
      })
      .catch(() => {
        showToast('Network error saving church group.');
        refreshChurchGroups().catch(() => {});
      });

    return optimisticGroup;
  };

  const updateChurchGroup = (id: string, updates: Partial<ChurchGroup>) => {
    let groupName = '';
    setChurchGroups((prev) => {
      const updated = prev.map((g) => {
        if (g.id === id) {
          groupName = updates.name || g.name;
          return { ...g, ...updates, updatedAt: new Date().toISOString().split('T')[0] };
        }
        return g;
      });
      try {
        localStorage.setItem('ekklesphere_church_groups', JSON.stringify(updated));
      } catch {}
      return updated;
    });

    fetch(`/api/church-groups/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(updates),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.group) {
          showToast(data?.message || 'Could not update church group.');
          refreshChurchGroups().catch(() => {});
          return;
        }
        setChurchGroups((prev) => {
          const synced = prev.map((g) => (g.id === id ? data.group : g));
          try {
            localStorage.setItem('ekklesphere_church_groups', JSON.stringify(synced));
          } catch {}
          return synced;
        });
        refreshAuditLogs().catch(() => {});
        showToast(`${data.group.name || groupName || 'Group'} updated`);
      })
      .catch(() => {
        showToast('Network error updating church group.');
        refreshChurchGroups().catch(() => {});
      });
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
    if (!groupName) return [];
    const q = groupName.trim().toLowerCase();
    return members.filter((m) => {
      const mg = (m.groupName || '').trim().toLowerCase();
      return mg === q || mg.includes(q) || q.includes(mg);
    });
  };



  const syncUsherCheckins = (): number => {
    if (!isUsherOnline) {
      showToast('Cannot sync while offline. Reconnect first.');
      return 0;
    }
    const count = pendingSyncCount;
    const queued = attendanceRecords.filter((r) => r.waitingToSync);
    queued.forEach((rec) => {
      const person = members.find((m) => m.id === rec.personId);
      fetch('/api/live-checkins', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          ...rec,
          waitingToSync: false,
          personName: person ? `${person.firstName} ${person.lastName}`.trim() : 'Member',
          recordedBy: currentUser?.name,
        }),
      }).catch(() => {});
    });
    setAttendanceRecords((prev) => prev.map((r) => ({ ...r, waitingToSync: false })));
    setPendingSyncCount(0);
    showToast(`Synced ${count} check-in${count === 1 ? '' : 's'} to server.`);
    return count;
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
      showToast(`Thank you! GHS ${amountGhs} given to ${fund} via ${method}.`);
      return true;
    } catch {
      showToast('Network error submitting donation.');
      return false;
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
    if (currentUser?.token) {
      refreshChurchWallPosts();
    }
  }, [currentUser?.id, currentUser?.organization_id]);

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

  const resolveFollowupTask = async (taskId: string, outcome: string): Promise<void> => {
    try {
      const res = await fetch(`/api/followup-tasks/${encodeURIComponent(taskId)}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status: 'resolved', outcome }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.task) {
        showToast(data?.message || 'Could not resolve follow-up task in database.');
        return;
      }
      setFollowupTasks((prev) => prev.map((t) => (t.id === taskId ? data.task : t)));
      showToast(`Care task marked resolved: ${outcome}`);
    } catch {
      showToast('Network error resolving follow-up task.');
    }
  };

  const addFollowupTask = async (
    personId: string,
    reason: 'absent_2' | 'absent_3' | 'first_timer' | 'manual',
    notes: string
  ): Promise<void> => {
    const person = members.find((m) => m.id === personId);
    try {
      const res = await fetch('/api/followup-tasks', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          personId,
          personName: person ? `${person.firstName} ${person.lastName}`.trim() : 'Member',
          groupName: person?.groupName || 'General',
          reason,
          assignedToName: systemSettings.seniorPastor || currentUser?.name || 'Pastoral Care Team',
          dueOn: 'In 3 days',
          notes,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.task) {
        showToast(data?.message || 'Could not save follow-up task to database.');
        return;
      }
      setFollowupTasks((prev) => [data.task, ...prev.filter((t) => t.id !== data.task.id)]);
      showToast(`Follow-up assignment created for ${data.task.personName}`);
    } catch {
      showToast('Network error creating follow-up task.');
    }
  };

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
    setIsBeaconDetected(true);
    setProximityStage(3);
    checkInPerson(targetId, 'beacon', 95, 'BLE Entrance Beacon sighted inside service window');
    showToast('Entrance BLE beacon detected! Immediate check-in confirmed.');
  };

  const triggerDwellComplete = () => {
    const targetId = currentUser?.memberId || currentUser?.id || 'live-device';
    setProximityStage(3);
    setDwellTimerSeconds(0);
    checkInPerson(
      targetId,
      'geofence',
      85,
      `${systemSettings.dwellTimeMinutes}-minute dwell verified at ${systemSettings.campusName}`
    );
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

  return (
    <EkklesphereContext.Provider
      value={{
        currentUser,
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
        refreshServices,
        addService,
        deleteService,
        members,
        visitorsCount,
        refreshMembers,
        addVisitor,
        addMember,
        validateMemberImportRemote,
        batchImportMembers,
        updateMember,
        deleteMember,
        updateMemberConsent,
        systemSettings,
        systemSettingsStorageBackend,
        isSyncingSystemSettings,
        refreshSystemSettings,
        updateSystemSettings,
        resetSystemSettings,
        sendTestSmsGateway,
        setChurchPremiseLocation,
        clearChurchPremiseLocation,
        refreshLivePremise,
        churchGroups,
        refreshChurchGroups,
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
        resolveFollowupTask,
        addFollowupTask,
        memberConsents,
        memberRsvps,
        toggleRsvp,
        donations,
        submitDonation,
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
      }}
    >
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
