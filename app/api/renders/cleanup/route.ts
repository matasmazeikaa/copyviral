import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/app/utils/supabase/server';

// Timeout in minutes for stuck renders
const STUCK_RENDER_TIMEOUT_MINUTES = 30;

/**
 * Verify the request is from Vercel Cron using CRON_SECRET
 */
function isAuthorizedCron(request: NextRequest): boolean {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    // Must have CRON_SECRET configured and matching
    if (!cronSecret) {
        console.error('CRON_SECRET not configured');
        return false;
    }
    
    if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
        return false;
    }
    
    return true;
}

/**
 * POST /api/renders/cleanup
 * 
 * Marks renders stuck in 'queued' or 'processing' for too long as 'failed'.
 * 
 * PROTECTED: Only callable by Vercel Cron with valid CRON_SECRET.
 * 
 * Setup:
 * 1. Add CRON_SECRET to Vercel environment variables
 * 2. Vercel Cron automatically sends Authorization: Bearer <CRON_SECRET>
 */
async function handleCleanup(request: NextRequest): Promise<NextResponse<{ cleaned: number } | { error: string }>> {
    // Only allow Vercel Cron with valid secret
    if (!isAuthorizedCron(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    try {
        const supabase = await createClient();
        
        // Calculate the cutoff time
        const cutoffTime = new Date(Date.now() - STUCK_RENDER_TIMEOUT_MINUTES * 60 * 1000).toISOString();
        
        // Find and update stuck renders
        const { data: stuckRenders, error: fetchError } = await supabase
            .from('render_jobs')
            .select('id')
            .in('status', ['queued', 'processing'])
            .lt('created_at', cutoffTime);
        
        if (fetchError) {
            console.error('Error fetching stuck renders:', fetchError);
            return NextResponse.json({ error: 'Failed to fetch stuck renders' }, { status: 500 });
        }
        
        if (!stuckRenders || stuckRenders.length === 0) {
            return NextResponse.json({ cleaned: 0 });
        }
        
        const stuckIds = stuckRenders.map(r => r.id);
        
        // Update stuck renders to failed status
        const { error: updateError } = await supabase
            .from('render_jobs')
            .update({
                status: 'failed',
                error_message: 'Render timed out after 30 minutes',
                updated_at: new Date().toISOString(),
            })
            .in('id', stuckIds);
        
        if (updateError) {
            console.error('Error updating stuck renders:', updateError);
            return NextResponse.json({ error: 'Failed to update stuck renders' }, { status: 500 });
        }
        
        console.log(`Cleaned up ${stuckIds.length} stuck render(s)`);
        
        return NextResponse.json({ cleaned: stuckIds.length });
    } catch (error) {
        console.error('Error in cleanup API:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function POST(request: NextRequest): Promise<NextResponse<{ cleaned: number } | { error: string }>> {
    return handleCleanup(request);
}

export async function GET(request: NextRequest): Promise<NextResponse<{ cleaned: number } | { error: string }>> {
    return handleCleanup(request);
}
