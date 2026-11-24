/* DOM smoke test with jsdom: boot UI, modals, send flow with mocked fetch */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const dom = new JSDOM(html, {
  url: "http://localhost:8000/",
  runScripts: "outside-only",
  pretendToBeVisual: true
});
const { window } = dom;

// storage polyfill (jsdom has localStorage, but ensure clean)
window.localStorage.clear();
window.fetch = async (url, opts) => {
  if (String(url).includes("/api/chat")) {
    const body = JSON.parse(opts.body);
    const reply =
      "Viora crosses her arms. «Hmph, you're late, stud.»\n\n" +
      '<<STATS {"trust_delta":2,"note":"finally arrived on time"}>>';
    const stream = body.stream;
    if (!stream) {
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: reply } }] })
      };
    }
    // fake SSE ReadableStream
    const chunks = reply.match(/.{1,12}/gs).map(c =>
      `data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}\n\n`);
    chunks.push("data: [DONE]\n\n");
    let i = 0;
    const encoder = new TextEncoder();
    const streamObj = new ReadableStream({
      pull(controller) {
        if (i < chunks.length) controller.enqueue(encoder.encode(chunks[i++]));
        else controller.close();
      }
    });
    return { ok: true, body: streamObj };
  }
  if (String(url).includes("/api/models")) {
    return { ok: true, json: async () => ({ data: [{ id: "m1" }] }) };
  }
  return { ok: false, status: 404, json: async () => ({ error: "nope" }) };
};

// load app scripts in order
for (const f of ["data.js", "state.js", "engine.js", "api.js", "chat.js", "ui.js", "app.js"]) {
  const code = fs.readFileSync(path.join(__dirname, "..", "js", f), "utf8");
  window.eval(code);
}

let passed = 0, failed = 0;
const T = (name, cond) => {
  if (cond) { passed++; console.log("  ✓ " + name); }
  else { failed++; console.log("  ✗ FAIL: " + name); }
};
const $ = s => window.document.querySelector(s);
const $$ = s => [...window.document.querySelectorAll(s)];

(async () => {
  await window.__bootPromise;
  console.log("— boot —");
  T("cards rendered", $$("#cards .card").length >= 8);
  T("topbar shows level", $("#topbarText").textContent.includes("Competitive Rivalry"));
  T("topbar avatar", $("#topAva").getAttribute("src").includes("viora-avatar"));
  T("welcome shown", !!$(".welcome"));
  T("temp slider present", !!$("#tempRange") && !!$("#tempVal"));
  T("greeting injected", window.State.play.messages.length === 1 && window.State.play.messages[0].greeting === true);
  T("greeting has avatar", !!$(".msg.bot .ava"));
  T("greeting rendered as markdown", $(".msg.bot .bubble").innerHTML.includes("<em>"));
  T("trust bar width ≈35%", Math.abs(parseFloat($(".bar i").style.width) - (19 / 54) * 100) < 0.5);
  T("Вы здесь on Late Night", $$(".row.here").some(r => r.textContent.includes("Late Night")));
  T("Вы здесь on Day 1", $$(".row.here").some(r => r.textContent.includes("First Day")));
  T("Вы здесь trust level", $$("#cards .row.here").some(r => r.textContent.includes("Competitive Rivalry")));
  T("tags rendered", $$(".tag").length >= 12);

  console.log("— first-message.txt greeting —");
  const realFetch = window.fetch;
  window.fetch = async (url, opts) => {
    if (String(url).includes("first-message.txt")) {
      return {
        ok: true,
        text: async () => "Приветствие из файла: {{char}} [Харизма: 0.7]\r\nВторая строка."
      };
    }
    return realFetch(url, opts);
  };
  const fileLoaded = await window.Chat.loadGreetingFile();
  T("file greeting loaded", fileLoaded === true);
  T("State.game.greeting from file", window.State.game.greeting === "Приветствие из файла: {{char}} [Харизма: 0.7]\nВторая строка.");
  T("lone greeting refreshed from file", window.State.play.messages.length === 1 &&
    window.State.play.messages[0].variants[0].text.includes("Приветствие из файла"));
  T("greeting shown raw (no filters)", $(".msg.bot .bubble").textContent.includes("{{char}} [Харизма: 0.7]"));
  window.fetch = realFetch;

  console.log("— location modal —");
  window.UI.openLocation();
  T("modal open", !$("#modalRoot").classList.contains("hidden"));
  T("15 location chips", $$("#locChips .chip").length === 15);
  T("current highlighted", $$("#locChips .chip.sel-green").length === 1);
  $$("#locChips .chip").find(c => c.dataset.l === "Town Square").click();
  $("#locApply").click();
  T("pending queued", window.State.play.pending.location === "Town Square");
  T("card shows ⏳", $("#cards").innerHTML.includes("⏳"));
  T("modal closed", $("#modalRoot").classList.contains("hidden"));

  console.log("— clothes modal —");
  window.UI.openClothes("npc");
  T("14 wardrobe chips", $$("#clChips .chip").length === 14);
  $$("#clChips .chip").find(c => c.dataset.l === "Nightshirt (Bra Off)").click();
  $("#clApply").click();
  T("clothes pending", window.State.play.pending.npcClothes === "Nightshirt (Bra Off)");

  console.log("— day/time modal —");
  window.UI.openDateTime();
  T("10 period chips", $$("#perChips .chip[data-i]").length === 10);
  $("#dayPlus").click();
  T("day draft +1", $(".dt-day .num").textContent === "2");
  $$("#perChips .chip[data-i]").find(c => c.textContent === "Evening").click();
  T("evening picked", $(".dt-current .t").textContent.startsWith("18:"));
  $("#dtApply").click();
  T("day pending", window.State.play.pending.day === 2);
  T("minutes pending 18:35", window.State.play.pending.minutes === 18 * 60 + 35);

  console.log("— trust modal —");
  window.UI.openTrust();
  $(".quick button[data-d='5']").click();
  $("#tApply").click();
  T("trust manual 24", window.State.play.trust === 24);
  T("level updated", $("#topbarText").textContent.includes("Neutral Acquaintance"));

  console.log("— toggles —");
  window.UI.setToggle("hideStats", true);
  T("topbar hidden", $("#topbar").classList.contains("hidden"));
  T("show button visible", !$("#topbarShow").classList.contains("hidden"));
  window.UI.setToggle("hideStats", false);
  T("topbar back", !$("#topbar").classList.contains("hidden"));
  window.UI.setToggle("interactive", false);
  window.UI.setToggle("interactive", true);

  console.log("— send flow —");
  const input = $("#input");
  input.value = "Привет, Виора! Я всё-таки пришёл.";
  $("#btnSend").click();
  // wait for the fake stream to finish
  for (let i = 0; i < 100 && window.Chat.busy; i++) await new Promise(r => setTimeout(r, 20));
  await new Promise(r => setTimeout(r, 50));

  const msgs = window.State.play.messages;
  T("3 messages (greeting+user+bot)", msgs.length === 3);
  T("pending flushed", window.State.play.pending.location === null && window.State.play.pending.npcClothes === null);
  T("location applied", window.State.play.location === "Town Square");
  T("clothes applied", window.State.play.npcClothes === "Nightshirt (Bra Off)");
  T("day applied", window.State.play.day === 2);
  T("time advanced +5 → 18:40", window.State.play.minutes === 18 * 60 + 40);
  T("trust +2 → 26", window.State.play.trust === 26);
  T("level Competitive Companionship", window.Engine.levelName(window.State.play.trust) === "Competitive Companionship");
  const lastBotBubble = () => [...$$(".msg.bot .bubble")].pop();
  T("bubble has no STATS", !lastBotBubble().textContent.includes("<<STATS"));
  T("status line shown", !!$(".msg.bot .status"));
  T("status has trust line", [...$$(".msg.bot .status")].pop().textContent.includes("Trust: 24 → 26"));
  T("status has time line", [...$$(".msg.bot .status")].pop().textContent.includes("⏱"));

  console.log("— regenerate rolls back —");
  const snapTrust = 24; // trust before the reply
  const botMsg = window.State.play.messages[2];
  T("snapshot stored before reply", botMsg.before.trust === snapTrust);
  // point fetch at a different reply (model-driven clothes + location move)
  window.fetch = async (url, opts) => {
    const reply =
      "«Don't push your luck.» She retreats to the bath.\n\n" +
      '<<STATS {"trust_delta":-1,"npc_clothes":"Nightshirt (Panties Off)","location":"Viora\'s Bathroom","note":"she huffs"}>>';
    return {
      ok: true,
      body: (() => {
        let i = 0;
        const chunks = [`data: ${JSON.stringify({ choices: [{ delta: { content: reply } }] })}\n\n`, "data: [DONE]\n\n"];
        const enc = new TextEncoder();
        return new ReadableStream({ pull(c) { i < chunks.length ? c.enqueue(enc.encode(chunks[i++])) : c.close(); } });
      })()
    };
  };
  $$(".msg.bot .actions button").find(b => b.textContent.includes("Перегенерировать")).click();
  for (let i = 0; i < 100 && window.Chat.busy; i++) await new Promise(r => setTimeout(r, 20));
  await new Promise(r => setTimeout(r, 50));
  T("still 3 messages", window.State.play.messages.length === 3);
  T("trust restored then -1 → 23", window.State.play.trust === 23);
  T("model moved clothes after rollback", window.State.play.npcClothes === "Nightshirt (Panties Off)");
  T("model moved location after rollback", window.State.play.location === "Viora's Bathroom");
  T("new text rendered", lastBotBubble().textContent.includes("Don't push your luck"));
  T("status updated", [...$$(".msg.bot .status")].pop().textContent.includes("24 → 23"));
  T("status shows clothes move", [...$$(".msg.bot .status")].pop().textContent.includes("Nightshirt (Panties Off)"));

  console.log("— variant switch —");
  // add a second variant manually to test switch
  const m = window.State.play.messages[2];
  m.variants.push({
    text: "«Fine.» <<STATS {\"trust_delta\":1}>>",
    stats: { trust_delta: 1 },
    status: null
  });
  window.Chat.switchVariant(m);
  T("variant switched", m.v === 1);
  T("variant 2 applied (restore 24 +1 → 25)", window.State.play.trust === 25);
  window.Chat.switchVariant(m);
  T("back to variant 1 (restore 24 -1 → 23)", window.State.play.trust === 23 && m.v === 0);

  console.log("— API error path + retry —");
  window.fetch = async () => ({ ok: false, status: 502, json: async () => ({ error: "Cannot reach API: timeout" }) });
  const input2 = $("#input");
  input2.value = "попытка без сети";
  $("#btnSend").click();
  for (let i = 0; i < 60 && window.Chat.busy; i++) await new Promise(r => setTimeout(r, 20));
  await new Promise(r => setTimeout(r, 30));
  T("error state kept in history", window.State.play.messages.length === 5);
  T("error object set", !!window.State.play.messages[4].error);
  T("error box rendered", [...$$(".msg.bot .status .down")].pop()?.textContent.includes("Cannot reach API"));
  T("retry button present", [...$$(".msg.bot button")].some(b => b.textContent.includes("Повторить")));
  // restore good fetch and retry
  window.fetch = async (url, opts) => {
    const reply = "«Better late than never,» she smirks.\n\n<<STATS {\"trust_delta\":1,\"note\":\"accepted apology\"}>>";
    return {
      ok: true,
      body: (() => {
        const enc = new TextEncoder();
        let i = 0;
        const chunks = [`data: ${JSON.stringify({ choices: [{ delta: { content: reply } }] })}\n\n`, "data: [DONE]\n\n"];
        return new ReadableStream({ pull(c) { i < chunks.length ? c.enqueue(enc.encode(chunks[i++])) : c.close(); } });
      })()
    };
  };
  [...$$(".msg.bot button")].find(b => b.textContent.includes("Повторить")).click();
  for (let i = 0; i < 60 && window.Chat.busy; i++) await new Promise(r => setTimeout(r, 20));
  await new Promise(r => setTimeout(r, 30));
  T("retry cleared error", !window.State.play.messages[4].error);
  T("retry produced text", window.State.play.messages[4].variants[0].text.includes("Better late"));
  T("retry applied stats", window.State.play.messages[4].variants[0].status.some(s => s.includes("Trust:")));

  console.log("— stop generation —");
  window.fetch = (url, opts) => new Promise((_, reject) => {
    opts.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
  });
  $("#input").value = "это сообщение прервётся";
  $("#btnSend").click();
  for (let i = 0; i < 60 && !window.Chat.busy; i++) await new Promise(r => setTimeout(r, 10));
  T("send button switches to stop", $("#btnSend").classList.contains("stop") && $("#btnSend").textContent === "⏹");
  window.Chat.stop();
  for (let i = 0; i < 60 && window.Chat.busy; i++) await new Promise(r => setTimeout(r, 20));
  await new Promise(r => setTimeout(r, 30));
  T("stop restored send button", !$("#btnSend").classList.contains("stop") && $("#btnSend").textContent === "➤");
  T("stop kept user msg + error slot", window.State.play.messages.length === 7 && !!window.State.play.messages[6].error);
  T("stop error message", window.State.play.messages[6].error.includes("Остановлено"));

  console.log("— settings modal —");
  window.UI.openSettings();
  T("settings fields", !!$("#setBase") && !!$("#setKey") && !!$("#setModel") && !!$("#setDirect"));
  $("#setBase").value = "https://api.example.com/v1";
  $("#setModel").value = "test-model";
  $("#setSave").click();
  T("settings saved", window.State.settings.base === "https://api.example.com/v1" && window.State.settings.model === "test-model");
  T("modal closed", $("#modalRoot").classList.contains("hidden"));

  console.log("— persistence —");
  T("localStorage has save", !!window.localStorage.getItem("kings-order-save-v1"));
  const exported = window.State.exportJSON();
  const expPlay = JSON.parse(exported).play;
  T("export parses", typeof expPlay.trust === "number" && expPlay.messages.length === 7);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
