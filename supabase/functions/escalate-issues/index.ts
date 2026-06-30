import { createClient } from "https://esm.sh/@supabase/supabase-js@2.31.0";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EscalateRequest {
  testIssueId?: string; // Option to test escalation for a specific issue ID ignoring the 14-day threshold
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // ── Webhook secret validation ──────────────────────────────────────────────
  const webhookSecret = Deno.env.get("WEBHOOK_SECRET") || "";
  if (webhookSecret) {
    const incomingSecret =
      req.headers.get("x-webhook-secret") ||
      req.headers.get("authorization")?.replace("Bearer ", "") ||
      "";
    if (incomingSecret !== webhookSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const resendApiKey = Deno.env.get("RESEND_API_KEY") || "";

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Supabase credentials not configured in Deno env.");
    }

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    // ── Dev mode: redirect all emails to TEST_EMAIL when set ──────────────────
    const testEmail = Deno.env.get("TEST_EMAIL") ?? null;
    const isDevMode = !!testEmail;

    let requestBody: EscalateRequest = {};
    try {
      if (req.headers.get("content-type")?.includes("application/json")) {
        requestBody = await req.json();
      }
    } catch (_) {
      // Ignore parsing errors for empty or non-JSON payloads
    }

    const { testIssueId } = requestBody;

    // 1. Fetch target open issues that are >= 14 days old (or the testIssueId if provided)
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    let query = supabaseClient
      .from("issues")
      .select(`
        id,
        category,
        severity,
        summary,
        description,
        created_at,
        status,
        ward_id
      `)
      .eq("status", "open");

    if (testIssueId) {
      query = query.eq("id", testIssueId);
    } else {
      query = query.lte("created_at", fourteenDaysAgo.toISOString());
    }

    const { data: overdueIssues, error: fetchIssuesError } = await query;

    if (fetchIssuesError) {
      throw new Error(`Failed to fetch overdue issues: ${fetchIssuesError.message}`);
    }

    if (!overdueIssues || overdueIssues.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No overdue open issues found for escalation." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const escalationResults = [];

    // 2. Loop through issues and escalate
    for (const issue of overdueIssues) {
      let recipientEmail = "authority-fallback@civiq.in";
      let wardName = "Unknown Ward";
      let wardNumber = "N/A";
      let councillorName = "Councillor";

      // Fetch ward authority details if ward_id is linked
      if (issue.ward_id) {
        const { data: ward, error: wardError } = await supabaseClient
          .from("wards")
          .select("ward_name, ward_number, councillor_name, councillor_email, ward_office_email")
          .eq("id", issue.ward_id)
          .single();

        if (!wardError && ward) {
          wardName = ward.ward_name;
          wardNumber = ward.ward_number;
          councillorName = ward.councillor_name || "Councillor";
          recipientEmail = ward.ward_office_email || ward.councillor_email || recipientEmail;
        }
      }

      // Generate HTML body for Resend email
      const emailHtml = `
        <div style="font-family: sans-serif; line-height: 1.6; color: #334155; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px;">
          <h2 style="color: #e11d48; margin-top: 0;">⚠️ Civic Issue Escalation Notice</h2>
          <p>Dear ${councillorName},</p>
          <p>This is an automated escalation warning from Civiq. A civic issue reported in your ward has been open for 14 or more days without resolution. Action is required.</p>
          
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr style="background-color: #f8fafc;">
              <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-weight: bold; width: 140px;">Issue ID</td>
              <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-family: monospace;">${issue.id}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">Ward</td>
              <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">Ward ${wardNumber}: ${wardName}</td>
            </tr>
            <tr style="background-color: #f8fafc;">
              <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">Category</td>
              <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${issue.category}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">Severity</td>
              <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; color: #e11d48; font-weight: bold;">${issue.severity} / 5</td>
            </tr>
            <tr style="background-color: #f8fafc;">
              <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">AI Summary</td>
              <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${issue.summary || "N/A"}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">Description</td>
              <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${issue.description || "No description provided."}</td>
            </tr>
            <tr style="background-color: #f8fafc;">
              <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">Reported At</td>
              <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${new Date(issue.created_at).toLocaleString()}</td>
            </tr>
          </table>

          <p>Please coordinate with municipal departments to verify and mark this issue as <strong>In Progress</strong> or <strong>Resolved</strong>.</p>
          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
          <p style="font-size: 11px; color: #94a3b8; text-align: center;">This is an automated system email sent by Civiq. Please do not reply directly to this message.</p>
        </div>
      `;

      let resendResponseData = null;
      let emailSuccess = false;
      let emailErrorMsg = "";

      if (resendApiKey) {
        try {
          // In dev mode all emails go to TEST_EMAIL; production uses ward authority email.
          const toAddress = isDevMode ? testEmail! : recipientEmail;
          const subjectPrefix = isDevMode ? "[DEV] " : "";

          const emailResponse = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${resendApiKey}`,
            },
            body: JSON.stringify({
              from: "Civiq <onboarding@resend.dev>",
              to: [toAddress],
              subject: `${subjectPrefix}[Escalation] Overdue Open Issue: ${issue.category} (Ward ${wardNumber})`,
              html: emailHtml,

            }),
          });

          resendResponseData = await emailResponse.json();
          if (emailResponse.ok) {
            emailSuccess = true;
          } else {
            emailErrorMsg = resendResponseData.message || "Failed to send email via Resend.";
          }
        } catch (e: any) {
          emailErrorMsg = e.message || "Network error during Resend request.";
        }
      } else {
        emailErrorMsg = "RESEND_API_KEY Deno variable is not set. Resend email skip/simulated.";
      }

      // 3. Log the escalation to the database
      const { data: escalationLog, error: logError } = await supabaseClient
        .from("escalations")
        .insert({
          issue_id: issue.id,
          channel: "email",
          response_received: {
            success: emailSuccess,
            recipient: recipientEmail,
            resend_response: resendResponseData,
            error: emailErrorMsg || null,
          },
        })
        .select("id, sent_at")
        .single();

      if (logError) {
        console.error(`Failed to log escalation for issue ${issue.id}:`, logError.message);
      }

      // 4. Update status of the issue to 'escalated'
      const { error: updateError } = await supabaseClient
        .from("issues")
        .update({
          status: "escalated",
          updated_at: new Date().toISOString(),
        })
        .eq("id", issue.id);

      if (updateError) {
        console.error(`Failed to update issue status to 'escalated' for issue ${issue.id}:`, updateError.message);
      }

      escalationResults.push({
        issueId: issue.id,
        status: updateError ? "failed_status_update" : "escalated",
        emailSent: emailSuccess,
        recipient: recipientEmail,
        escalationLogId: escalationLog?.id || null,
        error: emailErrorMsg || null,
      });
    }

    return new Response(
      JSON.stringify({ success: true, processedCount: overdueIssues.length, results: escalationResults }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
