export interface CompressedImageResult {
  dataUrl: string;
  originalSize: number;
  compressedSize: number;
  originalWidth: number;
  originalHeight: number;
  compressedWidth: number;
  compressedHeight: number;
  fileName: string;
}

/**
 * Resizes an image file in the browser using an HTML5 Canvas
 * so its longest dimension is at most 3072px with JPEG quality 0.92.
 * This preserves sharp vertical resolution across multi-system sheet music pages.
 */
export async function compressSheetMusicImage(file: File): Promise<CompressedImageResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error('Failed to read image file.'));

    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to decode image.'));
      img.onload = () => {
        const MAX_DIM = 2800;
        let { width, height } = img;
        const origWidth = width;
        const origHeight = height;

        if (width > MAX_DIM || height > MAX_DIM) {
          if (width >= height) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          } else {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return reject(new Error('Canvas 2D context is not available.'));
        }

        // Draw white background in case source has transparency
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

        // Approximate size of base64 in bytes: (length * 3/4) - padding
        const base64Data = dataUrl.split(',')[1] || '';
        const compressedSize = Math.round((base64Data.length * 3) / 4);

        resolve({
          dataUrl,
          originalSize: file.size,
          compressedSize,
          originalWidth: origWidth,
          originalHeight: origHeight,
          compressedWidth: width,
          compressedHeight: height,
          fileName: file.name,
        });
      };

      img.src = reader.result as string;
    };

    reader.readAsDataURL(file);
  });
}

export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}
