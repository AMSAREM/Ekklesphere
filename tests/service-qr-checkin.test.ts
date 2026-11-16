// tests/service-qr-checkin.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../server';
import { signToken, TEST_ANCHOR_ORGANIZATION_ID } from '../lib/auth';
import { platformStore } from '../src/server/platformStore';
import {
  buildServiceQrCheckInUrl,
  formatServiceShortCode,
  parseServiceQrPayload,
} from '../src/utils/serviceQr';

describe('Scheduled Service QR Check-In System', () => {
  const OTHER_ORG_ID = 'a0000000-0000-4000-8000-000000000099';

  const adminToken = signToken({
    id: 'user-qr-admin',
    email: 'qr-admin@ekklesphere.church',
    role: 'admin',
    name: 'QR Admin',
    organization_id: TEST_ANCHOR_ORGANIZATION_ID,
  });

  const usherToken = signToken({
    id: 'user-qr-usher',
    email: 'qr-usher@ekklesphere.church',
    role: 'usher',
    name: 'Door Usher',
    organization_id: TEST_ANCHOR_ORGANIZATION_ID,
  });

  const memberToken = signToken({
    id: 'user-qr-member-login',
    email: 'kofi.boateng@ekklesphere.church',
    role: 'member',
    name: 'Kofi Boateng',
    organization_id: TEST_ANCHOR_ORGANIZATION_ID,
  });

  const groupLeaderToken = signToken({
    id: 'user-qr-leader-login',
    email: 'efua.mensah@ekklesphere.church',
    role: 'group_leader',
    name: 'Efua Mensah',
    organization_id: TEST_ANCHOR_ORGANIZATION_ID,
  });

  const otherOrgAdminToken = signToken({
    id: 'user-other-org-admin',
    email: 'other-admin@ekklesphere.church',
    role: 'admin',
    name: 'Other Org Admin',
    organization_id: OTHER_ORG_ID,
  });

  beforeEach(() => {
    platformStore.resetForTests();
  });

  it('parses URL deep links, custom codes, JSON payloads, short codes, and UUIDs accurately', () => {
    const svcId = 'd4f1a2b3-c4e5-4678-9abc-1234567890ef';
    const url = buildServiceQrCheckInUrl({
      origin: 'https://ekklesphere.example.org',
      serviceId: svcId,
      qrToken: 'signedTok_12345',
      organizationId: TEST_ANCHOR_ORGANIZATION_ID,
    });

    expect(parseServiceQrPayload(url)).toEqual({
      serviceId: svcId,
      token: 'signedTok_12345',
      orgId: TEST_ANCHOR_ORGANIZATION_ID,
    });

    expect(
      parseServiceQrPayload(`EKKLESPHERE:SERVICE:${svcId}:signedTok_12345:${TEST_ANCHOR_ORGANIZATION_ID}`)
    ).toEqual({
      serviceId: svcId,
      token: 'signedTok_12345',
      orgId: TEST_ANCHOR_ORGANIZATION_ID,
    });

    expect(
      parseServiceQrPayload(
        JSON.stringify({ type: 'service_checkin', serviceId: svcId, token: 'tok99' })
      )
    ).toEqual({
      serviceId: svcId,
      token: 'tok99',
      orgId: undefined,
    });

    const shortCode = formatServiceShortCode(svcId);
    expect(parseServiceQrPayload(shortCode, [{ id: svcId }])).toEqual({
      serviceId: svcId,
    });

    expect(parseServiceQrPayload(svcId, [{ id: svcId }])).toEqual({
      serviceId: svcId,
    });

    expect(parseServiceQrPayload('MEM-AB1234')).toBeNull();
  });

  it('issues signed QR tokens for staff and blocks members or cross-org callers', async () => {
    const now = Date.now();
    const liveSvc = await platformStore.createEvent(TEST_ANCHOR_ORGANIZATION_ID, {
      name: 'Sunday First Service',
      date: new Date(now).toISOString().split('T')[0],
      startTimeIso: new Date(now - 30 * 60_000).toISOString(),
      endTimeIso: new Date(now + 60 * 60_000).toISOString(),
      dwellMin: 15,
      status: 'active',
      expectedAttendance: 250,
    });

    // Member role cannot request staff QR generation endpoint directly
    const memberQrRes = await request(app)
      .get(`/api/events/${liveSvc.id}/qr`)
      .set('Authorization', `Bearer ${memberToken}`);
    expect(memberQrRes.status).toBe(403);

    // Cross-org admin gets 404 for another tenant's service
    const crossOrgRes = await request(app)
      .get(`/api/events/${liveSvc.id}/qr`)
      .set('Authorization', `Bearer ${otherOrgAdminToken}`);
    expect(crossOrgRes.status).toBe(404);

    // Org usher/admin gets cryptographically signed QR payload & deep link
    const usherQrRes = await request(app)
      .get(`/api/events/${liveSvc.id}/qr`)
      .set('Authorization', `Bearer ${usherToken}`);
    expect(usherQrRes.status).toBe(200);
    expect(usherQrRes.body.serviceId).toBe(liveSvc.id);
    expect(usherQrRes.body.status).toBe('live');
    expect(typeof usherQrRes.body.qrToken).toBe('string');
    expect(usherQrRes.body.qrToken.length).toBeGreaterThanOrEqual(16);
    expect(usherQrRes.body.checkInPath).toContain(`serviceId=${liveSvc.id}`);
    expect(usherQrRes.body.checkInPath).toContain(`token=${usherQrRes.body.qrToken}`);
  });

  it('completes member & group_leader self check-in via signed Service QR and records posted_qr attendance', async () => {
    const createdMemberRes = await request(app)
      .post('/api/members')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        firstName: 'Kofi',
        lastName: 'Boateng',
        email: 'kofi.boateng@ekklesphere.church',
        phoneE164: '+233244100200',
        homeCellGroup: 'Cantonments Cell',
      });
    expect(createdMemberRes.status).toBe(201);
    const memberId = createdMemberRes.body.id;

    const now = Date.now();
    const liveSvc = await platformStore.createEvent(TEST_ANCHOR_ORGANIZATION_ID, {
      name: 'Midweek Communion Service',
      date: new Date(now).toISOString().split('T')[0],
      startTimeIso: new Date(now - 20 * 60_000).toISOString(),
      endTimeIso: new Date(now + 70 * 60_000).toISOString(),
      dwellMin: 15,
      status: 'active',
      expectedAttendance: 120,
    });

    const qrMetaRes = await request(app)
      .get(`/api/events/${liveSvc.id}/qr`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(qrMetaRes.status).toBe(200);
    const { qrToken } = qrMetaRes.body;

    // 1. Rejects missing token for member self-checkin
    const missingTokenRes = await request(app)
      .post(`/api/events/${liveSvc.id}/qr-checkin`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({});
    expect(missingTokenRes.status).toBe(400);
    expect(missingTokenRes.body.code).toBe('QR_TOKEN_REQUIRED');

    // 2. Rejects tampered token
    const tamperedRes = await request(app)
      .post(`/api/events/${liveSvc.id}/qr-checkin`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ qrToken: 'tampered_forged_token_00' });
    expect(tamperedRes.status).toBe(403);
    expect(tamperedRes.body.code).toBe('INVALID_QR_TOKEN');

    // 3. Succeeds with genuine token and resolves canonical member profile ID
    const checkInRes = await request(app)
      .post(`/api/events/${liveSvc.id}/qr-checkin`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ qrToken });
    expect(checkInRes.status).toBe(200);
    expect(checkInRes.body.success).toBe(true);
    expect(checkInRes.body.alreadyCheckedIn).toBe(false);
    expect(checkInRes.body.record.personId).toBe(memberId);
    expect(checkInRes.body.record.method).toBe('posted_qr');
    expect(checkInRes.body.record.serviceInstanceId).toBe(liveSvc.id);

    // 4. Repeated scan is idempotent
    const repeatRes = await request(app)
      .post(`/api/events/${liveSvc.id}/qr-checkin`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ qrToken });
    expect(repeatRes.status).toBe(200);
    expect(repeatRes.body.alreadyCheckedIn).toBe(true);

    // 5. Group leader can also check in cleanly via QR
    const leaderCheckInRes = await request(app)
      .post(`/api/events/${liveSvc.id}/qr-checkin`)
      .set('Authorization', `Bearer ${groupLeaderToken}`)
      .send({ qrToken });
    expect(leaderCheckInRes.status).toBe(200);
    expect(leaderCheckInRes.body.success).toBe(true);
    expect(leaderCheckInRes.body.record.method).toBe('posted_qr');

    // 6. Group leader self check-in via /api/live-checkins is also permitted
    const leaderLiveRes = await request(app)
      .post('/api/live-checkins')
      .set('Authorization', `Bearer ${groupLeaderToken}`)
      .send({
        personId: 'user-qr-leader-login',
        serviceInstanceId: liveSvc.id,
        method: 'posted_qr',
      });
    expect(leaderLiveRes.status).toBe(200);
  });

  it('rejects Service QR check-ins when scheduled service is closed or outside active window', async () => {
    const pastSvc = await platformStore.createEvent(TEST_ANCHOR_ORGANIZATION_ID, {
      name: 'Yesterday Evening Revival',
      date: '2026-01-10',
      startTimeIso: '2026-01-10T18:00:00.000Z',
      endTimeIso: '2026-01-10T20:00:00.000Z',
      dwellMin: 15,
      status: 'closed',
      expectedAttendance: 100,
    });

    const qrRes = await request(app)
      .get(`/api/events/${pastSvc.id}/qr`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(qrRes.status).toBe(200);
    expect(qrRes.body.status).toBe('closed');

    const checkInRes = await request(app)
      .post(`/api/events/${pastSvc.id}/qr-checkin`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ qrToken: qrRes.body.qrToken });
    expect(checkInRes.status).toBe(400);
    expect(checkInRes.body.code).toBe('SERVICE_NOT_OPEN');
  });
});
