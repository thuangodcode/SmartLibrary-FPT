import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, OPTIONS",
};

const staffRoles = new Set(["admin", "librarian"]);
const adminRoles = new Set(["admin"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
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
    if (!profile?.is_active) {
      return json({ success: false, error: "Tài khoản không còn hoạt động." }, 403);
    }

    const payload = req.method === "GET" ? {} : await req.json().catch(() => ({}));
    const action = String(payload.action ?? new URL(req.url).searchParams.get("action") ?? "settings.get");
    const route = resolveRoute(action, role, payload);
    if (!route.ok) {
      return json({ success: false, error: route.error }, route.status);
    }

    const response = await fetch(`${apiUrl}${route.path}`, {
      method: route.method,
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: route.method === "GET" ? undefined : JSON.stringify(route.body ?? payload),
    });

    const text = await response.text();
    return new Response(text, {
      status: response.status,
      headers: { ...corsHeaders, "Content-Type": response.headers.get("Content-Type") ?? "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không gọi được backend AI.";
    return json({ success: false, error: message }, 500);
  }
});

function resolveRoute(action: string, role: string, payload: Record<string, unknown> = {}): {
  ok: boolean;
  status: number;
  error?: string;
  method?: string;
  path?: string;
  body?: unknown;
} {
  switch (action) {
    case "settings.get":
      if (!staffRoles.has(role)) return deny("Chỉ Admin hoặc Thủ thư xem cấu hình AI.");
      return { ok: true, status: 200, method: "GET", path: "/api/v1/ai/settings" };
    case "settings.save":
      if (!adminRoles.has(role)) return deny("Chỉ Admin được lưu API Key.");
      return { ok: true, status: 200, method: "PUT", path: "/api/v1/ai/settings" };
    case "settings.librarian":
      if (!staffRoles.has(role)) return deny("Chỉ Thủ thư hoặc Admin được đổi cấu hình này.");
      return { ok: true, status: 200, method: "PATCH", path: "/api/v1/ai/librarian-settings" };
    case "settings.test":
      if (!staffRoles.has(role)) return deny("Chỉ Admin hoặc Thủ thư được kiểm tra kết nối.");
      return { ok: true, status: 200, method: "POST", path: "/api/v1/ai/test" };
    case "ai.recommendations":
      if (!staffRoles.has(role)) return deny("Chỉ Admin hoặc Thủ thư xem gợi ý sách.");
      return { ok: true, status: 200, method: "GET", path: "/api/v1/ai/recommendations" };
    case "ai.trends":
      if (!staffRoles.has(role)) return deny("Chỉ Admin hoặc Thủ thư xem xu hướng đọc.");
      return { ok: true, status: 200, method: "GET", path: "/api/v1/ai/reading-trends" };
    case "ai.overdue":
      if (!staffRoles.has(role)) return deny("Chỉ Admin hoặc Thủ thư xem dự đoán quá hạn.");
      return { ok: true, status: 200, method: "GET", path: "/api/v1/ai/overdue-risks" };
    case "rag.reindex":
      if (!adminRoles.has(role)) return deny("Chỉ Admin được đồng bộ RAG.");
      return { ok: true, status: 200, method: "POST", path: "/api/v1/ai/reindex", body: {} };
    case "ai.workspace":
      if (!staffRoles.has(role)) return deny("Chỉ Admin hoặc Thủ thư xem dữ liệu AI nghiệp vụ.");
      return { ok: true, status: 200, method: "GET", path: `/api/v1/ai/librarian-workspace?days=${Number(payload.days) || 30}` };
    case "ai.suggestions":
      if (!staffRoles.has(role)) return deny("Chỉ Thủ thư hoặc Admin xem gợi ý nhập sách.");
      return { ok: true, status: 200, method: "POST", path: "/api/v1/ai/acquisition-suggestions", body: {} };
    default:
      return deny("Hành động AI không hợp lệ.", 400);
  }
}

function deny(error: string, status = 403) {
  return { ok: false, status, error };
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
