/**
 * Utility functions for getting video dimensions
 */

export interface VideoDimensions {
  width: number;
  height: number;
}

/**
 * Get video dimensions from a video file or URL
 */
export async function getVideoDimensions(
  src: string | File
): Promise<VideoDimensions> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    let objectUrl: string | null = null;

    video.onloadedmetadata = () => {
      // Only revoke URLs we created ourselves (from File objects)
      if (objectUrl) {
        window.URL.revokeObjectURL(objectUrl);
      }
      resolve({
        width: video.videoWidth,
        height: video.videoHeight,
      });
    };

    video.onerror = () => {
      // Only revoke URLs we created ourselves (from File objects)
      if (objectUrl) {
        window.URL.revokeObjectURL(objectUrl);
      }
      reject(new Error('Failed to load video metadata'));
    };

    if (src instanceof File) {
      objectUrl = URL.createObjectURL(src);
      video.src = objectUrl;
    } else {
      // Don't revoke existing blob URLs - they might be in use elsewhere
      video.src = src;
    }
  });
}

/**
 * Get video duration from a video file or URL
 */
export async function getVideoDuration(
  src: string | File
): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    let objectUrl: string | null = null;

    video.onloadedmetadata = () => {
      const duration = video.duration;
      // Only revoke URLs we created ourselves (from File objects)
      if (objectUrl) {
        window.URL.revokeObjectURL(objectUrl);
      }
      if (isFinite(duration) && duration > 0) {
        resolve(duration);
      } else {
        reject(new Error('Invalid video duration'));
      }
    };

    video.onerror = () => {
      // Only revoke URLs we created ourselves (from File objects)
      if (objectUrl) {
        window.URL.revokeObjectURL(objectUrl);
      }
      reject(new Error('Failed to load video metadata'));
    };

    if (src instanceof File) {
      objectUrl = URL.createObjectURL(src);
      video.src = objectUrl;
    } else {
      // Don't revoke existing blob URLs - they might be in use elsewhere
      video.src = src;
    }
  });
}

/**
 * Get audio duration from an audio file or URL
 */
export async function getAudioDuration(
  src: string | File
): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = document.createElement('audio');
    audio.preload = 'metadata';
    let objectUrl: string | null = null;

    audio.onloadedmetadata = () => {
      const duration = audio.duration;
      // Only revoke URLs we created ourselves (from File objects)
      if (objectUrl) {
        window.URL.revokeObjectURL(objectUrl);
      }
      if (isFinite(duration) && duration > 0) {
        resolve(duration);
      } else {
        reject(new Error('Invalid audio duration'));
      }
    };

    audio.onerror = () => {
      // Only revoke URLs we created ourselves (from File objects)
      if (objectUrl) {
        window.URL.revokeObjectURL(objectUrl);
      }
      reject(new Error('Failed to load audio metadata'));
    };

    if (src instanceof File) {
      objectUrl = URL.createObjectURL(src);
      audio.src = objectUrl;
    } else {
      // Don't revoke existing blob URLs - they might be in use elsewhere
      audio.src = src;
    }
  });
}

/**
 * Calculate dimensions and position for a video to fit within a 9:16 canvas
 * Canvas is 1080x1920 (9:16 portrait)
 */
export interface VideoFitResult {
  width: number;
  height: number;
  x: number;
  y: number;
  scale: number;
}

export function calculateVideoFit(
  originalWidth: number,
  originalHeight: number,
  aspectRatioFit: 'original' | '1:1' | 'cover' | '16:9' = 'original',
  zoom: number = 1.0
): VideoFitResult {
  const CANVAS_WIDTH = 1080;
  const CANVAS_HEIGHT = 1920;

  let targetWidth: number;
  let targetHeight: number;

  if (aspectRatioFit === 'cover') {
    // Cover/Fill: container is full canvas, video fills with objectFit:cover
    // The CSS objectFit:cover handles the actual scaling, so we just need canvas dimensions
    // Apply zoom by scaling the container (which will scale the video proportionally)
    targetWidth = CANVAS_WIDTH * zoom;
    targetHeight = CANVAS_HEIGHT * zoom;
  } else if (aspectRatioFit === '1:1') {
    // 1:1 square: fit square within canvas, centered
    const maxSize = Math.min(CANVAS_WIDTH, CANVAS_HEIGHT) * zoom;
    targetWidth = maxSize;
    targetHeight = maxSize;
  } else if (aspectRatioFit === '16:9') {
    // 16:9 Fit: create a 16:9 letterbox viewport with black bars
    // This fits a 16:9 rectangle within the 9:16 canvas
    const targetAspect = 16 / 9;
    // Fit by width (since 16:9 is wider than 9:16)
    targetWidth = CANVAS_WIDTH * zoom;
    targetHeight = targetWidth / targetAspect;
    // If somehow taller than canvas, constrain by height
    if (targetHeight > CANVAS_HEIGHT * zoom) {
      targetHeight = CANVAS_HEIGHT * zoom;
      targetWidth = targetHeight * targetAspect;
    }
  } else {
    // Original: maintain original aspect ratio, fit within canvas
    const originalAspect = originalWidth / originalHeight;
    // Try fitting by width first for landscape videos
    targetWidth = CANVAS_WIDTH * zoom;
    targetHeight = targetWidth / originalAspect;
    // If too tall, fit by height
    if (targetHeight > CANVAS_HEIGHT * zoom) {
      targetHeight = CANVAS_HEIGHT * zoom;
      targetWidth = targetHeight * originalAspect;
    }
  }

  // Center the video
  const x = (CANVAS_WIDTH - targetWidth) / 2;
  const y = (CANVAS_HEIGHT - targetHeight) / 2;

  return {
    width: targetWidth,
    height: targetHeight,
    x,
    y,
    scale: zoom,
  };
}

