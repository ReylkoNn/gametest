/* ═══════════ app bootstrap ═══════════ */
(function () {
  async function boot() {
    State.init();
    // greeting source: first-message.txt in the repo (user's own neural-net
    // first message). Best-effort: falls back to DEFAULT_GAME.greeting.
    await Chat.loadGreetingFile();
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

  // expose the boot promise so tests can await full initialization
  let bootPromise;
  if (document.readyState === "loading") {
    bootPromise = new Promise(res =>
      document.addEventListener("DOMContentLoaded", () => res(boot()), { once: true }));
  } else {
    bootPromise = boot();
  }
  window.__bootPromise = bootPromise;
})();
