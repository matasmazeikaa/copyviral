import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/app/utils/supabase/server';

const STORAGE_BUCKET = 'issue-attachments';
const MAX_DESCRIPTION_LENGTH = 1024;
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
const ALLOWED_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES];

function getAttachmentType(mimeType: string): 'image' | 'video' | null {
    if (ALLOWED_IMAGE_TYPES.includes(mimeType)) return 'image';
    if (ALLOWED_VIDEO_TYPES.includes(mimeType)) return 'video';
    return null;
}

/**
 * POST /api/issues/report - Submit an issue report
 * 
 * Request body (FormData):
 * - description: string - Issue description (max 1024 chars)
 * - pageUrl: string - URL where the issue was encountered
 * - attachment?: File - Optional image or video attachment
 */
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const formData = await request.formData();
        const description = formData.get('description') as string;
        const pageUrl = formData.get('pageUrl') as string;
        const attachment = formData.get('attachment') as File | null;

        // Validate description
        if (!description || typeof description !== 'string') {
            return NextResponse.json({ error: 'Description is required' }, { status: 400 });
        }
        if (description.length > MAX_DESCRIPTION_LENGTH) {
            return NextResponse.json({ 
                error: `Description must be ${MAX_DESCRIPTION_LENGTH} characters or less` 
            }, { status: 400 });
        }

        let attachmentPath: string | null = null;
        let attachmentType: 'image' | 'video' | null = null;

        // Handle attachment upload if provided
        if (attachment && attachment.size > 0) {
            // Validate file type
            attachmentType = getAttachmentType(attachment.type);
            if (!attachmentType) {
                return NextResponse.json({ 
                    error: 'Invalid file type. Allowed: JPG, PNG, GIF, WebP, MP4, WebM, MOV' 
                }, { status: 400 });
            }

            // Validate file size
            if (attachment.size > MAX_FILE_SIZE_BYTES) {
                return NextResponse.json({ 
                    error: 'Attachment exceeds maximum size of 50MB' 
                }, { status: 400 });
            }

            // Generate unique file path
            const fileId = crypto.randomUUID();
            const fileExt = attachment.name.split('.').pop() || (attachmentType === 'image' ? 'png' : 'mp4');
            attachmentPath = `${user.id}/${fileId}.${fileExt}`;

            // Upload file to storage
            const arrayBuffer = await attachment.arrayBuffer();
            const { error: uploadError } = await supabase.storage
                .from(STORAGE_BUCKET)
                .upload(attachmentPath, arrayBuffer, {
                    contentType: attachment.type,
                    upsert: false,
                });

            if (uploadError) {
                console.error('Error uploading attachment:', uploadError);
                return NextResponse.json({ error: 'Failed to upload attachment' }, { status: 500 });
            }
        }

        // Insert issue report into database
        const { data: report, error: insertError } = await supabase
            .from('issue_reports')
            .insert({
                user_id: user.id,
                description,
                attachment_path: attachmentPath,
                attachment_type: attachmentType,
                page_url: pageUrl || null,
                status: 'new',
            })
            .select('id')
            .single();

        if (insertError) {
            console.error('Error creating issue report:', insertError);
            // If we uploaded an attachment, try to clean it up
            if (attachmentPath) {
                await supabase.storage.from(STORAGE_BUCKET).remove([attachmentPath]);
            }
            return NextResponse.json({ error: 'Failed to create issue report' }, { status: 500 });
        }

        return NextResponse.json({ 
            success: true, 
            reportId: report.id,
            message: 'Thank you for your feedback! We will review your report.' 
        });
    } catch (error: any) {
        console.error('Error in POST /api/issues/report:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
