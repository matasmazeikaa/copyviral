import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/app/utils/supabase/server';

/**
 * Proxy endpoint to download videos from Instagram CDN
 * This bypasses CORS restrictions that prevent direct client-side fetching on mobile
 */
export async function POST(request: NextRequest) {
  try {
    // Require authentication
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { downloadUrl } = body;

    if (!downloadUrl) {
      return NextResponse.json(
        { error: 'Download URL is required' },
        { status: 400 }
      );
    }

    // Validate URL to prevent SSRF attacks
    const url = new URL(downloadUrl);
    const allowedHosts = [
      'cdninstagram.com',
      'scontent.cdninstagram.com',
      'instagram.com',
      'fbcdn.net',
      'scontent-',
    ];
    
    const isAllowed = allowedHosts.some(host => 
      url.hostname.includes(host) || url.hostname.endsWith(host)
    );
    
    if (!isAllowed) {
      return NextResponse.json(
        { error: 'Invalid download URL' },
        { status: 400 }
      );
    }

    // Fetch the video from Instagram CDN
    const videoResponse = await fetch(downloadUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'video/webm,video/ogg,video/*;q=0.9,application/ogg;q=0.7,audio/*;q=0.6,*/*;q=0.5',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.instagram.com/',
      },
      redirect: 'follow',
    });

    if (!videoResponse.ok) {
      console.error('Failed to fetch video from CDN:', videoResponse.status, videoResponse.statusText);
      return NextResponse.json(
        { error: `Failed to download video: ${videoResponse.status}` },
        { status: 502 }
      );
    }

    // Get the video as arrayBuffer and return it
    const videoBuffer = await videoResponse.arrayBuffer();
    const contentType = videoResponse.headers.get('content-type') || 'video/mp4';

    return new NextResponse(videoBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': videoBuffer.byteLength.toString(),
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Error in download proxy:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to download video' },
      { status: 500 }
    );
  }
}
