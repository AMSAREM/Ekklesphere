// src/server/mediaProxy.ts
// SSRF-hardened external image proxy with sharp WebP/JPEG compression,
// responsive resizing (?w=...), bounded LRU caching, concurrent request coalescing,
// ETag conditional validation, and actionable diagnostics for private links.

import { createHash } from 'crypto';
import dns from 'dns/promises';
import net from 'net';
import { extractGoogleDriveFileId } from '../utils/imageUrl.ts';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB upstream limit
const FETCH_TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 4;

// Bounded LRU cache for compressed image responses (fast reloads & zero redundant upstream fetches)
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour fresh cache
const MAX_CACHE_ENTRIES = 160;
const MAX_CACHE_TOTAL_BYTES = 32 * 1024 * 1024; // 32 MB RAM cap

export interface ProxiedImageResult {
  buffer: Buffer;
  contentType: string;
  etag: string;
  cacheHit: boolean;
}

export interface MediaProxyOptions {
  /** Maximum target width/height bounding box in px (clamped 64..1600, default 1000). */
  width?: number;
  /** Output compression quality 40..90 (default 78). */
  quality?: number;
  /** Request Accept header for WebP negotiation. */
  acceptHeader?: string;
}

interface CachedImageEntry {
  buffer: Buffer;
  contentType: string;
  etag: string;
  cachedAt: number;
}

const imageCache = new Map<string, CachedImageEntry>();
let imageCacheBytes = 0;
const inFlightRequests = new Map<string, Promise<Omit<ProxiedImageResult, 'cacheHit'>>>();

let sharpLoaderPromise: Promise<any | null> | null = null;
async function getSharp(): Promise<any | null> {
  if (!sharpLoaderPromise) {
    sharpLoaderPromise = import('sharp')
      .then((mod) => mod.default || mod)
      .catch(() => null);
  }
  return sharpLoaderPromise;
}

export function clearMediaProxyCache(): void {
  imageCache.clear();
  imageCacheBytes = 0;
  inFlightRequests.clear();
}

export function getMediaProxyCacheStats(): { entries: number; bytes: number } {
  return { entries: imageCache.size, bytes: imageCacheBytes };
}

function getCachedEntry(key: string): CachedImageEntry | null {
  const existing = imageCache.get(key);
  if (!existing) return null;
  if (Date.now() - existing.cachedAt > CACHE_TTL_MS) {
    imageCache.delete(key);
    imageCacheBytes = Math.max(0, imageCacheBytes - existing.buffer.byteLength);
    return null;
  }
  // Refresh LRU recency
  imageCache.delete(key);
  imageCache.set(key, existing);
  return existing;
}

function setCachedEntry(key: string, entry: CachedImageEntry): void {
  if (entry.buffer.byteLength > MAX_CACHE_TOTAL_BYTES / 2) {
    return;
  }
  const existing = imageCache.get(key);
  if (existing) {
    imageCache.delete(key);
    imageCacheBytes = Math.max(0, imageCacheBytes - existing.buffer.byteLength);
  }
  while (
    imageCache.size >= MAX_CACHE_ENTRIES ||
    imageCacheBytes + entry.buffer.byteLength > MAX_CACHE_TOTAL_BYTES
  ) {
    const oldestKey = imageCache.keys().next().value;
    if (!oldestKey) break;
    const oldest = imageCache.get(oldestKey);
    imageCache.delete(oldestKey);
    if (oldest) {
      imageCacheBytes = Math.max(0, imageCacheBytes - oldest.buffer.byteLength);
    }
  }
  imageCache.set(key, entry);
  imageCacheBytes += entry.buffer.byteLength;
}

export class MediaProxyError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function isPrivateOrReservedIpv4(ip: string): boolean {
  const parts = ip.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b, c] = parts;

  if (a === 0) return true; // 0.0.0.0/8 ("this" network)
  if (a === 10) return true; // 10.0.0.0/8 (RFC1918)
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT)
  if (a === 127) return true; // 127.0.0.0/8 (loopback)
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local & cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 (RFC1918)
  if (a === 192 && b === 0 && c === 0) return true; // 192.0.0.0/24
  if (a === 192 && b === 0 && c === 2) return true; // 192.0.2.0/24 TEST-NET-1
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 (RFC1918)
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmarking
  if (a === 198 && b === 51 && c === 100) return true; // 198.51.100.0/24 TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true; // 203.0.113.0/24 TEST-NET-3
  if (a >= 224) return true; // Multicast & reserved (>= 224.0.0.0)

  return false;
}

export function isPrivateOrReservedIp(rawIp: string): boolean {
  const trimmed = rawIp.trim().replace(/^\[|\]$/g, '').split('%')[0].toLowerCase();
  const ipVersion = net.isIP(trimmed);
  if (ipVersion === 4) {
    return isPrivateOrReservedIpv4(trimmed);
  }
  if (ipVersion !== 6) {
    return true;
  }

  if (trimmed === '::' || trimmed === '::1') {
    return true;
  }

  // IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1 or ::ffff:7f00:1)
  if (trimmed.startsWith('::ffff:')) {
    const rest = trimmed.slice('::ffff:'.length);
    if (net.isIPv4(rest)) {
      return isPrivateOrReservedIpv4(rest);
    }
    const hexParts = rest.split(':');
    if (hexParts.length === 2) {
      const hi = parseInt(hexParts[0], 16);
      const lo = parseInt(hexParts[1], 16);
      if (!Number.isNaN(hi) && !Number.isNaN(lo)) {
        const ipv4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
        return isPrivateOrReservedIpv4(ipv4);
      }
    }
    return true;
  }

  const firstHextet = parseInt(trimmed.split(':')[0] || '0', 16);
  if (Number.isNaN(firstHextet)) return true;

  // fc00::/7 (Unique Local Addresses)
  if ((firstHextet & 0xfe00) === 0xfc00) return true;
  // fe80::/10 (Link-Local)
  if ((firstHextet & 0xffc0) === 0xfe80) return true;
  // ff00::/8 (Multicast)
  if ((firstHextet & 0xff00) === 0xff00) return true;

  return false;
}

function isBlockedHostname(hostname: string): boolean {
  const lower = hostname.trim().replace(/\.$/, '').toLowerCase();
  if (!lower) return true;
  if (
    lower === 'localhost' ||
    lower.endsWith('.localhost') ||
    lower.endsWith('.local') ||
    lower.endsWith('.internal') ||
    lower.endsWith('.arpa') ||
    lower === 'metadata' ||
    lower === 'metadata.google.internal'
  ) {
    return true;
  }
  // Single-label hostnames without dots (e.g. "redis", "postgres", "backend") are internal service names
  if (!net.isIP(lower) && !lower.includes('.')) {
    return true;
  }
  return false;
}

/**
 * Validates that a target URL uses http(s), has no embedded credentials,
 * does not target a blocked internal hostname, and resolves only to public IP addresses.
 */
export async function assertSafeExternalUrl(rawUrl: string): Promise<URL> {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    throw new MediaProxyError(400, 'invalid_image_url', 'Image url query parameter is required.');
  }
  if (rawUrl.length > 2048) {
    throw new MediaProxyError(400, 'invalid_image_url', 'Image URL is too long.');
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new MediaProxyError(400, 'invalid_image_url', 'Provided image URL is malformed.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new MediaProxyError(
      400,
      'invalid_image_protocol',
      'Only http:// and https:// image URLs are supported.'
    );
  }

  if (parsed.username || parsed.password) {
    throw new MediaProxyError(403, 'ssrf_blocked', 'Embedded credentials in URLs are not allowed.');
  }

  const hostWithoutBrackets = parsed.hostname.replace(/^\[|\]$/g, '');
  if (isBlockedHostname(hostWithoutBrackets)) {
    throw new MediaProxyError(403, 'ssrf_blocked', 'Private or internal hostnames are blocked.');
  }

  if (net.isIP(hostWithoutBrackets)) {
    if (isPrivateOrReservedIp(hostWithoutBrackets)) {
      throw new MediaProxyError(403, 'ssrf_blocked', 'Private or loopback IP addresses are blocked.');
    }
    return parsed;
  }

  let resolvedAddresses: Array<{ address: string; family: number }>;
  try {
    resolvedAddresses = await dns.lookup(hostWithoutBrackets, { all: true });
  } catch {
    throw new MediaProxyError(
      422,
      'image_host_unreachable',
      `Could not resolve image host "${hostWithoutBrackets}". Check that the domain is spelled correctly.`
    );
  }

  if (!resolvedAddresses || resolvedAddresses.length === 0) {
    throw new MediaProxyError(
      422,
      'image_host_unreachable',
      `No DNS records found for image host "${hostWithoutBrackets}".`
    );
  }

  for (const entry of resolvedAddresses) {
    if (isPrivateOrReservedIp(entry.address)) {
      throw new MediaProxyError(
        403,
        'ssrf_blocked',
        'Image URL resolves to a private or reserved network address.'
      );
    }
  }

  return parsed;
}

function sniffImageMimeType(bytes: Uint8Array): string | null {
  if (bytes.length < 4) return null;
  // PNG: 89 50 4E 47
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png';
  }
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  // GIF: 47 49 46 38
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return 'image/gif';
  }
  // WebP: RIFF....WEBP
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

function buildUpstreamCandidates(initialUrl: URL, width: number): string[] {
  const driveId = extractGoogleDriveFileId(initialUrl.toString());
  if (driveId) {
    const encoded = encodeURIComponent(driveId);
    const boundedW = Math.max(120, Math.min(1200, width));
    // Prefer lightweight Drive thumbnail/lh3 CDN first before full /uc download
    return [
      `https://drive.google.com/thumbnail?id=${encoded}&sz=w${boundedW}`,
      `https://lh3.googleusercontent.com/d/${encoded}=w${boundedW}`,
      `https://drive.google.com/uc?export=download&id=${encoded}`,
    ];
  }

  if (initialUrl.hostname.toLowerCase().includes('dropbox.com')) {
    const copy = new URL(initialUrl.toString());
    copy.searchParams.delete('dl');
    copy.searchParams.set('raw', '1');
    return [copy.toString()];
  }

  return [initialUrl.toString()];
}

async function fetchWithSafeRedirects(targetUrl: string): Promise<globalThis.Response> {
  let currentUrl = targetUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertSafeExternalUrl(currentUrl);

    const response = await fetch(currentUrl, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; EkklesphereMediaProxy/1.0)',
        Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*,*/*;q=0.8',
      },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        throw new MediaProxyError(
          422,
          'image_redirect_error',
          'Remote image host returned an empty redirect.'
        );
      }
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    return response;
  }

  throw new MediaProxyError(
    422,
    'too_many_redirects',
    'Image URL exceeded the maximum number of redirects.'
  );
}

async function readBoundedBuffer(response: globalThis.Response): Promise<Buffer> {
  const declaredLength = Number(response.headers.get('content-length') || '0');
  if (Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_BYTES) {
    throw new MediaProxyError(
      413,
      'image_too_large',
      'Remote image exceeds the 5 MB preview limit.'
    );
  }

  if (!response.body) {
    const arrayBuf = await response.arrayBuffer();
    if (arrayBuf.byteLength > MAX_IMAGE_BYTES) {
      throw new MediaProxyError(
        413,
        'image_too_large',
        'Remote image exceeds the 5 MB preview limit.'
      );
    }
    return Buffer.from(arrayBuf);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > MAX_IMAGE_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new MediaProxyError(
          413,
          'image_too_large',
          'Remote image exceeds the 5 MB preview limit.'
        );
      }
      chunks.push(value);
    }
  }

  return Buffer.concat(chunks.map((c) => Buffer.from(c)), total);
}

function formatDiagnosticError(
  isGoogleDrive: boolean,
  status: number,
  rawContentType: string
): MediaProxyError {
  const ctLower = rawContentType.toLowerCase();

  if (status === 401 || status === 403) {
    if (isGoogleDrive) {
      return new MediaProxyError(
        422,
        'google_drive_private',
        "Google Drive denied public access to this image. Open the file in Google Drive -> Share -> change General access to 'Anyone with the link'."
      );
    }
    return new MediaProxyError(
      422,
      'remote_access_denied',
      `Remote host denied access (HTTP ${status}). Verify that the image URL is publicly accessible without signing in.`
    );
  }

  if (status >= 400) {
    return new MediaProxyError(
      422,
      'remote_http_error',
      `Remote host returned HTTP ${status} for this image URL.`
    );
  }

  if (ctLower.includes('text/html') || ctLower.includes('application/xhtml')) {
    if (isGoogleDrive) {
      return new MediaProxyError(
        422,
        'google_drive_html',
        "Google Drive returned a sign-in or preview page instead of an image. Open the file in Google Drive -> Share -> set General access to 'Anyone with the link'."
      );
    }
    return new MediaProxyError(
      422,
      'non_image_html',
      'The URL returned a webpage (HTML) instead of an image file. Paste a direct image link (JPG, PNG, or WebP).'
    );
  }

  return new MediaProxyError(
    422,
    'non_image_content',
    `Remote URL did not return an image (received ${rawContentType || 'unknown content type'}).`
  );
}

/**
 * Compresses & resizes raster images using sharp (WebP preferred when browser accepts it).
 * Preserves vector SVGs and small GIFs untouched.
 */
export async function optimizeProxiedImageBuffer(
  buffer: Buffer,
  contentType: string,
  options: { width: number; quality: number; preferWebp: boolean }
): Promise<{ buffer: Buffer; contentType: string }> {
  const lowerCt = contentType.toLowerCase();
  if (lowerCt.includes('svg') || (lowerCt.includes('gif') && buffer.byteLength < 180 * 1024)) {
    return { buffer, contentType };
  }

  const sharp = await getSharp();
  if (!sharp) {
    return { buffer, contentType };
  }

  try {
    let pipeline = sharp(buffer, { failOn: 'none' }).rotate().resize({
      width: options.width,
      height: options.width,
      fit: 'inside',
      withoutEnlargement: true,
    });

    let outBuffer: Buffer;
    let outContentType: string;

    if (options.preferWebp) {
      outBuffer = await pipeline.webp({ quality: options.quality, effort: 4 }).toBuffer();
      outContentType = 'image/webp';
    } else {
      outBuffer = await pipeline.jpeg({ quality: options.quality, mozjpeg: true }).toBuffer();
      outContentType = 'image/jpeg';
    }

    // Only keep re-encoded output if it is valid and didn't balloon a tiny pre-compressed file
    if (outBuffer.byteLength > 0 && (outBuffer.byteLength < buffer.byteLength || buffer.byteLength > 32 * 1024)) {
      return { buffer: outBuffer, contentType: outContentType };
    }
    return { buffer, contentType };
  } catch {
    return { buffer, contentType };
  }
}

function computeEtag(buffer: Buffer): string {
  const hash = createHash('sha1').update(buffer).digest('hex').slice(0, 20);
  return `"${hash}"`;
}

export async function proxyExternalImage(
  rawUrl: string,
  options: MediaProxyOptions = {}
): Promise<ProxiedImageResult> {
  const parsed = await assertSafeExternalUrl(rawUrl);

  const width = Math.max(64, Math.min(1600, Math.round(options.width || 1000)));
  const quality = Math.max(40, Math.min(90, Math.round(options.quality || 78)));
  const preferWebp =
    typeof options.acceptHeader === 'string'
      ? options.acceptHeader.toLowerCase().includes('image/webp')
      : true;
  const formatKey = preferWebp ? 'webp' : 'jpeg';

  // Normalize Drive cache key by fileId so /thumbnail?w=240 and /file/d/... share the cache entry
  const driveId = extractGoogleDriveFileId(parsed.toString());
  const canonicalKey = driveId ? `gdrive:${driveId}` : parsed.toString();
  const cacheKey = `${canonicalKey}::w=${width}::q=${quality}::fmt=${formatKey}`;

  const cached = getCachedEntry(cacheKey);
  if (cached) {
    return {
      buffer: cached.buffer,
      contentType: cached.contentType,
      etag: cached.etag,
      cacheHit: true,
    };
  }

  const existingInFlight = inFlightRequests.get(cacheKey);
  if (existingInFlight) {
    const shared = await existingInFlight;
    return { ...shared, cacheHit: true };
  }

  const workPromise = (async (): Promise<Omit<ProxiedImageResult, 'cacheHit'>> => {
    const isGoogleDrive = Boolean(driveId);
    const candidates = buildUpstreamCandidates(parsed, width);
    let lastError: MediaProxyError | null = null;

    for (const candidate of candidates) {
      try {
        const response = await fetchWithSafeRedirects(candidate);
        const rawContentType = (response.headers.get('content-type') || '').split(';')[0].trim();

        if (!response.ok) {
          lastError = formatDiagnosticError(isGoogleDrive, response.status, rawContentType);
          continue;
        }

        const rawBuffer = await readBoundedBuffer(response);
        if (rawBuffer.byteLength === 0) {
          lastError = new MediaProxyError(422, 'empty_image', 'Remote host returned an empty file.');
          continue;
        }

        let resolvedContentType = rawContentType.toLowerCase();
        if (!resolvedContentType.startsWith('image/')) {
          const sniffed = sniffImageMimeType(rawBuffer);
          if (sniffed && (!resolvedContentType || resolvedContentType === 'application/octet-stream')) {
            resolvedContentType = sniffed;
          } else {
            lastError = formatDiagnosticError(isGoogleDrive, response.status, rawContentType);
            continue;
          }
        }

        const optimized = await optimizeProxiedImageBuffer(rawBuffer, resolvedContentType, {
          width,
          quality,
          preferWebp,
        });

        const etag = computeEtag(optimized.buffer);
        setCachedEntry(cacheKey, {
          buffer: optimized.buffer,
          contentType: optimized.contentType,
          etag,
          cachedAt: Date.now(),
        });

        return {
          buffer: optimized.buffer,
          contentType: optimized.contentType,
          etag,
        };
      } catch (err: any) {
        if (err instanceof MediaProxyError) {
          if (
            err.code === 'ssrf_blocked' ||
            err.code === 'invalid_image_url' ||
            err.code === 'invalid_image_protocol'
          ) {
            throw err;
          }
          lastError = err;
        } else {
          lastError = new MediaProxyError(
            422,
            'upstream_fetch_failed',
            err?.name === 'TimeoutError'
              ? 'Timed out waiting for the remote image host to respond.'
              : 'Could not download image from the remote host.'
          );
        }
      }
    }

    throw (
      lastError ||
      new MediaProxyError(422, 'image_proxy_failed', 'Unable to load image from the provided URL.')
    );
  })();

  inFlightRequests.set(cacheKey, workPromise);
  try {
    const result = await workPromise;
    return { ...result, cacheHit: false };
  } finally {
    inFlightRequests.delete(cacheKey);
  }
}
