import { NextResponse } from 'next/server';
import { createClient } from '@/app/utils/supabase/server';
import { RenderJobStatusResponse } from '@/app/types/render';

const RENDERS_BUCKET = 'renders';
const SIGNED_URL_EXPIRY = 3600; // 1 hour

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<RenderJobStatusResponse | { error: string }>> {
    try {
        const supabase = await createClient();
        const { id } = await params;
        
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        
        const { data: job, error } = await supabase
            .from('render_jobs')
            .select('*')
            .eq('id', id)
            .eq('user_id', user.id)
            .single();
        
        if (error || !job) {
            return NextResponse.json({ error: 'Job not found' }, { status: 404 });
        }
        
        let downloadUrl = job.download_url;
        let thumbnailUrl = job.thumbnail_url;
        
        // Generate signed URLs for completed jobs
        if (job.status === 'completed') {
            // Generate signed URL for video
            if (job.download_url) {
                const videoPath = `${user.id}/${job.id}.mp4`;
                const { data: videoSignedUrl } = await supabase.storage
                    .from(RENDERS_BUCKET)
                    .createSignedUrl(videoPath, SIGNED_URL_EXPIRY);
                if (videoSignedUrl?.signedUrl) {
                    downloadUrl = videoSignedUrl.signedUrl;
                }
            }
            
            // Generate signed URL for thumbnail
            if (job.thumbnail_url) {
                const thumbPath = `${user.id}/${job.id}_thumb.jpg`;
                const { data: thumbSignedUrl } = await supabase.storage
                    .from(RENDERS_BUCKET)
                    .createSignedUrl(thumbPath, SIGNED_URL_EXPIRY);
                if (thumbSignedUrl?.signedUrl) {
                    thumbnailUrl = thumbSignedUrl.signedUrl;
                }
            }
        }
        
        return NextResponse.json({
            id: job.id,
            userId: job.user_id,
            status: job.status,
            progress: job.progress,
            downloadUrl,
            thumbnailUrl,
            fileSizeBytes: job.file_size_bytes,
            errorMessage: job.error_message,
            createdAt: job.created_at,
            updatedAt: job.updated_at,
            completedAt: job.completed_at,
            batchId: job.batch_id,
            batchIndex: job.batch_index,
        });
    } catch (error) {
        console.error('Error fetching render job:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
