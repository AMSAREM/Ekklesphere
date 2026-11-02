// tests/member-attendance-frequency.test.ts
import { describe, it, expect } from 'vitest';
import type { AttendanceRecord, CheckinMethod, Person } from '../src/types/ekklesphere';

interface MockWeekSlot {
  label: string;
  startDateIso: string;
  endDateIso: string;
  attended: number;
  method: CheckinMethod | 'none';
  late: boolean;
}

function computeMemberFrequency(
  records: AttendanceRecord[],
  personId: string,
  weeksCount: number,
  anchorDate: Date = new Date('2026-11-02T12:00:00Z')
) {
  const weekRanges: Array<{ start: Date; end: Date }> = [];
  const today = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), anchorDate.getDate());

  for (let i = weeksCount - 1; i >= 0; i--) {
    const end = new Date(today);
    end.setDate(today.getDate() - i * 7);
    const start = new Date(end);
    start.setDate(end.getDate() - 6);
    weekRanges.push({ start, end });
  }

  const memberRecords = records.filter((r) => r.personId === personId);

  const slots: MockWeekSlot[] = weekRanges.map((range, idx) => {
    const startIso = range.start.toISOString().split('T')[0];
    const endIso = range.end.toISOString().split('T')[0];

    const match = memberRecords.find((rec) => {
      const recDate = rec.checkedInIso ? rec.checkedInIso.split('T')[0] : rec.checkedInAt.split('T')[0];
      return recDate >= startIso && recDate <= endIso;
    });

    return {
      label: `W${idx + 1}`,
      startDateIso: startIso,
      endDateIso: endIso,
      attended: match ? 1 : 0,
      method: match?.method || 'none',
      late: Boolean(match?.late),
    };
  });

  const attendedWeeks = slots.filter((s) => s.attended === 1).length;
  const frequencyPct = Math.round((attendedWeeks / slots.length) * 100);
  const onTimeCount = slots.filter((s) => s.attended === 1 && !s.late).length;
  const onTimePct = attendedWeeks > 0 ? Math.round((onTimeCount / attendedWeeks) * 100) : 100;

  let currentStreak = 0;
  for (let i = slots.length - 1; i >= 0; i--) {
    if (slots[i].attended === 1) currentStreak++;
    else break;
  }

  return {
    slots,
    attendedWeeks,
    totalWeeks: weeksCount,
    frequencyPct,
    onTimePct,
    currentStreak,
  };
}

describe('Member Attendance Frequency Calculation & Analytics', () => {
  const mockMemberId = 'mem-kofi-mensah';

  const mockRecords: AttendanceRecord[] = [
    {
      id: 'rec-1',
      tenantId: 'tenant-1',
      personId: mockMemberId,
      serviceInstanceId: 'svc-1',
      campusId: 'campus-1',
      method: 'geofence',
      confidence: 98,
      checkedInAt: '2026-11-01T08:14:00Z',
      checkedInIso: '2026-11-01T08:14:00Z',
      late: false,
    },
    {
      id: 'rec-2',
      tenantId: 'tenant-1',
      personId: mockMemberId,
      serviceInstanceId: 'svc-2',
      campusId: 'campus-1',
      method: 'beacon',
      confidence: 96,
      checkedInAt: '2026-10-25T08:22:00Z',
      checkedInIso: '2026-10-25T08:22:00Z',
      late: false,
    },
    {
      id: 'rec-3',
      tenantId: 'tenant-1',
      personId: mockMemberId,
      serviceInstanceId: 'svc-3',
      campusId: 'campus-1',
      method: 'usher',
      confidence: 99,
      checkedInAt: '2026-10-18T08:45:00Z',
      checkedInIso: '2026-10-18T08:45:00Z',
      late: true, // late arrival
    },
    {
      id: 'rec-4',
      tenantId: 'tenant-1',
      personId: mockMemberId,
      serviceInstanceId: 'svc-4',
      campusId: 'campus-1',
      method: 'geofence',
      confidence: 97,
      checkedInAt: '2026-10-11T08:05:00Z',
      checkedInIso: '2026-10-11T08:05:00Z',
      late: false,
    },
  ];

  it('correctly calculates 4-week attendance frequency with 100% attendance rate', () => {
    const result = computeMemberFrequency(
      mockRecords,
      mockMemberId,
      4,
      new Date('2026-11-02T12:00:00Z')
    );

    expect(result.totalWeeks).toBe(4);
    expect(result.attendedWeeks).toBe(4);
    expect(result.frequencyPct).toBe(100);
    expect(result.currentStreak).toBe(4);
    // 3 on-time, 1 late = 75% on-time
    expect(result.onTimePct).toBe(75);
  });

  it('correctly calculates 8-week attendance frequency including absences', () => {
    const result = computeMemberFrequency(
      mockRecords,
      mockMemberId,
      8,
      new Date('2026-11-02T12:00:00Z')
    );

    expect(result.totalWeeks).toBe(8);
    expect(result.attendedWeeks).toBe(4);
    expect(result.frequencyPct).toBe(50);
    expect(result.currentStreak).toBe(4); // 4 consecutive active weeks leading up to latest
  });

  it('handles member with zero attendance records safely', () => {
    const result = computeMemberFrequency(
      mockRecords,
      'unknown-member-id',
      8,
      new Date('2026-11-02T12:00:00Z')
    );

    expect(result.totalWeeks).toBe(8);
    expect(result.attendedWeeks).toBe(0);
    expect(result.frequencyPct).toBe(0);
    expect(result.currentStreak).toBe(0);
    expect(result.onTimePct).toBe(100);
  });

  it('correctly flags streak break when the latest week was missed', () => {
    const recordsWithRecentAbsence: AttendanceRecord[] = [
      {
        id: 'rec-old',
        tenantId: 'tenant-1',
        personId: 'mem-2',
        serviceInstanceId: 'svc-old',
        campusId: 'campus-1',
        method: 'posted_qr',
        confidence: 95,
        checkedInAt: '2026-10-18T08:10:00Z',
        checkedInIso: '2026-10-18T08:10:00Z',
        late: false,
      },
    ];

    const result = computeMemberFrequency(
      recordsWithRecentAbsence,
      'mem-2',
      4,
      new Date('2026-11-02T12:00:00Z')
    );

    expect(result.attendedWeeks).toBe(1);
    expect(result.totalWeeks).toBe(4);
    expect(result.frequencyPct).toBe(25);
    // Because the member did not attend the most recent 2 weeks, current streak must be 0
    expect(result.currentStreak).toBe(0);
  });
});
