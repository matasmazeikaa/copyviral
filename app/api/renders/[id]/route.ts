import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/app/utils/supabase/server';

// Helper to extract storage path from either a full URL or a file path
// Handles backward compatibility for old records that stored full URLs
function getStoragePath(urlOrPath: string): string {
    if (!urlOrPath.startsWith('http://') && !urlOrPath.startsWith('https://')) {
        return urlOrPath;
    }
    
    const match = urlOrPath.match(/\/renders\/(.+)$/);
    if (match) {
        return match[1];
    }
    
    // Return empty if we can't parse it
    return '';
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<{ success: boolean } | { error: string }>> {
    try {
        const supabase = await createClient();
        const adminClient = createAdminClient();
        const { id } = await params;
        
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        
        // First, fetch the render job to verify ownership and get the download URL
        const { data: job, error: fetchError } = await supabase
            .from('render_jobs')
            .select('*')
            .eq('id', id)
            .eq('user_id', user.id)
            .single();
        
        if (fetchError || !job) {
            return NextResponse.json({ error: 'Render job not found' }, { status: 404 });
        }
        
        // Delete files from storage using stored file IDs (storage paths)
        const filesToDelete: string[] = [];
        
        // Video file path - use consistent path format: userId/jobId.mp4
        const videoPath = `${user.id}/${id}.mp4`;
        filesToDelete.push(videoPath);
        
        // Thumbnail file path - use consistent path format: userId/jobId_thumb.jpg
        const thumbPath = `${user.id}/${id}_thumb.jpg`;
        filesToDelete.push(thumbPath);
        
        // Delete files from storage using admin client (bypasses RLS)
        try {
            const { error: storageError } = await adminClient
                .storage
                .from('renders')
                .remove(filesToDelete);
            
            if (storageError) {
                console.error('Error deleting files from storage:', storageError);
                // Continue with job deletion even if storage deletion fails
            }
        } catch (e) {
            console.error('Error deleting storage files:', e);
            // Continue with job deletion
        }
        
        // Delete the render job from the database using admin client (bypasses RLS)
        const { error: deleteError, count } = await adminClient
            .from('render_jobs')
            .delete()
            .eq('id', id)
            .eq('user_id', user.id);
        
        if (deleteError) {
            console.error('Error deleting render job:', deleteError);
            return NextResponse.json({ error: 'Failed to delete render job' }, { status: 500 });
        }
        
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error in delete render API:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
