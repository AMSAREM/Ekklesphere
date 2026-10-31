// tests/api.test.ts - Ekklesphere Church Management & Role-Level Security Test Suite
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../server';
import { signToken, type ChurchRole } from '../lib/auth';

describe('Ekklesphere Church Management & GPS Premise Suite', () => {
  const adminToken = signToken({
    id: 'user-admin-1',
    email: 'admin@ekklesphere.church',
    role: 'admin',
    name: 'Church Administrator',
  });

  const pastorToken = signToken({
    id: 'user-pastor-1',
    email: 'pastor@ekklesphere.church',
    role: 'pastor',
    name: 'Lead Pastor',
  });

  const usherToken = signToken({
    id: 'user-usher-1',
    email: 'usher@ekklesphere.church',
    role: 'usher',
    name: 'Door Usher',
  });

  const memberToken = signToken({
    id: 'm-elena',
    email: 'elena@ekklesphere.church',
    role: 'member',
    name: 'Elena Mends',
  });

  it('GET /api/health returns healthy server status without credentials', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
    expect(res.body.app).toBe('Ekklesphere Church Management');
  });

  it('POST /api/auth/token issues signed cryptographic JWT token', async () => {
    const res = await request(app)
      .post('/api/auth/token')
      .send({
        id: 'usr-new-1',
        email: 'member@ekklesphere.church',
        role: 'member',
        name: 'New Member',
      });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.role).toBe('member');
  });

  describe('Church Premise GPS Role-Level Security', () => {
    it('REJECTS unauthenticated POST /api/campus-premise with 401', async () => {
      const res = await request(app)
        .post('/api/campus-premise')
        .send({ lat: 5.6037, lng: -0.187 });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('unauthorized');
    });

    it('REJECTS member role modifying premise with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/campus-premise')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ lat: 5.6037, lng: -0.187 });
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('forbidden');
    });

    it('REJECTS usher role modifying premise with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/campus-premise')
        .set('Authorization', `Bearer ${usherToken}`)
        .send({ lat: 5.6037, lng: -0.187 });
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('forbidden');
    });

    it('PERMITS administrator to save church premise GPS coordinates', async () => {
      const res = await request(app)
        .post('/api/campus-premise')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          lat: 5.6037,
          lng: -0.1870,
          churchName: 'PIWC KWADASO',
          campusName: 'Main Worship Auditorium',
          campusAddress: 'Kwadaso Estate, Kumasi / Accra',
          innerGeofenceMeters: 50,
          outerGeofenceMeters: 300,
          dwellTimeMinutes: 5,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.configured).toBe(true);
      expect(res.body.site).toBeDefined();
      expect(res.body.site.lat).toBe(5.6037);
      expect(res.body.site.lng).toBe(-0.1870);
      expect(res.body.premiseSettings.churchName).toBe('PIWC KWADASO');
    });

    it('GET /api/campus-premise returns the saved church premise GPS location', async () => {
      const res = await request(app).get('/api/campus-premise');
      expect(res.status).toBe(200);
      expect(res.body.configured).toBe(true);
      expect(res.body.premiseSettings.lat).toBe(5.6037);
      expect(res.body.premiseSettings.lng).toBe(-0.1870);
    });

    it('POST /api/campus-premise rejects invalid latitude or longitude', async () => {
      const res = await request(app)
        .post('/api/campus-premise')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          lat: 999, // Invalid latitude
          lng: -0.1870,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_premise_coordinates');
    });

    it('POST /api/campus-premise/resolve-link extracts GPS coordinates directly from coordinate string', async () => {
      const res = await request(app)
        .post('/api/campus-premise/resolve-link')
        .set('Authorization', `Bearer ${pastorToken}`)
        .send({
          input: '5.603717, -0.186964',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.lat).toBeCloseTo(5.603717, 4);
      expect(res.body.lng).toBeCloseTo(-0.186964, 4);
    });
  });

  describe('Attendance & Check-in Role-Level Security', () => {
    it('REJECTS member checking in another person with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/live-checkins')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          personId: 'm-someone-else',
          personName: 'Kwame Osei',
          serviceInstanceId: 'svc-sun-1',
          method: 'geofence',
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('forbidden');
    });

    it('PERMITS member checking in for their own person ID', async () => {
      const res = await request(app)
        .post('/api/live-checkins')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          personId: 'm-elena',
          personName: 'Elena Mends',
          serviceInstanceId: 'svc-sun-1',
          method: 'geofence',
          confidence: 95,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.record.personName).toBe('Elena Mends');
    });

    it('PERMITS usher checking in any congregation member', async () => {
      const res = await request(app)
        .post('/api/live-checkins')
        .set('Authorization', `Bearer ${usherToken}`)
        .send({
          personId: 'm-guest-2',
          personName: 'Kofi Mensah',
          serviceInstanceId: 'svc-sun-1',
          method: 'usher',
          confidence: 100,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.record.personName).toBe('Kofi Mensah');
    });

    it('REJECTS member attempting to delete check-in logs with 403 Forbidden', async () => {
      const res = await request(app)
        .delete('/api/live-checkins/m-guest-2')
        .set('Authorization', `Bearer ${memberToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('forbidden');
    });

    it('PERMITS admin or pastor to delete attendance check-in records', async () => {
      const res = await request(app)
        .delete('/api/live-checkins/m-guest-2')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('POST /attendance/events verifies arrival signal against church premise geofence', async () => {
      const eventRes = await request(app)
        .post('/attendance/events')
        .send({
          clientEventId: '00000000-0000-0000-0000-000000000001',
          type: 'enter',
          source: 'geofence',
          lat: 5.6037,
          lng: -0.1870,
          accuracyM: 10,
          deviceTime: new Date().toISOString(),
        });

      expect(eventRes.status).toBe(200);
      expect(eventRes.body.status).toBe('accepted');
      expect(eventRes.body.distance_m).toBeLessThanOrEqual(15);
    });

    it('REJECTS mock location GPS spoofing attempt', async () => {
      const spoofRes = await request(app)
        .post('/api/attendance/events')
        .send({
          clientEventId: '00000000-0000-0000-0000-000000000002',
          type: 'enter',
          source: 'geofence',
          lat: 5.6037,
          lng: -0.1870,
          accuracyM: 5,
          isMock: true,
          deviceTime: new Date().toISOString(),
        });

      expect(spoofRes.status).toBe(200);
      expect(spoofRes.body.status).toBe('rejected');
      expect(spoofRes.body.flag_reasons).toContain('mock_location');
    });

    it('REJECTS attendance arrival signal outside church geofence perimeter', async () => {
      const outsideRes = await request(app)
        .post('/api/attendance/events')
        .send({
          clientEventId: '00000000-0000-0000-0000-000000000003',
          type: 'enter',
          source: 'geofence',
          lat: 5.6150,
          lng: -0.1870,
          accuracyM: 8,
          isMock: false,
          deviceTime: new Date().toISOString(),
        });

      expect(outsideRes.status).toBe(200);
      expect(outsideRes.body.status).toBe('rejected');
      expect(outsideRes.body.distance_m).toBeGreaterThan(500);
      expect(outsideRes.body.flag_reasons.some((r: string) => r.startsWith('outside_fence_'))).toBe(true);
    });

    it('FLAGS attendance event in perimeter grace margin for staff review', async () => {
      const marginRes = await request(app)
        .post('/api/attendance/events')
        .send({
          clientEventId: '00000000-0000-0000-0000-000000000004',
          type: 'enter',
          source: 'geofence',
          lat: 5.6042,
          lng: -0.1870,
          accuracyM: 10,
          isMock: false,
          deviceTime: new Date().toISOString(),
        });

      expect(marginRes.status).toBe(200);
      expect(marginRes.body.status).toBe('flagged');
      expect(marginRes.body.flag_reasons.some((r: string) => r.startsWith('perimeter_margin_'))).toBe(true);
    });

    it('GET /api/attendance/raw-events returns telemetry audit trail', async () => {
      const res = await request(app).get('/api/attendance/raw-events');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('GET /api/attendance/shifts returns computed user shifts', async () => {
      const res = await request(app).get('/api/attendance/shifts');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('POST /api/attendance/auto-close closes expired open shifts', async () => {
      const res = await request(app)
        .post('/api/attendance/auto-close')
        .send({ maxHours: 12 });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(typeof res.body.closedShifts).toBe('number');
    });

    it('GET /api/attendance/insights rejects unauthenticated requests and returns live insights for staff', async () => {
      const unauthRes = await request(app).get('/api/attendance/insights');
      expect(unauthRes.status).toBe(401);

      await request(app)
        .post('/api/live-checkins')
        .set('Authorization', `Bearer ${pastorToken}`)
        .send({
          personId: 'person-insight-1',
          personName: 'Kofi Mensah',
          serviceInstanceId: 'svc-insights-test',
          method: 'geofence',
          confidence: 92,
          late: false,
          distanceM: 18,
        });

      await request(app)
        .post('/api/live-checkins')
        .set('Authorization', `Bearer ${pastorToken}`)
        .send({
          personId: 'person-insight-2',
          personName: 'Abena Osei',
          serviceInstanceId: 'svc-insights-test',
          method: 'usher',
          confidence: 98,
          late: true,
        });

      const res = await request(app)
        .get('/api/attendance/insights?serviceId=svc-insights-test')
        .set('Authorization', `Bearer ${pastorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.totalCheckedIn).toBe(2);
      expect(res.body.onTimeCount).toBe(1);
      expect(res.body.lateCount).toBe(1);
      expect(res.body.avgConfidence).toBe(95);
      expect(res.body.avgDistanceM).toBe(18);
      expect(res.body.methodBreakdown.geofence).toBe(1);
      expect(res.body.methodBreakdown.usher).toBe(1);
      expect(res.body.telemetrySummary).toBeDefined();
      expect(typeof res.body.telemetrySummary.accepted).toBe('number');
      expect(typeof res.body.telemetrySummary.mockAttempts).toBe('number');
    });
  });

  describe('Church Events & Directory Role-Level Security', () => {
    it('GET /api/events returns church worship services', async () => {
      const res = await request(app).get('/api/events');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('REJECTS member creating church service event with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ name: 'Unauthorized Youth Service', startsAt: '18:00' });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('forbidden');
    });

    it('PERMITS pastor or admin creating church service events with scheduled date', async () => {
      const res = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${pastorToken}`)
        .send({
          name: 'Friday Revival Night',
          date: '2026-11-13',
          startsAt: '18:30',
          endsAt: '21:00',
        });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Friday Revival Night');
      expect(res.body.date).toBe('2026-11-13');
      expect(res.body.start_time).toContain('2026-11-13T18:30:00');
      expect(res.body.end_time).toContain('2026-11-13T21:00:00');
    });

    it('REJECTS member viewing entire church roster with 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/members')
        .set('Authorization', `Bearer ${memberToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('forbidden');
    });

    it('PERMITS pastor and usher viewing congregation roster', async () => {
      const res = await request(app)
        .get('/api/members')
        .set('Authorization', `Bearer ${pastorToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('PERMITS admin or pastor registering a new member into directory', async () => {
      const res = await request(app)
        .post('/api/members')
        .set('Authorization', `Bearer ${pastorToken}`)
        .send({
          firstName: 'Ama',
          lastName: 'Boateng',
          phoneE164: '+233241002000',
          groupName: 'Grace Fellowship',
        });

      expect(res.status).toBe(201);
      expect(res.body.firstName).toBe('Ama');
    });
  });

  describe('Push Notifications Role-Level Security', () => {
    it('POST /api/notifications/subscribe registers a member push notification device', async () => {
      const res = await request(app)
        .post('/api/notifications/subscribe')
        .send({
          id: 'sub-test-elena-1',
          endpoint: 'https://fcm.googleapis.com/fcm/send/test-token-123',
          personId: 'm-elena',
          personName: 'Elena Mends',
          userAgent: 'Mozilla/5.0 (Test Environment)',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.subscription.personName).toBe('Elena Mends');
    });

    it('REJECTS member dispatching broadcast notification with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/notifications/send')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          title: 'Spam Alert',
          body: 'Unauthorized broadcast',
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('forbidden');
    });

    it('PERMITS pastor or admin dispatching sanctuary broadcast notification', async () => {
      const res = await request(app)
        .post('/api/notifications/send')
        .set('Authorization', `Bearer ${pastorToken}`)
        .send({
          title: 'Sunday Service Reminder',
          body: 'First service starts in 45 minutes.',
          topic: 'attendance',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.title).toBe('Sunday Service Reminder');
    });
  });

  describe('Platform Administration & Backdoor Purge Tests', () => {
    it('GET /api/license/status rejects unauthenticated requests with 401', async () => {
      const res = await request(app).get('/api/license/status');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('unauthorized');
    });

    it('GET /api/license/status permits authenticated pastor or admin', async () => {
      const res = await request(app)
        .get('/api/license/status')
        .set('Authorization', `Bearer ${pastorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('active');
      expect(res.body.tier).toBeDefined();
    });

    it('GET /api/auth/me rejects invalid and expired tokens', async () => {
      const invalidRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid.token.payload');
      expect(invalidRes.status).toBe(401);

      const expiredToken = signToken(
        {
          id: 'user-expired',
          email: 'expired@ekklesphere.church',
          role: 'usher',
        },
        -1
      );

      const expiredRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`);
      expect(expiredRes.status).toBe(401);
      expect(expiredRes.body.message).toContain('expired');
    });

    it('VERIFY BACKDOOR ERADICATED: User named "elena" with role "usher" is DENIED super-admin actions', async () => {
      const elenaNonAdminToken = signToken({
        id: 'usr-elena-usher',
        email: 'elena@ekklesphere.church',
        role: 'usher' as ChurchRole,
        name: 'Elena Mends',
      });

      const res = await request(app)
        .post('/api/admin/system-check')
        .set('Authorization', `Bearer ${elenaNonAdminToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('forbidden');
    });

    it('PERMITS genuine super_admin and creator accounts', async () => {
      const superAdminToken = signToken({
        id: 'usr-admin-1',
        email: 'admin@ekklesphere.church',
        role: 'super_admin',
        name: 'Ekklesphere Overseer',
      });

      const res = await request(app)
        .post('/api/admin/system-check')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.callerRole).toBe('super_admin');
    });
  });
});
