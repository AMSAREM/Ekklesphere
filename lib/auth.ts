// lib/auth.ts - Hardened Enterprise Tenant Authentication & RBAC Engine
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthUserPayload {
  id: string;
  email: string;
  role: 'super_admin' | 'creator' | 'admin' | 'teacher' | 'accountant' | 'student' | 'member' | 'usher' | 'pastor';
  school_id?: string;
  organization_id?: string;
  username?: string;
  iat?: number;
  exp?: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUserPayload;
      school_id?: string;
      organization_id?: string;
    }
  }
}

/**
 * Returns JWT secret from environment.
 * CRITICAL SECURITY FIX (Step 2):
 * The hardcoded fallback ('schoolsphere-super-secure-jwt-secret-key-2026') has been purged.
 * The application strictly refuses to start/execute if JWT_SECRET is missing.
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim() === '') {
    throw new Error('FATAL: JWT_SECRET environment variable is missing. The application refuses to start without a configured secret.');
  }
  return secret;
}

/**
 * Signs an authenticated payload into a cryptographically secured JWT.
 */
export function signToken(payload: Omit<AuthUserPayload, 'iat' | 'exp'>, expiresIn: string | number = '24h'): string {
  const secret = getJwtSecret();
  return jwt.sign(payload, secret, { expiresIn: expiresIn as jwt.SignOptions['expiresIn'] });
}

/**
 * Cryptographically verifies token and returns user payload.
 * Throws an error if invalid, malformed, or expired.
 */
export function verifyToken(token: string): AuthUserPayload {
  const secret = getJwtSecret();
  return jwt.verify(token, secret) as AuthUserPayload;
}

/**
 * Express middleware requiring a valid authenticated user session.
 * Rejects invalid, expired, or missing tokens with 401 Unauthorized.
 */
export function requireUser(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'unauthorized',
      message: 'Authentication required. Missing or malformed Bearer token.',
    });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    if (decoded.school_id) req.school_id = decoded.school_id;
    if (decoded.organization_id) req.organization_id = decoded.organization_id;
    next();
  } catch (err: any) {
    res.status(401).json({
      error: 'unauthorized',
      message: err.name === 'TokenExpiredError' ? 'Token has expired' : 'Invalid token signature',
    });
  }
}

/**
 * RBAC authorization middleware.
 * CRITICAL SECURITY FIX (Step 2):
 * Username-based super-admin bypass (e.g., username?.toLowerCase() === 'elena' / 'elena_master')
 * is PERMANENTLY REMOVED.
 * Privileges are determined strictly from the authenticated user's database role:
 * 'super_admin' or 'creator' have platform-wide administrative authority.
 * Any other user must explicitly match allowedRoles.
 */
export function requireRoles(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'unauthorized', message: 'Authentication required.' });
      return;
    }

    const { role } = req.user;

    // Vendor admin & super admin roles possess platform-wide administrative scope
    if (role === 'super_admin' || role === 'creator') {
      return next();
    }

    if (allowedRoles.includes(role)) {
      return next();
    }

    res.status(403).json({
      error: 'forbidden',
      message: `Access denied. Role '${role}' does not possess required permissions for this action.`,
    });
  };
}

/**
 * Tenant Isolation Middleware (Step 3: Deny-by-default School / Org Scope).
 * - If request specifies school_id / organization_id and it mismatches the user's school, access is denied (403).
 * - If request does NOT specify school_id, it is automatically scoped to the user's own school.
 * - Global super_admin / creator may access any requested school.
 */
export function requireSchoolScope(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'unauthorized', message: 'Authentication required.' });
    return;
  }

  const user = req.user;
  const isSuperUser = user.role === 'super_admin' || user.role === 'creator';

  const requestedSchoolId =
    req.params.schoolId ||
    req.params.school_id ||
    req.params.organization_id ||
    req.params.orgId ||
    req.query.school_id ||
    req.query.schoolId ||
    req.query.organization_id ||
    (req.body && (req.body.school_id || req.body.schoolId || req.body.organization_id)) ||
    req.headers['x-school-id'] ||
    req.headers['x-organization-id'];

  const normalizedRequestedId = typeof requestedSchoolId === 'string' ? requestedSchoolId.trim() : undefined;
  const userSchoolId = user.school_id || user.organization_id;

  if (normalizedRequestedId) {
    if (!isSuperUser && userSchoolId && normalizedRequestedId !== userSchoolId) {
      res.status(403).json({
        error: 'forbidden',
        message: 'Tenant access denied: school scope mismatch. You cannot access another school\'s data.',
      });
      return;
    }
    req.school_id = normalizedRequestedId;
    req.organization_id = normalizedRequestedId;
  } else {
    // If request didn't specify school_id, auto-scope to the requesting user's own school
    if (!userSchoolId && !isSuperUser) {
      res.status(403).json({
        error: 'forbidden',
        message: 'Tenant access denied: user has no assigned school scope.',
      });
      return;
    }

    if (userSchoolId) {
      req.school_id = userSchoolId;
      req.organization_id = userSchoolId;
      if (req.query) {
        req.query.school_id = userSchoolId;
        req.query.organization_id = userSchoolId;
      }
      if (req.body && typeof req.body === 'object') {
        req.body.school_id = userSchoolId;
        req.body.organization_id = userSchoolId;
      }
    }
  }

  next();
}
