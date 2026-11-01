// lib/auth.ts - Ekklesphere Hardened Authentication, Supabase JWT Verification & RBAC Engine
import type { Request, Response, NextFunction } from 'express';
import { randomBytes } from 'crypto';
import jwt from 'jsonwebtoken';

export const PRIMARY_ORGANIZATION_ID = '';
export const PRIMARY_CAMPUS_SITE_ID = '';
export const TEST_ANCHOR_ORGANIZATION_ID = 'a0000000-0000-4000-8000-000000000001';
export const TEST_CAMPUS_SITE_ID = 'b0000000-0000-4000-8000-000000000001';

export type ChurchRole =
  | 'super_admin'
  | 'creator'
  | 'admin'
  | 'pastor'
  | 'usher'
  | 'member'
  | 'group_leader'
  | 'finance';

export interface AuthUserPayload {
  id: string;
  email: string;
  role: ChurchRole;
  tenant_id?: string;
  organization_id?: string;
  campus_id?: string;
  name?: string;
  is_creator?: boolean;
  auth_provider?: 'supabase' | 'session_jwt';
  iat?: number;
  exp?: number;
}

export interface ActiveSupportGrantContext {
  id: string;
  organizationId: string;
  creatorUserId: string;
  reason: string;
  expiresAt: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUserPayload;
      organizationId?: string;
      tenant_id?: string;
      campus_id?: string;
      supportGrant?: ActiveSupportGrantContext;
    }
  }
}

// Cryptographically secure 256-bit fallback secret generated per container instance
// Ensures the service boots reliably on Cloud Run / container rollouts without crashing
const RUNTIME_SECURE_SECRET = randomBytes(32).toString('hex');

export type ExternalIdentityVerifier = (token: string) => Promise<AuthUserPayload | null>;

let externalIdentityVerifier: ExternalIdentityVerifier | null = null;

export function registerExternalIdentityVerifier(verifier: ExternalIdentityVerifier | null): void {
  externalIdentityVerifier = verifier;
}

/**
 * Validates production security & database environment configuration at server boot.
 * If STRICT_PROD_AUTH is enabled, it strictly requires custom environment variables.
 * Otherwise, it logs status and auto-generates a 256-bit cryptographic instance key so Cloud Run starts cleanly.
 */
export function assertProductionAuthConfig(env: NodeJS.ProcessEnv = process.env): void {
  const isStrict = env.STRICT_PROD_AUTH === 'true';
  const hasJwt = Boolean(env.JWT_SECRET && env.JWT_SECRET.trim().length >= 16);
  const hasSupabase = Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);

  if (!hasJwt) {
    console.warn(
      '[Ekklesphere Security] Notice: JWT_SECRET (>=16 chars) not set. Auto-generating 256-bit cryptographically secure instance secret for session tokens.'
    );
  }
  if (!hasSupabase) {
    console.warn(
      '[Ekklesphere Security] Notice: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured. Running in self-contained store mode.'
    );
  }

  if (isStrict) {
    const missing: string[] = [];
    if (!hasJwt) {
      missing.push('JWT_SECRET (minimum 16 characters)');
    }
    if (!env.SUPABASE_URL || !env.SUPABASE_URL.trim()) {
      missing.push('SUPABASE_URL');
    }
    if (!env.SUPABASE_SERVICE_ROLE_KEY || !env.SUPABASE_SERVICE_ROLE_KEY.trim()) {
      missing.push('SUPABASE_SERVICE_ROLE_KEY');
    }

    if (missing.length > 0) {
      throw new Error(
        `[Ekklesphere Security] Strict mode enabled. Missing required environment variables: ${missing.join(', ')}`
      );
    }
  }
}

/**
 * Returns JWT signing/verification secret from environment or secure runtime key.
 */
export function getJwtSecret(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.JWT_SECRET?.trim();
  if (configured && configured.length >= 16) {
    return configured;
  }
  if (configured && configured.length > 0) {
    console.warn('[Ekklesphere Security] JWT_SECRET is less than 16 characters. Using secure runtime key.');
  }

  if (env.STRICT_PROD_AUTH === 'true' && env.NODE_ENV === 'production') {
    throw new Error('CRITICAL: JWT_SECRET environment variable is required in production when STRICT_PROD_AUTH=true.');
  }

  return RUNTIME_SECURE_SECRET;
}

/**
 * Signs an authenticated payload into a cryptographically secured JWT.
 */
export function signToken(
  payload: Omit<AuthUserPayload, 'iat' | 'exp'>,
  expiresIn: string | number = '24h'
): string {
  const secret = getJwtSecret();
  const orgId = payload.organization_id || payload.tenant_id;
  const normalizedPayload: Omit<AuthUserPayload, 'iat' | 'exp'> = {
    ...payload,
    organization_id: orgId,
    tenant_id: orgId,
    campus_id: payload.campus_id,
    is_creator:
      payload.is_creator === true ||
      payload.role === 'creator' ||
      payload.role === 'super_admin',
    auth_provider: payload.auth_provider || 'session_jwt',
  };
  return jwt.sign(normalizedPayload, secret, { expiresIn: expiresIn as jwt.SignOptions['expiresIn'] });
}

/**
 * Cryptographically verifies a locally signed session JWT and normalizes claims.
 */
export function verifyToken(token: string): AuthUserPayload {
  const secret = getJwtSecret();
  const decoded = jwt.verify(token, secret) as AuthUserPayload;
  const orgId = decoded.organization_id || decoded.tenant_id;
  return {
    ...decoded,
    organization_id: orgId,
    tenant_id: orgId,
    campus_id: decoded.campus_id,
    is_creator:
      decoded.is_creator === true ||
      decoded.role === 'creator' ||
      decoded.role === 'super_admin',
  };
}

/**
 * Verifies a Bearer token against either server-signed session JWTs or Supabase Auth JWTs.
 * Never trusts client headers (x-user-role, x-user-id, x-tenant-id).
 */
export async function resolveVerifiedUserFromToken(token: string): Promise<AuthUserPayload> {
  let localJwtError: any = null;
  try {
    return verifyToken(token);
  } catch (err: any) {
    localJwtError = err;
    if (err?.name === 'TokenExpiredError') {
      throw err;
    }
  }

  if (externalIdentityVerifier) {
    const verifiedSupabaseUser = await externalIdentityVerifier(token);
    if (verifiedSupabaseUser) {
      return verifiedSupabaseUser;
    }
  }

  throw localJwtError || new Error('Invalid token signature');
}

export function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const raw = authHeader.slice(7).trim();
    return raw.length > 0 ? raw : null;
  }
  return null;
}

/**
 * Checks if an authenticated user holds verified Platform Creator privileges.
 * Sourced strictly from verified token/app_metadata claims, never user_metadata or emails.
 */
export function isCreatorClaim(user?: AuthUserPayload | null): boolean {
  if (!user) return false;
  return (
    user.is_creator === true ||
    user.role === 'creator' ||
    user.role === 'super_admin'
  );
}

/**
 * Express middleware requiring a valid authenticated user session via Bearer JWT.
 */
export async function requireUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({
      error: 'unauthorized',
      message: 'Authentication required. Missing or malformed Bearer token.',
    });
    return;
  }

  try {
    const decoded = await resolveVerifiedUserFromToken(token);
    req.user = decoded;
    const orgId = decoded.organization_id || decoded.tenant_id;
    req.organizationId = orgId;
    req.tenant_id = orgId;
    req.campus_id = decoded.campus_id;
    next();
  } catch (err: any) {
    res.status(401).json({
      error: 'unauthorized',
      message: err?.name === 'TokenExpiredError' ? 'Token has expired' : 'Invalid token signature',
    });
  }
}

/**
 * Express middleware requiring verified Platform Creator claim (`app_metadata.creator`).
 */
export function requireCreator(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({
      error: 'unauthorized',
      message: 'Authentication required for Creator Console access.',
    });
    return;
  }

  if (!isCreatorClaim(req.user)) {
    res.status(403).json({
      error: 'creator_required',
      message: 'Access denied. Verified platform creator claim in app_metadata is required.',
    });
    return;
  }

  next();
}

/**
 * RBAC authorization middleware for Church roles.
 */
export function requireRoles(...allowedRoles: ChurchRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'unauthorized', message: 'Authentication required.' });
      return;
    }

    const { role } = req.user;

    if (isCreatorClaim(req.user)) {
      return next();
    }

    if (allowedRoles.includes(role)) {
      return next();
    }

    res.status(403).json({
      error: 'forbidden',
      message: `Access denied. Role '${role}' does not possess required church permissions.`,
    });
  };
}

export function isStaffRole(role?: ChurchRole): boolean {
  if (!role) return false;
  return ['super_admin', 'creator', 'admin', 'pastor', 'usher', 'finance'].includes(role);
}

export function canManagePremise(role?: ChurchRole): boolean {
  return role === 'super_admin' || role === 'creator' || role === 'admin';
}

export function canManageMembers(role?: ChurchRole): boolean {
  return role === 'super_admin' || role === 'creator' || role === 'admin' || role === 'pastor';
}

export function canCheckinAttendance(role?: ChurchRole): boolean {
  return (
    role === 'super_admin' ||
    role === 'creator' ||
    role === 'admin' ||
    role === 'pastor' ||
    role === 'usher' ||
    role === 'member'
  );
}

export function canManageFinance(role?: ChurchRole): boolean {
  return role === 'super_admin' || role === 'creator' || role === 'admin' || role === 'finance';
}

export function requireCampusScope(req: Request, _res: Response, next: NextFunction): void {
  if (req.user?.campus_id) {
    req.campus_id = req.user.campus_id;
  }
  next();
}
