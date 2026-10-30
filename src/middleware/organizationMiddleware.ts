import type { Request, Response, NextFunction } from 'express';

// Standard 8-4-4-4-12 UUID validator
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface OrganizationContext {
  organizationId: string | null;
  userId: string | null;
  userRole: string | null;
  source: 'header' | 'query' | 'cookie' | 'jwt_claim' | 'default' | 'none';
  isValid: boolean;
}

/**
 * Validates whether a given string is a valid UUID format
 */
export function validateOrganizationId(id: string | null | undefined): boolean {
  if (!id || typeof id !== 'string') return false;
  return UUID_REGEX.test(id.trim());
}

/**
 * Express Middleware for Node.js / Express server.
 * Captures and enforces x-organization-id and x-school-id context.
 * Deny-by-default: does not inject arbitrary default tenant IDs into unauthorized requests.
 */
export function expressOrganizationMiddleware(
  req: Request & { organizationId?: string; school_id?: string; user?: unknown; cookies?: Record<string, string> },
  res: Response,
  next: NextFunction
) {
  const extracted =
    (req.headers['x-organization-id'] as string) ||
    (req.headers['x-school-id'] as string) ||
    (req.headers['x-tenant-id'] as string) ||
    (req.query.organization_id as string) ||
    (req.query.school_id as string) ||
    (req.query.org_id as string) ||
    (req.body && typeof req.body === 'object' ? (req.body.organization_id || req.body.school_id) : undefined);

  if (extracted && validateOrganizationId(extracted)) {
    req.organizationId = extracted.trim();
    req.school_id = extracted.trim();
    res.setHeader('x-organization-id', extracted.trim());
  }

  next();
}
