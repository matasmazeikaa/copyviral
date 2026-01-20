import { NextRequest, NextResponse } from 'next/server';
import { scrapeVideo } from '@/app/services/videoScraperService';
import { createClient } from '@/app/utils/supabase/server';

export async function POST(request: NextRequest) {
  try {
    // Require authentication
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { url, platform } = body;

    if (!url) {
      return NextResponse.json(
        { error: 'URL is required' },
        { status: 400 }
      );
    }

    const result = await scrapeVideo({ url, platform });
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in scrape-video API:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to scrape video' 
      },
      { status: 500 }
    );
  }
}

