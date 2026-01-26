import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { createClient, createAdminClient } from "@/app/utils/supabase/server";

const apiKey = process.env.GEMINI_API_KEY;

const TEXT_REGENERATION_PROMPT = `You are a creative copywriter for short-form video content (TikTok, Instagram Reels, YouTube Shorts).

Given the original text and context, generate a NEW alternative text that:
1. Has similar length (within 20% of original)
2. Maintains the same tone and energy
3. Is fresh, engaging, and suitable for video overlays
4. Avoids clichés and generic phrases
5. Is creative and attention-grabbing

Return ONLY the new text, nothing else. No quotes, no explanation, just the text.`;

const FREE_TIER_LIMIT = 3;

export async function POST(request: NextRequest) {
    try {
        // Check authentication
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        // Check AI usage limits before processing
        const { data: profile } = await supabase
            .from('user_profiles')
            .select('subscriptionStatus, aiGenerationsUsed')
            .eq('id', user.id)
            .single();

        const subscriptionStatus = profile?.subscriptionStatus || 'free';
        const aiGenerationsUsed = profile?.aiGenerationsUsed || 0;
        const isPremium = subscriptionStatus === 'active';

        if (!isPremium && aiGenerationsUsed >= FREE_TIER_LIMIT) {
            return NextResponse.json(
                { error: "AI generation limit reached. Please upgrade to Pro for unlimited generations." },
                { status: 403 }
            );
        }

        if (!apiKey) {
            return NextResponse.json(
                { error: "Gemini API key not configured" },
                { status: 500 }
            );
        }

        const body = await request.json();
        const { originalText, currentText, context } = body;

        if (!originalText && !currentText) {
            return NextResponse.json(
                { error: "Text is required" },
                { status: 400 }
            );
        }

        const textToRegenerate = currentText || originalText;

        const ai = new GoogleGenAI({ apiKey });

        const prompt = `${TEXT_REGENERATION_PROMPT}

Context: ${context || 'video template'}
Original text: "${originalText}"
Current text: "${textToRegenerate}"

Generate a creative alternative:`;

        const response = await ai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: prompt,
        });

        const generatedText = response.text?.trim() || textToRegenerate;

        // Clean up the response (remove quotes if present)
        const cleanText = generatedText
            .replace(/^["']|["']$/g, '') // Remove surrounding quotes
            .trim();

        // Increment AI generation usage for non-premium users
        if (!isPremium) {
            const adminClient = createAdminClient();
            const { error: updateError } = await adminClient
                .from('user_profiles')
                .update({
                    aiGenerationsUsed: aiGenerationsUsed + 1,
                    updatedAt: new Date().toISOString(),
                })
                .eq('id', user.id);
            
            if (updateError) {
                console.error('Failed to increment AI usage:', updateError);
            }
        }

        return NextResponse.json({ text: cleanText });
    } catch (error: any) {
        console.error("Error regenerating text:", error);

        // Check for 503 overloaded error
        const isOverloaded =
            error?.error?.code === 503 ||
            error?.code === 503 ||
            error?.message?.includes("overloaded") ||
            error?.error?.message?.includes("overloaded");

        if (isOverloaded) {
            return NextResponse.json(
                { error: "The AI model is currently overloaded. Please try again later.", code: 503 },
                { status: 503 }
            );
        }

        return NextResponse.json(
            { error: "Failed to regenerate text" },
            { status: 500 }
        );
    }
}
