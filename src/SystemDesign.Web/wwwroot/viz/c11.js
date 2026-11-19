"use strict";
/* Concept 11 · Consistent hashing. Watch: hash % N reshuffles most keys; the ring moves ~1/N; virtual nodes even it out.
   Play: Ring Keeper, predict key owners, then place new servers to balance the ring. */
Lab.define(11, (function () {
  /* shared geometry + helpers (angles in degrees, 0 at the top, growing clockwise) */
  function hash(str) {   // FNV-1a with a murmur finaliser: stable and well mixed
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b) >>> 0;
    h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0;
    h ^= h >>> 16;
    return h >>> 0;
  }
  function ringKit(k, cx, cy) {
    const pol = (a, r) => ({ x: cx + r * Math.sin(a * Math.PI / 180), y: cy - r * Math.cos(a * Math.PI / 180) });
    function arcD(a0, a1, r) {
      let span = ((a1 - a0) % 360 + 360) % 360;
      if (span === 0) span = 359.9;
      const p0 = pol(a0, r), p1 = pol(a0 + span, r);
      return `M ${p0.x.toFixed(1)} ${p0.y.toFixed(1)} A ${r} ${r} 0 ${span > 180 ? 1 : 0} 1 ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
    }
    /* points: [{a, n}] → sorted copy; owner = first point clockwise at or after angle a */
    const sortPts = pts => [...pts].sort((p, q) => p.a - q.a);
    function owner(a, sorted) {
      for (const p of sorted) if (p.a >= a) return p.n;
      return sorted[0].n;
    }
    function drawArcs(g, sorted, r, tones) {
      g.replaceChildren();
      sorted.forEach((p, i) => {
        const prev = sorted[(i - 1 + sorted.length) % sorted.length];
        g.append(k.s("path", { d: arcD(prev.a, p.a, r), fill: "none", stroke: tones[p.n], "stroke-width": 8, opacity: 0.55 }));
      });
    }
    /* points along the ring from a0 clockwise to a1 */
    function path(a0, a1, r) {
      const end = a1 >= a0 ? a1 : a1 + 360, out = [];
      for (let a = a0; a < end; a += 5) out.push(pol(a, r));
      out.push(pol(end, r));
      return out;
    }
    return { pol, owner, sortPts, drawArcs, path };
  }
  const TONES = { A: "accent", B: "good", C: "warn", D: "lesson", E: "bad", F: "ink", G: "muted" };
  function nodeDot(k, parent, name, p) {
    const d = k.dot(parent, p.x, p.y, { r: 14, tone: TONES[name], label: name, size: 12 });
    d.circle.style.stroke = k.colors.surface; d.circle.style.strokeWidth = 2;
    if (TONES[name] === "ink") d.label.style.fill = k.colors.surface;
    return d;
  }

  return {
    watch: {
      title: "One new server, how many keys move?",
      intro: "Count how many keys change server when one server is added: first with <code>hash % N</code>, then on a ring.",
      steps: [
        { label: "Modulo", tag: "concept", title: "The simple way: hash(key) % N",
          body: "<p>To spread keys over servers, hash the key and take it modulo the server count: <code>server = hash(key) % 4</code>.</p><p>It’s even and needs no lookup table. Every key gets a server from 0 to 3.</p>",
          idea: "Modulo placement works perfectly, as long as N never changes.",
          changed: ["24 keys placed on 4 servers", "Placement: hash % 4"] },
        { label: "Add server", tag: "failure", title: "N changes, almost everything moves",
          body: "<p>Traffic grows, so we add a <b>5th server</b>. N goes from 4 to 5 and every key’s server is recomputed.</p><p>Most keys land somewhere new. In the C# demo with 100,000 keys, about <b>80%</b> move. For a cache that’s a flood of misses; for a database, a huge migration.</p>",
          idea: "With <code>hash % N</code>, changing N reshuffles roughly (N−1)/N of all keys.",
          changed: ["Red keys changed server", "Keys moved: 21 of 24 (88%)"] },
        { label: "The ring", tag: "concept", title: "Hash the servers too",
          body: "<p><b>Consistent hashing</b> puts the hash values on a <b>circle</b>. Servers A, B, C and D are hashed onto it, and so is every key.</p><p>Now a key’s position doesn’t depend on how many servers there are.</p>",
          idea: "Keys and servers share one hash space, so adding a server doesn’t move every key’s position.",
          changed: ["4 servers placed on the ring", "30 keys appear at their hash positions"] },
        { label: "Clockwise", tag: "technique", title: "First server clockwise owns the key",
          body: "<p>The rule: walk <b>clockwise</b> from the key until you meet a server. Past the top, the ring <b>wraps around</b>.</p><p>Each server owns the <b>arc</b> that ends at it. The arcs are uneven: D owns far more than C.</p>",
          idea: "Ownership is a lookup on a sorted list: find the first server position ≥ the key’s hash.",
          changed: ["Two keys walked to their owners", "Keys coloured by owner"] },
        { label: "Add E", tag: "technique", title: "A new server takes one slice",
          body: "<p>Server <b>E</b> hashes to a spot between C and D. Only the keys on the arc just before E change owner, all taken from <b>one neighbour</b>.</p><p>Roughly <b>1/N</b> of the keys move, instead of ~80% with modulo.</p>",
          idea: "Adding a server moves only the keys it now owns. Everyone else stays put.",
          changed: ["E added between C and D", "5 of 30 keys moved, all from D"] },
        { label: "Remove B", tag: "trade-off", title: "A failure dumps load on one neighbour",
          body: "<p>Server <b>B</b> fails. Only B’s keys move, all to the next server clockwise. Every other key stays where it was.</p><p>But that one neighbour just inherited <b>all</b> of B’s load, and the arcs were already uneven.</p>",
          idea: "Few keys move, but they all move to one place. With one point per server, load is lumpy.",
          changed: ["B removed from the ring", "All of B’s keys → C"] },
        { label: "Virtual nodes", tag: "fix", title: "Many points per server",
          body: "<p>Fix both problems with <b>virtual nodes</b>: each server is placed at <b>many</b> points on the ring. Real systems use 100–200 per server (the C# demo uses 150); here 3 each.</p><p>Each server now owns several small arcs, so the load evens out.</p>",
          idea: "Virtual nodes turn a few big uneven arcs into many small ones: the law of large numbers does the balancing.",
          changed: ["4 servers × 3 virtual nodes", "Busiest server: 12 → 9 keys"] },
        { label: "Remove C", tag: "result", title: "A leaving server’s keys scatter",
          body: "<p>Remove C now and its keys spread over <b>several</b> neighbours instead of piling onto one.</p><p>Consistent hashing moves about <b>1/N</b> of the keys when servers change, and virtual nodes keep the load even. DynamoDB, Cassandra and many caches work this way.</p>",
          idea: "Interview answer: “consistent hashing with virtual nodes, so adding or losing a node moves ~1/N of the keys and spreads them evenly.”",
          changed: ["C’s 3 points removed", "Its keys shared out to A and B"] }
      ],
      learn: [
        { text: "Why hash % N reshuffles most keys", step: 1 },
        { text: "How the ring decides who owns a key", step: 3 },
        { text: "Why adding a node moves only ~1/N", step: 4 },
        { text: "How virtual nodes even out the load", step: 6 },
        { text: "Where consistent hashing is used", step: 7 }
      ],
      build(stage, k) {
        const svg = k.svg(760, 340, { label: "Keys assigned to servers, first by modulo, then on a hash ring" });
        stage.append(svg);

        let placement = "hash % 4", servers = 4, busiest = 0, movedTxtVal = "—";
        const metrics = () => k.hud({ Placement: placement, Servers: servers, "Busiest server": busiest ? `${busiest} keys` : "—", "Keys moved": movedTxtVal });
        metrics();

        k.run(async () => {
          /* ---------- part 1: hash % N ---------- */
          await k.step();
          const modG = k.s("g"); svg.append(modG);
          k.text(modG, 380, 32, "Placement by modulo: server = hash(key) % N", { size: 14, weight: 700 });
          const nTxt = k.text(modG, 380, 56, "N = 4 servers", { size: 13, tone: "accent", weight: 700 });
          const cells = Array.from({ length: 24 }, (_, i) => {
            const h = hash(`user:${i + 1}`);
            const b = k.box(modG, { x: 75 + (i % 6) * 122, y: 98 + Math.floor(i / 6) * 56, w: 116, h: 46, label: `user:${i + 1}`, sub: `→ server ${h % 4}`, size: 13.5 });
            b.setAttribute("opacity", 0);
            return { b, h };
          });
          const movedTxt = k.text(modG, 380, 322, "", { size: 14, weight: 700 });
          const peak = n => { const c = {}; cells.forEach(x => { c[x.h % n] = (c[x.h % n] || 0) + 1; }); return Math.max(...Object.values(c)); };
          k.say("Every key gets <code>hash % 4</code>.");
          for (const c of cells) { k.tween(c.b, { opacity: 1 }, 300).catch(() => {}); await k.sleep(80); }
          busiest = peak(4); metrics();
          await k.sleep(1600);

          await k.step();
          k.say("Add a 5th server: N = 5, recompute every key…");
          nTxt.textContent = "N = 5 servers"; nTxt.style.fill = k.colors.bad;
          placement = "hash % 5"; servers = 5; metrics();
          await k.sleep(1000);
          let moved = 0;
          for (const c of cells) {
            const was = c.h % 4, now = c.h % 5;
            if (was !== now) { moved++; k.tone(c.b, "bad"); c.b.sub.textContent = `→ server ${now} (was ${was})`; }
            else { k.tone(c.b, "good"); c.b.sub.textContent = `→ server ${now} (stayed)`; }
            movedTxt.textContent = `${moved} of 24 keys moved`;
            movedTxtVal = `${moved} / 24`; metrics();
            await k.sleep(160);
          }
          busiest = peak(5);
          movedTxtVal = `${moved} / 24 (${Math.round(moved / 24 * 100)}%)`; metrics();
          movedTxt.textContent = `${moved} of 24 keys moved (${Math.round(moved / 24 * 100)}%)`; movedTxt.style.fill = k.colors.bad;
          k.say(`<b>${moved} of 24</b> keys moved for one new server.`);
          await k.sleep(1600);

          /* ---------- part 2: the ring ---------- */
          await k.step();
          k.say("Servers on a ring of hash values…");
          await k.tween(modG, { opacity: 0 }, 600);
          modG.remove();
          const CX = 215, CY = 175, R = 125, KR = 103;
          const ring = ringKit(k, CX, CY);
          const base = k.s("circle", { cx: CX, cy: CY, r: R, fill: "none", stroke: "line", "stroke-width": 2 });
          svg.append(base);
          const arcsG = k.s("g"), keysG = k.s("g"), nodesG = k.s("g");
          svg.append(arcsG, keysG, nodesG);
          k.text(svg, CX, CY + 4, "hash ring", { size: 12, tone: "muted" });
          k.text(svg, CX, CY + 20, "clockwise →", { size: 11, tone: "muted" });

          // load panel
          k.text(svg, 590, 34, "Keys per server", { size: 13, weight: 700 });
          const NAMES = ["A", "B", "C", "D", "E"];
          const rows = {};
          NAMES.forEach((n, i) => {
            const y = 66 + i * 34;
            k.text(svg, 452, y + 5, n, { size: 13, weight: 800, tone: TONES[n] });
            svg.append(k.s("rect", { x: 470, y: y - 7, width: 220, height: 14, rx: 7, fill: "surface2", stroke: "line" }));
            const fg = k.s("rect", { x: 470, y: y - 7, width: 0, height: 14, rx: 7, fill: TONES[n] });
            svg.append(fg);
            rows[n] = { fg, t: k.text(svg, 698, y + 5, "", { size: 12, anchor: "start", weight: 700 }) };
          });
          const moveTxt = k.text(svg, 590, 252, "", { size: 13, weight: 700 });
          const noteTxt = k.text(svg, 590, 274, "", { size: 12, tone: "muted" });

          const keys = Array.from({ length: 30 }, (_, i) => {
            const a = (i * 137.508 + 11) % 360, p = ring.pol(a, KR);
            const dot = k.dot(keysG, p.x, p.y, { r: 5.5, tone: "muted" });
            dot.setAttribute("opacity", 0);
            return { a, dot, owner: null };
          });
          let pts = [], nodeEls = {};

          function addPoint(name, a) {
            const el = nodeDot(k, nodesG, name, ring.pol(a, R));
            pts.push({ a, n: name, el });
            return el;
          }
          function reassign() {
            const sorted = ring.sortPts(pts), moves = [];
            for (const key of keys) {
              const o = ring.owner(key.a, sorted);
              if (key.owner && key.owner !== o) moves.push({ key, from: key.owner, to: o });
              key.owner = o;
              key.dot.circle.style.fill = k.colors[TONES[o]];
            }
            ring.drawArcs(arcsG, sorted, R, TONES);
            let top = 0;
            NAMES.forEach(n => {
              const c = keys.filter(x => x.owner === n).length;
              top = Math.max(top, c);
              k.tween(rows[n].fg, { width: c / 15 * 220 > 220 ? 220 : c / 15 * 220 }, 500).catch(() => {});
              rows[n].t.textContent = pts.some(p => p.n === n) ? String(c) : "—";
            });
            busiest = top;
            servers = new Set(pts.map(p => p.n)).size;
            metrics();
            return moves;
          }
          async function flash(moves) {
            await Promise.all(moves.map((m, i) => k.sleep(i * 60).then(async () => {
              await k.tween(m.key.dot.circle, { r: 10 }, 180);
              await k.tween(m.key.dot.circle, { r: 5.5 }, 260);
            })));
          }
          const uniq = arr => [...new Set(arr)].sort().join(", ");

          placement = "ring"; servers = 4; busiest = 0; movedTxtVal = "—"; metrics();
          for (const [n, a] of [["A", 20], ["B", 110], ["C", 160], ["D", 280]]) {
            const el = addPoint(n, a); nodeEls[n] = el;
            k.place(el, { scale: 0.2 }); await k.tween(el, { scale: 1 }, 300, k.ease.back);
            await k.sleep(200);
          }
          await k.sleep(600);
          k.say("…and the keys at their own hash positions.");
          for (const key of keys) { k.tween(key.dot, { opacity: 1 }, 250).catch(() => {}); await k.sleep(60); }
          await k.sleep(1000);

          // ownership walk
          await k.step();
          k.say("Walk clockwise from the key…");
          const sortedNow = ring.sortPts(pts);
          const demo = [keys.find(x => x.a > 120 && x.a < 155), keys.find(x => x.a > 295 && x.a < 355)].filter(Boolean);
          for (const key of demo) {
            const o = ring.owner(key.a, sortedNow), oa = pts.find(p => p.n === o).a;
            const walker = k.dot(svg, 0, 0, { r: 8, tone: "ink" });
            await k.travel(walker, [...ring.path(key.a, oa, KR), ring.pol(oa, R)], 1600);
            walker.remove();
            k.pulse(nodeEls[o]).catch(() => {});
            k.say(key === demo[1] ? `…wraps past the top: owner <b>${o}</b>.` : `…first server: owner <b>${o}</b>.`);
            await k.sleep(1400);
          }
          reassign();
          k.say("Every key coloured by its owner’s arc.");
          await k.sleep(1600);

          // add E
          await k.step();
          k.say("Server <b>E</b> joins between C and D…");
          await k.sleep(800);
          nodeEls.E = addPoint("E", 230);
          k.place(nodeEls.E, { scale: 0.2 }); await k.tween(nodeEls.E, { scale: 1 }, 350, k.ease.back);
          let moves = reassign();
          await flash(moves);
          movedTxtVal = `${moves.length} / 30 (${Math.round(moves.length / 30 * 100)}%)`; metrics();
          moveTxt.textContent = `Added E: ${moves.length} of 30 keys moved`; moveTxt.style.fill = k.colors.good;
          noteTxt.textContent = `all of them from ${uniq(moves.map(m => m.from))}`;
          k.say(`Only <b>${moves.length} of 30</b> keys moved.`);
          await k.sleep(1600);

          // remove B
          await k.step();
          k.say("Server <b>B</b> fails…");
          await k.sleep(800);
          await k.tween(nodeEls.B, { opacity: 0, scale: 0.3 }, 500);
          nodeEls.B.remove();
          pts = pts.filter(p => p.n !== "B");
          moves = reassign();
          await flash(moves);
          movedTxtVal = `${moves.length} / 30 (${Math.round(moves.length / 30 * 100)}%)`; metrics();
          moveTxt.textContent = `Removed B: ${moves.length} of 30 keys moved`;
          noteTxt.textContent = `all of them to ${uniq(moves.map(m => m.to))}`;
          k.say("B’s keys all land on one neighbour.");
          await k.sleep(1600);

          // virtual nodes
          await k.step();
          k.say("Each server at 3 points on the ring.");
          await Promise.all(pts.map(p => k.tween(p.el, { opacity: 0 }, 400)));
          nodesG.replaceChildren(); pts = []; nodeEls = {};
          keys.forEach(x => { x.owner = null; });
          placement = "ring + vnodes"; movedTxtVal = "—"; metrics();
          const V = [["A", 28], ["C", 63], ["B", 85], ["D", 116], ["B", 146], ["A", 172], ["D", 209], ["C", 234], ["A", 267], ["D", 294], ["C", 324], ["B", 354]];
          for (const [n, a] of V) {
            const el = addPoint(n, a);
            k.place(el, { scale: 0.2 }); await k.tween(el, { scale: 1 }, 200, k.ease.back);
          }
          reassign();
          moveTxt.textContent = "4 servers × 3 virtual nodes"; moveTxt.style.fill = k.colors.ink;
          noteTxt.textContent = "many small arcs each → even load";
          k.say("Many small arcs per server: even load.");
          await k.sleep(2000);

          // remove C with virtual nodes
          await k.step();
          k.say("Remove C…");
          await Promise.all(pts.filter(p => p.n === "C").map(p => k.tween(p.el, { opacity: 0, scale: 0.3 }, 500)));
          pts.filter(p => p.n === "C").forEach(p => p.el.remove());
          pts = pts.filter(p => p.n !== "C");
          moves = reassign();
          await flash(moves);
          movedTxtVal = `${moves.length} / 30 (${Math.round(moves.length / 30 * 100)}%)`; metrics();
          moveTxt.textContent = `Removed C: ${moves.length} of 30 keys moved`; moveTxt.style.fill = k.colors.good;
          noteTxt.textContent = `shared out to ${uniq(moves.map(m => m.to))}`;
          k.say(`C’s keys spread over <b>${uniq(moves.map(m => m.to))}</b>.`);
          await k.sleep(1800);
          k.done();
        });
      }
    },

    play: {
      title: "Ring Keeper",
      goal: "First, <b>click the server that owns</b> each highlighted key (first server clockwise). Then add three new servers by <b>clicking a + slot</b>: keep the busiest server’s load as low as possible.",
      build(stage, k) {
        const svg = k.svg(760, 340, { label: "A hash ring with servers, keys and empty slots, plus a load panel" });
        stage.append(svg);
        const CX = 215, CY = 178, R = 122, KR = 100;
        const ring = ringKit(k, CX, CY);
        svg.append(k.s("circle", { cx: CX, cy: CY, r: R, fill: "none", stroke: "line", "stroke-width": 2 }));
        const arcsG = k.s("g"), keysG = k.s("g"), slotsG = k.s("g"), nodesG = k.s("g");
        svg.append(arcsG, keysG, slotsG, nodesG);
        k.text(svg, CX, CY + 4, "clockwise →", { size: 11, tone: "muted" });

        const NKEYS = 40;
        const keys = Array.from({ length: NKEYS }, (_, i) => {
          const a = (i * 137.508 + 3) % 360, p = ring.pol(a, KR);
          return { a, dot: k.dot(keysG, p.x, p.y, { r: 5, tone: "muted" }), owner: null };
        });
        const ALL = ["A", "B", "C", "D", "E", "F", "G"];
        let pts = [];
        let phase = "predict", score = 0, busy = true;

        function clickable(el, label, fn) {
          el.style.cursor = "pointer";
          el.setAttribute("tabindex", 0); el.setAttribute("role", "button"); el.setAttribute("aria-label", label);
          el.addEventListener("click", () => k.run(fn));
          el.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); k.run(fn); } });
        }
        function addNode(name, a) {
          const el = nodeDot(k, nodesG, name, ring.pol(a, R));
          pts.push({ a, n: name, el });
          clickable(el, `Server ${name}`, () => pickOwner(name));
          return el;
        }
        for (const [n, a] of [["A", 30], ["B", 90], ["C", 120], ["D", 240]]) addNode(n, a);

        // load panel
        k.text(svg, 595, 30, "Keys per server", { size: 13, weight: 700 });
        const rows = {};
        ALL.forEach((n, i) => {
          const y = 58 + i * 30;
          k.text(svg, 455, y + 5, n, { size: 13, weight: 800, tone: TONES[n] });
          svg.append(k.s("rect", { x: 472, y: y - 7, width: 210, height: 14, rx: 7, fill: "surface2", stroke: "line" }));
          const fg = k.s("rect", { x: 472, y: y - 7, width: 0, height: 14, rx: 7, fill: TONES[n] });
          svg.append(fg);
          rows[n] = { fg, t: k.text(svg, 690, y + 5, "", { size: 12, anchor: "start", weight: 700 }) };
        });
        const info1 = k.text(svg, 595, 282, "", { size: 12.5, weight: 700 });
        const info2 = k.text(svg, 595, 304, "", { size: 12, tone: "muted" });
        const hud = () => k.hud({ Stage: phase === "predict" ? `Predict ${Math.min(pi + 1, 3)} / 3` : `Add server ${Math.min(placed + 1, 3)} / 3`, Score: score });

        const loads = sorted => {
          const c = {}; pts.forEach(p => { c[p.n] = 0; });
          keys.forEach(x => { c[ring.owner(x.a, sorted)]++; });
          return c;
        };
        function reveal() {
          const sorted = ring.sortPts(pts), moves = [];
          keys.forEach(x => {
            const o = ring.owner(x.a, sorted);
            if (x.owner && x.owner !== o) moves.push({ key: x, from: x.owner });
            x.owner = o;
            x.dot.circle.style.fill = k.colors[TONES[o]];
          });
          ring.drawArcs(arcsG, sorted, R, TONES);
          const c = loads(sorted);
          ALL.forEach(n => {
            const v = c[n];
            k.tween(rows[n].fg, { width: v == null ? 0 : Math.min(1, v / 20) * 210 }, 500).catch(() => {});
            rows[n].t.textContent = v == null ? "" : String(v);
          });
          return moves;
        }

        /* ---------- phase 1: predict owners ---------- */
        const initSorted = ring.sortPts(pts);
        const pickKey = (lo, hi) => keys.find(x => x.a > lo && x.a < hi) || k.pick(keys);
        const targets = [pickKey(140, 230), pickKey(92, 117), pickKey(270, 355)];
        let pi = 0, marker = null;
        function showTarget() {
          const t = targets[pi];
          marker = k.dot(svg, ring.pol(t.a, KR).x, ring.pol(t.a, KR).y, { r: 11, tone: "bad", label: "?", size: 12 });
          k.pulse(marker, 2).catch(() => {});
          k.say(["Which server owns the <b>?</b> key? Click it. (Rule: the first server clockwise.)",
                 "Next key. Careful: <b>nearest</b> is not the rule, <b>clockwise</b> is.",
                 "Last one. What happens past the top of the ring?"][pi]);
          hud(); busy = false;
        }
        async function pickOwner(name) {
          if (phase !== "predict" || busy) return;
          busy = true;
          const t = targets[pi], o = ring.owner(t.a, initSorted), oa = pts.find(p => p.n === o).a;
          const right = name === o;
          if (right) { score += 10; k.float(svg, CX, CY - 30, "+10", "good"); }
          else k.float(svg, CX, CY - 30, "✗", "bad");
          k.say(right ? `Yes: walking clockwise from the key, the first server is <b>${o}</b>.` : `Not ${name}. Walk <b>clockwise</b> from the key: the first server you meet is <b>${o}</b>${oa < t.a ? " (wrapping past the top)" : ""}.`);
          const walker = k.dot(svg, 0, 0, { r: 7, tone: "ink" });
          await k.travel(walker, [...ring.path(t.a, oa, KR), ring.pol(oa, R)], 1400);
          walker.remove();
          await k.sleep(right ? 900 : 2000);
          marker.remove();
          pi++; hud();
          if (pi < 3) return showTarget();
          startPlacement();
        }

        /* ---------- phase 2: place servers ---------- */
        let placed = 0, slots = [];
        const NEW = ["E", "F", "G"];
        function startPlacement() {
          phase = "place";
          reveal();
          slots = Array.from({ length: 12 }, (_, j) => 15 + j * 30).map(a => {
            const p = ring.pol(a, R);
            const g = k.s("g"); slotsG.append(g); k.place(g, { tx: p.x, ty: p.y });
            g.append(k.s("circle", { cx: 0, cy: 0, r: 13, fill: "surface", stroke: "accent", "stroke-width": 1.5, "stroke-dasharray": "3 3" }));
            k.text(g, 0, 5, "+", { size: 15, weight: 800, tone: "accent" });
            const slot = { a, g, used: false };
            clickable(g, `Add the new server at ring position ${a} degrees`, () => place(slot));
            return slot;
          });
          info1.textContent = "Busiest server: " + Math.max(...Object.values(loads(ring.sortPts(pts)))) + " keys";
          info2.textContent = "";
          k.say("Ownership revealed: each server owns the arc ending at it. Now add server <b>E</b>: click a <b>+</b> slot. A new server takes keys only from the server just clockwise of it.");
          hud(); busy = false;
        }
        function peakIf(a) {
          const sorted = ring.sortPts([...pts, { a, n: "?" }]);
          const c = {};
          keys.forEach(x => { const o = ring.owner(x.a, sorted); c[o] = (c[o] || 0) + 1; });
          return Math.max(...Object.values(c));
        }
        async function place(slot) {
          if (phase !== "place" || busy || slot.used) return;
          busy = true;
          const free = slots.filter(s => !s.used);
          const peaks = free.map(s => peakIf(s.a));
          const best = Math.min(...peaks), worst = Math.max(...peaks), mine = peakIf(slot.a);
          const pts20 = worst === best ? 20 : Math.round(20 * (worst - mine) / (worst - best));
          slot.used = true; slot.g.remove();
          const name = NEW[placed];
          const el = addNode(name, slot.a);
          k.place(el, { scale: 0.2 }); await k.tween(el, { scale: 1 }, 350, k.ease.back);
          const moves = reveal();
          await Promise.all(moves.map((m, i) => k.sleep(i * 50).then(async () => {
            await k.tween(m.key.dot.circle, { r: 9 }, 160);
            await k.tween(m.key.dot.circle, { r: 5 }, 240);
          })));
          score += pts20; placed++;
          const from = [...new Set(moves.map(m => m.from))].join(", ") || "nobody";
          info1.textContent = `${name} took ${moves.length} keys, all from ${from}`;
          info2.textContent = `busiest server: ${mine} keys (best possible ${best})`;
          info1.style.fill = k.colors[pts20 >= 15 ? "good" : pts20 >= 8 ? "warn" : "bad"];
          k.float(svg, ring.pol(slot.a, R).x, ring.pol(slot.a, R).y - 24, `+${pts20}`, pts20 >= 15 ? "good" : "warn");
          k.say(pts20 >= 15
            ? `Good spot: ${name} split the busiest arc. Only ${moves.length} of ${NKEYS} keys moved, all from one neighbour.`
            : `${name} took keys from ${from}, but the busiest server still holds ${mine} keys. Place new servers <b>inside the biggest arc</b>, roughly in its middle.`);
          hud();
          await k.sleep(2600);
          if (placed < 3) {
            k.say(`Add server <b>${NEW[placed]}</b>: click a <b>+</b> slot. Look for the longest arc.`);
            busy = false;
          } else end();
        }

        function end() {
          const text = `Score <b>${score}</b> of 90. Each new server only took keys from its clockwise neighbour, so every change moved a small slice of the keys, never the ~80% that <code>hash % N</code> would. Real systems add virtual nodes so placement evens out by itself.`;
          if (score < 30) k.lose(text + " Remember: a key belongs to the first server clockwise.");
          else k.win({ stars: k.starsFor(score, 55, 78), text });
        }

        hud();
        k.run(showTarget);
      }
    }
  };
})());
