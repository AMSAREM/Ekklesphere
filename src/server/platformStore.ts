// src/server/platformStore.ts
// Single-Source-of-Truth Platform Persistence Layer for Ekklesphere.
// Uses Supabase Postgres (service_role) when SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY are set.
// In non-production Vitest / local preview sandboxes without Supabase credentials, uses a
// strict relational org-scoped backing store (zero os.tmpdir() temp files, zero anon-key fallback).

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID, createHash, scryptSync, randomBytes, timingSafeEqual } from 'crypto';
import {
  DEFAULT_IDLE_SESSION_TIMEOUT_MINUTES,
  PRIMARY_CAMPUS_SITE_ID,
  PRIMARY_ORGANIZATION_ID,
  TEST_ANCHOR_ORGANIZATION_ID,
  TEST_CAMPUS_SITE_ID,
  normalizeIdleTimeoutMinutes,
  resetSessionRegistryForTests,
  sealTemporaryPassword,
  sealTenantSecret,
  signSessionToken,
  unsealTemporaryPassword,
  unsealTenantSecret,
  maskSecretTail,
  type ActiveSupportGrantContext,
  type AuthUserPayload,
  type ChurchRole,
} from '../../lib/auth.ts';
import { detectPaystackMode } from './paystackService.ts';
import { sendArkeselSms, sendResendEmail, normalizeArkeselPhone } from './communicationsService.ts';
import { churchWallStore } from './churchWallStore.ts';
import { resolveServiceWindow, type BinaryServiceStatus } from '../utils/serviceStatus.ts';
import {
  buildAutoAssignAbsenteesPlan,
  getMemberFullName,
  normalizeSettingLabel,
} from '../utils/settingsConnections.ts';
import { getMemberPortfolio } from '../constants/portfolios.ts';
import {
  normalizeIncomingGroupCategory,
  sanitizeCustomGroupCategories,
} from '../shared/groupCategories.ts';
import { resolveMemberBirthFields } from '../utils/birthMonth.ts';
import { normalizeMemberDepartmentFields } from '../utils/memberDepartments.ts';
import type {
  BillingCycle,
  ChurchGroup,
  ChurchGroupCategory,
  ChurchGroupCategoryDefinition,
  ChurchGroupLeadershipAction,
  ChurchGroupLeadershipHistoryEntry,
  ChurchGroupLeadershipRole,
  ConsoleAlert,
  ConsoleAlertType,
  ConsoleAuditLogRecord,
  ConsoleDashboardSummary,
  ConsolePlan,
  DataPrivacyRequest,
  Donation,
  FollowupReason,
  FollowupStatus,
  FollowupTask,
  LandingLeadRecord,
  LandingLeadStatus,
  LandingLeadType,
  LandingPageConfig,
  LeaderAccountabilityRow,
  LicenseEvaluationResult,
  LicenseOverrides,
  LicensePaymentRecord,
  LicenseStatus,
  LicenseTier,
  OrganisationDetailPayload,
  OrganisationType,
  PastoralCareDispatch,
  PastoralCareDispatchChannel,
  PastoralCareDispatchStatus,
  PastoralCareDispatchType,
  PastoralCareMonitorSummary,
  PaymentCurrency,
  PaymentMethod,
  Person,
  PlatformAnnouncement,
  PlatformFeatureFlag,
  PublicLandingOverview,
  ServiceAbsenceSweepResult,
  SupportGrantSession,
  SystemLicense,
  SystemSettings,
  TenantChurch,
  TenantFeatures,
  TenantGatewayConfigSummary,
  TenantStatus,
  UsageDailyAggregate,
} from '../types/ekklesphere.ts';
import {
  validateMemberImportBatch,
  type ExistingMemberIndexEntry,
  type ImportDuplicateMode,
  type MemberImportValidationSummary,
  type ValidatedImportRow,
} from '../shared/memberImportValidation.ts';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GRACE_PERIOD_DAYS = 7;
const TRIAL_DURATION_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

export function toDeterministicUuid(rawId: string): string {
  if (UUID_REGEX.test(rawId)) return rawId.toLowerCase();
  const hex = createHash('sha256').update(`ekklesphere:${rawId}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function normalizePhone(rawPhone?: string | null): string {
  if (!rawPhone) return '';
  const digits = rawPhone.replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length === 10) {
    return `+233${digits.slice(1)}`;
  }
  if (digits.startsWith('233') && digits.length === 12) {
    return `+${digits}`;
  }
  return digits ? `+${digits}` : '';
}

export function hashPassword(password: string, existingSalt?: string): { hash: string; salt: string } {
  const salt = existingSalt || randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  try {
    const calculated = scryptSync(password, salt, 64).toString('hex');
    return timingSafeEqual(Buffer.from(calculated, 'hex'), Buffer.from(hash, 'hex'));
  } catch {
    return false;
  }
}

export type OrganizationRecord = TenantChurch;

export const DEFAULT_MEMBER_ONBOARDING_PASSWORD = 'Ekklesphere@2026';

export interface OnboardingCredentialResult {
  provisioned: boolean;
  status: 'created' | 'already_exists' | 'skipped_no_contact';
  identifiers: string[];
  temporaryPassword?: string;
  mustChangePassword: boolean;
}

export interface UserCredentialRecord {
  id: string;
  memberId?: string;
  authUserId?: string;
  organizationId: string;
  email?: string;
  username?: string;
  phoneE164?: string;
  name: string;
  designation?: string;
  role: ChurchRole;
  isCreator: boolean;
  passwordHash: string;
  passwordSalt: string;
  status: 'active' | 'suspended' | 'locked';
  mustChangePassword?: boolean;
  temporaryPassword?: string;
  passwordUpdatedAt?: string | null;
  failedAttempts?: number;
  lockedUntil?: string | null;
  createdAt?: string;
}

export interface OrganizationUserAccount {
  id: string;
  memberId?: string;
  memberCode?: string;
  organizationId: string;
  fullName: string;
  email?: string;
  username?: string;
  phoneE164?: string;
  role: ChurchRole;
  accountCategory: 'member' | 'staff';
  hasCredentials: boolean;
  credentialStatus: 'active' | 'temp_password' | 'suspended' | 'locked' | 'unprovisioned';
  status: 'active' | 'suspended';
  mustChangePassword: boolean;
  temporaryPassword?: string;
  lastLoginAt: string | null;
  createdAt?: string;
  homeCellGroup?: string;
  department?: string;
  designation?: string;
}

const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;

export interface StoredGeofenceEvent {
  id: string;
  organization_id: string;
  client_event_id: string;
  user_id: string;
  person_id?: string;
  person_name?: string;
  service_instance_id?: string;
  site_id: string;
  type: 'enter' | 'exit' | 'manual_in' | 'manual_out';
  source: 'geofence' | 'manual' | 'web' | 'admin_edit' | 'system_auto_close';
  platform: string;
  lat: number | null;
  lng: number | null;
  accuracy_m: number | null;
  distance_m: number | null;
  is_mock: boolean;
  device_time: string;
  server_time: string;
  status: 'accepted' | 'flagged' | 'rejected';
  flag_reasons: string[];
}

export interface RegisteredSiteRecord {
  id: string;
  organization_id: string;
  name: string;
  address?: string;
  lat: number;
  lng: number;
  radius_m: number;
  outer_radius_m: number;
  dwell_min: number;
  active: boolean;
  updated_at: string;
  updated_by?: string;
}

export interface PremiseSettingsRecord {
  organizationId: string;
  churchName: string;
  campusName: string;
  campusAddress: string;
  lat: number | null;
  lng: number | null;
  accuracyM: number | null;
  innerGeofenceMeters: number;
  outerGeofenceMeters: number;
  dwellTimeMinutes: number;
  updatedAt: string | null;
  updatedBy?: string;
}

export interface LiveCheckinItem {
  id: string;
  tenantId: string;
  organizationId: string;
  personId: string;
  personName?: string;
  serviceInstanceId: string;
  campusId: string;
  method: 'usher' | 'posted_qr' | 'beacon' | 'geofence' | 'email_link' | 'manual';
  confidence: number;
  checkedInAt: string;
  checkedInIso: string;
  late: boolean;
  recordedBy?: string;
  note?: string;
  distanceM?: number | null;
  lat?: number | null;
  lng?: number | null;
}

export interface PushSubscriptionItem {
  id: string;
  organizationId: string;
  endpoint: string;
  keys?: { p256dh?: string; auth?: string };
  personId?: string;
  personName?: string;
  userAgent?: string;
  subscribedAt: string;
}

export const DEFAULT_LANDING_CMS: LandingPageConfig = {
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

export const DEFAULT_ABSENT_MEMBER_MESSAGE_TEMPLATE =
  'Hello {{firstName}}, we missed you at {{serviceName}} ({{churchName}}) today. You are dearly loved and prayed for. Need prayer or support? Reply or call {{contactPhone}}.';

export const DEFAULT_ORG_SYSTEM_SETTINGS: SystemSettings = {
  churchName: '',
  churchLogoUrl: '',
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
  absentMemberMessageTemplate: DEFAULT_ABSENT_MEMBER_MESSAGE_TEMPLATE,
  autoSendLeaderCareReminders: true,
  requireExplicitConsent: true,
  auditLogRetentionDays: 90,
  sessionTimeoutMinutes: DEFAULT_IDLE_SESSION_TIMEOUT_MINUTES,
  smsGatewayProvider: 'Arkesel SMS',
  smsSenderId: 'EKKLESPHERE',
  emailGatewayProvider: 'Resend Email',
  emailFromAddress: '',
  emailSenderName: '',
  enablePushNotifications: true,
  customGroupCategories: [],
};

const DEFAULT_PLANS: Record<LicenseTier, ConsolePlan> = {
  grace_starter: {
    id: 'grace_starter',
    name: 'Grace Starter',
    description: 'Essential proximity check-in and door usher headcount for growing local assemblies.',
    monthlyCostUSD: 19,
    annualCostUSD: 180,
    seatsLimit: 250,
    sitesLimit: 1,
    monthlyCheckinsLimit: 3000,
    featureFlags: {
      bleRadar: false,
      smsGateway: false,
      biometrics: false,
      gdprPrivacyVault: true,
      multiCampus: false,
      mobileGivingMoMo: false,
      customDomain: false,
      exportAuditLogs: false,
    },
    isActive: true,
    updatedAt: new Date().toISOString(),
  },
  ministry_pro: {
    id: 'ministry_pro',
    name: 'Ministry Pro',
    description: 'Full pastoral care workflows, SMS/Push alerts, BLE beacons, and Mobile Money giving.',
    monthlyCostUSD: 49,
    annualCostUSD: 480,
    seatsLimit: 800,
    sitesLimit: 3,
    monthlyCheckinsLimit: 15000,
    featureFlags: {
      bleRadar: true,
      smsGateway: true,
      biometrics: false,
      gdprPrivacyVault: true,
      multiCampus: true,
      mobileGivingMoMo: true,
      customDomain: false,
      exportAuditLogs: true,
    },
    isActive: true,
    updatedAt: new Date().toISOString(),
  },
  cathedral_enterprise: {
    id: 'cathedral_enterprise',
    name: 'Cathedral Enterprise',
    description: 'Multi-campus sovereign operations, custom domains, high-capacity assemblies, and full audit SLA.',
    monthlyCostUSD: 119,
    annualCostUSD: 1200,
    seatsLimit: 2500,
    sitesLimit: 15,
    monthlyCheckinsLimit: 100000,
    featureFlags: {
      bleRadar: true,
      smsGateway: true,
      biometrics: true,
      gdprPrivacyVault: true,
      multiCampus: true,
      mobileGivingMoMo: true,
      customDomain: true,
      exportAuditLogs: true,
    },
    isActive: true,
    updatedAt: new Date().toISOString(),
  },
};

function enabledFeatureLabelsFromFlags(flags: TenantFeatures): string[] {
  const labels = ['Geofence Radar v2', 'Door Usher Headcount', 'Digital Member QR'];
  if (flags.bleRadar) labels.push('BLE Entrance Radar');
  if (flags.smsGateway) labels.push('SMS & Push Pastoral Care');
  if (flags.mobileGivingMoMo) labels.push('Mobile Giving MoMo');
  if (flags.multiCampus) labels.push('Multi-Campus Sync');
  if (flags.customDomain) labels.push('Custom Domain');
  if (flags.exportAuditLogs) labels.push('Audit Trail & Consent Vault');
  return labels;
}

function generateLicenseKey(orgName: string, prefixType: 'LIC' | 'TRIAL' = 'LIC'): string {
  const prefix =
    orgName
      .replace(/[^A-Za-z0-9]/g, '')
      .slice(0, 6)
      .toUpperCase() || 'EKKLE';
  const rand = randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
  return `${prefixType}-${prefix}-${rand}`;
}

function mapSupabaseRoleToChurchRole(rawRole?: string | null): ChurchRole {
  if (!rawRole) return 'member';
  const r = rawRole.toLowerCase();
  if (r === 'owner' || r === 'admin') return 'admin';
  if (r === 'pastor') return 'pastor';
  if (r === 'usher') return 'usher';
  if (r === 'finance') return 'finance';
  if (r === 'group_leader') return 'group_leader';
  return 'member';
}

function mapCredentialRoleToChurchRole(rawRole?: string | null, isCreator?: boolean): ChurchRole {
  const r = (rawRole || '').toLowerCase();
  if (isCreator) {
    if (r === 'super_admin') return 'super_admin';
    return 'creator';
  }
  return mapSupabaseRoleToChurchRole(rawRole);
}

class PlatformStore {
  public readonly supabase: SupabaseClient | null;
  private readonly supabaseUrl: string;
  private readonly supabaseAuthKey: string;
  public readonly isTestRuntime: boolean;
  private customSupabaseAuthVerifier:
    | ((email: string, password: string) => Promise<{ matched: boolean; authUserId?: string }>)
    | null = null;
  private customSupabaseClientOverride: SupabaseClient | null = null;

  // Relational backing tables for Vitest & local unconfigured preview sandbox ONLY
  private orgs = new Map<string, TenantChurch>();
  private plans = new Map<LicenseTier, ConsolePlan>();
  private licenses = new Map<string, SystemLicense>();
  private payments: LicensePaymentRecord[] = [];
  private usageDaily = new Map<string, UsageDailyAggregate>();
  private auditLogs: ConsoleAuditLogRecord[] = [];
  private alerts = new Map<string, ConsoleAlert>();
  private announcements = new Map<string, PlatformAnnouncement>();
  private featureFlags = new Map<string, PlatformFeatureFlag>();
  private dataRequests = new Map<string, DataPrivacyRequest>();
  private supportGrants = new Map<string, SupportGrantSession>();
  private landingConfig: LandingPageConfig = { ...DEFAULT_LANDING_CMS };
  private landingLeads = new Map<string, LandingLeadRecord>();

  // Org-scoped operational collections
  private sitesByOrg = new Map<string, RegisteredSiteRecord[]>();
  private premiseByOrg = new Map<string, PremiseSettingsRecord>();
  private systemSettingsByOrg = new Map<string, SystemSettings>();
  private churchGroupsByOrg = new Map<string, ChurchGroup[]>();
  private churchGroupLeadershipHistoryByOrg = new Map<string, ChurchGroupLeadershipHistoryEntry[]>();
  private checkinsByOrg = new Map<string, LiveCheckinItem[]>();
  private rawEventsByOrg = new Map<string, StoredGeofenceEvent[]>();
  private membersByOrg = new Map<string, Record<string, any>[]>();
  private eventsByOrg = new Map<string, Record<string, any>[]>();
  private pushSubsByOrg = new Map<string, PushSubscriptionItem[]>();
  private donationsByOrg = new Map<string, Donation[]>();
  private followupTasksByOrg = new Map<string, FollowupTask[]>();
  private dispatchesByOrg = new Map<string, PastoralCareDispatch[]>();
  private absenceRunsByOrg = new Map<string, Map<string, { eventId: string; eventName: string; processedAt: string }>>();
  private memberConsentsByOrg = new Map<
    string,
    Record<
      string,
      {
        autoCheckin: boolean;
        push: boolean;
        sms: boolean;
        email: boolean;
        memberId?: string;
        updatedAt: string;
      }
    >
  >();
  private eventRsvpsByOrg = new Map<string, Record<string, boolean>>();
  private legacyTenantsForDryRun: Array<{ id: string; name: string; slug: string }> = [];
  private userCredentials = new Map<string, UserCredentialRecord>();
  private tempPasswordByCredId = new Map<string, string>();
  private gatewaySecretsByOrg = new Map<
    string,
    {
      arkeselApiKeyEnc?: string | null;
      arkeselApiKeyMasked?: string | null;
      paystackPublicKey?: string | null;
      paystackSecretKeyEnc?: string | null;
      paystackSecretKeyMasked?: string | null;
      updatedBy?: string | null;
      updatedAt?: string | null;
    }
  >();

  constructor() {
    this.isTestRuntime = Boolean(process.env.VITEST || process.env.NODE_ENV === 'test');
    const url = (
      process.env.SUPABASE_URL ||
      process.env.VITE_SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      ''
    ).trim();
    // CRITICAL SECURITY RULE: Server uses ONLY SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY), never SUPABASE_ANON_KEY for DB writes.
    const serviceRoleKey = (
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SECRET_KEY ||
      ''
    ).trim();
    const anonKey = (
      process.env.SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      ''
    ).trim();

    this.supabaseUrl = url;
    this.supabaseAuthKey = anonKey || serviceRoleKey;

    this.supabase =
      url && serviceRoleKey && !this.isTestRuntime
        ? createClient(url, serviceRoleKey, {
            auth: { persistSession: false, autoRefreshToken: false },
          })
        : null;

    if (this.isTestRuntime) {
      this.seedBaselineState();
    }
  }

  private get activeSupabase(): SupabaseClient | null {
    return this.customSupabaseClientOverride || this.supabase;
  }

  private get canVerifyViaSupabaseAuth(): boolean {
    return Boolean(this.customSupabaseAuthVerifier || (this.supabaseUrl && this.supabaseAuthKey));
  }

  public getPublicSupabaseAuthConfig(env: NodeJS.ProcessEnv = process.env): {
    supabaseUrl: string;
    supabaseAnonKey: string;
    googleOAuthConfigured: boolean;
  } {
    const supabaseUrl = (
      env.VITE_SUPABASE_URL ||
      env.SUPABASE_URL ||
      env.NEXT_PUBLIC_SUPABASE_URL ||
      this.supabaseUrl ||
      ''
    ).trim();
    const supabaseAnonKey = (
      env.VITE_SUPABASE_ANON_KEY ||
      env.SUPABASE_ANON_KEY ||
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      ''
    ).trim();
    return {
      supabaseUrl,
      supabaseAnonKey,
      googleOAuthConfigured: Boolean(supabaseUrl && supabaseAnonKey),
    };
  }

  public setSupabaseTestHooks(hooks: {
    client?: SupabaseClient | null;
    authVerifier?:
      | ((email: string, password: string) => Promise<{ matched: boolean; authUserId?: string }>)
      | null;
  }): void {
    if (!this.isTestRuntime) {
      throw new Error('setSupabaseTestHooks may only be invoked inside Vitest test runtime.');
    }
    if ('client' in hooks) {
      this.customSupabaseClientOverride = hooks.client ?? null;
    }
    if ('authVerifier' in hooks) {
      this.customSupabaseAuthVerifier = hooks.authVerifier ?? null;
    }
  }

  private assertDatabaseAvailable(): void {
    if (!this.supabase && !this.isTestRuntime) {
      const err: any = new Error(
        'Supabase PostgreSQL database is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY; user credentials and data are never stored on the server.'
      );
      err.code = 'SUPABASE_NOT_CONFIGURED';
      err.status = 503;
      throw err;
    }
  }

  public get storageBackend(): 'supabase' | 'sandbox_ephemeral' {
    return this.supabase ? 'supabase' : 'sandbox_ephemeral';
  }

  public resetForTests(): void {
    if (!this.isTestRuntime) {
      throw new Error('resetForTests may only be invoked inside Vitest test runtime.');
    }
    this.orgs.clear();
    this.plans.clear();
    this.licenses.clear();
    this.payments = [];
    this.usageDaily.clear();
    this.auditLogs = [];
    this.alerts.clear();
    this.announcements.clear();
    this.featureFlags.clear();
    this.dataRequests.clear();
    this.supportGrants.clear();
    this.sitesByOrg.clear();
    this.premiseByOrg.clear();
    this.systemSettingsByOrg.clear();
    this.churchGroupsByOrg.clear();
    this.churchGroupLeadershipHistoryByOrg.clear();
    this.checkinsByOrg.clear();
    this.rawEventsByOrg.clear();
    this.membersByOrg.clear();
    this.eventsByOrg.clear();
    this.pushSubsByOrg.clear();
    this.donationsByOrg.clear();
    this.followupTasksByOrg.clear();
    this.dispatchesByOrg.clear();
    this.absenceRunsByOrg.clear();
    this.memberConsentsByOrg.clear();
    this.eventRsvpsByOrg.clear();
    this.legacyTenantsForDryRun = [];
    this.userCredentials.clear();
    this.tempPasswordByCredId.clear();
    this.gatewaySecretsByOrg.clear();
    this.customSupabaseClientOverride = null;
    this.customSupabaseAuthVerifier = null;
    this.landingLeads.clear();
    resetSessionRegistryForTests();
    this.landingConfig = { ...DEFAULT_LANDING_CMS };
    this.seedBaselineState();
  }

  private seedBaselineState(): void {
    if (!this.isTestRuntime) {
      return;
    }

    for (const plan of Object.values(DEFAULT_PLANS)) {
      this.plans.set(plan.id, { ...plan, featureFlags: { ...plan.featureFlags } });
    }

    const now = new Date();
    const oneYearOut = new Date(now.getTime() + 365 * DAY_MS).toISOString().slice(0, 10);
    const graceOut = new Date(now.getTime() + (365 + GRACE_PERIOD_DAYS) * DAY_MS).toISOString().slice(0, 10);

    // Optional explicit bootstrap creator credentials sourced strictly from environment secrets.
    // Zero hardcoded emails or passwords ever exist in source code.
    const envCreatorEmail = (process.env.CREATOR_EMAIL || '').trim().toLowerCase();
    const envCreatorPass = (process.env.CREATOR_PASSWORD || '').trim();
    const envCreatorUsername = (process.env.CREATOR_USERNAME || '').trim().toLowerCase() || undefined;
    const envCreatorPhone = normalizePhone(process.env.CREATOR_PHONE) || undefined;
    const envCreatorName = (process.env.CREATOR_NAME || '').trim() || 'Platform Creator';
    const envCreatorOrgId =
      process.env.CREATOR_ORGANIZATION_ID && UUID_REGEX.test(process.env.CREATOR_ORGANIZATION_ID.trim())
        ? process.env.CREATOR_ORGANIZATION_ID.trim().toLowerCase()
        : '';

    if (envCreatorEmail && envCreatorPass) {
      const { hash: creatorHash, salt: creatorSalt } = hashPassword(envCreatorPass);
      const creatorId = toDeterministicUuid(`creator:${envCreatorEmail}`);
      const creatorRecord: UserCredentialRecord = {
        id: creatorId,
        organizationId: envCreatorOrgId,
        email: envCreatorEmail,
        username: envCreatorUsername,
        phoneE164: envCreatorPhone,
        name: envCreatorName,
        role: 'creator',
        isCreator: true,
        passwordHash: creatorHash,
        passwordSalt: creatorSalt,
        status: 'active',
        failedAttempts: 0,
        lockedUntil: null,
        createdAt: now.toISOString(),
      };
      this.userCredentials.set(creatorId, creatorRecord);
    }

    const testOrgId = TEST_ANCHOR_ORGANIZATION_ID;
    const testSiteId = TEST_CAMPUS_SITE_ID;

    const primaryOrg: TenantChurch = {
      id: testOrgId,
      name: 'Test Anchor Sanctuary',
      slug: 'test-sanctuary',
      orgType: 'church',
      campusCode: 'TEST-01',
      city: 'Accra',
      country: 'Ghana',
      seniorPastor: 'Lead Pastor',
      contactName: 'Church Administrator',
      contactEmail: 'admin@ekklesphere.church',
      contactPhone: '+233240000000',
      status: 'active',
      memberCount: 0,
      maxCapacity: 2500,
      sitesCount: 1,
      sitesLimit: 15,
      licenseKey: 'EKKLE-TEST-SANCTUARY-2026',
      licenseTier: 'cathedral_enterprise',
      licenseStatus: 'active',
      renewalDate: oneYearOut,
      billingCycle: 'annual',
      geofenceRadiusMeters: 300,
      geofenceConfigured: true,
      smsConfigured: true,
      pushConfigured: true,
      features: { ...DEFAULT_PLANS.cathedral_enterprise.featureFlags },
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    this.orgs.set(testOrgId, primaryOrg);

    const primaryLicense: SystemLicense = {
      id: 'c0000000-0000-4000-8000-000000000001',
      key: 'EKKLE-TEST-SANCTUARY-2026',
      tier: 'cathedral_enterprise',
      tenantId: testOrgId,
      organizationId: testOrgId,
      tenantName: primaryOrg.name,
      seatsLimit: 2500,
      sitesLimit: 15,
      monthlyCheckinsLimit: 100000,
      status: 'active',
      issuedDate: now.toISOString().slice(0, 10),
      expiresDate: oneYearOut,
      graceEndsDate: graceOut,
      billingCycle: 'annual',
      annualCostUSD: 1200,
      overrides: {},
      notes: 'Test suite anchor sanctuary license',
      enabledFeatures: enabledFeatureLabelsFromFlags(DEFAULT_PLANS.cathedral_enterprise.featureFlags),
    };
    this.licenses.set(primaryLicense.id, primaryLicense);

    const defaultSite: RegisteredSiteRecord = {
      id: testSiteId,
      organization_id: testOrgId,
      name: 'Test Campus Premise',
      address: 'Central Sanctuary, Accra, Ghana',
      lat: 5.6037,
      lng: -0.187,
      radius_m: 60,
      outer_radius_m: 300,
      dwell_min: 5,
      active: true,
      updated_at: now.toISOString(),
      updated_by: 'System Test Baseline',
    };
    this.sitesByOrg.set(testOrgId, [defaultSite]);
    this.premiseByOrg.set(testOrgId, {
      organizationId: testOrgId,
      churchName: 'Test Anchor Sanctuary',
      campusName: 'Test Campus Premise',
      campusAddress: 'Central Sanctuary, Accra, Ghana',
      lat: 5.6037,
      lng: -0.187,
      accuracyM: 5,
      innerGeofenceMeters: 60,
      outerGeofenceMeters: 300,
      dwellTimeMinutes: 5,
      updatedAt: now.toISOString(),
      updatedBy: 'System Test Baseline',
    });

    const defaultFlags: PlatformFeatureFlag[] = [
      {
        key: 'ble_beacon_radar',
        name: 'BLE Entrance Beacon Radar',
        description: 'Sub-10m sanctuary entrance Bluetooth Low Energy verification.',
        enabledGlobally: false,
        enabledTiers: ['ministry_pro', 'cathedral_enterprise'],
        organizationOverrides: {},
        updatedAt: now.toISOString(),
      },
      {
        key: 'sms_pastoral_alerts',
        name: 'Automated Pastoral SMS Care',
        description: 'Automated Hubtel/Arkesel SMS care tasks after consecutive absences.',
        enabledGlobally: false,
        enabledTiers: ['ministry_pro', 'cathedral_enterprise'],
        organizationOverrides: {},
        updatedAt: now.toISOString(),
      },
      {
        key: 'momo_giving_ledger',
        name: 'Mobile Money Giving Integration',
        description: 'MTN MoMo & Telecel Cash congregation giving pass.',
        enabledGlobally: false,
        enabledTiers: ['ministry_pro', 'cathedral_enterprise'],
        organizationOverrides: {},
        updatedAt: now.toISOString(),
      },
      {
        key: 'digital_member_qr',
        name: 'Digital Member QR Pass',
        description: 'Scannable member QR cards inside the mobile congregation portal.',
        enabledGlobally: true,
        enabledTiers: ['grace_starter', 'ministry_pro', 'cathedral_enterprise'],
        organizationOverrides: {},
        updatedAt: now.toISOString(),
      },
    ];
    for (const f of defaultFlags) {
      this.featureFlags.set(f.key, f);
    }

    // Seed Anchor Church member roster profiles (NO hardcoded passwords or credentials)
    const testProfiles: Array<{
      id: string;
      email: string;
      username: string;
      phone: string;
      role: ChurchRole;
      fullName: string;
    }> = [
      {
        id: 'user-admin-1',
        email: 'admin@ekklesphere.church',
        username: 'admin',
        phone: '+233241112233',
        role: 'admin',
        fullName: 'Church Administrator',
      },
      {
        id: 'user-pastor-1',
        email: 'pastor@ekklesphere.church',
        username: 'pastorkofi',
        phone: '+233242223344',
        role: 'pastor',
        fullName: 'Lead Pastor',
      },
      {
        id: 'user-usher-1',
        email: 'usher@ekklesphere.church',
        username: 'usherkwame',
        phone: '+233243334455',
        role: 'usher',
        fullName: 'Door Usher',
      },
      {
        id: 'm-elena',
        email: 'elena@ekklesphere.church',
        username: 'elenam',
        phone: '+233244445566',
        role: 'member',
        fullName: 'Elena Mends',
      },
    ];

    const memList: Record<string, any>[] = testProfiles.map((acc) => ({
      id: acc.id,
      tenantId: testOrgId,
      firstName: acc.fullName.split(' ')[0],
      lastName: acc.fullName.split(' ').slice(1).join(' ') || 'Member',
      email: acc.email,
      phoneE164: acc.phone,
      username: acc.username,
      role: acc.role,
      status: 'active',
      groupName: acc.role === 'usher' ? 'Ushering Ministry' : 'General Congregation',
      autoCheckinOptedIn: true,
      avatarInitials: acc.fullName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase(),
      joinedOn: now.toISOString().slice(0, 10),
      consecutiveAbsences: 0,
    }));
    this.membersByOrg.set(testOrgId, memList);
    primaryOrg.memberCount = memList.length;
  }

  // ===========================================================================
  // SUPABASE AUTH IDENTITY & MEMBERSHIP RESOLUTION (Phase 0 #1 & #4)
  // ===========================================================================

  public async verifySupabaseAccessToken(accessToken: string): Promise<AuthUserPayload | null> {
    const sb = this.activeSupabase;
    let sbUser: any = null;

    if (sb) {
      const { data, error } = await sb.auth.getUser(accessToken);
      if (error || !data?.user) {
        return null;
      }
      sbUser = data.user;
    } else if (!this.isTestRuntime && this.supabaseUrl && this.supabaseAuthKey) {
      try {
        const res = await fetch(`${this.supabaseUrl.replace(/\/+$/, '')}/auth/v1/user`, {
          method: 'GET',
          headers: {
            apikey: this.supabaseAuthKey,
            Authorization: `Bearer ${accessToken}`,
          },
        });
        if (!res.ok) return null;
        const payload = await res.json();
        if (!payload?.id) return null;
        sbUser = payload;
      } catch {
        return null;
      }
    } else {
      return null;
    }

    const email = (sbUser.email || '').toLowerCase();
    const avatar =
      (typeof sbUser.user_metadata?.avatar_url === 'string' && sbUser.user_metadata.avatar_url.trim()) ||
      (typeof sbUser.user_metadata?.picture === 'string' && sbUser.user_metadata.picture.trim()) ||
      undefined;
    let isCreator = Boolean(
      sbUser.app_metadata?.creator === true || sbUser.app_metadata?.is_super_admin === true
    );

    let credRow: Record<string, any> | null = null;
    if (sb) {
      const credOrFilters = [`auth_user_id.eq.${sbUser.id}`];
      if (email) credOrFilters.push(`email.ilike.${email}`);
      const { data: matchedCredRow } = await sb
        .from('account_credentials')
        .select('is_creator, role, status, organization_id')
        .or(credOrFilters.join(','))
        .limit(1)
        .maybeSingle();
      credRow = matchedCredRow || null;
    }

    if (credRow && credRow.status && credRow.status !== 'active') {
      return null;
    }
    if (
      !isCreator &&
      credRow &&
      (credRow.is_creator === true || credRow.role === 'creator' || credRow.role === 'super_admin')
    ) {
      isCreator = true;
    }

    // Resolve organization membership and church role strictly from database tables (public.members / public.users + public.user_roles)
    let resolvedOrgId =
      credRow?.organization_id && UUID_REGEX.test(String(credRow.organization_id))
        ? String(credRow.organization_id).toLowerCase()
        : '';
    let resolvedRole: ChurchRole = isCreator
      ? mapCredentialRoleToChurchRole(credRow?.role, true)
      : 'member';
    let resolvedName =
      (typeof sbUser.user_metadata?.full_name === 'string' && sbUser.user_metadata.full_name) ||
      (typeof sbUser.user_metadata?.name === 'string' && sbUser.user_metadata.name) ||
      email.split('@')[0] ||
      'Ekklesphere User';

    if (sb) {
      const { data: memberRow } = await sb
        .from('members')
        .select('id, organization_id, role, preferred_name, first_name, last_name')
        .or(`user_id.eq.${sbUser.id}${email ? `,email.ilike.${email}` : ''}`)
        .limit(1)
        .maybeSingle();

      if (memberRow) {
        if (memberRow.organization_id) {
          resolvedOrgId = String(memberRow.organization_id).toLowerCase();
        }
        if (!isCreator) {
          resolvedRole = mapSupabaseRoleToChurchRole(memberRow.role);
        }
        const dbName =
          memberRow.preferred_name ||
          `${memberRow.first_name || ''} ${memberRow.last_name || ''}`.trim();
        if (dbName) resolvedName = dbName;
      } else {
        // Fall back to public.users (linked via auth_user_id) + public.user_roles
        const usersLookup = await this.lookupUserAndRolesByAuthId(sb, sbUser.id);
        if (usersLookup) {
          if (usersLookup.organizationId) {
            resolvedOrgId = usersLookup.organizationId;
          }
          if (!isCreator && usersLookup.role) {
            resolvedRole = usersLookup.role;
          }
        }
      }
    } else {
      const fallbackMembership = await this.lookupMemberRoleInStore(sbUser.id, email);
      if (fallbackMembership.organizationId) resolvedOrgId = fallbackMembership.organizationId;
      if (!isCreator && fallbackMembership.role) resolvedRole = fallbackMembership.role;
      if (fallbackMembership.name) resolvedName = fallbackMembership.name;
    }

    if (!isCreator && resolvedOrgId) {
      const org = await this.getOrganisationById(resolvedOrgId);
      if (org && (org.status === 'suspended' || org.status === 'archived')) {
        return null;
      }
    }

    if (!resolvedOrgId) {
      const orgs = await this.listOrganisations();
      resolvedOrgId = orgs[0]?.id || '';
    }

    return {
      id: sbUser.id,
      email,
      role: resolvedRole,
      organization_id: resolvedOrgId,
      tenant_id: resolvedOrgId,
      campus_id: undefined,
      name: resolvedName,
      avatar,
      is_creator: isCreator,
      auth_provider: 'supabase',
    };
  }

  private async lookupUserAndRolesByAuthId(
    sb: SupabaseClient,
    authUserId: string
  ): Promise<{ organizationId: string; role: ChurchRole } | null> {
    if (!UUID_REGEX.test(authUserId)) return null;
    try {
      const { data: userRow, error: userErr } = await sb
        .from('users')
        .select('id, tenant_id, status')
        .eq('auth_user_id', authUserId)
        .limit(1)
        .maybeSingle();

      if (userErr || !userRow || (userRow.status && userRow.status !== 'active')) {
        return null;
      }

      const orgId = userRow.tenant_id ? String(userRow.tenant_id).toLowerCase() : '';
      let resolvedRole: ChurchRole = 'member';

      const { data: roleRows } = await sb
        .from('user_roles')
        .select('role')
        .eq('user_id', userRow.id);

      if (Array.isArray(roleRows) && roleRows.length > 0) {
        const priority: ChurchRole[] = ['admin', 'pastor', 'finance', 'usher', 'group_leader', 'member'];
        const mapped = roleRows.map((r) => mapSupabaseRoleToChurchRole(r.role));
        for (const candidate of priority) {
          if (mapped.includes(candidate)) {
            resolvedRole = candidate;
            break;
          }
        }
      }

      return { organizationId: orgId, role: resolvedRole };
    } catch {
      return null;
    }
  }

  public async lookupMemberRoleInStore(
    userId: string,
    email: string
  ): Promise<{ organizationId: string; role: ChurchRole; name?: string }> {
    const cleanEmail = (email || '').trim().toLowerCase();
    const sb = this.activeSupabase;

    if (sb) {
      const { data: row } = await sb
        .from('members')
        .select('organization_id, role, preferred_name, first_name, last_name')
        .or(
          UUID_REGEX.test(userId)
            ? `user_id.eq.${userId}${cleanEmail ? `,email.ilike.${cleanEmail}` : ''}`
            : `email.ilike.${cleanEmail}`
        )
        .limit(1)
        .maybeSingle();

      if (row) {
        return {
          organizationId: String(row.organization_id || '').toLowerCase(),
          role: mapSupabaseRoleToChurchRole(row.role),
          name:
            row.preferred_name ||
            `${row.first_name || ''} ${row.last_name || ''}`.trim() ||
            undefined,
        };
      }

      if (UUID_REGEX.test(userId)) {
        const usersLookup = await this.lookupUserAndRolesByAuthId(sb, userId);
        if (usersLookup) {
          return {
            organizationId: usersLookup.organizationId,
            role: usersLookup.role,
          };
        }
      }
    }

    for (const [orgId, members] of this.membersByOrg.entries()) {
      const found = members.find(
        (m) =>
          m.id === userId ||
          (cleanEmail && String(m.email || '').toLowerCase() === cleanEmail)
      );
      if (found) {
        return {
          organizationId: orgId,
          role: mapSupabaseRoleToChurchRole(found.role),
          name: `${found.firstName || ''} ${found.lastName || ''}`.trim() || undefined,
        };
      }
    }

    const orgs = await this.listOrganisations();
    return {
      organizationId: orgs[0]?.id || '',
      role: 'member',
    };
  }

  private async recordAuthAuditEvent(params: {
    organizationId?: string | null;
    accountId?: string | null;
    identifier: string;
    eventType:
      | 'login_success'
      | 'login_failed'
      | 'login_locked'
      | 'login_rate_limited'
      | 'register_success'
      | 'register_rejected'
      | 'token_exchanged'
      | 'logout'
      | 'account_auto_provisioned'
      | 'password_changed'
      | 'member_profile_updated';
    ipAddress?: string;
    success: boolean;
    reason?: string;
  }): Promise<void> {
    const identifierHash = createHash('sha256')
      .update(params.identifier.trim().toLowerCase() || 'anonymous')
      .digest('hex')
      .slice(0, 24);

    const hashedIp = params.ipAddress
      ? `ip:${createHash('sha256').update(params.ipAddress.trim()).digest('hex').slice(0, 16)}`
      : null;

    if (this.supabase) {
      await this.supabase
        .from('auth_audit_events')
        .insert({
          organization_id:
            params.organizationId && UUID_REGEX.test(params.organizationId)
              ? params.organizationId.toLowerCase()
              : null,
          account_id:
            params.accountId && UUID_REGEX.test(params.accountId) ? params.accountId : null,
          identifier_hash: identifierHash,
          event_type: params.eventType,
          ip_address: hashedIp,
          success: params.success,
          reason: params.reason || null,
        })
        .then(undefined, () => {});
    }
  }

  private async consumeDistributedAuthRateLimit(
    rateKey: string,
    maxAttempts: number,
    windowSeconds: number,
    lockoutSeconds: number
  ): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
    if (!this.supabase) {
      return { allowed: true, retryAfterSeconds: 0 };
    }
    try {
      const { data, error } = await this.supabase.rpc('consume_auth_rate_limit', {
        p_rate_key: rateKey,
        p_max_attempts: maxAttempts,
        p_window_seconds: windowSeconds,
        p_lockout_seconds: lockoutSeconds,
      });
      if (error || !Array.isArray(data) || data.length === 0) {
        return { allowed: true, retryAfterSeconds: 0 };
      }
      const row = data[0] as { allowed?: boolean; retry_after_seconds?: number };
      return {
        allowed: row.allowed !== false,
        retryAfterSeconds: Number(row.retry_after_seconds || 0),
      };
    } catch {
      return { allowed: true, retryAfterSeconds: 0 };
    }
  }

  private async resetDistributedAuthRateLimit(rateKey: string): Promise<void> {
    if (!this.supabase) return;
    try {
      await this.supabase.rpc('reset_auth_rate_limit', { p_rate_key: rateKey });
    } catch {
      // Ignore if RPC is not yet deployed in Supabase
    }
  }

  public getGenericOnboardingPassword(): string {
    const configured = (process.env.MEMBER_DEFAULT_ONBOARDING_PASSWORD || '').trim();
    if (configured.length >= 8) {
      return configured;
    }
    return DEFAULT_MEMBER_ONBOARDING_PASSWORD;
  }

  private async syncUserToSupabaseAuth(params: {
    existingAuthUserId?: string | null;
    email?: string;
    phoneE164?: string;
    password?: string;
    fullName: string;
    organizationId?: string;
    role: ChurchRole;
    isCreator?: boolean;
    memberId?: string;
  }): Promise<string | null> {
    const sb = this.activeSupabase;
    if (!sb || !sb.auth?.admin) return null;

    const cleanEmail = params.email ? params.email.trim().toLowerCase() : '';
    const cleanPhone = params.phoneE164 ? normalizePhone(params.phoneE164) : '';
    const digitsOnly = cleanPhone.replace(/\D/g, '');
    const authEmail = cleanEmail || (digitsOnly ? `phone-${digitsOnly}@members.ekklesphere.local` : '');

    if (!authEmail) return null;

    const userMetadata: Record<string, unknown> = {
      full_name: params.fullName,
      role: params.role,
      ...(params.organizationId ? { organization_id: params.organizationId } : {}),
      ...(cleanPhone ? { phone_e164: cleanPhone } : {}),
      ...(params.memberId ? { member_id: params.memberId } : {}),
    };
    const appMetadata: Record<string, unknown> = {
      role: params.role,
      ...(params.organizationId ? { organization_id: params.organizationId } : {}),
      creator: Boolean(params.isCreator),
      is_super_admin: Boolean(params.isCreator),
    };

    let authUserId =
      params.existingAuthUserId && UUID_REGEX.test(params.existingAuthUserId)
        ? params.existingAuthUserId
        : null;

    if (!authUserId && params.memberId && UUID_REGEX.test(params.memberId)) {
      const { data: memberRow } = await sb
        .from('members')
        .select('user_id')
        .eq('id', params.memberId)
        .maybeSingle();
      if (memberRow?.user_id && UUID_REGEX.test(String(memberRow.user_id))) {
        authUserId = String(memberRow.user_id);
      }
    }

    if (authUserId) {
      const { data: updatedData, error: updateErr } = await sb.auth.admin.updateUserById(
        authUserId,
        {
          email: authEmail,
          ...(params.password ? { password: params.password } : {}),
          email_confirm: true,
          user_metadata: userMetadata,
          app_metadata: appMetadata,
        }
      );
      if (!updateErr && updatedData?.user?.id) {
        authUserId = updatedData.user.id;
      } else if (updateErr && /not found|404/i.test(updateErr.message || '')) {
        authUserId = null;
      } else if (updateErr) {
        console.warn('[Ekklesphere Auth Sync] updateUserById warning:', updateErr.message);
      }
    }

    if (!authUserId) {
      let createRes = await sb.auth.admin.createUser({
        email: authEmail,
        ...(params.password ? { password: params.password } : {}),
        ...(cleanPhone ? { phone: cleanPhone, phone_confirm: true } : {}),
        email_confirm: true,
        user_metadata: userMetadata,
        app_metadata: appMetadata,
      });

      if (createRes.error && cleanPhone && /phone/i.test(createRes.error.message || '')) {
        createRes = await sb.auth.admin.createUser({
          email: authEmail,
          ...(params.password ? { password: params.password } : {}),
          email_confirm: true,
          user_metadata: userMetadata,
          app_metadata: appMetadata,
        });
      }

      if (!createRes.error && createRes.data?.user?.id) {
        authUserId = createRes.data.user.id;
      } else if (
        createRes.error &&
        /already|exists|registered|duplicate/i.test(createRes.error.message || '')
      ) {
        const listRes = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const matchedUser = listRes.data?.users?.find(
          (u) =>
            (u.email && u.email.toLowerCase() === authEmail) ||
            (cleanPhone && u.phone && normalizePhone(u.phone) === cleanPhone)
        );
        if (matchedUser?.id) {
          authUserId = matchedUser.id;
          await sb.auth.admin.updateUserById(authUserId, {
            email: authEmail,
            ...(params.password ? { password: params.password } : {}),
            email_confirm: true,
            user_metadata: userMetadata,
            app_metadata: appMetadata,
          });
        }
      } else if (createRes.error) {
        throw new Error(`Failed to sync user credential to Supabase Auth: ${createRes.error.message}`);
      }
    }

    if (authUserId && params.memberId && UUID_REGEX.test(params.memberId)) {
      const { error: linkErr } = await sb
        .from('members')
        .update({ user_id: authUserId, updated_at: new Date().toISOString() })
        .eq('id', params.memberId);
      if (linkErr) {
        console.warn('[Ekklesphere Auth Sync] Failed to link members.user_id:', linkErr.message);
      }
    }

    return authUserId;
  }

  private async resolveAuthEmailForCredential(cred: {
    authUserId?: string;
    email?: string;
    phoneE164?: string;
  }): Promise<string> {
    const sb = this.activeSupabase;
    if (sb && cred.authUserId && UUID_REGEX.test(cred.authUserId) && sb.auth?.admin?.getUserById) {
      try {
        const { data } = await sb.auth.admin.getUserById(cred.authUserId);
        if (data?.user?.email) {
          return data.user.email.trim().toLowerCase();
        }
      } catch {
        // Fallback to credential email/phone derivative
      }
    }
    const cleanEmail = cred.email ? cred.email.trim().toLowerCase() : '';
    if (cleanEmail) return cleanEmail;
    const digitsOnly = (cred.phoneE164 || '').replace(/\D/g, '');
    return digitsOnly ? `phone-${digitsOnly}@members.ekklesphere.local` : '';
  }

  private async verifyPasswordViaSupabaseAuth(
    authEmail: string,
    password: string
  ): Promise<{ matched: boolean; authUserId?: string }> {
    const cleanEmail = (authEmail || '').trim().toLowerCase();
    if (!cleanEmail || !password) return { matched: false };

    if (this.customSupabaseAuthVerifier) {
      return this.customSupabaseAuthVerifier(cleanEmail, password);
    }

    if (!this.supabaseUrl || !this.supabaseAuthKey) {
      return { matched: false };
    }

    try {
      const verifierClient = createClient(this.supabaseUrl, this.supabaseAuthKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      });
      const { data, error } = await verifierClient.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });
      if (!error && data?.user?.id) {
        return { matched: true, authUserId: data.user.id };
      }
      return { matched: false };
    } catch {
      return { matched: false };
    }
  }

  private async upsertAccountCredentialsRow(
    sb: SupabaseClient,
    payload: Record<string, unknown>,
    legacyHashFallback?: { hash: string; salt: string }
  ): Promise<void> {
    const { error: firstErr } = await sb
      .from('account_credentials')
      .upsert(payload, { onConflict: 'id' });

    if (!firstErr) return;

    // Fallback 1: If pre-migration DB still enforces NOT NULL on password_hash/password_salt
    if (
      /null value in column "password_(?:hash|salt)"|23502/i.test(firstErr.message || '') &&
      legacyHashFallback
    ) {
      const withHashes = {
        ...payload,
        password_hash: legacyHashFallback.hash,
        password_salt: legacyHashFallback.salt,
      };
      const retry = await sb
        .from('account_credentials')
        .upsert(withHashes, { onConflict: 'id' });
      if (!retry.error) return;
    }

    // Fallback 2: If newer optional columns are missing from schema cache
    if (
      /column .* does not exist|Could not find the '[^']+' column|schema cache/i.test(
        firstErr.message || ''
      )
    ) {
      const stripped = { ...payload };
      if (
        /temp_password_encrypted/i.test(firstErr.message || '') &&
        !/must_change_password|password_updated_at/i.test(firstErr.message || '')
      ) {
        delete stripped.temp_password_encrypted;
      } else {
        delete stripped.must_change_password;
        delete stripped.password_updated_at;
        delete stripped.temp_password_encrypted;
      }
      const retry = await sb
        .from('account_credentials')
        .upsert(stripped, { onConflict: 'id' });
      if (!retry.error) return;
      if (
        /null value in column "password_(?:hash|salt)"|23502/i.test(retry.error.message || '') &&
        legacyHashFallback
      ) {
        const retryWithHashes = await sb
          .from('account_credentials')
          .upsert(
            {
              ...stripped,
              password_hash: legacyHashFallback.hash,
              password_salt: legacyHashFallback.salt,
            },
            { onConflict: 'id' }
          );
        if (!retryWithHashes.error) return;
        throw new Error(`Failed to persist account credentials in Supabase: ${retryWithHashes.error.message}`);
      }
      throw new Error(`Failed to persist account credentials in Supabase: ${retry.error.message}`);
    }

    throw new Error(`Failed to persist account credentials in Supabase: ${firstErr.message}`);
  }

  private async scrubLegacyPasswordHashes(credId: string, authUserId?: string): Promise<void> {
    const sb = this.activeSupabase;
    if (!sb || !this.canVerifyViaSupabaseAuth) return;
    try {
      const patch: Record<string, unknown> = {
        password_hash: null,
        password_salt: null,
        updated_at: new Date().toISOString(),
        ...(authUserId ? { auth_user_id: authUserId } : {}),
      };
      await sb.from('account_credentials').update(patch).eq('id', credId);
    } catch {
      // Ignore if pre-migration NOT NULL constraint still exists until migration runs
    }
  }

  public async provisionCredentialRecord(params: {
    id?: string;
    memberId?: string;
    organizationId: string;
    email?: string;
    username?: string;
    phoneE164?: string;
    name: string;
    role: ChurchRole;
    isCreator?: boolean;
    password: string;
    mustChangePassword?: boolean;
    passwordUpdatedAt?: string | null;
  }): Promise<UserCredentialRecord> {
    this.assertDatabaseAvailable();

    const { hash, salt } = hashPassword(params.password);
    const requestedId = params.id || randomUUID();
    const normalizedEmail = params.email ? params.email.trim().toLowerCase() : undefined;
    const normalizedUsername = params.username ? params.username.trim().toLowerCase() : undefined;
    const normalizedPhone = params.phoneE164 ? normalizePhone(params.phoneE164) : undefined;
    const cleanOrgId = params.organizationId ? params.organizationId.toLowerCase() : '';
    const fullName = params.name.trim() || 'Ekklesphere User';

    const sb = this.activeSupabase;
    if (sb) {
      let resolvedId = UUID_REGEX.test(requestedId) ? requestedId : toDeterministicUuid(requestedId);
      let existingAuthUserId: string | null = null;

      const lookupFilters: string[] = [`id.eq.${resolvedId}`];
      if (normalizedEmail) lookupFilters.push(`email.ilike.${normalizedEmail}`);
      if (normalizedUsername) lookupFilters.push(`username.ilike.${normalizedUsername}`);
      if (normalizedPhone) lookupFilters.push(`phone_e164.eq.${normalizedPhone}`);

      const { data: existingRow } = await sb
        .from('account_credentials')
        .select('id, auth_user_id')
        .or(lookupFilters.join(','))
        .limit(1)
        .maybeSingle();

      if (existingRow?.id) {
        resolvedId = String(existingRow.id);
        existingAuthUserId = existingRow.auth_user_id ? String(existingRow.auth_user_id) : null;
      }

      const authUserId = await this.syncUserToSupabaseAuth({
        existingAuthUserId,
        email: normalizedEmail,
        phoneE164: normalizedPhone,
        password: params.password,
        fullName,
        organizationId: cleanOrgId && UUID_REGEX.test(cleanOrgId) ? cleanOrgId : undefined,
        role: params.role,
        isCreator: Boolean(params.isCreator),
        memberId: params.memberId && UUID_REGEX.test(params.memberId) ? params.memberId : undefined,
      });

      const omitStoredHashes = Boolean(authUserId && this.canVerifyViaSupabaseAuth);
      const isTempPassword = Boolean(params.mustChangePassword) && !params.isCreator;
      const sealedTempPassword = isTempPassword ? sealTemporaryPassword(params.password) : null;
      const payload: Record<string, unknown> = {
        id: resolvedId,
        member_id: params.memberId && UUID_REGEX.test(params.memberId) ? params.memberId : null,
        organization_id: cleanOrgId && UUID_REGEX.test(cleanOrgId) ? cleanOrgId : null,
        email: normalizedEmail || null,
        username: normalizedUsername || null,
        phone_e164: normalizedPhone || null,
        full_name: fullName,
        role: params.role,
        is_creator: Boolean(params.isCreator),
        // Passwords live in Supabase Auth (auth.users); keep hashes null once migrated
        password_hash: omitStoredHashes ? null : hash,
        password_salt: omitStoredHashes ? null : salt,
        status: 'active',
        failed_attempts: 0,
        locked_until: null,
        must_change_password: Boolean(params.mustChangePassword),
        password_updated_at: params.passwordUpdatedAt ?? null,
        temp_password_encrypted: sealedTempPassword,
        ...(authUserId ? { auth_user_id: authUserId } : {}),
      };

      await this.upsertAccountCredentialsRow(sb, payload, { hash, salt });
      if (isTempPassword) {
        this.tempPasswordByCredId.set(resolvedId, params.password);
      } else {
        this.tempPasswordByCredId.delete(resolvedId);
      }

      return {
        id: resolvedId,
        memberId: params.memberId,
        ...(authUserId ? { authUserId } : {}),
        organizationId: cleanOrgId,
        email: normalizedEmail,
        username: normalizedUsername,
        phoneE164: normalizedPhone,
        name: fullName,
        role: params.role,
        isCreator: Boolean(params.isCreator),
        passwordHash: authUserId ? '' : hash,
        passwordSalt: authUserId ? '' : salt,
        status: 'active',
        mustChangePassword: Boolean(params.mustChangePassword),
        ...(isTempPassword ? { temporaryPassword: params.password } : {}),
        passwordUpdatedAt: params.passwordUpdatedAt ?? null,
        failedAttempts: 0,
        lockedUntil: null,
        createdAt: new Date().toISOString(),
      };
    }

    const isTempPassword = Boolean(params.mustChangePassword) && !params.isCreator;
    const record: UserCredentialRecord = {
      id: requestedId,
      memberId: params.memberId,
      organizationId: cleanOrgId,
      email: normalizedEmail,
      username: normalizedUsername,
      phoneE164: normalizedPhone,
      name: fullName,
      role: params.role,
      isCreator: Boolean(params.isCreator),
      passwordHash: hash,
      passwordSalt: salt,
      status: 'active',
      mustChangePassword: Boolean(params.mustChangePassword),
      ...(isTempPassword ? { temporaryPassword: params.password } : {}),
      passwordUpdatedAt: params.passwordUpdatedAt ?? null,
      failedAttempts: 0,
      lockedUntil: null,
      createdAt: new Date().toISOString(),
    };

    for (const [existingKey, existing] of this.userCredentials.entries()) {
      const sameEmail = Boolean(record.email && existing.email && existing.email.toLowerCase() === record.email);
      const sameUsername = Boolean(
        record.username && existing.username && existing.username.toLowerCase() === record.username
      );
      const samePhone = Boolean(record.phoneE164 && existing.phoneE164 && existing.phoneE164 === record.phoneE164);
      if (existingKey === record.id || sameEmail || sameUsername || samePhone) {
        this.userCredentials.delete(existingKey);
        this.tempPasswordByCredId.delete(existingKey);
      }
    }
    this.userCredentials.set(record.id, record);
    if (isTempPassword) {
      this.tempPasswordByCredId.set(record.id, params.password);
    } else {
      this.tempPasswordByCredId.delete(record.id);
    }
    return record;
  }

  private async findCredentialByContactOrMember(params: {
    memberId?: string;
    email?: string;
    phoneE164?: string;
  }): Promise<UserCredentialRecord | undefined> {
    this.assertDatabaseAvailable();
    const cleanEmail = params.email ? params.email.trim().toLowerCase() : '';
    const cleanPhone = params.phoneE164 ? normalizePhone(params.phoneE164) : '';
    const cleanMemberId = params.memberId ? params.memberId.trim() : '';
    const sb = this.activeSupabase;

    if (sb) {
      const orFilters: string[] = [];
      if (cleanMemberId && UUID_REGEX.test(cleanMemberId)) {
        orFilters.push(
          `id.eq.${cleanMemberId}`,
          `member_id.eq.${cleanMemberId}`,
          `auth_user_id.eq.${cleanMemberId}`
        );
      }
      if (cleanEmail) {
        orFilters.push(`email.ilike.${cleanEmail}`);
      }
      if (cleanPhone) {
        orFilters.push(`phone_e164.eq.${cleanPhone}`);
      }
      if (orFilters.length > 0) {
        const { data: row, error } = await sb
          .from('account_credentials')
          .select('*')
          .or(orFilters.join(','))
          .limit(1)
          .maybeSingle();

        if (error) {
          throw new Error(`Failed to query account credentials in Supabase: ${error.message}`);
        }

        if (row && (row.auth_user_id || (row.password_hash && row.password_salt))) {
          const isCreator = Boolean(
            row.is_creator || row.role === 'creator' || row.role === 'super_admin'
          );
          return {
            id: String(row.id),
            memberId: row.member_id ? String(row.member_id) : undefined,
            authUserId: row.auth_user_id ? String(row.auth_user_id) : undefined,
            organizationId: String(row.organization_id || '').toLowerCase(),
            email: row.email ? String(row.email).toLowerCase() : undefined,
            username: row.username ? String(row.username).toLowerCase() : undefined,
            phoneE164: row.phone_e164 ? String(row.phone_e164) : undefined,
            name: String(row.full_name || 'Member'),
            role: mapCredentialRoleToChurchRole(row.role, isCreator),
            isCreator,
            passwordHash: row.password_hash ? String(row.password_hash) : '',
            passwordSalt: row.password_salt ? String(row.password_salt) : '',
            status: (row.status as UserCredentialRecord['status']) || 'active',
            mustChangePassword: Boolean(row.must_change_password),
            passwordUpdatedAt: row.password_updated_at ? String(row.password_updated_at) : null,
            failedAttempts: Number(row.failed_attempts || 0),
            lockedUntil: row.locked_until ? String(row.locked_until) : null,
            createdAt: row.created_at ? String(row.created_at) : undefined,
          };
        }
      }
      return undefined;
    }

    for (const cred of this.userCredentials.values()) {
      if (cleanMemberId && (cred.memberId === cleanMemberId || cred.id === cleanMemberId)) {
        return cred;
      }
      if (cleanEmail && cred.email && cred.email.toLowerCase() === cleanEmail) {
        return cred;
      }
      if (cleanPhone && cred.phoneE164 && cred.phoneE164 === cleanPhone) {
        return cred;
      }
    }

    return undefined;
  }

  public async autoProvisionMemberCredentials(params: {
    organizationId: string;
    memberId: string;
    firstName: string;
    lastName: string;
    email?: string | null;
    phoneE164?: string | null;
    initialPassword?: string;
  }): Promise<OnboardingCredentialResult> {
    const cleanEmail = params.email ? String(params.email).trim().toLowerCase() : '';
    const cleanPhone = params.phoneE164 ? normalizePhone(String(params.phoneE164)) : '';
    const identifiers = [cleanEmail, cleanPhone].filter(Boolean);

    if (identifiers.length === 0) {
      return {
        provisioned: false,
        status: 'skipped_no_contact',
        identifiers: [],
        mustChangePassword: false,
      };
    }

    const existing = await this.findCredentialByContactOrMember({
      memberId: params.memberId,
      email: cleanEmail || undefined,
      phoneE164: cleanPhone || undefined,
    });

    if (existing) {
      return {
        provisioned: false,
        status: 'already_exists',
        identifiers,
        mustChangePassword: Boolean(existing.mustChangePassword),
      };
    }

    const temporaryPassword =
      params.initialPassword && params.initialPassword.trim().length >= 8
        ? params.initialPassword.trim()
        : this.getGenericOnboardingPassword();
    const fullName = `${params.firstName || ''} ${params.lastName || ''}`.trim() || 'Congregation Member';
    const credId = UUID_REGEX.test(params.memberId) ? params.memberId : randomUUID();

    try {
      const createdCred = await this.provisionCredentialRecord({
        id: credId,
        memberId: params.memberId,
        organizationId: params.organizationId,
        email: cleanEmail || undefined,
        phoneE164: cleanPhone || undefined,
        name: fullName,
        role: 'member',
        isCreator: false,
        password: temporaryPassword,
        mustChangePassword: true,
        passwordUpdatedAt: null,
      });

      await this.recordAuthAuditEvent({
        organizationId: params.organizationId,
        accountId: createdCred.id,
        identifier: cleanEmail || cleanPhone || params.memberId,
        eventType: 'account_auto_provisioned',
        success: true,
        reason: 'member_onboarding_generic_password',
      });

      return {
        provisioned: true,
        status: 'created',
        identifiers,
        temporaryPassword,
        mustChangePassword: true,
      };
    } catch (err: any) {
      // Handle rare concurrent duplicate insert gracefully without failing member onboarding
      if (/duplicate|unique|23505/i.test(String(err?.message || ''))) {
        return {
          provisioned: false,
          status: 'already_exists',
          identifiers,
          mustChangePassword: false,
        };
      }
      throw err;
    }
  }

  public async getCredentialStatus(
    userId: string,
    email?: string
  ): Promise<{
    hasPasswordCredential: boolean;
    mustChangePassword: boolean;
    passwordUpdatedAt: string | null;
  }> {
    const matched = await this.findCredentialByContactOrMember({
      memberId: userId,
      email: email || undefined,
    });
    if (!matched) {
      return {
        hasPasswordCredential: false,
        mustChangePassword: false,
        passwordUpdatedAt: null,
      };
    }
    return {
      hasPasswordCredential: true,
      mustChangePassword: Boolean(matched.mustChangePassword),
      passwordUpdatedAt: matched.passwordUpdatedAt ?? null,
    };
  }

  public async changePasswordForUser(params: {
    userId: string;
    email?: string;
    currentPassword: string;
    newPassword: string;
    ipAddress?: string;
  }): Promise<{
    success: true;
    mustChangePassword: false;
    passwordUpdatedAt: string;
  }> {
    const currentPassword = (params.currentPassword || '').trim();
    const newPassword = (params.newPassword || '').trim();

    if (!currentPassword) {
      const err: any = new Error('Current password is required.');
      err.code = 'INVALID_CURRENT_PASSWORD';
      err.status = 400;
      throw err;
    }

    if (newPassword.length < 8) {
      const err: any = new Error('New password must be at least 8 characters long.');
      err.code = 'WEAK_PASSWORD';
      err.status = 400;
      throw err;
    }

    const cred = await this.findCredentialByContactOrMember({
      memberId: params.userId,
      email: params.email || undefined,
    });

    if (!cred) {
      const err: any = new Error('No password-based account credentials found for your session.');
      err.code = 'CREDENTIAL_NOT_FOUND';
      err.status = 404;
      throw err;
    }

    const sb = this.activeSupabase;
    let currentPasswordMatches = false;
    if (sb) {
      const authEmail = await this.resolveAuthEmailForCredential(cred);
      if (authEmail) {
        const sbVerify = await this.verifyPasswordViaSupabaseAuth(authEmail, currentPassword);
        currentPasswordMatches = sbVerify.matched;
      }
      if (!currentPasswordMatches && cred.passwordHash && cred.passwordSalt) {
        currentPasswordMatches = verifyPassword(currentPassword, cred.passwordHash, cred.passwordSalt);
      }
    } else {
      currentPasswordMatches = verifyPassword(currentPassword, cred.passwordHash, cred.passwordSalt);
    }

    if (!currentPasswordMatches) {
      await this.recordAuthAuditEvent({
        organizationId: cred.organizationId,
        accountId: cred.id,
        identifier: cred.email || cred.phoneE164 || cred.id,
        eventType: 'password_changed',
        ipAddress: params.ipAddress,
        success: false,
        reason: 'current_password_mismatch',
      });
      const err: any = new Error('Current password is incorrect.');
      err.code = 'INVALID_CURRENT_PASSWORD';
      err.status = 401;
      throw err;
    }

    if (newPassword === currentPassword) {
      const err: any = new Error('Please choose a new password that differs from your current password.');
      err.code = 'PASSWORD_UNCHANGED';
      err.status = 400;
      throw err;
    }

    const nowIso = new Date().toISOString();

    if (sb) {
      const syncedAuthUserId = await this.syncUserToSupabaseAuth({
        existingAuthUserId: cred.authUserId,
        email: cred.email,
        phoneE164: cred.phoneE164,
        password: newPassword,
        fullName: cred.name,
        organizationId: cred.organizationId || undefined,
        role: cred.role,
        isCreator: cred.isCreator,
        memberId: cred.memberId,
      });

      const fallbackHashes = hashPassword(newPassword);
      const omitStoredHashes = Boolean(syncedAuthUserId && this.canVerifyViaSupabaseAuth);
      const baseUpdate: Record<string, unknown> = {
        id: cred.id,
        password_hash: omitStoredHashes ? null : fallbackHashes.hash,
        password_salt: omitStoredHashes ? null : fallbackHashes.salt,
        failed_attempts: 0,
        locked_until: null,
        updated_at: nowIso,
        must_change_password: false,
        password_updated_at: nowIso,
        temp_password_encrypted: null,
        ...(syncedAuthUserId ? { auth_user_id: syncedAuthUserId } : {}),
      };

      const { error: updateErr } = await sb
        .from('account_credentials')
        .update(baseUpdate)
        .eq('id', cred.id);

      if (
        updateErr &&
        /null value in column "password_(?:hash|salt)"|23502/i.test(updateErr.message || '')
      ) {
        const retry = await sb
          .from('account_credentials')
          .update({
            ...baseUpdate,
            password_hash: fallbackHashes.hash,
            password_salt: fallbackHashes.salt,
          })
          .eq('id', cred.id);
        if (retry.error) {
          throw new Error(`Failed to update password in Supabase: ${retry.error.message}`);
        }
      } else if (
        updateErr &&
        /column .* does not exist|Could not find the '[^']+' column|schema cache/i.test(
          updateErr.message || ''
        )
      ) {
        const stripped = { ...baseUpdate };
        if (
          /temp_password_encrypted/i.test(updateErr.message || '') &&
          !/must_change_password|password_updated_at/i.test(updateErr.message || '')
        ) {
          delete stripped.temp_password_encrypted;
        } else {
          delete stripped.must_change_password;
          delete stripped.password_updated_at;
          delete stripped.temp_password_encrypted;
        }
        const retry = await sb
          .from('account_credentials')
          .update(stripped)
          .eq('id', cred.id);
        if (retry.error) {
          throw new Error(`Failed to update password in Supabase: ${retry.error.message}`);
        }
      } else if (updateErr) {
        throw new Error(`Failed to update password in Supabase: ${updateErr.message}`);
      }
    } else {
      const { hash, salt } = hashPassword(newPassword);
      cred.passwordHash = hash;
      cred.passwordSalt = salt;
      cred.mustChangePassword = false;
      cred.temporaryPassword = undefined;
      cred.passwordUpdatedAt = nowIso;
      cred.failedAttempts = 0;
      cred.lockedUntil = null;
      this.userCredentials.set(cred.id, cred);
    }

    this.tempPasswordByCredId.delete(cred.id);
    await this.resetDistributedAuthRateLimit(`login:${cred.id}`);
    await this.recordAuthAuditEvent({
      organizationId: cred.organizationId,
      accountId: cred.id,
      identifier: cred.email || cred.phoneE164 || cred.id,
      eventType: 'password_changed',
      ipAddress: params.ipAddress,
      success: true,
    });

    return {
      success: true,
      mustChangePassword: false,
      passwordUpdatedAt: nowIso,
    };
  }

  public async listOrganisationAdminCredentials(organizationId: string): Promise<
    Array<{
      id: string;
      memberId?: string;
      organizationId: string;
      email?: string;
      username?: string;
      phoneE164?: string;
      fullName: string;
      role: ChurchRole;
      status: string;
      mustChangePassword: boolean;
      lockedUntil: string | null;
      lastLoginAt: string | null;
      createdAt?: string;
    }>
  > {
    this.assertDatabaseAvailable();
    const cleanOrgId = (organizationId || '').trim().toLowerCase();
    if (!cleanOrgId) return [];

    if (this.supabase) {
      if (!UUID_REGEX.test(cleanOrgId)) return [];
      const { data: rows, error } = await this.supabase
        .from('account_credentials')
        .select(
          'id, member_id, organization_id, email, username, phone_e164, full_name, role, is_creator, status, locked_until, last_login_at, created_at, must_change_password'
        )
        .eq('organization_id', cleanOrgId)
        .eq('is_creator', false)
        .in('role', ['owner', 'admin', 'pastor', 'super_admin'])
        .order('created_at', { ascending: true });

      if (error) {
        throw new Error(`Failed to load organisation admin credentials: ${error.message}`);
      }

      return (rows || []).map((row) => ({
        id: String(row.id),
        memberId: row.member_id ? String(row.member_id) : undefined,
        organizationId: cleanOrgId,
        email: row.email ? String(row.email).toLowerCase() : undefined,
        username: row.username ? String(row.username).toLowerCase() : undefined,
        phoneE164: row.phone_e164 ? String(row.phone_e164) : undefined,
        fullName: String(row.full_name || 'Church Administrator'),
        role: mapSupabaseRoleToChurchRole(row.role),
        status: String(row.status || 'active'),
        mustChangePassword: Boolean(row.must_change_password),
        lockedUntil: row.locked_until ? String(row.locked_until) : null,
        lastLoginAt: row.last_login_at ? String(row.last_login_at) : null,
        createdAt: row.created_at ? String(row.created_at) : undefined,
      }));
    }

    const result: Array<{
      id: string;
      memberId?: string;
      organizationId: string;
      email?: string;
      username?: string;
      phoneE164?: string;
      fullName: string;
      role: ChurchRole;
      status: string;
      mustChangePassword: boolean;
      lockedUntil: string | null;
      lastLoginAt: string | null;
      createdAt?: string;
    }> = [];

    for (const c of this.userCredentials.values()) {
      if (
        c.organizationId.toLowerCase() === cleanOrgId &&
        !c.isCreator &&
        ['admin', 'pastor', 'super_admin'].includes(c.role)
      ) {
        result.push({
          id: c.id,
          memberId: c.memberId,
          organizationId: c.organizationId,
          email: c.email,
          username: c.username,
          phoneE164: c.phoneE164,
          fullName: c.name,
          role: c.role,
          status: c.status,
          mustChangePassword: Boolean(c.mustChangePassword),
          lockedUntil: c.lockedUntil || null,
          lastLoginAt: null,
          createdAt: c.createdAt,
        });
      }
    }

    return result;
  }

  public async provisionOrganisationAdminCredentials(params: {
    organizationId: string;
    email?: string;
    username?: string;
    phone?: string;
    fullName: string;
    password: string;
    role?: 'admin' | 'pastor';
    requirePasswordChange?: boolean;
    ipAddress?: string;
  }): Promise<{
    credential: {
      id: string;
      memberId?: string;
      organizationId: string;
      email?: string;
      username?: string;
      phoneE164?: string;
      fullName: string;
      role: ChurchRole;
      status: string;
      mustChangePassword: boolean;
    };
    resetExisting: boolean;
    persistedInSupabase: boolean;
  }> {
    this.assertDatabaseAvailable();
    const cleanOrgId = (params.organizationId || '').trim().toLowerCase();
    const org = await this.getOrganisationById(cleanOrgId);
    if (!org) {
      const err: any = new Error('Target organisation not found.');
      err.code = 'NOT_FOUND';
      err.status = 404;
      throw err;
    }

    const email = params.email ? params.email.trim().toLowerCase() : '';
    const username = params.username ? params.username.trim().toLowerCase() : '';
    const phoneE164 = params.phone ? normalizePhone(params.phone) : '';
    const fullName = (params.fullName || '').trim() || org.contactName || `${org.name} Admin`;
    const password = (params.password || '').trim();
    const role: 'admin' | 'pastor' = params.role === 'pastor' ? 'pastor' : 'admin';

    if (!email && !phoneE164) {
      const err: any = new Error('An administrator email address or phone number is required.');
      err.code = 'INVALID_INPUT';
      err.status = 400;
      throw err;
    }
    if (password.length < 8) {
      const err: any = new Error('Password must be at least 8 characters long.');
      err.code = 'WEAK_PASSWORD';
      err.status = 400;
      throw err;
    }

    // 1. Check whether matching credential already exists (Supabase in live mode; memory only in tests)
    let matchingSameOrg: UserCredentialRecord | undefined;
    if (this.supabase) {
      const orFilters: string[] = [];
      if (email) orFilters.push(`email.ilike.${email}`);
      if (username) orFilters.push(`username.ilike.${username}`);
      if (phoneE164) orFilters.push(`phone_e164.eq.${phoneE164}`);
      if (orFilters.length > 0) {
        const { data: rows, error } = await this.supabase
          .from('account_credentials')
          .select('*')
          .or(orFilters.join(','))
          .limit(5);

        if (error) {
          throw new Error(`Failed to query account credentials in Supabase: ${error.message}`);
        }

        if (Array.isArray(rows) && rows.length > 0) {
          for (const row of rows) {
            const rowOrgId = String(row.organization_id || '').toLowerCase();
            if (row.is_creator || (rowOrgId && rowOrgId !== cleanOrgId)) {
              const err: any = new Error(
                'This email, username, or phone already belongs to another organisation or platform creator.'
              );
              err.code = 'DUPLICATE_CREDENTIAL';
              err.status = 409;
              throw err;
            }
          }
          const sameRow = rows[0];
          matchingSameOrg = {
            id: String(sameRow.id),
            memberId: sameRow.member_id ? String(sameRow.member_id) : undefined,
            organizationId: cleanOrgId,
            email: sameRow.email ? String(sameRow.email).toLowerCase() : undefined,
            username: sameRow.username ? String(sameRow.username).toLowerCase() : undefined,
            phoneE164: sameRow.phone_e164 ? String(sameRow.phone_e164) : undefined,
            name: String(sameRow.full_name || fullName),
            role: mapSupabaseRoleToChurchRole(sameRow.role),
            isCreator: false,
            passwordHash: String(sameRow.password_hash || ''),
            passwordSalt: String(sameRow.password_salt || ''),
            status: (sameRow.status as UserCredentialRecord['status']) || 'active',
          };
        }
      }
    } else {
      for (const c of this.userCredentials.values()) {
        const matches =
          (email && c.email && c.email.toLowerCase() === email) ||
          (username && c.username && c.username.toLowerCase() === username) ||
          (phoneE164 && c.phoneE164 && c.phoneE164 === phoneE164);
        if (matches) {
          if (c.isCreator || (c.organizationId && c.organizationId.toLowerCase() !== cleanOrgId)) {
            const err: any = new Error(
              'This email, username, or phone is already assigned to another account or platform creator.'
            );
            err.code = 'DUPLICATE_CREDENTIAL';
            err.status = 409;
            throw err;
          }
          matchingSameOrg = c;
          break;
        }
      }
    }

    // 2. Ensure a scoped members row exists for this org admin so role lookups stay aligned
    let targetMemberId = matchingSameOrg?.memberId;
    if (!targetMemberId) {
      const orgMembers = await this.getMembers(cleanOrgId);
      const matchedMember = orgMembers.find(
        (m) =>
          (email && String(m.email || '').toLowerCase() === email) ||
          (phoneE164 && normalizePhone(m.phoneE164 || m.phone) === phoneE164)
      );
      if (matchedMember) {
        targetMemberId = String(matchedMember.id);
        await this.updateMember(cleanOrgId, targetMemberId, {
          role,
          status: 'active',
          ...(email ? { email } : {}),
          ...(phoneE164 ? { phoneE164 } : {}),
        });
      } else {
        const nameParts = fullName.split(/\s+/).filter(Boolean);
        const firstName = nameParts[0] || 'Church';
        const lastName = nameParts.slice(1).join(' ') || 'Admin';
        const createdMember = await this.createMember(
          cleanOrgId,
          {
            firstName,
            lastName,
            email: email || undefined,
            phoneE164: phoneE164 || undefined,
            groupName: 'Church Leadership',
            autoCheckinOptedIn: false,
            role,
            status: 'active',
          },
          { skipAutoCredentials: true }
        );
        targetMemberId = String(createdMember.id);
      }
    }

    const credId = matchingSameOrg?.id || (UUID_REGEX.test(targetMemberId) ? targetMemberId : randomUUID());
    const nowIso = new Date().toISOString();

    const record = await this.provisionCredentialRecord({
      id: credId,
      memberId: targetMemberId,
      organizationId: cleanOrgId,
      email: email || undefined,
      username: username || undefined,
      phoneE164: phoneE164 || undefined,
      name: fullName,
      role,
      isCreator: false,
      password,
      mustChangePassword: Boolean(params.requirePasswordChange),
      passwordUpdatedAt: nowIso,
    });

    await this.resetDistributedAuthRateLimit(`login:${record.id}`);
    await this.recordAuthAuditEvent({
      organizationId: cleanOrgId,
      accountId: record.id,
      identifier: email || phoneE164 || username || record.id,
      eventType: matchingSameOrg ? 'password_changed' : 'account_auto_provisioned',
      ipAddress: params.ipAddress,
      success: true,
      reason: 'creator_provisioned_org_admin',
    });

    return {
      credential: {
        id: record.id,
        memberId: record.memberId,
        organizationId: cleanOrgId,
        email: record.email,
        username: record.username,
        phoneE164: record.phoneE164,
        fullName: record.name,
        role: record.role,
        status: record.status,
        mustChangePassword: Boolean(record.mustChangePassword),
      },
      resetExisting: Boolean(matchingSameOrg),
      persistedInSupabase: Boolean(this.supabase),
    };
  }

  public async upsertCreatorCredentials(params: {
    id?: string;
    email: string;
    username?: string;
    phone?: string;
    name?: string;
    password?: string;
    organizationId?: string;
  }): Promise<{
    user: {
      id: string;
      email: string;
      username?: string;
      phoneE164?: string;
      name: string;
      role: ChurchRole;
      organizationId: string;
      isCreator: boolean;
    };
    token: string;
    idleTimeoutMinutes: number;
    sessionExpiresAt: string;
    persistedInSupabase: boolean;
  }> {
    this.assertDatabaseAvailable();
    const email = (params.email || '').trim().toLowerCase();
    if (!email) {
      const err: any = new Error('Creator email is required.');
      err.code = 'INVALID_INPUT';
      err.status = 400;
      throw err;
    }

    const username = params.username ? params.username.trim().toLowerCase() : undefined;
    const phoneE164 = params.phone ? normalizePhone(params.phone) : undefined;
    const name = (params.name || '').trim() || 'Platform Creator';
    const orgId =
      params.organizationId && UUID_REGEX.test(params.organizationId.trim())
        ? params.organizationId.trim().toLowerCase()
        : '';

    let existingCred: UserCredentialRecord | undefined;
    let existingAuthUserId: string | null = null;

    const sb = this.activeSupabase;
    if (sb) {
      let row: Record<string, any> | null = null;
      if (params.id && UUID_REGEX.test(params.id)) {
        const byId = await sb
          .from('account_credentials')
          .select('*')
          .eq('id', params.id)
          .limit(1)
          .maybeSingle();
        row = byId.data;
      }
      if (!row) {
        const byEmail = await sb
          .from('account_credentials')
          .select('*')
          .ilike('email', email)
          .limit(1)
          .maybeSingle();
        row = byEmail.data;
      }
      if (row) {
        existingAuthUserId = row.auth_user_id ? String(row.auth_user_id) : null;
        existingCred = {
          id: String(row.id),
          authUserId: existingAuthUserId || undefined,
          organizationId: row.organization_id ? String(row.organization_id).toLowerCase() : '',
          email: row.email ? String(row.email).toLowerCase() : undefined,
          username: row.username ? String(row.username).toLowerCase() : undefined,
          phoneE164: row.phone_e164 ? String(row.phone_e164) : undefined,
          name: String(row.full_name || 'Platform Creator'),
          role: 'creator',
          isCreator: true,
          passwordHash: row.password_hash ? String(row.password_hash) : '',
          passwordSalt: row.password_salt ? String(row.password_salt) : '',
          status: (row.status as UserCredentialRecord['status']) || 'active',
        };
      }
    } else {
      for (const c of this.userCredentials.values()) {
        if (
          (params.id && c.id === params.id) ||
          (c.email && c.email.toLowerCase() === email)
        ) {
          existingCred = c;
          break;
        }
      }
    }

    const rawPassword = (params.password || '').trim();
    if (!existingCred && rawPassword.length < 8) {
      const err: any = new Error('Creator password must be at least 8 characters long.');
      err.code = 'WEAK_PASSWORD';
      err.status = 400;
      throw err;
    }
    if (rawPassword && rawPassword.length < 8) {
      const err: any = new Error('New password must be at least 8 characters long.');
      err.code = 'WEAK_PASSWORD';
      err.status = 400;
      throw err;
    }

    const { hash, salt } = rawPassword
      ? hashPassword(rawPassword)
      : { hash: existingCred?.passwordHash || '', salt: existingCred?.passwordSalt || '' };

    const credId = existingCred?.id || toDeterministicUuid(`creator:${email}`);
    const resolvedOrgId = orgId || existingCred?.organizationId || '';
    const resolvedUsername = username !== undefined ? username || undefined : existingCred?.username;
    const resolvedPhone = phoneE164 !== undefined ? phoneE164 || undefined : existingCred?.phoneE164;

    let persistedInSupabase = false;
    if (sb) {
      const authUserId = await this.syncUserToSupabaseAuth({
        existingAuthUserId,
        email,
        phoneE164: resolvedPhone,
        password: rawPassword || undefined,
        fullName: name,
        organizationId: resolvedOrgId && UUID_REGEX.test(resolvedOrgId) ? resolvedOrgId : undefined,
        role: 'creator',
        isCreator: true,
      });

      const omitStoredHashes = Boolean(authUserId && this.canVerifyViaSupabaseAuth);
      const baseCreatorRow: Record<string, unknown> = {
        id: UUID_REGEX.test(credId) ? credId : toDeterministicUuid(credId),
        organization_id: resolvedOrgId && UUID_REGEX.test(resolvedOrgId) ? resolvedOrgId : null,
        email,
        username: resolvedUsername || null,
        phone_e164: resolvedPhone || null,
        full_name: name,
        role: 'creator',
        is_creator: true,
        password_hash: omitStoredHashes ? null : hash,
        password_salt: omitStoredHashes ? null : salt,
        status: 'active',
        failed_attempts: 0,
        locked_until: null,
        ...(authUserId ? { auth_user_id: authUserId } : {}),
      };

      await this.upsertAccountCredentialsRow(sb, baseCreatorRow, hash && salt ? { hash, salt } : undefined);
      persistedInSupabase = true;
    } else {
      const updated: UserCredentialRecord = {
        id: credId,
        organizationId: resolvedOrgId,
        email,
        username: resolvedUsername,
        phoneE164: resolvedPhone,
        name,
        role: 'creator',
        isCreator: true,
        passwordHash: hash,
        passwordSalt: salt,
        status: 'active',
        failedAttempts: 0,
        lockedUntil: null,
        createdAt: existingCred?.createdAt || new Date().toISOString(),
      };
      this.userCredentials.set(credId, updated);
    }

    const sessionTimeoutMinutes = await this.getOrganizationSessionTimeoutMinutes(resolvedOrgId);
    const { token, idleTimeoutMinutes, expiresAt } = signSessionToken(
      {
        id: credId,
        email,
        role: 'creator',
        organization_id: resolvedOrgId,
        tenant_id: resolvedOrgId,
        name,
        is_creator: true,
      },
      sessionTimeoutMinutes
    );

    return {
      user: {
        id: credId,
        email,
        username: resolvedUsername,
        phoneE164: resolvedPhone,
        name,
        role: 'creator',
        organizationId: resolvedOrgId,
        isCreator: true,
      },
      token,
      idleTimeoutMinutes,
      sessionExpiresAt: expiresAt,
      persistedInSupabase,
    };
  }

  public async getCreatorProfileSummary(
    id: string,
    email?: string
  ): Promise<{
    id: string;
    email: string;
    username?: string;
    phoneE164?: string;
    name: string;
    organizationId: string;
    source: 'supabase' | 'env_or_memory';
    envSecretsConfigured: {
      email: boolean;
      password: boolean;
      username: boolean;
      phone: boolean;
      name: boolean;
      bootstrapSecret: boolean;
    };
  }> {
    this.assertDatabaseAvailable();
    const cleanEmail = (email || '').trim().toLowerCase();

    if (this.supabase) {
      let row: Record<string, any> | null = null;
      if (UUID_REGEX.test(id)) {
        const byId = await this.supabase
          .from('account_credentials')
          .select('id, organization_id, email, username, phone_e164, full_name, is_creator, role')
          .eq('id', id)
          .limit(1)
          .maybeSingle();
        row = byId.data;
      }
      if (!row && cleanEmail) {
        const byEmail = await this.supabase
          .from('account_credentials')
          .select('id, organization_id, email, username, phone_e164, full_name, is_creator, role')
          .ilike('email', cleanEmail)
          .limit(1)
          .maybeSingle();
        row = byEmail.data;
      }
      if (row) {
        return {
          id: String(row.id),
          email: String(row.email || cleanEmail),
          username: row.username ? String(row.username) : undefined,
          phoneE164: row.phone_e164 ? String(row.phone_e164) : undefined,
          name: String(row.full_name || 'Platform Creator'),
          organizationId: row.organization_id ? String(row.organization_id).toLowerCase() : '',
          source: 'supabase',
          envSecretsConfigured: {
            email: Boolean(process.env.CREATOR_EMAIL?.trim()),
            password: Boolean(process.env.CREATOR_PASSWORD?.trim()),
            username: Boolean(process.env.CREATOR_USERNAME?.trim()),
            phone: Boolean(process.env.CREATOR_PHONE?.trim()),
            name: Boolean(process.env.CREATOR_NAME?.trim()),
            bootstrapSecret: Boolean(process.env.CREATOR_BOOTSTRAP_SECRET?.trim()),
          },
        };
      }
    }

    let matched: UserCredentialRecord | undefined;
    if (!this.supabase) {
      matched = this.userCredentials.get(id);
      if (!matched) {
        for (const c of this.userCredentials.values()) {
          if (c.isCreator && cleanEmail && c.email?.toLowerCase() === cleanEmail) {
            matched = c;
            break;
          }
        }
      }
    }

    return {
      id: matched?.id || id,
      email: matched?.email || cleanEmail,
      username: matched?.username,
      phoneE164: matched?.phoneE164,
      name: matched?.name || process.env.CREATOR_NAME?.trim() || 'Platform Creator',
      organizationId: matched?.organizationId || '',
      source: 'env_or_memory',
      envSecretsConfigured: {
        email: Boolean(process.env.CREATOR_EMAIL?.trim()),
        password: Boolean(process.env.CREATOR_PASSWORD?.trim()),
        username: Boolean(process.env.CREATOR_USERNAME?.trim()),
        phone: Boolean(process.env.CREATOR_PHONE?.trim()),
        name: Boolean(process.env.CREATOR_NAME?.trim()),
        bootstrapSecret: Boolean(process.env.CREATOR_BOOTSTRAP_SECRET?.trim()),
      },
    };
  }

  public async authenticateWithCredentials(
    rawIdentifier: string,
    rawPassword?: string,
    ipAddress?: string
  ): Promise<{
    user: {
      id: string;
      email: string;
      username?: string;
      phoneE164?: string;
      name: string;
      designation?: string;
      role: ChurchRole;
      organizationId: string;
      isCreator: boolean;
      mustChangePassword: boolean;
    };
    organization: OrganizationRecord | null;
    token: string;
    idleTimeoutMinutes: number;
    sessionExpiresAt: string;
  }> {
    this.assertDatabaseAvailable();
    const identifier = (rawIdentifier || '').trim();
    const password = (rawPassword || '').trim();

    if (!identifier || !password) {
      const err: any = new Error('Identifier (email, phone, or username) and password are required.');
      err.code = 'INVALID_CREDENTIALS';
      err.status = 400;
      throw err;
    }

    const lowerId = identifier.toLowerCase();
    const normalizedPhone = normalizePhone(identifier);

    // 1. Resolve credential strictly from Supabase in live mode (RAM map only in Vitest)
    const sb = this.activeSupabase;
    let foundCred: UserCredentialRecord | undefined;
    if (sb) {
      const hasPostgrestDelimiters = /[,():]/.test(lowerId);
      const safeId = lowerId.replace(/"/g, '');
      const orFilters = hasPostgrestDelimiters
        ? [`email.ilike."${safeId}"`, `username.ilike."${safeId}"`]
        : [`email.ilike.${lowerId}`, `username.ilike.${lowerId}`];
      if (normalizedPhone) {
        orFilters.push(`phone_e164.eq.${normalizedPhone}`);
      }

      const { data: credRow, error: credQueryErr } = await sb
        .from('account_credentials')
        .select('*')
        .or(orFilters.join(','))
        .limit(1)
        .maybeSingle();

      if (credQueryErr) {
        const queryErr: any = new Error(
          `Failed to verify credentials against Supabase: ${credQueryErr.message}`
        );
        queryErr.status = 503;
        queryErr.code = 'SUPABASE_QUERY_ERROR';
        throw queryErr;
      }

      if (credRow && (credRow.auth_user_id || (credRow.password_hash && credRow.password_salt))) {
        const isCreator = Boolean(
          credRow.is_creator || credRow.role === 'creator' || credRow.role === 'super_admin'
        );
        foundCred = {
          id: String(credRow.id),
          memberId: credRow.member_id ? String(credRow.member_id) : undefined,
          authUserId: credRow.auth_user_id ? String(credRow.auth_user_id) : undefined,
          email: credRow.email ? String(credRow.email).toLowerCase() : undefined,
          username: credRow.username ? String(credRow.username).toLowerCase() : undefined,
          phoneE164: credRow.phone_e164 ? String(credRow.phone_e164) : undefined,
          passwordHash: credRow.password_hash ? String(credRow.password_hash) : '',
          passwordSalt: credRow.password_salt ? String(credRow.password_salt) : '',
          role: mapCredentialRoleToChurchRole(credRow.role, isCreator),
          organizationId: String(credRow.organization_id || '').toLowerCase(),
          name: String(credRow.full_name || 'Member'),
          isCreator,
          status: (credRow.status as UserCredentialRecord['status']) || 'active',
          mustChangePassword: Boolean(credRow.must_change_password),
          passwordUpdatedAt: credRow.password_updated_at ? String(credRow.password_updated_at) : null,
          failedAttempts: Number(credRow.failed_attempts || 0),
          lockedUntil: credRow.locked_until ? String(credRow.locked_until) : null,
          createdAt: credRow.created_at ? String(credRow.created_at) : undefined,
        };
      } else {
        // Bootstrap Platform Creator directly into Supabase Auth + account_credentials from env secrets if logging in with CREATOR_* secrets
        const envEmail = (process.env.CREATOR_EMAIL || '').trim().toLowerCase();
        const envPass = (process.env.CREATOR_PASSWORD || '').trim();
        const envUsername = (process.env.CREATOR_USERNAME || '').trim().toLowerCase();
        const envPhone = normalizePhone(process.env.CREATOR_PHONE);
        const matchesEnvCreatorId =
          Boolean(envEmail && envPass) &&
          (lowerId === envEmail ||
            (envUsername && lowerId === envUsername) ||
            (envPhone && normalizedPhone === envPhone));

        if (matchesEnvCreatorId && password === envPass) {
          const bootstrapped = await this.upsertCreatorCredentials({
            email: envEmail,
            username: envUsername || undefined,
            phone: envPhone || undefined,
            name: (process.env.CREATOR_NAME || '').trim() || 'Platform Creator',
            password: envPass,
            organizationId:
              process.env.CREATOR_ORGANIZATION_ID &&
              UUID_REGEX.test(process.env.CREATOR_ORGANIZATION_ID.trim())
                ? process.env.CREATOR_ORGANIZATION_ID.trim().toLowerCase()
                : '',
          });
          foundCred = {
            id: bootstrapped.user.id,
            organizationId: bootstrapped.user.organizationId,
            email: bootstrapped.user.email,
            username: bootstrapped.user.username,
            phoneE164: bootstrapped.user.phoneE164,
            name: bootstrapped.user.name,
            role: 'creator',
            isCreator: true,
            passwordHash: '',
            passwordSalt: '',
            status: 'active',
            mustChangePassword: false,
            failedAttempts: 0,
            lockedUntil: null,
          };
        }
      }
    } else {
      for (const cred of this.userCredentials.values()) {
        const matchEmail = cred.email && cred.email.toLowerCase() === lowerId;
        const matchUsername = cred.username && cred.username.toLowerCase() === lowerId;
        const matchPhone =
          cred.phoneE164 &&
          (cred.phoneE164 === normalizedPhone || cred.phoneE164 === identifier);

        if (matchEmail || matchUsername || matchPhone) {
          foundCred = cred;
          break;
        }
      }
    }

    if (!foundCred) {
      await this.recordAuthAuditEvent({
        identifier,
        eventType: 'login_failed',
        ipAddress,
        success: false,
        reason: 'account_not_found',
      });
      const err: any = new Error('Invalid email/username or password.');
      err.code = 'INVALID_CREDENTIALS';
      err.status = 401;
      throw err;
    }

    // 3. Enforce temporary brute-force lockout window
    if (foundCred.lockedUntil) {
      const lockedUntilMs = new Date(foundCred.lockedUntil).getTime();
      if (!Number.isNaN(lockedUntilMs) && lockedUntilMs > Date.now()) {
        const retryAfterSeconds = Math.max(1, Math.ceil((lockedUntilMs - Date.now()) / 1000));
        await this.recordAuthAuditEvent({
          organizationId: foundCred.organizationId,
          accountId: foundCred.id,
          identifier,
          eventType: 'login_locked',
          ipAddress,
          success: false,
          reason: `locked_for_${retryAfterSeconds}s`,
        });
        const err: any = new Error(
          `Too many failed login attempts. Account is temporarily locked. Try again in ${Math.ceil(retryAfterSeconds / 60)} minute(s).`
        );
        err.code = 'ACCOUNT_LOCKED';
        err.status = 429;
        err.retryAfterSeconds = retryAfterSeconds;
        throw err;
      }
      // Lockout expired — reset counter cleanly
      foundCred.failedAttempts = 0;
      foundCred.lockedUntil = null;
    }

    if (foundCred.status !== 'active') {
      const err: any = new Error('Account is inactive or suspended. Contact your church administrator.');
      err.code = 'ACCOUNT_INACTIVE';
      err.status = 403;
      throw err;
    }

    // 4. Verify password via Supabase Auth first in live mode; one-time legacy hash migration fallback
    let passwordMatches = false;
    let verifiedAuthUserId = foundCred.authUserId;

    if (sb) {
      const authEmail = await this.resolveAuthEmailForCredential(foundCred);
      if (authEmail) {
        const sbAuthRes = await this.verifyPasswordViaSupabaseAuth(authEmail, password);
        if (sbAuthRes.matched) {
          passwordMatches = true;
          verifiedAuthUserId = sbAuthRes.authUserId || verifiedAuthUserId;
          // Scrub any legacy password_hash/password_salt if still present
          if (foundCred.passwordHash || foundCred.passwordSalt || !foundCred.authUserId) {
            await this.scrubLegacyPasswordHashes(foundCred.id, verifiedAuthUserId);
          }
        }
      }

      // One-time transparent migration for legacy accounts not yet in auth.users
      if (!passwordMatches && foundCred.passwordHash && foundCred.passwordSalt) {
        const legacyValid = verifyPassword(password, foundCred.passwordHash, foundCred.passwordSalt);
        if (legacyValid) {
          passwordMatches = true;
          try {
            const syncedId = await this.syncUserToSupabaseAuth({
              existingAuthUserId: foundCred.authUserId,
              email: foundCred.email,
              phoneE164: foundCred.phoneE164,
              password,
              fullName: foundCred.name,
              organizationId: foundCred.organizationId || undefined,
              role: foundCred.role,
              isCreator: foundCred.isCreator,
              memberId: foundCred.memberId,
            });
            if (syncedId) {
              verifiedAuthUserId = syncedId;
              await this.scrubLegacyPasswordHashes(foundCred.id, syncedId);
            }
          } catch (syncErr: any) {
            console.warn('[Ekklesphere Auth Migration] Deferred Auth sync warning:', syncErr?.message);
          }
        }
      }
    } else {
      passwordMatches = verifyPassword(password, foundCred.passwordHash, foundCred.passwordSalt);
    }

    const distributedRateKey = `login:${foundCred.id}`;
    if (!passwordMatches) {
      const nextAttempts = (foundCred.failedAttempts || 0) + 1;
      foundCred.failedAttempts = nextAttempts;

      const lockoutSeconds = Math.ceil(LOGIN_LOCKOUT_MS / 1000);
      const distributedLimit = await this.consumeDistributedAuthRateLimit(
        distributedRateKey,
        MAX_FAILED_LOGIN_ATTEMPTS,
        lockoutSeconds,
        lockoutSeconds
      );

      const isNowLocked = !distributedLimit.allowed || nextAttempts >= MAX_FAILED_LOGIN_ATTEMPTS;
      const lockedUntilIso = isNowLocked ? new Date(Date.now() + LOGIN_LOCKOUT_MS).toISOString() : null;
      if (isNowLocked) {
        foundCred.lockedUntil = lockedUntilIso;
      }

      if (sb) {
        await sb
          .from('account_credentials')
          .update({
            failed_attempts: nextAttempts,
            locked_until: lockedUntilIso,
          })
          .eq('id', foundCred.id);
      } else {
        this.userCredentials.set(foundCred.id, foundCred);
      }

      await this.recordAuthAuditEvent({
        organizationId: foundCred.organizationId,
        accountId: foundCred.id,
        identifier,
        eventType: isNowLocked ? 'login_locked' : 'login_failed',
        ipAddress,
        success: false,
        reason: isNowLocked ? 'max_attempts_exceeded' : 'password_mismatch',
      });

      if (isNowLocked) {
        const retryAfterSeconds = distributedLimit.retryAfterSeconds || lockoutSeconds;
        const err: any = new Error(
          'Too many failed login attempts. Account locked for 15 minutes for your security.'
        );
        err.code = 'ACCOUNT_LOCKED';
        err.status = 429;
        err.retryAfterSeconds = retryAfterSeconds;
        throw err;
      }

      const err: any = new Error('Invalid email/username or password.');
      err.code = 'INVALID_CREDENTIALS';
      err.status = 401;
      throw err;
    }

    // Valid login: reset failed attempts counter + distributed rate limit window
    await this.resetDistributedAuthRateLimit(distributedRateKey);

    if (sb) {
      await sb
        .from('account_credentials')
        .update({
          failed_attempts: 0,
          locked_until: null,
          last_login_at: new Date().toISOString(),
          ...(verifiedAuthUserId && !foundCred.authUserId ? { auth_user_id: verifiedAuthUserId } : {}),
        })
        .eq('id', foundCred.id);
    } else {
      foundCred.failedAttempts = 0;
      foundCred.lockedUntil = null;
      this.userCredentials.set(foundCred.id, foundCred);
    }

    await this.recordAuthAuditEvent({
      organizationId: foundCred.organizationId,
      accountId: foundCred.id,
      identifier,
      eventType: 'login_success',
      ipAddress,
      success: true,
    });

    let organization: OrganizationRecord | null = null;
    if (foundCred.organizationId) {
      organization = (await this.getOrganisationById(foundCred.organizationId)) || null;
      if (
        !foundCred.isCreator &&
        organization &&
        (organization.status === 'suspended' || organization.status === 'archived')
      ) {
        await this.recordAuthAuditEvent({
          organizationId: foundCred.organizationId,
          accountId: foundCred.id,
          identifier,
          eventType: 'login_failed',
          ipAddress,
          success: false,
          reason: `organisation_${organization.status}`,
        });
        const err: any = new Error(
          'Organisation access has been revoked or suspended. Contact platform support.'
        );
        err.code = 'ACCOUNT_INACTIVE';
        err.status = 403;
        throw err;
      }
    }

    const sessionTimeoutMinutes = await this.getOrganizationSessionTimeoutMinutes(
      foundCred.organizationId
    );
    const resolvedDesignation = await this.resolveUserDesignation(
      foundCred.organizationId,
      foundCred.memberId || foundCred.id,
      foundCred.email,
      foundCred.designation
    );
    const { token, idleTimeoutMinutes, expiresAt } = signSessionToken(
      {
        id: foundCred.memberId || foundCred.id,
        email: foundCred.email || `${foundCred.username || 'user'}@ekklesphere.church`,
        role: foundCred.role,
        organization_id: foundCred.organizationId,
        tenant_id: foundCred.organizationId,
        name: foundCred.name,
        ...(resolvedDesignation ? { designation: resolvedDesignation } : {}),
        is_creator: foundCred.isCreator,
      },
      sessionTimeoutMinutes
    );

    return {
      user: {
        id: foundCred.memberId || foundCred.id,
        email: foundCred.email || '',
        username: foundCred.username,
        phoneE164: foundCred.phoneE164,
        name: foundCred.name,
        ...(resolvedDesignation ? { designation: resolvedDesignation } : {}),
        role: foundCred.role,
        organizationId: foundCred.organizationId,
        isCreator: foundCred.isCreator,
        mustChangePassword: Boolean(foundCred.mustChangePassword),
      },
      organization,
      token,
      idleTimeoutMinutes,
      sessionExpiresAt: expiresAt,
    };
  }

  public async registerMemberWithCredentials(params: {
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
    password: string;
    organizationId?: string;
    organizationSlug?: string;
    groupName?: string;
    autoCheckinOptedIn?: boolean;
    ipAddress?: string;
  }): Promise<{
    user: {
      id: string;
      email: string;
      phoneE164?: string;
      name: string;
      role: ChurchRole;
      organizationId: string;
      isCreator: boolean;
      mustChangePassword: boolean;
    };
    organization: OrganizationRecord | null;
    token: string;
    idleTimeoutMinutes: number;
    sessionExpiresAt: string;
  }> {
    this.assertDatabaseAvailable();
    const firstName = (params.firstName || '').trim();
    const lastName = (params.lastName || '').trim();
    const email = params.email ? params.email.trim().toLowerCase() : '';
    const phone = params.phone ? params.phone.trim() : '';
    const password = (params.password || '').trim();

    if (!firstName || !lastName) {
      const err: any = new Error('First name and last name are required.');
      err.code = 'INVALID_INPUT';
      err.status = 400;
      throw err;
    }

    if (!email && !phone) {
      const err: any = new Error('Either an email address or a valid phone number is required.');
      err.code = 'INVALID_INPUT';
      err.status = 400;
      throw err;
    }

    if (password.length < 8) {
      const err: any = new Error('Password must be at least 8 characters long.');
      err.code = 'WEAK_PASSWORD';
      err.status = 400;
      throw err;
    }

    const normalizedPhone = normalizePhone(phone);

    if (this.supabase) {
      const orFilters: string[] = [];
      if (email) orFilters.push(`email.ilike.${email}`);
      if (normalizedPhone) orFilters.push(`phone_e164.eq.${normalizedPhone}`);
      if (orFilters.length > 0) {
        const { data: existingCred, error } = await this.supabase
          .from('account_credentials')
          .select('id')
          .or(orFilters.join(','))
          .limit(1)
          .maybeSingle();

        if (error) {
          throw new Error(`Failed to verify existing credentials in Supabase: ${error.message}`);
        }
        if (existingCred) {
          const err: any = new Error('An account with this email or phone already exists. Please log in.');
          err.code = 'DUPLICATE_CREDENTIAL';
          err.status = 409;
          throw err;
        }
      }
    } else {
      for (const cred of this.userCredentials.values()) {
        if (email && cred.email && cred.email.toLowerCase() === email) {
          const err: any = new Error('An account with this email address already exists. Please log in.');
          err.code = 'DUPLICATE_CREDENTIAL';
          err.status = 409;
          throw err;
        }
        if (normalizedPhone && cred.phoneE164 && cred.phoneE164 === normalizedPhone) {
          const err: any = new Error('An account with this phone number already exists. Please log in.');
          err.code = 'DUPLICATE_CREDENTIAL';
          err.status = 409;
          throw err;
        }
      }
    }

    // Resolve target church organization (slug -> id -> first active organization)
    const orgs = await this.listOrganisations();
    let targetOrgId = '';
    if (params.organizationId && UUID_REGEX.test(params.organizationId.trim())) {
      const matched = orgs.find((o) => o.id.toLowerCase() === params.organizationId!.trim().toLowerCase());
      if (matched) targetOrgId = matched.id;
    } else if (params.organizationSlug && params.organizationSlug.trim()) {
      const slug = params.organizationSlug.trim().toLowerCase();
      const matched = orgs.find((o) => o.slug.toLowerCase() === slug);
      if (matched) targetOrgId = matched.id;
    }

    if (!targetOrgId) {
      const activeOrg = orgs.find((o) => o.status === 'active' || o.licenseStatus === 'active') || orgs[0];
      if (activeOrg) {
        targetOrgId = activeOrg.id;
      }
    }

    if (!targetOrgId) {
      const err: any = new Error('No church organization is currently available for registration.');
      err.code = 'NO_TENANT_AVAILABLE';
      err.status = 400;
      throw err;
    }

    // Self-registration ALWAYS forces least-privilege role: 'member' (never trusts client role)
    const member = await this.createMember(
      targetOrgId,
      {
        firstName,
        lastName,
        email: email || undefined,
        phoneE164: normalizedPhone || phone || undefined,
        groupName: params.groupName || 'General Congregation',
        autoCheckinOptedIn: params.autoCheckinOptedIn ?? true,
        role: 'member',
        status: 'active',
      },
      { skipAutoCredentials: true }
    );

    const memberId = String(member.id || randomUUID());
    const fullName = `${firstName} ${lastName}`.trim();

    const newCred = await this.provisionCredentialRecord({
      id: memberId,
      memberId,
      organizationId: targetOrgId,
      email: email || undefined,
      phoneE164: normalizedPhone || undefined,
      name: fullName,
      role: 'member',
      isCreator: false,
      password,
      mustChangePassword: false,
    });

    await this.recordAuthAuditEvent({
      organizationId: targetOrgId,
      accountId: newCred.id,
      identifier: email || normalizedPhone || memberId,
      eventType: 'register_success',
      ipAddress: params.ipAddress,
      success: true,
    });

    const organization = await this.getOrganisationById(targetOrgId);

    const sessionTimeoutMinutes = await this.getOrganizationSessionTimeoutMinutes(targetOrgId);
    const { token, idleTimeoutMinutes, expiresAt } = signSessionToken(
      {
        id: memberId,
        email: email || `${normalizedPhone || 'member'}@ekklesphere.church`,
        role: 'member',
        organization_id: targetOrgId,
        tenant_id: targetOrgId,
        name: newCred.name,
        is_creator: false,
      },
      sessionTimeoutMinutes
    );

    return {
      user: {
        id: memberId,
        email,
        phoneE164: normalizedPhone,
        name: newCred.name,
        role: 'member',
        organizationId: targetOrgId,
        isCreator: false,
        mustChangePassword: false,
      },
      organization,
      token,
      idleTimeoutMinutes,
      sessionExpiresAt: expiresAt,
    };
  }

  public async registerOrganisationTrial(params: {
    organizationName: string;
    orgType?: OrganisationType;
    city?: string;
    country?: string;
    adminFirstName: string;
    adminLastName: string;
    email: string;
    phone?: string;
    password: string;
    trialPlan?: LicenseTier;
    ipAddress?: string;
  }): Promise<{
    user: {
      id: string;
      email: string;
      phoneE164?: string;
      name: string;
      role: ChurchRole;
      organizationId: string;
      isCreator: boolean;
      mustChangePassword: boolean;
    };
    organization: OrganizationRecord;
    license: SystemLicense | null;
    evaluation: LicenseEvaluationResult;
    token: string;
    idleTimeoutMinutes: number;
    sessionExpiresAt: string;
  }> {
    this.assertDatabaseAvailable();
    const orgName = (params.organizationName || '').trim();
    const firstName = (params.adminFirstName || '').trim();
    const lastName = (params.adminLastName || '').trim();
    const email = (params.email || '').trim().toLowerCase();
    const rawPhone = (params.phone || '').trim();
    const password = (params.password || '').trim();
    const trialPlan: LicenseTier = params.trialPlan || 'grace_starter';

    if (orgName.length < 2) {
      const err: any = new Error('Organisation or church name must be at least 2 characters.');
      err.code = 'INVALID_INPUT';
      err.status = 400;
      throw err;
    }
    if (!firstName || !lastName) {
      const err: any = new Error('Administrator first and last name are required.');
      err.code = 'INVALID_INPUT';
      err.status = 400;
      throw err;
    }
    if (!email) {
      const err: any = new Error('Administrator email address is required.');
      err.code = 'INVALID_INPUT';
      err.status = 400;
      throw err;
    }
    if (password.length < 8) {
      const err: any = new Error('Password must be at least 8 characters long.');
      err.code = 'WEAK_PASSWORD';
      err.status = 400;
      throw err;
    }

    const normalizedPhone = normalizePhone(rawPhone);

    // 1. Check duplicates BEFORE creating org/license to keep onboarding atomic
    if (this.supabase) {
      const orFilters: string[] = [`email.ilike.${email}`];
      if (normalizedPhone) orFilters.push(`phone_e164.eq.${normalizedPhone}`);
      const { data: existingCred, error } = await this.supabase
        .from('account_credentials')
        .select('id')
        .or(orFilters.join(','))
        .limit(1)
        .maybeSingle();

      if (error) {
        throw new Error(`Failed to verify existing credentials in Supabase: ${error.message}`);
      }
      if (existingCred) {
        const err: any = new Error('An account with this email or phone already exists. Please sign in instead.');
        err.code = 'DUPLICATE_CREDENTIAL';
        err.status = 409;
        throw err;
      }
    } else {
      for (const cred of this.userCredentials.values()) {
        if (cred.email && cred.email.toLowerCase() === email) {
          const err: any = new Error('An account with this email address already exists. Please sign in instead.');
          err.code = 'DUPLICATE_CREDENTIAL';
          err.status = 409;
          throw err;
        }
        if (normalizedPhone && cred.phoneE164 && cred.phoneE164 === normalizedPhone) {
          const err: any = new Error('An account with this phone number already exists. Please sign in instead.');
          err.code = 'DUPLICATE_CREDENTIAL';
          err.status = 409;
          throw err;
        }
      }
    }

    // 2. Provision new isolated organisation + automatic 14-day trial license
    const fullName = `${firstName} ${lastName}`.trim();
    const { organisation, license } = await this.createOrganisation({
      name: orgName,
      orgType: params.orgType || 'church',
      city: params.city?.trim() || 'Accra',
      country: params.country?.trim() || 'Ghana',
      seniorPastor: fullName,
      contactName: fullName,
      contactEmail: email,
      contactPhone: normalizedPhone || rawPhone || undefined,
      initialPlan: trialPlan,
      autoIssueTrial: true,
    });

    // 3. Provision founder/admin member record strictly scoped to this newly created organisation
    const adminMember = await this.createMember(
      organisation.id,
      {
        firstName,
        lastName,
        email,
        phoneE164: normalizedPhone || rawPhone || undefined,
        groupName: 'Church Leadership',
        autoCheckinOptedIn: false,
        role: 'admin',
        status: 'active',
      },
      { skipAutoCredentials: true }
    );

    const memberId = String(adminMember.id || randomUUID());

    // 4. Provision scrypt-hashed login credential record (never Creator)
    const newCred = await this.provisionCredentialRecord({
      id: memberId,
      memberId,
      organizationId: organisation.id,
      email,
      phoneE164: normalizedPhone || undefined,
      name: fullName,
      role: 'admin',
      isCreator: false,
      password,
      mustChangePassword: false,
    });

    await this.recordAuthAuditEvent({
      organizationId: organisation.id,
      accountId: newCred.id,
      identifier: email,
      eventType: 'register_success',
      ipAddress: params.ipAddress,
      success: true,
      reason: `organisation_trial_signup:${trialPlan}`,
    });

    await this.appendAuditLog({
      organizationId: organisation.id,
      actorId: memberId,
      actorEmail: email,
      actorRole: 'admin',
      action: 'organisation.trial_signup',
      targetType: 'organization',
      targetId: organisation.id,
      metadata: {
        organizationName: organisation.name,
        slug: organisation.slug,
        trialPlan,
        licenseKey: license?.key || null,
      },
      ipAddress: params.ipAddress,
    });

    await this.markMatchingLandingLeadsConverted(email, organisation.id).catch(() => {});

    const evaluation = await this.evaluateOrganizationLicense(organisation.id);
    const { token, idleTimeoutMinutes, expiresAt } = signSessionToken(
      {
        id: memberId,
        email,
        role: 'admin',
        organization_id: organisation.id,
        tenant_id: organisation.id,
        name: fullName,
        is_creator: false,
      },
      DEFAULT_IDLE_SESSION_TIMEOUT_MINUTES
    );

    return {
      user: {
        id: memberId,
        email,
        phoneE164: normalizedPhone || undefined,
        name: fullName,
        role: 'admin',
        organizationId: organisation.id,
        isCreator: false,
        mustChangePassword: false,
      },
      organization: organisation,
      license,
      evaluation,
      token,
      idleTimeoutMinutes,
      sessionExpiresAt: expiresAt,
    };
  }

  // ===========================================================================
  // LICENSE EVALUATION & FAIL-CLOSED ENFORCEMENT (Phase 0 #6 & Phase 2)
  // ===========================================================================

  public async evaluateOrganizationLicense(organizationId: string): Promise<LicenseEvaluationResult> {
    const orgId = organizationId.toLowerCase();
    const org = await this.getOrganisationById(orgId);
    const license = await this.getLatestLicenseForOrg(orgId);
    const seatsUsed = await this.getMemberCountForOrg(orgId);
    const sitesUsed = (await this.getSitesForOrg(orgId)).filter((s) => s.active).length;

    if (!license) {
      return {
        allowed: false,
        code: 'LICENSE_MISSING',
        httpStatus: 403,
        status: 'unlicensed',
        tier: null,
        organizationId: orgId,
        seatsUsed,
        seatsLimit: 0,
        sitesUsed,
        sitesLimit: 0,
        monthlyCheckinsLimit: 0,
        expiresDate: null,
        graceEndsDate: null,
        inGracePeriod: false,
        daysRemaining: null,
        graceDaysRemaining: null,
        message: 'Access blocked: No valid Ekklesphere license exists for this organisation.',
      };
    }

    const plan = (await this.getPlan(license.tier)) || DEFAULT_PLANS.grace_starter;
    const overrides = license.overrides || {};
    const seatsLimit = overrides.seatsLimit ?? license.seatsLimit ?? plan.seatsLimit;
    const sitesLimit = overrides.sitesLimit ?? license.sitesLimit ?? plan.sitesLimit;
    const monthlyCheckinsLimit =
      overrides.monthlyCheckinsLimit ?? license.monthlyCheckinsLimit ?? plan.monthlyCheckinsLimit;

    if (org?.status === 'suspended' || license.status === 'suspended') {
      return {
        allowed: false,
        code: 'LICENSE_SUSPENDED',
        httpStatus: 403,
        status: 'suspended',
        tier: license.tier,
        organizationId: orgId,
        licenseKey: license.key,
        seatsUsed,
        seatsLimit,
        sitesUsed,
        sitesLimit,
        monthlyCheckinsLimit,
        expiresDate: license.expiresDate,
        graceEndsDate: license.graceEndsDate || null,
        inGracePeriod: false,
        daysRemaining: 0,
        graceDaysRemaining: 0,
        message: 'Organisation subscription is currently suspended. Contact platform support.',
      };
    }

    if (license.status === 'revoked') {
      return {
        allowed: false,
        code: 'LICENSE_REVOKED',
        httpStatus: 403,
        status: 'revoked',
        tier: license.tier,
        organizationId: orgId,
        licenseKey: license.key,
        seatsUsed,
        seatsLimit,
        sitesUsed,
        sitesLimit,
        monthlyCheckinsLimit,
        expiresDate: license.expiresDate,
        graceEndsDate: license.graceEndsDate || null,
        inGracePeriod: false,
        daysRemaining: 0,
        graceDaysRemaining: 0,
        message: 'License has been revoked by the platform owner.',
      };
    }

    const nowMs = Date.now();
    const expiresDt = new Date(
      license.expiresDate.includes('T') ? license.expiresDate : `${license.expiresDate}T23:59:59.999Z`
    );
    const expiresMs = expiresDt.getTime();
    const graceEndsMs = license.graceEndsDate
      ? new Date(
          license.graceEndsDate.includes('T')
            ? license.graceEndsDate
            : `${license.graceEndsDate}T23:59:59.999Z`
        ).getTime()
      : expiresMs + GRACE_PERIOD_DAYS * DAY_MS;

    const graceEndsIso = new Date(graceEndsMs).toISOString().slice(0, 10);

    if (nowMs > expiresMs) {
      if (nowMs <= graceEndsMs && license.status !== 'expired') {
        const graceDaysRemaining = Math.max(1, Math.ceil((graceEndsMs - nowMs) / DAY_MS));
        return {
          allowed: true,
          code: 'LICENSE_GRACE_PERIOD',
          httpStatus: 200,
          status: 'grace_period',
          tier: license.tier,
          organizationId: orgId,
          licenseKey: license.key,
          seatsUsed,
          seatsLimit,
          sitesUsed,
          sitesLimit,
          monthlyCheckinsLimit,
          expiresDate: license.expiresDate,
          graceEndsDate: graceEndsIso,
          inGracePeriod: true,
          daysRemaining: 0,
          graceDaysRemaining,
          message: `License expired; operating within ${graceDaysRemaining}-day renewal grace period.`,
        };
      }

      return {
        allowed: false,
        code: 'LICENSE_EXPIRED',
        httpStatus: 402,
        status: 'expired',
        tier: license.tier,
        organizationId: orgId,
        licenseKey: license.key,
        seatsUsed,
        seatsLimit,
        sitesUsed,
        sitesLimit,
        monthlyCheckinsLimit,
        expiresDate: license.expiresDate,
        graceEndsDate: graceEndsIso,
        inGracePeriod: false,
        daysRemaining: 0,
        graceDaysRemaining: 0,
        message: 'License and 7-day grace period have expired. Please renew to restore access.',
      };
    }

    const daysRemaining = Math.max(0, Math.ceil((expiresMs - nowMs) / DAY_MS));
    const effectiveStatus: LicenseStatus = license.status === 'trial' ? 'trial' : 'active';

    return {
      allowed: true,
      code: effectiveStatus === 'trial' ? 'LICENSE_TRIAL' : 'LICENSE_OK',
      httpStatus: 200,
      status: effectiveStatus,
      tier: license.tier,
      organizationId: orgId,
      licenseKey: license.key,
      seatsUsed,
      seatsLimit,
      sitesUsed,
      sitesLimit,
      monthlyCheckinsLimit,
      expiresDate: license.expiresDate,
      graceEndsDate: graceEndsIso,
      inGracePeriod: false,
      daysRemaining,
      graceDaysRemaining: GRACE_PERIOD_DAYS,
      message:
        effectiveStatus === 'trial'
          ? `14-day onboarding trial active (${daysRemaining} day(s) remaining).`
          : 'License active and in good standing.',
    };
  }

  // ===========================================================================
  // TENANT OPERATIONAL METHODS (Sites, Premise, Check-ins, Raw Events, Members, Events, Push)
  // ===========================================================================

  public async getPremiseSettings(organizationId: string): Promise<{
    configured: boolean;
    site: RegisteredSiteRecord | null;
    premiseSettings: PremiseSettingsRecord | null;
    sites: RegisteredSiteRecord[];
  }> {
    this.assertDatabaseAvailable();
    const orgId = organizationId.toLowerCase();
    const sites = await this.getSitesForOrg(orgId);
    const activeSite = sites.find((s) => s.active) || sites[0] || null;

    if (this.supabase) {
      const { data: orgRow } = await this.supabase
        .from('organizations')
        .select('*')
        .eq('id', orgId)
        .maybeSingle();

      if (orgRow && activeSite && Number.isFinite(activeSite.lat) && Number.isFinite(activeSite.lng)) {
        const ps: PremiseSettingsRecord = {
          organizationId: orgId,
          churchName: orgRow.name,
          campusName: activeSite.name,
          campusAddress: activeSite.address || orgRow.premise_address || '',
          lat: activeSite.lat,
          lng: activeSite.lng,
          accuracyM: null,
          innerGeofenceMeters: activeSite.radius_m || orgRow.inner_geofence_m || 60,
          outerGeofenceMeters: activeSite.outer_radius_m || orgRow.outer_geofence_m || 300,
          dwellTimeMinutes: activeSite.dwell_min || orgRow.dwell_time_min || 5,
          updatedAt: activeSite.updated_at || orgRow.updated_at || null,
          updatedBy: activeSite.updated_by,
        };
        return { configured: true, site: activeSite, premiseSettings: ps, sites };
      }
      if (orgRow) {
        return {
          configured: false,
          site: null,
          premiseSettings: {
            organizationId: orgId,
            churchName: orgRow.name,
            campusName: orgRow.name,
            campusAddress: orgRow.premise_address || '',
            lat: null,
            lng: null,
            accuracyM: null,
            innerGeofenceMeters: orgRow.inner_geofence_m || 60,
            outerGeofenceMeters: orgRow.outer_geofence_m || 300,
            dwellTimeMinutes: orgRow.dwell_time_min || 5,
            updatedAt: null,
          },
          sites,
        };
      }
    }

    const memPremise = this.premiseByOrg.get(orgId) || null;
    const isConfigured =
      memPremise !== null &&
      typeof memPremise.lat === 'number' &&
      typeof memPremise.lng === 'number' &&
      Number.isFinite(memPremise.lat) &&
      Number.isFinite(memPremise.lng);

    return {
      configured: isConfigured,
      site: isConfigured ? activeSite : null,
      premiseSettings: memPremise,
      sites: isConfigured ? sites : [],
    };
  }

  public async savePremiseSettings(
    organizationId: string,
    params: {
      siteId?: string;
      churchName: string;
      campusName: string;
      campusAddress: string;
      lat: number;
      lng: number;
      accuracyM: number | null;
      innerGeofenceMeters: number;
      outerGeofenceMeters: number;
      dwellTimeMinutes: number;
      updatedBy: string;
    }
  ): Promise<{
    site: RegisteredSiteRecord;
    premiseSettings: PremiseSettingsRecord;
    sites: RegisteredSiteRecord[];
  }> {
    const orgId = organizationId.toLowerCase();
    this.assertDatabaseAvailable();
    const existingSites = await this.getSitesForOrg(orgId);
    const targetSiteId = params.siteId || existingSites[0]?.id || randomUUID();

    const isNewSite = !existingSites.some((s) => s.id === targetSiteId);
    if (isNewSite) {
      const evalRes = await this.evaluateOrganizationLicense(orgId);
      if (evalRes.sitesLimit > 0 && existingSites.filter((s) => s.active).length >= evalRes.sitesLimit) {
        const limitErr: any = new Error(
          `Site limit reached (${evalRes.sitesUsed}/${evalRes.sitesLimit}). Upgrade your license plan to add another campus site.`
        );
        limitErr.code = 'SITE_LIMIT_REACHED';
        limitErr.status = 403;
        throw limitErr;
      }
    }

    const nowIso = new Date().toISOString();
    const site: RegisteredSiteRecord = {
      id: targetSiteId,
      organization_id: orgId,
      name: params.campusName,
      address: params.campusAddress,
      lat: params.lat,
      lng: params.lng,
      radius_m: params.innerGeofenceMeters,
      outer_radius_m: Math.max(params.outerGeofenceMeters, params.innerGeofenceMeters),
      dwell_min: params.dwellTimeMinutes,
      active: true,
      updated_at: nowIso,
      updated_by: params.updatedBy,
    };

    if (this.supabase) {
      const { error: siteErr } = await this.supabase.from('sites').upsert({
        id: site.id,
        organization_id: orgId,
        name: site.name,
        address: site.address,
        lat: site.lat,
        lng: site.lng,
        radius_m: site.radius_m,
        outer_radius_m: site.outer_radius_m,
        dwell_min: site.dwell_min,
        location: `SRID=4326;POINT(${site.lng} ${site.lat})`,
        active: true,
        updated_by: site.updated_by,
        updated_at: nowIso,
      });
      if (siteErr) {
        throw new Error(`Failed to save site in Supabase: ${siteErr.message}`);
      }

      const { data: orgRow } = await this.supabase
        .from('organizations')
        .select('settings')
        .eq('id', orgId)
        .maybeSingle();

      const mergedSettingsJson = {
        ...(orgRow?.settings && typeof orgRow.settings === 'object' ? orgRow.settings : {}),
        campus_name: params.campusName,
        campus_address: params.campusAddress,
        campus_location_accuracy_m: params.accuracyM,
        campus_location_updated_at: nowIso,
        inner_geofence_m: site.radius_m,
        outer_geofence_m: site.outer_radius_m,
        dwell_time_min: site.dwell_min,
      };

      const { error: orgErr } = await this.supabase
        .from('organizations')
        .update({
          ...(params.churchName.trim() ? { name: params.churchName.trim() } : {}),
          premise_address: params.campusAddress,
          inner_geofence_m: site.radius_m,
          outer_geofence_m: site.outer_radius_m,
          dwell_time_min: site.dwell_min,
          settings: mergedSettingsJson,
          updated_at: nowIso,
        })
        .eq('id', orgId);

      if (orgErr) {
        throw new Error(`Failed to update organisation premise in Supabase: ${orgErr.message}`);
      }

      const updatedSites = existingSites.some((s) => s.id === site.id)
        ? existingSites.map((s) => (s.id === site.id ? site : s))
        : [site, ...existingSites];

      const premiseSettings: PremiseSettingsRecord = {
        organizationId: orgId,
        churchName: params.churchName,
        campusName: params.campusName,
        campusAddress: params.campusAddress,
        lat: params.lat,
        lng: params.lng,
        accuracyM: params.accuracyM,
        innerGeofenceMeters: site.radius_m,
        outerGeofenceMeters: site.outer_radius_m,
        dwellTimeMinutes: site.dwell_min,
        updatedAt: nowIso,
        updatedBy: params.updatedBy,
      };

      return { site, premiseSettings, sites: updatedSites };
    }

    const updatedSites = existingSites.some((s) => s.id === site.id)
      ? existingSites.map((s) => (s.id === site.id ? site : s))
      : [site, ...existingSites];

    this.sitesByOrg.set(orgId, updatedSites);

    const premiseSettings: PremiseSettingsRecord = {
      organizationId: orgId,
      churchName: params.churchName,
      campusName: params.campusName,
      campusAddress: params.campusAddress,
      lat: params.lat,
      lng: params.lng,
      accuracyM: params.accuracyM,
      innerGeofenceMeters: site.radius_m,
      outerGeofenceMeters: site.outer_radius_m,
      dwellTimeMinutes: site.dwell_min,
      updatedAt: nowIso,
      updatedBy: params.updatedBy,
    };
    this.premiseByOrg.set(orgId, premiseSettings);

    const existingMemSettings = this.systemSettingsByOrg.get(orgId) || { ...DEFAULT_ORG_SYSTEM_SETTINGS };
    this.systemSettingsByOrg.set(orgId, {
      ...existingMemSettings,
      churchName: params.churchName || existingMemSettings.churchName,
      campusName: params.campusName,
      campusAddress: params.campusAddress,
      campusLatitude: params.lat,
      campusLongitude: params.lng,
      campusLocationAccuracyM: params.accuracyM,
      campusLocationUpdatedAt: nowIso,
      innerGeofenceMeters: site.radius_m,
      outerGeofenceMeters: site.outer_radius_m,
      dwellTimeMinutes: site.dwell_min,
    });

    const org = this.orgs.get(orgId);
    if (org) {
      if (params.churchName.trim()) {
        org.name = params.churchName.trim();
      }
      org.geofenceConfigured = true;
      org.geofenceRadiusMeters = site.outer_radius_m;
      org.sitesCount = updatedSites.filter((s) => s.active).length;
    }

    return { site, premiseSettings, sites: updatedSites };
  }

  public async clearPremiseSettings(organizationId: string): Promise<PremiseSettingsRecord | null> {
    this.assertDatabaseAvailable();
    const orgId = organizationId.toLowerCase();
    const nowIso = new Date().toISOString();
    if (this.supabase) {
      const { error: siteDelErr } = await this.supabase
        .from('sites')
        .delete()
        .eq('organization_id', orgId);
      if (siteDelErr) {
        throw new Error(`Failed to clear campus site in Supabase: ${siteDelErr.message}`);
      }
      const { data: orgRow } = await this.supabase
        .from('organizations')
        .select('settings')
        .eq('id', orgId)
        .maybeSingle();
      if (orgRow) {
        const nextJson = {
          ...(orgRow.settings && typeof orgRow.settings === 'object' ? orgRow.settings : {}),
          campus_location_accuracy_m: null,
          campus_location_updated_at: null,
        };
        await this.supabase
          .from('organizations')
          .update({ settings: nextJson, updated_at: nowIso })
          .eq('id', orgId);
      }
      return null;
    }
    this.sitesByOrg.set(orgId, []);
    const existing = this.premiseByOrg.get(orgId);
    const cleared: PremiseSettingsRecord | null = existing
      ? { ...existing, lat: null, lng: null, accuracyM: null, updatedAt: null }
      : null;
    if (cleared) this.premiseByOrg.set(orgId, cleared);

    const existingMemSettings = this.systemSettingsByOrg.get(orgId);
    if (existingMemSettings) {
      this.systemSettingsByOrg.set(orgId, {
        ...existingMemSettings,
        campusLatitude: null,
        campusLongitude: null,
        campusLocationAccuracyM: null,
        campusLocationUpdatedAt: null,
      });
    }

    const org = this.orgs.get(orgId);
    if (org) {
      org.geofenceConfigured = false;
      org.sitesCount = 0;
    }
    return cleared;
  }

  private isMissingGroupCategoriesTableError(error: { code?: string; message?: string } | null): boolean {
    if (!error) return false;
    const code = String(error.code || '').toUpperCase();
    const msg = String(error.message || '');
    return (
      code === 'PGRST205' ||
      code === '42P01' ||
      /church_group_categories/i.test(msg) &&
        (/schema cache/i.test(msg) || /does not exist/i.test(msg) || /could not find the table/i.test(msg))
    );
  }

  private async readCustomGroupCategoriesFromTable(
    sb: SupabaseClient,
    orgId: string
  ): Promise<ChurchGroupCategoryDefinition[] | null> {
    const { data, error } = await sb
      .from('church_group_categories')
      .select('slug, label, plural_label, description, color, created_at')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: true });

    if (error) {
      if (this.isMissingGroupCategoriesTableError(error)) {
        return null;
      }
      console.warn('[Ekklesphere] Could not read church_group_categories:', error.message);
      return null;
    }

    return sanitizeCustomGroupCategories(
      (data || []).map((row: Record<string, any>) => ({
        id: row.slug,
        label: row.label,
        pluralLabel: row.plural_label,
        description: row.description,
        color: row.color,
        isBuiltIn: false,
        createdAt: row.created_at,
      }))
    );
  }

  private async syncCustomGroupCategoriesToTable(
    sb: SupabaseClient,
    orgId: string,
    categories: ChurchGroupCategoryDefinition[]
  ): Promise<void> {
    const sanitized = sanitizeCustomGroupCategories(categories);
    const desiredSlugs = sanitized.map((c) => c.id);

    const { data: existingRows, error: listErr } = await sb
      .from('church_group_categories')
      .select('slug')
      .eq('organization_id', orgId);

    if (listErr) {
      if (!this.isMissingGroupCategoriesTableError(listErr)) {
        console.warn('[Ekklesphere] Could not sync church_group_categories:', listErr.message);
      }
      return;
    }

    const removedSlugs = (existingRows || [])
      .map((r: any) => String(r.slug || ''))
      .filter((slug: string) => slug && !desiredSlugs.includes(slug));

    if (removedSlugs.length > 0) {
      const { error: delErr } = await sb
        .from('church_group_categories')
        .delete()
        .eq('organization_id', orgId)
        .in('slug', removedSlugs);
      if (delErr && !this.isMissingGroupCategoriesTableError(delErr)) {
        console.warn('[Ekklesphere] Could not prune church_group_categories:', delErr.message);
      }
    }

    if (sanitized.length > 0) {
      const rowsToUpsert = sanitized.map((cat) => ({
        organization_id: orgId,
        slug: cat.id,
        label: cat.label,
        plural_label: cat.pluralLabel,
        description: cat.description || '',
        color: cat.color || 'violet',
      }));
      const { error: upsertErr } = await sb
        .from('church_group_categories')
        .upsert(rowsToUpsert, { onConflict: 'organization_id,slug' });
      if (upsertErr && !this.isMissingGroupCategoriesTableError(upsertErr)) {
        console.warn('[Ekklesphere] Could not upsert church_group_categories:', upsertErr.message);
      }
    }
  }

  public async getSystemSettings(organizationId: string): Promise<{
    settings: SystemSettings;
    configured: boolean;
    site: RegisteredSiteRecord | null;
    storageBackend: 'supabase' | 'sandbox_ephemeral';
  }> {
    this.assertDatabaseAvailable();
    const orgId = organizationId.toLowerCase();
    const sites = await this.getSitesForOrg(orgId);
    const activeSite = sites.find((s) => s.active) || sites[0] || null;
    const sb = this.activeSupabase;

    if (sb) {
      const { data: orgRow } = await sb
        .from('organizations')
        .select('*')
        .eq('id', orgId)
        .maybeSingle();

      const tableCategories = await this.readCustomGroupCategoriesFromTable(sb, orgId);

      if (orgRow) {
        const raw =
          orgRow.settings && typeof orgRow.settings === 'object'
            ? (orgRow.settings as Record<string, any>)
            : {};

        const settings: SystemSettings = {
          churchName: String((orgRow.name && String(orgRow.name).trim()) || raw.church_name || ''),
          churchLogoUrl: String(orgRow.logo_url ?? raw.church_logo_url ?? '').trim(),
          campusName: String(activeSite?.name ?? raw.campus_name ?? orgRow.name ?? ''),
          campusAddress: String(activeSite?.address ?? orgRow.premise_address ?? raw.campus_address ?? ''),
          campusLatitude: activeSite ? activeSite.lat : null,
          campusLongitude: activeSite ? activeSite.lng : null,
          campusLocationAccuracyM:
            typeof raw.campus_location_accuracy_m === 'number' ? raw.campus_location_accuracy_m : null,
          campusLocationUpdatedAt:
            activeSite?.updated_at || (typeof raw.campus_location_updated_at === 'string' ? raw.campus_location_updated_at : null),
          seniorPastor: String(orgRow.senior_pastor ?? raw.senior_pastor ?? ''),
          contactEmail: String(orgRow.contact_email ?? orgRow.email ?? raw.contact_email ?? ''),
          contactPhone: String(orgRow.contact_phone ?? orgRow.phone ?? raw.contact_phone ?? ''),
          timezone: String(orgRow.timezone ?? raw.timezone ?? DEFAULT_ORG_SYSTEM_SETTINGS.timezone),
          currency: String(raw.currency ?? DEFAULT_ORG_SYSTEM_SETTINGS.currency),
          outerGeofenceMeters: Number(
            activeSite?.outer_radius_m ?? orgRow.outer_geofence_m ?? raw.outer_geofence_m ?? DEFAULT_ORG_SYSTEM_SETTINGS.outerGeofenceMeters
          ),
          innerGeofenceMeters: Number(
            activeSite?.radius_m ?? orgRow.inner_geofence_m ?? raw.inner_geofence_m ?? DEFAULT_ORG_SYSTEM_SETTINGS.innerGeofenceMeters
          ),
          dwellTimeMinutes: Number(
            activeSite?.dwell_min ?? orgRow.dwell_time_min ?? raw.dwell_time_min ?? DEFAULT_ORG_SYSTEM_SETTINGS.dwellTimeMinutes
          ),
          serviceWindowBeforeMinutes: Number(
            raw.service_window_before_minutes ?? DEFAULT_ORG_SYSTEM_SETTINGS.serviceWindowBeforeMinutes
          ),
          serviceWindowAfterMinutes: Number(
            raw.service_window_after_minutes ?? DEFAULT_ORG_SYSTEM_SETTINGS.serviceWindowAfterMinutes
          ),
          bleBeaconRssiThreshold: Number(
            raw.ble_beacon_rssi_threshold ?? DEFAULT_ORG_SYSTEM_SETTINGS.bleBeaconRssiThreshold
          ),
          driveByProtection:
            typeof raw.drive_by_protection === 'boolean'
              ? raw.drive_by_protection
              : DEFAULT_ORG_SYSTEM_SETTINGS.driveByProtection,
          absenteeThresholdServices: Number(
            raw.absentee_threshold_services ?? DEFAULT_ORG_SYSTEM_SETTINGS.absenteeThresholdServices
          ),
          firstTimerFollowupHours: Number(
            raw.first_timer_followup_hours ?? DEFAULT_ORG_SYSTEM_SETTINGS.firstTimerFollowupHours
          ),
          autoAssignCellLeaders:
            typeof raw.auto_assign_cell_leaders === 'boolean'
              ? raw.auto_assign_cell_leaders
              : DEFAULT_ORG_SYSTEM_SETTINGS.autoAssignCellLeaders,
          autoMessageAbsentMembers:
            typeof raw.auto_message_absent_members === 'boolean'
              ? raw.auto_message_absent_members
              : DEFAULT_ORG_SYSTEM_SETTINGS.autoMessageAbsentMembers,
          absentMemberMessageChannel:
            raw.absent_member_message_channel === 'sms' ||
            raw.absent_member_message_channel === 'email' ||
            raw.absent_member_message_channel === 'sms_and_email'
              ? raw.absent_member_message_channel
              : DEFAULT_ORG_SYSTEM_SETTINGS.absentMemberMessageChannel,
          absentMemberMessageTemplate:
            typeof raw.absent_member_message_template === 'string' &&
            raw.absent_member_message_template.trim()
              ? raw.absent_member_message_template
              : DEFAULT_ORG_SYSTEM_SETTINGS.absentMemberMessageTemplate,
          autoSendLeaderCareReminders:
            typeof raw.auto_send_leader_care_reminders === 'boolean'
              ? raw.auto_send_leader_care_reminders
              : DEFAULT_ORG_SYSTEM_SETTINGS.autoSendLeaderCareReminders,
          requireExplicitConsent:
            typeof raw.require_explicit_consent === 'boolean'
              ? raw.require_explicit_consent
              : DEFAULT_ORG_SYSTEM_SETTINGS.requireExplicitConsent,
          auditLogRetentionDays: Number(
            raw.audit_log_retention_days ?? DEFAULT_ORG_SYSTEM_SETTINGS.auditLogRetentionDays
          ),
          sessionTimeoutMinutes: normalizeIdleTimeoutMinutes(
            raw.session_timeout_minutes ??
              orgRow.session_timeout_minutes ??
              DEFAULT_ORG_SYSTEM_SETTINGS.sessionTimeoutMinutes
          ),
          smsGatewayProvider: String(
            raw.sms_gateway_provider ?? DEFAULT_ORG_SYSTEM_SETTINGS.smsGatewayProvider
          ),
          smsSenderId: String(raw.sms_sender_id ?? DEFAULT_ORG_SYSTEM_SETTINGS.smsSenderId),
          emailGatewayProvider: String(
            raw.email_gateway_provider ?? DEFAULT_ORG_SYSTEM_SETTINGS.emailGatewayProvider
          ),
          emailFromAddress: String(
            raw.email_from_address ?? DEFAULT_ORG_SYSTEM_SETTINGS.emailFromAddress ?? ''
          ),
          emailSenderName: String(
            raw.email_sender_name ?? DEFAULT_ORG_SYSTEM_SETTINGS.emailSenderName ?? ''
          ),
          enablePushNotifications:
            typeof raw.enable_push_notifications === 'boolean'
              ? raw.enable_push_notifications
              : typeof orgRow.push_configured === 'boolean'
              ? orgRow.push_configured
              : DEFAULT_ORG_SYSTEM_SETTINGS.enablePushNotifications,
          customGroupCategories: sanitizeCustomGroupCategories([
            ...(tableCategories || []),
            ...(Array.isArray(raw.custom_group_categories)
              ? raw.custom_group_categories
              : Array.isArray(raw.customGroupCategories)
              ? raw.customGroupCategories
              : []),
          ]),
        };

        return {
          settings,
          configured: Boolean(activeSite && Number.isFinite(activeSite.lat) && Number.isFinite(activeSite.lng)),
          site: activeSite,
          storageBackend: this.storageBackend,
        };
      }
    }

    const org = this.orgs.get(orgId);
    const memPremise = this.premiseByOrg.get(orgId);
    const memSettings = this.systemSettingsByOrg.get(orgId);
    const settings: SystemSettings = {
      ...DEFAULT_ORG_SYSTEM_SETTINGS,
      ...(org
        ? {
            churchName: org.name,
            churchLogoUrl: org.logoUrl || '',
            campusName: org.city ? `${org.city} Main Campus` : org.name,
            seniorPastor: org.seniorPastor || '',
            contactEmail: org.contactEmail || '',
            contactPhone: org.contactPhone || '',
            outerGeofenceMeters: org.geofenceRadiusMeters || DEFAULT_ORG_SYSTEM_SETTINGS.outerGeofenceMeters,
          }
        : {}),
      ...(memPremise
        ? {
            churchName: memPremise.churchName || org?.name || '',
            campusName: memPremise.campusName || '',
            campusAddress: memPremise.campusAddress || '',
            campusLatitude: memPremise.lat,
            campusLongitude: memPremise.lng,
            campusLocationAccuracyM: memPremise.accuracyM,
            campusLocationUpdatedAt: memPremise.updatedAt,
            innerGeofenceMeters: memPremise.innerGeofenceMeters,
            outerGeofenceMeters: memPremise.outerGeofenceMeters,
            dwellTimeMinutes: memPremise.dwellTimeMinutes,
          }
        : {}),
      ...(memSettings || {}),
      customGroupCategories: sanitizeCustomGroupCategories(memSettings?.customGroupCategories),
    };

    if (activeSite && Number.isFinite(activeSite.lat) && Number.isFinite(activeSite.lng)) {
      settings.campusLatitude = activeSite.lat;
      settings.campusLongitude = activeSite.lng;
      settings.campusName = activeSite.name || settings.campusName;
      settings.campusAddress = activeSite.address ?? settings.campusAddress;
      settings.innerGeofenceMeters = activeSite.radius_m || settings.innerGeofenceMeters;
      settings.outerGeofenceMeters = activeSite.outer_radius_m || settings.outerGeofenceMeters;
      settings.dwellTimeMinutes = activeSite.dwell_min || settings.dwellTimeMinutes;
      settings.campusLocationUpdatedAt = activeSite.updated_at || settings.campusLocationUpdatedAt;
    }

    return {
      settings,
      configured: Boolean(
        typeof settings.campusLatitude === 'number' &&
          typeof settings.campusLongitude === 'number' &&
          Number.isFinite(settings.campusLatitude) &&
          Number.isFinite(settings.campusLongitude)
      ),
      site: activeSite,
      storageBackend: this.storageBackend,
    };
  }

  public async saveSystemSettings(
    organizationId: string,
    patch: Partial<SystemSettings>,
    actor?: { id?: string; email?: string; role?: string; name?: string; ipAddress?: string }
  ): Promise<{
    settings: SystemSettings;
    configured: boolean;
    site: RegisteredSiteRecord | null;
    storageBackend: 'supabase' | 'sandbox_ephemeral';
  }> {
    const orgId = organizationId.toLowerCase();
    const currentRes = await this.getSystemSettings(orgId);
    const current = currentRes.settings;

    const innerGeofenceMeters = Math.max(
      10,
      Math.min(5000, Math.round(Number(patch.innerGeofenceMeters ?? current.innerGeofenceMeters) || 100))
    );
    const outerGeofenceMeters = Math.max(
      innerGeofenceMeters,
      Math.min(10000, Math.round(Number(patch.outerGeofenceMeters ?? current.outerGeofenceMeters) || 300))
    );
    const dwellTimeMinutes = Math.max(
      1,
      Math.min(120, Math.round(Number(patch.dwellTimeMinutes ?? current.dwellTimeMinutes) || 5))
    );
    const serviceWindowBeforeMinutes = Math.max(
      15,
      Math.min(90, Math.round(Number(patch.serviceWindowBeforeMinutes ?? current.serviceWindowBeforeMinutes) || 45))
    );
    const serviceWindowAfterMinutes = Math.max(
      15,
      Math.min(60, Math.round(Number(patch.serviceWindowAfterMinutes ?? current.serviceWindowAfterMinutes) || 30))
    );
    const bleBeaconRssiThreshold = Math.max(
      -95,
      Math.min(-40, Math.round(Number(patch.bleBeaconRssiThreshold ?? current.bleBeaconRssiThreshold) || -70))
    );
    const absenteeThresholdServices = Math.max(
      1,
      Math.min(10, Math.round(Number(patch.absenteeThresholdServices ?? current.absenteeThresholdServices) || 2))
    );
    const firstTimerFollowupHours = Math.max(
      1,
      Math.min(168, Math.round(Number(patch.firstTimerFollowupHours ?? current.firstTimerFollowupHours) || 24))
    );
    const auditLogRetentionDays = Math.max(
      7,
      Math.min(3650, Math.round(Number(patch.auditLogRetentionDays ?? current.auditLogRetentionDays) || 90))
    );
    const sessionTimeoutMinutes = normalizeIdleTimeoutMinutes(
      patch.sessionTimeoutMinutes !== undefined
        ? patch.sessionTimeoutMinutes
        : current.sessionTimeoutMinutes
    );
    const smsSenderId = String(patch.smsSenderId ?? current.smsSenderId ?? 'EKKLESPHERE')
      .trim()
      .toUpperCase()
      .slice(0, 11);

    const merged: SystemSettings = {
      ...current,
      ...patch,
      churchName: String(patch.churchName ?? current.churchName ?? '').trim(),
      churchLogoUrl: String(patch.churchLogoUrl ?? current.churchLogoUrl ?? '').trim(),
      campusName: String(patch.campusName ?? current.campusName ?? '').trim(),
      campusAddress: String(patch.campusAddress ?? current.campusAddress ?? '').trim(),
      seniorPastor: String(patch.seniorPastor ?? current.seniorPastor ?? '').trim(),
      contactEmail: String(patch.contactEmail ?? current.contactEmail ?? '').trim(),
      contactPhone: String(patch.contactPhone ?? current.contactPhone ?? '').trim(),
      timezone: String(patch.timezone ?? current.timezone ?? DEFAULT_ORG_SYSTEM_SETTINGS.timezone).trim(),
      currency: String(patch.currency ?? current.currency ?? DEFAULT_ORG_SYSTEM_SETTINGS.currency).trim(),
      innerGeofenceMeters,
      outerGeofenceMeters,
      dwellTimeMinutes,
      serviceWindowBeforeMinutes,
      serviceWindowAfterMinutes,
      bleBeaconRssiThreshold,
      absenteeThresholdServices,
      firstTimerFollowupHours,
      auditLogRetentionDays,
      sessionTimeoutMinutes,
      smsGatewayProvider: String(
        patch.smsGatewayProvider ?? current.smsGatewayProvider ?? DEFAULT_ORG_SYSTEM_SETTINGS.smsGatewayProvider
      ).trim(),
      smsSenderId,
      emailGatewayProvider: String(
        patch.emailGatewayProvider ??
          current.emailGatewayProvider ??
          DEFAULT_ORG_SYSTEM_SETTINGS.emailGatewayProvider
      ).trim(),
      emailFromAddress: String(patch.emailFromAddress ?? current.emailFromAddress ?? '').trim(),
      emailSenderName: String(patch.emailSenderName ?? current.emailSenderName ?? '').trim(),
      driveByProtection: Boolean(patch.driveByProtection ?? current.driveByProtection),
      autoAssignCellLeaders: Boolean(patch.autoAssignCellLeaders ?? current.autoAssignCellLeaders),
      autoMessageAbsentMembers: Boolean(
        patch.autoMessageAbsentMembers ??
          current.autoMessageAbsentMembers ??
          DEFAULT_ORG_SYSTEM_SETTINGS.autoMessageAbsentMembers
      ),
      absentMemberMessageChannel:
        patch.absentMemberMessageChannel === 'sms' ||
        patch.absentMemberMessageChannel === 'email' ||
        patch.absentMemberMessageChannel === 'sms_and_email'
          ? patch.absentMemberMessageChannel
          : current.absentMemberMessageChannel || DEFAULT_ORG_SYSTEM_SETTINGS.absentMemberMessageChannel,
      absentMemberMessageTemplate:
        String(
          patch.absentMemberMessageTemplate ??
            current.absentMemberMessageTemplate ??
            DEFAULT_ABSENT_MEMBER_MESSAGE_TEMPLATE
        ).trim() || DEFAULT_ABSENT_MEMBER_MESSAGE_TEMPLATE,
      autoSendLeaderCareReminders: Boolean(
        patch.autoSendLeaderCareReminders ??
          current.autoSendLeaderCareReminders ??
          DEFAULT_ORG_SYSTEM_SETTINGS.autoSendLeaderCareReminders
      ),
      requireExplicitConsent: Boolean(patch.requireExplicitConsent ?? current.requireExplicitConsent),
      enablePushNotifications: Boolean(patch.enablePushNotifications ?? current.enablePushNotifications),
      customGroupCategories:
        patch.customGroupCategories !== undefined
          ? sanitizeCustomGroupCategories(patch.customGroupCategories)
          : sanitizeCustomGroupCategories(current.customGroupCategories),
    };

    const hasExplicitCoords =
      typeof merged.campusLatitude === 'number' &&
      typeof merged.campusLongitude === 'number' &&
      Number.isFinite(merged.campusLatitude) &&
      Number.isFinite(merged.campusLongitude);

    if (hasExplicitCoords) {
      await this.savePremiseSettings(orgId, {
        siteId: currentRes.site?.id,
        churchName: merged.churchName || '',
        campusName: merged.campusName || 'Main Campus',
        campusAddress: merged.campusAddress,
        lat: merged.campusLatitude!,
        lng: merged.campusLongitude!,
        accuracyM: merged.campusLocationAccuracyM ?? null,
        innerGeofenceMeters: merged.innerGeofenceMeters,
        outerGeofenceMeters: merged.outerGeofenceMeters,
        dwellTimeMinutes: merged.dwellTimeMinutes,
        updatedBy: actor?.name || actor?.email || 'Administrator',
      });
    } else if (patch.campusLatitude === null && patch.campusLongitude === null) {
      await this.clearPremiseSettings(orgId);
    }

    const nowIso = new Date().toISOString();
    const sb = this.activeSupabase;

    if (sb) {
      const { data: existingOrg, error: orgReadError } = await sb
        .from('organizations')
        .select('id, name, settings')
        .eq('id', orgId)
        .maybeSingle();

      if (orgReadError) {
        throw new Error(`Failed to read organization settings in Supabase: ${orgReadError.message}`);
      }
      if (!existingOrg) {
        throw new Error(`Organization record "${orgId}" not found in Supabase.`);
      }

      const existingJson =
        existingOrg?.settings && typeof existingOrg.settings === 'object'
          ? (existingOrg.settings as Record<string, unknown>)
          : {};

      const nextSettingsJson: Record<string, unknown> = {
        ...existingJson,
        church_name: merged.churchName || existingOrg?.name || '',
        church_logo_url: merged.churchLogoUrl || '',
        campus_name: merged.campusName,
        campus_address: merged.campusAddress,
        campus_location_accuracy_m: merged.campusLocationAccuracyM ?? null,
        campus_location_updated_at: merged.campusLocationUpdatedAt ?? null,
        senior_pastor: merged.seniorPastor,
        contact_email: merged.contactEmail,
        contact_phone: merged.contactPhone,
        timezone: merged.timezone,
        currency: merged.currency,
        inner_geofence_m: merged.innerGeofenceMeters,
        outer_geofence_m: merged.outerGeofenceMeters,
        dwell_time_min: merged.dwellTimeMinutes,
        service_window_before_minutes: merged.serviceWindowBeforeMinutes,
        service_window_after_minutes: merged.serviceWindowAfterMinutes,
        ble_beacon_rssi_threshold: merged.bleBeaconRssiThreshold,
        drive_by_protection: merged.driveByProtection,
        absentee_threshold_services: merged.absenteeThresholdServices,
        first_timer_followup_hours: merged.firstTimerFollowupHours,
        auto_assign_cell_leaders: merged.autoAssignCellLeaders,
        auto_message_absent_members: merged.autoMessageAbsentMembers,
        absent_member_message_channel: merged.absentMemberMessageChannel,
        absent_member_message_template: merged.absentMemberMessageTemplate,
        auto_send_leader_care_reminders: merged.autoSendLeaderCareReminders,
        require_explicit_consent: merged.requireExplicitConsent,
        audit_log_retention_days: merged.auditLogRetentionDays,
        session_timeout_minutes: merged.sessionTimeoutMinutes,
        sms_gateway_provider: merged.smsGatewayProvider,
        sms_sender_id: merged.smsSenderId,
        sms_configured: Boolean(merged.smsGatewayProvider && merged.smsSenderId),
        email_gateway_provider: merged.emailGatewayProvider || 'Resend Email',
        email_from_address: merged.emailFromAddress || '',
        email_sender_name: merged.emailSenderName || '',
        enable_push_notifications: merged.enablePushNotifications,
        push_configured: merged.enablePushNotifications,
        custom_group_categories: merged.customGroupCategories || [],
      };

      const orgUpdate: Record<string, unknown> = {
        ...(merged.churchName ? { name: merged.churchName } : {}),
        ...(patch.churchLogoUrl !== undefined ? { logo_url: merged.churchLogoUrl || null } : {}),
        senior_pastor: merged.seniorPastor || null,
        contact_email: merged.contactEmail || null,
        email: merged.contactEmail || null,
        contact_phone: merged.contactPhone || null,
        phone: merged.contactPhone || null,
        timezone: merged.timezone,
        premise_address: merged.campusAddress || null,
        inner_geofence_m: merged.innerGeofenceMeters,
        outer_geofence_m: merged.outerGeofenceMeters,
        dwell_time_min: merged.dwellTimeMinutes,
        session_timeout_minutes: merged.sessionTimeoutMinutes,
        sms_configured: Boolean(merged.smsGatewayProvider && merged.smsSenderId),
        push_configured: merged.enablePushNotifications,
        settings: nextSettingsJson,
        updated_at: nowIso,
      };

      let { error } = await sb.from('organizations').update(orgUpdate).eq('id', orgId);

      for (let attempt = 0; attempt < 4 && error; attempt++) {
        const msg = error.message || '';
        const colMatch =
          msg.match(/Could not find the '([^']+)' column/i) ||
          msg.match(/column "([^"]+)"(?: of relation "[^"]+")? does not exist/i);
        if (colMatch && colMatch[1] && Object.prototype.hasOwnProperty.call(orgUpdate, colMatch[1])) {
          delete orgUpdate[colMatch[1]];
          const retry = await sb.from('organizations').update(orgUpdate).eq('id', orgId);
          error = retry.error;
          continue;
        }
        break;
      }

      if (error) {
        throw new Error(`Failed to save system settings in Supabase: ${error.message}`);
      }

      if (patch.customGroupCategories !== undefined) {
        await this.syncCustomGroupCategoriesToTable(sb, orgId, merged.customGroupCategories || []);
      }
    } else {
      this.systemSettingsByOrg.set(orgId, merged);

      const existingPremise = this.premiseByOrg.get(orgId);
      if (existingPremise) {
        this.premiseByOrg.set(orgId, {
          ...existingPremise,
          churchName: merged.churchName || existingPremise.churchName,
          campusName: merged.campusName || existingPremise.campusName,
          campusAddress: merged.campusAddress,
          innerGeofenceMeters: merged.innerGeofenceMeters,
          outerGeofenceMeters: merged.outerGeofenceMeters,
          dwellTimeMinutes: merged.dwellTimeMinutes,
          updatedAt: nowIso,
        });
      }

      const memOrg = this.orgs.get(orgId);
      if (memOrg) {
        if (merged.churchName) memOrg.name = merged.churchName;
        if (patch.churchLogoUrl !== undefined) memOrg.logoUrl = merged.churchLogoUrl || undefined;
        memOrg.seniorPastor = merged.seniorPastor;
        memOrg.contactEmail = merged.contactEmail;
        memOrg.contactPhone = merged.contactPhone;
        memOrg.geofenceRadiusMeters = merged.outerGeofenceMeters;
        memOrg.smsConfigured = Boolean(merged.smsGatewayProvider && merged.smsSenderId);
        memOrg.pushConfigured = merged.enablePushNotifications;
      }
    }

    await this.appendAuditLog({
      organizationId: orgId,
      actorId: actor?.id || null,
      actorEmail: actor?.email || 'admin@ekklesphere.church',
      actorRole: actor?.role || 'admin',
      action: 'system_settings.updated',
      targetType: 'organization_settings',
      targetId: orgId,
      metadata: {
        campusName: merged.campusName,
        innerGeofenceMeters: merged.innerGeofenceMeters,
        outerGeofenceMeters: merged.outerGeofenceMeters,
        dwellTimeMinutes: merged.dwellTimeMinutes,
        smsGatewayProvider: merged.smsGatewayProvider,
        requireExplicitConsent: merged.requireExplicitConsent,
        auditLogRetentionDays: merged.auditLogRetentionDays,
      },
      ipAddress: actor?.ipAddress || null,
    });

    return this.getSystemSettings(orgId);
  }

  public async resetSystemSettings(
    organizationId: string,
    actor?: { id?: string; email?: string; role?: string; name?: string; ipAddress?: string }
  ): Promise<{
    settings: SystemSettings;
    configured: boolean;
    site: RegisteredSiteRecord | null;
    storageBackend: 'supabase' | 'sandbox_ephemeral';
  }> {
    const orgId = organizationId.toLowerCase();
    await this.clearPremiseSettings(orgId);

    const org = await this.getOrganisationById(orgId);
    const resetValues: SystemSettings = {
      ...DEFAULT_ORG_SYSTEM_SETTINGS,
      churchName: org?.name || '',
    };

    const sb = this.activeSupabase;
    if (sb) {
      const nowIso = new Date().toISOString();
      const { data: existingOrg } = await sb
        .from('organizations')
        .select('name, settings')
        .eq('id', orgId)
        .maybeSingle();

      const existingJson =
        existingOrg?.settings && typeof existingOrg.settings === 'object'
          ? (existingOrg.settings as Record<string, unknown>)
          : {};

      const resetSettingsJson: Record<string, unknown> = {
        ...existingJson,
        campus_name: '',
        campus_address: '',
        campus_location_accuracy_m: null,
        campus_location_updated_at: null,
        senior_pastor: '',
        contact_email: '',
        contact_phone: '',
        timezone: DEFAULT_ORG_SYSTEM_SETTINGS.timezone,
        currency: DEFAULT_ORG_SYSTEM_SETTINGS.currency,
        inner_geofence_m: DEFAULT_ORG_SYSTEM_SETTINGS.innerGeofenceMeters,
        outer_geofence_m: DEFAULT_ORG_SYSTEM_SETTINGS.outerGeofenceMeters,
        dwell_time_min: DEFAULT_ORG_SYSTEM_SETTINGS.dwellTimeMinutes,
        service_window_before_minutes: DEFAULT_ORG_SYSTEM_SETTINGS.serviceWindowBeforeMinutes,
        service_window_after_minutes: DEFAULT_ORG_SYSTEM_SETTINGS.serviceWindowAfterMinutes,
        ble_beacon_rssi_threshold: DEFAULT_ORG_SYSTEM_SETTINGS.bleBeaconRssiThreshold,
        drive_by_protection: DEFAULT_ORG_SYSTEM_SETTINGS.driveByProtection,
        absentee_threshold_services: DEFAULT_ORG_SYSTEM_SETTINGS.absenteeThresholdServices,
        first_timer_followup_hours: DEFAULT_ORG_SYSTEM_SETTINGS.firstTimerFollowupHours,
        auto_assign_cell_leaders: DEFAULT_ORG_SYSTEM_SETTINGS.autoAssignCellLeaders,
        require_explicit_consent: DEFAULT_ORG_SYSTEM_SETTINGS.requireExplicitConsent,
        audit_log_retention_days: DEFAULT_ORG_SYSTEM_SETTINGS.auditLogRetentionDays,
        session_timeout_minutes: DEFAULT_IDLE_SESSION_TIMEOUT_MINUTES,
        sms_gateway_provider: DEFAULT_ORG_SYSTEM_SETTINGS.smsGatewayProvider,
        sms_sender_id: DEFAULT_ORG_SYSTEM_SETTINGS.smsSenderId,
        enable_push_notifications: DEFAULT_ORG_SYSTEM_SETTINGS.enablePushNotifications,
        custom_group_categories: [],
      };

      const orgResetPatch: Record<string, unknown> = {
        senior_pastor: null,
        contact_email: null,
        contact_phone: null,
        timezone: DEFAULT_ORG_SYSTEM_SETTINGS.timezone,
        premise_address: null,
        inner_geofence_m: DEFAULT_ORG_SYSTEM_SETTINGS.innerGeofenceMeters,
        outer_geofence_m: DEFAULT_ORG_SYSTEM_SETTINGS.outerGeofenceMeters,
        dwell_time_min: DEFAULT_ORG_SYSTEM_SETTINGS.dwellTimeMinutes,
        sms_configured: true,
        push_configured: true,
        settings: resetSettingsJson,
        updated_at: nowIso,
      };

      let { error } = await sb.from('organizations').update(orgResetPatch).eq('id', orgId);
      for (let attempt = 0; attempt < 3 && error; attempt++) {
        const msg = error.message || '';
        const colMatch =
          msg.match(/Could not find the '([^']+)' column/i) ||
          msg.match(/column "([^"]+)"(?: of relation "[^"]+")? does not exist/i);
        if (colMatch && colMatch[1] && Object.prototype.hasOwnProperty.call(orgResetPatch, colMatch[1])) {
          delete orgResetPatch[colMatch[1]];
          const retry = await sb.from('organizations').update(orgResetPatch).eq('id', orgId);
          error = retry.error;
          continue;
        }
        break;
      }
      await this.syncCustomGroupCategoriesToTable(sb, orgId, []);
    } else {
      this.systemSettingsByOrg.set(orgId, resetValues);
      this.premiseByOrg.delete(orgId);
    }

    await this.appendAuditLog({
      organizationId: orgId,
      actorId: actor?.id || null,
      actorEmail: actor?.email || 'admin@ekklesphere.church',
      actorRole: actor?.role || 'admin',
      action: 'system_settings.reset',
      targetType: 'organization_settings',
      targetId: orgId,
      metadata: {
        resetAt: new Date().toISOString(),
      },
      ipAddress: actor?.ipAddress || null,
    });

    return this.getSystemSettings(orgId);
  }

  private isMissingTenantGatewaySecretsTableError(err: { message?: string; code?: string } | null | undefined): boolean {
    if (!err) return false;
    const msg = `${err.code || ''} ${err.message || ''}`;
    return /tenant_gateway_secrets/i.test(msg) && /does not exist|schema cache|42P01|PGRST205/i.test(msg);
  }

  private async readEncryptedGatewayRow(organizationId: string): Promise<{
    arkeselApiKeyEnc?: string | null;
    arkeselApiKeyMasked?: string | null;
    paystackPublicKey?: string | null;
    paystackSecretKeyEnc?: string | null;
    paystackSecretKeyMasked?: string | null;
    updatedBy?: string | null;
    updatedAt?: string | null;
  }> {
    const orgId = (organizationId || '').trim().toLowerCase();
    if (!orgId) return {};
    const sb = this.activeSupabase;

    if (sb) {
      if (!UUID_REGEX.test(orgId)) return {};
      const { data, error } = await sb
        .from('tenant_gateway_secrets')
        .select('*')
        .eq('organization_id', orgId)
        .maybeSingle();

      if (!error && data) {
        return {
          arkeselApiKeyEnc: data.arkesel_api_key_enc || null,
          arkeselApiKeyMasked: data.arkesel_api_key_masked || null,
          paystackPublicKey: data.paystack_public_key || null,
          paystackSecretKeyEnc: data.paystack_secret_key_enc || null,
          paystackSecretKeyMasked: data.paystack_secret_key_masked || null,
          updatedBy: data.updated_by || null,
          updatedAt: data.updated_at ? String(data.updated_at) : null,
        };
      }

      if (error && !this.isMissingTenantGatewaySecretsTableError(error)) {
        throw new Error(`Failed to read tenant gateway keys: ${error.message}`);
      }

      // Graceful fallback when migration hasn't run yet: store encrypted blobs in organizations.settings._encrypted_gateway_secrets
      const { data: orgRow } = await sb
        .from('organizations')
        .select('settings')
        .eq('id', orgId)
        .maybeSingle();

      const rawSettings =
        orgRow?.settings && typeof orgRow.settings === 'object'
          ? (orgRow.settings as Record<string, any>)
          : {};
      const embedded = rawSettings._encrypted_gateway_secrets;
      if (embedded && typeof embedded === 'object') {
        return {
          arkeselApiKeyEnc: embedded.arkesel_api_key_enc || null,
          arkeselApiKeyMasked: embedded.arkesel_api_key_masked || null,
          paystackPublicKey: embedded.paystack_public_key || null,
          paystackSecretKeyEnc: embedded.paystack_secret_key_enc || null,
          paystackSecretKeyMasked: embedded.paystack_secret_key_masked || null,
          updatedBy: embedded.updated_by || null,
          updatedAt: embedded.updated_at ? String(embedded.updated_at) : null,
        };
      }
      return {};
    }

    return this.gatewaySecretsByOrg.get(orgId) || {};
  }

  public async getTenantGatewayConfigSummary(organizationId: string): Promise<TenantGatewayConfigSummary> {
    this.assertDatabaseAvailable();
    const orgId = (organizationId || '').trim().toLowerCase();
    const row = orgId ? await this.readEncryptedGatewayRow(orgId) : {};

    const tenantArkesel = unsealTenantSecret(row.arkeselApiKeyEnc);
    const envArkesel = (process.env.ARKESEL_API_KEY || '').trim();
    const arkeselSource: 'tenant' | 'platform_env' | 'none' = tenantArkesel
      ? 'tenant'
      : envArkesel
      ? 'platform_env'
      : 'none';

    const tenantPaystackSecret = unsealTenantSecret(row.paystackSecretKeyEnc);
    const tenantPaystackPublic = String(row.paystackPublicKey || '').trim();
    const envPaystackSecret = (process.env.PAYSTACK_SECRET_KEY || '').trim();
    const envPaystackPublic = (process.env.PAYSTACK_PUBLIC_KEY || '').trim();

    const paystackSource: 'tenant' | 'platform_env' | 'none' = tenantPaystackSecret
      ? 'tenant'
      : envPaystackSecret
      ? 'platform_env'
      : 'none';

    const effectivePublicKey = tenantPaystackPublic || envPaystackPublic || '';
    const effectiveSecret = tenantPaystackSecret || envPaystackSecret || '';

    return {
      arkeselConfigured: arkeselSource !== 'none',
      arkeselSource,
      arkeselKeyMasked: tenantArkesel
        ? row.arkeselApiKeyMasked || maskSecretTail(tenantArkesel)
        : envArkesel
        ? maskSecretTail(envArkesel)
        : null,
      paystackConfigured: paystackSource !== 'none',
      paystackSource,
      paystackPublicKey: effectivePublicKey,
      paystackSecretMasked: tenantPaystackSecret
        ? row.paystackSecretKeyMasked || maskSecretTail(tenantPaystackSecret)
        : envPaystackSecret
        ? maskSecretTail(envPaystackSecret)
        : null,
      paystackMode: detectPaystackMode(effectivePublicKey, effectiveSecret),
      updatedAt: row.updatedAt || null,
    };
  }

  public async getResolvedArkeselApiKey(organizationId: string): Promise<{
    apiKey: string;
    source: 'tenant' | 'platform_env' | 'none';
  }> {
    this.assertDatabaseAvailable();
    const orgId = (organizationId || '').trim().toLowerCase();
    if (orgId) {
      const row = await this.readEncryptedGatewayRow(orgId);
      const tenantKey = unsealTenantSecret(row.arkeselApiKeyEnc);
      if (tenantKey) {
        return { apiKey: tenantKey, source: 'tenant' };
      }
    }
    const envKey = (process.env.ARKESEL_API_KEY || '').trim();
    if (envKey) {
      return { apiKey: envKey, source: 'platform_env' };
    }
    return { apiKey: '', source: 'none' };
  }

  public async getResolvedPaystackKeys(organizationId: string): Promise<{
    publicKey: string;
    secretKey: string;
    source: 'tenant' | 'platform_env' | 'none';
  }> {
    this.assertDatabaseAvailable();
    const orgId = (organizationId || '').trim().toLowerCase();
    if (orgId) {
      const row = await this.readEncryptedGatewayRow(orgId);
      const tenantSecret = unsealTenantSecret(row.paystackSecretKeyEnc);
      const tenantPublic = String(row.paystackPublicKey || '').trim();
      if (tenantSecret) {
        return {
          publicKey: tenantPublic,
          secretKey: tenantSecret,
          source: 'tenant',
        };
      }
    }
    const envSecret = (process.env.PAYSTACK_SECRET_KEY || '').trim();
    const envPublic = (process.env.PAYSTACK_PUBLIC_KEY || '').trim();
    if (envSecret) {
      return {
        publicKey: envPublic,
        secretKey: envSecret,
        source: 'platform_env',
      };
    }
    return { publicKey: '', secretKey: '', source: 'none' };
  }

  public async saveTenantGatewayKeys(
    organizationId: string,
    patch: {
      arkeselApiKey?: string;
      clearArkeselApiKey?: boolean;
      paystackPublicKey?: string;
      paystackSecretKey?: string;
      clearPaystackKeys?: boolean;
    },
    actor?: { id?: string; email?: string; role?: string; name?: string; ipAddress?: string }
  ): Promise<TenantGatewayConfigSummary> {
    this.assertDatabaseAvailable();
    const orgId = (organizationId || '').trim().toLowerCase();
    if (!orgId) {
      throw new Error('Organization ID is required to save gateway API keys.');
    }

    const existing = await this.readEncryptedGatewayRow(orgId);
    const nowIso = new Date().toISOString();

    let nextArkeselEnc = existing.arkeselApiKeyEnc || null;
    let nextArkeselMasked = existing.arkeselApiKeyMasked || null;
    if (patch.clearArkeselApiKey) {
      nextArkeselEnc = null;
      nextArkeselMasked = null;
    } else if (typeof patch.arkeselApiKey === 'string' && patch.arkeselApiKey.trim()) {
      const clean = patch.arkeselApiKey.trim();
      nextArkeselEnc = sealTenantSecret(clean);
      nextArkeselMasked = maskSecretTail(clean);
    }

    let nextPaystackPublic = existing.paystackPublicKey || null;
    let nextPaystackSecretEnc = existing.paystackSecretKeyEnc || null;
    let nextPaystackSecretMasked = existing.paystackSecretKeyMasked || null;
    if (patch.clearPaystackKeys) {
      nextPaystackPublic = null;
      nextPaystackSecretEnc = null;
      nextPaystackSecretMasked = null;
    } else {
      if (typeof patch.paystackPublicKey === 'string') {
        const cleanPub = patch.paystackPublicKey.trim();
        nextPaystackPublic = cleanPub || null;
      }
      if (typeof patch.paystackSecretKey === 'string' && patch.paystackSecretKey.trim()) {
        const cleanSec = patch.paystackSecretKey.trim();
        nextPaystackSecretEnc = sealTenantSecret(cleanSec);
        nextPaystackSecretMasked = maskSecretTail(cleanSec);
      }
    }

    const updatedBy = actor?.email || actor?.name || 'Administrator';
    const sb = this.activeSupabase;

    if (sb) {
      if (!UUID_REGEX.test(orgId)) {
        throw new Error('Valid organization UUID is required.');
      }
      const { error } = await sb.from('tenant_gateway_secrets').upsert(
        {
          organization_id: orgId,
          arkesel_api_key_enc: nextArkeselEnc,
          arkesel_api_key_masked: nextArkeselMasked,
          paystack_public_key: nextPaystackPublic,
          paystack_secret_key_enc: nextPaystackSecretEnc,
          paystack_secret_key_masked: nextPaystackSecretMasked,
          updated_by: updatedBy,
          updated_at: nowIso,
        },
        { onConflict: 'organization_id' }
      );

      if (error) {
        if (!this.isMissingTenantGatewaySecretsTableError(error)) {
          throw new Error(`Failed to persist tenant gateway keys in Supabase: ${error.message}`);
        }
        // Fallback into organizations.settings._encrypted_gateway_secrets when migration pending
        const { data: orgRow } = await sb
          .from('organizations')
          .select('settings')
          .eq('id', orgId)
          .maybeSingle();
        const rawSettings =
          orgRow?.settings && typeof orgRow.settings === 'object'
            ? (orgRow.settings as Record<string, unknown>)
            : {};
        const nextSettings = {
          ...rawSettings,
          _encrypted_gateway_secrets: {
            arkesel_api_key_enc: nextArkeselEnc,
            arkesel_api_key_masked: nextArkeselMasked,
            paystack_public_key: nextPaystackPublic,
            paystack_secret_key_enc: nextPaystackSecretEnc,
            paystack_secret_key_masked: nextPaystackSecretMasked,
            updated_by: updatedBy,
            updated_at: nowIso,
          },
        };
        const { error: orgErr } = await sb
          .from('organizations')
          .update({ settings: nextSettings, sms_configured: Boolean(nextArkeselEnc), updated_at: nowIso })
          .eq('id', orgId);
        if (orgErr) {
          throw new Error(`Failed to save gateway keys on organization: ${orgErr.message}`);
        }
      } else {
        await sb
          .from('organizations')
          .update({ sms_configured: Boolean(nextArkeselEnc), updated_at: nowIso })
          .eq('id', orgId);
      }
    } else {
      this.gatewaySecretsByOrg.set(orgId, {
        arkeselApiKeyEnc: nextArkeselEnc,
        arkeselApiKeyMasked: nextArkeselMasked,
        paystackPublicKey: nextPaystackPublic,
        paystackSecretKeyEnc: nextPaystackSecretEnc,
        paystackSecretKeyMasked: nextPaystackSecretMasked,
        updatedBy,
        updatedAt: nowIso,
      });
      const memOrg = this.orgs.get(orgId);
      if (memOrg) {
        memOrg.smsConfigured = Boolean(nextArkeselEnc);
      }
    }

    await this.appendAuditLog({
      organizationId: orgId,
      actorId: actor?.id || null,
      actorEmail: actor?.email || 'admin@ekklesphere.church',
      actorRole: actor?.role || 'admin',
      action: 'gateways.keys_updated',
      targetType: 'tenant_gateway_secrets',
      targetId: orgId,
      metadata: {
        arkeselUpdated: Boolean(patch.arkeselApiKey || patch.clearArkeselApiKey),
        arkeselCleared: Boolean(patch.clearArkeselApiKey),
        paystackUpdated: Boolean(
          patch.paystackPublicKey !== undefined || patch.paystackSecretKey || patch.clearPaystackKeys
        ),
        paystackCleared: Boolean(patch.clearPaystackKeys),
      },
      ipAddress: actor?.ipAddress || null,
    });

    return this.getTenantGatewayConfigSummary(orgId);
  }

  private mapSupabaseChurchGroupRow(row: Record<string, any>): ChurchGroup {
    return {
      id: String(row.id),
      name: String(row.name),
      category: (row.category || 'cell_group') as ChurchGroupCategory,
      leaderName: String(row.leader_name || ''),
      leaderMemberId: row.leader_member_id ? String(row.leader_member_id) : undefined,
      leaderPhone: row.leader_phone || undefined,
      leaderEmail: row.leader_email || undefined,
      assistantLeader: row.assistant_leader || undefined,
      assistantLeaderMemberId: row.assistant_leader_member_id
        ? String(row.assistant_leader_member_id)
        : undefined,
      meetingDay: row.meeting_day || undefined,
      meetingTime: row.meeting_time || undefined,
      meetingLocation: row.meeting_location || undefined,
      targetDemographic: row.target_demographic || undefined,
      description: String(row.description || ''),
      active: Boolean(row.active ?? true),
      createdAt: String(row.created_at || new Date().toISOString()).slice(0, 10),
      updatedAt: row.updated_at ? String(row.updated_at).slice(0, 10) : undefined,
    };
  }

  private mapSupabaseLeadershipHistoryRow(
    row: Record<string, any>
  ): ChurchGroupLeadershipHistoryEntry {
    return {
      id: String(row.id),
      organizationId: row.organization_id ? String(row.organization_id) : undefined,
      groupId: String(row.group_id),
      groupName: String(row.group_name),
      category: (row.category || 'cell_group') as ChurchGroupCategory,
      role: (row.role || 'primary_leader') as ChurchGroupLeadershipRole,
      action: (row.action || 'changed') as ChurchGroupLeadershipAction,
      previousLeaderName: row.previous_leader_name ?? null,
      previousLeaderMemberId: row.previous_leader_member_id ?? null,
      newLeaderName: row.new_leader_name ?? null,
      newLeaderMemberId: row.new_leader_member_id ?? null,
      changedById: row.changed_by_id ?? null,
      changedByName: row.changed_by_name ?? null,
      changedByEmail: row.changed_by_email ?? null,
      changedByRole: row.changed_by_role ?? null,
      reason: row.reason ?? null,
      createdAt: String(row.created_at || new Date().toISOString()),
    };
  }

  private mapAuditLogRowToLeadershipHistoryEntry(
    row: Record<string, any>
  ): ChurchGroupLeadershipHistoryEntry | null {
    const meta = (row.metadata && typeof row.metadata === 'object' ? row.metadata : {}) as Record<
      string,
      any
    >;
    const groupId = meta.groupId ?? row.target_id;
    const groupName = meta.groupName;
    if (!groupId || !groupName) return null;
    return {
      id: String(row.id || randomUUID()),
      organizationId: row.organization_id ? String(row.organization_id) : undefined,
      groupId: String(groupId),
      groupName: String(groupName),
      category: (meta.category || 'cell_group') as ChurchGroupCategory,
      role: (meta.role || 'primary_leader') as ChurchGroupLeadershipRole,
      action: (meta.action || 'changed') as ChurchGroupLeadershipAction,
      previousLeaderName: meta.previousLeaderName ?? null,
      previousLeaderMemberId: meta.previousLeaderMemberId ?? null,
      newLeaderName: meta.newLeaderName ?? null,
      newLeaderMemberId: meta.newLeaderMemberId ?? null,
      changedById: meta.changedById ?? row.actor_id ?? null,
      changedByName: meta.changedByName ?? row.actor_email ?? null,
      changedByEmail: meta.changedByEmail ?? row.actor_email ?? null,
      changedByRole: meta.changedByRole ?? row.actor_role ?? null,
      reason: meta.reason ?? row.reason ?? null,
      createdAt: String(meta.createdAt || row.created_at || new Date().toISOString()),
    };
  }

  private isMissingChurchGroupColumnError(
    err: { message?: string; code?: string } | null | undefined
  ): boolean {
    if (!err) return false;
    const msg = String(err.message || '');
    const code = String(err.code || '');
    return (
      code === 'PGRST204' ||
      code === '42703' ||
      /column .* does not exist|Could not find the '[^']+' column|schema cache/i.test(msg)
    );
  }

  private isMissingLeadershipHistoryTableError(
    err: { message?: string; code?: string } | null | undefined
  ): boolean {
    if (!err) return false;
    const msg = String(err.message || '');
    const code = String(err.code || '');
    return (
      code === 'PGRST205' ||
      code === '42P01' ||
      /relation "?(?:public\.)?church_group_leadership_history"? does not exist|Could not find the table '?(?:public\.)?church_group_leadership_history'?|does not exist|schema cache/i.test(
        msg
      )
    );
  }

  private normalizeLeaderNameForCompare(value?: string | null): string {
    return String(value || '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();
  }

  private isDifferentLeader(
    prevName?: string | null,
    prevMemberId?: string | null,
    nextName?: string | null,
    nextMemberId?: string | null
  ): boolean {
    const cleanPrevName = this.normalizeLeaderNameForCompare(prevName);
    const cleanNextName = this.normalizeLeaderNameForCompare(nextName);
    if (!cleanPrevName && !cleanNextName) return false;
    if (Boolean(cleanPrevName) !== Boolean(cleanNextName)) return true;
    const cleanPrevId = (prevMemberId || '').trim();
    const cleanNextId = (nextMemberId || '').trim();
    if (cleanPrevId && cleanNextId) {
      return cleanPrevId !== cleanNextId;
    }
    return cleanPrevName !== cleanNextName;
  }

  public async resolveOrganizationLeaderMember(
    organizationId: string,
    opts: {
      memberId?: string | null;
      leaderName?: string | null;
      fieldLabel?: 'leader' | 'assistantLeader';
    }
  ): Promise<{
    id: string;
    fullName: string;
    phoneE164?: string;
    email?: string;
  }> {
    this.assertDatabaseAvailable();
    const orgId = organizationId.toLowerCase();
    const field = opts.fieldLabel || 'leader';
    const rawId = String(opts.memberId || '').trim();
    const rawName = String(opts.leaderName || '')
      .trim()
      .replace(/\s+/g, ' ');

    const members = await this.getMembers(orgId);
    const buildResult = (m: Record<string, any>) => ({
      id: String(m.id),
      fullName: `${String(m.firstName || '').trim()} ${String(m.lastName || '').trim()}`.trim(),
      phoneE164: m.phoneE164 ? String(m.phoneE164) : undefined,
      email: m.email ? String(m.email) : undefined,
    });

    if (rawId) {
      const byId = members.find(
        (m) => String(m.id) === rawId || (m.memberId && String(m.memberId) === rawId)
      );
      if (byId) {
        const res = buildResult(byId);
        const preferred = String(byId.preferredName || '')
          .trim()
          .replace(/\s+/g, ' ')
          .toLowerCase();
        if (
          !rawName ||
          res.fullName.toLowerCase() === rawName.toLowerCase() ||
          (preferred && preferred === rawName.toLowerCase()) ||
          String(byId.id).toLowerCase() === rawName.toLowerCase() ||
          (byId.memberId && String(byId.memberId).toLowerCase() === rawName.toLowerCase())
        ) {
          return res;
        }
      }
    }

    if (!rawName) {
      const err: any = new Error(
        field === 'assistantLeader'
          ? 'Assistant leader must match an enrolled member or be left blank.'
          : 'Primary leader must be selected from the enrolled members list.'
      );
      err.status = 400;
      err.code = 'INVALID_LEADER_MEMBER';
      err.field = field;
      throw err;
    }

    if (members.length === 0) {
      const err: any = new Error(
        'Cannot assign a group leader because no members are enrolled in this organisation yet.'
      );
      err.status = 400;
      err.code = 'INVALID_LEADER_MEMBER';
      err.field = field;
      throw err;
    }

    const targetLower = rawName.toLowerCase();
    const exactFullMatches = members.filter((m) => {
      const fullName = `${String(m.firstName || '').trim()} ${String(m.lastName || '').trim()}`
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();
      return fullName === targetLower;
    });

    if (exactFullMatches.length === 1) {
      return buildResult(exactFullMatches[0]);
    }
    if (exactFullMatches.length > 1) {
      const err: any = new Error(
        `Multiple members match "${rawName}". Please select the specific member from the directory list.`
      );
      err.status = 400;
      err.code = 'AMBIGUOUS_LEADER_MEMBER';
      err.field = field;
      throw err;
    }

    const secondaryMatches = members.filter((m) => {
      const preferred = String(m.preferredName || '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();
      const memberCode = String(m.memberId || '').trim().toLowerCase();
      const email = String(m.email || '').trim().toLowerCase();
      return (
        (preferred && preferred === targetLower) ||
        (memberCode && memberCode === targetLower) ||
        (email && email === targetLower)
      );
    });

    if (secondaryMatches.length === 1) {
      return buildResult(secondaryMatches[0]);
    }

    const err: any = new Error(
      `"${rawName}" was not found in the organisation's enrolled members directory.`
    );
    err.status = 400;
    err.code = 'INVALID_LEADER_MEMBER';
    err.field = field;
    throw err;
  }

  private async appendChurchGroupLeadershipHistory(
    organizationId: string,
    entries: Array<{
      groupId: string;
      groupName: string;
      category: ChurchGroupCategory;
      role: ChurchGroupLeadershipRole;
      action: ChurchGroupLeadershipAction;
      previousLeaderName?: string | null;
      previousLeaderMemberId?: string | null;
      newLeaderName?: string | null;
      newLeaderMemberId?: string | null;
      changedById?: string | null;
      changedByName?: string | null;
      changedByEmail?: string | null;
      changedByRole?: string | null;
      reason?: string | null;
    }>
  ): Promise<void> {
    if (entries.length === 0) return;
    const orgId = organizationId.toLowerCase();
    const baseMs = Date.now();
    const sb = this.activeSupabase;

    const normalizedEntries: ChurchGroupLeadershipHistoryEntry[] = entries.map((e, index) => ({
      id: randomUUID(),
      organizationId: orgId,
      groupId: String(e.groupId),
      groupName: String(e.groupName),
      category: e.category,
      role: e.role,
      action: e.action,
      previousLeaderName: e.previousLeaderName ?? null,
      previousLeaderMemberId: e.previousLeaderMemberId ?? null,
      newLeaderName: e.newLeaderName ?? null,
      newLeaderMemberId: e.newLeaderMemberId ?? null,
      changedById: e.changedById ?? null,
      changedByName: e.changedByName ?? null,
      changedByEmail: e.changedByEmail ?? null,
      changedByRole: e.changedByRole ?? null,
      reason: e.reason ?? null,
      createdAt: new Date(baseMs + index).toISOString(),
    }));

    if (sb) {
      const dbRows = normalizedEntries.map((e) => ({
        organization_id: orgId,
        group_id: e.groupId,
        group_name: e.groupName,
        category: e.category,
        role: e.role,
        action: e.action,
        previous_leader_name: e.previousLeaderName ?? null,
        previous_leader_member_id: e.previousLeaderMemberId ?? null,
        new_leader_name: e.newLeaderName ?? null,
        new_leader_member_id: e.newLeaderMemberId ?? null,
        changed_by_id: e.changedById ?? null,
        changed_by_name: e.changedByName ?? null,
        changed_by_email: e.changedByEmail ?? null,
        changed_by_role: e.changedByRole ?? null,
        reason: e.reason ?? null,
        created_at: e.createdAt,
      }));
      const { error } = await sb
        .from('church_group_leadership_history')
        .insert(dbRows);
      if (error) {
        const isCategoryConstraintError =
          String(error.code || '') === '23514' && /category/i.test(String(error.message || ''));
        if (this.isMissingLeadershipHistoryTableError(error) || isCategoryConstraintError) {
          console.warn(
            '[Ekklesphere] church_group_leadership_history unable to accept entry directly; persisting transition to audit_log fallback:',
            error.message
          );
          for (const entry of normalizedEntries) {
            await this.appendAuditLog({
              organizationId: orgId,
              actorId: entry.changedById ?? null,
              actorEmail: entry.changedByEmail || 'system@ekklesphere.local',
              actorRole: entry.changedByRole || 'admin',
              action: 'church_group.leadership_transition',
              targetType: 'church_group',
              targetId: entry.groupId,
              reason: entry.reason ?? null,
              metadata: {
                groupId: entry.groupId,
                groupName: entry.groupName,
                category: entry.category,
                role: entry.role,
                action: entry.action,
                previousLeaderName: entry.previousLeaderName ?? null,
                previousLeaderMemberId: entry.previousLeaderMemberId ?? null,
                newLeaderName: entry.newLeaderName ?? null,
                newLeaderMemberId: entry.newLeaderMemberId ?? null,
                changedById: entry.changedById ?? null,
                changedByName: entry.changedByName ?? null,
                changedByEmail: entry.changedByEmail ?? null,
                changedByRole: entry.changedByRole ?? null,
                reason: entry.reason ?? null,
                createdAt: entry.createdAt,
              },
            });
          }
          const existing = this.churchGroupLeadershipHistoryByOrg.get(orgId) || [];
          this.churchGroupLeadershipHistoryByOrg.set(orgId, [
            ...[...normalizedEntries].reverse(),
            ...existing,
          ]);
          return;
        }
        throw new Error(`Failed to record leadership history in Supabase: ${error.message}`);
      }
      return;
    }

    const existing = this.churchGroupLeadershipHistoryByOrg.get(orgId) || [];
    this.churchGroupLeadershipHistoryByOrg.set(orgId, [
      ...[...normalizedEntries].reverse(),
      ...existing,
    ]);
  }

  public async listChurchGroupLeadershipHistory(
    organizationId: string,
    options?: {
      category?: ChurchGroupCategory | 'all';
      groupId?: string;
      role?: ChurchGroupLeadershipRole | 'all';
      limit?: number;
    }
  ): Promise<ChurchGroupLeadershipHistoryEntry[]> {
    this.assertDatabaseAvailable();
    const orgId = organizationId.toLowerCase();
    const limit = Math.min(Math.max(options?.limit ?? 200, 1), 500);
    const category = options?.category && options.category !== 'all' ? options.category : undefined;
    const groupId = options?.groupId?.trim() || undefined;
    const role = options?.role && options.role !== 'all' ? options.role : undefined;
    const sb = this.activeSupabase;

    const filterAndSort = (items: ChurchGroupLeadershipHistoryEntry[]) =>
      items
        .filter((entry) => {
          if (category && entry.category !== category) return false;
          if (groupId && entry.groupId !== groupId) return false;
          if (role && entry.role !== role) return false;
          return true;
        })
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
        .slice(0, limit);

    if (sb) {
      let query = sb
        .from('church_group_leadership_history')
        .select('*')
        .eq('organization_id', orgId);

      if (category) query = query.eq('category', category);
      if (groupId) query = query.eq('group_id', groupId);
      if (role) query = query.eq('role', role);

      const { data, error } = await query
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) {
        if (this.isMissingLeadershipHistoryTableError(error)) {
          const fallbackEntries: ChurchGroupLeadershipHistoryEntry[] = [];
          const { data: auditRows, error: auditErr } = await sb
            .from('audit_log')
            .select('*')
            .eq('organization_id', orgId)
            .eq('action', 'church_group.leadership_transition')
            .order('created_at', { ascending: false })
            .limit(Math.min(limit * 3, 500));
          if (!auditErr && Array.isArray(auditRows)) {
            for (const row of auditRows) {
              const mapped = this.mapAuditLogRowToLeadershipHistoryEntry(row);
              if (mapped) fallbackEntries.push(mapped);
            }
          }
          const inMem = this.churchGroupLeadershipHistoryByOrg.get(orgId) || [];
          const seen = new Set(fallbackEntries.map((e) => e.id));
          for (const item of inMem) {
            if (!seen.has(item.id)) {
              fallbackEntries.push(item);
            }
          }
          return filterAndSort(fallbackEntries);
        }
        throw new Error(`Failed to fetch leadership change history: ${error.message}`);
      }
      return (data || []).map((row) => this.mapSupabaseLeadershipHistoryRow(row));
    }

    const list = this.churchGroupLeadershipHistoryByOrg.get(orgId) || [];
    return filterAndSort(list);
  }

  public async listChurchGroups(organizationId: string): Promise<ChurchGroup[]> {
    this.assertDatabaseAvailable();
    const orgId = organizationId.toLowerCase();
    const sb = this.activeSupabase;
    if (sb) {
      const { data, error } = await sb
        .from('church_groups')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(`Failed to fetch church groups: ${error.message}`);
      }
      return (data || []).map((row) => this.mapSupabaseChurchGroupRow(row));
    }

    return [...(this.churchGroupsByOrg.get(orgId) || [])];
  }

  public async createChurchGroup(
    organizationId: string,
    payload: Omit<ChurchGroup, 'id' | 'createdAt' | 'updatedAt'>,
    actor?: { id?: string; email?: string; role?: string; name?: string; ipAddress?: string }
  ): Promise<ChurchGroup> {
    this.assertDatabaseAvailable();
    const orgId = organizationId.toLowerCase();
    const nowIso = new Date().toISOString();
    let created: ChurchGroup | null = null;
    const sb = this.activeSupabase;
    const leaderMemberUuid =
      payload.leaderMemberId && UUID_REGEX.test(payload.leaderMemberId)
        ? payload.leaderMemberId
        : null;
    const assistantMemberUuid =
      payload.assistantLeaderMemberId && UUID_REGEX.test(payload.assistantLeaderMemberId)
        ? payload.assistantLeaderMemberId
        : null;

    const normalizedCategory =
      normalizeIncomingGroupCategory(payload.category) || 'cell_group';

    if (sb) {
      const baseInsertPayload = {
        organization_id: orgId,
        name: payload.name.trim(),
        category: normalizedCategory,
        leader_name: payload.leaderName.trim(),
        leader_phone: payload.leaderPhone?.trim() || null,
        leader_email: payload.leaderEmail?.trim() || null,
        assistant_leader: payload.assistantLeader?.trim() || null,
        meeting_day: payload.meetingDay?.trim() || null,
        meeting_time: payload.meetingTime?.trim() || null,
        meeting_location: payload.meetingLocation?.trim() || null,
        target_demographic: payload.targetDemographic?.trim() || null,
        description: (payload.description || '').trim(),
        active: payload.active ?? true,
      };
      const extendedInsertPayload = {
        ...baseInsertPayload,
        leader_member_id: leaderMemberUuid,
        assistant_leader_member_id: assistantMemberUuid,
      };

      let { data, error } = await sb
        .from('church_groups')
        .insert(extendedInsertPayload)
        .select('*')
        .single();

      if (error && this.isMissingChurchGroupColumnError(error)) {
        console.warn(
          '[Ekklesphere] church_groups member-link columns not yet in Supabase schema cache; retrying insert without leader_member_id / assistant_leader_member_id:',
          error.message
        );
        const retry = await sb
          .from('church_groups')
          .insert(baseInsertPayload)
          .select('*')
          .single();
        data = retry.data;
        error = retry.error;
      }

      if (error || !data) {
        if (error && String(error.code || '') === '23514' && /category/i.test(String(error.message || ''))) {
          const schemaErr: any = new Error(
            'Your live Supabase database needs migration 20261128000000_custom_group_categories.sql applied to store custom group categories.'
          );
          schemaErr.status = 400;
          schemaErr.field = 'category';
          throw schemaErr;
        }
        throw new Error(`Failed to create church group in Supabase: ${error?.message || 'Unknown error'}`);
      }
      created = this.mapSupabaseChurchGroupRow(data);
      if (!created.leaderMemberId && payload.leaderMemberId?.trim()) {
        created.leaderMemberId = payload.leaderMemberId.trim();
      }
      if (!created.assistantLeaderMemberId && payload.assistantLeaderMemberId?.trim()) {
        created.assistantLeaderMemberId = payload.assistantLeaderMemberId.trim();
      }
    } else {
      created = {
        id: randomUUID(),
        name: payload.name.trim(),
        category: normalizedCategory,
        leaderName: payload.leaderName.trim(),
        leaderMemberId: payload.leaderMemberId?.trim() || undefined,
        leaderPhone: payload.leaderPhone?.trim() || undefined,
        leaderEmail: payload.leaderEmail?.trim() || undefined,
        assistantLeader: payload.assistantLeader?.trim() || undefined,
        assistantLeaderMemberId: payload.assistantLeaderMemberId?.trim() || undefined,
        meetingDay: payload.meetingDay?.trim() || undefined,
        meetingTime: payload.meetingTime?.trim() || undefined,
        meetingLocation: payload.meetingLocation?.trim() || undefined,
        targetDemographic: payload.targetDemographic?.trim() || undefined,
        description: (payload.description || '').trim(),
        active: payload.active ?? true,
        createdAt: nowIso.slice(0, 10),
        updatedAt: nowIso.slice(0, 10),
      };
      const list = this.churchGroupsByOrg.get(orgId) || [];
      list.unshift(created);
      this.churchGroupsByOrg.set(orgId, list);
    }

    const historyEntries: Parameters<PlatformStore['appendChurchGroupLeadershipHistory']>[1] = [];
    if (created.leaderName.trim()) {
      historyEntries.push({
        groupId: created.id,
        groupName: created.name,
        category: created.category,
        role: 'primary_leader',
        action: 'assigned',
        previousLeaderName: null,
        previousLeaderMemberId: null,
        newLeaderName: created.leaderName,
        newLeaderMemberId: created.leaderMemberId || null,
        changedById: actor?.id || null,
        changedByName: actor?.name || actor?.email || 'Administrator',
        changedByEmail: actor?.email || null,
        changedByRole: actor?.role || 'admin',
        reason: 'Initial group leadership appointment',
      });
    }
    if (created.assistantLeader && created.assistantLeader.trim()) {
      historyEntries.push({
        groupId: created.id,
        groupName: created.name,
        category: created.category,
        role: 'assistant_leader',
        action: 'assigned',
        previousLeaderName: null,
        previousLeaderMemberId: null,
        newLeaderName: created.assistantLeader,
        newLeaderMemberId: created.assistantLeaderMemberId || null,
        changedById: actor?.id || null,
        changedByName: actor?.name || actor?.email || 'Administrator',
        changedByEmail: actor?.email || null,
        changedByRole: actor?.role || 'admin',
        reason: 'Initial assistant leader appointment',
      });
    }
    await this.appendChurchGroupLeadershipHistory(orgId, historyEntries);

    await this.appendAuditLog({
      organizationId: orgId,
      actorId: actor?.id || null,
      actorEmail: actor?.email || 'system@ekklesphere.local',
      actorRole: actor?.role || 'admin',
      action: 'church_group.created',
      targetType: 'church_group',
      targetId: created.id,
      metadata: {
        name: created.name,
        category: created.category,
        leaderName: created.leaderName,
        leaderMemberId: created.leaderMemberId || null,
        assistantLeader: created.assistantLeader || null,
      },
      ipAddress: actor?.ipAddress || null,
    });

    return created;
  }

  public async updateChurchGroup(
    organizationId: string,
    groupId: string,
    updates: Partial<ChurchGroup> & { leadershipChangeReason?: string | null },
    actor?: { id?: string; email?: string; role?: string; name?: string; ipAddress?: string }
  ): Promise<ChurchGroup> {
    this.assertDatabaseAvailable();
    const orgId = organizationId.toLowerCase();
    const nowIso = new Date().toISOString();
    let existingGroup: ChurchGroup | null = null;
    let updated: ChurchGroup | null = null;
    const sb = this.activeSupabase;

    if (sb) {
      if (!UUID_REGEX.test(groupId)) {
        const notFound: any = new Error('Church group not found.');
        notFound.status = 404;
        throw notFound;
      }

      const { data: existingRow, error: existingErr } = await sb
        .from('church_groups')
        .select('*')
        .eq('organization_id', orgId)
        .eq('id', groupId)
        .maybeSingle();

      if (existingErr) {
        throw new Error(`Failed to fetch existing church group: ${existingErr.message}`);
      }
      if (!existingRow) {
        const notFound: any = new Error('Church group not found.');
        notFound.status = 404;
        throw notFound;
      }
      existingGroup = this.mapSupabaseChurchGroupRow(existingRow);

      const dbPatch: Record<string, unknown> = { updated_at: nowIso };
      if (updates.name !== undefined) dbPatch.name = updates.name.trim();
      if (updates.category !== undefined) {
        dbPatch.category = normalizeIncomingGroupCategory(updates.category) || updates.category;
      }
      if (updates.leaderName !== undefined) dbPatch.leader_name = updates.leaderName.trim();
      if (updates.leaderMemberId !== undefined) {
        dbPatch.leader_member_id =
          updates.leaderMemberId && UUID_REGEX.test(updates.leaderMemberId)
            ? updates.leaderMemberId
            : null;
      }
      if (updates.leaderPhone !== undefined) dbPatch.leader_phone = updates.leaderPhone?.trim() || null;
      if (updates.leaderEmail !== undefined) dbPatch.leader_email = updates.leaderEmail?.trim() || null;
      if (updates.assistantLeader !== undefined) dbPatch.assistant_leader = updates.assistantLeader?.trim() || null;
      if (updates.assistantLeaderMemberId !== undefined) {
        dbPatch.assistant_leader_member_id =
          updates.assistantLeaderMemberId && UUID_REGEX.test(updates.assistantLeaderMemberId)
            ? updates.assistantLeaderMemberId
            : null;
      }
      if (updates.meetingDay !== undefined) dbPatch.meeting_day = updates.meetingDay?.trim() || null;
      if (updates.meetingTime !== undefined) dbPatch.meeting_time = updates.meetingTime?.trim() || null;
      if (updates.meetingLocation !== undefined) dbPatch.meeting_location = updates.meetingLocation?.trim() || null;
      if (updates.targetDemographic !== undefined) dbPatch.target_demographic = updates.targetDemographic?.trim() || null;
      if (updates.description !== undefined) dbPatch.description = updates.description.trim();
      if (updates.active !== undefined) dbPatch.active = Boolean(updates.active);

      let { data, error } = await sb
        .from('church_groups')
        .update(dbPatch)
        .eq('organization_id', orgId)
        .eq('id', groupId)
        .select('*')
        .maybeSingle();

      if (
        error &&
        this.isMissingChurchGroupColumnError(error) &&
        ('leader_member_id' in dbPatch || 'assistant_leader_member_id' in dbPatch)
      ) {
        console.warn(
          '[Ekklesphere] church_groups member-link columns not yet in Supabase schema cache; retrying update without leader_member_id / assistant_leader_member_id:',
          error.message
        );
        const {
          leader_member_id: _dropLeaderMemberId,
          assistant_leader_member_id: _dropAssistantMemberId,
          ...legacyPatch
        } = dbPatch;
        const retry = await sb
          .from('church_groups')
          .update(legacyPatch)
          .eq('organization_id', orgId)
          .eq('id', groupId)
          .select('*')
          .maybeSingle();
        data = retry.data;
        error = retry.error;
      }

      if (error) {
        if (String(error.code || '') === '23514' && /category/i.test(String(error.message || ''))) {
          const schemaErr: any = new Error(
            'Your live Supabase database needs migration 20261128000000_custom_group_categories.sql applied to store custom group categories.'
          );
          schemaErr.status = 400;
          schemaErr.field = 'category';
          throw schemaErr;
        }
        throw new Error(`Failed to update church group in Supabase: ${error.message}`);
      }
      if (!data) {
        const notFound: any = new Error('Church group not found.');
        notFound.status = 404;
        throw notFound;
      }
      updated = this.mapSupabaseChurchGroupRow(data);
      if (updates.leaderMemberId !== undefined && !updated.leaderMemberId && updates.leaderMemberId?.trim()) {
        updated.leaderMemberId = updates.leaderMemberId.trim();
      }
      if (
        updates.assistantLeaderMemberId !== undefined &&
        !updated.assistantLeaderMemberId &&
        updates.assistantLeaderMemberId?.trim() &&
        updated.assistantLeader
      ) {
        updated.assistantLeaderMemberId = updates.assistantLeaderMemberId.trim();
      }
    } else {
      const list = this.churchGroupsByOrg.get(orgId) || [];
      const idx = list.findIndex((g) => g.id === groupId);
      if (idx < 0) {
        const notFound: any = new Error('Church group not found.');
        notFound.status = 404;
        throw notFound;
      }
      existingGroup = { ...list[idx] };
      const { leadershipChangeReason: _ignoredReason, ...restUpdates } = updates;
      if (restUpdates.category !== undefined) {
        restUpdates.category =
          normalizeIncomingGroupCategory(restUpdates.category) || restUpdates.category;
      }
      updated = {
        ...list[idx],
        ...restUpdates,
        id: list[idx].id,
        updatedAt: nowIso.slice(0, 10),
      };
      if (updates.assistantLeader !== undefined && !updates.assistantLeader?.trim()) {
        updated.assistantLeader = undefined;
        updated.assistantLeaderMemberId = undefined;
      }
      list[idx] = updated;
      this.churchGroupsByOrg.set(orgId, list);
    }

    const reasonText = updates.leadershipChangeReason?.trim() || null;
    const historyEntries: Parameters<PlatformStore['appendChurchGroupLeadershipHistory']>[1] = [];

    if (
      existingGroup &&
      this.isDifferentLeader(
        existingGroup.leaderName,
        existingGroup.leaderMemberId,
        updated.leaderName,
        updated.leaderMemberId
      )
    ) {
      const hasPrev = Boolean(this.normalizeLeaderNameForCompare(existingGroup.leaderName));
      const hasNext = Boolean(this.normalizeLeaderNameForCompare(updated.leaderName));
      historyEntries.push({
        groupId: updated.id,
        groupName: updated.name,
        category: updated.category,
        role: 'primary_leader',
        action: !hasPrev && hasNext ? 'assigned' : hasPrev && !hasNext ? 'removed' : 'changed',
        previousLeaderName: existingGroup.leaderName || null,
        previousLeaderMemberId: existingGroup.leaderMemberId || null,
        newLeaderName: updated.leaderName || null,
        newLeaderMemberId: updated.leaderMemberId || null,
        changedById: actor?.id || null,
        changedByName: actor?.name || actor?.email || 'Administrator',
        changedByEmail: actor?.email || null,
        changedByRole: actor?.role || 'admin',
        reason: reasonText,
      });
    }

    if (
      existingGroup &&
      this.isDifferentLeader(
        existingGroup.assistantLeader,
        existingGroup.assistantLeaderMemberId,
        updated.assistantLeader,
        updated.assistantLeaderMemberId
      )
    ) {
      const hasPrev = Boolean(this.normalizeLeaderNameForCompare(existingGroup.assistantLeader));
      const hasNext = Boolean(this.normalizeLeaderNameForCompare(updated.assistantLeader));
      historyEntries.push({
        groupId: updated.id,
        groupName: updated.name,
        category: updated.category,
        role: 'assistant_leader',
        action: !hasPrev && hasNext ? 'assigned' : hasPrev && !hasNext ? 'removed' : 'changed',
        previousLeaderName: existingGroup.assistantLeader || null,
        previousLeaderMemberId: existingGroup.assistantLeaderMemberId || null,
        newLeaderName: updated.assistantLeader || null,
        newLeaderMemberId: updated.assistantLeaderMemberId || null,
        changedById: actor?.id || null,
        changedByName: actor?.name || actor?.email || 'Administrator',
        changedByEmail: actor?.email || null,
        changedByRole: actor?.role || 'admin',
        reason: reasonText,
      });
    }

    await this.appendChurchGroupLeadershipHistory(orgId, historyEntries);

    await this.appendAuditLog({
      organizationId: orgId,
      actorId: actor?.id || null,
      actorEmail: actor?.email || 'system@ekklesphere.local',
      actorRole: actor?.role || 'admin',
      action: 'church_group.updated',
      targetType: 'church_group',
      targetId: updated.id,
      metadata: {
        name: updated.name,
        category: updated.category,
        active: updated.active,
        leadershipChanged: historyEntries.length > 0,
      },
      ipAddress: actor?.ipAddress || null,
    });

    return updated;
  }

  public async deleteChurchGroup(
    organizationId: string,
    groupId: string,
    actor?: { id?: string; email?: string; role?: string; name?: string; ipAddress?: string }
  ): Promise<void> {
    this.assertDatabaseAvailable();
    const orgId = organizationId.toLowerCase();
    let deletedGroup: ChurchGroup | null = null;

    const sb = this.activeSupabase;

    if (sb) {
      if (!UUID_REGEX.test(groupId)) {
        const notFound: any = new Error('Church group not found.');
        notFound.status = 404;
        throw notFound;
      }
      const { data, error } = await sb
        .from('church_groups')
        .delete()
        .eq('organization_id', orgId)
        .eq('id', groupId)
        .select('*')
        .maybeSingle();

      if (error) {
        throw new Error(`Failed to delete church group in Supabase: ${error.message}`);
      }
      if (!data) {
        const notFound: any = new Error('Church group not found.');
        notFound.status = 404;
        throw notFound;
      }
      deletedGroup = this.mapSupabaseChurchGroupRow(data);
    } else {
      const list = this.churchGroupsByOrg.get(orgId) || [];
      const target = list.find((g) => g.id === groupId);
      if (!target) {
        const notFound: any = new Error('Church group not found.');
        notFound.status = 404;
        throw notFound;
      }
      deletedGroup = { ...target };
      this.churchGroupsByOrg.set(
        orgId,
        list.filter((g) => g.id !== groupId)
      );
    }

    if (deletedGroup) {
      const historyEntries: Parameters<PlatformStore['appendChurchGroupLeadershipHistory']>[1] = [];
      if (deletedGroup.leaderName.trim()) {
        historyEntries.push({
          groupId: deletedGroup.id,
          groupName: deletedGroup.name,
          category: deletedGroup.category,
          role: 'primary_leader',
          action: 'group_deleted',
          previousLeaderName: deletedGroup.leaderName,
          previousLeaderMemberId: deletedGroup.leaderMemberId || null,
          newLeaderName: null,
          newLeaderMemberId: null,
          changedById: actor?.id || null,
          changedByName: actor?.name || actor?.email || 'Administrator',
          changedByEmail: actor?.email || null,
          changedByRole: actor?.role || 'admin',
          reason: 'Group removed from congregation structure',
        });
      }
      if (deletedGroup.assistantLeader && deletedGroup.assistantLeader.trim()) {
        historyEntries.push({
          groupId: deletedGroup.id,
          groupName: deletedGroup.name,
          category: deletedGroup.category,
          role: 'assistant_leader',
          action: 'group_deleted',
          previousLeaderName: deletedGroup.assistantLeader,
          previousLeaderMemberId: deletedGroup.assistantLeaderMemberId || null,
          newLeaderName: null,
          newLeaderMemberId: null,
          changedById: actor?.id || null,
          changedByName: actor?.name || actor?.email || 'Administrator',
          changedByEmail: actor?.email || null,
          changedByRole: actor?.role || 'admin',
          reason: 'Group removed from congregation structure',
        });
      }
      await this.appendChurchGroupLeadershipHistory(orgId, historyEntries);
    }

    await this.appendAuditLog({
      organizationId: orgId,
      actorId: actor?.id || null,
      actorEmail: actor?.email || 'system@ekklesphere.local',
      actorRole: actor?.role || 'admin',
      action: 'church_group.deleted',
      targetType: 'church_group',
      targetId: groupId,
      metadata: { name: deletedGroup?.name || groupId },
      ipAddress: actor?.ipAddress || null,
    });
  }

  public async getSitesForOrg(organizationId: string): Promise<RegisteredSiteRecord[]> {
    this.assertDatabaseAvailable();
    const orgId = organizationId.toLowerCase();
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('sites')
        .select('*')
        .eq('organization_id', orgId)
        .eq('active', true)
        .order('created_at', { ascending: true });

      if (error) {
        throw new Error(`Failed to fetch sites from Supabase: ${error.message}`);
      }
      return (data || [])
        .filter((row) => typeof row.lat === 'number' && typeof row.lng === 'number')
        .map((row) => ({
          id: String(row.id),
          organization_id: orgId,
          name: String(row.name || 'Campus'),
          address: row.address || '',
          lat: Number(row.lat),
          lng: Number(row.lng),
          radius_m: Number(row.radius_m || 60),
          outer_radius_m: Number(row.outer_radius_m || 300),
          dwell_min: Number(row.dwell_min || 5),
          active: Boolean(row.active ?? true),
          updated_at: String(row.updated_at || row.created_at || new Date().toISOString()),
          updated_by: row.updated_by || undefined,
        }));
    }
    return this.sitesByOrg.get(orgId) || [];
  }

  public async getLiveCheckins(
    organizationId: string,
    serviceId?: string | null,
    maxRows: number = 500
  ): Promise<LiveCheckinItem[]> {
    this.assertDatabaseAvailable();
    const orgId = organizationId.toLowerCase();
    const safeLimit = Math.min(5000, Math.max(1, Number(maxRows) || 500));
    if (this.supabase) {
      let query = this.supabase
        .from('attendance')
        .select('*')
        .eq('organization_id', orgId)
        .order('checked_in_at', { ascending: false })
        .limit(safeLimit);
      if (serviceId && UUID_REGEX.test(serviceId)) {
        query = query.eq('event_id', serviceId);
      }
      const { data, error } = await query;
      if (error) {
        throw new Error(`Failed to load live check-ins from Supabase: ${error.message}`);
      }
      return (data || []).map((row) => {
        const checkedIso = String(row.checked_in_at || new Date().toISOString());
        const dt = new Date(checkedIso);
        const rawMethod = String(row.method || 'manual');
        const mappedMethod: LiveCheckinItem['method'] =
          rawMethod === 'qr_scan'
            ? 'posted_qr'
            : rawMethod === 'web_link'
            ? 'email_link'
            : (['usher', 'posted_qr', 'beacon', 'geofence', 'email_link', 'manual'].includes(rawMethod)
                ? (rawMethod as LiveCheckinItem['method'])
                : 'manual');
        return {
          id: String(row.id),
          tenantId: orgId,
          organizationId: orgId,
          personId: String(row.member_id),
          serviceInstanceId: String(row.event_id),
          campusId: PRIMARY_CAMPUS_SITE_ID,
          method: mappedMethod,
          confidence: Number(row.confidence_score ?? 95),
          checkedInAt: !Number.isNaN(dt.getTime())
            ? dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : '08:00',
          checkedInIso: checkedIso,
          late: false,
          distanceM: typeof row.distance_m === 'number' ? row.distance_m : null,
          note: row.notes || undefined,
        };
      });
    }

    const list = this.checkinsByOrg.get(orgId) || [];
    return serviceId ? list.filter((c) => c.serviceInstanceId === serviceId) : [...list];
  }

  public async recordLiveCheckin(
    organizationId: string,
    record: Omit<LiveCheckinItem, 'tenantId' | 'organizationId'>,
    options?: { bypassWindowCheck?: boolean }
  ): Promise<{ record: LiveCheckinItem; liveCheckins: LiveCheckinItem[] }> {
    this.assertDatabaseAvailable();
    const orgId = organizationId.toLowerCase();
    const fullRecord: LiveCheckinItem = {
      ...record,
      tenantId: orgId,
      organizationId: orgId,
    };

    const rawServiceId = String(fullRecord.serviceInstanceId || '').trim();
    if (
      !rawServiceId ||
      rawServiceId === 'svc-live-main' ||
      rawServiceId === 'svc-sun-1'
    ) {
      const noSvcErr: any = new Error(
        'No service is scheduled. Please schedule a service before checking in members.'
      );
      noSvcErr.status = 400;
      noSvcErr.code = 'NO_SERVICE_SCHEDULED';
      throw noSvcErr;
    }

    if (this.supabase) {
      if (!UUID_REGEX.test(rawServiceId)) {
        const noSvcErr: any = new Error(
          'No service is scheduled. Please schedule a service before checking in members.'
        );
        noSvcErr.status = 400;
        noSvcErr.code = 'NO_SERVICE_SCHEDULED';
        throw noSvcErr;
      }

      const { data: matchedEvent, error: eventLookupErr } = await this.supabase
        .from('events')
        .select('id, name, status, start_time, end_time, dwell_min')
        .eq('organization_id', orgId)
        .eq('id', rawServiceId)
        .maybeSingle();

      if (eventLookupErr) {
        throw new Error(`Failed to verify scheduled service in Supabase: ${eventLookupErr.message}`);
      }
      if (!matchedEvent?.id) {
        const noSvcErr: any = new Error(
          'Selected service is not scheduled. Please schedule an active service before checking in members.'
        );
        noSvcErr.status = 404;
        noSvcErr.code = 'NO_SERVICE_SCHEDULED';
        throw noSvcErr;
      }
      const evStatus = String(matchedEvent.status || '').trim().toLowerCase();
      if (evStatus === 'closed' || evStatus === 'completed' || evStatus === 'cancelled') {
        const closedErr: any = new Error(
          `Check-in is closed for "${matchedEvent.name}". Reopen or schedule a live service within its active window first.`
        );
        closedErr.status = 400;
        closedErr.code = 'SERVICE_NOT_OPEN';
        throw closedErr;
      }
      if (!options?.bypassWindowCheck) {
        const windowResult = resolveServiceWindow({
          startTimeIso: matchedEvent.start_time,
          endTimeIso: matchedEvent.end_time,
          allowanceMinutes: Number(matchedEvent.dwell_min ?? 0) || 0,
          rawStatus: evStatus || 'active',
          nowMs: Date.now(),
        });
        if (windowResult.status !== 'live') {
          const closedErr: any = new Error(
            `Check-in is closed for "${matchedEvent.name}". Reopen or schedule a live service within its active window first.`
          );
          closedErr.status = 400;
          closedErr.code = 'SERVICE_NOT_OPEN';
          throw closedErr;
        }
      }

      const resolvedEventId = String(matchedEvent.id);
      fullRecord.serviceInstanceId = resolvedEventId;

      if (!UUID_REGEX.test(fullRecord.personId)) {
        const { data: matchedMember } = await this.supabase
          .from('members')
          .select('id')
          .eq('organization_id', orgId)
          .or(`email.eq.${fullRecord.personId},phone.eq.${fullRecord.personId}`)
          .limit(1)
          .maybeSingle();
        if (matchedMember?.id) {
          fullRecord.personId = String(matchedMember.id);
        } else {
          const invalidErr: any = new Error('Selected member record does not have a valid database ID.');
          invalidErr.status = 400;
          invalidErr.code = 'INVALID_MEMBER_ID';
          throw invalidErr;
        }
      }

      const mappedDbMethod =
        fullRecord.method === 'posted_qr'
          ? 'qr_scan'
          : fullRecord.method === 'email_link'
          ? 'web_link'
          : fullRecord.method;

      const attendancePayload = {
        organization_id: orgId,
        event_id: resolvedEventId,
        member_id: fullRecord.personId,
        checked_in_at: fullRecord.checkedInIso,
        method: mappedDbMethod,
        status: 'accepted',
        confidence_score: Math.min(100, Math.max(0, Math.round(fullRecord.confidence))),
        distance_m: fullRecord.distanceM ?? null,
        notes: fullRecord.note || null,
      };

      const { error } = await this.supabase
        .from('attendance')
        .upsert(attendancePayload, { onConflict: 'organization_id,event_id,member_id' });
      if (error) {
        throw new Error(`Failed to record live check-in in Supabase: ${error.message}`);
      }
      await this.resetMemberAbsenceStreakOnCheckin(orgId, fullRecord.personId).catch(() => {});
      return { record: fullRecord, liveCheckins: await this.getLiveCheckins(orgId) };
    }

    const orgEvents = this.eventsByOrg.get(orgId) || [];
    const matchedMemEvent = orgEvents.find((ev) => ev.id === rawServiceId);
    if (!matchedMemEvent) {
      const noSvcErr: any = new Error(
        'No service is scheduled. Please schedule a service before checking in members.'
      );
      noSvcErr.status = 400;
      noSvcErr.code = 'NO_SERVICE_SCHEDULED';
      throw noSvcErr;
    }
    const memEvStatus = String(matchedMemEvent.status || '').trim().toLowerCase();
    if (memEvStatus === 'closed' || memEvStatus === 'completed' || memEvStatus === 'cancelled') {
      const closedErr: any = new Error(
        `Check-in is closed for "${matchedMemEvent.name}". Reopen or schedule a live service within its active window first.`
      );
      closedErr.status = 400;
      closedErr.code = 'SERVICE_NOT_OPEN';
      throw closedErr;
    }
    if (!options?.bypassWindowCheck) {
      const memWindow = resolveServiceWindow({
        date: matchedMemEvent.date,
        startsAt: matchedMemEvent.starts_at,
        endsAt: matchedMemEvent.ends_at,
        startTimeIso: matchedMemEvent.start_time,
        endTimeIso: matchedMemEvent.end_time,
        allowanceMinutes: Number(matchedMemEvent.dwell_min ?? 0) || 0,
        rawStatus: memEvStatus || 'active',
        nowMs: Date.now(),
      });
      if (memWindow.status !== 'live') {
        const closedErr: any = new Error(
          `Check-in is closed for "${matchedMemEvent.name}". Reopen or schedule a live service within its active window first.`
        );
        closedErr.status = 400;
        closedErr.code = 'SERVICE_NOT_OPEN';
        throw closedErr;
      }
    }

    const list = this.checkinsByOrg.get(orgId) || [];
    const idx = list.findIndex(
      (r) =>
        r.personId === fullRecord.personId &&
        r.serviceInstanceId === fullRecord.serviceInstanceId
    );
    if (idx >= 0) {
      list[idx] = fullRecord;
    } else {
      list.unshift(fullRecord);
    }
    this.checkinsByOrg.set(orgId, list);

    const org = this.orgs.get(orgId);
    if (org) {
      org.lastActivityAt = fullRecord.checkedInIso;
    }

    await this.resetMemberAbsenceStreakOnCheckin(orgId, fullRecord.personId).catch(() => {});

    return { record: fullRecord, liveCheckins: await this.getLiveCheckins(orgId) };
  }

  public async deleteLiveCheckin(
    organizationId: string,
    personId: string,
    serviceId?: string | null
  ): Promise<LiveCheckinItem[]> {
    this.assertDatabaseAvailable();
    const orgId = organizationId.toLowerCase();
    if (this.supabase) {
      if (personId !== '__all__' && !UUID_REGEX.test(personId)) {
        return this.getLiveCheckins(orgId, serviceId);
      }
      let query = this.supabase.from('attendance').delete().eq('organization_id', orgId);
      if (personId !== '__all__') {
        query = query.eq('member_id', personId);
      }
      if (serviceId && UUID_REGEX.test(serviceId)) {
        query = query.eq('event_id', serviceId);
      }
      const { error } = await query;
      if (error) {
        throw new Error(`Failed to delete check-in in Supabase: ${error.message}`);
      }
      return this.getLiveCheckins(orgId, serviceId);
    }

    const current = this.checkinsByOrg.get(orgId) || [];
    let filtered: LiveCheckinItem[];
    if (personId === '__all__') {
      filtered = serviceId ? current.filter((r) => r.serviceInstanceId !== serviceId) : [];
    } else if (serviceId) {
      filtered = current.filter(
        (r) => !(r.personId === personId && r.serviceInstanceId === serviceId)
      );
    } else {
      filtered = current.filter((r) => r.personId !== personId);
    }
    this.checkinsByOrg.set(orgId, filtered);
    return filtered;
  }

  public async recordRawGeofenceEvent(
    organizationId: string,
    event: StoredGeofenceEvent
  ): Promise<StoredGeofenceEvent> {
    this.assertDatabaseAvailable();
    const orgId = organizationId.toLowerCase();
    const scoped: StoredGeofenceEvent = { ...event, organization_id: orgId };

    if (this.supabase) {
      if (UUID_REGEX.test(scoped.site_id)) {
        const dbSource = scoped.source === 'system_auto_close' ? 'admin_edit' : scoped.source;
        const { error } = await this.supabase.from('attendance_events').upsert(
          {
            organization_id: orgId,
            client_event_id: UUID_REGEX.test(scoped.client_event_id)
              ? scoped.client_event_id
              : toDeterministicUuid(scoped.client_event_id),
            user_id: toDeterministicUuid(scoped.user_id),
            person_id: scoped.person_id || null,
            person_name: scoped.person_name || null,
            service_instance_id: scoped.service_instance_id || null,
            site_id: scoped.site_id,
            type: scoped.type,
            source: dbSource,
            platform: scoped.platform,
            lat: scoped.lat,
            lng: scoped.lng,
            location:
              scoped.lat != null && scoped.lng != null
                ? `SRID=4326;POINT(${scoped.lng} ${scoped.lat})`
                : null,
            accuracy_m: scoped.accuracy_m,
            distance_m: scoped.distance_m,
            is_mock: scoped.is_mock,
            device_time: scoped.device_time,
            server_time: scoped.server_time,
            status: scoped.status,
            flag_reasons: scoped.flag_reasons,
          },
          { onConflict: 'user_id,client_event_id' }
        );
        if (error) {
          throw new Error(`Failed to persist geofence event in Supabase: ${error.message}`);
        }
      }
      return scoped;
    }

    const list = this.rawEventsByOrg.get(orgId) || [];
    list.unshift(scoped);
    this.rawEventsByOrg.set(orgId, list.slice(0, 500));

    const org = this.orgs.get(orgId);
    if (org) {
      org.lastActivityAt = scoped.server_time;
    }

    return scoped;
  }

  public async getRawGeofenceEvents(organizationId: string): Promise<StoredGeofenceEvent[]> {
    this.assertDatabaseAvailable();
    const orgId = organizationId.toLowerCase();
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('attendance_events')
        .select('*')
        .eq('organization_id', orgId)
        .order('server_time', { ascending: false })
        .limit(250);
      if (error) {
        throw new Error(`Failed to fetch geofence events from Supabase: ${error.message}`);
      }
      return (data || []).map((row) => ({
        id: String(row.id),
        organization_id: orgId,
        client_event_id: String(row.client_event_id),
        user_id: String(row.user_id),
        person_id: row.person_id || undefined,
        person_name: row.person_name || undefined,
        service_instance_id: row.service_instance_id || undefined,
        site_id: String(row.site_id),
        type: row.type,
        source: row.source,
        platform: row.platform || 'web',
        lat: row.lat ?? null,
        lng: row.lng ?? null,
        accuracy_m: row.accuracy_m ?? null,
        distance_m: row.distance_m ?? null,
        is_mock: Boolean(row.is_mock),
        device_time: String(row.device_time || row.server_time),
        server_time: String(row.server_time),
        status: row.status,
        flag_reasons: Array.isArray(row.flag_reasons) ? row.flag_reasons : [],
      }));
    }
    return [...(this.rawEventsByOrg.get(orgId) || [])];
  }

  private mapPersonStatusToDbStatus(status?: string): 'active' | 'inactive' | 'archived' | 'pending' {
    const s = String(status || '').trim().toLowerCase();
    if (s === 'inactive') return 'inactive';
    if (s === 'pending') return 'pending';
    if (s === 'archived' || s === 'transferred' || s === 'deceased') return 'archived';
    return 'active';
  }

  private mapDbStatusToPersonStatus(
    dbStatus?: string,
    customAttrs?: Record<string, unknown>
  ): string {
    const customStatus = customAttrs?.memberStatus;
    if (typeof customStatus === 'string' && customStatus.trim()) {
      return customStatus.trim();
    }
    if (!dbStatus || dbStatus === 'active') return 'member';
    if (dbStatus === 'archived') return 'inactive';
    return dbStatus;
  }

  private extractMemberCustomAttributes(
    payload: Record<string, any>,
    existingCustom?: Record<string, unknown>
  ): Record<string, unknown> {
    const next: Record<string, unknown> = { ...(existingCustom || {}) };
    const extendedKeys = [
      'middleName',
      'preferredName',
      'phoneNumber',
      'specificLocation',
      'remarks',
      'notes',
      'memberId',
      'squads',
      'department',
      'departments',
      'officerName',
      'designation',
      'placeOfResidence',
      'residentialDigitalAddress',
      'hometown',
      'occupation',
      'homeCellGroup',
      'groupName',
      'monthOfBirth',
      'birthMonthGroup',
      'maritalStatus',
      'spouseName',
      'numberOfChildren',
      'emergencyContactPerson',
      'emergencyContactPhone',
      'imageUrl',
      'dateOfBaptism',
      'dateOfMarriage',
      'dateOfSalvation',
      'dateOfMembership',
      'autoCheckinOptedIn',
      'consecutiveAbsences',
    ];
    for (const key of extendedKeys) {
      if (payload[key] === '' || payload[key] === null) {
        delete next[key];
      } else if (payload[key] !== undefined) {
        next[key] = payload[key];
      }
    }
    const resolvedOfficer = payload.officerName ?? payload.designation;
    if (typeof resolvedOfficer === 'string' && resolvedOfficer.trim()) {
      next.officerName = resolvedOfficer.trim();
      next.designation = resolvedOfficer.trim();
    } else if (resolvedOfficer === '' || resolvedOfficer === null) {
      delete next.officerName;
      delete next.designation;
    }
    const resolvedInputImg = [
      payload.imageUrl,
      payload.image_url,
      payload.photo_url,
      payload.photoUrl,
      payload.image,
    ].find((val) => typeof val === 'string' && val.trim().length > 0);
    if (payload.imageUrl === '' || payload.imageUrl === null) {
      delete next.imageUrl;
    } else if (typeof resolvedInputImg === 'string') {
      next.imageUrl = resolvedInputImg.trim();
    }
    if (payload.status !== undefined) {
      next.memberStatus = payload.status;
    }
    return next;
  }

  private mapSupabaseMemberRow(orgId: string, row: Record<string, any>): Record<string, any> {
    const custom =
      row.custom_attributes && typeof row.custom_attributes === 'object'
        ? (row.custom_attributes as Record<string, any>)
        : {};
    const firstName =
      row.first_name ||
      row.firstName ||
      (row.full_name ? String(row.full_name).split(' ')[0] : 'Member');
    const lastName =
      row.last_name ||
      row.lastName ||
      (row.full_name ? String(row.full_name).split(' ').slice(1).join(' ') : '');
    const groupName =
      row.group_name ||
      row.home_cell_group ||
      custom.homeCellGroup ||
      custom.groupName ||
      'General Congregation';
    const phoneE164 = row.phone || row.phone_e164 || row.phoneE164 || '';
    const rawDob = row.date_of_birth ?? custom.dateOfBirth;
    const birthFields = resolveMemberBirthFields({
      dateOfBirth: rawDob,
      monthOfBirth: row.month_of_birth ?? custom.monthOfBirth,
      birthMonthGroup: custom.birthMonthGroup,
    });

    const deptFields = normalizeMemberDepartmentFields({
      department:
        typeof custom.department === 'string' && custom.department.trim()
          ? custom.department
          : row.department,
      departments: Array.isArray(custom.departments) ? custom.departments : undefined,
    });

    return {
      ...custom,
      ...row,
      id: String(row.id),
      tenantId: orgId,
      firstName,
      middleName: row.middle_name ?? custom.middleName,
      lastName,
      preferredName: row.preferred_name ?? custom.preferredName ?? `${firstName} ${lastName}`.trim(),
      email: row.email ?? custom.email ?? undefined,
      phoneE164,
      phoneNumber: row.phone_number ?? custom.phoneNumber ?? phoneE164,
      memberId: row.member_id ?? custom.memberId,
      department: deptFields.department,
      departments: deptFields.departments,
      squads: row.squads ?? custom.squads,
      officerName: row.member_officer_name ?? custom.officerName ?? custom.designation,
      designation: row.designation ?? custom.designation ?? row.member_officer_name ?? custom.officerName,
      specificLocation: row.specific_location ?? custom.specificLocation,
      remarks: row.remarks ?? custom.remarks,
      notes: row.notes ?? custom.notes,
      gender: row.gender ?? custom.gender ?? 'other',
      dateOfBirth: rawDob,
      placeOfResidence: row.place_of_residence ?? custom.placeOfResidence,
      residentialDigitalAddress:
        row.residential_digital_address ?? custom.residentialDigitalAddress,
      hometown: row.hometown ?? custom.hometown,
      occupation: row.occupation ?? custom.occupation,
      homeCellGroup: groupName,
      groupName,
      monthOfBirth: birthFields.monthOfBirth,
      birthMonthGroup: birthFields.birthMonthGroup,
      maritalStatus: row.marital_status ?? custom.maritalStatus ?? 'Single',
      spouseName: row.spouse_name ?? custom.spouseName,
      numberOfChildren:
        typeof row.number_of_children === 'number'
          ? row.number_of_children
          : typeof custom.numberOfChildren === 'number'
          ? custom.numberOfChildren
          : 0,
      emergencyContactPerson:
        row.emergency_contact_person ?? custom.emergencyContactPerson,
      emergencyContactPhone:
        row.emergency_phone ?? custom.emergencyContactPhone,
      imageUrl:
        [row.image_url, row.photo_url, custom.imageUrl, custom.image, row.avatar_url].find(
          (val) => typeof val === 'string' && val.trim().length > 0
        )?.trim() || undefined,
      dateOfBaptism: row.date_of_baptism ?? custom.dateOfBaptism,
      dateOfMarriage: row.date_of_marriage ?? custom.dateOfMarriage,
      dateOfSalvation: row.date_of_salvation ?? custom.dateOfSalvation,
      dateOfMembership:
        row.date_of_membership ??
        custom.dateOfMembership ??
        (row.joined_at ? String(row.joined_at).slice(0, 10) : undefined),
      autoCheckinOptedIn: custom.autoCheckinOptedIn ?? true,
      consecutiveAbsences:
        typeof custom.consecutiveAbsences === 'number' ? custom.consecutiveAbsences : 0,
      status: this.mapDbStatusToPersonStatus(row.status, custom),
    };
  }

  public async getMembers(organizationId: string): Promise<Record<string, any>[]> {
    this.assertDatabaseAvailable();
    const orgId = organizationId.toLowerCase();
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('members')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });
      if (error) {
        throw new Error(`Failed to load members from Supabase: ${error.message}`);
      }
      return (data || []).map((row) => this.mapSupabaseMemberRow(orgId, row));
    }
    return (this.membersByOrg.get(orgId) || []).map((m) => {
      const birthFields = resolveMemberBirthFields({
        dateOfBirth: m.dateOfBirth,
        monthOfBirth: m.monthOfBirth,
        birthMonthGroup: m.birthMonthGroup,
      });
      const deptFields = normalizeMemberDepartmentFields({
        department: m.department,
        departments: Array.isArray(m.departments) ? m.departments : undefined,
      });
      return {
        ...m,
        department: deptFields.department,
        departments: deptFields.departments,
        monthOfBirth: birthFields.monthOfBirth ?? m.monthOfBirth,
        birthMonthGroup: birthFields.birthMonthGroup ?? m.birthMonthGroup,
      };
    });
  }

  public async getMemberCountForOrg(organizationId: string): Promise<number> {
    this.assertDatabaseAvailable();
    const orgId = organizationId.toLowerCase();
    if (this.supabase) {
      const { count, error } = await this.supabase
        .from('members')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId);
      if (error) {
        throw new Error(`Failed to count members in Supabase: ${error.message}`);
      }
      return typeof count === 'number' ? count : 0;
    }
    const localCount = (this.membersByOrg.get(orgId) || []).length;
    const org = this.orgs.get(orgId);
    return Math.max(localCount, org?.memberCount || 0);
  }

  public async createMember(
    organizationId: string,
    payload: Record<string, any>,
    options?: { skipAutoCredentials?: boolean }
  ): Promise<Record<string, any>> {
    const orgId = organizationId.toLowerCase();
    const evalRes = await this.evaluateOrganizationLicense(orgId);
    if (!evalRes.allowed) {
      const err: any = new Error(evalRes.message);
      err.code = evalRes.code;
      err.status = evalRes.httpStatus;
      throw err;
    }

    if (evalRes.seatsLimit > 0 && evalRes.seatsUsed + 1 > evalRes.seatsLimit) {
      const err: any = new Error(
        `Seat limit reached (${evalRes.seatsUsed}/${evalRes.seatsLimit}). Upgrade your license plan to register additional members.`
      );
      err.code = 'SEAT_LIMIT_REACHED';
      err.status = 403;
      err.details = { seatsUsed: evalRes.seatsUsed, seatsLimit: evalRes.seatsLimit };
      throw err;
    }

    const firstName = String(payload.firstName ?? payload.first_name ?? '').trim();
    const lastName = String(payload.lastName ?? payload.last_name ?? '').trim();
    const rawPhone = payload.phoneE164 || payload.phoneNumber || payload.phone || null;
    const phone = rawPhone ? normalizePhone(String(rawPhone)) || String(rawPhone).trim() : null;
    const email = payload.email ? String(payload.email).trim().toLowerCase() : null;
    const genderVal =
      payload.gender && ['male', 'female', 'other'].includes(String(payload.gender).toLowerCase())
        ? String(payload.gender).toLowerCase()
        : null;
    const dobVal =
      payload.dateOfBirth && /^\d{4}-\d{2}-\d{2}$/.test(String(payload.dateOfBirth))
        ? String(payload.dateOfBirth)
        : null;
    const birthFields = resolveMemberBirthFields({
      dateOfBirth: dobVal,
      monthOfBirth: payload.monthOfBirth,
      birthMonthGroup: payload.birthMonthGroup,
    });
    const deptFields = normalizeMemberDepartmentFields({
      department: payload.department,
      departments: Array.isArray(payload.departments) ? payload.departments : undefined,
    });
    const normalizedCreatePayload = {
      ...payload,
      department: deptFields.department,
      departments: deptFields.departments,
      dateOfBirth: dobVal || undefined,
      monthOfBirth: birthFields.monthOfBirth,
      birthMonthGroup: birthFields.birthMonthGroup,
    };
    const customAttributes = this.extractMemberCustomAttributes(normalizedCreatePayload);

    const resolvedCreateImage = [
      payload.imageUrl,
      payload.image_url,
      payload.photo_url,
      payload.photoUrl,
      payload.image,
    ]
      .find((val) => typeof val === 'string' && val.trim().length > 0)
      ?.trim() || null;

    let createdMember: Record<string, any>;

    if (this.supabase) {
      const baseInsert: Record<string, unknown> = {
        organization_id: orgId,
        first_name: firstName,
        last_name: lastName,
        preferred_name: `${firstName} ${lastName}`.trim(),
        email,
        phone_e164: phone,
        role: payload.role && ['owner', 'admin', 'pastor', 'usher', 'leader', 'member', 'guest'].includes(payload.role)
          ? payload.role
          : 'member',
        status: this.mapPersonStatusToDbStatus(payload.status),
        gender: genderVal,
        date_of_birth: dobVal,
        photo_url: resolvedCreateImage,
        custom_attributes: customAttributes,
      };

      const extendedInsert: Record<string, unknown> = {
        ...baseInsert,
        phone_number: phone,
        home_cell_group: payload.homeCellGroup || payload.groupName || 'General Congregation',
        department: deptFields.department,
        member_id: payload.memberId || null,
        middle_name: payload.middleName || null,
        specific_location: payload.specificLocation || null,
        remarks: payload.remarks || null,
        squads: payload.squads || null,
        member_officer_name: payload.officerName || null,
        place_of_residence: payload.placeOfResidence || null,
        residential_digital_address: payload.residentialDigitalAddress || null,
        hometown: payload.hometown || null,
        occupation: payload.occupation || null,
        month_of_birth: birthFields.monthOfBirth || null,
        marital_status: payload.maritalStatus || null,
        spouse_name: payload.spouseName || null,
        number_of_children:
          typeof payload.numberOfChildren === 'number' ? payload.numberOfChildren : 0,
        emergency_contact_person: payload.emergencyContactPerson || null,
        emergency_phone: payload.emergencyContactPhone || null,
        image_url: resolvedCreateImage,
        date_of_baptism: payload.dateOfBaptism || null,
        date_of_marriage: payload.dateOfMarriage || null,
        date_of_salvation: payload.dateOfSalvation || null,
        date_of_membership: payload.dateOfMembership || null,
      };

      let { data, error } = await this.supabase
        .from('members')
        .insert(extendedInsert)
        .select('*')
        .single();

      // Fall back to base columns + custom_attributes JSONB if optional extended columns are absent
      if (
        error &&
        /column .* does not exist|Could not find the '[^']+' column|schema cache/i.test(
          error.message || ''
        )
      ) {
        const retry = await this.supabase
          .from('members')
          .insert(baseInsert)
          .select('*')
          .single();
        data = retry.data;
        error = retry.error;

        if (
          error &&
          /column .* does not exist|Could not find the '[^']+' column|schema cache/i.test(
            error.message || ''
          )
        ) {
          const { photo_url: _dropPhoto, ...minimalInsert } = baseInsert;
          const retryMinimal = await this.supabase
            .from('members')
            .insert(minimalInsert)
            .select('*')
            .single();
          data = retryMinimal.data;
          error = retryMinimal.error;
        }
      }

      if (error || !data) {
        throw new Error(`Failed to create member in Supabase: ${error?.message || 'Unknown error'}`);
      }

      createdMember = {
        ...this.mapSupabaseMemberRow(orgId, data),
        avatarInitials: `${firstName[0] || 'M'}${lastName[0] || 'M'}`.toUpperCase(),
        joinedOn:
          payload.dateOfMembership || new Date().toISOString().slice(0, 10),
      };
    } else {
      const newMember = {
        ...normalizedCreatePayload,
        id: payload.id || randomUUID(),
        tenantId: orgId,
        firstName,
        lastName,
        phoneE164: phone,
        phoneNumber: phone,
        email,
        status: payload.status || 'member',
        groupName: payload.groupName || payload.homeCellGroup || 'General Congregation',
        homeCellGroup: payload.homeCellGroup || payload.groupName || 'General Congregation',
        autoCheckinOptedIn: payload.autoCheckinOptedIn ?? true,
        avatarInitials: `${firstName[0] || 'M'}${lastName[0] || 'M'}`.toUpperCase(),
        joinedOn: payload.dateOfMembership || new Date().toISOString().slice(0, 10),
        consecutiveAbsences: 0,
      };

      const list = this.membersByOrg.get(orgId) || [];
      list.unshift(newMember);
      this.membersByOrg.set(orgId, list);

      const org = this.orgs.get(orgId);
      if (org) {
        org.memberCount = list.length;
      }

      createdMember = newMember;
    }

    if (options?.skipAutoCredentials) {
      return createdMember;
    }

    const onboardingCredentials = await this.autoProvisionMemberCredentials({
      organizationId: orgId,
      memberId: String(createdMember.id),
      firstName,
      lastName,
      email: createdMember.email || email,
      phoneE164: createdMember.phoneE164 || phone,
      initialPassword:
        typeof payload.initialPassword === 'string' ? payload.initialPassword : undefined,
    });

    return {
      ...createdMember,
      onboardingCredentials,
    };
  }

  public async validateMemberImport(
    organizationId: string,
    incomingMembers: Record<string, any>[],
    duplicateMode: ImportDuplicateMode = 'skip'
  ): Promise<{
    summary: MemberImportValidationSummary;
    rows: ValidatedImportRow[];
    license: {
      allowed: boolean;
      code: string;
      message: string;
      seatsUsed: number;
      seatsLimit: number;
      remainingSeats: number | null;
      wouldExceedSeatLimit: boolean;
    };
  }> {
    const orgId = organizationId.toLowerCase();
    const [existingMembers, evalRes] = await Promise.all([
      this.getMembers(orgId),
      this.evaluateOrganizationLicense(orgId),
    ]);

    const existingIndex: ExistingMemberIndexEntry[] = existingMembers.map((m) => ({
      id: String(m.id),
      memberId: m.memberId ? String(m.memberId) : undefined,
      phoneE164: m.phoneE164 ? String(m.phoneE164) : undefined,
      email: m.email ? String(m.email) : undefined,
    }));

    const { rows, summary } = validateMemberImportBatch(
      incomingMembers,
      existingIndex,
      duplicateMode
    );

    const remainingSeats =
      evalRes.seatsLimit > 0 ? Math.max(0, evalRes.seatsLimit - evalRes.seatsUsed) : null;
    const wouldExceedSeatLimit =
      evalRes.seatsLimit > 0 &&
      summary.newInserts > 0 &&
      evalRes.seatsUsed + summary.newInserts > evalRes.seatsLimit;

    return {
      summary,
      rows,
      license: {
        allowed: evalRes.allowed,
        code: evalRes.code,
        message: evalRes.message,
        seatsUsed: evalRes.seatsUsed,
        seatsLimit: evalRes.seatsLimit,
        remainingSeats,
        wouldExceedSeatLimit,
      },
    };
  }

  public async batchImportMembers(
    organizationId: string,
    incomingMembers: Record<string, any>[],
    options?: {
      duplicateMode?: ImportDuplicateMode;
      dryRun?: boolean;
    }
  ): Promise<{
    dryRun: boolean;
    summary: MemberImportValidationSummary;
    rows: ValidatedImportRow[];
    license: {
      allowed: boolean;
      code: string;
      message: string;
      seatsUsed: number;
      seatsLimit: number;
      remainingSeats: number | null;
      wouldExceedSeatLimit: boolean;
    };
    members: Record<string, any>[];
    importedCount: number;
    updatedCount: number;
    skippedCount: number;
    invalidCount: number;
    credentialsProvisionedCount: number;
    credentialsExistingCount: number;
    credentialsSkippedCount: number;
    temporaryPassword?: string;
    errors: Array<{
      rowIndex: number;
      firstName?: string;
      lastName?: string;
      phoneE164?: string;
      errors: string[];
    }>;
  }> {
    const orgId = organizationId.toLowerCase();
    const duplicateMode: ImportDuplicateMode = options?.duplicateMode || 'skip';
    const dryRun = Boolean(options?.dryRun);

    const evalRes = await this.evaluateOrganizationLicense(orgId);
    if (!evalRes.allowed) {
      const err: any = new Error(evalRes.message);
      err.code = evalRes.code;
      err.status = evalRes.httpStatus;
      throw err;
    }

    const validation = await this.validateMemberImport(orgId, incomingMembers, duplicateMode);
    const { summary, rows, license } = validation;

    const rowErrors = rows
      .filter((r) => !r.isValid)
      .map((r) => ({
        rowIndex: r.rowIndex,
        firstName: r.data.firstName,
        lastName: r.data.lastName,
        phoneE164: r.data.phoneE164,
        errors: r.errors,
      }));

    if (dryRun) {
      return {
        dryRun: true,
        summary,
        rows,
        license,
        members: await this.getMembers(orgId),
        importedCount: 0,
        updatedCount: 0,
        skippedCount: summary.skipped,
        invalidCount: summary.invalid,
        credentialsProvisionedCount: 0,
        credentialsExistingCount: 0,
        credentialsSkippedCount: 0,
        errors: rowErrors,
      };
    }

    if (summary.newInserts > 0 && license.wouldExceedSeatLimit) {
      const err: any = new Error(
        `Batch import exceeds seat limit (${evalRes.seatsUsed + summary.newInserts}/${evalRes.seatsLimit}). Only ${license.remainingSeats ?? 0} seat(s) remaining.`
      );
      err.code = 'SEAT_LIMIT_REACHED';
      err.status = 403;
      err.details = {
        seatsUsed: evalRes.seatsUsed,
        seatsLimit: evalRes.seatsLimit,
        remainingSeats: license.remainingSeats,
        attemptedNewInserts: summary.newInserts,
        updates: summary.updates,
        skipped: summary.skipped,
      };
      throw err;
    }

    if (summary.newInserts === 0 && summary.updates === 0 && summary.invalid > 0) {
      const firstErrorMsg = rowErrors[0]?.errors?.[0] || 'All rows failed validation.';
      const err: any = new Error(
        `Import rejected: 0 valid importable rows (${summary.invalid} failed validation). First issue (Row ${rowErrors[0]?.rowIndex}): ${firstErrorMsg}`
      );
      err.code = 'IMPORT_VALIDATION_FAILED';
      err.status = 422;
      err.details = { summary, errors: rowErrors };
      throw err;
    }

    let importedCount = 0;
    let updatedCount = 0;
    let credentialsProvisionedCount = 0;
    let credentialsExistingCount = 0;
    let credentialsSkippedCount = 0;
    let temporaryPassword: string | undefined;

    for (const row of rows) {
      if (row.action === 'insert') {
        const created = await this.createMember(orgId, row.data);
        importedCount += 1;
        const credInfo = created.onboardingCredentials as OnboardingCredentialResult | undefined;
        if (credInfo?.status === 'created') {
          credentialsProvisionedCount += 1;
          temporaryPassword = temporaryPassword || credInfo.temporaryPassword;
        } else if (credInfo?.status === 'already_exists') {
          credentialsExistingCount += 1;
        } else {
          credentialsSkippedCount += 1;
        }
      } else if (row.action === 'update' && row.matchedMemberId) {
        const updated = await this.updateMember(orgId, row.matchedMemberId, row.data);
        updatedCount += 1;
        const credInfo = updated.onboardingCredentials as OnboardingCredentialResult | undefined;
        if (credInfo?.status === 'created') {
          credentialsProvisionedCount += 1;
          temporaryPassword = temporaryPassword || credInfo.temporaryPassword;
        } else if (credInfo?.status === 'already_exists') {
          credentialsExistingCount += 1;
        }
      }
    }

    const members = await this.getMembers(orgId);
    return {
      dryRun: false,
      summary,
      rows,
      license,
      members,
      importedCount,
      updatedCount,
      skippedCount: summary.skipped,
      invalidCount: summary.invalid,
      credentialsProvisionedCount,
      credentialsExistingCount,
      credentialsSkippedCount,
      ...(temporaryPassword ? { temporaryPassword } : {}),
      errors: rowErrors,
    };
  }

  public async updateMember(
    organizationId: string,
    memberId: string,
    updates: Record<string, any>
  ): Promise<Record<string, any>> {
    this.assertDatabaseAvailable();
    const orgId = organizationId.toLowerCase();
    let updatedMember: Record<string, any> | null = null;

    if (this.supabase) {
      if (!UUID_REGEX.test(memberId)) {
        const notFoundErr: any = new Error('Member not found in organisation');
        notFoundErr.status = 404;
        throw notFoundErr;
      }
      const { data: existingRow } = await this.supabase
        .from('members')
        .select('*')
        .eq('organization_id', orgId)
        .eq('id', memberId)
        .maybeSingle();

      if (!existingRow) {
        const notFoundErr: any = new Error('Member not found in organisation');
        notFoundErr.status = 404;
        throw notFoundErr;
      }

      const existingCustom =
        existingRow?.custom_attributes && typeof existingRow.custom_attributes === 'object'
          ? (existingRow.custom_attributes as Record<string, unknown>)
          : {};

      const nextDobForBirth =
        updates.dateOfBirth !== undefined
          ? updates.dateOfBirth
            ? String(updates.dateOfBirth)
            : null
          : existingRow?.date_of_birth ?? (existingCustom.dateOfBirth as string | undefined);
      const nextMonthInput =
        updates.dateOfBirth !== undefined && updates.dateOfBirth
          ? undefined
          : updates.monthOfBirth !== undefined
          ? updates.monthOfBirth
          : existingRow?.month_of_birth ?? (existingCustom.monthOfBirth as string | undefined);
      const syncedBirth = resolveMemberBirthFields({
        dateOfBirth: nextDobForBirth,
        monthOfBirth: nextMonthInput,
        birthMonthGroup: updates.birthMonthGroup ?? (existingCustom.birthMonthGroup as string | undefined),
      });
      const hasDeptUpdate = updates.department !== undefined || updates.departments !== undefined;
      const syncedDepts = hasDeptUpdate
        ? normalizeMemberDepartmentFields({
            department:
              updates.department !== undefined
                ? updates.department
                : existingRow?.department ?? (existingCustom.department as string | undefined),
            departments:
              updates.departments !== undefined
                ? Array.isArray(updates.departments)
                  ? updates.departments
                  : undefined
                : undefined,
          })
        : null;
      const syncedUpdates = {
        ...updates,
        ...(syncedDepts
          ? {
              department: syncedDepts.department,
              departments: syncedDepts.departments,
            }
          : {}),
        monthOfBirth: syncedBirth.monthOfBirth ?? (updates.dateOfBirth === '' ? '' : updates.monthOfBirth),
        birthMonthGroup: syncedBirth.birthMonthGroup ?? (updates.dateOfBirth === '' && !syncedBirth.monthOfBirth ? '' : updates.birthMonthGroup),
      };

      const patch: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
        custom_attributes: this.extractMemberCustomAttributes(syncedUpdates, existingCustom),
      };
      if (syncedDepts) {
        patch.department = syncedDepts.department;
      }
      const firstName = updates.firstName ?? existingRow?.first_name;
      const lastName = updates.lastName ?? existingRow?.last_name;
      if (updates.firstName !== undefined) patch.first_name = updates.firstName;
      if (updates.lastName !== undefined) patch.last_name = updates.lastName;
      if (updates.preferredName !== undefined) {
        patch.preferred_name = updates.preferredName
          ? String(updates.preferredName).trim()
          : `${firstName || ''} ${lastName || ''}`.trim();
      } else if (updates.firstName !== undefined || updates.lastName !== undefined) {
        patch.preferred_name = `${firstName || ''} ${lastName || ''}`.trim();
      }
      if (updates.email !== undefined) {
        patch.email = updates.email ? String(updates.email).trim().toLowerCase() : null;
      }
      if (updates.phoneE164 !== undefined) {
        patch.phone_e164 = updates.phoneE164 ? normalizePhone(String(updates.phoneE164)) || updates.phoneE164 : null;
      }
      if (
        updates.gender !== undefined &&
        ['male', 'female', 'other'].includes(String(updates.gender).toLowerCase())
      ) {
        patch.gender = String(updates.gender).toLowerCase();
      }
      if (updates.dateOfBirth !== undefined) {
        if (updates.dateOfBirth === '' || updates.dateOfBirth === null) {
          patch.date_of_birth = null;
        } else if (/^\d{4}-\d{2}-\d{2}$/.test(String(updates.dateOfBirth))) {
          patch.date_of_birth = String(updates.dateOfBirth);
        }
      }
      if (
        updates.imageUrl !== undefined ||
        updates.image_url !== undefined ||
        updates.photo_url !== undefined ||
        updates.photoUrl !== undefined ||
        updates.image !== undefined
      ) {
        const nextImg = [
          updates.imageUrl,
          updates.image_url,
          updates.photo_url,
          updates.photoUrl,
          updates.image,
        ].find((val) => typeof val === 'string' && val.trim().length > 0);
        patch.photo_url = typeof nextImg === 'string' ? nextImg.trim() : null;
        patch.image_url = typeof nextImg === 'string' ? nextImg.trim() : null;
      }
      if (updates.status !== undefined) {
        patch.status = this.mapPersonStatusToDbStatus(updates.status);
      }

      let { data, error } = await this.supabase
        .from('members')
        .update(patch)
        .eq('organization_id', orgId)
        .eq('id', memberId)
        .select('*')
        .maybeSingle();

      if (
        error &&
        /column .* does not exist|Could not find the '[^']+' column|schema cache/i.test(
          error.message || ''
        )
      ) {
        const { image_url: _dropImg, ...fallbackPatch } = patch;
        const retry = await this.supabase
          .from('members')
          .update(fallbackPatch)
          .eq('organization_id', orgId)
          .eq('id', memberId)
          .select('*')
          .maybeSingle();
        data = retry.data;
        error = retry.error;

        if (
          error &&
          /column .* does not exist|Could not find the '[^']+' column|schema cache/i.test(
            error.message || ''
          )
        ) {
          const { photo_url: _dropPhoto, department: _dropDept, ...minimalPatch } = fallbackPatch;
          const retryMinimal = await this.supabase
            .from('members')
            .update(minimalPatch)
            .eq('organization_id', orgId)
            .eq('id', memberId)
            .select('*')
            .maybeSingle();
          data = retryMinimal.data;
          error = retryMinimal.error;
        }
      }

      if (error) {
        throw new Error(`Failed to update member in Supabase: ${error.message}`);
      }
      if (!data) {
        const notFoundErr: any = new Error('Member not found in organisation');
        notFoundErr.status = 404;
        throw notFoundErr;
      }
      updatedMember = this.mapSupabaseMemberRow(orgId, data);
    } else {
      const list = this.membersByOrg.get(orgId) || [];
      const idx = list.findIndex((m) => m.id === memberId);
      if (idx < 0) {
        const notFoundErr: any = new Error('Member not found in organisation');
        notFoundErr.status = 404;
        throw notFoundErr;
      }
      const nextPhone =
        updates.phoneE164 !== undefined
          ? normalizePhone(String(updates.phoneE164)) || updates.phoneE164
          : list[idx].phoneE164;
      const nextEmail =
        updates.email !== undefined
          ? updates.email
            ? String(updates.email).trim().toLowerCase()
            : undefined
          : list[idx].email;

      const nextDobForBirth =
        updates.dateOfBirth !== undefined ? updates.dateOfBirth : list[idx].dateOfBirth;
      const nextMonthInput =
        updates.dateOfBirth !== undefined && updates.dateOfBirth
          ? undefined
          : updates.monthOfBirth !== undefined
          ? updates.monthOfBirth
          : list[idx].monthOfBirth;
      const syncedBirth = resolveMemberBirthFields({
        dateOfBirth: nextDobForBirth,
        monthOfBirth: nextMonthInput,
        birthMonthGroup: updates.birthMonthGroup ?? list[idx].birthMonthGroup,
      });

      const hasDeptUpdate = updates.department !== undefined || updates.departments !== undefined;
      const syncedDepts = hasDeptUpdate
        ? normalizeMemberDepartmentFields({
            department:
              updates.department !== undefined ? updates.department : list[idx].department,
            departments:
              updates.departments !== undefined
                ? Array.isArray(updates.departments)
                  ? updates.departments
                  : undefined
                : undefined,
          })
        : normalizeMemberDepartmentFields({
            department: list[idx].department,
            departments: Array.isArray(list[idx].departments) ? list[idx].departments : undefined,
          });

      const merged = {
        ...list[idx],
        ...updates,
        department: syncedDepts.department,
        departments: syncedDepts.departments,
        monthOfBirth: syncedBirth.monthOfBirth,
        birthMonthGroup: syncedBirth.birthMonthGroup,
        email: nextEmail,
        phoneE164: nextPhone,
        phoneNumber: nextPhone,
        id: memberId,
        tenantId: orgId,
      };
      list[idx] = merged;
      this.membersByOrg.set(orgId, list);
      updatedMember = merged;
    }

    const onboardingCredentials = await this.autoProvisionMemberCredentials({
      organizationId: orgId,
      memberId: String(updatedMember.id),
      firstName: String(updatedMember.firstName || 'Congregation'),
      lastName: String(updatedMember.lastName || 'Member'),
      email: updatedMember.email ? String(updatedMember.email) : undefined,
      phoneE164: updatedMember.phoneE164 ? String(updatedMember.phoneE164) : undefined,
    });

    return {
      ...updatedMember,
      onboardingCredentials,
    };
  }

  public async getMemberProfileForSession(
    organizationId: string,
    userId: string,
    email?: string
  ): Promise<Record<string, any> | null> {
    const orgId = organizationId.toLowerCase();
    const cleanEmail = (email || '').trim().toLowerCase();
    const list = await this.getMembers(orgId);
    const cred = await this.findCredentialByContactOrMember({
      memberId: userId,
      email: cleanEmail || undefined,
    });
    const matched = list.find(
      (m) =>
        m.id === userId ||
        (cred?.memberId && m.id === cred.memberId) ||
        (cleanEmail && String(m.email || '').toLowerCase() === cleanEmail)
    );
    return matched || null;
  }

  public async updateOwnMemberProfile(
    organizationId: string,
    userId: string,
    email: string | undefined,
    updates: Record<string, any>,
    fallbackName?: string
  ): Promise<Record<string, any>> {
    const orgId = organizationId.toLowerCase();
    let matched = await this.getMemberProfileForSession(orgId, userId, email);
    const cred = await this.findCredentialByContactOrMember({
      memberId: userId,
      email: email ? email.trim().toLowerCase() : undefined,
    });

    const deriveMonthName = (isoDate?: string): string | undefined => {
      if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return undefined;
      const monthIdx = Number(isoDate.slice(5, 7)) - 1;
      const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December',
      ];
      return months[monthIdx];
    };

    const nextEmail =
      updates.email !== undefined
        ? updates.email
          ? String(updates.email).trim().toLowerCase()
          : ''
        : undefined;
    const rawPhoneInput = updates.phoneE164 !== undefined ? updates.phoneE164 : updates.phoneNumber;
    const nextPhone =
      rawPhoneInput !== undefined
        ? rawPhoneInput
          ? normalizePhone(String(rawPhoneInput)) || String(rawPhoneInput).trim()
          : ''
        : undefined;

    // Prevent email or phone collisions with another user/member
    if (nextEmail || nextPhone) {
      const orgMembers = await this.getMembers(orgId);
      const conflictMember = orgMembers.find((m) => {
        if (matched && m.id === matched.id) return false;
        const emailMatch = nextEmail && m.email && String(m.email).trim().toLowerCase() === nextEmail;
        const phoneMatch =
          nextPhone && m.phoneE164 && normalizePhone(String(m.phoneE164)) === nextPhone;
        return Boolean(emailMatch || phoneMatch);
      });
      if (conflictMember) {
        const err: any = new Error('That email or phone number is already associated with another member.');
        err.code = 'CONTACT_ALREADY_IN_USE';
        err.status = 409;
        throw err;
      }

      if (nextEmail) {
        const existingEmailCred = await this.findCredentialByContactOrMember({ email: nextEmail });
        if (existingEmailCred && existingEmailCred.id !== cred?.id && existingEmailCred.id !== userId) {
          const err: any = new Error('That email address is already linked to another account.');
          err.code = 'CONTACT_ALREADY_IN_USE';
          err.status = 409;
          throw err;
        }
      }
      if (nextPhone) {
        const existingPhoneCred = await this.findCredentialByContactOrMember({ phoneE164: nextPhone });
        if (existingPhoneCred && existingPhoneCred.id !== cred?.id && existingPhoneCred.id !== userId) {
          const err: any = new Error('That phone number is already linked to another account.');
          err.code = 'CONTACT_ALREADY_IN_USE';
          err.status = 409;
          throw err;
        }
      }
    }

    const safeUpdates: Record<string, any> = {};
    const stringFields = [
      'firstName',
      'middleName',
      'lastName',
      'preferredName',
      'dateOfBirth',
      'monthOfBirth',
      'placeOfResidence',
      'specificLocation',
      'residentialDigitalAddress',
      'hometown',
      'occupation',
      'maritalStatus',
      'spouseName',
      'emergencyContactPerson',
      'emergencyContactPhone',
      'groupName',
      'homeCellGroup',
      'department',
      'squads',
      'dateOfSalvation',
      'dateOfBaptism',
      'dateOfMarriage',
      'remarks',
      'notes',
    ];
    for (const field of stringFields) {
      if (updates[field] !== undefined) {
        safeUpdates[field] = typeof updates[field] === 'string' ? updates[field].trim() : updates[field];
      }
    }
    if (updates.gender !== undefined && ['male', 'female', 'other'].includes(String(updates.gender).toLowerCase())) {
      safeUpdates.gender = String(updates.gender).toLowerCase();
    }
    if (updates.numberOfChildren !== undefined && Number.isFinite(Number(updates.numberOfChildren))) {
      safeUpdates.numberOfChildren = Math.max(0, Math.min(50, Math.trunc(Number(updates.numberOfChildren))));
    }
    if (nextEmail !== undefined) {
      safeUpdates.email = nextEmail;
    }
    if (nextPhone !== undefined) {
      safeUpdates.phoneE164 = nextPhone;
      safeUpdates.phoneNumber = nextPhone;
    }
    const effectiveDob =
      safeUpdates.dateOfBirth !== undefined ? safeUpdates.dateOfBirth : matched?.dateOfBirth;
    const effectiveMonthInput =
      safeUpdates.dateOfBirth !== undefined && safeUpdates.dateOfBirth
        ? undefined
        : safeUpdates.monthOfBirth !== undefined
        ? safeUpdates.monthOfBirth
        : matched?.monthOfBirth;
    const syncedBirth = resolveMemberBirthFields({
      dateOfBirth: effectiveDob,
      monthOfBirth: effectiveMonthInput,
      birthMonthGroup: updates.birthMonthGroup ?? matched?.birthMonthGroup,
    });
    if (syncedBirth.monthOfBirth) {
      safeUpdates.monthOfBirth = syncedBirth.monthOfBirth;
      safeUpdates.birthMonthGroup = syncedBirth.birthMonthGroup;
    }
    if (updates.departments !== undefined || updates.department !== undefined) {
      const normalizedDepts = normalizeMemberDepartmentFields({
        department: typeof updates.department === 'string' ? updates.department : undefined,
        departments: Array.isArray(updates.departments) ? updates.departments : undefined,
      });
      safeUpdates.departments = normalizedDepts.departments;
      safeUpdates.department = normalizedDepts.department;
    }
    if (safeUpdates.homeCellGroup && !safeUpdates.groupName) {
      safeUpdates.groupName = safeUpdates.homeCellGroup;
    } else if (safeUpdates.groupName && !safeUpdates.homeCellGroup) {
      safeUpdates.homeCellGroup = safeUpdates.groupName;
    }
    if (updates.imageUrl !== undefined) safeUpdates.imageUrl = updates.imageUrl || '';
    if (updates.autoCheckinOptedIn !== undefined) {
      safeUpdates.autoCheckinOptedIn = Boolean(updates.autoCheckinOptedIn);
    }

    let resultMember: Record<string, any>;
    if (!matched) {
      const cleanName = (fallbackName || email?.split('@')[0] || 'Church Member').trim();
      const parts = cleanName.split(/\s+/).filter(Boolean);
      const fallbackFirst = parts[0] || 'Church';
      const fallbackLast = parts.slice(1).join(' ') || 'Member';
      const fallbackDepts = normalizeMemberDepartmentFields({
        department: safeUpdates.department,
        departments: Array.isArray(safeUpdates.departments) ? safeUpdates.departments : undefined,
      });
      resultMember = await this.createMember(
        orgId,
        {
          id: UUID_REGEX.test(userId) ? userId : undefined,
          ...safeUpdates,
          firstName: safeUpdates.firstName || fallbackFirst,
          lastName: safeUpdates.lastName || fallbackLast,
          email: safeUpdates.email !== undefined ? safeUpdates.email || undefined : email ? email.trim().toLowerCase() : undefined,
          preferredName:
            safeUpdates.preferredName ||
            `${safeUpdates.firstName || fallbackFirst} ${safeUpdates.lastName || fallbackLast}`.trim() ||
            cleanName,
          imageUrl: safeUpdates.imageUrl || undefined,
          autoCheckinOptedIn: safeUpdates.autoCheckinOptedIn ?? true,
          groupName: safeUpdates.groupName || safeUpdates.homeCellGroup || 'General Congregation',
          homeCellGroup: safeUpdates.homeCellGroup || safeUpdates.groupName || 'General Congregation',
          department: fallbackDepts.department,
          departments: fallbackDepts.departments,
          status: 'member',
        },
        { skipAutoCredentials: true }
      );
    } else {
      resultMember = await this.updateMember(orgId, String(matched.id), safeUpdates);
    }

    // Sync updated display name / email / phone back to credential record
    const updatedFullName = `${resultMember.firstName || ''} ${resultMember.lastName || ''}`.trim();
    const sb = this.activeSupabase;
    if (cred) {
      const nextCredEmail =
        safeUpdates.email !== undefined
          ? safeUpdates.email || undefined
          : cred.email;
      const nextCredPhone =
        safeUpdates.phoneE164 !== undefined
          ? safeUpdates.phoneE164 || undefined
          : cred.phoneE164;
      const nextCredName = updatedFullName || cred.name;

      if (sb && UUID_REGEX.test(cred.id)) {
        const credPatch: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
          full_name: nextCredName,
          member_id: UUID_REGEX.test(String(resultMember.id)) ? String(resultMember.id) : cred.memberId || null,
        };
        if (safeUpdates.email !== undefined) credPatch.email = nextCredEmail || null;
        if (safeUpdates.phoneE164 !== undefined) credPatch.phone_e164 = nextCredPhone || null;
        await sb.from('account_credentials').update(credPatch).eq('id', cred.id);
      }

      const memCred = this.userCredentials.get(cred.id);
      if (memCred) {
        this.userCredentials.set(cred.id, {
          ...memCred,
          name: nextCredName,
          email: nextCredEmail,
          phoneE164: nextCredPhone,
          memberId: String(resultMember.id),
        });
      }
    }

    await this.recordAuthAuditEvent({
      organizationId: orgId,
      accountId: cred?.id || userId,
      identifier: resultMember.email || resultMember.phoneE164 || userId,
      eventType: 'member_profile_updated',
      success: true,
      reason: 'self_service_profile_edit',
    });

    return resultMember;
  }

  public async deleteMember(organizationId: string, memberId: string): Promise<void> {
    this.assertDatabaseAvailable();
    const orgId = organizationId.toLowerCase();
    if (this.supabase) {
      if (!UUID_REGEX.test(memberId)) {
        const notFound: any = new Error('Member not found.');
        notFound.code = 'MEMBER_NOT_FOUND';
        notFound.status = 404;
        throw notFound;
      }

      const { data: existingMember, error: lookupErr } = await this.supabase
        .from('members')
        .select('id, user_id, email')
        .eq('organization_id', orgId)
        .eq('id', memberId)
        .maybeSingle();

      if (lookupErr) {
        throw new Error(`Failed to verify member before deletion: ${lookupErr.message}`);
      }
      if (!existingMember) {
        const notFound: any = new Error('Member not found in database.');
        notFound.code = 'MEMBER_NOT_FOUND';
        notFound.status = 404;
        throw notFound;
      }

      const authUserIds = new Set<string>();
      const creatorAuthIds = new Set<string>();
      const { data: creatorRows } = await this.supabase
        .from('account_credentials')
        .select('auth_user_id')
        .eq('is_creator', true);
      for (const row of creatorRows || []) {
        if (row.auth_user_id) creatorAuthIds.add(String(row.auth_user_id).toLowerCase());
      }

      if (existingMember.user_id) {
        const uid = String(existingMember.user_id).toLowerCase();
        if (!creatorAuthIds.has(uid)) authUserIds.add(uid);
      }

      const { data: credRows } = await this.supabase
        .from('account_credentials')
        .select('id, auth_user_id, is_creator')
        .eq('organization_id', orgId)
        .eq('member_id', memberId);

      for (const row of credRows || []) {
        if (!row.is_creator && row.auth_user_id) {
          const uid = String(row.auth_user_id).toLowerCase();
          if (!creatorAuthIds.has(uid)) authUserIds.add(uid);
        }
      }

      const safeDeleteMemberDep = async (table: string, filters: Record<string, string>) => {
        let q = this.supabase!.from(table).delete();
        for (const [col, val] of Object.entries(filters)) {
          q = q.eq(col, val);
        }
        const { error } = await q;
        if (
          error &&
          !/does not exist|Could not find the|relation "?(?:public\.)?[^"]+"? does not exist|schema cache|42P01|42703|PGRST205/i.test(
            error.message || ''
          )
        ) {
          throw new Error(`Failed deleting dependent member records from ${table}: ${error.message}`);
        }
      };

      await safeDeleteMemberDep('attendance', { organization_id: orgId, member_id: memberId });
      await safeDeleteMemberDep('attendance_records', { tenant_id: orgId, person_id: memberId });
      await safeDeleteMemberDep('donations', { organization_id: orgId, member_id: memberId });
      await safeDeleteMemberDep('followup_tasks', { organization_id: orgId, member_id: memberId });
      await safeDeleteMemberDep('member_consents', { organization_id: orgId, member_id: memberId });
      await safeDeleteMemberDep('event_rsvps', { organization_id: orgId, member_id: memberId });
      await safeDeleteMemberDep('push_subscriptions', { organization_id: orgId, person_id: memberId });
      await safeDeleteMemberDep('church_wall_posts', { organization_id: orgId, author_id: memberId });
      await safeDeleteMemberDep('church_wall_posts', { organization_id: orgId, target_member_id: memberId });
      await safeDeleteMemberDep('account_credentials', {
        organization_id: orgId,
        member_id: memberId,
      });

      const { error: memDelErr } = await this.supabase
        .from('members')
        .delete()
        .eq('organization_id', orgId)
        .eq('id', memberId);
      if (memDelErr) {
        throw new Error(`Failed to delete member in Supabase: ${memDelErr.message}`);
      }

      for (const authUid of authUserIds) {
        try {
          await this.supabase.auth.admin.deleteUser(authUid);
        } catch {
          // ignore if already removed from Auth
        }
      }
      return;
    }

    const currentList = this.membersByOrg.get(orgId) || [];
    if (!currentList.some((m) => m.id === memberId)) {
      const notFound: any = new Error('Member not found.');
      notFound.code = 'MEMBER_NOT_FOUND';
      notFound.status = 404;
      throw notFound;
    }
    const list = currentList.filter((m) => m.id !== memberId);
    this.membersByOrg.set(orgId, list);

    const existingCheckins = this.checkinsByOrg.get(orgId) || [];
    this.checkinsByOrg.set(
      orgId,
      existingCheckins.filter((c) => c.personId !== memberId)
    );
    const existingSubs = this.pushSubsByOrg.get(orgId) || [];
    this.pushSubsByOrg.set(
      orgId,
      existingSubs.filter((s) => s.personId !== memberId)
    );
    const existingDonations = this.donationsByOrg.get(orgId) || [];
    this.donationsByOrg.set(
      orgId,
      existingDonations.filter((d) => d.personId !== memberId)
    );
    const existingFollowups = this.followupTasksByOrg.get(orgId) || [];
    this.followupTasksByOrg.set(
      orgId,
      existingFollowups.filter((t) => t.personId !== memberId)
    );
    for (const [credId, cred] of this.userCredentials.entries()) {
      if (cred.organizationId.toLowerCase() === orgId && cred.memberId === memberId && !cred.isCreator) {
        this.userCredentials.delete(credId);
      }
    }
    const org = this.orgs.get(orgId);
    if (org) {
      org.memberCount = list.length;
    }
  }

  public async getEvents(organizationId: string): Promise<Record<string, any>[]> {
    this.assertDatabaseAvailable();
    const orgId = organizationId.toLowerCase();
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('events')
        .select('*')
        .eq('organization_id', orgId)
        .order('start_time', { ascending: true });
      if (error) {
        throw new Error(`Failed to load events from Supabase: ${error.message}`);
      }
      return data || [];
    }
    return [...(this.eventsByOrg.get(orgId) || [])];
  }

  public async createEvent(
    organizationId: string,
    eventData: {
      name: string;
      date: string;
      startTimeIso: string;
      endTimeIso: string;
      dwellMin: number;
      status: string;
      expectedAttendance: number;
    }
  ): Promise<Record<string, any>> {
    this.assertDatabaseAvailable();
    const orgId = organizationId.toLowerCase();
    const mapStatusForDb = (raw?: string): 'active' | 'completed' | 'cancelled' => {
      const normalized = String(raw || '').trim().toLowerCase();
      if (normalized === 'cancelled') return 'cancelled';
      if (normalized === 'closed' || normalized === 'completed') return 'completed';
      return 'active';
    };

    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('events')
        .insert({
          organization_id: orgId,
          name: eventData.name,
          description:
            eventData.expectedAttendance > 0
              ? `Expected attendance: ${eventData.expectedAttendance}`
              : null,
          start_time: eventData.startTimeIso,
          end_time: eventData.endTimeIso,
          dwell_min: Math.max(0, Math.round(Number(eventData.dwellMin) || 0)),
          status: mapStatusForDb(eventData.status),
        })
        .select('*')
        .single();

      if (error) {
        throw new Error(`Failed to save scheduled service: ${error.message}`);
      }
      if (data) {
        return {
          ...data,
          date: eventData.date,
          expected_attendance: eventData.expectedAttendance,
        };
      }
    }

    const created = {
      id: randomUUID(),
      organization_id: orgId,
      name: eventData.name,
      date: eventData.date,
      start_time: eventData.startTimeIso,
      end_time: eventData.endTimeIso,
      starts_at: eventData.startTimeIso,
      ends_at: eventData.endTimeIso,
      dwell_min: eventData.dwellMin,
      status: eventData.status,
      site_id: PRIMARY_CAMPUS_SITE_ID,
      expected_attendance: eventData.expectedAttendance,
    };
    const list = this.eventsByOrg.get(orgId) || [];
    list.push(created);
    this.eventsByOrg.set(orgId, list);
    return created;
  }

  public async updateEvent(
    organizationId: string,
    eventId: string,
    updates: {
      name?: string;
      date?: string;
      startTimeIso?: string;
      endTimeIso?: string;
      dwellMin?: number;
      status?: string;
      expectedAttendance?: number;
    }
  ): Promise<Record<string, any>> {
    this.assertDatabaseAvailable();
    const orgId = organizationId.toLowerCase();

    if (this.supabase) {
      if (!UUID_REGEX.test(eventId)) {
        const notFound: any = new Error('Service event not found.');
        notFound.code = 'EVENT_NOT_FOUND';
        notFound.status = 404;
        throw notFound;
      }

      const patch: Record<string, unknown> = {};
      if (typeof updates.name === 'string' && updates.name.trim()) {
        patch.name = updates.name.trim();
      }
      if (typeof updates.startTimeIso === 'string' && updates.startTimeIso.trim()) {
        patch.start_time = updates.startTimeIso.trim();
      }
      if (typeof updates.endTimeIso === 'string' && updates.endTimeIso.trim()) {
        patch.end_time = updates.endTimeIso.trim();
      }
      if (typeof updates.dwellMin === 'number' && Number.isFinite(updates.dwellMin)) {
        patch.dwell_min = Math.max(0, Math.round(updates.dwellMin));
      }
      if (typeof updates.status === 'string' && updates.status.trim()) {
        const st = updates.status.trim().toLowerCase();
        patch.status =
          st === 'cancelled'
            ? 'cancelled'
            : st === 'closed' || st === 'completed'
            ? 'completed'
            : 'active';
      }
      if (typeof updates.expectedAttendance === 'number' && Number.isFinite(updates.expectedAttendance)) {
        const cleanExpected = Math.max(0, Math.round(updates.expectedAttendance));
        patch.description = cleanExpected > 0 ? `Expected attendance: ${cleanExpected}` : null;
      }

      const { data, error } = await this.supabase
        .from('events')
        .update(patch)
        .eq('organization_id', orgId)
        .eq('id', eventId)
        .select('*')
        .maybeSingle();

      if (error) {
        throw new Error(`Failed to update service event in Supabase: ${error.message}`);
      }
      if (!data) {
        const notFound: any = new Error('Service event not found in database.');
        notFound.code = 'EVENT_NOT_FOUND';
        notFound.status = 404;
        throw notFound;
      }
      return {
        ...data,
        ...(updates.date ? { date: updates.date } : {}),
        ...(typeof updates.expectedAttendance === 'number'
          ? { expected_attendance: Math.max(0, Math.round(updates.expectedAttendance)) }
          : {}),
      };
    }

    const list = this.eventsByOrg.get(orgId) || [];
    const idx = list.findIndex((ev) => ev.id === eventId);
    if (idx < 0) {
      const notFound: any = new Error('Service event not found.');
      notFound.code = 'EVENT_NOT_FOUND';
      notFound.status = 404;
      throw notFound;
    }

    const current = list[idx];
    const next = {
      ...current,
      ...(typeof updates.name === 'string' && updates.name.trim() ? { name: updates.name.trim() } : {}),
      ...(updates.date ? { date: updates.date } : {}),
      ...(updates.startTimeIso
        ? { start_time: updates.startTimeIso, starts_at: updates.startTimeIso }
        : {}),
      ...(updates.endTimeIso
        ? { end_time: updates.endTimeIso, ends_at: updates.endTimeIso }
        : {}),
      ...(typeof updates.dwellMin === 'number' && Number.isFinite(updates.dwellMin)
        ? { dwell_min: Math.max(0, Math.round(updates.dwellMin)) }
        : {}),
      ...(typeof updates.status === 'string' && updates.status.trim()
        ? { status: updates.status.trim() }
        : {}),
      ...(typeof updates.expectedAttendance === 'number' && Number.isFinite(updates.expectedAttendance)
        ? { expected_attendance: Math.max(0, Math.round(updates.expectedAttendance)) }
        : {}),
    };
    list[idx] = next;
    this.eventsByOrg.set(orgId, list);
    return next;
  }

  public async deleteEvent(organizationId: string, eventId: string): Promise<void> {
    this.assertDatabaseAvailable();
    const orgId = organizationId.toLowerCase();
    if (this.supabase) {
      if (!UUID_REGEX.test(eventId)) {
        const notFound: any = new Error('Service event not found.');
        notFound.code = 'EVENT_NOT_FOUND';
        notFound.status = 404;
        throw notFound;
      }

      const { data: existingEvent, error: lookupErr } = await this.supabase
        .from('events')
        .select('id')
        .eq('organization_id', orgId)
        .eq('id', eventId)
        .maybeSingle();

      if (lookupErr) {
        throw new Error(`Failed to verify service event before deletion: ${lookupErr.message}`);
      }
      if (!existingEvent) {
        const notFound: any = new Error('Service event not found in database.');
        notFound.code = 'EVENT_NOT_FOUND';
        notFound.status = 404;
        throw notFound;
      }

      await this.supabase
        .from('attendance')
        .delete()
        .eq('organization_id', orgId)
        .eq('event_id', eventId);

      const { error: delErr } = await this.supabase
        .from('events')
        .delete()
        .eq('organization_id', orgId)
        .eq('id', eventId);

      if (delErr) {
        throw new Error(`Failed to delete service event in Supabase: ${delErr.message}`);
      }
      return;
    }

    const list = this.eventsByOrg.get(orgId) || [];
    if (!list.some((ev) => ev.id === eventId)) {
      const notFound: any = new Error('Service event not found.');
      notFound.code = 'EVENT_NOT_FOUND';
      notFound.status = 404;
      throw notFound;
    }
    this.eventsByOrg.set(
      orgId,
      list.filter((ev) => ev.id !== eventId)
    );
    const checkins = this.checkinsByOrg.get(orgId) || [];
    this.checkinsByOrg.set(
      orgId,
      checkins.filter((c) => c.serviceInstanceId !== eventId)
    );
  }

  public async getServiceHistory(organizationId: string): Promise<{
    summary: {
      totalServices: number;
      liveServices: number;
      closedServices: number;
      completedServices: number;
      upcomingServices: number;
      totalHistoricalCheckins: number;
      uniqueAttendees: number;
      averageAttendancePerService: number;
      peakServiceId: string | null;
      peakServiceName: string | null;
      peakServiceCount: number;
    };
    services: Array<{
      id: string;
      name: string;
      date: string;
      startsAt: string;
      endsAt: string;
      startTimeIso?: string;
      endTimeIso?: string;
      allowanceMinutes: number;
      closesAtIso?: string | null;
      status: BinaryServiceStatus;
      rawStatus: string;
      expectedAttendance: number;
      totalCheckedIn: number;
      fillRatePct: number;
      onTimeCount: number;
      lateCount: number;
      onTimePct: number;
      autoProximityCount: number;
      assistedDoorCount: number;
      autoPct: number;
      avgConfidence: number;
      methodBreakdown: Record<string, number>;
      attendees: Array<{
        id: string;
        personId: string;
        name: string;
        imageUrl?: string;
        initials: string;
        groupName: string;
        department: string;
        status: string;
        method: string;
        checkedInAt: string;
        checkedInIso: string;
        late: boolean;
        confidence: number;
        distanceM: number | null;
      }>;
    }>;
  }> {
    this.assertDatabaseAvailable();
    const orgId = organizationId.toLowerCase();
    const [eventsList, allCheckins, membersList] = await Promise.all([
      this.getEvents(orgId),
      this.getLiveCheckins(orgId, null, 2500),
      this.getMembers(orgId),
    ]);

    const memberMap = new Map<string, Record<string, any>>();
    for (const m of membersList) {
      if (m && m.id) {
        memberMap.set(String(m.id), m);
      }
    }

    const checkinsByService = new Map<string, LiveCheckinItem[]>();
    const uniquePeople = new Set<string>();
    for (const rec of allCheckins) {
      const svcKey = rec.serviceInstanceId || 'unassigned';
      const existingList = checkinsByService.get(svcKey) || [];
      // Deduplicate by person within the same service
      if (!existingList.some((r) => r.personId === rec.personId)) {
        existingList.push(rec);
        checkinsByService.set(svcKey, existingList);
      }
      if (rec.personId) {
        uniquePeople.add(rec.personId);
      }
    }

    const formatTimeShort = (raw: unknown, fallback: string): string => {
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

    const todayIso = new Date().toISOString().split('T')[0];
    const nowMs = Date.now();
    const seenServiceIds = new Set<string>();

    const buildEntry = (ev: Record<string, any>) => {
      const id = String(ev.id);
      seenServiceIds.add(id);

      const startRaw = ev.start_time || ev.starts_at || null;
      const endRaw = ev.end_time || ev.ends_at || null;
      let dateStr = typeof ev.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ev.date) ? ev.date : '';
      if (!dateStr && typeof startRaw === 'string' && startRaw.includes('T')) {
        dateStr = startRaw.split('T')[0];
      }
      if (!dateStr) {
        dateStr = todayIso;
      }

      const startsAt = formatTimeShort(startRaw, '08:00');
      const endsAt = formatTimeShort(endRaw, '10:30');

      let expectedAttendance = Number(ev.expected_attendance) || 0;
      if (!expectedAttendance && typeof ev.description === 'string') {
        const match = ev.description.match(/Expected attendance:\s*(\d+)/i);
        if (match) expectedAttendance = Number(match[1]) || 0;
      }
      if (!expectedAttendance && membersList.length > 0) {
        expectedAttendance = membersList.length;
      }

      const rawStatus = String(ev.status || 'active').toLowerCase();
      const allowanceMinutes = Math.max(
        0,
        Number(ev.dwell_min ?? ev.dwellMinutes ?? ev.allowance_minutes ?? 0) || 0
      );
      const startTimeIso = typeof startRaw === 'string' && startRaw.includes('T') ? startRaw : undefined;
      const endTimeIso = typeof endRaw === 'string' && endRaw.includes('T') ? endRaw : undefined;
      const resolvedWindow = resolveServiceWindow({
        date: dateStr,
        startsAt,
        endsAt,
        startTimeIso,
        endTimeIso,
        allowanceMinutes,
        rawStatus,
        nowMs,
      });
      const computedStatus: BinaryServiceStatus = resolvedWindow.status;

      const serviceRecs = checkinsByService.get(id) || [];
      const [sh, sm] = startsAt.split(':').map((n) => Number(n) || 0);
      const graceMins = sh * 60 + sm + (allowanceMinutes > 0 ? allowanceMinutes : 15);

      const methodBreakdown: Record<string, number> = {
        geofence: 0,
        beacon: 0,
        usher: 0,
        posted_qr: 0,
        manual: 0,
        email_link: 0,
      };
      let onTimeCount = 0;
      let lateCount = 0;
      let autoProximityCount = 0;
      let confidenceSum = 0;

      const attendees = serviceRecs.map((rec) => {
        const person = memberMap.get(rec.personId);
        const first = person?.firstName || '';
        const last = person?.lastName || '';
        const resolvedName =
          `${first} ${last}`.trim() || rec.personName || 'Registered Member';
        const initials =
          person?.avatarInitials ||
          resolvedName
            .split(' ')
            .filter(Boolean)
            .slice(0, 2)
            .map((p) => p[0]?.toUpperCase() || '')
            .join('') ||
          'M';

        let isLate = Boolean(rec.late);
        if (!isLate && rec.checkedInIso) {
          const dt = new Date(rec.checkedInIso);
          if (!Number.isNaN(dt.getTime())) {
            const recDate = dt.toISOString().split('T')[0];
            if (recDate === dateStr) {
              const recMins = dt.getHours() * 60 + dt.getMinutes();
              if (recMins > graceMins) isLate = true;
            }
          }
        }

        if (isLate) lateCount += 1;
        else onTimeCount += 1;

        const methodKey = rec.method || 'manual';
        methodBreakdown[methodKey] = (methodBreakdown[methodKey] || 0) + 1;
        if (methodKey === 'geofence' || methodKey === 'beacon') {
          autoProximityCount += 1;
        }
        const conf = typeof rec.confidence === 'number' ? rec.confidence : 95;
        confidenceSum += conf;

        return {
          id: rec.id,
          personId: rec.personId,
          name: resolvedName,
          imageUrl: person?.imageUrl || undefined,
          initials,
          groupName: person?.homeCellGroup || person?.groupName || 'General Congregation',
          department: person?.department || 'General',
          status: person?.status || 'member',
          method: methodKey,
          checkedInAt: rec.checkedInAt,
          checkedInIso: rec.checkedInIso,
          late: isLate,
          confidence: conf,
          distanceM: rec.distanceM ?? null,
        };
      });

      const totalCheckedIn = attendees.length;
      const assistedDoorCount = Math.max(0, totalCheckedIn - autoProximityCount);
      const fillRatePct =
        expectedAttendance > 0
          ? Math.min(100, Math.round((totalCheckedIn / expectedAttendance) * 100))
          : 0;
      const onTimePct = totalCheckedIn > 0 ? Math.round((onTimeCount / totalCheckedIn) * 100) : 0;
      const autoPct =
        totalCheckedIn > 0 ? Math.round((autoProximityCount / totalCheckedIn) * 100) : 0;
      const avgConfidence = totalCheckedIn > 0 ? Math.round(confidenceSum / totalCheckedIn) : 0;

      return {
        id,
        name: String(ev.name || 'Worship Service'),
        date: dateStr,
        startsAt,
        endsAt,
        startTimeIso,
        endTimeIso,
        allowanceMinutes,
        closesAtIso: resolvedWindow.closesAtIso,
        status: computedStatus,
        rawStatus,
        expectedAttendance,
        totalCheckedIn,
        fillRatePct,
        onTimeCount,
        lateCount,
        onTimePct,
        autoProximityCount,
        assistedDoorCount,
        autoPct,
        avgConfidence,
        methodBreakdown,
        attendees,
      };
    };

    const entries = eventsList.map(buildEntry);

    // Include any historical attendance logs tied to service IDs not present in events table
    for (const [svcId, recs] of checkinsByService.entries()) {
      if (seenServiceIds.has(svcId)) continue;
      const earliestIso = recs[recs.length - 1]?.checkedInIso || new Date().toISOString();
      const dateStr = earliestIso.split('T')[0] || todayIso;
      entries.push(
        buildEntry({
          id: svcId,
          name: svcId === 'svc-sun-1' ? 'Sunday Worship Service' : `Recorded Service (${dateStr})`,
          date: dateStr,
          starts_at: '08:00',
          ends_at: '10:30',
          status: dateStr < todayIso ? 'closed' : 'active',
        })
      );
    }

    entries.sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return b.startsAt.localeCompare(a.startsAt);
    });

    let liveServices = 0;
    let closedServices = 0;
    let totalHistoricalCheckins = 0;
    let peakServiceId: string | null = null;
    let peakServiceName: string | null = null;
    let peakServiceCount = 0;

    for (const entry of entries) {
      if (entry.status === 'live') liveServices += 1;
      else closedServices += 1;

      totalHistoricalCheckins += entry.totalCheckedIn;
      if (entry.totalCheckedIn > peakServiceCount) {
        peakServiceCount = entry.totalCheckedIn;
        peakServiceId = entry.id;
        peakServiceName = entry.name;
      }
    }

    const averageAttendancePerService =
      entries.length > 0
        ? Math.round((totalHistoricalCheckins / entries.length) * 10) / 10
        : 0;

    return {
      summary: {
        totalServices: entries.length,
        liveServices,
        closedServices,
        completedServices: closedServices,
        upcomingServices: 0,
        totalHistoricalCheckins,
        uniqueAttendees: uniquePeople.size,
        averageAttendancePerService,
        peakServiceId,
        peakServiceName,
        peakServiceCount,
      },
      services: entries,
    };
  }

  public async upsertPushSubscription(
    organizationId: string,
    sub: Omit<PushSubscriptionItem, 'organizationId'>
  ): Promise<{ subscription: PushSubscriptionItem; totalSubscribers: number }> {
    this.assertDatabaseAvailable();
    const orgId = organizationId.toLowerCase();
    const record: PushSubscriptionItem = { ...sub, organizationId: orgId };

    if (this.supabase) {
      const { error } = await this.supabase.from('push_subscriptions').upsert(
        {
          organization_id: orgId,
          person_id: record.personId || null,
          person_name: record.personName || null,
          endpoint: record.endpoint,
          p256dh: record.keys?.p256dh || null,
          auth_key: record.keys?.auth || null,
          user_agent: record.userAgent || null,
          subscribed_at: record.subscribedAt,
        },
        { onConflict: 'organization_id,endpoint' }
      );
      if (error) {
        throw new Error(`Failed to save push subscription in Supabase: ${error.message}`);
      }
      const subs = await this.getPushSubscriptions(orgId);
      return { subscription: record, totalSubscribers: subs.length };
    }

    const list = this.pushSubsByOrg.get(orgId) || [];
    const idx = list.findIndex((s) => s.id === record.id || s.endpoint === record.endpoint);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...record };
    } else {
      list.unshift(record);
    }
    this.pushSubsByOrg.set(orgId, list);

    const org = this.orgs.get(orgId);
    if (org) {
      org.pushConfigured = true;
    }

    return { subscription: record, totalSubscribers: list.length };
  }

  public async getPushSubscriptions(organizationId: string): Promise<PushSubscriptionItem[]> {
    this.assertDatabaseAvailable();
    const orgId = organizationId.toLowerCase();
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('push_subscriptions')
        .select('*')
        .eq('organization_id', orgId)
        .order('subscribed_at', { ascending: false });
      if (error) {
        throw new Error(`Failed to load push subscriptions from Supabase: ${error.message}`);
      }
      return (data || []).map((row) => ({
        id: String(row.id),
        organizationId: orgId,
        endpoint: String(row.endpoint),
        personId: row.person_id || undefined,
        personName: row.person_name || undefined,
        userAgent: row.user_agent || undefined,
        subscribedAt: String(row.subscribed_at),
      }));
    }
    return [...(this.pushSubsByOrg.get(orgId) || [])];
  }

  // ===========================================================================
  // CREATOR CONSOLE: ORGANISATIONS, PLANS, LICENSES, PAYMENTS, AUDIT, USAGE
  // ===========================================================================

  public async appendAuditLog(entry: {
    actorId?: string | null;
    actorEmail: string;
    actorRole: string;
    action: string;
    targetType: string;
    targetId?: string | null;
    organizationId?: string | null;
    reason?: string | null;
    metadata?: Record<string, unknown>;
    ipAddress?: string | null;
  }): Promise<ConsoleAuditLogRecord> {
    const record: ConsoleAuditLogRecord = {
      id: randomUUID(),
      actorId: entry.actorId || null,
      actorEmail: entry.actorEmail,
      actorRole: entry.actorRole,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId || null,
      organizationId: entry.organizationId ? entry.organizationId.toLowerCase() : null,
      organizationName: entry.organizationId
        ? (await this.getOrganisationById(entry.organizationId))?.name
        : undefined,
      reason: entry.reason || null,
      metadata: entry.metadata || {},
      ipAddress: entry.ipAddress || null,
      createdAt: new Date().toISOString(),
    };

    const sb = this.activeSupabase;
    if (sb) {
      const { error } = await sb.from('audit_log').insert({
        id: record.id,
        actor_id: record.actorId && UUID_REGEX.test(record.actorId) ? record.actorId : null,
        actor_email: record.actorEmail,
        actor_role: record.actorRole,
        action: record.action,
        target_type: record.targetType,
        target_id: record.targetId,
        organization_id:
          record.organizationId && UUID_REGEX.test(record.organizationId)
            ? record.organizationId
            : null,
        reason: record.reason,
        metadata: record.metadata,
        ip_address: record.ipAddress,
        created_at: record.createdAt,
      });
      if (error) {
        console.warn('[Ekklesphere Audit] Failed to insert audit_log in Supabase:', error.message);
      }
      return record;
    }

    this.auditLogs.unshift(record);
    return record;
  }

  public async mutateAuditLogProhibited(): Promise<never> {
    throw new Error('audit_log is strictly append-only; UPDATE and DELETE operations are prohibited');
  }

  public async listAuditLogs(filters?: {
    organizationId?: string;
    action?: string;
    actorEmail?: string;
    limit?: number;
  }): Promise<ConsoleAuditLogRecord[]> {
    this.assertDatabaseAvailable();
    const limit = Math.min(500, Math.max(1, filters?.limit || 150));

    if (this.supabase) {
      let query = this.supabase
        .from('audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (filters?.organizationId) query = query.eq('organization_id', filters.organizationId.toLowerCase());
      if (filters?.action) query = query.ilike('action', `%${filters.action}%`);
      if (filters?.actorEmail) query = query.ilike('actor_email', `%${filters.actorEmail}%`);

      const { data, error } = await query;
      if (error) {
        throw new Error(`Failed to fetch audit logs from Supabase: ${error.message}`);
      }
      return (data || []).map((row) => ({
        id: String(row.id),
        actorId: row.actor_id,
        actorEmail: String(row.actor_email),
        actorRole: String(row.actor_role),
        action: String(row.action),
        targetType: String(row.target_type),
        targetId: row.target_id,
        organizationId: row.organization_id,
        reason: row.reason,
        metadata: row.metadata || {},
        ipAddress: row.ip_address,
        createdAt: String(row.created_at),
      }));
    }

    return this.auditLogs
      .filter((item) => {
        if (filters?.organizationId && item.organizationId !== filters.organizationId.toLowerCase()) {
          return false;
        }
        if (filters?.action && !item.action.toLowerCase().includes(filters.action.toLowerCase())) {
          return false;
        }
        if (
          filters?.actorEmail &&
          !item.actorEmail.toLowerCase().includes(filters.actorEmail.toLowerCase())
        ) {
          return false;
        }
        return true;
      })
      .slice(0, limit);
  }

  public async listPlans(): Promise<ConsolePlan[]> {
    this.assertDatabaseAvailable();
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('plans')
        .select('*')
        .order('annual_cost_usd', { ascending: true });
      if (error) {
        throw new Error(`Failed to fetch plans from Supabase: ${error.message}`);
      }
      if (Array.isArray(data)) {
        return data.map((row) => ({
          id: row.id as LicenseTier,
          name: String(row.name),
          description: String(row.description || ''),
          monthlyCostUSD: Number(row.monthly_cost_usd),
          annualCostUSD: Number(row.annual_cost_usd),
          seatsLimit: Number(row.seats_limit),
          sitesLimit: Number(row.sites_limit),
          monthlyCheckinsLimit: Number(row.monthly_checkins_limit),
          featureFlags: {
            ...DEFAULT_PLANS[row.id as LicenseTier]?.featureFlags,
            ...(row.feature_flags || {}),
          },
          isActive: Boolean(row.is_active ?? true),
          updatedAt: String(row.updated_at || new Date().toISOString()),
        }));
      }
      return [];
    }
    return Array.from(this.plans.values());
  }

  public async getPlan(planId: LicenseTier): Promise<ConsolePlan | null> {
    const plans = await this.listPlans();
    return plans.find((p) => p.id === planId) || DEFAULT_PLANS[planId] || null;
  }

  public async updatePlan(
    planId: LicenseTier,
    updates: Partial<Omit<ConsolePlan, 'id' | 'updatedAt'>>
  ): Promise<ConsolePlan> {
    this.assertDatabaseAvailable();
    const existing = (await this.getPlan(planId)) || DEFAULT_PLANS[planId];
    const merged: ConsolePlan = {
      ...existing,
      ...updates,
      id: planId,
      featureFlags: {
        ...existing.featureFlags,
        ...(updates.featureFlags || {}),
      },
      updatedAt: new Date().toISOString(),
    };

    if (this.supabase) {
      const { error } = await this.supabase
        .from('plans')
        .update({
          name: merged.name,
          description: merged.description,
          monthly_cost_usd: merged.monthlyCostUSD,
          annual_cost_usd: merged.annualCostUSD,
          seats_limit: merged.seatsLimit,
          sites_limit: merged.sitesLimit,
          monthly_checkins_limit: merged.monthlyCheckinsLimit,
          feature_flags: merged.featureFlags,
          is_active: merged.isActive,
          updated_at: merged.updatedAt,
        })
        .eq('id', planId);
      if (error) {
        throw new Error(`Failed to update plan in Supabase: ${error.message}`);
      }
      return merged;
    }

    this.plans.set(planId, merged);
    return merged;
  }

  public async listOrganisations(filters?: {
    search?: string;
    status?: string;
    orgType?: string;
    tier?: string;
    country?: string;
  }): Promise<TenantChurch[]> {
    this.assertDatabaseAvailable();
    let items: TenantChurch[] = [];

    if (this.supabase) {
      const { data: orgRows, error } = await this.supabase
        .from('organizations')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(`Failed to load organisations from Supabase: ${error.message}`);
      }

      const allLicenses = await this.listLicenses();
      const licByOrg = new Map<string, SystemLicense>();
      for (const lic of allLicenses) {
        const oid = (lic.organizationId || lic.tenantId).toLowerCase();
        if (!licByOrg.has(oid)) licByOrg.set(oid, lic);
      }

      items = await Promise.all(
        (orgRows || []).map(async (row) => {
          const oid = String(row.id).toLowerCase();
          const lic = licByOrg.get(oid);
          const plan = DEFAULT_PLANS[lic?.tier || 'grace_starter'];
          const memberCount = await this.getMemberCountForOrg(oid);
          const sites = await this.getSitesForOrg(oid);
          const settings = (row.settings && typeof row.settings === 'object') ? row.settings : {};
          return {
            id: oid,
            name: String(row.name),
            slug: String(row.slug),
            orgType: (settings.org_type || row.org_type || 'church') as OrganisationType,
            campusCode: settings.campus_code || row.campus_code || String(row.slug).slice(0, 8).toUpperCase(),
            city: settings.city || row.city || 'Accra',
            country: settings.country || row.country || 'Ghana',
            seniorPastor: settings.senior_pastor || row.senior_pastor || settings.contact_name || row.contact_name || 'Administrator',
            contactName: settings.contact_name || row.contact_name || '',
            contactEmail: row.email || settings.contact_email || row.contact_email || '',
            contactPhone: row.phone || settings.contact_phone || row.contact_phone || '',
            status: (row.status || settings.status || 'trial') as TenantStatus,
            memberCount,
            maxCapacity: lic?.overrides?.seatsLimit ?? lic?.seatsLimit ?? plan.seatsLimit,
            sitesCount: sites.length,
            sitesLimit: lic?.overrides?.sitesLimit ?? lic?.sitesLimit ?? plan.sitesLimit,
            licenseKey: lic?.key || 'UNLICENSED',
            licenseTier: lic?.tier || 'grace_starter',
            licenseStatus: lic?.status || 'expired',
            renewalDate: lic?.expiresDate || '',
            billingCycle: lic?.billingCycle || 'annual',
            customDomain: row.website || settings.custom_domain || row.custom_domain || undefined,
            geofenceRadiusMeters: Number(settings.outer_geofence_m || row.outer_geofence_m || 300),
            geofenceConfigured: sites.length > 0,
            smsConfigured: Boolean(settings.sms_configured || row.sms_configured),
            pushConfigured: Boolean(settings.push_configured || row.push_configured),
            features: {
              ...plan.featureFlags,
              ...(lic?.overrides?.features || {}),
            },
            createdAt: String(row.created_at),
          };
        })
      );
    } else {
      for (const org of this.orgs.values()) {
        const lic = await this.getLatestLicenseForOrg(org.id);
        const plan = (lic && (await this.getPlan(lic.tier))) || DEFAULT_PLANS.grace_starter;
        const memberCount = await this.getMemberCountForOrg(org.id);
        const sites = await this.getSitesForOrg(org.id);
        const checkins30d = this.computeOrg30dAggregateCheckins(org.id);
        items.push({
          ...org,
          memberCount,
          sitesCount: sites.length,
          maxCapacity: lic?.overrides?.seatsLimit ?? lic?.seatsLimit ?? plan.seatsLimit,
          sitesLimit: lic?.overrides?.sitesLimit ?? lic?.sitesLimit ?? plan.sitesLimit,
          licenseKey: lic?.key || 'UNLICENSED',
          licenseTier: lic?.tier || org.licenseTier,
          licenseStatus: lic?.status,
          renewalDate: lic?.expiresDate || org.renewalDate,
          billingCycle: lic?.billingCycle || org.billingCycle,
          geofenceConfigured: sites.length > 0,
          checkins30d,
          features: {
            ...plan.featureFlags,
            ...(lic?.overrides?.features || {}),
          },
        });
      }
    }

    return items.filter((org) => {
      if (filters?.status && filters.status !== 'all' && org.status !== filters.status) return false;
      if (filters?.orgType && filters.orgType !== 'all' && org.orgType !== filters.orgType) return false;
      if (filters?.tier && filters.tier !== 'all' && org.licenseTier !== filters.tier) return false;
      if (
        filters?.country &&
        filters.country !== 'all' &&
        org.country.toLowerCase() !== filters.country.toLowerCase()
      ) {
        return false;
      }
      if (filters?.search) {
        const q = filters.search.trim().toLowerCase();
        const hay = `${org.name} ${org.slug} ${org.city} ${org.country} ${org.seniorPastor} ${org.campusCode} ${org.contactEmail}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  public async getOrganisationById(organizationId: string): Promise<TenantChurch | null> {
    this.assertDatabaseAvailable();
    const orgId = organizationId.toLowerCase();
    const list = await this.listOrganisations();
    return list.find((o) => o.id === orgId) || null;
  }

  public async createOrganisation(params: {
    id?: string;
    name: string;
    slug?: string;
    orgType?: OrganisationType;
    country?: string;
    city?: string;
    campusCode?: string;
    seniorPastor?: string;
    contactName?: string;
    contactEmail?: string;
    contactPhone?: string;
    customDomain?: string;
    initialPlan?: LicenseTier;
    autoIssueTrial?: boolean;
  }): Promise<{ organisation: TenantChurch; license: SystemLicense | null }> {
    this.assertDatabaseAvailable();
    const id = (params.id && UUID_REGEX.test(params.id) ? params.id : randomUUID()).toLowerCase();
    let baseSlug =
      (params.slug || params.name)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || `org-${id.slice(0, 6)}`;

    const planTier: LicenseTier = params.initialPlan || 'grace_starter';
    const plan = (await this.getPlan(planTier)) || DEFAULT_PLANS.grace_starter;
    const shouldAutoTrial = params.autoIssueTrial !== false;

    const now = new Date();
    const trialEnds = new Date(now.getTime() + TRIAL_DURATION_DAYS * DAY_MS)
      .toISOString()
      .slice(0, 10);

    if (this.supabase) {
      const { data: existing } = await this.supabase
        .from('organizations')
        .select('id')
        .eq('slug', baseSlug)
        .maybeSingle();
      if (existing) {
        baseSlug = `${baseSlug}-${Math.random().toString(36).substring(2, 6)}`;
      }

      const orgSettings = {
        org_type: params.orgType || 'church',
        country: params.country || 'Ghana',
        city: params.city || 'Accra',
        campus_code: params.campusCode || baseSlug.slice(0, 7).toUpperCase(),
        senior_pastor: params.seniorPastor || params.contactName || 'Administrator',
        contact_name: params.contactName || params.seniorPastor || '',
        contact_email: params.contactEmail || '',
        contact_phone: params.contactPhone || '',
        status: shouldAutoTrial ? 'trial' : 'active',
        custom_domain: params.customDomain || null,
        initial_plan: planTier,
      };

      // Dual-write to tenants for relational foreign-key compatibility with licenses
      await this.supabase.from('tenants').upsert({
        id,
        name: params.name.trim(),
        slug: baseSlug,
        settings: orgSettings,
      });

      const { error } = await this.supabase.from('organizations').insert({
        id,
        name: params.name.trim(),
        slug: baseSlug,
        phone: params.contactPhone || null,
        email: params.contactEmail || null,
        website: params.customDomain || null,
        org_type: params.orgType || 'church',
        country: params.country || 'Ghana',
        city: params.city || 'Accra',
        campus_code: params.campusCode || baseSlug.slice(0, 7).toUpperCase(),
        senior_pastor: params.seniorPastor || params.contactName || 'Administrator',
        contact_name: params.contactName || params.seniorPastor || '',
        contact_email: params.contactEmail || null,
        contact_phone: params.contactPhone || null,
        status: shouldAutoTrial ? 'trial' : 'active',
        custom_domain: params.customDomain || null,
        settings: orgSettings,
      });

      if (error) {
        throw new Error(`Failed to create organisation: ${error.message}`);
      }

      let createdLic: SystemLicense | null = null;
      if (shouldAutoTrial) {
        createdLic = await this.issueLicense({
          organizationId: id,
          tier: planTier,
          billingCycle: 'annual',
          status: 'trial',
          notes: 'Auto-issued 14-day trial on creation',
        });
      }

      const createdOrg = (await this.getOrganisationById(id))!;
      return { organisation: createdOrg, license: createdLic };
    }

    const hasDuplicateSlug = Array.from(this.orgs.values()).some(
      (o) => o.slug.toLowerCase() === baseSlug
    );
    if (hasDuplicateSlug) {
      baseSlug = `${baseSlug}-${Math.random().toString(36).substring(2, 6)}`;
    }

    const newOrg: TenantChurch = {
      id,
      name: params.name.trim(),
      slug: baseSlug,
      orgType: params.orgType || 'church',
      campusCode: params.campusCode || baseSlug.slice(0, 7).toUpperCase(),
      city: params.city || 'Accra',
      country: params.country || 'Ghana',
      seniorPastor: params.seniorPastor || params.contactName || 'Administrator',
      contactName: params.contactName || params.seniorPastor || '',
      contactEmail: params.contactEmail || '',
      contactPhone: params.contactPhone || '',
      status: shouldAutoTrial ? 'trial' : 'active',
      memberCount: 0,
      maxCapacity: plan.seatsLimit,
      sitesCount: 0,
      sitesLimit: plan.sitesLimit,
      licenseKey: 'UNLICENSED',
      licenseTier: planTier,
      renewalDate: shouldAutoTrial ? trialEnds : '',
      billingCycle: 'annual',
      customDomain: params.customDomain,
      geofenceRadiusMeters: 300,
      geofenceConfigured: false,
      smsConfigured: false,
      pushConfigured: false,
      features: { ...plan.featureFlags },
      createdAt: now.toISOString(),
    };
    this.orgs.set(id, newOrg);

    let issuedLicense: SystemLicense | null = null;
    if (shouldAutoTrial) {
      issuedLicense = await this.issueLicense({
        organizationId: id,
        tier: planTier,
        billingCycle: 'annual',
        status: 'trial',
        durationDays: TRIAL_DURATION_DAYS,
        notes: 'Auto-provisioned 14-day onboarding trial (+7d expiry grace)',
      });
    }

    const hydrated = (await this.getOrganisationById(id))!;
    return { organisation: hydrated, license: issuedLicense };
  }

  public readonly createOrganization = this.createOrganisation.bind(this);
  public readonly getOrganizationById = this.getOrganisationById.bind(this);
  public readonly listOrganizations = this.listOrganisations.bind(this);

  public async updateOrganisation(
    organizationId: string,
    updates: Partial<{
      name: string;
      orgType: OrganisationType;
      country: string;
      city: string;
      campusCode: string;
      seniorPastor: string;
      contactName: string;
      contactEmail: string;
      contactPhone: string;
      status: TenantStatus;
      customDomain: string | null;
      geofenceRadiusMeters: number;
      smsConfigured: boolean;
      pushConfigured: boolean;
    }>
  ): Promise<TenantChurch> {
    this.assertDatabaseAvailable();
    const orgId = organizationId.toLowerCase();
    if (this.supabase) {
      const dbPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (updates.name !== undefined) dbPatch.name = updates.name;
      if (updates.orgType !== undefined) dbPatch.org_type = updates.orgType;
      if (updates.country !== undefined) dbPatch.country = updates.country;
      if (updates.city !== undefined) dbPatch.city = updates.city;
      if (updates.campusCode !== undefined) dbPatch.campus_code = updates.campusCode;
      if (updates.seniorPastor !== undefined) dbPatch.senior_pastor = updates.seniorPastor;
      if (updates.contactName !== undefined) dbPatch.contact_name = updates.contactName;
      if (updates.contactEmail !== undefined) dbPatch.contact_email = updates.contactEmail;
      if (updates.contactPhone !== undefined) dbPatch.contact_phone = updates.contactPhone;
      if (updates.geofenceRadiusMeters !== undefined) {
        dbPatch.geofence_radius_meters = updates.geofenceRadiusMeters;
      }
      if (updates.status !== undefined) {
        dbPatch.status = updates.status;
        const { data: curRow } = await this.supabase
          .from('organizations')
          .select('settings')
          .eq('id', orgId)
          .maybeSingle();
        const curSettings =
          curRow?.settings && typeof curRow.settings === 'object' ? curRow.settings : {};
        dbPatch.settings = { ...curSettings, status: updates.status };
      }
      if (updates.customDomain !== undefined) dbPatch.custom_domain = updates.customDomain;
      if (updates.smsConfigured !== undefined) dbPatch.sms_configured = updates.smsConfigured;
      if (updates.pushConfigured !== undefined) dbPatch.push_configured = updates.pushConfigured;

      const { error } = await this.supabase.from('organizations').update(dbPatch).eq('id', orgId);
      if (error) throw new Error(`Failed to update organisation: ${error.message}`);
      const refreshed = await this.getOrganisationById(orgId);
      if (!refreshed) throw new Error('Organisation not found');
      return refreshed;
    }

    const existing = this.orgs.get(orgId);
    if (!existing) throw new Error('Organisation not found');
    const updated: TenantChurch = {
      ...existing,
      ...updates,
      customDomain: updates.customDomain === null ? undefined : updates.customDomain ?? existing.customDomain,
    };
    this.orgs.set(orgId, updated);
    return (await this.getOrganisationById(orgId))!;
  }

  public async revokeOrganisation(
    organizationId: string,
    reason: string
  ): Promise<{
    organisation: TenantChurch;
    license: SystemLicense | null;
    revokedGrantsCount: number;
    suspendedCredentialsCount: number;
  }> {
    this.assertDatabaseAvailable();
    const orgId = (organizationId || '').trim().toLowerCase();
    const cleanReason = (reason || '').trim();
    if (cleanReason.length < 3) {
      const err: any = new Error('A clear audit reason (min 3 characters) is required to revoke an organisation.');
      err.code = 'INVALID_INPUT';
      err.status = 400;
      throw err;
    }

    const existingOrg = await this.getOrganisationById(orgId);
    if (!existingOrg) {
      const err: any = new Error('Organisation not found.');
      err.code = 'ORG_NOT_FOUND';
      err.status = 404;
      throw err;
    }

    const nowIso = new Date().toISOString();
    let revokedGrantsCount = 0;
    let suspendedCredentialsCount = 0;

    if (this.supabase) {
      // 1. Revoke all licenses belonging to this organisation
      const { error: licErr } = await this.supabase
        .from('licenses')
        .update({
          status: 'revoked',
          revoked_reason: cleanReason,
          updated_at: nowIso,
        })
        .eq('organization_id', orgId);

      if (
        licErr &&
        /column .* does not exist|Could not find the '[^']+' column|schema cache/i.test(
          licErr.message || ''
        )
      ) {
        await this.supabase
          .from('licenses')
          .update({ status: 'revoked' })
          .or(`organization_id.eq.${orgId},tenant_id.eq.${orgId}`);
      } else if (licErr) {
        throw new Error(`Failed to revoke organisation licenses: ${licErr.message}`);
      }

      // 2. Revoke any active support grants for this organisation
      const { data: revokedGrants } = await this.supabase
        .from('support_grants')
        .update({ revoked_at: nowIso })
        .eq('organization_id', orgId)
        .is('revoked_at', null)
        .select('id');
      revokedGrantsCount = Array.isArray(revokedGrants) ? revokedGrants.length : 0;

      // 3. Suspend non-creator credentials scoped to this organisation
      const { data: suspendedCreds } = await this.supabase
        .from('account_credentials')
        .update({ status: 'suspended', updated_at: nowIso })
        .eq('organization_id', orgId)
        .eq('is_creator', false)
        .neq('status', 'suspended')
        .select('id');
      suspendedCredentialsCount = Array.isArray(suspendedCreds) ? suspendedCreds.length : 0;

      // 4. Mark organisation suspended in both status column and settings JSONB
      const { data: curRow } = await this.supabase
        .from('organizations')
        .select('settings')
        .eq('id', orgId)
        .maybeSingle();
      const curSettings =
        curRow?.settings && typeof curRow.settings === 'object' ? curRow.settings : {};

      const { error: orgErr } = await this.supabase
        .from('organizations')
        .update({
          status: 'suspended',
          settings: { ...curSettings, status: 'suspended', revoked_reason: cleanReason, revoked_at: nowIso },
          updated_at: nowIso,
        })
        .eq('id', orgId);

      if (orgErr) {
        throw new Error(`Failed to suspend organisation status: ${orgErr.message}`);
      }
    } else {
      for (const [licId, lic] of this.licenses.entries()) {
        if ((lic.organizationId || lic.tenantId).toLowerCase() === orgId) {
          this.licenses.set(licId, {
            ...lic,
            status: 'revoked',
            notes: cleanReason,
          });
        }
      }

      for (const [grantId, grant] of this.supportGrants.entries()) {
        if (grant.organizationId.toLowerCase() === orgId && !grant.revokedAt) {
          this.supportGrants.set(grantId, {
            ...grant,
            revokedAt: nowIso,
            active: false,
          });
          revokedGrantsCount++;
        }
      }

      for (const [credId, cred] of this.userCredentials.entries()) {
        if (
          cred.organizationId.toLowerCase() === orgId &&
          !cred.isCreator &&
          cred.status !== 'suspended'
        ) {
          this.userCredentials.set(credId, {
            ...cred,
            status: 'suspended',
          });
          suspendedCredentialsCount++;
        }
      }

      const memOrg = this.orgs.get(orgId);
      if (memOrg) {
        this.orgs.set(orgId, {
          ...memOrg,
          status: 'suspended',
          licenseStatus: 'revoked',
        });
      }
    }

    const refreshedOrg = await this.getOrganisationById(orgId);
    const refreshedLic = await this.getLatestLicenseForOrg(orgId);

    return {
      organisation: refreshedOrg!,
      license: refreshedLic,
      revokedGrantsCount,
      suspendedCredentialsCount,
    };
  }

  public async deleteOrganisation(organizationId: string): Promise<{
    deleted: true;
    organizationId: string;
    organizationName: string;
    deletedAuthUsersCount: number;
  }> {
    this.assertDatabaseAvailable();
    const orgId = (organizationId || '').trim().toLowerCase();
    const existingOrg = await this.getOrganisationById(orgId);
    if (!existingOrg) {
      const err: any = new Error('Organisation not found.');
      err.code = 'ORG_NOT_FOUND';
      err.status = 404;
      throw err;
    }

    let deletedAuthUsersCount = 0;

    if (this.supabase) {
      // 1. Collect linked non-creator Supabase Auth user IDs before purging rows
      const authUserIds = new Set<string>();
      const creatorAuthIds = new Set<string>();

      const { data: creatorRows } = await this.supabase
        .from('account_credentials')
        .select('auth_user_id')
        .eq('is_creator', true);
      for (const row of creatorRows || []) {
        if (row.auth_user_id) creatorAuthIds.add(String(row.auth_user_id).toLowerCase());
      }

      const { data: credRows } = await this.supabase
        .from('account_credentials')
        .select('auth_user_id, is_creator')
        .eq('organization_id', orgId);
      for (const row of credRows || []) {
        if (!row.is_creator && row.auth_user_id) {
          const uid = String(row.auth_user_id).toLowerCase();
          if (!creatorAuthIds.has(uid)) authUserIds.add(uid);
        }
      }

      const { data: memberRows } = await this.supabase
        .from('members')
        .select('user_id')
        .eq('organization_id', orgId);
      for (const row of memberRows || []) {
        if (row.user_id) {
          const uid = String(row.user_id).toLowerCase();
          if (!creatorAuthIds.has(uid)) authUserIds.add(uid);
        }
      }

      const safeDeleteByCol = async (table: string, col: string) => {
        const { error } = await this.supabase!.from(table).delete().eq(col, orgId);
        if (
          error &&
          !/does not exist|Could not find the|relation "?(?:public\.)?[^"]+"? does not exist|schema cache|42P01|42703|PGRST205/i.test(
            error.message || ''
          )
        ) {
          throw new Error(`Failed deleting from ${table}.${col}: ${error.message}`);
        }
      };

      // 2. Delete all dependent records in FK-safe order (children before parents)
      const deleteOrder: Array<[string, string]> = [
        ['license_payments', 'organization_id'],
        ['data_requests', 'organization_id'],
        ['support_grants', 'organization_id'],
        ['licenses', 'organization_id'],
        ['licenses', 'tenant_id'],
        ['account_credentials', 'organization_id'],
        ['auth_audit_events', 'organization_id'],
        ['attendance', 'organization_id'],
        ['attendance_records', 'tenant_id'],
        ['attendance_events', 'organization_id'],
        ['donations', 'organization_id'],
        ['donations', 'tenant_id'],
        ['followup_tasks', 'organization_id'],
        ['followup_tasks', 'tenant_id'],
        ['member_consents', 'organization_id'],
        ['event_rsvps', 'organization_id'],
        ['service_instances', 'tenant_id'],
        ['services', 'tenant_id'],
        ['events', 'organization_id'],
        ['sites', 'organization_id'],
        ['campuses', 'tenant_id'],
        ['persons', 'tenant_id'],
        ['members', 'organization_id'],
        ['church_groups', 'organization_id'],
        ['church_wall_posts', 'organization_id'],
        ['push_subscriptions', 'organization_id'],
        ['usage_daily', 'organization_id'],
        ['alerts', 'organization_id'],
        ['system_settings', 'tenant_id'],
        ['system_settings', 'organization_id'],
        ['church_public_profiles', 'organization_id'],
        ['service_times', 'organization_id'],
        ['ministries', 'organization_id'],
        ['church_events', 'organization_id'],
        ['news_posts', 'organization_id'],
        ['user_roles', 'organization_id'],
        ['user_roles', 'tenant_id'],
        ['users', 'tenant_id'],
      ];

      for (const [table, col] of deleteOrder) {
        await safeDeleteByCol(table, col);
      }

      // 3. Delete the primary organisation & legacy tenant rows
      const { error: orgDelErr } = await this.supabase
        .from('organizations')
        .delete()
        .eq('id', orgId);
      if (orgDelErr) {
        throw new Error(`Failed to delete organisation record: ${orgDelErr.message}`);
      }
      await safeDeleteByCol('tenants', 'id');

      // 4. Delete linked non-creator Supabase Auth accounts so nothing remains on server/auth
      for (const authUid of authUserIds) {
        try {
          const { error: authDelErr } = await this.supabase.auth.admin.deleteUser(authUid);
          if (!authDelErr) deletedAuthUsersCount++;
        } catch {
          // Ignore missing auth user so purge completes cleanly
        }
      }
    }

    // 5. Purge ALL server in-memory maps/collections so ZERO organisation data remains anywhere on the server
    this.orgs.delete(orgId);
    for (const [licId, lic] of this.licenses.entries()) {
      if ((lic.organizationId || lic.tenantId).toLowerCase() === orgId) {
        this.licenses.delete(licId);
      }
    }
    this.payments = this.payments.filter((p) => p.organizationId.toLowerCase() !== orgId);
    for (const [uKey, uVal] of this.usageDaily.entries()) {
      if (uVal.organizationId.toLowerCase() === orgId) {
        this.usageDaily.delete(uKey);
      }
    }
    for (const [aId, aVal] of this.alerts.entries()) {
      if ((aVal.organizationId || '').toLowerCase() === orgId) {
        this.alerts.delete(aId);
      }
    }
    for (const [drId, drVal] of this.dataRequests.entries()) {
      if (drVal.organizationId.toLowerCase() === orgId) {
        this.dataRequests.delete(drId);
      }
    }
    for (const [gId, gVal] of this.supportGrants.entries()) {
      if (gVal.organizationId.toLowerCase() === orgId) {
        this.supportGrants.delete(gId);
      }
    }
    this.sitesByOrg.delete(orgId);
    this.premiseByOrg.delete(orgId);
    this.systemSettingsByOrg.delete(orgId);
    this.churchGroupsByOrg.delete(orgId);
    this.churchGroupLeadershipHistoryByOrg.delete(orgId);
    this.checkinsByOrg.delete(orgId);
    this.rawEventsByOrg.delete(orgId);
    this.membersByOrg.delete(orgId);
    this.eventsByOrg.delete(orgId);
    this.pushSubsByOrg.delete(orgId);
    this.donationsByOrg.delete(orgId);
    this.followupTasksByOrg.delete(orgId);
    this.memberConsentsByOrg.delete(orgId);
    this.eventRsvpsByOrg.delete(orgId);
    for (const [credId, cred] of this.userCredentials.entries()) {
      if (cred.organizationId.toLowerCase() === orgId && !cred.isCreator) {
        this.userCredentials.delete(credId);
      }
    }
    churchWallStore.clearOrganizationInMemory(orgId);

    return {
      deleted: true,
      organizationId: orgId,
      organizationName: existingOrg.name,
      deletedAuthUsersCount,
    };
  }

  public async listLicenses(): Promise<SystemLicense[]> {
    this.assertDatabaseAvailable();
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('licenses')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(`Failed to fetch licenses from Supabase: ${error.message}`);
      }

      return (data || []).map((row) => {
        const tier = (row.tier || row.plan_id || 'grace_starter') as LicenseTier;
        const plan = DEFAULT_PLANS[tier] || DEFAULT_PLANS.grace_starter;
        const orgId = String(row.tenant_id || row.organization_id || '').toLowerCase();
        const overrides = (row.overrides || {}) as LicenseOverrides;
        return {
          id: String(row.id),
          key: String(row.key || row.license_key),
          tier,
          tenantId: orgId,
          organizationId: orgId,
          tenantName: 'Organisation',
          seatsLimit: Number(row.seats_limit ?? overrides.seatsLimit ?? plan.seatsLimit),
          sitesLimit: overrides.sitesLimit ?? plan.sitesLimit,
          monthlyCheckinsLimit: overrides.monthlyCheckinsLimit ?? plan.monthlyCheckinsLimit,
          status: (row.status as LicenseStatus) || 'trial',
          issuedDate: String(row.issued_date || row.issued_at || new Date().toISOString()).slice(0, 10),
          expiresDate: String(row.expires_date || row.expires_at || new Date().toISOString()).slice(0, 10),
          graceEndsDate: null,
          billingCycle: (row.billing_cycle as BillingCycle) || 'annual',
          annualCostUSD: Number(row.annual_cost_usd ?? plan.annualCostUSD),
          overrides,
          notes: row.notes || undefined,
          enabledFeatures: Array.isArray(row.enabled_features) && row.enabled_features.length > 0
            ? row.enabled_features
            : enabledFeatureLabelsFromFlags({
                ...plan.featureFlags,
                ...(overrides.features || {}),
              }),
        };
      });
    }

    const result: SystemLicense[] = [];
    for (const lic of this.licenses.values()) {
      const orgId = (lic.organizationId || lic.tenantId).toLowerCase();
      const org = this.orgs.get(orgId);
      const seatsUsed = await this.getMemberCountForOrg(orgId);
      const sitesUsed = (await this.getSitesForOrg(orgId)).length;
      result.push({
        ...lic,
        tenantName: org?.name || lic.tenantName,
        seatsUsed,
        sitesUsed,
      });
    }
    return result;
  }

  public async getLatestLicenseForOrg(organizationId: string): Promise<SystemLicense | null> {
    const orgId = organizationId.toLowerCase();
    const all = await this.listLicenses();
    return all.find((l) => (l.organizationId || l.tenantId).toLowerCase() === orgId) || null;
  }

  public async issueLicense(params: {
    organizationId: string;
    tier: LicenseTier;
    billingCycle: BillingCycle;
    status?: LicenseStatus;
    durationDays?: number;
    overrides?: LicenseOverrides;
    notes?: string;
  }): Promise<SystemLicense> {
    this.assertDatabaseAvailable();
    const orgId = params.organizationId.toLowerCase();
    const org = this.supabase
      ? await this.getOrganisationById(orgId)
      : this.orgs.get(orgId) || (await this.getOrganisationById(orgId));
    if (!org) {
      throw new Error(`Cannot issue license: organisation ${orgId} not found`);
    }

    const plan = (await this.getPlan(params.tier)) || DEFAULT_PLANS.grace_starter;
    const status: LicenseStatus = params.status || 'active';
    const durationDays =
      params.durationDays ??
      (status === 'trial'
        ? TRIAL_DURATION_DAYS
        : params.billingCycle === 'monthly'
        ? 30
        : params.billingCycle === 'lifetime'
        ? 36500
        : 365);

    const now = new Date();
    const expires = new Date(now.getTime() + durationDays * DAY_MS);
    const graceEnds = new Date(expires.getTime() + GRACE_PERIOD_DAYS * DAY_MS);
    const key = generateLicenseKey(org.name, status === 'trial' ? 'TRIAL' : 'LIC');
    const annualCostUSD =
      status === 'trial'
        ? 0
        : params.billingCycle === 'monthly'
        ? plan.monthlyCostUSD * 12
        : plan.annualCostUSD;
    const overrides = params.overrides || {};

    if (this.supabase) {
      const canonicalPayload = {
        organization_id: orgId,
        license_key: key,
        plan_id: params.tier,
        status,
        issued_at: now.toISOString(),
        expires_at: expires.toISOString(),
        grace_ends_at: graceEnds.toISOString(),
        billing_cycle: params.billingCycle,
        annual_cost_usd: annualCostUSD,
        overrides,
        notes: params.notes || null,
      };

      const attemptPayload: Record<string, unknown> = {
        ...canonicalPayload,
        tenant_id: orgId,
        key,
        tier: params.tier,
        seats_limit: overrides.seatsLimit ?? plan.seatsLimit,
        issued_date: now.toISOString(),
        expires_date: expires.toISOString(),
        enabled_features: Object.keys(plan.featureFlags).filter((k) => (plan.featureFlags as any)[k]),
      };

      let insertResult = await this.supabase
        .from('licenses')
        .insert(attemptPayload)
        .select('*')
        .single();

      // Iteratively strip only the specific optional/legacy columns absent in the target schema
      for (let attempt = 0; attempt < 8 && insertResult.error; attempt++) {
        const msg = insertResult.error.message || '';
        const colMatch =
          msg.match(/Could not find the '([^']+)' column/i) ||
          msg.match(/column "([^"]+)"(?: of relation "[^"]+")? does not exist/i);

        if (colMatch && colMatch[1] && Object.prototype.hasOwnProperty.call(attemptPayload, colMatch[1])) {
          delete attemptPayload[colMatch[1]];
          insertResult = await this.supabase
            .from('licenses')
            .insert(attemptPayload)
            .select('*')
            .single();
          continue;
        }

        if (attemptPayload.status === 'trial' && /check constraint/i.test(msg)) {
          attemptPayload.status = 'active';
          insertResult = await this.supabase
            .from('licenses')
            .insert(attemptPayload)
            .select('*')
            .single();
          continue;
        }

        if (/column .* does not exist|schema cache/i.test(msg)) {
          // Final fallback keeping canonicalPayload plus key if not already removed
          const fallbackPayload: Record<string, unknown> = { ...canonicalPayload };
          if (Object.prototype.hasOwnProperty.call(attemptPayload, 'key')) {
            fallbackPayload.key = key;
          }
          insertResult = await this.supabase
            .from('licenses')
            .insert(fallbackPayload)
            .select('*')
            .single();
        }
        break;
      }

      if (insertResult.error || !insertResult.data) {
        throw new Error(`Failed to issue license: ${insertResult.error?.message || 'Unknown error'}`);
      }

      return (await this.getLatestLicenseForOrg(orgId))!;
    }

    // Replace existing license in sandbox or insert newest at front
    for (const [existingId, existingLic] of this.licenses.entries()) {
      if ((existingLic.organizationId || existingLic.tenantId).toLowerCase() === orgId) {
        this.licenses.delete(existingId);
      }
    }

    const newLic: SystemLicense = {
      id: randomUUID(),
      key,
      tier: params.tier,
      tenantId: orgId,
      organizationId: orgId,
      tenantName: org.name,
      seatsLimit: overrides.seatsLimit ?? plan.seatsLimit,
      sitesLimit: overrides.sitesLimit ?? plan.sitesLimit,
      monthlyCheckinsLimit: overrides.monthlyCheckinsLimit ?? plan.monthlyCheckinsLimit,
      status,
      issuedDate: now.toISOString().slice(0, 10),
      expiresDate: expires.toISOString().slice(0, 10),
      graceEndsDate: graceEnds.toISOString().slice(0, 10),
      billingCycle: params.billingCycle,
      annualCostUSD,
      overrides,
      notes: params.notes,
      enabledFeatures: enabledFeatureLabelsFromFlags({
        ...plan.featureFlags,
        ...(overrides.features || {}),
      }),
    };

    const reordered = new Map<string, SystemLicense>();
    reordered.set(newLic.id, newLic);
    for (const [k, v] of this.licenses.entries()) reordered.set(k, v);
    this.licenses = reordered;

    const memOrg = this.orgs.get(orgId);
    if (memOrg) {
      memOrg.licenseKey = newLic.key;
      memOrg.licenseTier = newLic.tier;
      memOrg.renewalDate = newLic.expiresDate;
      memOrg.status = status === 'trial' ? 'trial' : 'active';
    }

    return newLic;
  }

  public async performLicenseAction(
    licenseId: string,
    actionPayload: {
      action:
        | 'renew'
        | 'upgrade'
        | 'downgrade'
        | 'start_trial'
        | 'suspend'
        | 'reactivate'
        | 'revoke'
        | 'set_overrides';
      durationMonths?: number;
      targetTier?: LicenseTier;
      expiresDate?: string;
      overrides?: LicenseOverrides;
      reason?: string;
      notes?: string;
    }
  ): Promise<SystemLicense> {
    this.assertDatabaseAvailable();
    const all = await this.listLicenses();
    const target = all.find((l) => l.id === licenseId);
    if (!target) {
      throw new Error('License not found');
    }

    const orgId = (target.organizationId || target.tenantId).toLowerCase();
    let nextStatus: LicenseStatus = target.status;
    let nextTier: LicenseTier = target.tier;
    let nextExpires = new Date(
      target.expiresDate.includes('T') ? target.expiresDate : `${target.expiresDate}T00:00:00.000Z`
    );
    let nextOverrides: LicenseOverrides = { ...(target.overrides || {}) };
    let nextNotes = actionPayload.notes ?? target.notes;

    switch (actionPayload.action) {
      case 'renew': {
        const months = Math.max(1, actionPayload.durationMonths || 12);
        const baseTime = Math.max(Date.now(), nextExpires.getTime());
        nextExpires = new Date(baseTime + months * 30 * DAY_MS);
        nextStatus = 'active';
        break;
      }
      case 'upgrade':
      case 'downgrade': {
        if (!actionPayload.targetTier) throw new Error('targetTier is required for tier change');
        nextTier = actionPayload.targetTier;
        if (nextStatus === 'expired' || nextStatus === 'grace_period') {
          nextStatus = 'active';
        }
        break;
      }
      case 'start_trial': {
        nextStatus = 'trial';
        nextExpires = new Date(Date.now() + TRIAL_DURATION_DAYS * DAY_MS);
        break;
      }
      case 'suspend': {
        nextStatus = 'suspended';
        break;
      }
      case 'reactivate': {
        nextStatus = 'active';
        if (nextExpires.getTime() < Date.now()) {
          nextExpires = new Date(Date.now() + 30 * DAY_MS);
        }
        break;
      }
      case 'revoke': {
        nextStatus = 'revoked';
        break;
      }
      case 'set_overrides': {
        nextOverrides = { ...nextOverrides, ...(actionPayload.overrides || {}) };
        break;
      }
    }

    if (actionPayload.expiresDate) {
      nextExpires = new Date(`${actionPayload.expiresDate}T23:59:59.000Z`);
    }

    const nextGrace = new Date(nextExpires.getTime() + GRACE_PERIOD_DAYS * DAY_MS);
    const plan = (await this.getPlan(nextTier)) || DEFAULT_PLANS.grace_starter;
    const annualCostUSD = nextStatus === 'trial' ? 0 : plan.annualCostUSD;

    if (this.supabase) {
      const { error } = await this.supabase
        .from('licenses')
        .update({
          plan_id: nextTier,
          status: nextStatus,
          expires_at: nextExpires.toISOString(),
          grace_ends_at: nextGrace.toISOString(),
          annual_cost_usd: annualCostUSD,
          overrides: nextOverrides,
          notes: nextNotes || null,
          suspended_reason: actionPayload.action === 'suspend' ? actionPayload.reason || null : undefined,
          revoked_reason: actionPayload.action === 'revoke' ? actionPayload.reason || null : undefined,
          updated_at: new Date().toISOString(),
        })
        .eq('id', licenseId);

      if (error) throw new Error(`Failed to update license: ${error.message}`);

      if (actionPayload.action === 'suspend' || actionPayload.action === 'revoke') {
        await this.updateOrganisation(orgId, { status: 'suspended' });
      } else if (actionPayload.action === 'reactivate' || actionPayload.action === 'renew') {
        await this.updateOrganisation(orgId, { status: 'active' });
      }

      return (await this.listLicenses()).find((l) => l.id === licenseId)!;
    }

    const updated: SystemLicense = {
      ...target,
      tier: nextTier,
      status: nextStatus,
      seatsLimit: nextOverrides.seatsLimit ?? plan.seatsLimit,
      sitesLimit: nextOverrides.sitesLimit ?? plan.sitesLimit,
      monthlyCheckinsLimit: nextOverrides.monthlyCheckinsLimit ?? plan.monthlyCheckinsLimit,
      expiresDate: nextExpires.toISOString().slice(0, 10),
      graceEndsDate: nextGrace.toISOString().slice(0, 10),
      annualCostUSD,
      overrides: nextOverrides,
      notes: nextNotes,
      enabledFeatures: enabledFeatureLabelsFromFlags({
        ...plan.featureFlags,
        ...(nextOverrides.features || {}),
      }),
    };
    this.licenses.set(licenseId, updated);

    const memOrg = this.orgs.get(orgId);
    if (memOrg) {
      memOrg.licenseTier = nextTier;
      memOrg.renewalDate = updated.expiresDate;
      if (actionPayload.action === 'suspend' || actionPayload.action === 'revoke') {
        memOrg.status = 'suspended';
      }
      if (actionPayload.action === 'reactivate' || actionPayload.action === 'renew') memOrg.status = 'active';
      if (actionPayload.action === 'start_trial') memOrg.status = 'trial';
    }

    return updated;
  }

  public async upgradeOrganisationSubscription(params: {
    organizationId: string;
    tier: LicenseTier;
    billingCycle: BillingCycle;
    paymentMethod: PaymentMethod;
    paymentReference: string;
    currency?: PaymentCurrency;
    notes?: string;
    actorId?: string;
    actorEmail: string;
  }): Promise<{
    license: SystemLicense;
    evaluation: LicenseEvaluationResult;
    organization: TenantChurch | null;
    payment: LicensePaymentRecord;
  }> {
    const orgId = params.organizationId.toLowerCase();
    const org = await this.getOrganisationById(orgId);
    if (!org) {
      const err: any = new Error('Organisation not found.');
      err.code = 'ORG_NOT_FOUND';
      err.status = 404;
      throw err;
    }

    const existingLic = await this.getLatestLicenseForOrg(orgId);
    if (existingLic?.status === 'revoked') {
      const err: any = new Error(
        'This organisation license has been revoked by Platform Governance. Contact support.'
      );
      err.code = 'LICENSE_REVOKED';
      err.status = 403;
      throw err;
    }

    const plan = (await this.getPlan(params.tier)) || DEFAULT_PLANS[params.tier] || DEFAULT_PLANS.ministry_pro;
    const billedAmountUSD =
      params.billingCycle === 'monthly'
        ? plan.monthlyCostUSD
        : params.billingCycle === 'lifetime'
        ? plan.annualCostUSD * 5
        : plan.annualCostUSD;

    const upgradedLicense = await this.issueLicense({
      organizationId: orgId,
      tier: params.tier,
      billingCycle: params.billingCycle,
      status: 'active',
      notes:
        params.notes?.trim() ||
        `Self-service upgrade to ${plan.name} (${params.billingCycle})`,
    });

    if (this.supabase) {
      await this.supabase
        .from('organizations')
        .update({
          status: 'active',
          updated_at: new Date().toISOString(),
        })
        .eq('id', orgId);
    } else {
      const memOrg = this.orgs.get(orgId);
      if (memOrg) {
        memOrg.status = 'active';
        memOrg.licenseTier = params.tier;
        memOrg.licenseKey = upgradedLicense.key;
        memOrg.renewalDate = upgradedLicense.expiresDate;
        memOrg.billingCycle = params.billingCycle;
        memOrg.maxCapacity = upgradedLicense.seatsLimit;
        memOrg.sitesLimit = upgradedLicense.sitesLimit ?? plan.sitesLimit;
        memOrg.features = { ...plan.featureFlags };
      }
    }

    const payment = await this.recordLicensePayment({
      licenseId: upgradedLicense.id,
      amount: Math.max(1, billedAmountUSD),
      currency: params.currency || 'USD',
      method: params.paymentMethod,
      reference: params.paymentReference.trim(),
      notes: `Plan upgrade to ${plan.name} (${params.billingCycle})`,
      recordedById: params.actorId,
      recordedByEmail: params.actorEmail,
    });

    const evaluation = await this.evaluateOrganizationLicense(orgId);
    const updatedOrg = await this.getOrganisationById(orgId);

    return {
      license: upgradedLicense,
      evaluation,
      organization: updatedOrg,
      payment,
    };
  }

  public async deleteAllLicensesForOrgInTest(organizationId: string): Promise<void> {
    if (!this.isTestRuntime) {
      throw new Error('deleteAllLicensesForOrgInTest is restricted to Vitest.');
    }
    const orgId = organizationId.toLowerCase();
    for (const [id, lic] of this.licenses.entries()) {
      if ((lic.organizationId || lic.tenantId).toLowerCase() === orgId) {
        this.licenses.delete(id);
      }
    }
  }

  public async recordLicensePayment(params: {
    licenseId: string;
    amount: number;
    currency: PaymentCurrency;
    method: PaymentMethod;
    reference: string;
    paidAt?: string;
    notes?: string;
    recordedById?: string;
    recordedByEmail: string;
  }): Promise<LicensePaymentRecord> {
    const lic = (await this.listLicenses()).find((l) => l.id === params.licenseId);
    if (!lic) throw new Error('License not found for payment');
    const orgId = (lic.organizationId || lic.tenantId).toLowerCase();
    const paidAt = params.paidAt || new Date().toISOString().slice(0, 10);

    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('license_payments')
        .insert({
          license_id: params.licenseId,
          organization_id: orgId,
          amount: params.amount,
          currency: params.currency,
          method: params.method,
          reference: params.reference,
          paid_at: paidAt,
          notes: params.notes || null,
          recorded_by:
            params.recordedById && UUID_REGEX.test(params.recordedById) ? params.recordedById : null,
          recorded_by_email: params.recordedByEmail,
        })
        .select('*')
        .single();

      if (error || !data) throw new Error(`Failed to record payment: ${error?.message}`);
      return {
        id: String(data.id),
        licenseId: params.licenseId,
        organizationId: orgId,
        organizationName: lic.tenantName,
        amount: Number(data.amount),
        currency: data.currency as PaymentCurrency,
        method: data.method as PaymentMethod,
        reference: String(data.reference),
        paidAt: String(data.paid_at),
        notes: data.notes || undefined,
        recordedByEmail: String(data.recorded_by_email || params.recordedByEmail),
        createdAt: String(data.created_at),
      };
    }

    const payment: LicensePaymentRecord = {
      id: randomUUID(),
      licenseId: params.licenseId,
      organizationId: orgId,
      organizationName: lic.tenantName,
      amount: params.amount,
      currency: params.currency,
      method: params.method,
      reference: params.reference,
      paidAt,
      notes: params.notes,
      recordedByEmail: params.recordedByEmail,
      createdAt: new Date().toISOString(),
    };
    this.payments.unshift(payment);
    return payment;
  }

  public async listPayments(organizationId?: string): Promise<LicensePaymentRecord[]> {
    this.assertDatabaseAvailable();
    if (this.supabase) {
      let query = this.supabase
        .from('license_payments')
        .select('*, organizations(name)')
        .order('paid_at', { ascending: false })
        .limit(300);
      if (organizationId) query = query.eq('organization_id', organizationId.toLowerCase());
      const { data, error } = await query;
      if (error) {
        throw new Error(`Failed to fetch payments from Supabase: ${error.message}`);
      }
      return (data || []).map((row) => ({
        id: String(row.id),
        licenseId: String(row.license_id),
        organizationId: String(row.organization_id).toLowerCase(),
        organizationName: row.organizations?.name || undefined,
        amount: Number(row.amount),
        currency: row.currency as PaymentCurrency,
        method: row.method as PaymentMethod,
        reference: String(row.reference),
        paidAt: String(row.paid_at),
        notes: row.notes || undefined,
        recordedByEmail: String(row.recorded_by_email || 'creator'),
        createdAt: String(row.created_at),
      }));
    }

    return organizationId
      ? this.payments.filter((p) => p.organizationId === organizationId.toLowerCase())
      : [...this.payments];
  }

  // ===========================================================================
  // PRIVACY-SAFE NIGHTLY ROLLUP, ALERTS & AGGREGATE TELEMETRY
  // ===========================================================================

  private computeOrg30dAggregateCheckins(organizationId: string): number {
    const orgId = organizationId.toLowerCase();
    const cutoff = Date.now() - 30 * DAY_MS;
    const live = (this.checkinsByOrg.get(orgId) || []).filter(
      (c) => new Date(c.checkedInIso).getTime() >= cutoff
    ).length;
    let rolled = 0;
    for (const row of this.usageDaily.values()) {
      if (row.organizationId === orgId && new Date(row.usageDate).getTime() >= cutoff) {
        rolled += row.checkinsCount;
      }
    }
    return Math.max(live, rolled);
  }

  public async runNightlyUsageRollup(targetDateIso?: string): Promise<{
    targetDate: string;
    organizationsProcessed: number;
    alertsGenerated: number;
  }> {
    this.assertDatabaseAvailable();
    const dateStr =
      targetDateIso && /^\d{4}-\d{2}-\d{2}$/.test(targetDateIso)
        ? targetDateIso
        : new Date().toISOString().slice(0, 10);

    if (this.supabase) {
      const { data, error } = await this.supabase.rpc('rollup_usage_daily', {
        p_target_date: dateStr,
      });
      if (error) {
        throw new Error(`Failed to run usage rollup in Supabase: ${error.message}`);
      }
      return {
        targetDate: dateStr,
        organizationsProcessed: Number(data?.organizationsProcessed ?? 0),
        alertsGenerated: Number(data?.alertsUpserted ?? 0),
      };
    }

    const orgs = await this.listOrganisations();
    let alertsGenerated = 0;

    for (const org of orgs) {
      if (org.status === 'archived') continue;
      const orgId = org.id.toLowerCase();
      const checkins = (this.checkinsByOrg.get(orgId) || []).filter((c) =>
        c.checkedInIso.startsWith(dateStr)
      );
      const rawEvents = (this.rawEventsByOrg.get(orgId) || []).filter((e) =>
        e.server_time.startsWith(dateStr)
      );
      const sites = await this.getSitesForOrg(orgId);
      const subs = await this.getPushSubscriptions(orgId);

      const uniqueUsers = new Set(checkins.map((c) => c.personId)).size;
      const flaggedCount = rawEvents.filter((e) => e.status === 'flagged').length;
      const rejectedCount = rawEvents.filter((e) => e.status === 'rejected').length;
      const mockLocationAttempts = rawEvents.filter(
        (e) => e.is_mock || e.flag_reasons.includes('mock_location')
      ).length;

      const latestActivity =
        checkins[0]?.checkedInIso || rawEvents[0]?.server_time || org.lastActivityAt || null;

      const row: UsageDailyAggregate = {
        organizationId: orgId,
        organizationName: org.name,
        usageDate: dateStr,
        activeUsers: uniqueUsers,
        checkinsCount: checkins.length,
        flaggedCount,
        rejectedCount,
        mockLocationAttempts,
        sitesCount: sites.length,
        pushSubscribers: subs.length,
        lastActivityAt: latestActivity,
      };
      this.usageDaily.set(`${orgId}::${dateStr}`, row);

      // Evaluate proactive alerts (deduplicated)
      const evalLic = await this.evaluateOrganizationLicense(orgId);
      if (
        evalLic.daysRemaining !== null &&
        evalLic.daysRemaining <= 30 &&
        ['active', 'trial', 'grace_period'].includes(evalLic.status)
      ) {
        this.upsertAlertInternal({
          dedupeKey: `expiring:${orgId}:${evalLic.expiresDate}`,
          organizationId: orgId,
          organizationName: org.name,
          alertType: 'expiring_license',
          severity: evalLic.daysRemaining <= 7 || evalLic.inGracePeriod ? 'critical' : 'warning',
          title: `License expiring for ${org.name}`,
          message: `${evalLic.tier?.replace('_', ' ')} (${evalLic.status}) expires ${evalLic.expiresDate}.`,
        });
        alertsGenerated++;
      }

      if (
        (evalLic.seatsLimit > 0 && evalLic.seatsUsed >= evalLic.seatsLimit) ||
        (evalLic.sitesLimit > 0 && evalLic.sitesUsed >= evalLic.sitesLimit)
      ) {
        this.upsertAlertInternal({
          dedupeKey: `limit:${orgId}`,
          organizationId: orgId,
          organizationName: org.name,
          alertType: 'limit_exceeded',
          severity: 'warning',
          title: `Capacity limit reached for ${org.name}`,
          message: `Seats ${evalLic.seatsUsed}/${evalLic.seatsLimit}, Sites ${evalLic.sitesUsed}/${evalLic.sitesLimit}.`,
        });
        alertsGenerated++;
      }

      if (sites.length === 0) {
        this.upsertAlertInternal({
          dedupeKey: `geofence:${orgId}`,
          organizationId: orgId,
          organizationName: org.name,
          alertType: 'geofence_not_configured',
          severity: 'warning',
          title: `Geofence not configured for ${org.name}`,
          message: 'No active campus geofence coordinates are configured.',
        });
        alertsGenerated++;
      }

      if (!org.smsConfigured && !org.pushConfigured && subs.length === 0) {
        this.upsertAlertInternal({
          dedupeKey: `comms:${orgId}`,
          organizationId: orgId,
          organizationName: org.name,
          alertType: 'comms_not_configured',
          severity: 'info',
          title: `SMS & Push unconfigured for ${org.name}`,
          message: 'Neither SMS gateway nor Web Push subscribers are active yet.',
        });
        alertsGenerated++;
      }

      if (mockLocationAttempts >= 3) {
        this.upsertAlertInternal({
          dedupeKey: `spoof:${orgId}:${dateStr}`,
          organizationId: orgId,
          organizationName: org.name,
          alertType: 'high_spoofing_rate',
          severity: 'critical',
          title: `High GPS spoofing rate at ${org.name}`,
          message: `${mockLocationAttempts} mock-location attempts blocked on ${dateStr}.`,
        });
        alertsGenerated++;
      }
    }

    return {
      targetDate: dateStr,
      organizationsProcessed: orgs.length,
      alertsGenerated,
    };
  }

  private upsertAlertInternal(params: {
    dedupeKey: string;
    organizationId: string;
    organizationName: string;
    alertType: ConsoleAlertType;
    severity: 'info' | 'warning' | 'critical';
    title: string;
    message: string;
  }): void {
    const existing = this.alerts.get(params.dedupeKey);
    if (existing && existing.status === 'resolved') return;
    this.alerts.set(params.dedupeKey, {
      id: existing?.id || randomUUID(),
      organizationId: params.organizationId,
      organizationName: params.organizationName,
      alertType: params.alertType,
      severity: params.severity,
      status: existing?.status || 'open',
      title: params.title,
      message: params.message,
      createdAt: existing?.createdAt || new Date().toISOString(),
      acknowledgedAt: existing?.acknowledgedAt || null,
      resolvedAt: null,
    });
  }

  public async listUsageDaily(organizationId?: string, days = 30): Promise<UsageDailyAggregate[]> {
    this.assertDatabaseAvailable();
    const cutoffDate = new Date(Date.now() - days * DAY_MS).toISOString().slice(0, 10);

    if (this.supabase) {
      let query = this.supabase
        .from('usage_daily')
        .select('*, organizations(name)')
        .gte('usage_date', cutoffDate)
        .order('usage_date', { ascending: false });
      if (organizationId) query = query.eq('organization_id', organizationId.toLowerCase());
      const { data, error } = await query;
      if (error) {
        throw new Error(`Failed to fetch usage_daily from Supabase: ${error.message}`);
      }
      return (data || []).map((row) => ({
        organizationId: String(row.organization_id).toLowerCase(),
        organizationName: row.organizations?.name || undefined,
        usageDate: String(row.usage_date),
        activeUsers: Number(row.active_users ?? 0),
        checkinsCount: Number(row.checkins_count ?? 0),
        flaggedCount: Number(row.flagged_count ?? 0),
        rejectedCount: Number(row.rejected_count ?? 0),
        mockLocationAttempts: Number(row.mock_location_attempts ?? 0),
        sitesCount: Number(row.sites_count ?? 0),
        pushSubscribers: Number(row.push_subscribers ?? 0),
        lastActivityAt: row.last_activity_at || null,
      }));
    }

    // Ensure today's aggregate snapshot is fresh before returning
    await this.runNightlyUsageRollup(new Date().toISOString().slice(0, 10));

    return Array.from(this.usageDaily.values())
      .filter((u) => {
        if (organizationId && u.organizationId !== organizationId.toLowerCase()) return false;
        return u.usageDate >= cutoffDate;
      })
      .sort((a, b) => b.usageDate.localeCompare(a.usageDate));
  }

  public async listAlerts(filters?: {
    status?: string;
    severity?: string;
  }): Promise<ConsoleAlert[]> {
    this.assertDatabaseAvailable();
    if (this.supabase) {
      let query = this.supabase
        .from('alerts')
        .select('*, organizations(name)')
        .order('created_at', { ascending: false });
      if (filters?.status && filters.status !== 'all') query = query.eq('status', filters.status);
      if (filters?.severity && filters.severity !== 'all') query = query.eq('severity', filters.severity);
      const { data, error } = await query;
      if (error) {
        throw new Error(`Failed to fetch alerts from Supabase: ${error.message}`);
      }
      return (data || []).map((row) => ({
        id: String(row.id),
        organizationId: row.organization_id ? String(row.organization_id).toLowerCase() : null,
        organizationName: row.organizations?.name || undefined,
        alertType: row.alert_type as ConsoleAlertType,
        severity: row.severity,
        status: row.status,
        title: String(row.title),
        message: String(row.message),
        metadata: row.metadata || {},
        createdAt: String(row.created_at),
        acknowledgedAt: row.acknowledged_at || null,
        resolvedAt: row.resolved_at || null,
      }));
    }

    return Array.from(this.alerts.values()).filter((a) => {
      if (filters?.status && filters.status !== 'all' && a.status !== filters.status) return false;
      if (filters?.severity && filters.severity !== 'all' && a.severity !== filters.severity) return false;
      return true;
    });
  }

  public async updateAlertStatus(
    alertId: string,
    status: 'acknowledged' | 'resolved'
  ): Promise<ConsoleAlert> {
    this.assertDatabaseAvailable();
    const nowIso = new Date().toISOString();
    if (this.supabase) {
      const patch =
        status === 'acknowledged'
          ? { status: 'acknowledged', acknowledged_at: nowIso }
          : { status: 'resolved', resolved_at: nowIso };
      const { data, error } = await this.supabase
        .from('alerts')
        .update(patch)
        .eq('id', alertId)
        .select('*, organizations(name)')
        .single();
      if (error || !data) throw new Error('Alert not found');
      return {
        id: String(data.id),
        organizationId: data.organization_id,
        organizationName: data.organizations?.name,
        alertType: data.alert_type,
        severity: data.severity,
        status: data.status,
        title: data.title,
        message: data.message,
        createdAt: data.created_at,
        acknowledgedAt: data.acknowledged_at,
        resolvedAt: data.resolved_at,
      };
    }

    for (const [key, item] of this.alerts.entries()) {
      if (item.id === alertId) {
        const updated: ConsoleAlert = {
          ...item,
          status,
          acknowledgedAt: status === 'acknowledged' ? nowIso : item.acknowledgedAt,
          resolvedAt: status === 'resolved' ? nowIso : item.resolvedAt,
        };
        this.alerts.set(key, updated);
        return updated;
      }
    }
    throw new Error('Alert not found');
  }

  // ===========================================================================
  // ANNOUNCEMENTS, FEATURE FLAGS, DATA REQUESTS, SUPPORT GRANTS, LANDING CMS
  // ===========================================================================

  public async listAnnouncements(): Promise<PlatformAnnouncement[]> {
    this.assertDatabaseAvailable();
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('announcements')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) {
        throw new Error(`Failed to fetch announcements from Supabase: ${error.message}`);
      }
      return (data || []).map((row) => ({
        id: String(row.id),
        title: String(row.title),
        body: String(row.body),
        severity: row.severity,
        targetTiers: row.target_tiers || [],
        targetOrganizationIds: row.target_organization_ids || [],
        active: Boolean(row.active),
        startsAt: String(row.starts_at),
        expiresAt: row.expires_at || null,
        createdByEmail: row.created_by_email || undefined,
        createdAt: String(row.created_at),
      }));
    }
    return Array.from(this.announcements.values());
  }

  public async createAnnouncement(params: {
    title: string;
    body: string;
    severity: 'info' | 'warning' | 'critical';
    targetTiers?: LicenseTier[];
    targetOrganizationIds?: string[];
    expiresAt?: string | null;
    createdByEmail: string;
  }): Promise<PlatformAnnouncement> {
    this.assertDatabaseAvailable();
    const nowIso = new Date().toISOString();
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('announcements')
        .insert({
          title: params.title,
          body: params.body,
          severity: params.severity,
          target_tiers: params.targetTiers || [],
          target_organization_ids: params.targetOrganizationIds || [],
          expires_at: params.expiresAt || null,
          created_by_email: params.createdByEmail,
          active: true,
        })
        .select('*')
        .single();
      if (error || !data) throw new Error(`Failed to create announcement: ${error?.message}`);
      return {
        id: String(data.id),
        title: data.title,
        body: data.body,
        severity: data.severity,
        targetTiers: data.target_tiers || [],
        targetOrganizationIds: data.target_organization_ids || [],
        active: Boolean(data.active),
        startsAt: data.starts_at,
        expiresAt: data.expires_at,
        createdByEmail: data.created_by_email,
        createdAt: data.created_at,
      };
    }

    const item: PlatformAnnouncement = {
      id: randomUUID(),
      title: params.title,
      body: params.body,
      severity: params.severity,
      targetTiers: params.targetTiers || [],
      targetOrganizationIds: params.targetOrganizationIds || [],
      active: true,
      startsAt: nowIso,
      expiresAt: params.expiresAt || null,
      createdByEmail: params.createdByEmail,
      createdAt: nowIso,
    };
    this.announcements.set(item.id, item);
    return item;
  }

  public async toggleAnnouncement(id: string, active: boolean): Promise<PlatformAnnouncement> {
    this.assertDatabaseAvailable();
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('announcements')
        .update({ active, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('*')
        .single();
      if (error || !data) throw new Error('Announcement not found');
      return {
        id: String(data.id),
        title: data.title,
        body: data.body,
        severity: data.severity,
        targetTiers: data.target_tiers || [],
        targetOrganizationIds: data.target_organization_ids || [],
        active: Boolean(data.active),
        startsAt: data.starts_at,
        expiresAt: data.expires_at,
        createdAt: data.created_at,
      };
    }
    const existing = this.announcements.get(id);
    if (!existing) throw new Error('Announcement not found');
    const updated = { ...existing, active };
    this.announcements.set(id, updated);
    return updated;
  }

  public async listFeatureFlags(): Promise<PlatformFeatureFlag[]> {
    this.assertDatabaseAvailable();
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('feature_flags')
        .select('*')
        .order('key', { ascending: true });
      if (error) {
        throw new Error(`Failed to fetch feature flags from Supabase: ${error.message}`);
      }
      return (data || []).map((row) => ({
        key: String(row.key),
        name: String(row.name),
        description: String(row.description || ''),
        enabledGlobally: Boolean(row.enabled_globally),
        enabledTiers: (row.enabled_tiers || []) as LicenseTier[],
        organizationOverrides: row.organization_overrides || {},
        updatedAt: String(row.updated_at),
      }));
    }
    return Array.from(this.featureFlags.values());
  }

  public async upsertFeatureFlag(
    key: string,
    updates: {
      name: string;
      description?: string;
      enabledGlobally: boolean;
      enabledTiers: LicenseTier[];
      organizationOverrides?: Record<string, boolean>;
    }
  ): Promise<PlatformFeatureFlag> {
    this.assertDatabaseAvailable();
    if (this.supabase) {
      const { data: existingRow } = await this.supabase
        .from('feature_flags')
        .select('*')
        .eq('key', key)
        .maybeSingle();

      const merged: PlatformFeatureFlag = {
        key,
        name: updates.name,
        description: updates.description ?? existingRow?.description ?? '',
        enabledGlobally: updates.enabledGlobally,
        enabledTiers: updates.enabledTiers,
        organizationOverrides:
          updates.organizationOverrides ?? existingRow?.organization_overrides ?? {},
        updatedAt: new Date().toISOString(),
      };

      const { error } = await this.supabase.from('feature_flags').upsert({
        key: merged.key,
        name: merged.name,
        description: merged.description,
        enabled_globally: merged.enabledGlobally,
        enabled_tiers: merged.enabledTiers,
        organization_overrides: merged.organizationOverrides,
        updated_at: merged.updatedAt,
      });
      if (error) {
        throw new Error(`Failed to save feature flag in Supabase: ${error.message}`);
      }
      return merged;
    }

    const existing = this.featureFlags.get(key);
    const merged: PlatformFeatureFlag = {
      key,
      name: updates.name,
      description: updates.description ?? existing?.description ?? '',
      enabledGlobally: updates.enabledGlobally,
      enabledTiers: updates.enabledTiers,
      organizationOverrides: updates.organizationOverrides ?? existing?.organizationOverrides ?? {},
      updatedAt: new Date().toISOString(),
    };
    this.featureFlags.set(key, merged);
    return merged;
  }

  public async listDataRequests(): Promise<DataPrivacyRequest[]> {
    this.assertDatabaseAvailable();
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('data_requests')
        .select('*, organizations(name)')
        .order('created_at', { ascending: false });
      if (error) {
        throw new Error(`Failed to fetch data requests from Supabase: ${error.message}`);
      }
      return (data || []).map((row) => ({
        id: String(row.id),
        organizationId: String(row.organization_id).toLowerCase(),
        organizationName: row.organizations?.name || undefined,
        requestType: row.request_type,
        status: row.status,
        requestedByEmail: String(row.requested_by_email),
        reason: row.reason || undefined,
        notes: row.notes || undefined,
        dueAt: String(row.due_at),
        completedAt: row.completed_at || null,
        createdAt: String(row.created_at),
      }));
    }
    return Array.from(this.dataRequests.values());
  }

  public async createDataRequest(params: {
    organizationId: string;
    requestType: 'export' | 'deletion';
    requestedByEmail: string;
    reason?: string;
    notes?: string;
  }): Promise<DataPrivacyRequest> {
    const orgId = params.organizationId.toLowerCase();
    const org = await this.getOrganisationById(orgId);
    if (!org) throw new Error('Organisation not found');

    const now = new Date();
    const dueAt = new Date(now.getTime() + 30 * DAY_MS).toISOString();

    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('data_requests')
        .insert({
          organization_id: orgId,
          request_type: params.requestType,
          requested_by_email: params.requestedByEmail,
          reason: params.reason || null,
          notes: params.notes || null,
          due_at: dueAt,
        })
        .select('*')
        .single();
      if (error || !data) throw new Error(`Failed to create data request: ${error?.message}`);
      return {
        id: String(data.id),
        organizationId: orgId,
        organizationName: org.name,
        requestType: data.request_type,
        status: data.status,
        requestedByEmail: data.requested_by_email,
        reason: data.reason,
        notes: data.notes,
        dueAt: data.due_at,
        completedAt: data.completed_at,
        createdAt: data.created_at,
      };
    }

    const reqItem: DataPrivacyRequest = {
      id: randomUUID(),
      organizationId: orgId,
      organizationName: org.name,
      requestType: params.requestType,
      status: 'pending',
      requestedByEmail: params.requestedByEmail,
      reason: params.reason,
      notes: params.notes,
      dueAt,
      completedAt: null,
      createdAt: now.toISOString(),
    };
    this.dataRequests.set(reqItem.id, reqItem);
    return reqItem;
  }

  public async updateDataRequestStatus(
    id: string,
    status: 'pending' | 'in_progress' | 'completed' | 'rejected',
    notes?: string
  ): Promise<DataPrivacyRequest> {
    const completedAt = status === 'completed' ? new Date().toISOString() : null;
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('data_requests')
        .update({ status, notes, completed_at: completedAt, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('*, organizations(name)')
        .single();
      if (error || !data) throw new Error('Data request not found');
      return {
        id: String(data.id),
        organizationId: String(data.organization_id).toLowerCase(),
        organizationName: data.organizations?.name,
        requestType: data.request_type,
        status: data.status,
        requestedByEmail: data.requested_by_email,
        reason: data.reason,
        notes: data.notes,
        dueAt: data.due_at,
        completedAt: data.completed_at,
        createdAt: data.created_at,
      };
    }

    const existing = this.dataRequests.get(id);
    if (!existing) throw new Error('Data request not found');
    const updated: DataPrivacyRequest = {
      ...existing,
      status,
      notes: notes ?? existing.notes,
      completedAt,
    };
    this.dataRequests.set(id, updated);
    return updated;
  }

  public async createSupportGrant(params: {
    organizationId: string;
    creatorUserId: string;
    creatorEmail: string;
    reason: string;
    durationMinutes: number;
  }): Promise<SupportGrantSession> {
    const orgId = params.organizationId.toLowerCase();
    const org = await this.getOrganisationById(orgId);
    if (!org) throw new Error('Organisation not found');

    const starts = new Date();
    const clampedMinutes = Math.min(120, Math.max(5, params.durationMinutes));
    const expires = new Date(starts.getTime() + clampedMinutes * 60 * 1000);

    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('support_grants')
        .insert({
          organization_id: orgId,
          creator_user_id: toDeterministicUuid(params.creatorUserId),
          creator_email: params.creatorEmail,
          reason: params.reason.trim(),
          access_level: 'read_only_admin',
          starts_at: starts.toISOString(),
          expires_at: expires.toISOString(),
        })
        .select('*')
        .single();
      if (error || !data) throw new Error(`Failed to create support grant: ${error?.message}`);
      return {
        id: String(data.id),
        organizationId: orgId,
        organizationName: org.name,
        creatorUserId: params.creatorUserId,
        creatorEmail: params.creatorEmail,
        reason: data.reason,
        accessLevel: 'read_only_admin',
        startsAt: data.starts_at,
        expiresAt: data.expires_at,
        revokedAt: null,
        active: true,
      };
    }

    const grant: SupportGrantSession = {
      id: randomUUID(),
      organizationId: orgId,
      organizationName: org.name,
      creatorUserId: params.creatorUserId,
      creatorEmail: params.creatorEmail,
      reason: params.reason.trim(),
      accessLevel: 'read_only_admin',
      startsAt: starts.toISOString(),
      expiresAt: expires.toISOString(),
      revokedAt: null,
      active: true,
    };
    this.supportGrants.set(grant.id, grant);
    return grant;
  }

  public async verifyActiveSupportGrant(
    grantId: string,
    creatorUserId: string
  ): Promise<ActiveSupportGrantContext | null> {
    const nowMs = Date.now();

    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('support_grants')
        .select('*')
        .eq('id', grantId)
        .is('revoked_at', null)
        .maybeSingle();
      if (error || !data) return null;
      const expectedUuid = toDeterministicUuid(creatorUserId);
      if (String(data.creator_user_id).toLowerCase() !== expectedUuid) return null;
      if (new Date(data.expires_at).getTime() <= nowMs) return null;
      return {
        id: String(data.id),
        organizationId: String(data.organization_id).toLowerCase(),
        creatorUserId,
        reason: String(data.reason),
        expiresAt: String(data.expires_at),
      };
    }

    const grant = this.supportGrants.get(grantId);
    if (!grant) return null;
    if (grant.creatorUserId !== creatorUserId) return null;
    if (grant.revokedAt) return null;
    if (new Date(grant.expiresAt).getTime() <= nowMs) return null;
    return {
      id: grant.id,
      organizationId: grant.organizationId,
      creatorUserId: grant.creatorUserId,
      reason: grant.reason,
      expiresAt: grant.expiresAt,
    };
  }

  public async revokeSupportGrant(grantId: string): Promise<SupportGrantSession> {
    const nowIso = new Date().toISOString();
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('support_grants')
        .update({ revoked_at: nowIso })
        .eq('id', grantId)
        .select('*, organizations(name)')
        .single();
      if (error || !data) throw new Error('Support grant not found');
      return {
        id: String(data.id),
        organizationId: String(data.organization_id).toLowerCase(),
        organizationName: data.organizations?.name || 'Organisation',
        creatorUserId: String(data.creator_user_id),
        creatorEmail: String(data.creator_email),
        reason: String(data.reason),
        accessLevel: 'read_only_admin',
        startsAt: String(data.starts_at),
        expiresAt: String(data.expires_at),
        revokedAt: nowIso,
        active: false,
      };
    }

    const grant = this.supportGrants.get(grantId);
    if (!grant) throw new Error('Support grant not found');
    const updated: SupportGrantSession = { ...grant, revokedAt: nowIso, active: false };
    this.supportGrants.set(grantId, updated);
    return updated;
  }

  public async listSupportGrants(): Promise<SupportGrantSession[]> {
    this.assertDatabaseAvailable();
    const nowMs = Date.now();
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('support_grants')
        .select('*, organizations(name)')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) {
        throw new Error(`Failed to fetch support grants from Supabase: ${error.message}`);
      }
      return (data || []).map((row) => ({
        id: String(row.id),
        organizationId: String(row.organization_id).toLowerCase(),
        organizationName: row.organizations?.name || 'Organisation',
        creatorUserId: String(row.creator_user_id),
        creatorEmail: String(row.creator_email),
        reason: String(row.reason),
        accessLevel: 'read_only_admin',
        startsAt: String(row.starts_at),
        expiresAt: String(row.expires_at),
        revokedAt: row.revoked_at || null,
        active: !row.revoked_at && new Date(row.expires_at).getTime() > nowMs,
      }));
    }
    return Array.from(this.supportGrants.values()).map((g) => ({
      ...g,
      active: !g.revokedAt && new Date(g.expiresAt).getTime() > nowMs,
    }));
  }

  public async getLandingConfig(): Promise<LandingPageConfig> {
    this.assertDatabaseAvailable();
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('landing_cms_config')
        .select('config')
        .eq('id', 'default')
        .maybeSingle();
      if (error && !/does not exist|schema cache|42P01/i.test(error.message || '')) {
        throw new Error(`Failed to load landing CMS config from Supabase: ${error.message}`);
      }
      return data?.config
        ? { ...DEFAULT_LANDING_CMS, ...(data.config as Partial<LandingPageConfig>) }
        : { ...DEFAULT_LANDING_CMS };
    }
    return { ...this.landingConfig };
  }

  public async updateLandingConfig(
    updates: Partial<LandingPageConfig>,
    actorEmail: string
  ): Promise<LandingPageConfig> {
    this.assertDatabaseAvailable();
    const current = await this.getLandingConfig();
    const merged: LandingPageConfig = {
      ...current,
      ...updates,
      featuredStats: {
        ...current.featuredStats,
        ...(updates.featuredStats || {}),
      },
    };

    if (this.supabase) {
      const { error } = await this.supabase.from('landing_cms_config').upsert({
        id: 'default',
        config: merged,
        updated_by_email: actorEmail,
        updated_at: new Date().toISOString(),
      });
      if (error) {
        throw new Error(`Failed to persist landing CMS config in Supabase: ${error.message}`);
      }
      return merged;
    }

    this.landingConfig = merged;
    return merged;
  }

  private mapLandingLeadRow(row: Record<string, any>): LandingLeadRecord {
    return {
      id: String(row.id),
      leadType: (row.lead_type || 'demo_request') as LandingLeadType,
      email: String(row.email || ''),
      fullName: row.full_name || null,
      phone: row.phone || null,
      churchName: String(row.church_name || ''),
      interest: row.interest || null,
      message: row.message || null,
      sourceSection: row.source_section || null,
      status: (row.status || 'new') as LandingLeadStatus,
      creatorNotes: row.creator_notes || null,
      assignedOrganizationId: row.assigned_organization_id || null,
      contactedAt: row.contacted_at || null,
      convertedAt: row.converted_at || null,
      metadata: (row.metadata && typeof row.metadata === 'object' ? row.metadata : {}) as Record<string, unknown>,
      createdAt: String(row.created_at || new Date().toISOString()),
      updatedAt: String(row.updated_at || row.created_at || new Date().toISOString()),
    };
  }

  public async createLandingLead(input: {
    leadType?: LandingLeadType;
    email: string;
    fullName?: string;
    phone?: string;
    churchName: string;
    interest?: string;
    message?: string;
    sourceSection?: string;
    metadata?: Record<string, unknown>;
  }): Promise<LandingLeadRecord> {
    this.assertDatabaseAvailable();
    const now = new Date().toISOString();
    const id = randomUUID();
    const cleanEmail = input.email.trim().toLowerCase();
    const cleanChurch = input.churchName.trim() || 'Prospective Church';
    const record: LandingLeadRecord = {
      id,
      leadType: input.leadType || 'demo_request',
      email: cleanEmail,
      fullName: input.fullName?.trim() || null,
      phone: input.phone?.trim() || null,
      churchName: cleanChurch,
      interest: input.interest?.trim() || null,
      message: input.message?.trim() || null,
      sourceSection: input.sourceSection?.trim() || 'landing_page',
      status: 'new',
      creatorNotes: null,
      assignedOrganizationId: null,
      contactedAt: null,
      convertedAt: null,
      metadata: input.metadata || {},
      createdAt: now,
      updatedAt: now,
    };

    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('landing_leads')
        .insert({
          id: record.id,
          lead_type: record.leadType,
          email: record.email,
          full_name: record.fullName,
          phone: record.phone,
          church_name: record.churchName,
          interest: record.interest,
          message: record.message,
          source_section: record.sourceSection,
          status: 'new',
          metadata: record.metadata,
          created_at: now,
          updated_at: now,
        })
        .select('*')
        .single();

      if (!error && data) {
        const mapped = this.mapLandingLeadRow(data);
        this.landingLeads.set(mapped.id, mapped);
        return mapped;
      }

      if (error && !/does not exist|schema cache|42P01|PGRST205/i.test(error.message || '')) {
        throw new Error(`Failed to persist landing lead in Supabase: ${error.message}`);
      }
    }

    this.landingLeads.set(record.id, record);
    return record;
  }

  public async listLandingLeads(filter?: {
    status?: string;
    leadType?: string;
  }): Promise<LandingLeadRecord[]> {
    this.assertDatabaseAvailable();
    let list: LandingLeadRecord[] = Array.from(this.landingLeads.values());

    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('landing_leads')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(250);

      if (!error && Array.isArray(data)) {
        const fromDb = data.map((r) => this.mapLandingLeadRow(r));
        const seen = new Set(fromDb.map((r) => r.id));
        list = [...fromDb, ...list.filter((local) => !seen.has(local.id))];
      } else if (error && !/does not exist|schema cache|42P01|PGRST205/i.test(error.message || '')) {
        throw new Error(`Failed to load landing leads from Supabase: ${error.message}`);
      }
    }

    return list
      .filter((item) => {
        if (filter?.status && filter.status !== 'all' && item.status !== filter.status) return false;
        if (filter?.leadType && filter.leadType !== 'all' && item.leadType !== filter.leadType) return false;
        return true;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public async updateLandingLead(
    id: string,
    patch: {
      status?: LandingLeadStatus;
      creatorNotes?: string | null;
      assignedOrganizationId?: string | null;
    }
  ): Promise<LandingLeadRecord> {
    this.assertDatabaseAvailable();
    const now = new Date().toISOString();
    const existingList = await this.listLandingLeads();
    const current = existingList.find((l) => l.id === id);
    if (!current) {
      const err: any = new Error('Landing lead not found.');
      err.status = 404;
      err.code = 'NOT_FOUND';
      throw err;
    }

    const nextStatus = patch.status ?? current.status;
    const contactedAt =
      nextStatus === 'contacted' && !current.contactedAt ? now : current.contactedAt || null;
    const convertedAt =
      nextStatus === 'converted' && !current.convertedAt ? now : current.convertedAt || null;

    const updated: LandingLeadRecord = {
      ...current,
      status: nextStatus,
      creatorNotes: patch.creatorNotes !== undefined ? patch.creatorNotes : current.creatorNotes,
      assignedOrganizationId:
        patch.assignedOrganizationId !== undefined
          ? patch.assignedOrganizationId
          : current.assignedOrganizationId,
      contactedAt,
      convertedAt,
      updatedAt: now,
    };

    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('landing_leads')
        .update({
          status: updated.status,
          creator_notes: updated.creatorNotes,
          assigned_organization_id: updated.assignedOrganizationId,
          contacted_at: updated.contactedAt,
          converted_at: updated.convertedAt,
          updated_at: now,
        })
        .eq('id', id)
        .select('*')
        .maybeSingle();

      if (!error && data) {
        const mapped = this.mapLandingLeadRow(data);
        this.landingLeads.set(mapped.id, mapped);
        return mapped;
      }

      if (error && !/does not exist|schema cache|42P01|PGRST205/i.test(error.message || '')) {
        throw new Error(`Failed to update landing lead in Supabase: ${error.message}`);
      }
    }

    this.landingLeads.set(updated.id, updated);
    return updated;
  }

  private async markMatchingLandingLeadsConverted(
    email: string,
    organizationId: string
  ): Promise<void> {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) return;
    const now = new Date().toISOString();

    for (const [id, lead] of this.landingLeads.entries()) {
      if (lead.email.toLowerCase() === cleanEmail && lead.status !== 'converted') {
        this.landingLeads.set(id, {
          ...lead,
          status: 'converted',
          assignedOrganizationId: organizationId,
          convertedAt: now,
          updatedAt: now,
        });
      }
    }

    if (this.supabase) {
      await this.supabase
        .from('landing_leads')
        .update({
          status: 'converted',
          assigned_organization_id: organizationId,
          converted_at: now,
          updated_at: now,
        })
        .ilike('email', cleanEmail)
        .neq('status', 'converted');
    }
  }

  public async convertLandingLeadToOrganization(
    leadId: string,
    actorEmail: string
  ): Promise<{ lead: LandingLeadRecord; organisation: TenantChurch; license: SystemLicense }> {
    const leads = await this.listLandingLeads();
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) {
      const err: any = new Error('Landing lead not found.');
      err.status = 404;
      err.code = 'NOT_FOUND';
      throw err;
    }

    const { organisation, license } = await this.createOrganisation({
      name: lead.churchName,
      orgType: 'church',
      city: 'Accra',
      country: 'Ghana',
      seniorPastor: lead.fullName || undefined,
      contactName: lead.fullName || undefined,
      contactEmail: lead.email,
      contactPhone: lead.phone || undefined,
      initialPlan: 'grace_starter',
      autoIssueTrial: true,
    });

    const issuedLicense =
      license ||
      (await this.issueLicense({
        organizationId: organisation.id,
        tier: 'grace_starter',
        billingCycle: 'annual',
        status: 'trial',
        notes: 'Trial provisioned from landing lead conversion',
      }));

    const updatedLead = await this.updateLandingLead(lead.id, {
      status: 'converted',
      assignedOrganizationId: organisation.id,
      creatorNotes:
        lead.creatorNotes || `Converted to 14-day trial workspace (${organisation.slug}) by ${actorEmail}.`,
    });

    return { lead: updatedLead, organisation, license: issuedLicense };
  }

  public async getOrganizationSessionTimeoutMinutes(organizationId?: string): Promise<number> {
    if (!organizationId) return DEFAULT_IDLE_SESSION_TIMEOUT_MINUTES;
    try {
      const res = await this.getSystemSettings(organizationId);
      return normalizeIdleTimeoutMinutes(res.settings.sessionTimeoutMinutes);
    } catch {
      return DEFAULT_IDLE_SESSION_TIMEOUT_MINUTES;
    }
  }

  public async getPublicLandingOverview(): Promise<PublicLandingOverview> {
    this.assertDatabaseAvailable();
    const [landingConfig, allPlans, orgs, usage] = await Promise.all([
      this.getLandingConfig(),
      this.listPlans(),
      this.listOrganisations(),
      this.listUsageDaily(undefined, 90),
    ]);

    const activeOrgs = orgs.filter((o) => o.status !== 'archived' && o.status !== 'suspended');
    const activeSitesCount = activeOrgs.reduce((acc, o) => acc + (o.sitesCount || 0), 0);
    const totalCheckinsRecorded = usage.reduce((acc, u) => acc + (u.checkinsCount || 0), 0);

    return {
      landingConfig,
      plans: allPlans.filter((p) => p.isActive),
      liveStats: {
        activeChurchesCount: activeOrgs.length,
        activeSitesCount,
        totalCheckinsRecorded,
      },
    };
  }

  // ===========================================================================
  // ORGANISATION 6-TAB DETAIL & DASHBOARD AGGREGATES (STRICT PRIVACY)
  // ===========================================================================

  public async getOrganisationDetail(organizationId: string): Promise<OrganisationDetailPayload | null> {
    const orgId = organizationId.toLowerCase();
    const organisation = await this.getOrganisationById(orgId);
    if (!organisation) return null;

    const license = await this.getLatestLicenseForOrg(orgId);
    const evaluation = await this.evaluateOrganizationLicense(orgId);
    const payments = await this.listPayments(orgId);
    const usageDaily = await this.listUsageDaily(orgId, 30);
    const sites = await this.getSitesForOrg(orgId);
    const audit = await this.listAuditLogs({ organizationId: orgId, limit: 100 });

    // Privacy-preserving Users Summary: role counts and anonymized staff seat statuses ONLY
    // Congregation member names, phones, GPS trails, and per-person giving amounts are NEVER included!
    const members = await this.getMembers(orgId);
    const staffByRole: Record<string, number> = {
      admin: 1,
      pastor: 0,
      usher: 0,
      finance: 0,
      group_leader: 0,
      member: 0,
    };
    let visitorsCount = 0;
    let optedInProximityCount = 0;
    const staffAccounts: Array<{ id: string; role: string; status: string; joinedAt: string }> = [];

    for (const m of members) {
      const role = String(m.role || 'member');
      staffByRole[role] = (staffByRole[role] || 0) + 1;
      if (m.status === 'visitor') visitorsCount++;
      if (m.autoCheckinOptedIn) optedInProximityCount++;
      if (['owner', 'admin', 'pastor', 'usher', 'finance'].includes(role)) {
        staffAccounts.push({
          id: String(m.id).slice(0, 8),
          role,
          status: String(m.status || 'active'),
          joinedAt: String(m.joinedOn || m.created_at || new Date().toISOString().slice(0, 10)),
        });
      }
    }

    return {
      organisation,
      license,
      evaluation,
      payments,
      usageDaily,
      usersSummary: {
        totalMembersCount: Math.max(members.length, organisation.memberCount),
        visitorsCount,
        optedInProximityCount,
        staffByRole,
        staffAccounts,
      },
      sites: sites.map((s) => ({
        id: s.id,
        name: s.name,
        address: s.address,
        lat: s.lat,
        lng: s.lng,
        radius_m: s.radius_m,
        outer_radius_m: s.outer_radius_m,
        active: s.active,
      })),
      audit,
    };
  }

  public async getDashboardSummary(): Promise<ConsoleDashboardSummary> {
    const orgs = await this.listOrganisations();
    const licenses = await this.listLicenses();
    const payments = await this.listPayments();
    const usage = await this.listUsageDaily(undefined, 30);
    const openAlerts = await this.listAlerts({ status: 'open' });

    const organisationsByStatus: Record<string, number> = {
      active: 0,
      trial: 0,
      suspended: 0,
      archived: 0,
    };
    for (const o of orgs) {
      organisationsByStatus[o.status] = (organisationsByStatus[o.status] || 0) + 1;
    }

    const licensesByTier: Record<LicenseTier, number> = {
      grace_starter: 0,
      ministry_pro: 0,
      cathedral_enterprise: 0,
    };
    const licensesByStatus: Record<string, number> = {
      active: 0,
      trial: 0,
      grace_period: 0,
      expired: 0,
      revoked: 0,
      suspended: 0,
    };

    const nowMs = Date.now();
    const expiringIn7Days: SystemLicense[] = [];
    const expiringIn30Days: SystemLicense[] = [];
    let annualRunRateUSD = 0;

    for (const lic of licenses) {
      licensesByTier[lic.tier] = (licensesByTier[lic.tier] || 0) + 1;
      licensesByStatus[lic.status] = (licensesByStatus[lic.status] || 0) + 1;

      if (lic.status === 'active' || lic.status === 'grace_period') {
        annualRunRateUSD += lic.annualCostUSD;
      }

      const expMs = new Date(`${lic.expiresDate}T23:59:59Z`).getTime();
      const diffDays = Math.ceil((expMs - nowMs) / DAY_MS);
      if (diffDays >= -7 && diffDays <= 7 && ['active', 'trial', 'grace_period'].includes(lic.status)) {
        expiringIn7Days.push(lic);
      }
      if (diffDays >= -7 && diffDays <= 30 && ['active', 'trial', 'grace_period'].includes(lic.status)) {
        expiringIn30Days.push(lic);
      }
    }

    let paymentsTotalGHS = 0;
    let paymentsTotalUSD = 0;
    for (const p of payments) {
      if (p.currency === 'GHS') paymentsTotalGHS += p.amount;
      else paymentsTotalUSD += p.amount;
    }

    // Build 14-day check-ins trend
    const trendMap = new Map<string, { date: string; checkins: number; flagged: number; mockAttempts: number }>();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(nowMs - i * DAY_MS).toISOString().slice(0, 10);
      trendMap.set(d, { date: d, checkins: 0, flagged: 0, mockAttempts: 0 });
    }
    for (const u of usage) {
      const bucket = trendMap.get(u.usageDate);
      if (bucket) {
        bucket.checkins += u.checkinsCount;
        bucket.flagged += u.flaggedCount;
        bucket.mockAttempts += u.mockLocationAttempts;
      }
    }

    const topOrganisations = [...orgs]
      .sort((a, b) => (b.checkins30d || 0) - (a.checkins30d || 0))
      .slice(0, 5)
      .map((o) => ({
        id: o.id,
        name: o.name,
        city: o.city,
        tier: o.licenseTier,
        checkins30d: o.checkins30d || 0,
        seatsUsed: o.memberCount,
        seatsLimit: o.maxCapacity,
      }));

    const fourteenDaysAgo = nowMs - 14 * DAY_MS;
    const inactiveOrganisations = orgs
      .filter((o) => {
        if (o.status === 'archived') return false;
        if (!o.lastActivityAt && (o.checkins30d || 0) === 0) return true;
        return o.lastActivityAt ? new Date(o.lastActivityAt).getTime() < fourteenDaysAgo : false;
      })
      .map((o) => ({
        id: o.id,
        name: o.name,
        city: o.city,
        status: o.status,
        lastActivityAt: o.lastActivityAt || null,
      }));

    const nearOrOverLimits = orgs
      .map((o) => {
        const seatsLimit = Math.max(1, o.maxCapacity);
        const sitesLimit = Math.max(1, o.sitesLimit || 1);
        const seatUtilizationPct = Math.round((o.memberCount / seatsLimit) * 100);
        const siteUtilizationPct = Math.round(((o.sitesCount || 0) / sitesLimit) * 100);
        return {
          id: o.id,
          name: o.name,
          seatsUsed: o.memberCount,
          seatsLimit,
          sitesUsed: o.sitesCount || 0,
          sitesLimit,
          seatUtilizationPct,
          siteUtilizationPct,
        };
      })
      .filter((item) => item.seatUtilizationPct >= 80 || item.siteUtilizationPct >= 80);

    const allLeads = await this.listLandingLeads({ status: 'new' }).catch(() => []);

    return {
      organisationsByStatus,
      licensesByTier,
      licensesByStatus,
      expiringIn7Days,
      expiringIn30Days,
      annualRunRateUSD,
      paymentsTotalGHS,
      paymentsTotalUSD,
      checkinsTrend: Array.from(trendMap.values()),
      topOrganisations,
      inactiveOrganisations,
      nearOrOverLimits,
      openAlertsCount: openAlerts.length,
      newLandingLeadsCount: allLeads.length,
      storageBackend: this.storageBackend,
      generatedAt: new Date().toISOString(),
    };
  }

  // ===========================================================================
  // LEGACY TENANTS -> ORGANIZATIONS MIGRATION (Dry-Run & Live)
  // ===========================================================================

  public seedLegacyTenantInTest(legacy: { id: string; name: string; slug: string }): void {
    if (!this.isTestRuntime) return;
    this.legacyTenantsForDryRun.push(legacy);
  }

  public async migrateTenantsToOrganizations(dryRun = true): Promise<Record<string, unknown>> {
    this.assertDatabaseAvailable();
    if (this.supabase) {
      const { data, error } = await this.supabase.rpc('migrate_tenants_to_organizations', {
        p_dry_run: dryRun,
      });
      if (error) throw new Error(`Migration RPC failed: ${error.message}`);
      return (data || {}) as Record<string, unknown>;
    }

    const toInsert = this.legacyTenantsForDryRun.filter(
      (t) =>
        !this.orgs.has(t.id.toLowerCase()) &&
        !Array.from(this.orgs.values()).some((o) => o.slug.toLowerCase() === t.slug.toLowerCase())
    );

    if (dryRun) {
      return {
        dryRun: true,
        legacyTenantsTableFound: true,
        tenantsTotal: this.legacyTenantsForDryRun.length,
        organizationsToInsert: toInsert.length,
        organizationsAlreadyPresent: this.legacyTenantsForDryRun.length - toInsert.length,
        checkedAt: new Date().toISOString(),
      };
    }

    for (const t of toInsert) {
      await this.createOrganisation({
        id: t.id,
        name: t.name,
        slug: t.slug,
        orgType: 'church',
        autoIssueTrial: true,
      });
    }

    return {
      dryRun: false,
      organizationsInserted: toInsert.length,
      completedAt: new Date().toISOString(),
    };
  }

  // ===========================================================================
  // DONATIONS / MOBILE GIVING LEDGER (ORG-SCOPED)
  // ===========================================================================

  private mapSupabaseDonationRow(row: Record<string, any>): Donation {
    const fundName = String(row.fund_name || 'General Tithe');
    const fundId = String(row.fund_key || row.fund_id || fundName.toLowerCase().replace(/\s+/g, '-'));
    const rawProvider = String(row.provider || 'MTN MoMo');
    const provider: Donation['provider'] =
      rawProvider === 'Telecel Cash' || rawProvider === 'Card' || rawProvider === 'Cash'
        ? rawProvider
        : 'MTN MoMo';
    const rawMethod = String(row.method || 'momo');
    const method: Donation['method'] =
      rawMethod === 'card' || rawMethod === 'cash' || rawMethod === 'bank' ? rawMethod : 'momo';
    const rawStatus = String(row.status || 'paid');
    const status: Donation['status'] =
      rawStatus === 'pending' || rawStatus === 'failed' ? rawStatus : 'paid';
    const paidIso = String(row.paid_at || row.created_at || new Date().toISOString());

    return {
      id: String(row.id),
      personId: row.member_id
        ? String(row.member_id)
        : row.person_id
        ? String(row.person_id)
        : undefined,
      personName: row.person_name ? String(row.person_name) : undefined,
      fundId,
      fundName,
      amountMinor: Number(row.amount_minor || 0),
      currency: 'GHS',
      method,
      provider,
      status,
      paidAt: paidIso.slice(0, 10),
      ...(row.reference ? { reference: String(row.reference) } : {}),
    };
  }

  public async listDonations(
    organizationId: string,
    filters?: { personId?: string }
  ): Promise<Donation[]> {
    this.assertDatabaseAvailable();
    const orgId = (organizationId || '').trim().toLowerCase();
    if (!orgId) return [];

    if (this.supabase) {
      if (!UUID_REGEX.test(orgId)) return [];
      const { data, error } = await this.supabase
        .from('donations')
        .select('*')
        .or(`organization_id.eq.${orgId},tenant_id.eq.${orgId}`)
        .order('paid_at', { ascending: false })
        .limit(250);

      if (error) {
        if (/does not exist|schema cache|42P01|PGRST205/i.test(error.message || '')) {
          return [];
        }
        throw new Error(`Failed to fetch donations from Supabase: ${error.message}`);
      }

      const mapped = (data || []).map((row) => this.mapSupabaseDonationRow(row));
      if (filters?.personId) {
        return mapped.filter((d) => d.personId === filters.personId);
      }
      return mapped;
    }

    const list = [...(this.donationsByOrg.get(orgId) || [])];
    if (filters?.personId) {
      return list.filter((d) => d.personId === filters.personId);
    }
    return list;
  }

  public async createDonation(
    organizationId: string,
    input: {
      personId?: string;
      personName?: string;
      fundName: string;
      fundId?: string;
      amountMinor: number;
      method: 'momo' | 'card' | 'cash' | 'bank';
      provider: 'MTN MoMo' | 'Telecel Cash' | 'Card' | 'Cash';
      status?: 'pending' | 'paid' | 'failed';
      paidAt?: string;
      reference?: string;
      gatewayProvider?: string;
    }
  ): Promise<Donation> {
    this.assertDatabaseAvailable();
    const orgId = (organizationId || '').trim().toLowerCase();
    const cleanFundName = (input.fundName || 'Tithe').trim();
    const cleanFundKey = (input.fundId || cleanFundName.toLowerCase().replace(/\s+/g, '-')).trim();
    const nowIso = new Date().toISOString();
    const paidAtIso = input.paidAt ? new Date(input.paidAt).toISOString() : nowIso;
    const amountMinor = Math.max(1, Math.round(Number(input.amountMinor || 0)));
    const reference = input.reference ? String(input.reference).trim() : undefined;

    if (this.supabase) {
      if (!UUID_REGEX.test(orgId)) {
        throw new Error('Valid organisation ID is required to record donations.');
      }
      const memberUuid = input.personId && UUID_REGEX.test(input.personId) ? input.personId : null;
      const insertRow: Record<string, unknown> = {
        id: randomUUID(),
        organization_id: orgId,
        member_id: memberUuid,
        person_name: input.personName || 'Member',
        fund_key: cleanFundKey,
        fund_name: cleanFundName,
        amount_minor: amountMinor,
        currency: 'GHS',
        method: input.method,
        provider: input.provider,
        status: input.status || 'paid',
        paid_at: paidAtIso,
        ...(reference ? { reference } : {}),
        ...(input.gatewayProvider ? { gateway_provider: input.gatewayProvider } : {}),
      };

      let { data, error } = await this.supabase
        .from('donations')
        .insert(insertRow)
        .select('*')
        .single();

      for (let attempt = 0; attempt < 2 && error; attempt++) {
        const msg = error.message || '';
        const colMatch =
          msg.match(/Could not find the '([^']+)' column/i) ||
          msg.match(/column "([^"]+)"(?: of relation "[^"]+")? does not exist/i);
        if (colMatch && colMatch[1] && Object.prototype.hasOwnProperty.call(insertRow, colMatch[1])) {
          delete insertRow[colMatch[1]];
          const retry = await this.supabase.from('donations').insert(insertRow).select('*').single();
          data = retry.data;
          error = retry.error;
          continue;
        }
        break;
      }

      if (error) {
        throw new Error(`Failed to record donation in Supabase: ${error.message}`);
      }
      return this.mapSupabaseDonationRow(data);
    }

    const created: Donation = {
      id: randomUUID(),
      personId: input.personId,
      personName: input.personName || 'Member',
      fundId: cleanFundKey,
      fundName: cleanFundName,
      amountMinor,
      currency: 'GHS',
      method: input.method,
      provider: input.provider,
      status: input.status || 'paid',
      paidAt: paidAtIso.slice(0, 10),
      ...(reference ? { reference } : {}),
    };
    const existing = this.donationsByOrg.get(orgId) || [];
    this.donationsByOrg.set(orgId, [created, ...existing]);
    return created;
  }

  public async updateDonationStatusByReference(
    organizationId: string,
    reference: string,
    status: 'pending' | 'paid' | 'failed',
    meta?: {
      paidAt?: string;
      gatewayMetadata?: Record<string, unknown>;
    }
  ): Promise<Donation | null> {
    this.assertDatabaseAvailable();
    const orgId = (organizationId || '').trim().toLowerCase();
    const cleanRef = (reference || '').trim();
    if (!orgId || !cleanRef) return null;

    if (this.supabase) {
      if (!UUID_REGEX.test(orgId)) return null;
      const updatePayload: Record<string, unknown> = {
        status,
        ...(meta?.paidAt ? { paid_at: meta.paidAt } : {}),
        ...(meta?.gatewayMetadata ? { gateway_metadata: meta.gatewayMetadata } : {}),
      };
      const { data, error } = await this.supabase
        .from('donations')
        .update(updatePayload)
        .eq('organization_id', orgId)
        .eq('reference', cleanRef)
        .select('*')
        .maybeSingle();

      if (error || !data) {
        return null;
      }
      return this.mapSupabaseDonationRow(data);
    }

    const existing = this.donationsByOrg.get(orgId) || [];
    const idx = existing.findIndex((d) => d.reference === cleanRef);
    if (idx < 0) return null;
    const updated: Donation = {
      ...existing[idx],
      status,
      ...(meta?.paidAt ? { paidAt: meta.paidAt.slice(0, 10) } : {}),
    };
    const next = [...existing];
    next[idx] = updated;
    this.donationsByOrg.set(orgId, next);
    return updated;
  }

  // ===========================================================================
  // PASTORAL CARE FOLLOW-UP TASKS (ORG-SCOPED)
  // ===========================================================================

  private mapSupabaseFollowupRow(row: Record<string, any>): FollowupTask {
    const rawReason = String(row.reason || 'manual');
    const reason: FollowupReason =
      rawReason === 'absent_2' ||
      rawReason === 'absent_3' ||
      rawReason === 'first_timer' ||
      rawReason === 'manual'
        ? rawReason
        : 'manual';
    const rawStatus = String(row.status || 'open');
    const status: FollowupStatus =
      rawStatus === 'contacted' || rawStatus === 'resolved' || rawStatus === 'dismissed'
        ? rawStatus
        : 'open';
    const createdIso = String(row.created_at || new Date().toISOString());

    return {
      id: String(row.id),
      personId: String(row.member_id || row.person_id || ''),
      personName: String(row.person_name || 'Member'),
      personPhone: row.person_phone ? String(row.person_phone) : undefined,
      personEmail: row.person_email ? String(row.person_email) : undefined,
      groupName: String(row.group_name || 'General'),
      reason,
      assignedToName: String(row.assigned_to_name || 'Pastoral Care Team'),
      assignedToMemberId: row.assigned_to_member_id ? String(row.assigned_to_member_id) : undefined,
      assignedToRole: row.assigned_to_role ? String(row.assigned_to_role) : undefined,
      assignedToPhone: row.assigned_to_phone ? String(row.assigned_to_phone) : undefined,
      assignedToEmail: row.assigned_to_email ? String(row.assigned_to_email) : undefined,
      autoAssigned: typeof row.auto_assigned === 'boolean' ? row.auto_assigned : undefined,
      lastReminderAt: row.last_reminder_at ? String(row.last_reminder_at) : undefined,
      reminderCount: typeof row.reminder_count === 'number' ? row.reminder_count : 0,
      serviceEventId: row.service_event_id ? String(row.service_event_id) : undefined,
      serviceName: row.service_name ? String(row.service_name) : undefined,
      acknowledgedAt: row.acknowledged_at ? String(row.acknowledged_at) : undefined,
      status,
      dueOn: String(row.due_label || row.due_on || 'In 3 days'),
      outcome: row.outcome ? String(row.outcome) : undefined,
      notes: row.notes ? String(row.notes) : undefined,
      createdAt: createdIso.slice(0, 10),
      resolvedAt: row.resolved_at ? String(row.resolved_at) : undefined,
    };
  }

  private enrichFollowupTasksWithMembers(
    tasks: FollowupTask[],
    orgMembers: Record<string, any>[],
    churchGroups: ChurchGroup[] = []
  ): FollowupTask[] {
    const byId = new Map<string, Record<string, any>>();
    const byName = new Map<string, Record<string, any>>();
    for (const m of orgMembers) {
      byId.set(String(m.id), m);
      const fullName = `${String(m.firstName || '').trim()} ${String(m.lastName || '').trim()}`
        .trim()
        .toLowerCase();
      if (fullName) byName.set(fullName, m);
    }
    const groupByLeader = new Map<string, ChurchGroup>();
    for (const g of churchGroups) {
      const k = normalizeSettingLabel(g.leaderName).toLowerCase();
      if (k && !groupByLeader.has(k)) groupByLeader.set(k, g);
    }

    return tasks.map((t) => {
      const targetMember = byId.get(String(t.personId));
      const assigneeMember =
        (t.assignedToMemberId ? byId.get(t.assignedToMemberId) : undefined) ||
        byName.get(normalizeSettingLabel(t.assignedToName).toLowerCase());
      const matchedGroup = groupByLeader.get(normalizeSettingLabel(t.assignedToName).toLowerCase());
      return {
        ...t,
        personPhone:
          t.personPhone ||
          (targetMember?.phoneE164 ? String(targetMember.phoneE164) : undefined) ||
          (targetMember?.phoneNumber ? String(targetMember.phoneNumber) : undefined),
        personEmail: t.personEmail || (targetMember?.email ? String(targetMember.email) : undefined),
        assignedToMemberId:
          t.assignedToMemberId ||
          (assigneeMember ? String(assigneeMember.id) : undefined) ||
          matchedGroup?.leaderMemberId ||
          undefined,
        assignedToRole:
          t.assignedToRole ||
          (assigneeMember?.officerName || assigneeMember?.designation
            ? String(assigneeMember.officerName || assigneeMember.designation)
            : matchedGroup
            ? matchedGroup.category === 'cell_group'
              ? 'Cell Leader'
              : 'Ministry Leader'
            : undefined),
        assignedToPhone:
          t.assignedToPhone ||
          (assigneeMember?.phoneE164 ? String(assigneeMember.phoneE164) : undefined) ||
          matchedGroup?.leaderPhone ||
          undefined,
        assignedToEmail:
          t.assignedToEmail ||
          (assigneeMember?.email ? String(assigneeMember.email) : undefined) ||
          matchedGroup?.leaderEmail ||
          undefined,
      };
    });
  }

  public async listFollowupTasks(organizationId: string): Promise<FollowupTask[]> {
    this.assertDatabaseAvailable();
    const orgId = (organizationId || '').trim().toLowerCase();
    if (!orgId) return [];
    const [orgMembers, churchGroups] = await Promise.all([
      this.getMembers(orgId),
      this.listChurchGroups(orgId).catch(() => [] as ChurchGroup[]),
    ]);

    if (this.supabase) {
      if (!UUID_REGEX.test(orgId)) return [];
      const { data, error } = await this.supabase
        .from('followup_tasks')
        .select('*')
        .or(`organization_id.eq.${orgId},tenant_id.eq.${orgId}`)
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) {
        if (/does not exist|schema cache|42P01|PGRST205/i.test(error.message || '')) {
          return [];
        }
        throw new Error(`Failed to fetch follow-up tasks from Supabase: ${error.message}`);
      }

      const mapped = (data || []).map((row) => this.mapSupabaseFollowupRow(row));
      return this.enrichFollowupTasksWithMembers(mapped, orgMembers, churchGroups);
    }

    const memTasks = [...(this.followupTasksByOrg.get(orgId) || [])];
    return this.enrichFollowupTasksWithMembers(memTasks, orgMembers, churchGroups);
  }

  public async createFollowupTask(
    organizationId: string,
    input: {
      personId: string;
      personName?: string;
      personPhone?: string;
      personEmail?: string;
      groupName?: string;
      reason: FollowupReason;
      assignedToName?: string;
      assignedToMemberId?: string;
      assignedToRole?: string;
      assignedToPhone?: string;
      assignedToEmail?: string;
      autoAssigned?: boolean;
      serviceEventId?: string;
      serviceName?: string;
      dueOn?: string;
      notes?: string;
    }
  ): Promise<FollowupTask> {
    this.assertDatabaseAvailable();
    const orgId = (organizationId || '').trim().toLowerCase();
    const [orgMembers, churchGroups] = await Promise.all([
      this.getMembers(orgId),
      this.listChurchGroups(orgId).catch(() => [] as ChurchGroup[]),
    ]);
    const matchedMember = orgMembers.find((m) => String(m.id) === input.personId);
    const resolvedPersonName =
      (input.personName || '').trim() ||
      (matchedMember ? `${matchedMember.firstName} ${matchedMember.lastName}`.trim() : 'Member');
    const resolvedGroupName =
      (input.groupName || '').trim() || matchedMember?.homeCellGroup || matchedMember?.groupName || 'General';
    const resolvedAssignee = (input.assignedToName || '').trim() || 'Pastoral Care Team';
    const resolvedDueLabel =
      (input.dueOn || '').trim() || (input.reason === 'first_timer' ? 'Tomorrow 10:00 AM' : 'In 3 days');
    const resolvedPersonPhone =
      (input.personPhone || '').trim() ||
      (matchedMember?.phoneE164 ? String(matchedMember.phoneE164) : undefined);
    const resolvedPersonEmail =
      (input.personEmail || '').trim() ||
      (matchedMember?.email ? String(matchedMember.email) : undefined);

    if (this.supabase) {
      if (!UUID_REGEX.test(orgId)) {
        throw new Error('Valid organisation ID is required for follow-up tasks.');
      }
      const memberUuid = UUID_REGEX.test(input.personId) ? input.personId : null;
      const assigneeMemberUuid =
        input.assignedToMemberId && UUID_REGEX.test(input.assignedToMemberId)
          ? input.assignedToMemberId
          : null;
      const serviceEventUuid =
        input.serviceEventId && UUID_REGEX.test(input.serviceEventId) ? input.serviceEventId : null;

      let insertRow: Record<string, unknown> = {
        id: randomUUID(),
        organization_id: orgId,
        member_id: memberUuid,
        person_name: resolvedPersonName,
        group_name: resolvedGroupName,
        reason: input.reason,
        assigned_to_name: resolvedAssignee,
        assigned_to_member_id: assigneeMemberUuid,
        assigned_to_role: input.assignedToRole || null,
        assigned_to_phone: input.assignedToPhone || null,
        assigned_to_email: input.assignedToEmail || null,
        auto_assigned: Boolean(input.autoAssigned),
        service_event_id: serviceEventUuid,
        service_name: input.serviceName || null,
        reminder_count: 0,
        status: 'open',
        due_label: resolvedDueLabel,
        notes: input.notes || null,
      };

      let { data, error } = await this.supabase
        .from('followup_tasks')
        .insert(insertRow)
        .select('*')
        .single();

      for (let attempt = 0; attempt < 8 && error; attempt++) {
        const msg = error.message || '';
        const colMatch =
          msg.match(/Could not find the '([^']+)' column/i) ||
          msg.match(/column "([^"]+)"(?: of relation "[^"]+")? does not exist/i);
        if (!colMatch) break;
        const badCol = colMatch[1];
        if (badCol in insertRow) {
          const { [badCol]: _omitted, ...rest } = insertRow;
          insertRow = rest;
          const retry = await this.supabase
            .from('followup_tasks')
            .insert(insertRow)
            .select('*')
            .single();
          data = retry.data;
          error = retry.error;
        } else {
          break;
        }
      }

      if (error) {
        throw new Error(`Failed to create follow-up task in Supabase: ${error.message}`);
      }
      const mapped = this.mapSupabaseFollowupRow(data);
      return this.enrichFollowupTasksWithMembers(
        [
          {
            ...mapped,
            ...(input.assignedToMemberId ? { assignedToMemberId: input.assignedToMemberId } : {}),
            ...(input.assignedToRole ? { assignedToRole: input.assignedToRole } : {}),
            ...(input.assignedToPhone ? { assignedToPhone: input.assignedToPhone } : {}),
            ...(input.assignedToEmail ? { assignedToEmail: input.assignedToEmail } : {}),
            ...(input.autoAssigned !== undefined ? { autoAssigned: input.autoAssigned } : {}),
            ...(input.serviceEventId ? { serviceEventId: input.serviceEventId } : {}),
            ...(input.serviceName ? { serviceName: input.serviceName } : {}),
          },
        ],
        orgMembers,
        churchGroups
      )[0];
    }

    const created: FollowupTask = {
      id: randomUUID(),
      personId: input.personId,
      personName: resolvedPersonName,
      personPhone: resolvedPersonPhone,
      personEmail: resolvedPersonEmail,
      groupName: resolvedGroupName,
      reason: input.reason,
      assignedToName: resolvedAssignee,
      assignedToMemberId: input.assignedToMemberId,
      assignedToRole: input.assignedToRole,
      assignedToPhone: input.assignedToPhone,
      assignedToEmail: input.assignedToEmail,
      autoAssigned: input.autoAssigned,
      serviceEventId: input.serviceEventId,
      serviceName: input.serviceName,
      reminderCount: 0,
      status: 'open',
      dueOn: resolvedDueLabel,
      notes: input.notes || undefined,
      createdAt: new Date().toISOString().slice(0, 10),
    };
    const existing = this.followupTasksByOrg.get(orgId) || [];
    this.followupTasksByOrg.set(orgId, [created, ...existing]);
    return this.enrichFollowupTasksWithMembers([created], orgMembers, churchGroups)[0];
  }

  public async autoAssignAbsenteeFollowupTasks(
    organizationId: string,
    opts?: {
      unarrivedMemberIds?: string[];
      fallbackActorName?: string;
      serviceEventId?: string;
      serviceName?: string;
      sendLeaderReminders?: boolean;
    }
  ): Promise<{
    assignedCount: number;
    skippedExistingCount: number;
    tasks: FollowupTask[];
    allTasks: FollowupTask[];
    leaderRemindersSent: number;
  }> {
    this.assertDatabaseAvailable();
    const orgId = (organizationId || '').trim().toLowerCase();
    if (!orgId) {
      return {
        assignedCount: 0,
        skippedExistingCount: 0,
        tasks: [],
        allTasks: [],
        leaderRemindersSent: 0,
      };
    }

    const [membersRaw, churchGroups, existingTasks, settingsRes] = await Promise.all([
      this.getMembers(orgId),
      this.listChurchGroups(orgId),
      this.listFollowupTasks(orgId),
      this.getSystemSettings(orgId),
    ]);

    const typedMembers = membersRaw as unknown as Person[];
    const unarrivedSet =
      Array.isArray(opts?.unarrivedMemberIds) && opts!.unarrivedMemberIds.length > 0
        ? new Set(opts!.unarrivedMemberIds.map((id) => String(id)))
        : undefined;

    const plan = buildAutoAssignAbsenteesPlan({
      members: typedMembers,
      churchGroups,
      existingTasks,
      systemSettings: settingsRes.settings,
      fallbackActorName: opts?.fallbackActorName,
      unarrivedMemberIdsForLatestService: unarrivedSet,
    });

    const createdTasks: FollowupTask[] = [];
    for (const item of plan) {
      const created = await this.createFollowupTask(orgId, {
        personId: item.personId,
        personName: item.personName,
        personPhone: item.personPhone,
        personEmail: item.personEmail,
        groupName: item.groupName,
        reason: item.reason,
        assignedToName: item.assignedToName,
        assignedToMemberId: item.assignedToMemberId,
        assignedToRole: item.assignedToRole,
        assignedToPhone: item.assignedToPhone,
        autoAssigned: true,
        serviceEventId: opts?.serviceEventId,
        serviceName: opts?.serviceName,
        dueOn: item.dueOn,
        notes: item.notes,
      });
      createdTasks.push(created);
    }

    let leaderRemindersSent = 0;
    const shouldNotifyLeaders =
      opts?.sendLeaderReminders ?? settingsRes.settings.autoSendLeaderCareReminders !== false;
    if (shouldNotifyLeaders && createdTasks.length > 0) {
      const reminderRes = await this.sendPendingLeaderCareReminders(orgId, {
        taskIds: createdTasks.map((t) => t.id),
        actorName: opts?.fallbackActorName || 'Pastoral Care Automation',
      });
      leaderRemindersSent = reminderRes.sentCount;
    }

    const allTasks = await this.listFollowupTasks(orgId);
    const activeOpenIds = existingTasks.filter(
      (t) => t.status === 'open' || t.status === 'contacted'
    ).length;

    return {
      assignedCount: createdTasks.length,
      skippedExistingCount: activeOpenIds,
      tasks: createdTasks,
      allTasks,
      leaderRemindersSent,
    };
  }

  public async updateFollowupTask(
    organizationId: string,
    taskId: string,
    patch: {
      status?: FollowupStatus;
      outcome?: string;
      assignedToName?: string;
      notes?: string;
      lastReminderAt?: string;
      reminderCount?: number;
      acknowledgedAt?: string;
    }
  ): Promise<FollowupTask> {
    this.assertDatabaseAvailable();
    const orgId = (organizationId || '').trim().toLowerCase();
    const nowIso = new Date().toISOString();

    if (this.supabase) {
      if (!UUID_REGEX.test(taskId)) {
        const err: any = new Error('Follow-up task not found.');
        err.status = 404;
        throw err;
      }

      let updateFields: Record<string, unknown> = {};
      if (patch.status !== undefined) {
        updateFields.status = patch.status;
        if (patch.status === 'resolved' || patch.status === 'dismissed') {
          updateFields.resolved_at = nowIso;
        }
      }
      if (patch.outcome !== undefined) updateFields.outcome = patch.outcome;
      if (patch.assignedToName !== undefined) updateFields.assigned_to_name = patch.assignedToName;
      if (patch.notes !== undefined) updateFields.notes = patch.notes;
      if (patch.lastReminderAt !== undefined) updateFields.last_reminder_at = patch.lastReminderAt;
      if (patch.reminderCount !== undefined) updateFields.reminder_count = patch.reminderCount;
      if (patch.acknowledgedAt !== undefined) updateFields.acknowledged_at = patch.acknowledgedAt;

      let { data, error } = await this.supabase
        .from('followup_tasks')
        .update(updateFields)
        .eq('organization_id', orgId)
        .eq('id', taskId)
        .select('*')
        .maybeSingle();

      for (let attempt = 0; attempt < 6 && error; attempt++) {
        const msg = error.message || '';
        const colMatch =
          msg.match(/Could not find the '([^']+)' column/i) ||
          msg.match(/column "([^"]+)"(?: of relation "[^"]+")? does not exist/i);
        if (!colMatch) break;
        const badCol = colMatch[1];
        if (badCol in updateFields) {
          const { [badCol]: _omitted, ...rest } = updateFields;
          updateFields = rest;
          if (Object.keys(updateFields).length === 0) {
            const existing = await this.supabase
              .from('followup_tasks')
              .select('*')
              .eq('organization_id', orgId)
              .eq('id', taskId)
              .maybeSingle();
            data = existing.data;
            error = existing.error;
            break;
          }
          const retry = await this.supabase
            .from('followup_tasks')
            .update(updateFields)
            .eq('organization_id', orgId)
            .eq('id', taskId)
            .select('*')
            .maybeSingle();
          data = retry.data;
          error = retry.error;
        } else {
          break;
        }
      }

      if (error) {
        throw new Error(`Failed to update follow-up task in Supabase: ${error.message}`);
      }
      if (!data) {
        const err: any = new Error('Follow-up task not found.');
        err.status = 404;
        throw err;
      }
      const [orgMembers, churchGroups] = await Promise.all([
        this.getMembers(orgId),
        this.listChurchGroups(orgId).catch(() => [] as ChurchGroup[]),
      ]);
      return this.enrichFollowupTasksWithMembers(
        [this.mapSupabaseFollowupRow(data)],
        orgMembers,
        churchGroups
      )[0];
    }

    const list = this.followupTasksByOrg.get(orgId) || [];
    const idx = list.findIndex((t) => t.id === taskId);
    if (idx < 0) {
      const err: any = new Error('Follow-up task not found.');
      err.status = 404;
      throw err;
    }
    const updated: FollowupTask = {
      ...list[idx],
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.outcome !== undefined ? { outcome: patch.outcome } : {}),
      ...(patch.assignedToName !== undefined ? { assignedToName: patch.assignedToName } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      ...(patch.lastReminderAt !== undefined ? { lastReminderAt: patch.lastReminderAt } : {}),
      ...(patch.reminderCount !== undefined ? { reminderCount: patch.reminderCount } : {}),
      ...(patch.acknowledgedAt !== undefined ? { acknowledgedAt: patch.acknowledgedAt } : {}),
      ...(patch.status === 'resolved' || patch.status === 'dismissed'
        ? { resolvedAt: nowIso }
        : {}),
    };
    list[idx] = updated;
    this.followupTasksByOrg.set(orgId, list);
    return updated;
  }

  public async deleteFollowupTask(organizationId: string, taskId: string): Promise<void> {
    this.assertDatabaseAvailable();
    const orgId = (organizationId || '').trim().toLowerCase();

    if (this.supabase) {
      if (!UUID_REGEX.test(taskId)) {
        const err: any = new Error('Follow-up task not found.');
        err.status = 404;
        throw err;
      }
      const { data, error } = await this.supabase
        .from('followup_tasks')
        .delete()
        .eq('organization_id', orgId)
        .eq('id', taskId)
        .select('id')
        .maybeSingle();
      if (error) {
        throw new Error(`Failed to delete follow-up task in Supabase: ${error.message}`);
      }
      if (!data) {
        const err: any = new Error('Follow-up task not found.');
        err.status = 404;
        throw err;
      }
      return;
    }

    const list = this.followupTasksByOrg.get(orgId) || [];
    if (!list.some((t) => t.id === taskId)) {
      const err: any = new Error('Follow-up task not found.');
      err.status = 404;
      throw err;
    }
    this.followupTasksByOrg.set(
      orgId,
      list.filter((t) => t.id !== taskId)
    );
  }

  // ===========================================================================
  // AUTOMATED ABSENTEE OUTREACH, LEADER CARE REMINDERS & OVERSIGHT MONITOR
  // ===========================================================================

  public async resolveUserDesignation(
    organizationId?: string,
    userId?: string,
    email?: string,
    explicitDesignation?: string
  ): Promise<string | undefined> {
    if (explicitDesignation && explicitDesignation.trim()) {
      return explicitDesignation.trim();
    }
    const orgId = (organizationId || '').trim().toLowerCase();
    if (!orgId || !userId) return undefined;
    try {
      const profile = await this.getMemberProfileForSession(orgId, userId, email);
      const raw = profile?.designation || profile?.officerName;
      return raw ? String(raw).trim() || undefined : undefined;
    } catch {
      return undefined;
    }
  }

  private async resetMemberAbsenceStreakOnCheckin(
    organizationId: string,
    personId: string
  ): Promise<void> {
    const orgId = (organizationId || '').trim().toLowerCase();
    if (!orgId || !personId) return;
    const members = await this.getMembers(orgId);
    const member = members.find((m) => String(m.id) === String(personId));
    if (member && Number(member.consecutiveAbsences || 0) > 0) {
      await this.updateMember(orgId, String(member.id), {
        consecutiveAbsences: 0,
      }).catch(() => {});
    }

    const tasks = await this.listFollowupTasks(orgId);
    const activeAbsentTasks = tasks.filter(
      (t) =>
        String(t.personId) === String(personId) &&
        (t.status === 'open' || t.status === 'contacted') &&
        (t.reason === 'absent_2' || t.reason === 'absent_3')
    );
    for (const task of activeAbsentTasks) {
      await this.updateFollowupTask(orgId, task.id, {
        status: 'resolved',
        outcome: 'Returned and checked in for service',
      }).catch(() => {});
    }
  }

  private async getExplicitMemberConsentRecord(
    organizationId: string,
    memberId: string,
    email?: string
  ): Promise<{ autoCheckin: boolean; push: boolean; sms: boolean; email: boolean } | null> {
    const orgId = (organizationId || '').trim().toLowerCase();
    if (!orgId || !memberId) return null;

    if (this.supabase) {
      if (!UUID_REGEX.test(orgId)) return null;
      const orClauses = [`user_id.eq.${memberId}`];
      if (UUID_REGEX.test(memberId)) {
        orClauses.push(`member_id.eq.${memberId}`);
      }
      const { data, error } = await this.supabase
        .from('member_consents')
        .select('*')
        .eq('organization_id', orgId)
        .or(orClauses.join(','))
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !data) return null;
      return {
        autoCheckin: Boolean(data.auto_checkin),
        push: Boolean(data.push),
        sms: Boolean(data.sms),
        email: Boolean(data.email),
      };
    }

    const byOrg = this.memberConsentsByOrg.get(orgId) || {};
    if (byOrg[memberId]) {
      const c = byOrg[memberId];
      return { autoCheckin: c.autoCheckin, push: c.push, sms: c.sms, email: c.email };
    }
    const matched = Object.values(byOrg).find(
      (c) => c.memberId === memberId || (email && (c as any).email === email)
    );
    if (matched) {
      return {
        autoCheckin: matched.autoCheckin,
        push: matched.push,
        sms: matched.sms,
        email: matched.email,
      };
    }
    return null;
  }

  private renderAbsentMemberMessage(
    template: string,
    vars: {
      firstName: string;
      fullName: string;
      serviceName: string;
      churchName: string;
      missedCount: number;
      contactPhone: string;
    }
  ): string {
    const base = (template || DEFAULT_ABSENT_MEMBER_MESSAGE_TEMPLATE).trim();
    return base
      .replace(/\{\{\s*firstName\s*\}\}/gi, vars.firstName || 'Friend')
      .replace(/\{\{\s*fullName\s*\}\}/gi, vars.fullName || 'Beloved Member')
      .replace(/\{\{\s*serviceName\s*\}\}/gi, vars.serviceName || 'today’s service')
      .replace(/\{\{\s*churchName\s*\}\}/gi, vars.churchName || 'your church family')
      .replace(/\{\{\s*missedCount\s*\}\}/gi, String(vars.missedCount || 1))
      .replace(/\{\{\s*contactPhone\s*\}\}/gi, vars.contactPhone || 'our church office');
  }

  private isMissingPastoralAutomationTableError(error: { code?: string; message?: string } | null): boolean {
    if (!error) return false;
    const code = String(error.code || '').toUpperCase();
    const msg = String(error.message || '');
    return (
      code === 'PGRST205' ||
      code === '42P01' ||
      /pastoral_care_dispatches|service_absence_runs|schema cache|does not exist|could not find the table/i.test(
        msg
      )
    );
  }

  private mapSupabaseDispatchRow(row: Record<string, any>): PastoralCareDispatch {
    return {
      id: String(row.id),
      organizationId: String(row.organization_id || '').toLowerCase(),
      dispatchType:
        row.dispatch_type === 'leader_reminder' ? 'leader_reminder' : 'absent_member_alert',
      serviceEventId: row.service_event_id ? String(row.service_event_id) : undefined,
      serviceName: row.service_name ? String(row.service_name) : undefined,
      followupTaskId: row.followup_task_id ? String(row.followup_task_id) : undefined,
      memberId: row.member_id ? String(row.member_id) : undefined,
      memberName: String(row.member_name || 'Member'),
      recipientName: String(row.recipient_name || 'Recipient'),
      recipientRole: row.recipient_role ? String(row.recipient_role) : undefined,
      recipientPhone: row.recipient_phone ? String(row.recipient_phone) : undefined,
      recipientEmail: row.recipient_email ? String(row.recipient_email) : undefined,
      channel:
        row.channel === 'email' || row.channel === 'push' || row.channel === 'in_app'
          ? row.channel
          : 'sms',
      status:
        row.status === 'sent' ||
        row.status === 'queued' ||
        row.status === 'skipped_unconfigured' ||
        row.status === 'skipped_opt_out' ||
        row.status === 'skipped_no_contact' ||
        row.status === 'failed'
          ? row.status
          : 'queued',
      messageBody: String(row.message_body || ''),
      provider: row.provider ? String(row.provider) : undefined,
      errorMessage: row.error_message ? String(row.error_message) : undefined,
      acknowledgedAt: row.acknowledged_at ? String(row.acknowledged_at) : undefined,
      createdAt: String(row.created_at || new Date().toISOString()),
    };
  }

  private async recordPastoralCareDispatch(
    organizationId: string,
    input: {
      dispatchType: PastoralCareDispatchType;
      serviceEventId?: string;
      serviceName?: string;
      followupTaskId?: string;
      memberId?: string;
      memberName: string;
      recipientName: string;
      recipientRole?: string;
      recipientPhone?: string;
      recipientEmail?: string;
      channel: PastoralCareDispatchChannel;
      status: PastoralCareDispatchStatus;
      messageBody: string;
      provider?: string;
      errorMessage?: string;
    }
  ): Promise<PastoralCareDispatch> {
    const orgId = (organizationId || '').trim().toLowerCase();
    const nowIso = new Date().toISOString();
    const record: PastoralCareDispatch = {
      id: randomUUID(),
      organizationId: orgId,
      dispatchType: input.dispatchType,
      serviceEventId: input.serviceEventId,
      serviceName: input.serviceName,
      followupTaskId: input.followupTaskId,
      memberId: input.memberId,
      memberName: input.memberName,
      recipientName: input.recipientName,
      recipientRole: input.recipientRole,
      recipientPhone: input.recipientPhone,
      recipientEmail: input.recipientEmail,
      channel: input.channel,
      status: input.status,
      messageBody: input.messageBody,
      provider: input.provider,
      errorMessage: input.errorMessage,
      createdAt: nowIso,
    };

    const sb = this.activeSupabase;
    if (sb && UUID_REGEX.test(orgId)) {
      const insertRow: Record<string, unknown> = {
        id: record.id,
        organization_id: orgId,
        dispatch_type: record.dispatchType,
        service_event_id:
          record.serviceEventId && UUID_REGEX.test(record.serviceEventId)
            ? record.serviceEventId
            : null,
        service_name: record.serviceName || null,
        followup_task_id:
          record.followupTaskId && UUID_REGEX.test(record.followupTaskId)
            ? record.followupTaskId
            : null,
        member_id: record.memberId && UUID_REGEX.test(record.memberId) ? record.memberId : null,
        member_name: record.memberName,
        recipient_name: record.recipientName,
        recipient_role: record.recipientRole || null,
        recipient_phone: record.recipientPhone || null,
        recipient_email: record.recipientEmail || null,
        channel: record.channel,
        status: record.status,
        message_body: record.messageBody,
        provider: record.provider || null,
        error_message: record.errorMessage || null,
        created_at: nowIso,
      };

      const { data, error } = await sb
        .from('pastoral_care_dispatches')
        .insert(insertRow)
        .select('*')
        .single();

      if (!error && data) {
        return this.mapSupabaseDispatchRow(data);
      }

      if (error && this.isMissingPastoralAutomationTableError(error)) {
        // Fallback into organizations.settings._pastoral_dispatches if migration hasn't been applied yet
        const { data: orgRow } = await sb
          .from('organizations')
          .select('settings')
          .eq('id', orgId)
          .maybeSingle();
        const existingSettings =
          orgRow?.settings && typeof orgRow.settings === 'object'
            ? (orgRow.settings as Record<string, any>)
            : {};
        const prevList = Array.isArray(existingSettings._pastoral_dispatches)
          ? existingSettings._pastoral_dispatches
          : [];
        const nextList = [record, ...prevList].slice(0, 250);
        await sb
          .from('organizations')
          .update({
            settings: { ...existingSettings, _pastoral_dispatches: nextList },
            updated_at: nowIso,
          })
          .eq('id', orgId);
        return record;
      }
    }

    const memList = this.dispatchesByOrg.get(orgId) || [];
    this.dispatchesByOrg.set(orgId, [record, ...memList].slice(0, 250));
    return record;
  }

  public async listPastoralCareDispatches(
    organizationId: string,
    limit: number = 150
  ): Promise<PastoralCareDispatch[]> {
    this.assertDatabaseAvailable();
    const orgId = (organizationId || '').trim().toLowerCase();
    if (!orgId) return [];

    const sb = this.activeSupabase;
    if (sb && UUID_REGEX.test(orgId)) {
      const { data, error } = await sb
        .from('pastoral_care_dispatches')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (!error && Array.isArray(data)) {
        return data.map((r) => this.mapSupabaseDispatchRow(r));
      }

      if (error && this.isMissingPastoralAutomationTableError(error)) {
        const { data: orgRow } = await sb
          .from('organizations')
          .select('settings')
          .eq('id', orgId)
          .maybeSingle();
        const raw =
          orgRow?.settings && typeof orgRow.settings === 'object'
            ? (orgRow.settings as Record<string, any>)
            : {};
        const list = Array.isArray(raw._pastoral_dispatches) ? raw._pastoral_dispatches : [];
        return list.slice(0, limit);
      }
    }

    return (this.dispatchesByOrg.get(orgId) || []).slice(0, limit);
  }

  private async getProcessedAbsenceEventIds(orgId: string): Promise<string[]> {
    const sb = this.activeSupabase;
    if (sb && UUID_REGEX.test(orgId)) {
      const { data, error } = await sb
        .from('service_absence_runs')
        .select('event_id')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(200);
      if (!error && Array.isArray(data)) {
        return data.map((r: any) => String(r.event_id));
      }
      if (error && this.isMissingPastoralAutomationTableError(error)) {
        const { data: orgRow } = await sb
          .from('organizations')
          .select('settings')
          .eq('id', orgId)
          .maybeSingle();
        const raw =
          orgRow?.settings && typeof orgRow.settings === 'object'
            ? (orgRow.settings as Record<string, any>)
            : {};
        return Array.isArray(raw._processed_absence_events)
          ? raw._processed_absence_events.map(String)
          : [];
      }
    }
    const memMap = this.absenceRunsByOrg.get(orgId);
    return memMap ? Array.from(memMap.keys()) : [];
  }

  private async markAbsenceEventProcessed(
    orgId: string,
    summary: {
      eventId: string;
      eventName: string;
      triggerSource: string;
      absentMembersCount: number;
      memberMessagesSent: number;
      tasksCreatedCount: number;
      leaderRemindersSent: number;
      triggeredBy?: string;
    }
  ): Promise<void> {
    const nowIso = new Date().toISOString();
    const sb = this.activeSupabase;
    if (sb && UUID_REGEX.test(orgId) && UUID_REGEX.test(summary.eventId)) {
      const { error } = await sb.from('service_absence_runs').upsert(
        {
          organization_id: orgId,
          event_id: summary.eventId,
          event_name: summary.eventName,
          trigger_source: summary.triggerSource,
          absent_members_count: summary.absentMembersCount,
          member_messages_sent: summary.memberMessagesSent,
          tasks_created_count: summary.tasksCreatedCount,
          leader_reminders_sent: summary.leaderRemindersSent,
          triggered_by: summary.triggeredBy || null,
          created_at: nowIso,
        },
        { onConflict: 'organization_id,event_id' }
      );
      if (!error) return;
      if (this.isMissingPastoralAutomationTableError(error)) {
        const { data: orgRow } = await sb
          .from('organizations')
          .select('settings')
          .eq('id', orgId)
          .maybeSingle();
        const existingSettings =
          orgRow?.settings && typeof orgRow.settings === 'object'
            ? (orgRow.settings as Record<string, any>)
            : {};
        const prev = Array.isArray(existingSettings._processed_absence_events)
          ? existingSettings._processed_absence_events.map(String)
          : [];
        const next = Array.from(new Set([summary.eventId, ...prev])).slice(0, 200);
        await sb
          .from('organizations')
          .update({
            settings: { ...existingSettings, _processed_absence_events: next },
            updated_at: nowIso,
          })
          .eq('id', orgId);
        return;
      }
    }

    const memMap = this.absenceRunsByOrg.get(orgId) || new Map();
    memMap.set(summary.eventId, {
      eventId: summary.eventId,
      eventName: summary.eventName,
      processedAt: nowIso,
    });
    this.absenceRunsByOrg.set(orgId, memMap);
  }

  public async processServiceAbsenceSweep(
    organizationId: string,
    opts?: {
      eventId?: string;
      force?: boolean;
      triggerSource?: string;
      actorName?: string;
    }
  ): Promise<ServiceAbsenceSweepResult> {
    this.assertDatabaseAvailable();
    const orgId = (organizationId || '').trim().toLowerCase();
    const events = await this.getEvents(orgId);

    const targetEvent = opts?.eventId
      ? events.find((e) => String(e.id) === String(opts.eventId))
      : events.find((e) => {
          const st = String(e.status || '').toLowerCase();
          return st === 'closed' || st === 'completed';
        }) || events[0];

    if (!targetEvent) {
      const allTasks = await this.listFollowupTasks(orgId);
      return {
        success: true,
        eventId: '',
        eventName: 'No service scheduled',
        absentMembersCount: 0,
        memberMessagesSent: 0,
        memberMessagesAttempted: 0,
        tasksCreatedCount: 0,
        leaderRemindersSent: 0,
        leaderRemindersAttempted: 0,
        dispatches: [],
        allTasks,
        message: 'No worship service found to evaluate absences.',
      };
    }

    const eventId = String(targetEvent.id);
    const eventName = String(targetEvent.name || 'Worship Service');
    const processedIds = await this.getProcessedAbsenceEventIds(orgId);

    if (!opts?.force && processedIds.includes(eventId)) {
      const [allTasks, existingDispatches] = await Promise.all([
        this.listFollowupTasks(orgId),
        this.listPastoralCareDispatches(orgId, 60),
      ]);
      return {
        success: true,
        alreadyProcessed: true,
        eventId,
        eventName,
        absentMembersCount: 0,
        memberMessagesSent: 0,
        memberMessagesAttempted: 0,
        tasksCreatedCount: 0,
        leaderRemindersSent: 0,
        leaderRemindersAttempted: 0,
        dispatches: existingDispatches.filter((d) => d.serviceEventId === eventId),
        allTasks,
        message: `Absence sweep already completed for "${eventName}".`,
      };
    }

    const [membersRaw, checkins, settingsRes, churchGroups, existingTasks, arkeselResolved] =
      await Promise.all([
        this.getMembers(orgId),
        this.getLiveCheckins(orgId, eventId),
        this.getSystemSettings(orgId),
        this.listChurchGroups(orgId),
        this.listFollowupTasks(orgId),
        this.getResolvedArkeselApiKey(orgId),
      ]);

    const settings = settingsRes.settings;
    const presentIds = new Set(checkins.map((c) => String(c.personId)));

    // 1. Update consecutive absence streaks accurately across active members
    const updatedMembers: Person[] = [];
    const absentMembers: Array<{ member: Person; newStreak: number }> = [];

    for (const raw of membersRaw) {
      const m = raw as unknown as Person;
      const status = String(m.status || 'member').toLowerCase();
      if (status === 'inactive' || status === 'transferred' || status === 'deceased' || status === 'visitor') {
        updatedMembers.push(m);
        continue;
      }

      if (presentIds.has(String(m.id))) {
        if (Number(m.consecutiveAbsences || 0) > 0) {
          await this.updateMember(orgId, String(m.id), { consecutiveAbsences: 0 }).catch(() => {});
        }
        updatedMembers.push({ ...m, consecutiveAbsences: 0 });
      } else {
        const nextStreak = (Number(m.consecutiveAbsences || 0) || 0) + 1;
        await this.updateMember(orgId, String(m.id), { consecutiveAbsences: nextStreak }).catch(() => {});
        const updated = { ...m, consecutiveAbsences: nextStreak };
        updatedMembers.push(updated);
        absentMembers.push({ member: updated, newStreak: nextStreak });
      }
    }

    // 2. Automatically send caring messages to absent members
    const dispatches: PastoralCareDispatch[] = [];
    let memberMessagesSent = 0;
    let memberMessagesAttempted = 0;

    if (settings.autoMessageAbsentMembers !== false && absentMembers.length > 0) {
      const channelPref = settings.absentMemberMessageChannel || 'sms_and_email';
      const resendConfigured = Boolean((process.env.RESEND_API_KEY || '').trim());
      const arkeselConfigured = Boolean(arkeselResolved.apiKey);
      const churchDisplay = settings.churchName || 'Your Church Family';
      const churchContactPhone = settings.contactPhone || 'our pastoral desk';

      for (const { member, newStreak } of absentMembers) {
        const fullName = getMemberFullName(member) || 'Beloved Member';
        const messageBody = this.renderAbsentMemberMessage(
          settings.absentMemberMessageTemplate || DEFAULT_ABSENT_MEMBER_MESSAGE_TEMPLATE,
          {
            firstName: member.firstName || fullName.split(' ')[0] || 'Friend',
            fullName,
            serviceName: eventName,
            churchName: churchDisplay,
            missedCount: newStreak,
            contactPhone: churchContactPhone,
          }
        );

        const explicitConsent = await this.getExplicitMemberConsentRecord(
          orgId,
          String(member.id),
          member.email
        );

        const wantsSms = channelPref === 'sms' || channelPref === 'sms_and_email';
        const wantsEmail = channelPref === 'email' || channelPref === 'sms_and_email';
        const phone = member.phoneE164 || member.phoneNumber || '';
        const normalizedMsisdn = normalizeArkeselPhone(phone);
        const email = (member.email || '').trim().toLowerCase();
        let deliveredToThisMember = false;

        if (wantsSms) {
          memberMessagesAttempted++;
          if (explicitConsent && explicitConsent.sms === false) {
            dispatches.push(
              await this.recordPastoralCareDispatch(orgId, {
                dispatchType: 'absent_member_alert',
                serviceEventId: eventId,
                serviceName: eventName,
                memberId: String(member.id),
                memberName: fullName,
                recipientName: fullName,
                recipientRole: 'Member',
                recipientPhone: phone || undefined,
                channel: 'sms',
                status: 'skipped_opt_out',
                messageBody,
                provider: 'Arkesel SMS',
                errorMessage: 'Member opted out of SMS notifications.',
              })
            );
          } else if (!normalizedMsisdn) {
            dispatches.push(
              await this.recordPastoralCareDispatch(orgId, {
                dispatchType: 'absent_member_alert',
                serviceEventId: eventId,
                serviceName: eventName,
                memberId: String(member.id),
                memberName: fullName,
                recipientName: fullName,
                recipientRole: 'Member',
                channel: 'sms',
                status: 'skipped_no_contact',
                messageBody,
                provider: 'Arkesel SMS',
                errorMessage: 'No valid mobile phone number on member profile.',
              })
            );
          } else if (!arkeselConfigured) {
            dispatches.push(
              await this.recordPastoralCareDispatch(orgId, {
                dispatchType: 'absent_member_alert',
                serviceEventId: eventId,
                serviceName: eventName,
                memberId: String(member.id),
                memberName: fullName,
                recipientName: fullName,
                recipientRole: 'Member',
                recipientPhone: phone,
                channel: 'sms',
                status: 'skipped_unconfigured',
                messageBody,
                provider: 'Arkesel SMS',
                errorMessage: 'Tenant Arkesel API key not configured yet.',
              })
            );
          } else {
            const smsRes = await sendArkeselSms({
              apiKey: arkeselResolved.apiKey,
              senderId: settings.smsSenderId,
              recipients: [normalizedMsisdn],
              message: messageBody,
            });
            if (smsRes.ok) {
              deliveredToThisMember = true;
            }
            dispatches.push(
              await this.recordPastoralCareDispatch(orgId, {
                dispatchType: 'absent_member_alert',
                serviceEventId: eventId,
                serviceName: eventName,
                memberId: String(member.id),
                memberName: fullName,
                recipientName: fullName,
                recipientRole: 'Member',
                recipientPhone: phone,
                channel: 'sms',
                status: smsRes.ok ? 'sent' : 'failed',
                messageBody,
                provider: 'Arkesel SMS',
                errorMessage: smsRes.ok ? undefined : smsRes.message,
              })
            );
          }
        }

        if (wantsEmail && email) {
          memberMessagesAttempted++;
          if (explicitConsent && explicitConsent.email === false) {
            dispatches.push(
              await this.recordPastoralCareDispatch(orgId, {
                dispatchType: 'absent_member_alert',
                serviceEventId: eventId,
                serviceName: eventName,
                memberId: String(member.id),
                memberName: fullName,
                recipientName: fullName,
                recipientRole: 'Member',
                recipientEmail: email,
                channel: 'email',
                status: 'skipped_opt_out',
                messageBody,
                provider: 'Resend Email',
                errorMessage: 'Member opted out of Email notifications.',
              })
            );
          } else if (!resendConfigured) {
            if (!wantsSms) {
              dispatches.push(
                await this.recordPastoralCareDispatch(orgId, {
                  dispatchType: 'absent_member_alert',
                  serviceEventId: eventId,
                  serviceName: eventName,
                  memberId: String(member.id),
                  memberName: fullName,
                  recipientName: fullName,
                  recipientRole: 'Member',
                  recipientEmail: email,
                  channel: 'email',
                  status: 'skipped_unconfigured',
                  messageBody,
                  provider: 'Resend Email',
                  errorMessage: 'Email gateway API key not configured.',
                })
              );
            }
          } else {
            const emailRes = await sendResendEmail({
              fromEmail: settings.emailFromAddress || undefined,
              fromName: settings.emailSenderName || settings.churchName || undefined,
              organizationName: settings.churchName || undefined,
              to: [email],
              subject: `We missed you at ${eventName} · ${churchDisplay}`,
              text: messageBody,
              replyTo: settings.contactEmail || undefined,
            });
            if (emailRes.ok) {
              deliveredToThisMember = true;
            }
            dispatches.push(
              await this.recordPastoralCareDispatch(orgId, {
                dispatchType: 'absent_member_alert',
                serviceEventId: eventId,
                serviceName: eventName,
                memberId: String(member.id),
                memberName: fullName,
                recipientName: fullName,
                recipientRole: 'Member',
                recipientEmail: email,
                channel: 'email',
                status: emailRes.ok ? 'sent' : 'failed',
                messageBody,
                provider: 'Resend Email',
                errorMessage: emailRes.ok ? undefined : emailRes.message,
              })
            );
          }
        }

        if (deliveredToThisMember) {
          memberMessagesSent++;
        }
      }
    }

    // 3. Auto-assign follow-up tasks for absentees reaching threshold + dispatch leader reminders
    const plan = buildAutoAssignAbsenteesPlan({
      members: updatedMembers,
      churchGroups,
      existingTasks,
      systemSettings: settings,
      fallbackActorName: opts?.actorName || settings.seniorPastor || 'Pastoral Care Team',
    });

    const createdTasks: FollowupTask[] = [];
    for (const item of plan) {
      const leaderMember = updatedMembers.find(
        (m) =>
          (item.assignedToMemberId && String(m.id) === String(item.assignedToMemberId)) ||
          getMemberFullName(m).toLowerCase() === normalizeSettingLabel(item.assignedToName).toLowerCase()
      );
      const leaderEmail = leaderMember?.email || undefined;
      const created = await this.createFollowupTask(orgId, {
        personId: item.personId,
        personName: item.personName,
        personPhone: item.personPhone,
        personEmail: item.personEmail,
        groupName: item.groupName,
        reason: item.reason,
        assignedToName: item.assignedToName,
        assignedToMemberId: item.assignedToMemberId,
        assignedToRole: item.assignedToRole,
        assignedToPhone: item.assignedToPhone,
        assignedToEmail: leaderEmail,
        autoAssigned: true,
        serviceEventId: eventId,
        serviceName: eventName,
        dueOn: item.dueOn,
        notes: `${item.notes} Service: ${eventName}.`,
      });
      createdTasks.push(created);
    }

    let leaderRemindersSent = 0;
    let leaderRemindersAttempted = 0;
    if (settings.autoSendLeaderCareReminders !== false) {
      const targetTaskIds = createdTasks.map((t) => t.id);
      if (targetTaskIds.length > 0) {
        const remRes = await this.sendPendingLeaderCareReminders(orgId, {
          taskIds: targetTaskIds,
          serviceEventId: eventId,
          serviceName: eventName,
          actorName: opts?.actorName || 'Pastoral Care Automation',
        });
        leaderRemindersSent = remRes.sentCount;
        leaderRemindersAttempted = remRes.attemptedCount;
        dispatches.push(...remRes.dispatches);
      }
    }

    await this.markAbsenceEventProcessed(orgId, {
      eventId,
      eventName,
      triggerSource: opts?.triggerSource || 'service_closed',
      absentMembersCount: absentMembers.length,
      memberMessagesSent,
      tasksCreatedCount: createdTasks.length,
      leaderRemindersSent,
      triggeredBy: opts?.actorName,
    });

    const allTasks = await this.listFollowupTasks(orgId);
    const summaryMsg =
      absentMembers.length === 0
        ? `Service "${eventName}" closed: all active members checked in.`
        : `Service "${eventName}" absence care completed: ${absentMembers.length} absent member(s), ${memberMessagesSent} member alert(s) sent, ${createdTasks.length} care task(s) created, ${leaderRemindersSent} leader reminder(s) delivered.`;

    return {
      success: true,
      eventId,
      eventName,
      absentMembersCount: absentMembers.length,
      memberMessagesSent,
      memberMessagesAttempted,
      tasksCreatedCount: createdTasks.length,
      leaderRemindersSent,
      leaderRemindersAttempted,
      dispatches,
      allTasks,
      message: summaryMsg,
    };
  }

  public async sendPendingLeaderCareReminders(
    organizationId: string,
    opts?: {
      taskId?: string;
      taskIds?: string[];
      leaderName?: string;
      serviceEventId?: string;
      serviceName?: string;
      actorName?: string;
    }
  ): Promise<{
    sentCount: number;
    attemptedCount: number;
    dispatches: PastoralCareDispatch[];
    allTasks: FollowupTask[];
  }> {
    this.assertDatabaseAvailable();
    const orgId = (organizationId || '').trim().toLowerCase();
    const [allTasks, orgMembers, churchGroups, settingsRes, arkeselResolved] = await Promise.all([
      this.listFollowupTasks(orgId),
      this.getMembers(orgId),
      this.listChurchGroups(orgId).catch(() => [] as ChurchGroup[]),
      this.getSystemSettings(orgId),
      this.getResolvedArkeselApiKey(orgId),
    ]);

    const settings = settingsRes.settings;
    const resendConfigured = Boolean((process.env.RESEND_API_KEY || '').trim());
    const arkeselConfigured = Boolean(arkeselResolved.apiKey);

    let targetTasks = allTasks.filter((t) => t.status === 'open' || t.status === 'contacted');
    if (opts?.taskId) {
      targetTasks = targetTasks.filter((t) => t.id === opts.taskId);
    } else if (Array.isArray(opts?.taskIds) && opts!.taskIds.length > 0) {
      const idSet = new Set(opts!.taskIds);
      targetTasks = targetTasks.filter((t) => idSet.has(t.id));
    } else if (opts?.leaderName) {
      const targetLeader = normalizeSettingLabel(opts.leaderName).toLowerCase();
      targetTasks = targetTasks.filter(
        (t) => normalizeSettingLabel(t.assignedToName).toLowerCase() === targetLeader
      );
    }

    if (targetTasks.length === 0) {
      return { sentCount: 0, attemptedCount: 0, dispatches: [], allTasks };
    }

    // Consolidate by assigned leader so a leader receives one crisp pastoral reminder covering all pending cases
    const byLeader = new Map<string, FollowupTask[]>();
    for (const t of targetTasks) {
      const key = normalizeSettingLabel(t.assignedToName).toLowerCase() || 'pastoral_care_team';
      const arr = byLeader.get(key) || [];
      arr.push(t);
      byLeader.set(key, arr);
    }

    const dispatches: PastoralCareDispatch[] = [];
    let sentCount = 0;
    let attemptedCount = 0;
    const nowIso = new Date().toISOString();

    for (const groupTasks of byLeader.values()) {
      const primaryTask = groupTasks[0];
      const leaderName = primaryTask.assignedToName || 'Pastoral Care Leader';
      const leaderRole = primaryTask.assignedToRole || 'Leader in Charge';
      const leaderMember = orgMembers.find(
        (m) =>
          (primaryTask.assignedToMemberId && String(m.id) === String(primaryTask.assignedToMemberId)) ||
          `${String(m.firstName || '')} ${String(m.lastName || '')}`.trim().toLowerCase() ===
            normalizeSettingLabel(leaderName).toLowerCase()
      );
      const leaderGroup = churchGroups.find(
        (g) => normalizeSettingLabel(g.leaderName).toLowerCase() === normalizeSettingLabel(leaderName).toLowerCase()
      );

      const leaderPhone =
        primaryTask.assignedToPhone ||
        (leaderMember?.phoneE164 ? String(leaderMember.phoneE164) : undefined) ||
        leaderGroup?.leaderPhone ||
        undefined;
      const leaderEmail =
        primaryTask.assignedToEmail ||
        (leaderMember?.email ? String(leaderMember.email) : undefined) ||
        leaderGroup?.leaderEmail ||
        undefined;

      const memberSummaries = groupTasks
        .slice(0, 5)
        .map((t) => `${t.personName}${t.personPhone ? ` (${t.personPhone})` : ''}`)
        .join(', ');
      const extraCount = groupTasks.length > 5 ? ` +${groupTasks.length - 5} more` : '';
      const churchLabel = settings.churchName || 'Ekklesphere Church';
      const serviceCtx =
        opts?.serviceName || primaryTask.serviceName
          ? ` after ${opts?.serviceName || primaryTask.serviceName}`
          : '';
      const reminderMessage = `Pastoral Care Reminder (${churchLabel}): Dear ${leaderName}, please follow up with ${groupTasks.length} member${
        groupTasks.length === 1 ? '' : 's'
      } needing care${serviceCtx}: ${memberSummaries}${extraCount}. Due: ${primaryTask.dueOn}.`;

      attemptedCount++;
      let deliveredExternally = false;
      const normalizedPhone = normalizeArkeselPhone(leaderPhone);

      if (normalizedPhone) {
        if (arkeselConfigured) {
          const smsRes = await sendArkeselSms({
            apiKey: arkeselResolved.apiKey,
            senderId: settings.smsSenderId,
            recipients: [normalizedPhone],
            message: reminderMessage,
          });
          if (smsRes.ok) deliveredExternally = true;
          dispatches.push(
            await this.recordPastoralCareDispatch(orgId, {
              dispatchType: 'leader_reminder',
              serviceEventId: opts?.serviceEventId || primaryTask.serviceEventId,
              serviceName: opts?.serviceName || primaryTask.serviceName,
              followupTaskId: primaryTask.id,
              memberId: primaryTask.personId,
              memberName:
                groupTasks.length === 1
                  ? primaryTask.personName
                  : `${groupTasks.length} Members`,
              recipientName: leaderName,
              recipientRole: leaderRole,
              recipientPhone: leaderPhone,
              recipientEmail: leaderEmail,
              channel: 'sms',
              status: smsRes.ok ? 'sent' : 'failed',
              messageBody: reminderMessage,
              provider: 'Arkesel SMS',
              errorMessage: smsRes.ok ? undefined : smsRes.message,
            })
          );
        } else {
          dispatches.push(
            await this.recordPastoralCareDispatch(orgId, {
              dispatchType: 'leader_reminder',
              serviceEventId: opts?.serviceEventId || primaryTask.serviceEventId,
              serviceName: opts?.serviceName || primaryTask.serviceName,
              followupTaskId: primaryTask.id,
              memberId: primaryTask.personId,
              memberName:
                groupTasks.length === 1
                  ? primaryTask.personName
                  : `${groupTasks.length} Members`,
              recipientName: leaderName,
              recipientRole: leaderRole,
              recipientPhone: leaderPhone,
              channel: 'sms',
              status: 'skipped_unconfigured',
              messageBody: reminderMessage,
              provider: 'Arkesel SMS',
              errorMessage: 'Tenant Arkesel API key not configured; delivered in-app reminder.',
            })
          );
        }
      }

      if (leaderEmail && resendConfigured) {
        const emailRes = await sendResendEmail({
          fromEmail: settings.emailFromAddress || undefined,
          fromName: settings.emailSenderName || settings.churchName || undefined,
          organizationName: settings.churchName || undefined,
          to: [leaderEmail],
          subject: `Pastoral Care Reminder: ${groupTasks.length} Member${
            groupTasks.length === 1 ? '' : 's'
          } Assigned (${churchLabel})`,
          text: reminderMessage,
          replyTo: settings.contactEmail || undefined,
        });
        if (emailRes.ok) deliveredExternally = true;
        dispatches.push(
          await this.recordPastoralCareDispatch(orgId, {
            dispatchType: 'leader_reminder',
            serviceEventId: opts?.serviceEventId || primaryTask.serviceEventId,
            serviceName: opts?.serviceName || primaryTask.serviceName,
            followupTaskId: primaryTask.id,
            memberId: primaryTask.personId,
            memberName:
              groupTasks.length === 1
                ? primaryTask.personName
                : `${groupTasks.length} Members`,
            recipientName: leaderName,
            recipientRole: leaderRole,
            recipientPhone: leaderPhone,
            recipientEmail: leaderEmail,
            channel: 'email',
            status: emailRes.ok ? 'sent' : 'failed',
            messageBody: reminderMessage,
            provider: 'Resend Email',
            errorMessage: emailRes.ok ? undefined : emailRes.message,
          })
        );
      }

      // Always post an in-app pastoral reminder notification for the leader's queue
      dispatches.push(
        await this.recordPastoralCareDispatch(orgId, {
          dispatchType: 'leader_reminder',
          serviceEventId: opts?.serviceEventId || primaryTask.serviceEventId,
          serviceName: opts?.serviceName || primaryTask.serviceName,
          followupTaskId: primaryTask.id,
          memberId: primaryTask.personId,
          memberName:
            groupTasks.length === 1 ? primaryTask.personName : `${groupTasks.length} Members`,
          recipientName: leaderName,
          recipientRole: leaderRole,
          recipientPhone: leaderPhone,
          recipientEmail: leaderEmail,
          channel: 'in_app',
          status: 'sent',
          messageBody: reminderMessage,
          provider: deliveredExternally ? 'In-App + Gateway' : 'Ekklesphere Portal Alert',
        })
      );
      sentCount++;

      for (const task of groupTasks) {
        await this.updateFollowupTask(orgId, task.id, {
          lastReminderAt: nowIso,
          reminderCount: (task.reminderCount || 0) + 1,
        }).catch(() => {});
      }
    }

    const refreshedTasks = await this.listFollowupTasks(orgId);
    return {
      sentCount,
      attemptedCount,
      dispatches,
      allTasks: refreshedTasks,
    };
  }

  public async acknowledgeLeaderCareTask(
    organizationId: string,
    taskId: string,
    actor?: { name?: string; role?: string }
  ): Promise<FollowupTask> {
    const nowIso = new Date().toISOString();
    const tasks = await this.listFollowupTasks(organizationId);
    const current = tasks.find((t) => t.id === taskId);
    if (!current) {
      const err: any = new Error('Follow-up task not found.');
      err.status = 404;
      throw err;
    }
    const nextStatus: FollowupStatus = current.status === 'open' ? 'contacted' : current.status;
    return this.updateFollowupTask(organizationId, taskId, {
      status: nextStatus,
      acknowledgedAt: nowIso,
      outcome:
        current.outcome ||
        `Reminder acknowledged by ${actor?.name || current.assignedToName} (${new Date().toLocaleDateString()})`,
    });
  }

  public async getPastoralCareMonitorSummary(
    organizationId: string
  ): Promise<PastoralCareMonitorSummary> {
    this.assertDatabaseAvailable();
    const orgId = (organizationId || '').trim().toLowerCase();
    const [tasks, dispatches, processedEventIds, orgMembers, churchGroups] = await Promise.all([
      this.listFollowupTasks(orgId),
      this.listPastoralCareDispatches(orgId, 200),
      this.getProcessedAbsenceEventIds(orgId),
      this.getMembers(orgId),
      this.listChurchGroups(orgId).catch(() => [] as ChurchGroup[]),
    ]);

    const openTasksCount = tasks.filter((t) => t.status === 'open').length;
    const contactedTasksCount = tasks.filter((t) => t.status === 'contacted').length;
    const resolvedTasksCount = tasks.filter((t) => t.status === 'resolved').length;
    const totalTrackable = openTasksCount + contactedTasksCount + resolvedTasksCount;
    const resolutionRatePct =
      totalTrackable > 0 ? Math.round((resolvedTasksCount / totalTrackable) * 100) : 100;

    const absentMemberMessagesSent = dispatches.filter(
      (d) => d.dispatchType === 'absent_member_alert' && d.status === 'sent'
    ).length;
    const leaderRemindersSent = dispatches.filter(
      (d) => d.dispatchType === 'leader_reminder' && d.status === 'sent'
    ).length;

    const scorecardMap = new Map<string, LeaderAccountabilityRow>();
    for (const task of tasks) {
      const leaderName = (task.assignedToName || 'Pastoral Care Team').trim();
      const key = leaderName.toLowerCase();
      const leaderMember = orgMembers.find(
        (m) =>
          (task.assignedToMemberId && String(m.id) === String(task.assignedToMemberId)) ||
          `${String(m.firstName || '')} ${String(m.lastName || '')}`.trim().toLowerCase() === key
      );
      const leaderGroup = churchGroups.find(
        (g) => normalizeSettingLabel(g.leaderName).toLowerCase() === key
      );
      const existing = scorecardMap.get(key) || {
        leaderName,
        leaderMemberId:
          task.assignedToMemberId || (leaderMember ? String(leaderMember.id) : undefined),
        leaderRole:
          task.assignedToRole ||
          (leaderMember ? getMemberPortfolio(leaderMember as unknown as Person) : undefined) ||
          (leaderGroup ? 'Group Leader' : 'Pastoral Care'),
        leaderPhone:
          task.assignedToPhone ||
          (leaderMember?.phoneE164 ? String(leaderMember.phoneE164) : undefined) ||
          leaderGroup?.leaderPhone ||
          undefined,
        leaderEmail:
          task.assignedToEmail ||
          (leaderMember?.email ? String(leaderMember.email) : undefined) ||
          leaderGroup?.leaderEmail ||
          undefined,
        openCount: 0,
        contactedCount: 0,
        resolvedCount: 0,
        totalAssigned: 0,
        remindersSent: 0,
        lastReminderAt: null,
      };

      if (task.status === 'open') existing.openCount += 1;
      else if (task.status === 'contacted') existing.contactedCount += 1;
      else if (task.status === 'resolved') existing.resolvedCount += 1;
      existing.totalAssigned += 1;
      existing.remindersSent += Number(task.reminderCount || 0);
      if (
        task.lastReminderAt &&
        (!existing.lastReminderAt || task.lastReminderAt > existing.lastReminderAt)
      ) {
        existing.lastReminderAt = task.lastReminderAt;
      }

      scorecardMap.set(key, existing);
    }

    const leaderScorecard = Array.from(scorecardMap.values()).sort(
      (a, b) =>
        b.openCount + b.contactedCount - (a.openCount + a.contactedCount) ||
        b.totalAssigned - a.totalAssigned
    );

    return {
      tasks,
      dispatches,
      processedEventIds,
      leaderScorecard,
      stats: {
        openTasksCount,
        contactedTasksCount,
        resolvedTasksCount,
        resolutionRatePct,
        absentMemberMessagesSent,
        leaderRemindersSent,
        totalDispatches: dispatches.length,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  public async listLeaderAssignedReminders(
    organizationId: string,
    actor: { userId?: string; name?: string; email?: string }
  ): Promise<{ tasks: FollowupTask[]; dispatches: PastoralCareDispatch[] }> {
    this.assertDatabaseAvailable();
    const orgId = (organizationId || '').trim().toLowerCase();
    const [tasks, dispatches, profile] = await Promise.all([
      this.listFollowupTasks(orgId),
      this.listPastoralCareDispatches(orgId, 100),
      actor.userId
        ? this.getMemberProfileForSession(orgId, actor.userId, actor.email).catch(() => null)
        : Promise.resolve(null),
    ]);

    const targetIds = new Set<string>(
      [actor.userId, profile?.id ? String(profile.id) : undefined].filter(Boolean) as string[]
    );
    const targetNames = new Set<string>(
      [
        actor.name,
        profile ? `${String(profile.firstName || '')} ${String(profile.lastName || '')}`.trim() : undefined,
      ]
        .map((n) => normalizeSettingLabel(n).toLowerCase())
        .filter(Boolean)
    );
    const cleanEmail = (actor.email || '').trim().toLowerCase();

    const myTasks = tasks.filter((t) => {
      if (t.assignedToMemberId && targetIds.has(String(t.assignedToMemberId))) return true;
      if (cleanEmail && t.assignedToEmail?.toLowerCase() === cleanEmail) return true;
      const assignedLower = normalizeSettingLabel(t.assignedToName).toLowerCase();
      return Boolean(assignedLower && targetNames.has(assignedLower));
    });

    const myTaskIds = new Set(myTasks.map((t) => t.id));
    const myDispatches = dispatches.filter(
      (d) =>
        d.dispatchType === 'leader_reminder' &&
        ((d.followupTaskId && myTaskIds.has(d.followupTaskId)) ||
          targetNames.has(normalizeSettingLabel(d.recipientName).toLowerCase()) ||
          (cleanEmail && d.recipientEmail?.toLowerCase() === cleanEmail))
    );

    return { tasks: myTasks, dispatches: myDispatches };
  }

  // ===========================================================================
  // MEMBER CONSENTS & EVENT RSVPS (ORG + USER SCOPED)
  // ===========================================================================

  public async getMemberConsents(
    organizationId: string,
    userId: string,
    email?: string
  ): Promise<{ autoCheckin: boolean; push: boolean; sms: boolean; email: boolean }> {
    this.assertDatabaseAvailable();
    const orgId = (organizationId || '').trim().toLowerCase();
    const defaultConsents = { autoCheckin: true, push: true, sms: false, email: true };
    if (!orgId || !userId) return defaultConsents;

    if (this.supabase) {
      if (!UUID_REGEX.test(orgId)) return defaultConsents;
      const { data, error } = await this.supabase
        .from('member_consents')
        .select('*')
        .eq('organization_id', orgId)
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        if (/does not exist|schema cache|42P01|PGRST205/i.test(error.message || '')) {
          return defaultConsents;
        }
        throw new Error(`Failed to fetch member consents from Supabase: ${error.message}`);
      }
      if (data) {
        return {
          autoCheckin: Boolean(data.auto_checkin),
          push: Boolean(data.push),
          sms: Boolean(data.sms),
          email: Boolean(data.email),
        };
      }
      const profile = await this.getMemberProfileForSession(orgId, userId, email);
      return {
        ...defaultConsents,
        autoCheckin: profile?.autoCheckinOptedIn !== undefined ? Boolean(profile.autoCheckinOptedIn) : true,
      };
    }

    const byOrg = this.memberConsentsByOrg.get(orgId) || {};
    if (byOrg[userId]) {
      const { autoCheckin, push, sms, email: emailConsent } = byOrg[userId];
      return { autoCheckin, push, sms, email: emailConsent };
    }
    const profile = await this.getMemberProfileForSession(orgId, userId, email);
    return {
      ...defaultConsents,
      autoCheckin: profile?.autoCheckinOptedIn !== undefined ? Boolean(profile.autoCheckinOptedIn) : true,
    };
  }

  public async upsertMemberConsents(
    organizationId: string,
    userId: string,
    email: string | undefined,
    consents: { autoCheckin: boolean; push: boolean; sms: boolean; email: boolean },
    fallbackName?: string
  ): Promise<{ autoCheckin: boolean; push: boolean; sms: boolean; email: boolean }> {
    this.assertDatabaseAvailable();
    const orgId = (organizationId || '').trim().toLowerCase();
    const profile = await this.getMemberProfileForSession(orgId, userId, email);
    const memberId = profile?.id ? String(profile.id) : undefined;
    const nowIso = new Date().toISOString();

    if (this.supabase) {
      if (!UUID_REGEX.test(orgId)) {
        throw new Error('Valid organisation ID is required to save consents.');
      }
      const memberUuid = memberId && UUID_REGEX.test(memberId) ? memberId : null;
      const { data, error } = await this.supabase
        .from('member_consents')
        .upsert(
          {
            organization_id: orgId,
            user_id: userId,
            member_id: memberUuid,
            auto_checkin: Boolean(consents.autoCheckin),
            push: Boolean(consents.push),
            sms: Boolean(consents.sms),
            email: Boolean(consents.email),
            updated_at: nowIso,
          },
          { onConflict: 'organization_id,user_id' }
        )
        .select('*')
        .single();

      if (error) {
        throw new Error(`Failed to persist member consents in Supabase: ${error.message}`);
      }

      if (memberUuid || email || fallbackName) {
        await this.updateOwnMemberProfile(
          orgId,
          userId,
          email,
          { autoCheckinOptedIn: Boolean(consents.autoCheckin) },
          fallbackName
        ).catch(() => {});
      }

      return {
        autoCheckin: Boolean(data.auto_checkin),
        push: Boolean(data.push),
        sms: Boolean(data.sms),
        email: Boolean(data.email),
      };
    }

    const byOrg = this.memberConsentsByOrg.get(orgId) || {};
    byOrg[userId] = {
      autoCheckin: Boolean(consents.autoCheckin),
      push: Boolean(consents.push),
      sms: Boolean(consents.sms),
      email: Boolean(consents.email),
      memberId,
      updatedAt: nowIso,
    };
    this.memberConsentsByOrg.set(orgId, byOrg);

    if (memberId) {
      await this.updateMember(orgId, memberId, {
        autoCheckinOptedIn: Boolean(consents.autoCheckin),
      }).catch(() => {});
    }

    return {
      autoCheckin: Boolean(consents.autoCheckin),
      push: Boolean(consents.push),
      sms: Boolean(consents.sms),
      email: Boolean(consents.email),
    };
  }

  public async listEventRsvps(organizationId: string, userId: string): Promise<Record<string, boolean>> {
    this.assertDatabaseAvailable();
    const orgId = (organizationId || '').trim().toLowerCase();
    if (!orgId || !userId) return {};

    if (this.supabase) {
      if (!UUID_REGEX.test(orgId)) return {};
      const { data, error } = await this.supabase
        .from('event_rsvps')
        .select('event_title, attending')
        .eq('organization_id', orgId)
        .eq('user_id', userId);

      if (error) {
        if (/does not exist|schema cache|42P01|PGRST205/i.test(error.message || '')) {
          return {};
        }
        throw new Error(`Failed to fetch event RSVPs from Supabase: ${error.message}`);
      }

      const map: Record<string, boolean> = {};
      for (const row of data || []) {
        if (row.event_title) {
          map[String(row.event_title)] = Boolean(row.attending);
        }
      }
      return map;
    }

    const byOrg = this.eventRsvpsByOrg.get(orgId) || {};
    const prefix = `${userId}::`;
    const result: Record<string, boolean> = {};
    for (const [k, val] of Object.entries(byOrg)) {
      if (k.startsWith(prefix)) {
        result[k.slice(prefix.length)] = val;
      }
    }
    return result;
  }

  public async upsertEventRsvp(
    organizationId: string,
    userId: string,
    email: string | undefined,
    input: { eventTitle: string; eventId?: string; attending: boolean }
  ): Promise<{ eventTitle: string; attending: boolean; rsvps: Record<string, boolean> }> {
    this.assertDatabaseAvailable();
    const orgId = (organizationId || '').trim().toLowerCase();
    const eventTitle = (input.eventTitle || '').trim();
    const profile = await this.getMemberProfileForSession(orgId, userId, email);
    const memberUuid = profile?.id && UUID_REGEX.test(String(profile.id)) ? String(profile.id) : null;
    const nowIso = new Date().toISOString();

    if (this.supabase) {
      if (!UUID_REGEX.test(orgId)) {
        throw new Error('Valid organisation ID is required to save event RSVPs.');
      }
      const { error } = await this.supabase
        .from('event_rsvps')
        .upsert(
          {
            organization_id: orgId,
            event_id: input.eventId || null,
            event_title: eventTitle,
            user_id: userId,
            member_id: memberUuid,
            attending: Boolean(input.attending),
            updated_at: nowIso,
          },
          { onConflict: 'organization_id,user_id,event_title' }
        );

      if (error) {
        throw new Error(`Failed to save event RSVP in Supabase: ${error.message}`);
      }
      const rsvps = await this.listEventRsvps(orgId, userId);
      return { eventTitle, attending: Boolean(input.attending), rsvps };
    }

    const byOrg = this.eventRsvpsByOrg.get(orgId) || {};
    byOrg[`${userId}::${eventTitle}`] = Boolean(input.attending);
    this.eventRsvpsByOrg.set(orgId, byOrg);
    const rsvps = await this.listEventRsvps(orgId, userId);
    return { eventTitle, attending: Boolean(input.attending), rsvps };
  }

  // ===========================================================================
  // ORGANISATION STAFF DIRECTORY & RBAC PROVISIONING (SUPABASE + AUTH)
  // ===========================================================================

  public async listOrganizationStaff(organizationId: string): Promise<
    Array<{
      id: string;
      memberId?: string;
      organizationId: string;
      email?: string;
      username?: string;
      phoneE164?: string;
      fullName: string;
      role: ChurchRole;
      status: 'active' | 'suspended';
      mustChangePassword: boolean;
      lastLoginAt: string | null;
      createdAt?: string;
    }>
  > {
    this.assertDatabaseAvailable();
    const cleanOrgId = (organizationId || '').trim().toLowerCase();
    if (!cleanOrgId) return [];

    const staffRoles = ['owner', 'admin', 'pastor', 'usher', 'group_leader', 'leader', 'finance', 'super_admin'];

    if (this.supabase) {
      if (!UUID_REGEX.test(cleanOrgId)) return [];
      const { data, error } = await this.supabase
        .from('account_credentials')
        .select(
          'id, member_id, organization_id, email, username, phone_e164, full_name, role, is_creator, status, last_login_at, created_at, must_change_password'
        )
        .eq('organization_id', cleanOrgId)
        .eq('is_creator', false)
        .in('role', staffRoles)
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(`Failed to load organisation staff accounts: ${error.message}`);
      }

      return (data || []).map((row) => ({
        id: String(row.id),
        memberId: row.member_id ? String(row.member_id) : undefined,
        organizationId: cleanOrgId,
        email: row.email ? String(row.email).toLowerCase() : undefined,
        username: row.username ? String(row.username).toLowerCase() : undefined,
        phoneE164: row.phone_e164 ? String(row.phone_e164) : undefined,
        fullName: String(row.full_name || 'Church Staff'),
        role:
          String(row.role || '').toLowerCase() === 'super_admin'
            ? 'super_admin'
            : mapSupabaseRoleToChurchRole(row.role),
        status: row.status === 'suspended' || row.status === 'locked' ? 'suspended' : 'active',
        mustChangePassword: Boolean(row.must_change_password),
        lastLoginAt: row.last_login_at ? String(row.last_login_at) : null,
        createdAt: row.created_at ? String(row.created_at) : undefined,
      }));
    }

    const result: Array<{
      id: string;
      memberId?: string;
      organizationId: string;
      email?: string;
      username?: string;
      phoneE164?: string;
      fullName: string;
      role: ChurchRole;
      status: 'active' | 'suspended';
      mustChangePassword: boolean;
      lastLoginAt: string | null;
      createdAt?: string;
    }> = [];

    for (const c of this.userCredentials.values()) {
      if (
        c.organizationId.toLowerCase() === cleanOrgId &&
        !c.isCreator &&
        ['admin', 'pastor', 'usher', 'group_leader', 'finance', 'super_admin'].includes(c.role)
      ) {
        result.push({
          id: c.id,
          memberId: c.memberId,
          organizationId: c.organizationId,
          email: c.email,
          username: c.username,
          phoneE164: c.phoneE164,
          fullName: c.name,
          role: c.role,
          status: c.status === 'suspended' || c.status === 'locked' ? 'suspended' : 'active',
          mustChangePassword: Boolean(c.mustChangePassword),
          lastLoginAt: null,
          createdAt: c.createdAt,
        });
      }
    }

    return result;
  }

  public async provisionOrganizationStaff(params: {
    organizationId: string;
    fullName: string;
    email: string;
    phone?: string;
    role: 'admin' | 'pastor' | 'usher' | 'group_leader' | 'finance' | 'super_admin';
    designation?: string;
    password?: string;
    ipAddress?: string;
  }): Promise<{
    staff: {
      id: string;
      memberId?: string;
      organizationId: string;
      email?: string;
      phoneE164?: string;
      fullName: string;
      role: ChurchRole;
      status: 'active' | 'suspended';
      mustChangePassword: boolean;
    };
    temporaryPassword?: string;
    resetExisting: boolean;
  }> {
    this.assertDatabaseAvailable();
    const cleanOrgId = (params.organizationId || '').trim().toLowerCase();
    const org = await this.getOrganisationById(cleanOrgId);
    if (!org) {
      const err: any = new Error('Target organisation not found.');
      err.code = 'NOT_FOUND';
      err.status = 404;
      throw err;
    }

    const email = (params.email || '').trim().toLowerCase();
    const phoneE164 = params.phone ? normalizePhone(params.phone) : '';
    const fullName = (params.fullName || '').trim();
    if (!fullName || !email) {
      const err: any = new Error('Full name and official email are required.');
      err.code = 'INVALID_INPUT';
      err.status = 400;
      throw err;
    }

    const suppliedPassword = (params.password || '').trim();
    if (suppliedPassword && suppliedPassword.length < 8) {
      const err: any = new Error('Password must be at least 8 characters long.');
      err.code = 'WEAK_PASSWORD';
      err.status = 400;
      throw err;
    }
    const generatedTempPassword = suppliedPassword
      ? undefined
      : `Ek!${randomBytes(6).toString('base64url')}9`;
    const effectivePassword = suppliedPassword || generatedTempPassword!;

    // Check duplicate credentials across other orgs / creator
    let existingSameOrg: UserCredentialRecord | undefined;
    if (this.supabase) {
      const orFilters = [`email.ilike.${email}`];
      if (phoneE164) orFilters.push(`phone_e164.eq.${phoneE164}`);
      const { data: rows, error } = await this.supabase
        .from('account_credentials')
        .select('*')
        .or(orFilters.join(','))
        .limit(5);
      if (error) {
        throw new Error(`Failed querying staff credentials in Supabase: ${error.message}`);
      }
      if (Array.isArray(rows) && rows.length > 0) {
        for (const row of rows) {
          const rowOrgId = String(row.organization_id || '').toLowerCase();
          if (row.is_creator || (rowOrgId && rowOrgId !== cleanOrgId)) {
            const err: any = new Error(
              'This email or phone already belongs to another organisation or platform creator.'
            );
            err.code = 'DUPLICATE_CREDENTIAL';
            err.status = 409;
            throw err;
          }
        }
        const sameRow = rows[0];
        existingSameOrg = {
          id: String(sameRow.id),
          memberId: sameRow.member_id ? String(sameRow.member_id) : undefined,
          organizationId: cleanOrgId,
          email: sameRow.email ? String(sameRow.email).toLowerCase() : undefined,
          username: sameRow.username ? String(sameRow.username).toLowerCase() : undefined,
          phoneE164: sameRow.phone_e164 ? String(sameRow.phone_e164) : undefined,
          name: String(sameRow.full_name || fullName),
          role: mapSupabaseRoleToChurchRole(sameRow.role),
          isCreator: false,
          passwordHash: '',
          passwordSalt: '',
          status: 'active',
        };
      }
    } else {
      for (const c of this.userCredentials.values()) {
        const matches =
          (c.email && c.email.toLowerCase() === email) ||
          (phoneE164 && c.phoneE164 && c.phoneE164 === phoneE164);
        if (matches) {
          if (c.isCreator || (c.organizationId && c.organizationId.toLowerCase() !== cleanOrgId)) {
            const err: any = new Error(
              'This email or phone is already assigned to another account or platform creator.'
            );
            err.code = 'DUPLICATE_CREDENTIAL';
            err.status = 409;
            throw err;
          }
          existingSameOrg = c;
          break;
        }
      }
    }

    let targetMemberId = existingSameOrg?.memberId;
    if (!targetMemberId) {
      const orgMembers = await this.getMembers(cleanOrgId);
      const matchedMember = orgMembers.find(
        (m) =>
          String(m.email || '').toLowerCase() === email ||
          (phoneE164 && normalizePhone(m.phoneE164 || m.phone) === phoneE164)
      );
      if (matchedMember) {
        targetMemberId = String(matchedMember.id);
        await this.updateMember(cleanOrgId, targetMemberId, {
          role: params.role === 'super_admin' ? 'admin' : params.role,
          status: 'active',
          email,
          ...(phoneE164 ? { phoneE164 } : {}),
          ...(params.designation
            ? { officerName: params.designation, designation: params.designation }
            : {}),
        });
      } else {
        const nameParts = fullName.split(/\s+/).filter(Boolean);
        const firstName = nameParts[0] || 'Staff';
        const lastName = nameParts.slice(1).join(' ') || 'Member';
        const createdMember = await this.createMember(
          cleanOrgId,
          {
            firstName,
            lastName,
            email,
            phoneE164: phoneE164 || undefined,
            groupName: 'Church Leadership',
            autoCheckinOptedIn: false,
            role: params.role === 'super_admin' ? 'admin' : params.role,
            status: 'active',
            ...(params.designation
              ? { officerName: params.designation, designation: params.designation }
              : {}),
          },
          { skipAutoCredentials: true }
        );
        targetMemberId = String(createdMember.id);
      }
    } else if (params.designation) {
      await this.updateMember(cleanOrgId, targetMemberId, {
        officerName: params.designation,
        designation: params.designation,
      }).catch(() => {});
    }

    const credId = existingSameOrg?.id || (UUID_REGEX.test(targetMemberId) ? targetMemberId : randomUUID());
    const nowIso = new Date().toISOString();

    const record = await this.provisionCredentialRecord({
      id: credId,
      memberId: targetMemberId,
      organizationId: cleanOrgId,
      email,
      phoneE164: phoneE164 || undefined,
      name: fullName,
      role: params.role,
      isCreator: params.role === 'super_admin',
      password: effectivePassword,
      mustChangePassword: !suppliedPassword,
      passwordUpdatedAt: nowIso,
    });
    if (params.designation && !this.supabase) {
      const memCred = this.userCredentials.get(record.id);
      if (memCred) {
        this.userCredentials.set(record.id, { ...memCred, designation: params.designation });
      }
    }

    await this.recordAuthAuditEvent({
      organizationId: cleanOrgId,
      accountId: record.id,
      identifier: email,
      eventType: existingSameOrg ? 'password_changed' : 'account_auto_provisioned',
      ipAddress: params.ipAddress,
      success: true,
      reason: `staff_provisioned:${params.role}`,
    });

    return {
      staff: {
        id: record.id,
        memberId: record.memberId,
        organizationId: cleanOrgId,
        email: record.email,
        phoneE164: record.phoneE164,
        fullName: record.name,
        role: record.role,
        status: 'active',
        mustChangePassword: Boolean(record.mustChangePassword),
      },
      ...(generatedTempPassword ? { temporaryPassword: generatedTempPassword } : {}),
      resetExisting: Boolean(existingSameOrg),
    };
  }

  public async listOrganizationUsers(
    organizationId: string,
    options?: { includeTemporaryPasswords?: boolean }
  ): Promise<OrganizationUserAccount[]> {
    this.assertDatabaseAvailable();
    const cleanOrgId = (organizationId || '').trim().toLowerCase();
    if (!cleanOrgId) return [];

    const sb = this.activeSupabase;
    const orgMembers = await this.getMembers(cleanOrgId);
    const includeTemporaryPasswords = Boolean(options?.includeTemporaryPasswords);

    const resolveCredentialStatus = (
      status: string,
      mustChangePassword: boolean,
      lockedUntil?: string | null
    ): OrganizationUserAccount['credentialStatus'] => {
      if (status === 'suspended') return 'suspended';
      if (
        status === 'locked' ||
        (lockedUntil && !Number.isNaN(Date.parse(lockedUntil)) && Date.parse(lockedUntil) > Date.now())
      ) {
        return 'locked';
      }
      return mustChangePassword ? 'temp_password' : 'active';
    };

    const credRows: Array<{
      id: string;
      memberId?: string;
      email?: string;
      username?: string;
      phoneE164?: string;
      fullName: string;
      role: ChurchRole;
      status: string;
      mustChangePassword: boolean;
      temporaryPassword?: string;
      tempPasswordEncrypted?: string | null;
      passwordUpdatedAt?: string | null;
      lockedUntil: string | null;
      lastLoginAt: string | null;
      createdAt?: string;
    }> = [];

    if (sb) {
      if (UUID_REGEX.test(cleanOrgId)) {
        let queryRes = await sb
          .from('account_credentials')
          .select(
            'id, member_id, organization_id, email, username, phone_e164, full_name, role, is_creator, status, locked_until, last_login_at, created_at, must_change_password, password_updated_at, temp_password_encrypted'
          )
          .eq('organization_id', cleanOrgId)
          .eq('is_creator', false)
          .order('created_at', { ascending: false });

        if (
          queryRes.error &&
          /column .* does not exist|Could not find the '[^']+' column|schema cache/i.test(
            queryRes.error.message || ''
          )
        ) {
          queryRes = await sb
            .from('account_credentials')
            .select(
              'id, member_id, organization_id, email, username, phone_e164, full_name, role, is_creator, status, locked_until, last_login_at, created_at, must_change_password'
            )
            .eq('organization_id', cleanOrgId)
            .eq('is_creator', false)
            .order('created_at', { ascending: false }) as typeof queryRes;
        }

        if (queryRes.error) {
          throw new Error(`Failed to load organisation user accounts: ${queryRes.error.message}`);
        }

        for (const row of (queryRes.data || []) as Array<Record<string, any>>) {
          credRows.push({
            id: String(row.id),
            memberId: row.member_id ? String(row.member_id) : undefined,
            email: row.email ? String(row.email).toLowerCase() : undefined,
            username: row.username ? String(row.username).toLowerCase() : undefined,
            phoneE164: row.phone_e164 ? String(row.phone_e164) : undefined,
            fullName: String(row.full_name || 'Church User'),
            role:
              String(row.role || '').toLowerCase() === 'super_admin'
                ? 'super_admin'
                : mapSupabaseRoleToChurchRole(row.role),
            status: String(row.status || 'active'),
            mustChangePassword: Boolean(row.must_change_password),
            tempPasswordEncrypted: row.temp_password_encrypted
              ? String(row.temp_password_encrypted)
              : null,
            passwordUpdatedAt: row.password_updated_at ? String(row.password_updated_at) : null,
            lockedUntil: row.locked_until ? String(row.locked_until) : null,
            lastLoginAt: row.last_login_at ? String(row.last_login_at) : null,
            createdAt: row.created_at ? String(row.created_at) : undefined,
          });
        }
      }
    } else {
      for (const c of this.userCredentials.values()) {
        if (c.organizationId.toLowerCase() === cleanOrgId && !c.isCreator) {
          credRows.push({
            id: c.id,
            memberId: c.memberId,
            email: c.email,
            username: c.username,
            phoneE164: c.phoneE164,
            fullName: c.name,
            role: c.role,
            status: c.status,
            mustChangePassword: Boolean(c.mustChangePassword),
            temporaryPassword: c.temporaryPassword,
            passwordUpdatedAt: c.passwordUpdatedAt ?? null,
            lockedUntil: c.lockedUntil || null,
            lastLoginAt: null,
            createdAt: c.createdAt,
          });
        }
      }
    }

    const matchedMemberIds = new Set<string>();
    const results: OrganizationUserAccount[] = [];

    const matchMemberForCred = (c: (typeof credRows)[number]) => {
      if (c.memberId) {
        const byId = orgMembers.find(
          (m) => String(m.id) === c.memberId || String(m.id) === c.id
        );
        if (byId) return byId;
      }
      const cleanEmail = (c.email || '').trim().toLowerCase();
      const cleanPhone = c.phoneE164 ? normalizePhone(c.phoneE164) : '';
      return orgMembers.find((m) => {
        const mEmail = String(m.email || '').trim().toLowerCase();
        const mPhone = m.phoneE164 || m.phone ? normalizePhone(m.phoneE164 || m.phone) : '';
        return (cleanEmail && mEmail === cleanEmail) || (cleanPhone && mPhone === cleanPhone);
      });
    };

    for (const c of credRows) {
      const linkedMember = matchMemberForCred(c);
      if (linkedMember) {
        matchedMemberIds.add(String(linkedMember.id));
      }
      const memberDisplayName = linkedMember
        ? `${String(linkedMember.firstName || '').trim()} ${String(linkedMember.lastName || '').trim()}`.trim()
        : '';
      const role = c.role;
      const resolvedTemporaryPassword =
        includeTemporaryPasswords && c.mustChangePassword && role !== 'super_admin' && role !== 'creator'
          ? unsealTemporaryPassword(c.tempPasswordEncrypted) ||
            this.tempPasswordByCredId.get(c.id) ||
            c.temporaryPassword ||
            (role === 'member' && !c.passwordUpdatedAt
              ? this.getGenericOnboardingPassword()
              : undefined)
          : undefined;

      results.push({
        id: c.id,
        memberId: linkedMember ? String(linkedMember.id) : c.memberId,
        memberCode: linkedMember?.memberId ? String(linkedMember.memberId) : undefined,
        organizationId: cleanOrgId,
        fullName: c.fullName || memberDisplayName || 'Church User',
        email: c.email || (linkedMember?.email ? String(linkedMember.email).toLowerCase() : undefined),
        username: c.username,
        phoneE164:
          c.phoneE164 ||
          (linkedMember?.phoneE164 ? normalizePhone(String(linkedMember.phoneE164)) : undefined),
        role,
        accountCategory: role === 'member' ? 'member' : 'staff',
        hasCredentials: true,
        credentialStatus: resolveCredentialStatus(c.status, c.mustChangePassword, c.lockedUntil),
        status: c.status === 'suspended' ? 'suspended' : 'active',
        mustChangePassword: Boolean(c.mustChangePassword),
        ...(resolvedTemporaryPassword ? { temporaryPassword: resolvedTemporaryPassword } : {}),
        lastLoginAt: c.lastLoginAt,
        createdAt: c.createdAt,
        homeCellGroup: linkedMember?.homeCellGroup || linkedMember?.groupName || undefined,
        department: linkedMember?.department || undefined,
        designation: linkedMember?.designation || linkedMember?.officerName || undefined,
      });
    }

    for (const m of orgMembers) {
      const mId = String(m.id);
      if (matchedMemberIds.has(mId)) continue;
      const memberDisplayName =
        `${String(m.firstName || '').trim()} ${String(m.lastName || '').trim()}`.trim() ||
        'Congregation Member';
      const role = mapSupabaseRoleToChurchRole(m.role || 'member');
      results.push({
        id: mId,
        memberId: mId,
        memberCode: m.memberId ? String(m.memberId) : undefined,
        organizationId: cleanOrgId,
        fullName: memberDisplayName,
        email: m.email ? String(m.email).trim().toLowerCase() : undefined,
        phoneE164: m.phoneE164 ? normalizePhone(String(m.phoneE164)) : undefined,
        role,
        accountCategory: role === 'member' ? 'member' : 'staff',
        hasCredentials: false,
        credentialStatus: 'unprovisioned',
        status: 'active',
        mustChangePassword: false,
        lastLoginAt: null,
        createdAt: m.joinedOn ? String(m.joinedOn) : undefined,
        homeCellGroup: m.homeCellGroup || m.groupName || undefined,
        department: m.department || undefined,
        designation: m.designation || m.officerName || undefined,
      });
    }

    return results;
  }

  public async provisionOrganizationMemberCredentials(params: {
    organizationId: string;
    credentialId?: string;
    memberId?: string;
    fullName?: string;
    email?: string;
    phone?: string;
    role: ChurchRole;
    designation?: string;
    password?: string;
    requirePasswordChange?: boolean;
    actorId?: string | null;
    actorEmail?: string | null;
    ipAddress?: string;
  }): Promise<{
    user: OrganizationUserAccount;
    temporaryPassword?: string;
    resetExisting: boolean;
  }> {
    this.assertDatabaseAvailable();
    const cleanOrgId = (params.organizationId || '').trim().toLowerCase();
    const org = await this.getOrganisationById(cleanOrgId);
    if (!org) {
      const err: any = new Error('Target organisation not found.');
      err.code = 'NOT_FOUND';
      err.status = 404;
      throw err;
    }

    const orgMembers = await this.getMembers(cleanOrgId);
    let targetMember: Record<string, any> | undefined;
    let resolvedCredFromLookup: Record<string, any> | null = null;
    const requestedMemberId = params.memberId?.trim() || '';
    const requestedCredId = params.credentialId?.trim() || '';

    if (requestedMemberId) {
      targetMember = orgMembers.find(
        (m) => String(m.id) === requestedMemberId || String(m.memberId || '') === requestedMemberId
      );
    }

    const sbLookup = this.activeSupabase;
    const candidateCredId = requestedCredId || (!targetMember ? requestedMemberId : '');
    if (candidateCredId && sbLookup && UUID_REGEX.test(candidateCredId) && UUID_REGEX.test(cleanOrgId)) {
      const { data: credRow } = await sbLookup
        .from('account_credentials')
        .select('*')
        .eq('organization_id', cleanOrgId)
        .or(`id.eq.${candidateCredId},member_id.eq.${candidateCredId}`)
        .limit(1)
        .maybeSingle();
      if (credRow) {
        resolvedCredFromLookup = credRow;
        if (!targetMember && credRow.member_id) {
          targetMember = orgMembers.find((m) => String(m.id) === String(credRow.member_id));
        }
      }
    }

    if (requestedMemberId && !targetMember && !resolvedCredFromLookup) {
      const err: any = new Error('Selected member was not found in this organisation.');
      err.code = 'MEMBER_NOT_FOUND';
      err.status = 404;
      throw err;
    }

    const email = (
      params.email ??
      targetMember?.email ??
      resolvedCredFromLookup?.email ??
      ''
    )
      .trim()
      .toLowerCase();
    const rawPhone = (
      params.phone ??
      targetMember?.phoneE164 ??
      resolvedCredFromLookup?.phone_e164 ??
      ''
    ).trim();
    const phoneE164 = rawPhone ? normalizePhone(rawPhone) : '';
    const memberFullName = targetMember
      ? `${String(targetMember.firstName || '').trim()} ${String(targetMember.lastName || '').trim()}`.trim()
      : resolvedCredFromLookup?.full_name
      ? String(resolvedCredFromLookup.full_name).trim()
      : '';
    const fullName = (params.fullName || memberFullName || '').trim();

    if (!fullName) {
      const err: any = new Error('Full name is required to provision user credentials.');
      err.code = 'INVALID_INPUT';
      err.status = 400;
      throw err;
    }
    if (!email && !phoneE164) {
      const err: any = new Error(
        'An email address or phone number is required to create or reset login credentials.'
      );
      err.code = 'INVALID_INPUT';
      err.status = 400;
      throw err;
    }

    const suppliedPassword = (params.password || '').trim();
    if (suppliedPassword && suppliedPassword.length < 8) {
      const err: any = new Error('Password must be at least 8 characters long.');
      err.code = 'WEAK_PASSWORD';
      err.status = 400;
      throw err;
    }
    const generatedTempPassword = suppliedPassword
      ? undefined
      : `Ek!${randomBytes(6).toString('base64url')}9`;
    const effectivePassword = suppliedPassword || generatedTempPassword!;
    const mustChangePassword = suppliedPassword
      ? Boolean(params.requirePasswordChange)
      : params.requirePasswordChange !== false;

    const sb = this.activeSupabase;
    let existingSameOrg: UserCredentialRecord | undefined;

    if (sb) {
      const orFilters: string[] = [];
      if (targetMember?.id && UUID_REGEX.test(String(targetMember.id))) {
        orFilters.push(`member_id.eq.${targetMember.id}`, `id.eq.${targetMember.id}`);
      }
      if (email) orFilters.push(`email.ilike.${email}`);
      if (phoneE164) orFilters.push(`phone_e164.eq.${phoneE164}`);

      if (orFilters.length > 0) {
        const { data: rows, error } = await sb
          .from('account_credentials')
          .select('*')
          .or(orFilters.join(','))
          .limit(10);
        if (error) {
          throw new Error(`Failed querying user credentials in Supabase: ${error.message}`);
        }
        if (Array.isArray(rows) && rows.length > 0) {
          for (const row of rows) {
            const rowOrgId = String(row.organization_id || '').toLowerCase();
            if (row.is_creator || (rowOrgId && rowOrgId !== cleanOrgId)) {
              const err: any = new Error(
                'This email or phone already belongs to another organisation or platform creator.'
              );
              err.code = 'DUPLICATE_CREDENTIAL';
              err.status = 409;
              throw err;
            }
          }
          const sameRow =
            rows.find((r) => targetMember && String(r.member_id || '') === String(targetMember.id)) ||
            rows[0];
          existingSameOrg = {
            id: String(sameRow.id),
            memberId: sameRow.member_id ? String(sameRow.member_id) : undefined,
            organizationId: cleanOrgId,
            email: sameRow.email ? String(sameRow.email).toLowerCase() : undefined,
            username: sameRow.username ? String(sameRow.username).toLowerCase() : undefined,
            phoneE164: sameRow.phone_e164 ? String(sameRow.phone_e164) : undefined,
            name: String(sameRow.full_name || fullName),
            role: mapSupabaseRoleToChurchRole(sameRow.role),
            isCreator: false,
            passwordHash: '',
            passwordSalt: '',
            status: 'active',
          };
        }
      }
    } else {
      for (const c of this.userCredentials.values()) {
        const sameTargetMember =
          targetMember && (c.memberId === String(targetMember.id) || c.id === String(targetMember.id));
        const sameContact =
          (email && c.email && c.email.toLowerCase() === email) ||
          (phoneE164 && c.phoneE164 && c.phoneE164 === phoneE164);
        if (sameTargetMember || sameContact) {
          if (c.isCreator || (c.organizationId && c.organizationId.toLowerCase() !== cleanOrgId)) {
            const err: any = new Error(
              'This email or phone is already assigned to another organisation or platform creator.'
            );
            err.code = 'DUPLICATE_CREDENTIAL';
            err.status = 409;
            throw err;
          }
          existingSameOrg = c;
          break;
        }
      }
    }

    let targetMemberId = targetMember ? String(targetMember.id) : existingSameOrg?.memberId;
    if (!targetMemberId) {
      const matched = orgMembers.find(
        (m) =>
          (email && String(m.email || '').toLowerCase() === email) ||
          (phoneE164 && m.phoneE164 && normalizePhone(String(m.phoneE164)) === phoneE164)
      );
      if (matched) {
        targetMember = matched;
        targetMemberId = String(matched.id);
      }
    }

    const mappedMemberRole = params.role === 'super_admin' ? 'admin' : params.role;
    const cleanDesignation = params.designation?.trim();
    const nameParts = fullName.split(/\s+/).filter(Boolean);
    const parsedFirstName = nameParts[0] || 'Church';
    const parsedLastName = nameParts.slice(1).join(' ') || parsedFirstName;
    if (targetMemberId) {
      await this.updateMember(cleanOrgId, targetMemberId, {
        ...(params.fullName?.trim() ? { firstName: parsedFirstName, lastName: parsedLastName } : {}),
        role: mappedMemberRole,
        ...(email ? { email } : {}),
        ...(phoneE164 ? { phoneE164, phoneNumber: phoneE164 } : {}),
        ...(cleanDesignation ? { officerName: cleanDesignation, designation: cleanDesignation } : {}),
      });
    } else {
      const createdMember = await this.createMember(
        cleanOrgId,
        {
          firstName: parsedFirstName,
          lastName: parsedLastName,
          email: email || undefined,
          phoneE164: phoneE164 || undefined,
          groupName: params.role === 'member' ? 'General Congregation' : 'Church Leadership',
          autoCheckinOptedIn: params.role === 'member',
          role: mappedMemberRole,
          status: params.role === 'member' ? 'member' : 'active',
          ...(cleanDesignation ? { officerName: cleanDesignation, designation: cleanDesignation } : {}),
        },
        { skipAutoCredentials: true }
      );
      targetMember = createdMember;
      targetMemberId = String(createdMember.id);
    }

    const credId =
      existingSameOrg?.id ||
      (resolvedCredFromLookup?.id ? String(resolvedCredFromLookup.id) : undefined) ||
      (targetMemberId && UUID_REGEX.test(targetMemberId) ? targetMemberId : randomUUID());
    const nowIso = new Date().toISOString();

    const record = await this.provisionCredentialRecord({
      id: credId,
      memberId: targetMemberId,
      organizationId: cleanOrgId,
      email: email || undefined,
      phoneE164: phoneE164 || undefined,
      name: fullName,
      role: params.role,
      isCreator: params.role === 'super_admin',
      password: effectivePassword,
      mustChangePassword,
      passwordUpdatedAt: nowIso,
    });

    await this.resetDistributedAuthRateLimit(`login:${record.id}`);
    await this.recordAuthAuditEvent({
      organizationId: cleanOrgId,
      accountId: record.id,
      identifier: email || phoneE164 || fullName,
      eventType: existingSameOrg ? 'password_changed' : 'account_auto_provisioned',
      ipAddress: params.ipAddress,
      success: true,
      reason: `user_credentials_managed:${params.role}`,
    });

    await this.appendAuditLog({
      organizationId: cleanOrgId,
      actorId: params.actorId ?? null,
      actorEmail: params.actorEmail || 'admin@ekklesphere.local',
      actorRole: 'admin',
      action: existingSameOrg ? 'user_credentials.reset' : 'user_credentials.provisioned',
      targetType: 'account_credentials',
      targetId: record.id,
      metadata: {
        memberId: targetMemberId,
        fullName,
        email: email || null,
        phoneE164: phoneE164 || null,
        role: params.role,
        mustChangePassword,
      },
      ipAddress: params.ipAddress || null,
    });

    return {
      user: {
        id: record.id,
        memberId: record.memberId,
        memberCode: targetMember?.memberId ? String(targetMember.memberId) : undefined,
        organizationId: cleanOrgId,
        fullName: record.name,
        email: record.email,
        phoneE164: record.phoneE164,
        role: record.role,
        accountCategory: record.role === 'member' ? 'member' : 'staff',
        hasCredentials: true,
        credentialStatus: record.mustChangePassword ? 'temp_password' : 'active',
        status: 'active',
        mustChangePassword: Boolean(record.mustChangePassword),
        ...(record.mustChangePassword ? { temporaryPassword: effectivePassword } : {}),
        lastLoginAt: null,
        createdAt: record.createdAt || nowIso,
        homeCellGroup: targetMember?.homeCellGroup || targetMember?.groupName || undefined,
        department: targetMember?.department || undefined,
        designation:
          cleanDesignation || targetMember?.designation || targetMember?.officerName || undefined,
      },
      ...(generatedTempPassword ? { temporaryPassword: generatedTempPassword } : {}),
      resetExisting: Boolean(existingSameOrg),
    };
  }

  public async updateOrganizationUserAccount(params: {
    organizationId: string;
    targetId: string;
    fullName?: string;
    email?: string;
    phone?: string;
    role?: ChurchRole;
    status?: 'active' | 'suspended';
    designation?: string;
    actorUserId?: string | null;
    actorEmail?: string | null;
    callerIsCreator?: boolean;
    ipAddress?: string;
  }): Promise<OrganizationUserAccount> {
    this.assertDatabaseAvailable();
    const cleanOrgId = (params.organizationId || '').trim().toLowerCase();
    const targetId = (params.targetId || '').trim();
    if (!cleanOrgId || !targetId) {
      const err: any = new Error('Target user account ID is required.');
      err.code = 'INVALID_INPUT';
      err.status = 400;
      throw err;
    }

    if (params.role === 'super_admin' && !params.callerIsCreator) {
      const err: any = new Error('Only platform creators may assign super admin privileges.');
      err.code = 'FORBIDDEN';
      err.status = 403;
      throw err;
    }

    if (params.status === 'suspended' && params.actorUserId && params.actorUserId === targetId) {
      const err: any = new Error('You cannot suspend your own active signed-in account.');
      err.code = 'SELF_SUSPEND_BLOCKED';
      err.status = 400;
      throw err;
    }

    const cleanName = params.fullName !== undefined ? params.fullName.trim() : undefined;
    const cleanEmail = params.email !== undefined ? params.email.trim().toLowerCase() : undefined;
    const cleanPhoneE164 =
      params.phone !== undefined
        ? params.phone.trim()
          ? normalizePhone(params.phone.trim())
          : ''
        : undefined;
    const splitName = cleanName
      ? (() => {
          const parts = cleanName.split(/\s+/).filter(Boolean);
          return {
            firstName: parts[0] || cleanName,
            lastName: parts.slice(1).join(' ') || parts[0] || cleanName,
          };
        })()
      : null;

    const sb = this.activeSupabase;
    const nowIso = new Date().toISOString();

    if (sb) {
      let credRow: Record<string, any> | null = null;
      if (UUID_REGEX.test(targetId) && UUID_REGEX.test(cleanOrgId)) {
        const { data, error } = await sb
          .from('account_credentials')
          .select('*')
          .eq('organization_id', cleanOrgId)
          .or(`id.eq.${targetId},member_id.eq.${targetId}`)
          .limit(1)
          .maybeSingle();
        if (error) {
          throw new Error(`Failed querying user account in Supabase: ${error.message}`);
        }
        credRow = data || null;
      }

      if (credRow) {
        if (credRow.is_creator && !params.callerIsCreator) {
          const err: any = new Error('Platform creator accounts cannot be modified here.');
          err.code = 'FORBIDDEN';
          err.status = 403;
          throw err;
        }
        if (
          params.status === 'suspended' &&
          params.actorUserId &&
          (credRow.id === params.actorUserId || credRow.member_id === params.actorUserId)
        ) {
          const err: any = new Error('You cannot suspend your own active signed-in account.');
          err.code = 'SELF_SUSPEND_BLOCKED';
          err.status = 400;
          throw err;
        }

        const orgMembers = await this.getMembers(cleanOrgId);
        let linkedMemberId = credRow.member_id ? String(credRow.member_id) : undefined;
        if (!linkedMemberId) {
          const prevEmail = credRow.email ? String(credRow.email).trim().toLowerCase() : '';
          const prevPhone = credRow.phone_e164 ? normalizePhone(String(credRow.phone_e164)) : '';
          const matchedMember = orgMembers.find((m) => {
            const mEmail = String(m.email || '').trim().toLowerCase();
            const mPhone = m.phoneE164 || m.phone ? normalizePhone(String(m.phoneE164 || m.phone)) : '';
            return (
              String(m.id) === String(credRow.id) ||
              (prevEmail && mEmail === prevEmail) ||
              (prevPhone && mPhone === prevPhone) ||
              (cleanEmail && mEmail === cleanEmail) ||
              (cleanPhoneE164 && mPhone === cleanPhoneE164)
            );
          });
          if (matchedMember?.id) {
            linkedMemberId = String(matchedMember.id);
          }
        }

        const patch: Record<string, unknown> = { updated_at: nowIso };
        if (cleanName) patch.full_name = cleanName;
        if (cleanEmail !== undefined) patch.email = cleanEmail || null;
        if (cleanPhoneE164 !== undefined) patch.phone_e164 = cleanPhoneE164 || null;
        if (params.role) patch.role = params.role;
        if (linkedMemberId && !credRow.member_id && UUID_REGEX.test(linkedMemberId)) {
          patch.member_id = linkedMemberId;
        }
        if (params.status) {
          patch.status = params.status;
          if (params.status === 'active') {
            patch.locked_until = null;
            patch.failed_attempts = 0;
          }
        }

        const { error: updErr } = await sb
          .from('account_credentials')
          .update(patch)
          .eq('organization_id', cleanOrgId)
          .eq('id', credRow.id);
        if (updErr) {
          throw new Error(`Failed updating user account in Supabase: ${updErr.message}`);
        }

        if (credRow.auth_user_id && sb.auth?.admin?.updateUserById) {
          const authEmail =
            cleanEmail ||
            (credRow.email ? String(credRow.email).trim().toLowerCase() : '') ||
            (cleanPhoneE164
              ? `phone-${cleanPhoneE164.replace(/\D/g, '')}@members.ekklesphere.local`
              : '');
          await sb.auth.admin
            .updateUserById(String(credRow.auth_user_id), {
              ...(authEmail ? { email: authEmail, email_confirm: true } : {}),
              user_metadata: {
                full_name: cleanName || credRow.full_name || 'Ekklesphere User',
                role: params.role || credRow.role,
                organization_id: cleanOrgId,
                ...(linkedMemberId ? { member_id: linkedMemberId } : {}),
              },
              app_metadata: {
                role: params.role || credRow.role,
                organization_id: cleanOrgId,
                is_creator: Boolean(credRow.is_creator),
              },
            })
            .catch((authSyncErr) => {
              console.warn('[Ekklesphere Auth Sync] updateOrganizationUserAccount warning:', authSyncErr?.message || authSyncErr);
            });
        }

        if (
          linkedMemberId &&
          (params.role ||
            params.designation !== undefined ||
            cleanName ||
            cleanEmail !== undefined ||
            cleanPhoneE164 !== undefined)
        ) {
          await this.updateMember(cleanOrgId, linkedMemberId, {
            ...(splitName ? { firstName: splitName.firstName, lastName: splitName.lastName } : {}),
            ...(cleanEmail !== undefined ? { email: cleanEmail } : {}),
            ...(cleanPhoneE164 !== undefined
              ? { phoneE164: cleanPhoneE164, phoneNumber: cleanPhoneE164 }
              : {}),
            ...(params.role ? { role: params.role === 'super_admin' ? 'admin' : params.role } : {}),
            ...(params.designation !== undefined
              ? { officerName: params.designation, designation: params.designation }
              : {}),
          });
        }
        if (params.status === 'active') {
          await this.resetDistributedAuthRateLimit(`login:${credRow.id}`);
        }
      } else {
        if (params.status === 'suspended') {
          const err: any = new Error(
            'This member does not have login credentials yet. Issue credentials before suspending login.'
          );
          err.code = 'NO_CREDENTIALS';
          err.status = 400;
          throw err;
        }
        const orgMembers = await this.getMembers(cleanOrgId);
        const foundMember = orgMembers.find((m) => String(m.id) === targetId);
        if (!foundMember) {
          const err: any = new Error('User or member account not found in this organisation.');
          err.code = 'NOT_FOUND';
          err.status = 404;
          throw err;
        }
        if (
          params.role ||
          params.designation !== undefined ||
          cleanName ||
          cleanEmail !== undefined ||
          cleanPhoneE164 !== undefined
        ) {
          await this.updateMember(cleanOrgId, targetId, {
            ...(splitName ? { firstName: splitName.firstName, lastName: splitName.lastName } : {}),
            ...(cleanEmail !== undefined ? { email: cleanEmail } : {}),
            ...(cleanPhoneE164 !== undefined
              ? { phoneE164: cleanPhoneE164, phoneNumber: cleanPhoneE164 }
              : {}),
            ...(params.role ? { role: params.role === 'super_admin' ? 'admin' : params.role } : {}),
            ...(params.designation !== undefined
              ? { officerName: params.designation, designation: params.designation }
              : {}),
          });
        }
      }
    } else {
      let cred: UserCredentialRecord | undefined;
      for (const c of this.userCredentials.values()) {
        if (
          c.organizationId.toLowerCase() === cleanOrgId &&
          (c.id === targetId || c.memberId === targetId)
        ) {
          cred = c;
          break;
        }
      }
      if (cred) {
        if (cred.isCreator && !params.callerIsCreator) {
          const err: any = new Error('Platform creator accounts cannot be modified here.');
          err.code = 'FORBIDDEN';
          err.status = 403;
          throw err;
        }
        if (
          params.status === 'suspended' &&
          params.actorUserId &&
          (cred.id === params.actorUserId || cred.memberId === params.actorUserId)
        ) {
          const err: any = new Error('You cannot suspend your own active signed-in account.');
          err.code = 'SELF_SUSPEND_BLOCKED';
          err.status = 400;
          throw err;
        }
        if (cleanName) cred.name = cleanName;
        if (cleanEmail !== undefined) cred.email = cleanEmail || undefined;
        if (cleanPhoneE164 !== undefined) cred.phoneE164 = cleanPhoneE164 || undefined;
        if (params.role) cred.role = params.role;
        if (params.status) {
          cred.status = params.status;
          if (params.status === 'active') {
            cred.lockedUntil = null;
            cred.failedAttempts = 0;
          }
        }
        if (
          cred.memberId &&
          (params.role || params.designation !== undefined || cleanName || cleanEmail !== undefined || cleanPhoneE164 !== undefined)
        ) {
          await this.updateMember(cleanOrgId, cred.memberId, {
            ...(splitName ? { firstName: splitName.firstName, lastName: splitName.lastName } : {}),
            ...(cleanEmail !== undefined ? { email: cleanEmail } : {}),
            ...(cleanPhoneE164 !== undefined
              ? { phoneE164: cleanPhoneE164, phoneNumber: cleanPhoneE164 }
              : {}),
            ...(params.role ? { role: params.role === 'super_admin' ? 'admin' : params.role } : {}),
            ...(params.designation !== undefined
              ? { officerName: params.designation, designation: params.designation }
              : {}),
          }).catch(() => {});
        }
      } else {
        if (params.status === 'suspended') {
          const err: any = new Error(
            'This member does not have login credentials yet. Issue credentials before suspending login.'
          );
          err.code = 'NO_CREDENTIALS';
          err.status = 400;
          throw err;
        }
        const orgMembers = await this.getMembers(cleanOrgId);
        const foundMember = orgMembers.find((m) => String(m.id) === targetId);
        if (!foundMember) {
          const err: any = new Error('User or member account not found in this organisation.');
          err.code = 'NOT_FOUND';
          err.status = 404;
          throw err;
        }
        if (
          params.role ||
          params.designation !== undefined ||
          cleanName ||
          cleanEmail !== undefined ||
          cleanPhoneE164 !== undefined
        ) {
          await this.updateMember(cleanOrgId, targetId, {
            ...(splitName ? { firstName: splitName.firstName, lastName: splitName.lastName } : {}),
            ...(cleanEmail !== undefined ? { email: cleanEmail } : {}),
            ...(cleanPhoneE164 !== undefined
              ? { phoneE164: cleanPhoneE164, phoneNumber: cleanPhoneE164 }
              : {}),
            ...(params.role ? { role: params.role === 'super_admin' ? 'admin' : params.role } : {}),
            ...(params.designation !== undefined
              ? { officerName: params.designation, designation: params.designation }
              : {}),
          });
        }
      }
    }

    await this.appendAuditLog({
      organizationId: cleanOrgId,
      actorId: params.actorUserId ?? null,
      actorEmail: params.actorEmail || 'admin@ekklesphere.local',
      actorRole: 'admin',
      action: 'user_account.updated',
      targetType: 'account_credentials',
      targetId,
      metadata: {
        ...(cleanName ? { fullName: cleanName } : {}),
        ...(cleanEmail !== undefined ? { email: cleanEmail || null } : {}),
        ...(params.role ? { role: params.role } : {}),
        ...(params.status ? { status: params.status } : {}),
      },
      ipAddress: params.ipAddress || null,
    });

    const refreshed = await this.listOrganizationUsers(cleanOrgId, {
      includeTemporaryPasswords: true,
    });
    const updatedUser = refreshed.find((u) => u.id === targetId || u.memberId === targetId);
    if (!updatedUser) {
      const err: any = new Error('Updated user account could not be loaded.');
      err.code = 'NOT_FOUND';
      err.status = 404;
      throw err;
    }
    return updatedUser;
  }

  public async deleteOrganizationUserAccount(params: {
    organizationId: string;
    targetId: string;
    actorUserId?: string | null;
    actorEmail?: string | null;
    callerIsCreator?: boolean;
    ipAddress?: string;
  }): Promise<{ deletedCredentialId?: string; deletedMemberId?: string }> {
    this.assertDatabaseAvailable();
    const cleanOrgId = (params.organizationId || '').trim().toLowerCase();
    const targetId = (params.targetId || '').trim();
    if (!cleanOrgId || !targetId) {
      const err: any = new Error('Target user account ID is required.');
      err.code = 'INVALID_INPUT';
      err.status = 400;
      throw err;
    }

    if (params.actorUserId && params.actorUserId === targetId) {
      const err: any = new Error('You cannot delete your own active signed-in account.');
      err.code = 'SELF_DELETE_BLOCKED';
      err.status = 400;
      throw err;
    }

    let deletedCredentialId: string | undefined;
    let deletedMemberId: string | undefined;
    const sb = this.activeSupabase;

    if (sb) {
      let credRow: Record<string, any> | null = null;
      if (UUID_REGEX.test(targetId) && UUID_REGEX.test(cleanOrgId)) {
        const { data, error } = await sb
          .from('account_credentials')
          .select('*')
          .eq('organization_id', cleanOrgId)
          .or(`id.eq.${targetId},member_id.eq.${targetId}`)
          .limit(1)
          .maybeSingle();
        if (error) {
          throw new Error(`Failed querying user account in Supabase: ${error.message}`);
        }
        credRow = data || null;
      }

      if (credRow) {
        if (credRow.is_creator && !params.callerIsCreator) {
          const err: any = new Error('Platform creator accounts cannot be deleted here.');
          err.code = 'FORBIDDEN';
          err.status = 403;
          throw err;
        }
        if (
          params.actorUserId &&
          (credRow.id === params.actorUserId || credRow.member_id === params.actorUserId)
        ) {
          const err: any = new Error('You cannot delete your own active signed-in account.');
          err.code = 'SELF_DELETE_BLOCKED';
          err.status = 400;
          throw err;
        }
        const { error: delErr } = await sb
          .from('account_credentials')
          .delete()
          .eq('organization_id', cleanOrgId)
          .eq('id', credRow.id);
        if (delErr) {
          throw new Error(`Failed deleting user credentials in Supabase: ${delErr.message}`);
        }
        deletedCredentialId = String(credRow.id);
        this.tempPasswordByCredId.delete(deletedCredentialId);
        const linkedMemberId = credRow.member_id ? String(credRow.member_id) : undefined;
        if (linkedMemberId) {
          await this.deleteMember(cleanOrgId, linkedMemberId).catch(() => {});
          deletedMemberId = linkedMemberId;
        }
      } else {
        const orgMembers = await this.getMembers(cleanOrgId);
        const foundMember = orgMembers.find((m) => String(m.id) === targetId);
        if (!foundMember) {
          const err: any = new Error('User or member account not found in this organisation.');
          err.code = 'NOT_FOUND';
          err.status = 404;
          throw err;
        }
        await this.deleteMember(cleanOrgId, targetId);
        deletedMemberId = targetId;
      }
    } else {
      let credKey: string | undefined;
      let cred: UserCredentialRecord | undefined;
      for (const [key, c] of this.userCredentials.entries()) {
        if (
          c.organizationId.toLowerCase() === cleanOrgId &&
          (c.id === targetId || c.memberId === targetId)
        ) {
          credKey = key;
          cred = c;
          break;
        }
      }
      if (cred && credKey) {
        if (cred.isCreator && !params.callerIsCreator) {
          const err: any = new Error('Platform creator accounts cannot be deleted here.');
          err.code = 'FORBIDDEN';
          err.status = 403;
          throw err;
        }
        if (
          params.actorUserId &&
          (cred.id === params.actorUserId || cred.memberId === params.actorUserId)
        ) {
          const err: any = new Error('You cannot delete your own active signed-in account.');
          err.code = 'SELF_DELETE_BLOCKED';
          err.status = 400;
          throw err;
        }
        this.userCredentials.delete(credKey);
        this.tempPasswordByCredId.delete(cred.id);
        deletedCredentialId = cred.id;
        if (cred.memberId) {
          await this.deleteMember(cleanOrgId, cred.memberId).catch(() => {});
          deletedMemberId = cred.memberId;
        }
      } else {
        const orgMembers = await this.getMembers(cleanOrgId);
        const foundMember = orgMembers.find((m) => String(m.id) === targetId);
        if (!foundMember) {
          const err: any = new Error('User or member account not found in this organisation.');
          err.code = 'NOT_FOUND';
          err.status = 404;
          throw err;
        }
        await this.deleteMember(cleanOrgId, targetId);
        deletedMemberId = targetId;
      }
    }

    await this.appendAuditLog({
      organizationId: cleanOrgId,
      actorId: params.actorUserId ?? null,
      actorEmail: params.actorEmail || 'admin@ekklesphere.local',
      actorRole: 'admin',
      action: 'user_account.deleted',
      targetType: 'account_credentials',
      targetId,
      metadata: {
        ...(deletedCredentialId ? { deletedCredentialId } : {}),
        ...(deletedMemberId ? { deletedMemberId } : {}),
      },
      ipAddress: params.ipAddress || null,
    });

    return { deletedCredentialId, deletedMemberId };
  }
}

export const platformStore = new PlatformStore();
