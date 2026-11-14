import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../server';
import { platformStore } from '../src/server/platformStore';
import { signToken } from '../lib/auth';

describe('Phase 1 Supabase Persistence & Endpoint Wiring', () => {
  beforeEach(() => {
    platformStore.resetForTests();
  });

  async function setupOrgAndMember(slugSuffix = 'alpha') {
    const orgSignup = await request(app)
      .post('/api/auth/register-organisation')
      .set('x-forwarded-for', `198.51.100.${Math.floor(Math.random() * 200) + 20}`)
      .send({
        organizationName: `Grace Chapel ${slugSuffix}`,
        orgType: 'church',
        city: 'Accra',
        country: 'Ghana',
        adminFirstName: 'David',
        adminLastName: 'Mensah',
        email: `admin.${slugSuffix}@grace.example`,
        password: 'StrongPassword123!',
      });
    expect(orgSignup.status).toBe(201);

    const orgId: string = orgSignup.body.organization.id;
    const orgSlug: string = orgSignup.body.organization.slug;
    const adminToken: string = orgSignup.body.token;

    const memSignup = await request(app)
      .post('/api/auth/register')
      .set('x-forwarded-for', `198.51.101.${Math.floor(Math.random() * 200) + 20}`)
      .send({
        firstName: 'Ama',
        lastName: 'Owusu',
        email: `ama.${slugSuffix}@grace.example`,
        phone: `0244${String(Math.floor(100000 + Math.random() * 899999))}`,
        password: 'MemberPassword123!',
        organizationSlug: orgSlug,
      });
    expect(memSignup.status).toBe(201);

    return {
      orgId,
      orgSlug,
      adminToken,
      adminUser: orgSignup.body.user,
      memberToken: memSignup.body.token as string,
      memberUser: memSignup.body.user,
    };
  }

  it('persists donations via POST /api/donations and isolates ledger visibility by role and organisation', async () => {
    const orgA = await setupOrgAndMember('donA');
    const orgB = await setupOrgAndMember('donB');

    const unauth = await request(app).post('/api/donations').send({
      amountGhs: 100,
      fundName: 'Tithe',
      provider: 'MTN MoMo',
    });
    expect(unauth.status).toBe(401);

    const createMem = await request(app)
      .post('/api/donations')
      .set('Authorization', `Bearer ${orgA.memberToken}`)
      .send({
        amountGhs: 150,
        fundName: 'Tithe',
        provider: 'MTN MoMo',
      });
    expect(createMem.status).toBe(201);
    expect(createMem.body.donation.amountMinor).toBe(15000);
    expect(createMem.body.donation.fundName).toBe('Tithe');
    expect(createMem.body.donation.provider).toBe('MTN MoMo');

    const createAdmin = await request(app)
      .post('/api/donations')
      .set('Authorization', `Bearer ${orgA.adminToken}`)
      .send({
        amountGhs: 500,
        fundName: 'Building Fund',
        provider: 'Card',
      });
    expect(createAdmin.status).toBe(201);

    // Member only sees own donations
    const memList = await request(app)
      .get('/api/donations')
      .set('Authorization', `Bearer ${orgA.memberToken}`);
    expect(memList.status).toBe(200);
    expect(memList.body.donations).toHaveLength(1);
    expect(memList.body.donations[0].fundName).toBe('Tithe');

    // Admin sees full org ledger (2 donations)
    const adminList = await request(app)
      .get('/api/donations')
      .set('Authorization', `Bearer ${orgA.adminToken}`);
    expect(adminList.status).toBe(200);
    expect(adminList.body.donations).toHaveLength(2);

    // Cross-org admin sees 0
    const orgBList = await request(app)
      .get('/api/donations')
      .set('Authorization', `Bearer ${orgB.adminToken}`);
    expect(orgBList.status).toBe(200);
    expect(orgBList.body.donations).toHaveLength(0);
  });

  it('persists follow-up tasks (create, list, resolve, delete) and enforces staff RBAC and org isolation', async () => {
    const orgA = await setupOrgAndMember('fuA');
    const orgB = await setupOrgAndMember('fuB');

    // Member cannot read or create follow-up tasks
    const memRead = await request(app)
      .get('/api/followup-tasks')
      .set('Authorization', `Bearer ${orgA.memberToken}`);
    expect(memRead.status).toBe(403);

    const createRes = await request(app)
      .post('/api/followup-tasks')
      .set('Authorization', `Bearer ${orgA.adminToken}`)
      .send({
        personId: orgA.memberUser.id,
        personName: 'Ama Owusu',
        reason: 'absent_2',
        notes: 'Missed last two Sunday services',
      });
    expect(createRes.status).toBe(201);
    const taskId: string = createRes.body.task.id;
    expect(createRes.body.task.status).toBe('open');

    const listRes = await request(app)
      .get('/api/followup-tasks')
      .set('Authorization', `Bearer ${orgA.adminToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.tasks.some((t: any) => t.id === taskId)).toBe(true);

    // Cross-org cannot resolve or delete orgA task
    const crossPatch = await request(app)
      .patch(`/api/followup-tasks/${taskId}`)
      .set('Authorization', `Bearer ${orgB.adminToken}`)
      .send({ status: 'resolved', outcome: 'Cross tenant hijack' });
    expect(crossPatch.status).toBe(404);

    // OrgA resolves task
    const patchRes = await request(app)
      .patch(`/api/followup-tasks/${taskId}`)
      .set('Authorization', `Bearer ${orgA.adminToken}`)
      .send({ status: 'resolved', outcome: 'Contacted via phone.' });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.task.status).toBe('resolved');
    expect(patchRes.body.task.outcome).toBe('Contacted via phone.');

    // Delete from DB
    const delRes = await request(app)
      .delete(`/api/followup-tasks/${taskId}`)
      .set('Authorization', `Bearer ${orgA.adminToken}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body.success).toBe(true);

    const afterDel = await request(app)
      .get('/api/followup-tasks')
      .set('Authorization', `Bearer ${orgA.adminToken}`);
    expect(afterDel.body.tasks.some((t: any) => t.id === taskId)).toBe(false);
  });

  it('persists member privacy consents, syncs autoCheckinOptedIn, and persists event RSVPs', async () => {
    const orgA = await setupOrgAndMember('conA');

    // Update consents
    const putConsents = await request(app)
      .put('/api/consents/me')
      .set('Authorization', `Bearer ${orgA.memberToken}`)
      .send({
        autoCheckin: false,
        push: true,
        sms: true,
        email: false,
      });
    expect(putConsents.status).toBe(200);
    expect(putConsents.body.consents).toEqual({
      autoCheckin: false,
      push: true,
      sms: true,
      email: false,
    });

    const getConsents = await request(app)
      .get('/api/consents/me')
      .set('Authorization', `Bearer ${orgA.memberToken}`);
    expect(getConsents.status).toBe(200);
    expect(getConsents.body.consents).toEqual({
      autoCheckin: false,
      push: true,
      sms: true,
      email: false,
    });

    // Verify member's profile autoCheckinOptedIn synced
    const profileRes = await request(app)
      .get('/api/members/me/profile')
      .set('Authorization', `Bearer ${orgA.memberToken}`);
    expect(profileRes.status).toBe(200);
    expect(profileRes.body.profile?.autoCheckinOptedIn).toBe(false);

    // Event RSVPs
    const rsvpOn = await request(app)
      .put('/api/rsvps/me')
      .set('Authorization', `Bearer ${orgA.memberToken}`)
      .send({
        eventTitle: 'Sunday Morning Service',
        eventId: 'svc-1',
        attending: true,
      });
    expect(rsvpOn.status).toBe(200);
    expect(rsvpOn.body.rsvps['Sunday Morning Service']).toBe(true);

    const getRsvps = await request(app)
      .get('/api/rsvps/me')
      .set('Authorization', `Bearer ${orgA.memberToken}`);
    expect(getRsvps.status).toBe(200);
    expect(getRsvps.body.rsvps['Sunday Morning Service']).toBe(true);
  });

  it('provisions organisation staff via POST /api/staff, enforces super_admin guard, and enables login', async () => {
    const orgA = await setupOrgAndMember('stfA');

    // Non-creator admin cannot create super_admin
    const escalateRes = await request(app)
      .post('/api/staff')
      .set('Authorization', `Bearer ${orgA.adminToken}`)
      .send({
        fullName: 'Sneaky Escalator',
        email: 'sneaky@grace.example',
        role: 'super_admin',
      });
    expect(escalateRes.status).toBe(403);

    // Admin provisions Pastor with auto-generated temp password
    const createPastor = await request(app)
      .post('/api/staff')
      .set('Authorization', `Bearer ${orgA.adminToken}`)
      .send({
        fullName: 'Pastor Samuel Adjei',
        email: 'samuel.adjei@grace.example',
        role: 'pastor',
      });
    expect(createPastor.status).toBe(201);
    expect(createPastor.body.staff.role).toBe('pastor');
    expect(createPastor.body.temporaryPassword).toBeTypeOf('string');

    // Staff appears in GET /api/staff
    const listStaff = await request(app)
      .get('/api/staff')
      .set('Authorization', `Bearer ${orgA.adminToken}`);
    expect(listStaff.status).toBe(200);
    expect(
      listStaff.body.staff.some((s: any) => s.email === 'samuel.adjei@grace.example' && s.role === 'pastor')
    ).toBe(true);

    // Newly provisioned staff can authenticate immediately
    const staffLogin = await request(app)
      .post('/api/auth/login')
      .set('x-forwarded-for', '198.51.102.55')
      .send({
        identifier: 'samuel.adjei@grace.example',
        password: createPastor.body.temporaryPassword,
      });
    expect(staffLogin.status).toBe(200);
    expect(staffLogin.body.role).toBe('pastor');
    expect(staffLogin.body.mustChangePassword).toBe(true);

    // Creator can purge the entire organisation including Phase 1 data
    const creatorToken = signToken({
      id: 'creator-1',
      email: 'creator@ekklesphere.platform',
      role: 'creator',
      is_creator: true,
      name: 'Platform Creator',
    });

    const delOrg = await request(app)
      .delete(`/api/console/organisations/${orgA.orgId}`)
      .set('Authorization', `Bearer ${creatorToken}`);
    expect(delOrg.status).toBe(200);
    expect(delOrg.body.deleted).toBe(true);
  });
});
