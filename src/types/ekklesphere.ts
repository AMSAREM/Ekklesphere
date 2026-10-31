export type CheckinMethod = 'usher' | 'posted_qr' | 'beacon' | 'geofence' | 'email_link' | 'manual';

export type UserRole =
  | 'super_admin'
  | 'creator'
  | 'admin'
  | 'pastor'
  | 'usher'
  | 'member'
  | 'group_leader'
  | 'finance';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
  initials: string;
  title: string;
  campusName: string;
  memberId?: string;
  tenant_id?: string;
  campus_id?: string;
  organization_id?: string;
  username?: string;
  permissions: string[];
  token?: string;
  is_creator?: boolean;
}

export type SignalKind =
  | 'geofence_outer'
  | 'geofence_inner'
  | 'geofence_dwell'
  | 'beacon'
  | 'qr'
  | 'usher'
  | 'email_link'
  | 'manual';

export type MemberStatus = 'visitor' | 'member' | 'inactive' | 'transferred' | 'deceased';

export type FollowupReason = 'absent_2' | 'absent_3' | 'first_timer' | 'manual';
export type FollowupStatus = 'open' | 'contacted' | 'resolved' | 'dismissed';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  settings: Record<string, unknown>;
  createdAt: string;
}

export interface Campus {
  id: string;
  tenantId: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  innerRadiusM: number;
  outerRadiusM: number;
  active: boolean;
}

export interface Beacon {
  id: string;
  tenantId: string;
  campusId: string;
  beaconUuid: string;
  major: number;
  minor: number;
  label: string;
}

export interface Person {
  id: string;
  tenantId: string;
  // All 28 Church Membership Fields
  firstName: string; // FIRST NAME
  middleName?: string; // MIDDLE NAME
  lastName: string; // LASTNAME
  specificLocation?: string; // SPECIFIC LOCATION (landmark/area)
  remarks?: string; // REMARKS
  memberId?: string; // ID (membership ID or card number)
  squads?: string; // SQUADS
  department?: string; // DEPARTMENT (e.g. Ushering, Choir, Media)
  officerName?: string; // MEMBERS/OFFICERS NAME (Designation/Role)
  gender?: 'male' | 'female' | 'other' | string; // GENDER
  dateOfBirth?: string; // DATE OF BIRTH (YYYY-MM-DD)
  phoneE164: string; // PHONE NUMBER (E.164 format)
  phoneNumber?: string; // raw phone
  placeOfResidence?: string; // PLACE OF RESIDENCE
  residentialDigitalAddress?: string; // RESIDENTIAL/DIGITAL ADDRESS (GhanaPost GPS)
  hometown?: string; // HOMETOWN
  occupation?: string; // OCCUPATION
  homeCellGroup?: string; // HOME CELL GROUP
  groupName: string; // Cell group / Fellowship group
  monthOfBirth?: string; // MONTH OF BIRTH
  maritalStatus?: 'Single' | 'Married' | 'Widowed' | 'Divorced' | string; // MARITAL STATUS
  spouseName?: string; // NAME OF SPOUSE
  numberOfChildren?: number; // NUMBER OF CHILDREN
  emergencyContactPerson?: string; // NAME OF PERSON TO CONTACT IN CASE OF EMERGENCY
  emergencyContactPhone?: string; // EMERGENCY (Phone / Contact)
  imageUrl?: string; // IMAGE
  dateOfBaptism?: string; // date of baptism
  dateOfMarriage?: string; // date of marriage
  dateOfSalvation?: string; // date of salvation
  dateOfMembership?: string; // date of membership

  // System & Engagement fields
  email?: string;
  preferredName?: string;
  status: MemberStatus;
  householdRole?: 'head' | 'spouse' | 'child' | 'other';
  autoCheckinOptedIn: boolean;
  avatarInitials: string;
  joinedOn: string;
  consecutiveAbsences: number;
  notes?: string;
}

export interface MembershipColumnDef {
  key: keyof Person | string;
  header: string;
  required?: boolean;
  type?: 'text' | 'date' | 'phone' | 'number' | 'image' | 'select';
  width?: string;
  category: 'identity' | 'location' | 'church' | 'personal' | 'emergency' | 'spiritual';
}

export const MEMBERSHIP_TABLE_HEADERS: { header: string; key: keyof Person; label: string }[] = [
  { header: 'FIRST NAME', key: 'firstName', label: 'First Name' },
  { header: 'MIDDLE NAME', key: 'middleName', label: 'Middle Name' },
  { header: 'LASTNAME', key: 'lastName', label: 'Last Name' },
  { header: 'SPECIFIC LOCATION', key: 'specificLocation', label: 'Specific Location' },
  { header: 'REMARKS', key: 'remarks', label: 'Remarks' },
  { header: 'ID', key: 'memberId', label: 'Member ID' },
  { header: 'SQUADS', key: 'squads', label: 'Squads' },
  { header: 'DEPARTMENT', key: 'department', label: 'Department' },
  { header: 'MEMBERS/OFFICERS NAME', key: 'officerName', label: 'Members/Officers Name' },
  { header: 'GENDER', key: 'gender', label: 'Gender' },
  { header: 'DATE OF BIRTH', key: 'dateOfBirth', label: 'Date of Birth' },
  { header: 'PHONE NUMBER', key: 'phoneE164', label: 'Phone Number' },
  { header: 'PLACE OF RESIDENCE', key: 'placeOfResidence', label: 'Place of Residence' },
  { header: 'RESIDENTIAL/DIGITAL ADDRESS', key: 'residentialDigitalAddress', label: 'Residential/Digital Address' },
  { header: 'HOMETOWN', key: 'hometown', label: 'Hometown' },
  { header: 'OCCUPATION', key: 'occupation', label: 'Occupation' },
  { header: 'HOME CELL GROUP', key: 'homeCellGroup', label: 'Home Cell Group' },
  { header: 'MONTH OF BIRTH', key: 'monthOfBirth', label: 'Month of Birth' },
  { header: 'MARITAL STATUS', key: 'maritalStatus', label: 'Marital Status' },
  { header: 'NAME OF SPOUSE', key: 'spouseName', label: 'Name of Spouse' },
  { header: 'NUMBER OF CHILDREN', key: 'numberOfChildren', label: 'Number of Children' },
  { header: 'NAME OF PERSON TO CONTACT IN CASE OF EMERGENCY', key: 'emergencyContactPerson', label: 'Emergency Contact Person' },
  { header: 'EMERGENCY', key: 'emergencyContactPhone', label: 'Emergency Contact Phone' },
  { header: 'IMAGE', key: 'imageUrl', label: 'Image' },
  { header: 'date of baptism', key: 'dateOfBaptism', label: 'Date of Baptism' },
  { header: 'date of marriage', key: 'dateOfMarriage', label: 'Date of Marriage' },
  { header: 'date of salvation', key: 'dateOfSalvation', label: 'Date of Salvation' },
  { header: 'date of membership', key: 'dateOfMembership', label: 'Date of Membership' },
];

export interface ServiceDefinition {
  id: string;
  campusId: string;
  name: string;
  kind: 'service' | 'event' | 'group_meeting';
  startTime: string; // "08:00"
  durationMin: number;
  windowBeforeMin: number;
  windowAfterMin: number;
  dwellMin: number;
  expectedAttendance: number;
}

export interface ServiceInstance {
  id: string;
  serviceId: string;
  campusId: string;
  name: string;
  date?: string; // YYYY-MM-DD
  startsAt: string;
  endsAt: string;
  status: 'scheduled' | 'open' | 'closed' | 'cancelled';
  expectedAttendance: number;
}

export interface AttendanceSignal {
  id: string;
  personId: string;
  campusId: string;
  serviceInstanceId: string;
  kind: SignalKind;
  occurredAt: string;
  receivedAt: string;
  accuracyM?: number;
  mockLocation: boolean;
  signatureOk: boolean;
}

export interface AttendanceRecord {
  id: string;
  tenantId: string;
  personId: string;
  personName?: string;
  serviceInstanceId: string;
  campusId: string;
  method: CheckinMethod;
  confidence: number; // 0-100
  checkedInAt: string;
  checkedInIso?: string;
  departedAt?: string;
  late: boolean;
  recordedBy?: string;
  note?: string;
  distanceM?: number | null;
  lat?: number | null;
  lng?: number | null;
  waitingToSync?: boolean; // For offline Usher queue
}

export interface LiveTelemetrySignal {
  id: string;
  person_id?: string;
  person_name?: string;
  type: 'enter' | 'exit' | 'manual_in' | 'manual_out';
  source: string;
  distance_m: number | null;
  accuracy_m: number | null;
  is_mock: boolean;
  server_time: string;
  status: 'accepted' | 'flagged' | 'rejected';
  flag_reasons: string[];
}

export interface LiveTelemetrySummary {
  totalSignals: number;
  accepted: number;
  flagged: number;
  rejected: number;
  mockAttempts: number;
  openShifts: number;
  avgDwellMinutes: number | null;
  recentSignals: LiveTelemetrySignal[];
}

export interface WeeklyAttendanceBucket {
  weekKey: string;
  startDate: string;
  endDate: string;
  shortLabel: string;
  fullRangeLabel: string;
  isCurrentWeek: boolean;
  totalCheckins: number;
  uniqueAttendees: number;
  onTimeCount: number;
  lateCount: number;
  autoProximityCount: number;
  assistedDoorCount: number;
  servicesCount: number;
  engagementRatePct: number;
}

export interface ThirtyDayAttendanceTrendResponse {
  windowDays: number;
  startDate: string;
  endDate: string;
  totalCheckins30d: number;
  uniqueAttendees30d: number;
  averageWeeklyAttendance: number;
  peakWeekLabel: string | null;
  peakWeekCount: number;
  weeks: WeeklyAttendanceBucket[];
  historicalRecords: AttendanceRecord[];
  timestamp: string;
}

export interface FollowupTask {
  id: string;
  personId: string;
  personName: string;
  groupName: string;
  reason: FollowupReason;
  assignedToName: string;
  status: FollowupStatus;
  dueOn: string;
  outcome?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface DonationFund {
  id: string;
  name: string;
  active: boolean;
}

export interface Donation {
  id: string;
  personId?: string;
  personName?: string;
  fundId: string;
  fundName: string;
  amountMinor: number; // in pesewas (100 = 1 GHS)
  currency: 'GHS';
  method: 'momo' | 'card' | 'cash' | 'bank';
  provider: 'MTN MoMo' | 'Telecel Cash' | 'Card' | 'Cash';
  status: 'pending' | 'paid' | 'failed';
  paidAt: string;
}

export interface AuditLogItem {
  id: string;
  actor: string;
  action: string;
  entityType: string;
  timestamp: string;
  details: string;
}

export interface SystemSettings {
  churchName: string;
  campusName: string;
  campusAddress: string;
  campusLatitude: number | null;
  campusLongitude: number | null;
  campusLocationAccuracyM?: number | null;
  campusLocationUpdatedAt?: string | null;
  seniorPastor: string;
  contactEmail: string;
  contactPhone: string;
  timezone: string;
  currency: string;
  outerGeofenceMeters: number;
  innerGeofenceMeters: number;
  dwellTimeMinutes: number;
  serviceWindowBeforeMinutes: number;
  serviceWindowAfterMinutes: number;
  bleBeaconRssiThreshold: number;
  driveByProtection: boolean;
  absenteeThresholdServices: number;
  firstTimerFollowupHours: number;
  autoAssignCellLeaders: boolean;
  requireExplicitConsent: boolean;
  auditLogRetentionDays: number;
  smsGatewayProvider: string;
  smsSenderId: string;
  enablePushNotifications: boolean;
}

export type ChurchGroupCategory = 'ministry' | 'fellowship' | 'cell_group';

export interface ChurchGroup {
  id: string;
  name: string;
  category: ChurchGroupCategory;
  leaderName: string;
  leaderPhone?: string;
  leaderEmail?: string;
  assistantLeader?: string;
  meetingDay?: string;
  meetingTime?: string;
  meetingLocation?: string;
  targetDemographic?: string;
  description: string;
  active: boolean;
  createdAt: string;
  updatedAt?: string;
}

// ==========================================
// CREATOR PLATFORM: TENANTS & LICENSES TYPES
// ==========================================

export type AppViewMode = 'landing' | 'app' | 'creator';

export type LicenseTier = 'grace_starter' | 'ministry_pro' | 'cathedral_enterprise';
export type TenantStatus = 'active' | 'trial' | 'suspended' | 'maintenance' | 'archived';
export type BillingCycle = 'monthly' | 'annual' | 'lifetime';
export type OrganisationType = 'church' | 'organisation';
export type LicenseStatus = 'active' | 'trial' | 'grace_period' | 'expired' | 'revoked' | 'suspended';
export type PaymentCurrency = 'GHS' | 'USD';
export type PaymentMethod = 'momo' | 'bank' | 'cash';

export interface TenantFeatures {
  bleRadar: boolean;
  smsGateway: boolean;
  biometrics: boolean;
  gdprPrivacyVault: boolean;
  multiCampus: boolean;
  mobileGivingMoMo: boolean;
  customDomain: boolean;
  exportAuditLogs: boolean;
}

export interface TenantChurch {
  id: string;
  name: string;
  slug: string;
  orgType?: OrganisationType;
  campusCode: string;
  city: string;
  country: string;
  seniorPastor: string;
  contactName?: string;
  contactEmail: string;
  contactPhone: string;
  status: TenantStatus;
  memberCount: number;
  maxCapacity: number;
  sitesCount?: number;
  sitesLimit?: number;
  licenseKey: string;
  licenseTier: LicenseTier;
  licenseStatus?: LicenseStatus;
  renewalDate: string;
  billingCycle: BillingCycle;
  customDomain?: string;
  geofenceRadiusMeters: number;
  geofenceConfigured?: boolean;
  smsConfigured?: boolean;
  pushConfigured?: boolean;
  checkins30d?: number;
  lastActivityAt?: string | null;
  features: TenantFeatures;
  createdAt: string;
}

export interface LicenseOverrides {
  seatsLimit?: number;
  sitesLimit?: number;
  monthlyCheckinsLimit?: number;
  features?: Partial<TenantFeatures>;
}

export interface SystemLicense {
  id: string;
  key: string;
  tier: LicenseTier;
  tenantId: string;
  organizationId?: string;
  tenantName: string;
  seatsLimit: number;
  sitesLimit?: number;
  monthlyCheckinsLimit?: number;
  seatsUsed?: number;
  sitesUsed?: number;
  status: LicenseStatus;
  issuedDate: string;
  expiresDate: string;
  graceEndsDate?: string | null;
  billingCycle: BillingCycle;
  annualCostUSD: number;
  overrides?: LicenseOverrides;
  notes?: string;
  enabledFeatures: string[];
}

export interface ConsolePlan {
  id: LicenseTier;
  name: string;
  description: string;
  monthlyCostUSD: number;
  annualCostUSD: number;
  seatsLimit: number;
  sitesLimit: number;
  monthlyCheckinsLimit: number;
  featureFlags: TenantFeatures;
  isActive: boolean;
  updatedAt: string;
}

export interface LicensePaymentRecord {
  id: string;
  licenseId: string;
  organizationId: string;
  organizationName?: string;
  amount: number;
  currency: PaymentCurrency;
  method: PaymentMethod;
  reference: string;
  paidAt: string;
  notes?: string;
  recordedByEmail: string;
  createdAt: string;
}

export interface UsageDailyAggregate {
  organizationId: string;
  organizationName?: string;
  usageDate: string;
  activeUsers: number;
  checkinsCount: number;
  flaggedCount: number;
  rejectedCount: number;
  mockLocationAttempts: number;
  sitesCount: number;
  pushSubscribers: number;
  lastActivityAt: string | null;
}

export type ConsoleAlertType =
  | 'expiring_license'
  | 'limit_exceeded'
  | 'usage_drop'
  | 'high_spoofing_rate'
  | 'geofence_not_configured'
  | 'comms_not_configured';

export interface ConsoleAlert {
  id: string;
  organizationId: string | null;
  organizationName?: string;
  alertType: ConsoleAlertType;
  severity: 'info' | 'warning' | 'critical';
  status: 'open' | 'acknowledged' | 'resolved';
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  acknowledgedAt?: string | null;
  resolvedAt?: string | null;
}

export interface PlatformAnnouncement {
  id: string;
  title: string;
  body: string;
  severity: 'info' | 'warning' | 'critical';
  targetTiers: LicenseTier[];
  targetOrganizationIds: string[];
  active: boolean;
  startsAt: string;
  expiresAt?: string | null;
  createdByEmail?: string;
  createdAt: string;
}

export interface PlatformFeatureFlag {
  key: string;
  name: string;
  description: string;
  enabledGlobally: boolean;
  enabledTiers: LicenseTier[];
  organizationOverrides: Record<string, boolean>;
  updatedAt: string;
}

export interface DataPrivacyRequest {
  id: string;
  organizationId: string;
  organizationName?: string;
  requestType: 'export' | 'deletion';
  status: 'pending' | 'in_progress' | 'completed' | 'rejected';
  requestedByEmail: string;
  reason?: string;
  notes?: string;
  dueAt: string;
  completedAt?: string | null;
  createdAt: string;
}

export interface SupportGrantSession {
  id: string;
  organizationId: string;
  organizationName: string;
  creatorUserId: string;
  creatorEmail: string;
  reason: string;
  accessLevel: 'read_only_admin';
  startsAt: string;
  expiresAt: string;
  revokedAt?: string | null;
  active: boolean;
}

export interface ConsoleAuditLogRecord {
  id: string;
  actorId?: string | null;
  actorEmail: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  organizationId?: string | null;
  organizationName?: string;
  reason?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  createdAt: string;
}

export interface LicenseEvaluationResult {
  allowed: boolean;
  code:
    | 'LICENSE_OK'
    | 'LICENSE_TRIAL'
    | 'LICENSE_GRACE_PERIOD'
    | 'LICENSE_MISSING'
    | 'LICENSE_EXPIRED'
    | 'LICENSE_REVOKED'
    | 'LICENSE_SUSPENDED';
  httpStatus: number;
  status: LicenseStatus | 'unlicensed';
  tier: LicenseTier | null;
  organizationId: string;
  licenseKey?: string;
  seatsUsed: number;
  seatsLimit: number;
  sitesUsed: number;
  sitesLimit: number;
  monthlyCheckinsLimit: number;
  expiresDate: string | null;
  graceEndsDate: string | null;
  inGracePeriod: boolean;
  daysRemaining: number | null;
  graceDaysRemaining: number | null;
  message: string;
}

export interface ConsoleDashboardSummary {
  organisationsByStatus: Record<string, number>;
  licensesByTier: Record<LicenseTier, number>;
  licensesByStatus: Record<string, number>;
  expiringIn7Days: SystemLicense[];
  expiringIn30Days: SystemLicense[];
  annualRunRateUSD: number;
  paymentsTotalGHS: number;
  paymentsTotalUSD: number;
  checkinsTrend: Array<{ date: string; checkins: number; flagged: number; mockAttempts: number }>;
  topOrganisations: Array<{ id: string; name: string; city: string; tier: LicenseTier; checkins30d: number; seatsUsed: number; seatsLimit: number }>;
  inactiveOrganisations: Array<{ id: string; name: string; city: string; status: string; lastActivityAt: string | null }>;
  nearOrOverLimits: Array<{
    id: string;
    name: string;
    seatsUsed: number;
    seatsLimit: number;
    sitesUsed: number;
    sitesLimit: number;
    seatUtilizationPct: number;
    siteUtilizationPct: number;
  }>;
  openAlertsCount: number;
  storageBackend: 'supabase' | 'sandbox_ephemeral';
  generatedAt: string;
}

export interface OrganisationDetailPayload {
  organisation: TenantChurch;
  license: SystemLicense | null;
  evaluation: LicenseEvaluationResult;
  payments: LicensePaymentRecord[];
  usageDaily: UsageDailyAggregate[];
  usersSummary: {
    totalMembersCount: number;
    visitorsCount: number;
    optedInProximityCount: number;
    staffByRole: Record<string, number>;
    staffAccounts: Array<{ id: string; role: string; status: string; joinedAt: string }>;
  };
  sites: Array<{
    id: string;
    name: string;
    address?: string;
    lat: number;
    lng: number;
    radius_m: number;
    outer_radius_m?: number;
    active: boolean;
  }>;
  audit: ConsoleAuditLogRecord[];
}

export interface LandingPageConfig {
  heroTitle: string;
  heroSubtitle: string;
  announcementBadge: string;
  isAnnouncementActive: boolean;
  contactSalesEmail: string;
  demoEnabled: boolean;
  showcaseHeadline: string;
  featuredStats: {
    congregationsServed: string;
    checkinsRecorded: string;
    proximityAccuracy: string;
    networkUptime: string;
  };
}




