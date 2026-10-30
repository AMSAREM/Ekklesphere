// src/middleware/organizationMiddleware.ts - Ekklesphere Church & Campus Tenant Context
import type { Request, Response, NextFunction } from 'express';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateTenantId(id: string | null | undefined): boolean {
  if (!id || typeof id !== 'string') return false;
  return UUID_REGEX.test(id.trim());
}

export const validateOrganizationId = validateTenantId;

export interface OrganizationContext {
  id: string | null;
  source: 'header' | 'query' | 'cookie' | 'jwt_claim' | 'default' | 'none';
}

export function expressOrganizationMiddleware(
  req: Request & { organizationId?: string; tenant_id?: string; campus_id?: string },
  res: Response,
  next: NextFunction
) {
  const extracted =
    (req.headers['x-tenant-id'] as string) ||
    (req.headers['x-campus-id'] as string) ||
    (req.headers['x-organization-id'] as string) ||
    (req.query.tenant_id as string) ||
    (req.query.campus_id as string) ||
    (req.query.organization_id as string) ||
    (req.body && typeof req.body === 'object' ? req.body.tenant_id || req.body.campus_id || req.body.organization_id : undefined);

  if (extracted && typeof extracted === 'string') {
    const clean = extracted.trim();
    req.organizationId = clean;
    req.tenant_id = clean;
    res.setHeader('x-tenant-id', clean);
  }

  next();
}
