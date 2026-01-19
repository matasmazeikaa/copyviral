/**
 * Storage constants for file uploads
 * Used for both client-side and server-side validation
 */

// Maximum file size per upload: 1GB
export const MAX_FILE_SIZE_BYTES = 1 * 1024 * 1024 * 1024; // 1GB in bytes
export const MAX_FILE_SIZE_GB = 1;
export const MAX_FILE_SIZE_DISPLAY = '1GB';

// Storage limits per subscription tier
export const STORAGE_LIMITS = {
  free: 5 * 1024 * 1024 * 1024, // 5GB
  pro: 100 * 1024 * 1024 * 1024, // 100GB
} as const;

// Allowed file types - VIDEO and AUDIO only (no images)
export const ALLOWED_MIME_TYPES = [
  // Video formats
  'video/mp4',
  'video/webm',
  'video/quicktime', // .mov
  'video/x-msvideo', // .avi
  'video/x-matroska', // .mkv
  'video/ogg',
  'video/3gpp',
  'video/3gpp2',
  // Audio formats
  'audio/mpeg', // .mp3
  'audio/wav',
  'audio/ogg',
  'audio/aac',
  'audio/flac',
  'audio/x-m4a', // .m4a
  'audio/mp4', // .m4a
  'audio/webm',
] as const;

// Allowed file extensions (for accept attribute)
export const ALLOWED_EXTENSIONS = [
  // Video
  '.mp4',
  '.webm',
  '.mov',
  '.avi',
  '.mkv',
  '.ogv',
  '.3gp',
  // Audio
  '.mp3',
  '.wav',
  '.ogg',
  '.aac',
  '.flac',
  '.m4a',
] as const;

// Accept attribute string for file input (video and audio only)
export const ACCEPT_MEDIA_TYPES = 'video/*,audio/*';

/**
 * Check if a file type is allowed (video or audio only)
 * @param mimeType - The MIME type to check
 * @returns true if the file type is allowed
 */
export function isAllowedFileType(mimeType: string): boolean {
  // Check for exact match in allowed types
  if (ALLOWED_MIME_TYPES.includes(mimeType as any)) {
    return true;
  }
  
  // Also check for generic video/* or audio/* patterns
  return mimeType.startsWith('video/') || mimeType.startsWith('audio/');
}

/**
 * Check if a file size is within the allowed limit
 * @param sizeInBytes - File size in bytes
 * @returns true if the file size is allowed
 */
export function isAllowedFileSize(sizeInBytes: number): boolean {
  return sizeInBytes > 0 && sizeInBytes <= MAX_FILE_SIZE_BYTES;
}

/**
 * Get a human-readable file type description
 * @param mimeType - The MIME type
 * @returns 'video', 'audio', or 'unknown'
 */
export function getFileTypeCategory(mimeType: string): 'video' | 'audio' | 'unknown' {
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'unknown';
}

/**
 * Validate a file for upload
 * @param file - The file to validate
 * @returns An object with validation result and error message if invalid
 */
export function validateFileForUpload(file: File): { valid: boolean; error?: string } {
  // Check file size
  if (file.size > MAX_FILE_SIZE_BYTES) {
    const fileSizeGB = (file.size / (1024 * 1024 * 1024)).toFixed(2);
    return {
      valid: false,
      error: `File "${file.name}" exceeds the ${MAX_FILE_SIZE_DISPLAY} limit (${fileSizeGB}GB). Please choose a smaller file.`,
    };
  }

  // Check file type
  if (!isAllowedFileType(file.type)) {
    return {
      valid: false,
      error: `File "${file.name}" is not allowed. Only video and audio files are supported.`,
    };
  }

  return { valid: true };
}

/**
 * Validate multiple files for upload
 * @param files - Array of files to validate
 * @returns An object with validation result and error messages for invalid files
 */
export function validateFilesForUpload(files: File[]): { 
  valid: boolean; 
  validFiles: File[]; 
  errors: string[] 
} {
  const validFiles: File[] = [];
  const errors: string[] = [];

  for (const file of files) {
    const result = validateFileForUpload(file);
    if (result.valid) {
      validFiles.push(file);
    } else if (result.error) {
      errors.push(result.error);
    }
  }

  return {
    valid: errors.length === 0,
    validFiles,
    errors,
  };
}
