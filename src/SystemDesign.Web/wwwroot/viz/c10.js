"use strict";
/* Concept 10 · Sharding. Watch: range-by-date makes a hot shard, hash(CustomerId) spreads evenly, then the query cost
   of the choice (one shard vs scatter-gather). Play: Shard Key Chooser, pick keys for four workloads. */

/* the same stable integer hash as the C# demo (D10_Sharding.StableHash) */
function c10Hash(value) {
  let x = value >>> 0;
  x ^= x >>> 16; x = Math.imul(x, 0x7feb352d) >>> 0;
  x ^= x >>> 15; x = Math.imul(x, 0x846ca68b) >>> 0;
  x ^= x >>> 16;
  return x >>> 0;
}

Lab.define(10, {
  watch: {
    title: "The flash sale that melted one shard",
    intro: "A flash sale sends a burst of new orders. The <b>shard key</b> decides which of 4 databases each one lands on.",
    steps: [
      { label: "Too many writes", tag: "problem", title: "One database can’t keep up",
        body: "<p>ShopKart’s flash sale brings <b>10,000 new orders</b> from up to 50,000 customers. One database can’t absorb the writes, and replicas don’t help: every write still hits the primary.</p><p>So the Orders table is split over <b>4 shards</b>. A <b>router</b> picks a shard for each order.</p>",
        idea: "Sharding splits the data itself, so each machine takes only part of the writes.",
        changed: ["Router with 4 shards behind it", "Shard key: not chosen yet"] },
      { label: "By date", tag: "technique", title: "Range sharding: one shard per year",
        body: "<p>First try: <b>range sharding by order date</b>. 2023 on shard 0, 2024 on shard 1, and so on.</p><p>It’s simple, and old years stay together. Today is <b>18 Nov 2026</b>, so the first order goes to shard 3.</p>",
        idea: "Range keys keep neighbours together, which is great for range scans and dangerous for new data.",
        changed: ["Router key: order date", "First order → shard 3"] },
      { label: "Hot shard", tag: "failure", title: "Every order has today’s date",
        body: "<p>The rest of the burst arrives. Every order is from today, so <b>every write lands on shard 3</b>.</p><p>One shard is on fire while three sit idle. That is a <b>hot shard</b>, and we scaled nothing.</p>",
        idea: "A key that grows with time (dates, auto-increment ids) sends all new writes to one place.",
        changed: ["Shard 3: 100% of writes", "Shards 0–2: idle"] },
      { label: "Hash key", tag: "fix", title: "Hash the CustomerId",
        body: "<p>Second try: <code>hash(CustomerId) % 4</code>. Many different customers are buying, so their hashes scatter across all shards.</p><p>The hash is <b>stable</b>: the same customer always maps to the same shard.</p>",
        idea: "A good shard key has many distinct, evenly used values.",
        changed: ["Router key: hash(CustomerId) % 4", "Each order’s hash shown under the router"] },
      { label: "Even load", tag: "result", title: "All four machines share the work",
        body: "<p>The burst now spreads out: about <b>8 writes per shard</b>, the busiest taking ~28% instead of 100%.</p><p>Each shard also keeps smaller tables and smaller indexes.</p>",
        idea: "With an even key, adding shards really does add write capacity.",
        changed: ["Writes per shard: 8 · 8 · 9 · 7", "Busiest shard: 100% → 28%"] },
      { label: "One shard", tag: "technique", title: "Queries that carry the key",
        body: "<p>“Show <b>my orders</b>” filters on CustomerId. The router hashes the id and asks <b>exactly one shard</b>.</p><p>This is the query the key was chosen for, so it stays as fast as on a single database.</p>",
        idea: "Pick the key your <b>most common query</b> filters on.",
        changed: ["Customer 4242 → shard 3", "Shards per query: 1"] },
      { label: "Scatter", tag: "trade-off", title: "Queries without the key",
        body: "<p>“All orders <b>yesterday</b>” doesn’t include the CustomerId. The router must <b>scatter</b> it to every shard, then <b>gather</b> and merge the results.</p><p>It works, but costs every shard some work and is only as fast as the slowest one.</p>",
        idea: "Every shard key makes some queries cheap and others scatter-gather. Choose which on purpose.",
        changed: ["Shards per query: 4", "All shards light up amber"] },
      { label: "Resharding", tag: "failure", title: "Add a 5th shard and most keys move",
        body: "<p>Growth again: add a 5th shard. With <code>hash % N</code>, N changes from 4 to 5 and almost every customer’s shard changes.</p><p>Here <b>27 of 32</b> customers would move, about 80%: a huge data migration. <b>Consistent hashing</b> (next concept) moves only ~1/N.</p>",
        idea: "The shard key is the whole decision: spread writes evenly, keep one request on one shard, and plan how you’ll add shards.",
        changed: ["Router: hash % 4 → hash % 5", "Keys moved: 27 of 32"] }
    ],
    learn: [
      { text: "Why one database stops scaling for writes", step: 0 },
      { text: "How a date key creates a hot shard", step: 2 },
      { text: "How hashing a key spreads writes evenly", step: 4 },
      { text: "One-shard queries vs scatter-gather", step: 6 },
      { text: "Why hash % N makes resharding expensive", step: 7 }
    ],
    build(stage, k) {
      const svg = k.svg(760, 330, { label: "Orders flow through a shard router to four shards with load bars" });
      stage.append(svg);
      const SRC = { x: 62, y: 165 }, RT = { x: 210, y: 165 };
      const shardPt = s => ({ x: 420, y: 52 + s * 76 });
      const BAR_X = 498, BAR_W = 200, TOTAL = 32;
      k.line(svg, SRC, RT, { dashed: true });
      k.box(svg, { ...SRC, w: 104, h: 52, label: "Orders", icon: "🛒", sub: "flash sale" });
      const router = k.box(svg, { ...RT, w: 176, h: 56, label: "Shard router", icon: "🧭", sub: "key: ?", size: 13.5 });
      const shards = [], bars = [], counts = [0, 0, 0, 0];
      for (let s = 0; s < 4; s++) {
        const p = shardPt(s);
        k.line(svg, RT, p, { dashed: true });
        shards.push(k.box(svg, { ...p, w: 130, h: 50, label: `Shard ${s}`, icon: "🗄️", sub: " ", size: 13.5 }));
        svg.append(k.s("rect", { x: BAR_X, y: p.y - 9, width: BAR_W, height: 18, rx: 9, fill: "surface2", stroke: "line" }));
        const fg = k.s("rect", { x: BAR_X, y: p.y - 9, width: 0, height: 18, rx: 9, fill: "accent" });
        svg.append(fg);
        const t = k.text(svg, BAR_X + BAR_W + 8, p.y + 4.5, "0", { size: 12, anchor: "start", weight: 700 });
        bars.push({ fg, t });
      }
      k.text(svg, BAR_X + BAR_W / 2, 18, "writes received", { size: 11, tone: "muted" });
      const info = k.text(svg, 210, 232, "", { size: 12, mono: true, weight: 700 });
      const stat = k.text(svg, 190, 322, "", { size: 12, weight: 600 });

      /* fixed customers (not random) so Back / replay lands on the same picture: hash % 4 spreads them 8 · 8 · 9 · 7 */
      const custs = [4242, 17893, 301, 28810, 9157, 44102, 1276, 5103, 5120, 7719, 5143, 13355, 31867, 2590, 40411, 25236,
                     8863, 15502, 47788, 3364, 22179, 38945, 11420, 29603, 6081, 43357, 19214, 34790, 1938, 26655, 12007, 41260];

      let routed = 0, perQuery = "—", moved = 0;
      const busiest = () => routed ? `${Math.round(Math.max(...counts) / routed * 100)}%` : "—";
      const metrics = () => k.hud({ "Writes routed": routed, "Shards per query": perQuery, "Keys moved": moved, "Busiest shard": busiest() });
      metrics();

      function bump(s) {
        counts[s]++; routed++;
        bars[s].t.textContent = counts[s];
        k.tween(bars[s].fg, { width: counts[s] / TOTAL * BAR_W }, 160).catch(() => {});
        metrics();
      }
      function resetBars() {
        routed = 0;
        for (let s = 0; s < 4; s++) { counts[s] = 0; bars[s].fg.setAttribute("width", 0); bars[s].fg.style.fill = k.colors.accent; bars[s].t.textContent = "0"; k.tone(shards[s], "neutral"); }
        metrics();
      }
      async function send(shard, label, slow) {
        await k.packet(svg, SRC, RT, { r: 7, label: slow ? label : "", ms: slow ? 500 : 300 });
        await k.packet(svg, RT, shardPt(shard), { r: 7, label: slow ? label : "", ms: slow ? 600 : 380 });
        bump(shard);
      }

      k.run(async () => {
        // 1 · one database can't keep up
        await k.step();
        k.say("Orders pour in; the router needs a rule.");
        await Promise.all(Array.from({ length: 6 }, (_, j) => k.sleep(j * 220).then(() => k.packet(svg, SRC, RT, { r: 7, ms: 600 }))));
        k.tone(router, "warn");
        await k.pulse(router);
        await k.sleep(400);
        for (let s = 0; s < 4; s++) { k.tone(shards[s], "accent"); await k.sleep(300); k.tone(shards[s], "neutral"); }
        k.tone(router, "neutral");
        await k.sleep(600);

        // 2 · range by date
        await k.step();
        router.sub.textContent = "key: order date (by year)";
        ["2023", "2024", "2025", "2026"].forEach((y, s) => { shards[s].sub.textContent = `year ${y}`; });
        k.say("One shard per year.");
        await k.sleep(1400);
        info.textContent = "18 Nov 2026 → shard 3";
        await send(3, "18", true);
        k.say("Today’s order → the 2026 shard.");
        await k.sleep(1200);

        // 3 · the hot shard
        await k.step();
        k.say("The rest of the burst arrives…");
        await Promise.all(Array.from({ length: TOTAL - 1 }, (_, j) => k.sleep(j * 90).then(() => send(3))));
        k.tone(shards[3], "bad"); bars[3].fg.style.fill = k.colors.bad;
        for (const s of [0, 1, 2]) k.tone(shards[s], "muted");
        k.float(svg, shardPt(3).x, shardPt(3).y - 30, "🔥 hot shard", "bad");
        stat.textContent = "1 shard takes 100% of writes · 3 sit idle"; stat.style.fill = k.colors.bad;
        k.say("Every write on one shard.");
        await k.sleep(1600);

        // 4 · hash of customer id
        await k.step();
        resetBars(); stat.textContent = ""; info.textContent = "";
        router.sub.textContent = "key: hash(CustomerId) % 4";
        for (let s = 0; s < 4; s++) shards[s].sub.textContent = `hash % 4 = ${s}`;
        k.say("Route by <code>hash(CustomerId) % 4</code>.");
        await k.sleep(1200);
        for (let j = 0; j < 3; j++) {
          const c = custs[j], s = c10Hash(c) % 4;
          info.textContent = `hash(${c}) % 4 = ${s}`;
          await send(s, "", true);
          await k.sleep(500);
        }

        // 5 · even load
        await k.step();
        info.textContent = "";
        k.say("The rest of the burst, by customer hash…");
        await Promise.all(custs.slice(3).map((c, j) => k.sleep(j * 90).then(() => send(c10Hash(c) % 4))));
        for (let s = 0; s < 4; s++) { k.tone(shards[s], "good"); bars[s].fg.style.fill = k.colors.good; }
        stat.textContent = `writes per shard: ${counts.join(" · ")}  (busiest ${busiest()})`; stat.style.fill = k.colors.good;
        k.say("Every shard shares the load.");
        await k.sleep(1600);
        for (let s = 0; s < 4; s++) k.tone(shards[s], "neutral");

        // 6 · query by the shard key
        await k.step();
        const me = custs[0], mine = c10Hash(me) % 4;
        k.say(`“Orders for customer ${me}”: hash → one shard.`);
        info.textContent = `customer ${me} → shard ${mine}`;
        await k.sleep(900);
        await k.packet(svg, RT, shardPt(mine), { r: 9, label: "Q", tone: "accent", ms: 600 });
        k.tone(shards[mine], "good");
        await k.packet(svg, shardPt(mine), RT, { r: 9, tone: "good", ms: 600 });
        perQuery = 1; metrics();
        stat.textContent = "query by the shard key → 1 shard"; stat.style.fill = k.colors.good;
        await k.sleep(1600);
        k.tone(shards[mine], "neutral");

        // 7 · scatter-gather
        await k.step();
        k.say("“All orders yesterday”: scatter to every shard, gather.");
        info.textContent = "date → ? (any shard)";
        await k.sleep(1000);
        await Promise.all([0, 1, 2, 3].map(s => k.packet(svg, RT, shardPt(s), { r: 9, label: "Q", tone: "warn", ms: 600 })));
        shards.forEach(b => k.tone(b, "warn"));
        perQuery = 4; metrics();
        await k.sleep(400);
        await Promise.all([0, 1, 2, 3].map(s => k.packet(svg, shardPt(s), RT, { r: 9, tone: "warn", ms: 600 })));
        stat.textContent = "query without the shard key → all 4 shards"; stat.style.fill = k.colors.warn;
        await k.sleep(1600);
        shards.forEach(b => k.tone(b, "neutral"));

        // 8 · resharding with hash % N
        await k.step();
        info.textContent = "";
        perQuery = "—"; metrics();
        router.sub.textContent = "key: hash(CustomerId) % 5";
        k.tone(router, "bad");
        k.say("A 5th shard: N changes from 4 to 5…");
        await k.sleep(800);
        const movers = custs.filter(c => c10Hash(c) % 4 !== c10Hash(c) % 5);
        await Promise.all(movers.map((c, j) => k.sleep(j * 110).then(async () => {
          await k.packet(svg, shardPt(c10Hash(c) % 4), RT, { r: 6, tone: "bad", ms: 500 });
          moved++; metrics();
          stat.textContent = `adding a 5th shard: ${moved} of ${TOTAL} customers change shard`; stat.style.fill = k.colors.bad;
        })));
        k.say(`<b>${moved} of ${TOTAL}</b> customers must move.`);
        await k.sleep(1600);
        k.done();
      });
    }
  },

  play: {
    title: "Shard Key Chooser",
    goal: "Four systems need sharding across 4 databases. For each, <b>click a shard key</b>, then watch where the writes land and how many shards the main query touches. Even load + one-shard queries score best.",
    build(stage, k) {
      const RECORDS = 400;
      const weighted = pairs => { let r = Math.random(), acc = 0; for (const [v, w] of pairs) { acc += w; if (r < acc) return v; } return pairs[pairs.length - 1][0]; };
      const tenantW = Array.from({ length: 40 }, (_, t) => [t + 1, 0.5 + (t * 7 % 5) / 4]);
      const tenantSum = tenantW.reduce((a, [, w]) => a + w, 0);
      tenantW.forEach(p => { p[1] /= tenantSum; });
      const SCEN = [
        {
          title: "Online shop: orders during today’s flash sale",
          query: "Main query: “show my orders” (by CustomerId)",
          gen: () => ({ cust: k.randInt(1, 50000), order: k.randInt(1, 2e9), country: weighted([[0, 0.7], [1, 0.2], [2, 0.06], [3, 0.04]]) }),
          keys: [
            { label: "Order date (range: one shard per year)", fn: () => 3, local: false, note: "Every order today has the same year, so one shard takes everything." },
            { label: "hash(CustomerId) % 4", fn: r => c10Hash(r.cust) % 4, local: true, note: "Thousands of customers spread evenly, and “my orders” needs only that customer’s shard." },
            { label: "Country (one shard per region)", fn: r => r.country, local: false, note: "70% of customers are in one country, so its shard is hot, and the router can’t tell a customer’s country from their id." },
            { label: "hash(OrderId) % 4", fn: r => c10Hash(r.order) % 4, local: false, note: "Perfectly even, but one customer’s orders are scattered, so “my orders” must ask all 4 shards." }
          ]
        },
        {
          title: "SaaS app: invoices for 40 business tenants",
          query: "Main query: tenant dashboard (all invoices of one TenantId)",
          gen: () => ({ tenant: weighted(tenantW), inv: k.randInt(1, 2e9) }),
          keys: [
            { label: "hash(InvoiceId) % 4", fn: r => c10Hash(r.inv) % 4, local: false, note: "Even, but every dashboard load fans out to all 4 shards." },
            { label: "Invoice month (range)", fn: () => 2, local: false, note: "New invoices are all this month’s, so one shard takes every write." },
            { label: "hash(TenantId) % 4", fn: r => c10Hash(r.tenant) % 4, local: true, note: "Each tenant lives on one shard: the dashboard is a one-shard query, and 40 tenants spread well. Tenant is the classic SaaS shard key." }
          ]
        },
        {
          title: "IoT platform: readings from 200 devices (85% thermostats)",
          query: "Main query: readings for one DeviceId in the last hour",
          gen: () => ({ dev: k.randInt(1, 200), id: k.randInt(1, 2e9), type: weighted([[0, 0.85], [1, 0.07], [2, 0.05], [3, 0.03]]) }),
          keys: [
            { label: "Reading time (range by day)", fn: () => 1, local: true, note: "The query hits one shard, but all of today’s writes pile onto it." },
            { label: "Device type", fn: r => r.type, local: true, note: "85% of devices are thermostats, so the thermostat shard is hot." },
            { label: "hash(ReadingId) % 4", fn: r => c10Hash(r.id) % 4, local: false, note: "Even, but one device’s readings are on every shard." },
            { label: "hash(DeviceId) % 4", fn: r => c10Hash(r.dev) % 4, local: true, note: "200 devices spread evenly and a device’s readings stay together." }
          ]
        },
        {
          title: "User accounts: sign-ups and logins",
          query: "Main query: log in by email address",
          gen: () => ({ email: k.randInt(1, 2e9), uid: k.randInt(1, 2e9), sur: weighted([[0, 0.3], [1, 0.18], [2, 0.32], [3, 0.2]]) }),
          keys: [
            { label: "hash(UserId) % 4", fn: r => c10Hash(r.uid) % 4, local: false, note: "Even, but at login you only know the email, not the id, so every login asks all 4 shards." },
            { label: "hash(Email) % 4", fn: r => c10Hash(r.email) % 4, local: true, note: "Even, and login knows the email, so it goes straight to one shard." },
            { label: "Sign-up date (range by year)", fn: () => 3, local: false, note: "All new sign-ups land on this year’s shard, and email lookups must scatter." },
            { label: "Surname initial (A–F, G–L, M–R, S–Z)", fn: r => r.sur, local: false, note: "Lumpy (some letters are far more common) and login doesn’t know the surname." }
          ]
        }
      ];

      const svg = k.svg(760, 340, { label: "Shard key options on the left, four shards with load bars on the right" });
      stage.append(svg);
      const titleT = k.text(svg, 380, 24, "", { size: 14, weight: 700 });
      const queryT = k.text(svg, 380, 46, "", { size: 12, tone: "muted" });
      const optG = k.s("g"); svg.append(optG);
      const shardPt = s => ({ x: 412, y: 100 + s * 54 });
      const BAR_X = 470, BAR_W = 236;
      const shards = [], bars = [];
      for (let s = 0; s < 4; s++) {
        const p = shardPt(s);
        shards.push(k.box(svg, { ...p, w: 96, h: 40, label: `Shard ${s}`, size: 12 }));
        svg.append(k.s("rect", { x: BAR_X, y: p.y - 8, width: BAR_W, height: 16, rx: 8, fill: "surface2", stroke: "line" }));
        const fg = k.s("rect", { x: BAR_X, y: p.y - 8, width: 0, height: 16, rx: 8, fill: "accent" });
        svg.append(fg);
        bars.push({ fg, t: k.text(svg, BAR_X + BAR_W + 6, p.y + 4.5, "", { size: 11.5, anchor: "start", weight: 700 }) });
      }
      const Q = { x: 330, y: 312 };
      const scoreT = k.text(svg, 560, 316, "", { size: 12.5, weight: 700 });

      let round = 0, score = 0, locked = false;
      const optPos = j => ({ x: 160, y: 100 + j * 54 });

      function drawRound() {
        const sc = SCEN[round];
        titleT.textContent = sc.title; queryT.textContent = sc.query;
        optG.replaceChildren(); scoreT.textContent = "";
        for (let s = 0; s < 4; s++) { bars[s].fg.setAttribute("width", 0); bars[s].fg.style.fill = k.colors.accent; bars[s].t.textContent = ""; k.tone(shards[s], "neutral"); }
        sc.keys.forEach((key, j) => {
          const b = k.box(optG, { ...optPos(j), w: 290, h: 42, label: key.label, size: 12 });
          b.style.cursor = "pointer";
          b.setAttribute("tabindex", 0); b.setAttribute("role", "button"); b.setAttribute("aria-label", `Shard by ${key.label}`);
          const go = () => k.run(() => choose(j, b));
          b.addEventListener("click", go);
          b.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
        });
        k.hud({ Round: `${round + 1} / ${SCEN.length}`, Score: score });
        k.say("Which shard key? Think: does it <b>spread writes</b>, and can the <b>main query</b> find its data on one shard?");
        locked = false;
      }

      async function choose(j, box) {
        if (locked) return;
        locked = true;
        const sc = SCEN[round], key = sc.keys[j];
        k.tone(box, "accent");
        const recs = Array.from({ length: RECORDS }, sc.gen);
        const counts = [0, 0, 0, 0];
        recs.forEach(r => { counts[key.fn(r)]++; });
        const from = { x: optPos(j).x + 145, y: optPos(j).y };
        k.say(`Routing ${RECORDS} writes by <b>${key.label}</b>…`);
        // representative packets, while the bars fill
        const grow = Promise.all(counts.map((c, s) => k.tween(bars[s].fg, { width: c / RECORDS * BAR_W }, 2200, k.ease.inOut)));
        await Promise.all(recs.slice(0, 28).map((r, n) => k.sleep(n * 70).then(() => k.packet(svg, from, shardPt(key.fn(r)), { r: 6, ms: 420 }))));
        await grow;
        const maxShare = Math.max(...counts) / RECORDS;
        counts.forEach((c, s) => {
          bars[s].t.textContent = `${Math.round(c / RECORDS * 100)}%`;
          const hot = c / RECORDS > 0.4;
          bars[s].fg.style.fill = k.colors[hot ? "bad" : c / RECORDS > 0.3 ? "warn" : "good"];
          if (hot) { k.tone(shards[s], "bad"); k.float(svg, shardPt(s).x, shardPt(s).y - 22, "🔥 hot", "bad"); }
        });
        await k.sleep(700);
        // the main query
        if (key.local) {
          const s = key.fn(recs[0]);
          await k.packet(svg, Q, shardPt(s), { r: 8, label: "Q", tone: "accent", ms: 600 });
          await k.packet(svg, shardPt(s), Q, { r: 8, tone: "good", ms: 500 });
        } else {
          await Promise.all([0, 1, 2, 3].map(s => k.packet(svg, Q, shardPt(s), { r: 8, label: "Q", tone: "warn", ms: 600 })));
          await Promise.all([0, 1, 2, 3].map(s => k.packet(svg, shardPt(s), Q, { r: 8, tone: "warn", ms: 500 })));
        }
        const even = Math.round(50 * k.clamp((1 - maxShare) / 0.75, 0, 1));
        const loc = key.local ? 50 : 12;
        const pts = even + loc;
        score += pts;
        scoreT.textContent = `even load ${even}/50 · query ${key.local ? "1 shard" : "all 4 shards"} ${loc}/50 → +${pts}`;
        scoreT.style.fill = k.colors[pts >= 90 ? "good" : pts >= 60 ? "warn" : "bad"];
        k.hud({ Round: `${round + 1} / ${SCEN.length}`, Score: score });
        const best = sc.keys.find(x => x.local && x.label.startsWith("hash"));
        k.say(`${key.note}${best && best !== key ? ` Best here: <b>${best.label}</b>.` : ""}`);
        const last = round === SCEN.length - 1;
        k.clearTools();
        k.button(last ? "See result" : "Next system →", () => {
          k.clearTools();
          if (last) return end();
          round++; drawRound();
        }, { primary: true });
      }

      function end() {
        const text = `Score <b>${score}</b> of 400. A good shard key has many distinct, evenly used values (so writes spread) and is the thing your main query filters on (so it hits one shard). Dates and skewed categories make hot shards; ids your query doesn’t know make scatter-gather.`;
        if (score < 180) k.lose(text);
        else k.win({ stars: k.starsFor(score, 270, 355), text });
      }

      k.text(svg, Q.x, Q.y + 20, "main query", { size: 11, tone: "muted" });
      drawRound();
    }
  }
});
