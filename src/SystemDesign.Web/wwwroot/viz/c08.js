"use strict";
/* Concept 8 · Indexing. Watch: full table scan vs B-tree lookup, a range seek, and the write cost of indexes.
   Play: Index Architect, choose indexes for a workload, scored on rows read plus index writes. */
Lab.define(8, {
  watch: {
    title: "Finding customer 42 without reading everything",
    intro: "Count how many rows each approach has to read to answer the same query, and what every index costs on writes.",
    steps: [
      { label: "The query", tag: "problem", title: "Where are customer 42’s orders?",
        body: "<p>The Orders table holds rows in <b>insert order</b>. We want every order for <code>CustomerId = 42</code>.</p><p>Nothing tells the database where those rows are. They could be anywhere.</p>",
        idea: "Without extra structure, a table is just a pile of rows in the order they arrived.",
        changed: ["32 rows appear, unsorted", "Query: <code>WHERE CustomerId = 42</code>"] },
      { label: "Full scan", tag: "failure", title: "Read every row and test it",
        body: "<p>With no index the database does a <b>full table scan</b>: read row 1, check it, read row 2…</p><p>It finds 2 matches but reads <b>all 32</b> rows. With 2,000,000 orders it reads 2,000,000 rows, every time the query runs.</p>",
        idea: "A scan is <b>linear</b>: double the table, double the work.",
        changed: ["Full scan: 32 rows read", "2 matches found"] },
      { label: "B-tree", tag: "concept", title: "Build a sorted index",
        body: "<p><code>CREATE INDEX IX_CustomerId</code> builds a <b>B-tree</b>: keys kept <b>sorted</b>, with a root that says which leaf holds which range.</p><p>Each leaf entry points at its row in the table.</p>",
        idea: "An index is a second, sorted copy of one column, with pointers back to the rows.",
        changed: ["Root + 4 sorted leaves appear", "Leaves linked left to right"] },
      { label: "Seek", tag: "technique", title: "Root → leaf → rows",
        body: "<p>42 falls in the 30–49 range, so the root sends us to one leaf. The leaf lists its keys in order and points straight at the two matching rows.</p><p>A B-tree stays shallow: about <b>4 levels</b> even for 50 million rows. Lookups are <b>logarithmic</b>.</p>",
        idea: "Seek, don’t scan: a handful of reads instead of the whole table.",
        changed: ["4 reads instead of 32", "Only the 30–49 leaf touched"] },
      { label: "Range", tag: "technique", title: "Walk the sorted leaves",
        body: "<p><code>BETWEEN 40 AND 59</code>: seek to 40, then walk right along the <b>linked leaves</b> until 59.</p><p>A <b>hash index</b> finds one key fast but can’t walk a range in order. That is why relational databases default to <b>B-trees</b>.</p>",
        idea: "Sorted order makes ranges, <code>ORDER BY</code> and prefixes cheap too.",
        changed: ["Two neighbouring leaves read", "7 matching rows fetched"] },
      { label: "Write cost", tag: "trade-off", title: "Every index slows every INSERT",
        body: "<p>Say the table also has indexes on <b>CreatedAt</b> and <b>Total</b>. One INSERT must update the table <b>and</b> every index, each kept in sorted order.</p><p>In the C# demo, inserting 200,000 rows with 3 indexes is several times slower than with none.</p>",
        idea: "Indexes make reads cheaper and writes more expensive. Ten indexes on a write-heavy table really hurt.",
        changed: ["1 row → 4 writes", "All three indexes turn amber"] },
      { label: "Prune", tag: "fix", title: "Index what you filter and sort on",
        body: "<p>Nobody queries by <b>Total</b>, so drop that index. The next INSERT costs <b>3 writes</b> instead of 4.</p><p>Mind <b>composite order</b>: <code>(CustomerId, CreatedAt)</code> helps “customer 42 by date”, not “all orders by date”.</p>",
        idea: "Interview answer: “index the columns my frequent queries filter on, filtered column first; skip the rest.”",
        changed: ["IX Total dropped", "Writes per INSERT: 4 → 3"] }
    ],
    learn: [
      { text: "Why a full table scan is linear", step: 1 },
      { text: "How a B-tree seek finds rows in a few reads", step: 3 },
      { text: "Why B-trees handle ranges and hash indexes don’t", step: 4 },
      { text: "The write cost of every index", step: 5 },
      { text: "Which columns deserve an index", step: 6 }
    ],
    build(stage, k) {
      const svg = k.svg(760, 330, { label: "An unsorted orders table on the left and a B-tree index on the right" });
      stage.append(svg);

      /* ----- the table: 32 rows in insert order, each showing its CustomerId (fixed, so Back/replay is identical) ----- */
      const N = 32, COLS = 8;
      const ids = [73, 18, 55, 91, 27, 64, 42, 36, 88, 13, 47, 70, 22, 95, 51, 33,
                   66, 15, 80, 29, 58, 11, 42, 77, 39, 84, 24, 61, 97, 45, 19, 68];
      const m1 = 6, m2 = 22;
      const cellPos = i => ({ x: 52 + (i % COLS) * 44, y: 96 + Math.floor(i / COLS) * 38 });
      const query = k.text(svg, 206, 28, "SELECT * FROM Orders WHERE CustomerId = 42", { size: 11.5, weight: 700, mono: true });
      k.text(svg, 206, 56, "Orders table: 32 rows in insert order (showing CustomerId)", { size: 11.5, tone: "muted" });
      const cells = ids.map((id, i) => {
        const p = cellPos(i);
        const g = k.s("g"); svg.append(g);
        const rect = k.s("rect", { x: p.x - 19, y: p.y - 15, width: 38, height: 30, rx: 6, fill: "surface", stroke: "line", "stroke-width": 1.2 });
        g.append(rect);
        k.text(g, p.x, p.y + 4.5, String(id), { size: 12, mono: true });
        g.setAttribute("opacity", 0);
        return { rect, id, g };
      });
      const paint = (c, tone) => { c.rect.style.fill = k.colors[tone]; };
      const resetCells = () => cells.forEach(c => paint(c, "surface"));
      const cursor = k.s("rect", { x: -22, y: -18, width: 44, height: 36, rx: 8, fill: "none", stroke: "accent", "stroke-width": 3, opacity: 0 });
      svg.append(cursor);
      const scanTxt = k.text(svg, 206, 258, "", { size: 14, weight: 700 });

      /* ----- the index (drawn later): root + 4 sorted leaves ----- */
      const idxG = k.s("g"); idxG.setAttribute("opacity", 0); svg.append(idxG);
      k.text(idxG, 600, 30, "B-tree index on CustomerId (sorted)", { size: 12, weight: 700 });
      const ROOT = { x: 600, y: 80 };
      const root = k.box(idxG, { ...ROOT, w: 240, h: 40, label: "<30 | 30–49 | 50–69 | ≥70", size: 12 });
      const RANGES = [[10, 29], [30, 49], [50, 69], [70, 99]];
      const leafPos = j => ({ x: 492 + j * 72, y: 172 });
      const leaves = RANGES.map(([a, b], j) => {
        const n = ids.filter(v => v >= a && v <= b).length;
        k.line(idxG, { x: ROOT.x - 90 + j * 60, y: ROOT.y + 20 }, { x: leafPos(j).x, y: leafPos(j).y - 22 });
        if (j > 0) k.line(idxG, { x: leafPos(j - 1).x + 32, y: leafPos(j).y }, { x: leafPos(j).x - 32, y: leafPos(j).y }, { dashed: true, arrow: true });
        return k.box(idxG, { ...leafPos(j), w: 64, h: 44, label: `${a}–${b}`, sub: `${n} keys`, size: 13.5 });
      });
      const leafTxt = k.text(svg, 600, 222, "", { size: 11.5, mono: true });
      const idxTxt = k.text(svg, 600, 258, "", { size: 14, weight: 700 });
      const sortedIn = (a, b) => ids.map((v, i) => ({ v, i })).filter(e => e.v >= a && e.v <= b).sort((x, y) => x.v - y.v);

      /* ----- write-cost props (shown at the end) ----- */
      const wG = k.s("g"); wG.setAttribute("opacity", 0); svg.append(wG);
      const INS = { x: 62, y: 302 };
      k.box(wG, { ...INS, w: 104, h: 36, label: "INSERT", icon: "➕", size: 12 });
      const ix2 = k.box(wG, { x: 520, y: 302, w: 130, h: 34, label: "IX CreatedAt", size: 12 });
      const ix3 = k.box(wG, { x: 672, y: 302, w: 130, h: 34, label: "IX Total", size: 12 });
      const wTxt = k.text(wG, 300, 307, "", { size: 13, weight: 700 });

      let scanReads = 0, ireads = 0, cur = 0, matches = 0, writesPer = 1;
      const metrics = () => k.hud({ Matches: matches, "Writes / INSERT": writesPer, "Full scan reads": scanReads, "Reads this query": cur });
      metrics();
      const bump = () => { ireads++; cur = ireads; idxTxt.textContent = `Index: ${ireads} reads`; metrics(); };

      k.run(async () => {
        // 1 · the query
        await k.step();
        k.say("32 orders, stored in the order they arrived.");
        await Promise.all(cells.map((c, i) => k.sleep(i * 70).then(() => k.tween(c.g, { opacity: 1 }, 300))));
        await k.sleep(800);
        k.say("Where is customer 42?");
        query.style.fill = k.colors.accent;
        await k.sleep(1200);

        // 2 · full table scan
        await k.step();
        k.say("No index: read every row and test it.");
        cursor.setAttribute("opacity", 1);
        for (let i = 0; i < N; i++) {
          k.place(cursor, { tx: cellPos(i).x, ty: cellPos(i).y });
          scanReads++; cur = scanReads; scanTxt.textContent = `Full scan: ${scanReads} rows read`;
          if (cells[i].id === 42) { matches++; paint(cells[i], "goodSoft"); k.float(svg, cellPos(i).x, cellPos(i).y - 18, "42!", "good"); metrics(); await k.sleep(420); }
          else { paint(cells[i], "surface2"); metrics(); await k.sleep(130); }
        }
        cursor.setAttribute("opacity", 0);
        scanTxt.style.fill = k.colors.bad;
        k.say("2 matches, 32 rows read.");
        await k.sleep(1200);

        // 3 · build the index
        await k.step();
        resetCells();
        k.say("<code>CREATE INDEX IX_CustomerId</code>");
        await k.tween(idxG, { opacity: 1 }, 700);
        for (const lf of leaves) { k.tone(lf, "lesson"); await k.sleep(350); k.tone(lf, "neutral"); }
        k.say("Sorted keys, grouped into leaves by range.");
        await k.sleep(1400);

        // 4 · index seek
        await k.step();
        matches = 0; cur = 0; metrics();
        k.say("Root: 42 is in the 30–49 range…");
        await k.packet(svg, { x: ROOT.x, y: 44 }, ROOT, { r: 9, label: "42", ms: 500 });
        k.tone(root, "accent"); bump();
        await k.sleep(700);
        await k.packet(svg, ROOT, leafPos(1), { r: 9, label: "42", ms: 600 });
        k.tone(leaves[1], "accent"); bump();
        leafTxt.textContent = "leaf 30–49: " + sortedIn(30, 49).map(e => e.v).join(" ");
        k.say("…leaf in sorted order, pointers to the rows.");
        await k.sleep(1200);
        for (const i of [m1, m2]) {
          const ln = k.line(svg, leafPos(1), cellPos(i), { tone: "good", dashed: true, arrow: true });
          await k.packet(svg, leafPos(1), cellPos(i), { r: 7, tone: "good", ms: 600 });
          paint(cells[i], "goodSoft"); matches++; bump();
          await k.sleep(300);
          ln.remove();
        }
        idxTxt.style.fill = k.colors.good;
        k.say(`<b>${ireads} reads instead of 32.</b>`);
        await k.sleep(1400);

        // 5 · range seek
        await k.step();
        resetCells(); k.tone(root, "neutral"); k.tone(leaves[1], "neutral");
        idxTxt.textContent = ""; idxTxt.style.fill = k.colors.ink; scanTxt.textContent = ""; leafTxt.textContent = "";
        query.textContent = "SELECT * FROM Orders WHERE CustomerId BETWEEN 40 AND 59"; query.style.fill = k.colors.ink;
        ireads = 0; cur = 0; matches = 0; metrics();
        k.say("Seek to 40, then walk right.");
        await k.sleep(1000);
        await k.packet(svg, { x: ROOT.x, y: 44 }, ROOT, { r: 9, label: "40", ms: 500 });
        k.tone(root, "accent"); bump();
        await k.packet(svg, ROOT, leafPos(1), { r: 9, label: "40", ms: 500 });
        k.tone(leaves[1], "accent"); bump();
        await k.packet(svg, leafPos(1), leafPos(2), { r: 9, label: "→", ms: 500 });
        k.tone(leaves[2], "accent"); bump();
        const hits = sortedIn(40, 59);
        leafTxt.textContent = "keys 40–59: " + (hits.map(e => e.v).join(" ") || "(none)");
        await Promise.all(hits.map((e, n) => k.sleep(n * 90).then(async () => {
          await k.packet(svg, leafPos(e.v < 50 ? 1 : 2), cellPos(e.i), { r: 6, tone: "good", ms: 500 });
          paint(cells[e.i], "goodSoft"); matches++; bump();
        })));
        k.say(`${hits.length} rows for <b>${ireads} reads</b>.`);
        await k.sleep(1400);

        // 6 · the write cost
        await k.step();
        resetCells(); k.tone(root, "neutral"); [1, 2].forEach(j => k.tone(leaves[j], "neutral"));
        leafTxt.textContent = ""; idxTxt.textContent = "";
        query.textContent = "INSERT INTO Orders (CustomerId, CreatedAt, Total) …";
        ireads = 0; cur = 0; matches = 0; writesPer = 0; metrics();
        k.say("Two more indexes: CreatedAt and Total. One INSERT…");
        await k.tween(wG, { opacity: 1 }, 500);
        await k.sleep(800);
        let writes = 0;
        const wbump = () => { writes++; writesPer = writes; metrics(); wTxt.textContent = `${writes} write${writes > 1 ? "s" : ""} for 1 row`; };
        await k.packet(svg, INS, { x: 206, y: 226 }, { r: 8, tone: "warn", ms: 600 }); wbump();
        await k.packet(svg, INS, ROOT, { r: 8, tone: "warn", ms: 800 }); k.tone(root, "warn"); wbump();
        await k.packet(svg, INS, { x: 520, y: 302 }, { r: 8, tone: "warn", ms: 800 }); k.tone(ix2, "warn"); wbump();
        await k.packet(svg, INS, { x: 672, y: 302 }, { r: 8, tone: "warn", ms: 800 }); k.tone(ix3, "warn"); wbump();
        wTxt.style.fill = k.colors.bad;
        k.say("One row, <b>4 writes</b>.");
        await k.sleep(1400);

        // 7 · drop the unused index
        await k.step();
        [root, ix2].forEach(b => k.tone(b, "neutral"));
        k.say("Nobody filters on Total: drop it.");
        k.tone(ix3, "bad");
        await k.tween(ix3, { opacity: 0 }, 700);
        await k.sleep(400);
        k.say("Next INSERT…");
        writes = 0; wTxt.textContent = ""; wTxt.style.fill = k.colors.ink;
        await k.packet(svg, INS, { x: 206, y: 226 }, { r: 8, tone: "warn", ms: 600 }); wbump();
        await k.packet(svg, INS, ROOT, { r: 8, tone: "warn", ms: 800 }); k.tone(root, "warn"); wbump();
        await k.packet(svg, INS, { x: 520, y: 302 }, { r: 8, tone: "warn", ms: 800 }); k.tone(ix2, "warn"); wbump();
        wTxt.style.fill = k.colors.good;
        k.say("<b>3 writes</b>: index only what queries use.");
        await k.sleep(1400);
        k.done();
      });
    }
  },

  play: {
    title: "Index Architect",
    goal: "For each workload, <b>click the indexes to create</b>, then run it. Reads without a usable index scan the whole table; every index adds a write to every INSERT. Lowest total cost wins.",
    build(stage, k) {
      const SCAN = 100;
      const IDX = ["CustomerId", "CustomerId, CreatedAt", "CreatedAt, CustomerId", "Email", "Status, CreatedAt", "Total", "CreatedAt"];
      const ROUNDS = [
        {
          name: "Shop: customer pages", inserts: 150,
          queries: [
            { sql: "WHERE CustomerId = @id ORDER BY CreatedAt", n: 60, use: { 1: 1, 0: 4 } },
            { sql: "WHERE Email = @email  (login)", n: 40, use: { 3: 1 } },
            { sql: "WHERE Total > 10000  (yearly audit)", n: 1, use: { 5: 10 } }
          ],
          note: "(CustomerId, CreatedAt) serves both the filter and the sort; Email serves login. The once-a-year audit can afford a scan: an index on Total would cost 150 writes to save 90 reads."
        },
        {
          name: "Ops dashboard", inserts: 300,
          queries: [
            { sql: "WHERE CreatedAt >= @today", n: 50, use: { 6: 2, 2: 2 } },
            { sql: "WHERE Status = 'Pending' AND CreatedAt >= @today", n: 30, use: { 4: 1, 2: 3, 6: 3 } },
            { sql: "WHERE CustomerId = @id  (support tool)", n: 2, use: { 0: 1, 1: 1 } }
          ],
          note: "Only an index that <b>starts with</b> CreatedAt helps a date filter: (CustomerId, CreatedAt) can’t seek on CreatedAt. One date index serves both dashboard queries well enough; a second index costs 300 writes to save 60 reads."
        },
        {
          name: "Click log (write-heavy)", inserts: 2000,
          queries: [
            { sql: "WHERE CustomerId = @id  (support tool)", n: 5, use: { 0: 1, 1: 1 } },
            { sql: "WHERE CreatedAt BETWEEN @a AND @b  (nightly)", n: 3, use: { 6: 2, 2: 2 } }
          ],
          note: "2,000 inserts against 8 queries: any index costs 2,000 writes to save at most 500 reads. On a write-heavy log, <b>no index</b> is the right call."
        }
      ];

      function cost(sel, r) {
        let reads = 0;
        const per = r.queries.map(q => {
          let c = SCAN, via = -1;
          for (const [ix, v] of Object.entries(q.use)) if (sel.has(+ix) && v < c) { c = v; via = +ix; }
          reads += c * q.n;
          return { c, via, total: c * q.n };
        });
        const writes = r.inserts * sel.size;
        return { reads, writes, total: reads + writes, per };
      }
      function bestFor(r) {
        let best = null;
        for (let m = 0; m < 1 << IDX.length; m++) {
          const sel = new Set(IDX.map((_, i) => i).filter(i => m & (1 << i)));
          const c = cost(sel, r).total;
          if (!best || c < best.c || (c === best.c && sel.size < best.sel.size)) best = { c, sel };
        }
        return best;
      }
      const setLabel = sel => sel.size ? [...sel].map(i => `(${IDX[i]})`).join(" + ") : "no indexes at all";

      const svg = k.svg(760, 340, { label: "Index toggles on the left, the workload and its cost on the right" });
      stage.append(svg);
      k.text(svg, 152, 28, "Indexes on Orders (click to toggle)", { size: 12, weight: 700 });
      const sel = new Set();
      let locked = false, roundIdx = 0, score = 0;
      const chips = IDX.map((cols, i) => {
        const y = 62 + i * 38;
        const g = k.box(svg, { x: 152, y, w: 266, h: 32, label: `☐  IX (${cols})`, size: 12 });
        g.style.cursor = "pointer";
        g.setAttribute("tabindex", 0); g.setAttribute("role", "button");
        const go = () => toggle(i);
        g.addEventListener("click", go);
        g.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
        return g;
      });
      function paintChips() {
        chips.forEach((g, i) => {
          const on = sel.has(i);
          g.label.textContent = `${on ? "☑" : "☐"}  IX (${IDX[i]})`;
          k.tone(g, on ? "accent" : "neutral");
          g.setAttribute("aria-label", `Index on ${IDX[i]}: ${on ? "created" : "not created"}. Toggle.`);
          g.setAttribute("aria-pressed", on ? "true" : "false");
        });
      }
      function toggle(i) {
        if (locked) return;
        if (sel.has(i)) sel.delete(i); else sel.add(i);
        paintChips();
        if (sel.has(i)) k.float(svg, 230, 58 + i * 38, "+1 write per insert", "warn");
      }

      const wl = k.s("g"); svg.append(wl);
      const BAR_X = 318, BAR_W = 300;
      let rows = [];
      function drawRound() {
        wl.replaceChildren(); rows = [];
        const r = ROUNDS[roundIdx];
        k.text(wl, 530, 28, `Workload: ${r.name}`, { size: 13, weight: 700 });
        const lines = [...r.queries.map(q => ({ text: q.sql, n: q.n })), { text: "INSERT INTO Orders …  (updates every index)", n: r.inserts }];
        lines.forEach((ln, j) => {
          const y0 = 64 + j * 62;
          k.text(wl, BAR_X, y0, ln.text, { size: 11.5, anchor: "start", mono: true });
          k.text(wl, 745, y0, `× ${k.fmt(ln.n)}`, { size: 12, anchor: "end", weight: 700 });
          wl.append(k.s("rect", { x: BAR_X, y: y0 + 8, width: BAR_W, height: 12, rx: 6, fill: "surface2", stroke: "line" }));
          const fg = k.s("rect", { x: BAR_X, y: y0 + 8, width: 0, height: 12, rx: 6, fill: "accent" });
          wl.append(fg);
          const lbl = k.text(wl, BAR_X, y0 + 35, "cost: ? (run the workload)", { size: 11.5, anchor: "start", tone: "muted" });
          rows.push({ fg, lbl, y0 });
        });
        totalTxt.textContent = "";
        k.hud({ Round: `${roundIdx + 1} / ${ROUNDS.length}`, Score: score });
      }
      const totalTxt = k.text(svg, 530, 330, "", { size: 13, weight: 700 });

      function showButtons() {
        k.clearTools();
        k.button("Run workload ▶", () => k.run(runRound), { primary: true });
      }

      async function runRound() {
        if (locked) return;
        locked = true; k.clearTools();
        const r = ROUNDS[roundIdx], res = cost(sel, r), best = bestFor(r);
        const vals = [...res.per.map(p => p.total), res.writes];
        const max = Math.max(...vals, ...r.queries.map(q => q.n * SCAN), 1);
        k.say("Running the workload…");
        for (let j = 0; j < vals.length; j++) {
          const row = rows[j], isInsert = j === res.per.length;
          let tone, text;
          if (isInsert) {
            tone = sel.size ? "warn" : "good";
            text = sel.size ? `${sel.size} index write${sel.size > 1 ? "s" : ""} × ${k.fmt(r.inserts)} = ${k.fmt(res.writes)}` : "no indexes to update = 0";
          } else {
            const p = res.per[j];
            tone = p.via < 0 ? "bad" : "good";
            text = p.via < 0 ? `full table scan: ${SCAN} × ${r.queries[j].n} = ${k.fmt(p.total)}` : `seek via (${IDX[p.via]}): ${p.c} × ${r.queries[j].n} = ${k.fmt(p.total)}`;
          }
          row.fg.style.fill = k.colors[tone];
          row.lbl.textContent = text; row.lbl.style.fill = k.colors[tone === "good" ? "good" : tone === "warn" ? "warn" : "bad"];
          await k.tween(row.fg, { width: Math.max(3, vals[j] / max * BAR_W) }, 650, k.ease.out);
          await k.sleep(200);
        }
        const pct = Math.round(100 * best.c / res.total);
        score += pct;
        totalTxt.textContent = `Your cost ${k.fmt(res.total)} · best possible ${k.fmt(best.c)} → ${pct} points`;
        totalTxt.style.fill = k.colors[pct >= 85 ? "good" : pct >= 50 ? "warn" : "bad"];
        k.float(svg, 530, 305, `+${pct}`, pct >= 85 ? "good" : "warn");
        k.hud({ Round: `${roundIdx + 1} / ${ROUNDS.length}`, Score: score });
        k.say(`Best set: <b>${setLabel(best.sel)}</b>. ${r.note}`);
        const last = roundIdx === ROUNDS.length - 1;
        k.button(last ? "See result" : "Next workload →", () => {
          if (last) return end();
          roundIdx++; sel.clear(); paintChips(); locked = false;
          drawRound(); showButtons();
          k.say("New workload. Read the queries and the insert count, then choose indexes.");
        }, { primary: true });
      }

      function end() {
        const text = `Score <b>${score}</b> of 300 (each round: best cost ÷ your cost). Index what you filter and sort on, put the filtered column first in a composite index, and skip indexes on write-heavy tables whose queries are rare.`;
        if (score < 120) k.lose(text);
        else k.win({ stars: k.starsFor(score, 180, 255), text });
      }

      k.say("Each query below runs many times. Toggle the indexes that make the frequent ones seek, without paying for indexes nobody needs.");
      paintChips(); drawRound(); showButtons();
    }
  }
});
