import type { ServiceInstance } from '../types/ekklesphere';

export interface ParsedServiceQrPayload {
  serviceId: string;
  token?: string;
  orgId?: string;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function formatServiceShortCode(serviceId?: string | null): string {
  const clean = String(serviceId || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (!clean) return 'SVC-000000';
  return `SVC-${clean.slice(0, 8)}`;
}

export function buildServiceQrCheckInPath(params: {
  serviceId: string;
  qrToken: string;
  organizationId?: string | null;
}): string {
  const sp = new URLSearchParams();
  sp.set('checkin', 'service');
  sp.set('serviceId', params.serviceId);
  if (params.organizationId) {
    sp.set('orgId', params.organizationId);
  }
  if (params.qrToken) {
    sp.set('token', params.qrToken);
  }
  return `/app?${sp.toString()}`;
}

export function buildServiceQrCheckInUrl(params: {
  origin?: string;
  serviceId: string;
  qrToken: string;
  organizationId?: string | null;
}): string {
  const path = buildServiceQrCheckInPath(params);
  const baseOrigin = (
    params.origin ||
    (typeof window !== 'undefined' ? window.location.origin : '')
  )
    .trim()
    .replace(/\/+$/, '');
  return baseOrigin ? `${baseOrigin}${path}` : path;
}

/**
 * Parses a scanned or pasted Service Check-in QR string.
 * Supports:
 * 1) Full HTTP/HTTPS URL or relative path: https://.../app?checkin=service&serviceId=<id>&token=<sig>&orgId=<org>
 * 2) Custom URI: ekklesphere://service/<id>?token=<sig> or ekklesphere://checkin?serviceId=<id>&token=<sig>
 * 3) Colon-delimited token: EKKLESPHERE:SERVICE:<serviceId>:<token>[:orgId]
 * 4) JSON payload: {"type":"service_checkin","serviceId":"...","token":"..."}
 * 5) Raw UUID / Short Code (`SVC-XXXXXXXX`) matching a known scheduled service
 */
export function parseServiceQrPayload(
  rawText: string,
  knownServices: Pick<ServiceInstance, 'id'>[] = []
): ParsedServiceQrPayload | null {
  const trimmed = String(rawText || '').trim();
  if (!trimmed) return null;

  // 1. JSON format
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const svcId = String(parsed.serviceId ?? parsed.eventId ?? '').trim();
      const token = parsed.token ?? parsed.qrToken;
      const orgId = parsed.orgId ?? parsed.organizationId;
      if (svcId) {
        return {
          serviceId: svcId,
          token: typeof token === 'string' && token.trim() ? token.trim() : undefined,
          orgId: typeof orgId === 'string' && orgId.trim() ? orgId.trim() : undefined,
        };
      }
    } catch {
      // ignore invalid JSON
    }
  }

  // 2. Colon-delimited format: EKKLESPHERE:SERVICE:<serviceId>:<token>[:orgId]
  const upper = trimmed.toUpperCase();
  if (upper.startsWith('EKKLESPHERE:SERVICE:')) {
    const parts = trimmed.split(':');
    const svcId = (parts[2] || '').trim();
    const token = (parts[3] || '').trim() || undefined;
    const orgId = (parts[4] || '').trim() || undefined;
    if (svcId) {
      return { serviceId: svcId, token, orgId };
    }
  }

  // 3. URL / relative path / custom scheme
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('/app') ||
    trimmed.startsWith('?') ||
    trimmed.toLowerCase().startsWith('ekklesphere://')
  ) {
    try {
      const normalizedForUrl = trimmed.startsWith('?')
        ? `https://ekklesphere.local/app${trimmed}`
        : trimmed.startsWith('/')
        ? `https://ekklesphere.local${trimmed}`
        : trimmed;
      const url = new URL(normalizedForUrl);
      const sp = url.searchParams;
      const queryServiceId = (
        sp.get('serviceId') ||
        sp.get('eventId') ||
        sp.get('service') ||
        ''
      ).trim();
      const token = (sp.get('token') || sp.get('qrToken') || '').trim() || undefined;
      const orgId = (sp.get('orgId') || sp.get('organizationId') || '').trim() || undefined;

      if (queryServiceId) {
        return { serviceId: queryServiceId, token, orgId };
      }

      if (url.protocol.toLowerCase() === 'ekklesphere:' && url.host.toLowerCase() === 'service') {
        const pathId = url.pathname.replace(/^\/+/, '').split('/')[0]?.trim();
        if (pathId) {
          return { serviceId: pathId, token, orgId };
        }
      }
    } catch {
      // fall through
    }
  }

  // 4. Short code: SVC-XXXXXXXX matching a known service
  const shortMatch = upper.match(/^SVC-([A-Z0-9]{6,12})$/);
  if (shortMatch && knownServices.length > 0) {
    const prefix = shortMatch[1];
    const matched = knownServices.find((s) =>
      s.id.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().startsWith(prefix)
    );
    if (matched) {
      return { serviceId: matched.id };
    }
  }

  // 5. Raw UUID matching known service (or valid UUID if no member match)
  if (UUID_PATTERN.test(trimmed)) {
    if (knownServices.length === 0 || knownServices.some((s) => s.id.toLowerCase() === trimmed.toLowerCase())) {
      return { serviceId: trimmed };
    }
  }

  return null;
}
