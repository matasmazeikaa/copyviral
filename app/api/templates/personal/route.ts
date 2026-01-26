import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/app/utils/supabase/server";

// ============================================
// Validation Utilities
// ============================================

interface ValidationError {
    field: string;
    message: string;
}

function validateUUID(value: string, field: string): ValidationError | null {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(value)) {
        return { field, message: 'Invalid UUID format' };
    }
    return null;
}

function validateString(value: any, field: string, minLength = 1, maxLength = 500): ValidationError | null {
    if (typeof value !== 'string') {
        return { field, message: 'Must be a string' };
    }
    if (value.length < minLength) {
        return { field, message: `Must be at least ${minLength} characters` };
    }
    if (value.length > maxLength) {
        return { field, message: `Must be at most ${maxLength} characters` };
    }
    return null;
}

function validateNumber(value: any, field: string, min?: number, max?: number): ValidationError | null {
    if (typeof value !== 'number' || isNaN(value)) {
        return { field, message: 'Must be a number' };
    }
    if (min !== undefined && value < min) {
        return { field, message: `Must be at least ${min}` };
    }
    if (max !== undefined && value > max) {
        return { field, message: `Must be at most ${max}` };
    }
    return null;
}

function validateUrl(value: any, field: string): ValidationError | null {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'string') {
        return { field, message: 'Must be a string' };
    }
    try {
        new URL(value);
        return null;
    } catch {
        return { field, message: 'Must be a valid URL' };
    }
}

function validateTemplateSlot(slot: any, index: number): ValidationError[] {
    const errors: ValidationError[] = [];
    const prefix = `slots[${index}]`;
    
    if (!slot || typeof slot !== 'object') {
        return [{ field: prefix, message: 'Must be an object' }];
    }
    
    if (slot.id) {
        const uuidError = validateUUID(slot.id, `${prefix}.id`);
        if (uuidError) errors.push(uuidError);
    }
    
    const indexError = validateNumber(slot.index, `${prefix}.index`, 1);
    if (indexError) errors.push(indexError);
    
    const durationError = validateNumber(slot.duration, `${prefix}.duration`, 0.01);
    if (durationError) errors.push(durationError);
    
    const startError = validateNumber(slot.positionStart, `${prefix}.positionStart`, 0);
    if (startError) errors.push(startError);
    
    const endError = validateNumber(slot.positionEnd, `${prefix}.positionEnd`, 0.01);
    if (endError) errors.push(endError);
    
    if (!['video', 'audio', 'image', 'unknown'].includes(slot.mediaType)) {
        errors.push({ field: `${prefix}.mediaType`, message: 'Must be video, audio, image, or unknown' });
    }
    
    return errors;
}

function validateTemplateTextElement(text: any, index: number): ValidationError[] {
    const errors: ValidationError[] = [];
    const prefix = `textElements[${index}]`;
    
    if (!text || typeof text !== 'object') {
        return [{ field: prefix, message: 'Must be an object' }];
    }
    
    if (text.id) {
        const uuidError = validateUUID(text.id, `${prefix}.id`);
        if (uuidError) errors.push(uuidError);
    }
    
    const textError = validateString(text.text, `${prefix}.text`, 1, 500);
    if (textError) errors.push(textError);
    
    const startError = validateNumber(text.positionStart, `${prefix}.positionStart`, 0);
    if (startError) errors.push(startError);
    
    const endError = validateNumber(text.positionEnd, `${prefix}.positionEnd`, 0.01);
    if (endError) errors.push(endError);
    
    if (typeof text.x !== 'number') {
        errors.push({ field: `${prefix}.x`, message: 'Must be a number' });
    }
    
    if (typeof text.y !== 'number') {
        errors.push({ field: `${prefix}.y`, message: 'Must be a number' });
    }
    
    if (typeof text.isEditable !== 'boolean') {
        errors.push({ field: `${prefix}.isEditable`, message: 'Must be a boolean' });
    }
    
    return errors;
}

function validateTemplateData(data: any): ValidationError[] {
    const errors: ValidationError[] = [];
    
    if (!data || typeof data !== 'object') {
        return [{ field: 'templateData', message: 'Must be an object' }];
    }
    
    // Validate slots
    if (!Array.isArray(data.slots) || data.slots.length < 1) {
        errors.push({ field: 'templateData.slots', message: 'Must have at least 1 slot' });
    } else {
        data.slots.forEach((slot: any, index: number) => {
            errors.push(...validateTemplateSlot(slot, index));
        });
    }
    
    // Validate textElements
    if (!Array.isArray(data.textElements)) {
        errors.push({ field: 'templateData.textElements', message: 'Must be an array' });
    } else {
        data.textElements.forEach((text: any, index: number) => {
            errors.push(...validateTemplateTextElement(text, index));
        });
    }
    
    // Validate resolution
    if (!data.resolution || typeof data.resolution !== 'object') {
        errors.push({ field: 'templateData.resolution', message: 'Must be an object' });
    } else {
        if (typeof data.resolution.width !== 'number' || data.resolution.width <= 0) {
            errors.push({ field: 'templateData.resolution.width', message: 'Must be a positive number' });
        }
        if (typeof data.resolution.height !== 'number' || data.resolution.height <= 0) {
            errors.push({ field: 'templateData.resolution.height', message: 'Must be a positive number' });
        }
    }
    
    // Validate fps
    if (typeof data.fps !== 'number' || data.fps <= 0) {
        errors.push({ field: 'templateData.fps', message: 'Must be a positive number' });
    }
    
    // Validate aspectRatio
    if (typeof data.aspectRatio !== 'string') {
        errors.push({ field: 'templateData.aspectRatio', message: 'Must be a string' });
    }
    
    return errors;
}

function validateCreateUserTemplate(body: any): ValidationError[] {
    const errors: ValidationError[] = [];
    
    // Required: name
    const nameError = validateString(body.name, 'name', 1, 100);
    if (nameError) errors.push(nameError);
    
    // Optional: thumbnailUrl
    if (body.thumbnailUrl !== undefined && body.thumbnailUrl !== null) {
        const urlError = validateUrl(body.thumbnailUrl, 'thumbnailUrl');
        if (urlError) errors.push(urlError);
    }
    
    // Required: templateData
    if (!body.templateData) {
        errors.push({ field: 'templateData', message: 'Required' });
    } else {
        errors.push(...validateTemplateData(body.templateData));
    }
    
    return errors;
}

/**
 * GET /api/templates/personal
 * List all templates for the authenticated user
 */
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        
        // Check authentication
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }
        
        const { searchParams } = new URL(request.url);
        
        // Validate query parameters
        const limitStr = searchParams.get('limit');
        const offsetStr = searchParams.get('offset');
        
        let limit = 50;
        let offset = 0;
        
        if (limitStr) {
            const parsed = parseInt(limitStr, 10);
            if (isNaN(parsed) || parsed < 1 || parsed > 100) {
                return NextResponse.json(
                    { error: "Invalid limit parameter (must be 1-100)" },
                    { status: 400 }
                );
            }
            limit = parsed;
        }
        
        if (offsetStr) {
            const parsed = parseInt(offsetStr, 10);
            if (isNaN(parsed) || parsed < 0) {
                return NextResponse.json(
                    { error: "Invalid offset parameter (must be >= 0)" },
                    { status: 400 }
                );
            }
            offset = parsed;
        }
        
        const { data, error } = await supabase
            .from('templates')
            .select('*')
            .eq('type', 'personal')
            .eq('userId', user.id)
            .order('updatedAt', { ascending: false })
            .range(offset, offset + limit - 1);
        
        if (error) {
            console.error('Error fetching user templates:', error);
            return NextResponse.json(
                { error: "Failed to fetch templates" },
                { status: 500 }
            );
        }
        
        return NextResponse.json({ templates: data || [] });
    } catch (error) {
        console.error('GET user templates error:', error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

/**
 * POST /api/templates/personal
 * Create a new personal template
 */
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        
        // Check authentication
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }
        
        const body = await request.json();
        
        // Validate request body
        const errors = validateCreateUserTemplate(body);
        
        if (errors.length > 0) {
            return NextResponse.json(
                { error: "Validation failed", details: errors },
                { status: 400 }
            );
        }
        
        const { data, error } = await supabase
            .from('templates')
            .insert({
                type: 'personal',
                userId: user.id,
                name: body.name,
                thumbnailUrl: body.thumbnailUrl || null,
                templateData: body.templateData,
                isActive: true,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            })
            .select()
            .single();
        
        if (error) {
            console.error('Error creating user template:', error);
            return NextResponse.json(
                { error: "Failed to create template" },
                { status: 500 }
            );
        }
        
        return NextResponse.json({ template: data }, { status: 201 });
    } catch (error) {
        console.error('POST user template error:', error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

/**
 * PUT /api/templates/personal
 * Update a personal template
 */
export async function PUT(request: NextRequest) {
    try {
        const supabase = await createClient();
        
        // Check authentication
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }
        
        const body = await request.json();
        
        // Validate ID
        if (!body.id) {
            return NextResponse.json(
                { error: "Template ID is required" },
                { status: 400 }
            );
        }
        
        const uuidError = validateUUID(body.id, 'id');
        if (uuidError) {
            return NextResponse.json(
                { error: "Invalid template ID format" },
                { status: 400 }
            );
        }
        
        // Validate other fields if provided
        const errors: ValidationError[] = [];
        
        if (body.name !== undefined) {
            const nameError = validateString(body.name, 'name', 1, 100);
            if (nameError) errors.push(nameError);
        }
        
        if (body.thumbnailUrl !== undefined && body.thumbnailUrl !== null) {
            const urlError = validateUrl(body.thumbnailUrl, 'thumbnailUrl');
            if (urlError) errors.push(urlError);
        }
        
        if (body.templateData !== undefined) {
            errors.push(...validateTemplateData(body.templateData));
        }
        
        if (errors.length > 0) {
            return NextResponse.json(
                { error: "Validation failed", details: errors },
                { status: 400 }
            );
        }
        
        // Build update object (only include defined fields)
        const updateFields: Record<string, any> = {
            updatedAt: new Date().toISOString(),
        };
        
        if (body.name !== undefined) updateFields.name = body.name;
        if (body.thumbnailUrl !== undefined) updateFields.thumbnailUrl = body.thumbnailUrl;
        if (body.templateData !== undefined) updateFields.templateData = body.templateData;
        
        const { data, error } = await supabase
            .from('templates')
            .update(updateFields)
            .eq('id', body.id)
            .eq('type', 'personal')
            .eq('userId', user.id)  // Ensure user owns the template
            .select()
            .single();
        
        if (error) {
            if (error.code === 'PGRST116') {
                return NextResponse.json(
                    { error: "Template not found or access denied" },
                    { status: 404 }
                );
            }
            console.error('Error updating user template:', error);
            return NextResponse.json(
                { error: "Failed to update template" },
                { status: 500 }
            );
        }
        
        return NextResponse.json({ template: data });
    } catch (error) {
        console.error('PUT user template error:', error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/templates/personal
 * Delete a personal template
 */
export async function DELETE(request: NextRequest) {
    try {
        const supabase = await createClient();
        
        // Check authentication
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }
        
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        
        if (!id) {
            return NextResponse.json(
                { error: "Template ID is required" },
                { status: 400 }
            );
        }
        
        // Validate UUID
        const uuidError = validateUUID(id, 'id');
        if (uuidError) {
            return NextResponse.json(
                { error: "Invalid template ID format" },
                { status: 400 }
            );
        }
        
        const { error } = await supabase
            .from('templates')
            .delete()
            .eq('id', id)
            .eq('type', 'personal')
            .eq('userId', user.id);  // Ensure user owns the template
        
        if (error) {
            console.error('Error deleting user template:', error);
            return NextResponse.json(
                { error: "Failed to delete template" },
                { status: 500 }
            );
        }
        
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('DELETE user template error:', error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
