/* ═══════════ engine: trust · time · wardrobe · location ═══════════ */
(function () {
  const E = {

    /* ───────────────────────── TRUST ───────────────────────── */
    levelOf(trust) {
      const t = State.game.trust;
      const v = clamp(trust, 0, t.max);
      return t.levels.find(l => v >= l.min && v <= l.max) || t.levels[t.levels.length - 1];
    },

    levelName(trust) { return this.levelOf(trust).name; },

    /* Smart accrual: gains soften as trust grows, losses bite harder. */
    smartDelta(raw) {
      raw = Math.round(Number(raw) || 0);
      if (raw === 0) return 0;
      const t = State.game.trust;
      const p = State.play;
      if (!t.smart) return raw;
      const ratio = clamp(p.trust / Math.max(1, t.max), 0, 1);
      let d = raw > 0
        ? raw * (1 - 0.55 * ratio)          // 1.0 → 0.45
        : raw * (1 + 0.35 * ratio);         // 1.0 → 1.35
      d = Math.round(d);
      if (d === 0) d = raw > 0 ? 1 : -1;    // a real change always leaves a mark
      return d;
    },

    applyTrust(rawDelta) {
      const t = State.game.trust;
      const before = State.play.trust;
      const d = this.smartDelta(rawDelta);
      const after = clamp(before + d, 0, t.max);
      State.play.trust = after;
      return { before, after, delta: after - before, level: this.levelName(after) };
    },

    trustPct() {
      const t = State.game.trust;
      return clamp(State.play.trust / Math.max(1, t.max), 0, 1) * 100;
    },

    /* ───────────────────────── TIME ───────────────────────── */
    periodIndex(minutes) {
      const periods = State.game.time.periods;
      const h = Math.floor((((minutes % 1440) + 1440) % 1440) / 60);
      const first = periods[0].hour;
      if (h < first) return periods.length - 1;       // 00:00–05:59 → Late Night
      let idx = 0;
      for (let i = 0; i < periods.length; i++) if (h >= periods[i].hour) idx = i;
      return idx;
    },

    periodLabel(minutes) {
      return State.game.time.periods[this.periodIndex(minutes)].label;
    },

    fmtClock(minutes) {
      const m = ((minutes % 1440) + 1440) % 1440;
      const h = Math.floor(m / 60), mm = m % 60;
      return String(h).padStart(2, "0") + ":" + String(mm).padStart(2, "0");
    },

    /* advance the in-story clock; returns {before, after, dayRolled} */
    advanceTime(mins) {
      const p = State.play;
      const before = p.minutes;
      let total = p.minutes + mins;
      let dayRolled = false;
      while (total >= 1440) { total -= 1440; p.day += 1; dayRolled = true; }
      while (total < 0) { total += 1440; p.day -= 1; dayRolled = true; }
      p.minutes = total;
      return { before, after: p.minutes, dayRolled };
    },

    dayTitle(day) {
      const days = State.game.days;
      let found = days[0];
      for (const d of days) if (day >= d.match) found = d;
      return found ? found.title : "";
    },

    /* ─────────────────── PENDING («вступит в силу…») ─────────────────── */
    pendingCount() {
      const q = State.play.pending;
      return ["location", "npcClothes", "playerClothes", "day", "minutes"]
        .filter(k => q[k] != null).length;
    },

    queuePending(field, value) {
      State.play.pending[field] = value;
      State.scheduleSave();
    },

    /* Apply all queued edits — called when the player sends a message. */
    flushPending() {
      const p = State.play, q = p.pending;
      const applied = {};
      if (q.location != null && State.game.locations.includes(q.location)) {
        p.location = q.location; applied.location = q.location;
      }
      if (q.npcClothes != null && State.game.wardrobe.npc.includes(q.npcClothes)) {
        p.npcClothes = q.npcClothes; applied.npcClothes = q.npcClothes;
      }
      if (q.playerClothes != null && State.game.wardrobe.player.includes(q.playerClothes)) {
        p.playerClothes = q.playerClothes; applied.playerClothes = q.playerClothes;
      }
      if (q.minutes != null) { p.minutes = q.minutes; applied.minutes = q.minutes; }
      if (q.day != null && q.day >= 1) { p.day = q.day; applied.day = q.day; }
      p.pending = { location: null, npcClothes: null, playerClothes: null, day: null, minutes: null };
      return applied;
    },

    /* ─────────────────── WARDROBE / LOCATION ─────────────────── */
    findWardrobe(kind, label) {
      if (!label) return null;
      const list = State.game.wardrobe[kind] || [];
      const norm = s => s.toLowerCase().replace(/[’']/g, "'").trim();
      const n = norm(label);
      let hit = list.find(x => norm(x) === n);
      if (!hit) hit = list.find(x => norm(x).includes(n) || n.includes(norm(x)));
      return hit || null;
    },

    findLocation(label) {
      if (!label) return null;
      const list = State.game.locations;
      const norm = s => s.toLowerCase().replace(/[’']/g, "'").trim();
      const n = norm(label);
      return list.find(x => norm(x) === n)
          || list.find(x => norm(x).includes(n) || n.includes(norm(x)))
          || null;
    },

    /* ─────────── apply structured <<STATS>> from the model ─────────── */
    applyModelStats(stats) {
      const out = { trust: null, npcClothes: null, playerClothes: null, location: null, timeAdd: 0, note: "" };
      if (!stats || !State.play.toggles.interactive) return out;

      if (stats.trust_delta != null && isFinite(Number(stats.trust_delta))) {
        const raw = clamp(Number(stats.trust_delta), -10, 10);
        out.trust = this.applyTrust(raw);
      }
      if (stats.npc_clothes) {
        const w = this.findWardrobe("npc", stats.npc_clothes);
        if (w && w !== State.play.npcClothes) { out.npcClothes = w; State.play.npcClothes = w; }
      }
      if (stats.player_clothes) {
        const w = this.findWardrobe("player", stats.player_clothes);
        if (w && w !== State.play.playerClothes) { out.playerClothes = w; State.play.playerClothes = w; }
      }
      if (stats.location) {
        const loc = this.findLocation(stats.location);
        if (loc && loc !== State.play.location) { out.location = loc; State.play.location = loc; }
      }
      if (stats.time_add != null && isFinite(Number(stats.time_add))) {
        const m = clamp(Math.round(Number(stats.time_add)), 0, 120);
        if (m > 0) { this.advanceTime(m); out.timeAdd = m; }
      }
      if (stats.note) out.note = String(stats.note).slice(0, 140);
      return out;
    },

    /* human-readable status lines for the chat */
    buildStatus(applied, timeInfo) {
      const lines = [];
      if (applied.trust && applied.trust.delta !== 0) {
        const t = applied.trust;
        const arrow = t.delta > 0 ? "↑" : "↓";
        const cls = t.delta > 0 ? "up" : "down";
        const sign = t.delta > 0 ? "+" : "";
        lines.push(`<span class="${cls}">${arrow} Trust: ${t.before} → ${t.after} (${sign}${t.delta}) · ${esc(t.level)}</span>`);
      }
      if (applied.npcClothes) lines.push(`👗 Viora: ${esc(applied.npcClothes)}`);
      if (applied.playerClothes) lines.push(`👕 You: ${esc(applied.playerClothes)}`);
      if (applied.location) lines.push(`📍 Location → ${esc(applied.location)}`);
      if (timeInfo) {
        const d = timeInfo.dayRolled ? ` · День ${State.play.day}` : "";
        const add = applied.timeAdd ? ` (+${applied.timeAdd})` : "";
        const step = timeInfo.delta ? ` (${timeInfo.delta > 0 ? "+" : ""}${timeInfo.delta})` : "";
        lines.push(`<span class="time">⏱ Day ${State.play.day} · ${this.fmtClock(State.play.minutes)}${add || step}${d}</span>`);
      }
      if (applied.note) lines.push(`<span class="note">${esc(applied.note)}</span>`);
      return lines;
    },

    /* compact scene block for the system prompt */
    sceneStatus() {
      const p = State.play;
      return [
        `День ${p.day} · ${this.fmtClock(p.minutes)} (${this.periodLabel(p.minutes)})`,
        `Локация: ${p.location}`,
        `Виора носит: ${p.npcClothes}`,
        `На тебе: ${p.playerClothes}`
      ].join("\n");
    }
  };

  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  window.Engine = E;
  window.esc = esc;
  window.clamp = clamp;
})();
