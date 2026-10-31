"use strict";

// Shared by every page: data, saved state, helpers, XP and the planet score.

const FACTORS = { carKgPerKm: 0.17, flightTonsEach: 0.25, gridKgPerKwh: 0.7 };
const MAX_TONNES = 10;
const RING_SMALL = 326.73;
const RING_BIG = 552.92;

const LEVEL_XP = 150;
const TITLES = ["Spark", "Current", "Pulse", "Surge", "Nova", "Aurora", "Titan"];
const STORAGE_KEY = "nyro-v1";
const BACKUP_KEY = "nyro-v1-backup";

// One-time move from the old key names so nobody loses saved progress.
(function migrateOldKeys() {
  try {
    [["earthloop-v1", STORAGE_KEY], ["earthloop-v1-backup", BACKUP_KEY]].forEach((pair) => {
      const old = localStorage.getItem(pair[0]);
      if (old !== null && localStorage.getItem(pair[1]) === null) localStorage.setItem(pair[1], old);
      if (old !== null) localStorage.removeItem(pair[0]);
    });
  } catch (e) { /* storage blocked: nothing to move */ }
})();

const PLEDGES = [
  { id: "bus",   text: "Take bus, metro or bike for half my trips", saves: (d) => d.car * 0.5 },
  { id: "fly",   text: "Skip one flight this year",                 saves: (d) => (d.flights > 0 ? FACTORS.flightTonsEach : 0) },
  { id: "led",   text: "Switch to LEDs and 5-star appliances",      saves: (d) => d.power * 0.2 },
  { id: "meat",  text: "Eat plant-based 3 days a week",             saves: (d) => d.diet * 0.15 },
  { id: "solar", text: "Use solar or renewable power",              saves: (d) => d.power * 0.5 },
];

const ACTIVITIES = [
  { id: "bucket",  name: "Bucket bath",    sample: 20 },
  { id: "teeth",   name: "Brush teeth",    sample: 6 },
  { id: "flush",   name: "Toilet flush",   sample: 6 },
  { id: "dishes",  name: "Wash dishes",    sample: 20 },
  { id: "laundry", name: "Laundry load",   sample: 50 },
  { id: "cook",    name: "Cook and drink", sample: 5 },
  { id: "plants",  name: "Water plants",   sample: 10 },
  { id: "car",     name: "Wash vehicle",   sample: 60 },
];
const ACT_BY_ID = {};
ACTIVITIES.forEach((a) => (ACT_BY_ID[a.id] = a));

const STARTER_CARDS = [
  ["Climate", "Which gas is the main driver of human-caused global warming?", "Carbon dioxide (CO2), mostly from burning fossil fuels."],
  ["Climate", "What does 'net zero' mean?", "Balancing the greenhouse gases we emit with those we remove, so the net addition is zero."],
  ["Climate", "Name two ways to cut personal transport emissions.", "Walk or cycle, use public transport, carpool, or switch to an electric vehicle."],
  ["Climate", "What temperature limit does the Paris Agreement aim for?", "Well below 2 degrees C above pre-industrial levels, and ideally 1.5 degrees C."],
  ["Climate", "Why do forests help fight climate change?", "Growing trees absorb CO2 and store it as carbon."],
  ["Water", "About how much water does a 5-minute shower use?", "Roughly 40 to 50 litres, depending on the showerhead."],
  ["Water", "What is grey water?", "Lightly used water from sinks, showers and laundry that can be reused for plants or cleaning."],
  ["Water", "Which SDG covers clean water and sanitation?", "SDG 6."],
  ["Water", "How much water can a dripping tap waste in a day?", "Around 15 to 20 litres."],
  ["Water", "What is rainwater harvesting?", "Collecting and storing rain from roofs or other surfaces so it can be used later."],
  ["Everyday", "What is a carbon footprint?", "The total greenhouse gas emissions caused by a person, product or activity."],
  ["Everyday", "Which SDG is Climate Action?", "SDG 13."],
  ["Everyday", "Which SDG is Quality Education?", "SDG 4."],
  ["Everyday", "In 'reduce, reuse, recycle', which step comes first and why?", "Reduce, because using less creates the least waste."],
  ["Everyday", "Why are LED bulbs better than incandescent bulbs?", "They give the same light using far less electricity."],
  ["Everyday", "What is e-waste?", "Discarded electronic items such as old phones, laptops and chargers."],
];

const REDUCE_MOTION = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
const $ = (id) => document.getElementById(id);

// =====================================================================
// STATE (saved in the browser; the page still works if storage is blocked)
// =====================================================================
function freshLearn() {
  return {
    cards: STARTER_CARDS.map((c, i) => ({ id: "s" + i, deck: c[0], q: c[1], a: c[2], level: 1 })),
    deck: "All",
    reviewed: 0,
    correct: 0,
  };
}

function freshState() {
  return {
    xp: 0,
    xpByDay: {},
    carbon: { car: 50, flights: 2, power: 150, diet: 2, pledges: [], awarded: [], set: false },
    water: { goal: 135, days: {} },
    learn: freshLearn(),
    demo: false,
  };
}

function loadState() {
  const base = freshState();
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!s || typeof s !== "object") return base;
    const st = {
      xp: Number(s.xp) || 0,
      xpByDay: s.xpByDay && typeof s.xpByDay === "object" ? s.xpByDay : {},
      carbon: Object.assign({}, base.carbon, s.carbon || {}),
      water: Object.assign({}, base.water, s.water || {}),
      learn: Object.assign({}, base.learn, s.learn || {}),
      demo: !!s.demo,
    };
    if (s.carbon && s.carbon.set === undefined) st.carbon.set = true; // saved before this flag existed
    if (!Array.isArray(st.carbon.pledges)) st.carbon.pledges = [];
    if (!Array.isArray(st.carbon.awarded)) st.carbon.awarded = [];
    if (!st.water.days || typeof st.water.days !== "object") st.water.days = {};
    if (!Array.isArray(st.learn.cards) || !st.learn.cards.length) st.learn.cards = base.learn.cards;
    return st;
  } catch (e) {
    return base;
  }
}

let state = loadState();
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
}

// =====================================================================
// HELPERS
// =====================================================================
const pad = (n) => String(n).padStart(2, "0");
const keyOf = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const todayKey = () => keyOf(new Date());
function shiftKey(key, delta) {
  const p = key.split("-").map(Number);
  return keyOf(new Date(p[0], p[1] - 1, p[2] + delta));
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const sum = (list) => list.reduce((t, e) => t + e.litres, 0);

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

let toastTimer = null;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 3400);
}

function setNum(node, value, decimals) {
  const from = parseFloat(node.dataset.v || "0");
  node.dataset.v = String(value);
  if (REDUCE_MOTION || from === value) { node.textContent = value.toFixed(decimals); return; }
  const start = performance.now(), dur = 800;
  function step(now) {
    const p = Math.min((now - start) / dur, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    node.textContent = (from + (value - from) * eased).toFixed(decimals);
    if (p < 1) requestAnimationFrame(step); else node.textContent = value.toFixed(decimals);
  }
  requestAnimationFrame(step);
}

function setRing(node, circumference, pct) {
  node.dataset.c = String(circumference);
  node.dataset.pct = String(pct);
  node.style.strokeDashoffset = String(circumference * (1 - pct));
}

function replayRings(root) {
  if (REDUCE_MOTION) return;
  root.querySelectorAll(".ring-fill").forEach((r) => {
    const c = parseFloat(r.dataset.c), p = parseFloat(r.dataset.pct);
    if (isNaN(c) || isNaN(p)) return;
    r.style.transition = "none";
    r.style.strokeDashoffset = String(c);
    void r.getBoundingClientRect();
    r.style.transition = "";
    r.style.strokeDashoffset = String(c * (1 - p));
  });
}

// =====================================================================
// SAMPLE DATA (demo mode)
// Swaps in a filled-in set of numbers so a first-time visitor sees the
// whole dashboard. The visitor's own data is stashed and restored on exit.
// =====================================================================
let memBackup = null;

function sampleState() {
  const s = freshState();
  const today = todayKey();

  const xpDays = [35, 60, 45, 80, 50, 70, 55]; // oldest day first, today last
  xpDays.forEach((v, i) => { s.xpByDay[shiftKey(today, i - 6)] = v; });
  s.xp = xpDays.reduce((t, v) => t + v, 0);

  s.carbon = { car: 80, flights: 2, power: 160, diet: 1.4, pledges: ["bus", "led", "meat"], awarded: ["bus", "led", "meat"], set: true };

  const log = (ids) => ids.map((id) => ({ id: id, name: ACT_BY_ID[id].name, litres: ACT_BY_ID[id].sample }));
  const waterDays = [
    ["bucket", "teeth", "flush", "flush", "cook", "dishes", "laundry"],
    ["bucket", "teeth", "flush", "flush", "flush", "cook", "dishes", "plants"],
    ["bucket", "teeth", "flush", "flush", "cook", "dishes", "laundry", "plants"],
    ["bucket", "bucket", "teeth", "flush", "flush", "cook", "dishes", "car"],
    ["bucket", "teeth", "flush", "flush", "cook", "dishes", "plants"],
    ["bucket", "teeth", "flush", "flush", "cook", "dishes", "laundry"],
    ["bucket", "teeth", "flush", "flush", "cook", "dishes", "plants"], // today
  ];
  waterDays.forEach((ids, i) => { s.water.days[shiftKey(today, i - 6)] = log(ids); });

  const levels = [3, 3, 2, 3, 1, 3, 2, 3, 3, 1, 3, 2, 3, 3, 2, 1];
  s.learn.cards.forEach((c, i) => { c.level = levels[i] || 1; });
  s.learn.reviewed = 46;
  s.learn.correct = 34;

  s.demo = true;
  return s;
}

function startDemo() {
  if (state.demo) return;
  const real = JSON.stringify(state);
  memBackup = real;
  try { localStorage.setItem(BACKUP_KEY, real); } catch (e) { /* kept in memory instead */ }
  state = sampleState();
  save();
  refresh();
  toast("Sample data is on. Your own progress is safe.");
}

function stopDemo() {
  if (!state.demo) return;
  let raw = null;
  try { raw = localStorage.getItem(BACKUP_KEY); } catch (e) { /* ignore */ }
  raw = raw || memBackup;
  let restored = null;
  try { restored = raw ? JSON.parse(raw) : null; } catch (e) { restored = null; }
  if (restored) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(restored)); } catch (e) { /* ignore */ }
    state = loadState();
    // storage blocked: loadState gave an empty state, so use the in-memory copy
    if (!state.xp && restored.xp) state = Object.assign(freshState(), restored);
  } else {
    state = freshState();
  }
  state.demo = false;
  try { localStorage.removeItem(BACKUP_KEY); } catch (e) { /* ignore */ }
  memBackup = null;
  save();
  refresh();
  toast("Your own data is back.");
}

function renderDemoBar() {
  let bar = $("demoBar");
  if (!state.demo) { if (bar) bar.remove(); return; }
  if (bar) return;
  bar = el("div", "demo-bar");
  bar.id = "demoBar";
  bar.setAttribute("role", "status");
  const inner = el("div", "wrap demo-in");
  inner.appendChild(el("span", "", "Sample data is on. Anything you do now is not saved to your own progress."));
  const b = el("button", "btn ghost demo-exit", "Restore my data");
  b.type = "button";
  b.addEventListener("click", () => {
    stopDemo();
    if (document.body.dataset.page !== "home") location.href = "index.html";
  });
  inner.appendChild(b);
  bar.appendChild(inner);
  const nav = document.querySelector(".nav");
  if (nav) nav.after(bar);
}

// =====================================================================
// XP, LEVELS, STREAKS
// =====================================================================
const levelOf = (xp) => Math.floor(xp / LEVEL_XP) + 1;
const titleOf = (level) => TITLES[Math.min(level - 1, TITLES.length - 1)];

function streakOf() {
  const days = new Set(Object.keys(state.xpByDay).filter((k) => state.xpByDay[k] > 0));
  let k = todayKey();
  if (!days.has(k)) k = shiftKey(k, -1);
  let n = 0;
  while (days.has(k)) { n++; k = shiftKey(k, -1); }
  return n;
}

// award XP (n may be 0), save, re-render and show one combined toast
function award(n, msg) {
  const before = levelOf(state.xp);
  if (n > 0) {
    state.xp += n;
    const k = todayKey();
    state.xpByDay[k] = (state.xpByDay[k] || 0) + n;
  }
  const after = levelOf(state.xp);
  save();
  refresh();
  let m = msg || "";
  if (n > 0) m += (m ? " " : "") + "+" + n + " XP";
  if (after > before) m += "  |  Level up: " + after + " (" + titleOf(after) + ")";
  if (m) toast(m);
}

function renderPill() {
  const level = levelOf(state.xp);
  const into = state.xp % LEVEL_XP;
  $("pillLevel").textContent = "Lv " + level;
  $("pillFill").style.width = (into / LEVEL_XP) * 100 + "%";
  $("pillXp").textContent = state.xp + " XP";
}

// every page defines renderPage(); this redraws the pill plus that page
let pageRender = null;
function refresh() {
  renderPill();
  renderDemoBar();
  if (pageRender) pageRender();
}

// =====================================================================
// CALCULATIONS
// =====================================================================
function carbonParts() {
  const c = state.carbon;
  return {
    car: (c.car * 52 * FACTORS.carKgPerKm) / 1000,
    flights: c.flights * FACTORS.flightTonsEach,
    power: (c.power * 12 * FACTORS.gridKgPerKwh) / 1000,
    diet: Number(c.diet),
  };
}

function carbonNumbers() {
  const d = carbonParts();
  const gross = d.car + d.flights + d.power + d.diet;
  const saved = PLEDGES.filter((p) => state.carbon.pledges.includes(p.id)).reduce((s, p) => s + p.saves(d), 0);
  return { d: d, gross: gross, saved: saved, net: Math.max(0, gross - saved) };
}

const carbonScore = (net) => clamp(((MAX_TONNES - net) / 8) * 100, 0, 100);

function waterToday() {
  const entries = state.water.days[todayKey()] || [];
  const used = sum(entries);
  const goal = state.water.goal;
  let score = null;
  if (entries.length) {
    const r = used / goal;
    if (r <= 0.6) score = 100;
    else if (r <= 1) score = 100 - ((r - 0.6) / 0.4) * 50;
    else if (r <= 1.5) score = 50 - ((r - 1) / 0.5) * 50;
    else score = 0;
  }
  return { entries: entries, used: used, goal: goal, score: score };
}

function learnNumbers() {
  const cards = state.learn.cards;
  const mastered = cards.filter((c) => c.level === 3).length;
  return { total: cards.length, mastered: mastered, score: cards.length ? (mastered / cards.length) * 100 : 0 };
}

function planetNumbers() {
  const cn = carbonNumbers();
  const w = waterToday();
  const l = learnNumbers();
  // Carbon only counts once the person has set their lifestyle or picked a pledge,
  // so a brand-new visitor starts at 0 instead of at the default footprint.
  const carbonSet = state.carbon.set !== false;
  const cs = carbonSet ? carbonScore(cn.net) : null;
  const parts = [l.score];
  if (cs !== null) parts.push(cs);
  if (w.score !== null) parts.push(w.score);
  const score = Math.round(parts.reduce((a, b) => a + b, 0) / parts.length);
  return { cn: cn, w: w, l: l, cs: cs, score: score };
}

function planetLabel(score) {
  if (score >= 80) return "Thriving";
  if (score >= 60) return "Growing";
  if (score >= 40) return "Warming up";
  return "Just starting";
}

// Home page: planet score, level card, XP chart and demo data.
function initHome() {
  function renderPillars(p) {
    const ul = $("pillars");
    ul.innerHTML = "";
    const rows = [
      { cls: "c-carbon", name: "Carbon",    val: p.cs,       sub: p.cs === null ? "Set your lifestyle" : p.cn.net.toFixed(1) + " t per year", nav: "carbon" },
      { cls: "c-water",  name: "Water",     val: p.w.score,  sub: p.w.score === null ? "Log water today" : p.w.used + " of " + p.w.goal + " L", nav: "water" },
      { cls: "c-learn",  name: "Knowledge", val: p.l.score,  sub: p.l.mastered + " of " + p.l.total + " mastered", nav: "learn" },
    ];
    rows.forEach((r) => {
      const li = el("li");
      const b = el("a", "pillar " + r.cls);
      b.href = r.nav + ".html";
      const top = el("div", "p-top");
      const left = el("span", "", r.name);
      left.appendChild(el("em", "", r.sub));
      top.appendChild(left);
      top.appendChild(el("span", "", r.val === null ? "No data" : Math.round(r.val) + " / 100"));
      const bar = el("div", "bar");
      const fill = el("i");
      fill.style.width = (r.val === null ? 0 : clamp(r.val, 0, 100)) + "%";
      bar.appendChild(fill);
      b.appendChild(top);
      b.appendChild(bar);
      li.appendChild(b);
      ul.appendChild(li);
    });
  }

  function renderXpChart() {
    const today = todayKey();
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const k = shiftKey(today, -i);
      const p = k.split("-").map(Number);
      days.push({
        k: k,
        label: new Date(p[0], p[1] - 1, p[2]).toLocaleDateString(undefined, { weekday: "short" }),
        xp: state.xpByDay[k] || 0,
      });
    }
    const max = Math.max(60, ...days.map((d) => d.xp));
    const W = 560, H = 200, base = 160, usable = 120, bw = 44, gap = 80;
    let svg = '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' +
      '<defs><linearGradient id="xpGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f2f2f2"/><stop offset="1" stop-color="#f2f2f2"/></linearGradient></defs>';
    days.forEach((d, i) => {
      const h = d.xp ? Math.max(6, Math.round((d.xp / max) * usable)) : 4;
      const x = 14 + i * gap;
      const cls = "xp-bar" + (d.k === today ? " today" : "") + (d.xp ? "" : " zero");
      svg += '<rect class="' + cls + '" x="' + x + '" y="' + (base - h) + '" width="' + bw + '" height="' + h + '" rx="8"></rect>';
      svg += '<text class="chart-value" x="' + (x + bw / 2) + '" y="' + (base - h - 8) + '">' + (d.xp || "") + "</text>";
      svg += '<text class="chart-label" x="' + (x + bw / 2) + '" y="' + (base + 22) + '">' + d.label + "</text>";
    });
    svg += "</svg>";
    $("xpChart").innerHTML = svg;
  }

  function renderHome() {
    const p = planetNumbers();
    setNum($("planetScore"), p.score, 0);
    $("planetLabel").textContent = planetLabel(p.score);
    setRing($("planetRing"), RING_BIG, p.score / 100);
    renderPillars(p);

    const level = levelOf(state.xp);
    const into = state.xp % LEVEL_XP;
    $("lvlNum").textContent = level;
    $("lvlTitle").textContent = titleOf(level);
    $("lvlXp").textContent = into + " / " + LEVEL_XP + " XP to next level";
    $("lvlBar").style.width = (into / LEVEL_XP) * 100 + "%";
    $("sXp").textContent = state.xp;
    $("sStreak").textContent = streakOf();

    $("modCarbon").textContent = p.cs === null ? "Not set" : p.cn.net.toFixed(1) + " t";
    $("modWater").textContent = p.w.used + " L";
    $("modLearn").textContent = p.l.mastered + " / " + p.l.total;

    const demoBtn = $("demoBtn");
    if (demoBtn) {
      demoBtn.textContent = state.demo ? "Restore my data" : "Try with sample data";
      demoBtn.classList.toggle("solid", !state.demo);
      demoBtn.classList.toggle("outline", state.demo);
      $("demoHint").textContent = state.demo
        ? "You are looking at sample numbers. Restoring brings back exactly what you had."
        : "this stat is for demo. Your own progress is kept safe and comes back when you restore it.";
    }

    renderXpChart();
  }

  pageRender = renderHome;

  const demoBtn = $("demoBtn");
  if (demoBtn) {
    demoBtn.onclick = () => {
      if (state.demo) stopDemo(); else startDemo();
      replayRings(document);
    };
  }

  refresh();
  replayRings(document);
}

// Learn page: flashcards, decks and progress.
function initLearn() {
  const WEIGHTS = { 1: 5, 2: 3, 3: 1 };
  let currentCard = null;
  let revealed = false;

  function deckCards() {
    const L = state.learn;
    return L.deck === "All" ? L.cards : L.cards.filter((c) => c.deck === L.deck);
  }

  function deckNames() {
    return Array.from(new Set(state.learn.cards.map((c) => c.deck))).sort();
  }

  function pickCard() {
    const pool = deckCards();
    if (!pool.length) return null;
    const options = pool.length > 1 ? pool.filter((c) => !currentCard || c.id !== currentCard.id) : pool;
    const total = options.reduce((t, c) => t + (WEIGHTS[c.level] || 1), 0);
    let r = Math.random() * total;
    for (let i = 0; i < options.length; i++) {
      r -= WEIGHTS[options[i].level] || 1;
      if (r <= 0) return options[i];
    }
    return options[options.length - 1];
  }

  function renderDecks() {
    const sel = $("lDeck");
    sel.innerHTML = "";
    ["All"].concat(deckNames()).forEach((name) => {
      const o = document.createElement("option");
      o.value = name;
      o.textContent = name;
      sel.appendChild(o);
    });
    if (!Array.prototype.some.call(sel.options, (o) => o.value === state.learn.deck)) state.learn.deck = "All";
    sel.value = state.learn.deck;

    const list = $("lDeckList");
    list.innerHTML = "";
    deckNames().forEach((name) => {
      const o = document.createElement("option");
      o.value = name;
      list.appendChild(o);
    });
  }

  function renderLearnStats() {
    const L = state.learn;
    const pool = deckCards();
    $("lReviewed").textContent = L.reviewed;
    $("lAccuracy").textContent = L.reviewed ? Math.round((L.correct / L.reviewed) * 100) + "%" : "0%";
    $("lMastered").textContent = L.cards.filter((c) => c.level === 3).length;
    $("lTotal").textContent = L.cards.length;
    $("lCount").textContent = pool.length + (pool.length === 1 ? " card" : " cards");

    const names = { 1: "Learning", 2: "Familiar", 3: "Mastered" };
    const box = $("lLevels");
    box.innerHTML = "";
    [1, 2, 3].forEach((lv) => {
      const n = pool.filter((c) => c.level === lv).length;
      const row = el("div", "level-row");
      row.appendChild(el("span", "", names[lv]));
      const bar = el("div", "bar");
      const fill = el("i");
      fill.style.width = (pool.length ? (n / pool.length) * 100 : 0) + "%";
      bar.appendChild(fill);
      row.appendChild(bar);
      row.appendChild(el("b", "", String(n)));
      box.appendChild(row);
    });
  }

  function setLearnButtons(on) {
    $("lHit").disabled = !on;
    $("lMiss").disabled = !on;
  }

  function showCard(card, instant) {
    currentCard = card;
    revealed = false;
    const apply = () => {
      if (card) {
        $("lQ").textContent = card.q;
        $("lA").textContent = card.a;
        $("lLine").textContent = "Deck: " + card.deck + "  |  Level " + card.level + " of 3";
      } else {
        $("lQ").textContent = "No cards in this deck yet. Add one on the right.";
        $("lA").textContent = "";
        $("lLine").textContent = "";
      }
    };
    $("lCard").classList.remove("flipped");
    if (instant) apply(); else setTimeout(apply, 280);
    setLearnButtons(false);
  }

  function reveal() {
    if (!currentCard || revealed) return;
    revealed = true;
    $("lCard").classList.add("flipped");
    setLearnButtons(true);
  }

  function answer(knew) {
    if (!currentCard || !revealed) return;
    const L = state.learn;
    L.reviewed += 1;
    if (knew) {
      L.correct += 1;
      currentCard.level = Math.min(3, currentCard.level + 1);
    } else {
      currentCard.level = 1;
    }
    award(knew ? 10 : 2, knew ? "Correct." : "Keep going.");
    showCard(pickCard(), false);
  }

  function addCard(e) {
    e.preventDefault();
    const deck = $("lNewDeck").value.trim();
    const q = $("lNewQ").value.trim();
    const a = $("lNewA").value.trim();
    if (!deck || !q || !a) return;
    state.learn.cards.push({ id: "u" + Date.now() + Math.floor(Math.random() * 1000), deck: deck, q: q, a: a, level: 1 });
    $("lNewQ").value = "";
    $("lNewA").value = "";
    const msg = $("lMsg");
    msg.textContent = "Card added to " + deck + ".";
    setTimeout(() => { msg.textContent = ""; }, 2200);
    renderDecks();
    award(5, "Card added.");
    if (!currentCard) showCard(pickCard(), true);
  }

  pageRender = renderLearnStats;

  $("lCard").addEventListener("click", reveal);
  $("lHit").addEventListener("click", () => answer(true));
  $("lMiss").addEventListener("click", () => answer(false));
  $("lForm").addEventListener("submit", addCard);
  $("lDeck").addEventListener("change", (e) => {
    state.learn.deck = e.target.value;
    save();
    renderLearnStats();
    currentCard = null;
    showCard(pickCard(), false);
  });
  document.removeEventListener("keydown", window.learnKeys);
  window.learnKeys = (e) => {
    if (!$("lCard")) return;
    const tag = (e.target.tagName || "").toUpperCase();
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (e.key === " ") { e.preventDefault(); reveal(); }
    else if (e.key === "ArrowRight") answer(true);
    else if (e.key === "ArrowLeft") answer(false);
  };
  document.addEventListener("keydown", window.learnKeys);

  renderDecks();
  refresh();
  showCard(pickCard(), true);
  replayRings(document);
}

// Water page: daily tank, activity log and weekly chart.
function initWater() {
  const WATER_TIPS = {
    bucket:  "Bucket baths are a great low-water choice. Keep it up.",
    teeth:   "Turn the tap off while brushing to save up to 5 L each time.",
    flush:   "A dual-flush system can cut toilet water use by about half.",
    dishes:  "Fill a basin instead of washing under a running tap.",
    laundry: "Run full loads only, and reuse rinse water for mopping.",
    cook:    "Essential use. Reuse vegetable-washing water for plants.",
    plants:  "Water plants early morning or evening to reduce evaporation.",
    car:     "Use a bucket and cloth instead of a hose to save many litres.",
  };

  function renderWater() {
    const w = waterToday();
    const pct = w.used / w.goal;
    $("wUsed").textContent = w.used;
    $("wGoalText").textContent = w.goal;
    $("wGoalVal").textContent = w.goal;

    const water = $("wWater");
    water.style.height = Math.min(pct, 1) * 100 + "%";
    water.classList.toggle("warn", pct >= 0.75 && pct < 1);
    water.classList.toggle("bad", pct >= 1);

    let status;
    if (w.used === 0) status = "Fresh start";
    else if (pct < 0.5) status = "Great pace";
    else if (pct < 0.75) status = "Doing fine";
    else if (pct < 1) status = "Almost at your limit";
    else status = "Goal passed, go easy";
    $("wStatus").textContent = status;

    if (w.entries.length) {
      const totals = {};
      w.entries.forEach((e) => { totals[e.id] = (totals[e.id] || 0) + e.litres; });
      const top = Object.keys(totals).sort((a, b) => totals[b] - totals[a])[0];
      $("wTip").textContent = WATER_TIPS[top] || "Every litre counts.";
    } else {
      $("wTip").textContent = "Tap an activity below to begin tracking.";
    }

    const log = $("wLog");
    log.innerHTML = "";
    if (!w.entries.length) {
      log.appendChild(el("li", "empty", "Nothing logged yet"));
    } else {
      w.entries.slice().reverse().forEach((e) => {
        const li = el("li");
        li.appendChild(el("span", "", e.name));
        li.appendChild(el("b", "", e.litres + " L"));
        log.appendChild(li);
      });
    }

    renderWeek();
  }

  function renderWeek() {
    const goal = state.water.goal;
    const today = todayKey();
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const k = shiftKey(today, -i);
      const p = k.split("-").map(Number);
      days.push({
        label: new Date(p[0], p[1] - 1, p[2]).toLocaleDateString(undefined, { weekday: "short" }),
        total: sum(state.water.days[k] || []),
        today: i === 0,
      });
    }
    const max = Math.max(goal * 1.25, ...days.map((d) => d.total));
    const chartH = 150;
    const box = $("wWeek");
    box.innerHTML = "";
    days.forEach((d) => {
      const col = el("div", "col");
      col.appendChild(el("em", "", d.total ? String(d.total) : ""));
      const bar = el("div", "bar-w" + (d.total > goal ? " over" : "") + (d.today ? " today" : ""));
      bar.style.height = Math.round((d.total / max) * chartH) + "px";
      col.appendChild(bar);
      col.appendChild(el("span", "", d.label));
      box.appendChild(col);
    });
    const line = el("div", "goal-line");
    line.style.bottom = Math.round((goal / max) * chartH) + 24 + "px";
    box.appendChild(line);
  }

  function rateOf(a) {
    const r = state.water.rates && Number(state.water.rates[a.id]);
    return r > 0 ? r : 0; // no default: the person enters their own litres
  }

  function nameOf(a) {
    const n = state.water.names && state.water.names[a.id];
    return typeof n === "string" && n.trim() ? n : a.name;
  }

  function startRename(card) {
    if (!card || card.classList.contains("editing")) return;
    const a = ACT_BY_ID[card.dataset.id];
    const inp = document.createElement("input");
    inp.type = "text";
    inp.className = "act-name-input";
    inp.maxLength = 24;
    inp.value = nameOf(a);
    inp.setAttribute("aria-label", "Rename " + nameOf(a));
    card.classList.add("editing");
    card.appendChild(inp);
    inp.focus();
    inp.select();
    let cancelled = false, done = false;
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); inp.blur(); }
      else if (e.key === "Escape") { cancelled = true; inp.blur(); }
    });
    inp.addEventListener("blur", () => {
      if (done) return;
      done = true;
      const v = inp.value.trim();
      if (!cancelled && v) {
        state.water.names[a.id] = v;
        save();
        card.querySelector(".a-name").textContent = v;
        toast("Renamed to " + v + ".");
      }
      inp.remove();
      card.classList.remove("editing");
    });
  }

  function renderActivities() {
    const box = $("wActs");
    box.innerHTML = "";
    ACTIVITIES.forEach((a) => {
      const card = el("div", "act-card");
      card.dataset.id = a.id;
      const b = el("button", "act");
      b.type = "button";
      b.dataset.id = a.id;
      b.appendChild(el("span", "a-name", nameOf(a)));
      card.appendChild(b);

      const rn = el("button", "act-rename", "\u270E");
      rn.type = "button";
      rn.setAttribute("aria-label", "Rename " + nameOf(a));
      card.appendChild(rn);

      const ed = el("div", "act-edit");
      ed.appendChild(el("span", "", "+"));
      const inp = document.createElement("input");
      inp.type = "number";
      inp.min = "1";
      inp.max = "1000";
      inp.step = "1";
      inp.className = "act-rate";
      inp.dataset.id = a.id;
      inp.value = rateOf(a) || "";
      inp.placeholder = "0";
      inp.setAttribute("aria-label", "Litres for " + nameOf(a));
      ed.appendChild(inp);
      ed.appendChild(el("span", "", "L"));
      card.appendChild(ed);
      box.appendChild(card);
    });
  }

  function buildActivities() {
    if (!state.water.rates || typeof state.water.rates !== "object") state.water.rates = {};
    if (!state.water.names || typeof state.water.names !== "object") state.water.names = {};
    const box = $("wActs");
    box.addEventListener("click", (e) => {
      const rn = e.target.closest(".act-rename");
      if (rn) { startRename(rn.closest(".act-card")); return; }
      const b = e.target.closest(".act");
      if (!b) return;
      const a = ACT_BY_ID[b.dataset.id];
      const inp = b.closest(".act-card").querySelector(".act-rate");
      const litres = clamp(Math.round(Number(inp.value)), 0, 1000);
      if (!(litres > 0)) {
        inp.focus();
        toast("Enter the litres for " + nameOf(a) + " first.");
        return;
      }
      state.water.rates[a.id] = litres;
      const k = todayKey();
      if (!state.water.days[k]) state.water.days[k] = [];
      state.water.days[k].push({ id: a.id, name: nameOf(a), litres: litres });
      award(state.water.days[k].length <= 10 ? 3 : 0, nameOf(a) + " logged.");
    });
    box.addEventListener("change", (e) => {
      const inp = e.target.closest(".act-rate");
      if (!inp) return;
      const a = ACT_BY_ID[inp.dataset.id];
      if (inp.value.trim() === "") { delete state.water.rates[a.id]; save(); return; }
      const v = Math.round(Number(inp.value));
      if (!(v > 0)) { inp.value = rateOf(a) || ""; return; }
      const litres = clamp(v, 1, 1000);
      state.water.rates[a.id] = litres;
      inp.value = litres;
      save();
      toast(nameOf(a) + " is now " + litres + " L.");
    });
    renderActivities();
  }

  pageRender = renderWater;

  $("wGoal").addEventListener("input", () => {
    state.water.goal = Number($("wGoal").value);
    save();
    refresh();
  });
  $("wUndo").addEventListener("click", () => {
    const k = todayKey();
    if (state.water.days[k] && state.water.days[k].length) {
      state.water.days[k].pop();
      save();
      refresh();
    }
  });
  $("wReset").addEventListener("click", () => {
    state.water.days[todayKey()] = [];
    save();
    refresh();
  });

  $("wForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("wName").value.trim();
    const litres = clamp(Math.round(Number($("wLitres").value)), 1, 1000);
    if (!name || !(litres > 0)) return;
    const k = todayKey();
    if (!state.water.days[k]) state.water.days[k] = [];
    state.water.days[k].push({ id: "custom", name: name, litres: litres });
    $("wName").value = "";
    $("wLitres").value = "";
    award(state.water.days[k].length <= 10 ? 3 : 0, name + " logged.");
  });

  buildActivities();
  $("wRatesReset").addEventListener("click", () => {
    state.water.rates = {};
    state.water.names = {};
    save();
    renderActivities();
    toast("Litres and names cleared.");
  });
  $("wGoal").value = state.water.goal;
  refresh();
}

// Carbon page: lifestyle sliders, pledges, yearly footprint and the Climate TRACE comparison.
function initCarbon() {
  function carbonVerdict(net) {
    if (net < 2) return ["Excellent. Within the Paris-friendly range.", "#f2f2f2"];
    if (net < 4) return ["Decent, but there is room to improve.", "#f2f2f2"];
    if (net < 7) return ["Above the world average. Time to act.", "#a8a8ae"];
    return ["Very high footprint. Big wins are available below.", "#d27a7a"];
  }

  function renderCarbon() {
    const c = state.carbon;
    const n = carbonNumbers();
    $("carVal").textContent = c.car;
    $("flightsVal").textContent = c.flights;
    $("powerVal").textContent = c.power;

    setNum($("carbonTotal"), n.net, 1);
    const ring = $("carbonRing");
    setRing(ring, RING_SMALL, Math.min(n.net / MAX_TONNES, 1));
    const v = carbonVerdict(n.net);
    $("carbonVerdict").textContent = v[0];
    ring.style.stroke = v[1];

    $("carbonBefore").textContent = c.pledges.length
      ? "Before pledges: " + n.gross.toFixed(1) + " t. Your pledges save " + n.saved.toFixed(2) + " t."
      : "Tick pledges below to see how much you can cut.";

    const parts = [["Driving", n.d.car], ["Flights", n.d.flights], ["Power", n.d.power], ["Food", n.d.diet]];
    const biggest = Math.max.apply(null, parts.map((p) => p[1]));
    const box = $("carbonBars");
    box.innerHTML = "";
    parts.forEach((p) => {
      const row = el("div", "bar-row" + (p[1] === biggest && p[1] > 0 ? " top" : ""));
      row.appendChild(el("span", "", p[0]));
      const bar = el("div", "bar");
      const fill = el("i");
      fill.style.width = (n.gross > 0 ? (p[1] / n.gross) * 100 : 0) + "%";
      bar.appendChild(fill);
      row.appendChild(bar);
      row.appendChild(el("span", "", p[1].toFixed(2) + " t"));
      box.appendChild(row);
    });

    PLEDGES.forEach((p) => {
      const li = document.querySelector('#pledgeList li[data-id="' + p.id + '"]');
      if (!li) return;
      li.classList.toggle("done", c.pledges.indexOf(p.id) !== -1);
      li.querySelector(".save").textContent = "-" + p.saves(n.d).toFixed(2) + " t";
      li.querySelector("input").checked = c.pledges.indexOf(p.id) !== -1;
    });
    $("saving").textContent = n.saved.toFixed(2);
    $("pledgeNote").textContent = c.pledges.length + " of " + PLEDGES.length + " chosen";
    renderLive();
  }

  function buildPledges() {
    const ul = $("pledgeList");
    ul.innerHTML = "";
    PLEDGES.forEach((p) => {
      const li = el("li");
      li.dataset.id = p.id;
      const label = el("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      label.appendChild(input);
      label.appendChild(el("span", "", p.text));
      label.appendChild(el("span", "save", ""));
      li.appendChild(label);
      ul.appendChild(li);
    });
    ul.addEventListener("change", (e) => {
      const li = e.target.closest("li");
      if (!li) return;
      const id = li.dataset.id;
      const c = state.carbon;
      c.set = true;
      if (e.target.checked) {
        if (c.pledges.indexOf(id) === -1) c.pledges.push(id);
        if (c.awarded.indexOf(id) === -1) {
          c.awarded.push(id);
          award(15, "Pledge made.");
          return;
        }
      } else {
        c.pledges = c.pledges.filter((x) => x !== id);
      }
      save();
      refresh();
    });
  }

  function syncInputs() {
    const c = state.carbon;
    $("car").value = c.car;
    $("flights").value = c.flights;
    $("power").value = c.power;
    $("diet").value = String(c.diet);
    if ($("diet").value !== String(c.diet)) $("diet").value = "2";
  }

  // Live country comparison from Climate TRACE (public API, no key needed).
  // Offline or blocked: a saved 2024 snapshot is shown instead.
  const CT_URL = "https://api.climatetrace.org/v7/rankings/countries?gas=co2e_100yr&start=2024&end=2024";
  const CT_KEY = "nyro-ct-v2";
  const CT_NAMES = { IND: "India", CHN: "China", USA: "United States", DEU: "Germany", GBR: "United Kingdom", IDN: "Indonesia" };
  const CT_SNAPSHOT = { IND: 3.32, CHN: 11.72, USA: 18.04, DEU: 8.91, GBR: 5.52, IDN: 6.01 };
  let live = { pc: CT_SNAPSHOT, src: "snapshot", ts: 0 };

  function renderLive() {
    const box = $("liveBars");
    if (!box) return;
    const rows = Object.keys(live.pc).map((k) => ({ name: CT_NAMES[k], v: live.pc[k] }))
      .concat({ name: "You (after pledges)", v: carbonNumbers().net, you: true })
      .sort((a, b) => b.v - a.v);
    const max = rows[0].v || 1;
    box.innerHTML = "";
    rows.forEach((r) => {
      const row = el("div", "bar-row" + (r.you ? " top" : ""));
      row.appendChild(el("span", "", r.name));
      const bar = el("div", "bar");
      const fill = el("i");
      fill.style.width = (r.v / max) * 100 + "%";
      bar.appendChild(fill);
      row.appendChild(bar);
      row.appendChild(el("span", "", r.v.toFixed(1) + " t"));
      box.appendChild(row);
    });
    $("liveStatus").textContent = live.src === "live" ? "Live from Climate TRACE"
      : live.src === "cached" ? "Climate TRACE, saved " + new Date(live.ts).toLocaleDateString()
      : "Offline snapshot (2024)";
  }

  async function loadLive() {
    let c = null;
    try { c = JSON.parse(localStorage.getItem(CT_KEY)); } catch (e) { /* ignore */ }
    if (c && c.pc && Date.now() - c.ts < 864e5) {
      live = { pc: c.pc, src: "cached", ts: c.ts };
      return renderLive();
    }
    try {
      const res = await fetch(CT_URL, { signal: AbortSignal.timeout(7000) });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const list = (await res.json()).rankings || [];
      const pc = {};
      Object.keys(CT_NAMES).forEach((k) => {
        const r = list.find((x) => x.country === k);
        if (r && r.emissionsPerCapita > 0) pc[k] = r.emissionsPerCapita;
      });
      if (!Object.keys(pc).length) throw new Error("unexpected data");
      live = { pc: pc, src: "live", ts: Date.now() };
      try { localStorage.setItem(CT_KEY, JSON.stringify({ ts: live.ts, pc: pc })); } catch (e) { /* ignore */ }
    } catch (e) {
      if (c && c.pc) live = { pc: c.pc, src: "cached", ts: c.ts };
    }
    renderLive();
  }

  pageRender = renderCarbon;

  ["car", "flights", "power"].forEach((id) => {
    $(id).addEventListener("input", () => {
      state.carbon[id] = Number($(id).value);
      state.carbon.set = true;
      save();
      refresh();
    });
  });
  $("diet").addEventListener("change", () => {
    state.carbon.diet = Number($("diet").value);
    state.carbon.set = true;
    save();
    refresh();
  });

  buildPledges();
  syncInputs();
  refresh();
  replayRings(document);
  loadLive();
}

// =====================================================================
// START
// Every page is its own HTML file; <body data-page="..."> says which one.
// =====================================================================
const INITS = { home: initHome, learn: initLearn, water: initWater, carbon: initCarbon, about: refresh };
(INITS[document.body.dataset.page] || refresh)();
