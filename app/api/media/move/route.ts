import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/app/utils/supabase/server';

const STORAGE_BUCKET = 'media-library';

// POST /api/media/move - Move files to a different folder
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { files, destinationFolder } = body;

        // files: array of { id, name, currentFolder }
        // destinationFolder: string | null (null = root)

        if (!Array.isArray(files) || files.length === 0) {
            return NextResponse.json({ error: 'No files specified' }, { status: 400 });
        }

        const userFolder = user.id;
        const results: { id: string; success: boolean; error?: string }[] = [];

        for (const file of files) {
            const { id: fileId, name: fileName, currentFolder } = file;

            try {
                // Build the current file path
                // File format: {fileId}--{encodedOriginalName}.{ext}
                const fileExt = fileName.split('.').pop() || 'mp4';
                const originalNameWithoutExt = fileName.replace(/\.[^/.]+$/, '');
                const encodedName = btoa(encodeURIComponent(originalNameWithoutExt));
                const storageFileName = `${fileId}--${encodedName}.${fileExt}`;

                const currentPath = currentFolder
                    ? `${userFolder}/${currentFolder}/${storageFileName}`
                    : `${userFolder}/${storageFileName}`;

                const newPath = destinationFolder
                    ? `${userFolder}/${destinationFolder}/${storageFileName}`
                    : `${userFolder}/${storageFileName}`;

                // Skip if source and destination are the same
                if (currentPath === newPath) {
                    results.push({ id: fileId, success: true });
                    continue;
                }

                // Move the file using Supabase storage move
                const { error: moveError } = await supabase.storage
                    .from(STORAGE_BUCKET)
                    .move(currentPath, newPath);

                if (moveError) {
                    // Try with old format filename (just fileId.ext)
                    const oldFormatFileName = `${fileId}.${fileExt}`;
                    const oldCurrentPath = currentFolder
                        ? `${userFolder}/${currentFolder}/${oldFormatFileName}`
                        : `${userFolder}/${oldFormatFileName}`;
                    const oldNewPath = destinationFolder
                        ? `${userFolder}/${destinationFolder}/${oldFormatFileName}`
                        : `${userFolder}/${oldFormatFileName}`;

                    const { error: oldMoveError } = await supabase.storage
                        .from(STORAGE_BUCKET)
                        .move(oldCurrentPath, oldNewPath);

                    if (oldMoveError) {
                        results.push({ id: fileId, success: false, error: oldMoveError.message });
                        continue;
                    }
                }

                results.push({ id: fileId, success: true });
            } catch (err: any) {
                results.push({ id: fileId, success: false, error: err.message });
            }
        }

        const successCount = results.filter(r => r.success).length;
        const failedCount = results.filter(r => !r.success).length;

        return NextResponse.json({
            success: failedCount === 0,
            moved: successCount,
            failed: failedCount,
            results,
        });
    } catch (error: any) {
        console.error('Error in POST /api/media/move:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
