"use strict";
/* Concept 7 · SQL vs NoSQL. Watch: one order as joined tables vs one document (read, ad-hoc query, update).
   Play: Store Matchmaker, route workloads to the store that fits their access pattern. */
Lab.define(7, {
  watch: {
    title: "One order, two homes",
    intro: "The same order stored as <b>normalised tables</b> (left) and as <b>one document</b> (right). Follow three requests and see what each model is good and bad at.",
    steps: [
      { label: "Two models", tag: "problem", title: "Where should order 100 live?",
        body: "<p>Asha bought a phone and two cases. That is <b>order 100</b>.</p><p>On the left it is split into <b>three tables</b>: Customers, Orders and OrderLines. On the right it is <b>one JSON document</b> under the key <code>order:100</code>.</p>",
        idea: "Same data, two shapes. The shape decides which questions are cheap and which are expensive.",
        changed: ["3 normalised tables on the left", "2 self-contained documents on the right"] },
      { label: "SQL read", tag: "technique", title: "Relational: join three tables",
        body: "<p>The order page needs the order, the customer and the lines. The database <b>joins</b> Orders → Customers → OrderLines on their ids.</p><p>Each fact, like Asha’s city or a price, is stored <b>exactly once</b>.</p>",
        idea: "Normalisation means no duplicated facts. Joins put the pieces back together at read time.",
        changed: ["2 joins, 4 rows read", "Result: 2 order lines for Asha"] },
      { label: "Doc read", tag: "technique", title: "Document: one lookup, no joins",
        body: "<p>The document store fetches <code>order:100</code> by key. Customer and lines are <b>embedded</b> inside it.</p><p>When the page always reads the whole order together, this is the fastest possible read.</p>",
        idea: "Documents shine when you read and write the whole <b>aggregate</b> as one unit.",
        changed: ["1 document read", "0 joins"] },
      { label: "New report", tag: "concept", title: "Finance asks a new question",
        body: "<p>“Total revenue <b>per city</b>.” Nobody planned for this.</p><p>For SQL it is <b>just another query</b>: join, <code>GROUP BY</code> city, <code>SUM</code>. No redesign, no new code path.</p>",
        idea: "Relational databases are built for <b>ad-hoc queries</b> you didn’t know about on day one.",
        changed: ["SQL scanned all 7 rows", "Answer: Pune 20,997 · Delhi 64,999"] },
      { label: "Doc scan", tag: "failure", title: "The document store has no index for that",
        body: "<p>Documents are organised by <b>order id</b>. Nothing is indexed by city.</p><p>So it must <b>read every document</b>, millions in real life, or you build a new index or view just for this report.</p>",
        idea: "Document stores want the queries known up front. New questions can mean new indexes or copies of the data.",
        changed: ["Every document read", "Docs read count jumps"] },
      { label: "Update", tag: "technique", title: "Asha moves to Mumbai",
        body: "<p>Relational: change <b>one row</b> in Customers. Every order that points at customer 1 sees the new city at once.</p>",
        idea: "One fact in one place means one write keeps everything consistent.",
        changed: ["Customers row 1 → Mumbai", "1 row written"] },
      { label: "Stale copy", tag: "trade-off", title: "The document copied her city",
        body: "<p>Order 100 <b>embedded</b> Asha’s city when it was written, so it still says <b>Pune</b>.</p><p>That duplication is a choice: update every copy, or keep it on purpose as the address <i>at the time of the order</i>.</p>",
        idea: "Denormalising trades cheap reads for harder updates. Decide which copies are history and which must stay current.",
        changed: ["Stale copies: 1", "order:100 still says Pune"] },
      { label: "Pick a store", tag: "result", title: "Choose by access pattern",
        body: "<p>Five families: <b>relational</b>, <b>document</b>, <b>key-value</b>, <b>wide-column</b> and <b>graph</b>.</p><p>NoSQL scales out more easily because it gives up joins and cross-record transactions. For most business data, <b>relational is the right default</b>.</p>",
        idea: "Interview answer: name the access pattern first, then the store that fits it. Not hype.",
        changed: ["Five store families shown", "Each with a typical workload"] }
    ],
    learn: [
      { text: "How joins rebuild a normalised order", step: 1 },
      { text: "Why documents read whole aggregates fast", step: 2 },
      { text: "Why ad-hoc queries favour SQL", step: 4 },
      { text: "The cost of duplicated data", step: 6 },
      { text: "How to pick a store family", step: 7 }
    ],
    build(stage, k) {
      const svg = k.svg(760, 340, { label: "Relational tables on the left, a document store on the right" });
      stage.append(svg);
      const main = k.s("g"); svg.append(main);

      k.line(main, { x: 385, y: 40 }, { x: 385, y: 330 }, { dashed: true });
      k.text(main, 192, 26, "Relational (SQL)", { size: 14, weight: 700 });
      k.text(main, 575, 26, "Document store (NoSQL)", { size: 14, weight: 700 });

      /* a small table (or document): header + highlightable rows */
      function grid(x, y, w, title, rows, headTone) {
        const g = k.s("g"); main.append(g);
        const h = 24 + rows.length * 18 + 8;
        const frame = k.s("rect", { x: x - w / 2, y, width: w, height: h, rx: 8, fill: "surface", stroke: "line", "stroke-width": 1.5 });
        const head = k.s("rect", { x: x - w / 2, y, width: w, height: 24, rx: 8, fill: headTone, stroke: "line", "stroke-width": 1.5 });
        g.append(frame, head);
        k.text(g, x, y + 16, title, { size: 12, weight: 700 });
        const rowEls = rows.map((r, i) => {
          const bg = k.s("rect", { x: x - w / 2 + 4, y: y + 27 + i * 18, width: w - 8, height: 17, rx: 4, fill: "none" });
          g.append(bg);
          const t = k.text(g, x - w / 2 + 10, y + 39.5 + i * 18, r, { size: 11.5, anchor: "start", mono: true });
          return { bg, t };
        });
        return { g, rows: rowEls, frame, c: { x, y: y + h / 2 } };
      }
      const hi = (row, tone) => { row.bg.style.fill = tone ? k.colors[tone + "Soft"] : "none"; };
      const clearAll = tbls => tbls.forEach(t => { t.rows.forEach(r => hi(r)); t.frame.style.stroke = k.colors.line; });

      const cust = grid(97, 56, 160, "Customers", ["1  Asha  Pune", "2  Ravi  Delhi"], "accentSoft");
      const orders = grid(287, 56, 160, "Orders", ["100  cust 1  1 Nov", "101  cust 2  2 Nov"], "accentSoft");
      const lines = grid(192, 150, 200, "OrderLines", ["100  PHONE-1   ×1  19,999", "100  CASE-9    ×2     499", "101  LAPTOP-3  ×1  64,999"], "accentSoft");
      k.line(main, { x: 177, y: 92 }, { x: 207, y: 92 }, { tone: "accent" });
      k.line(main, { x: 287, y: 126 }, { x: 240, y: 150 }, { tone: "accent" });
      k.text(main, 192, 84, "id", { size: 11, tone: "muted" });

      const d100 = grid(490, 56, 160, "key: order:100", ["{ id: 100,", "  date: 1 Nov,", "  customer:", "    Asha, Pune", "  lines: [", "    PHONE-1 ×1,", "    CASE-9  ×2 ] }"], "lessonSoft");
      const d101 = grid(665, 56, 150, "key: order:101", ["{ id: 101,", "  date: 2 Nov,", "  customer:", "    Ravi, Delhi", "  lines: [", "    LAPTOP-3 ×1 ] }"], "lessonSoft");

      const SQ = { x: 192, y: 292 }, DQ = { x: 575, y: 292 };
      k.box(main, { ...SQ, w: 160, h: 36, label: "App query", icon: "🔎" });
      k.box(main, { ...DQ, w: 160, h: 36, label: "App query", icon: "🔎" });
      const sqlStat = k.text(main, 192, 330, "", { size: 12, weight: 600 });
      const docStat = k.text(main, 575, 330, "", { size: 12, weight: 600 });
      const stat = (t, str, tone = "ink") => { t.textContent = str; t.style.fill = k.colors[tone]; };
      const up = p => ({ x: p.x, y: p.y - 18 });

      let joins = 0, sqlRows = 0, docsRead = 0, stale = 0;
      const metrics = () => k.hud({ Joins: joins, "SQL rows read": sqlRows, "Docs read": docsRead, "Stale copies": stale, "Total reads": sqlRows + docsRead });
      metrics();

      k.run(async () => {
        // 1 · two models
        await k.step();
        k.say("Order 100, stored two ways.");
        for (const t of [cust, orders, lines]) {
          t.frame.style.stroke = k.colors.accent; t.rows.forEach(r => hi(r, "accent"));
          await k.sleep(700);
        }
        k.say("…and as one document per order.");
        await k.sleep(500);
        for (const d of [d100, d101]) {
          d.frame.style.stroke = k.colors.lesson; d.rows.forEach(r => hi(r, "lesson"));
          await k.sleep(900);
        }
        await k.sleep(800);
        clearAll([cust, orders, lines, d100, d101]);

        // 2 · SQL read: join three tables
        await k.step();
        k.say("Load order 100: join Orders → Customers → OrderLines.");
        await k.packet(main, up(SQ), orders.c, { label: "1", r: 10 });
        hi(orders.rows[0], "accent"); sqlRows++; metrics(); await k.sleep(350);
        await k.packet(main, orders.c, cust.c, { label: "2", r: 10, ms: 500 });
        hi(cust.rows[0], "accent"); sqlRows++; joins++; metrics(); await k.sleep(350);
        await k.packet(main, cust.c, lines.c, { label: "3", r: 10, ms: 500 });
        hi(lines.rows[0], "accent"); hi(lines.rows[1], "accent"); sqlRows += 2; joins++; metrics(); await k.sleep(350);
        await k.packet(main, lines.c, up(SQ), { tone: "good", r: 10, ms: 500 });
        stat(sqlStat, "3 tables joined → 2 result rows");
        k.say("Three tables matched on ids.");
        await k.sleep(1200);

        // 3 · document read
        await k.step();
        clearAll([cust, orders, lines, d100, d101]);
        k.say("Fetch <code>order:100</code> by key.");
        await k.sleep(600);
        await k.packet(main, up(DQ), d100.c, { label: "1", r: 10 });
        d100.rows.forEach(r => hi(r, "good")); d100.frame.style.stroke = k.colors.good;
        docsRead++; metrics();
        await k.packet(main, d100.c, up(DQ), { tone: "good", r: 10, ms: 500 });
        stat(docStat, "1 read, no joins", "good");
        k.say("One lookup, the whole order.");
        await k.sleep(1200);

        // 4 · ad-hoc query in SQL
        await k.step();
        clearAll([cust, orders, lines, d100, d101]);
        stat(sqlStat, ""); stat(docStat, "");
        k.say("Revenue per city: join, <code>GROUP BY</code>, sum.");
        await Promise.all([orders, cust, lines].map((t, i) => k.sleep(i * 150).then(() => k.packet(main, up(SQ), t.c, { r: 8, ms: 600 }))));
        [orders, cust, lines].forEach(t => t.rows.forEach(r => hi(r, "accent")));
        sqlRows += 7; joins += 2; metrics();
        await k.sleep(400);
        await k.packet(main, lines.c, up(SQ), { tone: "good", r: 10, ms: 500 });
        stat(sqlStat, "Pune 20,997 · Delhi 64,999", "good");
        k.say("Just another query for SQL.");
        await k.sleep(1200);

        // 5 · document store must scan
        await k.step();
        k.say("No city index: read every document…");
        for (const d of [d100, d101]) {
          await k.packet(main, up(DQ), d.c, { r: 8, tone: "warn", ms: 500 });
          d.frame.style.stroke = k.colors.warn; d.rows[3].bg.style.fill = k.colors.warnSoft;
          docsRead++; metrics();
          await k.sleep(250);
        }
        stat(docStat, "had to read every document", "bad");
        k.say("Full scan of the collection.");
        await k.sleep(1400);

        // 6 · update in SQL
        await k.step();
        clearAll([cust, orders, lines, d100, d101]);
        stat(sqlStat, ""); stat(docStat, "");
        k.say("Asha moves to <b>Mumbai</b>.");
        await k.sleep(800);
        await k.packet(main, up(SQ), cust.c, { r: 9, label: "✎", ms: 600 });
        cust.rows[0].t.textContent = "1  Asha  Mumbai"; hi(cust.rows[0], "good");
        stat(sqlStat, "1 row changed · every order sees it", "good");
        k.say("One row changed.");
        await k.sleep(1400);

        // 7 · stale copy in the document
        await k.step();
        k.say("order:100 kept its own copy of the city.");
        await k.sleep(600);
        hi(d100.rows[3], "bad"); d100.frame.style.stroke = k.colors.bad;
        k.float(main, 490, 135, "stale copy", "bad");
        stale = 1; metrics();
        stat(docStat, "order 100 still says Pune", "bad");
        await k.sleep(2000);

        // 8 · the families
        await k.step();
        k.say("Five families of data store.");
        await k.tween(main, { opacity: 0 }, 600);
        main.remove();
        k.text(svg, 380, 70, "Pick the store by how the data is read and written", { size: 15, weight: 700 });
        const fams = [
          { label: "Relational", icon: "🧮", sub: "joins · transactions", ex: "orders, payments" },
          { label: "Document", icon: "📄", sub: "whole aggregates", ex: "catalogue, CMS" },
          { label: "Key-value", icon: "🔑", sub: "get/put by key", ex: "sessions, carts" },
          { label: "Wide-column", icon: "📊", sub: "partitioned writes", ex: "IoT, feeds, chat" },
          { label: "Graph", icon: "🕸️", sub: "relationships", ex: "friends, fraud" }
        ];
        for (let i = 0; i < fams.length; i++) {
          const f = fams[i], x = 82 + i * 149;
          const b = k.box(svg, { x, y: 170, w: 138, h: 58, label: f.label, icon: f.icon, sub: f.sub, size: 13.5, tone: i === 0 ? "accent" : "lesson" });
          b.setAttribute("opacity", 0);
          const ex = k.text(svg, x, 225, f.ex, { size: 11.5, tone: "muted" });
          ex.setAttribute("opacity", 0);
          await Promise.all([k.tween(b, { opacity: 1 }, 400), k.tween(ex, { opacity: 1 }, 400)]);
          await k.sleep(250);
        }
        k.text(svg, 380, 280, "NoSQL scales out more easily because it gives up joins and cross-record transactions.", { size: 12, tone: "muted" });
        k.say("Choose by <b>access pattern</b>, not hype.");
        await k.sleep(1200);
        k.done();
      });
    }
  },

  play: {
    title: "Store Matchmaker",
    goal: "Ten workloads arrive. <b>Click the data store</b> that fits each one best. Think about how the data is read and written, not about hype.",
    build(stage, k) {
      const STORES = [
        { id: "sql", label: "Relational", icon: "🧮", sub: "joins · ACID", weak: "hard to scale writes out" },
        { id: "doc", label: "Document", icon: "📄", sub: "JSON aggregates", weak: "weak cross-document joins and transactions" },
        { id: "kv", label: "Key-value", icon: "🔑", sub: "get/put by key", weak: "can only look things up by key" },
        { id: "wide", label: "Wide-column", icon: "📊", sub: "partitioned writes", weak: "can only query by the partition key" },
        { id: "graph", label: "Graph", icon: "🕸️", sub: "nodes + edges", weak: "built for relationships this workload doesn't have" }
      ];
      const POOL = {
        sql: [
          { text: "Order and payment rows must commit together or not at all", why: "a transaction across several rows and tables needs ACID." },
          { text: "Finance keeps inventing new reports joining customers, orders and refunds", why: "ad-hoc joins and GROUP BY are exactly what SQL is built for." },
          { text: "Stock count must never go below zero when two people check out at once", why: "a constraint plus a transaction keeps the count correct." },
          { text: "HR system: employees, departments and payroll that reference each other", why: "normalised tables with foreign keys keep it consistent." }
        ],
        doc: [
          { text: "Product catalogue where every category has different attributes", why: "one flexible document per product instead of dozens of nullable columns.", alt: "sql" },
          { text: "Blog post with its comments and tags, always shown together", why: "the page reads the whole aggregate in one lookup." },
          { text: "User settings: nested preferences, always loaded and saved as a whole", why: "a nested JSON aggregate read and written as a unit.", alt: "kv" }
        ],
        kv: [
          { text: "Login sessions looked up by token, expiring after 30 minutes", why: "get/put by key with a TTL, as fast as it gets." },
          { text: "Shopping cart fetched by user id on every page view", why: "one hot key lookup, nothing else.", alt: "doc" },
          { text: "Feature flags read on every single request", why: "tiny values fetched by name at huge read rates." }
        ],
        wide: [
          { text: "IoT sensors write a million readings a second, read back by device and time", why: "huge write throughput, partitioned by device and sorted by time." },
          { text: "Activity feed: append-heavy, always read by user id, newest first", why: "partition by user id, cluster by time, append forever.", alt: "doc" },
          { text: "Chat history: billions of messages, always read per conversation", why: "partition by conversation, rows sorted by time." }
        ],
        graph: [
          { text: "'People you may know': friends of friends, three hops away", why: "multi-hop traversals are cheap in a graph and painful as SQL joins." },
          { text: "Fraud rings: accounts linked through shared cards and devices", why: "here the relationships are the data." },
          { text: "Permissions inherited through nested groups of any depth", why: "walking edges to any depth is natural in a graph.", alt: "sql" }
        ]
      };
      const ROUNDS = 10;
      const seq = k.shuffle(Object.entries(POOL).flatMap(([ans, items]) => k.shuffle(items).slice(0, 2).map(it => ({ ...it, ans }))));
      let round = 0, score = 0, correct = 0, busy = false;

      const svg = k.svg(760, 320, { label: "A workload card above five data stores" });
      stage.append(svg);
      const storeX = i => 82 + i * 149, STORE_Y = 232;

      const cardG = k.s("g"); svg.append(cardG);
      const fb = k.text(svg, 380, 150, "", { size: 13, weight: 700 });
      const counts = [];
      const boxes = STORES.map((st, i) => {
        const b = k.box(svg, { x: storeX(i), y: STORE_Y, w: 138, h: 62, label: st.label, icon: st.icon, sub: st.sub, size: 13.5 });
        b.style.cursor = "pointer";
        b.setAttribute("tabindex", 0); b.setAttribute("role", "button"); b.setAttribute("aria-label", `Choose ${st.label} store`);
        const go = () => k.run(() => choose(i));
        b.addEventListener("click", go);
        b.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
        counts.push(k.text(svg, storeX(i), 284, "", { size: 12, tone: "muted" }));
        return b;
      });
      const filed = STORES.map(() => 0);

      function wrap(str, max) {
        const out = []; let cur = "";
        for (const w of str.split(" ")) {
          if (cur && (cur + " " + w).length > max) { out.push(cur); cur = w; }
          else cur = cur ? cur + " " + w : w;
        }
        if (cur) out.push(cur);
        return out;
      }
      function drawCard() {
        cardG.replaceChildren();
        const item = seq[round];
        cardG.append(k.s("rect", { x: -240, y: -40, width: 480, height: 80, rx: 12, fill: "surface", stroke: "accent", "stroke-width": 2 }));
        const ls = wrap(item.text, 50);
        ls.forEach((l, j) => k.text(cardG, 0, 5 - (ls.length - 1) * 9 + j * 18, l, { size: 14, weight: 600 }));
        k.text(cardG, -226, -26, "WORKLOAD", { size: 11, anchor: "start", tone: "muted", weight: 700 });
        k.place(cardG, { tx: 380, ty: 30, scale: 1 });
        cardG.setAttribute("opacity", 0);
        return k.tween(cardG, { ty: 70, opacity: 1 }, 400, k.ease.out);
      }
      function update() {
        k.hud({ Workload: `${Math.min(round + 1, ROUNDS)} / ${ROUNDS}`, Score: score });
        filed.forEach((n, i) => { counts[i].textContent = n ? `${n} filed here` : ""; });
      }

      async function choose(i) {
        if (busy || round >= ROUNDS) return;
        busy = true;
        const item = seq[round], st = STORES[i];
        const best = STORES.findIndex(s => s.id === item.ans);
        await k.tween(cardG, { tx: storeX(i), ty: STORE_Y - 20, scale: 0.2, opacity: 0.2 }, 450, k.ease.in);
        cardG.replaceChildren();
        let wait = 1700;
        if (i === best) {
          score += 10; correct++; filed[i]++;
          k.tone(boxes[i], "good"); k.float(svg, storeX(i), STORE_Y - 40, "+10", "good");
          fb.textContent = `✓ ${st.label}`; fb.style.fill = k.colors.good;
          k.say(`<b>${st.label}</b> fits: ${item.why}`);
        } else if (item.alt === st.id) {
          score += 5; filed[best]++;
          k.tone(boxes[i], "warn"); k.float(svg, storeX(i), STORE_Y - 40, "+5", "warn");
          k.tone(boxes[best], "good"); k.pulse(boxes[best]).catch(() => {});
          fb.textContent = `Workable, but ${STORES[best].label} fits better`; fb.style.fill = k.colors.warn;
          k.say(`${st.label} could work, but <b>${STORES[best].label}</b> fits best: ${item.why}`);
          wait = 3000;
        } else {
          filed[best]++;
          k.tone(boxes[i], "bad"); k.float(svg, storeX(i), STORE_Y - 40, "✗", "bad");
          k.tone(boxes[best], "good"); k.pulse(boxes[best]).catch(() => {});
          fb.textContent = `✗ ${st.label}: ${st.weak}`; fb.style.fill = k.colors.bad;
          k.say(`Not ${st.label}. Better: <b>${STORES[best].label}</b>, because ${item.why}`);
          wait = 3200;
        }
        round++; update();
        await k.sleep(wait);
        boxes.forEach(b => k.tone(b, "neutral"));
        fb.textContent = "";
        if (round >= ROUNDS) return end();
        k.say("Where should this one live?");
        await drawCard();
        busy = false;
      }

      function end() {
        const text = `You placed <b>${correct} of ${ROUNDS}</b> workloads in their best store (score ${score}/100). Joins and transactions → relational; whole aggregates → document; lookups by key → key-value; firehose writes read by partition → wide-column; relationships → graph.`;
        if (score < 40) k.lose(text);
        else k.win({ stars: k.starsFor(score, 60, 85), text });
      }

      k.say("Read the workload, then click the store that fits it. Ask: how is this data read, and how is it written?");
      update();
      k.run(async () => { busy = true; await drawCard(); busy = false; });
    }
  }
});
