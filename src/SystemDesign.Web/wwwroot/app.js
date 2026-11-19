"use strict";
/* System Design Lab — one page: home, a page per concept (Learn / Run / Code), and the Scale ShopKart game. */

const COURSE = window.COURSE || { TRACKS: [], C: [], PIECES: [], SCENES: [] };
const $ = sel => document.querySelector(sel);
const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

let DEMOS = [];                       // from /api/demos: {number, track, title, file, summary}
let SITE = { repositoryUrl: "", version: "" };
const stripTags = s => String(s ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const repoFile = path => SITE.repositoryUrl ? `${SITE.repositoryUrl.replace(/\/+$/, "")}/blob/main/${path}` : "";
const sourceCache = new Map();
const runCache = new Map();           // last run result per demo, kept while the page is open

/* ---------- progress (browser only) ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } }
};
let done = new Set(store.get("sdlab-done", []));
const saveDone = () => { store.set("sdlab-done", [...done]); updateProgress(); renderSide(); };

/* ---------- XP, levels and badges (browser only) ---------- */
let stars = store.get("sdlab-stars", {});        // concept number -> best stars (0-3) in its mini-game
let watched = new Set(store.get("sdlab-watched", []));
const LEVELS = [[0, "Intern", "🌱"], [150, "Junior developer", "🧑‍💻"], [400, "Developer", "⚙️"], [800, "Senior developer", "🚀"],
  [1400, "Tech lead", "🧭"], [2200, "Staff engineer", "🏗️"], [3200, "Principal architect", "👑"]];
function xp() {
  const starXp = Object.values(stars).reduce((s, v) => s + v * 40, 0);
  return done.size * 30 + watched.size * 25 + starXp + cardStats().mastered * 15;
}
function levelOf(points) {
  let i = 0;
  while (i + 1 < LEVELS.length && points >= LEVELS[i + 1][0]) i++;
  const [from, name, icon] = LEVELS[i], to = LEVELS[i + 1]?.[0];
  return { index: i + 1, name, icon, from, to, pct: to ? (points - from) / (to - from) * 100 : 100 };
}
function updateXp() {
  const points = xp(), lv = levelOf(points);
  $("#xppill").innerHTML = `<span class="lvl">${lv.index}</span>${points} XP <small>${esc(lv.name)}</small>`;
  $("#xppill").title = lv.to ? `${lv.to - points} XP to the next level` : "Max level reached";
}
function awardStars(n, got) {
  const before = levelOf(xp()).index, prev = stars[n] || 0;
  if (got > prev) { stars[n] = got; store.set("sdlab-stars", stars); }
  const gained = Math.max(0, got - prev) * 40;
  afterXpChange(before);
  return { xp: gained, best: got > prev && prev > 0 };
}
function markWatched(n) {
  if (watched.has(n)) return;
  const before = levelOf(xp()).index;
  watched.add(n); store.set("sdlab-watched", [...watched]);
  afterXpChange(before);
}
function afterXpChange(levelBefore) {
  updateXp(); renderSide();
  const lv = levelOf(xp());
  if (lv.index > levelBefore) setTimeout(() => toastLevel(lv), 900);
}
function toastLevel(lv) {
  const t = document.createElement("div");
  t.className = "levelup";
  t.innerHTML = `<span>${lv.icon}</span><div><small>Level up!</small><b>Level ${lv.index}: ${esc(lv.name)}</b></div>`;
  document.body.append(t);
  setTimeout(() => t.classList.add("out"), 3200);
  setTimeout(() => t.remove(), 3700);
}
const starText = n => n ? "★".repeat(n) + "☆".repeat(3 - n) : "";

/* ---------- concept model: demo n <-> course concept C[n-1] ---------- */
function concept(n) {
  const demo = DEMOS.find(d => d.number === n);
  const c = COURSE.C[n - 1] || {};
  const track = COURSE.TRACKS.find(t => t.id === c.track);
  return { n, demo, c, id: c.id || `demo-${n}`, title: c.title || demo?.title || `Concept ${n}`, track };
}
const allConcepts = () => DEMOS.map(d => concept(d.number));
const numberOfId = id => { const i = COURSE.C.findIndex(c => c.id === id); return i >= 0 ? i + 1 : null; };

/* ---------- shell ---------- */
function updateProgress() {
  const total = DEMOS.length || 26;
  $("#progtext").textContent = `${done.size} / ${total} learned`;
  $("#ring").style.setProperty("--p", `${(done.size / total) * 100}%`);
  updateXp();
}

function renderSide() {
  const route = parseRoute();
  let html = "";
  const groups = COURSE.TRACKS.length
    ? COURSE.TRACKS.map(t => ({ title: t.title, items: allConcepts().filter(x => x.c.track === t.id) }))
    : [...new Set(DEMOS.map(d => d.track))].map(t => ({ title: t, items: allConcepts().filter(x => x.demo.track === t) }));
  for (const g of groups) {
    const got = g.items.filter(x => done.has(x.id) || stars[x.n]).length;
    html += `<h2>${esc(g.title)}<small class="sidecount">${got}/${g.items.length}</small></h2>`;
    for (const x of g.items) {
      const cls = [route.name === "concept" && route.n === x.n ? "active" : "", done.has(x.id) ? "done" : ""].join(" ");
      const st = stars[x.n] ? `<span class="stars" title="${stars[x.n]} of 3 stars in the mini-game">${"★".repeat(stars[x.n])}</span>` : "";
      html += `<a href="#/concept/${x.n}" class="${cls}"><span class="n"><span>${x.n}</span></span>${esc(x.title)}${st}</a>`;
    }
  }
  html += `<a href="#/arcade" class="gamelink">🕹️ Arcade: all 26 mini-games</a>`;
  html += `<a href="#/game" class="gamelink">🎮 Play: Scale ShopKart</a>`;
  html += `<a href="/course" target="_blank" rel="noopener" class="gamelink">📘 Full course on one page ↗</a>`;
  $("#side").innerHTML = html;
}

function setNav(open) {
  $("#side").classList.toggle("open", open);
  $("#scrim").classList.toggle("open", open);
  $("#navtoggle").setAttribute("aria-expanded", String(open));
}
$("#navtoggle").addEventListener("click", () => setNav(!$("#side").classList.contains("open")));
$("#scrim").addEventListener("click", () => setNav(false));

function applyTheme(t) {
  if (t) document.documentElement.setAttribute("data-theme", t);
  else document.documentElement.removeAttribute("data-theme");
}
applyTheme(store.get("sdlab-theme", null));
$("#themebtn").addEventListener("click", () => {
  const dark = document.documentElement.getAttribute("data-theme") === "dark" ||
    (!document.documentElement.getAttribute("data-theme") && matchMedia("(prefers-color-scheme: dark)").matches);
  const next = dark ? "light" : "dark";
  applyTheme(next); store.set("sdlab-theme", next);
});

/* ---------- router ---------- */
function parseRoute() {
  const h = location.hash.replace(/^#\/?/, "");
  const parts = h.split("/").filter(Boolean);
  if (parts[0] === "concept" && +parts[1]) return { name: "concept", n: +parts[1], tab: parts[2] || "learn" };
  if (parts[0] === "game") return { name: "game" };
  if (parts[0] === "review") return { name: "review" };
  if (parts[0] === "arcade") return { name: "arcade" };
  return { name: "home" };
}

let scene = null;                     // the animation or mini-game currently on screen
function closeScene() { scene?.dispose(); scene = null; }

function route() {
  const r = parseRoute();
  closeScene();
  delete $("#main").dataset.tab;
  document.querySelectorAll(".topnav a[data-route]").forEach(a => a.classList.toggle("active", a.dataset.route === r.name));
  setNav(false);
  renderSide();
  if (r.name === "concept") renderConcept(r.n, r.tab);
  else if (r.name === "game") renderGame();
  else if (r.name === "review") renderReview();
  else if (r.name === "arcade") renderArcade();
  else renderHome();
}
window.addEventListener("hashchange", () => { route(); });

/* ---------- home ---------- */
const PATH = [["📱", "Client", "api-design"], ["🌍", "CDN", "cdn"], ["🚪", "Gateway", "gateway"], ["🚦", "Rate limiter", "rate-limiting"],
  ["⚖️", "Load balancer", "load-balancing"], ["🖥️", "App servers", "scaling"], ["⚡", "Cache", "caching"], ["📨", "Queue", "queues"],
  ["🗄️", "Database", "sql-nosql"], ["🪞", "Replicas", "replication"], ["🧩", "Shards", "sharding"]];

function renderHome() {
  document.title = "System Design Lab";
  const firstOpen = allConcepts().find(x => !done.has(x.id)) || allConcepts()[0];
  const tracks = COURSE.TRACKS.map(t => {
    const items = allConcepts().filter(x => x.c.track === t.id);
    const learned = items.filter(x => done.has(x.id)).length;
    return `<div class="trackcard">
      <h3>${esc(t.title)}</h3><p>${t.blurb}</p>
      <div class="bar" title="${learned} of ${items.length} learned"><i style="width:${items.length ? learned / items.length * 100 : 0}%"></i></div>
      <ul>${items.map(x => `<li><a href="#/concept/${x.n}"><span class="n">${String(x.n).padStart(2, "0")}</span>${esc(x.title)}${done.has(x.id) ? '<span class="tick">✓</span>' : ""}</a></li>`).join("")}</ul>
    </div>`;
  }).join("");

  $("#main").innerHTML = `
    <section class="hero">
      <p class="eyebrow">System design for .NET developers</p>
      <h1>Learn it, run it, read the code.</h1>
      <p>26 core system design concepts. Each one has the theory and trade-offs, an animation that shows it moving, a mini-game that makes you use it, a live C# demo that runs on this machine, and the full source.</p>
      <div class="cta">
        <a class="btn primary" href="#/concept/${firstOpen?.n ?? 1}">${done.size ? "Continue" : "Start"} with ${esc(firstOpen?.title ?? "concept 1")} →</a>
        <a class="btn ghost" href="#/arcade">🕹️ Arcade: 26 mini-games</a>
        <a class="btn ghost" href="#/game">🎮 Scale ShopKart</a>
      </div>
    </section>
    <div class="howto five">
      <div><i>1</i><b>Learn</b><span>The idea, what it gains, what it costs, and how it maps to .NET.</span></div>
      <div><i>2</i><b>Watch</b><span>An animation shows requests, data and failures moving through the design.</span></div>
      <div><i>3</i><b>Play</b><span>A short mini-game makes you use the idea. Earn up to 3 stars and XP.</span></div>
      <div><i>4</i><b>Run</b><span>The real C# demo executes on the server and its results appear step by step.</span></div>
      <div><i>5</i><b>Read the code</b><span>See the source, change a number in your IDE and predict the new result.</span></div>
    </div>

    <h2 class="section-h">Follow a request through the system</h2>
    <p class="section-p">Every piece a request touches on its way from a phone to the database. Click one to learn it.</p>
    <div class="pathbox"><div class="path">${PATH.map((p, i) => {
      const n = numberOfId(p[2]);
      return `${i ? '<span class="arrow" aria-hidden="true">→</span>' : ""}<a href="#/concept/${n}" class="${done.has(p[2]) ? "done" : ""}"><span class="node" aria-hidden="true">${p[0]}</span>${p[1]}</a>`;
    }).join("")}</div></div>

    <h2 class="section-h">All concepts</h2>
    <p class="section-p">Suggested order: top to bottom. Play the game first if you want to find your weak spots.</p>
    <div class="tracks">${tracks}</div>

    <h2 class="section-h">Make it stick</h2>
    <p class="section-p">Reading once isn't learning. Test your recall with flashcards, then prove it in the game.</p>
    <div class="cta">
      <a class="btn ghost" href="#/review">🗂️ Review flashcards (${cardStats().due} to review)</a>
      <a class="btn ghost" href="#/game">🎮 Play Scale ShopKart</a>
      ${done.size || Object.keys(stars).length || watched.size ? `<button class="btn ghost" id="resetprogress">Reset my progress</button>` : ""}
    </div>`;
  $("#resetprogress")?.addEventListener("click", () => {
    if (!confirm("Clear all 'learned' marks, stars, XP and flashcard history in this browser?")) return;
    done = new Set(); stars = {}; watched = new Set();
    store.set("sdlab-cards", {}); store.set("sdlab-stars", {}); store.set("sdlab-watched", []);
    saveDone(); renderHome();
  });
  $("#main").focus({ preventScroll: true });
  scrollTo(0, 0);
}

/* ---------- concept page ---------- */
function renderConcept(n, tab) {
  const x = concept(n);
  if (!x.demo) { $("#main").innerHTML = `<div class="empty"><b>No concept ${n}</b><a href="#/">Back home</a></div>`; return; }
  document.title = `${x.n}. ${x.title} · System Design Lab`;
  const prev = n > 1 ? concept(n - 1) : null, next = n < DEMOS.length ? concept(n + 1) : null;
  const tabs = [["learn", "1", "Learn"], ["watch", "2", "Watch"], ["play", "3", "Play"], ["run", "4", "Run the demo"], ["code", "5", "Read the code"]];
  if (!tabs.some(t => t[0] === tab)) tab = "learn";

  $("#main").innerHTML = `
    <div class="crumbs"><span class="num">${String(n).padStart(2, "0")}</span>${esc(x.track?.title ?? x.demo.track)}
      <span class="lvlchip lvl-${levelName(x)}">${levelName(x)}</span></div>
    <h1 class="concept-h">${esc(x.title)}</h1>
    ${x.c.summary ? `<p class="concept-sum">${x.c.summary}</p>` : ""}
    <div class="tabs" role="tablist">${tabs.map(([id, i, label]) =>
      `<button class="tab" role="tab" data-tab="${id}" aria-selected="${tab === id}"><i>${i}</i>${label}${id === "play" && stars[n] ? ` <span class="tabstars">${starText(stars[n])}</span>` : ""}</button>`).join("")}</div>
    <div id="panel"></div>
    <div class="pager">
      ${prev ? `<a href="#/concept/${prev.n}"><small>← Previous</small>${esc(prev.title)}</a>` : "<span></span>"}
      ${next ? `<a class="next" href="#/concept/${next.n}"><small>Next →</small>${esc(next.title)}</a>` : `<a class="next" href="#/game"><small>Finished all 26?</small>Play Scale ShopKart →</a>`}
    </div>`;

  document.querySelectorAll(".tab").forEach(b => b.addEventListener("click", () => {
    history.replaceState(null, "", `#/concept/${n}/${b.dataset.tab}`);
    document.querySelectorAll(".tab").forEach(t => t.setAttribute("aria-selected", String(t === b)));
    showTab(x, b.dataset.tab);
  }));
  showTab(x, tab);
  $("#main").focus({ preventScroll: true });
  scrollTo(0, 0);
}

function showTab(x, tab) {
  const panel = $("#panel");
  closeScene();
  $("#main").dataset.tab = tab;
  if (tab === "watch" || tab === "play") return renderScene(x, panel, tab);
  if (tab === "run") return renderRun(x, panel);
  if (tab === "code") return renderCode(x, panel);
  renderLearn(x, panel);
}

function markButton(x) {
  const on = done.has(x.id);
  return `<button class="btn ghost markbtn ${on ? "on" : ""}" data-mark="${esc(x.id)}">${on ? "Learned ✓" : "Mark as learned"}</button>`;
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-mark]");
  if (!b) return;
  const id = b.dataset.mark;
  done.has(id) ? done.delete(id) : done.add(id);
  saveDone();
  document.querySelectorAll(`[data-mark="${CSS.escape(id)}"]`).forEach(el => {
    el.classList.toggle("on", done.has(id));
    el.textContent = done.has(id) ? "Learned ✓" : "Mark as learned";
  });
});

function renderLearn(x, panel) {
  const c = x.c;
  if (!c.body) {
    panel.innerHTML = `<div class="prose"><p>${esc(x.demo.summary)}</p></div>
      <div class="nextstep"><p>Now see it work.</p><a class="btn primary" href="#/concept/${x.n}/run">Run the demo →</a></div>`;
    return;
  }
  panel.innerHTML = `
    <div class="prose">${c.body}</div>
    <div class="tradeoffs">
      <div class="gain"><h4>What you gain</h4><ul>${(c.gain || []).map(g => `<li>${g}</li>`).join("")}</ul></div>
      <div class="cost"><h4>What it costs</h4><ul>${(c.cost || []).map(g => `<li>${g}</li>`).join("")}</ul></div>
    </div>
    ${c.dotnet ? `<div class="dotnet"><h4>In .NET</h4><p>${c.dotnet}</p></div>` : ""}
    ${c.code ? codeBlock(c.code, "Production-style example") : ""}
    ${c.interview ? `<div class="interview"><b>Interview angle:</b> ${c.interview}</div>` : ""}
    ${c.check ? `<details class="check"><summary>Check yourself: ${c.check.q}</summary><p>${c.check.a}</p></details>` : ""}
    <div class="nextstep">
      <p>Got the idea? Now watch it move.</p>
      <div class="cta">${markButton(x)}<a class="btn primary" href="#/concept/${x.n}/watch">▶ Watch the animation →</a></div>
    </div>`;
  wireCopy(panel, c.code);
}

const levelName = x => ({ foundations: "Beginner", data: "Intermediate", communication: "Intermediate", reliability: "Advanced", cases: "Advanced" })[x.c.track] || "Intermediate";

/* ---------- watch + play (animated scenes from viz/cNN.js) ---------- */
async function renderScene(x, panel, mode) {
  panel.innerHTML = `<div class="lab-loading">Loading the ${mode === "watch" ? "animation" : "mini-game"}…</div>`;
  let spec;
  try { spec = await Lab.load(x.n); }
  catch (err) {
    if (parseRoute().n === x.n) panel.innerHTML = `<div class="empty"><b>This ${mode === "watch" ? "animation" : "game"} could not load</b>${esc(err.message)}. Reload the page to try again.</div>`;
    return;
  }
  const r = parseRoute();
  if (r.n !== x.n || (r.tab || "learn") !== mode || !spec[mode]) {
    if (!spec[mode] && r.n === x.n) panel.innerHTML = `<div class="empty"><b>Coming soon</b>This concept doesn't have a ${mode === "watch" ? "animation" : "mini-game"} yet.</div>`;
    return;
  }
  const host = document.createElement("div");
  const after = document.createElement("div");
  after.className = "lab-next";
  panel.replaceChildren(host, after);
  if (mode === "watch") {
    after.innerHTML = `<p>${watched.has(x.n) ? "✓ Watched. " : ""}Ready to use it? Play the mini-game.</p>
      <div class="cta"><a class="btn primary" href="#/concept/${x.n}/play">🎮 Play: ${esc(spec.play?.title ?? "mini-game")} →</a></div>`;
  } else {
    after.innerHTML = `<p>Now see the real thing: the C# demo for this concept.</p>
      <div class="cta">${markButton(x)}<a class="btn primary" href="#/concept/${x.n}/run">Run the C# demo →</a></div>`;
  }
  const nextN = x.n < DEMOS.length ? x.n + 1 : null;
  scene = Lab.mount(host, spec, mode, {
    playHref: `#/concept/${x.n}/play`,
    playLabel: `🎮 Play: ${spec.play?.title ?? "mini-game"} →`,
    onDone: () => {
      markWatched(x.n);
      after.querySelector("p").textContent = "✓ Watched. Ready to use it? Play the mini-game.";
    },
    onFinish: ({ stars: got }) => {
      const reward = awardStars(x.n, got);
      const tab = document.querySelector('.tab[data-tab="play"]');
      if (tab && stars[x.n]) {
        tab.querySelector(".tabstars")?.remove();
        tab.insertAdjacentHTML("beforeend", ` <span class="tabstars">${starText(stars[x.n])}</span>`);
      }
      return reward;
    },
    next: mode === "play"
      ? (nextN ? { href: `#/concept/${nextN}/watch`, label: `Next: ${concept(nextN).title} →` } : { href: "#/arcade", label: "Back to the arcade" })
      : null
  });
}

/* ---------- arcade: every mini-game, badges and level ---------- */
function badges() {
  const st = n => stars[n] || 0;
  const all = allConcepts();
  const trackDone = id => { const items = all.filter(x => x.c.track === id); return items.length > 0 && items.every(x => st(x.n) > 0); };
  const cs = cardStats();
  return [
    ["🎯", "First win", "Win any mini-game", all.some(x => st(x.n) > 0)],
    ["🍿", "Film buff", "Watch 5 animations", watched.size >= 5],
    ["⭐", "Perfectionist", "Get 3 stars in any game", all.some(x => st(x.n) === 3)],
    ["🧱", "Foundations", "Win every Foundations game", trackDone("foundations")],
    ["🗄️", "Data wrangler", "Win every Data game", trackDone("data")],
    ["📡", "Communicator", "Win every Communication game", trackDone("communication")],
    ["🛡️", "Guardian", "Win every Reliability game", trackDone("reliability")],
    ["🏛️", "Architect", "Win both case studies", trackDone("cases")],
    ["🧠", "Total recall", "Master every flashcard", cs.total > 0 && cs.mastered === cs.total],
    ["👑", "Grandmaster", "3 stars in all 26 games", all.length > 0 && all.every(x => st(x.n) === 3)]
  ];
}

function renderArcade() {
  document.title = "Arcade · System Design Lab";
  const points = xp(), lv = levelOf(points);
  const totalStars = Object.values(stars).reduce((s, v) => s + v, 0);
  const b = badges();
  const cards = allConcepts().map(x => {
    const st = stars[x.n] || 0;
    return `<a class="gamecard" href="#/concept/${x.n}/play">
      <div class="top"><span class="n">${String(x.n).padStart(2, "0")} · ${esc(x.track?.title ?? "")}</span>
        <span class="st" aria-label="${st} of 3 stars">${[1, 2, 3].map(i => `<span class="${i <= st ? "on" : ""}">★</span>`).join("")}</span></div>
      <b>${esc(x.title)}</b>
      <div class="links"><span>🎮 Play</span><span>${watched.has(x.n) ? "✓ Watched" : "▶ Watch first"}</span></div>
    </a>`;
  }).join("");
  $("#main").innerHTML = `
    <p class="eyebrow">Learn by playing</p>
    <h1 class="concept-h">Arcade</h1>
    <p class="concept-sum">Every concept has a short mini-game. Earn up to 3 stars in each, collect badges, and level up from Intern to Principal architect.</p>
    <div class="levelcard">
      <div class="big" aria-hidden="true">${lv.icon}</div>
      <div><h2>Level ${lv.index}: ${esc(lv.name)}</h2>
        <p>${points} XP · ${totalStars} of ${allConcepts().length * 3} stars · ${watched.size} animations watched · ${done.size} concepts learned${lv.to ? ` · ${lv.to - points} XP to level ${lv.index + 1}` : ""}</p>
        <div class="xpbar"><i style="width:${lv.pct}%"></i></div></div>
    </div>
    <h2 class="section-h">Badges <small style="color:var(--muted);font-weight:600;font-size:15px">${b.filter(x => x[3]).length} / ${b.length}</small></h2>
    <div class="badges">${b.map(([ic, name, how, on]) => `<div class="badge ${on ? "on" : ""}"><span class="ic">${ic}</span><div><b>${name}</b><small>${how}</small></div></div>`).join("")}</div>
    <h2 class="section-h">All mini-games</h2>
    <p class="section-p">XP: 25 for watching an animation, 40 per star, 30 per concept marked learned, 15 per mastered flashcard.</p>
    <div class="arcade">${cards}</div>`;
  $("#main").focus({ preventScroll: true });
  scrollTo(0, 0);
}

/* ---------- run ---------- */
function renderRun(x, panel) {
  panel.innerHTML = `
    <div class="runbar">
      <div class="what"><b>Live demo · ${esc(x.demo.file)}</b><span>${esc(x.demo.summary || x.demo.title)}</span></div>
      <span class="runmeta" id="runmeta"></span>
      <button class="btn primary" id="runbtn">▶ Run demo</button>
    </div>
    <div id="output"></div>
    <p class="tip">Also runs in the terminal: <code>dotnet run --project src/SystemDesign.Concepts -- ${x.n}</code></p>`;
  const cached = runCache.get(x.n);
  if (cached) drawRun(x, cached, false);
  else $("#output").innerHTML = `<div class="empty"><b>Press Run to execute the demo</b>It runs on the server in plain C#, and each step of the output appears here.</div>`;
  $("#runbtn").addEventListener("click", () => runDemo(x));
  if (!cached) runDemo(x);
}

async function runDemo(x) {
  const btn = $("#runbtn");
  if (!btn) return;
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span> Running…`;
  try {
    const res = await fetch(`/api/demos/${x.n}/run`, { method: "POST" });
    if (res.status === 429) {
      const wait = res.headers.get("Retry-After");
      $("#output").innerHTML = `<div class="notice"><span>🚦</span><span><b>Slow down a little.</b> This lab rate-limits demo runs per visitor — the same technique you learn in <a href="#/concept/19">concept 19</a>. Try again${wait ? ` in ${esc(wait)} s` : " shortly"}.</span></div>`;
      return;
    }
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    const data = await res.json();
    runCache.set(x.n, data);
    if (parseRoute().n === x.n) drawRun(x, data, true);
  } catch (err) {
    const out = $("#output");
    if (out) out.innerHTML = `<div class="row-bad"><span class="ic">!</span><span>Could not run the demo: ${esc(err.message)}. Is the server still running?</span></div>`;
  } finally {
    const b = $("#runbtn");
    if (b) { b.disabled = false; b.innerHTML = "↻ Run again"; }
  }
}

const BAR_RE = /^\s*([^:]{1,40}?):\s+(-?[\d,]+(?:\.\d+)?)\s*(%|ms|s|keys|rows|req|items|x)?\s*$/i;

function drawRun(x, data, animate) {
  $("#runmeta").textContent = `${data.entries.length} lines · ${data.durationMs.toFixed(0)} ms`;
  // group entries into step cards
  const groups = [];
  let cur = null, lesson = [];
  for (const e of data.entries) {
    if (e.kind === "title") continue;
    if (e.kind === "lesson") { lesson.push(e.text); continue; }
    if (e.kind === "step") { cur = { title: e.text, rows: [] }; groups.push(cur); continue; }
    if (!cur) { cur = { title: null, rows: [] }; groups.push(cur); }
    if (e.kind === "line" && !e.text.trim()) continue;
    cur.rows.push(e);
  }
  let stepNo = 0, delay = 0;
  const html = groups.map(g => {
    const rows = renderRows(g.rows);
    const d = animate ? `style="animation-delay:${(delay += 70)}ms"` : "";
    if (!g.title) return `<div class="stepcard solo" ${d}><div class="rows">${rows}</div></div>`;
    return `<div class="stepcard" ${d}><h4><i>${++stepNo}</i><span>${esc(g.title)}</span></h4>${rows ? `<div class="rows">${rows}</div>` : ""}</div>`;
  }).join("") + lesson.map(l => `<div class="lessoncard" ${animate ? `style="animation-delay:${delay + 120}ms"` : ""}><span class="ic">💡</span><div><b>Lesson</b><p>${esc(l)}</p></div></div>`).join("");

  $("#output").innerHTML = `<div class="timeline">${html || '<div class="empty">The demo printed nothing.</div>'}</div>
    <div class="nextstep"><p>Now open the code and find where each step comes from.</p>
      <div class="cta">${markButton(x)}<a class="btn primary" href="#/concept/${x.n}/code">Read the code →</a></div></div>`;
  requestAnimationFrame(() => requestAnimationFrame(() =>
    document.querySelectorAll(".bars .track i").forEach(i => i.style.width = i.dataset.w)));
}

function renderRows(rows) {
  let out = "", i = 0;
  while (i < rows.length) {
    // two or more consecutive "label: number" lines become a bar chart
    if (rows[i].kind === "line" && BAR_RE.test(rows[i].text)) {
      let j = i; const run = [];
      while (j < rows.length && rows[j].kind === "line" && BAR_RE.test(rows[j].text)) { run.push(rows[j].text.match(BAR_RE)); j++; }
      const nums = run.map(m => parseFloat(m[2].replace(/,/g, "")));
      if (run.length >= 2 && nums.every(v => v >= 0) && Math.max(...nums) > 0) {
        const max = Math.max(...nums);
        out += `<div class="bars">${run.map((m, k) =>
          `<span class="lbl" title="${esc(m[1])}">${esc(m[1].trim())}</span><span class="track"><i data-w="${Math.max(1.5, nums[k] / max * 100)}%"></i></span><span class="val">${esc(m[2])}${esc(m[3] || "")}</span>`).join("")}</div>`;
        i = j; continue;
      }
    }
    const e = rows[i++];
    if (e.kind === "good") out += `<div class="row-good"><span class="ic">✓</span><span>${esc(e.text)}</span></div>`;
    else if (e.kind === "bad") out += `<div class="row-bad"><span class="ic">✕</span><span>${esc(e.text)}</span></div>`;
    else out += `<div class="row-line">${esc(e.text)}</div>`;
  }
  return out;
}

/* ---------- code ---------- */
async function renderCode(x, panel) {
  panel.innerHTML = `<div class="loading">Loading ${esc(x.demo.file)}…</div>`;
  let src = sourceCache.get(x.n);
  if (!src) {
    try {
      const res = await fetch(`/api/demos/${x.n}/source`);
      src = res.ok ? await res.text() : `// Source not found (${res.status})`;
    } catch (err) { src = `// Could not load source: ${err.message}`; }
    sourceCache.set(x.n, src);
  }
  if (parseRoute().n !== x.n) return;
  const path = `src/SystemDesign.Concepts/Demos/${x.demo.file}`;
  const gh = repoFile(path);
  panel.innerHTML = `
    ${codeBlock(src, path, true)}
    <div class="nextstep">
      <p>Try it: change a number (a TTL, a shard count, a limit), predict the result, then run it again.</p>
      <div class="cta">${markButton(x)}${gh ? `<a class="btn ghost" href="${esc(gh)}" target="_blank" rel="noopener">View on GitHub ↗</a>` : ""}<a class="btn ghost" href="#/concept/${x.n}/run">▶ Back to the demo</a></div>
    </div>`;
  wireCopy(panel, src);
}

function codeBlock(src, name, numbered = true) {
  const lines = highlight(src.replace(/\r\n/g, "\n").replace(/\s+$/, "")).split("\n");
  const body = numbered ? lines.map((l, i) => `<span class="ln" data-n="${i + 1}">${l || " "}</span>`).join("") : lines.join("\n");
  return `<div class="code"><div class="codehead"><span class="dots"><i></i><i></i><i></i></span><span>${esc(name)}</span><button data-copy>Copy</button></div><pre>${body}</pre></div>`;
}

function wireCopy(root, text) {
  root.querySelectorAll("[data-copy]").forEach((b, idx) => b.addEventListener("click", async () => {
    const block = b.closest(".code");
    const t = idx === 0 && text ? text : block.querySelector("pre").innerText;
    try { await navigator.clipboard.writeText(t); b.textContent = "Copied"; } catch { b.textContent = "Select and copy"; }
    setTimeout(() => b.textContent = "Copy", 1500);
  }));
}

/* Small C# highlighter: comments, strings, numbers, keywords, type names. Multi-line tokens are split per line. */
const KW = new Set(("abstract as async await base bool break byte case catch char checked class const continue decimal default delegate do double else enum event explicit extern false finally fixed float for foreach goto if implicit in init int interface internal is lock long namespace new null object operator out override params private protected public readonly record ref required return sbyte sealed short sizeof stackalloc static string struct switch this throw true try typeof uint ulong unchecked unsafe ushort using var virtual void volatile when where while with yield get set value nameof not and or").split(" "));
function highlight(src) {
  const re = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(\$?@?"(?:[^"\\\n]|\\.|"")*"|'(?:[^'\\\n]|\\.)')|\b(\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?[mMfFdDlLuU]?)\b|\b([A-Za-z_]\w*)\b/g;
  let out = "", last = 0, m;
  const wrap = (cls, text) => text.split("\n").map(t => t ? `<span class="${cls}">${esc(t)}</span>` : "").join("\n");
  while ((m = re.exec(src))) {
    out += esc(src.slice(last, m.index));
    if (m[1]) out += wrap("tk-com", m[1]);
    else if (m[2]) out += wrap("tk-str", m[2]);
    else if (m[3]) out += `<span class="tk-num">${esc(m[3])}</span>`;
    else if (KW.has(m[4])) out += `<span class="tk-kw">${m[4]}</span>`;
    else if (/^[A-Z]/.test(m[4])) out += `<span class="tk-type">${m[4]}</span>`;
    else out += esc(m[4]);
    last = re.lastIndex;
  }
  return out + esc(src.slice(last));
}

/* ---------- game ---------- */
let G;
function shuffle(a) { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function newGame() { G = { i: 0, uptime: 100, score: 0, built: new Set(), log: [] }; drawGame(); }
const conceptLink = id => { const n = numberOfId(id); return n ? `<a href="#/concept/${n}">${esc(COURSE.C[n - 1].title)}</a>` : esc(id); };

function renderGame() {
  document.title = "Scale ShopKart · System Design Lab";
  $("#main").innerHTML = `<section class="game" id="game"></section>`;
  if (!G) newGame(); else drawGame();
  scrollTo(0, 0);
}

function hud() {
  const col = G.uptime > 70 ? "var(--good)" : G.uptime > 40 ? "var(--warn)" : "var(--bad)";
  return `<div class="hud">
    <div><span>Round</span><strong>${Math.min(G.i + 1, COURSE.SCENES.length)} / ${COURSE.SCENES.length}</strong></div>
    <div><span>Uptime</span><strong>${G.uptime}%</strong><div class="uptime-bar"><i style="width:${G.uptime}%;background:${col}"></i></div></div>
    <div><span>Architect score</span><strong>${G.score}</strong></div>
  </div>
  <div class="arch" aria-label="Your architecture">${COURSE.PIECES.map(p => `<span class="chip ${G.built.has(p) ? "on" : ""}">${esc(p)}</span>`).join("")}</div>`;
}

function drawGame() {
  const el = $("#game");
  if (!el) return;
  const head = `<h2>Scale ShopKart</h2><p class="intro">You’re the architect. ShopKart grows from 1,000 to 10 million users, and each round something breaks. Pick the fix a senior engineer would choose. Right calls add a piece to your architecture; wrong ones cost uptime.</p>`;
  if (!COURSE.SCENES.length) { el.innerHTML = head + `<p>Game data could not be loaded.</p>`; return; }
  if (G.uptime <= 0 || G.i >= COURSE.SCENES.length) { el.innerHTML = head + hud() + gameResult(); return; }
  const s = COURSE.SCENES[G.i];
  const opts = shuffle(s.opts.map(o => ({ text: o[0], kind: o[1] })));
  el.innerHTML = head + hud() + `<div class="scene">
    <div class="stage">${esc(s.stage)}</div><h3>${esc(s.title)}</h3><p class="sit">${esc(s.sit)}</p>
    <div class="opts">${opts.map(o => `<button data-kind="${o.kind}">${esc(o.text)}</button>`).join("")}</div>
    <div id="fb"></div></div>`;
  el.querySelectorAll(".opts button").forEach(b => b.addEventListener("click", () => answer(b, s)));
}

function answer(btn, s) {
  const kind = btn.dataset.kind;
  document.querySelectorAll(".opts button").forEach(b => { b.disabled = true; if (b.dataset.kind === "right") b.classList.add("right"); });
  if (kind !== "right") btn.classList.add(kind);
  let verdict;
  if (kind === "right") { G.score += 100; G.built.add(s.piece); verdict = `Right call. ${s.piece} added to your architecture.`; }
  else if (kind === "partial") { G.score += 40; G.uptime = Math.max(0, G.uptime - 10); verdict = "It helps, but it isn’t the real fix. Uptime −10%."; }
  else { G.uptime = Math.max(0, G.uptime - 25); verdict = "That makes things worse. Uptime −25%."; }
  G.log.push({ title: s.title, kind, concept: s.concept });
  const last = G.uptime <= 0 || G.i === COURSE.SCENES.length - 1;
  $("#fb").innerHTML = `<div class="feedback">
    <p><b>${verdict}</b></p><p>${esc(s.why)}</p>
    <p>Revise: ${conceptLink(s.concept)}</p>
    <button class="btn primary" id="next">${G.uptime <= 0 ? "See what happened" : last ? "See your results" : "Next round →"}</button></div>`;
  $("#next").addEventListener("click", () => { G.i++; drawGame(); $("#game").scrollIntoView({ block: "start" }); });
  $("#next").focus({ preventScroll: true });
}

function gameResult() {
  const max = COURSE.SCENES.length * 100, right = G.log.filter(l => l.kind === "right").length;
  const grade = G.uptime <= 0 ? "ShopKart went down" :
    right >= 13 ? "Staff engineer material" : right >= 10 ? "Senior engineer" : right >= 7 ? "Getting there" : "Back to the drawing board";
  const misses = G.log.filter(l => l.kind !== "right");
  return `<div class="scene result">
    <h3>${grade}</h3>
    <p>${right} of ${G.log.length} rounds answered with the best fix · score ${G.score} of ${max} · uptime ${G.uptime}%.</p>
    ${misses.length ? `<p><b>Revise these, then play again:</b></p><ul>${misses.map(m => `<li>${conceptLink(m.concept)} — ${esc(m.title)}</li>`).join("")}</ul>`
      : "<p>No misses. Next step: explain each choice out loud as if to an interviewer, including what it costs.</p>"}
    <button class="btn primary" id="again">Play again</button></div>`;
}
document.addEventListener("click", e => { if (e.target.id === "again") newGame(); });

/* ---------- flashcards (simple Leitner boxes: 0 = new/again, 1 = learning, 2+ = mastered) ---------- */
function cards() {
  const state = store.get("sdlab-cards", {});
  return COURSE.C.map((c, i) => ({ n: i + 1, id: c.id, title: c.title, q: c.check?.q, a: c.check?.a, box: state[c.id]?.box ?? 0, seen: !!state[c.id] }))
    .filter(c => c.q);
}
function cardStats() {
  const all = cards();
  return { total: all.length, mastered: all.filter(c => c.box >= 2).length, learning: all.filter(c => c.box === 1).length, due: all.filter(c => c.box < 2).length };
}
let deck = null;
function buildDeck() {
  // weakest cards first, shuffled within each box
  deck = { queue: shuffle(cards()).sort((a, b) => a.box - b.box), i: 0, right: 0, again: 0 };
}
function renderReview() {
  document.title = "Flashcards · System Design Lab";
  if (!deck || deck.i >= deck.queue.length) buildDeck();
  drawCard();
  scrollTo(0, 0);
}
function drawCard(showAnswer = false) {
  const s = cardStats();
  const head = `
    <div class="deckhead">
      <div><p class="eyebrow">Active recall</p><h1 class="concept-h" style="margin:0">Flashcards</h1></div>
      <div class="deckstats"><span>Mastered <b>${s.mastered}</b></span><span>Learning <b>${s.learning}</b></span><span>New / again <b>${s.total - s.mastered - s.learning}</b></span></div>
    </div>
    <div class="deckbar" title="${s.mastered} of ${s.total} mastered"><i style="width:${s.total ? s.mastered / s.total * 100 : 0}%"></i></div>`;
  if (deck.i >= deck.queue.length) {
    $("#main").innerHTML = head + `<div class="flash">
      <div class="from">Round complete</div>
      <p class="q">${deck.right} recalled · ${deck.again} to review again</p>
      <p class="a">Cards you missed come back first next round. Open the concept for anything that still feels shaky, run its demo, then come back.</p>
      <div class="actions"><button class="btn primary" id="newround">Start another round</button><a class="btn ghost" href="#/game">Try the game</a></div></div>`;
    $("#newround").addEventListener("click", () => { buildDeck(); drawCard(); });
    return;
  }
  const c = deck.queue[deck.i];
  $("#main").innerHTML = head + `<div class="flash">
    <div class="from">Card ${deck.i + 1} of ${deck.queue.length} · <a href="#/concept/${c.n}">${esc(c.title)}</a></div>
    <p class="q">${c.q}</p>
    ${showAnswer ? `<p class="a">${c.a}</p>` : ""}
    <div class="actions">${showAnswer
      ? `<button class="btn good" data-grade="1">✓ I knew it</button><button class="btn bad" data-grade="0">↺ Review again</button><a class="btn ghost" href="#/concept/${c.n}">Open concept</a>`
      : `<button class="btn primary" id="reveal">Show answer <kbd style="margin-left:6px">Space</kbd></button>`}</div></div>`;
  $("#reveal")?.addEventListener("click", () => drawCard(true));
  document.querySelectorAll("[data-grade]").forEach(b => b.addEventListener("click", () => grade(+b.dataset.grade)));
  (showAnswer ? document.querySelector("[data-grade]") : $("#reveal"))?.focus({ preventScroll: true });
}
function grade(knew) {
  const c = deck.queue[deck.i];
  const state = store.get("sdlab-cards", {});
  state[c.id] = { box: knew ? Math.min(3, c.box + 1) : 0, at: Date.now() };
  store.set("sdlab-cards", state);
  knew ? deck.right++ : deck.again++;
  deck.i++;
  drawCard();
}

/* ---------- search palette ---------- */
const palette = $("#palette"), pInput = $("#paletteinput"), pList = $("#paletteresults");
let pSel = 0, pItems = [];
function openPalette() {
  if (palette.open) return;
  pInput.value = ""; searchConcepts(""); palette.showModal(); pInput.focus();
}
function highlightMatch(text, q) {
  const t = esc(text);
  if (!q) return t;
  const re = new RegExp(`(${q.split(/\s+/).filter(Boolean).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "ig");
  return t.replace(re, "<mark>$1</mark>");
}
function searchConcepts(q) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const scored = allConcepts().map(x => {
    const title = x.title.toLowerCase();
    const hay = `${title} ${stripTags(x.c.summary)} ${stripTags(x.c.body)} ${x.demo.summary} ${x.demo.file}`.toLowerCase();
    if (words.some(w => !hay.includes(w))) return null;
    const score = words.reduce((s, w) => s + (title.includes(w) ? 10 : 0) + (title.startsWith(w) ? 5 : 0), 0) - x.n / 100;
    return { x, score };
  }).filter(Boolean).sort((a, b) => b.score - a.score);
  pItems = scored.map(s => s.x);
  if (!q) pItems.push({ n: 0, special: "#/review", title: "Flashcards", c: { summary: "Test your recall of all 26 concepts." } },
                     { n: 0, special: "#/game", title: "Play Scale ShopKart", c: { summary: "15 rounds: grow ShopKart from 1,000 to 10 million users." } });
  pSel = 0;
  drawPalette(q);
}
function drawPalette(q) {
  pList.innerHTML = pItems.length ? pItems.map((x, i) => `<li><a href="${x.special || `#/concept/${x.n}`}" class="${i === pSel ? "sel" : ""}" data-i="${i}" role="option" aria-selected="${i === pSel}">
      <span class="n">${x.n ? String(x.n).padStart(2, "0") : "→"}</span><span><b>${highlightMatch(x.title, q)}</b><small>${highlightMatch(stripTags(x.c?.summary), q)}</small></span></a></li>`).join("")
    : `<li class="none">No concept matches “${esc(q)}”.</li>`;
  pList.querySelector(".sel")?.scrollIntoView({ block: "nearest" });
}
pInput.addEventListener("input", () => searchConcepts(pInput.value.trim()));
pInput.addEventListener("keydown", e => {
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    pSel = (pSel + (e.key === "ArrowDown" ? 1 : -1) + pItems.length) % Math.max(1, pItems.length);
    drawPalette(pInput.value.trim());
  } else if (e.key === "Enter" && pItems[pSel]) {
    e.preventDefault();
    const x = pItems[pSel];
    palette.close();
    location.hash = x.special || `#/concept/${x.n}`;
  }
});
pList.addEventListener("click", e => { if (e.target.closest("a")) palette.close(); });
palette.addEventListener("click", e => { if (e.target === palette) palette.close(); });
$("#searchbtn").addEventListener("click", openPalette);
$("#keysbtn").addEventListener("click", () => $("#keyhelp").showModal());
$("#keyhelp").addEventListener("click", e => { if (e.target.id === "keyhelp") e.target.close(); });

/* ---------- keyboard shortcuts ---------- */
document.addEventListener("keydown", e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openPalette(); return; }
  if (document.querySelector("dialog[open]")) return;
  if (e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) return;
  const r = parseRoute();
  if (e.key === "/") { e.preventDefault(); openPalette(); }
  else if (e.key === "?") { $("#keyhelp").showModal(); }
  else if (r.name === "concept") {
    // games own the keyboard while they're on screen
    if (r.tab === "play" && !["1", "2", "3", "4", "5"].includes(e.key)) return;
    // a stepped lesson owns ← → Space R
    if (r.tab === "watch" && scene?.stepped) {
      if (e.key === "ArrowRight") { e.preventDefault(); scene.next(); return; }
      if (e.key === "ArrowLeft") { e.preventDefault(); scene.back(); return; }
      if (e.key === " " && !/^(BUTTON|A)$/.test(document.activeElement?.tagName)) { e.preventDefault(); scene.togglePause(); return; }
      if (e.key.toLowerCase() === "r") { scene.restart(); return; }
    }
    if (e.key === "ArrowRight" && r.n < DEMOS.length) location.hash = `#/concept/${r.n + 1}/${r.tab}`;
    else if (e.key === "ArrowLeft" && r.n > 1) location.hash = `#/concept/${r.n - 1}/${r.tab}`;
    else if (["1", "2", "3", "4", "5"].includes(e.key)) document.querySelectorAll(".tab")[+e.key - 1]?.click();
    else if (e.key.toLowerCase() === "p" && r.tab === "watch") scene?.togglePause();
    else if (e.key.toLowerCase() === "r") { if (r.tab !== "run") document.querySelector('.tab[data-tab="run"]')?.click(); else $("#runbtn")?.click(); }
    else if (e.key.toLowerCase() === "m") document.querySelector("[data-mark]")?.click();
  } else if (r.name === "review" && e.key === " " && $("#reveal")) { e.preventDefault(); $("#reveal").click(); }
});

/* ---------- start ---------- */
(async function start() {
  try {
    const [demos, site] = await Promise.all([
      fetch("/api/demos").then(r => r.json()),
      fetch("/api/site").then(r => r.ok ? r.json() : SITE).catch(() => SITE)
    ]);
    DEMOS = demos; SITE = site;
  } catch (err) {
    $("#main").innerHTML = `<div class="empty"><b>Can't reach the server</b>Start it with <code>dotnet run --project src/SystemDesign.Web</code>, then reload.</div>`;
    return;
  }
  if (SITE.repositoryUrl) {
    for (const a of [$("#repolink"), $("#footrepo")]) { a.href = SITE.repositoryUrl; a.hidden = false; }
  }
  updateProgress();
  route();
})();
