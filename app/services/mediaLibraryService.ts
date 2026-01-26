'use client';

import { createClient } from '../utils/supabase/client';
import { LibraryItem, MediaType, MediaFolder } from '../types';
import { categorizeFile } from '../utils/utils';
import { extractThumbnail } from '../utils/extractThumbnail';
import { 
    MAX_FILE_SIZE_BYTES, 
    MAX_FILE_SIZE_DISPLAY,
    isAllowedFileType,
    getFileTypeCategory,
} from '../constants/storage';

const STORAGE_BUCKET = 'media-library';
const THUMBNAILS_FOLDER = 'thumbnails';

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
 * Construct the thumbnail filename for a given file ID
 */
function constructThumbnailFileName(fileId: string): string {
    return `${fileId}_thumb.jpg`;
}

/**
 * Upload a thumbnail for a video file
 * All thumbnails are stored in the root thumbnails folder for consistency
 * @param thumbnail - The thumbnail File object
 * @param userId - User ID
 * @param fileId - The ID of the video file this thumbnail belongs to
 * @param folder - Optional folder path (kept for API compatibility but not used for path)
 * @returns Signed URL for the thumbnail or null if upload failed
 */
export async function uploadVideoThumbnail(
    thumbnail: File,
    userId: string,
    fileId: string,
    folder?: string
): Promise<string | null> {
    const supabase = createClient();
    const userFolder = getUserFolderPath(userId);
    const thumbnailFileName = constructThumbnailFileName(fileId);
    
    // Always store thumbnails in the root thumbnails folder for consistency
    // This makes it easier to find thumbnails regardless of which folder the video is in
    const thumbnailPath = `${userFolder}/${THUMBNAILS_FOLDER}/${thumbnailFileName}`;

    try {
        const { error: uploadError } = await supabase.storage
            .from(STORAGE_BUCKET)
            .upload(thumbnailPath, thumbnail, {
                cacheControl: '86400', // Cache for 24 hours
                upsert: true, // Allow overwriting if re-uploading
            });

        if (uploadError) {
            console.error('Error uploading thumbnail:', uploadError);
            return null;
        }

        // Generate signed URL for the thumbnail
        const { data: signedUrlData, error: urlError } = await supabase.storage
            .from(STORAGE_BUCKET)
            .createSignedUrl(thumbnailPath, 3600);

        if (urlError || !signedUrlData) {
            console.error('Error generating thumbnail URL:', urlError);
            return null;
        }

        return signedUrlData.signedUrl;
    } catch (error) {
        console.error('Error in thumbnail upload:', error);
        return null;
    }
}

/**
 * Get the signed URL for a video's thumbnail
 * Tries nested folder path first, then falls back to root thumbnails folder
 * @returns Signed URL for the thumbnail or null if not found
 */
async function getThumbnailUrl(
    userId: string,
    fileId: string,
    folder?: string | null
): Promise<string | null> {
    const supabase = createClient();
    const userFolder = getUserFolderPath(userId);
    const thumbnailFileName = constructThumbnailFileName(fileId);
    
    // Build paths to check - nested folder path and root path
    const rootThumbnailPath = `${userFolder}/${THUMBNAILS_FOLDER}/${thumbnailFileName}`;
    const nestedThumbnailPath = folder 
        ? `${userFolder}/${folder}/${THUMBNAILS_FOLDER}/${thumbnailFileName}`
        : null;

    // Try root thumbnails folder first (most common case for existing files)
    try {
        const { data: signedUrlData, error } = await supabase.storage
            .from(STORAGE_BUCKET)
            .createSignedUrl(rootThumbnailPath, 3600);

        if (!error && signedUrlData) {
            return signedUrlData.signedUrl;
        }
    } catch (error) {
        // Continue to try nested path
    }

    // If folder is specified, also try the nested path
    if (nestedThumbnailPath) {
        try {
            const { data: signedUrlData, error } = await supabase.storage
                .from(STORAGE_BUCKET)
                .createSignedUrl(nestedThumbnailPath, 3600);

            if (!error && signedUrlData) {
                return signedUrlData.signedUrl;
            }
        } catch (error) {
            // Thumbnail not found in nested path either
        }
    }

    return null;
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

        // Filter out placeholder files, hidden files, folders, and system files
        const filteredData = data.filter(file => {
            // Skip hidden files (starting with .)
            if (file.name.startsWith('.')) return false;
            // Skip empty folder placeholder
            if (file.name === '.emptyFolderPlaceholder') return false;
            // Skip folders (in Supabase storage, folders have id === null)
            if (file.id === null) return false;
            // Skip thumbnail files
            if (file.name.includes('_thumb.')) return false;
            // Skip system folders that might appear as entries
            if (file.name === 'thumbnails' || file.name === '_ai_ref') return false;
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

                // Get thumbnail URL for video files
                let thumbnailUrl: string | null = null;
                if (mediaType === 'video') {
                    thumbnailUrl = await getThumbnailUrl(userId, fileId, null);
                }

                return {
                    id: fileId,
                    name: originalName,
                    url: signedUrlData?.signedUrl || '',
                    status: urlError ? 'error' as const : 'completed',
                    type: mediaType,
                    size: file.metadata?.size || undefined,
                    createdAt: file.created_at || new Date().toISOString(),
                    thumbnailUrl,
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
    
    // Include folder path if present
    const basePath = libraryItem.folder 
        ? `${userFolder}/${libraryItem.folder}`
        : userFolder;
    
    // Try new format first, then fallback to old format
    const newFormatFileName = constructStorageFileName(libraryItem.id, libraryItem.name);
    const fileExt = libraryItem.name.split('.').pop() || 'mp4';
    const oldFormatFileName = `${libraryItem.id}.${fileExt}`;

    try {
        // Try downloading with new format
        let { data, error } = await supabase.storage
            .from(STORAGE_BUCKET)
            .download(`${basePath}/${newFormatFileName}`);

        // If new format fails, try old format
        if (error || !data) {
            const result = await supabase.storage
                .from(STORAGE_BUCKET)
                .download(`${basePath}/${oldFormatFileName}`);
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
 * @param folder - Optional folder path where the file is stored
 */
export async function downloadMediaFileById(
    supabaseFileId: string,
    originalFileName: string,
    userId: string,
    folder?: string | null
): Promise<File> {
    const supabase = createClient();
    const userFolder = getUserFolderPath(userId);
    
    // Include folder path if present
    const basePath = folder 
        ? `${userFolder}/${folder}`
        : userFolder;
    
    // Extract fileId from supabaseFileId (remove extension if present)
    const fileIdWithoutExt = supabaseFileId.replace(/\.[^/.]+$/, '');
    const fileExt = supabaseFileId.split('.').pop() || originalFileName.split('.').pop() || 'mp4';
    
    // Build both old and new format paths to try
    const oldFormatPath = `${basePath}/${supabaseFileId}`;
    const newFormatFileName = constructStorageFileName(fileIdWithoutExt, originalFileName);
    const newFormatPath = `${basePath}/${newFormatFileName}`;

    try {
        // Try old format first (most common: {fileId}.{ext})
        let { data, error } = await supabase.storage
            .from(STORAGE_BUCKET)
            .download(oldFormatPath);

        // If old format fails, try new format ({fileId}--{encodedOriginalName}.{ext})
        if (error || !data) {
            const result = await supabase.storage
                .from(STORAGE_BUCKET)
                .download(newFormatPath);
            data = result.data;
            error = result.error;
        }

        if (error) {
            // Extract meaningful error message from Supabase error
            const errorMessage = error.message || 
                (typeof error === 'object' ? JSON.stringify(error) : String(error)) ||
                'Unknown storage error';
            throw new Error(`Storage error: ${errorMessage}`);
        }

        if (!data) {
            throw new Error('No data received from download');
        }

        // Convert blob to File object
        const file = new File([data], originalFileName, { type: data.type });
        return file;
    } catch (error: any) {
        console.error('Error downloading file by ID:', error);
        // Provide more helpful error messages
        const message = error?.message || 
            (typeof error === 'object' ? JSON.stringify(error) : String(error)) || 
            'Failed to download file from Supabase';
        throw new Error(message);
    }
}

export interface StorageUsageInfo {
    usedBytes: number;
    limitBytes: number;
    fileCount: number;
    remainingBytes: number;
    isPremium: boolean;
    // Detailed breakdown
    mediaLibraryBytes?: number;
    rendersBytes?: number;
    mediaFileCount?: number;
    renderFileCount?: number;
}

/**
 * Get the total storage usage for a user
 * This fetches from the API which calculates comprehensive usage across
 * both media-library and renders buckets, including all subfolders.
 * 
 * The storage limit (100GB for Pro, 5GB for free) applies to the combined
 * total of uploaded files AND rendered videos.
 */
export async function getUserStorageUsage(userId: string): Promise<StorageUsageInfo> {
    try {
        // Fetch from API which does comprehensive calculation on server-side
        const response = await fetch('/api/storage/check-limit');
        
        if (!response.ok) {
            throw new Error('Failed to fetch storage usage');
        }
        
        const data = await response.json();
        
        return {
            usedBytes: data.usedBytes || 0,
            limitBytes: data.limitBytes || 0,
            fileCount: data.fileCount || 0,
            remainingBytes: data.remainingBytes || 0,
            isPremium: data.isPremium || false,
            mediaLibraryBytes: data.mediaLibraryBytes,
            rendersBytes: data.rendersBytes,
            mediaFileCount: data.mediaFileCount,
            renderFileCount: data.renderFileCount,
        };
    } catch (error: any) {
        console.error('Error getting storage usage:', error);
        return { 
            usedBytes: 0, 
            limitBytes: 0,
            fileCount: 0,
            remainingBytes: 0,
            isPremium: false,
        };
    }
}

// ============================================
// Folder Management Functions
// ============================================

/**
 * Create a folder in the user's media library
 * Calls the backend API to store folder information in the database
 */
export async function createFolder(userId: string, folderName: string, parentFolder?: string): Promise<MediaFolder> {
    try {
        const response = await fetch('/api/media/folders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: folderName, parentFolder }),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to create folder');
        }

        return data.folder;
    } catch (error: any) {
        console.error('Error creating folder:', error);
        throw new Error(error.message || 'Failed to create folder');
    }
}

/**
 * List folders in a given path for a user
 * Calls the backend API to read folder information from the database
 */
export async function listFolders(userId: string, parentFolder?: string): Promise<MediaFolder[]> {
    try {
        const params = new URLSearchParams();
        if (parentFolder) {
            params.set('parent', parentFolder);
        }

        const response = await fetch(`/api/media/folders?${params.toString()}`);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to list folders');
        }

        return data.folders || [];
    } catch (error: any) {
        console.error('Error listing folders:', error);
        return [];
    }
}

/**
 * Delete a folder and all its contents
 * Calls the backend API to delete files from storage and folder records from database
 */
export async function deleteFolder(userId: string, folderPath: string): Promise<void> {
    try {
        const params = new URLSearchParams({ path: folderPath });
        const response = await fetch(`/api/media/folders?${params.toString()}`, {
            method: 'DELETE',
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to delete folder');
        }
    } catch (error: any) {
        console.error('Error deleting folder:', error);
        throw new Error(error.message || 'Failed to delete folder');
    }
}

/**
 * Rename a folder
 */
export async function renameFolder(userId: string, oldPath: string, newName: string): Promise<MediaFolder> {
    // Supabase storage doesn't support renaming directly
    // We would need to copy all files to a new folder and delete the old one
    // For now, throw an error indicating this is not supported
    throw new Error('Folder renaming is not currently supported. Please create a new folder and move files manually.');
}

export interface MoveFilesResult {
    success: boolean;
    moved: number;
    failed: number;
    results: { id: string; success: boolean; error?: string }[];
}

/**
 * Move files to a different folder
 * Calls the backend API to move files in storage
 */
export async function moveFiles(
    files: { id: string; name: string; currentFolder: string | null }[],
    destinationFolder: string | null
): Promise<MoveFilesResult> {
    try {
        const response = await fetch('/api/media/move', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ files, destinationFolder }),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to move files');
        }

        return data;
    } catch (error: any) {
        console.error('Error moving files:', error);
        throw new Error(error.message || 'Failed to move files');
    }
}

/**
 * List all media files for a user from a specific folder
 * When no folder is specified, lists files from the root (same as listUserMediaFiles)
 */
export async function listUserMediaFilesInFolder(userId: string, folder?: string): Promise<LibraryItem[]> {
    // If no folder specified, use the original function to ensure backward compatibility
    if (!folder) {
        const items = await listUserMediaFiles(userId);
        return items.map(item => ({ ...item, folder: null }));
    }
    
    const supabase = createClient();
    const userFolder = getUserFolderPath(userId);
    const listPath = `${userFolder}/${folder}`;

    try {
        const { data, error } = await supabase.storage
            .from(STORAGE_BUCKET)
            .list(listPath, {
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

        // Filter out placeholder files, hidden files, folders, and system files
        const filteredData = data.filter(file => {
            // Skip hidden files (starting with .)
            if (file.name.startsWith('.')) return false;
            // Skip empty folder placeholder
            if (file.name === '.emptyFolderPlaceholder') return false;
            // Skip folders (in Supabase storage, folders have id === null, files have a string id)
            if (file.id === null) return false;
            // Skip thumbnail files
            if (file.name.includes('_thumb.')) return false;
            // Skip system folders that might appear as entries
            if (file.name === 'thumbnails' || file.name === '_ai_ref') return false;
            return true;
        });

        if (filteredData.length === 0) {
            return [];
        }

        // Get signed URLs for all files (for private bucket)
        const libraryItems: LibraryItem[] = await Promise.all(
            filteredData.map(async (file) => {
                const filePath = `${listPath}/${file.name}`;
                
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

                // Get thumbnail URL for video files
                let thumbnailUrl: string | null = null;
                if (mediaType === 'video') {
                    thumbnailUrl = await getThumbnailUrl(userId, fileId, folder);
                }

                return {
                    id: fileId,
                    name: originalName,
                    url: signedUrlData?.signedUrl || '',
                    status: urlError ? 'error' as const : 'completed',
                    type: mediaType,
                    size: file.metadata?.size || undefined,
                    createdAt: file.created_at || new Date().toISOString(),
                    folder: folder || null,
                    thumbnailUrl,
                };
            })
        );

        return libraryItems;
    } catch (error: any) {
        console.error('Error listing media files in folder:', error);
        return [];
    }
}

/**
 * Upload a file to a specific folder in the user's media library
 */
export async function uploadMediaFileToFolder(
    file: File,
    userId: string,
    folder?: string,
    onProgress?: (progress: number) => void
): Promise<LibraryItem> {
    const supabase = createClient();
    const userFolder = getUserFolderPath(userId);
    const fileId = crypto.randomUUID();
    const fileExt = file.name.split('.').pop() || 'mp4';
    // Encode original filename (without extension) in the storage path for reliable retrieval
    const originalNameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
    const encodedName = btoa(encodeURIComponent(originalNameWithoutExt));
    const fileName = `${fileId}--${encodedName}.${fileExt}`;
    const filePath = folder 
        ? `${userFolder}/${folder}/${fileName}`
        : `${userFolder}/${fileName}`;

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
        folder: folder || null,
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

        // For video files, extract and upload a thumbnail
        if (libraryItem.type === 'video') {
            try {
                const thumbnail = await extractThumbnail(file, fileId);
                const thumbnailUrl = await uploadVideoThumbnail(thumbnail, userId, fileId, folder);
                libraryItem.thumbnailUrl = thumbnailUrl;
            } catch (thumbnailError) {
                // Thumbnail extraction failed, but we still have the video uploaded
                console.warn('Failed to extract thumbnail:', thumbnailError);
                libraryItem.thumbnailUrl = null;
            }
        }

        return libraryItem;
    } catch (error: any) {
        libraryItem.status = 'error';
        console.error('Error uploading file:', error);
        throw new Error(error.message || 'Failed to upload file');
    }
}

/**
 * Delete a media file from a specific folder in Supabase storage
 * Also removes the associated thumbnail if it exists
 */
export async function deleteMediaFileFromFolder(fileId: string, userId: string, fileName: string, folder?: string): Promise<void> {
    const supabase = createClient();
    const userFolder = getUserFolderPath(userId);
    const basePath = folder ? `${userFolder}/${folder}` : userFolder;
    
    // Try new format first, then fallback to old format
    const newFormatFileName = constructStorageFileName(fileId, fileName);
    const fileExt = fileName.split('.').pop() || 'mp4';
    const oldFormatFileName = `${fileId}.${fileExt}`;

    try {
        // Try deleting with new format
        let { error } = await supabase.storage
            .from(STORAGE_BUCKET)
            .remove([`${basePath}/${newFormatFileName}`]);

        // If new format fails, try old format
        if (error) {
            const result = await supabase.storage
                .from(STORAGE_BUCKET)
                .remove([`${basePath}/${oldFormatFileName}`]);
            error = result.error;
        }

        if (error) {
            throw error;
        }

        // Also try to delete the thumbnail from the root thumbnails folder
        // (ignore errors as it may not exist)
        const thumbnailFileName = constructThumbnailFileName(fileId);
        const rootThumbnailPath = `${userFolder}/${THUMBNAILS_FOLDER}/${thumbnailFileName}`;
        await supabase.storage
            .from(STORAGE_BUCKET)
            .remove([rootThumbnailPath]);
        
        // Also try nested path for backwards compatibility
        if (folder) {
            const nestedThumbnailPath = `${basePath}/${THUMBNAILS_FOLDER}/${thumbnailFileName}`;
            await supabase.storage
                .from(STORAGE_BUCKET)
                .remove([nestedThumbnailPath]);
        }
    } catch (error: any) {
        console.error('Error deleting file:', error);
        throw new Error(error.message || 'Failed to delete file');
    }
}
