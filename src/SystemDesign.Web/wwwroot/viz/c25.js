"use strict";
/* Concept 25 · Case study: URL shortener. Watch: range-allocated IDs encoded in base62, the redirect read path through
   a cache, async click counting, and 301 vs 302. Play: Launch Day (size and configure three shorteners). */
(function () {
  const ALPHA = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  function base62Steps(n) {
    const out = [];
    while (n > 0) { const q = Math.floor(n / 62), r = n % 62; out.push({ n, q, r, ch: ALPHA[r] }); n = q; }
    return out;
  }
  const base62 = n => base62Steps(n).map(s => s.ch).reverse().join("") || "0";
  const big = n => n >= 1e12 ? `${(n / 1e12).toFixed(1)} trillion` : n >= 1e9 ? `${(n / 1e9).toFixed(1)} billion` :
    n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e8 ? 0 : 1)} million` : Number(n).toLocaleString("en-US");

  Lab.define(25, {
    watch: {
      title: "The link that lost its clicks",
      intro: "How a short code is made, how a click is served from cache, and why the redirect status code matters.",
      steps: [
        { label: "Unique IDs", tag: "problem", title: "Two servers, no duplicate codes",
          body: "<p>A shortener has two jobs: <code>POST /links</code> creates a code, <code>GET /{code}</code> redirects. About <b>40 writes/s</b> but <b>4,000 redirects/s</b>: very read-heavy.</p><p>Every link needs a unique number, and many servers create links at once. The <b>allocator</b> hands each server a <b>block of 1,000 IDs</b>.</p>",
          idea: "Range allocation means one coordination per 1,000 links, not one per request.",
          changed: ["api-1 and api-2 each hold a block of 1,000 IDs"] },
        { label: "Base62", tag: "technique", title: "Encode the ID in base62",
          body: "<p>api-1 takes the next ID, <b>100,000,000</b>, and encodes it in <b>base62</b> (0–9, a–z, A–Z): divide by 62 again and again, each remainder is one character.</p><p>The result is <code>6LAze</code>, saved as <code>6LAze → long URL</code>.</p>",
          idea: "Base62 turns a big number into a short, URL-safe code with no collisions to check.",
          changed: ["5 division steps shown", "Links DB gets its first row"] },
        { label: "No collision", tag: "concept", title: "Blocks never overlap",
          body: "<p>api-2 serves another user from its own block: ID 100,001,000. No lock, no shared counter per request.</p><p>Seven base62 characters give 62⁷ ≈ <b>3.5 trillion</b> codes. Alternatives: hash the URL (then check collisions) or Snowflake-style IDs.</p>",
          idea: "Spend your deep dive on ID generation: it decides code length and write scalability.",
          changed: ["Second link created on api-2", "Links created: 2"] },
        { label: "Cache miss", tag: "technique", title: "The read path: cache first",
          body: "<p>Someone clicks <code>sho.rt/6LAze</code>. The shortener checks <b>Redis</b> first. It's a <b>miss</b>, so it reads the database once and stores the mapping (cache-aside).</p><p>The browser follows the <b>302</b> to the real page.</p>",
          idea: "Redirects are 99% reads of a small hot set: cache them.",
          changed: ["Cache MISS, 1 DB read", "Mapping now in Redis"] },
        { label: "Hot links", tag: "technique", title: "Hits, and clicks counted async",
          body: "<p>The next clicks are cache <b>hits</b>. Popular links are a small hot set, so the hit rate is very high: the C# demo needs only a handful of DB reads for <b>10,000 redirects</b>.</p><p>Each click is published to a <b>click queue</b> and counted later, never written as a DB row inside the redirect.</p>",
          idea: "Keep the redirect path read-only and fast; push analytics off to a queue.",
          changed: ["2 cache hits, 0 new DB reads", "Clicks counted: 3"] },
        { label: "301", tag: "trade-off", title: "What if we answer 301?",
          body: "<p><b>301 Moved Permanently</b> tells the browser the link will never change, so the browser <b>caches</b> the redirect.</p><p>That sheds load from the shortener…</p>",
          idea: "301 = browser caches it forever. 302 = ask us every time.",
          changed: ["Shortener now answers 301", "Browser cache holds the mapping"] },
        { label: "Lost clicks", tag: "failure", title: "The browser skips us",
          body: "<p>…but from now on the browser goes straight to example.com. Three more clicks, and the counter <b>doesn't move</b>.</p><p>You lose click analytics, and you can never change where the link points for that user.</p>",
          idea: "301 trades analytics and editability for less load.",
          changed: ["3 clicks not counted", "Clicks total pulls ahead of clicks counted"] },
        { label: "Use 302", tag: "result", title: "302 when clicks matter",
          body: "<p>Answer <b>302 Found</b> whenever analytics or editable links matter, which is usually. Every click reaches you and is counted.</p><p>Read path: CDN/edge → Redis → DB. The write path is tiny (~40/s).</p>",
          idea: "Strong answer: range-allocated IDs in base62, cache-aside reads, async click counting, 302 redirects.",
          changed: ["Back to 302", "New browsers' clicks counted again"] }
      ],
      learn: [
        { text: "Unique IDs with range allocation", step: 0 },
        { text: "Base62 encoding of an ID", step: 1 },
        { text: "Serving redirects from a cache", step: 3 },
        { text: "Counting clicks asynchronously", step: 4 },
        { text: "Why 302 beats 301 for analytics", step: 6 }
      ],
      build(stage, k) {
        const svg = k.svg(760, 340, { label: "ID allocation and base62 encoding, then the redirect path through cache, database and click queue" });
        stage.append(svg);
        let created = 0, hits = 0, dbReads = 0, clicksCounted = 0, clicksTotal = 0;
        const metrics = () => k.hud({ "Links created": created, "Cache hits": hits, "DB reads": dbReads, "Clicks counted": clicksCounted, "Clicks total": clicksTotal });
        metrics();

        k.run(async () => {
          /* ---------------- step 1: unique IDs ---------------- */
          await k.step();
          const g = k.s("g"); svg.append(g);
          const P = { client: { x: 80, y: 70 }, api1: { x: 290, y: 70 }, api2: { x: 290, y: 165 }, alloc: { x: 90, y: 250 }, db: { x: 540, y: 70 } };
          k.line(g, P.client, P.api1, { dashed: true });
          k.line(g, P.client, P.api2, { dashed: true });
          k.line(g, P.alloc, P.api1, { dashed: true });
          k.line(g, P.alloc, P.api2, { dashed: true });
          k.line(g, P.api1, P.db, { dashed: true });
          k.line(g, P.api2, P.db, { dashed: true });
          const client = k.box(g, { ...P.client, label: "Client", icon: "📱", w: 110 });
          const api1 = k.box(g, { ...P.api1, label: "api-1", icon: "🖥️", w: 110 });
          const api2 = k.box(g, { ...P.api2, label: "api-2", icon: "🖥️", w: 110 });
          const alloc = k.box(g, { ...P.alloc, label: "ID allocator", icon: "🔢", sub: "blocks of 1,000", w: 160, h: 50 });
          const db = k.box(g, { ...P.db, label: "Links DB", icon: "🗄️", w: 130 });
          const blk1 = k.text(g, 290, 106, "", { size: 11, mono: true, tone: "muted" });
          const blk2 = k.text(g, 290, 201, "", { size: 11, mono: true, tone: "muted" });
          const dbRows = k.text(g, 540, 106, "", { size: 11, mono: true });
          const dbRows2 = k.text(g, 540, 122, "", { size: 11, mono: true });
          const reply = k.text(g, 80, 106, "", { size: 12, mono: true, weight: 700, tone: "good" });

          const panel = k.s("g"); g.append(panel);
          panel.append(k.s("rect", { x: 405, y: 140, width: 345, height: 190, rx: 12, fill: "surface2", stroke: "line", "stroke-width": 1.5 }));
          const pTitle = k.text(panel, 578, 162, "", { size: 13, weight: 700 });
          const pLines = [0, 1, 2, 3, 4].map(i => k.text(panel, 420, 188 + i * 22, "", { anchor: "start", size: 12, mono: true }));
          const pResult = k.text(panel, 578, 316, "", { size: 13.5, weight: 800, tone: "good" });
          panel.setAttribute("opacity", 0);

          k.say("The allocator hands each server a <b>block of 1,000 IDs</b>.");
          await k.sleep(1500);
          k.tone(alloc, "accent");
          await k.packet(g, P.alloc, P.api1, { label: "blk", r: 13, size: 9, ms: 700 });
          blk1.textContent = "IDs 100,000,000 – 100,000,999";
          await k.packet(g, P.alloc, P.api2, { label: "blk", r: 13, size: 9, ms: 700 });
          blk2.textContent = "IDs 100,001,000 – 100,001,999";
          k.tone(alloc, "neutral");
          k.say("Each server now creates IDs on its own.");
          await k.sleep(1200);

          /* ---------------- step 2: base62 ---------------- */
          await k.step();
          k.say("Shorten <b>example.com/sale/diwali</b>: api-1 takes ID <b>100,000,000</b>.");
          await k.packet(g, P.client, P.api1, { label: "URL", r: 13, size: 9, ms: 700 });
          k.tone(api1, "accent");
          await k.sleep(1000);
          const id1 = 100000000, st = base62Steps(id1), code1 = base62(id1);
          pTitle.textContent = `base62(${k.fmt(id1)})`;
          await k.tween(panel, { opacity: 1 }, 400);
          k.say("Divide by 62; each remainder is one character.");
          for (let i = 0; i < st.length; i++) {
            const s = st[i];
            pLines[i].textContent = `${k.fmt(s.n)} ÷ 62 = ${k.fmt(s.q)}  r ${s.r} → ${s.ch}`;
            pLines[i].style.whiteSpace = "pre";
            await k.sleep(950);
          }
          pResult.textContent = `remainders read bottom-up → ${code1}`;
          await k.sleep(1000);
          k.say(`Save <b>${code1} → long URL</b>, return the short link.`);
          await k.packet(g, P.api1, P.db, { r: 9, ms: 600 });
          dbRows.textContent = `${code1} → example.com/sale/diwali`;
          k.tone(db, "good");
          created = 1; metrics();
          await k.packet(g, P.api1, P.client, { label: "🔗", r: 13, ms: 600, tone: "good" });
          reply.textContent = `sho.rt/${code1}`;
          k.tone(api1, "neutral");
          await k.sleep(1000);

          /* ---------------- step 3: no collision ---------------- */
          await k.step();
          const id2 = 100001000, code2 = base62(id2);
          k.say(`api-2 uses its own block: 100,001,000 → <b>${code2}</b>.`);
          k.tone(api2, "accent");
          await k.packet(g, P.client, P.api2, { label: "URL", r: 13, size: 9, ms: 600 });
          pTitle.textContent = `base62(${k.fmt(id2)})`;
          base62Steps(id2).forEach((s, i) => { pLines[i].textContent = `${k.fmt(s.n)} ÷ 62 = ${k.fmt(s.q)}  r ${s.r} → ${s.ch}`; });
          pResult.textContent = `→ ${code2}`;
          await k.packet(g, P.api2, P.db, { r: 9, ms: 600 });
          dbRows2.textContent = `${code2} → example.com/blog/…`;
          created = 2; metrics();
          k.tone(api2, "neutral");
          k.say("No lock, no shared counter, no collision.");
          await k.sleep(1600);

          /* ---------------- step 4: cache miss ---------------- */
          await k.step();
          await k.tween(g, { opacity: 0 }, 600);
          g.remove();
          const r = k.s("g"); svg.append(r);
          const Q = { browser: { x: 70, y: 175 }, api: { x: 255, y: 175 }, cache: { x: 455, y: 95 }, db: { x: 455, y: 265 }, dest: { x: 665, y: 95 }, queue: { x: 665, y: 265 } };
          k.line(r, Q.browser, Q.api, { dashed: true });
          k.line(r, Q.api, Q.cache, { dashed: true });
          k.line(r, Q.api, Q.db, { dashed: true });
          k.line(r, Q.api, Q.queue, { dashed: true });
          const sky = [{ x: 70, y: 150 }, { x: 70, y: 28 }, { x: 665, y: 28 }, { x: 665, y: 72 }];
          const skyLine = k.s("polyline", { points: sky.map(p => `${p.x},${p.y}`).join(" "), fill: "none", stroke: "line", "stroke-width": 2, "stroke-dasharray": "5 5" });
          r.prepend(skyLine);
          const browser = k.box(r, { ...Q.browser, label: "Browser", icon: "🌐", w: 110 });
          const api = k.box(r, { ...Q.api, label: "Shortener", sub: `GET /${code1}`, w: 130, h: 52 });
          const cache = k.box(r, { ...Q.cache, label: "Redis cache", icon: "⚡", sub: "empty", w: 150, h: 52 });
          const ldb = k.box(r, { ...Q.db, label: "Links DB", icon: "🗄️", w: 140 });
          const dest = k.box(r, { ...Q.dest, label: "example.com", icon: "🛍️", w: 140 });
          const queue = k.box(r, { ...Q.queue, label: "Click queue", icon: "📨", sub: "counted async", w: 150, h: 52 });
          const mode = k.text(r, 255, 120, "answers 302 Found", { size: 12.5, weight: 800, tone: "accent" });
          const clicks = k.text(r, 665, 314, "clicks counted: 0", { size: 12.5, weight: 700 });
          const bcache = k.text(r, 12, 222, "", { anchor: "start", size: 11, mono: true, tone: "warn" });
          let counted = 0;

          async function click({ status = 302, viaCache = true, slow = false } = {}) {
            clicksTotal++; metrics();
            k.tone(browser, "accent");
            await k.packet(r, Q.browser, Q.api, { label: code1.slice(0, 3), r: 12, size: 9, ms: slow ? 700 : 450 });
            k.tone(api, "accent");
            await k.packet(r, Q.api, Q.cache, { r: 9, ms: slow ? 500 : 300 });
            if (!viaCache) {
              k.tone(cache, "bad"); k.float(r, Q.cache.x, Q.cache.y - 36, "MISS", "bad");
              await k.sleep(slow ? 600 : 200);
              k.tone(ldb, "warn");
              dbReads++; metrics();
              await k.packet(r, Q.api, Q.db, { r: 9, ms: 500 });
              await k.sleep(400);
              await k.packet(r, Q.db, Q.api, { r: 9, ms: 500, tone: "warn" });
              k.tone(ldb, "neutral");
              await k.packet(r, Q.api, Q.cache, { r: 9, ms: 300, tone: "warn" });
              cache.sub.textContent = `${code1} → example.com/…`;
            } else {
              k.tone(cache, "good"); k.float(r, Q.cache.x, Q.cache.y - 36, "HIT", "good");
              hits++; metrics();
              await k.packet(r, Q.cache, Q.api, { r: 9, ms: 250, tone: "good" });
            }
            k.tone(cache, "neutral");
            k.packet(r, Q.api, Q.queue, { r: 7, ms: 500, tone: "lesson" }).then(() => {
              counted++; clicks.textContent = `clicks counted: ${counted}`; k.pulse(queue).catch(() => {});
              clicksCounted = counted; metrics();
            }, () => {});
            await k.packet(r, Q.api, Q.browser, { label: String(status), r: 13, size: 9, ms: slow ? 600 : 400, tone: "good" });
            k.tone(api, "neutral");
            await followToDest(slow ? 1100 : 800);
            k.tone(browser, "neutral");
          }
          async function followToDest(ms) {
            const d = k.dot(r, sky[0].x, sky[0].y, { r: 8, tone: "accent" });
            try { await k.travel(d, sky, ms); } finally { d.remove(); }
            k.tone(dest, "good"); await k.sleep(250); k.tone(dest, "neutral");
          }

          k.say(`A click on <b>sho.rt/${code1}</b>: cache first.`);
          await k.sleep(1200);
          await click({ viaCache: false, slow: true });
          k.say("Miss → one DB read, mapping cached, browser follows the <b>302</b>.");
          await k.sleep(1400);

          /* ---------------- step 5: hot links, async counting ---------------- */
          await k.step();
          k.say("Watch the small dot to the <b>click queue</b> on each click.");
          await k.sleep(1000);
          await click({ slow: false });
          await click({ slow: false });
          k.say("Two cache hits, no new DB reads.");
          await k.sleep(1200);

          /* ---------------- step 6: 301 ---------------- */
          await k.step();
          mode.textContent = "answers 301 Moved Permanently"; mode.style.fill = k.colors.warn;
          k.say("The shortener switches to <b>301</b>…");
          await k.sleep(1500);
          await click({ status: 301 });
          bcache.textContent = `cached: ${code1} → example.com`;
          k.say("The browser <b>caches</b> the 301 redirect.");
          await k.sleep(1400);

          /* ---------------- step 7: lost clicks ---------------- */
          await k.step();
          k.say("Three more clicks go straight to example.com…");
          await k.sleep(800);
          const before = counted;
          for (let i = 0; i < 3; i++) {
            k.tone(browser, "accent");
            clicksTotal++; metrics();
            await followToDest(750);
            k.float(r, 665, 240, "not counted", "warn");
            k.tone(browser, "neutral");
          }
          k.say(`…and the counter is still <b>${before}</b>.`);
          await k.sleep(1400);

          /* ---------------- step 8: back to 302 ---------------- */
          await k.step();
          mode.textContent = "answers 302 Found"; mode.style.fill = k.colors.accent;
          k.say("Back to <b>302</b>: a new visitor's click reaches us again.");
          await k.sleep(1200);
          bcache.textContent = "";
          await click({ slow: false });
          await k.sleep(800);
          k.say(`Counted: <b>${counted}</b>. Every 302 click is counted.`);
          await k.sleep(1200);
          k.done();
        });
      }
    },

    play: {
      title: "Launch Day",
      goal: "Configure three shorteners. For each, pick the <b>shortest code length</b> that won't run out, the right <b>redirect</b>, and the <b>smallest cache</b> that keeps the database under its limit within the RAM budget. Then launch.",
      build(stage, k) {
        const svg = k.svg(760, 340, { label: "A scenario card and a simulated shortener with meters for code space, database load and cache memory" });
        stage.append(svg);
        const SCEN = [
          { name: "Hobby blog links", icon: "📝", perMonth: 1e6, years: 2, needs: "just redirects (no stats)", count: false,
            peak: 500, dbCap: 1000, ram: 64,
            cache: [["none", 0, 0], ["hot 1%", .80, 0.1], ["hot 5%", .93, 0.6], ["hot 20%", .98, 2.4]] },
          { name: "Marketing platform", icon: "📈", perMonth: 100e6, years: 5, needs: "click analytics (customers pay)", count: true, loses: "the click counts",
            peak: 12000, dbCap: 1000, ram: 256,
            cache: [["none", 0, 0], ["hot 1%", .80, 30], ["hot 5%", .93, 150], ["hot 20%", .98, 600]] },
          { name: "QR codes on parcels", icon: "📦", perMonth: 500e6, years: 10, needs: "targets editable after printing", count: true, loses: "the ability to change targets",
            peak: 40000, dbCap: 2000, ram: 2000,
            cache: [["none", 0, 0], ["hot 1%", .90, 300], ["hot 5%", .97, 1500], ["hot 20%", .99, 6000]] }
        ];
        const gb = v => v >= 1000 ? `${v / 1000} TB` : `${v} GB`;
        let si = 0, total = 0;
        let choice = { len: 6, r302: 1, cache: 0 }, controls = [];
        const hud = () => k.hud({ Scenario: `${Math.min(si + 1, SCEN.length)} / ${SCEN.length}`, Score: total });

        // scenario card
        const cardG = k.s("g"); svg.append(cardG);
        // system
        const sys = k.s("g"); svg.append(sys);
        const Q = { browser: { x: 375, y: 52 }, api: { x: 505, y: 52 }, cache: { x: 650, y: 52 }, db: { x: 650, y: 138 } };
        k.line(sys, Q.browser, Q.api, { dashed: true });
        k.line(sys, Q.api, Q.cache, { dashed: true });
        k.line(sys, Q.api, Q.db, { dashed: true });
        k.box(sys, { ...Q.browser, label: "Browsers", icon: "🌐", w: 108, h: 40, size: 12 });
        const apiB = k.box(sys, { ...Q.api, label: "Shortener", w: 104, h: 40, size: 12 });
        const cacheB = k.box(sys, { ...Q.cache, label: "Cache", icon: "⚡", w: 104, h: 40, size: 12 });
        const dbB = k.box(sys, { ...Q.db, label: "DB", icon: "🗄️", w: 104, h: 40, size: 12 });
        const design = k.text(sys, 470, 132, "", { size: 12.5, weight: 700, mono: true });
        const yearsT = k.text(sys, 470, 154, "", { size: 12, tone: "muted" });
        const mCodes = k.meter(sys, { x: 335, y: 196, w: 280, max: 1, label: "code space used" });
        const mDb = k.meter(sys, { x: 335, y: 240, w: 280, max: 1, label: "DB load (bar end = 2× limit)" });
        const mRam = k.meter(sys, { x: 335, y: 284, w: 280, max: 1, label: "cache RAM (bar end = 2× budget)" });
        const vCodes = k.text(sys, 745, 206, "", { anchor: "end", size: 12, weight: 700 });
        const vDb = k.text(sys, 745, 250, "", { anchor: "end", size: 12, weight: 700 });
        const vRam = k.text(sys, 745, 294, "", { anchor: "end", size: 12, weight: 700 });
        const vClicks = k.text(sys, 540, 326, "", { size: 12, weight: 700 });
        for (const t of [vCodes, vDb, vRam]) t.style.whiteSpace = "pre";
        // the limit ticks at the middle of the DB and RAM meters
        for (const y of [240, 284]) sys.append(k.s("line", { x1: 475, y1: y - 4, x2: 475, y2: y + 14, stroke: "ink", "stroke-width": 2 }));

        function drawCard(s) {
          cardG.replaceChildren();
          cardG.append(k.s("rect", { x: 10, y: 12, width: 300, height: 318, rx: 12, fill: "surface2", stroke: "line", "stroke-width": 1.5 }));
          k.text(cardG, 160, 38, `${s.icon} ${s.name}`, { size: 15, weight: 800 });
          const rows = [["New links", `${big(s.perMonth)} / month`], ["Keep them", `${s.years} years`], ["Peak redirects", `${k.fmt(s.peak)} /s`],
            ["DB can serve", `${k.fmt(s.dbCap)} reads/s`], ["Cache RAM budget", gb(s.ram)], ["Must support", s.needs]];
          rows.forEach(([a, b], i) => {
            k.text(cardG, 24, 66 + i * 21, a, { anchor: "start", size: 12, tone: "muted" });
            k.text(cardG, 296, 66 + i * 21, b, { anchor: "end", size: 12, weight: 700 });
          });
          k.text(cardG, 160, 205, "Cache options (most popular links)", { size: 12, weight: 700 });
          k.text(cardG, 30, 226, "option", { anchor: "start", size: 11, tone: "muted" });
          k.text(cardG, 190, 226, "hit rate", { anchor: "middle", size: 11, tone: "muted" });
          k.text(cardG, 290, 226, "RAM", { anchor: "end", size: 11, tone: "muted" });
          s.cache.forEach(([n, hit, ram], i) => {
            const y = 248 + i * 20;
            k.text(cardG, 30, y, n, { anchor: "start", size: 12, mono: true });
            k.text(cardG, 190, y, `${Math.round(hit * 100)}%`, { anchor: "middle", size: 12, mono: true });
            k.text(cardG, 290, y, ram ? gb(ram) : "0", { anchor: "end", size: 12, mono: true });
          });
          k.text(cardG, 160, 324, "62⁴≈14.8M · 62⁵≈916M · 62⁶≈56.8B · 62⁷≈3.5T", { size: 11, tone: "muted" });
        }

        function showDesign() {
          const s = SCEN[si];
          design.textContent = `${choice.len} chars · ${choice.r302 ? "302" : "301"} · cache ${s.cache[choice.cache][0]}`;
        }
        function clearMeters() {
          for (const m of [mCodes, mDb, mRam]) m.set(0, "accent");
          for (const t of [vCodes, vDb, vRam, vClicks, yearsT]) t.textContent = "";
          for (const b of [apiB, cacheB, dbB]) k.tone(b, "neutral");
        }

        function setupScenario() {
          const s = SCEN[si];
          drawCard(s); clearMeters(); hud();
          choice = { len: 6, r302: 1, cache: 0 };
          k.clearTools();
          controls = [
            k.slider({ label: "Code length", min: 4, max: 8, step: 1, value: choice.len, format: v => `${v} chars`, onInput: v => { choice.len = v; showDesign(); } }).input,
            k.slider({ label: "Redirect", min: 0, max: 1, step: 1, value: choice.r302, format: v => v ? "302 Found" : "301 Permanent", onInput: v => { choice.r302 = v; showDesign(); } }).input,
            k.slider({ label: "Cache", min: 0, max: 3, step: 1, value: choice.cache, format: v => s.cache[v][0], onInput: v => { choice.cache = v; showDesign(); } }).input,
            k.button("Launch ▶", () => k.run(launch), { primary: true })
          ];
          showDesign();
          k.say(`Scenario ${si + 1}: read the card, do the arithmetic, set the three sliders, then <b>Launch</b>. You get one launch per scenario.`);
        }

        let launching = false;
        async function launch() {
          if (launching) return;
          launching = true;
          const s = SCEN[si];
          for (const el of controls) el.disabled = true;
          const need = s.perMonth * 12 * s.years, cap = Math.pow(62, choice.len);
          const minLen = [4, 5, 6, 7, 8].find(n => Math.pow(62, n) >= need);
          const factor = choice.r302 ? 1 : 0.6;
          const loadOf = i => Math.round(s.peak * factor * (1 - s.cache[i][1]));
          const works = i => loadOf(i) <= s.dbCap && s.cache[i][2] <= s.ram;
          const minCache = [0, 1, 2, 3].find(works);
          const load = loadOf(choice.cache), ram = s.cache[choice.cache][2];

          // simulate the years
          k.say("Launching… watch the meters.");
          const runOut = cap / (s.perMonth * 12);
          let ranOut = false;
          const steps = 30;
          const traffic = (async () => {
            const clicksN = 5;
            let got = 0;
            for (let c = 0; c < clicksN; c++) {
              if (!choice.r302 && c > 0) {
                await k.packet(sys, Q.browser, { x: Q.browser.x, y: 8 }, { r: 7, ms: 350, tone: "warn" });
              } else {
                await k.packet(sys, Q.browser, Q.api, { r: 7, ms: 260 });
                const hit = Math.random() < s.cache[choice.cache][1];
                await k.packet(sys, Q.api, hit ? Q.cache : Q.db, { r: 7, ms: 260, tone: hit ? "good" : "warn" });
                got++;
              }
              vClicks.textContent = `clicks counted: ${got} of ${c + 1}`;
            }
          })();
          traffic.catch(() => {});   // cancelled by Restart: handled when awaited below
          for (let i = 1; i <= steps; i++) {
            const yr = s.years * i / steps;
            const used = s.perMonth * 12 * yr / cap;
            yearsT.textContent = `year ${yr.toFixed(1)} of ${s.years}`;
            mCodes.set(Math.min(1, used), used > 1 ? "bad" : used > 0.8 ? "warn" : "good");
            vCodes.textContent = used > 1 ? "ran out!" : `${Math.max(0.1, used * 100).toFixed(1)}%`;
            if (used > 1 && !ranOut) { ranOut = true; k.float(sys, 470, 180, `codes ran out in year ${runOut.toFixed(1)}`, "bad"); }
            const ramp = Math.min(1, i / 12);
            mDb.set(Math.min(1, load * ramp / (2 * s.dbCap)), load > s.dbCap ? "bad" : "good");
            vDb.textContent = `${k.fmt(Math.round(load * ramp))} / ${k.fmt(s.dbCap)} /s`;
            mRam.set(Math.min(1, ram * ramp / (2 * s.ram)), ram > s.ram ? "bad" : "good");
            vRam.textContent = `${gb(Math.round(ram * ramp * 10) / 10)} / ${gb(s.ram)}`;
            await k.sleep(90);
          }
          await traffic;
          k.tone(dbB, load > s.dbCap ? "bad" : "good");
          k.tone(cacheB, ram > s.ram ? "bad" : choice.cache ? "good" : "muted");
          k.tone(apiB, "good");

          // score it
          let pL, pR, pC;
          const msgs = [];
          if (choice.len < minLen) { pL = 0; msgs.push(`✗ ${choice.len} chars = ${big(cap)} codes, but you need ${big(need)}: they run out in year ${runOut.toFixed(1)}.`); }
          else if (choice.len === minLen) { pL = 100; msgs.push(`✓ ${choice.len} chars: ${big(cap)} codes covers ${big(need)} links, and links stay short.`); }
          else { pL = choice.len === minLen + 1 ? 70 : 40; msgs.push(`~ ${choice.len} chars works, but ${minLen} would do. Short links are the product.`); }
          if (s.count) {
            pR = choice.r302 ? 100 : 0;
            msgs.push(choice.r302 ? "✓ 302: every click reaches you." : `✗ 301: browsers cache it, so you lose ${s.loses}.`);
          } else {
            pR = choice.r302 ? 50 : 100;
            msgs.push(choice.r302 ? "~ 302 works, but nobody needs the clicks: 301 would let browsers skip you." : "✓ 301: no stats needed, so let browsers cache it.");
          }
          if (!works(choice.cache)) {
            pC = 0;
            msgs.push(ram > s.ram ? `✗ ${gb(ram)} of cache is over the ${gb(s.ram)} budget.` : `✗ the DB gets ${k.fmt(load)} reads/s, over its ${k.fmt(s.dbCap)} limit.`);
          } else if (choice.cache === minCache) {
            pC = 100;
            msgs.push(choice.cache ? `✓ cache ${s.cache[choice.cache][0]}: DB at ${k.fmt(load)} /s, the smallest cache that fits.` : `✓ no cache needed: the DB handles ${k.fmt(load)} /s.`);
          } else { pC = 60; msgs.push(`~ cache ${s.cache[choice.cache][0]} works, but ${s.cache[minCache][0]} was enough.`); }
          const pts = pL + pR + pC;
          total += pts; hud();
          k.float(svg, 160, 190, `+${pts}`, pts >= 270 ? "good" : pts >= 150 ? "warn" : "bad");
          k.say(msgs.join("<br>"));
          k.clearTools();
          si++;
          k.button(si < SCEN.length ? "Next scenario ▶" : "See results", () => { launching = false; if (si < SCEN.length) setupScenario(); else end(); }, { primary: true });
        }

        function end() {
          const text = `You scored <b>${total}</b> of 900. Size code length from links per month × years against 62ⁿ, use 302 whenever clicks or editable targets matter, and choose the smallest cache whose hit rate keeps the database under its limit.`;
          if (total < 400) k.lose(text);
          else k.win({ stars: k.starsFor(total, 600, 820), text });
        }

        setupScenario();
      }
    }
  });
})();
