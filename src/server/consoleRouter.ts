// src/server/consoleRouter.ts
// Phase 2 Creator Console API Router (/api/console/*)
// Enforces verified identity + app_metadata.creator claim, rate limiting, Zod validation,
// privacy-preserving aggregates, CSV exports, cron rollup, and append-only audit logging on every write.

import express, { type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import Papa from 'papaparse';
import { z } from 'zod';
import {
  extractBearerToken,
  isCreatorClaim,
  requireCreator,
  requireUser,
  resolveVerifiedUserFromToken,
} from '../../lib/auth.ts';
import { platformStore } from './platformStore.ts';
import type { LicenseTier } from '../types/ekklesphere.ts';

export const consoleRouter = express.Router();

const consoleRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'rate_limit_exceeded',
    message: 'Too many Creator Console requests. Please wait a moment and retry.',
  },
});

consoleRouter.use(consoleRateLimiter);

function clientIp(req: Request): string {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) {
    return xff.split(',')[0].trim();
  }
  return req.ip || 'unknown';
}

const LicenseTierEnum = z.enum(['grace_starter', 'ministry_pro', 'cathedral_enterprise']);
const BillingCycleEnum = z.enum(['monthly', 'annual', 'lifetime']);
const OrgStatusEnum = z.enum(['active', 'trial', 'suspended', 'maintenance', 'archived']);
const OrgTypeEnum = z.enum(['church', 'organisation']);

const CreateOrgSchema = z.object({
  name: z.string().trim().min(2, 'Organisation name is required').max(200),
  slug: z.string().trim().max(120).optional(),
  orgType: OrgTypeEnum.default('church'),
  country: z.string().trim().min(2).max(100).default('Ghana'),
  city: z.string().trim().min(1).max(100).default('Accra'),
  campusCode: z.string().trim().max(32).optional(),
  seniorPastor: z.string().trim().max(160).optional(),
  contactName: z.string().trim().max(160).optional(),
  contactEmail: z.string().trim().email('Valid contact email required').or(z.literal('')).optional(),
  contactPhone: z.string().trim().max(40).optional(),
  customDomain: z.string().trim().max(180).optional(),
  initialPlan: LicenseTierEnum.default('grace_starter'),
  autoIssueTrial: z.boolean().default(true),
});

const UpdateOrgSchema = z.object({
  name: z.string().trim().min(2).max(200).optional(),
  orgType: OrgTypeEnum.optional(),
  country: z.string().trim().min(2).max(100).optional(),
  city: z.string().trim().min(1).max(100).optional(),
  campusCode: z.string().trim().max(32).optional(),
  seniorPastor: z.string().trim().max(160).optional(),
  contactName: z.string().trim().max(160).optional(),
  contactEmail: z.string().trim().email().or(z.literal('')).optional(),
  contactPhone: z.string().trim().max(40).optional(),
  status: OrgStatusEnum.optional(),
  customDomain: z.string().trim().max(180).nullable().optional(),
  smsConfigured: z.boolean().optional(),
  pushConfigured: z.boolean().optional(),
  reason: z.string().trim().max(400).optional(),
});

const LicenseOverridesSchema = z
  .object({
    seatsLimit: z.number().int().positive().max(250000).optional(),
    sitesLimit: z.number().int().positive().max(1000).optional(),
    monthlyCheckinsLimit: z.number().int().positive().max(5000000).optional(),
    features: z
      .object({
        bleRadar: z.boolean().optional(),
        smsGateway: z.boolean().optional(),
        biometrics: z.boolean().optional(),
        gdprPrivacyVault: z.boolean().optional(),
        multiCampus: z.boolean().optional(),
        mobileGivingMoMo: z.boolean().optional(),
        customDomain: z.boolean().optional(),
        exportAuditLogs: z.boolean().optional(),
      })
      .optional(),
  })
  .optional();

const IssueLicenseSchema = z.object({
  organizationId: z.string().uuid('Valid organization UUID required'),
  tier: LicenseTierEnum,
  billingCycle: BillingCycleEnum.default('annual'),
  status: z.enum(['active', 'trial', 'grace_period']).default('active'),
  durationDays: z.number().int().min(1).max(36500).optional(),
  overrides: LicenseOverridesSchema,
  notes: z.string().trim().max(500).optional(),
});

const LicenseActionSchema = z
  .object({
    action: z.enum([
      'renew',
      'upgrade',
      'downgrade',
      'start_trial',
      'suspend',
      'reactivate',
      'revoke',
      'set_overrides',
    ]),
    durationMonths: z.number().int().min(1).max(120).optional(),
    targetTier: LicenseTierEnum.optional(),
    expiresDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'expiresDate must be YYYY-MM-DD')
      .optional(),
    overrides: LicenseOverridesSchema,
    reason: z.string().trim().max(500).optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .superRefine((val, ctx) => {
    if ((val.action === 'suspend' || val.action === 'revoke') && (!val.reason || val.reason.length < 3)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reason'],
        message: 'A clear audit reason (min 3 chars) is required when suspending or revoking a license.',
      });
    }
    if ((val.action === 'upgrade' || val.action === 'downgrade') && !val.targetTier) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['targetTier'],
        message: 'targetTier is required when upgrading or downgrading a license.',
      });
    }
  });

const RecordPaymentSchema = z.object({
  amount: z.number().positive('Payment amount must be positive'),
  currency: z.enum(['GHS', 'USD']),
  method: z.enum(['momo', 'bank', 'cash']),
  reference: z.string().trim().min(2, 'Payment reference is required').max(160),
  paidAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  notes: z.string().trim().max(500).optional(),
});

const UpdatePlanSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  description: z.string().trim().max(400).optional(),
  monthlyCostUSD: z.number().nonnegative().max(100000).optional(),
  annualCostUSD: z.number().nonnegative().max(1000000).optional(),
  seatsLimit: z.number().int().positive().max(250000).optional(),
  sitesLimit: z.number().int().positive().max(1000).optional(),
  monthlyCheckinsLimit: z.number().int().positive().max(5000000).optional(),
  isActive: z.boolean().optional(),
  featureFlags: z
    .object({
      bleRadar: z.boolean(),
      smsGateway: z.boolean(),
      biometrics: z.boolean(),
      gdprPrivacyVault: z.boolean(),
      multiCampus: z.boolean(),
      mobileGivingMoMo: z.boolean(),
      customDomain: z.boolean(),
      exportAuditLogs: z.boolean(),
    })
    .optional(),
});

const UpdateAlertSchema = z.object({
  status: z.enum(['acknowledged', 'resolved']),
});

const CreateAnnouncementSchema = z.object({
  title: z.string().trim().min(3).max(180),
  body: z.string().trim().min(5).max(2000),
  severity: z.enum(['info', 'warning', 'critical']).default('info'),
  targetTiers: z.array(LicenseTierEnum).default([]),
  targetOrganizationIds: z.array(z.string().uuid()).default([]),
  expiresAt: z.string().nullable().optional(),
});

const ToggleAnnouncementSchema = z.object({
  active: z.boolean(),
});

const UpsertFeatureFlagSchema = z.object({
  name: z.string().trim().min(2).max(140),
  description: z.string().trim().max(500).optional(),
  enabledGlobally: z.boolean(),
  enabledTiers: z.array(LicenseTierEnum).default([]),
  organizationOverrides: z.record(z.string(), z.boolean()).optional(),
});

const CreateDataRequestSchema = z.object({
  organizationId: z.string().uuid(),
  requestType: z.enum(['export', 'deletion']),
  requestedByEmail: z.string().trim().email(),
  reason: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(500).optional(),
});

const UpdateDataRequestSchema = z.object({
  status: z.enum(['pending', 'in_progress', 'completed', 'rejected']),
  notes: z.string().trim().max(500).optional(),
});

const CreateSupportGrantSchema = z.object({
  organizationId: z.string().uuid(),
  reason: z.string().trim().min(6, 'Explicit audit reason (min 6 characters) is required').max(500),
  durationMinutes: z.number().int().min(5).max(120).default(30),
});

const LandingConfigUpdateSchema = z.object({
  heroTitle: z.string().trim().min(3).max(240).optional(),
  heroSubtitle: z.string().trim().min(3).max(600).optional(),
  announcementBadge: z.string().trim().max(240).optional(),
  isAnnouncementActive: z.boolean().optional(),
  contactSalesEmail: z.string().trim().email().optional(),
  demoEnabled: z.boolean().optional(),
  showcaseHeadline: z.string().trim().max(240).optional(),
  featuredStats: z
    .object({
      congregationsServed: z.string().trim().max(60).optional(),
      checkinsRecorded: z.string().trim().max(60).optional(),
      proximityAccuracy: z.string().trim().max(60).optional(),
      networkUptime: z.string().trim().max(60).optional(),
    })
    .optional(),
});

// ============================================================================
// NIGHTLY USAGE ROLLUP & PROACTIVE ALERT CRON (Vercel Cron OR Verified Creator)
// ============================================================================

async function handleCronRollup(req: Request, res: Response) {
  const token = extractBearerToken(req);
  const configuredCronSecret = process.env.CRON_SECRET?.trim();

  let actorEmail = 'vercel-cron@system.ekklesphere';
  let actorId: string | null = null;
  let actorRole = 'cron';
  let authorized = false;

  if (configuredCronSecret && configuredCronSecret.length >= 8 && token === configuredCronSecret) {
    authorized = true;
  } else if (token) {
    try {
      const verified = await resolveVerifiedUserFromToken(token);
      if (isCreatorClaim(verified)) {
        authorized = true;
        actorEmail = verified.email;
        actorId = verified.id;
        actorRole = verified.role;
      }
    } catch {
      authorized = false;
    }
  }

  if (!authorized) {
    return res.status(401).json({
      error: 'unauthorized_cron',
      message: 'Valid CRON_SECRET or verified Platform Creator Bearer token is required.',
    });
  }

  const requestedDate =
    (typeof req.body?.date === 'string' && req.body.date) ||
    (typeof req.query?.date === 'string' && req.query.date) ||
    undefined;

  const result = await platformStore.runNightlyUsageRollup(requestedDate);
  await platformStore.appendAuditLog({
    actorId,
    actorEmail,
    actorRole,
    action: 'usage.rollup_executed',
    targetType: 'usage_daily',
    targetId: result.targetDate,
    metadata: result,
    ipAddress: clientIp(req),
  });

  return res.status(200).json({
    success: true,
    ...result,
  });
}

consoleRouter.post('/cron/rollup', handleCronRollup);
consoleRouter.get('/cron/rollup', handleCronRollup);

// ============================================================================
// STRICT SERVER-SIDE CREATOR ENFORCEMENT FOR ALL REMAINING CONSOLE ENDPOINTS
// ============================================================================

consoleRouter.use(requireUser, requireCreator);

// 1. Dashboard Summary (Aggregates only)
consoleRouter.get(['/dashboard', '/overview'], async (_req: Request, res: Response) => {
  const summary = await platformStore.getDashboardSummary();
  const organisations = await platformStore.listOrganisations();
  return res.status(200).json({
    ...summary,
    kpis: summary,
    organisations,
    organizations: organisations,
  });
});

// 2. Organisations Directory & Provisioning
consoleRouter.get('/organisations', async (req: Request, res: Response) => {
  const list = await platformStore.listOrganisations({
    search: typeof req.query.search === 'string' ? req.query.search : undefined,
    status: typeof req.query.status === 'string' ? req.query.status : undefined,
    orgType: typeof req.query.orgType === 'string' ? req.query.orgType : undefined,
    tier: typeof req.query.tier === 'string' ? req.query.tier : undefined,
    country: typeof req.query.country === 'string' ? req.query.country : undefined,
  });
  return res.status(200).json({ organisations: list });
});

consoleRouter.post('/organisations', async (req: Request, res: Response) => {
  const parsed = CreateOrgSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'validation_error',
      details: parsed.error.flatten(),
    });
  }

  const created = await platformStore.createOrganisation(parsed.data);
  await platformStore.appendAuditLog({
    actorId: req.user!.id,
    actorEmail: req.user!.email,
    actorRole: req.user!.role,
    action: 'organisation.provisioned',
    targetType: 'organization',
    targetId: created.organisation.id,
    organizationId: created.organisation.id,
    metadata: {
      name: created.organisation.name,
      orgType: created.organisation.orgType,
      initialPlan: parsed.data.initialPlan,
      autoIssuedTrialKey: created.license?.key || null,
    },
    ipAddress: clientIp(req),
  });

  return res.status(201).json(created);
});

consoleRouter.get('/organisations/:orgId', async (req: Request, res: Response) => {
  const detail = await platformStore.getOrganisationDetail(req.params.orgId);
  if (!detail) {
    return res.status(404).json({ error: 'not_found', message: 'Organisation not found.' });
  }
  return res.status(200).json(detail);
});

consoleRouter.patch('/organisations/:orgId', async (req: Request, res: Response) => {
  const parsed = UpdateOrgSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'validation_error',
      details: parsed.error.flatten(),
    });
  }

  try {
    const { reason, ...patch } = parsed.data;
    const updated = await platformStore.updateOrganisation(req.params.orgId, patch);
    await platformStore.appendAuditLog({
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      actorRole: req.user!.role,
      action: 'organisation.updated',
      targetType: 'organization',
      targetId: updated.id,
      organizationId: updated.id,
      reason: reason || null,
      metadata: patch,
      ipAddress: clientIp(req),
    });
    return res.status(200).json({ organisation: updated });
  } catch (err: any) {
    return res.status(404).json({ error: 'not_found', message: err?.message || 'Organisation not found' });
  }
});

// 3. Licenses & Lifecycle Orchestration
consoleRouter.get('/licenses', async (_req: Request, res: Response) => {
  const licenses = await platformStore.listLicenses();
  return res.status(200).json({ licenses });
});

consoleRouter.post('/licenses/issue', async (req: Request, res: Response) => {
  const parsed = IssueLicenseSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'validation_error',
      details: parsed.error.flatten(),
    });
  }

  try {
    const license = await platformStore.issueLicense(parsed.data);
    await platformStore.appendAuditLog({
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      actorRole: req.user!.role,
      action: 'license.issued',
      targetType: 'license',
      targetId: license.id,
      organizationId: license.organizationId || license.tenantId,
      reason: parsed.data.notes || null,
      metadata: {
        key: license.key,
        tier: license.tier,
        status: license.status,
        billingCycle: license.billingCycle,
        expiresDate: license.expiresDate,
      },
      ipAddress: clientIp(req),
    });

    return res.status(201).json({ license });
  } catch (err: any) {
    return res.status(400).json({ error: 'issue_failed', message: err?.message || 'Could not issue license' });
  }
});

consoleRouter.post('/licenses/:licenseId/action', async (req: Request, res: Response) => {
  const parsed = LicenseActionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'validation_error',
      details: parsed.error.flatten(),
    });
  }

  try {
    const updated = await platformStore.performLicenseAction(req.params.licenseId, parsed.data);
    await platformStore.appendAuditLog({
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      actorRole: req.user!.role,
      action: `license.${parsed.data.action}`,
      targetType: 'license',
      targetId: updated.id,
      organizationId: updated.organizationId || updated.tenantId,
      reason: parsed.data.reason || null,
      metadata: {
        action: parsed.data.action,
        tier: updated.tier,
        status: updated.status,
        expiresDate: updated.expiresDate,
        overrides: updated.overrides,
      },
      ipAddress: clientIp(req),
    });

    return res.status(200).json({ license: updated });
  } catch (err: any) {
    return res.status(404).json({ error: 'license_action_failed', message: err?.message || 'License not found' });
  }
});

// 4. Manual License Payments (GHS / USD · MoMo / Bank / Cash)
consoleRouter.get('/payments', async (req: Request, res: Response) => {
  const organizationId = typeof req.query.organizationId === 'string' ? req.query.organizationId : undefined;
  const payments = await platformStore.listPayments(organizationId);
  return res.status(200).json({ payments });
});

consoleRouter.post('/licenses/:licenseId/payments', async (req: Request, res: Response) => {
  const parsed = RecordPaymentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'validation_error',
      details: parsed.error.flatten(),
    });
  }

  try {
    const payment = await platformStore.recordLicensePayment({
      licenseId: req.params.licenseId,
      ...parsed.data,
      recordedById: req.user!.id,
      recordedByEmail: req.user!.email,
    });

    await platformStore.appendAuditLog({
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      actorRole: req.user!.role,
      action: 'license.payment_recorded',
      targetType: 'license_payment',
      targetId: payment.id,
      organizationId: payment.organizationId,
      metadata: {
        licenseId: payment.licenseId,
        amount: payment.amount,
        currency: payment.currency,
        method: payment.method,
        reference: payment.reference,
        paidAt: payment.paidAt,
      },
      ipAddress: clientIp(req),
    });

    return res.status(201).json({ payment });
  } catch (err: any) {
    return res.status(400).json({ error: 'payment_failed', message: err?.message || 'Could not record payment' });
  }
});

// 5. Plans & Tier Limits
consoleRouter.get('/plans', async (_req: Request, res: Response) => {
  const plans = await platformStore.listPlans();
  return res.status(200).json({ plans });
});

consoleRouter.patch('/plans/:planId', async (req: Request, res: Response) => {
  const tierParse = LicenseTierEnum.safeParse(req.params.planId);
  if (!tierParse.success) {
    return res.status(400).json({ error: 'invalid_plan_id', message: 'Unknown license tier ID' });
  }

  const parsed = UpdatePlanSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation_error', details: parsed.error.flatten() });
  }

  const updated = await platformStore.updatePlan(tierParse.data as LicenseTier, parsed.data);
  await platformStore.appendAuditLog({
    actorId: req.user!.id,
    actorEmail: req.user!.email,
    actorRole: req.user!.role,
    action: 'plan.updated',
    targetType: 'plan',
    targetId: updated.id,
    metadata: parsed.data,
    ipAddress: clientIp(req),
  });

  return res.status(200).json({ plan: updated });
});

// 6. Privacy-Preserving Daily Usage Aggregates (NO GPS trails, NO member names, NO individual giving)
consoleRouter.get('/usage', async (req: Request, res: Response) => {
  const organizationId = typeof req.query.organizationId === 'string' ? req.query.organizationId : undefined;
  const days = Math.min(90, Math.max(1, Number(req.query.days) || 30));
  const usage = await platformStore.listUsageDaily(organizationId, days);
  return res.status(200).json({ usage });
});

// 7. Proactive Platform Alerts
consoleRouter.get('/alerts', async (req: Request, res: Response) => {
  const alerts = await platformStore.listAlerts({
    status: typeof req.query.status === 'string' ? req.query.status : undefined,
    severity: typeof req.query.severity === 'string' ? req.query.severity : undefined,
  });
  return res.status(200).json({ alerts });
});

consoleRouter.patch('/alerts/:alertId', async (req: Request, res: Response) => {
  const parsed = UpdateAlertSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation_error', details: parsed.error.flatten() });
  }

  try {
    const alert = await platformStore.updateAlertStatus(req.params.alertId, parsed.data.status);
    await platformStore.appendAuditLog({
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      actorRole: req.user!.role,
      action: `alert.${parsed.data.status}`,
      targetType: 'alert',
      targetId: alert.id,
      organizationId: alert.organizationId,
      metadata: { alertType: alert.alertType, status: alert.status },
      ipAddress: clientIp(req),
    });
    return res.status(200).json({ alert });
  } catch (err: any) {
    return res.status(404).json({ error: 'not_found', message: err?.message || 'Alert not found' });
  }
});

// 8. Platform Announcements
consoleRouter.get('/announcements', async (_req: Request, res: Response) => {
  const announcements = await platformStore.listAnnouncements();
  return res.status(200).json({ announcements });
});

consoleRouter.post('/announcements', async (req: Request, res: Response) => {
  const parsed = CreateAnnouncementSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation_error', details: parsed.error.flatten() });
  }

  const announcement = await platformStore.createAnnouncement({
    ...parsed.data,
    createdByEmail: req.user!.email,
  });

  await platformStore.appendAuditLog({
    actorId: req.user!.id,
    actorEmail: req.user!.email,
    actorRole: req.user!.role,
    action: 'announcement.created',
    targetType: 'announcement',
    targetId: announcement.id,
    metadata: { title: announcement.title, severity: announcement.severity },
    ipAddress: clientIp(req),
  });

  return res.status(201).json({ announcement });
});

consoleRouter.patch('/announcements/:id', async (req: Request, res: Response) => {
  const parsed = ToggleAnnouncementSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation_error', details: parsed.error.flatten() });
  }

  try {
    const announcement = await platformStore.toggleAnnouncement(req.params.id, parsed.data.active);
    await platformStore.appendAuditLog({
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      actorRole: req.user!.role,
      action: 'announcement.toggled',
      targetType: 'announcement',
      targetId: announcement.id,
      metadata: { active: announcement.active },
      ipAddress: clientIp(req),
    });
    return res.status(200).json({ announcement });
  } catch (err: any) {
    return res.status(404).json({ error: 'not_found', message: err?.message || 'Announcement not found' });
  }
});

// 9. Feature Flags
consoleRouter.get('/feature-flags', async (_req: Request, res: Response) => {
  const featureFlags = await platformStore.listFeatureFlags();
  return res.status(200).json({ featureFlags });
});

consoleRouter.put('/feature-flags/:key', async (req: Request, res: Response) => {
  const key = req.params.key.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  const parsed = UpsertFeatureFlagSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation_error', details: parsed.error.flatten() });
  }

  const flag = await platformStore.upsertFeatureFlag(key, parsed.data);
  await platformStore.appendAuditLog({
    actorId: req.user!.id,
    actorEmail: req.user!.email,
    actorRole: req.user!.role,
    action: 'feature_flag.updated',
    targetType: 'feature_flag',
    targetId: flag.key,
    metadata: parsed.data,
    ipAddress: clientIp(req),
  });

  return res.status(200).json({ featureFlag: flag });
});

// 10. Data Export & Deletion Request Tracker (Act 843 / GDPR)
consoleRouter.get('/data-requests', async (_req: Request, res: Response) => {
  const dataRequests = await platformStore.listDataRequests();
  return res.status(200).json({ dataRequests });
});

consoleRouter.post('/data-requests', async (req: Request, res: Response) => {
  const parsed = CreateDataRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation_error', details: parsed.error.flatten() });
  }

  try {
    const dataRequest = await platformStore.createDataRequest(parsed.data);
    await platformStore.appendAuditLog({
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      actorRole: req.user!.role,
      action: 'data_request.created',
      targetType: 'data_request',
      targetId: dataRequest.id,
      organizationId: dataRequest.organizationId,
      reason: parsed.data.reason || null,
      metadata: {
        requestType: dataRequest.requestType,
        requestedByEmail: dataRequest.requestedByEmail,
      },
      ipAddress: clientIp(req),
    });
    return res.status(201).json({ dataRequest });
  } catch (err: any) {
    return res.status(400).json({ error: 'request_failed', message: err?.message || 'Failed to log data request' });
  }
});

consoleRouter.patch('/data-requests/:id', async (req: Request, res: Response) => {
  const parsed = UpdateDataRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation_error', details: parsed.error.flatten() });
  }

  try {
    const dataRequest = await platformStore.updateDataRequestStatus(
      req.params.id,
      parsed.data.status,
      parsed.data.notes
    );
    await platformStore.appendAuditLog({
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      actorRole: req.user!.role,
      action: 'data_request.updated',
      targetType: 'data_request',
      targetId: dataRequest.id,
      organizationId: dataRequest.organizationId,
      metadata: parsed.data,
      ipAddress: clientIp(req),
    });
    return res.status(200).json({ dataRequest });
  } catch (err: any) {
    return res.status(404).json({ error: 'not_found', message: err?.message || 'Data request not found' });
  }
});

// 11. Audited, Time-Limited Read-Only "View as Organisation Admin" Support Grants
consoleRouter.get('/support-grants', async (_req: Request, res: Response) => {
  const supportGrants = await platformStore.listSupportGrants();
  return res.status(200).json({ supportGrants });
});

consoleRouter.post('/support-grants', async (req: Request, res: Response) => {
  const parsed = CreateSupportGrantSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation_error', details: parsed.error.flatten() });
  }

  try {
    const grant = await platformStore.createSupportGrant({
      organizationId: parsed.data.organizationId,
      creatorUserId: req.user!.id,
      creatorEmail: req.user!.email,
      reason: parsed.data.reason,
      durationMinutes: parsed.data.durationMinutes,
    });

    await platformStore.appendAuditLog({
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      actorRole: req.user!.role,
      action: 'support_grant.issued',
      targetType: 'support_grant',
      targetId: grant.id,
      organizationId: grant.organizationId,
      reason: grant.reason,
      metadata: {
        accessLevel: grant.accessLevel,
        expiresAt: grant.expiresAt,
        durationMinutes: parsed.data.durationMinutes,
      },
      ipAddress: clientIp(req),
    });

    return res.status(201).json({ supportGrant: grant });
  } catch (err: any) {
    return res.status(400).json({ error: 'grant_failed', message: err?.message || 'Could not issue support grant' });
  }
});

consoleRouter.post('/support-grants/:grantId/revoke', async (req: Request, res: Response) => {
  try {
    const grant = await platformStore.revokeSupportGrant(req.params.grantId);
    await platformStore.appendAuditLog({
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      actorRole: req.user!.role,
      action: 'support_grant.revoked',
      targetType: 'support_grant',
      targetId: grant.id,
      organizationId: grant.organizationId,
      reason: grant.reason,
      ipAddress: clientIp(req),
    });
    return res.status(200).json({ supportGrant: grant });
  } catch (err: any) {
    return res.status(404).json({ error: 'not_found', message: err?.message || 'Support grant not found' });
  }
});

// 12. Append-Only Audit Log
consoleRouter.get('/audit-log', async (req: Request, res: Response) => {
  const logs = await platformStore.listAuditLogs({
    organizationId: typeof req.query.organizationId === 'string' ? req.query.organizationId : undefined,
    action: typeof req.query.action === 'string' ? req.query.action : undefined,
    actorEmail: typeof req.query.actorEmail === 'string' ? req.query.actorEmail : undefined,
    limit: req.query.limit ? Number(req.query.limit) : 150,
  });
  return res.status(200).json({ auditLogs: logs });
});

consoleRouter.all('/audit-log/:id', (_req: Request, res: Response) => {
  return res.status(405).json({
    error: 'audit_log_immutable',
    message: 'audit_log is strictly append-only; UPDATE and DELETE operations are prohibited.',
  });
});

// 13. Server-Side Audited CSV Exports
consoleRouter.get('/export/:dataset', async (req: Request, res: Response) => {
  const dataset = req.params.dataset.replace(/\.csv$/i, '').toLowerCase();
  let rows: Record<string, unknown>[] = [];

  switch (dataset) {
    case 'organisations':
    case 'organizations': {
      const orgs = await platformStore.listOrganisations();
      rows = orgs.map((o) => ({
        id: o.id,
        name: o.name,
        slug: o.slug,
        type: o.orgType || 'church',
        status: o.status,
        city: o.city,
        country: o.country,
        contact_email: o.contactEmail,
        license_tier: o.licenseTier,
        license_status: o.licenseStatus || 'active',
        seats_used: o.memberCount,
        seats_limit: o.maxCapacity,
        sites_used: o.sitesCount ?? 0,
        sites_limit: o.sitesLimit ?? 1,
        renewal_date: o.renewalDate,
        created_at: o.createdAt,
      }));
      break;
    }
    case 'licenses': {
      const licenses = await platformStore.listLicenses();
      rows = licenses.map((l) => ({
        id: l.id,
        organization_id: l.organizationId || l.tenantId,
        organization_name: l.tenantName,
        license_key: l.key,
        tier: l.tier,
        status: l.status,
        billing_cycle: l.billingCycle,
        annual_cost_usd: l.annualCostUSD,
        seats_limit: l.seatsLimit,
        sites_limit: l.sitesLimit ?? 1,
        issued_date: l.issuedDate,
        expires_date: l.expiresDate,
        grace_ends_date: l.graceEndsDate || '',
      }));
      break;
    }
    case 'payments': {
      const payments = await platformStore.listPayments();
      rows = payments.map((p) => ({
        id: p.id,
        organization_id: p.organizationId,
        organization_name: p.organizationName || '',
        license_id: p.licenseId,
        amount: p.amount,
        currency: p.currency,
        method: p.method,
        reference: p.reference,
        paid_at: p.paidAt,
        recorded_by: p.recordedByEmail,
      }));
      break;
    }
    case 'usage': {
      const usage = await platformStore.listUsageDaily(undefined, 30);
      rows = usage.map((u) => ({
        usage_date: u.usageDate,
        organization_id: u.organizationId,
        organization_name: u.organizationName || '',
        active_users: u.activeUsers,
        checkins_count: u.checkinsCount,
        flagged_count: u.flaggedCount,
        rejected_count: u.rejectedCount,
        mock_location_attempts: u.mockLocationAttempts,
        sites_count: u.sitesCount,
        push_subscribers: u.pushSubscribers,
      }));
      break;
    }
    case 'audit-log':
    case 'audit': {
      const logs = await platformStore.listAuditLogs({ limit: 500 });
      rows = logs.map((a) => ({
        created_at: a.createdAt,
        actor_email: a.actorEmail,
        actor_role: a.actorRole,
        action: a.action,
        target_type: a.targetType,
        target_id: a.targetId || '',
        organization_id: a.organizationId || '',
        reason: a.reason || '',
      }));
      break;
    }
    case 'data-requests': {
      const reqs = await platformStore.listDataRequests();
      rows = reqs.map((r) => ({
        id: r.id,
        organization_id: r.organizationId,
        organization_name: r.organizationName || '',
        request_type: r.requestType,
        status: r.status,
        requested_by_email: r.requestedByEmail,
        due_at: r.dueAt,
        completed_at: r.completedAt || '',
      }));
      break;
    }
    default:
      return res.status(400).json({
        error: 'invalid_dataset',
        message: 'Supported datasets: organisations, licenses, payments, usage, audit-log, data-requests',
      });
  }

  const csv = Papa.unparse(rows);
  await platformStore.appendAuditLog({
    actorId: req.user!.id,
    actorEmail: req.user!.email,
    actorRole: req.user!.role,
    action: 'console.csv_exported',
    targetType: dataset,
    metadata: { rowCount: rows.length },
    ipAddress: clientIp(req),
  });

  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="ekklesphere-${dataset}-${stamp}.csv"`);
  return res.status(200).send(csv);
});

// 14. Landing Page CMS (Stored in Supabase landing_cms_config)
consoleRouter.get('/landing-config', async (_req: Request, res: Response) => {
  const config = await platformStore.getLandingConfig();
  return res.status(200).json({ landingConfig: config });
});

consoleRouter.put('/landing-config', async (req: Request, res: Response) => {
  const parsed = LandingConfigUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation_error', details: parsed.error.flatten() });
  }

  const updated = await platformStore.updateLandingConfig(parsed.data as any, req.user!.email);
  await platformStore.appendAuditLog({
    actorId: req.user!.id,
    actorEmail: req.user!.email,
    actorRole: req.user!.role,
    action: 'landing_cms.updated',
    targetType: 'landing_cms_config',
    targetId: 'default',
    metadata: { updatedKeys: Object.keys(parsed.data) },
    ipAddress: clientIp(req),
  });

  return res.status(200).json({ landingConfig: updated });
});

// 15. Safe Re-Runnable Legacy Tenants -> Organizations Migration (Dry-Run Default)
consoleRouter.post('/migrations/tenants', async (req: Request, res: Response) => {
  const dryRun = req.body?.dryRun !== false;
  const report = await platformStore.migrateTenantsToOrganizations(dryRun);

  if (!dryRun) {
    await platformStore.appendAuditLog({
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      actorRole: req.user!.role,
      action: 'migration.tenants_applied',
      targetType: 'migration',
      targetId: 'migrate_tenants_to_organizations',
      metadata: report,
      ipAddress: clientIp(req),
    });
  }

  return res.status(200).json({ success: true, report });
});
