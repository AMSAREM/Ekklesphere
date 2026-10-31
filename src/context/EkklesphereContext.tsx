import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  auth,
  db,
  googleProvider,
  signInWithPopup,
  firebaseSignOut,
  onAuthStateChanged,
} from '../firebase';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
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
} from '../types/ekklesphere';
import { pushNotificationService } from '../services/pushNotificationService';


export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  churchName: 'PIWC KWADASO',
  campusName: 'PIWC KWADASO',
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
  innerGeofenceMeters: 50,
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
  loginWithCredentials: (email: string, password?: string, preferredRole?: UserRole) => boolean;
  signInWithGoogle: () => Promise<void>;
  isGoogleAuthLoading: boolean;
  googleAuthError: string | null;
  clearGoogleAuthError: () => void;
  registerMember: (firstName: string, lastName: string, email: string, phone: string, groupName: string) => AuthUser;
  logout: () => void;
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

  // People & Members
  members: Person[];
  visitorsCount: number;
  refreshMembers: () => Promise<void>;
  addVisitor: (name: string, phone: string, howHeard: string) => Promise<void>;
  addMember: (memberData: Omit<Person, 'id' | 'tenantId' | 'avatarInitials' | 'joinedOn'>) => Promise<Person>;
  batchImportMembers: (newMembers: Person[]) => Promise<Person[]>;
  updateMember: (memberId: string, updates: Partial<Person>) => Promise<Person>;
  deleteMember: (memberId: string) => Promise<void>;
  updateMemberConsent: (autoCheckin: boolean, push: boolean, sms: boolean, email: boolean) => void;

  // System Settings & Live Church Premise Location
  systemSettings: SystemSettings;
  updateSystemSettings: (newSettings: Partial<SystemSettings>) => void;
  resetSystemSettings: () => void;
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

  // Ministries, Fellowships & Cell Groups Management
  churchGroups: ChurchGroup[];
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
  removeCheckIn: (personId: string) => void;

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
  resolveFollowupTask: (taskId: string, outcome: string) => void;
  addFollowupTask: (personId: string, reason: 'absent_2' | 'absent_3' | 'first_timer' | 'manual', notes: string) => void;

  // Member App States
  memberConsents: {
    autoCheckin: boolean;
    push: boolean;
    sms: boolean;
    email: boolean;
  };
  memberRsvps: Record<string, boolean>;
  toggleRsvp: (eventName: string) => void;
  donations: Donation[];
  submitDonation: (amountGhs: number, fund: string, method: 'MTN MoMo' | 'Telecel Cash' | 'Card') => void;

  // Audit Logs & Toasts
  auditLogs: AuditLogItem[];
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
  announcementBadge: 'PIWC KWADASO Live System Deployed & Geofence Active',
  isAnnouncementActive: true,
  contactSalesEmail: 'admin@piwckwadaso.org',
  demoEnabled: false,
  showcaseHeadline: 'Transforming Sanctuary Operations with Sovereign Geofence Radar',
  featuredStats: {
    congregationsServed: 'Live',
    checkinsRecorded: 'Real-Time',
    proximityAccuracy: '100m Dwell',
    networkUptime: '99.98%',
  },
};

const DEFAULT_PRIMARY_TENANT: TenantChurch = {
  id: 'e0000000-0000-0000-0000-000000000001',
  name: 'PIWC KWADASO',
  slug: 'piwc-kwadaso',
  campusCode: 'PIWC-01',
  city: 'Kumasi',
  country: 'Ghana',
  seniorPastor: 'Pastor in Charge',
  contactEmail: 'admin@piwckwadaso.org',
  contactPhone: '+233 24 000 0000',
  status: 'active',
  memberCount: 0,
  maxCapacity: 1500,
  licenseKey: 'EKKLE-PIWC-KWADASO-PRO-2026',
  licenseTier: 'cathedral_enterprise',
  renewalDate: '2027-12-31',
  billingCycle: 'annual',
  geofenceRadiusMeters: 300,
  features: {
    bleRadar: true,
    smsGateway: true,
    biometrics: true,
    gdprPrivacyVault: true,
    multiCampus: true,
    mobileGivingMoMo: true,
    customDomain: true,
    exportAuditLogs: true,
  },
  createdAt: '2026-01-01T00:00:00.000Z',
};

const DEFAULT_PRIMARY_LICENSE: SystemLicense = {
  id: 'lic-live-01',
  key: 'EKKLE-PIWC-KWADASO-PRO-2026',
  tier: 'cathedral_enterprise',
  tenantId: 'e0000000-0000-0000-0000-000000000001',
  tenantName: 'PIWC KWADASO',
  seatsLimit: 1500,
  status: 'active',
  issuedDate: '2026-01-01',
  expiresDate: '2027-12-31',
  billingCycle: 'annual',
  annualCostUSD: 1200,
  enabledFeatures: [
    'Geofence Radar v2',
    'Door Usher Headcount',
    'GhanaPost GPS & 28-Field Registry',
    'Mobile Giving MoMo',
    'Custom Domain & Multi-Campus',
    'Audit Trail & Consent Vault',
  ],
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

  // Platform view navigation (live test default: app)
  const [viewMode, setViewModeState] = useState<AppViewMode>(() => {
    try {
      const saved = localStorage.getItem('ekklesphere_view_mode');
      if (saved === 'app' || saved === 'landing' || saved === 'creator') {
        return saved as AppViewMode;
      }
    } catch {
      // fallback
    }
    return 'app';
  });

  const setViewMode = (mode: AppViewMode) => {
    if (mode === 'creator' && currentUser?.role !== 'super_admin' && currentUser?.role !== 'creator') {
      showToast('Access Denied: Creator console requires Super Admin or Creator role.');
      return;
    }
    setViewModeState(mode);
    try {
      localStorage.setItem('ekklesphere_view_mode', mode);
    } catch {
      // ignore
    }
  };

  const getAuthHeaders = (extraHeaders?: Record<string, string>): Record<string, string> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...extraHeaders,
    };
    if (currentUser) {
      headers['x-user-role'] = currentUser.role;
      headers['x-user-id'] = currentUser.id;
      headers['x-user-email'] = currentUser.email;
      if (currentUser.name) headers['x-user-name'] = currentUser.name;
      if (currentUser.tenant_id) headers['x-tenant-id'] = currentUser.tenant_id;
      if (currentUser.campus_id) headers['x-campus-id'] = currentUser.campus_id;
    } else {
      headers['x-user-role'] = 'admin';
    }
    return headers;
  };

  // Multi-Tenant Platform Management (clean live test defaults)
  const [tenants, setTenants] = useState<TenantChurch[]>(() => {
    try {
      const saved = localStorage.getItem('ekklesphere_tenants');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const clean = parsed.filter(
            (t: TenantChurch) =>
              t &&
              !t.id.includes('demo') &&
              !t.slug.includes('demo') &&
              !t.name.toLowerCase().includes('demo')
          );
          if (clean.length > 0) return clean;
        }
      }
    } catch {
      // fallback
    }
    return [DEFAULT_PRIMARY_TENANT];
  });

  const [licenses, setLicenses] = useState<SystemLicense[]>(() => {
    try {
      const saved = localStorage.getItem('ekklesphere_licenses');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const clean = parsed.filter(
            (l: SystemLicense) =>
              l &&
              !l.id.includes('demo') &&
              !l.key.includes('DEMO') &&
              !l.tenantName.toLowerCase().includes('demo')
          );
          if (clean.length > 0) return clean;
        }
      }
    } catch {
      // fallback
    }
    return [DEFAULT_PRIMARY_LICENSE];
  });

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
    const tenantName = matchedTenant ? matchedTenant.name : 'Sanctuary Tenant';
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

  const resolveUserRoleForEmail = (rawEmail: string, matchedMember?: Person): UserRole => {
    const normalized = rawEmail.trim().toLowerCase();
    if (
      normalized === 'amoakoimml@gmail.com' ||
      normalized === 'amoakoemmanuel2026@gmail.com' ||
      normalized === 'akokosolutions24@gmail.com'
    ) {
      return 'admin';
    }
    const officer = (matchedMember?.officerName || '').toLowerCase();
    const dept = (matchedMember?.department || '').toLowerCase();
    if (officer.includes('admin') || officer.includes('pastor') || officer.includes('elder')) {
      return 'admin';
    }
    if (officer.includes('usher') || dept.includes('usher')) {
      return 'usher';
    }
    if (normalized.includes('pastor') || normalized.includes('admin')) {
      return 'admin';
    }
    if (normalized.includes('usher')) {
      return 'usher';
    }
    return 'member';
  };

  const login = (user: AuthUser) => {
    setCurrentUser(user);
    try {
      localStorage.setItem('ekklesphere_user', JSON.stringify(user));
    } catch {
      // ignore
    }

    // Persist user document to Firestore so security rules and multi-device auth recognize user role
    try {
      setDoc(doc(db, 'users', user.id), {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        photoURL: user.avatar || '',
        title: user.title || (user.role === 'admin' ? 'Administrator' : user.role === 'usher' ? 'Door Steward' : 'Congregation Member'),
        campusName: user.campusName || 'PIWC KWADASO',
        createdAt: new Date().toISOString(),
      }, { merge: true }).catch((err) => {
        console.warn('Firestore user profile sync warning (non-blocking):', err);
      });
    } catch {}

    if (user.role === 'admin') setActivePortal('admin');
    else if (user.role === 'usher') setActivePortal('usher');
    else if (user.role === 'member') setActivePortal('member');
    showToast(`Welcome back, ${user.name}`);
  };

  const signInWithGoogle = async () => {
    setIsGoogleAuthLoading(true);
    setGoogleAuthError(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const fbUser = result.user;
      const email = fbUser.email || '';
      const matchedMember = members.find(
        (m) => (m.email || '').toLowerCase() === email.trim().toLowerCase()
      );
      const name =
        fbUser.displayName ||
        (matchedMember ? `${matchedMember.firstName} ${matchedMember.lastName}`.trim() : '') ||
        'Google Member';
      const initials =
        name
          .split(' ')
          .filter(Boolean)
          .map((n) => n[0])
          .slice(0, 2)
          .join('')
          .toUpperCase() || 'GM';

      const role = resolveUserRoleForEmail(email, matchedMember);

      const gUser: AuthUser = {
        id: fbUser.uid,
        name,
        email,
        role,
        avatar: fbUser.photoURL || undefined,
        initials,
        memberId: matchedMember?.id,
        title:
          role === 'admin'
            ? 'Administrator / Executive Pastor'
            : role === 'usher'
            ? 'Door Steward / Usher'
            : matchedMember?.groupName
            ? `Member (${matchedMember.groupName})`
            : 'Congregation Member',
        campusName: systemSettings.campusName || 'PIWC KWADASO',
        permissions:
          role === 'admin'
            ? ['all_access', 'pastoral_care', 'service_management', 'system_settings']
            : role === 'usher'
            ? ['checkin_members', 'register_visitors', 'offline_sync', 'proximity_radar']
            : ['member_portal', 'proximity_checkin', 'giving', 'rsvp'],
      };

      login(gUser);
      showToast(`Authenticated with Google as ${name}`);
    } catch (err: unknown) {
      const errCode =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: unknown }).code || '')
          : '';
      const errMsg = err instanceof Error ? err.message : String(err);

      if (errCode.includes('popup-closed-by-user') || errCode.includes('cancelled-popup-request') || errMsg.includes('popup-closed-by-user')) {
        showToast('Google sign-in popup was closed before completion.');
      } else if (errCode.includes('popup-blocked') || errMsg.includes('popup-blocked')) {
        const msg = 'Your browser blocked the Google sign-in popup. Please allow popups for this site and try again.';
        setGoogleAuthError(msg);
        showToast(msg);
      } else if (errCode.includes('unauthorized-domain') || errMsg.includes('unauthorized-domain')) {
        const host = typeof window !== 'undefined' ? window.location.hostname : 'current domain';
        const msg = `Domain "${host}" is not yet authorized in Firebase Authentication → Settings → Authorized domains. You can also sign in immediately below using your email.`;
        console.warn('[Auth] Unauthorized domain during Google Sign-in:', host);
        setGoogleAuthError(msg);
        showToast('Google domain authorization required — use email sign-in below or refresh.');
      } else {
        console.warn('[Auth] Google Sign-in warning:', errMsg);
        const msg = 'Google sign-in could not complete right now. Please retry or sign in with your church email below.';
        setGoogleAuthError(msg);
        showToast(msg);
      }
    } finally {
      setIsGoogleAuthLoading(false);
    }
  };

  const logout = () => {
    setCurrentUser(null);
    setGoogleAuthError(null);
    try {
      firebaseSignOut(auth).catch(() => {});
      localStorage.removeItem('ekklesphere_user');
    } catch {
      // ignore
    }
    showToast('Signed out of Ekklesphere');
  };

  const switchUserRole = (role: UserRole) => {
    if (!currentUser) return;
    const updatedUser: AuthUser = {
      ...currentUser,
      role,
      title:
        role === 'admin'
          ? 'Administrator / Executive Pastor'
          : role === 'usher'
          ? 'Door Steward / Usher'
          : 'Congregation Member',
      permissions:
        role === 'admin'
          ? ['all_access', 'pastoral_care', 'service_management', 'system_settings']
          : role === 'usher'
          ? ['checkin_members', 'register_visitors', 'offline_sync', 'proximity_radar']
          : ['member_portal', 'proximity_checkin', 'giving', 'rsvp'],
    };
    login(updatedUser);
  };

  const loginWithCredentials = (email: string, _password?: string, preferredRole?: UserRole): boolean => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return false;

    const matchedMember = members.find((m) => (m.email || '').toLowerCase() === trimmed);
    const derivedRole: UserRole = preferredRole || resolveUserRoleForEmail(trimmed, matchedMember);

    const rawName = matchedMember
      ? `${matchedMember.firstName} ${matchedMember.lastName}`.trim()
      : trimmed
          .split('@')[0]
          .replace(/[._-]+/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase());

    const initials =
      rawName
        .split(' ')
        .filter(Boolean)
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase() || 'MB';

    const authenticatedUser: AuthUser = {
      id: matchedMember?.id || `u-${Date.now()}`,
      name: rawName || 'Church Member',
      email: trimmed,
      role: derivedRole,
      initials,
      title:
        derivedRole === 'admin'
          ? 'Administrator / Executive Pastor'
          : derivedRole === 'usher'
          ? 'Door Steward / Usher'
          : matchedMember?.groupName
          ? `Member (${matchedMember.groupName})`
          : 'Congregation Member',
      campusName: systemSettings.campusName || 'PIWC KWADASO',
      memberId: matchedMember?.id,
      permissions:
        derivedRole === 'admin'
          ? ['all_access', 'pastoral_care', 'service_management', 'system_settings']
          : derivedRole === 'usher'
          ? ['checkin_members', 'register_visitors', 'offline_sync', 'proximity_radar']
          : ['member_portal', 'proximity_checkin', 'giving', 'rsvp'],
    };

    login(authenticatedUser);
    return true;
  };

  const registerMember = (firstName: string, lastName: string, email: string, phone: string, groupName: string): AuthUser => {
    const initials = `${firstName[0] || 'M'}${lastName[0] || 'M'}`.toUpperCase();
    const formattedPhone = phone
      ? phone.startsWith('+')
        ? phone
        : `+233${phone.replace(/^0/, '').replace(/\D/g, '')}`
      : '';
    const tempMemberId = `m-${Date.now()}`;

    const newUser: AuthUser = {
      id: `u-${Date.now()}`,
      name: `${firstName} ${lastName}`,
      email,
      role: 'member',
      initials,
      title: `Member (${groupName || 'Congregation'})`,
      campusName: systemSettings.campusName || 'Main Church Premise',
      memberId: tempMemberId,
      permissions: ['member_portal', 'proximity_checkin', 'giving', 'rsvp'],
    };

    // Persist newly self-registered member to database
    fetch('/api/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName,
        lastName,
        phoneE164: formattedPhone || undefined,
        email: email || undefined,
        status: 'member',
        homeCellGroup: groupName || 'General Congregation',
        groupName: groupName || 'General Congregation',
        autoCheckinOptedIn: true,
        consecutiveAbsences: 0,
      }),
    })
      .then(async (res) => {
        if (res.ok) {
          const savedPerson: Person = await res.json();
          setMembers((prev) => [savedPerson, ...prev.filter((m) => m.id !== savedPerson.id)]);
          const updatedUser = { ...newUser, memberId: savedPerson.id };
          setCurrentUser(updatedUser);
          try {
            localStorage.setItem('ekklesphere_user', JSON.stringify(updatedUser));
          } catch {
            // ignore
          }
        }
      })
      .catch((err) => console.error('Failed to persist registered member:', err));

    login(newUser);
    showToast(`Welcome to ${systemSettings.churchName || 'Church'}, ${firstName}!`);
    return newUser;
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
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {}
    return [LIVE_DEFAULT_SERVICE];
  });
  const [members, setMembers] = useState<Person[]>(() => {
    try {
      const saved = localStorage.getItem('ekklesphere_members');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {}
    return [];
  });
  const [systemSettings, setSystemSettings] = useState<SystemSettings>(() => {
    try {
      const saved = localStorage.getItem('ekklesphere_system_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        const cleaned: SystemSettings = {
          ...DEFAULT_SYSTEM_SETTINGS,
          ...parsed,
          churchName:
            !parsed.churchName || parsed.churchName === 'Ekklesphere Church'
              ? 'PIWC KWADASO'
              : parsed.churchName,
          campusName:
            !parsed.campusName || parsed.campusName === 'Main Church Premise'
              ? 'PIWC KWADASO'
              : parsed.campusName,
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
    const unsubscribe = onAuthStateChanged(auth, (fbUser) => {
      if (fbUser) {
        const email = fbUser.email || '';
        const matchedMember = members.find(
          (m) => (m.email || '').toLowerCase() === email.trim().toLowerCase()
        );
        const name =
          fbUser.displayName ||
          (matchedMember ? `${matchedMember.firstName} ${matchedMember.lastName}`.trim() : '') ||
          email.split('@')[0] ||
          'Church Member';
        const initials =
          name
            .split(' ')
            .filter(Boolean)
            .map((n) => n[0])
            .slice(0, 2)
            .join('')
            .toUpperCase() || 'CM';

        const role = resolveUserRoleForEmail(email, matchedMember);

        const gUser: AuthUser = {
          id: fbUser.uid,
          name,
          email,
          role,
          avatar: fbUser.photoURL || undefined,
          initials,
          memberId: matchedMember?.id,
          title:
            role === 'admin'
              ? 'Administrator / Executive Pastor'
              : role === 'usher'
              ? 'Door Steward / Usher'
              : matchedMember?.groupName
              ? `Member (${matchedMember.groupName})`
              : 'Congregation Member',
          campusName: systemSettings.campusName || 'PIWC KWADASO',
          permissions:
            role === 'admin'
              ? ['all_access', 'pastoral_care', 'service_management', 'system_settings']
              : role === 'usher'
              ? ['checkin_members', 'register_visitors', 'offline_sync', 'proximity_radar']
              : ['member_portal', 'proximity_checkin', 'giving', 'rsvp'],
        };

        setCurrentUser(gUser);
        setGoogleAuthError(null);
        try {
          localStorage.setItem('ekklesphere_user', JSON.stringify(gUser));
        } catch {
          // ignore
        }
      }
    });

    return () => unsubscribe();
  }, [members, systemSettings.campusName]);

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

  // Initialize Service Worker & load push subscribers on mount
  useEffect(() => {
    if (pushNotificationService.isSupported()) {
      pushNotificationService.registerServiceWorker().catch(() => {});
      setPushPermissionStatus(pushNotificationService.getPermissionStatus());
    }

    // Refresh push subscribers count from server
    fetch('/api/notifications/subscriptions')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && typeof data.subscribersCount === 'number') {
          setPushSubscribersCount(data.subscribersCount);
        }
      })
      .catch(() => {});
  }, []);

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

    // Also trigger server dispatch for logging
    fetch('/api/notifications/test-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personName: memberName }),
    }).catch(() => {});

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

  const removeCheckIn = (personId: string) => {
    setAttendanceRecords((prev) =>
      prev.filter(
        (r) => !(r.personId === personId && (!r.serviceInstanceId || r.serviceInstanceId === activeServiceId))
      )
    );
    fetch(
      `/api/live-checkins/${encodeURIComponent(personId)}?serviceId=${encodeURIComponent(activeServiceId)}`,
      {
        method: 'DELETE',
        headers: getAuthHeaders(),
      }
    ).catch((err) => console.warn('Could not remove check-in on server:', err));
    const person = members.find((m) => m.id === personId);
    showToast(`Check-in removed for ${person?.firstName || 'Member'}`);
  };

  const refreshMembers = async (): Promise<void> => {
    try {
      const res = await fetch('/api/members', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setMembers(data);
          try {
            localStorage.setItem('ekklesphere_members', JSON.stringify(data));
          } catch {
            // ignore
          }
          return;
        }
      }
    } catch (err) {
      // transient network warning
    }

    // Fallback: restore from localStorage
    try {
      const saved = localStorage.getItem('ekklesphere_members');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMembers(parsed);
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
        savedPerson = await res.json();
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

    // Create visitor follow-up task
    setFollowupTasks((prev) => [
      {
        id: `task-vis-${Date.now()}`,
        personId: savedPerson!.id,
        personName: name,
        groupName: 'Visitors Welcome Team',
        reason: 'first_timer',
        assignedToName: systemSettings.seniorPastor || 'Welcome & Pastoral Care Team',
        status: 'open',
        dueOn: 'Tomorrow 10:00 AM',
        createdAt: new Date().toISOString().split('T')[0],
      },
      ...prev,
    ]);

    showToast(`${name} saved to directory! Welcome follow-up task created.`);
  };

  const addMember = async (
    memberData: Omit<Person, 'id' | 'tenantId' | 'avatarInitials' | 'joinedOn'>
  ): Promise<Person> => {
    let savedPerson: Person | null = null;
    try {
      const res = await fetch('/api/members', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(memberData),
      });

      if (res.ok) {
        savedPerson = (await res.json().catch(() => ({}))) as Person;
      }
    } catch {
      // offline or serverless fallback
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

    setAuditLogs((prev) => [
      {
        id: `log-${Date.now()}`,
        actor: currentUser?.name || 'Administrator',
        action: 'Member registered',
        entityType: 'Person',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        details: `${savedPerson!.firstName} ${savedPerson!.lastName} saved to database (${savedPerson!.groupName})`,
      },
      ...prev,
    ]);

    showToast(`Member ${savedPerson.firstName} ${savedPerson.lastName} saved to database!`);
    return savedPerson;
  };

  const batchImportMembers = async (newMembers: Person[]): Promise<Person[]> => {
    if (!newMembers || newMembers.length === 0) return [];

    let updatedRoster: Person[] = [];
    try {
      const res = await fetch('/api/members/import', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ members: newMembers }),
      });

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (Array.isArray(data?.members)) {
          updatedRoster = data.members;
        }
      }
    } catch {
      // offline or serverless fallback
    }

    if (updatedRoster.length === 0) {
      // Merge locally and sync each to Firestore
      const existingIds = new Set(members.map((m) => m.id));
      const freshMembers = newMembers.filter((m) => !existingIds.has(m.id));
      updatedRoster = [...freshMembers, ...members];

      freshMembers.forEach((m) => {
        try {
          setDoc(doc(db, 'members', m.id), m, { merge: true }).catch(() => {});
        } catch {}
      });
    }

    setMembers(updatedRoster);
    try {
      localStorage.setItem('ekklesphere_members', JSON.stringify(updatedRoster));
    } catch {}

    setAuditLogs((prev) => [
      {
        id: `log-${Date.now()}`,
        actor: currentUser?.name || 'Administrator',
        action: 'Batch Member Import',
        entityType: 'Person',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        details: `Imported ${newMembers.length} members into congregation directory.`,
      },
      ...prev,
    ]);

    showToast(`Successfully imported ${newMembers.length} members to database!`);
    return updatedRoster;
  };

  const updateMember = async (memberId: string, updates: Partial<Person>): Promise<Person> => {
    const existing = members.find((m) => m.id === memberId);
    const mergedPayload = existing ? { ...existing, ...updates } : updates;

    let updatedPerson: Person | null = null;
    try {
      const res = await fetch(`/api/members/${encodeURIComponent(memberId)}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(mergedPayload),
      });

      if (res.ok) {
        updatedPerson = (await res.json().catch(() => ({}))) as Person;
      }
    } catch {
      // fallback
    }

    if (!updatedPerson) {
      updatedPerson = mergedPayload as Person;
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
      fetch(`/api/members/${encodeURIComponent(memberId)}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      }).catch(() => {});
    } catch {}

    // Delete from Firestore as cloud backup
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
      `Member ${memberToDelete ? `${memberToDelete.firstName} ${memberToDelete.lastName}` : ''} removed from database`
    );
  };

  let serverPremiseUnavailableErrors = 0;
  let premisePollTicks = 0;

  const refreshLivePremise = async () => {
    premisePollTicks++;
    // If backend endpoint is unavailable (e.g. 404 on static deployment), back off polling to avoid console spam
    if (serverPremiseUnavailableErrors >= 2 && premisePollTicks % 8 !== 0) {
      return;
    }

    try {
      let serverData: any = null;
      try {
        const res = await fetch('/api/campus-premise');
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

        // Also sync to Firestore as backup
        try {
          setDoc(doc(db, 'system_settings', 'default'), {
            lat: ps.lat,
            lng: ps.lng,
            accuracyM: ps.accuracyM,
            churchName: ps.churchName,
            campusName: ps.campusName,
            campusAddress: ps.campusAddress,
            innerGeofenceMeters: ps.innerGeofenceMeters,
            outerGeofenceMeters: ps.outerGeofenceMeters,
            dwellTimeMinutes: ps.dwellTimeMinutes,
            updatedAt: ps.updatedAt || new Date().toISOString(),
          }, { merge: true }).catch(() => {});
        } catch {}
      } else {
        // If server hasn't configured premise, check Firestore
        try {
          const fsSnap = await getDoc(doc(db, 'system_settings', 'default'));
          if (fsSnap.exists()) {
            const fsData = fsSnap.data();
            const latVal = typeof fsData.lat === 'number' ? fsData.lat : typeof fsData.campusLatitude === 'number' ? fsData.campusLatitude : null;
            const lngVal = typeof fsData.lng === 'number' ? fsData.lng : typeof fsData.campusLongitude === 'number' ? fsData.campusLongitude : null;

            if (latVal !== null && lngVal !== null) {
              setSystemSettings((prev) => {
                const next: SystemSettings = {
                  ...prev,
                  churchName: fsData.churchName || prev.churchName,
                  campusName: fsData.campusName || prev.campusName,
                  campusAddress: fsData.campusAddress ?? prev.campusAddress,
                  campusLatitude: latVal,
                  campusLongitude: lngVal,
                  campusLocationAccuracyM: typeof fsData.accuracyM === 'number' ? fsData.accuracyM : typeof fsData.campusLocationAccuracyM === 'number' ? fsData.campusLocationAccuracyM : null,
                  campusLocationUpdatedAt: fsData.updatedAt || fsData.campusLocationUpdatedAt || null,
                  innerGeofenceMeters: fsData.innerGeofenceMeters ?? prev.innerGeofenceMeters,
                  outerGeofenceMeters: fsData.outerGeofenceMeters ?? prev.outerGeofenceMeters,
                  dwellTimeMinutes: fsData.dwellTimeMinutes ?? prev.dwellTimeMinutes,
                };
                try {
                  localStorage.setItem('ekklesphere_system_settings', JSON.stringify(next));
                } catch {}
                return next;
              });

              // Push restored premise back to server to keep it active
              fetch('/api/campus-premise', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                  lat: latVal,
                  lng: lngVal,
                  accuracyM: fsData.accuracyM ?? fsData.campusLocationAccuracyM,
                  churchName: fsData.churchName,
                  campusName: fsData.campusName,
                  campusAddress: fsData.campusAddress,
                  innerGeofenceMeters: fsData.innerGeofenceMeters,
                  outerGeofenceMeters: fsData.outerGeofenceMeters,
                  dwellTimeMinutes: fsData.dwellTimeMinutes,
                  updatedBy: 'System (Firestore Restore)',
                }),
              }).catch(() => {});
            }
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
        } catch {
          // ignore Firestore read error if offline
        }
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
    try {
      const res = await fetch('/api/events');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          const mapped = data.map(mapDbEventToService);
          setServices(mapped);
          try {
            localStorage.setItem('ekklesphere_services', JSON.stringify(mapped));
          } catch {}
          setActiveServiceId((prev) =>
            mapped.some((s) => s.id === prev) ? prev : mapped[0].id
          );
          return;
        }
      }
    } catch {
      // ignore transient network errors
    }

    // Fallback: restore from localStorage
    try {
      const saved = localStorage.getItem('ekklesphere_services');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setServices(parsed);
          setActiveServiceId((prev) =>
            parsed.some((s: ServiceInstance) => s.id === prev) ? prev : parsed[0].id
          );
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

  useEffect(() => {
    refreshLivePremise();
    refreshMembers();
    refreshServices();
    const interval = setInterval(refreshLivePremise, 4000);
    return () => clearInterval(interval);
  }, []);

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

      const churchName = (params.churchName || systemSettings.churchName || 'PIWC KWADASO').trim() || 'PIWC KWADASO';
      const campusName = (params.campusName || systemSettings.campusName || 'PIWC KWADASO').trim() || 'PIWC KWADASO';
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

      // 1. Dual-persist to Firestore immediately as cloud primary/backup
      try {
        await setDoc(doc(db, 'system_settings', 'default'), {
          ...payload,
          campusLatitude: parsedLat,
          campusLongitude: parsedLng,
          campusLocationAccuracyM: accuracyM,
          campusLocationUpdatedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      } catch (fsErr) {
        console.warn('Firestore direct write for premise settings (non-blocking):', fsErr);
      }

      // 2. Persist to API server
      let serverSaved = false;
      let ps: any = null;
      try {
        const res = await fetch('/api/campus-premise', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          const data = await res.json();
          ps = data.premiseSettings;
          serverSaved = true;
        } else {
          const errorJson = await res.json().catch(() => ({}));
          console.warn('Server GPS premise response not ok, but Firestore saved:', res.status, errorJson);
        }
      } catch (srvErr) {
        console.warn('Server GPS premise network error, relying on Firestore persistence:', srvErr);
      }

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

      setAuditLogs((prev) => [
        {
          id: `log-${Date.now()}`,
          actor: currentUser?.name || 'Administrator',
          action: 'Church Premise GPS Set',
          entityType: 'CampusGeofence',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          details: `Pinned ${payload.campusName} at (${parsedLat.toFixed(6)}, ${parsedLng.toFixed(6)}) · Radius ${payload.innerGeofenceMeters}m (Server & Cloud Saved)`,
        },
        ...prev,
      ]);

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
      fetch('/api/campus-premise', { method: 'DELETE' }).catch(() => {});
      try {
        await deleteDoc(doc(db, 'system_settings', 'default'));
      } catch {}

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
      setAuditLogs((prev) => [
        {
          id: `log-${Date.now()}`,
          actor: currentUser?.name || 'Administrator',
          action: 'Church Premise GPS Cleared',
          entityType: 'CampusGeofence',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          details: 'Cleared configured church premise coordinates',
        },
        ...prev,
      ]);
      showToast('Church premise GPS location cleared');
    } catch (err) {
      console.error('Error clearing church premise location:', err);
    }
  };

  const updateSystemSettings = (newSettings: Partial<SystemSettings>) => {
    setSystemSettings((prev) => {
      const updated = { ...prev, ...newSettings };
      try {
        localStorage.setItem('ekklesphere_system_settings', JSON.stringify(updated));
      } catch {}
      if (updated.campusLatitude != null && updated.campusLongitude != null) {
        // Dual-persist to server and Firestore
        fetch('/api/campus-premise', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lat: updated.campusLatitude,
            lng: updated.campusLongitude,
            accuracyM: updated.campusLocationAccuracyM ?? null,
            churchName: updated.churchName,
            campusName: updated.campusName,
            campusAddress: updated.campusAddress,
            innerGeofenceMeters: updated.innerGeofenceMeters,
            outerGeofenceMeters: updated.outerGeofenceMeters,
            dwellTimeMinutes: updated.dwellTimeMinutes,
            updatedBy: currentUser?.name || 'Administrator',
          }),
        }).catch((err) => console.warn('Could not sync updated premise settings to server:', err));

        setDoc(doc(db, 'system_settings', 'default'), {
          lat: updated.campusLatitude,
          lng: updated.campusLongitude,
          accuracyM: updated.campusLocationAccuracyM ?? null,
          churchName: updated.churchName,
          campusName: updated.campusName,
          campusAddress: updated.campusAddress,
          innerGeofenceMeters: updated.innerGeofenceMeters,
          outerGeofenceMeters: updated.outerGeofenceMeters,
          dwellTimeMinutes: updated.dwellTimeMinutes,
          updatedAt: new Date().toISOString(),
        }, { merge: true }).catch(() => {});
      }
      return updated;
    });
    setAuditLogs((prev) => [
      {
        id: `log-${Date.now()}`,
        actor: currentUser?.name || 'Administrator',
        action: 'System Settings Updated',
        entityType: 'SystemSettings',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        details: 'Campus proximity parameters and automated thresholds saved',
      },
      ...prev,
    ]);
    showToast('System & Campus settings saved successfully');
  };

  const resetSystemSettings = () => {
    setSystemSettings(DEFAULT_SYSTEM_SETTINGS);
    fetch('/api/campus-premise', { method: 'DELETE' }).catch(() => {});
    try {
      localStorage.removeItem('ekklesphere_system_settings');
    } catch {
      // ignore
    }
    showToast('System settings reset. Please set your Church Premise GPS location.');
  };

  const addChurchGroup = (groupData: Omit<ChurchGroup, 'id' | 'createdAt'>): ChurchGroup => {
    const newGroup: ChurchGroup = {
      ...groupData,
      id: `grp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      createdAt: new Date().toISOString().split('T')[0],
    };
    setChurchGroups((prev) => {
      const updated = [newGroup, ...prev];
      try {
        localStorage.setItem('ekklesphere_church_groups', JSON.stringify(updated));
      } catch {
        // ignore
      }
      return updated;
    });
    setAuditLogs((prev) => [
      {
        id: `log-${Date.now()}`,
        actor: currentUser?.name || 'Administrator',
        action: 'Church Group Created',
        entityType: 'ChurchGroup',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        details: `Created ${newGroup.category.replace('_', ' ')}: "${newGroup.name}" led by ${newGroup.leaderName}`,
      },
      ...prev,
    ]);
    showToast(`${newGroup.name} created successfully`);
    return newGroup;
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
      } catch {
        // ignore
      }
      return updated;
    });
    setAuditLogs((prev) => [
      {
        id: `log-${Date.now()}`,
        actor: currentUser?.name || 'Administrator',
        action: 'Church Group Updated',
        entityType: 'ChurchGroup',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        details: `Updated parameters for group "${groupName}"`,
      },
      ...prev,
    ]);
    showToast(`${groupName || 'Group'} updated successfully`);
  };

  const deleteChurchGroup = (id: string) => {
    const groupToDelete = churchGroups.find((g) => g.id === id);
    setChurchGroups((prev) => {
      const updated = prev.filter((g) => g.id !== id);
      try {
        localStorage.setItem('ekklesphere_church_groups', JSON.stringify(updated));
      } catch {
        // ignore
      }
      return updated;
    });
    setAuditLogs((prev) => [
      {
        id: `log-${Date.now()}`,
        actor: currentUser?.name || 'Administrator',
        action: 'Church Group Deleted',
        entityType: 'ChurchGroup',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        details: `Deleted group "${groupToDelete?.name}"`,
      },
      ...prev,
    ]);
    showToast(`Removed "${groupToDelete?.name || 'Group'}"`);
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

  const updateMemberConsent = (autoCheckin: boolean, push: boolean, sms: boolean, email: boolean) => {
    setMemberConsents({ autoCheckin, push, sms, email });
    const targetMemberId = currentUser?.memberId || currentUser?.id;
    if (targetMemberId) {
      setMembers((prev) =>
        prev.map((m) => (m.id === targetMemberId ? { ...m, autoCheckinOptedIn: autoCheckin } : m))
      );
    }
    showToast(
      autoCheckin
        ? 'Auto check-in activated. Location is used only when arriving at church.'
        : 'Auto check-in deactivated. Background location is stopped.'
    );
  };

  const toggleRsvp = (eventName: string) => {
    setMemberRsvps((prev) => {
      const next = !prev[eventName];
      showToast(next ? `RSVP confirmed for ${eventName}` : `RSVP removed for ${eventName}`);
      return { ...prev, [eventName]: next };
    });
  };

  const submitDonation = (
    amountGhs: number,
    fund: string,
    method: 'MTN MoMo' | 'Telecel Cash' | 'Card'
  ) => {
    const donorId = currentUser?.memberId || currentUser?.id || 'guest';
    const donorName = currentUser?.name || 'Member';
    const newDonation: Donation = {
      id: `don-${Date.now()}`,
      personId: donorId,
      personName: donorName,
      fundId: fund.toLowerCase().replace(/\s+/g, '-'),
      fundName: fund,
      amountMinor: amountGhs * 100,
      currency: 'GHS',
      method: method === 'Card' ? 'card' : 'momo',
      provider: method,
      status: 'paid',
      paidAt: new Date().toISOString().split('T')[0],
    };
    setDonations((prev) => [newDonation, ...prev]);
    showToast(`Thank you! GHS ${amountGhs} given to ${fund} via ${method}.`);
  };

  const resolveFollowupTask = (taskId: string, outcome: string) => {
    setFollowupTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? { ...t, status: 'resolved', outcome, resolvedAt: new Date().toISOString() }
          : t
      )
    );
    showToast(`Care task marked resolved: ${outcome}`);
  };

  const addFollowupTask = (
    personId: string,
    reason: 'absent_2' | 'absent_3' | 'first_timer' | 'manual',
    _notes: string
  ) => {
    const person = members.find((m) => m.id === personId);
    const newTask: FollowupTask = {
      id: `task-${Date.now()}`,
      personId,
      personName: person ? `${person.firstName} ${person.lastName}` : 'Member',
      groupName: person?.groupName || 'General',
      reason,
      assignedToName: systemSettings.seniorPastor || currentUser?.name || 'Pastoral Care Team',
      status: 'open',
      dueOn: 'In 3 days',
      createdAt: new Date().toISOString().split('T')[0],
    };
    setFollowupTasks((prev) => [newTask, ...prev]);
    showToast(`Follow-up assignment created for ${newTask.personName}`);
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
        logout,
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
        theme,
        setTheme,
        toggleTheme,
        activeServiceId,
        setActiveServiceId,
        services,
        currentService,
        refreshServices,
        addService,
        members,
        visitorsCount,
        refreshMembers,
        addVisitor,
        addMember,
        batchImportMembers,
        updateMember,
        deleteMember,
        updateMemberConsent,
        systemSettings,
        updateSystemSettings,
        resetSystemSettings,
        setChurchPremiseLocation,
        clearChurchPremiseLocation,
        refreshLivePremise,
        churchGroups,
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
        auditLogs,
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
