/* ═══════════ app bootstrap ═══════════ */
(function () {
  function boot() {
    State.init();
    UI.init();
    Chat.init();

    // autosave every 10s if dirty
    setInterval(() => { if (State.dirty) State.save(); }, 10000);

    // warn before losing unsaved data
    window.addEventListener("pagehide", () => State.save());

    console.log("%cThe King's Order%c local RP ready",
      "background:#e8912d;color:#000;padding:2px 8px;border-radius:4px;font-weight:bold",
      "color:#8b8b95");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
