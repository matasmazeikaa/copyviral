import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/app/utils/supabase/server";

/**
 * Validate UUID format
 */
function isValidUUID(value: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(value);
}

/**
 * GET /api/templates/community/[id]
 * Get a single community template by ID (public access)
 */
export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const { id } = params;
        
        // Validate UUID
        if (!isValidUUID(id)) {
            return NextResponse.json(
                { error: "Invalid template ID format" },
                { status: 400 }
            );
        }
        
        const supabase = await createClient();
        
        const { data, error } = await supabase
            .from('templates')
            .select('*')
            .eq('id', id)
            .eq('type', 'community')
            .eq('isActive', true)
            .single();
        
        if (error) {
            if (error.code === 'PGRST116') {
                return NextResponse.json(
                    { error: "Template not found" },
                    { status: 404 }
                );
            }
            console.error('Error fetching community template:', error);
            return NextResponse.json(
                { error: "Failed to fetch template" },
                { status: 500 }
            );
        }
        
        return NextResponse.json({ template: data });
    } catch (error) {
        console.error('GET community template error:', error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
