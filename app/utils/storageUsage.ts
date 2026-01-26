/**
 * Server-side utility for calculating comprehensive storage usage
 * across both media-library and renders buckets, including all subfolders
 */

import { SupabaseClient } from '@supabase/supabase-js';

const MEDIA_LIBRARY_BUCKET = 'media-library';
const RENDERS_BUCKET = 'renders';

export interface StorageUsageResult {
    totalUsedBytes: number;
    mediaLibraryBytes: number;
    rendersBytes: number;
    mediaFileCount: number;
    renderFileCount: number;
}

/**
 * Recursively calculate storage usage for a folder and all its subfolders
 */
async function calculateFolderUsage(
    supabase: SupabaseClient,
    bucket: string,
    folderPath: string
): Promise<{ bytes: number; fileCount: number }> {
    let totalBytes = 0;
    let fileCount = 0;
    
    try {
        // List items in the folder (limit 1000 per call)
        const { data: items, error } = await supabase.storage
            .from(bucket)
            .list(folderPath, {
                limit: 1000,
                offset: 0,
            });
        
        if (error) {
            console.error(`Error listing ${bucket}/${folderPath}:`, error);
            return { bytes: 0, fileCount: 0 };
        }
        
        if (!items || items.length === 0) {
            return { bytes: 0, fileCount: 0 };
        }
        
        // Process each item
        for (const item of items) {
            // Skip hidden files and placeholders
            if (item.name.startsWith('.') || item.name === '.emptyFolderPlaceholder') {
                continue;
            }
            
            // Check if it's a folder (Supabase folders have id === null)
            if (item.id === null) {
                // Recursively calculate subfolder usage
                const subfolderPath = folderPath ? `${folderPath}/${item.name}` : item.name;
                const subfolderUsage = await calculateFolderUsage(supabase, bucket, subfolderPath);
                totalBytes += subfolderUsage.bytes;
                fileCount += subfolderUsage.fileCount;
            } else {
                // It's a file - add its size
                if (item.metadata?.size) {
                    totalBytes += item.metadata.size;
                    fileCount++;
                }
            }
        }
        
        return { bytes: totalBytes, fileCount };
    } catch (error) {
        console.error(`Error calculating folder usage for ${bucket}/${folderPath}:`, error);
        return { bytes: 0, fileCount: 0 };
    }
}

/**
 * Calculate comprehensive storage usage for a user across all buckets and folders
 * This includes:
 * - media-library bucket (uploaded videos, audio, including all subfolders)
 * - renders bucket (rendered videos)
 * 
 * @param supabase - Supabase client instance
 * @param userId - User ID to calculate storage for
 * @returns Total storage usage breakdown
 */
export async function calculateUserStorageUsage(
    supabase: SupabaseClient,
    userId: string
): Promise<StorageUsageResult> {
    // Calculate media library usage (including all subfolders)
    const mediaUsage = await calculateFolderUsage(supabase, MEDIA_LIBRARY_BUCKET, userId);
    
    // Calculate renders usage
    const rendersUsage = await calculateFolderUsage(supabase, RENDERS_BUCKET, userId);
    
    return {
        totalUsedBytes: mediaUsage.bytes + rendersUsage.bytes,
        mediaLibraryBytes: mediaUsage.bytes,
        rendersBytes: rendersUsage.bytes,
        mediaFileCount: mediaUsage.fileCount,
        renderFileCount: rendersUsage.fileCount,
    };
}

/**
 * Check if a user can upload/create content of a given size
 * Returns whether the operation is allowed and the current storage state
 * 
 * @param supabase - Supabase client instance
 * @param userId - User ID to check
 * @param additionalBytes - Size of the content to be added (in bytes)
 * @param storageLimit - User's storage limit (based on subscription)
 * @returns Object with canProceed flag and storage details
 */
export async function checkStorageLimit(
    supabase: SupabaseClient,
    userId: string,
    additionalBytes: number,
    storageLimit: number
): Promise<{
    canProceed: boolean;
    currentUsage: StorageUsageResult;
    newTotalAfterOperation: number;
    remainingBytes: number;
}> {
    const currentUsage = await calculateUserStorageUsage(supabase, userId);
    const newTotal = currentUsage.totalUsedBytes + additionalBytes;
    const canProceed = newTotal <= storageLimit;
    
    return {
        canProceed,
        currentUsage,
        newTotalAfterOperation: newTotal,
        remainingBytes: Math.max(0, storageLimit - currentUsage.totalUsedBytes),
    };
}
