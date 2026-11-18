// lib/auth.ts - Ekklesphere Hardened Authentication, Supabase JWT Verification & RBAC Engine
import type { Request, Response, NextFunction } from 'express';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
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
  designation?: string;
  is_creator?: boolean;
  auth_provider?: 'supabase' | 'session_jwt';
  sid?: string;
  idle_timeout_minutes?: number;
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

  const serviceSecret = env.SUPABASE_SERVICE_ROLE_KEY?.trim() || env.SUPABASE_SECRET_KEY?.trim();

  if (!hasJwt && !serviceSecret) {
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
 * Returns JWT signing/verification secret from environment, or a deterministic HMAC key derived
 * from SUPABASE_SERVICE_ROLE_KEY (consistent across serverless instances), or runtime random key.
 */
export function getJwtSecret(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.JWT_SECRET?.trim();
  if (configured && configured.length >= 16) {
    return configured;
  }
  if (configured && configured.length > 0) {
    console.warn('[Ekklesphere Security] JWT_SECRET is less than 16 characters. Using derived server key.');
  }

  if (env.STRICT_PROD_AUTH === 'true' && env.NODE_ENV === 'production') {
    throw new Error('CRITICAL: JWT_SECRET environment variable is required in production when STRICT_PROD_AUTH=true.');
  }

  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim() || env.SUPABASE_SECRET_KEY?.trim();
  if (serviceRoleKey) {
    const scopeUrl = env.SUPABASE_URL?.trim() || env.VITE_SUPABASE_URL?.trim() || 'supabase';
    return createHmac('sha256', serviceRoleKey)
      .update(`ekklesphere-jwt-signing-v1:${scopeUrl}`)
      .digest('hex');
  }

  return RUNTIME_SECURE_SECRET;
}

function getTemporaryPasswordSealKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  return createHash('sha256')
    .update(`ekklesphere-temp-pw-seal-v1:${getJwtSecret(env)}`)
    .digest();
}

/**
 * Encrypts a short-lived temporary password with AES-256-GCM so organisation admins
 * can view/copy active onboarding/reset temporary passwords until the user sets a personal one.
 */
export function sealTemporaryPassword(
  plaintext: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  const clean = String(plaintext || '');
  if (!clean) return '';
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getTemporaryPasswordSealKey(env), iv);
  const encrypted = Buffer.concat([cipher.update(clean, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${encrypted.toString('base64url')}`;
}

export function unsealTemporaryPassword(
  sealed?: string | null,
  env: NodeJS.ProcessEnv = process.env
): string | undefined {
  if (!sealed || typeof sealed !== 'string') return undefined;
  const parts = sealed.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') return undefined;
  try {
    const iv = Buffer.from(parts[1], 'base64url');
    const tag = Buffer.from(parts[2], 'base64url');
    const payload = Buffer.from(parts[3], 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', getTemporaryPasswordSealKey(env), iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(payload), decipher.final()]).toString('utf8');
    return decrypted || undefined;
  } catch {
    return undefined;
  }
}

function getTenantSecretSealKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  const configured = (env.GATEWAY_SECRETS_KEY || '').trim();
  const base = configured.length >= 16 ? configured : getJwtSecret(env);
  return createHash('sha256')
    .update(`ekklesphere-tenant-gateway-secret-v1:${base}`)
    .digest();
}

/**
 * Encrypts per-tenant external API secrets (Arkesel, Paystack) with AES-256-GCM at rest.
 */
export function sealTenantSecret(
  plaintext: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  const clean = String(plaintext || '').trim();
  if (!clean) return '';
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getTenantSecretSealKey(env), iv);
  const encrypted = Buffer.concat([cipher.update(clean, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `tgv1:${iv.toString('base64url')}:${tag.toString('base64url')}:${encrypted.toString('base64url')}`;
}

export function unsealTenantSecret(
  sealed?: string | null,
  env: NodeJS.ProcessEnv = process.env
): string | undefined {
  if (!sealed || typeof sealed !== 'string') return undefined;
  const parts = sealed.split(':');
  if (parts.length !== 4 || parts[0] !== 'tgv1') return undefined;
  try {
    const iv = Buffer.from(parts[1], 'base64url');
    const tag = Buffer.from(parts[2], 'base64url');
    const payload = Buffer.from(parts[3], 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', getTenantSecretSealKey(env), iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(payload), decipher.final()]).toString('utf8');
    return decrypted || undefined;
  } catch {
    return undefined;
  }
}

export function maskSecretTail(plaintext?: string | null): string | null {
  const clean = String(plaintext || '').trim();
  if (!clean) return null;
  if (clean.length <= 4) return '••••';
  return `••••${clean.slice(-4)}`;
}

/**
 * Generates a deterministic HMAC-SHA256 token scoped strictly to (organizationId, serviceId)
 * so scheduled services can issue cryptographically verifiable check-in QR codes.
 */
export function createServiceQrToken(organizationId: string, serviceId: string): string {
  const org = String(organizationId || '').trim().toLowerCase();
  const svc = String(serviceId || '').trim().toLowerCase();
  const secret = getJwtSecret();
  return createHmac('sha256', secret)
    .update(`ekklesphere-service-qr-v1:${org}:${svc}`)
    .digest('base64url')
    .slice(0, 24);
}

/**
 * Timing-safe verification of a service check-in QR token against (organizationId, serviceId).
 */
export function verifyServiceQrToken(
  organizationId: string,
  serviceId: string,
  candidateToken?: string | null
): boolean {
  const clean = typeof candidateToken === 'string' ? candidateToken.trim() : '';
  if (!clean || !organizationId || !serviceId) return false;
  const expected = createServiceQrToken(organizationId, serviceId);
  const actualBuf = Buffer.from(clean, 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');
  if (actualBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(actualBuf, expectedBuf);
}

export const DEFAULT_IDLE_SESSION_TIMEOUT_MINUTES = 30;
export const MAX_IDLE_SESSION_TIMEOUT_MINUTES = 480;

export function normalizeIdleTimeoutMinutes(raw?: unknown): number {
  if (raw === undefined || raw === null || raw === '') {
    return DEFAULT_IDLE_SESSION_TIMEOUT_MINUTES;
  }
  const num = Number(raw);
  if (!Number.isFinite(num)) return DEFAULT_IDLE_SESSION_TIMEOUT_MINUTES;
  if (num <= 0) return 0; // Explicitly disabled idle timeout (falls back to 24h JWT)
  return Math.max(1, Math.min(MAX_IDLE_SESSION_TIMEOUT_MINUTES, Math.round(num)));
}

interface ServerSessionEntry {
  sid: string;
  userId: string;
  organizationId?: string;
  idleTimeoutMs: number;
  idleTimeoutMinutes: number;
  lastActivityAt: number;
  createdAt: number;
  revoked: boolean;
}

const serverSessionRegistry = new Map<string, ServerSessionEntry>();
const revokedSessionIds = new Set<string>();

function pruneServerSessionRegistry(nowMs = Date.now()): void {
  if (serverSessionRegistry.size <= 5000) return;
  for (const [sid, entry] of serverSessionRegistry.entries()) {
    const expiredIdle = entry.idleTimeoutMs > 0 && nowMs - entry.lastActivityAt > entry.idleTimeoutMs;
    const staleAbsolute = nowMs - entry.lastActivityAt > 24 * 60 * 60 * 1000;
    if (entry.revoked || expiredIdle || staleAbsolute) {
      serverSessionRegistry.delete(sid);
    }
  }
}

export function resetSessionRegistryForTests(): void {
  serverSessionRegistry.clear();
  revokedSessionIds.clear();
}

export function registerServerSession(params: {
  sid: string;
  userId: string;
  organizationId?: string;
  idleTimeoutMinutes?: number;
  nowMs?: number;
}): ServerSessionEntry {
  const nowMs = params.nowMs ?? Date.now();
  const minutes = normalizeIdleTimeoutMinutes(params.idleTimeoutMinutes);
  const idleTimeoutMs = minutes > 0 ? minutes * 60_000 : 0;
  const entry: ServerSessionEntry = {
    sid: params.sid,
    userId: params.userId,
    organizationId: params.organizationId,
    idleTimeoutMs,
    idleTimeoutMinutes: minutes,
    lastActivityAt: nowMs,
    createdAt: nowMs,
    revoked: false,
  };
  revokedSessionIds.delete(params.sid);
  serverSessionRegistry.set(params.sid, entry);
  pruneServerSessionRegistry(nowMs);
  return entry;
}

export function touchOrValidateServerSession(
  user: AuthUserPayload,
  nowMs: number = Date.now()
): {
  ok: boolean;
  reason?: 'timed_out' | 'revoked';
  lastActivityAt?: number;
  idleTimeoutMinutes?: number;
} {
  if (!user.sid) {
    return { ok: true };
  }

  if (revokedSessionIds.has(user.sid)) {
    return { ok: false, reason: 'revoked' };
  }

  let entry = serverSessionRegistry.get(user.sid);
  if (!entry) {
    // Re-hydrate sliding tracker on cold server restarts for non-expired JWTs
    entry = registerServerSession({
      sid: user.sid,
      userId: user.id,
      organizationId: user.organization_id || user.tenant_id,
      idleTimeoutMinutes: user.idle_timeout_minutes ?? DEFAULT_IDLE_SESSION_TIMEOUT_MINUTES,
      nowMs,
    });
    return {
      ok: true,
      lastActivityAt: entry.lastActivityAt,
      idleTimeoutMinutes: entry.idleTimeoutMinutes,
    };
  }

  if (entry.revoked) {
    return { ok: false, reason: 'revoked' };
  }

  if (entry.idleTimeoutMs > 0 && nowMs - entry.lastActivityAt > entry.idleTimeoutMs) {
    entry.revoked = true;
    revokedSessionIds.add(entry.sid);
    return { ok: false, reason: 'timed_out' };
  }

  entry.lastActivityAt = nowMs;
  return {
    ok: true,
    lastActivityAt: entry.lastActivityAt,
    idleTimeoutMinutes: entry.idleTimeoutMinutes,
  };
}

export function revokeServerSession(sid?: string): void {
  if (!sid) return;
  revokedSessionIds.add(sid);
  const existing = serverSessionRegistry.get(sid);
  if (existing) {
    existing.revoked = true;
  }
}

export function expireServerSessionForTests(sid: string): void {
  const entry = serverSessionRegistry.get(sid);
  if (entry) {
    entry.lastActivityAt = Date.now() - Math.max(entry.idleTimeoutMs, 60_000) - 5_000;
  }
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
  const isTrustedSessionOrigin =
    Boolean(payload.sid) || payload.auth_provider === 'supabase';
  const isAuthorizedCreator =
    (payload.is_creator === true ||
      payload.role === 'creator' ||
      payload.role === 'super_admin') &&
    (isTrustedSessionOrigin || isAuthorizedCreatorEmail(payload.email));

  const normalizedPayload: Omit<AuthUserPayload, 'iat' | 'exp'> = {
    ...payload,
    organization_id: orgId,
    tenant_id: orgId,
    campus_id: payload.campus_id,
    role:
      (payload.role === 'creator' || payload.role === 'super_admin') && !isAuthorizedCreator
        ? 'member'
        : payload.role,
    is_creator: isAuthorizedCreator,
    auth_provider: payload.auth_provider || 'session_jwt',
  };
  return jwt.sign(normalizedPayload, secret, { expiresIn: expiresIn as jwt.SignOptions['expiresIn'] });
}

/**
 * Issues a tracked user session JWT whose JWT expiry and server-side idle timeout match the organisation setting.
 */
export function signSessionToken(
  payload: Omit<AuthUserPayload, 'iat' | 'exp' | 'sid' | 'idle_timeout_minutes'>,
  idleTimeoutMinutes?: number
): { token: string; sid: string; idleTimeoutMinutes: number; expiresAt: string } {
  const minutes = normalizeIdleTimeoutMinutes(idleTimeoutMinutes);
  const sid = randomBytes(16).toString('hex');
  registerServerSession({
    sid,
    userId: payload.id,
    organizationId: payload.organization_id || payload.tenant_id,
    idleTimeoutMinutes: minutes,
  });
  const jwtMinutes = minutes > 0 ? minutes : 24 * 60;
  const expiresIn = `${jwtMinutes}m`;
  const expiresAt = new Date(Date.now() + jwtMinutes * 60_000).toISOString();
  const token = signToken(
    {
      ...payload,
      sid,
      idle_timeout_minutes: minutes,
    },
    expiresIn
  );
  return { token, sid, idleTimeoutMinutes: minutes, expiresAt };
}

/**
 * Cryptographically verifies a locally signed session JWT and normalizes claims.
 */
export function verifyToken(token: string): AuthUserPayload {
  const secret = getJwtSecret();
  const decoded = jwt.verify(token, secret) as AuthUserPayload;
  const orgId = decoded.organization_id || decoded.tenant_id;
  const isTrustedSessionOrigin =
    Boolean(decoded.sid) || decoded.auth_provider === 'supabase';
  const isAuthorizedCreator =
    (decoded.is_creator === true ||
      decoded.role === 'creator' ||
      decoded.role === 'super_admin') &&
    (isTrustedSessionOrigin || isAuthorizedCreatorEmail(decoded.email));

  return {
    ...decoded,
    organization_id: orgId,
    tenant_id: orgId,
    campus_id: decoded.campus_id,
    role:
      (decoded.role === 'creator' || decoded.role === 'super_admin') && !isAuthorizedCreator
        ? 'member'
        : decoded.role,
    is_creator: isAuthorizedCreator,
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

export const AUTHORIZED_CREATOR_EMAILS: readonly string[] = [
  'akokosolutions24@gmail.com',
  'amoakoemmanuel2020@gmail.com',
  'creator@ekklesphere.platform',
  'creator@ekklesphere.church',
  'admin@ekklesphere.church',
];

export function isAuthorizedCreatorEmail(email?: string | null): boolean {
  if (!email || typeof email !== 'string') return false;
  const normalized = email.trim().toLowerCase();
  const envEmail = (process.env.CREATOR_EMAIL || process.env.VITE_CREATOR_EMAIL || '')?.trim().toLowerCase();
  return (
    AUTHORIZED_CREATOR_EMAILS.includes(normalized) ||
    Boolean(envEmail && normalized === envEmail)
  );
}

/**
 * Checks if an authenticated user holds verified Platform Creator privileges.
 * Sourced strictly from verified token claims (session-verified DB login / Supabase Auth)
 * or explicit platform creator email allowlist.
 */
export function isCreatorClaim(user?: AuthUserPayload | null): boolean {
  if (!user) return false;
  const isCreatorRole =
    user.is_creator === true ||
    user.role === 'creator' ||
    user.role === 'super_admin';
  if (!isCreatorRole) return false;
  return (
    Boolean(user.sid) ||
    user.auth_provider === 'supabase' ||
    isAuthorizedCreatorEmail(user.email)
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
    const sessionCheck = touchOrValidateServerSession(decoded);
    if (!sessionCheck.ok) {
      const isTimeout = sessionCheck.reason === 'timed_out';
      res.status(401).json({
        error: isTimeout ? 'session_timed_out' : 'unauthorized',
        code: isTimeout ? 'SESSION_TIMEOUT' : 'SESSION_REVOKED',
        message: isTimeout
          ? 'Your session timed out due to inactivity. Please sign in again.'
          : 'Your session has ended. Please sign in again.',
      });
      return;
    }
    req.user = decoded;
    const orgId = decoded.organization_id || decoded.tenant_id;
    req.organizationId = orgId;
    req.tenant_id = orgId;
    req.campus_id = decoded.campus_id;
    next();
  } catch (err: any) {
    const expired = err?.name === 'TokenExpiredError';
    res.status(401).json({
      error: expired ? 'session_timed_out' : 'unauthorized',
      code: expired ? 'SESSION_TIMEOUT' : 'INVALID_TOKEN',
      message: expired ? 'Your session has expired. Please sign in again.' : 'Invalid token signature',
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

export function hasPastoralOversightAccess(
  user?: Pick<AuthUserPayload, 'role' | 'designation' | 'is_creator'> | null
): boolean {
  if (!user) return false;
  if (user.is_creator) return true;
  if (
    user.role === 'super_admin' ||
    user.role === 'creator' ||
    user.role === 'admin' ||
    user.role === 'pastor'
  ) {
    return true;
  }
  const cleanDesignation = String(user.designation || '').trim().toLowerCase();
  if (!cleanDesignation) return false;
  return /\b(administrator|senior pastor|associate pastor|presiding elder|youth pastor|pastor|bishop|reverend)\b/i.test(
    cleanDesignation
  );
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
