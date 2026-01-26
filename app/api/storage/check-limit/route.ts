import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/app/utils/supabase/server';
import { 
  STORAGE_LIMITS, 
  MAX_FILE_SIZE_BYTES, 
  MAX_FILE_SIZE_DISPLAY,
  isAllowedFileType,
} from '@/app/constants/storage';
import { calculateUserStorageUsage } from '@/app/utils/storageUsage';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
    // including all subfolders
    const storageUsage = await calculateUserStorageUsage(supabase, user.id);

    const remainingBytes = Math.max(0, storageLimit - storageUsage.totalUsedBytes);
    const usagePercentage = (storageUsage.totalUsedBytes / storageLimit) * 100;

    return NextResponse.json({
      isPremium,
      usedBytes: storageUsage.totalUsedBytes,
      limitBytes: storageLimit,
      remainingBytes,
      usagePercentage,
      fileCount: storageUsage.mediaFileCount + storageUsage.renderFileCount,
      maxFileSize: MAX_FILE_SIZE_BYTES,
      // Detailed breakdown
      mediaLibraryBytes: storageUsage.mediaLibraryBytes,
      rendersBytes: storageUsage.rendersBytes,
      mediaFileCount: storageUsage.mediaFileCount,
      renderFileCount: storageUsage.renderFileCount,
    });
  } catch (error: any) {
    console.error('Check storage limit error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST endpoint to validate if a file can be uploaded
 * Body: { fileSize: number, mimeType?: string }
 * 
 * This checks comprehensive storage usage across both media-library and renders buckets.
 * The 100GB limit applies to the combined total of uploaded files AND rendered videos.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { fileSize, mimeType } = body;

    if (typeof fileSize !== 'number' || fileSize <= 0) {
      return NextResponse.json({ error: 'Invalid file size' }, { status: 400 });
    }

    // Check file type (only video and audio allowed)
    if (mimeType && !isAllowedFileType(mimeType)) {
      return NextResponse.json({
        canUpload: false,
        error: 'Only video and audio files are allowed. Images are not supported.',
      }, { status: 400 });
    }

    // Check individual file size limit (1GB)
    if (fileSize > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json({
        canUpload: false,
        error: `File exceeds maximum size of ${MAX_FILE_SIZE_DISPLAY} per file`,
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
    // including all subfolders
    const storageUsage = await calculateUserStorageUsage(supabase, user.id);
    const usedBytes = storageUsage.totalUsedBytes;

    const newTotal = usedBytes + fileSize;
    const canUpload = newTotal <= storageLimit;

    if (!canUpload) {
      const limitText = isPremium ? '100GB' : '5GB';
      return NextResponse.json({
        canUpload: false,
        error: `Upload would exceed your ${limitText} storage limit (includes uploaded files and rendered videos). ${isPremium ? '' : 'Upgrade to Pro for 100GB storage.'}`,
        usedBytes,
        limitBytes: storageLimit,
        remainingBytes: Math.max(0, storageLimit - usedBytes),
        mediaLibraryBytes: storageUsage.mediaLibraryBytes,
        rendersBytes: storageUsage.rendersBytes,
      }, { status: 400 });
    }

    return NextResponse.json({
      canUpload: true,
      usedBytes,
      limitBytes: storageLimit,
      remainingBytes: Math.max(0, storageLimit - usedBytes),
      newTotalAfterUpload: newTotal,
      mediaLibraryBytes: storageUsage.mediaLibraryBytes,
      rendersBytes: storageUsage.rendersBytes,
    });
  } catch (error: any) {
    console.error('Validate upload error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
