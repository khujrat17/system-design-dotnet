"use strict";
/* Concept 24 · Blob storage and search. Watch: an inverted index built word by word, a query answered by intersecting
   posting lists, then a big upload going straight to blob storage through a pre-signed URL. Play: Index Detective. */
(function () {
  function clickable(el, label, fn) {
    el.setAttribute("tabindex", 0);
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", label);
    el.style.cursor = "pointer";
    el.addEventListener("click", fn);
    el.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } });
  }

  Lab.define(24, {
    watch: {
      title: "Find it fast, upload it direct",
      intro: "First how a search engine finds documents without scanning them, then how big files skip your servers entirely.",
      steps: [
        { label: "LIKE scan", tag: "problem", title: "Search by reading every row",
          body: "<p>Four product descriptions sit in the database. A shopper searches for <b>wireless headphones</b>.</p><p>Without an index, <code>LIKE '%wireless%'</code> must read <b>every row</b>: 4 here, <b>300,000</b> in the C# demo, millions in real life. And there is no relevance ranking.</p>",
          idea: "A leading-wildcard LIKE can't use a B-tree index, so every search pays for the whole table.",
          changed: ["Scanner walks all 4 rows", "Rows scanned: 4"] },
        { label: "Terms", tag: "concept", title: "Split documents into terms",
          body: "<p>A search engine builds an <b>inverted index</b> once, at write time. Take D1 word by word: each word becomes a <b>term</b>.</p><p>Each term gets a <b>posting list</b>: the IDs of documents that contain it.</p>",
          idea: "Invert the question: instead of “what words are in this doc?”, store “which docs have this word?”.",
          changed: ["3 terms from D1", "Each posting list holds doc 1"] },
        { label: "Posting lists", tag: "technique", title: "Posting lists grow, sorted by doc ID",
          body: "<p>D2 adds <b>red</b> and <b>headphones</b>, and appends its ID to <b>wireless</b>. D3 and D4 follow.</p><p>Lists stay <b>sorted by doc ID</b>. In production the index is fed by change events, so it runs a moment <b>behind</b> the database.</p>",
          idea: "The search index is a derived copy: eventually consistent, rebuildable from the database.",
          changed: ["5 terms, 11 postings", "wireless → 1, 2, 4"] },
        { label: "Intersect", tag: "technique", title: "AND = intersect two sorted lists",
          body: "<p>Look up <b>wireless</b> and <b>headphones</b> directly and walk both lists side by side. Smaller ID? Skip it. Same ID? A match.</p><p>The work depends on two short lists, not the table size. Real engines then <b>rank</b> matches (BM25), handle typos and build facets.</p>",
          idea: "Search cost scales with posting-list length, not with the number of documents.",
          changed: ["2 posting lists read, 0 rows scanned", "Matches: D2 and D4"] },
        { label: "Upload jam", tag: "problem", title: "200 MB through your API",
          body: "<p>Now a user uploads a <b>200 MB video</b>. The naive way: send the bytes through your API, which forwards them to storage.</p><p>Every byte holds an API thread, memory and bandwidth. Fifty users uploading at once and the API stalls for <b>everyone</b>.</p>",
          idea: "Your API should move metadata, not megabytes.",
          changed: ["API busy meter goes red", "200 MB through the API"] },
        { label: "Pre-signed", tag: "technique", title: "Ask for a pre-signed URL",
          body: "<p>Instead, the client asks the API for a <b>pre-signed URL</b> (a SAS URL in Azure): write-only, one path, valid for <b>10 minutes</b>.</p><p>The API only signs; it never touches the file.</p>",
          idea: "A pre-signed URL delegates one narrow permission for a short time.",
          changed: ["Signed PUT URL returned to the client"] },
        { label: "Direct PUT", tag: "technique", title: "Bytes go straight to blob storage",
          body: "<p>The client <b>PUTs the bytes directly to blob storage</b>, which checks the signature itself. The API meter stays idle.</p><p>Then the client says it's done, and the API stores only the <b>blob URL and metadata</b> in the database.</p>",
          idea: "Blob storage holds the bytes; the database holds the pointer.",
          changed: ["0 MB through the API", "Row: 9f2c.mp4 · 200 MB · blob URL"] },
        { label: "CDN", tag: "concept", title: "Reads through a CDN",
          body: "<p>Viewers read through a <b>CDN</b> in front of the container. The first viewer fills the edge cache; the rest are served nearby.</p>",
          idea: "Cheap, durable storage plus an edge cache serves big files to many readers.",
          changed: ["1 read from blob, 3 from the edge"] },
        { label: "Expired", tag: "result", title: "The signed URL expires",
          body: "<p>Eleven minutes later someone replays the same URL. Storage refuses it: <b>expired → 403</b>.</p><p>Files go to blob storage, text search to a search engine, and the <b>database stays the source of truth</b>.</p>",
          idea: "Short-lived, narrow URLs limit what a leaked link can do.",
          changed: ["Replay rejected with 403"] }
      ],
      learn: [
        { text: "Why LIKE '%term%' scans every row", step: 0 },
        { text: "How an inverted index and posting lists work", step: 2 },
        { text: "Answering AND queries by intersecting lists", step: 3 },
        { text: "Uploading big files with pre-signed URLs", step: 6 }
      ],
      build(stage, k) {
        const svg = k.svg(760, 340, { label: "Documents being split into words to build an inverted index, then an upload going straight to blob storage" });
        stage.append(svg);
        let scanned = 0, termCount = 0, listsRead = 0, matches = "—", apiMB = 0;
        const metrics = () => k.hud({ "Rows scanned": scanned, "Index terms": termCount, "Posting lists read": listsRead, Matches: matches, "MB through API": apiMB });
        metrics();

        k.run(async () => {
          /* ---------------- step 1: the LIKE scan ---------------- */
          await k.step();
          const g = k.s("g"); svg.append(g);
          const DOCS = ["wireless gaming mouse", "red wireless headphones", "gaming headphones", "wireless gaming headphones"];
          const CW = 7.2, docY = i => 72 + i * 44, WX = 62;   // mono 12 px ≈ 7.2 px per character
          k.text(g, 130, 38, "Documents (the database)", { size: 12, tone: "muted", weight: 700 });
          k.text(g, 545, 38, "Inverted index: term → doc IDs", { size: 12, tone: "muted", weight: 700 });
          const docBoxes = DOCS.map((d, i) => {
            const r = k.s("rect", { x: 16, y: docY(i) - 17, width: 238, height: 34, rx: 8, fill: "surface", stroke: "line", "stroke-width": 1.5 });
            g.append(r);
            k.text(g, 36, docY(i) + 4, `D${i + 1}`, { size: 12, weight: 800, tone: "accent" });
            const words = [];
            let col = 0;
            for (const w of d.split(" ")) {
              words.push({ w, x: WX + col * CW, el: k.text(g, WX + col * CW, docY(i) + 4, w, { anchor: "start", size: 12, mono: true }) });
              col += w.length + 1;
            }
            return { r, words };
          });

          const terms = new Map();   // term -> { y, label, ids: [], chips: [] }
          const termY = n => 72 + n * 36;
          async function index(docIdx, fast) {
            const doc = docBoxes[docIdx];
            k.tone(doc.r, "accent");
            for (const { w, x, el } of doc.words) {
              let t = terms.get(w);
              const isNew = !t;
              if (isNew) { t = { y: termY(terms.size), ids: [], chips: [] }; terms.set(w, t); termCount = terms.size; metrics(); }
              const fly = k.text(g, x, docY(docIdx) + 4, w, { anchor: "start", size: 12, mono: true, weight: 700, tone: "accent" });
              el.style.fill = k.colors.accent;
              await k.tween(fly, { tx: 340 - x, ty: t.y - docY(docIdx) }, fast ? 380 : 750);
              fly.remove();
              if (isNew) t.label = k.text(g, 340, t.y + 4, w, { anchor: "start", size: 13, mono: true, weight: 700 });
              const chip = k.dot(g, 470 + t.ids.length * 32, t.y, { r: 12, tone: "accent", label: String(docIdx + 1), size: 11 });
              chip.setAttribute("opacity", 0);
              t.ids.push(docIdx + 1); t.chips.push(chip);
              await k.tween(chip, { opacity: 1 }, fast ? 120 : 250);
              el.style.fill = k.colors.ink;
              if (!fast) await k.sleep(250);
            }
            k.tone(doc.r, "neutral");
          }

          // a LIKE scan: the problem
          k.say("Search <b>wireless headphones</b> with <code>LIKE '%wireless%'</code>…");
          await k.sleep(1200);
          const scan = k.s("rect", { x: 12, y: docY(0) - 21, width: 246, height: 42, rx: 10, fill: "none", stroke: "warn", "stroke-width": 3 });
          g.append(scan);
          scanned = 1; metrics();
          for (let i = 1; i < 4; i++) { await k.sleep(500); await k.tween(scan, { y: docY(i) - 21 }, 450); scanned = i + 1; metrics(); }
          await k.sleep(600);
          k.say("…every row read, just to answer one query.");
          await k.sleep(1200);
          scan.remove();

          /* ---------------- step 2: terms ---------------- */
          await k.step();
          k.say("Index D1 word by word.");
          await k.sleep(800);
          await index(0, false);
          k.say("3 terms, each pointing at doc 1.");
          await k.sleep(800);

          /* ---------------- step 3: posting lists ---------------- */
          await k.step();
          k.say("D2 adds <b>red</b> and <b>headphones</b>, and joins <b>wireless</b>.");
          await index(1, false);
          k.say("D3 and D4 go faster.");
          await index(2, true);
          await index(3, true);
          k.say("Every term now has a sorted posting list.");
          await k.sleep(1000);

          /* ---------------- step 4: intersect posting lists ---------------- */
          await k.step();
          scanned = 0; metrics();
          const A = terms.get("wireless"), Bt = terms.get("headphones");
          for (const t of [A, Bt]) t.label.style.fill = k.colors.accent;
          k.say("Look up the two terms and copy their posting lists.");
          listsRead = 2; metrics();
          const rowA = 272, rowB = 310;
          k.text(g, 340, rowA + 4, "wireless", { anchor: "start", size: 12.5, mono: true, weight: 700, tone: "accent" });
          k.text(g, 340, rowB + 4, "headphones", { anchor: "start", size: 12.5, mono: true, weight: 700, tone: "accent" });
          const copy = async (t, y) => {
            const out = [];
            await Promise.all(t.chips.map((c, j) => k.sleep(j * 120).then(async () => {
              const d = k.dot(g, c._tf.tx, c._tf.ty, { r: 12, tone: "accent", label: String(t.ids[j]), size: 11 });
              out[j] = d;
              await k.tween(d, { tx: 470 + j * 32, ty: y }, 600);
            })));
            return out;
          };
          const la = await copy(A, rowA);
          const lb = await copy(Bt, rowB);
          await k.sleep(600);
          k.say("Walk both lists: smaller ID skips, equal IDs match.");
          await k.sleep(800);
          const res = k.text(g, 690, 296, "", { size: 14, weight: 800, tone: "good" });
          let i = 0, j = 0;
          const found = [];
          while (i < A.ids.length && j < Bt.ids.length) {
            const a = A.ids[i], b = Bt.ids[j];
            for (const d of [la[i], lb[j]]) d.circle.style.stroke = k.colors.ink, d.circle.style.strokeWidth = 3;
            await k.sleep(700);
            for (const d of [la[i], lb[j]]) d.circle.style.strokeWidth = 0;
            if (a === b) {
              la[i].circle.style.fill = k.colors.good; lb[j].circle.style.fill = k.colors.good;
              found.push(a); res.textContent = `→ D${found.join(", D")}`;
              matches = found.map(x => `D${x}`).join(", "); metrics();
              k.float(g, 470 + j * 32, rowA - 18, "match", "good");
              i++; j++;
            } else if (a < b) { la[i].circle.style.fill = k.colors.muted; i++; }
            else { lb[j].circle.style.fill = k.colors.muted; j++; }
            await k.sleep(350);
          }
          for (; i < la.length; i++) la[i].circle.style.fill = k.colors.muted;
          for (; j < lb.length; j++) lb[j].circle.style.fill = k.colors.muted;
          for (const id of found) k.tone(docBoxes[id - 1].r, "good");
          k.say(`Results: <b>D${found.join(" and D")}</b>, without reading a single row.`);
          await k.sleep(1200);

          /* ---------------- step 5: the upload jam ---------------- */
          await k.step();
          await k.tween(g, { opacity: 0 }, 600);
          g.remove();
          const u = k.s("g"); svg.append(u);
          const Q = { client: { x: 90, y: 175 }, api: { x: 330, y: 62 }, blob: { x: 600, y: 175 }, db: { x: 330, y: 290 }, cdn: { x: 560, y: 292 }, view: { x: 705, y: 292 } };
          k.line(u, Q.client, Q.api, { dashed: true });
          k.line(u, Q.api, Q.blob, { dashed: true });
          k.line(u, Q.client, Q.blob, { dashed: true });
          k.line(u, Q.api, Q.db, { dashed: true });
          k.line(u, Q.blob, Q.cdn, { dashed: true });
          k.line(u, Q.cdn, Q.view, { dashed: true });
          const client = k.box(u, { ...Q.client, label: "Client", icon: "📱", sub: "200 MB video", w: 130, h: 52 });
          const apiB = k.box(u, { ...Q.api, label: "API", icon: "🖥️", w: 120, h: 44 });
          const blob = k.box(u, { ...Q.blob, label: "Blob storage", icon: "🪣", sub: "cheap · durable", w: 160, h: 52 });
          const db = k.box(u, { ...Q.db, label: "Database", icon: "🗄️", sub: "URL + metadata", w: 150, h: 50 });
          const cdn = k.box(u, { ...Q.cdn, label: "CDN", icon: "🌍", w: 100, h: 44 });
          const view = k.box(u, { ...Q.view, label: "Viewers", icon: "👀", w: 96, h: 44 });
          for (const b of [cdn, view]) b.setAttribute("opacity", 0.35);
          const busy = k.meter(u, { x: 410, y: 50, w: 140, max: 100, value: 3, tone: "good", label: "API busy" });
          const urlText = k.text(u, 175, 118, "", { size: 11.5, mono: true, weight: 700, tone: "accent" });
          const rowText = k.text(u, 330, 330, "", { size: 11.5, mono: true });

          async function stream(a, b, n, tone, onEach) {
            await Promise.all(Array.from({ length: n }, (_, i) => k.sleep(i * 140).then(async () => {
              await k.packet(u, a, b, { r: 6, tone, ms: 700 });
              onEach?.(i);
            })));
          }

          k.say("A <b>200 MB video</b> streams through the API…");
          await k.sleep(1000);
          k.tone(apiB, "warn");
          await Promise.all([
            stream(Q.client, Q.api, 12, "warn", i => { busy.set(Math.min(100, 20 + i * 7), i > 7 ? "bad" : "warn"); apiMB = Math.round(200 * (i + 1) / 12); metrics(); }),
            k.sleep(500).then(() => stream(Q.api, Q.blob, 12, "warn"))
          ]);
          k.tone(apiB, "bad");
          k.say("The API was busy for the whole upload.");
          await k.sleep(1500);
          busy.set(3, "good"); k.tone(apiB, "neutral");

          /* ---------------- step 6: pre-signed URL ---------------- */
          await k.step();
          apiMB = 0; metrics();
          k.say("The client asks for an upload URL…");
          await k.packet(u, Q.client, Q.api, { label: "?", r: 12, ms: 700 });
          k.tone(apiB, "accent");
          await k.sleep(500);
          urlText.textContent = "PUT …/uploads/9f2c.mp4?sig=…&exp=10m&perm=w";
          await k.packet(u, Q.api, Q.client, { label: "🔗", r: 13, ms: 700, tone: "good" });
          k.tone(apiB, "neutral");
          k.say("…and gets a <b>signed, write-only, 10-minute</b> URL.");
          await k.sleep(1400);

          /* ---------------- step 7: direct PUT ---------------- */
          await k.step();
          k.say("Bytes go <b>straight to blob storage</b>. API meter stays idle.");
          k.tone(blob, "accent");
          await stream(Q.client, Q.blob, 12, "accent");
          k.tone(blob, "good");
          await k.sleep(600);
          k.say("The API records only the URL and metadata.");
          await k.packet(u, Q.client, Q.api, { label: "✓", r: 12, ms: 650 });
          await k.packet(u, Q.api, Q.db, { r: 9, ms: 650, tone: "good" });
          rowText.textContent = "videos: 9f2c.mp4 · 200 MB · blob URL";
          k.tone(db, "good");
          await k.sleep(1200);

          /* ---------------- step 8: CDN ---------------- */
          await k.step();
          k.say("Viewers read through the <b>CDN</b>.");
          for (const b of [cdn, view]) await k.tween(b, { opacity: 1 }, 300);
          await k.packet(u, Q.blob, Q.cdn, { r: 8, ms: 600, tone: "accent" });
          await k.packet(u, Q.cdn, Q.view, { r: 8, ms: 500, tone: "accent" });
          k.say("Later viewers hit the edge cache.");
          for (let n = 0; n < 3; n++) await k.packet(u, Q.cdn, Q.view, { r: 8, ms: 350, tone: "good" });
          await k.sleep(1000);

          /* ---------------- step 9: expired URL ---------------- */
          await k.step();
          k.say("11 minutes later, the same signed URL is replayed…");
          await k.sleep(1400);
          urlText.style.fill = k.colors.muted;
          await k.packet(u, Q.client, Q.blob, { label: "🔗", r: 13, ms: 800, tone: "bad" });
          k.tone(blob, "bad");
          await k.packet(u, Q.blob, Q.client, { label: "403", r: 14, size: 9, ms: 700, tone: "bad" });
          k.say("…and storage refuses it: <b>expired</b>.");
          await k.sleep(1500);
          k.done();
        });
      }
    },

    play: {
      title: "Index Detective",
      goal: "The documents are hidden: you only have the <b>inverted index</b>. For each AND query, select every doc ID that contains <b>all</b> the terms, then press Submit.",
      build(stage, k) {
        const svg = k.svg(760, 340, { label: "An inverted index on the left and doc ID buttons on the right" });
        stage.append(svg);
        const ADJ = ["red", "blue", "wireless", "gaming", "slim"], NOUN = ["headphones", "mouse", "laptop", "keyboard"];
        const N = 10, ROUNDS = 6, LIMIT = 20;
        const docs = Array.from({ length: N }, () => {
          const [a, b] = k.shuffle(ADJ);
          return `${a} ${b} ${k.pick(NOUN)}`;
        });
        const index = new Map();
        docs.forEach((d, i) => { for (const w of d.split(" ")) { if (!index.has(w)) index.set(w, []); const l = index.get(w); if (!l.includes(i + 1)) l.push(i + 1); } });
        const termsSorted = [...index.keys()].sort();
        const search = q => q.map(t => index.get(t) || []).reduce((a, b) => a.filter(x => b.includes(x)));

        // queries
        function makeQuery(size, missing) {
          for (let tries = 0; tries < 300; tries++) {
            const q = k.shuffle(termsSorted).slice(0, size);
            const r = search(q);
            if (missing) { q[q.length - 1] = k.pick(["purple", "bamboo", "solar", "vintage"]); return q; }
            if (r.length >= 1 && r.length <= 4) return q;
          }
          return k.shuffle(termsSorted).slice(0, size);
        }
        const queries = [makeQuery(2), makeQuery(2), makeQuery(3), makeQuery(2, true), makeQuery(3), makeQuery(3)];

        // index panel
        k.text(svg, 215, 22, "Inverted index (sorted terms → doc IDs)", { size: 12, tone: "muted", weight: 700 });
        const rowY = i => 48 + i * 27;
        const rowBg = new Map();
        termsSorted.forEach((t, i) => {
          const bg = k.s("rect", { x: 10, y: rowY(i) - 12, width: 420, height: 24, rx: 6, fill: "accentSoft", opacity: 0 });
          svg.append(bg); rowBg.set(t, bg);
          k.text(svg, 122, rowY(i) + 4, t, { anchor: "end", size: 12.5, mono: true, weight: 700 });
          index.get(t).forEach((id, j) => k.dot(svg, 142 + j * 26, rowY(i), { r: 11, tone: "accent", label: String(id), size: 10.5 }));
        });
        k.text(svg, 215, Math.min(330, rowY(termsSorted.length) + 6), "Documents D1–D10 are hidden: use the index.", { size: 11.5, tone: "muted" });

        // query + picker
        const qText = k.text(svg, 600, 40, "", { size: 13, weight: 800, mono: true });
        k.text(svg, 600, 64, "select every matching doc ID", { size: 11.5, tone: "muted" });
        const picked = new Set();
        const chips = [];
        for (let id = 1; id <= N; id++) {
          const x = 496 + ((id - 1) % 5) * 52, y = 100 + Math.floor((id - 1) / 5) * 62;
          const cg = k.s("g"); svg.append(cg);
          const c = k.s("circle", { cx: x, cy: y, r: 20, fill: "surface2", stroke: "line", "stroke-width": 2 });
          const t = k.text(cg, x, y + 5, String(id), { size: 14, weight: 800 });
          cg.prepend(c);
          const mark = k.text(cg, x, y + 34, "", { size: 11, weight: 700 });
          const chip = { id, c, t, mark, cg };
          chips.push(chip);
          clickable(cg, `Doc ${id}`, () => toggle(chip));
        }
        const meter = k.meter(svg, { x: 520, y: 228, w: 160, max: LIMIT, value: LIMIT, label: "time" });
        const reveal = k.s("g"); svg.append(reveal);

        let round = 0, score = 0, perfect = 0, live = false, timeLeft = LIMIT;
        const hud = () => k.hud({ Query: `${Math.min(round + 1, ROUNDS)} / ${ROUNDS}`, Score: score, Perfect: perfect });

        function paint(chip) {
          const on = picked.has(chip.id);
          chip.c.style.fill = on ? k.colors.accent : k.colors.surface2;
          chip.c.style.stroke = on ? k.colors.accent : k.colors.line;
          chip.t.style.fill = on ? k.colors.surface : k.colors.ink;
          chip.cg.setAttribute("aria-pressed", on ? "true" : "false");
        }
        function toggle(chip) {
          if (!live) return;
          if (picked.has(chip.id)) picked.delete(chip.id); else picked.add(chip.id);
          paint(chip);
        }

        function startRound() {
          const q = queries[round];
          picked.clear();
          reveal.replaceChildren();
          for (const ch of chips) { ch.mark.textContent = ""; paint(ch); }
          for (const bg of rowBg.values()) bg.setAttribute("opacity", 0);
          for (const t of q) rowBg.get(t)?.setAttribute("opacity", 1);
          qText.textContent = q.join(" AND ");
          timeLeft = LIMIT; meter.set(LIMIT, "accent");
          live = true; hud();
          k.say("Find the posting lists of the query terms (highlighted) and keep only the IDs that appear in <b>all</b> of them. If none match, submit with nothing selected.");
        }

        async function submit() {
          if (!live) return;
          live = false;
          const q = queries[round];
          const truth = search(q);
          const missed = truth.filter(id => !picked.has(id)), extra = [...picked].filter(id => !truth.includes(id));
          const errors = missed.length + extra.length;
          const pts = Math.max(0, 100 - 40 * errors);
          score += pts; if (!errors) perfect++;
          for (const ch of chips) {
            const inT = truth.includes(ch.id), sel = picked.has(ch.id);
            if (inT && sel) { ch.c.style.fill = k.colors.good; ch.c.style.stroke = k.colors.good; ch.mark.textContent = "✓"; ch.mark.style.fill = k.colors.good; }
            else if (inT) { ch.c.style.stroke = k.colors.warn; ch.c.style.fill = k.colors.warnSoft; ch.mark.textContent = "missed"; ch.mark.style.fill = k.colors.warn; }
            else if (sel) { ch.c.style.fill = k.colors.bad; ch.c.style.stroke = k.colors.bad; ch.mark.textContent = "✗"; ch.mark.style.fill = k.colors.bad; }
          }
          k.float(svg, 720, 236, pts ? `+${pts}` : "+0", pts === 100 ? "good" : pts ? "warn" : "bad");
          const lists = q.map(t => `${t} → [${(index.get(t) || []).join(",")}]`).join(" · ");
          truth.slice(0, 4).forEach((id, i) => k.text(reveal, 470, 262 + i * 19, `D${id}: ${docs[id - 1]}`, { anchor: "start", size: 12, mono: true, tone: "good" }));
          if (!truth.length) k.text(reveal, 600, 270, "no document has every term", { size: 12.5, weight: 700, tone: "warn" });
          k.say(`${errors ? "Not quite." : "Exactly right."} ${lists}${q.some(t => !index.has(t)) ? " (not in the index, so no doc can match)" : ""} → <b>${truth.length ? truth.join(", ") : "nothing"}</b>.`);
          hud();
          await k.sleep(errors ? 3600 : 2400);
          round++;
          if (round >= ROUNDS) end(); else startRound();
        }

        k.loop(dt => {
          if (!live) return;
          timeLeft = Math.max(0, timeLeft - dt);
          meter.set(timeLeft, timeLeft < 5 ? "bad" : "accent");
          if (timeLeft === 0) k.run(submit);
        });
        k.button("Submit results", () => k.run(submit), { primary: true });

        function end() {
          const text = `You scored <b>${score}</b> of ${ROUNDS * 100} with <b>${perfect}</b> perfect answers. ` +
            "An AND query is the intersection of the terms' posting lists, and a term missing from the index means an empty result, all without reading a single document.";
          if (score < 240) k.lose(text);
          else k.win({ stars: k.starsFor(score, 380, 540), text });
        }

        startRound();
      }
    }
  });
})();
