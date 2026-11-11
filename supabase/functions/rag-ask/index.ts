import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const allowedRoles = new Set(["reader", "librarian", "admin"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ success: false, error: "Chỉ hỗ trợ POST." }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const apiUrl = (Deno.env.get("API_URL") ?? "").replace(/\/$/, "");
    if (!supabaseUrl || !anonKey || !serviceRoleKey || !apiUrl) {
      return json({ success: false, error: "Edge Function chưa cấu hình SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY hoặc API_URL." }, 500);
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return json({ success: false, error: "Thiếu access token." }, 401);
    }

    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return json({ success: false, error: "Token không hợp lệ." }, 401);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const { data: profile } = await admin
      .from("profiles")
      .select("is_active, role_id")
      .eq("id", userData.user.id)
      .maybeSingle();
    const { data: roleRow } = profile?.role_id
      ? await admin.from("roles").select("name").eq("id", profile.role_id).maybeSingle()
      : { data: null };

    const role = String(roleRow?.name ?? "").toLowerCase();
    if (!profile?.is_active || !allowedRoles.has(role)) {
      return json({ success: false, error: "Tài khoản không được dùng trợ lý AI." }, 403);
    }

    const payload = await req.json().catch(() => ({}));
    const response = await fetch(`${apiUrl}/api/v1/rag/ask`, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ question: payload.question ?? "" }),
    });

    const text = await response.text();
    return new Response(text, {
      status: response.status,
      headers: { ...corsHeaders, "Content-Type": response.headers.get("Content-Type") ?? "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không gọi được backend RAG.";
    return json({ success: false, error: message }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
