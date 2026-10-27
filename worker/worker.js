// Cloudflare Worker: FCM push sender + template store
//
// Bindings (Cloudflare dashboard → Worker → Settings):
//   Secret  FIREBASE_SERVICE_ACCOUNT  full JSON of the Firebase service account key
//   Secret  ADMIN_PASSWORD            password the admin page sends
//   KV      NOTIFY_KV                 stores templates
//   Var     ALLOWED_ORIGIN            optional, e.g. https://yourname.github.io (default *)

const TOPIC = "all";
const RETENTION_MS = 60 * 24 * 60 * 60 * 1000;
const CATEGORIES = ["notification", "reminder", "feedback", "quiz", "fasting", "prayer", "todo", "other"];
function categoryTopic(kind) {
  return `category_${["notification", "reminder", "feedback", "quiz"].includes(kind) ? kind : "other"}`;
}
// Every message carries an analytics label so Firebase → Messaging →
// Reports can be filtered by it. All of them start with this.
const LABEL_PREFIX = "muslim-days";
const LABEL_KINDS = ["notification", "reminder", "feedback-whatsapp", "feedback-email", "quiz"];
const DEBUG_TOPIC = "debug";
const SCOPES = "https://www.googleapis.com/auth/firebase.messaging https://www.googleapis.com/auth/cloud-platform";

let cachedToken = null; // { value, exp }

export default {
  async fetch(request, env) {
    const cors = corsHeaders(env);
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    const url = new URL(request.url);
    try {
      let res;
      if (url.pathname === "/" && request.method === "GET") {
        res = json({ ok: true, service: "push-notify" });
      } else if (url.pathname.startsWith("/c/") && request.method === "GET") {
        res = await getContent(url.pathname.slice(3).replace(/\.json$/, ""), env);
      } else if (url.pathname === "/inbox" && request.method === "GET") {
        res = await listInbox(url, env);
      } else if (url.pathname === "/subscribe" && request.method === "POST") {
        res = await subscribe(request, env);
      } else if (url.pathname === "/send" && request.method === "POST") {
        res = await requireAdmin(request, env, () => send(request, env, url.origin));
      } else if (url.pathname === "/templates" && request.method === "GET") {
        res = await requireAdmin(request, env, () => listTemplates(env));
      } else if (url.pathname === "/templates" && request.method === "POST") {
        res = await requireAdmin(request, env, () => saveTemplate(request, env));
      } else if (url.pathname.startsWith("/templates/") && request.method === "DELETE") {
        const id = decodeURIComponent(url.pathname.slice("/templates/".length));
        res = await requireAdmin(request, env, () => deleteTemplate(id, env));
      } else {
        res = json({ error: "not found" }, 404);
      }
      return withHeaders(res, cors);
    } catch (err) {
      return withHeaders(json({ error: String(err.message || err) }, 500), cors);
    }
  },
};

// ---------- routes ----------

async function subscribe(request, env) {
  const { token } = await request.json();
  if (typeof token !== "string" || token.length < 20 || token.length > 4096) {
    return json({ error: "invalid token" }, 400);
  }
  const accessToken = await getAccessToken(env);
  const r = await fetch("https://iid.googleapis.com/iid/v1:batchAdd", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      access_token_auth: "true",
    },
    body: JSON.stringify({ to: `/topics/${TOPIC}`, registration_tokens: [token] }),
  });
  const body = await r.json().catch(() => ({}));
  const result = body.results?.[0];
  if (!r.ok || result?.error) {
    return json({ error: result?.error || body.error || `subscribe failed (${r.status})` }, 502);
  }
  return json({ ok: true });
}

// Body: { target: "all" | "debug",
//         notification: {title, body, image}, data: {type, full_screen, return_on_close, json_url},
//         label?: one of LABEL_KINDS - the admin page's tab,
//         content?: object  → stored in KV and sent as json_url,
//         token?: string    → one phone only, instead of the topic }
// "debug" is the topic only the app's debug builds join.
async function send(request, env, origin) {
  const { target, notification = {}, data = {}, content, token, label: kind } = await request.json();
  if (!token && target !== "all" && target !== "debug") {
    return json({ error: 'target must be "all" or "debug"' }, 400);
  }
  const title = clean(notification.title);
  const body = clean(notification.body);
  const image = clean(notification.image);
  if (!title || !body) return json({ error: "notification title and body are required" }, 400);
  if (token !== undefined && (typeof token !== "string" || token.length < 20 || token.length > 4096)) {
    return json({ error: "invalid test token" }, 400);
  }

  const category = clean(data.type) || "notification";
  if (!CATEGORIES.includes(category)) return json({ error: "invalid type" }, 400);
  const id = crypto.randomUUID();
  const published = new Date();
  const expires = new Date(published.getTime() + RETENTION_MS);
  const fields = {
    schema_version: "1", message_id: id, type: category,
    published_at: published.toISOString(), expires_at: expires.toISOString(),
  };
  // Firebase refuses "message_type" as a key; the app reads "type".
  for (const k of ["json_url", "type", "full_screen", "return_on_close"]) {
    const v = clean(data[k]);
    if (v) fields[k] = v;
  }
  if (content !== undefined) {
    if (!content || typeof content !== "object" || Array.isArray(content)) {
      return json({ error: "content must be a JSON object" }, 400);
    }
    // A new file per message: the app downloads a json_url only once.
    const versioned = { ...content, published_at: fields.published_at, expires_at: fields.expires_at };
    if (category === "quiz") {
      if (!clean(content.id)) return json({ error: "quiz id is required" }, 400);
      fields.quiz_id = clean(content.id);
    }
    await env.NOTIFY_KV.put(`content:${id}`, JSON.stringify(versioned), {
      expiration: Math.ceil(expires.getTime() / 1000),
    });
    fields.json_url = `${origin}/c/${id}.json`;
  }

  if (category === "quiz" && !fields.json_url) {
    return json({ error: "quiz content or json_url is required" }, 400);
  }
  const label = analyticsLabel(kind || data.type, target === "debug" || Boolean(token));
  const sa = serviceAccount(env);
  const message = {
    ...(token ? { token } : { topic: target === "all" ? categoryTopic(category) : DEBUG_TOPIC }),
    notification: { title, body, ...(image ? { image } : {}) },
    ...(Object.keys(fields).length ? { data: fields } : {}),
    android: { priority: "high", ttl: "2419200s", notification: { tag: id } },
    fcm_options: { analytics_label: label },
  };

  const accessToken = await getAccessToken(env);
  const r = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok) return json({ error: out.error?.message || `send failed (${r.status})` }, 502);
  // Test/token deliveries never enter the public fallback inbox.
  let syncAvailable = false;
  if (!token && target === "all") {
    try {
      await env.NOTIFY_KV.put(`inbox:${id}`, JSON.stringify({
        id, at: published.getTime(), published_at: fields.published_at,
        expires_at: fields.expires_at, title, body, image: image || null,
        kind: category, schema_version: 1, url_content: fields.json_url || null,
        quiz_url: category === "quiz" ? fields.json_url : null,
      }), { expiration: Math.ceil(expires.getTime() / 1000) });
      syncAvailable = true;
    } catch (_) {
      // FCM already accepted: never return a retryable send error that
      // would duplicate the broadcast merely because fallback storage failed.
    }
  }
  return json({ ok: true, id: out.name, message_id: id, json_url: fields.json_url || null,
    published_at: fields.published_at, expires_at: fields.expires_at,
    stage: "fcm_accepted", sync_available: syncAvailable, label });
}

async function listInbox(url, env) {
  const page = await env.NOTIFY_KV.list({
    prefix: "inbox:", limit: 100,
    ...(url.searchParams.get("cursor") ? { cursor: url.searchParams.get("cursor") } : {}),
  });
  const now = Date.now();
  const items = (await Promise.all(page.keys.map(k => env.NOTIFY_KV.get(k.name, "json"))))
    .filter(item => item && Date.parse(item.published_at) <= now && Date.parse(item.expires_at) > now)
    .sort((a, b) => b.at - a.at || a.id.localeCompare(b.id));
  return new Response(JSON.stringify({ schema_version: 1, server_time: new Date(now).toISOString(),
    items, cursor: page.list_complete ? null : page.cursor }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function getContent(id, env) {
  const text = /^[0-9a-f-]{36}$/.test(id) ? await env.NOTIFY_KV.get(`content:${id}`) : null;
  if (!text) return json({ error: "not found" }, 404);
  const expiry = Date.parse(JSON.parse(text).expires_at);
  if (Number.isFinite(expiry) && Date.now() >= expiry) return json({ error: "expired" }, 410);
  return new Response(text, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

async function listTemplates(env) {
  return json({ templates: await readTemplates(env) });
}

// A template is the admin page's whole form for one message type: { id?, name, form }
async function saveTemplate(request, env) {
  const { id, name, form } = await request.json();
  if (!clean(name) || !form || typeof form !== "object") return json({ error: "name and form are required" }, 400);
  const templates = await readTemplates(env);
  const tpl = { id: id || crypto.randomUUID(), name: clean(name), form, savedAt: Date.now() };
  const i = templates.findIndex((t) => t.id === tpl.id);
  if (i >= 0) templates[i] = tpl;
  else templates.push(tpl);
  await env.NOTIFY_KV.put("templates", JSON.stringify(templates));
  return json({ ok: true, template: tpl });
}

async function deleteTemplate(id, env) {
  const templates = (await readTemplates(env)).filter((t) => t.id !== id);
  await env.NOTIFY_KV.put("templates", JSON.stringify(templates));
  return json({ ok: true });
}

// ---------- helpers ----------

/**
 * muslim-days[-debug]-<kind>-<YYYYMMDD>, e.g. muslim-days-feedback-email-20261024.
 * Test sends are marked so they stay out of the real numbers. Firebase
 * allows [a-zA-Z0-9-_.~%], at most 50 characters, and reports at most 100
 * different labels a day; one per kind per day stays far inside that.
 */
function analyticsLabel(kind, debug) {
  const k = LABEL_KINDS.includes(kind) ? kind : "other";
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return [LABEL_PREFIX, debug ? "debug" : null, k, day].filter(Boolean).join("-").slice(0, 50);
}

async function requireAdmin(request, env, handler) {
  const auth = request.headers.get("Authorization") || "";
  const given = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!env.ADMIN_PASSWORD || !(await safeEqual(given, env.ADMIN_PASSWORD))) {
    return json({ error: "unauthorized" }, 401);
  }
  return handler();
}

async function safeEqual(a, b) {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const x = new Uint8Array(ha), y = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

function clean(v) {
  return v === undefined || v === null ? "" : String(v).trim();
}

async function readTemplates(env) {
  return (await env.NOTIFY_KV.get("templates", "json")) || [];
}

function serviceAccount(env) {
  if (!env.FIREBASE_SERVICE_ACCOUNT) throw new Error("FIREBASE_SERVICE_ACCOUNT secret is missing");
  return JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
}

// Service account → signed JWT → Google OAuth access token (cached ~55 min)
async function getAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp > now + 60) return cachedToken.value;

  const sa = serviceAccount(env);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: sa.client_email,
    scope: SCOPES,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const jwt = `${unsigned}.${b64url(sig)}`;

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const out = await r.json();
  if (!r.ok) throw new Error(`google auth failed: ${out.error_description || out.error || r.status}`);
  cachedToken = { value: out.access_token, exp: now + out.expires_in };
  return cachedToken.value;
}

function pemToDer(pem) {
  const b64 = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

function b64url(input) {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function withHeaders(res, extra) {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(extra)) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
}
