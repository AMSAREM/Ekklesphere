export type CheckinMethod = 'usher' | 'posted_qr' | 'beacon' | 'geofence' | 'email_link' | 'manual';

export type UserRole = 'admin' | 'usher' | 'member';

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
  permissions: string[];
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
  firstName: string;
  lastName: string;
  preferredName?: string;
  phoneE164: string;
  email?: string;
  status: MemberStatus;
  groupName: string; // e.g. "Osu North cell", "Choir", "Youth"
  householdRole?: 'head' | 'spouse' | 'child' | 'other';
  autoCheckinOptedIn: boolean;
  avatarInitials: string;
  joinedOn: string;
  consecutiveAbsences: number;
  notes?: string;
}

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
  serviceInstanceId: string;
  campusId: string;
  method: CheckinMethod;
  confidence: number; // 0-100
  checkedInAt: string;
  departedAt?: string;
  late: boolean;
  recordedBy?: string;
  note?: string;
  waitingToSync?: boolean; // For offline Usher queue
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
