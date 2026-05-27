/**
 * Compresses an image raw base64 data string by scaling down its resolution 
 * and converting it to compressed JPEG format.
 * 
 * @param base64Str - The original base64 raw string (e.g., from FileReader)
 * @param maxWidth - Maximum allowed width in pixels
 * @param maxHeight - Maximum allowed height in pixels
 * @param quality - Output JPEG quality from 0.0 to 1.0 (0.7 is ideal)
 * @returns Promise resolving to the compressed JPEG base64 DataURL
 */
export function compressBase64Image(
  base64Str: string,
  maxWidth = 800,
  maxHeight = 800,
  quality = 0.7
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      // Calculate new dimensions keeping the aspect ratio
      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        // Fallback to original is ctx could not be created
        resolve(base64Str);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      
      // Export to high-performance compressed jpeg
      const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
      resolve(compressedDataUrl);
    };

    img.onerror = (err) => {
      reject(err);
    };
  });
}
