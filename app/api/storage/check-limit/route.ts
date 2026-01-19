import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/app/utils/supabase/server';
import { 
  STORAGE_LIMITS, 
  MAX_FILE_SIZE_BYTES, 
  MAX_FILE_SIZE_DISPLAY,
  isAllowedFileType,
} from '@/app/constants/storage';

const STORAGE_BUCKET = 'media-library';

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

    // Get current storage usage
    const { data: files, error: listError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .list(user.id, {
        limit: 1000,
        offset: 0,
      });

    if (listError) {
      console.error('Error listing files:', listError);
      return NextResponse.json({ error: 'Failed to check storage' }, { status: 500 });
    }

    // Calculate total used storage
    let usedBytes = 0;
    if (files) {
      for (const file of files) {
        if (file.metadata?.size) {
          usedBytes += file.metadata.size;
        }
      }
    }

    const remainingBytes = Math.max(0, storageLimit - usedBytes);
    const usagePercentage = (usedBytes / storageLimit) * 100;

    return NextResponse.json({
      isPremium,
      usedBytes,
      limitBytes: storageLimit,
      remainingBytes,
      usagePercentage,
      fileCount: files?.length || 0,
      maxFileSize: MAX_FILE_SIZE_BYTES,
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

    // Get current storage usage
    const { data: files, error: listError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .list(user.id, {
        limit: 1000,
        offset: 0,
      });

    if (listError) {
      console.error('Error listing files:', listError);
      return NextResponse.json({ error: 'Failed to check storage' }, { status: 500 });
    }

    // Calculate total used storage
    let usedBytes = 0;
    if (files) {
      for (const file of files) {
        if (file.metadata?.size) {
          usedBytes += file.metadata.size;
        }
      }
    }

    const newTotal = usedBytes + fileSize;
    const canUpload = newTotal <= storageLimit;

    if (!canUpload) {
      const limitText = isPremium ? '100GB' : '5GB';
      return NextResponse.json({
        canUpload: false,
        error: `Upload would exceed your ${limitText} storage limit. ${isPremium ? '' : 'Upgrade to Pro for 100GB storage.'}`,
        usedBytes,
        limitBytes: storageLimit,
        remainingBytes: Math.max(0, storageLimit - usedBytes),
      }, { status: 400 });
    }

    return NextResponse.json({
      canUpload: true,
      usedBytes,
      limitBytes: storageLimit,
      remainingBytes: Math.max(0, storageLimit - usedBytes),
      newTotalAfterUpload: newTotal,
    });
  } catch (error: any) {
    console.error('Validate upload error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
