/* ═══════════ chat: render, send, stream, regenerate, variants ═══════════ */
(function () {
  let uid = 1;
  let busy = false;

  const Chat = {
    get busy() { return busy; },

    init() {
      this.$list = document.getElementById("messages");
      this.$input = document.getElementById("input");
      this.$send = document.getElementById("btnSend");
      this.$skip = document.getElementById("skipTime");

      this.$send.addEventListener("click", () => this.send());
      this.$input.addEventListener("keydown", e => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); this.send(); }
      });
      this.$input.addEventListener("input", () => this.autogrow());
      window.addEventListener("beforeunload", () => State.save());
      this.render();
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
      if (!State.play.messages.length) {
        list.appendChild(this.welcomeNode());
        return;
      }
      for (const m of State.play.messages) list.appendChild(this.messageNode(m));
      this.scrollBottom(false);
    },

    welcomeNode() {
      const d = document.createElement("div");
      d.className = "welcome";
      d.innerHTML = `
        <h2>⚔ The King's Order</h2>
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

      // assistant (possibly multi-variant)
      const v = m.variants[m.v] || m.variants[0];
      const bubble = document.createElement("div");
      bubble.className = "bubble";
      bubble.textContent = Api.stripStats(v.text);
      wrap.appendChild(bubble);

      if (State.play.toggles.statusLine && v.status && v.status.length) {
        const st = document.createElement("div");
        st.className = "status";
        st.innerHTML = v.status.join("");
        wrap.appendChild(st);
      }

      const meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = this.fmtTime(m.ts) + (m.streaming ? " · генерация…" : "");
      wrap.appendChild(meta);

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
        wrap.appendChild(box);
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
      const regen = document.createElement("button");
      regen.textContent = "⟲ Перегенерировать";
      regen.title = "Шкалы и время вернутся к состоянию до этого ответа";
      regen.onclick = () => this.regenerate(m);
      actions.appendChild(regen);

      const copy = document.createElement("button");
      copy.textContent = "📋";
      copy.title = "Копировать";
      copy.onclick = () => navigator.clipboard?.writeText(bubble.textContent);
      actions.appendChild(copy);
      wrap.appendChild(actions);
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

    /* ─────────────── send flow ─────────────── */
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
      this.render();

      const am = {
        id: uid++, role: "assistant", ts: Date.now(),
        before: snap, timeInfo,
        variants: [{ text: "", status: null }],
        v: 0, streaming: true
      };
      State.play.messages.push(am);
      this.render();
      const node = this.$list.querySelector(`[data-id="${am.id}"] .bubble`);
      node.innerHTML = `<span class="typing"><i></i><i></i><i></i></span>`;
      this.scrollBottom();

      await this._generate(am, snap, timeInfo);
    },

    async _generate(am, snap, timeInfo) {
      busy = true;
      this.$send.disabled = true;
      const history = State.play.messages.filter(m => m.id !== am.id);
      const payload = Api.buildMessages(history);

      let acc = "";
      try {
        const raw = await Api.generate(payload, chunk => {
          acc += chunk;
          const node = this.$list.querySelector(`[data-id="${am.id}"] .bubble`);
          if (node) node.textContent = Api.stripStats(acc) || "…";
          this.scrollBottom();
        });

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

        State.scheduleSave();
        this.render();
        UI.refresh();
      } catch (err) {
        // keep the slot: partial text (if any) stays, user can retry
        am.streaming = false;
        am.error = err.message || String(err);
        if (acc.trim() && !am.variants[am.v].text) am.variants[am.v].text = acc;
        State.restore(snap);   // stats never applied — state = pre-reply point
        UI.refresh();
        this.render();
      } finally {
        busy = false;
        this.$send.disabled = false;
        this.$input.focus();
      }
    },

    showError(msg) {
      const e = document.createElement("div");
      e.className = "err";
      e.textContent = "⚠ " + msg;
      this.$list.appendChild(e);
      this.scrollBottom();
      setTimeout(() => e.remove(), 12000);
    },

    /* ─────────────── regenerate / switch ─────────────── */
    async retry(m) {
      if (busy || m.role !== "assistant" || !m.error) return;
      delete m.error;
      const snap = m.before || State.snapshot();
      State.restore(snap);
      m.variants = [{ text: "", status: null }];
      m.v = 0;
      m.streaming = true;
      this.render();
      UI.refresh();
      const node = this.$list.querySelector(`[data-id="${m.id}"] .bubble`);
      if (node) node.innerHTML = `<span class="typing"><i></i><i></i><i></i></span>`;
      this.scrollBottom();
      await this._generate(m, snap, m.timeInfo || null);
    },

    async regenerate(m) {
      if (busy || m.role !== "assistant") return;
      // restore scales/time/clothes to the moment BEFORE this reply
      State.restore(m.before);

      // build a fresh variant
      const snap = State.snapshot();       // identical to m.before (just restored)
      const history = State.play.messages.filter(x => x.id !== m.id);
      const payload = Api.buildMessages(history);

      // drop any existing variants (fresh regeneration), keep slot
      m.variants = [{ text: "", status: null }];
      m.v = 0;
      m.streaming = true;
      m.before = snap;
      this.render();
      UI.refresh();

      const node = this.$list.querySelector(`[data-id="${m.id}"] .bubble`);
      if (node) node.innerHTML = `<span class="typing"><i></i><i></i><i></i></span>`;
      this.scrollBottom();

      await this._generate(m, snap, m.timeInfo || null);
    },

    /* switch between previously generated variants — restores each one's state */
    async switchVariant(m) {
      if (busy || m.variants.length < 2) return;
      // apply state of the variant we are LEAVING? No: snapshots are pre-reply,
      // identical for all variants — restore, then apply target variant's stats.
      State.restore(m.before);

      m.v = (m.v + 1) % m.variants.length;
      const v = m.variants[m.v];
      const stats = v.stats || Api.parseStats(v.text);
      // re-apply this variant's deltas on top of the restored snapshot
      const applied = Engine.applyModelStats(stats);
      v.status = Engine.buildStatus(applied, m.timeInfo || null);
      // timeInfo stays attached to the message (shared pre-state)

      State.scheduleSave();
      this.render();
      UI.refresh();
    },

    /* ─────────────── history utilities ─────────────── */
    lastSnapshot() {
      const msgs = State.play.messages;
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === "assistant") return msgs[i].before;
      }
      return State.snapshot();
    },

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
})();
