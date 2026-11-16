import { describe, expect, it } from 'vitest';
import { computeVisitorAnalytics } from '../src/utils/visitorAnalytics';
import {
  AttendanceRecord,
  FollowupTask,
  Person,
  ServiceInstance,
} from '../src/types/ekklesphere';

const baseNow = new Date('2026-11-15T12:00:00Z');

const makePerson = (overrides: Partial<Person> & { id: string }): Person => ({
  tenantId: 'org-1',
  firstName: 'Test',
  lastName: 'User',
  phoneE164: '+233240000001',
  groupName: 'Visitors',
  status: 'visitor',
  autoCheckinOptedIn: false,
  avatarInitials: 'TU',
  joinedOn: '2026-11-01',
  consecutiveAbsences: 0,
  ...overrides,
});

const makeService = (
  overrides: Partial<ServiceInstance> & { id: string; name: string; date: string }
): ServiceInstance => ({
  serviceId: `def-${overrides.id}`,
  campusId: 'camp-1',
  startsAt: '08:30',
  endsAt: '10:30',
  status: 'closed',
  expectedAttendance: 100,
  ...overrides,
});

const makeRecord = (
  overrides: Partial<AttendanceRecord> & { personId: string; serviceInstanceId: string }
): AttendanceRecord => ({
  id: `rec-${overrides.serviceInstanceId}-${overrides.personId}`,
  tenantId: 'org-1',
  campusId: 'camp-1',
  method: 'usher',
  confidence: 95,
  checkedInAt: '08:40',
  late: false,
  ...overrides,
});

describe('Visitor Trends & Retention Analytics Engine', () => {
  it('computes first-time vs returning visits, 30d registrations, service share, funnel, and channels', () => {
    const members: Person[] = [
      // Visitor 1: attended 2 services (returning) + resolved follow-up
      makePerson({
        id: 'v1',
        firstName: 'Kofi',
        lastName: 'Boateng',
        joinedOn: '2026-10-25',
        department: 'Media Team',
      }),
      // Visitor 2: attended 1 service (first-timer) + open follow-up
      makePerson({
        id: 'v2',
        firstName: 'Abena',
        lastName: 'Osei',
        joinedOn: '2026-11-08',
        department: 'Choir',
      }),
      // Visitor 3: registered only, 0 check-ins, older than 30 days
      makePerson({
        id: 'v3',
        firstName: 'Yaw',
        lastName: 'Mensah',
        joinedOn: '2026-09-20',
      }),
      // Regular full member (must not be counted as visitor)
      makePerson({
        id: 'm1',
        firstName: 'Grace',
        lastName: 'Appiah',
        status: 'member',
        groupName: 'Faith Cell',
        joinedOn: '2025-01-10',
      }),
    ];

    const services: ServiceInstance[] = [
      makeService({ id: 'svc-1', name: 'Sunday Celebration Nov 1', date: '2026-11-01' }),
      makeService({
        id: 'svc-2',
        name: 'Sunday Celebration Nov 15',
        date: '2026-11-15',
        status: 'open',
      }),
    ];

    const attendanceRecords: AttendanceRecord[] = [
      // Service 1: v1 (1st visit), m1 (member)
      makeRecord({ serviceInstanceId: 'svc-1', personId: 'v1', method: 'usher' }),
      makeRecord({ serviceInstanceId: 'svc-1', personId: 'm1', method: 'geofence' }),
      // Service 2: v1 (2nd/returning visit), v2 (1st visit), m1 (member)
      makeRecord({ serviceInstanceId: 'svc-2', personId: 'v1', method: 'posted_qr' }),
      makeRecord({ serviceInstanceId: 'svc-2', personId: 'v2', method: 'usher' }),
      makeRecord({ serviceInstanceId: 'svc-2', personId: 'm1', method: 'geofence' }),
    ];

    const followupTasks: FollowupTask[] = [
      {
        id: 'task-1',
        personId: 'v1',
        personName: 'Kofi Boateng',
        groupName: 'Visitors',
        reason: 'first_timer',
        assignedToName: 'Deacon Sam',
        status: 'resolved',
        dueOn: '2026-11-04',
        createdAt: '2026-11-02T10:00:00Z',
      },
      {
        id: 'task-2',
        personId: 'v2',
        personName: 'Abena Osei',
        groupName: 'Visitors',
        reason: 'first_timer',
        assignedToName: 'Deaconess Mary',
        status: 'open',
        dueOn: '2026-11-18',
        createdAt: '2026-11-09T10:00:00Z',
      },
    ];

    const result = computeVisitorAnalytics({
      members,
      attendanceRecords,
      services,
      currentService: services[1],
      followupTasks,
      now: baseNow,
    });

    expect(result.totalVisitors).toBe(3);
    expect(result.newVisitors30d).toBe(2); // v1 (Oct 25) + v2 (Nov 8) within 30d of Nov 15
    expect(result.checkedInVisitorsEver).toBe(2); // v1 and v2
    expect(result.returningVisitorsCount).toBe(1); // v1 has 2 visits
    expect(result.firstTimeOnlyCount).toBe(1); // v2 has 1 visit
    expect(result.retentionRatePct).toBe(50); // 1 of 2 attended visitors returned

    // Active service (svc-2): 2 visitors (v1 + v2) out of 3 total check-ins = 67%
    expect(result.activeServiceVisitorsCount).toBe(2);
    expect(result.activeServiceTotalCheckins).toBe(3);
    expect(result.activeServiceVisitorSharePct).toBe(67);

    // Follow-up completion: 1 of 2 visitor tasks contacted/resolved = 50%
    expect(result.firstTimerTasksTotal).toBe(2);
    expect(result.firstTimerTasksCompletedCount).toBe(1);
    expect(result.followupCompletionPct).toBe(50);
    expect(result.needsFollowupCount).toBe(2); // v2 (open) + v3 (unassigned)

    // Peak service & per-service comparison
    expect(result.peakVisitorService).toEqual({
      name: 'Sunday Celebration Nov 15',
      date: '2026-11-15',
      count: 2,
    });
    const svc2Row = result.serviceComparisons.find((s) => s.serviceId === 'svc-2');
    expect(svc2Row?.firstTimeVisitors).toBe(1); // v2
    expect(svc2Row?.returningVisitors).toBe(1); // v1
    expect(svc2Row?.visitorSharePct).toBe(67);

    // Channels across visitor check-ins (2 usher, 1 posted_qr)
    expect(result.channels.find((c) => c.method === 'usher')?.count).toBe(2);
    expect(result.channels.find((c) => c.method === 'posted_qr')?.count).toBe(1);

    // Weekly buckets aggregate check-ins accurately
    const totalWeeklyVisitorVisits = result.weeklyBuckets.reduce(
      (sum, b) => sum + b.totalVisitorCheckins,
      0
    );
    expect(totalWeeklyVisitorVisits).toBe(3);

    // Funnel stages monotonic progression
    expect(result.funnelStages.map((s) => s.count)).toEqual([3, 2, 1, 1]);
  });

  it('handles empty directory and zero check-ins without NaN or division errors', () => {
    const result = computeVisitorAnalytics({
      members: [],
      attendanceRecords: [],
      services: [],
      currentService: null,
      followupTasks: [],
      now: baseNow,
    });

    expect(result.totalVisitors).toBe(0);
    expect(result.retentionRatePct).toBe(0);
    expect(result.followupCompletionPct).toBe(0);
    expect(result.activeServiceVisitorSharePct).toBe(0);
    expect(result.peakVisitorService).toBeNull();
    expect(result.weeklyBuckets.length).toBeGreaterThan(0);
    expect(result.funnelStages.every((s) => s.count === 0 && s.pctOfRegistered === 0)).toBe(
      true
    );
  });
});
