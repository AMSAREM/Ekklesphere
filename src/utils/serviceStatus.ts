import type { ServiceInstance } from '../types/ekklesphere';

export type BinaryServiceStatus = 'live' | 'closed';

export type CheckInEligibilityReason =
  | 'ELIGIBLE'
  | 'NO_SERVICE_SCHEDULED'
  | 'SERVICE_CLOSED'
  | 'SERVICE_CANCELLED';

export interface ServiceCheckInEligibility {
  eligible: boolean;
  reasonCode: CheckInEligibilityReason;
  service: ServiceInstance | null;
  message: string;
}

export function isPlaceholderServiceId(serviceId?: string | null): boolean {
  const clean = String(serviceId || '').trim().toLowerCase();
  return !clean || clean === 'svc-live-main' || clean === 'svc-sun-1';
}

export function evaluateServiceCheckInEligibility(
  services: ServiceInstance[],
  targetServiceId?: string | null,
  fallbackService?: ServiceInstance | null,
  options?: { nowMs?: number; defaultAllowanceMinutes?: number }
): ServiceCheckInEligibility {
  if (!Array.isArray(services) || services.length === 0) {
    return {
      eligible: false,
      reasonCode: 'NO_SERVICE_SCHEDULED',
      service: null,
      message:
        'No service is scheduled. Please schedule a service before checking in members.',
    };
  }

  let matched: ServiceInstance | null = null;
  if (typeof targetServiceId === 'string' && targetServiceId.trim()) {
    const cleanId = targetServiceId.trim();
    if (isPlaceholderServiceId(cleanId)) {
      return {
        eligible: false,
        reasonCode: 'NO_SERVICE_SCHEDULED',
        service: null,
        message:
          'No service is scheduled. Please schedule a service before checking in members.',
      };
    }
    matched = services.find((s) => s.id === cleanId) || null;
  } else if (fallbackService && !isPlaceholderServiceId(fallbackService.id)) {
    matched = services.find((s) => s.id === fallbackService.id) || null;
  } else {
    matched = services[0] || null;
  }

  if (!matched) {
    return {
      eligible: false,
      reasonCode: 'NO_SERVICE_SCHEDULED',
      service: null,
      message:
        'Selected service is not scheduled. Please schedule or select an active service first.',
    };
  }

  if (matched.status === 'cancelled') {
    return {
      eligible: false,
      reasonCode: 'SERVICE_CANCELLED',
      service: matched,
      message: `"${matched.name}" has been cancelled and cannot accept check-ins.`,
    };
  }

  if (matched.status === 'closed') {
    return {
      eligible: false,
      reasonCode: 'SERVICE_CLOSED',
      service: matched,
      message: `Check-in is closed for "${matched.name}". Reopen or schedule a live service within its active window first.`,
    };
  }

  const allowanceMinutes =
    matched.dwellMinutes ?? options?.defaultAllowanceMinutes ?? 0;
  const binaryStatus = computeServiceBinaryStatus({
    date: matched.date,
    startsAt: matched.startsAt,
    endsAt: matched.endsAt,
    startTimeIso: matched.startTimeIso,
    endTimeIso: matched.endTimeIso,
    allowanceMinutes,
    rawStatus: 'active',
    nowMs: options?.nowMs,
  });

  if (binaryStatus !== 'live') {
    return {
      eligible: false,
      reasonCode: 'SERVICE_CLOSED',
      service: matched,
      message: `Check-in is closed for "${matched.name}". Reopen or schedule a live service within its active window first.`,
    };
  }

  return {
    eligible: true,
    reasonCode: 'ELIGIBLE',
    service: matched,
    message: `Check-in open for "${matched.name}".`,
  };
}

export interface ServiceWindowInput {
  date?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  startTimeIso?: string | null;
  endTimeIso?: string | null;
  allowanceMinutes?: number | null;
  rawStatus?: string | null;
  nowMs?: number;
}

export interface ResolvedServiceWindow {
  status: BinaryServiceStatus;
  startMs: number | null;
  endMs: number | null;
  effectiveEndMs: number | null;
  allowanceMinutes: number;
  closesAtIso: string | null;
}

function parseClockMinutes(clock?: string | null, fallbackHours = 8, fallbackMinutes = 0): { h: number; m: number } {
  if (typeof clock === 'string') {
    const match = clock.trim().match(/^(\d{1,2}):(\d{2})/);
    if (match) {
      return {
        h: Math.min(23, Math.max(0, Number(match[1]) || 0)),
        m: Math.min(59, Math.max(0, Number(match[2]) || 0)),
      };
    }
  }
  return { h: fallbackHours, m: fallbackMinutes };
}

function buildLocalDateMs(dateStr?: string | null, clock?: string | null, fallbackHours = 8, fallbackMinutes = 0): number | null {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) return null;
  const [y, m, d] = dateStr.trim().split('-').map(Number);
  const { h, m: min } = parseClockMinutes(clock, fallbackHours, fallbackMinutes);
  const dt = new Date(y, m - 1, d, h, min, 0, 0);
  const ms = dt.getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Evaluates a service's status strictly as 'live' or 'closed' based on the
 * scheduled time window and configured allowance duration (in minutes).
 *
 * - Manual close/cancel always resolves to 'closed'.
 * - Otherwise, the service is 'live' strictly when:
 *     startMs <= nowMs <= endMs + allowanceMinutes * 60_000
 *   and 'closed' outside that window.
 */
export function resolveServiceWindow(input: ServiceWindowInput): ResolvedServiceWindow {
  const nowMs = typeof input.nowMs === 'number' && Number.isFinite(input.nowMs) ? input.nowMs : Date.now();
  const allowanceMinutes = Math.max(0, Number(input.allowanceMinutes ?? 0) || 0);
  const allowanceMs = allowanceMinutes * 60_000;

  let startMs: number | null = null;
  if (typeof input.startTimeIso === 'string' && input.startTimeIso.trim()) {
    const parsed = Date.parse(input.startTimeIso);
    if (!Number.isNaN(parsed)) startMs = parsed;
  }
  if (startMs === null) {
    startMs = buildLocalDateMs(input.date, input.startsAt, 8, 0);
  }

  let endMs: number | null = null;
  if (typeof input.endTimeIso === 'string' && input.endTimeIso.trim()) {
    const parsed = Date.parse(input.endTimeIso);
    if (!Number.isNaN(parsed)) endMs = parsed;
  }
  if (endMs === null) {
    endMs = buildLocalDateMs(input.date, input.endsAt, 10, 30);
  }

  if (startMs !== null && endMs !== null && endMs <= startMs) {
    endMs += 24 * 60 * 60 * 1000;
  }

  const effectiveEndMs = endMs !== null ? endMs + allowanceMs : null;
  const closesAtIso = effectiveEndMs !== null ? new Date(effectiveEndMs).toISOString() : null;

  const raw = String(input.rawStatus || '').trim().toLowerCase();
  if (raw === 'closed' || raw === 'completed' || raw === 'cancelled') {
    return {
      status: 'closed',
      startMs,
      endMs,
      effectiveEndMs,
      allowanceMinutes,
      closesAtIso,
    };
  }

  if (startMs !== null && effectiveEndMs !== null) {
    const isLive = nowMs >= startMs && nowMs <= effectiveEndMs;
    return {
      status: isLive ? 'live' : 'closed',
      startMs,
      endMs,
      effectiveEndMs,
      allowanceMinutes,
      closesAtIso,
    };
  }

  return {
    status: raw === 'active' || raw === 'open' || raw === 'live' ? 'live' : 'closed',
    startMs,
    endMs,
    effectiveEndMs,
    allowanceMinutes,
    closesAtIso,
  };
}

export function computeServiceBinaryStatus(input: ServiceWindowInput): BinaryServiceStatus {
  return resolveServiceWindow(input).status;
}

export function formatAllowanceDeadline(closesAtIso?: string | null): string | null {
  if (!closesAtIso) return null;
  const dt = new Date(closesAtIso);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
