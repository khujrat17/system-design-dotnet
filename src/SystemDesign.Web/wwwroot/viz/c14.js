"use strict";
/* Concept 14 · API design. Watch: offset pagination duplicating and skipping rows on a changing feed, cursor pagination
   staying stable, the cost of deep offsets, and REST / gRPC / GraphQL by caller. Play: API Architect. */
Lab.define(14, {
  watch: {
    title: "The post that showed up twice",
    intro: "A feed of posts, newest first, read 5 at a time while posts are added and deleted. Follow which rows each request returns.",
    steps: [
      { label: "Offset", tag: "concept", title: "Skip N, take 5",
        body: "<p>The feed shows 5 posts per page using <b>offset pagination</b>: <code>?offset=0&amp;limit=5</code> means skip 0 rows, take 5.</p><p>Page 1 returns posts 10 to 6.</p>",
        idea: "Offset is simple and lets users jump to any page number. It counts positions, not rows.",
        changed: ["Window over rows 1–5", "Page 1: posts 10, 9, 8, 7, 6"] },
      { label: "Duplicate", tag: "failure", title: "A new post shifts every row",
        body: "<p>While the user reads page 1, <b>post 11</b> is published at the top. Every row moves down one position.</p><p>Page 2 asks to <b>skip 5, take 5</b>, and post 6 is now at position 6.</p>",
        idea: "On a changing feed, offset shows the same item twice when rows are inserted above the reader.",
        changed: ["Post 11 inserted at the top", "Post 6 appears on page 1 and page 2"] },
      { label: "Gap", tag: "failure", title: "A delete hides a post",
        body: "<p>A delete does the opposite. A moderator removes <b>post 8</b> after page 1 is shown. Rows shift <b>up</b>.</p><p>Skipping 5 now jumps past <b>post 5</b>: the user never sees it.</p>",
        idea: "Offset positions move under the user’s feet: inserts cause duplicates, deletes cause gaps.",
        changed: ["Post 8 deleted", "Post 5 never shown"] },
      { label: "Cursor", tag: "technique", title: "Continue from the last id",
        body: "<p><b>Cursor (keyset) pagination</b>: the response tells the app where to continue, using the <b>last id it saw</b>.</p><p><code>{ items: [10…6], next: 6 }</code></p>",
        idea: "A cursor names a row, not a position.",
        changed: ["Page 1 returns a <code>next</code> cursor"] },
      { label: "Stable", tag: "fix", title: "Inserts and deletes can’t shift it",
        body: "<p>Post 11 is published <b>and</b> post 8 is deleted. Page 2 asks <code>?after=6</code>, which runs <code>WHERE id &lt; 6 ORDER BY id DESC LIMIT 5</code>.</p><p>Result: 5, 4, 3, 2, 1.</p>",
        idea: "Changes elsewhere in the table can’t move the row the cursor points at.",
        changed: ["Page 2: posts 5–1", "0 duplicates, 0 gaps"] },
      { label: "Deep pages", tag: "trade-off", title: "Page 50,000 is slow with offset",
        body: "<p>A million-row table, 20 per page. <code>OFFSET 999980 LIMIT 20</code> makes the database <b>read and throw away 999,980 rows</b>.</p><p><code>WHERE id &gt; 999980 LIMIT 20</code> seeks through the index: <b>20 rows</b>, on any page.</p>",
        idea: "Offset cost grows with depth; cursor cost stays flat. The trade-off: no “jump to page 7”.",
        changed: ["Offset: 1,000,000 rows read", "Cursor: 20 rows read"] },
      { label: "Protocols", tag: "result", title: "Pick the protocol by the caller",
        body: "<p>Browsers and partners: <b>REST</b> + JSON, universal and cacheable. Your own high-volume services: <b>gRPC</b>, small binary messages over HTTP/2.</p><p>Many screens wanting different fields: <b>GraphQL</b>, one round trip for exactly what’s needed.</p>",
        idea: "Interview answer: “REST for public APIs, gRPC between services, cursor pagination for big or changing lists.”",
        changed: ["REST and GraphQL: 1 round trip", "gRPC: 3 fast calls"] }
    ],
    learn: [
      { text: "How offset pagination works", step: 0 },
      { text: "Why offset duplicates and skips rows on a changing feed", step: 2 },
      { text: "How cursor (keyset) pagination stays stable", step: 4 },
      { text: "Why deep offsets are slow", step: 5 },
      { text: "When to use REST, gRPC or GraphQL", step: 6 }
    ],
    build(stage, k) {
      const svg = k.svg(760, 340, { label: "A posts table on the left and the pages an app receives on the right" });
      stage.append(svg);
      const feedTitle = k.text(svg, 130, 26, "posts table, newest first", { size: 12, tone: "muted" });
      const feedG = k.s("g"); svg.append(feedG);
      const win = k.s("rect", { x: 46, y: 38, width: 168, height: 0, rx: 6, fill: "none", stroke: "accent", "stroke-width": 2.5, opacity: 0 });
      svg.append(win);
      const pageG = k.s("g"); svg.append(pageG);
      const req = k.text(svg, 300, 70, "", { size: 13, anchor: "start", mono: true, weight: 700 });
      const resp = k.text(svg, 300, 94, "", { size: 12, anchor: "start", mono: true, tone: "muted" });
      const L1 = k.text(svg, 300, 145, "", { size: 12, anchor: "start", tone: "muted" });
      const L2 = k.text(svg, 300, 205, "", { size: 12, anchor: "start", tone: "muted" });
      const verdict = k.text(svg, 300, 255, "", { size: 14, anchor: "start", weight: 800 });

      const rowY = i => 50 + i * 24;
      const chipX = j => 390 + j * 46;
      const lineY = line => line === 0 ? 140 : 200;
      let rows = [];

      function makeRows(ids) {
        feedG.replaceChildren();
        rows = ids.map((id, i) => ({ id, g: k.box(feedG, { x: 130, y: rowY(i), w: 150, h: 20, label: `post ${id}`, size: 11.5, r: 5 }) }));
      }
      async function layoutRows() { await Promise.all(rows.map((r, i) => k.tween(r.g, { tx: 130, ty: rowY(i) }, 450))); }
      async function insertTop(id) {
        const g = k.box(feedG, { x: 130, y: rowY(0) - 24, w: 150, h: 20, label: `post ${id} (new)`, size: 11.5, r: 5, tone: "accent" });
        g.setAttribute("opacity", 0);
        rows.unshift({ id, g });
        await Promise.all([k.tween(g, { opacity: 1 }, 450), layoutRows()]);
      }
      async function deleteRow(id) {
        const i = rows.findIndex(r => r.id === id);
        const [r] = rows.splice(i, 1);
        k.tone(r.g, "bad");
        await k.tween(r.g, { opacity: 0, tx: 60 }, 500);
        r.g.remove();
        await layoutRows();
      }
      async function showWindow(a, n) {
        win.setAttribute("opacity", 1);
        await k.tween(win, { y: rowY(a) - 12, height: n * 24 }, 550);
      }
      async function fetchPage(line, first, n) {
        const out = [], moves = [];
        (line === 0 ? L1 : L2).textContent = line === 0 ? "page 1" : "page 2";
        for (let j = 0; j < n && first + j < rows.length; j++) {
          const r = rows[first + j];
          k.tone(r.g, "accent");
          const chip = k.dot(pageG, 130, rowY(first + j), { r: 16, tone: "accent", label: String(r.id), size: 12 });
          moves.push(k.tween(chip, { tx: chipX(j), ty: lineY(line) }, 600));
          out.push({ id: r.id, chip });
          await k.sleep(110);
        }
        await Promise.all(moves);
        rows.forEach(r => { if (r.g.dataset.tone === "accent" && !String(r.g.label.textContent).includes("new")) k.tone(r.g, "neutral"); });
        return out;
      }
      function mark(chips, id, tone) { for (const c of chips) if (c.id === id) c.chip.circle.style.fill = k.colors[tone]; }
      function clearPages() {
        pageG.replaceChildren();
        for (const t of [req, resp, L1, L2, verdict]) t.textContent = "";
        win.setAttribute("opacity", 0);
      }
      const setVerdict = (str, tone) => { verdict.textContent = str; verdict.style.fill = k.colors[tone]; };

      let pages = 0, dupes = 0, skipped = 0, rowsRead = 0;
      const metrics = () => k.hud({ "Pages fetched": pages, "Duplicates shown": dupes, "Posts skipped": skipped, "Rows read (last query)": k.fmt(rowsRead) });
      makeRows([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
      metrics();

      k.run(async () => {
        // 1 · offset, page 1
        await k.step();
        k.say("Page 1: skip 0, take 5.");
        await k.sleep(800);
        req.textContent = "GET /posts?offset=0&limit=5";
        await showWindow(0, 5);
        const p1 = await fetchPage(0, 0, 5);
        pages++; rowsRead = 5; metrics();
        k.say("Page 1 shows posts 10 to 6.");

        // 2 · insert → duplicate
        await k.step();
        k.say("Someone publishes post 11 while the user reads.");
        await insertTop(11);
        await k.sleep(1000);
        k.say("Page 2: skip 5, take 5.");
        req.textContent = "GET /posts?offset=5&limit=5";
        await showWindow(5, 5);
        const p2 = await fetchPage(1, 5, 5);
        pages++; rowsRead = 10; dupes++; metrics();
        mark(p1, 6, "bad"); mark(p2, 6, "bad");
        setVerdict("✖ post 6 shown twice", "bad");
        k.say("Post 6 appears <b>twice</b>.");

        // 3 · delete → gap
        await k.step();
        clearPages();
        makeRows([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
        k.say("Same feed, page 1 again…");
        req.textContent = "GET /posts?offset=0&limit=5";
        await showWindow(0, 5);
        await fetchPage(0, 0, 5);
        pages++; rowsRead = 5; metrics();
        k.say("…and a moderator deletes post 8.");
        await deleteRow(8);
        req.textContent = "GET /posts?offset=5&limit=5";
        await showWindow(5, 4);
        await fetchPage(1, 5, 5);
        pages++; rowsRead = 10; skipped++; metrics();
        setVerdict("✖ post 5 was never shown", "bad");
        k.say("Skipping 5 jumped straight past <b>post 5</b>.");

        // 4 · cursor, page 1
        await k.step();
        clearPages();
        makeRows([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
        k.say("Cursor pagination: the response says where to continue.");
        await k.sleep(800);
        req.textContent = "GET /posts?limit=5";
        await showWindow(0, 5);
        const c1 = await fetchPage(0, 0, 5);
        pages++; rowsRead = 5; metrics();
        resp.textContent = "→ { items: [10…6], next: 6 }";
        k.say("Page 1 comes back with <code>next: 6</code>.");

        // 5 · cursor survives insert + delete
        await k.step();
        k.say("Post 11 is published and post 8 is deleted.");
        await insertTop(11);
        await deleteRow(8);
        await k.sleep(600);
        req.textContent = "GET /posts?after=6&limit=5";
        resp.textContent = "→ WHERE id < 6 ORDER BY id DESC LIMIT 5";
        const start = rows.findIndex(r => r.id < 6);
        await showWindow(start, 5);
        const c2 = await fetchPage(1, start, 5);
        pages++; rowsRead = 5; metrics();
        for (const c of [...c1, ...c2]) c.chip.circle.style.fill = k.colors.good;
        setVerdict("✔ 5 4 3 2 1: no duplicates, no gaps", "good");
        k.say("The cursor points at a row, so nothing shifted.");

        // 6 · cost of deep pages
        await k.step();
        clearPages();
        feedG.replaceChildren(); feedTitle.textContent = "";
        k.say("Page 50,000 of a million rows, 20 per page.");
        const m1 = k.meter(svg, { x: 300, y: 140, w: 300, max: 1000000, label: "OFFSET 999,980 LIMIT 20 → rows read", tone: "bad" });
        const m2 = k.meter(svg, { x: 300, y: 205, w: 300, max: 1000000, label: "WHERE id > 999,980 LIMIT 20 → rows read", tone: "good" });
        const n1 = k.text(svg, 612, 150, "0", { size: 13, anchor: "start", weight: 800, tone: "bad" });
        const n2 = k.text(svg, 612, 215, "0", { size: 13, anchor: "start", weight: 800, tone: "good" });
        await k.sleep(1000);
        for (let p = 1; p <= 20; p++) {
          m1.set(p / 20 * 1000000); n1.textContent = k.fmt(p * 50000);
          rowsRead = p * 50000; metrics();
          await k.sleep(90);
        }
        await k.sleep(800);
        m2.set(20); n2.textContent = "20";
        rowsRead = 20; metrics();
        k.say("Offset: 1,000,000 rows read. Cursor: <b>20</b>.");

        // 7 · protocol by caller
        await k.step();
        svg.replaceChildren();
        k.say("REST, gRPC and GraphQL, each with its typical caller.");
        const cols = [
          { x: 130, name: "REST + JSON", icon: "🌐", caller: "Browsers, partners", why: "universal, cacheable", tone: "accent", trips: 1, r: 15, tag: "GET" },
          { x: 380, name: "gRPC", icon: "⚡", caller: "Service → service", why: "small binary, HTTP/2, fast", tone: "good", trips: 3, r: 6, tag: "" },
          { x: 630, name: "GraphQL", icon: "🧩", caller: "Many app screens", why: "ask for exactly the fields", tone: "lesson", trips: 1, r: 13, tag: "Q" }
        ];
        for (const c of cols) {
          k.line(svg, { x: c.x, y: 80 }, { x: c.x, y: 230 }, { dashed: true });
          k.box(svg, { x: c.x, y: 70, w: 170, h: 44, label: c.caller, size: 12.5 });
          k.box(svg, { x: c.x, y: 240, w: 200, h: 52, label: c.name, icon: c.icon, sub: c.why, tone: c.tone });
        }
        await k.sleep(800);
        await Promise.all(cols.map(async c => {
          for (let t = 0; t < c.trips; t++) {
            await k.packet(svg, { x: c.x, y: 92 }, { x: c.x, y: 214 }, { r: c.r, label: c.tag, size: 11, ms: c.trips > 1 ? 300 : 700 });
            await k.packet(svg, { x: c.x, y: 214 }, { x: c.x, y: 92 }, { r: c.r, tone: "good", ms: c.trips > 1 ? 300 : 700 });
          }
        }));
        k.say("Pick the protocol by <b>who calls it</b>.");
        await k.sleep(1200);
        k.done();
      });
    }
  },

  play: {
    title: "API Architect",
    goal: "Eight callers need an API. For each, pick the protocol or pagination style and watch the requests flow. Best choice +100, workable +40. Score 700 for 3 stars.",
    build(stage, k) {
      const P3 = ["REST", "gRPC", "GraphQL"], PG = ["Offset ?page=N", "Cursor ?after=id"];
      const SCEN = [
        { client: "🌐 Browsers & devs", server: "🌦️ Weather API", title: "Public weather API",
          ctx: "Thousands of third-party developers and web pages call it, in every language.", opts: P3,
          out: [
            { pts: 100, trips: 1, tag: "GET", r: 14, why: "Plain HTTP GET + JSON: any language or browser can call it, and a CDN can cache the answers." },
            { pts: 0, bounce: "browser can’t call gRPC", why: "Browsers can’t speak gRPC without a proxy, and outside developers want URLs they can curl." },
            { pts: 40, trips: 1, tag: "Q", r: 12, why: "It works, but every request is a POST to one URL, so simple public lookups lose CDN caching." }] },
        { client: "🛒 Checkout service", server: "🏷️ Pricing service", title: "Internal call, 20,000 per second",
          ctx: "Two of your own backend services, same team, very high volume.", opts: P3,
          out: [
            { pts: 40, trips: 3, tag: "{ }", r: 14, ms: 600, why: "Works, but text JSON is bigger and slower to parse. At 20,000 calls a second that’s a lot of wasted CPU." },
            { pts: 100, trips: 3, tag: "", r: 6, ms: 240, why: "Binary Protobuf over one HTTP/2 connection with a typed contract: small, fast and made for service-to-service." },
            { pts: 0, trips: 3, tag: "Q", r: 13, ms: 800, why: "Parsing and resolving a query on every internal call adds cost with no benefit: both sides want the same fixed shape." }] },
        { client: "📱 Mobile app", server: "🖥️ Backend", title: "Mobile home screen",
          ctx: "Needs profile + 3 latest orders + recommendations, only a few fields of each, on a slow network.", opts: P3,
          out: [
            { pts: 40, trips: 3, tag: "GET", r: 14, why: "Three round trips on a slow network, each returning whole objects the screen mostly ignores (over-fetching)." },
            { pts: 40, trips: 3, tag: "", r: 7, why: "Fast messages, but still three calls (or a custom endpoint per screen), and the web version needs a proxy." },
            { pts: 100, trips: 1, tag: "Q", r: 12, why: "One query, one round trip, exactly the fields this screen needs." }] },
        { client: "🚚 Fleet tracker", server: "🗺️ Routing service", title: "GPS stream between services",
          ctx: "Thousands of trucks report positions continuously to an internal service.", opts: P3,
          out: [
            { pts: 40, trips: 4, tag: "POST", r: 17, ms: 450, why: "One HTTP request per position: lots of overhead for what is really a continuous stream." },
            { pts: 100, stream: 8, r: 6, why: "gRPC has built-in streaming: one long-lived call carries a steady flow of tiny binary messages." },
            { pts: 0, trips: 4, tag: "M", r: 13, ms: 500, why: "GraphQL is built for flexible reads by clients, not high-volume streams between two services." }] },
        { client: "🤝 Partner companies", server: "📦 Orders API", title: "Partner integration",
          ctx: "Dozens of partners in many languages integrate with your orders. They need docs and a stable contract.", opts: P3,
          out: [
            { pts: 100, trips: 1, tag: "GET", r: 14, why: "REST + an OpenAPI document: every partner can call it and test it with curl, and /v1/ keeps the contract stable." },
            { pts: 40, trips: 1, tag: "", r: 7, why: "Possible with shared .proto files, but harder for partners to explore, debug and call from any stack." },
            { pts: 40, trips: 1, tag: "Q", r: 12, why: "Flexible, but you must police query cost and every partner must learn your schema. REST is simpler to support." }] },
        { client: "📱 Feed app", server: "🖥️ Posts API", title: "Infinite scroll, new posts every second",
          ctx: "Users scroll down a feed while new posts keep arriving at the top.", opts: PG,
          out: [
            { pts: 0, chips: [[20, 19, 18, 17], [17, 16, 15, 14]], bad: 17, why: "New posts pushed every row down between requests, so post 17 showed up twice." },
            { pts: 100, chips: [[20, 19, 18, 17], [16, 15, 14, 13]], why: "The cursor says “older than 17”, so new posts at the top can’t shift the next page." }] },
        { client: "🛠️ Admin screen", server: "🖥️ Countries API", title: "250 country codes, jump to page 7",
          ctx: "A small table that almost never changes. Admins click page numbers to jump around.", opts: PG,
          out: [
            { pts: 100, chips: [["p1"], ["p7"]], why: "Small, stable table: offset is cheap here and lets admins jump straight to page 7." },
            { pts: 40, chips: [["p1"], ["p2"]], bad: "p2", why: "A cursor can only say “next”. Admins can’t jump to page 7, and 250 stable rows don’t need it." }] },
        { client: "📊 Analytics job", server: "🗄️ Orders DB", title: "Export 50 million orders",
          ctx: "A nightly job reads every order, 20 at a time.", opts: PG,
          out: [
            { pts: 0, scan: 49999980, why: "Deep offsets read and discard every skipped row: the last pages each scan ~50 million rows. The export crawls." },
            { pts: 100, scan: 20, why: "<code>WHERE id &gt; last LIMIT 20</code> seeks through the index: every page costs the same 20 rows." }] }
      ];
      const rounds = k.shuffle(SCEN), N = rounds.length;
      let idx = 0, score = 0, best = 0;

      const svg = k.svg(740, 300, { label: "A client and a server with requests travelling between them" });
      stage.append(svg);
      const title = k.text(svg, 370, 34, "", { size: 16, weight: 800 });
      const scene = k.s("g"); svg.append(scene);
      const verdict = k.text(svg, 370, 286, "", { size: 14, weight: 800 });
      const C = { x: 120, y: 120 }, S = { x: 620, y: 120 };

      function hud() { k.hud({ Caller: `${Math.min(idx + 1, N)} / ${N}`, Score: score, "Best picks": best }); }

      function setup() {
        const sc = rounds[idx];
        hud();
        scene.replaceChildren();
        verdict.textContent = "";
        title.textContent = sc.title;
        k.line(scene, C, S, { dashed: true });
        scene.client = k.box(scene, { ...C, label: sc.client, w: 190, h: 48, size: 12.5 });
        scene.server = k.box(scene, { ...S, label: sc.server, w: 190, h: 48, size: 12.5 });
        k.say(`<b>${sc.title}.</b> ${sc.ctx} Which do you choose?`);
        k.clearTools();
        let picked = false;
        const row = k.choices(sc.opts.map((label, i) => ({ label, i })), (o, btn) => {
          if (picked) return;
          picked = true;
          row.querySelectorAll("button").forEach(b => { b.disabled = true; });
          k.run(() => resolve(sc, o.i, btn, row));
        });
      }

      async function animate(o) {
        const from = { x: C.x + 95, y: C.y }, to = { x: S.x - 95, y: S.y };
        if (o.bounce) {
          const d = k.dot(scene, from.x, from.y, { r: 10, tone: "accent" });
          await k.tween(d, { tx: 370 }, 600);
          d.circle.style.fill = k.colors.bad;
          k.float(scene, 370, C.y - 20, `✖ ${o.bounce}`, "bad");
          await k.tween(d, { tx: from.x, opacity: 0 }, 500);
          d.remove();
          k.tone(scene.client, "bad");
          return;
        }
        if (o.stream) {
          k.tone(scene.server, "good");
          const all = [];
          for (let i = 0; i < o.stream; i++) {
            all.push(k.packet(scene, from, to, { r: o.r, tone: "good", ms: 700 }));
            await k.sleep(140);
          }
          await Promise.all(all);
          return;
        }
        if (o.chips) {
          for (let line = 0; line < 2; line++) {
            await k.packet(scene, from, to, { r: 11, ms: 500, label: line ? "2" : "1", size: 11 });
            await k.packet(scene, to, from, { r: 9, ms: 500, tone: "good" });
            k.text(scene, 70, 190 + line * 44, line ? "page 2" : "page 1", { size: 12, anchor: "start", tone: "muted" });
            o.chips[line].forEach((id, j) => {
              const d = k.dot(scene, 160 + j * 44, 186 + line * 44, { r: 17, tone: id === o.bad ? "bad" : "accent", label: String(id), size: 12 });
              if (id === o.bad) k.pulse(d).catch(() => {});
            });
            await k.sleep(300);
          }
          return;
        }
        if (o.scan != null) {
          await k.packet(scene, from, to, { r: 9, ms: 500 });
          const m = k.meter(scene, { x: 520, y: 190, w: 200, max: 50000000, tone: o.scan > 1000 ? "bad" : "good", label: "rows read for the last page" });
          const n = k.text(scene, 620, 225, "0", { size: 14, weight: 800, tone: o.scan > 1000 ? "bad" : "good" });
          k.tone(scene.server, o.scan > 1000 ? "bad" : "good");
          const steps = o.scan > 1000 ? 20 : 1;
          for (let p = 1; p <= steps; p++) {
            m.set(o.scan * p / steps); n.textContent = k.fmt(Math.round(o.scan * p / steps));
            await k.sleep(o.scan > 1000 ? 110 : 200);
          }
          await k.packet(scene, to, from, { r: 9, ms: 500, tone: o.scan > 1000 ? "warn" : "good" });
          return;
        }
        for (let t = 0; t < o.trips; t++) {
          await k.packet(scene, from, to, { r: o.r, label: o.tag, size: 11, ms: o.ms || 550 });
          await k.packet(scene, to, from, { r: o.r, tone: "good", ms: o.ms || 550 });
        }
        if (o.trips > 1) k.float(scene, 370, C.y - 24, `${o.trips} round trips`, o.pts === 100 ? "good" : "warn");
      }

      async function resolve(sc, i, btn, row) {
        const o = sc.out[i];
        const top = Math.max(...sc.out.map(x => x.pts));
        btn.classList.add(o.pts === top ? "right" : "wrong");
        if (o.pts !== top) row.querySelectorAll("button")[sc.out.findIndex(x => x.pts === top)].classList.add("right");
        await animate(o);
        score += o.pts;
        if (o.pts === top) best++;
        hud();
        verdict.textContent = o.pts === top ? "✔ Best fit  +100" : o.pts > 0 ? `≈ Workable  +${o.pts}` : "✖ Poor fit  +0";
        verdict.style.fill = k.colors[o.pts === top ? "good" : o.pts > 0 ? "warn" : "bad"];
        k.say(`${o.pts === top ? "✔" : o.pts > 0 ? "≈" : "✖"} ${o.why}`);
        k.button(idx + 1 < N ? "Next caller →" : "See results", () => {
          idx++;
          if (idx < N) setup(); else end();
        }, { primary: true });
      }

      function end() {
        k.clearTools();
        const text = `Score <b>${score}</b> of ${N * 100}, with the best pick for <b>${best} of ${N}</b> callers. Browsers and partners: REST. Your own high-volume services: gRPC. Many screens wanting different fields: GraphQL. Big or changing lists: cursor; small stable tables: offset is fine.`;
        if (score < 350) k.lose(`${text} Think about who is calling and what they need before picking.`);
        else k.win({ stars: k.starsFor(score, 500, 700), text });
      }

      setup();
    }
  }
});
