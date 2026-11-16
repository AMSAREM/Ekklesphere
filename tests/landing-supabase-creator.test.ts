// tests/landing-supabase-creator.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { app } from '../server';
import { signToken, TEST_ANCHOR_ORGANIZATION_ID } from '../lib/auth';
import { platformStore } from '../src/server/platformStore';

describe('Landing Page <-> Supabase <-> Creator Console Bridge', () => {
  const creatorToken = signToken({
    id: 'creator-root-1',
    email: 'creator@ekklesphere.platform',
    role: 'creator',
    name: 'Platform Creator',
    organization_id: TEST_ANCHOR_ORGANIZATION_ID,
    is_creator: true,
  });

  const churchAdminToken = signToken({
    id: 'user-admin-1',
    email: 'admin@ekklesphere.church',
    role: 'admin',
    name: 'Church Admin',
    organization_id: TEST_ANCHOR_ORGANIZATION_ID,
    is_creator: false,
  });

  beforeEach(() => {
    platformStore.resetForTests();
  });

  it('defines strict RLS and schema in 20261126000000_landing_leads_and_creator_inbox.sql', () => {
    const sqlPath = path.resolve(
      process.cwd(),
      'supabase/migrations/20261126000000_landing_leads_and_creator_inbox.sql'
    );
    expect(fs.existsSync(sqlPath)).toBe(true);
    const sql = fs.readFileSync(sqlPath, 'utf8');
    expect(sql).toContain('public.landing_leads');
    expect(sql).toContain('public.is_platform_creator()');
    expect(sql).toContain('enable row level security');
    expect(sql).toContain('landing_cms_config');
  });

  it('serves live CMS copy, commercial plans, and aggregate stats on /api/public/landing-overview without PII', async () => {
    const res = await request(app).get('/api/public/landing-overview');
    expect(res.status).toBe(200);
    expect(res.body.landingConfig).toBeTruthy();
    expect(Array.isArray(res.body.plans)).toBe(true);
    expect(res.body.plans.length).toBeGreaterThanOrEqual(3);
    expect(res.body.liveStats).toBeDefined();
    expect(typeof res.body.liveStats.activeChurchesCount).toBe('number');

    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('passwordHash');
    expect(serialized).not.toContain('phoneE164');

    const legacyRes = await request(app).get('/api/landing-config');
    expect(legacyRes.status).toBe(200);
    expect(legacyRes.body.landingConfig?.heroTitle).toBe(res.body.landingConfig.heroTitle);
  });

  it('reflects Creator Console CMS edits immediately on /api/public/landing-overview', async () => {
    const updateRes = await request(app)
      .put('/api/console/landing-cms')
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({
        heroTitle: 'Church leadership made luminous.',
        contactSalesEmail: 'pastors@ekklesphere.org',
      });
    expect(updateRes.status).toBe(200);

    const publicRes = await request(app).get('/api/public/landing-overview');
    expect(publicRes.status).toBe(200);
    expect(publicRes.body.landingConfig.heroTitle).toBe('Church leadership made luminous.');
    expect(publicRes.body.landingConfig.contactSalesEmail).toBe('pastors@ekklesphere.org');
  });

  it('captures public landing leads cleanly and blocks unauthorized/non-creator inbox access', async () => {
    const badRes = await request(app).post('/api/public/landing-leads').send({
      leadType: 'demo_request',
      email: 'not-an-email',
    });
    expect(badRes.status).toBe(400);

    const submitRes = await request(app).post('/api/public/landing-leads').send({
      leadType: 'demo_request',
      fullName: 'Pastor Daniel Mensah',
      email: 'daniel@gracechapel.org',
      phone: '+233244556677',
      churchName: 'Grace Chapel Tema',
      interest: 'Church-wide operations',
      message: 'We have 450 members across two services.',
      sourceSection: 'landing_demo_modal',
    });
    expect(submitRes.status).toBe(201);
    expect(submitRes.body.ok).toBe(true);
    expect(submitRes.body.leadId).toBeTruthy();

    const unauthInbox = await request(app).get('/api/console/landing-leads');
    expect(unauthInbox.status).toBe(401);

    const adminInbox = await request(app)
      .get('/api/console/landing-leads')
      .set('Authorization', `Bearer ${churchAdminToken}`);
    expect(adminInbox.status).toBe(403);

    const creatorInbox = await request(app)
      .get('/api/console/landing-leads')
      .set('Authorization', `Bearer ${creatorToken}`);
    expect(creatorInbox.status).toBe(200);
    expect(creatorInbox.body.leads.length).toBeGreaterThanOrEqual(1);
    const createdLead = creatorInbox.body.leads.find(
      (l: any) => l.id === submitRes.body.leadId
    );
    expect(createdLead).toBeDefined();
    expect(createdLead.status).toBe('new');
    expect(createdLead.churchName).toBe('Grace Chapel Tema');

    const dashRes = await request(app)
      .get('/api/console/dashboard')
      .set('Authorization', `Bearer ${creatorToken}`);
    expect(dashRes.status).toBe(200);
    expect(dashRes.body.newLandingLeadsCount).toBeGreaterThanOrEqual(1);
  });

  it('lets the Creator triage, reply, and convert a landing lead into a 14-day trial organisation', async () => {
    const createRes = await request(app).post('/api/public/landing-leads').send({
      leadType: 'contact_inquiry',
      fullName: 'Elder Kojo Boateng',
      email: 'kojo@bethelcity.org',
      churchName: 'Bethel City Sanctuary',
      interest: 'Multi-campus pricing & SLA',
      sourceSection: 'footer_contact',
    });
    expect(createRes.status).toBe(201);
    const leadId = createRes.body.leadId as string;

    const patchRes = await request(app)
      .patch(`/api/console/landing-leads/${leadId}`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({
        status: 'qualified',
        creatorNotes: 'Strong fit for Cathedral Enterprise trial.',
      });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.lead.status).toBe('qualified');
    expect(patchRes.body.lead.creatorNotes).toBe('Strong fit for Cathedral Enterprise trial.');

    const replyRes = await request(app)
      .post(`/api/console/landing-leads/${leadId}/reply`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({
        subject: 'Your Bethel City Sanctuary Walkthrough',
        message: 'Hello Elder Kojo, let us connect this Thursday.',
      });
    expect(replyRes.status).toBe(200);
    expect(replyRes.body.lead.status).toBe('contacted');

    const convertRes = await request(app)
      .post(`/api/console/landing-leads/${leadId}/convert`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({});
    expect(convertRes.status).toBe(201);
    expect(convertRes.body.lead.status).toBe('converted');
    expect(convertRes.body.lead.assignedOrganizationId).toBe(convertRes.body.organisation.id);
    expect(convertRes.body.organisation.status).toBe('trial');
    expect(convertRes.body.license.status).toBe('trial');
  });

  it('automatically marks matching landing leads as converted when the visitor completes /app?auth=org_signup', async () => {
    const leadRes = await request(app).post('/api/public/landing-leads').send({
      leadType: 'quick_interest',
      email: 'founder@newvinechurch.org',
      churchName: 'New Vine Fellowship',
      sourceSection: 'quick_panel:follow-up',
    });
    expect(leadRes.status).toBe(201);

    const signupRes = await request(app).post('/api/auth/register-organisation').send({
      organizationName: 'New Vine Fellowship',
      orgType: 'church',
      city: 'Kumasi',
      country: 'Ghana',
      adminFirstName: 'Abena',
      adminLastName: 'Osei',
      email: 'founder@newvinechurch.org',
      password: 'StrongPassword123!',
      trialPlan: 'ministry_pro',
    });
    expect(signupRes.status).toBe(201);
    expect(signupRes.body.organization?.id).toBeTruthy();

    const inboxRes = await request(app)
      .get('/api/console/landing-leads')
      .set('Authorization', `Bearer ${creatorToken}`);
    expect(inboxRes.status).toBe(200);
    const matched = inboxRes.body.leads.find((l: any) => l.id === leadRes.body.leadId);
    expect(matched?.status).toBe('converted');
    expect(matched?.assignedOrganizationId).toBe(signupRes.body.organization.id);
  });
});
