import { describe, expect, it } from 'vitest';
import type { ServiceInstance } from '../types/ekklesphere';
import {
  computeServiceBinaryStatus,
  evaluateServiceCheckInEligibility,
  isPlaceholderServiceId,
} from '../utils/serviceStatus';

const makeService = (overrides: Partial<ServiceInstance> = {}): ServiceInstance => ({
  id: '11111111-1111-4111-8111-111111111111',
  serviceId: '11111111-1111-4111-8111-111111111111',
  campusId: '00000000-0000-0000-0000-000000000001',
  name: 'Sunday First Service',
  date: '2026-11-15',
  startsAt: '08:00',
  endsAt: '10:30',
  status: 'scheduled',
  expectedAttendance: 250,
  ...overrides,
});

describe('isPlaceholderServiceId', () => {
  it('identifies empty and legacy synthetic service IDs as placeholders', () => {
    expect(isPlaceholderServiceId(null)).toBe(true);
    expect(isPlaceholderServiceId(undefined)).toBe(true);
    expect(isPlaceholderServiceId('')).toBe(true);
    expect(isPlaceholderServiceId('   ')).toBe(true);
    expect(isPlaceholderServiceId('svc-live-main')).toBe(true);
    expect(isPlaceholderServiceId('SVC-SUN-1')).toBe(true);
    expect(isPlaceholderServiceId('11111111-1111-4111-8111-111111111111')).toBe(false);
  });
});

describe('evaluateServiceCheckInEligibility', () => {
  it('blocks check-in when no service is scheduled', () => {
    const res = evaluateServiceCheckInEligibility([]);
    expect(res.eligible).toBe(false);
    expect(res.reasonCode).toBe('NO_SERVICE_SCHEDULED');
    expect(res.service).toBeNull();
    expect(res.message).toMatch(/No service is scheduled/i);
  });

  it('blocks check-in when target service ID is a synthetic placeholder', () => {
    const activeSvc = makeService({ status: 'open' });
    const resLive = evaluateServiceCheckInEligibility([activeSvc], 'svc-live-main');
    expect(resLive.eligible).toBe(false);
    expect(resLive.reasonCode).toBe('NO_SERVICE_SCHEDULED');

    const resSun = evaluateServiceCheckInEligibility([activeSvc], 'svc-sun-1');
    expect(resSun.eligible).toBe(false);
    expect(resSun.reasonCode).toBe('NO_SERVICE_SCHEDULED');
  });

  it('blocks check-in when target service ID does not match any scheduled service', () => {
    const activeSvc = makeService({ status: 'open' });
    const res = evaluateServiceCheckInEligibility(
      [activeSvc],
      '99999999-9999-4999-8999-999999999999'
    );
    expect(res.eligible).toBe(false);
    expect(res.reasonCode).toBe('NO_SERVICE_SCHEDULED');
  });

  it('allows check-in for both open and scheduled services only when within active time window + allowance', () => {
    const insideWindowMs = new Date(2026, 10, 15, 9, 0, 0).getTime();
    const withinAllowanceMs = new Date(2026, 10, 15, 10, 40, 0).getTime();

    const scheduledSvc = makeService({ status: 'scheduled', dwellMinutes: 15 });
    expect(
      evaluateServiceCheckInEligibility([scheduledSvc], scheduledSvc.id, null, {
        nowMs: insideWindowMs,
      })
    ).toMatchObject({
      eligible: true,
      reasonCode: 'ELIGIBLE',
      service: scheduledSvc,
    });

    expect(
      evaluateServiceCheckInEligibility([scheduledSvc], scheduledSvc.id, null, {
        nowMs: withinAllowanceMs,
      })
    ).toMatchObject({
      eligible: true,
      reasonCode: 'ELIGIBLE',
      service: scheduledSvc,
    });

    const openSvc = makeService({ status: 'open' });
    expect(
      evaluateServiceCheckInEligibility([openSvc], openSvc.id, null, {
        nowMs: insideWindowMs,
        defaultAllowanceMinutes: 10,
      })
    ).toMatchObject({
      eligible: true,
      reasonCode: 'ELIGIBLE',
      service: openSvc,
    });
  });

  it('blocks check-in when a service is outside its scheduled window (before start or after end + allowance)', () => {
    const beforeWindowMs = new Date(2026, 10, 15, 7, 30, 0).getTime();
    const afterAllowanceMs = new Date(2026, 10, 15, 10, 46, 0).getTime();
    const svc = makeService({ status: 'scheduled', dwellMinutes: 15 });

    const earlyRes = evaluateServiceCheckInEligibility([svc], svc.id, null, {
      nowMs: beforeWindowMs,
    });
    expect(earlyRes.eligible).toBe(false);
    expect(earlyRes.reasonCode).toBe('SERVICE_CLOSED');

    const expiredRes = evaluateServiceCheckInEligibility([svc], svc.id, null, {
      nowMs: afterAllowanceMs,
    });
    expect(expiredRes.eligible).toBe(false);
    expect(expiredRes.reasonCode).toBe('SERVICE_CLOSED');
  });

  it('blocks check-in when the service is closed or cancelled', () => {
    const insideWindowMs = new Date(2026, 10, 15, 9, 0, 0).getTime();
    const closedSvc = makeService({ status: 'closed' });
    const closedRes = evaluateServiceCheckInEligibility([closedSvc], closedSvc.id, null, {
      nowMs: insideWindowMs,
    });
    expect(closedRes.eligible).toBe(false);
    expect(closedRes.reasonCode).toBe('SERVICE_CLOSED');

    const cancelledSvc = makeService({ status: 'cancelled' });
    const cancelledRes = evaluateServiceCheckInEligibility([cancelledSvc], cancelledSvc.id, null, {
      nowMs: insideWindowMs,
    });
    expect(cancelledRes.eligible).toBe(false);
    expect(cancelledRes.reasonCode).toBe('SERVICE_CANCELLED');
  });

  it('falls back to first scheduled service when targetServiceId is omitted and fallback matches inside window', () => {
    const insideWindowMs = new Date(2026, 10, 15, 9, 0, 0).getTime();
    const scheduledSvc = makeService({ status: 'scheduled' });
    const res = evaluateServiceCheckInEligibility([scheduledSvc], undefined, scheduledSvc, {
      nowMs: insideWindowMs,
    });
    expect(res.eligible).toBe(true);
    expect(res.service?.id).toBe(scheduledSvc.id);
  });
});

describe('computeServiceBinaryStatus', () => {
  it('returns live inside window and closed outside window or when manually closed', () => {
    const duringWindow = new Date(2026, 10, 15, 9, 0, 0).getTime();
    const afterWindow = new Date(2026, 10, 15, 11, 30, 0).getTime();

    expect(
      computeServiceBinaryStatus({
        date: '2026-11-15',
        startsAt: '08:00',
        endsAt: '10:30',
        allowanceMinutes: 15,
        rawStatus: 'active',
        nowMs: duringWindow,
      })
    ).toBe('live');

    expect(
      computeServiceBinaryStatus({
        date: '2026-11-15',
        startsAt: '08:00',
        endsAt: '10:30',
        allowanceMinutes: 15,
        rawStatus: 'active',
        nowMs: afterWindow,
      })
    ).toBe('closed');

    expect(
      computeServiceBinaryStatus({
        date: '2026-11-15',
        startsAt: '08:00',
        endsAt: '10:30',
        allowanceMinutes: 15,
        rawStatus: 'closed',
        nowMs: duringWindow,
      })
    ).toBe('closed');
  });
});
