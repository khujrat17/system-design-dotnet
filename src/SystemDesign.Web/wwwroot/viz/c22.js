"use strict";
/* Concept 22 · Observability. Watch: one checkout traced across services, the slow span, logs found by trace ID,
   and why p99 beats the average. Play: Incident Commander (metrics → trace → root cause). */
(function () {
  /** Make an SVG element keyboard- and mouse-clickable. */
  function clickable(el, label, fn) {
    el.setAttribute("tabindex", 0);
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", label);
    el.style.cursor = "pointer";
    el.addEventListener("click", fn);
    el.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } });
  }

  Lab.define(22, {
    watch: {
      title: "Who made checkout slow?",
      intro: "One request crosses five services. The <b>trace</b> shows where the time went; the <b>metrics</b> show who it hurts.",
      steps: [
        { label: "Slow pay", tag: "problem", title: "Checkout is slow, but where?",
          body: "<p>A shopper presses <b>Pay</b> and waits. The request touches <b>five services</b> and a database, each with its own logs on its own machine.</p><p>checkout-api starts a <b>trace</b> with ID <code>4bf92f35</code> and opens the <b>root span</b>.</p>",
          idea: "Without a shared ID, five services means five unrelated log files and a lot of guessing.",
          changed: ["Request reaches checkout-api", "Root span opens in the waterfall"] },
        { label: "Propagate", tag: "concept", title: "The trace ID travels with every call",
          body: "<p>Every outgoing call carries the ID in a <code>traceparent</code> header. Each service records a <b>child span</b>: name, start time, duration.</p><p>In .NET, <code>System.Diagnostics.Activity</code> and OpenTelemetry do this for you.</p>",
          idea: "Context propagation is what turns scattered timings into one connected picture.",
          changed: ["cart span: 15 ms", "pricing span: 20 ms"] },
        { label: "Waterfall", tag: "concept", title: "Spans nest into a waterfall",
          body: "<p>inventory reserves stock and runs <b>SQL UPDATE Stock</b>, a grandchild span. Then payment charges the card.</p><p>The shopper waited <b>460 ms</b> in total. Parent spans stay open while their children run.</p>",
          idea: "A waterfall shows every hop of one request on a single time axis.",
          changed: ["inventory 346 ms, SQL 340 ms, payment 60 ms", "Checkout: 460 ms"] },
        { label: "Self time", tag: "technique", title: "Find the span with the most self time",
          body: "<p>The root and inventory spans are long only because they <b>wait for their children</b>. Look for the span whose <b>own</b> time is largest.</p><p>Here it is <b>SQL UPDATE Stock: 340 of 460 ms</b>.</p>",
          idea: "The trace tells you <b>where</b> the time went: follow it down to the leaf that owns it.",
          changed: ["Parents greyed out", "SQL span turns red"] },
        { label: "Logs", tag: "technique", title: "Logs found by trace ID",
          body: "<p>Search the structured logs for the same <code>traceId</code> (the <b>correlation ID</b>). One warning line explains it: a <b>row lock</b> wait of 331 ms.</p>",
          idea: "Traces say where; logs say <b>what</b> happened there.",
          changed: ["Log line with traceId 4bf92f35 appears"] },
        { label: "Metrics", tag: "concept", title: "Now look at 100 checkouts",
          body: "<p>One trace is one request. <b>Metrics</b> aggregate all of them: here the last 100 checkouts, bucketed by latency.</p><p>The <b>average</b> is under 100 ms. A dashboard that shows only the average looks healthy.</p>",
          idea: "Metrics tell you <b>how much</b> and how often, cheaply, for every request.",
          changed: ["100 requests fall into buckets", "Average marker drawn"] },
        { label: "p99", tag: "failure", title: "The average hides the slow tail",
          body: "<p>Sort the requests: the slowest 1% start at about <b>1,640 ms</b>. That is <b>p99</b>, and the SLO says <b>p99 &lt; 300 ms</b>.</p><p>Those slow requests are real people, often your best customers with the biggest carts.</p>",
          idea: "Alert on <b>p99 and error rate</b>, never on the average.",
          changed: ["SLO line at 300 ms", "p99 marker far to the right, in red"] },
        { label: "Fix", tag: "fix", title: "Fix the lock, watch p99 drop",
          body: "<p>The trace already named the culprit. Shorten the stock transaction, ship it, and the two slow requests become fast.</p><p>SLI = what you measure (p99), <b>SLO</b> = the target, SLA = the contract.</p>",
          idea: "Metrics say how much, traces say where, logs say what. Use all three.",
          changed: ["Slow bars move to the first bucket", "p99 back inside the SLO"] }
      ],
      learn: [
        { text: "How a trace ID links spans across services", step: 1 },
        { text: "Finding the slow span by its self time", step: 3 },
        { text: "Correlating logs with the trace ID", step: 4 },
        { text: "Why p99 beats the average for alerting", step: 6 }
      ],
      build(stage, k) {
        const svg = k.svg(760, 340, { label: "A checkout request traced across services as a span waterfall, then a latency histogram with average and p99" });
        stage.append(svg);
        const TRACE = "4bf92f35";
        let spanCount = 0, elapsed = 0, slowest = "—", avgMs = "—", p99Ms = "—";
        const metrics = () => k.hud({ Spans: spanCount, "Slowest span": slowest, Checkout: elapsed ? `${elapsed} ms` : "—", Average: avgMs, p99: p99Ms });
        metrics();

        k.run(async () => {
          /* ---------------- step 1: the slow checkout ---------------- */
          await k.step();
          const g = k.s("g"); svg.append(g);
          const BUS = 92;
          const P = {
            client: { x: 60, y: 48 }, api: { x: 200, y: 48 }, sql: { x: 570, y: 48 },
            cart: { x: 330, y: 128 }, pricing: { x: 450, y: 128 }, inventory: { x: 570, y: 128 }, payment: { x: 690, y: 128 }
          };
          k.line(g, P.client, P.api, { dashed: true });
          k.line(g, P.api, { x: P.api.x, y: BUS }, { dashed: true });
          k.line(g, { x: P.api.x, y: BUS }, { x: P.payment.x, y: BUS }, { dashed: true });
          for (const s of ["cart", "pricing", "inventory", "payment"]) k.line(g, { x: P[s].x, y: BUS }, P[s], { dashed: true });
          k.line(g, P.inventory, P.sql, { dashed: true });
          const B = {
            client: k.box(g, { ...P.client, label: "Client", icon: "📱", w: 96, h: 38 }),
            api: k.box(g, { ...P.api, label: "checkout-api", w: 124, h: 38 }),
            sql: k.box(g, { ...P.sql, label: "SQL", icon: "🗄️", w: 96, h: 38 }),
            cart: k.box(g, { ...P.cart, label: "cart", w: 104, h: 36 }),
            pricing: k.box(g, { ...P.pricing, label: "pricing", w: 104, h: 36 }),
            inventory: k.box(g, { ...P.inventory, label: "inventory", w: 104, h: 36 }),
            payment: k.box(g, { ...P.payment, label: "payment", w: 104, h: 36 })
          };

          // the waterfall
          const X0 = 190, S = 1.2, rowY = i => 182 + i * 21;
          const header = k.text(g, 15, 166, "", { anchor: "start", size: 12, weight: 700, tone: "muted" });
          const spans = [
            { name: "POST /checkout", start: 0, dur: 460, depth: 0 },
            { name: "cart GetCart", start: 6, dur: 15, depth: 1 },
            { name: "pricing Calculate", start: 24, dur: 20, depth: 1 },
            { name: "inventory Reserve", start: 48, dur: 346, depth: 1 },
            { name: "SQL UPDATE Stock", start: 52, dur: 340, depth: 2 },
            { name: "payment Charge", start: 396, dur: 60, depth: 1 }
          ];
          spans.forEach((sp, i) => {
            const y = rowY(i);
            k.text(g, 15 + sp.depth * 12, y + 4, sp.name, { anchor: "start", size: 11.5 });
            sp.bar = k.s("rect", { x: X0 + sp.start * S, y: y - 7, width: 0, height: 14, rx: 3, fill: sp.depth ? "accent" : "accentSoft", stroke: "accent" });
            g.append(sp.bar);
            const inside = sp.dur * S > 60;
            sp.lbl = k.text(g, inside ? X0 + sp.start * S + 6 : X0 + (sp.start + sp.dur) * S + 5, y + 4, `${sp.dur} ms`,
              { anchor: "start", size: 11, weight: 700, tone: inside && sp.depth ? "surface" : "ink" });
            sp.lbl.setAttribute("opacity", 0);
          });
          const [root, cart, pricing, inv, sql, pay] = spans;
          k.line(g, { x: X0, y: 302 }, { x: X0 + 460 * S, y: 302 }, { width: 1.5 });
          for (let t = 0; t <= 400; t += 100) k.text(g, X0 + t * S, 317, t ? `${t} ms` : "0", { size: 11, tone: "muted" });

          const path = (svc, back) => {
            const pts = [P.api, { x: P.api.x, y: BUS }, { x: P[svc].x, y: BUS }, P[svc]];
            return back ? pts.reverse() : pts;
          };
          async function hop(points, ms, tone = "accent") {
            const d = k.dot(g, points[0].x, points[0].y, { r: 13, label: "4bf9", size: 9, tone });
            try { await k.travel(d, points, ms); } finally { d.remove(); }
          }
          async function grow(sp, ms) {
            await k.tween(sp.bar, { width: sp.dur * S }, ms, k.ease.linear);
            sp.lbl.setAttribute("opacity", 1);
          }
          const rootTo = (t, ms) => k.tween(root.bar, { width: t * S }, ms, k.ease.linear);

          k.say("Shopper presses <b>Pay</b>: the request enters checkout-api.");
          await k.sleep(1000);
          k.tone(B.client, "accent");
          await hop([P.client, P.api], 700);
          k.tone(B.client, "neutral"); k.tone(B.api, "accent");
          header.textContent = `trace ${TRACE} · one request, one row per span`;
          spanCount = 1; elapsed = 6; metrics();
          await rootTo(6, 300);
          k.say("Root span <b>POST /checkout</b> is open.");
          await k.sleep(1500);

          /* ---------------- step 2: propagation ---------------- */
          await k.step();
          k.say("Each call carries <code>traceparent</code>: cart, then pricing.");
          await k.sleep(800);
          for (const [svc, sp] of [["cart", cart], ["pricing", pricing]]) {
            k.tone(B[svc], "accent");
            await hop(path(svc), 650);
            spanCount++; metrics();
            await Promise.all([grow(sp, 450), rootTo(sp.start + sp.dur, 450)]);
            elapsed = sp.start + sp.dur; metrics();
            await hop(path(svc, true), 500, "good");
            k.tone(B[svc], "neutral");
          }
          k.say("cart 15 ms, pricing 20 ms. Fast.");
          await k.sleep(800);

          /* ---------------- step 3: the waterfall ---------------- */
          await k.step();
          k.say("inventory runs <b>SQL UPDATE Stock</b> and waits…");
          k.tone(B.inventory, "accent");
          await hop(path("inventory"), 650);
          spanCount++; metrics();
          await Promise.all([k.tween(inv.bar, { width: 4 * S }, 200), rootTo(52, 200)]);
          await hop([P.inventory, P.sql], 450);
          spanCount++; metrics();
          k.tone(B.sql, "warn");
          await Promise.all([
            grow(sql, 3000),
            k.tween(inv.bar, { width: 344 * S }, 3000, k.ease.linear),
            rootTo(392, 3000)
          ]);
          elapsed = 392; metrics();
          k.tone(B.sql, "neutral");
          await hop([P.sql, P.inventory], 450, "good");
          await Promise.all([grow(inv, 150), rootTo(394, 150)]);
          await hop(path("inventory", true), 500, "good");
          k.tone(B.inventory, "neutral");

          k.say("Finally payment charges the card: 60 ms.");
          k.tone(B.payment, "accent");
          await hop(path("payment"), 650);
          spanCount++; metrics();
          await Promise.all([grow(pay, 500), rootTo(456, 500)]);
          await hop(path("payment", true), 500, "good");
          k.tone(B.payment, "neutral");
          await grow(root, 120);
          elapsed = 460; metrics();
          await hop([P.api, P.client], 600, "good");
          k.tone(B.api, "neutral");
          k.say("The shopper waited <b>460 ms</b>.");

          /* ---------------- step 4: self time ---------------- */
          await k.step();
          k.say("Parents only <b>wait</b>. Grey them out…");
          root.bar.style.fill = k.colors.surface2; root.bar.style.stroke = k.colors.line;
          inv.bar.style.fill = k.colors.accentSoft;
          inv.lbl.style.fill = k.colors.ink;
          await k.sleep(2000);
          sql.bar.style.fill = k.colors.bad; sql.bar.style.stroke = k.colors.bad;
          k.tone(B.sql, "bad");
          slowest = "SQL 340 ms"; metrics();
          await k.pulse(B.sql, 2);
          k.say("…<b>SQL UPDATE Stock</b> owns 340 of 460 ms.");
          await k.sleep(1500);

          /* ---------------- step 5: logs by trace ID ---------------- */
          await k.step();
          k.say("Search the logs for <code>traceId 4bf92f35</code>.");
          await k.sleep(2200);
          const log = k.text(g, 15, 335, `{"level":"Warning","traceId":"${TRACE}","msg":"Lock wait on Stock row","waitMs":331}`,
            { anchor: "start", size: 11, mono: true, tone: "bad" });
          log.setAttribute("opacity", 0);
          await k.tween(log, { opacity: 1 }, 500);
          k.say("One warning line: a <b>row lock</b>.");
          await k.sleep(1200);

          /* ---------------- step 6: metrics ---------------- */
          await k.step();
          await k.tween(g, { opacity: 0 }, 600);
          g.remove();
          const h = k.s("g"); svg.append(h);
          const BASE = 280, BW = 32, PER = 1.8;
          const HX = ms => 70 + Math.min(ms, 2000) * 0.32;
          k.text(h, 380, 24, "Latency of 100 checkout requests (100 ms buckets)", { size: 13, weight: 700 });
          k.line(h, { x: HX(0), y: BASE }, { x: HX(2000), y: BASE }, { width: 1.5 });
          for (let t = 0; t <= 2000; t += 500) k.text(h, HX(t), BASE + 17, t ? `${k.fmt(t)} ms` : "0", { size: 11, tone: "muted" });
          const counts = new Array(20).fill(0);
          const barH = c => c ? Math.max(6, c * PER) : 0;
          const bins = counts.map((_, b) => {
            const r = k.s("rect", { x: 70 + b * BW + 2, y: BASE, width: BW - 4, height: 0, rx: 2, fill: b >= 3 ? "bad" : "accent" });
            const t = k.text(h, 70 + b * BW + BW / 2, BASE - 4, "", { size: 11, weight: 700 });
            h.append(r);
            return { r, t };
          });
          function setBin(b) {
            const hh = barH(counts[b]);
            bins[b].r.setAttribute("y", BASE - hh); bins[b].r.setAttribute("height", hh);
            bins[b].t.setAttribute("y", BASE - hh - 4); bins[b].t.textContent = counts[b] || "";
          }
          const binOf = ms => Math.min(19, Math.floor(ms / 100));

          const lat = [];
          for (let i = 0; i < 98; i++) lat.push(40 + (i * 37) % 41);
          lat.push(1640, 1880);
          const stats = arr => {
            const s = [...arr].sort((a, b) => a - b);
            const q = p => s[Math.ceil(p * s.length) - 1];
            return { avg: Math.round(s.reduce((a, b) => a + b, 0) / s.length), p50: q(.5), p95: q(.95), p99: q(.99) };
          };

          k.say("The last 100 checkouts drop into latency buckets.");
          await k.sleep(800);
          // a fixed arrival order (37 is coprime with 100), so every replay looks the same
          const order = lat.map((ms, i) => ({ ms, o: (i * 37 + 11) % 100 })).sort((a, b) => a.o - b.o).map(x => x.ms);
          await Promise.all(order.map((ms, i) => k.sleep(i * 40).then(async () => {
            const b = binOf(ms), x = 70 + b * BW + BW / 2;
            await k.packet(h, { x, y: 44 }, { x, y: BASE - barH(counts[b]) - 4 }, { r: 4, tone: ms > 300 ? "bad" : "accent", ms: 420 });
            counts[b]++; setBin(b);
          })));
          await k.sleep(600);

          const L = [0, 1, 2, 3].map(i => k.text(h, 300, 78 + i * 24, "", { anchor: "start", size: 13.5, weight: 600 }));
          function showStats(st) {
            const ok = v => v < 300;
            const rows = [[`average  ${st.avg} ms`, null], [`p50      ${st.p50} ms`, null], [`p95      ${st.p95} ms`, null],
              [`p99      ${k.fmt(st.p99)} ms  ${ok(st.p99) ? "✓ within SLO" : "✗ breaks the SLO"}`, ok(st.p99)]];
            rows.forEach(([txt, good], i) => {
              L[i].textContent = txt;
              L[i].style.fill = good == null ? k.colors.ink : good ? k.colors.good : k.colors.bad;
            });
          }
          const before = stats(lat);
          L.forEach(t => { t.classList.add("lab-mono"); t.style.whiteSpace = "pre"; });

          // markers: average, SLO and p99
          const avgMk = k.s("g"); h.append(avgMk);
          const avgLine = k.s("line", { x1: 0, y1: 52, x2: 0, y2: BASE, "stroke-width": 2, "stroke-dasharray": "4 3", stroke: "ink" });
          avgMk.append(avgLine);
          k.text(avgMk, -4, 64, `avg`, { anchor: "end", size: 11, weight: 700 });
          k.place(avgMk, { tx: HX(before.avg) });
          avgMk.setAttribute("opacity", 0);

          k.say(`Average: <b>${before.avg} ms</b>. Looks healthy.`);
          L[0].textContent = `average  ${before.avg} ms`;
          avgMs = `${before.avg} ms`; metrics();
          await k.tween(avgMk, { opacity: 1 }, 400);
          await k.sleep(1500);

          /* ---------------- step 7: p99 ---------------- */
          await k.step();
          const slo = k.s("g"); h.append(slo);
          slo.append(k.s("line", { x1: HX(300), y1: 52, x2: HX(300), y2: BASE, "stroke-width": 2, "stroke-dasharray": "6 4", stroke: "warn" }));
          k.text(slo, HX(300) + 5, 64, "SLO: p99 < 300 ms", { anchor: "start", size: 11, weight: 700, tone: "warn" });
          showStats(before);
          const p99Mk = k.s("g"); h.append(p99Mk);
          p99Mk.append(k.s("line", { x1: 0, y1: 168, x2: 0, y2: BASE, "stroke-width": 2.5, stroke: "bad" }));
          const p99Lbl = k.text(p99Mk, 5, 176, "p99", { anchor: "start", size: 12, weight: 800, tone: "bad" });
          k.place(p99Mk, { tx: HX(before.p99) });
          p99Mk.setAttribute("opacity", 0);
          await k.tween(p99Mk, { opacity: 1 }, 500);
          p99Ms = `${k.fmt(before.p99)} ms ✗`; metrics();
          k.say(`p99 is <b>${k.fmt(before.p99)} ms</b>: the SLO is broken.`);
          await k.sleep(1200);

          /* ---------------- step 8: the fix ---------------- */
          await k.step();
          k.say("Shorten the stock transaction and ship the fix…");
          await k.sleep(1500);
          const fixed = lat.slice(0, 98).concat([70, 75]);
          await Promise.all([16, 18].map((b, i) => k.sleep(i * 300).then(async () => {
            counts[b]--; setBin(b);
            await k.packet(h, { x: 70 + b * BW + BW / 2, y: BASE - 10 }, { x: 70 + BW / 2, y: BASE - barH(counts[0]) - 4 }, { r: 5, tone: "good", ms: 900 });
            counts[0]++; setBin(0);
          })));
          const after = stats(fixed);
          showStats(after);
          p99Lbl.style.fill = k.colors.good;
          await Promise.all([k.tween(p99Mk, { tx: HX(after.p99) }, 900), k.tween(avgMk, { tx: HX(after.avg) }, 900)]);
          avgMs = `${after.avg} ms`; p99Ms = `${after.p99} ms ✓`; metrics();
          k.say(`p99 is now <b>${after.p99} ms</b>, inside the SLO.`);
          await k.sleep(1500);
          k.done();
        });
      }
    },

    play: {
      title: "Incident Commander",
      goal: "Five latency alerts. For each, first click the endpoint whose <b>p99 breaks the SLO</b> (300 ms), then click the span in its trace that is the <b>root cause</b>. Wrong clicks cost points.",
      build(stage, k) {
        const svg = k.svg(760, 330, { label: "Metrics dashboard, then a trace waterfall to investigate" });
        stage.append(svg);
        const ROUNDS = 5, SLO = 300;
        const EPS = ["POST /checkout", "GET /cart", "GET /search", "GET /product/{id}", "POST /login", "GET /orders", "GET /recommendations"];
        const SERVICES = ["cart GetCart", "pricing Calculate", "inventory Reserve", "payment Charge", "users Profile", "shipping Quote", "search Query", "recs Suggest"];
        const LEAVES = ["SQL UPDATE Stock", "SQL SELECT Orders", "Redis GET price", "HTTP bank /charge", "SQL SELECT Users", "Blob GET image", "HTTP tax /rate"];
        const reason = name =>
          name.startsWith("SQL") ? k.pick(["lock wait on a hot row", "missing index: full table scan"]) :
          name.startsWith("HTTP") ? "upstream timed out, retried twice" :
          name.startsWith("Redis") ? "connection pool exhausted" :
          name.startsWith("Blob") ? "large object read without CDN" :
          k.pick(["thread pool starvation", "long GC pause"]);

        let round = 0, score = 0, solved = 0, timeLeft = 90, busy = false, over = false;
        let view = k.s("g"); svg.append(view);
        const hud = () => k.hud({ Incident: `${Math.min(round + 1, ROUNDS)} / ${ROUNDS}`, Score: score, Time: `${timeLeft}s` });
        const reset = () => { view.remove(); view = k.s("g"); svg.append(view); };

        /* ----- step 1: metrics ----- */
        function showMetrics() {
          reset(); busy = false;
          const eps = k.shuffle(EPS).slice(0, 3);
          const rows = k.shuffle([
            { ep: eps[0], avg: k.randInt(60, 95), p99: k.randInt(900, 1900), bad: true },
            { ep: eps[1], avg: k.randInt(170, 240), p99: k.randInt(240, 290) },
            { ep: eps[2], avg: k.randInt(25, 60), p99: k.randInt(90, 160) }
          ]).map(r => ({ ...r, rps: k.randInt(40, 600) }));
          k.text(view, 380, 30, `🚨 Alert ${round + 1}: users report slowness. SLO: p99 < ${SLO} ms`, { size: 14, weight: 700, tone: "bad" });
          const head = [["Endpoint", 40, "start"], ["req/s", 400, "middle"], ["average", 520, "middle"], ["p99", 650, "middle"]];
          for (const [t, x, a] of head) k.text(view, x, 64, t, { anchor: a, size: 12, tone: "muted", weight: 700 });
          rows.forEach((r, i) => {
            const y = 100 + i * 58;
            const rg = k.s("g"); view.append(rg);
            const rect = k.s("rect", { x: 20, y: y - 22, width: 720, height: 46, rx: 10, fill: "surface", stroke: "line", "stroke-width": 1.5 });
            rg.append(rect);
            k.text(rg, 40, y + 5, r.ep, { anchor: "start", size: 14, weight: 700, mono: true });
            k.text(rg, 400, y + 5, k.fmt(r.rps), { size: 14 });
            k.text(rg, 520, y + 5, `${r.avg} ms`, { size: 14 });
            k.text(rg, 650, y + 5, `${k.fmt(r.p99)} ms`, { size: 14, weight: 700 });
            clickable(rg, `${r.ep}: average ${r.avg} milliseconds, p99 ${r.p99} milliseconds`, () => k.run(() => pickEndpoint(r, rect, y)));
          });
          k.text(view, 380, 300, "Step 1 · Metrics: which endpoint is breaking the SLO? Click its row.", { size: 13, tone: "muted" });
          k.say("Metrics tell you <b>how much</b> and <b>which</b>. Compare each endpoint's p99 with the SLO.");
        }

        async function pickEndpoint(r, rect, y) {
          if (busy || over || r.tried) return;
          r.tried = true;
          if (r.bad) {
            busy = true; score += 50; hud();
            k.tone(rect, "good");
            k.float(svg, 650, y - 24, "+50", "good");
            k.say(`Right: <b>${r.ep}</b> averages only ${r.avg} ms, but its p99 is <b>${k.fmt(r.p99)} ms</b>. Open one of its slow traces…`);
            await k.sleep(1300);
            showTrace(r.ep);
          } else {
            score = Math.max(0, score - 25); hud();
            k.tone(rect, "bad");
            k.float(svg, 650, y - 24, "−25", "bad");
            k.say(r.avg > 150
              ? `<b>${r.ep}</b> has the highest <b>average</b>, but its p99 (${r.p99} ms) is inside the SLO: nearly every user is fine there.`
              : `<b>${r.ep}</b> is healthy: p99 ${r.p99} ms is under ${SLO} ms.`);
          }
        }

        /* ----- step 2: the trace ----- */
        function genTrace(ep) {
          const root = { name: ep, self: 6, kids: [], depth: 0 };
          const leaves = k.shuffle(LEAVES);
          let li = 0;
          for (const name of k.shuffle(SERVICES).slice(0, k.randInt(3, 4))) root.kids.push({ name, depth: 1, self: k.randInt(15, 70), kids: [] });
          for (const p of k.shuffle(root.kids).slice(0, k.randInt(1, 2))) {
            p.self = k.randInt(4, 12);
            const n = k.randInt(1, 2);
            for (let j = 0; j < n; j++) p.kids.push({ name: leaves[li++], depth: 2, self: k.randInt(8, 40), kids: [] });
          }
          const all = [];
          (function walk(n) { all.push(n); n.kids.forEach(walk); })(root);
          const culprit = k.pick(all.filter(n => n.depth > 0 && n.kids.length === 0));
          culprit.self += k.randInt(300, 600);
          culprit.culprit = true;
          const total = n => (n.dur = n.self + n.kids.reduce((s, c) => s + total(c), 0));
          total(root);
          (function place(n, start) {
            n.start = start;
            let t = start + Math.floor(n.self / 2);
            for (const c of n.kids) { place(c, t); t += c.dur; }
          })(root, 0);
          return { all, root, culprit };
        }

        function showTrace(ep) {
          reset(); busy = false;
          const t = genTrace(ep);
          const traceId = Array.from({ length: 8 }, () => "0123456789abcdef"[k.randInt(0, 15)]).join("");
          k.text(view, 380, 28, `Trace ${traceId} · one slow ${ep}`, { size: 14, weight: 700 });
          const X0 = 230, W = 480, S = W / t.root.dur, top = 60, step = Math.min(28, 228 / t.all.length);
          t.all.forEach((n, i) => {
            const y = top + i * step;
            const rg = k.s("g"); view.append(rg);
            const hit = k.s("rect", { x: 12, y: y - step / 2 + 1, width: 736, height: step - 2, rx: 6, fill: "accentSoft", opacity: 0 });
            rg.append(hit);
            k.text(rg, 20 + n.depth * 14, y + 4, n.name, { anchor: "start", size: 12, mono: n.depth === 2 });
            const w = Math.max(2, n.dur * S);
            const bar = k.s("rect", { x: X0 + n.start * S, y: y - 7, width: w, height: 14, rx: 3, fill: n.depth ? "accent" : "accentSoft", stroke: "accent" });
            rg.append(bar);
            const inside = w > 64;
            k.text(rg, inside ? X0 + n.start * S + 6 : X0 + n.start * S + w + 5, y + 4, `${n.dur} ms`,
              { anchor: "start", size: 11, weight: 700, tone: inside && n.depth ? "surface" : "ink" });
            const show = on => hit.setAttribute("opacity", on ? 1 : 0);
            rg.addEventListener("mouseenter", () => show(true)); rg.addEventListener("mouseleave", () => show(false));
            rg.addEventListener("focus", () => show(true)); rg.addEventListener("blur", () => show(false));
            clickable(rg, `Span ${n.name}, ${n.dur} milliseconds`, () => k.run(() => pickSpan(n, bar, y, traceId)));
          });
          const axisY = top + t.all.length * step;
          k.text(view, X0, axisY + 6, "0", { size: 11, tone: "muted" });
          k.text(view, X0 + W, axisY + 6, `${t.root.dur} ms`, { size: 11, tone: "muted" });
          k.say("Step 2 · Trace: click the span where the time is actually spent (its <b>own</b> time, not time waiting for children).");
        }

        async function pickSpan(n, bar, y, traceId) {
          if (busy || over || n.tried) return;
          n.tried = true;
          if (n.culprit) {
            busy = true; score += 100; solved++; hud();
            bar.style.fill = k.colors.bad; bar.style.stroke = k.colors.bad;
            k.float(svg, 700, y - 10, "+100", "good");
            const why = reason(n.name);
            k.text(view, 20, 318, `{"traceId":"${traceId}","span":"${n.name}","ms":${n.self},"msg":"${why}"}`, { anchor: "start", size: 11, mono: true, tone: "bad" });
            k.say(`Root cause: <b>${n.name}</b> spent ${n.self} ms on its own. Its logs, found by the same trace ID, say: <b>${why}</b>.`);
            await k.sleep(2200);
            round++;
            if (round >= ROUNDS) end(false); else { hud(); showMetrics(); }
          } else {
            score = Math.max(0, score - 30); hud();
            k.float(svg, 700, y - 10, "−30", "bad");
            bar.style.fill = k.colors.surface2;
            k.say(n.kids.length
              ? `<b>${n.name}</b> is long only because it <b>waits for its children</b>. Follow the time down to a span with no slow child under it.`
              : `<b>${n.name}</b> took ${n.dur} ms. That is not where the time went.`);
          }
        }

        function end(timeout) {
          if (over) return;
          over = true;
          const text = `You solved <b>${solved} of ${ROUNDS}</b> incidents for <b>${score}</b> points${timeout ? " before time ran out" : ""}. ` +
            "Judge endpoints by p99 against the SLO (not the average), then follow the trace down to the span with the most <b>self time</b>.";
          if (score < 250) k.lose(text);
          else k.win({ stars: k.starsFor(score, 450, 650), text });
        }

        k.every(1000, () => {
          if (over) return;
          timeLeft = Math.max(0, timeLeft - 1); hud();
          if (timeLeft === 0) end(true);
        });
        hud();
        showMetrics();
      }
    }
  });
})();
