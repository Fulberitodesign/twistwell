// Twistwell: proxies writing requests to the Anthropic API.
// The API key stays on Netlify (environment variable ANTHROPIC_API_KEY) and never reaches the browser.
// The answer is streamed straight through, so long chapters are not cut off by time limits.

const MODELS = {
  quick: () => env("MODEL_QUICK") || "claude-haiku-5-5",
  default: () => env("MODEL_DEFAULT") || "claude-sonnet-5-5",
  complex: () => env("MODEL_COMPLEX") || "claude-opus-5-5",
};
const MAX_INPUT_CHARS = 300_000;

// Light abuse guard per visitor IP (per edge instance). Spending limits belong in the Anthropic console.
const hits = new Map();
function tooMany(ip) {
  const limit = Number(env("RATE_LIMIT_PER_HOUR") || 120);
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 3_600_000);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > limit;
}

function env(name) {
  try { return globalThis.Netlify?.env?.get(name) ?? globalThis.Deno?.env?.get(name) ?? globalThis.process?.env?.[name]; }
  catch { return undefined; }
}
const reply = (status, code, message) =>
  new Response(JSON.stringify({ code, message }), { status, headers: { "content-type": "application/json" } });

export default async (request, context) => {
  if (request.method !== "POST") return reply(405, "method", "Use POST.");

  const key = env("ANTHROPIC_API_KEY");
  if (!key) return reply(503, "no_key", "The site owner hasn't added an Anthropic API key yet.");

  const access = env("ACCESS_CODE");
  if (access && request.headers.get("x-access-code") !== access) return reply(401, "access_code", "This site needs an access code.");

  const ip = context?.ip || request.headers.get("x-nf-client-connection-ip") || "unknown";
  if (tooMany(ip)) return reply(429, "rate_limited", "Too many requests from this connection. Try again later.");

  let body;
  try { body = await request.json(); } catch { return reply(400, "invalid_request", "Bad request body."); }

  const tier = ["quick", "default", "complex"].includes(body?.tier) ? body.tier : "default";
  let messages = Array.isArray(body?.messages) ? body.messages : null;
  if (!messages || !messages.length) return reply(400, "invalid_request", "No messages.");
  messages = messages
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content }));
  const size = messages.reduce((a, m) => a + m.content.length, 0);
  if (!messages.length || messages[messages.length - 1].role !== "user") return reply(400, "invalid_request", "The last message must come from the user.");
  if (size > MAX_INPUT_CHARS) return reply(413, "prompt_too_large", "Request too large.");

  const payload = {
    model: MODELS[tier](),
    max_tokens: tier === "quick" ? 4000 : 32000,
    stream: true,
    messages,
  };
  if (body.json) payload.system = "Reply with only one valid JSON value. No prose before or after it, no Markdown code fences.";

  let upstream;
  try {
    upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(payload),
      signal: request.signal,
    });
  } catch {
    return reply(502, "upstream_error", "Couldn't reach the writing service.");
  }

  if (!upstream.ok || !upstream.body) {
    let detail = "";
    try { detail = (await upstream.json())?.error?.message || ""; } catch {}
    const s = upstream.status;
    if (s === 429 || s === 529) return reply(429, "rate_limited", "The writing service is busy or the usage limit was reached. " + detail);
    if (s === 401 || s === 403) return reply(503, "no_key", "The API key was refused. " + detail);
    if (s === 400 && /prompt is too long|too many tokens/i.test(detail)) return reply(413, "prompt_too_large", detail);
    if (s === 400 && /credit balance/i.test(detail)) return reply(402, "no_credit", detail);
    return reply(502, "upstream_error", detail || "Writing service error " + s);
  }

  // Pass the event stream through untouched (no parsing here keeps CPU time near zero).
  return new Response(upstream.body, {
    status: 200,
    headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" },
  });
};

export const config = { path: "/api/write" };
