// src/utils/imageCompression.ts
// Fast client-side image resizing and WebP/JPEG adaptive compression for instant uploads & reloads.

export interface CompressImageOptions {
  /** Target square/max side length in pixels (default: 256). */
  maxDimension?: number;
  /** Target maximum data-URI string length in bytes/chars (default: 28000, ~21 KB binary). */
  maxDataUrlBytes?: number;
  /** Initial encoder quality 0..1 (default: 0.82). */
  initialQuality?: number;
  /** Center-crop into a 1:1 square avatar when true (default: true). */
  square?: boolean;
}

let cachedWebpSupport: boolean | null = null;

export function supportsWebpEncoding(): boolean {
  if (cachedWebpSupport !== null) return cachedWebpSupport;
  if (typeof document === 'undefined') {
    cachedWebpSupport = false;
    return false;
  }
  try {
    const testCanvas = document.createElement('canvas');
    testCanvas.width = 2;
    testCanvas.height = 2;
    const encoded = testCanvas.toDataURL('image/webp', 0.8);
    cachedWebpSupport = encoded.startsWith('data:image/webp');
  } catch {
    cachedWebpSupport = false;
  }
  return cachedWebpSupport;
}

function encodeCanvasUnderBudget(
  source: CanvasImageSource,
  srcWidth: number,
  srcHeight: number,
  options: Required<CompressImageOptions>
): string {
  const mimeType = supportsWebpEncoding() ? 'image/webp' : 'image/jpeg';
  const dimensionSteps = options.square
    ? [options.maxDimension, Math.max(128, Math.round(options.maxDimension * 0.75))]
    : [options.maxDimension];
  const qualitySteps = [
    options.initialQuality,
    Math.max(0.45, options.initialQuality - 0.12),
    Math.max(0.45, options.initialQuality - 0.24),
    0.45,
  ];

  let lastEncoded = '';

  for (const dim of dimensionSteps) {
    let targetW = dim;
    let targetH = dim;
    let sx = 0;
    let sy = 0;
    let sw = srcWidth;
    let sh = srcHeight;

    if (options.square) {
      const minSide = Math.min(srcWidth, srcHeight);
      sx = (srcWidth - minSide) / 2;
      sy = (srcHeight - minSide) / 2;
      sw = minSide;
      sh = minSide;
    } else {
      const scale = Math.min(1, dim / Math.max(srcWidth, srcHeight));
      targetW = Math.max(1, Math.round(srcWidth * scale));
      targetH = Math.max(1, Math.round(srcHeight * scale));
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D context is unavailable.');
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, targetW, targetH);

    for (const quality of qualitySteps) {
      lastEncoded = canvas.toDataURL(mimeType, quality);
      if (lastEncoded.length <= options.maxDataUrlBytes) {
        return lastEncoded;
      }
    }
  }

  return lastEncoded;
}

async function decodeWithImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Unable to decode selected image file.'));
    };
    img.src = objectUrl;
  });
}

/**
 * Decodes, resizes, and compresses a user-selected image file into a compact WebP (or JPEG) data URL.
 */
export async function compressImageFile(
  file: File,
  opts: CompressImageOptions = {}
): Promise<string> {
  const resolvedOpts: Required<CompressImageOptions> = {
    maxDimension: opts.maxDimension ?? 256,
    maxDataUrlBytes: opts.maxDataUrlBytes ?? 28000,
    initialQuality: opts.initialQuality ?? 0.82,
    square: opts.square ?? true,
  };

  if (typeof createImageBitmap === 'function') {
    let bitmap: ImageBitmap | null = null;
    try {
      bitmap = await createImageBitmap(file);
      return encodeCanvasUnderBudget(bitmap, bitmap.width, bitmap.height, resolvedOpts);
    } catch {
      // Fall back to <img> element decode below (e.g., if createImageBitmap lacks codec support)
    } finally {
      bitmap?.close?.();
    }
  }

  const img = await decodeWithImageElement(file);
  return encodeCanvasUnderBudget(
    img,
    img.naturalWidth || img.width,
    img.naturalHeight || img.height,
    resolvedOpts
  );
}
