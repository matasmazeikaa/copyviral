# Lambda Video Rendering Setup

This directory contains an AWS Lambda function for server-side video rendering using FFmpeg.

## Why Lambda?

- **5-20x faster** than browser-based FFmpeg WASM
- **~$0.006 per render** (60-second video)
- **Background processing** - users can close their browser
- **Native FFmpeg** with full codec support

## Architecture

```
Vercel API → SQS Queue → Lambda (FFmpeg) → Supabase Storage → Supabase DB (status)
```

**Note:** This setup uses Supabase Storage instead of S3 to keep everything in one place.

## Setup Instructions

### 1. AWS Resources Required

- **SQS Queue**: Job queue (Standard or FIFO)
- **Lambda Function**: Video processing
- **IAM Role**: Lambda execution role with SQS permissions

### 2. Run Supabase Migrations

This creates the `render_jobs` table and `renders` storage bucket:

```bash
supabase db push
# or
supabase migration up
```

### 3. Create SQS Queue

```bash
aws sqs create-queue \
  --queue-name video-render-queue \
  --region us-east-1
```

https://sqs.us-east-1.amazonaws.com/729661739551/video-render-queue

Save the Queue URL from the output.

### 4. Create IAM Role for Lambda

```bash
# Create role
aws iam create-role \
  --role-name lambda-video-render-role \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"Service": "lambda.amazonaws.com"},
      "Action": "sts:AssumeRole"
    }]
  }'

# Attach policies (only need Lambda basics + SQS, storage is via Supabase)
aws iam attach-role-policy \
  --role-name lambda-video-render-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

aws iam attach-role-policy \
  --role-name lambda-video-render-role \
  --policy-arn arn:aws:iam::aws:policy/AmazonSQSFullAccess
```

### 5. Build & Deploy Lambda

```bash
cd lambda/render

# Install dependencies
npm install

# Build TypeScript
npm run build

# Create deployment package
zip -r function.zip dist node_modules

# Create function (first time)
aws lambda create-function \
  --function-name video-render \
  --runtime nodejs20.x \
  --handler dist/index.handler \
  --role arn:aws:lambda:us-east-1:729661739551:layer:ffmpeg \
  --memory-size 3008 \
  --timeout 900 \
  --layers arn:aws:lambda:us-east-1:678847473642:layer:ffmpeg:1 \
  --zip-file fileb://function.zip \
  --environment "Variables={
    AWS_REGION=us-east-1,
    SUPABASE_URL=https://ubmehaomchkmufzoagaa.supabase.co,
    SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVibWVoYW9tY2hrbXVmem9hZ2FhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MzY4MjA0MywiZXhwIjoyMDc5MjU4MDQzfQ.K9dmHd3BF8U2qP4v33A2qNIAbdp_lKONGseB2eQNxbU,
    FONT_BASE_URL=https://app.copyviral.com/fonts
  }"

# Or update existing function
aws lambda update-function-code \
  --function-name video-render \
  --zip-file fileb://function.zip
```

### 6. Connect SQS to Lambda

```bash
aws lambda create-event-source-mapping \
  --function-name video-render \
  --event-source-arn arn:aws:sqs:us-east-1:729661739551:video-render-queue \
  --batch-size 1
```

### 7. Add Environment Variables to Vercel

Add these to your Vercel project settings or `.env.local`:

```bash
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_SQS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/123456789/video-render-queue
```

## Environment Variables

### Vercel App (.env.local)

```bash
# AWS credentials for SQS access
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key
AWS_SQS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/YOUR_ACCOUNT/video-render-queue
```

### Lambda Function

```bash
AWS_REGION=us-east-1
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...
FONT_BASE_URL=https://your-app.vercel.app/fonts
```

**Note:** Rendered videos are stored in Supabase Storage bucket `renders`.

## Usage in Your App

```tsx
import { useCloudRender } from '@/app/hooks/useCloudRender';

function ExportButton() {
  const { startRender, jobs, activeJobs, completedJobs } = useCloudRender({
    onComplete: (job) => {
      console.log('Render complete!', job.downloadUrl);
    },
    onError: (jobId, error) => {
      console.error('Render failed:', error);
    },
    autoDownload: true,
  });

  const handleExport = async () => {
    await startRender({
      mediaFiles,
      textElements,
      exportSettings,
      totalDuration,
      resolution: { width: 1080, height: 1920 },
      fps: 30,
    });
  };

  return (
    <div>
      <button onClick={handleExport}>Export Video</button>
      {activeJobs.map(job => (
        <div key={job.id}>
          Rendering... {job.progress}%
        </div>
      ))}
    </div>
  );
}
```

## Cost Estimates

| Renders/month | Lambda | Supabase Storage* | SQS | Total |
|---------------|--------|-------------------|-----|-------|
| 100 | $0.60 | Free tier | ~$0 | ~$0.60 |
| 1,000 | $6.00 | ~$2 | ~$0 | ~$8 |
| 10,000 | $60 | ~$20 | $0.01 | ~$80 |

*Supabase Free tier includes 1GB storage. Pro plan ($25/mo) includes 100GB.*

*Plus your Vercel plan costs*

## Troubleshooting

### Lambda timeout
- Increase timeout (max 15 minutes)
- Reduce video quality/resolution
- Check if input files are too large

### FFmpeg errors
- Check CloudWatch logs for detailed FFmpeg output
- Ensure fonts are accessible at FONT_BASE_URL
- Verify input video URLs are publicly accessible

### Supabase Storage errors
- Check that the `renders` bucket exists and is public
- Verify SUPABASE_SERVICE_ROLE_KEY is correct
- Check Supabase Storage quota hasn't been exceeded

## FFmpeg Layer

Using custom FFmpeg layer with drawtext support (BtbN build):
```
arn:aws:lambda:us-east-1:729661739551:layer:ffmpeg-drawtext:1
```

This layer includes FFmpeg 7.1 with full filter support including `drawtext` for text overlays.

To update the layer:
```bash
cd lambda/ffmpeg-layer
# Download latest BtbN build
curl -L -o ffmpeg-btbn.tar.xz "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz"
tar -xf ffmpeg-btbn.tar.xz
mkdir -p bin && cp ffmpeg-master-latest-linux64-gpl/bin/ffmpeg bin/
zip -j ffmpeg-layer.zip bin/ffmpeg
aws s3 cp ffmpeg-layer.zip s3://copyviral-lambda-layers/ffmpeg-layer.zip
aws lambda publish-layer-version --layer-name ffmpeg-drawtext --content S3Bucket=copyviral-lambda-layers,S3Key=ffmpeg-layer.zip --compatible-runtimes nodejs20.x
```
