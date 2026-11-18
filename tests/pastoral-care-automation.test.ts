import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../server';
import { signToken, TEST_ANCHOR_ORGANIZATION_ID } from '../lib/auth';
import { platformStore } from '../src/server/platformStore';

describe('Pastoral Care Automation: Absent Member Messaging, Leader Reminders & Oversight RBAC', () => {
  const adminToken = signToken({
    id: 'usr-pc-admin-1',
    email: 'admin@ekklesphere.church',
    role: 'admin',
    designation: 'Administrator',
    organization_id: TEST_ANCHOR_ORGANIZATION_ID,
    name: 'Church Administrator',
  });

  const savedEnv = {
    ARKESEL_API_KEY: process.env.ARKESEL_API_KEY,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
  };
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    platformStore.resetForTests();
    process.env.ARKESEL_API_KEY = 'arkesel-test-pastoral-key';
    delete process.env.RESEND_API_KEY;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (savedEnv.ARKESEL_API_KEY === undefined) delete process.env.ARKESEL_API_KEY;
    else process.env.ARKESEL_API_KEY = savedEnv.ARKESEL_API_KEY;
    if (savedEnv.RESEND_API_KEY === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = savedEnv.RESEND_API_KEY;
    if (savedEnv.RESEND_FROM_EMAIL === undefined) delete process.env.RESEND_FROM_EMAIL;
    else process.env.RESEND_FROM_EMAIL = savedEnv.RESEND_FROM_EMAIL;
    vi.restoreAllMocks();
  });

  it('auto-messages absent members idempotently on service close, honors SMS opt-out, and resets streak on check-in', async () => {
    const arkeselCalls: Array<{ recipients: string[]; message: string }> = [];
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).includes('sms.arkesel.com')) {
        const body = JSON.parse(String(init?.body || '{}'));
        arkeselCalls.push({
          recipients: Array.isArray(body.recipients) ? body.recipients : [],
          message: String(body.message || ''),
        });
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ status: 'success', data: [{ id: 'sms_ok_1' }] }),
      } as Response;
    }) as unknown as typeof fetch;

    // Configure pastoral settings: threshold = 2, auto-message active via SMS
    const settingsRes = await request(app)
      .patch('/api/system-settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        churchName: 'Calvary Temple',
        contactPhone: '+233240001000',
        absenteeThresholdServices: 2,
        autoMessageAbsentMembers: true,
        absentMemberMessageChannel: 'sms',
        absentMemberMessageTemplate:
          'Shalom {{firstName}}, we missed you at {{serviceName}} ({{missedCount}} missed) at {{churchName}}. Call {{contactPhone}}.',
        autoSendLeaderCareReminders: true,
      });
    expect(settingsRes.status).toBe(200);

    // Create 3 active members: Ama (present), Kwame (absent, SMS allowed), Akosua (absent, opted out of SMS)
    const amaRes = await request(app)
      .post('/api/members')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        firstName: 'Ama',
        lastName: 'Mensah',
        email: 'ama.mensah@calvary.org',
        phoneE164: '+233241110001',
        groupName: 'Grace Cell',
        status: 'member',
      });
    expect(amaRes.status).toBe(201);
    const amaId = amaRes.body.id;

    const kwameRes = await request(app)
      .post('/api/members')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        firstName: 'Kwame',
        lastName: 'Boateng',
        email: 'kwame.boateng@calvary.org',
        phoneE164: '+233241110002',
        groupName: 'Grace Cell',
        status: 'member',
      });
    expect(kwameRes.status).toBe(201);
    const kwameId = kwameRes.body.id;

    const akosuaRes = await request(app)
      .post('/api/members')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        firstName: 'Akosua',
        lastName: 'Osei',
        email: 'akosua.osei@calvary.org',
        phoneE164: '+233241110003',
        groupName: 'Grace Cell',
        status: 'member',
      });
    expect(akosuaRes.status).toBe(201);
    const akosuaId = akosuaRes.body.id;

    // Akosua explicitly opts out of SMS
    const akosuaToken = signToken({
      id: akosuaId,
      email: 'akosua.osei@calvary.org',
      role: 'member',
      organization_id: TEST_ANCHOR_ORGANIZATION_ID,
      name: 'Akosua Osei',
    });
    const optOutRes = await request(app)
      .put('/api/consents/me')
      .set('Authorization', `Bearer ${akosuaToken}`)
      .send({ autoCheckin: true, push: true, sms: false, email: true });
    expect(optOutRes.status).toBe(200);

    // Create a live service active right now & check Ama in
    const nowMs = Date.now();
    const evtRes = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Sunday First Service',
        date: new Date(nowMs).toISOString().slice(0, 10),
        startTimeIso: new Date(nowMs - 15 * 60_000).toISOString(),
        endTimeIso: new Date(nowMs + 90 * 60_000).toISOString(),
        status: 'active',
      });
    expect(evtRes.status).toBe(201);
    const eventId = evtRes.body.id;

    const checkinRes = await request(app)
      .post('/api/live-checkins')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        personId: amaId,
        personName: 'Ama Mensah',
        serviceInstanceId: eventId,
        method: 'usher',
      });
    expect(checkinRes.status).toBe(200);

    // Close the service -> triggers automated absence sweep
    const closeRes = await request(app)
      .patch(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'closed' });
    expect(closeRes.status).toBe(200);
    expect(closeRes.body.absenceSweep).toBeTruthy();
    expect(closeRes.body.absenceSweep.absentMembersCount).toBeGreaterThanOrEqual(2);
    expect(closeRes.body.absenceSweep.memberMessagesSent).toBeGreaterThanOrEqual(1);
    const optOutDispatches = (closeRes.body.absenceSweep.dispatches || []).filter(
      (d: any) => d.status === 'skipped_opt_out'
    );
    expect(optOutDispatches.length).toBe(1);
    expect(optOutDispatches[0].memberId).toBe(akosuaId);

    // Verify Kwame received personalized Arkesel SMS while Akosua & Ama did not
    expect(arkeselCalls.some((c) => c.recipients.includes('233241110002'))).toBe(true);
    expect(arkeselCalls.some((c) => c.recipients.includes('233241110003'))).toBe(false);
    expect(arkeselCalls.some((c) => c.recipients.includes('233241110001'))).toBe(false);
    const kwameSms = arkeselCalls.find((c) => c.recipients.includes('233241110002'));
    expect(kwameSms?.message).toContain('Shalom Kwame');
    expect(kwameSms?.message).toContain('Sunday First Service');
    expect(kwameSms?.message).toContain('Calvary Temple');

    // Verify member absence counters
    const membersAfter = await request(app)
      .get('/api/members')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(membersAfter.status).toBe(200);
    const amaAfter = membersAfter.body.find((m: any) => m.id === amaId);
    const kwameAfter = membersAfter.body.find((m: any) => m.id === kwameId);
    const akosuaAfter = membersAfter.body.find((m: any) => m.id === akosuaId);
    expect(amaAfter.consecutiveAbsences).toBe(0);
    expect(kwameAfter.consecutiveAbsences).toBe(1);
    expect(akosuaAfter.consecutiveAbsences).toBe(1);

    // Idempotency check: running sweep again for same event without force returns alreadyProcessed: true
    const repeatSweepRes = await request(app)
      .post('/api/pastoral-care/run-absence-sweep')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ eventId });
    expect(repeatSweepRes.status).toBe(200);
    expect(repeatSweepRes.body.alreadyProcessed).toBe(true);
    expect(repeatSweepRes.body.memberMessagesSent).toBe(0);

    // Monitor ledger records both sent SMS and skipped_opt_out
    const monitorRes = await request(app)
      .get('/api/pastoral-care/monitor')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(monitorRes.status).toBe(200);
    const dispatches = monitorRes.body.monitor.dispatches;
    expect(
      dispatches.some(
        (d: any) =>
          d.dispatchType === 'absent_member_alert' &&
          d.memberId === kwameId &&
          d.status === 'sent'
      )
    ).toBe(true);
    expect(
      dispatches.some(
        (d: any) =>
          d.dispatchType === 'absent_member_alert' &&
          d.memberId === akosuaId &&
          d.status === 'skipped_opt_out'
      )
    ).toBe(true);

    // When Kwame checks in for a second live service, his consecutiveAbsences resets to 0
    const evt2NowMs = Date.now();
    const evt2Res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Midweek Prayer Service',
        date: new Date(evt2NowMs).toISOString().slice(0, 10),
        startTimeIso: new Date(evt2NowMs - 10 * 60_000).toISOString(),
        endTimeIso: new Date(evt2NowMs + 90 * 60_000).toISOString(),
        status: 'active',
      });
    expect(evt2Res.status).toBe(201);

    const kwameCheckinRes = await request(app)
      .post('/api/live-checkins')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        personId: kwameId,
        personName: 'Kwame Boateng',
        serviceInstanceId: evt2Res.body.id,
        method: 'usher',
      });
    expect(kwameCheckinRes.status).toBe(200);

    const membersResetRes = await request(app)
      .get('/api/members')
      .set('Authorization', `Bearer ${adminToken}`);
    const kwameReset = membersResetRes.body.find((m: any) => m.id === kwameId);
    expect(kwameReset.consecutiveAbsences).toBe(0);
  });

  it('auto-creates follow-up tasks at threshold, sends SMS & portal reminders to leaders in charge, and supports repeat reminders', async () => {
    const arkeselCalls: Array<{ recipients: string[]; message: string }> = [];
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).includes('sms.arkesel.com')) {
        const body = JSON.parse(String(init?.body || '{}'));
        arkeselCalls.push({
          recipients: Array.isArray(body.recipients) ? body.recipients : [],
          message: String(body.message || ''),
        });
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ status: 'success', data: [{ id: 'sms_leader_1' }] }),
      } as Response;
    }) as unknown as typeof fetch;

    await request(app)
      .patch('/api/system-settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        churchName: 'Calvary Temple',
        absenteeThresholdServices: 1,
        autoAssignCellLeaders: true,
        autoMessageAbsentMembers: true,
        absentMemberMessageChannel: 'sms',
        autoSendLeaderCareReminders: true,
      });

    // Create Cell Leader credential & member + Grace Cell group + absent member
    const leaderUserRes = await request(app)
      .post('/api/users/credentials')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        fullName: 'Elder Samuel Addo',
        email: 'samuel.addo@calvary.org',
        phone: '+233249001122',
        role: 'group_leader',
        designation: 'Elder',
        password: 'LeaderPassword#2026',
        requirePasswordChange: false,
      });
    expect(leaderUserRes.status).toBe(201);

    const leaderMemberRes = await request(app)
      .post('/api/members')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        firstName: 'Samuel',
        lastName: 'Addo',
        email: 'samuel.addo@calvary.org',
        phoneE164: '+233249001122',
        groupName: 'Covenant Cell',
        officerName: 'Elder',
        designation: 'Elder',
        status: 'member',
      });
    expect(leaderMemberRes.status).toBe(201);

    const groupRes = await request(app)
      .post('/api/church-groups')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Covenant Cell',
        category: 'cell_group',
        leaderName: 'Elder Samuel Addo',
        leaderMemberId: leaderMemberRes.body.id,
        leaderPhone: '+233249001122',
        active: true,
      });
    expect(groupRes.status).toBe(201);

    const absenteeRes = await request(app)
      .post('/api/members')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        firstName: 'Kofi',
        lastName: 'Asante',
        email: 'kofi.asante@calvary.org',
        phoneE164: '+233248881111',
        groupName: 'Covenant Cell',
        status: 'member',
      });
    expect(absenteeRes.status).toBe(201);

    const svcNowMs = Date.now();
    const evtRes = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Sunday Second Service',
        date: new Date(svcNowMs).toISOString().slice(0, 10),
        startTimeIso: new Date(svcNowMs - 15 * 60_000).toISOString(),
        endTimeIso: new Date(svcNowMs + 90 * 60_000).toISOString(),
        status: 'active',
      });
    expect(evtRes.status).toBe(201);

    // Check Elder Samuel Addo in so Kofi Asante is absent when closing
    const leaderCheckinRes = await request(app)
      .post('/api/live-checkins')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        personId: leaderMemberRes.body.id,
        personName: 'Samuel Addo',
        serviceInstanceId: evtRes.body.id,
        method: 'usher',
      });
    expect(leaderCheckinRes.status).toBe(200);

    const closeRes = await request(app)
      .patch(`/api/events/${evtRes.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'closed' });
    expect(closeRes.status).toBe(200);
    expect(closeRes.body.absenceSweep.tasksCreatedCount).toBeGreaterThanOrEqual(1);
    expect(closeRes.body.absenceSweep.leaderRemindersSent).toBeGreaterThanOrEqual(1);

    // Leader phone received pastoral care reminder SMS mentioning Kofi Asante
    expect(
      arkeselCalls.some(
        (c) =>
          c.recipients.includes('233249001122') &&
          c.message.includes('Pastoral Care Reminder') &&
          c.message.includes('Kofi Asante')
      )
    ).toBe(true);

    // Monitor shows created task with reminderCount >= 1 and scorecard row
    const monitorRes = await request(app)
      .get('/api/pastoral-care/monitor')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(monitorRes.status).toBe(200);
    const task = monitorRes.body.monitor.tasks.find((t: any) => t.personId === absenteeRes.body.id);
    expect(task).toBeTruthy();
    expect(task.assignedToName).toContain('Samuel Addo');
    expect(task.reminderCount).toBeGreaterThanOrEqual(1);
    expect(task.lastReminderAt).toBeTruthy();
    expect(monitorRes.body.monitor.leaderScorecard.length).toBeGreaterThanOrEqual(1);

    // Manual repeat leader reminder increments reminderCount
    const resendRes = await request(app)
      .post('/api/pastoral-care/send-leader-reminders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ taskId: task.id });
    expect(resendRes.status).toBe(200);
    expect(resendRes.body.sentCount).toBeGreaterThanOrEqual(1);

    const monitorAfterResend = await request(app)
      .get('/api/pastoral-care/monitor')
      .set('Authorization', `Bearer ${adminToken}`);
    const taskAfter = monitorAfterResend.body.monitor.tasks.find((t: any) => t.id === task.id);
    expect(taskAfter.reminderCount).toBe(task.reminderCount + 1);
  });

  it('grants Pastoral Care Oversight to Administrator, Pastor, Presiding Elder, and Associate Pastor while restricting member/usher/finance', async () => {
    // Provision Presiding Elder & Associate Pastor with base roles member/group_leader + designation
    const presidingElderRes = await request(app)
      .post('/api/users/credentials')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        fullName: 'Elder Thomas Tetteh',
        email: 'presiding.elder@calvary.org',
        phone: '+233247770001',
        role: 'group_leader',
        designation: 'Presiding Elder',
        password: 'ElderPassword#2026',
        requirePasswordChange: false,
      });
    expect(presidingElderRes.status).toBe(201);

    const assocPastorRes = await request(app)
      .post('/api/users/credentials')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        fullName: 'Rev. Grace Appiah',
        email: 'associate.pastor@calvary.org',
        phone: '+233247770002',
        role: 'member',
        designation: 'Associate Pastor',
        password: 'PastorPassword#2026',
        requirePasswordChange: false,
      });
    expect(assocPastorRes.status).toBe(201);

    const pastorToken = signToken({
      id: 'usr-pastor-rbac',
      email: 'senior.pastor@calvary.org',
      role: 'pastor',
      designation: 'Pastor',
      organization_id: TEST_ANCHOR_ORGANIZATION_ID,
      name: 'Senior Pastor',
    });

    const presidingElderToken = signToken({
      id: presidingElderRes.body.user.id,
      email: 'presiding.elder@calvary.org',
      role: 'group_leader',
      designation: 'Presiding Elder',
      organization_id: TEST_ANCHOR_ORGANIZATION_ID,
      name: 'Elder Thomas Tetteh',
    });

    const assocPastorToken = signToken({
      id: assocPastorRes.body.user.id,
      email: 'associate.pastor@calvary.org',
      role: 'member',
      designation: 'Associate Pastor',
      organization_id: TEST_ANCHOR_ORGANIZATION_ID,
      name: 'Rev. Grace Appiah',
    });

    const plainMemberToken = signToken({
      id: 'usr-plain-member-rbac',
      email: 'plain.member@calvary.org',
      role: 'member',
      designation: 'Member',
      organization_id: TEST_ANCHOR_ORGANIZATION_ID,
      name: 'Plain Member',
    });

    const usherToken = signToken({
      id: 'usr-usher-rbac',
      email: 'usher@calvary.org',
      role: 'usher',
      organization_id: TEST_ANCHOR_ORGANIZATION_ID,
      name: 'Head Usher',
    });

    const financeToken = signToken({
      id: 'usr-finance-rbac',
      email: 'finance@calvary.org',
      role: 'finance',
      organization_id: TEST_ANCHOR_ORGANIZATION_ID,
      name: 'Finance Officer',
    });

    // Allowed oversight roles: Administrator, Pastor, Presiding Elder, Associate Pastor
    for (const allowedToken of [adminToken, pastorToken, presidingElderToken, assocPastorToken]) {
      const monRes = await request(app)
        .get('/api/pastoral-care/monitor')
        .set('Authorization', `Bearer ${allowedToken}`);
      expect(monRes.status).toBe(200);

      const sweepRes = await request(app)
        .post('/api/pastoral-care/run-absence-sweep')
        .set('Authorization', `Bearer ${allowedToken}`)
        .send({});
      expect(sweepRes.status).toBe(200);

      const remindRes = await request(app)
        .post('/api/pastoral-care/send-leader-reminders')
        .set('Authorization', `Bearer ${allowedToken}`)
        .send({});
      expect(remindRes.status).toBe(200);
    }

    // Disallowed roles: plain Member, Usher, Finance
    for (const deniedToken of [plainMemberToken, usherToken, financeToken]) {
      const monRes = await request(app)
        .get('/api/pastoral-care/monitor')
        .set('Authorization', `Bearer ${deniedToken}`);
      expect(monRes.status).toBe(403);

      const sweepRes = await request(app)
        .post('/api/pastoral-care/run-absence-sweep')
        .set('Authorization', `Bearer ${deniedToken}`)
        .send({});
      expect(sweepRes.status).toBe(403);

      const remindRes = await request(app)
        .post('/api/pastoral-care/send-leader-reminders')
        .set('Authorization', `Bearer ${deniedToken}`)
        .send({});
      expect(remindRes.status).toBe(403);
    }
  });

  it('lets a leader in charge view assigned pastoral care reminders and acknowledge them cleanly', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'success' }),
    }) as unknown as typeof fetch;

    const leaderRes = await request(app)
      .post('/api/users/credentials')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        fullName: 'Deaconess Martha Mensah',
        email: 'martha.mensah@calvary.org',
        phone: '+233245550999',
        role: 'group_leader',
        designation: 'Deaconess',
        password: 'MarthaPassword#2026',
        requirePasswordChange: false,
      });
    expect(leaderRes.status).toBe(201);

    const groupRes = await request(app)
      .post('/api/church-groups')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Deborah Cell',
        category: 'cell_group',
        leaderName: 'Deaconess Martha Mensah',
        leaderPhone: '+233245550999',
        active: true,
      });
    expect(groupRes.status).toBe(201);

    const memberRes = await request(app)
      .post('/api/members')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        firstName: 'Esi',
        lastName: 'Quaye',
        email: 'esi.quaye@calvary.org',
        phoneE164: '+233245550888',
        groupName: 'Deborah Cell',
        status: 'member',
      });
    expect(memberRes.status).toBe(201);

    const taskCreateRes = await request(app)
      .post('/api/followup-tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        personId: memberRes.body.id,
        reason: 'absent_2',
        assignedToName: 'Deaconess Martha Mensah',
        assignedToRole: 'Cell Leader',
        notes: 'Check on Esi after missing 2 Sundays.',
      });
    expect(taskCreateRes.status).toBe(201);
    const createdTaskId = taskCreateRes.body.task.id;

    const marthaToken = signToken({
      id: leaderRes.body.user.id,
      email: 'martha.mensah@calvary.org',
      role: 'group_leader',
      designation: 'Deaconess',
      organization_id: TEST_ANCHOR_ORGANIZATION_ID,
      name: 'Deaconess Martha Mensah',
    });

    // Martha sees the reminder in her queue
    const myRemRes = await request(app)
      .get('/api/pastoral-care/my-reminders')
      .set('Authorization', `Bearer ${marthaToken}`);
    expect(myRemRes.status).toBe(200);
    expect(myRemRes.body.tasks.some((t: any) => t.id === createdTaskId)).toBe(true);
    expect(myRemRes.body.dispatches.length).toBeGreaterThanOrEqual(1);

    // Another unrelated member cannot acknowledge Martha's task
    const strangerToken = signToken({
      id: 'usr-stranger-1',
      email: 'stranger@calvary.org',
      role: 'member',
      organization_id: TEST_ANCHOR_ORGANIZATION_ID,
      name: 'Stranger Member',
    });
    const forbiddenAckRes = await request(app)
      .post(`/api/followup-tasks/${createdTaskId}/acknowledge`)
      .set('Authorization', `Bearer ${strangerToken}`);
    expect(forbiddenAckRes.status).toBe(403);

    // Martha acknowledges her assigned reminder
    const ackRes = await request(app)
      .post(`/api/followup-tasks/${createdTaskId}/acknowledge`)
      .set('Authorization', `Bearer ${marthaToken}`);
    expect(ackRes.status).toBe(200);
    expect(ackRes.body.task.acknowledgedAt).toBeTruthy();
    expect(ackRes.body.task.status).toBe('contacted');
  });
});
