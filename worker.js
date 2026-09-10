// ═══════════════════════════════════════════════════════════
// 🕌 اوای یقین — Backend Worker (Token-based Auth)
// ═══════════════════════════════════════════════════════════

const GEMINI_MODEL = "gemini-3.6-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent`;

const DEFAULT_SYSTEM_PROMPT = `شما «اوای یقین» هستی، یک دستیار هوشمند متخصص در پاسخگویی به پرسش‌های دینی، احکام، تفسیر قرآن و معارف اسلامی.

قواعد پاسخگویی:
۱. همیشه با «بسم الله الرحمن الرحیم» شروع کن.
۲. پاسخ‌ها را به فارسی روان و دقیق بنویس.
۳. در موضوعات فقهی، نظر مشهور فقهای شیعه را بیان کن و توصیه کن برای فتوای دقیق به مرجع تقلید مراجعه شود.
۴. در تفسیر قرآن، از تفاسیر معتبر (المیزان، نمونه، نور) استفاده کن.
۵. در روایات، منبع حدیثی ذکر کن (مثلاً: بحارالانوار، ج X، ص Y).
۶. از آیات و روایات مرتبط برای تأیید استفاده کن.
۷. لحن مهربان، محترمانه و صمیمی داشته باش.
۸. اگر پرسشی مربوط به دین نبود، با احترام بگو که تخصص من در موضوعات دینی است و پیشنهاد کن سوالت را در حوزه دین بپرسد.
۹. از پاسخ‌های تند، تکفیری یا تفرقه‌انگیز پرهیز کن.
۱۰. اگر سؤالی را نمی‌دانی، صادقانه بگو و پیشنهاد منابع بده.`;

const SESSION_TTL = 30 * 24 * 60 * 60; // ۳۰ روز

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    try {
      if (path === "/api/login" && request.method === "POST") return await handleLogin(request, env);
      if (path === "/api/logout" && request.method === "POST") return await handleLogout(request, env);
      if (path === "/api/me" && request.method === "GET") return await handleMe(request, env);
      if (path === "/api/chats" && request.method === "GET") return await handleGetChats(request, env);
      if (path === "/api/chats" && request.method === "POST") return await handleSaveChats(request, env);
      if (path === "/api/chat" && request.method === "POST") return await handleChat(request, env);
      if (path === "/api/admin/users" && request.method === "GET") return await handleAdminUsers(request, env);
      if (path === "/api/admin/user" && request.method === "GET") return await handleAdminUserDetail(request, env);
      if (path === "/api/admin/settings" && request.method === "GET") return await handleAdminGetSettings(request, env);
      if (path === "/api/admin/settings" && request.method === "POST") return await handleAdminSaveSettings(request, env);

      return await serveStatic(request, env);
    } catch (err) {
      return json({ error: err.message }, 500);
    }
  }
};

// ═══════════════════════════════════════════════════════════
// 🔐 Login (Token-based)
// ═══════════════════════════════════════════════════════════
async function handleLogin(request, env) {
  const { name, phone } = await request.json();

  if (!name || !phone) return json({ error: "نام و شماره تلفن الزامی است" }, 400);

  const cleanPhone = String(phone).replace(/\D/g, "");
  if (cleanPhone.length < 10 || cleanPhone.length > 13) {
    return json({ error: "شماره تلفن معتبر نیست" }, 400);
  }

  const isAdmin = cleanPhone === env.ADMIN_PHONE && name === env.ADMIN_NAME;

  const userKey = `user:${cleanPhone}`;
  let user = await env.OY_KV.get(userKey, "json");
  if (!user) {
    user = { phone: cleanPhone, name: name, createdAt: Date.now(), lastLogin: Date.now(), chats: [] };
  } else {
    user.name = name;
    user.lastLogin = Date.now();
  }
  await env.OY_KV.put(userKey, JSON.stringify(user));

  const token = await generateToken();
  const session = {
    phone: cleanPhone,
    name: name,
    role: isAdmin ? "admin" : "user",
    createdAt: Date.now()
  };
  await env.OY_KV.put(`session:${token}`, JSON.stringify(session), {
    expirationTtl: SESSION_TTL
  });

  // توکن رو توی پاسخ برمی‌گردونیم (نه کوکی)
  return json({
    ok: true,
    token: token,
    user: { name, phone: cleanPhone, role: session.role }
  });
}

async function handleLogout(request, env) {
  const token = getToken(request);
  if (token) await env.OY_KV.delete(`session:${token}`);
  return json({ ok: true });
}

async function handleMe(request, env) {
  const session = await getSession(request, env);
  if (!session) return json({ error: "Unauthorized" }, 401);
  return json({ user: session });
}

// ═══════════════════════════════════════════════════════════
// 💬 Chats
// ═══════════════════════════════════════════════════════════
async function handleGetChats(request, env) {
  const session = await getSession(request, env);
  if (!session) return json({ error: "Unauthorized" }, 401);

  const user = await env.OY_KV.get(`user:${session.phone}`, "json");
  if (!user) return json({ chats: [] });
  return json({ chats: user.chats || [] });
}

async function handleSaveChats(request, env) {
  const session = await getSession(request, env);
  if (!session) return json({ error: "Unauthorized" }, 401);

  const { chats } = await request.json();
  const user = await env.OY_KV.get(`user:${session.phone}`, "json");
  if (!user) return json({ error: "User not found" }, 404);

  user.chats = chats;
  await env.OY_KV.put(`user:${session.phone}`, JSON.stringify(user));
  return json({ ok: true });
}

// ═══════════════════════════════════════════════════════════
// 🤖 Chat with Gemini
// ═══════════════════════════════════════════════════════════
async function handleChat(request, env) {
  const session = await getSession(request, env);
  if (!session) return json({ error: "Unauthorized" }, 401);

  const { messages, image } = await request.json();
  if (!messages || !messages.length) return json({ error: "Messages required" }, 400);

  const config = await env.OY_KV.get("config:ai", "json") || {};
  const systemPrompt = config.systemPrompt || DEFAULT_SYSTEM_PROMPT;
  const temperature = config.temperature ?? 0.7;

  const contents = messages.map((m, i) => {
    const parts = [{ text: m.content }];
    if (image && i === messages.length - 1 && m.role === "user") {
      parts.push({ inlineData: { mimeType: image.mimeType, data: image.data } });
    }
    return {
      role: m.role === "assistant" ? "model" : "user",
      parts
    };
  });

  const body = {
    contents,
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: {
      temperature: temperature,
      maxOutputTokens: 8192,
      topP: 0.95
    }
  };

  const geminiRes = await fetch(`${GEMINI_URL}?key=${env.GEMINI_API_KEY}&alt=sse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!geminiRes.ok) {
    const errText = await geminiRes.text();
    return json({ error: "Gemini error: " + errText }, 500);
  }

  return new Response(geminiRes.body, {
    headers: {
      ...corsHeaders(),
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive"
    }
  });
}

// ═══════════════════════════════════════════════════════════
// 🛡 Admin
// ═══════════════════════════════════════════════════════════
async function handleAdminUsers(request, env) {
  const session = await getSession(request, env);
  if (!session || session.role !== "admin") return json({ error: "Unauthorized" }, 401);

  const users = [];
  let cursor;
  do {
    const list = await env.OY_KV.list({ prefix: "user:", cursor });
    for (const key of list.keys) {
      const user = await env.OY_KV.get(key.name, "json");
      if (user) {
        users.push({
          phone: user.phone,
          name: user.name,
          createdAt: user.createdAt,
          lastLogin: user.lastLogin,
          chatCount: (user.chats || []).length
        });
      }
    }
    cursor = list.cursor;
  } while (cursor);

  users.sort((a, b) => (b.lastLogin || 0) - (a.lastLogin || 0));
  return json({ users });
}

async function handleAdminUserDetail(request, env) {
  const session = await getSession(request, env);
  if (!session || session.role !== "admin") return json({ error: "Unauthorized" }, 401);

  const url = new URL(request.url);
  const phone = url.searchParams.get("phone");
  if (!phone) return json({ error: "Phone required" }, 400);

  const user = await env.OY_KV.get(`user:${phone}`, "json");
  if (!user) return json({ error: "User not found" }, 404);
  return json({ user });
}

async function handleAdminGetSettings(request, env) {
  const session = await getSession(request, env);
  if (!session || session.role !== "admin") return json({ error: "Unauthorized" }, 401);

  const config = await env.OY_KV.get("config:ai", "json") || {};
  return json({
    config: {
      systemPrompt: config.systemPrompt || DEFAULT_SYSTEM_PROMPT,
      temperature: config.temperature ?? 0.7,
      defaultPrompt: DEFAULT_SYSTEM_PROMPT
    }
  });
}

async function handleAdminSaveSettings(request, env) {
  const session = await getSession(request, env);
  if (!session || session.role !== "admin") return json({ error: "Unauthorized" }, 401);

  const { systemPrompt, temperature } = await request.json();
  const config = {
    systemPrompt: String(systemPrompt || DEFAULT_SYSTEM_PROMPT),
    temperature: Math.max(0, Math.min(2, Number(temperature) || 0.7)),
    updatedAt: Date.now()
  };
  await env.OY_KV.put("config:ai", JSON.stringify(config));
  return json({ ok: true });
}

// ═══════════════════════════════════════════════════════════
// 📄 Static Files
// ═══════════════════════════════════════════════════════════
async function serveStatic(request, env) {
  return env.ASSETS.fetch(request);
}

// ═══════════════════════════════════════════════════════════
// 🧰 Helpers
// ═══════════════════════════════════════════════════════════
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true"
  };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json; charset=utf-8" }
  });
}

function getToken(request) {
  // توکن رو از Authorization header می‌خونیم
  const auth = request.headers.get("Authorization") || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7);
  return null;
}

async function getSession(request, env) {
  const token = getToken(request);
  if (!token) return null;
  return await env.OY_KV.get(`session:${token}`, "json");
}

async function generateToken() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return [...arr].map(b => b.toString(16).padStart(2, "0")).join("");
}
