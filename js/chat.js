/* ═══════════ chat: render · send · stream · stop · regenerate ═══════════ */
(function () {
  let uid = 1;
  let busy = false;
  let fileGreeting = null; // текст из first-message.txt (приоритет над дефолтным)

  /* ── tiny safe markdown for bubbles (escape first, then format) ── */
  function mdRender(raw) {
    let s = esc(raw == null ? "" : String(raw));
    s = s.replace(/^(\*{3,}|-{3,})$/gm, "<hr>");
    s = s.replace(/\*\*\*([^*]+)\*\*\*/g, "<strong><em>$1</em></strong>");
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/(^|[^*\w])\*([^*\n]+)\*/g, "$1<em>$2</em>");
    s = s.replace(/(^|[^_\w])_([^_\n]+)_/g, "$1<em>$2</em>");
    s = s.replace(/^(?:&gt;)\s?(.+)$/gm, "<blockquote>$1</blockquote>");
    const parts = s.split(/\n{2,}/);
    s = parts.map(p => {
      p = p.trim();
      if (!p) return "";
      if (/^<(?:hr|blockquote)/.test(p)) return p;
      return "<p>" + p.replace(/\n/g, "<br>") + "</p>";
    }).join("");
    return s;
  }

  const Chat = {
    get busy() { return busy; },

    init() {
      this.$list = document.getElementById("messages");
      this.$input = document.getElementById("input");
      this.$send = document.getElementById("btnSend");
      this.$skip = document.getElementById("skipTime");

      this.$send.addEventListener("click", () => {
        if (busy) this.stop(); else this.send();
      });
      this.$input.addEventListener("keydown", e => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          if (!busy) this.send();
        }
      });
      this.$input.addEventListener("input", () => this.autogrow());

      // floating "jump to bottom"
      this.$scrollDown = document.getElementById("scrollDown");
      this.$scrollDown.addEventListener("click", () => {
        this._stick = true;
        this.scrollBottom();
      });
      this.$list.addEventListener("scroll", () => {
        const el = this.$list;
        const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
        this._stick = atBottom;
        this.$scrollDown.classList.toggle("hidden", atBottom);
      });

      window.addEventListener("beforeunload", () => State.save());
      this.ensureGreeting();
      this.render();
    },

    /* greeting source: first-message.txt in the repo (user's own neural-net
       first message). Falls back to DEFAULT_GAME.greeting when absent. */
    async loadGreetingFile() {
      try {
        const r = await fetch("first-message.txt", { cache: "no-store" });
        if (!r || !r.ok) return false;
        const text = (await r.text()).replace(/\r\n?/g, "\n").trim();
        if (!text) return false;
        fileGreeting = text;
        const changed = State.game.greeting !== text;
        State.game.greeting = text;
        const msgs = State.play.messages;
        if (msgs.length === 1 && msgs[0].greeting && msgs[0].variants[0].text !== text) {
          // lone greeting from an earlier boot → refresh it from the file
          msgs[0].variants[0].text = text;
          State.scheduleSave();
          if (this.$list) this.render();
        } else if (changed) {
          State.scheduleSave();
        }
        return true;
      } catch (e) {
        return false; // no file (file://, old checkout) → keep current greeting
      }
    },

    /* first launch: in-character greeting from the bot */
    ensureGreeting() {
      if (State.play.messages.length) return;
      if (fileGreeting && State.game.greeting !== fileGreeting) State.game.greeting = fileGreeting;
      const text = (fileGreeting || State.game.greeting || "").trim();
      if (!text) return;
      State.play.messages.push({
        id: uid++, role: "assistant", ts: Date.now(),
        before: State.snapshot(), timeInfo: null, greeting: true,
        variants: [{ text, status: null, stats: null }],
        v: 0
      });
      State.scheduleSave();
    },

    autogrow() {
      const el = this.$input;
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 180) + "px";
    },

    /* ─────────────── rendering ─────────────── */
    render() {
      const list = this.$list;
      list.innerHTML = "";
      if (!State.settings.base) list.appendChild(this.welcomeNode());
      for (const m of State.play.messages) list.appendChild(this.messageNode(m));
      if (this._stick !== false) this.scrollBottom(false);
      this.$scrollDown.classList.add("hidden");
    },

    welcomeNode() {
      const d = document.createElement("div");
      d.className = "welcome";
      d.innerHTML = `
        <h2><img class="ava-welcome" src="${esc(State.avatarSrc())}" alt=""> ⚔ The King's Order</h2>
        <p>Локальная RP-игра: чат с ботом через твой API, умный Trust, время, гардероб и локации.</p>
        <p>1. Нажми <b>⚙ API</b> и введи провайдера (OpenAI-совместимый: OpenAI, DeepSeek, KoboldCpp, Ollama…)</p>
        <p>2. Жми <kbd>Enter</kbd> и играй. Панель справа — состояние мира.</p>
        <p style="color:#6a6a74;margin-top:14px">Все данные хранятся локально в браузере · <button class="ghost-btn" onclick="UI.openExport()">экспорт</button></p>`;
      return d;
    },

    messageNode(m) {
      const wrap = document.createElement("div");
      wrap.className = "msg " + (m.role === "user" ? "user" : "bot");
      wrap.dataset.id = m.id;

      if (m.role === "user") {
        wrap.innerHTML = `
          <div class="bubble"></div>
          <div class="meta">${this.fmtTime(m.ts)}</div>`;
        wrap.querySelector(".bubble").textContent = m.content;
        return wrap;
      }

      // ── assistant: avatar + column ──
      const ava = document.createElement("img");
      ava.className = "ava";
      ava.src = State.avatarSrc();
      ava.alt = "";
      wrap.appendChild(ava);

      const col = document.createElement("div");
      col.className = "col";
      wrap.appendChild(col);

      const v = m.variants[m.v] || m.variants[0];
      const bubble = document.createElement("div");
      bubble.className = "bubble";
      // the user's own first-message.txt is rendered as-is (no filters)
      bubble.innerHTML = mdRender(m.greeting ? v.text : Api.sanitize(v.text));
      col.appendChild(bubble);

      if (State.play.toggles.statusLine && v.status && v.status.length) {
        const st = document.createElement("div");
        st.className = "status";
        st.innerHTML = v.status.join("");
        col.appendChild(st);
      }

      const meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = this.fmtTime(m.ts)
        + (m.streaming ? " · генерация…" : "")
        + (m.stopped ? " · остановлено" : "");
      col.appendChild(meta);

      if (m.error) {
        const box = document.createElement("div");
        box.className = "status";
        box.style.borderColor = "#57272b";
        box.style.background = "#1d1215";
        box.innerHTML = `<span class="down">⚠ ${esc(m.error)}</span>`;
        const retry = document.createElement("button");
        retry.className = "ghost-btn";
        retry.style.marginTop = "6px";
        retry.textContent = "⟲ Повторить";
        retry.onclick = () => this.retry(m);
        box.appendChild(retry);
        col.appendChild(box);
        return wrap;
      }

      const actions = document.createElement("div");
      actions.className = "actions";
      if (m.variants.length > 1) {
        const sw = document.createElement("button");
        sw.innerHTML = `<span class="variant">${m.v + 1}/${m.variants.length}</span> ⇄`;
        sw.title = "Другой вариант ответа";
        sw.onclick = () => this.switchVariant(m);
        actions.appendChild(sw);
      }
      if (!m.greeting) {
        const regen = document.createElement("button");
        regen.textContent = "⟲ Перегенерировать";
        regen.title = "Шкалы и время вернутся к состоянию до этого ответа";
        regen.onclick = () => this.regenerate(m);
        actions.appendChild(regen);
      }
      const copy = document.createElement("button");
      copy.textContent = "📋";
      copy.title = "Копировать";
      copy.onclick = () => navigator.clipboard?.writeText(m.greeting ? v.text : Api.sanitize(v.text));
      actions.appendChild(copy);
      col.appendChild(actions);
      return wrap;
    },

    fmtTime(ts) {
      if (!ts) return "";
      const d = new Date(ts);
      return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    },

    scrollBottom(smooth = true) {
      requestAnimationFrame(() => {
        const el = this.$list;
        if (typeof el.scrollTo === "function") el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
        else el.scrollTop = el.scrollHeight;
      });
    },

    /* ─────────────── send / stop ─────────────── */
    stop() {
      if (this._ctrl) this._ctrl.abort();
    },

    _setSendMode(mode) {
      if (mode === "stop") {
        this.$send.classList.add("stop");
        this.$send.textContent = "⏹";
        this.$send.title = "Остановить генерацию";
      } else {
        this.$send.classList.remove("stop");
        this.$send.textContent = "➤";
        this.$send.title = "Отправить";
      }
    },

    async send() {
      if (busy) return;
      const text = this.$input.value.trim();
      if (!text) return;

      // 1) queued edits ("вступит в силу с вашего следующего сообщения")
      Engine.flushPending();

      // 2) clock: +5 in-story minutes per active interaction (unless skipped)
      const skip = this.$skip.checked;
      this.$skip.checked = false;
      let timeInfo = null;
      if (!skip) {
        const res = Engine.advanceTime(State.game.time.stepMinutes || 5);
        timeInfo = { delta: res.after - res.before, dayRolled: res.dayRolled };
      }

      // 3) snapshot BEFORE this reply — rollback point for regenerate
      const snap = State.snapshot();

      const um = { id: uid++, role: "user", content: text, ts: Date.now() };
      State.play.messages.push(um);

      this.$input.value = "";
      this.autogrow();
      this._stick = true;
      this.render();

      const am = {
        id: uid++, role: "assistant", ts: Date.now(),
        before: snap, timeInfo,
        variants: [{ text: "", status: null }],
        v: 0, streaming: true
      };
      State.play.messages.push(am);
      this.render();
      this._showTyping(am);

      await this._generate(am, snap, timeInfo);
    },

    _showTyping(am) {
      const node = this.$list.querySelector(`[data-id="${am.id}"] .bubble`);
      if (node) node.innerHTML = `<span class="typing"><i></i><i></i><i></i></span>`;
      this.scrollBottom();
    },

    async _generate(am, snap, timeInfo) {
      busy = true;
      this._setSendMode("stop");
      this._ctrl = new AbortController();
      const history = State.play.messages.filter(m => m.id !== am.id);
      const payload = Api.buildMessages(history);

      let acc = "";
      try {
        const raw = await Api.generate(payload, chunk => {
          acc += chunk;
          const node = this.$list.querySelector(`[data-id="${am.id}"] .bubble`);
          if (node) node.innerHTML = mdRender(Api.sanitize(acc)) || "…";
          if (this._stick !== false) this.scrollBottom();
        }, this._ctrl.signal);

        const full = (raw || acc).trim();
        if (!full) throw new Error("Пустой ответ модели.");

        // apply structured stats
        const stats = Api.parseStats(full);
        const applied = Engine.applyModelStats(stats);
        const statusLines = Engine.buildStatus(applied, timeInfo);

        const v = am.variants[am.v];
        v.text = full;
        v.status = statusLines;
        v.stats = stats || null;
        am.streaming = false;
        am.ts = Date.now();
        delete am.error;
        delete am.stopped;

        State.scheduleSave();
        this.render();
        UI.refresh();
      } catch (err) {
        const aborted = err && (err.name === "AbortError" || err.code === 20);
        am.streaming = false;
        if (aborted) {
          // user pressed Stop: keep whatever was streamed, no stats applied
          if (acc.trim()) {
            am.stopped = true;
            am.variants[am.v].text = acc;
            am.ts = Date.now();
            delete am.error;
            State.scheduleSave();
          } else {
            am.error = "Остановлено до начала ответа.";
            State.restore(snap);
          }
        } else {
          am.error = err.message || String(err);
          if (acc.trim() && !am.variants[am.v].text) am.variants[am.v].text = acc;
          State.restore(snap);   // stats never applied — state = pre-reply point
        }
        UI.refresh();
        this.render();
      } finally {
        busy = false;
        this._ctrl = null;
        this._setSendMode("send");
        this.$input.focus();
      }
    },

    /* ─────────────── regenerate / switch / retry ─────────────── */
    async retry(m) {
      if (busy || m.role !== "assistant" || !m.error) return;
      delete m.error;
      delete m.stopped;
      const snap = m.before || State.snapshot();
      State.restore(snap);
      m.variants = [{ text: "", status: null }];
      m.v = 0;
      m.streaming = true;
      this._stick = true;
      this.render();
      UI.refresh();
      this._showTyping(m);
      await this._generate(m, snap, m.timeInfo || null);
    },

    async regenerate(m) {
      if (busy || m.role !== "assistant") return;
      State.restore(m.before);
      const snap = State.snapshot();
      m.variants = [{ text: "", status: null }];
      m.v = 0;
      m.streaming = true;
      m.before = snap;
      delete m.stopped;
      this._stick = true;
      this.render();
      UI.refresh();
      this._showTyping(m);
      await this._generate(m, snap, m.timeInfo || null);
    },

    /* switch between generated variants — restores each one's state */
    async switchVariant(m) {
      if (busy || m.variants.length < 2) return;
      State.restore(m.before);

      m.v = (m.v + 1) % m.variants.length;
      const v = m.variants[m.v];
      const stats = v.stats || Api.parseStats(v.text);
      const applied = Engine.applyModelStats(stats);
      v.status = Engine.buildStatus(applied, m.timeInfo || null);

      State.scheduleSave();
      this.render();
      UI.refresh();
    },

    /* ─────────────── history utilities ─────────────── */
    truncateFrom(msgId) {
      const i = State.play.messages.findIndex(m => m.id === msgId);
      if (i < 0) return;
      const m = State.play.messages[i];
      if (m.role === "assistant" && m.before) State.restore(m.before);
      State.play.messages = State.play.messages.slice(0, i);
      State.scheduleSave();
      this.render();
      UI.refresh();
    }
  };

  window.Chat = Chat;
  window.mdRender = mdRender;
})();
