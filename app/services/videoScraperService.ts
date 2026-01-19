import { ApifyClient } from 'apify-client';

/**
 * Video Scraper Service using Apify API
 * Supports Instagram
 */

export type Platform = 'instagram';

export interface ScrapeResult {
  videoUrl: string;
  downloadUrl: string;
  title?: string;
  description?: string;
  thumbnail?: string;
  duration?: number;
  platform: Platform;
  originalUrl: string;
}

export interface ScrapeOptions {
  url: string;
  platform?: Platform;
}

// Type for Apify result items (can vary by platform)
interface ApifyResultItem {
  videoUrl?: string;
  video?: string;
  videoDownloadUrl?: string;
  downloadUrl?: string;
  url?: string;
  text?: string;
  description?: string;
  caption?: string;
  imageUrl?: string;
  cover?: string;
  displayUrl?: string;
  thumbnail?: string;
  thumbnailUrl?: string;
  title?: string;
  duration?: number;
  videoDuration?: number;
  lengthSeconds?: number;
  [key: string]: unknown;
}

// Apify Actor IDs for each platform
// Can be overridden via environment variables: APIFY_ACTOR_INSTAGRAM
const APIFY_ACTORS = {
  instagram: process.env.APIFY_ACTOR_INSTAGRAM || 'apify~instagram-scraper',
} as const;

const apifyToken = process.env.APIFY_API_TOKEN;

const client = new ApifyClient({
  token: apifyToken,
});

// Detect platform from URL
export function detectPlatform(url: string): Platform | null {
  try {
    // Normalize URL - add protocol if missing
    let normalizedUrl = url.trim();
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = 'https://' + normalizedUrl;
    }
    
    const parsedUrl = new URL(normalizedUrl);
    const hostname = parsedUrl.hostname.toLowerCase();
    
    // Remove 'www.' prefix for consistent matching
    const hostnameWithoutWww = hostname.replace(/^www\./, '');
    
    // Instagram detection
    // Supports: instagram.com, instagr.am, www.instagram.com, m.instagram.com
    if (
      hostnameWithoutWww === 'instagram.com' ||
      hostnameWithoutWww === 'instagr.am' ||
      hostname.endsWith('.instagram.com') ||
      hostname.includes('instagram.com') ||
      hostname.includes('instagr.am')
    ) {
      return 'instagram';
    }
    
    return null;
  } catch {
    // If URL parsing fails, try simple string matching as fallback
    const lowerUrl = url.toLowerCase();
    
    if (lowerUrl.includes('instagram.com') || lowerUrl.includes('instagr.am')) {
      return 'instagram';
    }
    
    return null;
  }
}

// Validate URL format
export function validateUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Scrape video from URL using Apify API
 */
export async function scrapeVideo(options: ScrapeOptions): Promise<ScrapeResult> {
  const { url, platform } = options;
  
  // Validate URL
  if (!validateUrl(url)) {
    throw new Error('Invalid URL format');
  }
  
  // Detect platform if not provided
  const detectedPlatform = platform || detectPlatform(url);
  if (!detectedPlatform) {
    throw new Error('Unsupported platform. Only Instagram is supported.');
  }
  
  // Get Apify API token
  console.log(process.env.APIFY_API_TOKEN)
  if (!apifyToken) {
    throw new Error('APIFY_API_TOKEN environment variable is not set');
  }
  
  const actorId = APIFY_ACTORS[detectedPlatform];
  
  try {
    // Start Apify actor run
    const run = await client.actor("shu8hvrXbJbY3Eb9W").call({
      "directUrls": [
        url
      ],
      "resultsType": "posts",
      "resultsLimit": 1,
      "searchType": "hashtag",
      "searchLimit": 1,
      "addParentData": false
    });

    
        // Fetch and print Actor results from the run's dataset (if any)
    console.log('Results from dataset');
    const { items } = await client.dataset(run.defaultDatasetId).listItems();

    items.forEach((item) => {
        console.dir(item);
    });

    return extractVideoData(items, detectedPlatform, url);
  } catch (error) {
    console.error('Error scraping video:', error);
    throw error instanceof Error ? error : new Error('Failed to scrape video');
  }
}

/**
 * Get platform-specific options for Apify actors
 */
function getPlatformSpecificOptions(platform: Platform): Record<string, unknown> {
  switch (platform) {
    case 'instagram':
      return {
        resultsLimit: 1,
        downloadVideos: true,
        downloadCovers: false,
      };
    default:
      return {};
  }
}

/**
 * Wait for Apify actor run to complete
 */
async function waitForRunCompletion(
  actorId: string,
  runId: string,
  token: string,
  maxWaitTime = 300000 // 5 minutes
): Promise<ApifyResultItem[]> {
  const startTime = Date.now();
  const pollInterval = 3000; // 3 seconds
  
  while (Date.now() - startTime < maxWaitTime) {
    const statusResponse = await fetch(
      `https://api.apify.com/v2/actor-runs/${runId}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      }
    );
    
    if (!statusResponse.ok) {
      throw new Error(`Failed to check run status: ${statusResponse.status}`);
    }
    
    const statusData = await statusResponse.json();
    const status = statusData.data.status;
    
    if (status === 'SUCCEEDED') {
      // Get the dataset items
      const datasetId = statusData.data.defaultDatasetId;
      const datasetResponse = await fetch(
        `https://api.apify.com/v2/datasets/${datasetId}/items`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );
      
      if (!datasetResponse.ok) {
        throw new Error(`Failed to fetch dataset: ${datasetResponse.status}`);
      }
      
      const items = await datasetResponse.json();
      return items;
    }
    
    if (status === 'FAILED' || status === 'ABORTED') {
      throw new Error(`Actor run ${status.toLowerCase()}`);
    }
    
    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
  
  throw new Error('Run timeout: Actor run took too long to complete');
}

/**
 * Extract video data from Apify results
 */
function extractVideoData(
  items: ApifyResultItem[],
  platform: Platform,
  originalUrl: string
): ScrapeResult {
  if (!items || items.length === 0) {
    throw new Error('No video data found in scrape results');
  }
  
  const item = items[0] as ApifyResultItem;

  console.log(item)
  
  switch (platform) {
    case 'instagram':
      return {
        videoUrl: item.videoUrl || item.video || item.videoDownloadUrl || '',
        downloadUrl: item.videoUrl || item.video || item.videoDownloadUrl || '',
        title: item.caption || item.text || '',
        description: item.caption || item.text || '',
        thumbnail: item.displayUrl || item.imageUrl || '',
        duration: item.videoDuration,
        platform,
        originalUrl,
      };
    
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

/**
 * Download video from URL and return as buffer
 */
export async function downloadVideo(downloadUrl: string): Promise<Buffer> {
  try {
    const response = await fetch(downloadUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'video/webm,video/ogg,video/*;q=0.9,application/ogg;q=0.7,audio/*;q=0.6,*/*;q=0.5',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.google.com/',
      },
      redirect: 'follow',
    });
    
    if (!response.ok) {
      throw new Error(`Failed to download video: ${response.status} ${response.statusText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.error('Error downloading video:', error);
    throw error instanceof Error ? error : new Error('Failed to download video');
  }
}

