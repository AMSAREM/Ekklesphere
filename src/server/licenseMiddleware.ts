// src/server/licenseMiddleware.ts
// Phase 2 License Enforcement Middleware for Ekklesphere Tenant Routes.
// Fails CLOSED when an organisation has no license, is revoked/suspended, or is past its 7-day expiry grace window.

import type { Request, Response, NextFunction } from 'express';
import { isCreatorClaim, PRIMARY_ORGANIZATION_ID } from '../../lib/auth.ts';
import { platformStore } from './platformStore.ts';

export async function requireActiveLicense(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.user) {
    res.status(401).json({
      error: 'unauthorized',
      message: 'Authentication required before evaluating organisation license.',
    });
    return;
  }

  const orgId = (req.organizationId || req.tenant_id || '').toLowerCase();

  // Platform creators operating in read-only support-grant mode or platform mode may inspect state
  if (isCreatorClaim(req.user)) {
    if (orgId) {
      const evalForCreator = await platformStore.evaluateOrganizationLicense(orgId);
      res.setHeader('x-license-status', evalForCreator.status);
      if (evalForCreator.tier) {
        res.setHeader('x-license-tier', evalForCreator.tier);
      }
    }
    next();
    return;
  }

  if (!orgId) {
    res.status(403).json({
      error: 'unassigned_organization',
      code: 'NO_ORGANIZATION_FOUND',
      message: 'No active church organization associated with this session.',
    });
    return;
  }

  const evaluation = await platformStore.evaluateOrganizationLicense(orgId);
  res.setHeader('x-license-status', evaluation.status);
  if (evaluation.tier) {
    res.setHeader('x-license-tier', evaluation.tier);
  }
  if (evaluation.inGracePeriod && evaluation.graceDaysRemaining !== null) {
    res.setHeader('x-license-grace-days', String(evaluation.graceDaysRemaining));
  }

  if (!evaluation.allowed) {
    res.status(evaluation.httpStatus).json({
      error: 'license_enforcement_blocked',
      code: evaluation.code,
      status: evaluation.status,
      message: evaluation.message,
      evaluation,
    });
    return;
  }

  next();
}
