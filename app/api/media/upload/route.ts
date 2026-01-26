import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/app/utils/supabase/server';
import { 
    STORAGE_LIMITS, 
    MAX_FILE_SIZE_BYTES,
    MAX_FILE_SIZE_DISPLAY,
    isAllowedFileType,
} from '@/app/constants/storage';
import { calculateUserStorageUsage } from '@/app/utils/storageUsage';

const STORAGE_BUCKET = 'media-library';

/**
 * POST /api/media/upload - Create signed upload URL for TUS resumable upload
 * 
 * Request body:
 * - fileName: string - Original file name
 * - fileSize: number - File size in bytes
 * - mimeType: string - MIME type of the file
 * - folder?: string - Optional folder path
 * 
 * Response:
 * - token: string - Signed upload token for x-signature header
 * - path: string - Storage path where file will be uploaded
 * - fileId: string - Generated UUID for the file
 */
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { fileName, fileSize, mimeType, folder } = body;

        // Validate required fields
        if (!fileName || typeof fileName !== 'string') {
            return NextResponse.json({ error: 'File name is required' }, { status: 400 });
        }
        if (typeof fileSize !== 'number' || fileSize <= 0) {
            return NextResponse.json({ error: 'Invalid file size' }, { status: 400 });
        }
        if (!mimeType || typeof mimeType !== 'string') {
            return NextResponse.json({ error: 'MIME type is required' }, { status: 400 });
        }

        // Validate file type (only video and audio allowed)
        if (!isAllowedFileType(mimeType)) {
            return NextResponse.json({ 
                error: 'Only video and audio files are allowed' 
            }, { status: 400 });
        }

        // Validate file size limit (1GB per file)
        if (fileSize > MAX_FILE_SIZE_BYTES) {
            return NextResponse.json({ 
                error: `File exceeds maximum size of ${MAX_FILE_SIZE_DISPLAY}` 
            }, { status: 400 });
        }

        // Get user profile with subscription info
        const { data: profile } = await supabase
            .from('user_profiles')
            .select('subscriptionStatus')
            .eq('id', user.id)
            .single();

        const subscriptionStatus = profile?.subscriptionStatus || 'free';
        const isPremium = subscriptionStatus === 'active';
        const storageLimit = isPremium ? STORAGE_LIMITS.pro : STORAGE_LIMITS.free;

        // Get comprehensive storage usage across all buckets (media-library + renders)
        // including all subfolders. The 100GB limit applies to combined total.
        const storageUsage = await calculateUserStorageUsage(supabase, user.id);
        const usedBytes = storageUsage.totalUsedBytes;

        // Check if upload would exceed storage limit
        const newTotal = usedBytes + fileSize;
        if (newTotal > storageLimit) {
            const limitText = isPremium ? '100GB' : '5GB';
            return NextResponse.json({ 
                error: `Upload would exceed your ${limitText} storage limit (includes uploaded files and rendered videos). ${isPremium ? '' : 'Upgrade to Pro for 100GB storage.'}`,
                usedBytes,
                limitBytes: storageLimit,
                mediaLibraryBytes: storageUsage.mediaLibraryBytes,
                rendersBytes: storageUsage.rendersBytes,
            }, { status: 400 });
        }

        // Generate file ID and build storage path
        const fileId = crypto.randomUUID();
        const fileExt = fileName.split('.').pop() || 'mp4';
        const originalNameWithoutExt = fileName.replace(/\.[^/.]+$/, '');
        const encodedName = Buffer.from(encodeURIComponent(originalNameWithoutExt)).toString('base64');
        const storageFileName = `${fileId}--${encodedName}.${fileExt}`;
        
        const storagePath = folder 
            ? `${user.id}/${folder}/${storageFileName}`
            : `${user.id}/${storageFileName}`;

        // Create signed upload URL for TUS resumable upload
        const { data, error } = await supabase.storage
            .from(STORAGE_BUCKET)
            .createSignedUploadUrl(storagePath);

        if (error) {
            console.error('Error creating signed upload URL:', error);
            return NextResponse.json({ error: 'Failed to create upload URL' }, { status: 500 });
        }

        return NextResponse.json({
            token: data.token,
            path: storagePath,
            fileId,
            signedUrl: data.signedUrl,
        });
    } catch (error: any) {
        console.error('Error in POST /api/media/upload:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
