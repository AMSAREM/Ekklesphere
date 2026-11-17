// tests/action-buttons-crud.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../server';
import { signToken, TEST_ANCHOR_ORGANIZATION_ID } from '../lib/auth';
import { platformStore } from '../src/server/platformStore';

describe('Activated Action Buttons: Edit & Delete CRUD Routes', () => {
  beforeEach(() => {
    platformStore.resetForTests();
  });

  const adminToken = signToken({
    id: 'crud-admin-1',
    email: 'crud-admin@ekklesphere.church',
    role: 'admin',
    organization_id: TEST_ANCHOR_ORGANIZATION_ID,
    name: 'CRUD Admin',
  });

  const pastorToken = signToken({
    id: 'crud-pastor-1',
    email: 'crud-pastor@ekklesphere.church',
    role: 'pastor',
    organization_id: TEST_ANCHOR_ORGANIZATION_ID,
    name: 'CRUD Pastor',
  });

  const memberToken = signToken({
    id: 'crud-member-1',
    email: 'kwame.member@ekklesphere.church',
    role: 'member',
    organization_id: TEST_ANCHOR_ORGANIZATION_ID,
    name: 'Kwame Member',
  });

  const creatorToken = signToken({
    id: 'crud-creator-1',
    email: 'creator@ekklesphere.church',
    role: 'creator',
    is_creator: true,
    organization_id: TEST_ANCHOR_ORGANIZATION_ID,
    name: 'Platform Creator',
  });

  it('updates fullName, email, phone, role, and designation via PATCH /api/users/:id and syncs linked member record', async () => {
    const memberRes = await request(app)
      .post('/api/members')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        firstName: 'Yaw',
        lastName: 'Mensah',
        email: 'yaw.mensah@ekklesphere.church',
        phoneE164: '+233244111222',
        groupName: 'Choir',
      });
    expect(memberRes.status).toBe(201);
    const memberId = memberRes.body.id;

    const usersBefore = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(usersBefore.status).toBe(200);
    const yawUser = usersBefore.body.users.find(
      (u: any) => u.memberId === memberId || u.id === memberId
    );
    expect(yawUser).toBeTruthy();

    const patchRes = await request(app)
      .patch(`/api/users/${encodeURIComponent(yawUser.id)}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        fullName: 'Yaw Mensah-Bonsu',
        email: 'yaw.bonsu@ekklesphere.church',
        phone: '+233244999000',
        role: 'usher',
        designation: 'Head Door Steward',
      });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.user.fullName).toBe('Yaw Mensah-Bonsu');
    expect(patchRes.body.user.email).toBe('yaw.bonsu@ekklesphere.church');
    expect(patchRes.body.user.phoneE164).toBe('+233244999000');
    expect(patchRes.body.user.role).toBe('usher');
    expect(patchRes.body.user.designation).toBe('Head Door Steward');

    const membersAfter = await request(app)
      .get('/api/members')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(membersAfter.status).toBe(200);
    const list = Array.isArray(membersAfter.body) ? membersAfter.body : membersAfter.body.members;
    const syncedMember = list.find((m: any) => m.id === memberId);
    expect(syncedMember).toBeTruthy();
    expect(`${syncedMember.firstName} ${syncedMember.lastName}`.trim()).toBe('Yaw Mensah-Bonsu');
    expect(syncedMember.email).toBe('yaw.bonsu@ekklesphere.church');
    expect(syncedMember.phoneE164).toBe('+233244999000');
  });

  it('deletes user credentials and linked member via DELETE /api/users/:id while blocking self-delete and cross-org deletes', async () => {
    const provRes = await request(app)
      .post('/api/users/credentials')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        fullName: 'Akosua Temp',
        email: 'akosua.temp@ekklesphere.church',
        phone: '+233201234567',
        role: 'usher',
        password: 'TempPassword!99',
        requirePasswordChange: false,
      });
    expect(provRes.status).toBe(201);
    const targetUserId = provRes.body.user.id;

    // Member cannot delete accounts
    const memberDelete = await request(app)
      .delete(`/api/users/${encodeURIComponent(targetUserId)}`)
      .set('Authorization', `Bearer ${memberToken}`);
    expect(memberDelete.status).toBe(403);

    // Self-delete is blocked
    const selfCred = await request(app)
      .post('/api/users/credentials')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        fullName: 'Self Admin Delete Test',
        email: 'self.delete@ekklesphere.church',
        role: 'admin',
        password: 'SelfDeletePass!1',
        requirePasswordChange: false,
      });
    expect(selfCred.status).toBe(201);
    const selfLogin = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'self.delete@ekklesphere.church', password: 'SelfDeletePass!1' });
    expect(selfLogin.status).toBe(200);

    const selfDelRes = await request(app)
      .delete(`/api/users/${encodeURIComponent(selfCred.body.user.id)}`)
      .set('Authorization', `Bearer ${selfLogin.body.token}`);
    expect(selfDelRes.status).toBe(400);

    // Admin successfully deletes Akosua Temp
    const delRes = await request(app)
      .delete(`/api/users/${encodeURIComponent(targetUserId)}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body.success).toBe(true);

    const usersAfter = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(usersAfter.body.users.some((u: any) => u.id === targetUserId)).toBe(false);

    // Cross-org admin cannot delete from another organisation
    const orgB = await platformStore.createOrganisation({
      name: 'Bethel Cathedral',
      orgType: 'church',
      country: 'Ghana',
      city: 'Tema',
      contactName: 'Rev. Ofori',
      contactEmail: 'bethel@cathedral.org',
    });
    const orgBAdmin = signToken({
      id: 'orgb-admin-crud',
      email: 'bethel@cathedral.org',
      role: 'admin',
      organization_id: orgB.organisation.id,
      name: 'Bethel Admin',
    });
    const crossDelRes = await request(app)
      .delete(`/api/users/${encodeURIComponent(selfCred.body.user.id)}`)
      .set('Authorization', `Bearer ${orgBAdmin}`);
    expect(crossDelRes.status).toBe(404);
  });

  it('allows members to submit deletion/export data privacy requests via POST /api/data-requests/me', async () => {
    const res = await request(app)
      .post('/api/data-requests/me')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        requestType: 'deletion',
        reason: 'Member requested permanent account removal',
      });

    expect(res.status).toBe(201);
    expect(res.body.dataRequest).toBeTruthy();
    expect(res.body.dataRequest.requestType).toBe('deletion');
    expect(res.body.dataRequest.requestedByEmail).toBe('kwame.member@ekklesphere.church');
    expect(res.body.dataRequest.organizationId).toBe(TEST_ANCHOR_ORGANIZATION_ID);
  });

  it('edits and deletes pastoral follow-up tasks via PATCH & DELETE /api/followup-tasks/:id', async () => {
    const createRes = await request(app)
      .post('/api/followup-tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        personId: 'mem-adwoa-1',
        personName: 'Adwoa Boateng',
        reason: 'manual',
        assignedToName: 'Elder Tetteh',
        notes: 'Missed 2 consecutive Sunday services',
      });
    expect(createRes.status).toBe(201);
    const taskId = createRes.body.task.id;

    const patchRes = await request(app)
      .patch(`/api/followup-tasks/${encodeURIComponent(taskId)}`)
      .set('Authorization', `Bearer ${pastorToken}`)
      .send({
        status: 'resolved',
        assignedToName: 'Pastor Osei',
        outcome: 'Visited family home and prayed together',
        notes: 'Returning this Sunday',
      });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.task.status).toBe('resolved');
    expect(patchRes.body.task.assignedToName).toBe('Pastor Osei');
    expect(patchRes.body.task.outcome).toBe('Visited family home and prayed together');

    const deleteRes = await request(app)
      .delete(`/api/followup-tasks/${encodeURIComponent(taskId)}`)
      .set('Authorization', `Bearer ${pastorToken}`);
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.success).toBe(true);

    const listRes = await request(app)
      .get('/api/followup-tasks')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.tasks.some((t: any) => t.id === taskId)).toBe(false);
  });

  it('updates organisation profile and geofenceRadiusMeters via PATCH /api/console/organisations/:orgId', async () => {
    const orgRes = await platformStore.createOrganisation({
      name: 'Covenant Sanctuary',
      orgType: 'church',
      country: 'Ghana',
      city: 'Takoradi',
      contactName: 'Pastor Quaye',
      contactEmail: 'covenant@sanctuary.org',
    });

    const patchRes = await request(app)
      .patch(`/api/console/organisations/${encodeURIComponent(orgRes.organisation.id)}`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({
        name: 'Covenant Cathedral International',
        city: 'Sekondi-Takoradi',
        geofenceRadiusMeters: 180,
        status: 'active',
      });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.organisation.name).toBe('Covenant Cathedral International');
    expect(patchRes.body.organisation.city).toBe('Sekondi-Takoradi');
    expect(patchRes.body.organisation.geofenceRadiusMeters).toBe(180);
    expect(patchRes.body.organisation.status).toBe('active');
  });
});
