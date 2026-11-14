// src/utils/imageUrl.ts
// Normalizes and resolves member, ministry, event, and church image URLs
// (including Google Drive share links, Dropbox share links, protocol-less URLs,
// size-tuned responsive thumbnails, sticky working-URL caching, and server-side proxy fallback).

export type ImageSizeHint = 'thumb' | 'card' | 'full';

const SIZE_HINT_WIDTH: Record<ImageSizeHint, number> = {
  thumb: 240,
  card: 640,
  full: 1000,
};

const MAX_WORKING_CACHE_ENTRIES = 500;
const workingImageUrlCache = new Map<string, string>();

function stripWrappingQuotes(raw: string): string {
  const trimmed = raw.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

/**
 * Normalizes a raw user-provided or DB-stored image string into a safe URL/URI string.
 * Rejects dangerous schemes like javascript: or data:text/html.
 */
export function normalizeRawImageUrl(raw?: string | null): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = stripWrappingQuotes(raw);
  if (!cleaned) return null;

  const lower = cleaned.toLowerCase();
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('vbscript:') ||
    lower.startsWith('data:text/')
  ) {
    return null;
  }

  if (
    lower.startsWith('data:image/') ||
    lower.startsWith('blob:') ||
    lower.startsWith('http://') ||
    lower.startsWith('https://') ||
    cleaned.startsWith('/')
  ) {
    return cleaned;
  }

  if (cleaned.startsWith('//')) {
    return `https:${cleaned}`;
  }

  // Handle domain paths pasted without scheme (e.g. drive.google.com/..., www.example.com/a.jpg)
  if (/^[a-z0-9.-]+\.[a-z]{2,}(?:[/:?#]|$)/i.test(cleaned)) {
    return `https://${cleaned}`;
  }

  return cleaned;
}

/**
 * Extracts a Google Drive file ID from common Google Drive / Docs share URL formats.
 */
export function extractGoogleDriveFileId(urlStr: string): string | null {
  try {
    const parsed = new URL(urlStr);
    const host = parsed.hostname.toLowerCase();
    if (
      !host.includes('drive.google.com') &&
      !host.includes('docs.google.com') &&
      !host.includes('lh3.googleusercontent.com')
    ) {
      return null;
    }

    const filePathMatch = parsed.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (filePathMatch?.[1]) return filePathMatch[1];

    const ucPathMatch = parsed.pathname.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (ucPathMatch?.[1]) return ucPathMatch[1];

    const idParam = parsed.searchParams.get('id');
    if (idParam && /^[a-zA-Z0-9_-]+$/.test(idParam)) {
      return idParam;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Resolves a stored image URL into a browser-renderable <img> src.
 * - Converts Google Drive share/open/uc links into size-appropriate thumbnail URLs.
 * - Converts Dropbox ?dl=0 share links into ?raw=1 direct image streams.
 */
export function resolveDisplayImageUrl(
  raw?: string | null,
  sizeHint: ImageSizeHint = 'full'
): string | null {
  const normalized = normalizeRawImageUrl(raw);
  if (!normalized) return null;

  const lower = normalized.toLowerCase();
  if (lower.startsWith('data:image/') || lower.startsWith('blob:') || normalized.startsWith('/')) {
    return normalized;
  }

  const targetWidth = SIZE_HINT_WIDTH[sizeHint] ?? SIZE_HINT_WIDTH.full;
  const driveId = extractGoogleDriveFileId(normalized);
  if (driveId) {
    return `https://drive.google.com/thumbnail?id=${encodeURIComponent(driveId)}&sz=w${targetWidth}`;
  }

  try {
    const parsed = new URL(normalized);
    const host = parsed.hostname.toLowerCase();

    // Dropbox share URLs render an HTML preview page unless raw=1 is set
    if (host.includes('dropbox.com')) {
      parsed.searchParams.delete('dl');
      parsed.searchParams.set('raw', '1');
      return parsed.toString();
    }

    return parsed.toString();
  } catch {
    return normalized;
  }
}

/**
 * Builds the first-party SSRF-guarded & image-optimizing proxy URL for an external http(s) image URL.
 */
export function getImageProxyUrl(
  raw?: string | null,
  sizeHint: ImageSizeHint = 'full'
): string | null {
  const normalized = normalizeRawImageUrl(raw);
  if (!normalized) return null;
  if (normalized.startsWith('/api/media/proxy')) {
    return normalized;
  }
  if (!/^https?:\/\//i.test(normalized)) {
    return null;
  }
  const targetWidth = SIZE_HINT_WIDTH[sizeHint] ?? SIZE_HINT_WIDTH.full;
  const target = resolveDisplayImageUrl(normalized, sizeHint) || normalized;
  return `/api/media/proxy?url=${encodeURIComponent(target)}&w=${targetWidth}`;
}

/**
 * Remembers the candidate URL that loaded successfully so subsequent renders/re-mounts
 * skip failing mirrors immediately without extra network errors.
 */
export function rememberWorkingImageUrl(
  raw: string | null | undefined,
  sizeHint: ImageSizeHint,
  workingUrl: string
): void {
  const normalized = normalizeRawImageUrl(raw);
  if (!normalized || !workingUrl) return;
  const key = `${normalized}::${sizeHint}`;
  if (workingImageUrlCache.has(key)) {
    workingImageUrlCache.delete(key);
  } else if (workingImageUrlCache.size >= MAX_WORKING_CACHE_ENTRIES) {
    const oldest = workingImageUrlCache.keys().next().value;
    if (oldest) workingImageUrlCache.delete(oldest);
  }
  workingImageUrlCache.set(key, workingUrl);
}

/**
 * Clears the client working-URL cache (intended for unit tests).
 */
export function clearWorkingImageUrlCache(): void {
  workingImageUrlCache.clear();
}

/**
 * Returns an ordered, deduplicated list of candidate <img> src URLs to try sequentially
 * on `onError`, automatically prioritizing any previously proven working URL, then
 * direct/Google Drive size-optimized mirrors and compressed `/api/media/proxy`.
 */
export function getImageFallbackUrls(
  raw?: string | null,
  sizeHint: ImageSizeHint = 'full'
): string[] {
  const normalized = normalizeRawImageUrl(raw);
  if (!normalized) return [];

  const lower = normalized.toLowerCase();
  if (lower.startsWith('data:image/') || lower.startsWith('blob:') || normalized.startsWith('/')) {
    return [normalized];
  }

  const targetWidth = SIZE_HINT_WIDTH[sizeHint] ?? SIZE_HINT_WIDTH.full;
  const candidates: string[] = [];
  const pushUnique = (value?: string | null) => {
    if (value && !candidates.includes(value)) {
      candidates.push(value);
    }
  };

  // Prioritize any candidate previously confirmed to load cleanly for this source & size tier
  const remembered = workingImageUrlCache.get(`${normalized}::${sizeHint}`);
  if (remembered) {
    pushUnique(remembered);
  }

  const driveId = extractGoogleDriveFileId(normalized);
  if (driveId) {
    pushUnique(`https://drive.google.com/thumbnail?id=${encodeURIComponent(driveId)}&sz=w${targetWidth}`);
    pushUnique(`https://lh3.googleusercontent.com/d/${encodeURIComponent(driveId)}=w${targetWidth}`);
    pushUnique(`/api/media/proxy?url=${encodeURIComponent(normalized)}&w=${targetWidth}`);
    return candidates;
  }

  pushUnique(resolveDisplayImageUrl(normalized, sizeHint));
  pushUnique(getImageProxyUrl(normalized, sizeHint));

  return candidates;
}

/**
 * Returns a safe http(s) URL suitable for opening in a new browser tab, or null for data/local URIs.
 */
export function getExternalImageOpenUrl(raw?: string | null): string | null {
  const normalized = normalizeRawImageUrl(raw);
  if (!normalized) return null;
  if (/^https?:\/\//i.test(normalized)) {
    return normalized;
  }
  return null;
}

/**
 * Queries `/api/media/proxy` to retrieve a human-readable reason why an external URL
 * could not be displayed as an image (for example, a private Google Drive file).
 */
export async function probeImageProxyDiagnostic(raw?: string | null): Promise<string | null> {
  const proxyUrl = getImageProxyUrl(raw, 'thumb');
  if (!proxyUrl) return null;

  try {
    const response = await fetch(proxyUrl);
    if (response.ok) {
      return null;
    }
    const data = (await response.json().catch(() => null)) as { message?: string } | null;
    if (data?.message) {
      return data.message;
    }
    return `Remote host returned HTTP ${response.status} when loading this image.`;
  } catch {
    return 'Network error while verifying this image URL.';
  }
}
