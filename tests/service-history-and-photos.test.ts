// tests/service-history-and-photos.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../server';
import { signToken, TEST_ANCHOR_ORGANIZATION_ID } from '../lib/auth';
import { platformStore } from '../src/server/platformStore';

describe('Service History Archive & Uploaded Member Photo Persistence', () => {
  const adminToken = signToken({
    id: 'user-history-admin',
    email: 'history-admin@ekklesphere.church',
    role: 'admin',
    name: 'History Admin',
    organization_id: TEST_ANCHOR_ORGANIZATION_ID,
  });

  const usherToken = signToken({
    id: 'user-history-usher',
    email: 'history-usher@ekklesphere.church',
    role: 'usher',
    name: 'Door Usher',
    organization_id: TEST_ANCHOR_ORGANIZATION_ID,
  });

  const memberToken = signToken({
    id: 'member-history-1',
    email: 'member-history@ekklesphere.church',
    role: 'member',
    name: 'Grace Mensah',
    organization_id: TEST_ANCHOR_ORGANIZATION_ID,
  });

  beforeEach(() => {
    platformStore.resetForTests();
  });

  it('rejects unauthenticated and member-role requests to GET /api/services/history', async () => {
    const unauthRes = await request(app).get('/api/services/history');
    expect(unauthRes.status).toBe(401);

    const memberRes = await request(app)
      .get('/api/services/history')
      .set('Authorization', `Bearer ${memberToken}`);
    expect(memberRes.status).toBe(403);

    const usherRes = await request(app)
      .get('/api/services/history')
      .set('Authorization', `Bearer ${usherToken}`);
    expect(usherRes.status).toBe(200);
    expect(usherRes.body.summary).toBeDefined();
    expect(Array.isArray(usherRes.body.services)).toBe(true);
  });

  it('aggregates completed, live, and upcoming services with attendee photos and isolated org boundaries', async () => {
    const uploadedAvatar =
      'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRof';
    const httpsAvatar = 'https://cdn.example.org/members/kwame-portrait.jpg';

    // 1. Create members with uploaded data-URI and HTTPS photos
    const m1 = await request(app)
      .post('/api/members')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        firstName: 'Abena',
        lastName: 'Ofori',
        email: 'abena.ofori@ekklesphere.church',
        phoneE164: '0244112233',
        homeCellGroup: 'Cantonments Cell',
        department: 'Choir',
        imageUrl: uploadedAvatar,
      });
    expect(m1.status).toBe(201);
    expect(m1.body.imageUrl).toBe(uploadedAvatar);

    const m2 = await request(app)
      .post('/api/members')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        firstName: 'Kwame',
        lastName: 'Mensah',
        email: 'kwame.mensah@ekklesphere.church',
        phoneE164: '0244556677',
        homeCellGroup: 'Osu Fellowship',
        department: 'Ushering',
        imageUrl: httpsAvatar,
      });
    expect(m2.status).toBe(201);
    expect(m2.body.imageUrl).toBe(httpsAvatar);

    const now = Date.now();
    const pastDate = '2026-01-11';
    const futureDate = '2099-12-25';
    const liveStartIso = new Date(now - 90 * 60_000).toISOString();
    // End time passed 5 minutes ago, but 30-minute allowance keeps the service LIVE
    const liveEndIso = new Date(now - 5 * 60_000).toISOString();
    const liveDate = liveStartIso.split('T')[0];

    // 2. Seed past, live-within-allowance, and future-outside-window services via store
    const pastService = await platformStore.createEvent(TEST_ANCHOR_ORGANIZATION_ID, {
      name: 'January Thanksgiving Service',
      date: pastDate,
      startTimeIso: `${pastDate}T08:00:00.000Z`,
      endTimeIso: `${pastDate}T10:30:00.000Z`,
      dwellMin: 15,
      expectedAttendance: 10,
      status: 'active',
    });

    const liveService = await platformStore.createEvent(TEST_ANCHOR_ORGANIZATION_ID, {
      name: 'Sunday Morning Encounter',
      date: liveDate,
      startTimeIso: liveStartIso,
      endTimeIso: liveEndIso,
      dwellMin: 30,
      expectedAttendance: 10,
      status: 'active',
    });

    const futureService = await platformStore.createEvent(TEST_ANCHOR_ORGANIZATION_ID, {
      name: 'Christmas Carol Night',
      date: futureDate,
      startTimeIso: `${futureDate}T18:00:00.000Z`,
      endTimeIso: `${futureDate}T20:30:00.000Z`,
      dwellMin: 15,
      expectedAttendance: 50,
      status: 'active',
    });

    // 3. Record historical check-ins across past + live services
    await platformStore.recordLiveCheckin(TEST_ANCHOR_ORGANIZATION_ID, {
      id: 'att-past-1',
      campusId: 'campus-main',
      personId: m1.body.id,
      personName: 'Abena Ofori',
      serviceInstanceId: pastService.id,
      method: 'geofence',
      confidence: 98,
      late: false,
      checkedInAt: '07:54 AM',
      checkedInIso: `${pastDate}T07:54:00.000Z`,
    });
    await platformStore.recordLiveCheckin(TEST_ANCHOR_ORGANIZATION_ID, {
      id: 'att-past-2',
      campusId: 'campus-main',
      personId: m2.body.id,
      personName: 'Kwame Mensah',
      serviceInstanceId: pastService.id,
      method: 'usher',
      confidence: 100,
      checkedInAt: '08:25 AM',
      checkedInIso: `${pastDate}T08:25:00.000Z`,
      late: true,
    });
    await platformStore.recordLiveCheckin(TEST_ANCHOR_ORGANIZATION_ID, {
      id: 'att-live-1',
      campusId: 'campus-main',
      personId: m1.body.id,
      personName: 'Abena Ofori',
      serviceInstanceId: liveService.id,
      method: 'beacon',
      confidence: 96,
      late: false,
      checkedInAt: '07:50 AM',
      checkedInIso: liveStartIso,
    });

    // 4. Create a second organisation with its own service & check-in to verify tenant isolation
    const secondOrg = await platformStore.createOrganisation({
      name: 'Kumasi Bethel Assembly',
      slug: 'kumasi-bethel',
      orgType: 'church',
      city: 'Kumasi',
      country: 'Ghana',
      autoIssueTrial: true,
    });
    const otherService = await platformStore.createEvent(secondOrg.organisation.id, {
      name: 'Other Org Private Service',
      date: pastDate,
      startTimeIso: `${pastDate}T09:00:00.000Z`,
      endTimeIso: `${pastDate}T11:00:00.000Z`,
      dwellMin: 15,
      expectedAttendance: 20,
      status: 'closed',
    });

    // 5. Fetch history via HTTP API — statuses must strictly be binary 'live' | 'closed'
    const historyRes = await request(app)
      .get('/api/services/history')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(historyRes.status).toBe(200);
    const { summary, services } = historyRes.body;

    expect(summary.totalServices).toBeGreaterThanOrEqual(3);
    expect(summary.liveServices).toBe(1);
    expect(summary.closedServices).toBeGreaterThanOrEqual(2);
    expect(summary.upcomingServices).toBe(0);
    expect(summary.totalHistoricalCheckins).toBe(3);
    expect(summary.uniqueAttendees).toBe(2);
    expect(summary.peakServiceId).toBe(pastService.id);
    expect(summary.peakServiceName).toBe('January Thanksgiving Service');
    expect(summary.peakServiceCount).toBe(2);

    // Must never leak other org's services
    expect(services.some((s: any) => s.id === otherService.id)).toBe(false);

    const pastEntry = services.find((s: any) => s.id === pastService.id);
    expect(pastEntry).toBeDefined();
    expect(pastEntry.status).toBe('closed');
    expect(pastEntry.totalCheckedIn).toBe(2);
    expect(pastEntry.fillRatePct).toBe(20);
    expect(pastEntry.onTimeCount).toBe(1);
    expect(pastEntry.lateCount).toBe(1);
    expect(pastEntry.onTimePct).toBe(50);
    expect(pastEntry.autoProximityCount).toBe(1);
    expect(pastEntry.assistedDoorCount).toBe(1);

    const liveEntry = services.find((s: any) => s.id === liveService.id);
    expect(liveEntry).toBeDefined();
    expect(liveEntry.status).toBe('live');
    expect(liveEntry.allowanceMinutes).toBe(30);

    const abenaAttendee = pastEntry.attendees.find((a: any) => a.personId === m1.body.id);
    const kwameAttendee = pastEntry.attendees.find((a: any) => a.personId === m2.body.id);
    expect(abenaAttendee.imageUrl).toBe(uploadedAvatar);
    expect(abenaAttendee.groupName).toBe('Cantonments Cell');
    expect(abenaAttendee.department).toBe('Choir');
    expect(kwameAttendee.imageUrl).toBe(httpsAvatar);
    expect(kwameAttendee.late).toBe(true);

    const futureEntry = services.find((s: any) => s.id === futureService.id);
    expect(futureEntry).toBeDefined();
    expect(futureEntry.status).toBe('closed');
    expect(futureEntry.totalCheckedIn).toBe(0);

    // 6. Verify shrinking allowance below elapsed minutes flips liveService -> closed via PATCH /api/events/:id
    const memberPatchRes = await request(app)
      .patch(`/api/events/${liveService.id}`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ allowanceMinutes: 0 });
    expect(memberPatchRes.status).toBe(403);

    const crossOrgPatchRes = await request(app)
      .patch(`/api/events/${otherService.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'closed' });
    expect(crossOrgPatchRes.status).toBe(404);

    const tightenAllowanceRes = await request(app)
      .patch(`/api/events/${liveService.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ allowanceMinutes: 1, expectedAttendance: 25 });
    expect(tightenAllowanceRes.status).toBe(200);
    expect(tightenAllowanceRes.body.dwell_min).toBe(1);

    const updatedHistoryRes = await request(app)
      .get('/api/services/history')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(updatedHistoryRes.status).toBe(200);
    const nowClosedEntry = updatedHistoryRes.body.services.find(
      (s: any) => s.id === liveService.id
    );
    expect(nowClosedEntry.status).toBe('closed');
    expect(nowClosedEntry.allowanceMinutes).toBe(1);
    expect(nowClosedEntry.expectedAttendance).toBe(25);
  });

  it('persists uploaded member photos via PUT /api/members/:id and PATCH /api/members/me/profile', async () => {
    const initialPhoto =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const updatedPhoto =
      'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEY';

    const createRes = await request(app)
      .post('/api/members')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        firstName: 'Priscilla',
        lastName: 'Boateng',
        email: 'priscilla.boateng@ekklesphere.church',
        phoneE164: '0249991122',
        imageUrl: initialPhoto,
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.imageUrl).toBe(initialPhoto);

    const updateRes = await request(app)
      .put(`/api/members/${createRes.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        imageUrl: updatedPhoto,
        department: 'Media',
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.imageUrl).toBe(updatedPhoto);

    const listRes = await request(app)
      .get('/api/members')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(listRes.status).toBe(200);
    const saved = listRes.body.find((m: any) => m.id === createRes.body.id);
    expect(saved?.imageUrl).toBe(updatedPhoto);

    // Member self-profile upload
    const selfRes = await request(app)
      .patch('/api/members/me/profile')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        imageUrl: updatedPhoto,
        preferredName: 'Grace M.',
      });

    expect(selfRes.status).toBe(200);
    expect(selfRes.body.imageUrl).toBe(updatedPhoto);
  });

  it('gracefully falls back to custom_attributes.imageUrl when Supabase lacks photo_url and image_url columns', async () => {
    const storeAny = platformStore as any;
    const prevSupabase = storeAny.supabase;
    let storedRow: Record<string, any> | null = null;
    const insertPayloads: any[] = [];
    const updatePayloads: any[] = [];

    const orgRow = {
      id: TEST_ANCHOR_ORGANIZATION_ID,
      name: 'Test Anchor Church',
      slug: 'test-anchor',
      org_type: 'church',
      status: 'active',
      created_at: new Date().toISOString(),
    };
    const licenseRow = {
      id: 'lic-anchor-1',
      organization_id: TEST_ANCHOR_ORGANIZATION_ID,
      tenant_id: TEST_ANCHOR_ORGANIZATION_ID,
      key: 'EKK-TEST-GRACE-1',
      tier: 'grace_starter',
      status: 'active',
      seats_limit: 500,
      expires_at: new Date(Date.now() + 86400_000 * 30).toISOString(),
      created_at: new Date().toISOString(),
    };

    storeAny.supabase = {
      auth: {
        admin: {
          createUser: async () => ({
            data: { user: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' } },
            error: null,
          }),
          updateUserById: async () => ({ data: { user: null }, error: null }),
          listUsers: async () => ({ data: { users: [] }, error: null }),
        },
      },
      from: (table: string) => {
        if (table === 'organizations') {
          return {
            select: () => ({
              order: async () => ({ data: [orgRow], error: null }),
              eq: () => ({ maybeSingle: async () => ({ data: orgRow, error: null }) }),
            }),
          };
        }
        if (table === 'licenses' || table === 'organization_licenses') {
          return {
            select: () => ({
              eq: () => ({
                order: async () => ({ data: [licenseRow], error: null }),
                maybeSingle: async () => ({ data: licenseRow, error: null }),
              }),
              order: async () => ({ data: [licenseRow], error: null }),
            }),
          };
        }
        if (table === 'account_credentials') {
          return {
            select: () => ({
              eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
              or: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
            }),
            upsert: async () => ({ error: null }),
          };
        }
        if (table === 'members') {
          const membersChain: any = {
            insert: (payload: Record<string, any>) => {
              insertPayloads.push(payload);
              const hasUnsupportedPhotoCols =
                'image_url' in payload || 'photo_url' in payload;
              return {
                select: () => ({
                  single: async () => {
                    if (hasUnsupportedPhotoCols) {
                      return {
                        data: null,
                        error: {
                          message:
                            "Could not find the 'photo_url' column of 'members' in the schema cache",
                        },
                      };
                    }
                    storedRow = {
                      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
                      created_at: new Date().toISOString(),
                      ...payload,
                    };
                    return { data: storedRow, error: null };
                  },
                }),
              };
            },
            update: (payload: Record<string, any>) => {
              updatePayloads.push(payload);
              const hasUnsupportedPhotoCols =
                'image_url' in payload || 'photo_url' in payload;
              return {
                eq: () => ({
                  eq: () => ({
                    select: () => ({
                      maybeSingle: async () => {
                        if (hasUnsupportedPhotoCols) {
                          return {
                            data: null,
                            error: {
                              message:
                                "Could not find the 'image_url' column of 'members' in the schema cache",
                            },
                          };
                        }
                        storedRow = { ...(storedRow || {}), ...payload };
                        return { data: storedRow, error: null };
                      },
                    }),
                  }),
                }),
              };
            },
            select: (_cols?: string, opts?: { count?: string; head?: boolean }) => ({
              eq: () => ({
                maybeSingle: async () => ({ data: storedRow, error: null }),
                order: async () => ({
                  data: storedRow ? [storedRow] : [],
                  count: storedRow ? 1 : 0,
                  error: null,
                }),
                eq: () => ({
                  maybeSingle: async () => ({ data: storedRow, error: null }),
                }),
                then: (resolve: any) =>
                  resolve({
                    data: opts?.head ? null : storedRow ? [storedRow] : [],
                    count: storedRow ? 1 : 0,
                    error: null,
                  }),
              }),
            }),
          };
          return membersChain;
        }
        const makeEmptySelectChain = (): any => {
          const emptyRes = { data: [], count: 0, error: null };
          const chain: any = {
            eq: () => chain,
            neq: () => chain,
            in: () => chain,
            or: () => chain,
            order: () => chain,
            limit: () => chain,
            maybeSingle: async () => ({ data: null, error: null }),
            single: async () => ({ data: null, error: null }),
            then: (resolve?: any, reject?: any) => Promise.resolve(emptyRes).then(resolve, reject),
          };
          return chain;
        };
        return {
          select: () => makeEmptySelectChain(),
          insert: () => makeEmptySelectChain(),
          upsert: () => makeEmptySelectChain(),
          update: () => makeEmptySelectChain(),
          delete: () => makeEmptySelectChain(),
        };
      },
    };

    try {
      const uploadedPhoto = 'data:image/jpeg;base64,/9j/4AAQFallbackTest';
      const created = await platformStore.createMember(
        TEST_ANCHOR_ORGANIZATION_ID,
        {
          firstName: 'Samuel',
          lastName: 'Addo',
          email: 'samuel.addo@example.org',
          imageUrl: uploadedPhoto,
        },
        { skipAutoCredentials: true }
      );

      expect(created.imageUrl).toBe(uploadedPhoto);
      expect(insertPayloads.length).toBe(3); // extendedInsert -> baseInsert -> minimalInsert
      expect((storedRow as Record<string, any> | null)?.custom_attributes?.imageUrl).toBe(
        uploadedPhoto
      );

      const newUploadedPhoto = 'data:image/jpeg;base64,/9j/4AAQUpdatedFallbackTest';
      const updated = await platformStore.updateMember(
        TEST_ANCHOR_ORGANIZATION_ID,
        created.id,
        {
          imageUrl: newUploadedPhoto,
        }
      );

      expect(updated.imageUrl).toBe(newUploadedPhoto);
      expect(updatePayloads.filter((p) => 'custom_attributes' in p).length).toBe(3); // patch -> fallbackPatch -> minimalPatch
      expect((storedRow as Record<string, any> | null)?.custom_attributes?.imageUrl).toBe(
        newUploadedPhoto
      );
    } finally {
      storeAny.supabase = prevSupabase;
    }
  });

  it('maps closed services to Postgres-safe completed status and resolves placeholder service IDs on Supabase check-in & delete', async () => {
    const storeAny = platformStore as any;
    const prevSupabase = storeAny.supabase;

    const eventId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    const memberId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    const nowIso = new Date().toISOString();
    const endFutureIso = new Date(Date.now() + 90 * 60_000).toISOString();

    const eventPayloads: any[] = [];
    const attendanceUpserts: any[] = [];
    let attendanceRows: any[] = [];
    let storedEvent: Record<string, any> = {
      id: eventId,
      organization_id: TEST_ANCHOR_ORGANIZATION_ID,
      name: 'Sunday Worship Service',
      start_time: nowIso,
      end_time: endFutureIso,
      dwell_min: 15,
      status: 'active',
      description: 'Expected attendance: 50',
    };

    const orgRow = {
      id: TEST_ANCHOR_ORGANIZATION_ID,
      name: 'Test Anchor Church',
      slug: 'test-anchor',
      org_type: 'church',
      status: 'active',
      created_at: nowIso,
    };
    const licenseRow = {
      id: 'lic-anchor-2',
      organization_id: TEST_ANCHOR_ORGANIZATION_ID,
      tenant_id: TEST_ANCHOR_ORGANIZATION_ID,
      key: 'EKK-TEST-GRACE-2',
      tier: 'grace_starter',
      status: 'active',
      seats_limit: 500,
      expires_at: new Date(Date.now() + 86400_000 * 30).toISOString(),
      created_at: nowIso,
    };
    const memberRow = {
      id: memberId,
      organization_id: TEST_ANCHOR_ORGANIZATION_ID,
      first_name: 'Kofi',
      last_name: 'Boateng',
      email: 'kofi@example.org',
      phone: '+233244000111',
      status: 'member',
      created_at: nowIso,
    };

    const makeEmptyChain = (): any => {
      const res = { data: [], count: 0, error: null };
      const c: any = {
        eq: () => c,
        neq: () => c,
        in: () => c,
        or: () => c,
        order: () => c,
        limit: () => c,
        maybeSingle: async () => ({ data: null, error: null }),
        single: async () => ({ data: null, error: null }),
        then: (resolve?: any, reject?: any) => Promise.resolve(res).then(resolve, reject),
      };
      return c;
    };

    let allowMemberLookup = true;

    storeAny.supabase = {
      auth: { admin: { listUsers: async () => ({ data: { users: [] }, error: null }) } },
      from: (table: string) => {
        if (table === 'organizations') {
          return {
            select: () => ({
              order: async () => ({ data: [orgRow], error: null }),
              eq: () => ({ maybeSingle: async () => ({ data: orgRow, error: null }) }),
            }),
          };
        }
        if (table === 'licenses' || table === 'organization_licenses') {
          return {
            select: () => ({
              eq: () => ({
                order: async () => ({ data: [licenseRow], error: null }),
                maybeSingle: async () => ({ data: licenseRow, error: null }),
              }),
              order: async () => ({ data: [licenseRow], error: null }),
            }),
          };
        }
        if (table === 'events') {
          const selectChain: any = {
            eq: () => selectChain,
            order: () => selectChain,
            limit: () => selectChain,
            maybeSingle: async () => ({ data: storedEvent, error: null }),
            then: (resolve?: any) => Promise.resolve({ data: [storedEvent], error: null }).then(resolve),
          };
          return {
            select: () => selectChain,
            insert: (payload: any) => {
              eventPayloads.push({ op: 'insert', ...payload });
              storedEvent = { id: eventId, ...payload };
              return {
                select: () => ({
                  single: async () => ({ data: storedEvent, error: null }),
                }),
              };
            },
            update: (payload: any) => {
              eventPayloads.push({ op: 'update', ...payload });
              storedEvent = { ...storedEvent, ...payload };
              return {
                eq: () => ({
                  eq: () => ({
                    select: () => ({
                      maybeSingle: async () => ({ data: storedEvent, error: null }),
                    }),
                  }),
                }),
              };
            },
            delete: () => makeEmptyChain(),
          };
        }
        if (table === 'members') {
          const membersChain: any = {
            eq: () => membersChain,
            or: () => membersChain,
            order: () => membersChain,
            limit: () => membersChain,
            maybeSingle: async () => ({
              data: allowMemberLookup ? memberRow : null,
              error: null,
            }),
            then: (resolve?: any) =>
              Promise.resolve({
                data: allowMemberLookup ? [memberRow] : [],
                count: allowMemberLookup ? 1 : 0,
                error: null,
              }).then(resolve),
          };
          return { select: () => membersChain };
        }
        if (table === 'attendance') {
          const attSelectChain: any = {
            eq: () => attSelectChain,
            order: () => attSelectChain,
            limit: () => attSelectChain,
            then: (resolve?: any) => Promise.resolve({ data: attendanceRows, error: null }).then(resolve),
          };
          const attDeleteChain: any = {
            eq: () => attDeleteChain,
            then: (resolve?: any) => {
              attendanceRows = [];
              return Promise.resolve({ data: null, error: null }).then(resolve);
            },
          };
          return {
            select: () => attSelectChain,
            upsert: async (payload: any) => {
              attendanceUpserts.push(payload);
              attendanceRows = [
                {
                  id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
                  ...payload,
                  members: memberRow,
                },
              ];
              return { error: null };
            },
            delete: () => attDeleteChain,
          };
        }
        return {
          select: () => makeEmptyChain(),
          insert: () => makeEmptyChain(),
          upsert: () => makeEmptyChain(),
          update: () => makeEmptyChain(),
          delete: () => makeEmptyChain(),
        };
      },
    };

    try {
      // 1. Closing a service maps 'closed' -> 'completed' for Postgres events_status_check constraint
      const closeRes = await request(app)
        .patch(`/api/events/${eventId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'closed' });
      expect(closeRes.status).toBe(200);
      expect(eventPayloads.some((p) => p.op === 'update' && p.status === 'completed')).toBe(true);

      // 2. Service History strictly returns binary status 'closed'
      const closedHistory = await request(app)
        .get('/api/services/history')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(closedHistory.status).toBe(200);
      expect(closedHistory.body.services[0].status).toBe('closed');

      // 3. Reopening maps 'active' -> 'active' and evaluates 'live' inside window
      const reopenRes = await request(app)
        .patch(`/api/events/${eventId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'active' });
      expect(reopenRes.status).toBe(200);
      expect(storedEvent.status).toBe('active');

      // 4. POST /api/live-checkins with non-UUID placeholder 'svc-sun-1' resolves to Supabase event UUID & upserts attendance
      const checkinRes = await request(app)
        .post('/api/live-checkins')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          personId: memberId,
          personName: 'Kofi Boateng',
          serviceInstanceId: 'svc-sun-1',
          method: 'usher',
          confidence: 95,
        });
      expect(checkinRes.status).toBe(200);
      expect(checkinRes.body.success).toBe(true);
      expect(checkinRes.body.record.serviceInstanceId).toBe(eventId);
      expect(attendanceUpserts.length).toBe(1);
      expect(attendanceUpserts[0].event_id).toBe(eventId);
      expect(attendanceUpserts[0].member_id).toBe(memberId);

      // 5. DELETE /api/live-checkins/:personId removes attendance row from Supabase cleanly
      const removeRes = await request(app)
        .delete(`/api/live-checkins/${memberId}?serviceId=${eventId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(removeRes.status).toBe(200);
      expect(removeRes.body.success).toBe(true);
      expect(attendanceRows.length).toBe(0);

      // 6. Invalid non-UUID member that cannot be found returns HTTP 400 INVALID_MEMBER_ID JSON cleanly
      allowMemberLookup = false;

      const badCheckinRes = await request(app)
        .post('/api/live-checkins')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          personId: 'non-existent-local-id',
          serviceInstanceId: 'svc-sun-1',
          method: 'usher',
        });
      expect(badCheckinRes.status).toBe(400);
      expect(badCheckinRes.body.error).toBe('INVALID_MEMBER_ID');
    } finally {
      storeAny.supabase = prevSupabase;
    }
  });
});
