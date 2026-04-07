import "@supabase/functions-js/edge-runtime.d.ts";

const WHOOP_TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token";
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
    const { action, code, refresh_token } = await req.json();
    const clientSecret = Deno.env.get("WHOOP_CLIENT_SECRET");

    if (!clientSecret) {
      return new Response(
        JSON.stringify({ error: "WHOOP_CLIENT_SECRET not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let body: URLSearchParams;

    if (action === "exchange") {
      // Exchange authorization code for tokens
      body = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: CLIENT_ID,
        client_secret: clientSecret,
        code: code,
        redirect_uri: REDIRECT_URI,
      });
    } else if (action === "refresh") {
      // Refresh an expired access token
      body = new URLSearchParams({
        grant_type: "refresh_token",
        client_id: CLIENT_ID,
        client_secret: clientSecret,
        refresh_token: refresh_token,
      });
    } else {
      return new Response(
        JSON.stringify({ error: "Invalid action. Use 'exchange' or 'refresh'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const response = await fetch(WHOOP_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    const data = await response.json();

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: data.error || "Token exchange failed", details: data }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Return tokens to client (access_token, refresh_token, expires_in)
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
