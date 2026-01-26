import { NextResponse } from 'next/server';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { createClient } from '@/app/utils/supabase/server';
import { StartRenderRequest, StartRenderResponse } from '@/app/types/render';
import { calculateUserStorageUsage } from '@/app/utils/storageUsage';
import { STORAGE_LIMITS } from '@/app/constants/storage';

const sqs = new SQSClient({
    region: process.env.AWS_REGION!,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
});

export async function POST(request: Request): Promise<NextResponse<StartRenderResponse | { error: string }>> {
    try {
        const supabase = await createClient();
        
        // Get authenticated user
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        
        const body: StartRenderRequest = await request.json();
        
        // Validate input - need at least media files OR text elements
        const hasMediaFiles = body.mediaFiles && body.mediaFiles.length > 0;
        const hasTextElements = body.textElements && body.textElements.length > 0;
        
        console.log(`[Render Start] Request summary:`);
        console.log(`  - Media files: ${body.mediaFiles?.length || 0}`);
        console.log(`  - Text elements: ${body.textElements?.length || 0}`);
        console.log(`  - Duration: ${body.totalDuration}s`);
        if (hasTextElements) {
            console.log(`  - Text preview:`, body.textElements.map(t => ({ id: t.id, text: t.text?.substring(0, 30) })));
        }
        
        if (!hasMediaFiles && !hasTextElements) {
            return NextResponse.json({ error: 'No media files or text elements provided' }, { status: 400 });
        }
        
        // Check if user is premium (for watermark logic and storage limit)
        const { data: subscription } = await supabase
            .from('subscriptions')
            .select('status')
            .eq('user_id', user.id)
            .single();
        
        const isPremium = subscription?.status === 'active';
        const storageLimit = isPremium ? STORAGE_LIMITS.pro : STORAGE_LIMITS.free;
        
        // Check storage limit before allowing render
        // Renders will add to storage when complete, so we need to ensure user has space
        const storageUsage = await calculateUserStorageUsage(supabase, user.id);
        
        // Estimate render output size based on duration and resolution
        // A rough estimate: 1080p video at ~5MB/s bitrate for duration
        // This is conservative - actual sizes may vary
        const duration = body.totalDuration || 30; // default 30 seconds
        const resolution = body.resolution || { width: 1080, height: 1920 };
        const isHD = resolution.width >= 1080 || resolution.height >= 1080;
        const estimatedBitrateMBps = isHD ? 5 : 2.5; // MB per second
        const estimatedRenderSize = Math.ceil(duration * estimatedBitrateMBps * 1024 * 1024);
        
        const newTotalAfterRender = storageUsage.totalUsedBytes + estimatedRenderSize;
        
        if (newTotalAfterRender > storageLimit) {
            const limitText = isPremium ? '100GB' : '5GB';
            const usedGB = (storageUsage.totalUsedBytes / (1024 * 1024 * 1024)).toFixed(2);
            const limitGB = (storageLimit / (1024 * 1024 * 1024)).toFixed(0);
            return NextResponse.json({ 
                error: `Cannot start render: You've used ${usedGB}GB of your ${limitGB}GB storage limit (includes uploaded files and rendered videos). Please delete some files or ${isPremium ? 'contact support.' : 'upgrade to Pro for 100GB storage.'}`,
            }, { status: 400 });
        }
        
        // Create render job in database
        const { data: job, error: insertError } = await supabase
            .from('render_jobs')
            .insert({
                user_id: user.id,
                status: 'queued',
                progress: 0,
                input_data: {
                    mediaFiles: body.mediaFiles,
                    textElements: body.textElements,
                    exportSettings: body.exportSettings,
                    totalDuration: body.totalDuration,
                    resolution: body.resolution,
                    fps: body.fps,
                    isPremium,
                    projectName: body.projectName,
                },
                batch_id: body.batchId || null,
                batch_index: body.batchIndex ?? null,
            })
            .select('id')
            .single();
        
        if (insertError || !job) {
            console.error('Failed to create render job:', insertError);
            return NextResponse.json({ error: 'Failed to create render job' }, { status: 500 });
        }
        
        // Send message to SQS queue
        await sqs.send(new SendMessageCommand({
            QueueUrl: process.env.AWS_SQS_QUEUE_URL!,
            MessageBody: JSON.stringify({
                jobId: job.id,
                userId: user.id,
            }),
        }));
        
        return NextResponse.json({
            jobId: job.id,
            status: 'queued',
        });
    } catch (error) {
        console.error('Error starting render:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
