import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/app/utils/supabase/server';
import { RenderJobStatusResponse } from '@/app/types/render';

const RENDERS_BUCKET = 'renders';
const SIGNED_URL_EXPIRY = 3600; // 1 hour

export async function GET(request: NextRequest): Promise<NextResponse<RenderJobStatusResponse[] | { error: string }>> {
    try {
        const supabase = await createClient();
        
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        
        // Support filtering by status (comma-separated list)
        const statusParam = request.nextUrl.searchParams.get('status');
        const statusFilters = statusParam ? statusParam.split(',') : null;
        
        let query = supabase
            .from('render_jobs')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });
        
        // Apply status filter if provided
        if (statusFilters && statusFilters.length > 0) {
            query = query.in('status', statusFilters);
        }
        
        const { data: jobs, error } = await query;
        
        if (error) {
            console.error('Error fetching render jobs:', error);
            return NextResponse.json({ error: 'Failed to fetch render jobs' }, { status: 500 });
        }
        
        // Generate signed URLs for completed jobs
        const formattedJobs: RenderJobStatusResponse[] = await Promise.all(
            (jobs || []).map(async (job) => {
                let downloadUrl = job.download_url;
                let thumbnailUrl = job.thumbnail_url;
                
                // Generate signed URLs for completed jobs with stored URLs
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
                
                return {
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
                };
            })
        );
        
        return NextResponse.json(formattedJobs);
    } catch (error) {
        console.error('Error in renders API:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// DELETE /api/renders - Bulk delete multiple render jobs
export async function DELETE(request: NextRequest): Promise<NextResponse<{ success: boolean; deletedCount: number } | { error: string }>> {
    try {
        const supabase = await createClient();
        const adminClient = createAdminClient();
        
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        
        const body = await request.json();
        const { ids } = body as { ids: string[] };
        
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return NextResponse.json({ error: 'No render IDs provided' }, { status: 400 });
        }
        
        // Limit to prevent abuse
        if (ids.length > 100) {
            return NextResponse.json({ error: 'Cannot delete more than 100 videos at once' }, { status: 400 });
        }
        
        // Fetch all render jobs to verify ownership and get file paths
        const { data: jobs, error: fetchError } = await supabase
            .from('render_jobs')
            .select('*')
            .in('id', ids)
            .eq('user_id', user.id);
        
        if (fetchError) {
            console.error('Error fetching render jobs for deletion:', fetchError);
            return NextResponse.json({ error: 'Failed to fetch render jobs' }, { status: 500 });
        }
        
        if (!jobs || jobs.length === 0) {
            return NextResponse.json({ error: 'No matching render jobs found' }, { status: 404 });
        }
        
        // Collect all file paths to delete from storage (use consistent path format)
        const filesToDelete: string[] = [];
        const jobIdsToDelete: string[] = [];
        
        for (const job of jobs) {
            jobIdsToDelete.push(job.id);
            
            // Video file path: userId/jobId.mp4
            filesToDelete.push(`${user.id}/${job.id}.mp4`);
            
            // Thumbnail file path: userId/jobId_thumb.jpg
            filesToDelete.push(`${user.id}/${job.id}_thumb.jpg`);
        }
        
        // Delete files from storage using admin client (bypasses RLS)
        if (filesToDelete.length > 0) {
            try {
                const { error: storageError } = await adminClient
                    .storage
                    .from(RENDERS_BUCKET)
                    .remove(filesToDelete);
                
                if (storageError) {
                    console.error('Error deleting files from storage:', storageError);
                    // Continue with job deletion even if storage deletion fails
                }
            } catch (e) {
                console.error('Error deleting storage files:', e);
            }
        }
        
        // Delete render jobs from database using admin client (bypasses RLS)
        const { error: deleteError } = await adminClient
            .from('render_jobs')
            .delete()
            .in('id', jobIdsToDelete)
            .eq('user_id', user.id);
        
        if (deleteError) {
            console.error('Error deleting render jobs:', deleteError);
            return NextResponse.json({ error: 'Failed to delete render jobs' }, { status: 500 });
        }
        
        return NextResponse.json({ success: true, deletedCount: jobIdsToDelete.length });
    } catch (error) {
        console.error('Error in bulk delete renders API:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
