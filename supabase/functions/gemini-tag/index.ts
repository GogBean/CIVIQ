import { createClient } from "https://esm.sh/@supabase/supabase-js@2.31.0";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const VALID_CATEGORIES = [
  "Pothole",
  "Water Leakage",
  "Streetlight",
  "Waste",
  "Road Damage",
  "Flooding",
  "Other",
] as const;

interface GeoJsonPoint {
  type: "Point";
  coordinates: [number, number];
}

interface GeminiTagRecord {
  id: string;
  image_key: string;
  location: GeoJsonPoint | string | null;
  description: string | null;
}

interface GeminiTagOutput {
  category: string;
  severity: number;
  summary: string;
  recommended_department: string;
  estimated_priority: string;
  confidence: number;
  ward_id: string | null;
  status: "open";
}

function parseCoordinates(
  location: GeoJsonPoint | string | null | undefined,
): { lon: number; lat: number } | null {
  if (!location) return null;

  if (typeof location === "object" && Array.isArray(location.coordinates)) {
    const [lon, lat] = location.coordinates;
    if (typeof lon === "number" && typeof lat === "number") {
      return { lon, lat };
    }
    return null;
  }

  if (typeof location === "string") {
    const geoJsonMatch = location.match(/"coordinates"\s*:\s*\[\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\]/);
    if (geoJsonMatch) {
      return { lon: parseFloat(geoJsonMatch[1]), lat: parseFloat(geoJsonMatch[2]) };
    }

    const wktMatch = location.match(/POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i);
    if (wktMatch) {
      return { lon: parseFloat(wktMatch[1]), lat: parseFloat(wktMatch[2]) };
    }
  }

  return null;
}

function mimeTypeFromKey(imageKey: string): string {
  const ext = imageKey.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    default:
      return "image/jpeg";
  }
}

// ─── Generate 512-dim text embedding for duplicate detection ─────────────────
async function generateTextEmbedding(
  text: string,
  geminiApiKey: string,
): Promise<number[] | null> {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${geminiApiKey}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "models/text-embedding-004",
        content: { parts: [{ text }] },
        outputDimensionality: 512,
      }),
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    const values: number[] = json.embedding?.values;
    return values?.length > 0 ? values : null;
  } catch {
    return null;
  }
}

// ─── Download image from Supabase Storage ────────────────────────────────────
async function fetchImageFromStorage(
  imageKey: string,
  supabaseClient: ReturnType<typeof createClient>,
): Promise<{ base64: string; mimeType: string }> {
  console.log("[gemini-tag] step:storage.download:start", { imageKey });
  const { data, error } = await supabaseClient.storage
    .from("issue-images")
    .download(imageKey);
  console.log("[gemini-tag] step:storage.download:done", {
    hasData: !!data,
    error: error?.message ?? null,
  });
  if (error || !data) {
    throw new Error(`Failed to download image from Supabase Storage: ${error?.message ?? "no data"}`);
  }

  const imageBytes = new Uint8Array(await data.arrayBuffer());
  let binary = "";
  for (let i = 0; i < imageBytes.byteLength; i++) {
    binary += String.fromCharCode(imageBytes[i]);
  }

  return {
    base64: btoa(binary),
    mimeType: mimeTypeFromKey(imageKey),
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // 1) auth / request start
  console.log("[gemini-tag] request:start", {
    method: req.method,
    hasAuthorization: !!req.headers.get("authorization"),
    hasWebhookSecret: !!req.headers.get("x-webhook-secret"),
  });

  // ── Webhook secret validation ──────────────────────────────────────────────
  // The pg_net trigger and any authorised caller must pass x-webhook-secret.
  const webhookSecret = Deno.env.get("WEBHOOK_SECRET") || "";
  if (webhookSecret) {
    const incomingSecret =
      req.headers.get("x-webhook-secret") ||
      req.headers.get("authorization")?.replace("Bearer ", "") ||
      "";
    if (incomingSecret !== webhookSecret) {
      console.log("[gemini-tag] auth:invalid", {
        incomingHasAuth: !!incomingSecret,
        matches: incomingSecret === webhookSecret,
      });
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  try {
    console.log("[gemini-tag] step:parse-body:start");
    const body = await req.json();
    const record = body.record as GeminiTagRecord | undefined;
    console.log("[gemini-tag] step:record:extracted", {
      hasRecord: !!record,
      id: record?.id ?? null,
      imageKey: record?.image_key ?? null,
      hasLocation: !!record?.location,
      hasDescription: !!record?.description,
    });

    if (!record?.id) {
      return new Response(JSON.stringify({ error: "record.id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!record.image_key) {
      return new Response(JSON.stringify({ error: "record.image_key is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY") || "";

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Supabase URL or Service Role Key is not configured");
    }
    if (!geminiApiKey) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);
    const { base64: base64Image, mimeType } = await fetchImageFromStorage(record.image_key, supabaseClient);

    const descriptionText = record.description?.trim() || "No description provided.";
    const classificationPrompt = `Analyze this image of a civic issue reported in India.

Citizen description: "${descriptionText}"

Return a JSON object matching this structure:
{
  "category": "Pothole" | "Water Leakage" | "Streetlight" | "Waste" | "Road Damage" | "Flooding" | "Other",
  "severity": 1 | 2 | 3 | 4 | 5,
  "confidence": 0.0 to 1.0,
  "summary": "Brief 1-sentence civic summary suitable for authority escalation.",
  "recommended_department": "Name of responsible local body department",
  "estimated_priority": "Low" | "Medium" | "High"
}

Provide ONLY the valid raw JSON object. Do not include markdown code block formatting.`;

    const geminiFlashUrl =
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`;
    console.log("[gemini-tag] step:gemini.request:start");
    const flashResponse = await fetch(geminiFlashUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inlineData: { mimeType, data: base64Image } },
            { text: classificationPrompt },
          ],
        }],
        generationConfig: {
          responseMimeType: "application/json",
        },
      }),
    });
    console.log("[gemini-tag] step:gemini.request:done", {
      ok: flashResponse.ok,
      status: flashResponse.status,
    });
    if (!flashResponse.ok) {
      const errText = await flashResponse.text();
      throw new Error(`Gemini 2.0 Flash API error: ${errText}`);
    }

    const flashResult = await flashResponse.json();
    const generatedText = flashResult.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!generatedText) {
      throw new Error("Gemini 2.0 Flash returned an empty response");
    }
    console.log("[gemini-tag] step:gemini.json.parse:start", {
      preview: generatedText.slice(0, 120),
    });
    const aiOutput = JSON.parse(generatedText.trim());

    let targetWardId: string | null = null;
    const coords = parseCoordinates(record.location);
    if (coords) {
      const { data: wardId, error: rpcError } = await supabaseClient.rpc(
        "find_ward_by_location",
        { lon: coords.lon, lat: coords.lat },
      );
      if (!rpcError && wardId) {
        targetWardId = wardId;
      }
    }

    const category = VALID_CATEGORIES.includes(aiOutput.category)
      ? aiOutput.category
      : "Other";
    const severity = Math.min(5, Math.max(1, Math.round(Number(aiOutput.severity) || 3)));
    const confidence = Math.min(1, Math.max(0, Number(aiOutput.confidence) || 0.5));
    const summary = aiOutput.summary || "";
    const recommendedDepartment = aiOutput.recommended_department || "Municipal Authority";
    const estimatedPriority = ["Low", "Medium", "High"].includes(aiOutput.estimated_priority)
      ? aiOutput.estimated_priority
      : "Medium";

    // ── Generate text embedding for duplicate detection ─────────────────────
    // Embed the AI summary so future check-duplicate calls can do cosine similarity.
    const embeddingText = [category, summary, recommendedDepartment]
      .filter(Boolean)
      .join(" — ");
    const embedding = await generateTextEmbedding(embeddingText, geminiApiKey);
    console.log("[gemini-tag] step:issues.update:start", {
      id: record.id,
      wardId: targetWardId,
      category,
      severity,
      confidence,
      estimatedPriority,
    });
    const { error: updateError } = await supabaseClient
      .from("issues")
      .update({
        category,
        severity,
        summary,
        recommended_department: recommendedDepartment,
        estimated_priority: estimatedPriority,
        confidence,
        ward_id: targetWardId,
        status: "open",
        ...(embedding ? { embedding: JSON.stringify(embedding) } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", record.id);

    if (updateError) {
      throw new Error(`Failed to update issue: ${updateError.message}`);
    }

    const output: GeminiTagOutput = {
      category,
      severity,
      summary,
      recommended_department: recommendedDepartment,
      estimated_priority: estimatedPriority,
      confidence,
      ward_id: targetWardId,
      status: "open",
    };

    return new Response(
      JSON.stringify({ success: true, issueId: record.id, ...output }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[gemini-tag] step:catch", {
      message,
      error,
    });
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
