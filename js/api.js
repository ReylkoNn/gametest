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
      system.push(`\n# OUTPUT RULES\n• Stay in character as ${g.character.name}. Never write the player's actions or dialogue.\n• Match the player's language (Russian ↔ English).\n• If "Интерактивные функции" instructions exist above — obey the <<STATS>> contract exactly.\n• No preambles, no out-of-character commentary.`);

      const msgs = [{ role: "system", content: system.join("\n") }];
      for (const m of history) {
        if (m.role === "user") msgs.push({ role: "user", content: m.content });
        else if (m.role === "assistant") {
          const text = this.stripStats(m.content);
          if (text.trim()) msgs.push({ role: "assistant", content: text });
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
      return {
        base: (s.base || "").trim(),
        key: s.key || "",
        model: s.model || "",
        temperature: Number(s.temperature) || 1.0,
        max_tokens: Number(s.maxTokens) || 1500,
        messages,
        stream: !!stream
      };
    },

    /* Direct browser call (CORS must allow it). */
    async _direct(messages) {
      const s = State.settings;
      const resp = await fetch(this._endpoint(), {
        method: "POST",
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
    async _proxyStream(messages, onDelta) {
      const resp = await fetch("/api/chat", {
        method: "POST",
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
       returns raw full text. */
    async generate(messages, onDelta) {
      if (State.settings.direct) {
        const data = await this._direct(messages);
        const text = data.choices?.[0]?.message?.content || "";
        if (onDelta && text) {
          // fake chunking so the UI still "streams"
          for (let i = 0; i < text.length; i += 24) {
            onDelta(text.slice(i, i + 24));
            await new Promise(r => setTimeout(r, 8));
          }
        }
        return text;
      }
      return this._proxyStream(messages, onDelta || (() => {}));
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
