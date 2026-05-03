import "@supabase/functions-js/edge-runtime.d.ts";

const WHOOP_TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token";
const WHOOP_API_BASE = "https://api.prod.whoop.com/developer";
const CLIENT_ID = "2bc89171-9bab-46ec-94d2-0bb8d015f9c3";
const REDIRECT_URI = "https://juliangarmendia.github.io/training-system/whoop-callback.html";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action } = body;

    // ---- API PROXY ----
    if (action === "api") {
      const { endpoint, access_token } = body;
      if (!endpoint || !access_token) {
        return new Response(
          JSON.stringify({ error: "Missing endpoint or access_token" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const url = `${WHOOP_API_BASE}${endpoint}`;
      const response = await fetch(url, {
        headers: { "Authorization": `Bearer ${access_token}` },
      });

      const text = await response.text();
      // Log endpoint + status only. Body intentionally not logged — it may contain
      // recovery scores, HRV, tokens or other sensitive payloads. Body is logged
      // ONLY on non-2xx (truncated) so failures remain debuggable.
      if (!response.ok) {
        console.warn(`[WHOOP Proxy] ${endpoint} → ${response.status}: ${text.substring(0, 200)}`);
      } else {
        console.log(`[WHOOP Proxy] ${endpoint} → ${response.status}`);
      }

      // Try to parse as JSON, return error if not valid JSON
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        return new Response(
          JSON.stringify({ error: `WHOOP API returned ${response.status}`, body: text.substring(0, 500) }),
          { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify(data),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ---- TOKEN EXCHANGE / REFRESH ----
    const { code, refresh_token } = body;
    const clientSecret = Deno.env.get("WHOOP_CLIENT_SECRET");

    if (!clientSecret) {
      return new Response(
        JSON.stringify({ error: "WHOOP_CLIENT_SECRET not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let tokenBody: URLSearchParams;

    if (action === "exchange") {
      tokenBody = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: CLIENT_ID,
        client_secret: clientSecret,
        code: code,
        redirect_uri: REDIRECT_URI,
      });
    } else if (action === "refresh") {
      tokenBody = new URLSearchParams({
        grant_type: "refresh_token",
        client_id: CLIENT_ID,
        client_secret: clientSecret,
        refresh_token: refresh_token,
      });
    } else {
      return new Response(
        JSON.stringify({ error: "Invalid action. Use 'exchange', 'refresh', or 'api'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const response = await fetch(WHOOP_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenBody.toString(),
    });

    const data = await response.json();

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: data.error || "Token exchange failed", details: data }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_in: data.expires_in,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
