// Twistwell standalone runtime: gives the app the same `claude.use()` interface it has inside Claude.
// Writing runs through Puter.js (https://docs.puter.com): each visitor signs in to their own Puter account
// and their use is billed to that account, so the site owner needs no API key and pays nothing.
(() => {
  const MODELS = { quick: "claude-sonnet-5", default: "claude-sonnet-5", complex: "claude-opus-5-5" };
  const FALLBACK_MODEL = "claude-sonnet-5";
  const JSON_RULE = "Reply with only one valid JSON value. No prose before or after it, no Markdown code fences.";

  function parseJsonLoose(text) {
    const t = String(text || "").trim();
    try { return JSON.parse(t); } catch {}
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) { try { return JSON.parse(fence[1]); } catch {} }
    const a = t.search(/[\[{]/), b = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
    if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch {} }
    throw { code: "invalid_json", message: "No JSON in reply", text: t };
  }

  function classify(err) {
    let raw = "";
    try { raw = typeof err === "string" ? err : JSON.stringify(err); } catch {}
    const m = [err?.message, err?.error?.message, err?.error?.code, err?.code, typeof err?.error === "string" ? err.error : "", raw].filter(Boolean).join(" ");
    if (/insufficient|funds|funding|balance|credit|quota|limit reached|usage limit|payment|upgrade/i.test(m)) return { code: "no_credit", message: m };
    if (/rate|too many|overloaded|busy/i.test(m)) return { code: "rate_limited", message: m };
    if (/sign ?in|auth|login|unauthori[sz]ed|401/i.test(m)) return { code: "not_signed_in", message: m };
    if (/too long|too large|context|token/i.test(m)) return { code: "prompt_too_large", message: m };
    if (/model/i.test(m)) return { code: "bad_model", message: m };
    return { code: "upstream_error", message: m || "Writing service error" };
  }

  // Must run before any other await so the sign-in window opens inside the click that started it.
  async function ensureAuth() {
    const P = window.puter;
    if (!P?.ai?.chat) throw { code: "no_puter", message: "Puter.js didn't load" };
    if (P.auth?.isSignedIn && !P.auth.isSignedIn()) {
      try { await P.auth.signIn(); } catch { throw { code: "not_signed_in", message: "Sign-in was closed" }; }
      window.dispatchEvent(new CustomEvent("twistwell:auth"));
    }
  }

  async function run(messages, opts, model) {
    const resp = await window.puter.ai.chat(messages, false, { model, stream: true, max_tokens: opts.modelTier === "quick" ? 4000 : 32000 });
    let text = "";
    if (resp && typeof resp[Symbol.asyncIterator] === "function") {
      for await (const part of resp) {
        if (opts.signal?.aborted) { const e = { code: "cancelled", message: "Cancelled" }; if (text) e.text = text; throw e; }
        if (part?.type === "error") { const e = classify(part); if (text) e.text = text; throw e; }
        const t = (part?.type === undefined || part?.type === "text") ? part?.text : "";
        if (t) {
          text += t;
          if (opts.onText && text.trim()) { try { opts.onText({ text, delta: t }); } catch (e) { console.error(e); } }
        }
      }
    } else {
      // non-streamed reply (older Puter builds)
      const c = resp?.message?.content;
      text = typeof c === "string" ? c : Array.isArray(c) ? c.map((b) => b?.text || "").join("") : String(resp ?? "");
      if (opts.onText && text.trim()) opts.onText({ text, delta: text });
    }
    return text;
  }

  async function call(input, opts = {}, json = false) {
    if (opts.signal?.aborted) throw { code: "cancelled", message: "Cancelled" };
    await ensureAuth();
    let messages = typeof input === "string" ? [{ role: "user", content: input }] : input.map((m) => ({ role: m.role, content: m.content }));
    if (json) messages = [{ role: "system", content: JSON_RULE }, ...messages];
    const model = MODELS[opts.modelTier] || MODELS.default;
    let text;
    try {
      text = await run(messages, opts, model);
    } catch (e) {
      const err = e?.code ? e : classify(e);
      if (err.code === "bad_model" && !err.text && model !== FALLBACK_MODEL) text = await run(messages, opts, FALLBACK_MODEL).catch((e2) => { throw e2?.code ? e2 : classify(e2); });
      else { if (err.code === "bad_model") err.code = "upstream_error"; throw err; }
    }
    if (!text.trim()) throw { code: "empty_completion", message: "Empty reply" };
    if (json) return parseJsonLoose(text);
    return { text, truncated: false, modelTierApplied: opts.modelTier || "default" };
  }

  const sample = (input, opts) => call(input, opts, false);
  sample.json = (input, opts) => call(input, opts, true);
  sample.limits = async () => ({ maxPromptBytes: 262144 });

  const downloads = {
    async save({ filename, data }) {
      const blob = data instanceof Blob ? data : new Blob([data], { type: /\.html?$/i.test(filename) ? "text/html" : "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      return { status: "saved" };
    },
  };

  window.claude = { use: async (name) => ({ sample, downloads }[name] ?? null) };
})();
