import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";
import { createClient } from "@/app/utils/supabase/server";

const apiKey = process.env.GEMINI_API_KEY;

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

    if (!apiKey) {
      return NextResponse.json(
        { error: "Gemini API key not configured" },
        { status: 500 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    // Get the form data with the video file
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    // Convert file to base64
    const arrayBuffer = await file.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString("base64");

    // Call Gemini API
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: file.type || "video/mp4",
              data: base64Data,
            },
          },
          {
            text: `Analyze this video with absolute frame precision.

                  You MUST NOT guess or estimate anything. 
                  Only respond with information that is directly observable in the provided video frames.

                  ---------------------------------------------------------
                  TASK 1 — FRAME-PERFECT SHOT DETECTION
                  ---------------------------------------------------------
                  Identify every shot/cut using FRAME DIFFERENCE analysis.

                  Rules:
                  - A "cut" = an instantaneous visible change between two frames.
                  - If a shot contains motion or transitions, you must still detect the exact moment the new shot begins.
                  - NO approximations.
                  - Use the video's true FPS to calculate durations.
                  - Duration of each shot must be EXACT: total_frames_in_shot / FPS.

                  Return an array of numbers, each representing duration in seconds with 2 decimal places.
                  Example: [1.23, 0.96, 2.00]

                  Format:
                  "durations": [ ... ]

                  ---------------------------------------------------------
                  TASK 2 — LAYOUT & SCALE ANALYSIS
                  ---------------------------------------------------------
                  Analyze ONLY the visible video content (ignore letterboxing/cropping done by the preview UI).

                  Return:

                  - "mode":
                      - "cover" = 9:16 full-screen portrait content.
                      - "fit"   = 16:9 landscape content.
                      - "square" = 1:1 content.
                  - If content is smaller than the frame (letterboxed or pillarboxed), detect which sides have black bars.
                  - "scale": EXACT zoom level relative to original frame.  
                    - 1.0 = no zoom  
                    - >1.0 = zoomed-in  
                    - <1.0 = zoomed-out (content pillarboxed/letterboxed)

                  Format:
                  "layout": {
                    "mode": "...",
                    "scale": NUMBER
                  }

                  ---------------------------------------------------------
                  TASK 3 — TEXT OVERLAY DETECTION (FRAME PERFECT)
                  ---------------------------------------------------------
                  Identify EVERY distinct text overlay.

                  Apply this specific Coordinate System (Web/CSS Standard):

                  Aspect Ratio: 9:16 (Vertical)

                  Origin Point: Top-Left corner is X=0, Y=0.

                  Y-Axis Scale: 
                  - The absolute top edge of the video is Y = 0. 
                  - The absolute bottom edge of the video is Y = 1980.

                  X-Axis Scale: 
                  - The absolute left edge is X = 0.
                  - Calculate the max X width proportionally based on 9:16 ratio relative to Y (Max X ≈ 1114).

                  For each text element:
                  - Extract exact text (character-perfect).
                  - "start_time" = exact timestamp (seconds with 2 decimals).
                  - "end_time"   = exact timestamp (seconds with 2 decimals).
                  - "duration"   = end_time - start_time.
                  - "y_axis_scale" = pixel distance from the TOP edge of the video (0 to 1980).
                  - "x_axis_scale" = pixel distance from the LEFT edge of the video.
                  - "font_size" = font size in pixels.

                  You must detect text even if:
                  - There are multiple text layers at once
                  - Text is partially cropped

                  Format:
                  "textLayers": [
                    {
                      "content": "string",
                      "start_time": NUMBER,
                      "end_time": NUMBER,
                      "duration": NUMBER,
                      "y_axis_scale": NUMBER,
                      "x_axis_scale": NUMBER,
                      "font_size": NUMBER
                    }
                ]`,
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            durations: { type: Type.ARRAY, items: { type: Type.STRING } },
            layout: {
              type: Type.OBJECT,
              properties: {
                mode: { type: Type.STRING, enum: ["cover", "fit", "square"] },
                scale: { type: Type.NUMBER },
              },
            },
            text_overlays: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  text: { type: Type.STRING },
                  start_time: { type: Type.NUMBER },
                  duration: { type: Type.NUMBER },
                  y_axis_scale: { type: Type.NUMBER },
                  font_size: { type: Type.NUMBER },
                },
              },
            },
          },
        },
      },
    });

    const jsonText = response.text?.trim() || "{}";
    const json = JSON.parse(jsonText);

    console.log("Gemini response:", json);

    const layoutMode = (json.layout?.mode as "cover" | "fit" | "square") || "cover";
    const validModes = ["cover", "fit", "square"];
    const finalMode = validModes.includes(layoutMode) ? layoutMode : "cover";

    const rawLayers = json.text_overlays || [];

    const mappedLayers = rawLayers.map((l: any) => {
      const rawVertPos = typeof l.y_axis_scale === "number" ? l.y_axis_scale : 0;

      return {
        content: l.text || "Text",
        start: typeof l.start_time === "number" ? l.start_time : 0,
        duration: typeof l.duration === "number" ? l.duration : 2,
        verticalPos: rawVertPos,
        fontSize: l.font_size,
      };
    });

    return NextResponse.json({
      durations: json.durations?.map((d: number) => Number(d)) || [2, 2, 2],
      textLayers: mappedLayers,
      settings: {
        videoMode: finalMode,
        videoScale: typeof json.layout?.scale === "number" ? json.layout.scale : 1.0,
      },
    });
  } catch (error: any) {
    console.error("Error analyzing video:", error);

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
      { error: "Failed to analyze video" },
      { status: 500 }
    );
  }
}
