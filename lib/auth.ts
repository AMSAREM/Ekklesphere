// lib/auth.ts - Ekklesphere Church Management Authentication & RBAC Engine
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

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
  campus_id?: string;
  name?: string;
  iat?: number;
  exp?: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUserPayload;
      tenant_id?: string;
      campus_id?: string;
    }
  }
}

/**
 * Returns JWT secret from environment, with a safe fallback for Ekklesphere.
 */
export function getJwtSecret(): string {
  return process.env.JWT_SECRET || 'ekklesphere-church-proximity-jwt-secret-2026';
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
 */
export function verifyToken(token: string): AuthUserPayload {
  const secret = getJwtSecret();
  return jwt.verify(token, secret) as AuthUserPayload;
}

/**
 * Express middleware requiring a valid authenticated user session.
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
    if (decoded.tenant_id) req.tenant_id = decoded.tenant_id;
    if (decoded.campus_id) req.campus_id = decoded.campus_id;
    next();
  } catch (err: any) {
    res.status(401).json({
      error: 'unauthorized',
      message: err.name === 'TokenExpiredError' ? 'Token has expired' : 'Invalid token signature',
    });
  }
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

    // Platform super administrators have master management access
    if (role === 'super_admin' || role === 'creator') {
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

/**
 * Checks whether a given role has staff-level access.
 */
export function isStaffRole(role?: ChurchRole): boolean {
  if (!role) return false;
  return ['super_admin', 'creator', 'admin', 'pastor', 'usher', 'finance'].includes(role);
}

/**
 * Role permission checks for granular access control.
 */
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

/**
 * Tenant / Campus scope middleware for Ekklesphere multi-campus church setups.
 */
export function requireCampusScope(req: Request, _res: Response, next: NextFunction): void {
  const requestedCampusId =
    req.params.campusId ||
    req.params.campus_id ||
    req.query.campus_id ||
    req.query.campusId ||
    (req.body && (req.body.campus_id || req.body.campusId)) ||
    req.headers['x-campus-id'] ||
    req.headers['x-tenant-id'];

  if (typeof requestedCampusId === 'string' && requestedCampusId.trim()) {
    req.campus_id = requestedCampusId.trim();
  }

  next();
}
