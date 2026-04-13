/**
 * Fallback image compression for base64-encoded images that exceed the API size limit.
 * Runs in Chrome Extension service worker context (no DOM — uses OffscreenCanvas + createImageBitmap).
 */

export const MAX_BASE64_CHARS = 1_398_100; // ~1 MB decoded, aligned with cdp.ts MAX_BASE64_CHARS
const MAX_DIMENSION = 1280;
const INITIAL_QUALITY = 0.8;
const QUALITY_STEP = 0.1;
const MIN_QUALITY = 0.2;
const FALLBACK_QUALITY = 0.1;

export async function compressBase64Image(
  base64: string,
  mediaType: string
): Promise<{ data: string; mediaType: string }> {
  if (base64.length <= MAX_BASE64_CHARS) {
    return { data: base64, mediaType };
  }

  try {
    const blob = base64ToBlob(base64, mediaType);
    const bitmap = await createImageBitmap(blob);

    let { width, height } = bitmap;
    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
      const scale = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return { data: base64, mediaType };
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    // Progressive JPEG quality reduction
    let quality = INITIAL_QUALITY;
    while (quality >= MIN_QUALITY) {
      const jpegBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
      const buffer = await jpegBlob.arrayBuffer();
      const compressed = uint8ArrayToBase64(new Uint8Array(buffer));
      if (compressed.length <= MAX_BASE64_CHARS) {
        return { data: compressed, mediaType: 'image/jpeg' };
      }
      quality -= QUALITY_STEP;
    }

    // Final fallback at minimum quality
    const finalBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: FALLBACK_QUALITY });
    const finalBuffer = await finalBlob.arrayBuffer();
    return {
      data: uint8ArrayToBase64(new Uint8Array(finalBuffer)),
      mediaType: 'image/jpeg'
    };
  } catch (e) {
    console.warn('[imageCompressor] Compression failed, returning original:', e);
    return { data: base64, mediaType };
  }
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteString = atob(base64);
  const bytes = new Uint8Array(byteString.length);
  for (let i = 0; i < byteString.length; i++) {
    bytes[i] = byteString.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
