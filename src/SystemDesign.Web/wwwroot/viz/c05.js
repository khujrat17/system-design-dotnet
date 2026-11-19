"use strict";
/* Concept 5 · Caching. Watch: a stepped lesson on cache-aside, LRU, TTL, invalidation and stampedes. Play: Cache Keeper. */
Lab.define(5, {
  watch: {
    title: "Why the product page got fast",
    intro: "Follow product requests through an app server, a cache and a slow database, one step at a time.",
    steps: [
      { label: "Slow page", tag: "problem", title: "Every page hits the database",
        body: "<p>ShopKart’s product page is slow. A user asks for <b>product 7</b>, and the app server goes straight to the database.</p><p>That query takes about <b>20 ms</b>, and every visitor pays it again for the same product.</p>",
        idea: "The answer to “what is product 7?” barely changes. Asking the database every time is wasted work.",
        changed: ["Request → app → database → back", "Latency: 20+ ms per view"] },
      { label: "Cache-aside", tag: "technique", title: "Check the cache first",
        body: "<p><b>Cache-aside</b>: the app looks in the cache first. On a <b>miss</b> it reads the database and stores the answer in the cache with a TTL.</p><p>The next request for product 7 is a <b>hit</b>: no database call at all.</p>",
        idea: "Hits are served from memory in under a millisecond. The first request still pays full price.",
        changed: ["Cache added between app and database", "2nd request: <code>HIT</code>, 0 database calls"] },
      { label: "Fill up", tag: "concept", title: "The cache is small",
        body: "<p>More products are viewed: 3, 9 and 5. Each miss fills a slot.</p><p>Memory is expensive, so the cache only holds <b>4 products</b>. The slots are ordered by how recently they were used.</p>",
        idea: "You can’t cache everything. You cache the hot set: the few items most people ask for.",
        changed: ["4 of 4 slots used", "Most recently used on the left"] },
      { label: "Evict", tag: "technique", title: "LRU decides what goes",
        body: "<p>A 5th product arrives and there is no room. <b>LRU</b> (least recently used) evicts the item that hasn’t been touched for the longest.</p>",
        idea: "Things used recently tend to be used again soon. LRU is the usual default eviction policy.",
        changed: ["Least recently used key evicted", "New key takes the front slot"] },
      { label: "TTL", tag: "trade-off", title: "Entries expire",
        body: "<p>Every entry has a <b>time to live</b>. When it runs out, the entry disappears and the next read fetches fresh data.</p><p>Short TTL: fresher data, more database load. Long TTL: fewer queries, staler data.</p>",
        idea: "TTL is your safety net. Even if invalidation is missed, stale data can’t live forever.",
        changed: ["Oldest entry faded out after its TTL"] },
      { label: "Invalidate", tag: "technique", title: "Delete the key on write",
        body: "<p>An admin changes product 7’s price. The app writes to the database and <b>deletes</b> <code>product:7</code> from the cache.</p><p>The next read misses and loads the new price.</p>",
        idea: "Always say how you invalidate. “Delete the key on update” is the simplest correct answer.",
        changed: ["Write goes to the database", "<code>product:7</code> removed from the cache"] },
      { label: "Stampede", tag: "failure", title: "A hot key expires",
        body: "<p>Product 1 is on the home page. Its entry expires, and <b>12 requests</b> arrive in the same millisecond.</p><p>All 12 miss, and all 12 query the database for the <b>same row</b>.</p>",
        idea: "This is a <b>cache stampede</b>. At real traffic it’s thousands of identical queries, and it can take the database down.",
        changed: ["12 identical database queries", "Database turns red"] },
      { label: "Single-flight", tag: "fix", title: "One fetch, everyone waits",
        body: "<p><b>Single-flight</b>: the first request fetches; the other 11 wait for that same result.</p><p>In .NET 9+, <code>HybridCache</code> does this for you. Staggered TTLs and refreshing before expiry help too.</p>",
        idea: "Strong interview answer: “cache-aside on product reads, 10-minute TTL, delete on update, single-flight on misses.”",
        changed: ["1 database call served 12 requests"] }
    ],
    learn: [
      { text: "How cache-aside reads and fills the cache", step: 1 },
      { text: "Why caches evict, and what LRU means", step: 3 },
      { text: "TTL and invalidation keep data fresh", step: 5 },
      { text: "What a cache stampede is", step: 6 },
      { text: "How single-flight prevents it", step: 7 }
    ],
    build(stage, k) {
      const svg = k.svg(760, 330, { label: "Client, app server, cache and database" });
      stage.append(svg);
      const P = { client: { x: 70, y: 150 }, app: { x: 250, y: 150 }, cache: { x: 470, y: 70 }, db: { x: 470, y: 250 } };
      k.line(svg, P.client, P.app, { dashed: true });
      const cacheLink = k.line(svg, P.app, P.cache, { dashed: true });
      k.line(svg, P.app, P.db, { dashed: true });
      k.box(svg, { ...P.client, label: "Client", icon: "📱" });
      k.box(svg, { ...P.app, label: "App server", icon: "🖥️", w: 130 });
      const cache = k.box(svg, { ...P.cache, label: "Cache", sub: "fast · in memory", icon: "⚡", w: 140, h: 52 });
      const db = k.box(svg, { ...P.db, label: "Database", sub: "slow · 20 ms", icon: "🗄️", w: 140, h: 52 });
      cache.setAttribute("opacity", 0); cacheLink.setAttribute("opacity", 0);

      const SLOTS = 4, slotX = i => 590 + i * 42, slotY = 70;
      const slotsG = k.s("g", { opacity: 0 }); svg.append(slotsG);
      k.text(slotsG, 653, 30, "cache slots (recent → old)", { size: 11, tone: "muted" });
      for (let i = 0; i < SLOTS; i++)
        slotsG.append(k.s("rect", { x: slotX(i) - 17, y: slotY - 17, width: 34, height: 34, rx: 7, fill: "surface2", stroke: "line", "stroke-dasharray": "4 3" }));

      const keys = [];
      let hits = 0, misses = 0, dbCalls = 0, lastMs = 0;
      const metrics = () => k.hud({ "Cache hits": hits, Misses: misses, "DB calls": dbCalls, "Last request": lastMs ? `${lastMs} ms` : "—" });
      metrics();

      const layoutKeys = () => Promise.all(keys.map((e, i) => k.tween(e.g, { tx: slotX(i), ty: slotY }, 300)));
      async function putKey(key) {
        const g = k.dot(svg, P.cache.x, P.cache.y, { r: 15, tone: "accent", label: key, size: 12 });
        keys.unshift({ key, g });
        if (keys.length > SLOTS) {
          const old = keys.pop();
          k.tone(old.g, "bad");
          k.say(`Evicting <b>${old.key}</b>: least recently used.`);
          await k.tween(old.g, { ty: slotY + 60, opacity: 0 }, 600);
          old.g.remove();
        }
        await layoutKeys();
      }
      async function touch(key) {
        const i = keys.findIndex(e => e.key === key);
        const [e] = keys.splice(i, 1); keys.unshift(e);
        await layoutKeys();
      }
      async function request(key, { fast = false, useCache = true } = {}) {
        await k.packet(svg, P.client, P.app, { label: key, r: 11 });
        const hit = useCache && keys.some(e => e.key === key);
        if (useCache) await k.packet(svg, P.app, P.cache, { label: key, r: 11, ms: 350 });
        if (hit) {
          hits++; lastMs = 1; metrics();
          k.tone(cache, "good"); k.float(svg, P.cache.x, P.cache.y - 36, "HIT", "good");
          await touch(key);
          await k.packet(svg, P.cache, P.app, { label: key, r: 11, tone: "good", ms: 300 });
        } else {
          if (useCache) { misses++; k.tone(cache, "bad"); k.float(svg, P.cache.x, P.cache.y - 36, "MISS", "bad"); }
          dbCalls++; lastMs = 22; metrics();
          k.tone(db, "warn");
          await k.packet(svg, P.app, P.db, { label: key, r: 11, ms: 450 });
          await k.sleep(fast ? 250 : 700);
          k.tone(db, "neutral");
          await k.packet(svg, P.db, P.app, { label: key, r: 11, tone: "warn", ms: 450 });
          if (useCache) { await k.packet(svg, P.app, P.cache, { label: key, r: 11, tone: "warn", ms: 300 }); await putKey(key); }
        }
        k.tone(cache, "neutral");
        await k.packet(svg, P.app, P.client, { label: key, r: 11, tone: hit ? "good" : "warn", ms: 350 });
      }

      k.run(async () => {
        // 1 · no cache
        await k.step();
        k.say("Request for product 7 goes straight to the database.");
        await request("7", { useCache: false });
        await k.sleep(400);
        await request("7", { useCache: false, fast: true });
        k.say("Same product, same slow query, twice.");

        // 2 · cache-aside
        await k.step();
        await Promise.all([k.tween(cache, { opacity: 1 }, 500), k.tween(cacheLink, { opacity: 1 }, 500), k.tween(slotsG, { opacity: 1 }, 500)]);
        k.say("Miss: read the database, then store the answer.");
        await request("7");
        await k.sleep(500);
        k.say("Hit: served from memory.");
        await request("7");

        // 3 · fill up
        await k.step();
        k.say("Products 3, 9 and 5 fill the remaining slots.");
        for (const key of ["3", "9", "5"]) await request(key, { fast: true });

        // 4 · evict
        await k.step();
        k.say("Product 2 arrives. The cache is full…");
        await k.sleep(600);
        await request("2", { fast: true });

        // 5 · TTL
        await k.step();
        k.say("The oldest entry’s TTL runs out.");
        const victim = keys[keys.length - 1];
        await k.tween(victim.g, { opacity: 0.15 }, 1600);
        keys.pop(); victim.g.remove(); await layoutKeys();

        // 6 · invalidation
        await k.step();
        k.say("Admin updates product 7: write the database, delete the key.");
        await k.packet(svg, { x: P.db.x - 160, y: P.db.y + 50 }, P.db, { label: "✎", r: 11, tone: "lesson", ms: 700 });
        dbCalls++; metrics();
        const seven = keys.find(e => e.key === "7");
        if (seven) {
          k.tone(seven.g, "bad");
          await k.tween(seven.g, { scale: 0.2, opacity: 0 }, 500);
          keys.splice(keys.indexOf(seven), 1); seven.g.remove(); await layoutKeys();
        }
        k.say("Next read of product 7 misses and loads the new price.");
        await request("7", { fast: true });

        // 7 · stampede
        await k.step();
        k.say("Hot key expires. 12 requests arrive at once…");
        await k.sleep(700);
        k.tone(db, "bad");
        await Promise.all(Array.from({ length: 12 }, (_, i) =>
          k.sleep(i * 50).then(() => k.packet(svg, { x: P.app.x, y: P.app.y + (i - 6) * 4 }, { x: P.db.x - 20 + (i % 4) * 12, y: P.db.y + (i - 6) * 3 }, { r: 7, tone: "bad", ms: 600 }))));
        misses += 12; dbCalls += 12; lastMs = 340; metrics();
        k.say("12 identical queries. The database slows to a crawl.");

        // 8 · single-flight
        await k.step();
        k.tone(db, "neutral");
        const waiters = Array.from({ length: 11 }, (_, i) => k.dot(svg, P.app.x + 70 + (i % 6) * 14, P.app.y - 40 + Math.floor(i / 6) * 14, { r: 5, tone: "muted" }));
        k.say("11 requests wait. One goes to the database.");
        k.tone(db, "warn");
        await k.packet(svg, P.app, P.db, { r: 9, tone: "accent", label: "1" });
        await k.sleep(500);
        await k.packet(svg, P.db, P.app, { r: 9, tone: "good", label: "1" });
        k.tone(db, "neutral");
        dbCalls += 1; lastMs = 22; metrics();
        for (const w of waiters) k.tone(w, "good");
        k.say("<b>1 database call</b> served all 12 requests.");
        await k.sleep(1200);
        k.done();
      });
    }
  },

  play: {
    title: "Cache Keeper",
    goal: "Your cache holds 4 products. When a request misses and the cache is full, <b>click the product to evict</b>. Keep the hit rate high: watch the queue of upcoming requests.",
    build(stage, k) {
      const TOTAL = 24, SLOTS = 4;
      const HOT = ["A", "B", "C"], COLD = ["D", "E", "F", "G", "H", "J"];
      const seq = Array.from({ length: TOTAL + 5 }, () => Math.random() < 0.62 ? k.pick(HOT) : k.pick(COLD));
      let i = 0, hits = 0, waiting = false;
      const cache = [];

      const svg = k.svg(720, 280, { label: "Request queue and cache slots" });
      stage.append(svg);
      k.text(svg, 160, 28, "Upcoming requests", { size: 12, tone: "muted" });
      k.text(svg, 520, 28, "Cache (click to evict)", { size: 12, tone: "muted" });
      const queueG = k.s("g"); svg.append(queueG);
      const cacheG = k.s("g"); svg.append(cacheG);
      const slotPos = j => ({ x: 400 + j * 80, y: 140 });
      for (let j = 0; j < SLOTS; j++) {
        svg.insertBefore(k.s("rect", { x: slotPos(j).x - 32, y: 108, width: 64, height: 64, rx: 12, fill: "surface2", stroke: "line", "stroke-dasharray": "5 4" }), cacheG);
      }
      const db = k.box(svg, { x: 560, y: 240, label: "Database", icon: "🗄️", w: 150, h: 40 });
      const hotLegend = k.text(svg, 160, 250, "Hot products: A, B, C (asked for most)", { size: 11.5, tone: "muted" });
      hotLegend.setAttribute("font-style", "italic");

      function drawQueue() {
        queueG.replaceChildren();
        for (let q = 0; q < 5; q++) {
          const key = seq[i + q];
          if (!key || i + q >= TOTAL) break;
          const d = k.dot(queueG, 260 - q * 50, 140, { r: q === 0 ? 24 : 17, tone: HOT.includes(key) ? "warn" : "accent", label: key, size: q === 0 ? 16 : 12 });
          if (q === 0) d.circle.style.stroke = k.colors.ink, d.circle.style.strokeWidth = 2.5;
        }
      }
      function drawCache() {
        cacheG.replaceChildren();
        cache.forEach((key, j) => {
          const d = k.dot(cacheG, slotPos(j).x, slotPos(j).y, { r: 26, tone: HOT.includes(key) ? "warn" : "accent", label: key, size: 16 });
          d.style.cursor = "pointer";
          d.setAttribute("tabindex", 0); d.setAttribute("role", "button"); d.setAttribute("aria-label", `Evict ${key}`);
          const go = () => evict(j);
          d.addEventListener("click", go);
          d.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
        });
      }
      function update() {
        const served = i;
        k.hud({ Request: `${Math.min(i + 1, TOTAL)} / ${TOTAL}`, Hits: hits, "Hit rate": served ? `${Math.round(hits / served * 100)}%` : "—" });
      }

      async function next() {
        update(); drawQueue(); drawCache();
        if (i >= TOTAL) return end();
        const key = seq[i];
        await k.sleep(450);
        if (cache.includes(key)) {
          hits++;
          const j = cache.indexOf(key);
          k.float(svg, slotPos(j).x, 96, "HIT +1", "good");
          k.say(`<b>${key}</b> was in the cache. Hit!`);
          i++; next();
        } else if (cache.length < SLOTS) {
          k.say(`<b>${key}</b> missed, and there is a free slot, so it goes straight in.`);
          k.tone(db, "warn"); await k.sleep(400); k.tone(db, "neutral");
          cache.push(key); i++; next();
        } else {
          waiting = true;
          k.tone(db, "warn");
          k.say(`<b>${key}</b> missed and the cache is full. <b>Click a product to evict.</b> Tip: keep the ones coming up soon.`);
        }
      }
      async function evict(j) {
        if (!waiting) return;
        waiting = false;
        const key = seq[i];
        k.tone(db, "neutral");
        k.float(svg, slotPos(j).x, 96, `bye ${cache[j]}`, "bad");
        cache[j] = key; i++;
        next();
      }
      function end() {
        const rate = Math.round(hits / TOTAL * 100);
        const text = `Hit rate <b>${rate}%</b> (${hits} of ${TOTAL}). An LRU cache gets about 50% on this traffic; planning ahead with the queue beats it.`;
        if (rate < 30) k.lose(`${text} Keep the hot products A, B and C in the cache.`);
        else k.win({ stars: k.starsFor(rate, 46, 60), text });
      }

      k.say("Requests flow in from the left. Hits are free; misses cost a slow database call.");
      update(); drawQueue();
      k.run(next);
    }
  }
});
