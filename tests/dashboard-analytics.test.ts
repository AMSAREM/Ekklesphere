import { describe, expect, it } from 'vitest';
import { computeDashboardAnalytics } from '../src/utils/dashboardAnalytics';
import {
  AttendanceRecord,
  ChurchGroup,
  Donation,
  FollowupTask,
  Person,
  ServiceInstance,
  SystemSettings,
} from '../src/types/ekklesphere';

const baseSettings: SystemSettings = {
  churchName: 'Grace Cathedral',
  campusName: 'Accra Central Campus',
  campusAddress: 'Independence Ave',
  campusLatitude: 5.56,
  campusLongitude: -0.2,
  campusLocationAccuracyM: 12,
  campusLocationUpdatedAt: '2026-11-10T08:00:00Z',
  seniorPastor: 'Rev. Mensah',
  contactEmail: 'admin@grace.org',
  contactPhone: '+233240000000',
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
  smsSenderId: 'GRACE',
  enablePushNotifications: true,
};

function makePerson(overrides: Partial<Person> & { id: string; firstName: string }): Person {
  return {
    tenantId: 'tenant-1',
    lastName: 'Member',
    phoneE164: '+233241111111',
    groupName: 'Grace Cell',
    homeCellGroup: 'Grace Cell',
    status: 'member',
    autoCheckinOptedIn: true,
    avatarInitials: overrides.firstName.slice(0, 2).toUpperCase(),
    joinedOn: '2025-01-01',
    consecutiveAbsences: 0,
    ...overrides,
  };
}

describe('computeDashboardAnalytics', () => {
  it('computes active service telemetry, department turnout, ministries/groups, demographics, and giving accurately', () => {
    const services: ServiceInstance[] = [
      {
        id: 'svc-live',
        serviceId: 'def-1',
        campusId: 'campus-1',
        name: 'Sunday Second Service',
        date: '2026-11-15',
        startsAt: '10:30',
        endsAt: '12:30',
        expectedAttendance: 10,
        status: 'open',
      },
      {
        id: 'svc-midweek',
        serviceId: 'def-2',
        campusId: 'campus-1',
        name: 'Midweek Miracle Hour',
        date: '2026-11-18',
        startsAt: '18:00',
        endsAt: '20:00',
        expectedAttendance: 6,
        status: 'scheduled',
      },
    ];

    const members: Person[] = [
      makePerson({
        id: 'p1',
        firstName: 'Kwame',
        department: 'Choir Ministry',
        homeCellGroup: 'Grace Cell',
        groupName: 'Grace Cell',
        gender: 'Male',
        maritalStatus: 'Married',
        email: 'kwame@grace.org',
        imageUrl: 'https://cdn.example.org/kwame.jpg',
        residentialDigitalAddress: 'GA-123-4567',
        dateOfBirth: '1990-11-04',
        autoCheckinOptedIn: true,
      }),
      makePerson({
        id: 'p2',
        firstName: 'Abena',
        department: 'Choir Ministry',
        homeCellGroup: 'Grace Cell',
        groupName: 'Grace Cell',
        gender: 'Female',
        maritalStatus: 'Single',
        dateOfBirth: '1994-11-22',
        autoCheckinOptedIn: false,
        consecutiveAbsences: 3, // repeat absentee
      }),
      makePerson({
        id: 'p3',
        firstName: 'Yaw',
        department: 'Ushering Protocol',
        homeCellGroup: 'Victory Cell',
        groupName: 'Victory Cell',
        gender: 'Male',
        maritalStatus: 'Single',
        monthOfBirth: 'November',
        autoCheckinOptedIn: true,
      }),
      makePerson({
        id: 'p4',
        firstName: 'Efua',
        department: '',
        homeCellGroup: 'Victory Cell',
        groupName: 'Victory Cell',
        status: 'visitor',
        gender: 'Female',
        phoneE164: '',
        autoCheckinOptedIn: false,
        consecutiveAbsences: 2,
      }),
    ];

    const attendanceRecords: AttendanceRecord[] = [
      {
        id: 'a1',
        tenantId: 'tenant-1',
        campusId: 'campus-1',
        personId: 'p1',
        serviceInstanceId: 'svc-live',
        checkedInAt: '10:20',
        method: 'geofence',
        confidence: 98,
        late: false,
      },
      {
        id: 'a2',
        tenantId: 'tenant-1',
        campusId: 'campus-1',
        personId: 'p3',
        serviceInstanceId: 'svc-live',
        checkedInAt: '10:48',
        method: 'usher',
        confidence: 95,
        late: true,
      },
      // Midweek record should not pollute svc-live
      {
        id: 'a3',
        tenantId: 'tenant-1',
        campusId: 'campus-1',
        personId: 'p1',
        serviceInstanceId: 'svc-midweek',
        checkedInAt: '17:55',
        method: 'beacon',
        confidence: 99,
        late: false,
      },
    ];

    const churchGroups: ChurchGroup[] = [
      {
        id: 'g1',
        name: 'Choir Ministry',
        category: 'ministry',
        leaderName: 'Deaconess Boateng',
        description: 'Sanctuary worship choir',
        meetingDay: 'Saturday',
        meetingTime: '16:00',
        active: true,
        createdAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'g2',
        name: 'Women of Faith',
        category: 'fellowship',
        leaderName: 'Elder Martha',
        description: 'Women fellowship',
        meetingDay: 'Thursday',
        meetingTime: '17:30',
        active: true,
        createdAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'g3',
        name: 'Grace Cell',
        category: 'cell_group',
        leaderName: 'Brother Kofi',
        description: 'Central Accra home cell',
        meetingDay: 'Wednesday',
        meetingTime: '19:00',
        active: true,
        createdAt: '2026-01-01T00:00:00Z',
      },
    ];

    const followupTasks: FollowupTask[] = [
      {
        id: 'f1',
        personId: 'p2',
        personName: 'Abena Member',
        groupName: 'Grace Cell',
        reason: 'absent_3',
        assignedToName: 'Brother Kofi',
        status: 'open',
        dueOn: '2026-11-17',
        createdAt: '2026-11-15T12:00:00Z',
      },
      {
        id: 'f2',
        personId: 'p1',
        personName: 'Kwame Member',
        groupName: 'Grace Cell',
        reason: 'first_timer',
        assignedToName: 'Elder Martha',
        status: 'resolved',
        dueOn: '2026-11-10',
        createdAt: '2026-11-08T12:00:00Z',
      },
    ];

    const donations: Donation[] = [
      {
        id: 'd1',
        personName: 'Kwame Member',
        fundId: 'fund-building',
        fundName: 'Building Fund',
        amountMinor: 25000, // GHS 250
        currency: 'GHS',
        method: 'momo',
        provider: 'MTN MoMo',
        paidAt: '2026-11-10T10:00:00Z',
        status: 'paid',
      },
      {
        id: 'd2',
        personName: 'Yaw Member',
        fundId: 'fund-tithe',
        fundName: 'Tithe',
        amountMinor: 10000, // GHS 100
        currency: 'GHS',
        method: 'card',
        provider: 'Card',
        paidAt: '2026-11-11T10:00:00Z',
        status: 'pending', // excluded from paid total
      },
    ];

    const result = computeDashboardAnalytics({
      members,
      attendanceRecords,
      services,
      currentService: services[0],
      churchGroups,
      followupTasks,
      donations,
      systemSettings: baseSettings,
      now: new Date(2026, 10, 14), // November 2026
    });

    // Active Service metrics
    expect(result.activeService.id).toBe('svc-live');
    expect(result.activeService.name).toBe('Sunday Second Service');
    expect(result.activeService.attendanceCount).toBe(2);
    expect(result.activeService.expectedAttendance).toBe(10);
    expect(result.activeService.turnoutPct).toBe(20);
    expect(result.activeService.absenteeCount).toBe(2); // p2 & p4 absent out of 4 members
    expect(result.activeService.onTimeCount).toBe(1);
    expect(result.activeService.lateCount).toBe(1);
    expect(result.activeService.punctualityPct).toBe(50);
    expect(result.activeService.autoCount).toBe(1);
    expect(result.activeService.assistedCount).toBe(1);
    expect(result.activeService.atRiskCount).toBe(2); // p2 (3) and p4 (2)
    expect(result.activeService.channels).toHaveLength(2);

    // Departments
    expect(result.namedDepartmentsCount).toBe(2); // Choir Ministry, Ushering Protocol (excludes General Congregation)
    expect(result.topDepartment?.name).toBe('Choir Ministry');
    const choirDept = result.departments.find((d) => d.name === 'Choir Ministry');
    expect(choirDept?.totalMembers).toBe(2);
    expect(choirDept?.presentCount).toBe(1);
    expect(choirDept?.turnoutPct).toBe(50);
    expect(choirDept?.atRiskCount).toBe(1);

    // Ministries, Fellowships & Cell Groups (3 configured + Ushering Protocol discovered ministry + Victory Cell discovered cell group)
    expect(result.groupCounts.ministries).toBe(2);
    expect(result.groupCounts.fellowships).toBe(1);
    expect(result.groupCounts.cellGroups).toBe(2);
    expect(result.groupCounts.total).toBe(5);
    const graceCell = result.groups.find((g) => g.name === 'Grace Cell');
    expect(graceCell?.totalMembers).toBe(2);
    expect(graceCell?.presentCount).toBe(1);
    expect(graceCell?.leaderName).toBe('Brother Kofi');

    // Membership & Directory completeness
    expect(result.membership.totalMembers).toBe(4);
    expect(result.membership.visitorsCount).toBe(1);
    expect(result.membership.activeStatusCount).toBe(3);
    expect(result.membership.openFollowupCount).toBe(1);
    expect(result.membership.birthdaysThisMonthCount).toBe(3);
    expect(result.membership.completeness.phoneCount).toBe(3);
    expect(result.membership.completeness.photoCount).toBe(1);
    expect(result.membership.completeness.digitalAddressCount).toBe(1);

    // Giving
    expect(result.giving.totalPaidGhs).toBe(250);
    expect(result.giving.donationsCount).toBe(1);
    expect(result.giving.topFundName).toBe('Building Fund');

    // Multi-service comparison
    expect(result.serviceComparisons).toHaveLength(2);
    expect(result.serviceComparisons[0].isActive).toBe(true);
    expect(result.serviceComparisons[1].checkedInCount).toBe(1);
  });

  it('handles empty congregation and no check-ins gracefully without division-by-zero', () => {
    const emptyService: ServiceInstance = {
      id: 'svc-empty',
      serviceId: 'def-empty',
      campusId: 'campus-1',
      name: 'Prayer Night',
      startsAt: '19:00',
      endsAt: '21:00',
      expectedAttendance: 0,
      status: 'scheduled',
    };

    const result = computeDashboardAnalytics({
      members: [],
      attendanceRecords: [],
      services: [emptyService],
      currentService: emptyService,
      churchGroups: [],
      followupTasks: [],
      donations: [],
      systemSettings: baseSettings,
    });

    expect(result.activeService.attendanceCount).toBe(0);
    expect(result.activeService.turnoutPct).toBe(0);
    expect(result.activeService.punctualityPct).toBe(0);
    expect(result.membership.totalMembers).toBe(0);
    expect(result.namedDepartmentsCount).toBe(0);
    expect(result.topDepartment).toBeNull();
    expect(result.groupCounts.total).toBe(0);
    expect(result.giving.totalPaidGhs).toBe(0);
  });
});
