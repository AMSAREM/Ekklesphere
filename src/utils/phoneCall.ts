/**
 * Phone normalization and safe tel: URI helpers for direct contact calling.
 */

export function normalizeDialablePhone(raw?: string | null): string {
  const value = String(raw || '').trim();
  if (!value) return '';

  // Strip common formatting separators while preserving leading +
  const hasPlus = value.startsWith('+');
  const digits = value.replace(/\D/g, '');
  if (!digits || digits.length < 7) return '';

  if (hasPlus) {
    return `+${digits}`;
  }
  if (digits.startsWith('00') && digits.length > 9) {
    return `+${digits.slice(2)}`;
  }
  // Default local Ghana 10-digit numbers like 0241234567 -> +233241234567
  if (digits.startsWith('0') && digits.length === 10) {
    return `+233${digits.slice(1)}`;
  }
  if (digits.startsWith('233') && digits.length >= 12) {
    return `+${digits}`;
  }
  return `+${digits}`;
}

export function buildTelHref(raw?: string | null): string | null {
  const normalized = normalizeDialablePhone(raw);
  if (!normalized) return null;
  return `tel:${normalized}`;
}

export function formatPhoneForDisplay(raw?: string | null): string {
  const value = String(raw || '').trim();
  if (!value) return 'No phone number';
  const normalized = normalizeDialablePhone(value);
  return normalized || value;
}
