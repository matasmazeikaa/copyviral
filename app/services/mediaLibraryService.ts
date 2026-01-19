'use client';

import { createClient } from '../utils/supabase/client';
import { LibraryItem, MediaType } from '../types';
import { categorizeFile } from '../utils/utils';
import { 
    MAX_FILE_SIZE_BYTES, 
    MAX_FILE_SIZE_DISPLAY,
    isAllowedFileType,
    getFileTypeCategory,
} from '../constants/storage';

const STORAGE_BUCKET = 'media-library';

/**
 * Get the user-specific folder path in Supabase storage
 */
function getUserFolderPath(userId: string): string {
    return `${userId}`;
}

/**
 * Construct the storage filename from fileId and original filename
 * Format: {fileId}--{base64EncodedOriginalName}.{ext}
 */
function constructStorageFileName(fileId: string, originalFileName: string): string {
    const fileExt = originalFileName.split('.').pop() || 'mp4';
    const originalNameWithoutExt = originalFileName.replace(/\.[^/.]+$/, '');
    const encodedName = btoa(encodeURIComponent(originalNameWithoutExt));
    return `${fileId}--${encodedName}.${fileExt}`;
}

/**
 * Upload a file to Supabase storage in the user's folder
 */
export async function uploadMediaFile(
    file: File,
    userId: string,
    onProgress?: (progress: number) => void
): Promise<LibraryItem> {
    const supabase = createClient();
    const userFolder = getUserFolderPath(userId);
    const fileId = crypto.randomUUID();
    const fileExt = file.name.split('.').pop() || 'mp4';
    const fileName = `${fileId}.${fileExt}`;
    const filePath = `${userFolder}/${fileName}`;

    // Check file size (1GB limit)
    if (file.size > MAX_FILE_SIZE_BYTES) {
        throw new Error(`File size exceeds ${MAX_FILE_SIZE_DISPLAY} limit. Current size: ${(file.size / 1024 / 1024 / 1024).toFixed(2)}GB`);
    }

    // Check file type (only video and audio allowed)
    if (!isAllowedFileType(file.type)) {
        throw new Error(`File type "${file.type}" is not allowed. Only video and audio files are supported.`);
    }

    // Create initial library item with uploading status
    const libraryItem: LibraryItem = {
        id: fileId,
        name: file.name,
        url: '',
        status: 'uploading',
        type: categorizeFile(file.type),
        size: file.size,
        createdAt: new Date().toISOString(),
    };

    try {
        // Upload file to Supabase storage
        const { data, error } = await supabase.storage
            .from(STORAGE_BUCKET)
            .upload(filePath, file, {
                cacheControl: '3600',
                upsert: false,
            });

        if (error) {
            throw error;
        }

        // Generate signed URL for private bucket (valid for 1 hour)
        const { data: signedUrlData, error: urlError } = await supabase.storage
            .from(STORAGE_BUCKET)
            .createSignedUrl(filePath, 3600); // 1 hour expiry

        if (urlError) {
            throw urlError;
        }

        libraryItem.url = signedUrlData.signedUrl;
        libraryItem.status = 'completed';

        return libraryItem;
    } catch (error: any) {
        libraryItem.status = 'error';
        console.error('Error uploading file:', error);
        throw new Error(error.message || 'Failed to upload file');
    }
}

/**
 * List all media files for a user from Supabase storage
 */
export async function listUserMediaFiles(userId: string): Promise<LibraryItem[]> {
    const supabase = createClient();
    const userFolder = getUserFolderPath(userId);

    try {
        const { data, error } = await supabase.storage
            .from(STORAGE_BUCKET)
            .list(userFolder, {
                limit: 100,
                offset: 0,
                sortBy: { column: 'created_at', order: 'desc' },
            });

        if (error) {
            throw error;
        }

        if (!data) {
            return [];
        }

        // Filter out placeholder files and hidden files
        const filteredData = data.filter(file => {
            // Skip hidden files (starting with .)
            if (file.name.startsWith('.')) return false;
            // Skip empty folder placeholder
            if (file.name === '.emptyFolderPlaceholder') return false;
            return true;
        });

        if (filteredData.length === 0) {
            return [];
        }

        // Get signed URLs for all files (for private bucket)
        const libraryItems: LibraryItem[] = await Promise.all(
            filteredData.map(async (file) => {
                const filePath = `${userFolder}/${file.name}`;
                
                // Generate signed URL for private bucket (valid for 1 hour)
                const { data: signedUrlData, error: urlError } = await supabase.storage
                    .from(STORAGE_BUCKET)
                    .createSignedUrl(filePath, 3600); // 1 hour expiry

                // Determine media type from file name/extension
                const fileExt = file.name.split('.').pop()?.toLowerCase() || '';
                let mediaType: MediaType = 'unknown';
                if (['mp4', 'webm', 'mov', 'avi'].includes(fileExt)) {
                    mediaType = 'video';
                } else if (['mp3', 'wav', 'ogg', 'm4a'].includes(fileExt)) {
                    mediaType = 'audio';
                } else if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(fileExt)) {
                    mediaType = 'image';
                }

                // Parse filename - new format: {fileId}--{encodedOriginalName}.{ext}
                // Old format: {fileId}.{ext}
                const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
                let fileId: string;
                let originalName: string;
                
                if (nameWithoutExt.includes('--')) {
                    // New format with encoded original name
                    const [id, encodedName] = nameWithoutExt.split('--');
                    fileId = id;
                    try {
                        originalName = decodeURIComponent(atob(encodedName)) + '.' + fileExt;
                    } catch {
                        originalName = file.name; // Fallback if decoding fails
                    }
                } else {
                    // Old format - just the fileId
                    fileId = nameWithoutExt;
                    originalName = file.metadata?.originalName || file.name;
                }

                return {
                    id: fileId,
                    name: originalName,
                    url: signedUrlData?.signedUrl || '',
                    status: urlError ? 'error' as const : 'completed',
                    type: mediaType,
                    size: file.metadata?.size || undefined,
                    createdAt: file.created_at || new Date().toISOString(),
                };
            })
        );

        return libraryItems;
    } catch (error: any) {
        console.error('Error listing media files:', error);
        return [];
    }
}

/**
 * Delete a media file from Supabase storage
 */
export async function deleteMediaFile(fileId: string, userId: string, fileName: string): Promise<void> {
    const supabase = createClient();
    const userFolder = getUserFolderPath(userId);
    
    // Try new format first, then fallback to old format
    const newFormatFileName = constructStorageFileName(fileId, fileName);
    const fileExt = fileName.split('.').pop() || 'mp4';
    const oldFormatFileName = `${fileId}.${fileExt}`;

    try {
        // Try deleting with new format
        let { error } = await supabase.storage
            .from(STORAGE_BUCKET)
            .remove([`${userFolder}/${newFormatFileName}`]);

        // If new format fails, try old format
        if (error) {
            const result = await supabase.storage
                .from(STORAGE_BUCKET)
                .remove([`${userFolder}/${oldFormatFileName}`]);
            error = result.error;
        }

        if (error) {
            throw error;
        }
    } catch (error: any) {
        console.error('Error deleting file:', error);
        throw new Error(error.message || 'Failed to delete file');
    }
}

/**
 * Get a signed URL for a media file (for preview purposes)
 * Useful for refreshing expired signed URLs
 */
export async function getSignedUrl(fileId: string, userId: string, fileName: string): Promise<string> {
    const supabase = createClient();
    const userFolder = getUserFolderPath(userId);
    
    // Try new format first, then fallback to old format
    const newFormatFileName = constructStorageFileName(fileId, fileName);
    const fileExt = fileName.split('.').pop() || 'mp4';
    const oldFormatFileName = `${fileId}.${fileExt}`;

    // Try new format
    let { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(`${userFolder}/${newFormatFileName}`, 3600);

    // If new format fails, try old format
    if (error || !data) {
        const result = await supabase.storage
            .from(STORAGE_BUCKET)
            .createSignedUrl(`${userFolder}/${oldFormatFileName}`, 3600);
        data = result.data;
        error = result.error;
    }

    if (error) {
        throw error;
    }

    if (!data) {
        throw new Error('Failed to generate signed URL');
    }

    return data.signedUrl;
}

/**
 * Download a media file from Supabase storage as a File object
 * Uses Supabase storage download for private buckets
 */
export async function downloadMediaFile(libraryItem: LibraryItem, userId: string): Promise<File> {
    const supabase = createClient();
    const userFolder = getUserFolderPath(userId);
    
    // Try new format first, then fallback to old format
    const newFormatFileName = constructStorageFileName(libraryItem.id, libraryItem.name);
    const fileExt = libraryItem.name.split('.').pop() || 'mp4';
    const oldFormatFileName = `${libraryItem.id}.${fileExt}`;

    try {
        // Try downloading with new format
        let { data, error } = await supabase.storage
            .from(STORAGE_BUCKET)
            .download(`${userFolder}/${newFormatFileName}`);

        // If new format fails, try old format
        if (error || !data) {
            const result = await supabase.storage
                .from(STORAGE_BUCKET)
                .download(`${userFolder}/${oldFormatFileName}`);
            data = result.data;
            error = result.error;
        }

        if (error) {
            throw error;
        }

        if (!data) {
            throw new Error('No data received from download');
        }

        // Convert blob to File object
        const file = new File([data], libraryItem.name, { type: data.type });
        return file;
    } catch (error: any) {
        console.error('Error downloading file:', error);
        throw new Error(error.message || 'Failed to download file');
    }
}

/**
 * Download a media file from Supabase storage using file ID and original filename
 * This is used for fallback when IndexedDB is cleared
 * @param supabaseFileId - The file ID in Supabase (format: {fileId}.{ext})
 * @param originalFileName - The original filename (used to determine file type)
 * @param userId - The user ID
 */
export async function downloadMediaFileById(
    supabaseFileId: string,
    originalFileName: string,
    userId: string
): Promise<File> {
    const supabase = createClient();
    const userFolder = getUserFolderPath(userId);
    
    // The file is stored as {fileId}.{ext} in the user's folder
    // supabaseFileId already contains the extension
    const filePath = `${userFolder}/${supabaseFileId}`;

    try {
        // Download file from Supabase storage
        const { data, error } = await supabase.storage
            .from(STORAGE_BUCKET)
            .download(filePath);

        if (error) {
            throw error;
        }

        if (!data) {
            throw new Error('No data received from download');
        }

        // Convert blob to File object
        const file = new File([data], originalFileName, { type: data.type });
        return file;
    } catch (error: any) {
        console.error('Error downloading file by ID:', error);
        throw new Error(error.message || 'Failed to download file from Supabase');
    }
}

export interface StorageUsageInfo {
    usedBytes: number;
    fileCount: number;
}

/**
 * Get the total storage usage for a user
 * Returns the total size of all files in bytes and the file count
 */
export async function getUserStorageUsage(userId: string): Promise<StorageUsageInfo> {
    const supabase = createClient();
    const userFolder = getUserFolderPath(userId);

    try {
        const { data, error } = await supabase.storage
            .from(STORAGE_BUCKET)
            .list(userFolder, {
                limit: 1000, // High limit to get all files
                offset: 0,
            });

        if (error) {
            throw error;
        }

        if (!data || data.length === 0) {
            return { usedBytes: 0, fileCount: 0 };
        }

        // Filter out placeholder files and hidden files
        const filteredData = data.filter(file => !file.name.startsWith('.'));

        // Calculate total size from file metadata
        let totalBytes = 0;
        for (const file of filteredData) {
            // File metadata contains the size
            if (file.metadata?.size) {
                totalBytes += file.metadata.size;
            }
        }

        return {
            usedBytes: totalBytes,
            fileCount: filteredData.length,
        };
    } catch (error: any) {
        console.error('Error getting storage usage:', error);
        return { usedBytes: 0, fileCount: 0 };
    }
}
