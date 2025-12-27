/**
 * Hook for uploading cover images to R2.
 *
 * Features:
 * - Client-side image resizing before upload
 * - Uses @convex-dev/r2 component for uploads
 */

import { useUploadFile } from "@convex-dev/r2/react";
import { api } from "../../convex/_generated/api";

const MAX_COVER_WIDTH = 400;
const MAX_COVER_HEIGHT = 600;
const IMAGE_QUALITY = 0.85;

/** Safari's canvas.toBlob hangs on image/webp despite MDN saying it should fallback to PNG */
const isSafari = typeof navigator !== "undefined" && /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

/** Convert dataURL to File */
function dataUrlToFile(dataUrl: string, filename: string, mimeType: string): File {
  const arr = dataUrl.split(",");
  const bstr = atob(arr[1]);
  const u8arr = new Uint8Array(bstr.length);
  for (let i = 0; i < bstr.length; i++) {
    u8arr[i] = bstr.charCodeAt(i);
  }
  return new File([u8arr], filename, { type: mimeType });
}

/**
 * Resize an image file to fit within max dimensions.
 * Uses JPEG on Safari (toBlob hangs for webp), WebP elsewhere.
 */
async function resizeImage(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      // Calculate new dimensions maintaining aspect ratio
      let width = img.width;
      let height = img.height;

      if (width > MAX_COVER_WIDTH) {
        height = (height * MAX_COVER_WIDTH) / width;
        width = MAX_COVER_WIDTH;
      }

      if (height > MAX_COVER_HEIGHT) {
        width = (width * MAX_COVER_HEIGHT) / height;
        height = MAX_COVER_HEIGHT;
      }

      // Create canvas and resize
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Failed to get canvas context"));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      // Safari: use toDataURL (sync) with JPEG to avoid toBlob webp hang
      if (isSafari) {
        try {
          const dataUrl = canvas.toDataURL("image/jpeg", IMAGE_QUALITY);
          resolve(dataUrlToFile(dataUrl, "cover.jpg", "image/jpeg"));
        } catch (e) {
          reject(new Error("Failed to create image: " + String(e)));
        }
        return;
      }

      // Other browsers: use toBlob with WebP
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Failed to create blob"));
            return;
          }
          resolve(new File([blob], "cover.webp", { type: "image/webp" }));
        },
        "image/webp",
        IMAGE_QUALITY
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };

    img.src = url;
  });
}

/**
 * Hook for cover image uploads with automatic resizing.
 *
 * @returns Object with upload function and upload state
 */
export function useCoverUpload() {
  const uploadFile = useUploadFile(api.r2);

  /**
   * Upload a cover image after resizing.
   * @param file The image file to upload
   * @returns The R2 object key
   */
  async function uploadCover(file: File): Promise<string> {
    // Resize before upload
    const resizedFile = await resizeImage(file);

    // Upload using convex-dev/r2 hook
    const key = await uploadFile(resizedFile);

    return key;
  }

  return { uploadCover };
}

/**
 * Get the public URL for an R2 object.
 */
export function getR2PublicUrl(key: string): string {
  // R2_PUBLIC_URL is set to https://r2.nemu.pm
  return `https://r2.nemu.pm/${key}`;
}
