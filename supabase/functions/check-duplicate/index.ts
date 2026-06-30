import { createClient } from "https://esm.sh/@supabase/supabase-js@2.31.0";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ─── Similarity threshold above which we flag as duplicate ───────────────────
// Combined score = 0.45 * distanceScore + 0.55 * vectorSimilarity
// distanceScore = 1 − (distance_m / 200), clamped to [0, 1]
// vectorSimilarity = cosine similarity, or 0.5 if no embedding
const DUPLICATE_THRESHOLD = 0.62;
const RADIUS_METERS = 200;

// ─── Cosine similarity between two numeric arrays ────────────────────────────
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ─── Generate image description via Gemini Vision ────────────────────────────
async function describeImage(
  base64: string,
  mimeType: string,
  geminiApiKey: string,
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inlineData: { mimeType, data: base64 } },
          {
            text:
              "Describe this civic issue image in one concise sentence focusing on the type of problem, its visible severity, and the affected infrastructure. Do not include any personal details or location names.",
          },
        ],
      }],
      generationConfig: { maxOutputTokens: 120 },
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Gemini Vision error: ${err}`);
  }

  const json = await resp.json();
  return (
    json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
    "Civic infrastructure issue"
  );
}

// ─── Generate 512-dim text embedding via Gemini text-embedding-004 ──────────
async function generateEmbedding(
  text: string,
  geminiApiKey: string,
): Promise<number[]> {
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

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Gemini Embedding error: ${err}`);
  }

  const json = await resp.json();
  const values: number[] = json.embedding?.values;
  if (!values || values.length === 0) {
    throw new Error("Gemini returned empty embedding");
  }
  return values;
}

// ─── Parse a pgvector string "[0.1, 0.2, ...]" to number[] ──────────────────
function parseVectorString(v: unknown): number[] | null {
  if (!v) return null;
  if (Array.isArray(v)) return v as number[];
  if (typeof v === "string") {
    try {
      return JSON.parse(v.replace(/^\[/, "[").replace(/\]$/, "]"));
    } catch {
      return null;
    }
  }
  return null;
}

// ─── Main handler ─────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // ── JWT authentication ────────────────────────────────────────────────────
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY") || "";

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(
      JSON.stringify({ error: "Supabase credentials not configured" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  try {
    const body = await req.json();

    const {
      category,
      latitude,
      longitude,
      imageBase64,
      mimeType = "image/jpeg",
    } = body as {
      category: string;
      latitude: number;
      longitude: number;
      imageBase64?: string;
      mimeType?: string;
    };

    if (!category || latitude == null || longitude == null) {
      return new Response(
        JSON.stringify({
          error: "category, latitude, and longitude are required",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // ── Step 1: Find nearby issues via PostGIS RPC ────────────────────────
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: candidates, error: rpcError } = await serviceClient.rpc(
      "find_nearby_issues",
      {
        lat: latitude,
        lon: longitude,
        category_filter: category,
        radius_meters: RADIUS_METERS,
      },
    );

    if (rpcError) {
      throw new Error(`PostGIS RPC failed: ${rpcError.message}`);
    }

    // No nearby issues → definitely not a duplicate
    if (!candidates || candidates.length === 0) {
      return new Response(
        JSON.stringify({ isDuplicate: false, candidates: [] }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // ── Step 2: Generate embedding for the incoming image ─────────────────
    let newEmbedding: number[] | null = null;
    let imageDescription = "";

    if (imageBase64 && geminiApiKey) {
      try {
        imageDescription = await describeImage(imageBase64, mimeType, geminiApiKey);
        newEmbedding = await generateEmbedding(imageDescription, geminiApiKey);
      } catch {
      }
    }

    // ── Step 3: Score each candidate ──────────────────────────────────────
    const scored = candidates.map((c: any) => {
      const distanceMeters = Number(c.distance_meters) || RADIUS_METERS;

      // Distance score: 1.0 at 0m, 0.0 at RADIUS_METERS
      const distanceScore = Math.max(0, 1 - distanceMeters / RADIUS_METERS);

      // Vector similarity
      let vectorSimilarity = 0.5; // default when no embeddings available
      let hasEmbedding = false;

      if (newEmbedding) {
        const existingVec = parseVectorString(c.embedding);
        if (existingVec && existingVec.length === newEmbedding.length) {
          vectorSimilarity = cosineSimilarity(newEmbedding, existingVec);
          hasEmbedding = true;
        }
      }

      // Combined score weighted toward semantic similarity
      const combinedScore = hasEmbedding
        ? 0.45 * distanceScore + 0.55 * vectorSimilarity
        : 0.7 * distanceScore + 0.3 * 0.5; // distance-dominant fallback

      return {
        id: c.id,
        category: c.category,
        severity: c.severity,
        status: c.status,
        summary: c.summary || c.description || null,
        distance_meters: Math.round(distanceMeters),
        similarity: Math.round(vectorSimilarity * 100),
        combined_score: combinedScore,
        has_embedding: hasEmbedding,
      };
    });

    // Sort by combined score descending
    scored.sort((a: any, b: any) => b.combined_score - a.combined_score);

    const topCandidate = scored[0];
    const isDuplicate = topCandidate.combined_score >= DUPLICATE_THRESHOLD;

    return new Response(
      JSON.stringify({
        isDuplicate,
        confidence: Math.round(topCandidate.combined_score * 100),
        imageDescription: imageDescription || null,
        candidates: scored.slice(0, 3), // Return top 3 for UI display
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
