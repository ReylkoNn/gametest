/* ═══════════ ui: cards · modals · toggles · settings ═══════════ */
(function () {
  const UI = {
    topbarHidden: false,

    init() {
      this.$cards = document.getElementById("cards");
      this.$topbar = document.getElementById("topbar");
      this.$topText = document.getElementById("topbarText");
      this.$topShow = document.getElementById("topbarShow");
      this.$modal = document.getElementById("modalRoot");
      this.$scrim = document.getElementById("scrim");
      this.$side = document.getElementById("side");

      document.getElementById("topbarClose").onclick = () => this.hideTopbar();
      this.$topShow.onclick = () => this.showTopbar();
      document.getElementById("btnSettings").onclick = () => this.openSettings();
      document.getElementById("btnPanel").onclick = () => this.openSide();
      document.getElementById("closeSide").onclick = () => this.closeSide();
      this.$scrim.onclick = () => { this.closeSide(); this.closeModal(); };
      document.addEventListener("keydown", e => { if (e.key === "Escape") this.closeModal(); });

      this.renderAll();
    },

    refresh() { this.renderAll(); },

    renderAll() {
      this.renderTopbar();
      this.renderCards();
    },

    /* ───────────── top status bar ───────────── */
    renderTopbar() {
      const hidden = this.topbarHidden || State.play.toggles.hideStats;
      this.$topbar.classList.toggle("hidden", hidden);
      this.$topShow.classList.toggle("hidden", !hidden);
      document.body.classList.toggle("no-topbar", hidden);
      if (hidden) return;
      const lvl = Engine.levelName(State.play.trust);
      const pend = Engine.pendingCount();
      this.$topText.innerHTML =
        `<span class="dot">●</span> Сейчас: <b>Trust LVL</b> · <span class="lvl">${esc(lvl)}</span>` +
        (pend ? ` <span style="color:#e8912d">· ⏳${pend}</span>` : "");
    },
    hideTopbar() { this.topbarHidden = true; this.renderTopbar(); },
    showTopbar() { this.topbarHidden = false; this.renderTopbar(); },

    /* ───────────── side cards ───────────── */
    renderCards() {
      const p = State.play, g = State.game;
      const pend = p.pending;
      const hide = p.toggles.hideStats;
      const pendMark = k => pend[k] != null ? ` <span style="color:#e8912d;font-weight:400">⏳</span>` : "";

      this.$cards.innerHTML = `

      <!-- LOCATION -->
      <section class="card">
        <div class="card-head" onclick="UI.openLocation()">
          <span class="ico">📍</span><span class="title">Location</span>
          <span class="value">${esc(pendingLabel(pend.location, p.location))}${pendMark("location")}</span>
          <span class="pen">✎</span>
        </div>
      </section>

      <!-- DAY / TIME -->
      <section class="card">
        <div class="card-head" onclick="UI.openDateTime()">
          <span class="ico">🕐</span><span class="title">Day/Time</span>
          <span class="pen">✎</span>
        </div>
        <div class="now-block">
          <span class="moon">🌙</span>
          <div>
            <div class="l1">День ${p.day} · ${Engine.fmtClock(p.minutes)}${pend.minutes != null || pend.day != null ? ' <span style="color:#e8912d">⏳</span>' : ""}</div>
            <div class="l2">День ${p.day} истории · ${Engine.periodLabel(p.minutes)}</div>
          </div>
        </div>

        <div class="sec-label">Как движется время</div>
        <div class="hint"><span class="arr">↑</span>
          <span>Each active interaction advances the in-story time by ${g.time.stepMinutes} minutes unless time is skipped.</span></div>

        <div class="sec-label">Время суток</div>
        <div class="rows">
          ${g.time.periods.map((per, i) => {
            const here = Engine.periodIndex(p.minutes) === i;
            return `<div class="row${here ? " here" : ""}">
              <span class="k">${String(per.hour).padStart(2, "0")}:00</span>
              <span class="v">${esc(per.label)}</span>
              ${here ? `<span class="badge">Вы здесь</span>` : ""}
            </div>`;
          }).join("")}
        </div>

        <div class="sec-label">Дни</div>
        <div class="rows">
          ${g.days.map((d, i) => {
            const here = dayHere(d, p.day, i, g.days.length);
            return `<div class="row${here ? " here" : ""}">
              <span class="k">День ${d.match === 2 ? "2+" : d.match}</span>
              <span class="v">${esc(d.title)}</span>
              ${here ? `<span class="badge">Вы здесь</span>` : ""}
            </div>`;
          }).join("")}
        </div>
      </section>

      <!-- NPC CLOTHES -->
      <section class="card">
        <div class="card-head" onclick="UI.openClothes('npc')">
          <span class="ico">👗</span><span class="title">${esc(g.character.name)}'s Clothes</span>
          <span class="value">${esc(pendingLabel(pend.npcClothes, p.npcClothes))}${pendMark("npcClothes")}</span>
          <span class="pen">✎</span>
        </div>
      </section>

      <!-- PLAYER CLOTHES -->
      <section class="card">
        <div class="card-head" onclick="UI.openClothes('player')">
          <span class="ico">👕</span><span class="title">Your Clothes</span>
          <span class="value">${esc(pendingLabel(pend.playerClothes, p.playerClothes))}${pendMark("playerClothes")}</span>
          <span class="pen">✎</span>
        </div>
      </section>

      <!-- TRUST -->
      <section class="card">
        <div class="card-head" onclick="UI.openTrust()">
          <span class="ico">✨</span><span class="title">Trust</span>
          <span class="pen">✎</span>
        </div>
        ${hide ? `<div class="card-sub" style="padding-left:0;margin-top:10px">Скрыто («Скрыть показатели» включено)</div>` : `
        <div class="trust-top">
          <span class="lvl-name" style="color:var(--mut);font-size:13.5px">Trust LVL</span>
          <span class="val">${p.trust} / ${g.trust.max}</span>
        </div>
        <div class="bar"><i style="width:${Engine.trustPct()}%"></i></div>

        <div class="sec-label">Повышает его</div>
        ${g.trust.increase.map(r => `<div class="rule up"><span class="arr">↑</span><span>${esc(r)}</span></div>`).join("")}

        <div class="sec-label">Понижает его</div>
        ${g.trust.decrease.map(r => `<div class="rule down"><span class="arr">↓</span><span>${esc(r)}</span></div>`).join("")}

        <div class="sec-label">Уровни</div>
        <div class="rows">
          ${g.trust.levels.map(l => {
            const here = p.trust >= l.min && p.trust <= l.max;
            return `<div class="row${here ? " here" : ""}">
              <span class="k">${l.min}–${l.max}</span>
              <span class="v lvl-name">${esc(l.name)}</span>
              ${here ? `<span class="badge">Вы здесь</span>` : ""}
            </div>`;
          }).join("")}
        </div>`}
      </section>

      <!-- RULEBOOK -->
      <section class="card">
        <div class="card-head" onclick="UI.toggleRulebook(this)">
          <span class="ico">📖</span><span class="title">Rulebook</span>
          <span class="pen">✎</span>
        </div>
        <div class="rulebook" style="display:none;margin-top:10px" data-rb>${esc(g.rulebook)}
          <div style="margin-top:10px"><button class="ghost-btn" onclick="event.stopPropagation();UI.editRulebook()">Редактировать</button></div>
        </div>
      </section>

      <!-- TOGGLES -->
      <section class="card">
        <div class="tgl-row">
          <div class="txt"><b>Интерактивные функции</b>
            <span>Отключите, чтобы общаться с Приказом Короля как с обычным персонажем. Значения шкал останутся без изменений.</span></div>
          <label class="switch"><input type="checkbox" ${p.toggles.interactive ? "checked" : ""}
            onchange="UI.setToggle('interactive',this.checked)"><span class="track"></span></label>
        </div>
        <div class="tgl-row">
          <div class="txt"><b>Скрыть показатели</b>
            <span>Убирает шкалы с экрана. Они продолжают обновляться и по-прежнему влияют на ответы Приказа Короля.</span></div>
          <label class="switch"><input type="checkbox" ${p.toggles.hideStats ? "checked" : ""}
            onchange="UI.setToggle('hideStats',this.checked)"><span class="track"></span></label>
        </div>
        <div class="tgl-row">
          <div class="txt"><b>Изменения статуса в чате</b>
            <span>Показывает строку под ответом при каждом изменении статуса Приказа Короля.</span></div>
          <label class="switch"><input type="checkbox" ${p.toggles.statusLine ? "checked" : ""}
            onchange="UI.setToggle('statusLine',this.checked)"><span class="track"></span></label>
        </div>
      </section>

      <!-- CHARACTER -->
      <section class="card">
        <div class="card-head" onclick="UI.openCharacter()">
          <span class="ico">👑</span>
          <span class="title">${esc(g.title)}</span>
          <span class="pen">✎</span>
        </div>
        <div class="card-sub" style="padding-left:31px">от @ecchibii · <span style="color:#4f7ff0;cursor:pointer" onclick="event.stopPropagation();UI.openCharacter()">Посмотреть ›</span></div>
        <div class="tags">
          ${g.tags.map(t => `<span class="tag">${esc(t)}</span>`).join("")}
          <span class="tag add" onclick="event.stopPropagation();UI.addTag()">+ Предложить тег</span>
        </div>
        <div class="card-sub" style="padding-left:0;margin-top:10px">Шкалы отображаются вверху чата и меняются по мере развития сюжета.</div>
      </section>

      <!-- SAVE / LOAD -->
      <section class="card">
        <div class="card-head">
          <span class="ico">💾</span><span class="title">Сохранение</span>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
          <button class="ghost-btn" onclick="UI.openExport()">Экспорт JSON</button>
          <button class="ghost-btn" onclick="document.getElementById('importFile').click()">Импорт JSON</button>
          <button class="ghost-btn" onclick="UI.resetAll()" style="color:#ff9b9b">Новая игра</button>
          <input type="file" id="importFile" accept="application/json" class="hidden"
                 onchange="UI.doImport(this.files[0]);this.value=''">
        </div>
      </section>
      `;
    },

    /* ───────────── generic modal plumbing ───────────── */
    openModal(html) {
      this.$modal.innerHTML = html;
      this.$modal.classList.remove("hidden");
      this.$scrim.classList.remove("hidden");
    },
    closeModal() {
      this.$modal.classList.add("hidden");
      this.$modal.innerHTML = "";
      if (this.$side.classList.contains("open")) return; // scrim still needed for side
      this.$scrim.classList.add("hidden");
    },
    modalShell({ ico, title, now, body, foot }) {
      return `
        <div class="modal" onclick="event.stopPropagation()">
          <div class="modal-head">
            <span class="ico">${ico}</span>
            <span class="title">${esc(title)}</span>
            ${now != null ? `<span class="now-val">${esc(now)}</span>` : ""}
            <button class="close" onclick="UI.closeModal()">✕</button>
          </div>
          ${body}
          ${foot || ""}
        </div>`;
    },

    /* ───────────── LOCATION ───────────── */
    openLocation() {
      const sel = { v: State.play.pending.location ?? State.play.location };
      const draw = () => {
        this.openModal(this.modalShell({
          ico: "📍", title: "Location", now: sel.v,
          body: `<div class="chips" id="locChips">${
            State.game.locations.map(l =>
              `<button class="chip ${l === sel.v ? "sel-green" : ""}" data-l="${esc(l)}">${esc(l)}</button>`
            ).join("")
          }</div>
          <div style="display:flex;gap:14px;align-items:center;margin-top:16px">
            <div class="note-left">Вступит в силу с вашего следующего сообщения.</div>
          </div>
          <div class="modal-foot">
            <button class="btn-plain" onclick="UI.closeModal()">Отмена</button>
            <button class="btn-primary" id="locApply">Применить</button>
          </div>`
        }));
        this.$modal.querySelectorAll("#locChips .chip").forEach(b => {
          b.onclick = () => { sel.v = b.dataset.l; draw(); };
        });
        this.$modal.querySelector("#locApply").onclick = () => {
          Engine.queuePending("location", sel.v);
          this.closeModal(); this.renderAll();
        };
      };
      draw();
    },

    /* ───────────── CLOTHES ───────────── */
    openClothes(kind) {
      const isNpc = kind === "npc";
      const g = State.game;
      const title = isNpc ? `${g.character.name}'s Clothes` : "Your Clothes";
      const current = isNpc ? State.play.npcClothes : State.play.playerClothes;
      const pendKey = isNpc ? "npcClothes" : "playerClothes";
      const list = isNpc ? g.wardrobe.npc : g.wardrobe.player;
      const sel = { v: State.play.pending[pendKey] ?? current };

      const draw = () => {
        this.openModal(this.modalShell({
          ico: isNpc ? "👗" : "👕", title, now: sel.v,
          body: `<div class="chips" id="clChips">${
            list.map(l =>
              `<button class="chip ${l === sel.v ? (isNpc ? "sel-orange" : "sel-blue") : ""}" data-l="${esc(l)}">${esc(l)}</button>`
            ).join("")
          }</div>
          <div class="note-left" style="margin-top:16px">Вступит в силу с вашего следующего сообщения.</div>
          <div class="modal-foot">
            <button class="btn-plain" onclick="UI.closeModal()">Отмена</button>
            <button class="btn-primary" id="clApply">Применить</button>
          </div>`
        }));
        this.$modal.querySelectorAll("#clChips .chip").forEach(b => {
          b.onclick = () => { sel.v = b.dataset.l; draw(); };
        });
        this.$modal.querySelector("#clApply").onclick = () => {
          Engine.queuePending(pendKey, sel.v);
          this.closeModal(); this.renderAll();
        };
      };
      draw();
    },

    /* ───────────── DAY / TIME ───────────── */
    openDateTime() {
      const p = State.play;
      const draft = {
        day: p.pending.day ?? p.day,
        minutes: p.pending.minutes ?? p.minutes
      };
      const draw = () => {
        const perIdx = Engine.periodIndex(draft.minutes);
        this.openModal(this.modalShell({
          ico: "🕐", title: "Day/Time",
          body: `
          <div class="now-block" style="margin-top:6px">
            <span class="moon">🌙</span>
            <div><div class="l1">День ${draft.day} · ${Engine.fmtClock(draft.minutes)}</div>
            <div class="l2">${Engine.periodLabel(draft.minutes)}</div></div>
          </div>

          <div class="dt-day">
            <span class="lbl">День</span>
            <button class="step-btn" id="dayMinus">−</button>
            <span class="num">${draft.day}</span>
            <button class="step-btn" id="dayPlus">+</button>
          </div>

          <div class="dt-day" style="align-items:flex-start">
            <span class="lbl" style="padding-top:9px">Время</span>
            <div class="chips" style="flex:1" id="perChips">
              ${State.game.time.periods.map((per, i) =>
                `<button class="chip ${i === perIdx ? "sel-orange" : ""}" data-i="${i}">${esc(per.label)}</button>`
              ).join("")}
              <button class="chip" id="hMinus">−1 час</button>
              <button class="chip" id="hPlus">+1 час</button>
            </div>
          </div>

          <div class="dt-current">
            <span class="d">День ${draft.day}</span>
            <span class="t">${Engine.fmtClock(draft.minutes)}</span>
          </div>

          <div style="display:flex;gap:14px;align-items:center;margin-top:14px">
            <div class="note-left">Вступит в силу с вашего следующего сообщения.</div>
          </div>
          <div class="modal-foot">
            <button class="btn-plain" onclick="UI.closeModal()">Отмена</button>
            <button class="btn-primary" id="dtApply">Применить</button>
          </div>`
        }));

        this.$modal.querySelector("#dayMinus").onclick = () => { draft.day = Math.max(1, draft.day - 1); draw(); };
        this.$modal.querySelector("#dayPlus").onclick = () => { draft.day += 1; draw(); };
        this.$modal.querySelectorAll("#perChips .chip[data-i]").forEach(b => {
          b.onclick = () => {
            const per = State.game.time.periods[+b.dataset.i];
            const cur = draft.minutes % 60;
            draft.minutes = per.hour * 60 + cur;
            if (draft.minutes >= 1440) draft.minutes = 1439;
            draw();
          };
        });
        this.$modal.querySelector("#hMinus").onclick = () => { draft.minutes = ((draft.minutes - 60) % 1440 + 1440) % 1440; draw(); };
        this.$modal.querySelector("#hPlus").onclick = () => { draft.minutes = (draft.minutes + 60) % 1440; draw(); };
        this.$modal.querySelector("#dtApply").onclick = () => {
          Engine.queuePending("day", draft.day);
          Engine.queuePending("minutes", draft.minutes);
          this.closeModal(); this.renderAll();
        };
      };
      draw();
    },

    /* ───────────── TRUST manual edit ───────────── */
    openTrust() {
      const g = State.game;
      const draft = { v: State.play.trust };
      const draw = () => {
        const lvl = Engine.levelName(draft.v);
        this.openModal(this.modalShell({
          ico: "✨", title: "Trust", now: `${draft.v} / ${g.trust.max}`,
          body: `
          <div class="bar" style="margin-top:10px"><i style="width:${clamp(draft.v / g.trust.max, 0, 1) * 100}%"></i></div>
          <div style="text-align:center;color:var(--mut);margin-top:10px;font-size:14px">
            Trust LVL · <span style="color:var(--yellow)">${esc(lvl)}</span></div>
          <div class="trust-edit">
            <button class="step-btn" id="tMinus">−</button>
            <input type="number" id="tInput" min="0" max="${g.trust.max}" value="${draft.v}">
            <button class="step-btn" id="tPlus">+</button>
          </div>
          <div class="quick">
            <button class="minus" data-d="-5">−5</button>
            <button class="minus" data-d="-2">−2</button>
            <button class="minus" data-d="-1">−1</button>
            <button class="plus" data-d="1">+1</button>
            <button class="plus" data-d="2">+2</button>
            <button class="plus" data-d="5">+5</button>
          </div>
          <div class="note-left" style="text-align:center">Ручная правка. Бот тоже двигает шкалу через &laquo;Интерактивные функции&raquo;.</div>
          <div class="modal-foot">
            <button class="btn-plain" onclick="UI.closeModal()">Отмена</button>
            <button class="btn-primary" id="tApply">Применить</button>
          </div>`
        }));
        const input = this.$modal.querySelector("#tInput");
        this.$modal.querySelector("#tMinus").onclick = () => { draft.v = clamp(draft.v - 1, 0, g.trust.max); draw(); };
        this.$modal.querySelector("#tPlus").onclick = () => { draft.v = clamp(draft.v + 1, 0, g.trust.max); draw(); };
        input.onchange = () => { draft.v = clamp(+input.value || 0, 0, g.trust.max); };
        this.$modal.querySelectorAll(".quick button").forEach(b => {
          b.onclick = () => { draft.v = clamp(draft.v + (+b.dataset.d), 0, g.trust.max); draw(); };
        });
        this.$modal.querySelector("#tApply").onclick = () => {
          State.play.trust = clamp(draft.v, 0, g.trust.max);
          State.scheduleSave();
          this.closeModal(); this.renderAll();
        };
      };
      draw();
    },

    /* ───────────── SETTINGS (API) ───────────── */
    openSettings() {
      const s = State.settings;
      this.openModal(this.modalShell({
        ico: "⚙", title: "Настройки API",
        body: `
        <div class="field">
          <label>API Base URL (OpenAI-совместимый)</label>
          <input id="setBase" value="${esc(s.base)}" placeholder="https://api.openai.com/v1">
          <div class="tip">Примеры: <code>https://api.deepseek.com/v1</code> · локальный <code>http://localhost:5001/v1</code> (KoboldCpp / Ollama / llama.cpp) · <code>https://api.openai.com/v1</code>. Пусто по умолчанию — введи свой.</div>
        </div>
        <div class="field">
          <label>API Key</label>
          <input id="setKey" type="password" value="${esc(s.key)}" placeholder="sk-…">
          <div class="tip">Хранится только в этом браузере и уходит напрямую к провайдеру через локальный proxy.</div>
        </div>
        <div class="row2">
          <div class="field"><label>Модель</label>
            <input id="setModel" value="${esc(s.model)}" placeholder="gpt-4o-mini / deepseek-chat / …"></div>
          <div class="field" style="max-width:110px"><label>Temp</label>
            <input id="setTemp" type="number" step="0.1" min="0" max="2" value="${s.temperature}"></div>
        </div>
        <div class="row2">
          <div class="field"><label>Max tokens</label>
            <input id="setMaxTok" type="number" min="64" max="32000" value="${s.maxTokens}"></div>
          <div class="field"><label>Режим запросов</label>
            <select id="setDirect">
              <option value="proxy" ${s.direct ? "" : "selected"}>Локальный proxy (рекомендуется)</option>
              <option value="direct" ${s.direct ? "selected" : ""}>Напрямую из браузера</option>
            </select></div>
        </div>
        <div class="settings-actions">
          <button class="btn-out" id="btnTest">Проверить</button>
          <button class="btn-primary" id="setSave">Сохранить</button>
        </div>
        <div id="apiTestOut"></div>`
      }));

      this.$modal.querySelector("#setSave").onclick = () => {
        s.base = this.$modal.querySelector("#setBase").value.trim();
        s.key = this.$modal.querySelector("#setKey").value.trim();
        s.model = this.$modal.querySelector("#setModel").value.trim();
        s.temperature = clamp(parseFloat(this.$modal.querySelector("#setTemp").value) || 1, 0, 2);
        s.maxTokens = clamp(parseInt(this.$modal.querySelector("#setMaxTok").value) || 1500, 64, 32000);
        s.direct = this.$modal.querySelector("#setDirect").value === "direct";
        State.save();
        this.closeModal();
      };
      this.$modal.querySelector("#btnTest").onclick = async () => {
        const out = this.$modal.querySelector("#apiTestOut");
        // save first so test uses current fields
        this.$modal.querySelector("#setSave").click();
        this.openSettings(); // reopen to keep UI (setSave closed it)
        const o2 = this.$modal.querySelector("#apiTestOut");
        o2.textContent = "Проверяю…";
        o2.className = "";
        try {
          const n = await Api.testConnection();
          o2.textContent = `✓ OK — найдено моделей: ${n}`;
          o2.className = "ok";
        } catch (e) {
          o2.textContent = "✗ " + (e.message || e);
          o2.className = "bad";
        }
      };
    },

    /* ───────────── CHARACTER ───────────── */
    openCharacter() {
      const g = State.game;
      this.openModal(this.modalShell({
        ico: "👑", title: g.title,
        body: `
        <div class="kv"><div class="k">${esc(g.character.name)}</div>
          <div class="v char-desc">${esc(g.character.longDesc || g.character.desc)}</div></div>
        <div class="kv"><div class="k">Теги</div>
          <div class="tags">${g.tags.map(t => `<span class="tag">${esc(t)}</span>`).join("")}
            <span class="tag add" onclick="UI.addTag()">+ Предложить тег</span></div></div>
        <div class="kv"><div class="k">Правила</div>
          <div class="v char-desc">${esc(g.rulebook).slice(0, 1200)}${g.rulebook.length > 1200 ? "…" : ""}</div></div>
        <div class="modal-foot">
          <button class="btn-plain" onclick="UI.closeModal()">Закрыть</button>
          <button class="btn-primary" onclick="UI.editRulebook()">Правка rulebook</button>
        </div>`
      }));
    },

    addTag() {
      const t = prompt("Новый тег:");
      if (t && t.trim()) {
        State.game.tags.push(t.trim());
        State.scheduleSave();
        this.renderAll();
      }
    },

    editRulebook() {
      const g = State.game;
      this.openModal(this.modalShell({
        ico: "📖", title: "Rulebook",
        body: `
        <div class="field" style="margin-top:6px">
          <textarea id="rbEdit" rows="16" style="line-height:1.5">${esc(g.rulebook)}</textarea>
          <div class="tip">Это основной system-prompt для бота (правила, контракт &laquo;&lt;&lt;STATS&gt;&gt;&raquo;).</div>
        </div>
        <div class="modal-foot">
          <button class="btn-plain" onclick="UI.closeModal()">Отмена</button>
          <button class="btn-primary" id="rbSave">Сохранить</button>
        </div>`
      }));
      this.$modal.querySelector("#rbSave").onclick = () => {
        g.rulebook = this.$modal.querySelector("#rbEdit").value;
        State.scheduleSave();
        this.closeModal(); this.renderAll();
      };
    },

    toggleRulebook(head) {
      const rb = head.parentElement.querySelector("[data-rb]");
      rb.style.display = rb.style.display === "none" ? "block" : "none";
    },

    /* ───────────── toggles ───────────── */
    setToggle(key, val) {
      State.play.toggles[key] = val;
      State.scheduleSave();
      this.renderAll();
      Chat.render();
    },

    /* ───────────── save / load ───────────── */
    openExport() {
      const blob = new Blob([State.exportJSON()], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "kings-order-save-" + new Date().toISOString().slice(0, 10) + ".json";
      a.click();
      URL.revokeObjectURL(a.href);
    },

    doImport(file) {
      if (!file) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          State.importJSON(r.result);
          UI.renderAll();
          Chat.render();
          alert("Сохранение загружено ✓");
        } catch (e) {
          alert("Ошибка импорта: " + e.message);
        }
      };
      r.readAsText(file);
    },

    resetAll() {
      if (!confirm("Начать новую игру? Текущий прогресс будет стёрт.")) return;
      State.resetAll();
      UI.renderAll();
      Chat.render();
    },

    /* ───────────── mobile side panel ───────────── */
    openSide() {
      this.$side.classList.add("open");
      this.$scrim.classList.remove("hidden");
      this.$scrim.classList.add("for-side");
    },
    closeSide() {
      this.$side.classList.remove("open");
      this.$scrim.classList.add("hidden");
      this.$scrim.classList.remove("for-side");
    }
  };

  /* small helpers used in templates */
  function pendingLabel(pend, cur) { return pend != null ? pend : cur; }
  function dayHere(d, day, i, len) {
    if (d.match === 2) return day >= 2;
    const next = i + 1 < len ? State.game.days[i + 1].match : null;
    return day >= d.match && (next == null || day < next);
  }

  window.UI = UI;
})();
