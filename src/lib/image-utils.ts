'use client';

const MAX_DIM = 1536;
const JPEG_QUALITY = 0.85;

export function isImage(f: File): boolean {
  return f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name);
}

export function isHeic(f: File): boolean {
  return /\.(heic|heif)$/i.test(f.name) || f.type === 'image/heic' || f.type === 'image/heif';
}

export async function resizeImage(
  file: File,
  maxDim = MAX_DIM
): Promise<{ data: string; mime: string }> {
  // HEIC can't be decoded in-browser — return raw base64
  if (isHeic(file)) {
    const raw = await fileToBase64(file);
    return { data: raw, mime: file.type || 'image/heic' };
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;

        // If already small, return JPEG conversion only
        if (width <= maxDim && height <= maxDim) {
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(img, 0, 0);
          const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
          resolve({
            data: dataUrl.split(',')[1],
            mime: 'image/jpeg',
          });
          return;
        }

        // Scale down
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
        resolve({
          data: dataUrl.split(',')[1],
          mime: 'image/jpeg',
        });
      };
      img.onerror = () => reject(new Error('Failed to decode image'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export function getImageDimensions(
  b64Data: string
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.width, height: img.height });
    img.onerror = () => reject(new Error('Cannot read dimensions'));
    img.src = `data:image/jpeg;base64,${b64Data}`;
  });
}
