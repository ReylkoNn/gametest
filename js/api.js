/* ═══════════ api: prompt assembly + chat completion (stream) ═══════════ */
(function () {
  const STATS_RE = /<<STATS\s*(\{[\s\S]*\})\s*>>\s*$/;

  const Api = {

    /* ── build the full prompt from current game + play state ── */
    buildMessages(history) {
      const g = State.game, p = State.play;
      const system = [];
      system.push(`# THE KING'S ORDER — roleplay engine\n${g.rulebook}`);

      system.push(`\n# CHARACTER\n${g.character.name} (NPC):\n${g.character.longDesc || g.character.desc}\nPlayer character: ${g.playerName}. POV: second person ("you").`);

      if (p.toggles.interactive) {
        const lvl = Engine.levelName(p.trust);
        const inc = g.trust.increase.map(s => " • " + s).join("\n");
        const dec = g.trust.decrease.map(s => " • " + s).join("\n");
        system.push(
`# TRUST SCALE (authoritative)
Current Trust: ${p.trust} / ${g.trust.max} — Trust LVL · ${lvl}
INCREASE trust:
${inc}
DECREASE trust:
${dec}
When reporting, keep the <<STATS>> contract from the rulebook.`
        );
      }

      system.push(`# SCENE STATE (authoritative, do not contradict)\n${Engine.sceneStatus()}`);
      system.push(`\n# OUTPUT RULES\n• Stay in character as ${g.character.name}. Never write the player's actions or dialogue.\n• RUSSIAN ONLY — every reply is written in Russian (narration, dialogue, thoughts). Never switch to English or any other language, even if the player writes in another one.\n• Style: *actions in single asterisks*, dialogue in «», blank line between paragraphs.\n• CLEAN PROSE ONLY — no XML/HTML tags (</CHARACTER_DESCRIPTION>, <…>), no stat blocks like [Харизма: 0.7] or «Шар Инициативы: […]», no {{placeholders}}, no template markers. The final <<STATS>> line is the ONLY allowed technical line.\n• If "Интерактивные функции" instructions exist above — obey the <<STATS>> contract exactly.\n• No preambles, no out-of-character commentary.`);

      const msgs = [{ role: "system", content: system.join("\n") }];
      let sawUser = false;
      for (const m of history) {
        if (m.role === "user") {
          sawUser = true;
          msgs.push({ role: "user", content: m.content });
        } else if (m.role === "assistant") {
          const raw = m.content ?? (m.variants && m.variants[m.v] ? m.variants[m.v].text : "");
          // the user's own first-message.txt greeting goes to the model as-is
          const text = m.greeting ? String(raw || "") : this.sanitize(raw);
          if (!text.trim()) continue;
          if (!sawUser) {
            // leading greeting → fold into system (strict APIs want user first)
            msgs[0].content += `\n\n# YOUR OPENING LINE (already shown to the player)\n${text}`;
          } else {
            msgs.push({ role: "assistant", content: text });
          }
        }
      }
      return msgs;
    },

    stripStats(text) {
      return String(text || "")
        .replace(STATS_RE, "")
        .replace(/<<STATS[\s\S]*$/, "")   // cut off an interrupted tail too
        .replace(/\n{3,}/g, "\n\n")
        .trimEnd();
    },

    /* Full cleanup: strip engine tail + template/stat garbage the model may echo.
       Applied to display AND to history sent back to the model. */
    sanitize(text) {
      let s = String(text || "");
      // unescape HTML entities (up to 2 passes for double-escaped input)
      for (let i = 0; i < 2; i++) {
        const next = s.replace(/&(lt|gt|quot|#39|amp);/g, (_, e) =>
          ({ lt: "<", gt: ">", quot: '"', "#39": "'", amp: "&" }[e]));
        if (next === s) break;
        s = next;
      }
      s = this.stripStats(s);
      // markdown-escaped brackets: \[ … \] → [ … ]
      s = s.replace(/\\([\[\]])/g, "$1");
      // special tokens: <|...|>
      s = s.replace(/<\|[^|]{0,60}\|>/g, "");
      // XML-ish tags: </CHARACTER_DESCRIPTION>, <decimalradan">, <b>, …
      s = s.replace(/<\/?[A-Za-z][^<>]{0,80}>/g, "");
      // stat blocks: [Харизма: 0.7], [Стат: 12], …
      s = s.replace(/\[\s*[^\[\]]{1,30}:\s*\d+(?:\.\d+)?[^\[\]]{0,40}\]/g, "");
      // «Шар Инициативы: [(…) + (…)]»-style system lines (label + brackets with symbols)
      s = s.replace(/[А-ЯЁA-Z][А-ЯЁа-яёA-Za-z\s]{0,30}:\s*\[[^\[\]]{0,160}[\(\)\+\=\/\|][^\[\]]{0,160}\]/g, "");
      // template placeholders
      s = s.replace(/\{\{\s*char\s*\}\}/gi, () => (window.State ? State.game.character.name : "NPC"));
      s = s.replace(/\{\{\s*user\s*\}\}/gi, () => (window.State ? State.game.playerName : "You"));
      s = s.replace(/\{\{[^}]{1,40}\}\}/g, "");
      // collapse blanks left by removals
      s = s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
      return s;
    },

    parseStats(text) {
      const m = String(text || "").match(STATS_RE);
      if (!m) return null;
      try {
        const obj = JSON.parse(m[1]);
        return obj && typeof obj === "object" ? obj : null;
      } catch (e) {
        // tolerate trailing garbage / smart quotes
        try {
          const cleaned = m[1].replace(/[“”]/g, '"').replace(/,\s*}/g, "}");
          return JSON.parse(cleaned);
        } catch (e2) { return null; }
      }
    },

    /* ── transport ── */
    _endpoint() {
      const s = State.settings;
      if (s.direct) {
        const base = (s.base || "").trim().replace(/\/+$/, "");
        return (base || "https://api.openai.com/v1") + "/chat/completions";
      }
      return "/api/chat";
    },

    _payload(messages, stream) {
      const s = State.settings;
      const t = Number(s.temperature);
      return {
        base: (s.base || "").trim(),
        key: s.key || "",
        model: s.model || "",
        temperature: Number.isFinite(t) ? t : 1.0,   // keep 0 — it is a valid value
        max_tokens: Number(s.maxTokens) || 1500,
        messages,
        stream: !!stream
      };
    },

    /* Direct browser call (CORS must allow it). */
    async _direct(messages, signal) {
      const s = State.settings;
      const resp = await fetch(this._endpoint(), {
        method: "POST",
        signal,
        headers: {
          "Content-Type": "application/json",
          ...(s.key ? { "Authorization": "Bearer " + s.key } : {})
        },
        body: JSON.stringify(this._payload(messages, false))
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error?.message || data.error || `HTTP ${resp.status}`);
      return data;
    },

    /* Local proxy (server.py) with SSE streaming. onDelta(textChunk) */
    async _proxyStream(messages, onDelta, signal) {
      const resp = await fetch("/api/chat", {
        method: "POST",
        signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(this._payload(messages, true))
      });
      if (!resp.ok) {
        let msg = `HTTP ${resp.status}`;
        try {
          const j = await resp.json();
          msg = j.error || msg;
        } catch (e) {}
        throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
      }
      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let buf = "", full = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 1);
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (payload === "[DONE]") { buf = ""; break; }
          try {
            const j = JSON.parse(payload);
            const delta = j.choices?.[0]?.delta?.content
                       ?? j.choices?.[0]?.message?.content
                       ?? "";
            if (delta) { full += delta; onDelta(delta); }
          } catch (e) { /* partial/keep-alive line */ }
        }
      }
      if (!full.trim()) throw new Error("Пустой ответ модели — проверь model в настройках (⚙ API).");
      return full;
    },

    /* Public: generate a reply.
       onDelta(chunk) — streaming chunks (already raw, includes <<STATS>> tail).
       signal — AbortController.signal for the Stop button.
       returns raw full text. */
    async generate(messages, onDelta, signal) {
      if (State.settings.direct) {
        const data = await this._direct(messages, signal);
        const text = data.choices?.[0]?.message?.content || "";
        if (onDelta && text) {
          // fake chunking so the UI still "streams"
          for (let i = 0; i < text.length; i += 24) {
            if (signal && signal.aborted) throw new DOMException("Aborted", "AbortError");
            onDelta(text.slice(i, i + 24));
            await new Promise(r => setTimeout(r, 8));
          }
        }
        return text;
      }
      return this._proxyStream(messages, onDelta || (() => {}), signal);
    },

    async testConnection() {
      if (State.settings.direct) {
        const s = State.settings;
        const base = (s.base || "https://api.openai.com/v1").replace(/\/+$/, "");
        const r = await fetch(base + "/models", {
          headers: s.key ? { "Authorization": "Bearer " + s.key } : {}
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        return j.data?.length || 0;
      }
      const r = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base: State.settings.base, key: State.settings.key })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      return j.data?.length || 0;
    }
  };

  window.Api = Api;
})();
