/* ═══════════ state: load / save / snapshots ═══════════ */
(function () {
  const KEY = "kings-order-save-v1";

  const State = {
    game: null,      // content config (rulebook, levels, wardrobe, …)
    settings: null,  // API settings
    play: null,      // mutable play state (trust, time, clothes, messages, …)
    dirty: false,

    init() {
      let saved = null;
      try { saved = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { saved = null; }
      this.game = deepMerge(clone(window.DEFAULT_GAME), saved && saved.game);
      this.settings = deepMerge(clone(window.DEFAULT_SETTINGS), saved && saved.settings);
      this.play = deepMerge(clone(window.DEFAULT_PLAY), saved && saved.play);
      this._migrateContent();
      // never trust saved message blobs from older versions
      if (!Array.isArray(this.play.messages)) this.play.messages = [];
      if (!this.play.pending) this.play.pending = { location: null, npcClothes: null, playerClothes: null, day: null, minutes: null };
      if (!this.play.toggles) this.play.toggles = { interactive: true, hideStats: false, statusLine: true };
      return this;
    },

    save() {
      this.dirty = false;
      try {
        localStorage.setItem(KEY, JSON.stringify({
          v: 1,
          game: this.game,
          settings: this.settings,
          play: this.play
        }));
        return true;
      } catch (e) {
        console.warn("save failed", e);
        return false;
      }
    },

    scheduleSave() {
      this.dirty = true;
      clearTimeout(this._t);
      this._t = setTimeout(() => this.save(), 400);
    },

    exportJSON() {
      return JSON.stringify({
        v: 1, app: "the-kings-order",
        game: this.game, settings: this.settings, play: this.play
      }, null, 2);
    },

    importJSON(text) {
      const data = JSON.parse(text);
      if (!data || typeof data !== "object") throw new Error("bad file");
      this.game = deepMerge(clone(window.DEFAULT_GAME), data.game || {});
      this.settings = deepMerge(clone(window.DEFAULT_SETTINGS), data.settings || {});
      this.play = deepMerge(clone(window.DEFAULT_PLAY), data.play || {});
      if (!Array.isArray(this.play.messages)) this.play.messages = [];
      this._migrateContent();
      this.save();
    },

    resetAll() {
      try { localStorage.removeItem(KEY); } catch (e) {}
      this.game = clone(window.DEFAULT_GAME);
      this.settings = clone(window.DEFAULT_SETTINGS);
      this.play = clone(window.DEFAULT_PLAY);
      this.save();
    },

    /* old builds shipped an English rulebook/longDesc — refresh unedited copies */
    _migrateContent() {
      const g = this.game;
      if (g && typeof g.rulebook === "string" &&
          g.rulebook.startsWith("THE KING'S ORDER — condensed rulebook")) {
        g.rulebook = window.DEFAULT_GAME.rulebook;
      }
      if (g && g.character && typeof g.character.longDesc === "string" &&
          g.character.longDesc.startsWith("Viora — elf princess")) {
        g.character.longDesc = window.DEFAULT_GAME.character.longDesc;
      }
    },

    avatarSrc() {
      return this.settings.avatar || "assets/viora-avatar.jpg";
    },

    /* ── snapshots (rollback point for regenerate / answer switching) ── */
    snapshot() {
      const p = this.play;
      return clone({
        trust: p.trust, day: p.day, minutes: p.minutes,
        location: p.location, npcClothes: p.npcClothes, playerClothes: p.playerClothes,
        pending: p.pending
      });
    },

    restore(snap) {
      if (!snap) return;
      const p = this.play;
      p.trust = snap.trust;
      p.day = snap.day;
      p.minutes = snap.minutes;
      p.location = snap.location;
      p.npcClothes = snap.npcClothes;
      p.playerClothes = snap.playerClothes;
      p.pending = clone(snap.pending || { location: null, npcClothes: null, playerClothes: null, day: null, minutes: null });
    }
  };

  /* helpers */
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function deepMerge(base, over) {
    if (!over) return base;
    for (const k of Object.keys(over)) {
      const v = over[k];
      if (v && typeof v === "object" && !Array.isArray(v) &&
          base[k] && typeof base[k] === "object" && !Array.isArray(base[k])) {
        base[k] = deepMerge(base[k], v);
      } else {
        base[k] = clone(v);
      }
    }
    return base;
  }

  window.State = State;
  window.clone = clone;
})();
