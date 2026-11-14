// tests/image-url.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import dns from 'dns/promises';
import sharp from 'sharp';
import { app } from '../server';
import {
  normalizeRawImageUrl,
  resolveDisplayImageUrl,
  getExternalImageOpenUrl,
  getImageFallbackUrls,
  getImageProxyUrl,
  rememberWorkingImageUrl,
  clearWorkingImageUrlCache,
} from '../src/utils/imageUrl';
import {
  clearMediaProxyCache,
  getMediaProxyCacheStats,
  isPrivateOrReservedIp,
  optimizeProxiedImageBuffer,
} from '../src/server/mediaProxy';

describe('Image URL Normalization, Compression & Fast Caching', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearWorkingImageUrlCache();
    clearMediaProxyCache();
  });

  it('converts Google Drive file/open/uc share URLs into size-appropriate thumbnail URLs', () => {
    expect(
      resolveDisplayImageUrl('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/view?usp=sharing')
    ).toBe('https://drive.google.com/thumbnail?id=1AbCdEfGhIjKlMnOpQrStUvWxYz&sz=w1000');

    expect(
      resolveDisplayImageUrl('https://drive.google.com/open?id=1AbCdEfGhIjKlMnOpQrStUvWxYz', 'thumb')
    ).toBe('https://drive.google.com/thumbnail?id=1AbCdEfGhIjKlMnOpQrStUvWxYz&sz=w240');

    expect(
      resolveDisplayImageUrl('https://drive.google.com/uc?export=view&id=1AbCdEfGhIjKlMnOpQrStUvWxYz', 'card')
    ).toBe('https://drive.google.com/thumbnail?id=1AbCdEfGhIjKlMnOpQrStUvWxYz&sz=w640');
  });

  it('converts Dropbox ?dl=0 share URLs into ?raw=1 direct image streams', () => {
    const resolved = resolveDisplayImageUrl('https://www.dropbox.com/s/abc123/portrait.jpg?dl=0');
    expect(resolved).toBe('https://www.dropbox.com/s/abc123/portrait.jpg?raw=1');
  });

  it('normalizes quoted and protocol-less image URLs and preserves data/local URIs', () => {
    expect(normalizeRawImageUrl('  "cdn.example.org/members/ada.jpg"  ')).toBe(
      'https://cdn.example.org/members/ada.jpg'
    );
    expect(resolveDisplayImageUrl('data:image/jpeg;base64,/9j/4AAQ')).toBe(
      'data:image/jpeg;base64,/9j/4AAQ'
    );
    expect(resolveDisplayImageUrl('/assets/aistudio/image_2f5d9893.png')).toBe(
      '/assets/aistudio/image_2f5d9893.png'
    );
  });

  it('rejects dangerous schemes and exposes safe external open URLs only for http(s)', () => {
    expect(resolveDisplayImageUrl('javascript:alert(1)')).toBeNull();
    expect(resolveDisplayImageUrl('data:text/html,<script>alert(1)</script>')).toBeNull();

    expect(getExternalImageOpenUrl('data:image/png;base64,AAA')).toBeNull();
    expect(
      getExternalImageOpenUrl('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/view')
    ).toBe('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/view');
  });

  it('builds ordered fallback candidates with width hints and prioritizes remembered working URLs', () => {
    const driveUrl = 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/view?usp=sharing';
    expect(getImageFallbackUrls(driveUrl)).toEqual([
      'https://drive.google.com/thumbnail?id=1AbCdEfGhIjKlMnOpQrStUvWxYz&sz=w1000',
      'https://lh3.googleusercontent.com/d/1AbCdEfGhIjKlMnOpQrStUvWxYz=w1000',
      `/api/media/proxy?url=${encodeURIComponent(driveUrl)}&w=1000`,
    ]);

    const thumbProxy = `/api/media/proxy?url=${encodeURIComponent(driveUrl)}&w=240`;
    expect(getImageFallbackUrls(driveUrl, 'thumb')).toEqual([
      'https://drive.google.com/thumbnail?id=1AbCdEfGhIjKlMnOpQrStUvWxYz&sz=w240',
      'https://lh3.googleusercontent.com/d/1AbCdEfGhIjKlMnOpQrStUvWxYz=w240',
      thumbProxy,
    ]);

    // Remembering that the proxy succeeded moves it to index 0 on subsequent reloads/remounts
    rememberWorkingImageUrl(driveUrl, 'thumb', thumbProxy);
    expect(getImageFallbackUrls(driveUrl, 'thumb')[0]).toBe(thumbProxy);

    const externalHttpUrl = 'http://cdn.example.org/photos/member.jpg';
    expect(getImageFallbackUrls(externalHttpUrl, 'card')).toEqual([
      externalHttpUrl,
      `/api/media/proxy?url=${encodeURIComponent(externalHttpUrl)}&w=640`,
    ]);

    expect(getImageFallbackUrls('data:image/png;base64,iVBORw0KGgo')).toEqual([
      'data:image/png;base64,iVBORw0KGgo',
    ]);
    expect(getImageProxyUrl('data:image/png;base64,iVBORw0KGgo')).toBeNull();
  });

  it('detects private, loopback, link-local, and mapped IPv6 addresses cleanly', () => {
    expect(isPrivateOrReservedIp('127.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('10.12.34.56')).toBe(true);
    expect(isPrivateOrReservedIp('169.254.169.254')).toBe(true);
    expect(isPrivateOrReservedIp('192.168.1.50')).toBe(true);
    expect(isPrivateOrReservedIp('172.16.0.10')).toBe(true);
    expect(isPrivateOrReservedIp('::1')).toBe(true);
    expect(isPrivateOrReservedIp('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('fd00::1')).toBe(true);
    expect(isPrivateOrReservedIp('8.8.8.8')).toBe(false);
    expect(isPrivateOrReservedIp('151.101.1.69')).toBe(false);
  });

  it('enforces validation and SSRF blocks on GET /api/media/proxy', async () => {
    const missingRes = await request(app).get('/api/media/proxy');
    expect(missingRes.status).toBe(400);

    const badProtoRes = await request(app).get('/api/media/proxy').query({ url: 'javascript:alert(1)' });
    expect(badProtoRes.status).toBe(400);

    const ssrfTargets = [
      'http://127.0.0.1/secret.png',
      'http://localhost:3000/secret.png',
      'http://169.254.169.254/latest/meta-data/',
      'http://10.0.0.1/internal.jpg',
      'http://192.168.1.1/router.png',
      'http://[::1]/loopback.png',
    ];

    for (const target of ssrfTargets) {
      const res = await request(app).get('/api/media/proxy').query({ url: target });
      expect(res.status).toBe(403);
    }
  });

  it('compresses and resizes large raster buffers into compact WebP/JPEG via sharp', async () => {
    const largeRawPng = await sharp({
      create: {
        width: 1200,
        height: 1200,
        channels: 3,
        background: { r: 95, g: 120, b: 210 },
        noise: { type: 'gaussian', mean: 128, sigma: 30 },
      },
    })
      .png({ compressionLevel: 0 })
      .toBuffer();

    const optimized = await optimizeProxiedImageBuffer(largeRawPng, 'image/png', {
      width: 240,
      quality: 75,
      preferWebp: true,
    });

    expect(optimized.contentType).toBe('image/webp');
    expect(optimized.buffer.byteLength).toBeLessThan(largeRawPng.byteLength / 10);

    const meta = await sharp(optimized.buffer).metadata();
    expect(meta.width).toBe(240);
    expect(meta.height).toBe(240);
  });

  it('serves cached WebP images with ETag and 304 Not Modified on reloads without upstream refetch', async () => {
    const samplePng = await sharp({
      create: {
        width: 800,
        height: 800,
        channels: 3,
        background: { r: 109, g: 92, b: 242 },
        noise: { type: 'gaussian', mean: 110, sigma: 25 },
      },
    })
      .png({ compressionLevel: 0 })
      .toBuffer();

    vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as any);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(new Uint8Array(samplePng), {
        status: 200,
        headers: {
          'content-type': 'image/png',
          'content-length': String(samplePng.byteLength),
        },
      });
    });

    const firstRes = await request(app)
      .get('/api/media/proxy')
      .query({ url: 'https://cdn.example.org/avatars/pastor.png', w: '240' })
      .set('Accept', 'image/webp,image/png,*/*');

    expect(firstRes.status).toBe(200);
    expect(firstRes.headers['content-type']).toBe('image/webp');
    expect(firstRes.headers['cache-control']).toContain('max-age=3600');
    expect(firstRes.headers['etag']).toBeTruthy();
    expect(firstRes.body.length).toBeLessThan(samplePng.byteLength);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(getMediaProxyCacheStats().entries).toBe(1);

    // Second request hits in-memory LRU cache without touching upstream fetch
    const secondRes = await request(app)
      .get('/api/media/proxy')
      .query({ url: 'https://cdn.example.org/avatars/pastor.png', w: '240' })
      .set('Accept', 'image/webp,image/png,*/*');

    expect(secondRes.status).toBe(200);
    expect(secondRes.headers['etag']).toBe(firstRes.headers['etag']);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Conditional reload with If-None-Match returns 304 Not Modified immediately
    const revalRes = await request(app)
      .get('/api/media/proxy')
      .query({ url: 'https://cdn.example.org/avatars/pastor.png', w: '240' })
      .set('Accept', 'image/webp,image/png,*/*')
      .set('If-None-Match', firstRes.headers['etag']);

    expect(revalRes.status).toBe(304);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
