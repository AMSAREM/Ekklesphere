// server.ts - Ekklesphere Church Management, Proximity Radar & Creator Console Server
import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import { createServer } from 'http';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { timingSafeEqual } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  expressOrganizationMiddleware,
  enforceOrganizationScope,
  registerSupportGrantLookup,
  registerUserOrganizationResolver,
} from './src/middleware/organizationMiddleware.ts';
import {
  assertProductionAuthConfig,
  isCreatorClaim,
  PRIMARY_CAMPUS_SITE_ID,
  PRIMARY_ORGANIZATION_ID,
  registerExternalIdentityVerifier,
  requireRoles,
  requireUser,
  signToken,
  type ChurchRole,
} from './lib/auth.ts';
import {
  platformStore,
  type LiveCheckinItem,
  type StoredGeofenceEvent,
} from './src/server/platformStore.ts';
import { requireActiveLicense } from './src/server/licenseMiddleware.ts';
import { consoleRouter } from './src/server/consoleRouter.ts';
import { churchWallStore } from './src/server/churchWallStore.ts';
import type { ImportDuplicateMode } from './src/shared/memberImportValidation.ts';
import { MediaProxyError, proxyExternalImage } from './src/server/mediaProxy.ts';

// Fail closed at startup in production if JWT_SECRET, SUPABASE_URL, or SUPABASE_SERVICE_ROLE_KEY are missing.
assertProductionAuthConfig();

// Register Supabase Auth JWT verifier and Creator Read-Only Support Grant lookup
registerExternalIdentityVerifier((token) => platformStore.verifySupabaseAccessToken(token));
registerSupportGrantLookup((grantId, creatorId) =>
  platformStore.verifyActiveSupportGrant(grantId, creatorId)
);
registerUserOrganizationResolver(async (user) => {
  if (user.email) {
    const memberRole = await platformStore.lookupMemberRoleInStore(user.id, user.email);
    if (memberRole?.organizationId) return memberRole.organizationId;
  }
  const orgs = await platformStore.listOrganisations();
  return orgs[0]?.id || null;
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = 3000;

const app = express();
// Enable trust proxy (1 hop) for Cloud Run / reverse proxy environments to correctly resolve client IP
app.set('trust proxy', 1);

app.use(express.json({ limit: '2mb' }));
app.use(expressOrganizationMiddleware);

// Mount Phase 2 Creator Console API (/api/console/*)
app.use('/api/console', consoleRouter);

export function getClientIpKey(req: Request): string {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) {
    return xff.split(',')[0].trim();
  }
  const fwd = req.headers.forwarded;
  if (typeof fwd === 'string' && fwd.trim()) {
    const match = fwd.match(/for="?([^;,"]+)/i);
    if (match?.[1]) return match[1].trim();
  }
  return req.ip || req.socket?.remoteAddress || '127.0.0.1';
}

// Rate limiter for attendance telemetry signals
const attendanceLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 180,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getClientIpKey(req),
  validate: {
    xForwardedForHeader: false,
    forwardedHeader: false,
  },
  message: { error: 'rate_limit_exceeded', message: 'Too many attendance submissions. Please wait.' },
});

// Strict rate limiters for authentication endpoints (brute-force & credential stuffing protection)
const authIpBurstLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `ip:${getClientIpKey(req)}`,
  validate: {
    xForwardedForHeader: false,
    forwardedHeader: false,
  },
  message: {
    error: 'rate_limit_exceeded',
    code: 'AUTH_IP_RATE_LIMITED',
    message: 'Too many authentication attempts from this network. Please wait 15 minutes and try again.',
  },
});

const authLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const rawId =
      typeof req.body?.identifier === 'string'
        ? req.body.identifier
        : typeof req.body?.email === 'string'
        ? req.body.email
        : '';
    return `${getClientIpKey(req)}:${rawId.trim().toLowerCase().slice(0, 80) || 'anon'}`;
  },
  validate: {
    xForwardedForHeader: false,
    forwardedHeader: false,
  },
  message: {
    error: 'rate_limit_exceeded',
    code: 'AUTH_RATE_LIMITED',
    message: 'Too many failed sign-in attempts. Please wait 15 minutes before retrying.',
  },
});

const authRegisterLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `reg:${getClientIpKey(req)}`,
  validate: {
    xForwardedForHeader: false,
    forwardedHeader: false,
  },
  message: {
    error: 'rate_limit_exceeded',
    code: 'REGISTER_RATE_LIMITED',
    message: 'Too many registration attempts from this IP. Please wait before trying again.',
  },
});

const authSessionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `sess:${getClientIpKey(req)}`,
  validate: {
    xForwardedForHeader: false,
    forwardedHeader: false,
  },
  message: {
    error: 'rate_limit_exceeded',
    code: 'SESSION_RATE_LIMITED',
    message: 'Too many session exchange requests. Please wait a moment.',
  },
});

const loginRequestSchema = z
  .object({
    identifier: z.string().trim().min(1).max(160).optional(),
    email: z.string().trim().min(1).max(160).optional(),
    password: z.string().min(1, 'Password is required.').max(256),
  })
  .refine((data) => Boolean((data.identifier || data.email || '').trim()), {
    message: 'Email, phone, or username is required.',
  });

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required.').max(256),
  newPassword: z.string().min(8, 'New password must be at least 8 characters long.').max(256),
  confirmPassword: z.string().max(256).optional(),
});

const registerRequestSchema = z
  .object({
    firstName: z.string().trim().min(1, 'First name is required.').max(80),
    lastName: z.string().trim().min(1, 'Last name is required.').max(80),
    email: z.string().trim().email('Invalid email address.').max(160).optional().or(z.literal('')),
    phone: z.string().trim().min(7).max(32).optional().or(z.literal('')),
    password: z.string().min(8, 'Password must be at least 8 characters long.').max(256),
    organizationId: z.string().trim().uuid().optional(),
    organizationSlug: z.string().trim().max(80).optional(),
    groupName: z.string().trim().max(120).optional(),
    autoCheckinOptedIn: z.boolean().optional(),
  })
  .refine((data) => Boolean((data.email || '').trim() || (data.phone || '').trim()), {
    message: 'Either a valid email address or phone number is required.',
  });

const bootstrapCreatorSchema = z.object({
  email: z.string().trim().email('A valid Creator email address is required.').max(160),
  password: z.string().min(8, 'Creator password must be at least 8 characters long.').max(256),
  username: z.string().trim().min(2).max(80).optional().or(z.literal('')),
  phone: z.string().trim().min(7).max(32).optional().or(z.literal('')),
  name: z.string().trim().min(2).max(160).optional().or(z.literal('')),
  organizationId: z.string().trim().uuid().optional().or(z.literal('')),
  bootstrapSecret: z.string().trim().min(1).max(256).optional(),
});

const registerOrganisationSchema = z.object({
  organizationName: z.string().trim().min(2, 'Organisation / church name is required.').max(160),
  orgType: z.enum(['church', 'organisation']).default('church'),
  city: z.string().trim().max(100).optional(),
  country: z.string().trim().max(100).optional(),
  adminFirstName: z.string().trim().min(1, 'Administrator first name is required.').max(80),
  adminLastName: z.string().trim().min(1, 'Administrator last name is required.').max(80),
  email: z.string().trim().email('A valid email address is required.').max(160),
  phone: z.string().trim().max(32).optional().or(z.literal('')),
  password: z.string().min(8, 'Password must be at least 8 characters long.').max(256),
  trialPlan: z
    .enum(['grace_starter', 'ministry_pro', 'cathedral_enterprise'])
    .default('grace_starter'),
});

const upgradeOrganisationSchema = z.object({
  tier: z.enum(['grace_starter', 'ministry_pro', 'cathedral_enterprise']),
  billingCycle: z.enum(['monthly', 'annual', 'lifetime']).default('annual'),
  paymentMethod: z.enum(['momo', 'bank', 'cash']).default('momo'),
  paymentReference: z.string().trim().min(2, 'Payment reference is required.').max(160),
  currency: z.enum(['GHS', 'USD']).default('USD'),
  notes: z.string().trim().max(400).optional(),
});

/**
 * PHASE 0 REMEDIATION (#2 & #4):
 * Universal Role-Based Access Control (RBAC) & Zero-Trust Organization Scope middleware.
 * Never trusts x-user-role, x-user-id, or x-tenant-id client headers.
 */
export function requireAuthRole(...allowedRoles: ChurchRole[]) {
  const roleGuard = requireRoles(...allowedRoles);
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    await requireUser(req, res, async () => {
      roleGuard(req, res, async () => {
        await enforceOrganizationScope(req, res, next);
      });
    });
  };
}

// Development preview-session endpoint permanently disabled (returns 404 not_found)
app.all('/api/dev/preview-session', (_req: Request, res: Response) => {
  return res.status(404).json({
    error: 'not_found',
    message: 'Development preview-session endpoint has been permanently removed.',
  });
});

// =========================================================================
// HARDENED AUTHENTICATION ROUTES (CREDENTIAL LOGIN, SIGNUP & TOKEN EXCHANGE)
// =========================================================================

// Password-verified credential sign-in. Role and organization ALWAYS come from DB, never req.body.
app.post(
  '/api/auth/login',
  authIpBurstLimiter,
  authLoginLimiter,
  async (req: Request, res: Response) => {
    const parsed = loginRequestSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: 'invalid_input',
        code: 'INVALID_CREDENTIALS',
        message: parsed.error.issues[0]?.message || 'Identifier and password are required.',
      });
    }

    const identifier = (parsed.data.identifier || parsed.data.email || '').trim();
    const ipAddress = getClientIpKey(req);

    try {
      const result = await platformStore.authenticateWithCredentials(
        identifier,
        parsed.data.password,
        ipAddress
      );
      return res.status(200).json({
        token: result.token,
        role: result.user.role,
        organizationId: result.user.organizationId,
        isCreator: result.user.isCreator,
        mustChangePassword: Boolean(result.user.mustChangePassword),
        user: {
          ...result.user,
          organization_id: result.user.organizationId,
          tenant_id: result.user.organizationId,
          is_creator: result.user.isCreator,
          mustChangePassword: Boolean(result.user.mustChangePassword),
        },
        organization: result.organization,
      });
    } catch (err: any) {
      const status = typeof err?.status === 'number' ? err.status : 401;
      if (status === 429 && err?.retryAfterSeconds) {
        res.setHeader('Retry-After', String(err.retryAfterSeconds));
      }
      return res.status(status).json({
        error: status === 429 ? 'rate_limit_exceeded' : err?.code === 'ACCOUNT_INACTIVE' ? 'forbidden' : 'unauthorized',
        code: err?.code || 'INVALID_CREDENTIALS',
        message: err?.message || 'Authentication failed.',
        retryAfterSeconds: err?.retryAfterSeconds,
      });
    }
  }
);

// Public congregation member self-registration. ALWAYS forces role: 'member'.
app.post('/api/auth/register', authRegisterLimiter, async (req: Request, res: Response) => {
  const parsed = registerRequestSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      error: 'invalid_input',
      code: 'INVALID_INPUT',
      message: parsed.error.issues[0]?.message || 'Invalid registration fields provided.',
    });
  }

  const ipAddress = getClientIpKey(req);

  try {
    const result = await platformStore.registerMemberWithCredentials({
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      email: parsed.data.email || undefined,
      phone: parsed.data.phone || undefined,
      password: parsed.data.password,
      organizationId: parsed.data.organizationId,
      organizationSlug: parsed.data.organizationSlug,
      groupName: parsed.data.groupName,
      autoCheckinOptedIn: parsed.data.autoCheckinOptedIn,
      ipAddress,
    });

    return res.status(201).json({
      token: result.token,
      role: 'member',
      organizationId: result.user.organizationId,
      isCreator: false,
      mustChangePassword: false,
      user: {
        ...result.user,
        organization_id: result.user.organizationId,
        tenant_id: result.user.organizationId,
        is_creator: false,
        mustChangePassword: false,
      },
      organization: result.organization,
    });
  } catch (err: any) {
    const status = typeof err?.status === 'number' ? err.status : 400;
    return res.status(status).json({
      error: status === 409 ? 'conflict' : 'registration_failed',
      code: err?.code || 'REGISTRATION_FAILED',
      message: err?.message || 'Could not complete member registration.',
    });
  }
});

// Public Self-Service Organisation / Church Sign-Up (14-Day Free Trial, Upgrade Anytime Later)
app.post(
  '/api/auth/register-organisation',
  authIpBurstLimiter,
  authRegisterLimiter,
  async (req: Request, res: Response) => {
    const parsed = registerOrganisationSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: 'invalid_input',
        code: 'INVALID_INPUT',
        message: parsed.error.issues[0]?.message || 'Invalid organisation sign-up fields provided.',
      });
    }

    const ipAddress = getClientIpKey(req);

    try {
      const result = await platformStore.registerOrganisationTrial({
        organizationName: parsed.data.organizationName,
        orgType: parsed.data.orgType,
        city: parsed.data.city,
        country: parsed.data.country,
        adminFirstName: parsed.data.adminFirstName,
        adminLastName: parsed.data.adminLastName,
        email: parsed.data.email,
        phone: parsed.data.phone || undefined,
        password: parsed.data.password,
        trialPlan: parsed.data.trialPlan,
        ipAddress,
      });

      return res.status(201).json({
        token: result.token,
        role: result.user.role,
        organizationId: result.organization.id,
        isCreator: false,
        mustChangePassword: false,
        user: {
          ...result.user,
          organization_id: result.organization.id,
          tenant_id: result.organization.id,
          is_creator: false,
          mustChangePassword: false,
        },
        organization: result.organization,
        license: result.license,
        evaluation: result.evaluation,
      });
    } catch (err: any) {
      const status = typeof err?.status === 'number' ? err.status : 400;
      return res.status(status).json({
        error: status === 409 ? 'conflict' : 'organisation_registration_failed',
        code: err?.code || 'ORGANISATION_REGISTRATION_FAILED',
        message: err?.message || 'Could not complete organisation trial sign-up.',
      });
    }
  }
);

app.post('/api/auth/logout', authSessionLimiter, (_req: Request, res: Response) => {
  return res.status(200).json({
    success: true,
    message: 'Session cleared successfully.',
  });
});

app.post('/api/auth/change-password', authSessionLimiter, requireUser, async (req: Request, res: Response) => {
  const parsed = changePasswordSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      error: 'invalid_input',
      code: 'INVALID_INPUT',
      message: parsed.error.issues[0]?.message || 'Current password and valid new password are required.',
    });
  }

  if (
    parsed.data.confirmPassword !== undefined &&
    parsed.data.confirmPassword !== parsed.data.newPassword
  ) {
    return res.status(400).json({
      error: 'password_mismatch',
      code: 'PASSWORD_MISMATCH',
      message: 'New password and confirmation do not match.',
    });
  }

  try {
    const result = await platformStore.changePasswordForUser({
      userId: req.user!.id,
      email: req.user!.email,
      currentPassword: parsed.data.currentPassword,
      newPassword: parsed.data.newPassword,
      ipAddress: getClientIpKey(req),
    });

    return res.status(200).json({
      success: true,
      mustChangePassword: result.mustChangePassword,
      passwordUpdatedAt: result.passwordUpdatedAt,
      message: 'Password updated successfully.',
    });
  } catch (err: any) {
    const status = typeof err?.status === 'number' ? err.status : 400;
    return res.status(status).json({
      error: status === 401 ? 'unauthorized' : status === 404 ? 'not_found' : 'password_change_failed',
      code: err?.code || 'PASSWORD_CHANGE_FAILED',
      message: err?.message || 'Could not update password.',
    });
  }
});

// Token refresh/exchange endpoint: requires a verified Bearer token (Supabase JWT or session JWT).
// Role and organization_id ALWAYS come from the verified identity / database membership — NEVER from req.body.
app.post('/api/auth/token', authSessionLimiter, requireUser, async (req: Request, res: Response) => {
  const verifiedUser = req.user!;
  const creator = isCreatorClaim(verifiedUser);

  let resolvedRole: ChurchRole = verifiedUser.role;
  let resolvedOrgId: string = verifiedUser.organization_id || verifiedUser.tenant_id || '';
  let resolvedName: string = verifiedUser.name || verifiedUser.email.split('@')[0] || 'Church User';

  if (!resolvedOrgId || (verifiedUser.auth_provider === 'supabase' && !creator)) {
    const dbMembership = await platformStore.lookupMemberRoleInStore(verifiedUser.id, verifiedUser.email);
    resolvedOrgId = dbMembership.organizationId || resolvedOrgId;
    resolvedRole = dbMembership.role || resolvedRole;
    if (dbMembership.name) resolvedName = dbMembership.name;
  }

  if (!resolvedOrgId) {
    const orgs = await platformStore.listOrganisations();
    resolvedOrgId = orgs[0]?.id || '';
  }

  const token = signToken({
    id: verifiedUser.id,
    email: verifiedUser.email,
    role: creator ? (verifiedUser.role === 'super_admin' ? 'super_admin' : 'creator') : resolvedRole,
    name: resolvedName,
    organization_id: resolvedOrgId,
    tenant_id: resolvedOrgId,
    campus_id: verifiedUser.campus_id,
    is_creator: creator,
    auth_provider: 'session_jwt',
  });

  return res.status(200).json({
    token,
    role: creator ? (verifiedUser.role === 'super_admin' ? 'super_admin' : 'creator') : resolvedRole,
    organizationId: resolvedOrgId,
    isCreator: creator,
    user: {
      id: verifiedUser.id,
      email: verifiedUser.email,
      name: resolvedName,
      role: creator ? (verifiedUser.role === 'super_admin' ? 'super_admin' : 'creator') : resolvedRole,
      organization_id: resolvedOrgId,
      tenant_id: resolvedOrgId,
      is_creator: creator,
    },
  });
});

// Dedicated Creator Console session exchange/refresh endpoint (Strictly authenticated, no bypass)
app.post('/api/auth/creator-session', authSessionLimiter, requireUser, async (req: Request, res: Response) => {
  const verifiedUser = req.user!;
  if (!isCreatorClaim(verifiedUser)) {
    return res.status(403).json({
      error: 'creator_required',
      message: 'Access denied. Verified platform creator privilege is required.',
    });
  }

  const orgs = await platformStore.listOrganisations();
  const activeOrgId = verifiedUser.organization_id || orgs[0]?.id || '';

  const token = signToken({
    id: verifiedUser.id,
    email: verifiedUser.email,
    role: verifiedUser.role === 'super_admin' ? 'super_admin' : 'creator',
    name: verifiedUser.name || 'Platform Creator',
    organization_id: activeOrgId,
    tenant_id: activeOrgId,
    campus_id: verifiedUser.campus_id,
    is_creator: true,
    auth_provider: 'session_jwt',
  });

  return res.status(200).json({
    token,
    role: verifiedUser.role === 'super_admin' ? 'super_admin' : 'creator',
    organizationId: activeOrgId,
    isCreator: true,
    user: {
      id: verifiedUser.id,
      email: verifiedUser.email,
      name: verifiedUser.name || 'Platform Creator',
      role: verifiedUser.role === 'super_admin' ? 'super_admin' : 'creator',
      organization_id: activeOrgId,
      tenant_id: activeOrgId,
      is_creator: true,
    },
  });
});

// Secret-gated Creator bootstrap/rotation endpoint (fail-closed unless CREATOR_BOOTSTRAP_SECRET is configured and matches)
app.post(
  '/api/auth/bootstrap-creator',
  authIpBurstLimiter,
  authRegisterLimiter,
  async (req: Request, res: Response) => {
    const expectedSecret = (process.env.CREATOR_BOOTSTRAP_SECRET || '').trim();
    if (!expectedSecret || expectedSecret.length < 8) {
      return res.status(403).json({
        error: 'bootstrap_disabled',
        code: 'BOOTSTRAP_SECRET_UNCONFIGURED',
        message:
          'Creator bootstrap endpoint is disabled until CREATOR_BOOTSTRAP_SECRET (min 8 characters) is set in server secrets.',
      });
    }

    const parsed = bootstrapCreatorSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: 'invalid_input',
        code: 'INVALID_INPUT',
        message: parsed.error.issues[0]?.message || 'Valid creator bootstrap fields are required.',
      });
    }

    const headerSecretRaw = req.headers['x-creator-bootstrap-secret'];
    const providedSecret = (
      (typeof headerSecretRaw === 'string' ? headerSecretRaw : '') ||
      parsed.data.bootstrapSecret ||
      ''
    ).trim();

    const expectedBuf = Buffer.from(expectedSecret, 'utf8');
    const providedBuf = Buffer.from(providedSecret, 'utf8');
    const matches =
      providedBuf.length === expectedBuf.length && timingSafeEqual(providedBuf, expectedBuf);

    if (!matches) {
      return res.status(403).json({
        error: 'forbidden',
        code: 'INVALID_BOOTSTRAP_SECRET',
        message: 'Invalid CREATOR_BOOTSTRAP_SECRET.',
      });
    }

    try {
      const result = await platformStore.upsertCreatorCredentials({
        email: parsed.data.email,
        password: parsed.data.password,
        username: parsed.data.username || undefined,
        phone: parsed.data.phone || undefined,
        name: parsed.data.name || undefined,
        organizationId: parsed.data.organizationId || undefined,
      });

      await platformStore.appendAuditLog({
        actorId: result.user.id,
        actorEmail: result.user.email,
        actorRole: 'creator',
        action: 'creator.credentials_bootstrapped',
        targetType: 'account_credentials',
        targetId: result.user.id,
        metadata: {
          email: result.user.email,
          username: result.user.username || null,
          hasPhone: Boolean(result.user.phoneE164),
          persistedInSupabase: result.persistedInSupabase,
        },
        ipAddress: getClientIpKey(req),
      });

      return res.status(200).json({
        success: true,
        token: result.token,
        role: result.user.role,
        organizationId: result.user.organizationId,
        isCreator: true,
        persistedInSupabase: result.persistedInSupabase,
        user: {
          ...result.user,
          organization_id: result.user.organizationId,
          tenant_id: result.user.organizationId,
          is_creator: true,
        },
      });
    } catch (err: any) {
      const status = typeof err?.status === 'number' ? err.status : 400;
      return res.status(status).json({
        error: 'bootstrap_failed',
        code: err?.code || 'BOOTSTRAP_FAILED',
        message: err?.message || 'Failed to bootstrap creator credentials.',
      });
    }
  }
);

// =========================================================================
// PUBLIC LANDING CMS & ORG-ADMIN SELF-USAGE ENDPOINTS
// =========================================================================

app.get('/api/landing-config', async (_req: Request, res: Response) => {
  const landingConfig = await platformStore.getLandingConfig();
  return res.status(200).json({ landingConfig });
});

app.get(
  '/api/organisation/my-usage',
  requireAuthRole('admin', 'pastor', 'finance', 'super_admin', 'creator'),
  async (req: Request, res: Response) => {
    const orgId = req.organizationId!;
    const [evaluation, usageDaily, allAnnouncements] = await Promise.all([
      platformStore.evaluateOrganizationLicense(orgId),
      platformStore.listUsageDaily(orgId, 30),
      platformStore.listAnnouncements(),
    ]);

    const nowMs = Date.now();
    const announcements = allAnnouncements.filter((a) => {
      if (!a.active) return false;
      if (a.expiresAt && new Date(a.expiresAt).getTime() <= nowMs) return false;
      const tierMatch = a.targetTiers.length === 0 || (evaluation.tier && a.targetTiers.includes(evaluation.tier));
      const orgMatch = a.targetOrganizationIds.length === 0 || a.targetOrganizationIds.includes(orgId);
      return Boolean(tierMatch && orgMatch);
    });

    return res.status(200).json({
      organizationId: orgId,
      evaluation,
      usageDaily,
      announcements,
    });
  }
);

// Organisation Subscription Plans & Self-Service Plan Upgrade (Accessible even during expired trial so orgs can upgrade)
app.get(
  '/api/organisation/plans',
  requireAuthRole('admin', 'pastor', 'finance', 'super_admin', 'creator'),
  async (req: Request, res: Response) => {
    const orgId = req.organizationId!;
    const [plans, evaluation, organization, license] = await Promise.all([
      platformStore.listPlans(),
      platformStore.evaluateOrganizationLicense(orgId),
      platformStore.getOrganisationById(orgId),
      platformStore.getLatestLicenseForOrg(orgId),
    ]);

    return res.status(200).json({
      organizationId: orgId,
      plans: plans.filter((p) => p.isActive),
      evaluation,
      organization,
      license,
    });
  }
);

app.post(
  '/api/organisation/upgrade',
  requireAuthRole('admin', 'finance', 'super_admin', 'creator'),
  async (req: Request, res: Response) => {
    const parsed = upgradeOrganisationSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: 'validation_error',
        code: 'INVALID_UPGRADE_INPUT',
        message: parsed.error.issues[0]?.message || 'Valid plan tier and payment reference are required.',
      });
    }

    const orgId = req.organizationId!;
    try {
      const result = await platformStore.upgradeOrganisationSubscription({
        organizationId: orgId,
        tier: parsed.data.tier,
        billingCycle: parsed.data.billingCycle,
        paymentMethod: parsed.data.paymentMethod,
        paymentReference: parsed.data.paymentReference,
        currency: parsed.data.currency,
        notes: parsed.data.notes,
        actorId: req.user?.id,
        actorEmail: req.user?.email || 'org-admin@ekklesphere.church',
      });

      await platformStore.appendAuditLog({
        organizationId: orgId,
        actorId: req.user?.id || null,
        actorEmail: req.user?.email || 'org-admin@ekklesphere.church',
        actorRole: req.user?.role || 'admin',
        action: 'license.self_upgraded',
        targetType: 'license',
        targetId: result.license.id,
        metadata: {
          tier: parsed.data.tier,
          billingCycle: parsed.data.billingCycle,
          paymentMethod: parsed.data.paymentMethod,
          paymentReference: parsed.data.paymentReference,
          amountUSD: result.payment.amount,
        },
        ipAddress: getClientIpKey(req),
      });

      return res.status(200).json({
        success: true,
        ...result,
      });
    } catch (err: any) {
      const status = typeof err?.status === 'number' ? err.status : 400;
      return res.status(status).json({
        error: 'upgrade_failed',
        code: err?.code || 'UPGRADE_FAILED',
        message: err?.message || 'Could not complete plan upgrade.',
      });
    }
  }
);

// =========================================================================
// HAVERSINE & TELEMETRY HELPERS
// =========================================================================

function computeDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ACCURACY_M = 100;

const EventSchema = z.object({
  clientEventId: z.string().regex(uuidRegex, 'Invalid UUID'),
  siteId: z.string().regex(uuidRegex, 'Invalid UUID').default(PRIMARY_CAMPUS_SITE_ID),
  organizationId: z.string().regex(uuidRegex, 'Invalid UUID').optional(),
  personId: z.string().min(1).max(128).optional(),
  personName: z.string().min(1).max(160).optional(),
  serviceInstanceId: z.string().max(128).optional(),
  type: z.enum(['enter', 'exit', 'manual_in', 'manual_out']),
  source: z.enum(['geofence', 'manual', 'web']),
  platform: z.enum(['android', 'web', 'ios']).default('web'),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
  accuracyM: z.number().nonnegative().nullable(),
  isMock: z.boolean().default(false),
  deviceTime: z.string().datetime(),
});

const PremiseConfigSchema = z.object({
  siteId: z.string().regex(uuidRegex, 'Invalid site UUID').optional(),
  churchName: z.preprocess(
    (val) => (typeof val === 'string' ? val.trim() : ''),
    z.string().max(300).default('')
  ),
  campusName: z.preprocess(
    (val) => (typeof val === 'string' && val.trim().length > 0 ? val.trim() : 'Main Campus'),
    z.string().max(300).default('Main Campus')
  ),
  campusAddress: z.preprocess(
    (val) => (typeof val === 'string' ? val.trim() : ''),
    z.string().max(500).default('')
  ),
  lat: z.preprocess((val) => {
    const num = typeof val === 'number' ? val : parseFloat(String(val));
    return Number.isFinite(num) ? num : NaN;
  }, z.number().min(-90).max(90)),
  lng: z.preprocess((val) => {
    const num = typeof val === 'number' ? val : parseFloat(String(val));
    return Number.isFinite(num) ? num : NaN;
  }, z.number().min(-180).max(180)),
  accuracyM: z.preprocess((val) => {
    if (val == null || val === '') return null;
    const num = typeof val === 'number' ? val : parseFloat(String(val));
    return Number.isFinite(num) ? Math.max(0, num) : null;
  }, z.number().nullable().default(null)),
  innerGeofenceMeters: z.preprocess((val) => {
    if (val == null || val === '') return 50;
    const num = typeof val === 'number' ? val : parseFloat(String(val));
    return Number.isFinite(num) ? Math.max(10, Math.min(5000, Math.round(num))) : 50;
  }, z.number().default(50)),
  outerGeofenceMeters: z.preprocess((val) => {
    if (val == null || val === '') return 300;
    const num = typeof val === 'number' ? val : parseFloat(String(val));
    return Number.isFinite(num) ? Math.max(25, Math.min(10000, Math.round(num))) : 300;
  }, z.number().default(300)),
  dwellTimeMinutes: z.preprocess((val) => {
    if (val == null || val === '') return 5;
    const num = typeof val === 'number' ? val : parseFloat(String(val));
    return Number.isFinite(num) ? Math.max(1, Math.min(120, Math.round(num))) : 5;
  }, z.number().default(5)),
  updatedBy: z.preprocess(
    (val) => (typeof val === 'string' && val.trim().length > 0 ? val.trim() : 'Administrator'),
    z.string().max(200).default('Administrator')
  ),
});

function computeTelemetrySummaryFromEvents(events: StoredGeofenceEvent[], includeNamedSignals = true) {
  let accepted = 0;
  let flagged = 0;
  let rejected = 0;
  let mockAttempts = 0;

  for (const ev of events) {
    if (ev.status === 'accepted') accepted++;
    else if (ev.status === 'flagged') flagged++;
    else if (ev.status === 'rejected') rejected++;
    if (ev.is_mock || ev.flag_reasons?.includes('mock_location')) mockAttempts++;
  }

  const eventsByUser = new Map<string, StoredGeofenceEvent[]>();
  for (const ev of events) {
    const list = eventsByUser.get(ev.user_id) || [];
    list.push(ev);
    eventsByUser.set(ev.user_id, list);
  }

  let openShifts = 0;
  const completedDurations: number[] = [];

  for (const userEvents of eventsByUser.values()) {
    const chronological = [...userEvents].sort(
      (a, b) => new Date(a.server_time).getTime() - new Date(b.server_time).getTime()
    );
    let openIn: StoredGeofenceEvent | null = null;
    for (const ev of chronological) {
      if (ev.type === 'enter' || ev.type === 'manual_in') {
        openIn = ev;
      } else if ((ev.type === 'exit' || ev.type === 'manual_out') && openIn) {
        const durMin = Math.max(
          0,
          Math.round((new Date(ev.server_time).getTime() - new Date(openIn.server_time).getTime()) / 60000)
        );
        completedDurations.push(durMin);
        openIn = null;
      }
    }
    if (openIn) openShifts++;
  }

  const avgDwellMinutes =
    completedDurations.length > 0
      ? Math.round(completedDurations.reduce((a, b) => a + b, 0) / completedDurations.length)
      : null;

  return {
    totalSignals: events.length,
    accepted,
    flagged,
    rejected,
    mockAttempts,
    openShifts,
    avgDwellMinutes,
    recentSignals: includeNamedSignals
      ? events.slice(0, 12).map((e) => ({
          id: e.id,
          person_id: e.person_id || e.user_id,
          person_name: e.person_name,
          type: e.type,
          source: e.source,
          distance_m: e.distance_m,
          accuracy_m: e.accuracy_m,
          is_mock: e.is_mock,
          server_time: e.server_time,
          status: e.status,
          flag_reasons: e.flag_reasons,
        }))
      : [],
  };
}

// =========================================================================
// CHURCH PREMISE GPS GEOFENCE CONFIGURATION ENDPOINTS (AUTH + ORG SCOPED)
// =========================================================================

app.get(
  ['/campus-premise', '/api/campus-premise'],
  requireAuthRole('admin', 'pastor', 'usher', 'member', 'group_leader', 'finance', 'super_admin', 'creator'),
  requireActiveLicense,
  async (req: Request, res: Response) => {
    const orgId = req.organizationId!;
    const isStaff = req.user?.role !== 'member';
    const [premiseData, allCheckins, rawEvents] = await Promise.all([
      platformStore.getPremiseSettings(orgId),
      platformStore.getLiveCheckins(orgId),
      platformStore.getRawGeofenceEvents(orgId),
    ]);

    const visibleCheckins = isStaff
      ? allCheckins
      : allCheckins.filter(
          (c) =>
            c.personId === req.user?.id ||
            c.personId === req.user?.email ||
            (req.user?.name && c.personName === req.user.name)
        );

    return res.status(200).json({
      success: true,
      configured: premiseData.configured,
      site: premiseData.site,
      premiseSettings: premiseData.premiseSettings,
      liveCheckins: visibleCheckins,
      totalCheckedIn: allCheckins.length,
      telemetrySummary: computeTelemetrySummaryFromEvents(rawEvents, isStaff),
    });
  }
);

app.post(
  ['/campus-premise', '/api/campus-premise'],
  requireAuthRole('admin', 'super_admin', 'creator'),
  requireActiveLicense,
  async (req: Request, res: Response) => {
    const parsed = PremiseConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'invalid_premise_coordinates',
        message: 'Valid latitude (-90..90) and longitude (-180..180) are required.',
        details: parsed.error.flatten(),
      });
    }

    const data = parsed.data;
    try {
      const saved = await platformStore.savePremiseSettings(req.organizationId!, {
        siteId: data.siteId,
        churchName: data.churchName,
        campusName: data.campusName,
        campusAddress: data.campusAddress,
        lat: data.lat,
        lng: data.lng,
        accuracyM: data.accuracyM ?? null,
        innerGeofenceMeters: data.innerGeofenceMeters,
        outerGeofenceMeters: Math.max(data.outerGeofenceMeters, data.innerGeofenceMeters),
        dwellTimeMinutes: data.dwellTimeMinutes,
        updatedBy: data.updatedBy || req.user?.email || 'Administrator',
      });

      return res.status(200).json({
        success: true,
        configured: true,
        site: saved.site,
        premiseSettings: saved.premiseSettings,
        sites: saved.sites,
      });
    } catch (err: any) {
      if (err?.code === 'SITE_LIMIT_REACHED') {
        return res.status(403).json({
          error: 'license_limit_exceeded',
          code: 'SITE_LIMIT_REACHED',
          message: err.message,
        });
      }
      return res.status(500).json({
        error: 'premise_save_failed',
        message: err?.message || 'Failed to save campus premise settings.',
      });
    }
  }
);

app.delete(
  ['/campus-premise', '/api/campus-premise'],
  requireAuthRole('admin', 'super_admin', 'creator'),
  requireActiveLicense,
  async (req: Request, res: Response) => {
    const premiseSettings = await platformStore.clearPremiseSettings(req.organizationId!);
    return res.status(200).json({
      success: true,
      configured: false,
      site: null,
      premiseSettings,
      sites: [],
    });
  }
);

// =========================================================================
// SYSTEM SETTINGS, AUDIT LOGS, GATEWAYS & CHURCH GROUPS (ORG SCOPED SUPABASE)
// =========================================================================

const SystemSettingsPatchSchema = z.object({
  churchName: z.string().trim().max(300).optional(),
  campusName: z.string().trim().max(300).optional(),
  campusAddress: z.string().trim().max(500).optional(),
  campusLatitude: z.number().min(-90).max(90).nullable().optional(),
  campusLongitude: z.number().min(-180).max(180).nullable().optional(),
  campusLocationAccuracyM: z.number().min(0).nullable().optional(),
  campusLocationUpdatedAt: z.string().max(100).nullable().optional(),
  seniorPastor: z.string().trim().max(200).optional(),
  contactEmail: z.string().trim().max(200).optional(),
  contactPhone: z.string().trim().max(64).optional(),
  timezone: z.string().trim().max(120).optional(),
  currency: z.string().trim().max(80).optional(),
  outerGeofenceMeters: z.number().min(25).max(10000).optional(),
  innerGeofenceMeters: z.number().min(10).max(5000).optional(),
  dwellTimeMinutes: z.number().min(1).max(120).optional(),
  serviceWindowBeforeMinutes: z.number().min(0).max(240).optional(),
  serviceWindowAfterMinutes: z.number().min(0).max(240).optional(),
  bleBeaconRssiThreshold: z.number().min(-100).max(-20).optional(),
  driveByProtection: z.boolean().optional(),
  absenteeThresholdServices: z.number().min(1).max(12).optional(),
  firstTimerFollowupHours: z.number().min(1).max(336).optional(),
  autoAssignCellLeaders: z.boolean().optional(),
  requireExplicitConsent: z.boolean().optional(),
  auditLogRetentionDays: z.number().min(7).max(3650).optional(),
  smsGatewayProvider: z.string().trim().min(1).max(120).optional(),
  smsSenderId: z.string().trim().min(1).max(11).optional(),
  enablePushNotifications: z.boolean().optional(),
});

const TestSmsGatewaySchema = z.object({
  provider: z.string().trim().min(1, 'SMS gateway provider is required.').max(120),
  senderId: z
    .string()
    .trim()
    .min(1, 'SMS Sender ID is required.')
    .max(11, 'SMS Sender ID must be 11 characters or fewer.'),
});

const ChurchGroupCreateSchema = z.object({
  name: z.string().trim().min(1, 'Group name is required.').max(160),
  category: z.enum(['ministry', 'fellowship', 'cell_group']),
  leaderName: z.string().trim().min(1, 'Primary leader name is required.').max(160),
  leaderMemberId: z.string().trim().max(120).optional().nullable(),
  leaderPhone: z.string().trim().max(64).optional().nullable(),
  leaderEmail: z.string().trim().max(160).optional().nullable(),
  assistantLeader: z.string().trim().max(160).optional().nullable(),
  assistantLeaderMemberId: z.string().trim().max(120).optional().nullable(),
  meetingDay: z.string().trim().max(100).optional().nullable(),
  meetingTime: z.string().trim().max(100).optional().nullable(),
  meetingLocation: z.string().trim().max(240).optional().nullable(),
  targetDemographic: z.string().trim().max(160).optional().nullable(),
  description: z.string().trim().max(1000).optional().default(''),
  active: z.boolean().optional().default(true),
});

const ChurchGroupUpdateSchema = ChurchGroupCreateSchema.partial().extend({
  leadershipChangeReason: z.string().trim().max(300).optional().nullable(),
});

app.get(
  '/api/system-settings',
  requireAuthRole('admin', 'pastor', 'usher', 'member', 'group_leader', 'finance', 'super_admin', 'creator'),
  requireActiveLicense,
  async (req: Request, res: Response) => {
    try {
      const result = await platformStore.getSystemSettings(req.organizationId!);
      return res.status(200).json({
        success: true,
        ...result,
      });
    } catch (err: any) {
      return res.status(500).json({
        error: 'system_settings_fetch_failed',
        message: err?.message || 'Failed to load organisation system settings.',
      });
    }
  }
);

app.put(
  '/api/system-settings',
  requireAuthRole('admin', 'super_admin', 'creator'),
  requireActiveLicense,
  async (req: Request, res: Response) => {
    const parsed = SystemSettingsPatchSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: 'validation_error',
        message: parsed.error.issues[0]?.message || 'Invalid system settings payload.',
        details: parsed.error.flatten(),
      });
    }

    try {
      const result = await platformStore.saveSystemSettings(req.organizationId!, parsed.data, {
        id: req.user?.id,
        email: req.user?.email,
        role: req.user?.role,
        name: req.user?.name,
        ipAddress: getClientIpKey(req),
      });
      return res.status(200).json({
        success: true,
        ...result,
      });
    } catch (err: any) {
      if (err?.code === 'SITE_LIMIT_REACHED') {
        return res.status(403).json({
          error: 'license_limit_exceeded',
          code: 'SITE_LIMIT_REACHED',
          message: err.message,
        });
      }
      return res.status(500).json({
        error: 'system_settings_save_failed',
        message: err?.message || 'Failed to save organisation system settings.',
      });
    }
  }
);

app.patch(
  '/api/system-settings',
  requireAuthRole('admin', 'super_admin', 'creator'),
  requireActiveLicense,
  async (req: Request, res: Response) => {
    const parsed = SystemSettingsPatchSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: 'validation_error',
        message: parsed.error.issues[0]?.message || 'Invalid system settings payload.',
        details: parsed.error.flatten(),
      });
    }

    try {
      const result = await platformStore.saveSystemSettings(req.organizationId!, parsed.data, {
        id: req.user?.id,
        email: req.user?.email,
        role: req.user?.role,
        name: req.user?.name,
        ipAddress: getClientIpKey(req),
      });
      return res.status(200).json({
        success: true,
        ...result,
      });
    } catch (err: any) {
      if (err?.code === 'SITE_LIMIT_REACHED') {
        return res.status(403).json({
          error: 'license_limit_exceeded',
          code: 'SITE_LIMIT_REACHED',
          message: err.message,
        });
      }
      return res.status(500).json({
        error: 'system_settings_save_failed',
        message: err?.message || 'Failed to save organisation system settings.',
      });
    }
  }
);

app.post(
  '/api/system-settings/reset',
  requireAuthRole('admin', 'super_admin', 'creator'),
  requireActiveLicense,
  async (req: Request, res: Response) => {
    try {
      const result = await platformStore.resetSystemSettings(req.organizationId!, {
        id: req.user?.id,
        email: req.user?.email,
        role: req.user?.role,
        name: req.user?.name,
        ipAddress: getClientIpKey(req),
      });
      return res.status(200).json({
        success: true,
        ...result,
      });
    } catch (err: any) {
      return res.status(500).json({
        error: 'system_settings_reset_failed',
        message: err?.message || 'Failed to reset organisation system settings.',
      });
    }
  }
);

app.post(
  '/api/system-settings/test-sms',
  requireAuthRole('admin', 'pastor', 'super_admin', 'creator'),
  requireActiveLicense,
  async (req: Request, res: Response) => {
    const parsed = TestSmsGatewaySchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: 'validation_error',
        message: parsed.error.issues[0]?.message || 'Valid SMS gateway provider and Sender ID are required.',
      });
    }

    const senderId = parsed.data.senderId.toUpperCase();
    const dispatchedAt = new Date().toISOString();

    await platformStore.appendAuditLog({
      organizationId: req.organizationId!,
      actorId: req.user?.id || null,
      actorEmail: req.user?.email || 'admin@ekklesphere.church',
      actorRole: req.user?.role || 'admin',
      action: 'sms.test_dispatched',
      targetType: 'sms_gateway',
      targetId: req.organizationId!,
      metadata: {
        provider: parsed.data.provider,
        senderId,
        dispatchedAt,
      },
      ipAddress: getClientIpKey(req),
    });

    return res.status(200).json({
      success: true,
      provider: parsed.data.provider,
      senderId,
      dispatchedAt,
      message: `Test SMS payload validated via ${parsed.data.provider} (Sender ID: ${senderId}).`,
    });
  }
);

app.get(
  '/api/system-settings/audit-logs',
  requireAuthRole('admin', 'pastor', 'super_admin', 'creator'),
  requireActiveLicense,
  async (req: Request, res: Response) => {
    try {
      const rows = await platformStore.listAuditLogs({
        organizationId: req.organizationId!,
        limit: 150,
      });

      const auditLogs = rows.map((row) => ({
        id: row.id,
        actor: row.actorEmail,
        actorRole: row.actorRole,
        action: row.action,
        entityType: row.targetType,
        targetId: row.targetId,
        timestamp: row.createdAt,
        details:
          row.reason ||
          (row.metadata && Object.keys(row.metadata).length > 0
            ? JSON.stringify(row.metadata)
            : `${row.action} (${row.targetType})`),
        metadata: row.metadata || {},
      }));

      return res.status(200).json({
        success: true,
        auditLogs,
      });
    } catch (err: any) {
      return res.status(500).json({
        error: 'audit_logs_fetch_failed',
        message: err?.message || 'Failed to load audit logs.',
      });
    }
  }
);

app.get(
  '/api/church-groups',
  requireAuthRole('admin', 'pastor', 'usher', 'member', 'group_leader', 'finance', 'super_admin', 'creator'),
  requireActiveLicense,
  async (req: Request, res: Response) => {
    try {
      const groups = await platformStore.listChurchGroups(req.organizationId!);
      return res.status(200).json({
        success: true,
        groups,
      });
    } catch (err: any) {
      return res.status(500).json({
        error: 'church_groups_fetch_failed',
        message: err?.message || 'Failed to load church groups.',
      });
    }
  }
);

app.get(
  '/api/church-groups/leadership-history',
  requireAuthRole('admin', 'pastor', 'usher', 'member', 'group_leader', 'finance', 'super_admin', 'creator'),
  requireActiveLicense,
  async (req: Request, res: Response) => {
    try {
      const rawCategory = typeof req.query.category === 'string' ? req.query.category.trim() : 'all';
      const category =
        rawCategory === 'ministry' || rawCategory === 'fellowship' || rawCategory === 'cell_group'
          ? rawCategory
          : 'all';
      const rawRole = typeof req.query.role === 'string' ? req.query.role.trim() : 'all';
      const role =
        rawRole === 'primary_leader' || rawRole === 'assistant_leader' ? rawRole : 'all';
      const groupId = typeof req.query.groupId === 'string' ? req.query.groupId.trim() : undefined;
      const parsedLimit = Number.parseInt(String(req.query.limit || '200'), 10);
      const limit = Number.isFinite(parsedLimit) ? parsedLimit : 200;

      const history = await platformStore.listChurchGroupLeadershipHistory(req.organizationId!, {
        category,
        groupId,
        role,
        limit,
      });

      return res.status(200).json({
        success: true,
        history,
      });
    } catch (err: any) {
      return res.status(500).json({
        error: 'leadership_history_fetch_failed',
        message: err?.message || 'Failed to load leadership change history.',
      });
    }
  }
);

app.post(
  '/api/church-groups',
  requireAuthRole('admin', 'pastor', 'super_admin', 'creator'),
  requireActiveLicense,
  async (req: Request, res: Response) => {
    const parsed = ChurchGroupCreateSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: 'validation_error',
        message: parsed.error.issues[0]?.message || 'Valid group fields are required.',
      });
    }

    try {
      const primaryLeader = await platformStore.resolveOrganizationLeaderMember(
        req.organizationId!,
        {
          memberId: parsed.data.leaderMemberId,
          leaderName: parsed.data.leaderName,
          fieldLabel: 'leader',
        }
      );

      let resolvedAssistant: { id: string; fullName: string } | null = null;
      const assistantNameRaw = (parsed.data.assistantLeader || '').trim();
      const assistantIdRaw = (parsed.data.assistantLeaderMemberId || '').trim();
      if (assistantNameRaw || assistantIdRaw) {
        resolvedAssistant = await platformStore.resolveOrganizationLeaderMember(
          req.organizationId!,
          {
            memberId: assistantIdRaw || undefined,
            leaderName: assistantNameRaw || undefined,
            fieldLabel: 'assistantLeader',
          }
        );
        if (resolvedAssistant.id === primaryLeader.id) {
          return res.status(400).json({
            error: 'invalid_leader_member',
            field: 'assistantLeader',
            message: 'Assistant / Co-Leader must be a different member from the Primary Leader.',
          });
        }
      }

      const group = await platformStore.createChurchGroup(
        req.organizationId!,
        {
          name: parsed.data.name,
          category: parsed.data.category,
          leaderName: primaryLeader.fullName,
          leaderMemberId: primaryLeader.id,
          leaderPhone: parsed.data.leaderPhone?.trim() || primaryLeader.phoneE164 || undefined,
          leaderEmail: parsed.data.leaderEmail?.trim() || primaryLeader.email || undefined,
          assistantLeader: resolvedAssistant ? resolvedAssistant.fullName : undefined,
          assistantLeaderMemberId: resolvedAssistant ? resolvedAssistant.id : undefined,
          meetingDay: parsed.data.meetingDay?.trim() || undefined,
          meetingTime: parsed.data.meetingTime?.trim() || undefined,
          meetingLocation: parsed.data.meetingLocation?.trim() || undefined,
          targetDemographic: parsed.data.targetDemographic?.trim() || undefined,
          description: parsed.data.description ?? '',
          active: parsed.data.active ?? true,
        },
        {
          id: req.user?.id,
          email: req.user?.email,
          role: req.user?.role,
          name: req.user?.name,
          ipAddress: getClientIpKey(req),
        }
      );
      return res.status(201).json({
        success: true,
        group,
      });
    } catch (err: any) {
      const status = typeof err?.status === 'number' ? err.status : 500;
      const code =
        err?.code === 'INVALID_LEADER_MEMBER' || err?.code === 'AMBIGUOUS_LEADER_MEMBER'
          ? 'invalid_leader_member'
          : 'church_group_create_failed';
      return res.status(status).json({
        error: code,
        field: err?.field,
        message: err?.message || 'Failed to create church group.',
      });
    }
  }
);

async function handleUpdateChurchGroupRequest(req: Request, res: Response) {
  const parsed = ChurchGroupUpdateSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      error: 'validation_error',
      message: parsed.error.issues[0]?.message || 'Valid group update fields are required.',
    });
  }

  try {
    const existingList = await platformStore.listChurchGroups(req.organizationId!);
    const existingGroup = existingList.find((g) => g.id === req.params.id);

    const patch: Record<string, any> = {};
    if (parsed.data.name !== undefined) patch.name = parsed.data.name;
    if (parsed.data.category !== undefined) patch.category = parsed.data.category;
    if (parsed.data.leaderPhone !== undefined) patch.leaderPhone = parsed.data.leaderPhone ?? '';
    if (parsed.data.leaderEmail !== undefined) patch.leaderEmail = parsed.data.leaderEmail ?? '';
    if (parsed.data.meetingDay !== undefined) patch.meetingDay = parsed.data.meetingDay ?? '';
    if (parsed.data.meetingTime !== undefined) patch.meetingTime = parsed.data.meetingTime ?? '';
    if (parsed.data.meetingLocation !== undefined) {
      patch.meetingLocation = parsed.data.meetingLocation ?? '';
    }
    if (parsed.data.targetDemographic !== undefined) {
      patch.targetDemographic = parsed.data.targetDemographic ?? '';
    }
    if (parsed.data.description !== undefined) patch.description = parsed.data.description;
    if (parsed.data.active !== undefined) patch.active = parsed.data.active;
    if (parsed.data.leadershipChangeReason !== undefined) {
      patch.leadershipChangeReason = parsed.data.leadershipChangeReason ?? null;
    }

    let resolvedPrimaryId = existingGroup?.leaderMemberId;

    if (parsed.data.leaderName !== undefined || parsed.data.leaderMemberId !== undefined) {
      const primaryLeader = await platformStore.resolveOrganizationLeaderMember(
        req.organizationId!,
        {
          memberId: parsed.data.leaderMemberId ?? undefined,
          leaderName: parsed.data.leaderName ?? undefined,
          fieldLabel: 'leader',
        }
      );
      patch.leaderName = primaryLeader.fullName;
      patch.leaderMemberId = primaryLeader.id;
      resolvedPrimaryId = primaryLeader.id;
      if (parsed.data.leaderPhone === undefined && !existingGroup?.leaderPhone && primaryLeader.phoneE164) {
        patch.leaderPhone = primaryLeader.phoneE164;
      }
      if (parsed.data.leaderEmail === undefined && !existingGroup?.leaderEmail && primaryLeader.email) {
        patch.leaderEmail = primaryLeader.email;
      }
    }

    if (
      parsed.data.assistantLeader !== undefined ||
      parsed.data.assistantLeaderMemberId !== undefined
    ) {
      const assistantNameRaw = (parsed.data.assistantLeader || '').trim();
      const assistantIdRaw = (parsed.data.assistantLeaderMemberId || '').trim();
      if (!assistantNameRaw && !assistantIdRaw) {
        patch.assistantLeader = '';
        patch.assistantLeaderMemberId = null;
      } else {
        const resolvedAssistant = await platformStore.resolveOrganizationLeaderMember(
          req.organizationId!,
          {
            memberId: assistantIdRaw || undefined,
            leaderName: assistantNameRaw || undefined,
            fieldLabel: 'assistantLeader',
          }
        );
        if (resolvedPrimaryId && resolvedAssistant.id === resolvedPrimaryId) {
          return res.status(400).json({
            error: 'invalid_leader_member',
            field: 'assistantLeader',
            message: 'Assistant / Co-Leader must be a different member from the Primary Leader.',
          });
        }
        patch.assistantLeader = resolvedAssistant.fullName;
        patch.assistantLeaderMemberId = resolvedAssistant.id;
      }
    }

    const group = await platformStore.updateChurchGroup(
      req.organizationId!,
      req.params.id,
      patch,
      {
        id: req.user?.id,
        email: req.user?.email,
        role: req.user?.role,
        name: req.user?.name,
        ipAddress: getClientIpKey(req),
      }
    );
    return res.status(200).json({
      success: true,
      group,
    });
  } catch (err: any) {
    const status = typeof err?.status === 'number' ? err.status : 500;
    const errorCode =
      status === 404
        ? 'not_found'
        : err?.code === 'INVALID_LEADER_MEMBER' || err?.code === 'AMBIGUOUS_LEADER_MEMBER'
        ? 'invalid_leader_member'
        : 'church_group_update_failed';
    return res.status(status).json({
      error: errorCode,
      field: err?.field,
      message: err?.message || 'Failed to update church group.',
    });
  }
}

app.put(
  '/api/church-groups/:id',
  requireAuthRole('admin', 'pastor', 'super_admin', 'creator'),
  requireActiveLicense,
  handleUpdateChurchGroupRequest
);

app.patch(
  '/api/church-groups/:id',
  requireAuthRole('admin', 'pastor', 'super_admin', 'creator'),
  requireActiveLicense,
  handleUpdateChurchGroupRequest
);

app.delete(
  '/api/church-groups/:id',
  requireAuthRole('admin', 'pastor', 'super_admin', 'creator'),
  requireActiveLicense,
  async (req: Request, res: Response) => {
    try {
      await platformStore.deleteChurchGroup(req.organizationId!, req.params.id, {
        id: req.user?.id,
        email: req.user?.email,
        role: req.user?.role,
        name: req.user?.name,
        ipAddress: getClientIpKey(req),
      });
      return res.status(200).json({
        success: true,
      });
    } catch (err: any) {
      const status = typeof err?.status === 'number' ? err.status : 500;
      return res.status(status).json({
        error: status === 404 ? 'not_found' : 'church_group_delete_failed',
        message: err?.message || 'Failed to delete church group.',
      });
    }
  }
);


// =========================================================================
// GOOGLE MAPS & WHATSAPP LOCATION LINK RESOLVER FOR CHURCH PREMISES
// =========================================================================

function isValidLatLng(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

function isAllowedMapHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h === 'maps.app.goo.gl' ||
    h === 'goo.gl' ||
    h === 'g.co' ||
    h === 'google.com' ||
    h.endsWith('.google.com') ||
    /^www\.google\.[a-z.]+$/.test(h) ||
    /^maps\.google\.[a-z.]+$/.test(h) ||
    h === 'maps.apple.com'
  );
}

function parseDmsPair(text: string): { lat: number; lng: number } | null {
  const dmsRegex =
    /(\d{1,2})\s*[°]\s*(\d{1,2})\s*['′]\s*(\d{1,2}(?:\.\d+)?)\s*(?:["″]|'')?\s*([NSns])[\s,+;/]+(\d{1,3})\s*[°]\s*(\d{1,2})\s*['′]\s*(\d{1,2}(?:\.\d+)?)\s*(?:["″]|'')?\s*([EWew])/;
  const m = text.match(dmsRegex);
  if (!m) return null;
  let lat = Number(m[1]) + Number(m[2]) / 60 + Number(m[3]) / 3600;
  if (m[4].toUpperCase() === 'S') lat = -lat;
  let lng = Number(m[5]) + Number(m[6]) / 60 + Number(m[7]) / 3600;
  if (m[8].toUpperCase() === 'W') lng = -lng;
  return isValidLatLng(lat, lng) ? { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) } : null;
}

function extractPlaceNameFromUrl(urlStr: string): string | null {
  try {
    const placeMatch = urlStr.match(/\/maps\/place\/([^/@?]+)/i);
    if (!placeMatch) return null;
    const decoded = decodeURIComponent(placeMatch[1].replace(/\+/g, ' ')).trim();
    if (!decoded || /^[-?\d.\s°'"NSWE,]+$/i.test(decoded)) return null;
    return decoded.slice(0, 140);
  } catch {
    return null;
  }
}

function extractCoordsFromString(input: string): { lat: number; lng: number; placeName?: string | null } | null {
  let decoded = input;
  try {
    decoded = decodeURIComponent(input.replace(/\+/g, ' '));
  } catch {
    decoded = input;
  }

  const placeName = extractPlaceNameFromUrl(input);

  const pinMatches = Array.from(decoded.matchAll(/!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/g));
  if (pinMatches.length > 0) {
    const last = pinMatches[pinMatches.length - 1];
    const lat = Number(last[1]);
    const lng = Number(last[2]);
    if (isValidLatLng(lat, lng)) {
      return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)), placeName };
    }
  }

  try {
    const urlMatch = input.match(/https?:\/\/[^\s"'<>]+/i);
    if (urlMatch) {
      const u = new URL(urlMatch[0]);
      const paramKeys = ['q', 'query', 'll', 'sll', 'center', 'destination', 'daddr', 'viewpoint'];
      for (const key of paramKeys) {
        const val = u.searchParams.get(key);
        if (!val) continue;
        const cleanVal = val.replace(/^loc:/i, '').trim();
        const dmsInParam = parseDmsPair(cleanVal);
        if (dmsInParam) return { ...dmsInParam, placeName };

        const pairMatch = cleanVal.match(/(-?\d{1,2}\.\d+)\s*[,\s]\s*\+?(-?\d{1,3}\.\d+)/);
        if (pairMatch) {
          const lat = Number(pairMatch[1]);
          const lng = Number(pairMatch[2]);
          if (isValidLatLng(lat, lng)) {
            return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)), placeName };
          }
        }
      }
    }
  } catch {
    // Ignore malformed URL
  }

  const pathCoordMatch = decoded.match(
    /\/maps\/(?:search|place|dir\/[^/]*)\/\s*(-?\d{1,2}\.\d+)\s*,\s*\+?(-?\d{1,3}\.\d+)/i
  );
  if (pathCoordMatch) {
    const lat = Number(pathCoordMatch[1]);
    const lng = Number(pathCoordMatch[2]);
    if (isValidLatLng(lat, lng)) {
      return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)), placeName };
    }
  }

  const dms = parseDmsPair(decoded);
  if (dms) {
    return { ...dms, placeName };
  }

  const atMatch = decoded.match(/@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/);
  if (atMatch) {
    const lat = Number(atMatch[1]);
    const lng = Number(atMatch[2]);
    if (isValidLatLng(lat, lng)) {
      return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)), placeName };
    }
  }

  const rawPairMatch = decoded.trim().match(/^\(?\s*(-?\d{1,2}\.\d+)\s*[,/\s]\s*\+?(-?\d{1,3}\.\d+)\s*\)?$/);
  if (rawPairMatch) {
    const lat = Number(rawPairMatch[1]);
    const lng = Number(rawPairMatch[2]);
    if (isValidLatLng(lat, lng)) {
      return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)), placeName: null };
    }
  }

  return null;
}

app.post(
  ['/campus-premise/resolve-link', '/api/campus-premise/resolve-link'],
  requireAuthRole('admin', 'pastor', 'super_admin', 'creator'),
  requireActiveLicense,
  async (req: Request, res: Response) => {
    const rawInput = typeof req.body?.input === 'string' ? req.body.input.trim() : '';
    if (!rawInput || rawInput.length > 2000) {
      return res.status(400).json({
        error: 'invalid_input',
        message: 'Paste a shared Google Maps link or GPS coordinate pair.',
      });
    }

    const direct = extractCoordsFromString(rawInput);
    if (direct) {
      return res.status(200).json({
        success: true,
        lat: direct.lat,
        lng: direct.lng,
        placeName: direct.placeName || null,
        resolvedUrl: rawInput,
      });
    }

    const urlMatch = rawInput.match(/https?:\/\/[^\s"'<>]+/i);
    if (!urlMatch) {
      return res.status(422).json({
        error: 'coordinates_not_found',
        message: 'Could not find GPS coordinates or a valid Google Maps link in the pasted text.',
      });
    }

    let currentUrl = urlMatch[0];
    try {
      const initialParsed = new URL(currentUrl);
      if (!isAllowedMapHost(initialParsed.hostname)) {
        return res.status(400).json({
          error: 'unsupported_domain',
          message: 'Only Google Maps and Apple Maps shared links are supported.',
        });
      }
    } catch {
      return res.status(400).json({
        error: 'invalid_url',
        message: 'The pasted link is not a valid URL.',
      });
    }

    try {
      for (let hop = 0; hop < 6; hop++) {
        const parsedHop = new URL(currentUrl);
        if (!isAllowedMapHost(parsedHop.hostname)) break;

        if (parsedHop.hostname.includes('consent.google.')) {
          const continueUrl = parsedHop.searchParams.get('continue');
          if (continueUrl) {
            currentUrl = continueUrl;
            const fromConsent = extractCoordsFromString(currentUrl);
            if (fromConsent) {
              return res.status(200).json({
                success: true,
                lat: fromConsent.lat,
                lng: fromConsent.lng,
                placeName: fromConsent.placeName || null,
                resolvedUrl: currentUrl,
              });
            }
            continue;
          }
        }

        const response = await fetch(currentUrl, {
          method: 'GET',
          redirect: 'manual',
          signal: AbortSignal.timeout(8000),
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
          },
        });

        const locationHeader = response.headers.get('location');
        if (locationHeader && response.status >= 300 && response.status < 400) {
          currentUrl = new URL(locationHeader, currentUrl).toString();
          const fromRedirect = extractCoordsFromString(currentUrl);
          if (fromRedirect) {
            return res.status(200).json({
              success: true,
              lat: fromRedirect.lat,
              lng: fromRedirect.lng,
              placeName: fromRedirect.placeName || null,
              resolvedUrl: currentUrl,
            });
          }
          continue;
        }

        const fromFinalUrl = extractCoordsFromString(currentUrl);
        if (fromFinalUrl) {
          return res.status(200).json({
            success: true,
            lat: fromFinalUrl.lat,
            lng: fromFinalUrl.lng,
            placeName: fromFinalUrl.placeName || null,
            resolvedUrl: currentUrl,
          });
        }

        break;
      }

      return res.status(422).json({
        error: 'coordinates_not_found',
        message: 'Could not extract exact coordinates from that link. Please copy coordinate numbers directly.',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Network error';
      return res.status(502).json({
        error: 'link_resolution_failed',
        message: `Failed to expand shared link: ${msg}`,
      });
    }
  }
);

// =========================================================================
// LIVE ATTENDANCE CHECK-INS (PHASE 0 #5 & #8: AUTH + ORG SCOPED + SUPABASE)
// =========================================================================

app.get(
  ['/live-checkins', '/api/live-checkins'],
  requireAuthRole('usher', 'admin', 'pastor', 'member', 'group_leader', 'super_admin', 'creator'),
  requireActiveLicense,
  async (req: Request, res: Response) => {
    try {
      const checkins = await platformStore.getLiveCheckins(req.organizationId!);
      if (req.user?.role === 'member') {
        const own = checkins.filter(
          (c) =>
            c.personId === req.user?.id ||
            c.personId === req.user?.email ||
            (req.user?.name && c.personName === req.user.name)
        );
        return res.status(200).json(own);
      }
      return res.status(200).json(checkins);
    } catch (err: any) {
      return res.status(err?.status || 500).json({
        error: err?.code || 'live_checkins_fetch_failed',
        message: err?.message || 'Failed to load live attendance check-ins from database.',
      });
    }
  }
);

app.post(
  ['/live-checkins', '/api/live-checkins'],
  requireAuthRole('usher', 'admin', 'pastor', 'member', 'super_admin', 'creator'),
  requireActiveLicense,
  async (req: Request, res: Response) => {
    const body = req.body || {};
    if (!body.personId || typeof body.personId !== 'string') {
      return res.status(400).json({ error: 'invalid_checkin', message: 'personId is required' });
    }

    if (req.user?.role === 'member') {
      const allowedSelfIds = [req.user.id, req.user.email, req.user.name].filter(Boolean);
      if (!allowedSelfIds.includes(body.personId)) {
        return res.status(403).json({
          error: 'forbidden',
          message: 'Members are only permitted to check in for their own profile.',
        });
      }
    }

    try {
      const nowIso = new Date().toISOString();
      const targetServiceInstanceId =
        typeof body.serviceInstanceId === 'string' ? body.serviceInstanceId.trim() : '';
      if (
        !targetServiceInstanceId ||
        targetServiceInstanceId === 'svc-live-main' ||
        targetServiceInstanceId === 'svc-sun-1'
      ) {
        return res.status(400).json({
          error: 'NO_SERVICE_SCHEDULED',
          code: 'NO_SERVICE_SCHEDULED',
          message: 'No service is scheduled. Please schedule a service before checking in members.',
        });
      }
      const result = await platformStore.recordLiveCheckin(req.organizationId!, {
        id: body.id || `rec-${body.personId}-${Date.now()}`,
        personId: body.personId,
        personName: body.personName,
        serviceInstanceId: targetServiceInstanceId,
        campusId: req.campus_id || PRIMARY_CAMPUS_SITE_ID,
        method: body.method || 'manual',
        confidence: typeof body.confidence === 'number' ? body.confidence : 95,
        checkedInAt:
          body.checkedInAt || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        checkedInIso: body.checkedInIso || nowIso,
        late: Boolean(body.late),
        recordedBy: body.recordedBy || req.user?.name || req.user?.role,
        note: body.note,
        distanceM: body.distanceM ?? null,
        lat: body.lat ?? null,
        lng: body.lng ?? null,
      });

      return res.status(200).json({
        success: true,
        record: result.record,
        liveCheckins: result.liveCheckins,
      });
    } catch (err: any) {
      return res.status(err?.status || 500).json({
        error: err?.code || 'live_checkin_failed',
        code: err?.code || 'live_checkin_failed',
        message: err?.message || 'Failed to save attendance check-in to database.',
      });
    }
  }
);

app.delete(
  ['/live-checkins/:personId', '/api/live-checkins/:personId'],
  requireAuthRole('usher', 'admin', 'pastor', 'super_admin', 'creator'),
  requireActiveLicense,
  async (req: Request, res: Response) => {
    const { personId } = req.params;
    const serviceId =
      typeof req.query.serviceId === 'string' && req.query.serviceId.trim()
        ? req.query.serviceId.trim()
        : null;
    try {
      const liveCheckins = await platformStore.deleteLiveCheckin(req.organizationId!, personId, serviceId);
      return res.status(200).json({ success: true, liveCheckins });
    } catch (err: any) {
      return res.status(err?.status || 500).json({
        error: err?.code || 'live_checkin_delete_failed',
        message: err?.message || 'Failed to remove attendance check-in from database.',
      });
    }
  }
);

// =========================================================================
// HAVERSINE ATTENDANCE EVENT VERIFICATION (AUTH + ORG SCOPED)
// =========================================================================

async function handleAttendanceEvent(req: Request, res: Response) {
  const parsed = EventSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_payload', details: parsed.error.flatten() });
  }

  const orgId = req.organizationId!;
  const e = parsed.data;
  const userId = e.personId || req.user!.id;
  const reasons: string[] = [];
  let status: 'accepted' | 'flagged' | 'rejected' = 'accepted';
  let distance: number | null = null;

  const downgrade = (reason: string) => {
    reasons.push(reason);
    if (status === 'accepted') status = 'flagged';
  };

  if (e.isMock) {
    status = 'rejected';
    reasons.push('mock_location');
  }

  const [sites, premiseData] = await Promise.all([
    platformStore.getSitesForOrg(orgId),
    platformStore.getPremiseSettings(orgId),
  ]);
  const site = sites.find((s) => s.id === e.siteId) || sites[0] || null;
  const siteRadius = site?.radius_m || premiseData.premiseSettings?.innerGeofenceMeters || 50;

  if (site && e.lat != null && e.lng != null) {
    distance = computeDistanceMeters(e.lat, e.lng, site.lat, site.lng);
    if (distance <= siteRadius) {
      if (status !== 'rejected') status = 'accepted';
    } else if (distance <= siteRadius + 25) {
      downgrade(`perimeter_margin_${distance}m`);
    } else {
      status = 'rejected';
      reasons.push(`outside_fence_${distance}m`);
    }
  }

  if (e.accuracyM != null && e.accuracyM > MAX_ACCURACY_M) {
    downgrade(`low_accuracy_${Math.round(e.accuracyM)}m`);
  }

  const now = new Date().toISOString();
  const row: StoredGeofenceEvent = {
    id: `evt-${Date.now()}`,
    organization_id: orgId,
    client_event_id: e.clientEventId,
    user_id: userId,
    person_id: e.personId,
    person_name: e.personName,
    service_instance_id: e.serviceInstanceId,
    site_id: site?.id || e.siteId,
    type: e.type,
    source: e.source,
    platform: e.platform,
    lat: e.lat,
    lng: e.lng,
    accuracy_m: e.accuracyM,
    distance_m: distance,
    is_mock: e.isMock,
    device_time: e.deviceTime,
    server_time: now,
    status,
    flag_reasons: reasons,
  };

  await platformStore.recordRawGeofenceEvent(orgId, row);

  const isApproved =
    status !== 'rejected' &&
    !reasons.some((r) => r.startsWith('outside_') || r.includes('mock')) &&
    (distance === null || distance <= siteRadius + 25);

  let checkinRecorded = false;
  let checkinBlockedReason: string | null = null;
  let checkinBlockedMessage: string | null = null;

  if (isApproved && e.personId) {
    const targetServiceInstanceId =
      typeof e.serviceInstanceId === 'string' ? e.serviceInstanceId.trim() : '';
    if (
      !targetServiceInstanceId ||
      targetServiceInstanceId === 'svc-live-main' ||
      targetServiceInstanceId === 'svc-sun-1'
    ) {
      checkinBlockedReason = 'NO_SERVICE_SCHEDULED';
      checkinBlockedMessage =
        'No service is scheduled. Please schedule a service before checking in members.';
    } else {
      try {
        await platformStore.recordLiveCheckin(orgId, {
          id: `rec-${e.personId}-${Date.now()}`,
          personId: e.personId,
          personName: e.personName,
          serviceInstanceId: targetServiceInstanceId,
          campusId: site?.id || PRIMARY_CAMPUS_SITE_ID,
          method: e.source === 'geofence' ? 'geofence' : 'manual',
          confidence:
            typeof e.accuracyM === 'number'
              ? Math.max(70, Math.min(99, Math.round(100 - e.accuracyM / 3)))
              : 95,
          checkedInAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          checkedInIso: now,
          late: false,
          recordedBy: 'GPS Geofence Radar',
          note: `Verified Live GPS (${distance ?? 0}m from center, ±${Math.round(e.accuracyM ?? 0)}m)`,
          distanceM: distance,
          lat: e.lat,
          lng: e.lng,
        });
        checkinRecorded = true;
      } catch (err: any) {
        if (err?.code === 'NO_SERVICE_SCHEDULED' || err?.code === 'SERVICE_NOT_OPEN') {
          checkinBlockedReason = err.code;
          checkinBlockedMessage = err.message;
        } else {
          throw err;
        }
      }
    }
  }

  return res.status(200).json({
    ...row,
    site_radius_m: siteRadius,
    site_name: site?.name || premiseData.premiseSettings?.campusName || null,
    checkin_recorded: checkinRecorded,
    checkin_blocked_reason: checkinBlockedReason,
    checkin_blocked_message: checkinBlockedMessage,
  });
}

app.post(
  ['/attendance/events', '/api/attendance/events'],
  attendanceLimiter,
  requireAuthRole('admin', 'pastor', 'usher', 'member', 'group_leader', 'super_admin', 'creator'),
  requireActiveLicense,
  handleAttendanceEvent
);

app.get(
  ['/attendance/raw-events', '/api/attendance/raw-events'],
  requireAuthRole('admin', 'pastor', 'usher', 'super_admin', 'creator'),
  requireActiveLicense,
  async (req: Request, res: Response) => {
    const events = await platformStore.getRawGeofenceEvents(req.organizationId!);
    return res.status(200).json(events);
  }
);

app.get(
  ['/attendance/shifts', '/api/attendance/shifts'],
  requireAuthRole('admin', 'pastor', 'usher', 'super_admin', 'creator'),
  requireActiveLicense,
  async (req: Request, res: Response) => {
    const events = await platformStore.getRawGeofenceEvents(req.organizationId!);
    const shifts: Array<{
      user_id: string;
      site_id: string;
      in_event_id: string;
      clock_in: string;
      out_event_id: string | null;
      clock_out: string | null;
      duration_minutes: number | null;
      needs_review: boolean;
      is_open: boolean;
    }> = [];

    const eventsByUser = new Map<string, StoredGeofenceEvent[]>();
    for (const ev of events) {
      const list = eventsByUser.get(ev.user_id) || [];
      list.push(ev);
      eventsByUser.set(ev.user_id, list);
    }

    for (const [userId, userEvents] of eventsByUser.entries()) {
      const chronological = [...userEvents].sort(
        (a, b) => new Date(a.server_time).getTime() - new Date(b.server_time).getTime()
      );
      let openIn: StoredGeofenceEvent | null = null;

      for (const ev of chronological) {
        if (ev.type === 'enter' || ev.type === 'manual_in') {
          if (openIn) {
            shifts.unshift({
              user_id: userId,
              site_id: openIn.site_id,
              in_event_id: openIn.id,
              clock_in: openIn.server_time,
              out_event_id: null,
              clock_out: null,
              duration_minutes: null,
              needs_review: openIn.status === 'flagged',
              is_open: true,
            });
          }
          openIn = ev;
        } else if ((ev.type === 'exit' || ev.type === 'manual_out') && openIn) {
          const inMs = new Date(openIn.server_time).getTime();
          const outMs = new Date(ev.server_time).getTime();
          const durMin = Math.max(0, Math.round((outMs - inMs) / 60000));
          shifts.unshift({
            user_id: userId,
            site_id: openIn.site_id,
            in_event_id: openIn.id,
            clock_in: openIn.server_time,
            out_event_id: ev.id,
            clock_out: ev.server_time,
            duration_minutes: durMin,
            needs_review: openIn.status === 'flagged' || ev.status === 'flagged',
            is_open: false,
          });
          openIn = null;
        }
      }

      if (openIn) {
        shifts.unshift({
          user_id: userId,
          site_id: openIn.site_id,
          in_event_id: openIn.id,
          clock_in: openIn.server_time,
          out_event_id: null,
          clock_out: null,
          duration_minutes: null,
          needs_review: openIn.status === 'flagged',
          is_open: true,
        });
      }
    }

    return res.status(200).json(shifts);
  }
);

app.post(
  ['/attendance/auto-close', '/api/attendance/auto-close'],
  requireAuthRole('admin', 'pastor', 'usher', 'super_admin', 'creator'),
  requireActiveLicense,
  async (req: Request, res: Response) => {
    const orgId = req.organizationId!;
    const maxHours = Number(req.body?.maxHours) || 12;
    const now = Date.now();
    let closedCount = 0;

    const [liveCheckins, rawEvents] = await Promise.all([
      platformStore.getLiveCheckins(orgId),
      platformStore.getRawGeofenceEvents(orgId),
    ]);

    for (const checkin of liveCheckins) {
      const matchingEvents = rawEvents.filter((e) => e.user_id === checkin.personId);
      const lastEvent = matchingEvents[0];
      if (lastEvent && (lastEvent.type === 'enter' || lastEvent.type === 'manual_in')) {
        const elapsedHours = (now - new Date(lastEvent.server_time).getTime()) / 3600000;
        if (elapsedHours >= maxHours || req.body?.force) {
          const exitEvt: StoredGeofenceEvent = {
            id: `evt-autoclose-${Date.now()}-${closedCount}`,
            organization_id: orgId,
            client_event_id: `auto-close-${checkin.personId}-${Date.now()}`,
            user_id: checkin.personId,
            person_id: checkin.personId,
            person_name: checkin.personName,
            site_id: checkin.campusId || PRIMARY_CAMPUS_SITE_ID,
            type: 'exit',
            source: 'system_auto_close',
            platform: 'web',
            lat: checkin.lat ?? null,
            lng: checkin.lng ?? null,
            accuracy_m: null,
            distance_m: checkin.distanceM ?? null,
            is_mock: false,
            device_time: new Date().toISOString(),
            server_time: new Date().toISOString(),
            status: 'accepted',
            flag_reasons: ['auto_closed_timeout'],
          };
          await platformStore.recordRawGeofenceEvent(orgId, exitEvt);
          closedCount++;
        }
      }
    }

    return res.status(200).json({ success: true, closedShifts: closedCount });
  }
);

app.get(
  ['/attendance/sites', '/api/attendance/sites'],
  requireAuthRole('admin', 'pastor', 'usher', 'member', 'group_leader', 'super_admin', 'creator'),
  requireActiveLicense,
  async (req: Request, res: Response) => {
    const sites = await platformStore.getSitesForOrg(req.organizationId!);
    return res.status(200).json(sites);
  }
);

app.get(
  ['/attendance/insights', '/api/attendance/insights'],
  requireAuthRole('admin', 'pastor', 'usher', 'group_leader', 'super_admin', 'creator'),
  requireActiveLicense,
  async (req: Request, res: Response) => {
    const orgId = req.organizationId!;
    const serviceId =
      typeof req.query.serviceId === 'string' && req.query.serviceId.trim()
        ? req.query.serviceId.trim()
        : null;

    const [scopedCheckins, rawEvents] = await Promise.all([
      platformStore.getLiveCheckins(orgId, serviceId),
      platformStore.getRawGeofenceEvents(orgId),
    ]);

    const methodBreakdown: Record<string, number> = {
      geofence: 0,
      beacon: 0,
      usher: 0,
      posted_qr: 0,
      manual: 0,
      email_link: 0,
    };

    let onTimeCount = 0;
    let lateCount = 0;
    let confidenceSum = 0;
    const gpsDistances: number[] = [];

    for (const rec of scopedCheckins) {
      methodBreakdown[rec.method] = (methodBreakdown[rec.method] || 0) + 1;
      if (rec.late) lateCount++;
      else onTimeCount++;
      confidenceSum += typeof rec.confidence === 'number' ? rec.confidence : 95;
      if (typeof rec.distanceM === 'number' && Number.isFinite(rec.distanceM)) {
        gpsDistances.push(rec.distanceM);
      }
    }

    const totalCheckedIn = scopedCheckins.length;
    const avgConfidence = totalCheckedIn > 0 ? Math.round(confidenceSum / totalCheckedIn) : 0;
    const avgDistanceM =
      gpsDistances.length > 0
        ? Math.round((gpsDistances.reduce((a, b) => a + b, 0) / gpsDistances.length) * 10) / 10
        : null;

    return res.status(200).json({
      serviceId,
      totalCheckedIn,
      onTimeCount,
      lateCount,
      avgConfidence,
      avgDistanceM,
      methodBreakdown,
      telemetrySummary: computeTelemetrySummaryFromEvents(rawEvents, true),
      liveCheckins: scopedCheckins,
      timestamp: new Date().toISOString(),
    });
  }
);

function formatLocalDateIsoServer(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function buildShortWeekLabel(start: Date, end: Date): string {
  const sDay = start.getDate();
  const eDay = end.getDate();
  const sMonth = start.toLocaleDateString('en-GB', { month: 'short' });
  const eMonth = end.toLocaleDateString('en-GB', { month: 'short' });
  if (sDay === eDay && sMonth === eMonth) return `${sDay} ${sMonth}`;
  if (sMonth === eMonth) return `${sDay}–${eDay} ${sMonth}`;
  return `${sDay} ${sMonth}–${eDay} ${eMonth}`;
}

function buildFullWeekRangeLabel(start: Date, end: Date): string {
  const sFmt = start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const eFmt = end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  if (formatLocalDateIsoServer(start) === formatLocalDateIsoServer(end)) {
    return end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  return `${sFmt} – ${eFmt}`;
}

app.get(
  ['/attendance/weekly-trend', '/api/attendance/weekly-trend'],
  requireAuthRole('admin', 'pastor', 'usher', 'group_leader', 'super_admin', 'creator'),
  requireActiveLicense,
  async (req: Request, res: Response) => {
    const orgId = req.organizationId!;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const windowStart = new Date(today);
    windowStart.setDate(today.getDate() - 29);

    const startDateIso = formatLocalDateIsoServer(windowStart);
    const endDateIso = formatLocalDateIsoServer(today);

    const [eventsList, checkinsList, activeMemberBaseline] = await Promise.all([
      platformStore.getEvents(orgId),
      platformStore.getLiveCheckins(orgId),
      platformStore.getMemberCountForOrg(orgId),
    ]);

    const eventDateMap = new Map<string, string>();
    for (const ev of eventsList) {
      if (ev && typeof ev.id === 'string') {
        const normalized = normalizeEventRow(ev);
        if (normalized.date) {
          eventDateMap.set(ev.id, normalized.date);
        }
      }
    }

    const mergedByKey = new Map<string, LiveCheckinItem>();
    for (const rec of checkinsList) {
      const key = `${rec.serviceInstanceId || 'svc'}::${rec.personId}`;
      mergedByKey.set(key, rec);
    }

    const buckets: Array<{
      weekKey: string;
      startDate: string;
      endDate: string;
      shortLabel: string;
      fullRangeLabel: string;
      isCurrentWeek: boolean;
      records: LiveCheckinItem[];
      serviceIds: Set<string>;
    }> = [];

    const cursor = new Date(windowStart);
    while (cursor.getTime() <= today.getTime()) {
      const bStart = new Date(cursor);
      const dow = bStart.getDay();
      const daysUntilSunday = dow === 0 ? 0 : 7 - dow;
      const candidateEnd = new Date(bStart);
      candidateEnd.setDate(bStart.getDate() + daysUntilSunday);
      const bEnd = candidateEnd.getTime() > today.getTime() ? new Date(today) : candidateEnd;

      const sIso = formatLocalDateIsoServer(bStart);
      const eIso = formatLocalDateIsoServer(bEnd);
      const serviceIds = new Set<string>();
      for (const [evId, evDate] of eventDateMap.entries()) {
        if (evDate >= sIso && evDate <= eIso) {
          serviceIds.add(evId);
        }
      }

      buckets.push({
        weekKey: `${sIso}_${eIso}`,
        startDate: sIso,
        endDate: eIso,
        shortLabel: buildShortWeekLabel(bStart, bEnd),
        fullRangeLabel: buildFullWeekRangeLabel(bStart, bEnd),
        isCurrentWeek: eIso === endDateIso,
        records: [],
        serviceIds,
      });

      cursor.setTime(bEnd.getTime());
      cursor.setDate(cursor.getDate() + 1);
    }

    const windowHistoricalRecords: LiveCheckinItem[] = [];
    const uniquePeople30d = new Set<string>();

    for (const rec of mergedByKey.values()) {
      let resolvedDateIso = eventDateMap.get(rec.serviceInstanceId) || '';
      if (!resolvedDateIso && rec.checkedInIso) {
        const parsed = new Date(rec.checkedInIso);
        if (!Number.isNaN(parsed.getTime())) {
          resolvedDateIso = formatLocalDateIsoServer(parsed);
        }
      }
      if (!resolvedDateIso) {
        resolvedDateIso = endDateIso;
      }

      if (resolvedDateIso < startDateIso || resolvedDateIso > endDateIso) {
        continue;
      }

      windowHistoricalRecords.push(rec);
      uniquePeople30d.add(rec.personId);

      const targetBucket = buckets.find(
        (b) => resolvedDateIso >= b.startDate && resolvedDateIso <= b.endDate
      );
      if (targetBucket) {
        targetBucket.records.push(rec);
        if (rec.serviceInstanceId) {
          targetBucket.serviceIds.add(rec.serviceInstanceId);
        }
      }
    }

    let peakWeekLabel: string | null = null;
    let peakWeekCount = 0;

    const weeks = buckets.map((b) => {
      const totalCheckins = b.records.length;
      const uniqueSet = new Set(b.records.map((r) => r.personId));
      const uniqueAttendees = uniqueSet.size;
      const lateCount = b.records.filter((r) => r.late).length;
      const onTimeCount = Math.max(0, totalCheckins - lateCount);
      const autoProximityCount = b.records.filter(
        (r) => r.method === 'geofence' || r.method === 'beacon'
      ).length;
      const assistedDoorCount = Math.max(0, totalCheckins - autoProximityCount);
      const engagementRatePct =
        activeMemberBaseline > 0
          ? Math.min(100, Math.round((uniqueAttendees / activeMemberBaseline) * 100))
          : 0;

      if (totalCheckins > peakWeekCount) {
        peakWeekCount = totalCheckins;
        peakWeekLabel = b.shortLabel;
      }

      return {
        weekKey: b.weekKey,
        startDate: b.startDate,
        endDate: b.endDate,
        shortLabel: b.shortLabel,
        fullRangeLabel: b.fullRangeLabel,
        isCurrentWeek: b.isCurrentWeek,
        totalCheckins,
        uniqueAttendees,
        onTimeCount,
        lateCount,
        autoProximityCount,
        assistedDoorCount,
        servicesCount: b.serviceIds.size,
        engagementRatePct,
      };
    });

    const totalCheckins30d = windowHistoricalRecords.length;
    const averageWeeklyAttendance =
      weeks.length > 0 ? Math.round((totalCheckins30d / weeks.length) * 10) / 10 : 0;

    return res.status(200).json({
      windowDays: 30,
      startDate: startDateIso,
      endDate: endDateIso,
      totalCheckins30d,
      uniqueAttendees30d: uniquePeople30d.size,
      averageWeeklyAttendance,
      peakWeekLabel,
      peakWeekCount,
      weeks,
      historicalRecords: windowHistoricalRecords,
      timestamp: new Date().toISOString(),
    });
  }
);

// =========================================================================
// CHURCH WORSHIP SERVICES & EVENTS
// =========================================================================

function parseExpectedAttendanceFromDescription(desc: unknown): number {
  if (typeof desc !== 'string') return 0;
  const match = desc.match(/Expected attendance:\s*(\d+)/i);
  return match ? Number(match[1]) || 0 : 0;
}

function normalizeEventRow(row: Record<string, any>): Record<string, any> {
  const startRaw = row.start_time || row.starts_at || null;
  const endRaw = row.end_time || row.ends_at || null;
  let dateStr = typeof row.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.date) ? row.date : '';
  if (!dateStr && typeof startRaw === 'string' && startRaw.includes('T')) {
    dateStr = startRaw.split('T')[0];
  }
  if (!dateStr) {
    dateStr = new Date().toISOString().split('T')[0];
  }

  const expected =
    typeof row.expected_attendance === 'number'
      ? row.expected_attendance
      : parseExpectedAttendanceFromDescription(row.description);

  const allowanceMinutes = Math.max(
    0,
    Number(row.dwell_min ?? row.dwellMinutes ?? row.allowance_minutes ?? 0) || 0
  );

  return {
    ...row,
    date: dateStr,
    start_time: startRaw,
    end_time: endRaw,
    starts_at: startRaw,
    ends_at: endRaw,
    dwell_min: allowanceMinutes,
    allowance_minutes: allowanceMinutes,
    expected_attendance: expected,
  };
}

function buildIsoTimestamp(dateStr: string, timeOrIso: string): Date {
  if (timeOrIso.includes('T')) {
    const parsed = new Date(timeOrIso);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const timeMatch = timeOrIso.match(/^(\d{1,2}):(\d{2})/);
  const hh = timeMatch ? String(Math.min(23, Math.max(0, Number(timeMatch[1])))).padStart(2, '0') : '08';
  const mm = timeMatch ? String(Math.min(59, Math.max(0, Number(timeMatch[2])))).padStart(2, '0') : '00';
  const candidate = new Date(`${dateStr}T${hh}:${mm}:00.000Z`);
  return Number.isNaN(candidate.getTime()) ? new Date() : candidate;
}

app.get(
  ['/api/v1/events', '/api/events'],
  requireAuthRole('admin', 'pastor', 'usher', 'member', 'group_leader', 'finance', 'super_admin', 'creator'),
  requireActiveLicense,
  async (req: Request, res: Response) => {
    const stored = await platformStore.getEvents(req.organizationId!);
    return res.json(stored.map(normalizeEventRow));
  }
);

app.post(
  ['/api/v1/events', '/api/events'],
  requireAuthRole('admin', 'pastor', 'super_admin', 'creator'),
  requireActiveLicense,
  async (req: Request, res: Response) => {
    const name =
      typeof req.body?.name === 'string' && req.body.name.trim()
        ? req.body.name.trim()
        : 'Worship Service';
    const todayIso = new Date().toISOString().split('T')[0];
    const rawDate =
      typeof req.body?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.body.date.trim())
        ? req.body.date.trim()
        : todayIso;
    const rawStartsAt =
      typeof req.body?.startsAt === 'string' && req.body.startsAt.trim() ? req.body.startsAt.trim() : '08:00';
    const rawEndsAt =
      typeof req.body?.endsAt === 'string' && req.body.endsAt.trim() ? req.body.endsAt.trim() : '10:30';
    const rawAllowance = req.body?.allowanceMinutes ?? req.body?.dwellMinutes ?? req.body?.dwellMin;
    const dwellMin = Number.isFinite(Number(rawAllowance))
      ? Math.max(0, Math.round(Number(rawAllowance)))
      : 5;
    const expectedAttendance = Number.isFinite(Number(req.body?.expectedAttendance))
      ? Math.max(0, Number(req.body.expectedAttendance))
      : 0;

    let startDateObj: Date;
    if (typeof req.body?.startTimeIso === 'string' && !Number.isNaN(new Date(req.body.startTimeIso).getTime())) {
      startDateObj = new Date(req.body.startTimeIso);
    } else {
      startDateObj = buildIsoTimestamp(rawDate, rawStartsAt);
    }

    let endDateObj: Date;
    if (typeof req.body?.endTimeIso === 'string' && !Number.isNaN(new Date(req.body.endTimeIso).getTime())) {
      endDateObj = new Date(req.body.endTimeIso);
    } else if (req.body?.endsAt) {
      endDateObj = buildIsoTimestamp(rawDate, rawEndsAt);
    } else {
      endDateObj = new Date(startDateObj.getTime() + 90 * 60 * 1000);
    }

    if (endDateObj.getTime() <= startDateObj.getTime()) {
      endDateObj = new Date(endDateObj.getTime() + 24 * 60 * 60 * 1000);
    }

    const reqStatus = typeof req.body?.status === 'string' ? req.body.status.trim().toLowerCase() : '';
    const dbStatus = reqStatus === 'closed' || reqStatus === 'cancelled' || reqStatus === 'completed'
      ? 'closed'
      : 'active';

    try {
      const created = await platformStore.createEvent(req.organizationId!, {
        name,
        date: rawDate,
        startTimeIso: startDateObj.toISOString(),
        endTimeIso: endDateObj.toISOString(),
        dwellMin,
        status: dbStatus,
        expectedAttendance,
      });
      return res.status(201).json(normalizeEventRow(created));
    } catch (err: any) {
      return res.status(500).json({
        error: 'database_error',
        message: err?.message || 'Failed to save scheduled service.',
      });
    }
  }
);

const handleUpdateEvent = async (req: Request, res: Response) => {
  const body = req.body || {};
  const updates: {
    name?: string;
    date?: string;
    startTimeIso?: string;
    endTimeIso?: string;
    dwellMin?: number;
    status?: string;
    expectedAttendance?: number;
  } = {};

  if (typeof body.name === 'string' && body.name.trim()) {
    updates.name = body.name.trim();
  }
  const cleanDate =
    typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date.trim())
      ? body.date.trim()
      : undefined;
  if (cleanDate) updates.date = cleanDate;

  const fallbackDate = cleanDate || new Date().toISOString().split('T')[0];

  if (typeof body.startTimeIso === 'string' && !Number.isNaN(new Date(body.startTimeIso).getTime())) {
    updates.startTimeIso = new Date(body.startTimeIso).toISOString();
  } else if (typeof body.startsAt === 'string' && body.startsAt.trim()) {
    updates.startTimeIso = buildIsoTimestamp(fallbackDate, body.startsAt.trim()).toISOString();
  }

  if (typeof body.endTimeIso === 'string' && !Number.isNaN(new Date(body.endTimeIso).getTime())) {
    updates.endTimeIso = new Date(body.endTimeIso).toISOString();
  } else if (typeof body.endsAt === 'string' && body.endsAt.trim()) {
    const endObj = buildIsoTimestamp(fallbackDate, body.endsAt.trim());
    if (updates.startTimeIso && endObj.getTime() <= Date.parse(updates.startTimeIso)) {
      endObj.setTime(endObj.getTime() + 24 * 60 * 60 * 1000);
    }
    updates.endTimeIso = endObj.toISOString();
  }

  const rawAllowance = body.allowanceMinutes ?? body.dwellMinutes ?? body.dwellMin;
  if (rawAllowance !== undefined && Number.isFinite(Number(rawAllowance))) {
    updates.dwellMin = Math.max(0, Math.round(Number(rawAllowance)));
  }

  if (body.expectedAttendance !== undefined && Number.isFinite(Number(body.expectedAttendance))) {
    updates.expectedAttendance = Math.max(0, Math.round(Number(body.expectedAttendance)));
  }

  if (typeof body.status === 'string' && body.status.trim()) {
    const st = body.status.trim().toLowerCase();
    updates.status =
      st === 'closed' || st === 'completed' || st === 'cancelled' ? 'closed' : 'active';
  }

  try {
    const updated = await platformStore.updateEvent(req.organizationId!, req.params.id, updates);
    return res.status(200).json(normalizeEventRow(updated));
  } catch (err: any) {
    return res.status(err?.status || 500).json({
      error: err?.code || 'event_update_failed',
      message: err?.message || 'Failed to update scheduled service.',
    });
  }
};

app.patch(
  ['/api/v1/events/:id', '/api/events/:id'],
  requireAuthRole('admin', 'pastor', 'super_admin', 'creator'),
  requireActiveLicense,
  handleUpdateEvent
);

app.put(
  ['/api/v1/events/:id', '/api/events/:id'],
  requireAuthRole('admin', 'pastor', 'super_admin', 'creator'),
  requireActiveLicense,
  handleUpdateEvent
);

app.delete(
  ['/api/v1/events/:id', '/api/events/:id'],
  requireAuthRole('admin', 'pastor', 'super_admin', 'creator'),
  requireActiveLicense,
  async (req: Request, res: Response) => {
    try {
      await platformStore.deleteEvent(req.organizationId!, req.params.id);
      return res.status(200).json({ success: true });
    } catch (err: any) {
      return res.status(err?.status || 500).json({
        error: err?.code || 'event_delete_failed',
        message: err?.message || 'Failed to delete scheduled service.',
      });
    }
  }
);

app.get(
  [
    '/api/v1/services/history',
    '/api/services/history',
    '/api/attendance/service-history',
    '/attendance/service-history',
  ],
  requireAuthRole('admin', 'pastor', 'usher', 'group_leader', 'finance', 'super_admin', 'creator'),
  requireActiveLicense,
  async (req: Request, res: Response) => {
    try {
      const history = await platformStore.getServiceHistory(req.organizationId!);
      return res.status(200).json({
        ...history,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      return res.status(err?.status || 500).json({
        error: 'service_history_failed',
        message: err?.message || 'Could not load service history.',
      });
    }
  }
);

// =========================================================================
// CONGREGATION MEMBERS DIRECTORY (ORG SCOPED + SEAT LIMIT ENFORCED)
// =========================================================================

app.get(
  ['/api/v1/members', '/api/members'],
  requireAuthRole('admin', 'pastor', 'usher', 'group_leader', 'super_admin', 'creator'),
  requireActiveLicense,
  async (req: Request, res: Response) => {
    const members = await platformStore.getMembers(req.organizationId!);
    return res.status(200).json(members);
  }
);

app.post(
  ['/api/v1/members', '/api/members'],
  requireAuthRole('admin', 'pastor', 'usher', 'super_admin', 'creator'),
  requireActiveLicense,
  async (req: Request, res: Response) => {
    const body = req.body || {};
    const firstName = String(body.firstName ?? body.first_name ?? '').trim();
    const lastName = String(body.lastName ?? body.last_name ?? '').trim();

    if (!firstName || !lastName) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'firstName and lastName are required',
      });
    }

    try {
      const created = await platformStore.createMember(req.organizationId!, body);
      return res.status(201).json(created);
    } catch (err: any) {
      if (err?.code === 'SEAT_LIMIT_REACHED') {
        return res.status(403).json({
          error: 'license_limit_exceeded',
          code: 'SEAT_LIMIT_REACHED',
          message: err.message,
          details: err.details,
        });
      }
      return res.status(err?.status || 500).json({
        error: err?.code || 'member_create_failed',
        message: err?.message || 'Could not register member.',
      });
    }
  }
);

const normalizeImportDuplicateMode = (raw: unknown): ImportDuplicateMode | null => {
  if (raw === undefined || raw === null || raw === '') return 'skip';
  const mode = String(raw).trim().toLowerCase();
  if (mode === 'skip' || mode === 'update' || mode === 'error') {
    return mode;
  }
  return null;
};

app.post(
  '/api/members/import/validate',
  requireAuthRole('admin', 'pastor', 'super_admin', 'creator'),
  requireActiveLicense,
  async (req: Request, res: Response) => {
    const incoming = Array.isArray(req.body?.members) ? req.body.members : [];
    if (incoming.length === 0) {
      return res.status(400).json({ error: 'validation_error', message: 'members array is required' });
    }
    const duplicateMode = normalizeImportDuplicateMode(req.body?.duplicateMode);
    if (!duplicateMode) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'duplicateMode must be one of: skip, update, error',
      });
    }

    try {
      const report = await platformStore.validateMemberImport(
        req.organizationId!,
        incoming,
        duplicateMode
      );
      return res.status(200).json({
        success: true,
        duplicateMode,
        ...report,
      });
    } catch (err: any) {
      return res.status(err?.status || 500).json({
        error: err?.code || 'import_validation_error',
        message: err?.message || 'Could not validate import batch.',
      });
    }
  }
);

app.post(
  '/api/members/import',
  requireAuthRole('admin', 'pastor', 'super_admin', 'creator'),
  requireActiveLicense,
  async (req: Request, res: Response) => {
    const incoming = Array.isArray(req.body?.members) ? req.body.members : [];
    if (incoming.length === 0) {
      return res.status(400).json({ error: 'validation_error', message: 'members array is required' });
    }
    const duplicateMode = normalizeImportDuplicateMode(req.body?.duplicateMode);
    if (!duplicateMode) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'duplicateMode must be one of: skip, update, error',
      });
    }
    const dryRun = Boolean(req.body?.dryRun);

    try {
      const result = await platformStore.batchImportMembers(req.organizationId!, incoming, {
        duplicateMode,
        dryRun,
      });
      return res.status(200).json({
        success: true,
        duplicateMode,
        ...result,
      });
    } catch (err: any) {
      if (err?.code === 'SEAT_LIMIT_REACHED') {
        return res.status(403).json({
          error: 'license_limit_exceeded',
          code: 'SEAT_LIMIT_REACHED',
          message: err.message,
          details: err.details,
        });
      }
      if (err?.code === 'IMPORT_VALIDATION_FAILED') {
        return res.status(422).json({
          error: 'import_validation_failed',
          code: 'IMPORT_VALIDATION_FAILED',
          message: err.message,
          details: err.details,
        });
      }
      return res.status(err?.status || 500).json({
        error: err?.code || 'import_failed',
        message: err?.message || 'Could not import members.',
        details: err?.details,
      });
    }
  }
);

const updateOwnProfileSchema = z.object({
  imageUrl: z
    .string()
    .trim()
    .max(600000, 'Uploaded image is too large (max ~450KB)')
    .refine(
      (v) =>
        v === '' ||
        v.startsWith('data:image/') ||
        v.startsWith('https://') ||
        v.startsWith('http://'),
      'Photo must be a valid uploaded image or http(s) URL'
    )
    .nullable()
    .optional(),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be YYYY-MM-DD')
    .optional(),
  preferredName: z.string().trim().min(1).max(120).optional(),
  autoCheckinOptedIn: z.boolean().optional(),
  groupName: z.string().trim().min(1).max(120).optional(),
  homeCellGroup: z.string().trim().min(1).max(120).optional(),
  department: z.string().trim().min(1).max(120).optional(),
});

app.get(
  '/api/members/me/profile',
  requireUser,
  enforceOrganizationScope,
  async (req: Request, res: Response) => {
    const profile = await platformStore.getMemberProfileForSession(
      req.organizationId!,
      req.user!.id,
      req.user!.email
    );
    return res.status(200).json({ profile });
  }
);

app.patch(
  '/api/members/me/profile',
  requireUser,
  enforceOrganizationScope,
  requireActiveLicense,
  async (req: Request, res: Response) => {
    const parsed = updateOwnProfileSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: 'validation_error',
        message: parsed.error.issues[0]?.message || 'Invalid profile update payload.',
      });
    }

    try {
      const updated = await platformStore.updateOwnMemberProfile(
        req.organizationId!,
        req.user!.id,
        req.user!.email,
        parsed.data,
        req.user!.name
      );
      return res.status(200).json(updated);
    } catch (err: any) {
      return res.status(err?.status || 400).json({
        error: err?.code || 'profile_update_failed',
        message: err?.message || 'Could not update your member profile.',
      });
    }
  }
);

app.put(
  '/api/members/:id',
  requireAuthRole('admin', 'pastor', 'super_admin', 'creator'),
  requireActiveLicense,
  async (req: Request, res: Response) => {
    try {
      const updated = await platformStore.updateMember(req.organizationId!, req.params.id, req.body || {});
      return res.status(200).json(updated);
    } catch (err: any) {
      return res.status(err?.status || 404).json({
        error: 'member_update_failed',
        message: err?.message || 'Member not found.',
      });
    }
  }
);

app.delete(
  '/api/members/:id',
  requireAuthRole('admin', 'pastor', 'super_admin', 'creator'),
  requireActiveLicense,
  async (req: Request, res: Response) => {
    try {
      await platformStore.deleteMember(req.organizationId!, req.params.id);
      return res.status(200).json({ success: true });
    } catch (err: any) {
      return res.status(err?.status || 500).json({
        error: err?.code || 'member_delete_failed',
        message: err?.message || 'Failed to delete member.',
      });
    }
  }
);

// =========================================================================
// CONGREGATION CHURCH WALL & BIRTHDAY CELEBRATION POSTS (ORG SCOPED)
// =========================================================================

const createWallPostSchema = z.object({
  message: z.string().trim().min(1, 'Please enter a birthday greeting or celebration note').max(600),
  category: z.enum(['birthday', 'testimony', 'celebration']).optional().default('birthday'),
  targetMemberId: z.string().trim().max(120).optional(),
  targetMemberName: z.string().trim().max(120).optional(),
});

app.get(
  '/api/church-wall',
  requireAuthRole('admin', 'pastor', 'usher', 'member', 'group_leader', 'finance', 'super_admin', 'creator'),
  async (req: Request, res: Response) => {
    try {
      const posts = await churchWallStore.listPosts(req.organizationId!);
      return res.status(200).json({ posts });
    } catch (err: any) {
      return res.status(err?.status || 500).json({
        error: err?.code || 'church_wall_fetch_failed',
        message: err?.message || 'Failed to load church wall posts.',
      });
    }
  }
);

app.post(
  '/api/church-wall',
  requireAuthRole('admin', 'pastor', 'usher', 'member', 'group_leader', 'finance', 'super_admin', 'creator'),
  async (req: Request, res: Response) => {
    const parsed = createWallPostSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: 'validation_error',
        message: parsed.error.issues[0]?.message || 'Invalid church wall post.',
      });
    }

    try {
      const post = await churchWallStore.createPost(req.organizationId!, {
        authorId: req.user!.id,
        authorName: req.user!.name || req.user!.email || 'Church Member',
        category: parsed.data.category,
        message: parsed.data.message,
        targetMemberId: parsed.data.targetMemberId,
        targetMemberName: parsed.data.targetMemberName,
      });

      return res.status(201).json({ post });
    } catch (err: any) {
      return res.status(err?.status || 500).json({
        error: err?.code || 'church_wall_create_failed',
        message: err?.message || 'Failed to create church wall post.',
      });
    }
  }
);

app.post(
  '/api/church-wall/:id/amen',
  requireAuthRole('admin', 'pastor', 'usher', 'member', 'group_leader', 'finance', 'super_admin', 'creator'),
  async (req: Request, res: Response) => {
    try {
      const post = await churchWallStore.toggleAmen(req.organizationId!, req.params.id, req.user!.id);
      if (!post) {
        return res.status(404).json({ error: 'not_found', message: 'Church wall post not found.' });
      }
      return res.status(200).json({ post });
    } catch (err: any) {
      return res.status(err?.status || 500).json({
        error: err?.code || 'church_wall_amen_failed',
        message: err?.message || 'Failed to update church wall reaction.',
      });
    }
  }
);

// =========================================================================
// PUSH NOTIFICATIONS & SUBSCRIBED DEVICES (AUTH + ORG SCOPED)
// =========================================================================

app.post(
  ['/api/notifications/subscribe'],
  requireAuthRole('admin', 'pastor', 'usher', 'member', 'group_leader', 'finance', 'super_admin', 'creator'),
  requireActiveLicense,
  async (req: Request, res: Response) => {
    const body = req.body || {};
    const endpoint = typeof body.endpoint === 'string' ? body.endpoint.trim() : '';
    const id = typeof body.id === 'string' ? body.id.trim() : `sub-${Date.now()}`;

    if (!endpoint && !id) {
      return res.status(400).json({ error: 'invalid_subscription', message: 'endpoint or id required' });
    }

    try {
      const saved = await platformStore.upsertPushSubscription(req.organizationId!, {
        id,
        endpoint: endpoint || id,
        keys: body.keys,
        personId: body.personId || req.user?.id,
        personName: body.personName || req.user?.name,
        userAgent: body.userAgent,
        subscribedAt: new Date().toISOString(),
      });

      return res.status(200).json({
        success: true,
        subscription: saved.subscription,
        totalSubscribers: saved.totalSubscribers,
      });
    } catch (err: any) {
      return res.status(err?.status || 500).json({
        error: err?.code || 'notification_subscribe_failed',
        message: err?.message || 'Failed to subscribe for notifications.',
      });
    }
  }
);

app.get(
  ['/api/notifications/subscriptions'],
  requireAuthRole('admin', 'pastor', 'super_admin', 'creator'),
  requireActiveLicense,
  async (req: Request, res: Response) => {
    try {
      const subscriptions = await platformStore.getPushSubscriptions(req.organizationId!);
      return res.status(200).json({
        subscribersCount: subscriptions.length,
        subscriptions,
      });
    } catch (err: any) {
      return res.status(err?.status || 500).json({
        error: err?.code || 'notification_list_failed',
        message: err?.message || 'Failed to load notification subscriptions.',
      });
    }
  }
);

app.post(
  ['/api/notifications/send'],
  requireAuthRole('admin', 'pastor', 'super_admin', 'creator'),
  requireActiveLicense,
  async (req: Request, res: Response) => {
    const { title, body, personId, topic } = req.body || {};
    if (!title || !body) {
      return res.status(400).json({ error: 'invalid_notification', message: 'title and body are required' });
    }

    try {
      const subscriptions = await platformStore.getPushSubscriptions(req.organizationId!);
      const targets = personId ? subscriptions.filter((s) => s.personId === personId) : subscriptions;
      const count = targets.length > 0 ? targets.length : 1;

      return res.status(200).json({
        success: true,
        title,
        body,
        dispatchedTo: count,
        topic: topic || 'general',
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      return res.status(err?.status || 500).json({
        error: err?.code || 'notification_send_failed',
        message: err?.message || 'Failed to send push notification.',
      });
    }
  }
);

app.post(
  ['/api/notifications/test-push'],
  requireAuthRole('admin', 'pastor', 'usher', 'member', 'super_admin', 'creator'),
  requireActiveLicense,
  async (req: Request, res: Response) => {
    const orgId = req.organizationId!;
    try {
      const [premiseData, eventsList, subscriptions] = await Promise.all([
        platformStore.getPremiseSettings(orgId),
        platformStore.getEvents(orgId),
        platformStore.getPushSubscriptions(orgId),
      ]);

      const memberName = req.body?.personName || req.user?.name || 'Church Member';
      const campus = premiseData.premiseSettings?.campusName || 'Sanctuary Campus';
      const service = eventsList[0]?.name || 'Sunday Service';

      const testPayload = {
        title: `Welcome, ${memberName}!`,
        body: `You are checked in for ${service} at ${campus}. Sanctuary presence confirmed.`,
        icon: '/icon.svg',
        tag: 'test-arrival',
        timestamp: new Date().toISOString(),
      };

      return res.status(200).json({
        success: true,
        message: 'Test push payload generated and validated',
        payload: testPayload,
        activeSubscribers: subscriptions.length,
      });
    } catch (err: any) {
      return res.status(err?.status || 500).json({
        error: err?.code || 'notification_test_failed',
        message: err?.message || 'Failed to generate test push notification.',
      });
    }
  }
);

// =========================================================================
// AUTH & FAIL-CLOSED LICENSE STATUS ENDPOINTS (PHASE 0 #6)
// =========================================================================

app.get('/api/auth/me', requireUser, enforceOrganizationScope, async (req: Request, res: Response) => {
  try {
    const [credStatus, memberProfile] = await Promise.all([
      platformStore.getCredentialStatus(req.user!.id, req.user!.email),
      req.organizationId
        ? platformStore.getMemberProfileForSession(req.organizationId, req.user!.id, req.user!.email)
        : Promise.resolve(null),
    ]);
    return res.status(200).json({
      user: {
        ...req.user,
        avatar: memberProfile?.imageUrl || undefined,
        mustChangePassword: credStatus.mustChangePassword,
      },
      memberProfile,
      organizationId: req.organizationId,
      isCreator: isCreatorClaim(req.user),
      mustChangePassword: credStatus.mustChangePassword,
      hasPasswordCredential: credStatus.hasPasswordCredential,
      authenticated: true,
    });
  } catch (err: any) {
    return res.status(err?.status || 500).json({
      error: err?.code || 'auth_me_failed',
      message: err?.message || 'Failed to resolve authenticated session.',
    });
  }
});

app.get('/api/license/status', requireUser, enforceOrganizationScope, async (req: Request, res: Response) => {
  try {
    const evaluation = await platformStore.evaluateOrganizationLicense(req.organizationId!);
    return res.status(evaluation.httpStatus).json({
      ...evaluation,
      tenantId: evaluation.organizationId,
    });
  } catch (err: any) {
    return res.status(err?.status || 500).json({
      error: err?.code || 'license_status_failed',
      message: err?.message || 'Failed to evaluate organisation license status.',
    });
  }
});

app.post(
  '/api/admin/system-check',
  requireUser,
  requireRoles('super_admin', 'creator'),
  (req: Request, res: Response) => {
    return res.status(200).json({
      success: true,
      message: 'Authorized super admin action executed successfully',
      callerRole: req.user?.role,
    });
  }
);

// =========================================================================
// DONATIONS / MOBILE GIVING LEDGER (ORG-SCOPED)
// =========================================================================

const createDonationSchema = z.object({
  amountGhs: z.number().positive().max(1000000).optional(),
  amountMinor: z.number().int().positive().max(100000000).optional(),
  fundName: z.string().trim().min(1).max(100),
  fundId: z.string().trim().max(100).optional(),
  provider: z.enum(['MTN MoMo', 'Telecel Cash', 'Card', 'Cash']).optional().default('MTN MoMo'),
  method: z.enum(['momo', 'card', 'cash', 'bank']).optional(),
});

app.get(
  '/api/donations',
  requireUser,
  enforceOrganizationScope,
  requireActiveLicense,
  async (req: Request, res: Response) => {
    try {
      const callerRole = req.user!.role;
      const canViewOrgLedger = ['admin', 'pastor', 'finance', 'super_admin', 'creator'].includes(
        callerRole
      );
      let filterPersonId: string | undefined;
      if (!canViewOrgLedger) {
        const profile = await platformStore.getMemberProfileForSession(
          req.organizationId!,
          req.user!.id,
          req.user!.email
        );
        filterPersonId = profile?.id ? String(profile.id) : req.user!.id;
      }
      const donations = await platformStore.listDonations(
        req.organizationId!,
        filterPersonId ? { personId: filterPersonId } : undefined
      );
      return res.status(200).json({ donations });
    } catch (err: any) {
      return res.status(err?.status || 500).json({
        error: err?.code || 'donations_fetch_failed',
        message: err?.message || 'Failed to load donations.',
      });
    }
  }
);

app.post(
  '/api/donations',
  requireUser,
  enforceOrganizationScope,
  requireActiveLicense,
  async (req: Request, res: Response) => {
    const parsed = createDonationSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: 'validation_error',
        message: parsed.error.issues[0]?.message || 'Invalid donation payload.',
      });
    }

    const computedAmountMinor =
      parsed.data.amountMinor ??
      (parsed.data.amountGhs ? Math.round(parsed.data.amountGhs * 100) : 0);
    if (!computedAmountMinor || computedAmountMinor <= 0) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'Donation amount must be greater than zero.',
      });
    }

    const derivedMethod =
      parsed.data.method ||
      (parsed.data.provider === 'Card'
        ? 'card'
        : parsed.data.provider === 'Cash'
        ? 'cash'
        : 'momo');

    try {
      const profile = await platformStore.getMemberProfileForSession(
        req.organizationId!,
        req.user!.id,
        req.user!.email
      );
      const personId = profile?.id ? String(profile.id) : req.user!.id;
      const personName = profile
        ? `${profile.firstName || ''} ${profile.lastName || ''}`.trim()
        : req.user!.name || req.user!.email || 'Member';

      const donation = await platformStore.createDonation(req.organizationId!, {
        personId,
        personName,
        fundName: parsed.data.fundName,
        fundId: parsed.data.fundId,
        amountMinor: computedAmountMinor,
        method: derivedMethod,
        provider: parsed.data.provider,
        status: 'paid',
      });
      return res.status(201).json({ donation });
    } catch (err: any) {
      return res.status(err?.status || 500).json({
        error: err?.code || 'donation_create_failed',
        message: err?.message || 'Failed to record donation.',
      });
    }
  }
);

// =========================================================================
// PASTORAL CARE FOLLOW-UP TASKS (ORG-SCOPED)
// =========================================================================

const createFollowupSchema = z.object({
  personId: z.string().trim().min(1, 'Member ID is required'),
  personName: z.string().trim().max(150).optional(),
  groupName: z.string().trim().max(150).optional(),
  reason: z.enum(['absent_2', 'absent_3', 'first_timer', 'manual']).default('manual'),
  assignedToName: z.string().trim().max(150).optional(),
  dueOn: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(1000).optional(),
});

const updateFollowupSchema = z.object({
  status: z.enum(['open', 'contacted', 'resolved', 'dismissed']).optional(),
  outcome: z.string().trim().max(500).optional(),
  assignedToName: z.string().trim().max(150).optional(),
  notes: z.string().trim().max(1000).optional(),
});

app.get(
  '/api/followup-tasks',
  requireAuthRole('admin', 'pastor', 'usher', 'group_leader', 'super_admin', 'creator'),
  requireActiveLicense,
  async (req: Request, res: Response) => {
    try {
      const tasks = await platformStore.listFollowupTasks(req.organizationId!);
      return res.status(200).json({ tasks });
    } catch (err: any) {
      return res.status(err?.status || 500).json({
        error: err?.code || 'followup_fetch_failed',
        message: err?.message || 'Failed to load follow-up tasks.',
      });
    }
  }
);

app.post(
  '/api/followup-tasks',
  requireAuthRole('admin', 'pastor', 'usher', 'group_leader', 'super_admin', 'creator'),
  requireActiveLicense,
  async (req: Request, res: Response) => {
    const parsed = createFollowupSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: 'validation_error',
        message: parsed.error.issues[0]?.message || 'Invalid follow-up task payload.',
      });
    }

    try {
      const task = await platformStore.createFollowupTask(req.organizationId!, parsed.data);
      return res.status(201).json({ task });
    } catch (err: any) {
      return res.status(err?.status || 500).json({
        error: err?.code || 'followup_create_failed',
        message: err?.message || 'Failed to create follow-up task.',
      });
    }
  }
);

app.patch(
  '/api/followup-tasks/:id',
  requireAuthRole('admin', 'pastor', 'usher', 'group_leader', 'super_admin', 'creator'),
  requireActiveLicense,
  async (req: Request, res: Response) => {
    const parsed = updateFollowupSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: 'validation_error',
        message: parsed.error.issues[0]?.message || 'Invalid follow-up task update.',
      });
    }

    try {
      const task = await platformStore.updateFollowupTask(
        req.organizationId!,
        req.params.id,
        parsed.data
      );
      return res.status(200).json({ task });
    } catch (err: any) {
      return res.status(err?.status || 500).json({
        error: err?.code || 'followup_update_failed',
        message: err?.message || 'Failed to update follow-up task.',
      });
    }
  }
);

app.delete(
  '/api/followup-tasks/:id',
  requireAuthRole('admin', 'pastor', 'super_admin', 'creator'),
  requireActiveLicense,
  async (req: Request, res: Response) => {
    try {
      await platformStore.deleteFollowupTask(req.organizationId!, req.params.id);
      return res.status(200).json({ success: true });
    } catch (err: any) {
      return res.status(err?.status || 500).json({
        error: err?.code || 'followup_delete_failed',
        message: err?.message || 'Failed to delete follow-up task.',
      });
    }
  }
);

// =========================================================================
// MEMBER PRIVACY CONSENTS & EVENT RSVPS (ORG + USER SCOPED)
// =========================================================================

const updateConsentsSchema = z.object({
  autoCheckin: z.boolean(),
  push: z.boolean(),
  sms: z.boolean(),
  email: z.boolean(),
});

app.get(
  '/api/consents/me',
  requireUser,
  enforceOrganizationScope,
  async (req: Request, res: Response) => {
    try {
      const consents = await platformStore.getMemberConsents(
        req.organizationId!,
        req.user!.id,
        req.user!.email
      );
      return res.status(200).json({ consents });
    } catch (err: any) {
      return res.status(err?.status || 500).json({
        error: err?.code || 'consents_fetch_failed',
        message: err?.message || 'Failed to load consent settings.',
      });
    }
  }
);

app.put(
  '/api/consents/me',
  requireUser,
  enforceOrganizationScope,
  requireActiveLicense,
  async (req: Request, res: Response) => {
    const parsed = updateConsentsSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: 'validation_error',
        message: parsed.error.issues[0]?.message || 'Invalid consent settings payload.',
      });
    }

    try {
      const consents = await platformStore.upsertMemberConsents(
        req.organizationId!,
        req.user!.id,
        req.user!.email,
        parsed.data,
        req.user!.name
      );
      return res.status(200).json({ consents });
    } catch (err: any) {
      return res.status(err?.status || 500).json({
        error: err?.code || 'consents_update_failed',
        message: err?.message || 'Failed to save consent settings.',
      });
    }
  }
);

const updateRsvpSchema = z.object({
  eventTitle: z.string().trim().min(1, 'Event title is required').max(200),
  eventId: z.string().trim().max(120).optional(),
  attending: z.boolean(),
});

app.get(
  '/api/rsvps/me',
  requireUser,
  enforceOrganizationScope,
  async (req: Request, res: Response) => {
    try {
      const rsvps = await platformStore.listEventRsvps(req.organizationId!, req.user!.id);
      return res.status(200).json({ rsvps });
    } catch (err: any) {
      return res.status(err?.status || 500).json({
        error: err?.code || 'rsvps_fetch_failed',
        message: err?.message || 'Failed to load event RSVPs.',
      });
    }
  }
);

app.put(
  '/api/rsvps/me',
  requireUser,
  enforceOrganizationScope,
  requireActiveLicense,
  async (req: Request, res: Response) => {
    const parsed = updateRsvpSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: 'validation_error',
        message: parsed.error.issues[0]?.message || 'Invalid RSVP payload.',
      });
    }

    try {
      const result = await platformStore.upsertEventRsvp(
        req.organizationId!,
        req.user!.id,
        req.user!.email,
        parsed.data
      );
      return res.status(200).json(result);
    } catch (err: any) {
      return res.status(err?.status || 500).json({
        error: err?.code || 'rsvp_update_failed',
        message: err?.message || 'Failed to update event RSVP.',
      });
    }
  }
);

// =========================================================================
// ORGANISATION STAFF DIRECTORY & PROVISIONING (ADMIN / CREATOR)
// =========================================================================

const createStaffSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name is required').max(150),
  email: z.string().trim().email('Valid email address is required'),
  phone: z.string().trim().max(40).optional(),
  role: z.enum(['admin', 'pastor', 'usher', 'group_leader', 'finance', 'super_admin']),
  password: z.string().min(8, 'Password must be at least 8 characters').optional(),
});

app.get(
  '/api/staff',
  requireAuthRole('admin', 'pastor', 'super_admin', 'creator'),
  async (req: Request, res: Response) => {
    try {
      const staff = await platformStore.listOrganizationStaff(req.organizationId!);
      return res.status(200).json({ staff });
    } catch (err: any) {
      return res.status(err?.status || 500).json({
        error: err?.code || 'staff_fetch_failed',
        message: err?.message || 'Failed to load organisation staff.',
      });
    }
  }
);

app.post(
  '/api/staff',
  requireAuthRole('admin', 'super_admin', 'creator'),
  requireActiveLicense,
  async (req: Request, res: Response) => {
    const parsed = createStaffSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: 'validation_error',
        message: parsed.error.issues[0]?.message || 'Invalid staff provisioning payload.',
      });
    }

    const callerIsCreator =
      req.user?.role === 'creator' ||
      req.user?.role === 'super_admin' ||
      Boolean(req.user?.is_creator);
    if (parsed.data.role === 'super_admin' && !callerIsCreator) {
      return res.status(403).json({
        error: 'forbidden',
        message: 'Only platform creators or super admins may provision a Platform Super Admin.',
      });
    }

    try {
      const result = await platformStore.provisionOrganizationStaff({
        organizationId: req.organizationId!,
        fullName: parsed.data.fullName,
        email: parsed.data.email,
        phone: parsed.data.phone,
        role: parsed.data.role,
        password: parsed.data.password,
        ipAddress: req.ip,
      });
      return res.status(201).json(result);
    } catch (err: any) {
      return res.status(err?.status || 400).json({
        error: err?.code || 'staff_provision_failed',
        message: err?.message || 'Failed to provision staff account.',
      });
    }
  }
);

// =========================================================================
// UNIFIED MEMBER & STAFF USER CREDENTIALS + ROLE MANAGEMENT
// =========================================================================

const optionalTrimmedText = (maxLen: number) =>
  z.preprocess(
    (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
    z.string().trim().max(maxLen).optional()
  );

const optionalEmailField = z.preprocess(
  (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
  z.string().trim().email('Valid email address is required').optional()
);

const optionalPasswordField = z.preprocess(
  (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
  z.string().min(8, 'Password must be at least 8 characters').optional()
);

const USER_ROLES_ENUM = [
  'member',
  'usher',
  'group_leader',
  'pastor',
  'finance',
  'admin',
  'super_admin',
] as const;

const manageUserCredentialsSchema = z
  .object({
    memberId: optionalTrimmedText(120),
    fullName: optionalTrimmedText(150),
    email: optionalEmailField,
    phone: optionalTrimmedText(40),
    role: z.enum(USER_ROLES_ENUM).default('member'),
    password: optionalPasswordField,
    requirePasswordChange: z.boolean().optional(),
  })
  .refine((data) => Boolean(data.memberId || data.email || data.phone), {
    message: 'Select an enrolled member or provide an email address or phone number.',
  });

const updateUserAccountSchema = z
  .object({
    role: z.enum(USER_ROLES_ENUM).optional(),
    status: z.enum(['active', 'suspended']).optional(),
  })
  .refine((data) => Boolean(data.role || data.status), {
    message: 'Provide at least a role or account status update.',
  });

app.get(
  '/api/users',
  requireAuthRole('admin', 'pastor', 'super_admin', 'creator'),
  async (req: Request, res: Response) => {
    try {
      const users = await platformStore.listOrganizationUsers(req.organizationId!);
      return res.status(200).json({ users });
    } catch (err: any) {
      return res.status(err?.status || 500).json({
        error: err?.code || 'users_fetch_failed',
        message: err?.message || 'Failed to load organisation user and member accounts.',
      });
    }
  }
);

app.post(
  '/api/users/credentials',
  requireAuthRole('admin', 'super_admin', 'creator'),
  requireActiveLicense,
  async (req: Request, res: Response) => {
    const parsed = manageUserCredentialsSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: 'validation_error',
        message: parsed.error.issues[0]?.message || 'Invalid user credentials payload.',
      });
    }

    const callerIsCreator =
      req.user?.role === 'creator' ||
      req.user?.role === 'super_admin' ||
      Boolean(req.user?.is_creator);
    if (parsed.data.role === 'super_admin' && !callerIsCreator) {
      return res.status(403).json({
        error: 'forbidden',
        message: 'Only platform creators or super admins may assign Platform Super Admin privileges.',
      });
    }

    try {
      const result = await platformStore.provisionOrganizationMemberCredentials({
        organizationId: req.organizationId!,
        memberId: parsed.data.memberId,
        fullName: parsed.data.fullName,
        email: parsed.data.email,
        phone: parsed.data.phone,
        role: parsed.data.role,
        password: parsed.data.password,
        requirePasswordChange: parsed.data.requirePasswordChange,
        actorId: req.user?.id || null,
        actorEmail: req.user?.email || null,
        ipAddress: req.ip,
      });
      return res.status(201).json(result);
    } catch (err: any) {
      return res.status(err?.status || 400).json({
        error: err?.code || 'user_credential_provision_failed',
        message: err?.message || 'Failed to save user login credentials.',
      });
    }
  }
);

app.patch(
  '/api/users/:id',
  requireAuthRole('admin', 'super_admin', 'creator'),
  requireActiveLicense,
  async (req: Request, res: Response) => {
    const parsed = updateUserAccountSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: 'validation_error',
        message: parsed.error.issues[0]?.message || 'Invalid user account update payload.',
      });
    }

    const callerIsCreator =
      req.user?.role === 'creator' ||
      req.user?.role === 'super_admin' ||
      Boolean(req.user?.is_creator);

    try {
      const user = await platformStore.updateOrganizationUserAccount({
        organizationId: req.organizationId!,
        targetId: String(req.params.id || ''),
        role: parsed.data.role,
        status: parsed.data.status,
        actorUserId: req.user?.id || null,
        actorEmail: req.user?.email || null,
        callerIsCreator,
        ipAddress: req.ip,
      });
      return res.status(200).json({ user });
    } catch (err: any) {
      return res.status(err?.status || 400).json({
        error: err?.code || 'user_account_update_failed',
        message: err?.message || 'Failed to update user account.',
      });
    }
  }
);

// =========================================================================
// SSRF-GUARDED EXTERNAL MEDIA PROXY (MEMBER / EVENT IMAGES IN IFRAME)
// =========================================================================

const mediaProxyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `media:${getClientIpKey(req)}`,
  validate: {
    xForwardedForHeader: false,
    forwardedHeader: false,
  },
  message: { error: 'rate_limit_exceeded', message: 'Too many image proxy requests. Please wait a moment.' },
});

app.get('/api/media/proxy', mediaProxyLimiter, async (req: Request, res: Response) => {
  const rawUrl = typeof req.query.url === 'string' ? req.query.url : '';
  const parsedWidth = Number(req.query.w);
  const parsedQuality = Number(req.query.q);
  const width = Number.isFinite(parsedWidth) && parsedWidth > 0 ? parsedWidth : undefined;
  const quality = Number.isFinite(parsedQuality) && parsedQuality > 0 ? parsedQuality : undefined;
  const acceptHeader = typeof req.headers.accept === 'string' ? req.headers.accept : undefined;

  try {
    const { buffer, contentType, etag } = await proxyExternalImage(rawUrl, {
      width,
      quality,
      acceptHeader,
    });
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    res.setHeader('ETag', etag);
    res.setHeader('Vary', 'Accept');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");

    const ifNoneMatch = req.headers['if-none-match'];
    if (typeof ifNoneMatch === 'string' && ifNoneMatch.trim() === etag) {
      return res.status(304).end();
    }

    res.setHeader('Content-Type', contentType);
    return res.status(200).send(buffer);
  } catch (err: any) {
    if (err instanceof MediaProxyError) {
      return res.status(err.status).json({
        error: err.code,
        message: err.message,
      });
    }
    return res.status(502).json({
      error: 'media_proxy_failed',
      message: 'Could not retrieve the external image URL.',
    });
  }
});

// =========================================================================
// SERVER HEALTH & STATUS (NO COORDINATES OR PII EXPOSED)
// =========================================================================

app.get(['/api/health', '/api/db/status'], (_req: Request, res: Response) => {
  return res.status(200).json({
    status: 'healthy',
    app: 'Ekklesphere Church Management',
    storageBackend: platformStore.storageBackend,
    timestamp: new Date().toISOString(),
  });
});

app.all('/api/*', (req: Request, res: Response) => {
  return res.status(404).json({
    error: 'not_found',
    message: `API endpoint not found: ${req.method} ${req.path}`,
  });
});

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = typeof err?.status === 'number' ? err.status : 500;
  return res.status(status).json({
    error: err?.code || 'internal_server_error',
    message: err?.message || 'Unexpected server error.',
  });
});

async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';
  const httpServer = createServer(app);

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const hmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: hmrDisabled ? false : { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[Ekklesphere] Server running at http://0.0.0.0:${PORT} (${platformStore.storageBackend})`);
  });
}

if (process.env.NODE_ENV !== 'test' && !process.env.VITEST && !process.env.VERCEL) {
  startServer().catch((err) => {
    console.error('[Ekklesphere] Failed to start server:', err);
    process.exit(1);
  });
}

export { app };
