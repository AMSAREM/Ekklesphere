// src/server/platformStore.ts
// Single-Source-of-Truth Platform Persistence Layer for Ekklesphere.
// Uses Supabase Postgres (service_role) when SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY are set.
// In non-production Vitest / local preview sandboxes without Supabase credentials, uses a
// strict relational org-scoped backing store (zero os.tmpdir() temp files, zero anon-key fallback).

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID, createHash } from 'crypto';
import {
  PRIMARY_CAMPUS_SITE_ID,
  PRIMARY_ORGANIZATION_ID,
  type ActiveSupportGrantContext,
  type AuthUserPayload,
  type ChurchRole,
} from '../../lib/auth.ts';
import type {
  BillingCycle,
  ConsoleAlert,
  ConsoleAlertType,
  ConsoleAuditLogRecord,
  ConsoleDashboardSummary,
  ConsolePlan,
  DataPrivacyRequest,
  LandingPageConfig,
  LicenseEvaluationResult,
  LicenseOverrides,
  LicensePaymentRecord,
  LicenseStatus,
  LicenseTier,
  OrganisationDetailPayload,
  OrganisationType,
  PaymentCurrency,
  PaymentMethod,
  PlatformAnnouncement,
  PlatformFeatureFlag,
  SupportGrantSession,
  SystemLicense,
  TenantChurch,
  TenantFeatures,
  TenantStatus,
  UsageDailyAggregate,
} from '../types/ekklesphere.ts';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GRACE_PERIOD_DAYS = 7;
const TRIAL_DURATION_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

export function toDeterministicUuid(rawId: string): string {
  if (UUID_REGEX.test(rawId)) return rawId.toLowerCase();
  const hex = createHash('sha256').update(`ekklesphere:${rawId}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

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

class PlatformStore {
  public readonly supabase: SupabaseClient | null;
  public readonly isTestRuntime: boolean;

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

  // Org-scoped operational collections
  private sitesByOrg = new Map<string, RegisteredSiteRecord[]>();
  private premiseByOrg = new Map<string, PremiseSettingsRecord>();
  private checkinsByOrg = new Map<string, LiveCheckinItem[]>();
  private rawEventsByOrg = new Map<string, StoredGeofenceEvent[]>();
  private membersByOrg = new Map<string, Record<string, any>[]>();
  private eventsByOrg = new Map<string, Record<string, any>[]>();
  private pushSubsByOrg = new Map<string, PushSubscriptionItem[]>();
  private legacyTenantsForDryRun: Array<{ id: string; name: string; slug: string }> = [];

  constructor() {
    this.isTestRuntime = Boolean(process.env.VITEST || process.env.NODE_ENV === 'test');
    const url = process.env.SUPABASE_URL?.trim() || '';
    // CRITICAL SECURITY RULE: Server uses ONLY SUPABASE_SERVICE_ROLE_KEY, never SUPABASE_ANON_KEY.
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';

    this.supabase =
      url && serviceRoleKey && !this.isTestRuntime
        ? createClient(url, serviceRoleKey, {
            auth: { persistSession: false, autoRefreshToken: false },
          })
        : null;

    this.seedBaselineState();
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
    this.checkinsByOrg.clear();
    this.rawEventsByOrg.clear();
    this.membersByOrg.clear();
    this.eventsByOrg.clear();
    this.pushSubsByOrg.clear();
    this.legacyTenantsForDryRun = [];
    this.landingConfig = { ...DEFAULT_LANDING_CMS };
    this.seedBaselineState();
  }

  private seedBaselineState(): void {
    for (const plan of Object.values(DEFAULT_PLANS)) {
      this.plans.set(plan.id, { ...plan, featureFlags: { ...plan.featureFlags } });
    }

    const now = new Date();
    const oneYearOut = new Date(now.getTime() + 365 * DAY_MS).toISOString().slice(0, 10);
    const graceOut = new Date(now.getTime() + (365 + GRACE_PERIOD_DAYS) * DAY_MS).toISOString().slice(0, 10);

    const primaryOrg: TenantChurch = {
      id: PRIMARY_ORGANIZATION_ID,
      name: 'PIWC KWADASO',
      slug: 'piwc-kwadaso',
      orgType: 'church',
      campusCode: 'PIWC-01',
      city: 'Kumasi',
      country: 'Ghana',
      seniorPastor: 'Pastor in Charge',
      contactName: 'Church Administrator',
      contactEmail: 'admin@piwckwadaso.org',
      contactPhone: '+233240000000',
      status: 'active',
      memberCount: 0,
      maxCapacity: 2500,
      sitesCount: 1,
      sitesLimit: 15,
      licenseKey: 'EKKLE-PIWC-KWADASO-ENT-2026',
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
    this.orgs.set(PRIMARY_ORGANIZATION_ID, primaryOrg);

    const primaryLicense: SystemLicense = {
      id: 'c0000000-0000-4000-8000-000000000001',
      key: 'EKKLE-PIWC-KWADASO-ENT-2026',
      tier: 'cathedral_enterprise',
      tenantId: PRIMARY_ORGANIZATION_ID,
      organizationId: PRIMARY_ORGANIZATION_ID,
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
      notes: 'Primary anchor sanctuary license',
      enabledFeatures: enabledFeatureLabelsFromFlags(DEFAULT_PLANS.cathedral_enterprise.featureFlags),
    };
    this.licenses.set(primaryLicense.id, primaryLicense);

    const defaultSite: RegisteredSiteRecord = {
      id: PRIMARY_CAMPUS_SITE_ID,
      organization_id: PRIMARY_ORGANIZATION_ID,
      name: 'PIWC KWADASO',
      address: 'Kwadaso Estate, Kumasi, Ghana',
      lat: 6.6833,
      lng: -1.65,
      radius_m: 60,
      outer_radius_m: 300,
      dwell_min: 5,
      active: true,
      updated_at: now.toISOString(),
      updated_by: 'System Baseline',
    };
    this.sitesByOrg.set(PRIMARY_ORGANIZATION_ID, [defaultSite]);
    this.premiseByOrg.set(PRIMARY_ORGANIZATION_ID, {
      organizationId: PRIMARY_ORGANIZATION_ID,
      churchName: 'PIWC KWADASO',
      campusName: 'PIWC KWADASO',
      campusAddress: 'Kwadaso Estate, Kumasi, Ghana',
      lat: 6.6833,
      lng: -1.65,
      accuracyM: 5,
      innerGeofenceMeters: 60,
      outerGeofenceMeters: 300,
      dwellTimeMinutes: 5,
      updatedAt: now.toISOString(),
      updatedBy: 'System Baseline',
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
  }

  // ===========================================================================
  // SUPABASE AUTH IDENTITY & MEMBERSHIP RESOLUTION (Phase 0 #1 & #4)
  // ===========================================================================

  public async verifySupabaseAccessToken(accessToken: string): Promise<AuthUserPayload | null> {
    if (!this.supabase) return null;

    const { data, error } = await this.supabase.auth.getUser(accessToken);
    if (error || !data?.user) {
      return null;
    }

    const sbUser = data.user;
    const email = (sbUser.email || '').toLowerCase();
    const isCreator = Boolean(
      sbUser.app_metadata?.creator === true || sbUser.app_metadata?.is_super_admin === true
    );

    // Resolve organization membership and church role strictly from public.members
    let resolvedOrgId = PRIMARY_ORGANIZATION_ID;
    let resolvedRole: ChurchRole = isCreator ? 'creator' : 'member';
    let resolvedName =
      (typeof sbUser.user_metadata?.full_name === 'string' && sbUser.user_metadata.full_name) ||
      (typeof sbUser.user_metadata?.name === 'string' && sbUser.user_metadata.name) ||
      email.split('@')[0] ||
      'Ekklesphere User';

    const { data: memberRow } = await this.supabase
      .from('members')
      .select('id, organization_id, role, full_name, first_name, last_name')
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
        memberRow.full_name ||
        `${memberRow.first_name || ''} ${memberRow.last_name || ''}`.trim();
      if (dbName) resolvedName = dbName;
    }

    return {
      id: sbUser.id,
      email,
      role: resolvedRole,
      organization_id: resolvedOrgId,
      tenant_id: resolvedOrgId,
      campus_id: PRIMARY_CAMPUS_SITE_ID,
      name: resolvedName,
      is_creator: isCreator,
      auth_provider: 'supabase',
    };
  }

  public async lookupMemberRoleInStore(
    userId: string,
    email: string
  ): Promise<{ organizationId: string; role: ChurchRole; name?: string }> {
    const cleanEmail = (email || '').trim().toLowerCase();

    if (this.supabase) {
      const { data: row } = await this.supabase
        .from('members')
        .select('organization_id, role, full_name, first_name, last_name')
        .or(
          UUID_REGEX.test(userId)
            ? `user_id.eq.${userId}${cleanEmail ? `,email.ilike.${cleanEmail}` : ''}`
            : `email.ilike.${cleanEmail}`
        )
        .limit(1)
        .maybeSingle();

      if (row) {
        return {
          organizationId: String(row.organization_id || PRIMARY_ORGANIZATION_ID).toLowerCase(),
          role: mapSupabaseRoleToChurchRole(row.role),
          name:
            row.full_name ||
            `${row.first_name || ''} ${row.last_name || ''}`.trim() ||
            undefined,
        };
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

    return {
      organizationId: PRIMARY_ORGANIZATION_ID,
      role: 'member',
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
    const existingSites = await this.getSitesForOrg(orgId);
    const targetSiteId =
      params.siteId ||
      existingSites[0]?.id ||
      (orgId === PRIMARY_ORGANIZATION_ID ? PRIMARY_CAMPUS_SITE_ID : randomUUID());

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
      await this.supabase.from('sites').upsert({
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

      await this.supabase
        .from('organizations')
        .update({
          premise_address: params.campusAddress,
          inner_geofence_m: site.radius_m,
          outer_geofence_m: site.outer_radius_m,
          dwell_time_min: site.dwell_min,
          updated_at: nowIso,
        })
        .eq('id', orgId);
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

    const org = this.orgs.get(orgId);
    if (org) {
      org.geofenceConfigured = true;
      org.geofenceRadiusMeters = site.outer_radius_m;
      org.sitesCount = updatedSites.filter((s) => s.active).length;
    }

    return { site, premiseSettings, sites: updatedSites };
  }

  public async clearPremiseSettings(organizationId: string): Promise<PremiseSettingsRecord | null> {
    const orgId = organizationId.toLowerCase();
    if (this.supabase) {
      await this.supabase.from('sites').update({ active: false }).eq('organization_id', orgId);
    }
    this.sitesByOrg.set(orgId, []);
    const existing = this.premiseByOrg.get(orgId);
    const cleared: PremiseSettingsRecord | null = existing
      ? { ...existing, lat: null, lng: null, accuracyM: null, updatedAt: null }
      : null;
    if (cleared) this.premiseByOrg.set(orgId, cleared);

    const org = this.orgs.get(orgId);
    if (org) {
      org.geofenceConfigured = false;
      org.sitesCount = 0;
    }
    return cleared;
  }

  public async getSitesForOrg(organizationId: string): Promise<RegisteredSiteRecord[]> {
    const orgId = organizationId.toLowerCase();
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('sites')
        .select('*')
        .eq('organization_id', orgId)
        .eq('active', true)
        .order('created_at', { ascending: true });

      if (!error && Array.isArray(data)) {
        return data
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
    }
    return this.sitesByOrg.get(orgId) || [];
  }

  public async getLiveCheckins(organizationId: string, serviceId?: string | null): Promise<LiveCheckinItem[]> {
    const orgId = organizationId.toLowerCase();
    if (this.supabase) {
      let query = this.supabase
        .from('attendance')
        .select('*')
        .eq('organization_id', orgId)
        .order('checked_in_at', { ascending: false })
        .limit(500);
      if (serviceId && UUID_REGEX.test(serviceId)) {
        query = query.eq('event_id', serviceId);
      }
      const { data, error } = await query;
      if (!error && Array.isArray(data)) {
        return data.map((row) => {
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
    }

    const list = this.checkinsByOrg.get(orgId) || [];
    return serviceId ? list.filter((c) => c.serviceInstanceId === serviceId) : [...list];
  }

  public async recordLiveCheckin(
    organizationId: string,
    record: Omit<LiveCheckinItem, 'tenantId' | 'organizationId'>
  ): Promise<{ record: LiveCheckinItem; liveCheckins: LiveCheckinItem[] }> {
    const orgId = organizationId.toLowerCase();
    const fullRecord: LiveCheckinItem = {
      ...record,
      tenantId: orgId,
      organizationId: orgId,
    };

    if (
      this.supabase &&
      UUID_REGEX.test(fullRecord.serviceInstanceId) &&
      UUID_REGEX.test(fullRecord.personId)
    ) {
      const mappedDbMethod =
        fullRecord.method === 'posted_qr'
          ? 'qr_scan'
          : fullRecord.method === 'email_link'
          ? 'web_link'
          : fullRecord.method;

      await this.supabase.from('attendance').upsert(
        {
          organization_id: orgId,
          event_id: fullRecord.serviceInstanceId,
          member_id: fullRecord.personId,
          checked_in_at: fullRecord.checkedInIso,
          method: mappedDbMethod,
          status: 'accepted',
          confidence_score: Math.min(100, Math.max(0, Math.round(fullRecord.confidence))),
          distance_m: fullRecord.distanceM ?? null,
          notes: fullRecord.note || null,
        },
        { onConflict: 'organization_id,event_id,member_id' }
      );
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

    return { record: fullRecord, liveCheckins: await this.getLiveCheckins(orgId) };
  }

  public async deleteLiveCheckin(
    organizationId: string,
    personId: string,
    serviceId?: string | null
  ): Promise<LiveCheckinItem[]> {
    const orgId = organizationId.toLowerCase();
    if (this.supabase) {
      let query = this.supabase.from('attendance').delete().eq('organization_id', orgId);
      if (personId !== '__all__' && UUID_REGEX.test(personId)) {
        query = query.eq('member_id', personId);
      }
      if (serviceId && UUID_REGEX.test(serviceId)) {
        query = query.eq('event_id', serviceId);
      }
      await query;
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
    const orgId = organizationId.toLowerCase();
    const scoped: StoredGeofenceEvent = { ...event, organization_id: orgId };

    if (this.supabase && UUID_REGEX.test(scoped.site_id)) {
      const dbSource = scoped.source === 'system_auto_close' ? 'admin_edit' : scoped.source;
      await this.supabase.from('attendance_events').upsert(
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
    const orgId = organizationId.toLowerCase();
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('attendance_events')
        .select('*')
        .eq('organization_id', orgId)
        .order('server_time', { ascending: false })
        .limit(250);
      if (!error && Array.isArray(data)) {
        return data.map((row) => ({
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
    }
    return [...(this.rawEventsByOrg.get(orgId) || [])];
  }

  public async getMembers(organizationId: string): Promise<Record<string, any>[]> {
    const orgId = organizationId.toLowerCase();
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('members')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });
      if (!error && Array.isArray(data)) {
        return data.map((row) => ({
          ...row,
          id: String(row.id),
          tenantId: orgId,
          firstName: row.first_name || row.firstName || (row.full_name ? String(row.full_name).split(' ')[0] : 'Member'),
          lastName: row.last_name || row.lastName || (row.full_name ? String(row.full_name).split(' ').slice(1).join(' ') : ''),
          phoneE164: row.phone || row.phone_e164 || row.phoneE164 || '',
          groupName: row.group_name || row.home_cell_group || 'General Congregation',
          status: row.status || 'member',
        }));
      }
    }
    return [...(this.membersByOrg.get(orgId) || [])];
  }

  public async getMemberCountForOrg(organizationId: string): Promise<number> {
    const orgId = organizationId.toLowerCase();
    if (this.supabase) {
      const { count, error } = await this.supabase
        .from('members')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId);
      if (!error && typeof count === 'number') {
        return count;
      }
    }
    const localCount = (this.membersByOrg.get(orgId) || []).length;
    const org = this.orgs.get(orgId);
    return Math.max(localCount, org?.memberCount || 0);
  }

  public async createMember(
    organizationId: string,
    payload: Record<string, any>
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
    const phone = payload.phoneE164 || payload.phoneNumber || payload.phone || null;
    const email = payload.email ? String(payload.email).trim().toLowerCase() : null;

    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('members')
        .insert({
          organization_id: orgId,
          full_name: `${firstName} ${lastName}`.trim(),
          first_name: firstName,
          last_name: lastName,
          email,
          phone,
          role: payload.role || 'member',
          status: payload.status || 'active',
        })
        .select('*')
        .single();

      if (!error && data) {
        return {
          ...payload,
          id: String(data.id),
          tenantId: orgId,
          firstName,
          lastName,
          phoneE164: phone,
          email,
          status: payload.status || 'member',
          groupName: payload.groupName || 'General Congregation',
          autoCheckinOptedIn: payload.autoCheckinOptedIn ?? true,
          avatarInitials: `${firstName[0] || 'M'}${lastName[0] || 'M'}`.toUpperCase(),
          joinedOn: new Date().toISOString().slice(0, 10),
          consecutiveAbsences: 0,
        };
      }
    }

    const newMember = {
      ...payload,
      id: payload.id || randomUUID(),
      tenantId: orgId,
      firstName,
      lastName,
      phoneE164: phone,
      email,
      status: payload.status || 'member',
      groupName: payload.groupName || 'General Congregation',
      autoCheckinOptedIn: payload.autoCheckinOptedIn ?? true,
      avatarInitials: `${firstName[0] || 'M'}${lastName[0] || 'M'}`.toUpperCase(),
      joinedOn: new Date().toISOString().slice(0, 10),
      consecutiveAbsences: 0,
    };

    const list = this.membersByOrg.get(orgId) || [];
    list.unshift(newMember);
    this.membersByOrg.set(orgId, list);

    const org = this.orgs.get(orgId);
    if (org) {
      org.memberCount = list.length;
    }

    return newMember;
  }

  public async batchImportMembers(
    organizationId: string,
    incomingMembers: Record<string, any>[]
  ): Promise<Record<string, any>[]> {
    const orgId = organizationId.toLowerCase();
    const evalRes = await this.evaluateOrganizationLicense(orgId);
    if (!evalRes.allowed) {
      const err: any = new Error(evalRes.message);
      err.code = evalRes.code;
      err.status = evalRes.httpStatus;
      throw err;
    }

    if (evalRes.seatsLimit > 0 && evalRes.seatsUsed + incomingMembers.length > evalRes.seatsLimit) {
      const err: any = new Error(
        `Batch import exceeds seat limit (${evalRes.seatsUsed + incomingMembers.length}/${evalRes.seatsLimit}). Upgrade your license plan or reduce batch size.`
      );
      err.code = 'SEAT_LIMIT_REACHED';
      err.status = 403;
      err.details = { seatsUsed: evalRes.seatsUsed, seatsLimit: evalRes.seatsLimit, attempted: incomingMembers.length };
      throw err;
    }

    for (const item of incomingMembers) {
      await this.createMember(orgId, item);
    }
    return this.getMembers(orgId);
  }

  public async updateMember(
    organizationId: string,
    memberId: string,
    updates: Record<string, any>
  ): Promise<Record<string, any>> {
    const orgId = organizationId.toLowerCase();
    if (this.supabase && UUID_REGEX.test(memberId)) {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (updates.firstName !== undefined) patch.first_name = updates.firstName;
      if (updates.lastName !== undefined) patch.last_name = updates.lastName;
      if (updates.firstName !== undefined || updates.lastName !== undefined) {
        patch.full_name = `${updates.firstName || ''} ${updates.lastName || ''}`.trim();
      }
      if (updates.email !== undefined) patch.email = updates.email;
      if (updates.phoneE164 !== undefined) patch.phone = updates.phoneE164;
      if (updates.status !== undefined) patch.status = updates.status;

      const { data, error } = await this.supabase
        .from('members')
        .update(patch)
        .eq('organization_id', orgId)
        .eq('id', memberId)
        .select('*')
        .maybeSingle();

      if (!error && data) {
        return { ...updates, id: String(data.id), tenantId: orgId };
      }
    }

    const list = this.membersByOrg.get(orgId) || [];
    const idx = list.findIndex((m) => m.id === memberId);
    if (idx < 0) {
      const notFoundErr: any = new Error('Member not found in organisation');
      notFoundErr.status = 404;
      throw notFoundErr;
    }
    const merged = { ...list[idx], ...updates, id: memberId, tenantId: orgId };
    list[idx] = merged;
    this.membersByOrg.set(orgId, list);
    return merged;
  }

  public async deleteMember(organizationId: string, memberId: string): Promise<void> {
    const orgId = organizationId.toLowerCase();
    if (this.supabase && UUID_REGEX.test(memberId)) {
      await this.supabase
        .from('members')
        .delete()
        .eq('organization_id', orgId)
        .eq('id', memberId);
    }

    const list = (this.membersByOrg.get(orgId) || []).filter((m) => m.id !== memberId);
    this.membersByOrg.set(orgId, list);
    const org = this.orgs.get(orgId);
    if (org) {
      org.memberCount = list.length;
    }
  }

  public async getEvents(organizationId: string): Promise<Record<string, any>[]> {
    const orgId = organizationId.toLowerCase();
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('events')
        .select('*')
        .eq('organization_id', orgId)
        .order('start_time', { ascending: true });
      if (!error && Array.isArray(data) && data.length > 0) {
        return data;
      }
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
    const orgId = organizationId.toLowerCase();
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
          dwell_min: eventData.dwellMin,
          status: eventData.status,
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

  public async upsertPushSubscription(
    organizationId: string,
    sub: Omit<PushSubscriptionItem, 'organizationId'>
  ): Promise<{ subscription: PushSubscriptionItem; totalSubscribers: number }> {
    const orgId = organizationId.toLowerCase();
    const record: PushSubscriptionItem = { ...sub, organizationId: orgId };

    if (this.supabase) {
      await this.supabase.from('push_subscriptions').upsert(
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
    const orgId = organizationId.toLowerCase();
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('push_subscriptions')
        .select('*')
        .eq('organization_id', orgId)
        .order('subscribed_at', { ascending: false });
      if (!error && Array.isArray(data)) {
        return data.map((row) => ({
          id: String(row.id),
          organizationId: orgId,
          endpoint: String(row.endpoint),
          personId: row.person_id || undefined,
          personName: row.person_name || undefined,
          userAgent: row.user_agent || undefined,
          subscribedAt: String(row.subscribed_at),
        }));
      }
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

    if (this.supabase) {
      await this.supabase.from('audit_log').insert({
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
      if (!error && Array.isArray(data)) {
        return data.map((row) => ({
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
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('plans')
        .select('*')
        .order('annual_cost_usd', { ascending: true });
      if (!error && Array.isArray(data) && data.length > 0) {
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
      await this.supabase
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
    let items: TenantChurch[] = [];

    if (this.supabase) {
      const { data: orgRows, error } = await this.supabase
        .from('organizations')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && Array.isArray(orgRows)) {
        const allLicenses = await this.listLicenses();
        const licByOrg = new Map<string, SystemLicense>();
        for (const lic of allLicenses) {
          const oid = (lic.organizationId || lic.tenantId).toLowerCase();
          if (!licByOrg.has(oid)) licByOrg.set(oid, lic);
        }

        items = await Promise.all(
          orgRows.map(async (row) => {
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
              status: (settings.status || row.status || 'trial') as TenantStatus,
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
      }
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
      smsConfigured: boolean;
      pushConfigured: boolean;
    }>
  ): Promise<TenantChurch> {
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
      if (updates.status !== undefined) dbPatch.status = updates.status;
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

  public async listLicenses(): Promise<SystemLicense[]> {
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('licenses')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && Array.isArray(data)) {
        return data.map((row) => {
          const tier = (row.tier || row.plan_id || 'grace_starter') as LicenseTier;
          const plan = DEFAULT_PLANS[tier] || DEFAULT_PLANS.grace_starter;
          const overrides: LicenseOverrides = row.overrides || {};
          const orgId = String(row.tenant_id || row.organization_id || PRIMARY_ORGANIZATION_ID).toLowerCase();
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
    const orgId = params.organizationId.toLowerCase();
    const org = this.orgs.get(orgId) || (await this.getOrganisationById(orgId));
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
      const dbStatus = status === 'trial' ? 'active' : status;
      const { data, error } = await this.supabase
        .from('licenses')
        .insert({
          tenant_id: orgId,
          key,
          tier: params.tier,
          seats_limit: overrides.seatsLimit ?? plan.seatsLimit,
          status: dbStatus,
          issued_date: now.toISOString(),
          expires_date: expires.toISOString(),
          billing_cycle: params.billingCycle,
          annual_cost_usd: annualCostUSD,
          enabled_features: Object.keys(plan.featureFlags).filter((k) => (plan.featureFlags as any)[k]),
        })
        .select('*')
        .single();

      if (error || !data) {
        throw new Error(`Failed to issue license: ${error?.message || 'Unknown error'}`);
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

      if (actionPayload.action === 'suspend') {
        await this.supabase.from('organizations').update({ status: 'suspended' }).eq('id', orgId);
      } else if (actionPayload.action === 'reactivate' || actionPayload.action === 'renew') {
        await this.supabase.from('organizations').update({ status: 'active' }).eq('id', orgId);
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
      if (actionPayload.action === 'suspend') memOrg.status = 'suspended';
      if (actionPayload.action === 'reactivate' || actionPayload.action === 'renew') memOrg.status = 'active';
      if (actionPayload.action === 'start_trial') memOrg.status = 'trial';
    }

    return updated;
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
    if (this.supabase) {
      let query = this.supabase
        .from('license_payments')
        .select('*, organizations(name)')
        .order('paid_at', { ascending: false })
        .limit(300);
      if (organizationId) query = query.eq('organization_id', organizationId.toLowerCase());
      const { data, error } = await query;
      if (!error && Array.isArray(data)) {
        return data.map((row) => ({
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
    const dateStr =
      targetDateIso && /^\d{4}-\d{2}-\d{2}$/.test(targetDateIso)
        ? targetDateIso
        : new Date().toISOString().slice(0, 10);

    if (this.supabase) {
      const { data, error } = await this.supabase.rpc('rollup_usage_daily', {
        p_target_date: dateStr,
      });
      if (!error && data) {
        return {
          targetDate: dateStr,
          organizationsProcessed: Number(data.organizationsProcessed ?? 0),
          alertsGenerated: Number(data.alertsUpserted ?? 0),
        };
      }
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
    const cutoffDate = new Date(Date.now() - days * DAY_MS).toISOString().slice(0, 10);

    if (this.supabase) {
      let query = this.supabase
        .from('usage_daily')
        .select('*, organizations(name)')
        .gte('usage_date', cutoffDate)
        .order('usage_date', { ascending: false });
      if (organizationId) query = query.eq('organization_id', organizationId.toLowerCase());
      const { data, error } = await query;
      if (!error && Array.isArray(data)) {
        return data.map((row) => ({
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
    if (this.supabase) {
      let query = this.supabase
        .from('alerts')
        .select('*, organizations(name)')
        .order('created_at', { ascending: false });
      if (filters?.status && filters.status !== 'all') query = query.eq('status', filters.status);
      if (filters?.severity && filters.severity !== 'all') query = query.eq('severity', filters.severity);
      const { data, error } = await query;
      if (!error && Array.isArray(data)) {
        return data.map((row) => ({
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
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('announcements')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && Array.isArray(data)) {
        return data.map((row) => ({
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
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('feature_flags')
        .select('*')
        .order('key', { ascending: true });
      if (!error && Array.isArray(data)) {
        return data.map((row) => ({
          key: String(row.key),
          name: String(row.name),
          description: String(row.description || ''),
          enabledGlobally: Boolean(row.enabled_globally),
          enabledTiers: (row.enabled_tiers || []) as LicenseTier[],
          organizationOverrides: row.organization_overrides || {},
          updatedAt: String(row.updated_at),
        }));
      }
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

    if (this.supabase) {
      await this.supabase.from('feature_flags').upsert({
        key: merged.key,
        name: merged.name,
        description: merged.description,
        enabled_globally: merged.enabledGlobally,
        enabled_tiers: merged.enabledTiers,
        organization_overrides: merged.organizationOverrides,
        updated_at: merged.updatedAt,
      });
    }

    this.featureFlags.set(key, merged);
    return merged;
  }

  public async listDataRequests(): Promise<DataPrivacyRequest[]> {
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('data_requests')
        .select('*, organizations(name)')
        .order('created_at', { ascending: false });
      if (!error && Array.isArray(data)) {
        return data.map((row) => ({
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
    const nowMs = Date.now();
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('support_grants')
        .select('*, organizations(name)')
        .order('created_at', { ascending: false })
        .limit(100);
      if (!error && Array.isArray(data)) {
        return data.map((row) => ({
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
    }
    return Array.from(this.supportGrants.values()).map((g) => ({
      ...g,
      active: !g.revokedAt && new Date(g.expiresAt).getTime() > nowMs,
    }));
  }

  public async getLandingConfig(): Promise<LandingPageConfig> {
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('landing_cms_config')
        .select('config')
        .eq('id', 'default')
        .maybeSingle();
      if (!error && data?.config) {
        return { ...DEFAULT_LANDING_CMS, ...(data.config as Partial<LandingPageConfig>) };
      }
    }
    return { ...this.landingConfig };
  }

  public async updateLandingConfig(
    updates: Partial<LandingPageConfig>,
    actorEmail: string
  ): Promise<LandingPageConfig> {
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
      await this.supabase.from('landing_cms_config').upsert({
        id: 'default',
        config: merged,
        updated_by_email: actorEmail,
        updated_at: new Date().toISOString(),
      });
    }

    this.landingConfig = merged;
    return merged;
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
}

export const platformStore = new PlatformStore();
