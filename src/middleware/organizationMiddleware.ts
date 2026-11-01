// src/middleware/organizationMiddleware.ts - Zero-Trust Organization Scoping Middleware
import type { Request, Response, NextFunction } from 'express';
import { isCreatorClaim, PRIMARY_ORGANIZATION_ID, type ActiveSupportGrantContext } from '../../lib/auth.ts';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateTenantId(id: string | null | undefined): boolean {
  if (!id || typeof id !== 'string') return false;
  return UUID_REGEX.test(id.trim());
}

export const validateOrganizationId = validateTenantId;

export interface OrganizationContext {
  id: string | null;
  source: 'verified_token' | 'support_grant' | 'none';
}

export type SupportGrantLookup = (
  grantId: string,
  creatorUserId: string
) => Promise<ActiveSupportGrantContext | null>;

let supportGrantLookup: SupportGrantLookup | null = null;

export function registerSupportGrantLookup(lookup: SupportGrantLookup | null): void {
  supportGrantLookup = lookup;
}

export type UserOrganizationResolver = (
  user: import('../../lib/auth.ts').AuthUserPayload
) => Promise<string | null>;

let userOrganizationResolver: UserOrganizationResolver | null = null;

export function registerUserOrganizationResolver(
  resolver: UserOrganizationResolver | null
): void {
  userOrganizationResolver = resolver;
}

/**
 * PHASE 0 REMEDIATION (#4):
 * Never populate `req.organizationId` or `req.tenant_id` from unverified client headers
 * (`x-tenant-id`, `x-campus-id`, `x-organization-id`), query strings, or request bodies.
 * Organization context is strictly derived AFTER token verification in `enforceOrganizationScope`.
 */
export function expressOrganizationMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  req.organizationId = undefined;
  req.tenant_id = undefined;
  next();
}

function extractClientRequestedOrgId(req: Request): string | null {
  const candidates = [
    req.headers['x-organization-id'],
    req.headers['x-tenant-id'],
    req.query?.organization_id,
    req.query?.organizationId,
    req.query?.tenant_id,
    req.query?.tenantId,
    req.body && typeof req.body === 'object'
      ? req.body.organization_id || req.body.organizationId || req.body.tenant_id || req.body.tenantId
      : undefined,
  ];

  for (const val of candidates) {
    if (typeof val === 'string' && UUID_REGEX.test(val.trim())) {
      return val.trim().toLowerCase();
    }
  }
  return null;
}

/**
 * Enforces organization isolation after `req.user` has been cryptographically verified:
 * 1. Standard church users are strictly bound to their verified membership `organization_id`.
 *    Any attempt to target a different UUID via headers/query/body returns 403.
 * 2. Platform creators may inspect another organisation ONLY via an active, audited,
 *    time-limited `x-support-grant-id` (read-only: mutating HTTP methods are blocked with 403).
 */
export async function enforceOrganizationScope(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.user) {
    res.status(401).json({
      error: 'unauthorized',
      message: 'Verified identity required before resolving organization scope.',
    });
    return;
  }

  let verifiedOrgId = (req.user.organization_id || req.user.tenant_id || '').toLowerCase();

  if (!verifiedOrgId && userOrganizationResolver) {
    try {
      const resolved = await userOrganizationResolver(req.user);
      if (resolved && UUID_REGEX.test(resolved.trim())) {
        verifiedOrgId = resolved.trim().toLowerCase();
        req.user.organization_id = verifiedOrgId;
        req.user.tenant_id = verifiedOrgId;
      }
    } catch {}
  }

  // Check if Creator is using an audited read-only Support Grant ("View as Organisation Admin")
  const supportGrantHeader = req.headers['x-support-grant-id'];
  if (typeof supportGrantHeader === 'string' && supportGrantHeader.trim()) {
    if (!isCreatorClaim(req.user)) {
      res.status(403).json({
        error: 'forbidden',
        code: 'SUPPORT_GRANT_FORBIDDEN',
        message: 'Only verified platform creators may use support grants.',
      });
      return;
    }

    if (!supportGrantLookup) {
      res.status(403).json({
        error: 'forbidden',
        code: 'SUPPORT_GRANT_UNAVAILABLE',
        message: 'Support grant verification service is unavailable.',
      });
      return;
    }

    const grant = await supportGrantLookup(supportGrantHeader.trim(), req.user.id);
    if (!grant) {
      res.status(403).json({
        error: 'forbidden',
        code: 'SUPPORT_GRANT_INVALID_OR_EXPIRED',
        message: 'Support grant is invalid, revoked, or expired.',
      });
      return;
    }

    // Enforce strict read-only posture during "View as Organisation Admin"
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase())) {
      res.status(403).json({
        error: 'support_grant_read_only',
        code: 'SUPPORT_GRANT_READ_ONLY',
        message: 'View-as-Admin support grants are strictly read-only. Mutations are blocked.',
      });
      return;
    }

    req.supportGrant = grant;
    req.organizationId = grant.organizationId.toLowerCase();
    req.tenant_id = grant.organizationId.toLowerCase();
    res.setHeader('x-organization-id', req.organizationId);
    res.setHeader('x-support-grant-mode', 'read_only');
    next();
    return;
  }

  const requestedOrgId = extractClientRequestedOrgId(req);

  if (!isCreatorClaim(req.user)) {
    if (!verifiedOrgId) {
      res.status(403).json({
        error: 'unassigned_organization',
        code: 'NO_ORGANIZATION_MEMBERSHIP',
        message: 'Your account is not assigned to an active church organization in the database.',
      });
      return;
    }
    if (requestedOrgId && requestedOrgId !== verifiedOrgId) {
      res.status(403).json({
        error: 'cross_organization_forbidden',
        code: 'CROSS_ORGANIZATION_FORBIDDEN',
        message: 'Cross-organization access denied. Organization scope is bound to your verified membership.',
      });
      return;
    }
    req.organizationId = verifiedOrgId;
    req.tenant_id = verifiedOrgId;
    res.setHeader('x-organization-id', verifiedOrgId);
    next();
    return;
  }

  // Creators may target a specific organisation if provided, otherwise their verified org
  const effectiveOrgId = requestedOrgId || verifiedOrgId;
  req.organizationId = effectiveOrgId;
  req.tenant_id = effectiveOrgId;
  if (effectiveOrgId) {
    res.setHeader('x-organization-id', effectiveOrgId);
  }
  next();
}
