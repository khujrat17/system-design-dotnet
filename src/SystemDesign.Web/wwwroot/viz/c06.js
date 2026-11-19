"use strict";
/* Concept 6 · CDN. Watch: far-away origin vs pull-CDN edges (miss, then hit), a same-name deploy serving stale
   files and an uneven purge, then versioned file names. Play: Edge Placer (place 3 edges, then set cache headers). */
(function () {
  function clickable(el, label, fn) {
    el.setAttribute("tabindex", 0);
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", label);
    el.style.cursor = "pointer";
    el.addEventListener("click", fn);
    el.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } });
  }
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  function drawContinents(k, svg) {
    [[160, 175, 105, 125], [375, 165, 72, 118], [580, 165, 125, 105]].forEach(([cx, cy, rx, ry]) => {
      svg.append(k.s("ellipse", { cx, cy, rx, ry, fill: "surface2", stroke: "line", "stroke-width": 1 }));
    });
  }

  Lab.define(6, {
    watch: {
      title: "Why Mumbai saw the old photo",
      intro: "A user in Mumbai loads an image from a server in Virginia. Then we add a CDN, and then we deploy.",
      steps: [
        { label: "Far origin", tag: "problem", title: "Halfway round the world",
          body: "<p>A user in <b>Mumbai</b> loads <code>phone.jpg</code> from the origin in <b>Virginia</b>.</p><p>Every request pays the full <b>~220 ms</b> trip, and every byte leaves your origin.</p>",
          idea: "Distance is latency. You can’t make light faster, so move the content closer.",
          changed: ["2 requests at 220 ms each", "Origin trips: 2"] },
        { label: "Pull CDN", tag: "technique", title: "Add edges near users",
          body: "<p>A <b>pull CDN</b> puts edge servers close to users, and each edge caches what it serves.</p><p>The first Mumbai request is a <b>miss</b>: the edge fetches from the origin once (15 + 220 ms) and keeps a copy.</p>",
          idea: "A pull CDN fills itself: the first request pays, everyone after rides free.",
          changed: ["Edges in Frankfurt and Mumbai", "Mumbai edge cache: phone.jpg v1"] },
        { label: "Edge hits", tag: "concept", title: "15 ms, origin untouched",
          body: "<p>Every later Mumbai request is a <b>hit</b>: about <b>15 ms</b>, and the origin never sees it.</p>",
          idea: "Hits cut latency and origin load at the same time.",
          changed: ["2 hits at 15 ms", "Origin trips: unchanged"] },
        { label: "Per edge", tag: "concept", title: "Each edge fills on its own",
          body: "<p>Edges don’t share caches. Frankfurt’s first request <b>misses</b> too, then hits.</p><p>With hundreds of edges, a new file can be fetched from the origin once <b>per edge</b>.</p>",
          idea: "Origin load grows with the number of edges, not the number of users.",
          changed: ["Frankfurt: 1 miss, then 1 hit"] },
        { label: "Same name", tag: "failure", title: "Deploy over the old file",
          body: "<p>You deploy a new photo under the <b>same name</b>, <code>phone.jpg</code>.</p><p>Mumbai’s edge still has v1 and happily serves it: <b>stale content</b> until the TTL runs out or someone purges.</p>",
          idea: "The cache key is the URL. Same URL, same cached bytes.",
          changed: ["Origin: phone.jpg = v2", "Mumbai still gets v1"] },
        { label: "Purge", tag: "trade-off", title: "Purges are slow and uneven",
          body: "<p>So purge the file. A purge crawls across <b>hundreds of edges</b> at different speeds.</p><p>Frankfurt gets it quickly and shows <b>v2</b>; Mumbai still shows <b>v1</b> until its purge lands.</p>",
          idea: "During a purge, users see a mix of old and new files.",
          changed: ["Frankfurt: v2", "Mumbai: v1 for a while"] },
        { label: "Hashed names", tag: "fix", title: "Put the content hash in the name",
          body: "<p>Name the new photo <code>phone.9f3c.jpg</code> and link the page to that URL.</p><p>A new URL is a <b>guaranteed miss</b> on every edge, so nobody can get the old bytes.</p>",
          idea: "Change the name, not the content behind a name, and stale caches can’t happen.",
          changed: ["Both edges miss once", "Fresh v2 everywhere"] },
        { label: "Cache a year", tag: "result", title: "Cache it for a year",
          body: "<p>The name changes whenever the content does, so the file can be cached for a year: <code>Cache-Control: public, max-age=31536000, immutable</code>.</p><p>In ASP.NET Core, <code>asp-append-version</code> adds the hash for you.</p>",
          idea: "CDN edges cut latency and origin load; versioned file names beat purging.",
          changed: ["Every request a 15 ms hit", "Avg latency falls"] }
      ],
      learn: [
        { text: "Why distance adds latency", step: 0 },
        { text: "How a pull CDN fills its cache", step: 1 },
        { text: "Why same-name deploys serve stale files", step: 4 },
        { text: "Why versioned file names beat purging", step: 6 }
      ],
      build(stage, k) {
        const svg = k.svg(760, 330, { label: "A world map with an origin in Virginia, CDN edges in Frankfurt and Mumbai, users nearby, and a response log" });
        stage.append(svg);
        const map = k.s("g"); svg.append(map);
        [[150, 175, 100, 120, "Americas"], [370, 170, 62, 120, "Europe · Africa"], [520, 160, 50, 95, "Asia"]].forEach(([cx, cy, rx, ry, name]) => {
          map.append(k.s("ellipse", { cx, cy, rx, ry, fill: "surface2", stroke: "line", "stroke-width": 1 }));
          k.text(map, cx, cy - ry + 18, name, { size: 11, tone: "muted" });
        });

        const O = { x: 150, y: 120 }, FE = { x: 370, y: 92 }, ME = { x: 520, y: 150 }, FU = { x: 370, y: 215 }, MU = { x: 520, y: 262 };
        const origin = k.box(svg, { ...O, label: "Origin", sub: "phone.jpg = v1", icon: "🏢", w: 136, h: 46, size: 13.5 });
        k.text(svg, O.x, O.y + 38, "Virginia", { size: 11, tone: "muted" });
        const fUser = k.box(svg, { ...FU, label: "Frankfurt user", icon: "💻", w: 130, h: 36, size: 12 });
        const mUser = k.box(svg, { ...MU, label: "Mumbai user", icon: "📱", w: 124, h: 36, size: 12 });
        const edges = {
          F: { pos: FE, user: FU, name: "Frankfurt", cache: {}, box: null, chip: null },
          M: { pos: ME, user: MU, name: "Mumbai", cache: {}, box: null, chip: null }
        };
        for (const e of Object.values(edges)) {
          e.box = k.box(svg, { ...e.pos, label: `${e.name} edge`, icon: "📡", w: 132, h: 34, size: 12, tone: "accent" });
          e.chip = k.text(svg, e.pos.x, e.pos.y + 31, "cache: empty", { size: 11, mono: true, tone: "muted" });
          e.box.setAttribute("opacity", 0); e.chip.setAttribute("opacity", 0);
        }
        const files = { "phone.jpg": "v1" };

        // live metrics
        let hits = 0, originTrips = 0, stale = 0, lastMs = 0, totalMs = 0, reqs = 0;
        const metrics = () => k.hud({ "Edge hits": hits, "Origin trips": originTrips, "Stale served": stale,
          "Last request": lastMs ? `${lastMs} ms` : "—", "Avg latency": reqs ? `${Math.round(totalMs / reqs)} ms` : "—" });
        metrics();
        const record = ms => { lastMs = ms; totalMs += ms; reqs++; metrics(); };

        // response log
        svg.append(k.s("rect", { x: 592, y: 14, width: 158, height: 306, rx: 10, fill: "paper", stroke: "line" }));
        k.text(svg, 671, 34, "Response log", { size: 12, weight: 700 });
        const logG = k.s("g"); svg.append(logG);
        const rows = [];
        function log(str, tone = "ink") {
          rows.push([str, tone]);
          if (rows.length > 12) rows.shift();
          logG.replaceChildren();
          rows.forEach(([s, t], i) => k.text(logG, 602, 56 + i * 22, s, { size: 11, anchor: "start", tone: t, mono: true }));
        }
        const msOf = (a, b) => Math.max(320, dist(a, b) * 3.6);
        const userPos = who => (who === "M" ? MU : FU);
        const userBox = who => (who === "M" ? mUser : fUser);

        async function direct(who) {
          const U = userPos(who);
          await k.packet(svg, U, O, { r: 7, ms: msOf(U, O) });
          k.tone(origin, "warn");
          originTrips++; metrics();
          await k.packet(svg, O, U, { r: 7, tone: "warn", ms: msOf(U, O) });
          k.tone(origin, "neutral");
          k.float(svg, U.x, U.y - 26, "220 ms", "bad");
          log(`${edges[who].name.slice(0, 3)} origin   220ms`, "bad");
          record(220);
        }
        async function viaEdge(who, path) {
          const e = edges[who], U = e.user;
          await k.packet(svg, U, e.pos, { r: 7, ms: msOf(U, e.pos) });
          let ms, version, hit = path in e.cache;
          if (hit) {
            version = e.cache[path];
            k.tone(e.box, "good"); k.float(svg, e.pos.x, e.pos.y - 24, "HIT", "good");
            hits++; metrics();
            await k.sleep(200);
            ms = 15;
          } else {
            k.tone(e.box, "bad"); k.float(svg, e.pos.x, e.pos.y - 24, "MISS", "bad");
            await k.packet(svg, e.pos, O, { r: 7, ms: msOf(e.pos, O) });
            k.tone(origin, "warn");
            originTrips++; metrics();
            await k.packet(svg, O, e.pos, { r: 7, tone: "warn", ms: msOf(e.pos, O) });
            k.tone(origin, "neutral");
            version = e.cache[path] = files[path];
            e.chip.textContent = `cache: ${path.replace("phone.9f3c", "9f3c")} ${version}`;
            ms = 235;
          }
          const isStale = version !== files[path];
          await k.packet(svg, e.pos, U, { r: 7, tone: isStale ? "bad" : "good", ms: msOf(U, e.pos) });
          k.tone(e.box, "accent");
          k.float(svg, U.x, U.y - 26, isStale ? `${version}: stale!` : `${ms} ms`, isStale ? "bad" : ms < 50 ? "good" : "warn");
          log(`${e.name.slice(0, 3)} ${hit ? "HIT " : "MISS"} ${String(ms).padStart(3)}ms${isStale ? " old" : ""}`, isStale ? "bad" : hit ? "good" : "warn");
          if (isStale) { k.tone(userBox(who), "bad"); stale++; }
          record(ms);
          return { hit, stale: isStale };
        }

        k.run(async () => {
          // 1 · far origin
          await k.step();
          k.say("Mumbai → Virginia, no CDN.");
          await k.sleep(800);
          await direct("M");
          await k.sleep(500);
          k.say("And again: the full trip, every time.");
          await direct("M");
          await k.sleep(800);

          // 2 · pull CDN
          await k.step();
          k.say("Edges appear near users.");
          for (const e of Object.values(edges)) {
            map.append(k.s("line", { x1: e.pos.x, y1: e.pos.y, x2: e.user.x, y2: e.user.y, stroke: "line", "stroke-width": 1.5, "stroke-dasharray": "4 4" }));
            await Promise.all([k.tween(e.box, { opacity: 1 }, 500), k.tween(e.chip, { opacity: 1 }, 500)]);
          }
          await k.sleep(800);
          k.say("First Mumbai request: <b>miss</b>, fetch once, keep a copy.");
          await viaEdge("M", "phone.jpg");
          await k.sleep(800);

          // 3 · edge hits
          await k.step();
          k.say("Mumbai again: <b>hit</b>.");
          await viaEdge("M", "phone.jpg");
          await viaEdge("M", "phone.jpg");
          await k.sleep(800);

          // 4 · each edge fills on its own
          await k.step();
          k.say("Frankfurt’s edge starts empty.");
          await viaEdge("F", "phone.jpg");
          await viaEdge("F", "phone.jpg");
          await k.sleep(800);

          // 5 · same-name deploy
          await k.step();
          files["phone.jpg"] = "v2";
          origin.sub.textContent = "phone.jpg = v2";
          k.say("Deploy v2 as <code>phone.jpg</code>…");
          k.tone(origin, "warn"); await k.pulse(origin); k.tone(origin, "neutral");
          await k.sleep(1000);
          await viaEdge("M", "phone.jpg");
          k.say("Mumbai’s edge serves the <b>old v1</b>.");
          await k.sleep(1500);

          // 6 · purge
          await k.step();
          k.tone(mUser, "neutral");
          k.say("Purge sent. Frankfurt gets it first…");
          const purgeF = k.packet(svg, O, FE, { r: 7, tone: "lesson", label: "✕", size: 10, ms: 700 }).then(() => { delete edges.F.cache["phone.jpg"]; edges.F.chip.textContent = "cache: empty"; });
          // the slow purge only lands after Mumbai's request, even when fast-forwarding
          const purgeM = k.packet(svg, O, ME, { r: 7, tone: "lesson", label: "✕", size: 10, ms: 7800 }).catch(() => {});
          await purgeF;
          await viaEdge("F", "phone.jpg");
          await viaEdge("M", "phone.jpg");
          k.say("Frankfurt sees <b>v2</b>, Mumbai still <b>v1</b>.");
          await purgeM;
          delete edges.M.cache["phone.jpg"]; edges.M.chip.textContent = "cache: empty";
          k.tone(mUser, "neutral");
          await k.sleep(800);

          // 7 · versioned names
          await k.step();
          const v = "phone.9f3c.jpg";
          files[v] = "v2";
          origin.sub.textContent = "phone.9f3c.jpg = v2";
          k.say("New name: <code>phone.9f3c.jpg</code>.");
          await k.pulse(origin);
          await k.sleep(1000);
          k.say("A new URL misses on every edge.");
          await viaEdge("M", v);
          await viaEdge("F", v);
          await k.sleep(600);

          // 8 · cache for a year
          await k.step();
          k.say("<code>max-age=31536000, immutable</code>: hits from now on.");
          await viaEdge("M", v);
          await viaEdge("F", v);
          await viaEdge("M", v);
          await k.sleep(1500);
          k.done();
        });
      }
    },

    play: {
      title: "Edge Placer",
      goal: "Phase 1: you can afford <b>3 CDN edges</b>. Click cities to place them so the most users get the lowest latency (circle size = users). Phase 2: pick the right cache header for three files.",
      build(stage, k) {
        const svg = k.svg(760, 330, { label: "World map with user cities, your origin in Virginia, and the CDN edges you place" });
        stage.append(svg);
        const ORIGIN = { x: 160, y: 172 };
        const CITIES = [
          { name: "New York", x: 215, y: 96, users: 9 },
          { name: "São Paulo", x: 250, y: 258, users: 7 },
          { name: "London", x: 360, y: 92, users: 9 },
          { name: "Lagos", x: 372, y: 212, users: 5 },
          { name: "Mumbai", x: 520, y: 165, users: 12 },
          { name: "Singapore", x: 592, y: 222, users: 8 },
          { name: "Tokyo", x: 676, y: 112, users: 10 },
          { name: "Sydney", x: 680, y: 290, users: 6 }
        ];
        const MAX_EDGES = 3, PLACE_TIME = 40;
        const originMs = d => Math.round(20 + d * 0.55), edgeMs = d => Math.round(12 + d * 0.55);
        const totalUsers = CITIES.reduce((a, c) => a + c.users, 0);

        function serve(set) {   // nearest server per city, with latency
          return CITIES.map(c => {
            let bestMs = originMs(dist(c, ORIGIN)), via = ORIGIN;
            for (const e of set) { const ms = edgeMs(dist(c, CITIES[e])); if (ms < bestMs) { bestMs = ms; via = CITIES[e]; } }
            return { ms: bestMs, via };
          });
        }
        const avgOf = set => serve(set).reduce((a, s, i) => a + s.ms * CITIES[i].users, 0) / totalUsers;
        let optimum = Infinity;
        for (let a = 0; a < CITIES.length; a++) for (let b = a + 1; b < CITIES.length; b++) for (let c = b + 1; c < CITIES.length; c++) optimum = Math.min(optimum, avgOf([a, b, c]));
        const noCdn = avgOf([]);

        let phase = 1, left = PLACE_TIME, placeScore = 0, correct = 0, over = false;
        const placed = new Set();

        const scene = k.s("g"); svg.append(scene);
        drawContinents(k, scene);
        const linksG = k.s("g"); scene.append(linksG);
        k.box(scene, { ...ORIGIN, label: "Origin", sub: "Virginia", icon: "🏢", w: 96, h: 40, size: 12.5, tone: "solid" });
        const cityG = CITIES.map((c, i) => {
          const g = k.s("g", { class: "lab-city" });
          const r = 8 + c.users;
          const ring = k.s("circle", { cx: c.x, cy: c.y, r: r + 7, fill: "none", stroke: "accent", "stroke-width": 3, opacity: 0 });
          const dot = k.s("circle", { cx: c.x, cy: c.y, r, fill: "accentSoft", stroke: "line", "stroke-width": 1.5 });
          const ms = k.text(g, c.x, c.y + 4, "", { size: 11, weight: 700 });
          g.append(ring, dot, ms);   // re-append text so it sits on top
          const name = k.text(g, c.x, c.y + r + 15, `${c.name} · ${c.users}M`, { size: 11, tone: "muted" });
          const tag = k.text(g, c.x, c.y - r - 11, "", { size: 11, weight: 800, tone: "accent" });
          scene.append(g);
          clickable(g, `${c.name}, ${c.users} million users: toggle a CDN edge`, () => toggle(i));
          return { g, ring, dot, ms, name, tag };
        });

        function redraw() {
          const s = serve([...placed]);
          linksG.replaceChildren();
          CITIES.forEach((c, i) => {
            const v = cityG[i], sv = s[i];
            const tone = sv.ms < 60 ? "good" : sv.ms < 130 ? "warn" : "bad";
            v.dot.style.fill = k.colors[tone + "Soft"]; v.dot.style.stroke = k.colors[tone];
            v.ms.textContent = `${sv.ms}`;
            v.ring.setAttribute("opacity", placed.has(i) ? 1 : 0);
            v.tag.textContent = placed.has(i) ? "📡 EDGE" : "";
            if (sv.via !== c) linksG.append(k.s("line", { x1: c.x, y1: c.y, x2: sv.via.x, y2: sv.via.y, stroke: tone, "stroke-width": 1.5, "stroke-dasharray": "4 4", opacity: 0.8 }));
            v.g.setAttribute("aria-label", `${c.name}, ${c.users} million users, ${sv.ms} ms${placed.has(i) ? ", has an edge" : ""}: toggle a CDN edge`);
          });
          hud();
        }
        function hud() {
          if (phase === 1) k.hud({ Phase: "1 · place edges", Edges: `${placed.size} / ${MAX_EDGES}`, Time: `${Math.max(0, Math.ceil(left))}s` });
          else k.hud({ Phase: "2 · cache headers", Placement: `${placeScore}/100`, Headers: `${correct} / 3` });
        }
        function toggle(i) {
          if (phase !== 1 || over) return;
          if (placed.has(i)) placed.delete(i);
          else if (placed.size >= MAX_EDGES) { k.toast("Only 3 edges in the budget. Click one to remove it.", "warn"); return; }
          else placed.add(i);
          redraw();
          k.say(placed.size < MAX_EDGES ? `Numbers are each city’s latency in ms. ${MAX_EDGES - placed.size} edge${MAX_EDGES - placed.size === 1 ? "" : "s"} left.`
            : "All 3 placed. Move them if you like, then <b>Go live</b>. Big circles matter more.");
        }

        const goBtn = k.button("Go live ▸", () => k.run(goLive), { primary: true });
        k.loop(dt => {
          if (phase !== 1 || over) return false;
          left -= dt; hud();
          if (left <= 0) { k.run(goLive); return false; }
        });

        async function goLive() {
          if (phase !== 1) return;
          phase = 1.5;
          goBtn.disabled = true;
          const s = serve([...placed]);
          k.say("Live traffic: every city fetches from its nearest server.");
          await Promise.all(CITIES.flatMap((c, i) => Array.from({ length: Math.ceil(c.users / 3) }, (_, n) =>
            k.sleep(n * 220 + i * 40).then(() => k.packet(scene, c, s[i].via, { r: 5, tone: s[i].via === ORIGIN ? "bad" : "good", ms: Math.max(250, dist(c, s[i].via) * 2.2) })))));
          const avg = avgOf([...placed]);
          placeScore = Math.min(100, Math.round(100 * optimum / avg));
          k.toast(`Average latency ${Math.round(avg)} ms · best possible ${Math.round(optimum)} ms · no CDN ${Math.round(noCdn)} ms`, placeScore >= 90 ? "good" : "warn", 3200);
          k.say(`Your edges: <b>${Math.round(avg)} ms</b> average per user (no CDN: ${Math.round(noCdn)} ms, best possible: ${Math.round(optimum)} ms). Placement score <b>${placeScore}/100</b>.`);
          phase = 2; hud();
          await k.sleep(3200);
          headers();
        }

        // ---------------- phase 2: cache headers ----------------
        const OPTS = [
          { id: "year", label: "public, max-age=1 year, immutable" },
          { id: "revalidate", label: "no-cache (revalidate each time)" },
          { id: "private", label: "private, no-store" }
        ];
        const ASSETS = [
          { file: "app.3f9a.js", what: "your JS bundle; the hash in the name changes on every deploy", right: "year",
            why: {
              year: "The name changes whenever the content does, so a year-long cache can never be stale. Edges serve it in ~15 ms.",
              revalidate: "Safe, but every request waits for a round trip to the origin just to hear “304 not modified”. The hash already guarantees freshness.",
              private: "The CDN never stores it, so every user downloads it from the origin: no CDN benefit at all." } },
          { file: "index.html", what: "the page; it links to the hashed files and must update on deploy", right: "revalidate",
            why: {
              year: "Cached for a year: after you deploy, users keep getting the old page (and the old bundle it links to) for months.",
              revalidate: "Edges keep a copy but check with the origin each time: cheap 304s, and a deploy shows up immediately.",
              private: "It works, but every user pays the full trip to the origin. no-cache gives you cheap 304s instead." } },
          { file: "/api/cart", what: "a JSON response that is different for every signed-in user", right: "private",
            why: {
              year: "A shared cache now holds Asha’s cart, and Ben gets it too. Per-user data must never be stored by a CDN.",
              revalidate: "no-cache still lets the CDN store a shared copy. For per-user data you want private, no-store.",
              private: "Each user’s cart comes straight from the origin and is never stored at the edge. Correct for personal data." } }
        ];

        function headers() {
          scene.replaceChildren();
          k.clearTools();
          const A1 = { x: 80, y: 105 }, A2 = { x: 80, y: 235 }, E = { x: 360, y: 170 }, O = { x: 630, y: 170 };
          [A1, A2].forEach(a => k.line(scene, a, E, { dashed: true }));
          k.line(scene, E, O, { dashed: true });
          k.box(scene, { ...A1, label: "Asha", icon: "👩", w: 110, h: 40 });
          k.box(scene, { ...A2, label: "Ben", icon: "👨", w: 110, h: 40 });
          const edge = k.box(scene, { ...E, label: "CDN edge", sub: "cache: empty", icon: "📡", w: 210, h: 50, tone: "accent", size: 13.5 });
          const origin = k.box(scene, { ...O, label: "Origin", sub: "Virginia", icon: "🏢", w: 160, h: 50, size: 13.5 });
          const title = k.text(scene, 380, 30, "", { size: 15, weight: 700, mono: true });
          const what = k.text(scene, 380, 52, "", { size: 12, tone: "muted" });
          const verdict = k.text(scene, 380, 312, "", { size: 14, weight: 700 });
          let n = 0;

          async function trip(user, toOrigin, payload, tone) {
            await k.packet(scene, user, E, { r: 9, ms: 420 });
            if (toOrigin) {
              k.tone(origin, "warn");
              await k.packet(scene, E, O, { r: 9, ms: 520 });
              await k.packet(scene, O, E, { r: 9, ms: 520, tone: "warn" });
              k.tone(origin, "neutral");
            } else {
              k.tone(edge, "good"); k.float(scene, E.x, E.y - 34, "HIT", "good");
              await k.sleep(250); k.tone(edge, "accent");
            }
            await k.packet(scene, E, user, { r: 9, ms: 420, tone });
            k.float(scene, user.x + 100, user.y - 8, payload, tone);
            await k.sleep(400);
          }

          async function outcome(a, opt) {
            const f = a.file;
            if (a.right === "year") {          // the hashed bundle
              if (opt === "year") { await trip(A1, true, "235 ms", "warn"); edge.sub.textContent = `cache: ${f} (1 year)`; await trip(A2, false, "15 ms", "good"); await trip(A1, false, "15 ms", "good"); }
              else if (opt === "revalidate") { edge.sub.textContent = `cache: ${f} (must check)`; await trip(A1, true, "304 · 220 ms", "warn"); await trip(A2, true, "304 · 220 ms", "warn"); }
              else { await trip(A1, true, "220 ms", "bad"); await trip(A2, true, "220 ms", "bad"); await trip(A1, true, "220 ms", "bad"); }
            } else if (a.right === "revalidate") {   // index.html
              origin.sub.textContent = "deploy: index v2";
              if (opt === "year") { edge.sub.textContent = "cache: index v1 (1 year)"; await trip(A1, false, "old v1!", "bad"); await trip(A2, false, "old v1!", "bad"); }
              else if (opt === "revalidate") { edge.sub.textContent = "cache: index v1 (must check)"; await trip(A1, true, "200 · v2", "good"); edge.sub.textContent = "cache: index v2 (must check)"; await trip(A2, true, "304 · v2", "good"); }
              else { await trip(A1, true, "v2 · 220 ms", "warn"); await trip(A2, true, "v2 · 220 ms", "warn"); }
            } else {                          // /api/cart
              if (opt === "year") { await trip(A1, true, "Asha’s cart", "good"); edge.sub.textContent = "cache: Asha’s cart!"; await trip(A2, false, "Asha’s cart!", "bad"); }
              else if (opt === "revalidate") { await trip(A1, true, "Asha’s cart", "good"); edge.sub.textContent = "cache: Asha’s cart (shared)"; await trip(A2, true, "Ben’s cart", "warn"); }
              else { await trip(A1, true, "Asha’s cart", "good"); await trip(A2, true, "Ben’s cart", "good"); }
            }
          }

          function ask() {
            const a = ASSETS[n];
            title.textContent = a.file;
            what.textContent = a.what;
            verdict.textContent = "";
            edge.sub.textContent = "cache: empty"; origin.sub.textContent = "Virginia";
            k.clearTools();
            k.say(`File ${n + 1} of 3: which <code>Cache-Control</code> header should <b>${a.file}</b> get?`);
            let done = false;
            k.choices(OPTS, (o, btn) => k.run(async () => {
              if (done) return;
              done = true;
              const ok = o.id === a.right;
              if (ok) correct++;
              btn.classList.add(ok ? "right" : "wrong");
              btn.parentElement.querySelectorAll("button").forEach(b => { b.disabled = true; });
              if (!ok) [...btn.parentElement.querySelectorAll("button")][OPTS.findIndex(x => x.id === a.right)].classList.add("right");
              hud();
              await outcome(a, o.id);
              verdict.textContent = ok ? "✓ Right header" : "✗ Not this one";
              verdict.style.fill = ok ? k.colors.good : k.colors.bad;
              k.say(`${ok ? "<b>Right.</b> " : "<b>Not quite.</b> "}${a.why[o.id]}`);
              k.button(n < 2 ? "Next file ▸" : "See my score", () => { n++; if (n < 3) ask(); else end(); }, { primary: true });
            }));
          }
          ask();
        }

        function end() {
          if (over) return;
          over = true;
          const total = Math.round(placeScore * 0.55) + correct * 15;
          const text = `Placement <b>${placeScore}/100</b> and <b>${correct}/3</b> headers right (total ${total}/100). ` +
            "Edges belong where the most users are far from the origin; hashed files get a year, HTML revalidates, and personal data never sits in a shared cache.";
          if (total < 45) k.lose(text);
          else k.win({ stars: k.starsFor(total, 72, 90), text });
        }

        redraw();
        k.say("Each number is that city’s latency in ms to its nearest server. Right now everyone goes to <b>Virginia</b>.");
      }
    }
  });
})();
