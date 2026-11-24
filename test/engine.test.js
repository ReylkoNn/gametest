/* Headless smoke test: engine + state + stats parsing (no DOM needed) */
global.window = global;
global.localStorage = {
  _s: {},
  getItem(k) { return this._s[k] ?? null; },
  setItem(k, v) { this._s[k] = v; },
  removeItem(k) { delete this._s[k]; }
};
const fs = require("fs");
const vm = require("vm");
for (const f of ["js/data.js", "js/state.js", "js/engine.js", "js/api.js"]) {
  vm.runInThisContext(fs.readFileSync(f, "utf8"), { filename: f });
}

let passed = 0, failed = 0;
function T(name, cond) {
  if (cond) { passed++; console.log("  ✓ " + name); }
  else { failed++; console.log("  ✗ FAIL: " + name); }
}

State.init();

console.log("— trust levels —");
T("19 → Competitive Rivalry", Engine.levelName(19) === "Competitive Rivalry");
T("0 → Hostile Rival", Engine.levelName(0) === "Hostile Rival");
T("54 → In Deep Love", Engine.levelName(54) === "In Deep Love");
T("max clamp", clamp(99, 0, 54) === 54);

console.log("— smart accrual —");
State.play.trust = 0;
let r = Engine.applyTrust(3);
T("low trust: +3 stays strong (got " + r.delta + ")", r.delta === 3);
State.play.trust = 52;
r = Engine.applyTrust(3);
T("high trust: gain softened (got " + r.delta + ")", r.delta > 0 && r.delta < 3);
State.play.trust = 52;
r = Engine.applyTrust(-1);
T("high trust: loss amplified (got " + r.delta + ")", r.delta <= -1);
State.play.trust = 54;
r = Engine.applyTrust(-2);
T("clamped at 54→" + r.after, r.after <= 54);
State.play.trust = 0;
r = Engine.applyTrust(-5);
T("clamped at 0→" + r.after, r.after >= 0);

console.log("— time —");
State.play.minutes = 23 * 60 + 35;
T("23:35 fmt", Engine.fmtClock(23 * 60 + 35) === "23:35");
T("23:35 → Late Night", Engine.periodLabel(23 * 60 + 35) === "Late Night");
T("03:00 → Late Night (spills midnight)", Engine.periodLabel(180) === "Late Night");
T("06:00 → Early Morning", Engine.periodLabel(360) === "Early Morning");
T("13:30 → Afternoon (Lecture)", Engine.periodLabel(13 * 60 + 30) === "Afternoon (Lecture)");
let adv = Engine.advanceTime(30); // 23:35 + 30 → 00:05 next day
T("midnight rolls day", State.play.day === 2 && State.play.minutes === 5);
State.play.day = 1; State.play.minutes = 23 * 60 + 35;

console.log("— pending flow —");
Engine.queuePending("location", "Town Square");
Engine.queuePending("npcClothes", "Nightshirt (Bra Off)");
T("pending count 2", Engine.pendingCount() === 2);
let applied = Engine.flushPending();
T("applied location", State.play.location === "Town Square");
T("applied clothes", State.play.npcClothes === "Nightshirt (Bra Off)");
T("pending cleared", Engine.pendingCount() === 0);
T("flush rejects bogus location", (() => {
  State.play.pending.location = "Narnia";
  const a = Engine.flushPending();
  return State.play.location === "Town Square" && a.location === undefined;
})());

console.log("— wardrobe fuzzy match —");
T("find 'completely nude' (case)", Engine.findWardrobe("npc", "completely nude") === "Completely Nude");
T("find 'academy uniform pants off' partial", Engine.findWardrobe("player", "Academy Uniform (Pants Off)") === "Academy Uniform (Pants Off)");
T("unknown → null", Engine.findWardrobe("npc", "Space Suit") === null);

console.log("— STATS parse + apply —");
const raw = 'She huffs, looking away.\n\n<<STATS {"trust_delta":2,"npc_clothes":"Nightshirt (Bra Off)","location":"Viora\'s Bathroom","time_add":0,"note":"praised her cooking"}>>';
T("parse ok", !!Api.parseStats(raw));
T("strip removes line", !Api.stripStats(raw).includes("<<STATS"));
const st = Api.parseStats(raw);
State.play.trust = 19;
State.play.npcClothes = "Completely Nude";
const out = Engine.applyModelStats(st);
T("trust changed", out.trust && out.trust.after > out.trust.before);
T("clothes changed by model", State.play.npcClothes === "Nightshirt (Bra Off)");
T("location changed by model", State.play.location === "Viora's Bathroom");
T("note captured", out.note === "praised her cooking");
T("bad JSON → null", Api.parseStats('<<STATS {oops}>>') === null);
T("stats off when interactive=false", (() => {
  State.play.toggles.interactive = false;
  const o = Engine.applyModelStats({ trust_delta: 5 });
  State.play.toggles.interactive = true;
  return o.trust === null;
})());

console.log("— sanitize (template/stat garbage) —");
const leaky =
  'Шрамы и рыцарское&lt;decimalradan"&gt;\\[Харизма: 0.7\\] ' +
  'Шар Инициативы: \\[(План открытый) + (План открытый, либо невозможен)\\]' +
  '&lt;/CHARACTER_DESCRIPTION&gt; конец';
const clean = Api.sanitize(leaky);
T("no escaped tags", !clean.includes("&lt;") && !clean.includes("CHARACTER_DESCRIPTION"));
T("no decimalradan", !clean.includes("decimalradan"));
T("no stat block", !clean.includes("Харизма"));
T("no initiative sphere", !clean.includes("Шар Инициативы"));
T("keeps prose", clean.includes("Шрамы и рыцарское") && clean.includes("конец"));
T("stats tail cut", !Api.sanitize("текст <<STATS {\"trust_delta\":1}>>").includes("STATS"));
T("{{char}} replaced", Api.sanitize("Hi {{char}}, {{user}}!").includes("Viora"));
T("plain text untouched", Api.sanitize("Обычный текст *и* разметка.") === "Обычный текст *и* разметка.");

console.log("— temperature —");
State.settings.temperature = 0;
T("temp 0 preserved in payload", Api._payload([], false).temperature === 0);
State.settings.temperature = 1.4;
T("temp 1.4 in payload", Api._payload([], false).temperature === 1.4);
State.settings.temperature = "junk";
T("temp junk → 1.0", Api._payload([], false).temperature === 1.0);
State.settings.temperature = 1.0;

console.log("— prompt assembly —");
State.play.messages = [
  { id: 1, role: "user", content: "hello" },
  { id: 2, role: "assistant", content: "hi there\n\n<<STATS {\"trust_delta\":1}>>" }
];
const msgs = Api.buildMessages(State.play.messages);
T("system first", msgs[0].role === "system");
T("3 messages (sys+user+assistant)", msgs.length === 3);
T("assistant stats stripped", !msgs[2].content.includes("<<STATS"));
T("system has trust", msgs[0].content.includes("Текущее Доверие") || msgs[0].content.includes("Competitive Rivalry"));
T("system has scene", msgs[0].content.includes("Виора носит"));

// leading assistant greeting must fold into system, not float before first user
const msgs2 = Api.buildMessages([
  { id: 1, role: "assistant", variants: [{ text: "Приветствую, игрок." }], v: 0 },
  { id: 2, role: "user", content: "hi" }
]);
T("greeting folded into system", msgs2[0].content.includes("Приветствую, игрок.") && msgs2[0].content.includes("# ТВОЯ ПЕРВАЯ РЕПЛИКА"));
T("first history msg is user", msgs2[1].role === "user" && msgs2.length === 2);
T("output forced Russian only", msgs[0].content.includes("ТОЛЬКО РУССКИЙ ЯЗЫК") && msgs[0].content.includes("своими именами") && !msgs[0].content.includes("Match the player's language"));

// user's own first-message.txt greeting must reach the model unfiltered
const msgs3 = Api.buildMessages([
  { id: 1, role: "assistant", greeting: true, variants: [{ text: "Привет, {{char}} [Харизма: 0.7] из файла." }], v: 0 },
  { id: 2, role: "user", content: "hi" }
]);
T("greeting passes to model unsanitized", msgs3[0].content.includes("{{char}} [Харизма: 0.7] из файла."));
// regular model output is still sanitized
T("non-greeting history still sanitized", !Api.buildMessages([
  { id: 1, role: "user", content: "hi" },
  { id: 2, role: "assistant", content: "Ответ {{char}} [Харизма: 0.7]" }
])[2].content.includes("[Харизма: 0.7]"));

console.log("— save/export roundtrip —");
const savedTrust = State.play.trust;
State.save();
State.play.trust = 33;
State.init(); // reload from storage
T("persisted trust", State.play.trust === savedTrust);
const json = State.exportJSON();
State.play.trust = 1;
State.importJSON(json);
T("import restores", State.play.trust === savedTrust);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
