/**
 * AWS Lambda function for video rendering with FFmpeg
 *
 * This function is triggered by SQS messages and renders videos using native FFmpeg.
 * It's significantly faster than browser-based FFmpeg WASM.
 *
 * Required Lambda configuration:
 * - Runtime: Node.js 18.x or 20.x
 * - Memory: 3008 MB (recommended)
 * - Timeout: 15 minutes (900 seconds)
 * - Layers: FFmpeg layer (arn:aws:lambda:us-east-1:678847473642:layer:ffmpeg:1)
 *
 * Environment variables:
 * - AWS_REGION
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 * - FONT_BASE_URL (your Vercel app URL for fonts)
 *
 * Storage: Uses Supabase Storage (bucket: "renders")
 */
import { SQSEvent } from 'aws-lambda';
export declare const handler: (event: SQSEvent) => Promise<{
    statusCode: number;
    body: string;
}>;
//# sourceMappingURL=index.d.ts.map