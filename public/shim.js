// Twistwell standalone runtime: gives the app the same `claude.use()` interface it has inside Claude,
// backed by the site's own /api/write endpoint and normal browser downloads.
(() => {
  const CODE_KEY = "twistwell.accessCode";
  const getCode = () => { try { return localStorage.getItem(CODE_KEY) || ""; } catch { return ""; } };

  function parseJsonLoose(text) {
    const t = String(text || "").trim();
    try { return JSON.parse(t); } catch {}
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) { try { return JSON.parse(fence[1]); } catch {} }
    const a = t.search(/[\[{]/), b = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
    if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch {} }
    throw { code: "invalid_json", message: "No JSON in reply", text: t };
  }

  async function call(input, opts = {}, json = false) {
    if (opts.signal?.aborted) throw { code: "cancelled", message: "Cancelled" };
    const messages = typeof input === "string" ? [{ role: "user", content: input }] : input;
    let res;
    try {
      res = await fetch("/api/write", {
        method: "POST",
        headers: { "content-type": "application/json", "x-access-code": getCode() },
        body: JSON.stringify({ messages, tier: opts.modelTier || "default", json }),
        signal: opts.signal,
      });
    } catch (e) {
      throw { code: e?.name === "AbortError" ? "cancelled" : "upstream_error", message: String(e?.message || e) };
    }
    if (!res.ok) {
      let info = {};
      try { info = await res.json(); } catch {}
      const map = { rate_limited: "rate_limited", prompt_too_large: "prompt_too_large", access_code: "access_code", no_key: "no_key", no_credit: "no_credit", invalid_request: "invalid_request" };
      const err = { code: map[info.code] || "upstream_error", message: info.message || "HTTP " + res.status };
      if (err.code === "access_code") window.dispatchEvent(new CustomEvent("twistwell:access"));
      throw err;
    }

    const reader = res.body.getReader(), dec = new TextDecoder();
    let buf = "", text = "", truncated = false, streamErr = null;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const block = buf.slice(0, idx); buf = buf.slice(idx + 2);
          const dataLine = block.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("");
          if (!dataLine) continue;
          let ev; try { ev = JSON.parse(dataLine); } catch { continue; }
          if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta" && ev.delta.text) {
            text += ev.delta.text;
            if (opts.onText && text.trim()) { try { opts.onText({ text, delta: ev.delta.text }); } catch (e) { console.error(e); } }
          } else if (ev.type === "message_delta" && ev.delta?.stop_reason === "max_tokens") {
            truncated = true;
          } else if (ev.type === "error") {
            const t = ev.error?.type;
            streamErr = { code: t === "overloaded_error" || t === "rate_limit_error" ? "rate_limited" : "upstream_error", message: ev.error?.message || "Stream error" };
          }
        }
      }
    } catch (e) {
      const err = { code: e?.name === "AbortError" || opts.signal?.aborted ? "cancelled" : "upstream_error", message: String(e?.message || e) };
      if (text) err.text = text;
      throw err;
    }
    if (streamErr) { if (text) streamErr.text = text; throw streamErr; }
    if (!text.trim()) throw { code: "empty_completion", message: "Empty reply" };
    if (json) {
      if (truncated) throw { code: "invalid_json", message: "Reply was cut short", text };
      return parseJsonLoose(text);
    }
    return { text, truncated, modelTierApplied: opts.modelTier || "default" };
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

  // Access code bar, shown only when the site owner has set ACCESS_CODE on Netlify.
  window.addEventListener("twistwell:access", () => {
    if (document.getElementById("accessBar")) return;
    const bar = document.createElement("form");
    bar.id = "accessBar";
    bar.innerHTML = '<label for="accessInput">This site needs an access code</label><input id="accessInput" type="password" autocomplete="off"><button type="submit">Save</button>';
    bar.addEventListener("submit", (e) => {
      e.preventDefault();
      try { localStorage.setItem(CODE_KEY, document.getElementById("accessInput").value.trim()); } catch {}
      bar.remove();
    });
    document.body.prepend(bar);
  });
})();
