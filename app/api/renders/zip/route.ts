import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/app/utils/supabase/server';
import JSZip from 'jszip';

const RENDERS_BUCKET = 'renders';
const SIGNED_URL_EXPIRY = 3600; // 1 hour

// Helper to extract storage path from either a full URL or a file path
// Handles backward compatibility for old records that stored full URLs
function getStoragePath(urlOrPath: string, userId: string, jobId: string): string {
    if (!urlOrPath.startsWith('http://') && !urlOrPath.startsWith('https://')) {
        return urlOrPath;
    }
    
    const match = urlOrPath.match(/\/renders\/(.+)$/);
    if (match) {
        return match[1];
    }
    
    return `${userId}/${jobId}.mp4`;
}

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        
        // Verify user is authenticated
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        
        // Get render IDs from request body
        const { renderIds } = await request.json();
        
        if (!renderIds || !Array.isArray(renderIds) || renderIds.length === 0) {
            return NextResponse.json({ error: 'No render IDs provided' }, { status: 400 });
        }
        
        if (renderIds.length > 20) {
            return NextResponse.json({ error: 'Maximum 20 videos allowed per ZIP' }, { status: 400 });
        }
        
        // Fetch render jobs to verify ownership and get URLs
        const { data: renders, error: fetchError } = await supabase
            .from('render_jobs')
            .select('id, download_url, batch_index')
            .eq('user_id', user.id)
            .eq('status', 'completed')
            .in('id', renderIds);
        
        if (fetchError) {
            console.error('Error fetching renders:', fetchError);
            return NextResponse.json({ error: 'Failed to fetch renders' }, { status: 500 });
        }
        
        if (!renders || renders.length === 0) {
            return NextResponse.json({ error: 'No valid renders found' }, { status: 404 });
        }
        
        // Create ZIP file
        const zip = new JSZip();
        
        // Fetch and add each video to the ZIP
        for (let i = 0; i < renders.length; i++) {
            const render = renders[i];
            if (!render.download_url) continue;
            
            try {
                // Generate signed URL for private bucket using stored file ID
                const videoPath = getStoragePath(render.download_url, user.id, render.id);
                const { data: signedUrlData, error: signedUrlError } = await supabase.storage
                    .from(RENDERS_BUCKET)
                    .createSignedUrl(videoPath, SIGNED_URL_EXPIRY);
                
                if (signedUrlError || !signedUrlData?.signedUrl) {
                    console.error(`Failed to create signed URL for ${render.id}:`, signedUrlError);
                    continue;
                }
                
                const response = await fetch(signedUrlData.signedUrl);
                if (!response.ok) {
                    console.error(`Failed to fetch video ${render.id}: ${response.status}`);
                    continue;
                }
                
                const arrayBuffer = await response.arrayBuffer();
                const filename = `video-${render.batch_index !== null ? render.batch_index + 1 : i + 1}.mp4`;
                zip.file(filename, arrayBuffer);
            } catch (error) {
                console.error(`Error fetching video ${render.id}:`, error);
                // Continue with other videos
            }
        }
        
        // Check if any files were added
        if (Object.keys(zip.files).length === 0) {
            return NextResponse.json({ error: 'Failed to fetch any videos' }, { status: 500 });
        }
        
        // Generate ZIP blob
        const zipBuffer = await zip.generateAsync({ 
            type: 'arraybuffer',
            compression: 'STORE' // No compression for videos (already compressed)
        });
        
        // Return ZIP file
        const filename = `videos-${new Date().toISOString().split('T')[0]}.zip`;
        
        return new NextResponse(zipBuffer, {
            status: 200,
            headers: {
                'Content-Type': 'application/zip',
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Content-Length': zipBuffer.byteLength.toString(),
            },
        });
    } catch (error) {
        console.error('Error creating ZIP:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
