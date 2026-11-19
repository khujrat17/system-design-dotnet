"use strict";
/* Concept 18 · Monolith, modular monolith, microservices. Watch: one checkout as in-process calls, then as a
   chain of network hops with latency, partial failure and independent deploys. Play: Draw the Boundaries. */
Lab.define(18, {
  watch: {
    title: "One checkout, three architectures",
    intro: "Follow one checkout through six modules: in one process, then across six services, one step at a time.",
    steps: [
      { label: "Monolith", tag: "concept", title: "One process, six modules",
        body: "<p>A ShopKart checkout touches six parts: Cart, Pricing, Inventory, Payment, Orders and Notify.</p><p>In a <b>monolith</b> they are modules in <b>one process</b>. Each step is an in-process method call: nanoseconds, and it can’t get lost on the network.</p>",
        idea: "A monolith is simple to build, test, debug and deploy. That is a real strength.",
        changed: ["6 in-process calls", "Latency < 0.01 ms · success 100%"] },
      { label: "Release train", tag: "problem", title: "One line, whole app redeployed",
        body: "<p>The Pricing team changes <b>one line</b>. The <b>whole app</b> must be rebuilt, retested and redeployed.</p><p>Six teams share one release train, so everyone waits for the slowest.</p>",
        idea: "The monolith’s pain is organisational: many teams, one deployable.",
        changed: ["Pricing edited", "The whole monolith redeploys"] },
      { label: "Tangle", tag: "failure", title: "Boundaries rot",
        body: "<p>Nothing stops Orders from reading Payment’s tables directly. Today’s shortcut is tomorrow’s hidden dependency.</p><p>Over time the modules <b>tangle</b>, and nobody can change one safely.</p>",
        idea: "Without enforced boundaries, a monolith slowly becomes a big ball of mud.",
        changed: ["Red link: Orders → Payment internals"] },
      { label: "Modular", tag: "technique", title: "The modular monolith",
        body: "<p>A <b>modular monolith</b> keeps one deployable, but each module has a public interface and owns its data.</p><p>An <b>architecture test</b> fails the build on illegal references, so the shortcut can’t be merged.</p>",
        idea: "Most of the design benefits of services, almost none of the operational cost.",
        changed: ["A fence around each module", "Illegal reference → build fails", "Still 1 deployable, in-process calls"] },
      { label: "Services", tag: "technique", title: "Six services, six databases",
        body: "<p><b>Microservices</b>: each module becomes its own deployable service with <b>its own database</b>.</p><p>Every arrow is now a <b>network call</b>: about <b>2 ms</b> and roughly <b>99%</b> reliable. One slow hop (+50 ms) drags the whole checkout.</p>",
        idea: "Every service boundary turns a method call into a network call, with latency and failure.",
        changed: ["Deployables: 6", "5 network hops", "Latency: 60 ms with one slow hop"] },
      { label: "Half-way", tag: "failure", title: "Partial failure",
        body: "<p>Payment charges the card, then the call to Orders <b>times out</b>.</p><p>The customer paid, but no order exists. Now you need <b>timeouts</b>, <b>retries</b>, <b>idempotency</b> and a <b>saga</b> to finish or undo the work.</p>",
        idea: "In the monolith one database transaction covered this. Across services there is no such transaction.",
        changed: ["Orders times out", "Payment: card charged, no order"] },
      { label: "0.99⁵", tag: "trade-off", title: "Reliability multiplies down",
        body: "<p>Each checkout needs 5 hops at 99%. <b>0.99⁵ ≈ 95.1%</b>, so about 1 checkout in 20 fails before any real bug.</p><p>The course’s C# demo simulates 2,000 checkouts and lands right on the formula.</p>",
        idea: "Every hop multiplies the failure odds. In-process calls never had this problem.",
        changed: ["20 checkouts: 18 ✓, 2 ✗", "Success rate: 95.1%"] },
      { label: "Ship alone", tag: "concept", title: "What you buy: independence",
        body: "<p>The Pricing team deploys <b>v2 on its own</b> while every other service keeps serving traffic.</p><p>You also get <b>independent scaling</b> and <b>fault isolation</b>: a crash in Notify doesn’t take down Cart.</p>",
        idea: "Microservices solve an organisational problem: many teams shipping independently.",
        changed: ["Pricing: deploying v2 → live", "The other 5 services stay up"] },
      { label: "Shared DB", tag: "failure", title: "The distributed monolith",
        body: "<p>If the services still <b>share one database</b>, a schema change forces them to deploy together again.</p><p>That is a <b>distributed monolith</b>: all the network costs, none of the independence.</p>",
        idea: "Database per service is what makes services independent. It isn’t optional.",
        changed: ["6 services → 1 shared database"] },
      { label: "Verdict", tag: "result", title: "Start modular, extract later",
        body: "<p>Start with a <b>modular monolith</b>. Extract a service only when a team or a scaling need demands it, along a boundary that is already clean.</p><p>Interview line: “modular monolith first; split by business capability, database per service, and design for partial failure.”</p>",
        idea: "Pick the architecture for your team size and rate of change, not for the hype.",
        changed: ["Back to one process with fenced modules", "1 deployable · success 100%"] }
    ],
    learn: [
      { text: "Why a monolith hurts as teams grow", step: 1 },
      { text: "What a modular monolith adds", step: 3 },
      { text: "Partial failure across services", step: 5 },
      { text: "Why 0.99⁵ matters", step: 6 },
      { text: "The distributed monolith trap", step: 8 }
    ],
    build(stage, k) {
      const svg = k.svg(760, 330, { label: "Six checkout modules as a monolith, a modular monolith and microservices" });
      stage.append(svg);
      const NAMES = ["Cart", "Pricing", "Inventory", "Payment", "Orders", "Notify"];
      const ICONS = ["🛒", "💲", "📦", "💳", "🧾", "✉️"];
      const X = i => 95 + i * 114, Y = 150, W = 94;

      const mono = k.s("rect", { x: 30, y: 102, width: 700, height: 96, rx: 16, fill: "surface2", stroke: "line", "stroke-width": 2 });
      svg.append(mono);
      const monoLabel = k.text(svg, 380, 92, "Shop monolith · one process · one deployable", { size: 12, weight: 700 });
      const mods = NAMES.map((n, i) => k.box(svg, { x: X(i), y: Y, label: n, icon: ICONS[i], sub: "module", w: W, h: 46, size: 12 }));
      const lat = k.text(svg, 380, 318, "", { size: 12, tone: "muted" });
      const extras = [];                     // things to remove between beats
      const clearExtras = () => { extras.splice(0).forEach(e => e.remove()); };

      let deployables = 1, hops = 0, latency = "—", success = "100%";
      const metrics = () => k.hud({ Deployables: deployables, "Network hops": hops, "Checkout latency": latency, "Success rate": success });
      metrics();

      /* Send one checkout along the chain. Returns true if it completed. */
      async function checkout({ hopMs, net = false, failAt = -1, slowAt = -1 }) {
        let ms = 0;
        hops = 0; latency = net ? "0 ms" : "< 0.01 ms"; metrics();
        const d = k.dot(svg, X(0), Y - 36, { r: 8, tone: "accent" });
        k.tone(mods[0], "accent");
        for (let i = 0; i < NAMES.length - 1; i++) {
          if (i === failAt) {
            await k.tween(d, { tx: (X(i) + X(i + 1)) / 2 }, hopMs / 2);
            d.circle.style.fill = k.colors.bad;
            k.float(svg, (X(i) + X(i + 1)) / 2, Y - 50, "✗ timeout", "bad");
            k.tone(mods[i + 1], "bad");
            ms += 2000;
            lat.textContent = `network hops ${i + 1} · ${k.fmt(ms)} ms · FAILED half-way`;
            hops = i + 1; latency = `${k.fmt(ms)} ms ✗`; metrics();
            await k.sleep(600);
            d.remove();
            return false;
          }
          await k.tween(d, { tx: X(i + 1) }, i === slowAt ? hopMs * 3 : hopMs, k.ease.linear);
          k.tone(mods[i], "neutral"); k.tone(mods[i + 1], "accent");
          ms += net ? 2 + (i === slowAt ? 50 : 0) : 0.0004;
          lat.textContent = net
            ? `network hops ${i + 1} · ${ms} ms${i === slowAt ? " (one slow hop: +50 ms)" : ""}`
            : `in-process calls ${i + 1} · ${(ms).toFixed(4)} ms`;
          if (net) { hops = i + 1; latency = `${ms} ms`; metrics(); }
        }
        await k.sleep(250);
        k.tone(mods[NAMES.length - 1], "good");
        d.remove();
        await k.sleep(500);
        k.tone(mods[NAMES.length - 1], "neutral");
        return true;
      }

      k.run(async () => {
        // 1 · monolith
        await k.step();
        k.say("A checkout runs through six modules in one process.");
        await k.sleep(1000);
        await checkout({ hopMs: 160 });
        await k.sleep(600);
        k.say("Again: six method calls, nanoseconds each.");
        await checkout({ hopMs: 160 });

        // 2 · release train
        await k.step();
        k.say("The Pricing team changes <b>one line</b>…");
        k.tone(mods[1], "lesson"); k.float(svg, X(1), Y - 40, "✎ 1 line", "lesson");
        await k.sleep(1600);
        mono.style.fill = k.colors.warnSoft; mono.style.stroke = k.colors.warn;
        mods.forEach(m => k.tone(m, "muted"));
        monoLabel.textContent = "redeploying the WHOLE app…";
        k.say("…and the <b>whole app</b> is rebuilt and redeployed.");
        await k.sleep(2400);

        // 3 · tangle
        await k.step();
        mono.style.fill = k.colors.surface2; mono.style.stroke = k.colors.line;
        mods.forEach(m => k.tone(m, "neutral"));
        monoLabel.textContent = "Shop monolith · one process · one deployable";
        k.say("Orders reaches straight into Payment’s tables.");
        const tangle = k.s("path", { d: `M${X(4)},${Y + 24} C${X(4)},${Y + 80} ${X(3)},${Y + 80} ${X(3)},${Y + 24}`, fill: "none", stroke: "bad", "stroke-width": 2.5, "stroke-dasharray": "6 4", opacity: 0 });
        svg.append(tangle); extras.push(tangle);
        const tl = k.text(svg, (X(3) + X(4)) / 2, Y + 82, "reads Payment internals", { size: 11, tone: "bad" });
        extras.push(tl);
        await k.tween(tangle, { opacity: 1 }, 800);
        k.tone(mods[4], "bad"); k.tone(mods[3], "bad");
        await k.sleep(3000);
        k.tone(mods[4], "neutral"); k.tone(mods[3], "neutral");

        // 4 · modular monolith
        await k.step();
        k.say("Each module gets a fence: a public interface and its own data.");
        const fences = mods.map((m, i) => { const r = k.s("rect", { x: X(i) - W / 2 - 5, y: Y - 28, width: W + 10, height: 56, rx: 12, fill: "none", stroke: "accent", "stroke-dasharray": "4 3", "stroke-width": 1.5 }); svg.append(r); return r; });
        extras.push(...fences);
        await k.sleep(1200);
        tl.textContent = "✗ build fails: illegal reference";
        await k.sleep(1600);
        await k.tween(tangle, { opacity: 0 }, 700);
        tl.textContent = "";
        k.say("Still one process, still in-process calls.");
        await checkout({ hopMs: 160 });
        await k.sleep(600);

        // 5 · microservices
        await k.step();
        clearExtras();
        k.say("Each module becomes a service with its own database.");
        await k.tween(mono, { opacity: 0 }, 800);
        monoLabel.textContent = "Six services · six deployables · each owns its data";
        mods.forEach(m => { m.sub.textContent = "service"; k.tone(m, "accent"); });
        for (let i = 0; i < NAMES.length; i++) {
          extras.push(k.line(svg, { x: X(i), y: Y + 23 }, { x: X(i), y: 232 }, { dashed: true }));
          extras.push(k.box(svg, { x: X(i), y: 245, w: 62, h: 26, label: "db", icon: "🗄️", size: 11, tone: "muted" }));
          if (i < NAMES.length - 1) extras.push(k.line(svg, { x: X(i) + W / 2, y: Y }, { x: X(i + 1) - W / 2, y: Y }, { arrow: true, tone: "ink" }));
        }
        deployables = 6; metrics();
        await k.sleep(1600);
        mods.forEach(m => k.tone(m, "neutral"));
        k.say("Same checkout. Every arrow is now a network call.");
        await checkout({ hopMs: 520, net: true, slowAt: 2 });
        k.say("Five hops before any real work; one slow hop dragged it all.");
        await k.sleep(800);

        // 6 · partial failure
        await k.step();
        k.say("Payment charges the card, then calls Orders…");
        await k.sleep(800);
        const ok = await checkout({ hopMs: 520, net: true, failAt: 3 });
        if (!ok) {
          k.tone(mods[3], "warn"); k.float(svg, X(3), Y - 40, "card charged", "warn");
          k.say("Paid, but no order exists.");
        }
        await k.sleep(1600);

        // 7 · 0.99^5
        await k.step();
        mods.forEach(m => k.tone(m, "neutral"));
        k.say("20 checkouts, each needing 5 hops at 99%…");
        const grid = [];
        let fails = 0;
        for (let j = 0; j < 20; j++) {
          const bad = j === 6 || j === 15;
          if (bad) fails++;
          const t = k.text(svg, 200 + j * 19, 296, bad ? "✗" : "✓", { size: 14, weight: 800, tone: bad ? "bad" : "good" });
          grid.push(t);
          await k.sleep(110);
        }
        lat.textContent = `${20 - fails}/20 succeeded · math: 0.99^5 = ${(Math.pow(0.99, 5) * 100).toFixed(1)}%  (in-process: 100%)`;
        success = `${(Math.pow(0.99, 5) * 100).toFixed(1)}%`; metrics();
        k.say("Every hop multiplies the failure odds: <b>0.99⁵ ≈ 95%</b>.");
        await k.sleep(1600);

        // 8 · independent deploys
        await k.step();
        grid.forEach(t => t.remove());
        k.say("Pricing deploys v2 while everything else keeps serving.");
        k.tone(mods[1], "warn"); mods[1].sub.textContent = "deploying v2";
        mods.forEach((m, i) => { if (i !== 1) k.tone(m, "good"); });
        lat.textContent = "independent deploys · independent scaling · fault isolation";
        await k.sleep(2800);
        k.tone(mods[1], "good"); mods[1].sub.textContent = "v2 live";
        k.float(svg, X(1), Y - 40, "v2 ✓", "good");
        await k.sleep(1400);

        // 9 · distributed monolith
        await k.step();
        mods.forEach(m => { k.tone(m, "neutral"); m.sub.textContent = "service"; });
        lat.textContent = "";
        clearExtras();
        k.say("Six services, one shared database…");
        for (let i = 0; i < NAMES.length; i++) extras.push(k.line(svg, { x: X(i), y: Y + 23 }, { x: 380, y: 250 }, { tone: "bad", dashed: true }));
        const shared = k.box(svg, { x: 380, y: 262, w: 200, h: 36, label: "one shared database", icon: "🗄️", tone: "bad", size: 12 });
        extras.push(shared);
        await k.sleep(1200);
        k.float(svg, 380, 232, "schema change!", "bad");
        mods.forEach(m => k.tone(m, "warn"));
        k.say("A schema change: all six must deploy together again.");
        await k.sleep(2400);

        // 10 · verdict
        await k.step();
        clearExtras();
        k.say("Start here: one process, fenced modules.");
        mods.forEach(m => { k.tone(m, "neutral"); m.sub.textContent = "module"; });
        monoLabel.textContent = "Modular monolith · one deployable · clean boundaries";
        await k.tween(mono, { opacity: 1 }, 800);
        mods.forEach((m, i) => extras.push(svg.appendChild(k.s("rect", { x: X(i) - W / 2 - 5, y: Y - 28, width: W + 10, height: 56, rx: 12, fill: "none", stroke: "accent", "stroke-dasharray": "4 3", "stroke-width": 1.5 }))));
        deployables = 1; success = "100%"; metrics();
        await checkout({ hopMs: 160 });
        k.say("Extract a service when a team or a scaling need demands it.");
        await k.sleep(1500);
        k.done();
      });
    }
  },

  play: {
    title: "Draw the Boundaries",
    goal: "Split 8 modules into <b>3 services</b> (2 or 3 modules each). Click a module to move it to the next service. Numbers on the links are calls per checkout: every red link becomes a network call. <b>Minimise them</b>, then ship.",
    build(stage, k) {
      const MODS = [
        { n: "Catalog", i: "📚" }, { n: "Cart", i: "🛒" }, { n: "Shipping", i: "🚚" }, { n: "Search", i: "🔎" },
        { n: "Orders", i: "🧾" }, { n: "Notify", i: "✉️" }, { n: "Pricing", i: "💲" }, { n: "Payment", i: "💳" }
      ];
      const EDGES = [[0, 3, 5], [0, 6, 4], [3, 6, 3], [1, 4, 5], [4, 7, 4], [1, 7, 2], [2, 5, 4], [1, 6, 1], [4, 2, 2], [7, 5, 1], [3, 1, 1]];
      const SVC = ["A", "B", "C"], TONE = ["accent", "lesson", "warn"];
      const TIME = 75;

      const cost = a => EDGES.reduce((s, [p, q, w]) => s + (a[p] !== a[q] ? w : 0), 0);
      const sizes = a => [0, 1, 2].map(s => a.filter(x => x === s).length);
      const valid = a => sizes(a).every(n => n >= 2 && n <= 3);
      let optimum = Infinity;
      for (let m = 0; m < 6561; m++) {
        const a = []; let x = m;
        for (let i = 0; i < 8; i++) { a.push(x % 3); x = Math.floor(x / 3); }
        if (valid(a)) optimum = Math.min(optimum, cost(a));
      }
      let assign;
      do { assign = k.shuffle([0, 0, 0, 1, 1, 1, 2, 2]); } while (cost(assign) <= optimum + 6);

      const svg = k.svg(760, 340, { label: "Eight modules on a ring, linked by how often they call each other" });
      stage.append(svg);
      const pos = MODS.map((_, i) => { const a = -Math.PI / 2 + i * Math.PI / 4; return { x: 380 + 290 * Math.cos(a), y: 172 + 120 * Math.sin(a) }; });

      const edgeEls = EDGES.map(([p, q, w]) => {
        const a = pos[p], b = pos[q];
        const line = k.line(svg, a, b, { width: 1.5 + w * 0.7 });
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const c = k.s("circle", { cx: mx, cy: my, r: 11, fill: "surface", "stroke-width": 1.5 });
        const t = k.text(null, mx, my + 4, String(w), { size: 12, weight: 800 });
        svg.append(c, t);
        return { line, c, t };
      });

      function clickable(el, label, fn) {
        el.setAttribute("tabindex", 0); el.setAttribute("role", "button"); el.setAttribute("aria-label", label);
        el.addEventListener("click", fn);
        el.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } });
      }
      const boxes = MODS.map((m, i) => {
        const b = k.box(svg, { ...pos[i], w: 114, h: 46, label: m.n, icon: m.i, sub: "Service A", size: 12 });
        clickable(b, `${m.n}: move to the next service`, () => cycle(i));
        return b;
      });
      const sizeText = k.text(svg, 740, 22, "", { size: 12, anchor: "end", weight: 700 });
      const costText = k.text(svg, 20, 22, "", { size: 12, anchor: "start", weight: 700 });
      const hint = k.text(svg, 20, 330, "green = same service (in-process) · red dashed = network call", { size: 11, anchor: "start", tone: "muted" });
      hint.setAttribute("opacity", 0.9);

      let left = TIME, over = false;
      function render() {
        boxes.forEach((b, i) => { k.tone(b, TONE[assign[i]]); b.sub.textContent = `Service ${SVC[assign[i]]}`; b.setAttribute("aria-label", `${MODS[i].n}, in service ${SVC[assign[i]]}. Move to the next service`); });
        EDGES.forEach(([p, q], j) => {
          const cross = assign[p] !== assign[q], e = edgeEls[j];
          e.line.style.stroke = k.colors[cross ? "bad" : "good"];
          e.line.setAttribute("stroke-dasharray", cross ? "6 5" : "");
          e.c.style.stroke = k.colors[cross ? "bad" : "good"];
        });
        const c = cost(assign), sz = sizes(assign), ok = valid(assign);
        sizeText.textContent = `A ${sz[0]} · B ${sz[1]} · C ${sz[2]}${ok ? " ✓" : " ✗ need 2–3 each"}`;
        sizeText.style.fill = k.colors[ok ? "ink" : "bad"];
        costText.textContent = `${c} network calls per checkout`;
        k.hud({ "Network calls": c, Latency: `${c * 2} ms`, Success: `${(Math.pow(0.99, c) * 100).toFixed(1)}%`, Time: `${left}s` });
        ship.disabled = !ok;
      }
      function cycle(i) {
        if (over) return;
        assign[i] = (assign[i] + 1) % 3;
        render();
        k.pulse(boxes[i]);
      }
      function finish(timeUp) {
        if (over) return;
        over = true;
        const c = cost(assign);
        if (!valid(assign)) return k.lose("Time ran out with an invalid split. Each of the 3 teams needs a service with 2 or 3 modules.");
        const text = `Your split needs <b>${c}</b> network calls per checkout (best possible: ${optimum}), so ${(Math.pow(0.99, c) * 100).toFixed(1)}% of checkouts survive 99%-reliable hops. Modules that talk a lot belong together: split along business capabilities, not at random.`;
        if (c > optimum + 9) k.lose(`${text} Look for the heavy links (4s and 5s) and keep both ends in the same service.`);
        else k.win({ stars: c <= optimum ? 3 : c <= optimum + 3 ? 2 : 1, text: (timeUp ? "Time’s up! " : "") + text });
      }
      const ship = k.button("Ship it 🚀", () => finish(false), { primary: true });
      k.every(1000, () => { left--; render(); if (left <= 0) finish(true); });

      k.say("Each red link is a chatty call crossing the network. Group modules that <b>talk the most</b> into the same service.");
      render();
    }
  }
});
