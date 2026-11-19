"use strict";
/* Concept 20 · Resilience. Watch: a slow dependency exhausts threads; timeouts free them; retries with backoff
   and jitter vs a retry storm; a circuit breaker going closed → open → half-open → closed. Play: Breaker Operator. */
Lab.define(20, {
  watch: {
    title: "When the payment provider hangs",
    intro: "Our Checkout API calls a payment provider. Watch what one slow dependency does to it, and how each pattern helps.",
    steps: [
      { label: "Healthy", tag: "concept", title: "Each call borrows a thread",
        body: "<p>The Checkout API has <b>8 threads</b>. Each request borrows one while it waits for the payment provider.</p><p>The provider answers in about <b>150 ms</b>, so threads come straight back.</p>",
        idea: "A thread waiting on a dependency is a thread nobody else can use.",
        changed: ["4 checkouts served", "Threads busy: back to 0/8"] },
      { label: "Hang", tag: "problem", title: "The provider stops answering",
        body: "<p>The provider gets <b>slow</b>: it accepts calls and never replies. Our API has <b>no timeout</b>, so every call waits forever.</p><p>Ten checkouts arrive. Eight grab the last threads and hang; the next two get <b>503</b>.</p>",
        idea: "Without a timeout, a hanging dependency holds your resources hostage.",
        changed: ["Threads busy: 8/8", "2 × 503"] },
      { label: "Cascade", tag: "failure", title: "Slow is worse than down",
        body: "<p><code>GET /products</code> never touches payments, yet it gets <b>503</b> too: there are no threads left to run it.</p><p>One hanging dependency took the <b>whole API</b> down with it. That is a <b>cascading failure</b>.</p>",
        idea: "A dependency that is down fails fast. One that is slow quietly eats everything.",
        changed: ["/products: 2 × 503", "Errors: 4"] },
      { label: "Timeout", tag: "fix", title: "Fix #1: always set a timeout",
        body: "<p>Give the call <b>300 ms</b>. After that, give up, free the thread and return an error quickly.</p><p>Payments still fail, but threads keep coming back, so <code>/products</code> keeps working. The failure stays <b>contained</b>.</p>",
        idea: "The most important resilience setting is the timeout. Never call the network without one.",
        changed: ["8 payment timeouts, threads freed", "/products: 2 served"] },
      { label: "Retry storm", tag: "failure", title: "Fix #2 done wrong: instant retries",
        body: "<p>Many failures are <b>transient</b>, so retrying makes sense. But five clients fail at the same moment and each retries <b>3 times, immediately</b>.</p><p>The struggling provider gets <b>10 extra calls in 50 ms</b>, again and again. Retries finish it off.</p>",
        idea: "Naive retries multiply load exactly when the dependency is weakest.",
        changed: ["Retry peak: 10 per 50 ms"] },
      { label: "Backoff", tag: "trade-off", title: "Exponential backoff",
        body: "<p><b>Exponential backoff</b> waits longer each time: <b>100, 200, 400 ms</b>. The provider gets room to recover.</p><p>But everyone waits the same time, so retries still arrive in <b>synchronised waves</b>.</p>",
        idea: "Backoff spreads retries over time, but not across clients.",
        changed: ["Retry peak: 5 per 50 ms", "Waves at 100, 300, 700 ms"] },
      { label: "Jitter", tag: "technique", title: "Add jitter",
        body: "<p><b>Jitter</b> adds a random part to each wait (up to the backoff itself), so clients drift apart.</p><p>Only retry calls that are <b>safe to repeat</b>: reads, or writes protected by an idempotency key.</p>",
        idea: "Backoff + jitter + a retry cap is the standard retry policy.",
        changed: ["Retry peak: 3 per 50 ms", "Retries spread out"] },
      { label: "Breaker", tag: "technique", title: "Fix #3: a circuit breaker",
        body: "<p>Now the provider is <b>down</b>. The breaker starts <b>CLOSED</b>: calls go through and fail.</p><p>After <b>3 failures</b> in a row it <b>OPENS</b>. While open, calls <b>fail fast</b> in about 1 ms and a <b>fallback</b> answers (“payment pending, we’ll email you”).</p>",
        idea: "An open breaker stops wasting threads on a dead dependency and gives it room to recover.",
        changed: ["Breaker: CLOSED → OPEN", "3 calls failed fast, 0 provider calls"] },
      { label: "Half-open", tag: "concept", title: "One trial call",
        body: "<p>After the <b>break duration</b> (1 s in the C# demo), the breaker goes <b>HALF-OPEN</b> and lets <b>one trial call</b> through.</p><p>The provider is still down, so the trial fails and the breaker <b>re-opens</b> for another break.</p>",
        idea: "Half-open probes recovery with one call instead of a flood.",
        changed: ["Breaker: OPEN → HALF-OPEN → OPEN"] },
      { label: "Recovered", tag: "result", title: "The circuit closes",
        body: "<p>The provider recovers. The next trial call succeeds, the breaker <b>CLOSES</b>, and traffic flows normally.</p><p>In .NET, <code>AddStandardResilienceHandler</code> (Polly) gives every HttpClient a timeout, retries with backoff + jitter and a circuit breaker.</p>",
        idea: "Interview line: “timeouts everywhere, retries with backoff and jitter on idempotent calls, a breaker with a fallback.”",
        changed: ["Breaker: HALF-OPEN → CLOSED", "3 payments served"] }
    ],
    learn: [
      { text: "Why slow is worse than down", step: 2 },
      { text: "Timeouts contain the damage", step: 3 },
      { text: "Retries with backoff and jitter", step: 6 },
      { text: "Circuit breaker: closed, open, half-open", step: 8 }
    ],
    build(stage, k) {
      const svg = k.svg(760, 330, { label: "Clients, a Checkout API with a thread pool, and a payment provider" });
      stage.append(svg);
      const CL = { x: 70, y: 140 }, API = { x: 290, y: 140 }, BR = { x: 470, y: 140 }, PR = { x: 650, y: 140 };
      let api, prov, slotEls = [], slotState = [], threadsText, reqText, parked = [];

      let errors = 0, served = 0, peak = "—", breaker = "none";
      const busy = () => slotState.filter(Boolean).length;
      const metrics = () => k.hud({ "Threads busy": `${busy()}/8`, Errors: errors, "Retry peak": peak, Breaker: breaker, "Served OK": served });
      metrics();

      function drawMain(withBreaker) {
        svg.replaceChildren();
        k.line(svg, CL, API, { dashed: true });
        k.line(svg, API, PR, { dashed: true });
        k.box(svg, { ...CL, label: "Clients", icon: "👥", w: 110 });
        api = k.box(svg, { ...API, label: "Checkout API", icon: "🖥️", sub: "no timeout", w: 150, h: 52 });
        prov = k.box(svg, { ...PR, label: "Payment provider", icon: "💳", sub: "healthy · 150 ms", w: 170, h: 52 });
        slotEls = []; slotState = Array(8).fill(false);
        for (let i = 0; i < 8; i++) {
          const r = k.s("rect", { x: API.x - 71 + i * 18, y: API.y + 40, width: 14, height: 14, rx: 3, fill: "surface2", stroke: "line" });
          svg.append(r); slotEls.push(r);
        }
        threadsText = k.text(svg, API.x, API.y + 74, "threads 0/8 busy", { size: 11, tone: "muted" });
        reqText = k.text(svg, CL.x, CL.y - 40, "", { size: 11, mono: true, tone: "muted" });
        metrics();
        if (withBreaker) return k.box(svg, { ...BR, label: "Breaker", icon: "⚡", sub: "CLOSED", w: 120, h: 52, tone: "good" });
      }
      function updThreads() {
        const n = busy();
        threadsText.textContent = `threads ${n}/8 busy`;
        threadsText.style.fill = k.colors[n >= 8 ? "bad" : "muted"];
        metrics();
      }
      function take(tone) {
        const i = slotState.indexOf(false);
        if (i < 0) return -1;
        slotState[i] = true; slotEls[i].style.fill = k.colors[tone]; updThreads();
        return i;
      }
      function free(i) { if (i < 0) return; slotState[i] = false; slotEls[i].style.fill = k.colors.surface2; updThreads(); }

      /* one checkout request in part A. mode: healthy | hang | timeout; products = doesn't need the provider */
      async function request(mode, products = false) {
        await k.packet(svg, CL, API, { ms: 350, r: 7, tone: products ? "lesson" : "accent" });
        const slot = take(products ? "lesson" : mode === "hang" ? "warn" : "accent");
        if (slot < 0) {
          errors++; metrics();
          k.float(svg, API.x, API.y - 36, "503", "bad");
          await k.packet(svg, API, CL, { tone: "bad", label: "503", r: 12, ms: 350 });
          return;
        }
        if (products) {
          await k.sleep(150); free(slot);
          served++; metrics();
          await k.packet(svg, API, CL, { tone: "good", r: 7, ms: 350 });
          return;
        }
        if (mode === "hang") {
          const d = k.dot(svg, API.x, API.y, { r: 7, tone: "warn" });
          parked.push(d);
          await k.tween(d, { tx: PR.x - 100 - (parked.length % 4) * 14, ty: PR.y - 30 + Math.floor(parked.length / 4) * 16 }, 450);
          return;                                    // never answers, the thread stays busy
        }
        const d = k.dot(svg, API.x, API.y, { r: 7, tone: "accent" });
        await k.tween(d, { tx: PR.x - 90 }, 400);
        if (mode === "timeout") {
          await k.sleep(300);
          d.circle.style.fill = k.colors.bad;
          k.float(svg, API.x + 80, API.y - 24, "timeout", "bad");
          await k.tween(d, { tx: API.x }, 250);
          d.remove(); free(slot);
          errors++; metrics();
          await k.packet(svg, API, CL, { tone: "bad", label: "!", r: 9, ms: 300 });
        } else {
          await k.sleep(150);
          d.circle.style.fill = k.colors.good;
          await k.tween(d, { tx: API.x }, 400);
          d.remove(); free(slot);
          served++; metrics();
          await k.packet(svg, API, CL, { tone: "good", r: 7, ms: 350 });
        }
      }
      const stream = (n, gap, fn) => Promise.all(Array.from({ length: n }, (_, i) => k.sleep(i * gap).then(() => fn(i))));

      /* part B: timelines of retry attempts */
      const MAXT = 1500, TX = ms => 175 + ms * 0.36;           // 0 … 1500 ms
      async function timeline(y, title, schedule) {
        k.text(svg, 12, y + 4, title, { size: 12, anchor: "start", weight: 700 });
        for (let r = 0; r < 5; r++) k.line(svg, { x: TX(0), y: y - 26 + r * 13 }, { x: TX(MAXT), y: y - 26 + r * 13 }, { tone: "line", width: 1 });
        const cur = k.s("line", { x1: TX(0), x2: TX(0), y1: y - 34, y2: y + 30, stroke: "ink", "stroke-width": 1.5 });
        svg.append(cur);
        const all = schedule.flatMap((times, r) => times.map(t => ({ t, r }))).sort((a, b) => a.t - b.t);
        let prev = 0;
        for (const a of all) {
          if (a.t > MAXT) continue;
          await k.tween(cur, { x1: TX(a.t), x2: TX(a.t) }, Math.max(0, (a.t - prev) * 2.4), k.ease.linear);
          prev = a.t;
          const c = k.s("circle", { cx: TX(a.t), cy: y - 26 + a.r * 13, r: 5, fill: a.t === 0 ? "muted" : "warn" });
          svg.append(c);
        }
        await k.tween(cur, { x1: TX(MAXT), x2: TX(MAXT) }, Math.max(0, (MAXT - prev) * 2.4), k.ease.linear);
        cur.remove();
        // peak calls landing in the same 50 ms slot (excluding the first attempts)
        const buckets = {};
        all.filter(a => a.t > 0 && a.t <= MAXT).forEach(a => { const b = Math.floor(a.t / 50); buckets[b] = (buckets[b] || 0) + 1; });
        const peak = Math.max(0, ...Object.values(buckets));
        const t = k.text(svg, 12, y + 20, `peak ${peak} retries / 50 ms`, { size: 11, anchor: "start", tone: peak >= 4 ? "bad" : "good" });
        return { peak, t };
      }

      k.run(async () => {
        // ---------------- part A: slow dependency, threads, timeouts ----------------
        // 1 · healthy
        await k.step();
        drawMain(false);
        k.say("Each request borrows a thread while it waits.");
        await k.sleep(1000);
        await stream(4, 500, () => request("healthy"));
        await k.sleep(600);
        k.say("Healthy: threads come straight back.");

        // 2 · the provider hangs
        await k.step();
        k.say("The provider stops answering. No timeout…");
        k.tone(prov, "warn"); prov.sub.textContent = "hanging · no reply";
        await k.sleep(1200);
        await stream(10, 420, () => request("hang"));
        k.say("Every thread is stuck waiting.");
        await k.sleep(800);

        // 3 · the cascade
        await k.step();
        k.say("<code>GET /products</code> doesn’t need payments…");
        reqText.textContent = "GET /products";
        await k.sleep(800);
        await request("healthy", true);
        await k.sleep(600);
        await request("healthy", true);
        k.say("…but there is no thread left to run it.");
        await k.sleep(1200);

        // 4 · timeout
        await k.step();
        drawMain(false);
        parked = [];
        k.tone(prov, "warn"); prov.sub.textContent = "hanging · no reply";
        api.sub.textContent = "timeout 300 ms"; k.tone(api, "accent");
        k.say("Timeout 300 ms: give up and free the thread.");
        await k.sleep(1200);
        await stream(10, 420, i => i === 4 || i === 8 ? (reqText.textContent = "GET /products", request("healthy", true)) : request("timeout"));
        reqText.textContent = "";
        k.say("Payments fail fast; <code>/products</code> still works.");
        await k.sleep(1000);

        // ---------------- part B: retries ----------------
        // 5 · retry storm
        await k.step();
        svg.replaceChildren();
        k.say("Five clients fail at once and retry immediately.");
        k.text(svg, TX(0), 22, "0 ms", { size: 11, tone: "muted" });
        k.text(svg, TX(MAXT), 22, `${MAXT} ms`, { size: 11, tone: "muted" });
        await k.sleep(1000);
        const immediate = Array.from({ length: 5 }, () => [0, 20, 40, 60]);
        const s1 = await timeline(70, "Immediate retry", immediate);
        peak = `${s1.peak} / 50 ms`; metrics();
        k.say(`Retry storm: <b>${s1.peak} retries</b> in one 50 ms slot.`);
        await k.sleep(1000);

        // 6 · backoff
        await k.step();
        k.say("Backoff: wait 100, 200, 400 ms.");
        const backoff = Array.from({ length: 5 }, () => [0, 100, 300, 700]);
        const s2 = await timeline(160, "Backoff, no jitter", backoff);
        peak = `${s2.peak} / 50 ms`; metrics();
        k.say(`Synchronised waves: peak <b>${s2.peak}</b>.`);
        await k.sleep(1000);

        // 7 · jitter (fixed "random" waits so every replay looks the same)
        await k.step();
        k.say("Backoff + jitter: each wait gets a random extra.");
        const jitter = [
          [0, 130, 390, 1000],
          [0, 170, 520, 1180],
          [0, 110, 440, 880],
          [0, 190, 450, 1000],
          [0, 150, 480, 1260]
        ];
        const s3 = await timeline(250, "Backoff + jitter", jitter);
        peak = `${s3.peak} / 50 ms`; metrics();
        k.say(`Spread out: peak <b>${s3.peak}</b>.`);
        await k.sleep(1000);

        // ---------------- part C: circuit breaker ----------------
        // 8 · breaker opens
        await k.step();
        const br = drawMain(true);
        api.sub.textContent = "timeout 300 ms";
        k.tone(prov, "bad"); prov.sub.textContent = "down · 503";
        const failText = k.text(svg, BR.x, BR.y + 44, "failures 0/3", { size: 11, tone: "muted" });
        const coolMeter = k.meter(svg, { x: BR.x - 60, y: BR.y + 60, w: 120, max: 100, value: 0, tone: "bad", label: "" });
        coolMeter.g.setAttribute("opacity", 0);
        const fbText = k.text(svg, 12, 250, "", { size: 11, anchor: "start", tone: "muted" });
        let failures = 0, state = "CLOSED";
        function setState(s) {
          state = s;
          br.sub.textContent = s;
          k.tone(br, s === "CLOSED" ? "good" : s === "OPEN" ? "bad" : "warn");
          breaker = s; metrics();
        }
        setState("CLOSED");
        async function call() {
          await k.packet(svg, CL, API, { ms: 300, r: 7 });
          await k.packet(svg, API, BR, { ms: 300, r: 7 });
          if (state === "OPEN") {
            k.float(svg, BR.x, BR.y - 36, "fail fast · 1 ms", "bad");
            fbText.textContent = "fallback: “payment pending, we’ll email you”";
            errors++; metrics();
            await k.packet(svg, BR, CL, { tone: "muted", r: 7, ms: 450 });
            return;
          }
          const d = k.dot(svg, BR.x, BR.y, { r: 7, tone: "accent" });
          await k.tween(d, { tx: PR.x - 95 }, 350);
          const healthy = prov.dataset.tone === "good";
          if (!healthy) await k.sleep(300);
          d.circle.style.fill = k.colors[healthy ? "good" : "bad"];
          await k.tween(d, { tx: BR.x }, 350);
          d.remove();
          if (healthy) {
            failures = 0; failText.textContent = "failures 0/3";
            served++; metrics();
            if (state === "HALF-OPEN") { setState("CLOSED"); k.float(svg, BR.x, BR.y - 36, "trial ✓ → closed", "good"); }
            await k.packet(svg, BR, CL, { tone: "good", r: 7, ms: 500 });
          } else {
            failures++;
            errors++; metrics();
            failText.textContent = `failures ${Math.min(failures, 3)}/3`;
            if (state === "HALF-OPEN" || failures >= 3) { setState("OPEN"); k.pulse(br); }
            await k.packet(svg, BR, CL, { tone: "bad", r: 7, ms: 500 });
          }
        }
        async function coolDown(ms) {
          coolMeter.g.setAttribute("opacity", 1);
          coolMeter.set(0);
          const steps = 20;
          for (let i = 1; i <= steps; i++) { await k.sleep(ms / steps); coolMeter.set(i * 100 / steps); }
          coolMeter.g.setAttribute("opacity", 0);
        }

        k.say("The provider is down. The breaker is CLOSED: calls go through.");
        await k.sleep(1200);
        for (let i = 0; i < 3; i++) await call();
        k.say("Three failures: the breaker <b>OPENS</b>. Now calls fail fast.");
        await k.sleep(800);
        for (let i = 0; i < 3; i++) await call();

        // 9 · half-open
        await k.step();
        k.say("Break duration running…");
        await coolDown(2400);
        setState("HALF-OPEN");
        k.say("HALF-OPEN: one trial call goes through.");
        await k.sleep(800);
        await call();
        k.say("Still down: the breaker <b>re-opens</b>.");
        await k.sleep(1000);

        // 10 · recovered
        await k.step();
        k.tone(prov, "good"); prov.sub.textContent = "recovered";
        k.say("The provider has recovered. Waiting out the break…");
        await coolDown(2400);
        setState("HALF-OPEN");
        await k.sleep(800);
        await call();
        fbText.textContent = "";
        k.say("Trial succeeded: the breaker <b>CLOSES</b>.");
        await call();
        await call();
        await k.sleep(1200);
        k.done();
      });
    }
  },

  play: {
    title: "Breaker Operator",
    goal: "Payments flow through your circuit breaker while the provider goes up and down unseen. <b>Open</b> the breaker when calls fail, <b>probe</b> while open to find out when it’s back. Successes +1, timeouts −1. A provider hammered while down recovers at half speed.",
    build(stage, k) {
      const DURATION = 60, GAP = 0.25;
      const svg = k.svg(760, 300, { label: "Users, an API, your circuit breaker and a payment provider" });
      stage.append(svg);
      const U = { x: 75, y: 120 }, A = { x: 235, y: 120 }, B = { x: 420, y: 120 }, P = { x: 650, y: 120 };
      k.line(svg, U, A, { dashed: true });
      k.line(svg, A, P, { dashed: true });
      k.box(svg, { ...U, label: "Users", icon: "👥", sub: "4 payments / s", w: 120, h: 50 });
      k.box(svg, { ...A, label: "Checkout API", icon: "🖥️", sub: "timeout 300 ms", w: 140, h: 50 });
      const prov = k.box(svg, { ...P, label: "Provider", icon: "💳", sub: "health: unknown", w: 150, h: 50 });
      const brk = k.box(svg, { ...B, label: "CLOSED", icon: "⚡", sub: "click to open", w: 150, h: 60, tone: "good", size: 14 });
      const probeBtn = k.box(svg, { x: B.x, y: 215, label: "Probe", icon: "🔍", sub: "half-open: 1 trial call", w: 170, h: 46, tone: "muted" });

      function clickable(el, label, fn) {
        el.setAttribute("tabindex", 0); el.setAttribute("role", "button"); el.setAttribute("aria-label", label);
        el.addEventListener("click", fn);
        el.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } });
      }
      clickable(brk, "Circuit breaker: toggle open or closed", () => setOpen(!open, true));
      clickable(probeBtn, "Probe: send one trial call while the breaker is open", () => probe());

      // recent results strip
      k.text(svg, P.x, 182, "last 8 calls (newest right)", { size: 11, tone: "muted" });
      const strip = Array.from({ length: 8 }, (_, j) => {
        const r = k.s("rect", { x: P.x - 80 + j * 20, y: 192, width: 16, height: 18, rx: 3, fill: "surface2", stroke: "line" });
        const t = k.text(null, P.x - 72 + j * 20, 205, "", { size: 11, weight: 800 });
        svg.append(r, t); return { r, t };
      });
      const results = [];
      function pushResult(ok) {
        results.push(ok); if (results.length > 8) results.shift();
        strip.forEach((s, j) => {
          const v = results[j];
          s.r.style.fill = k.colors[v === undefined ? "surface2" : v ? "goodSoft" : "badSoft"];
          s.t.textContent = v === undefined ? "" : v ? "✓" : "✗";
          s.t.style.fill = k.colors[v ? "good" : "bad"];
        });
      }
      const fbText = k.text(svg, 235, 275, "", { size: 11, tone: "muted" });

      // hidden health schedule
      const segs = [];
      for (let sum = 0, up = true; sum < 100; up = !up) { const d = up ? k.rand(6, 9) : k.rand(4.5, 7); segs.push({ up, d }); sum += d; }
      let ideal = 0;
      for (let ta = GAP; ta <= DURATION + 1e-9; ta += GAP) {
        let s = 0, i = 0;
        while (s + segs[i].d < ta) { s += segs[i].d; i++; }
        if (segs[i].up) ideal++;
      }
      let segI = 0, segLeft = segs[0].d;
      const isUp = () => segs[segI].up;

      let t = 0, acc = 0, score = 0, succ = 0, fails = 0, fallbacks = 0, open = false, probing = false, over = false;
      function hud() {
        k.hud({ Score: score, Time: `${Math.max(0, Math.ceil(DURATION - t))}s`, Breaker: open ? "OPEN" : "CLOSED" });
      }
      function setOpen(v, manual) {
        if (over || probing) return;
        open = v;
        brk.label.textContent = open ? "⚡ OPEN" : "⚡ CLOSED";
        brk.sub.textContent = open ? "failing fast · click to close" : "click to open";
        k.tone(brk, open ? "bad" : "good");
        k.tone(probeBtn, open ? "warn" : "muted");
        if (!open) fbText.textContent = "";
        if (manual) k.pulse(brk);
        hud();
      }
      function flash(tone) { k.tone(prov, tone); k.after(220, () => k.tone(prov, "neutral")); }

      function spawn() {
        if (open) {
          fallbacks++;
          fbText.textContent = `fallbacks served fast: ${fallbacks}`;
          k.run(async () => {
            const d = k.dot(svg, U.x + 60, U.y, { r: 6, tone: "accent" });
            try {
              await k.tween(d, { tx: B.x - 80 }, 380, k.ease.linear);
              d.circle.style.fill = k.colors.muted;
              await k.tween(d, { tx: U.x + 60, opacity: 0 }, 380, k.ease.linear);
            } finally { d.remove(); }
          });
          return;
        }
        const ok = isUp();
        k.run(async () => {
          const d = k.dot(svg, U.x + 60, U.y, { r: 6, tone: "accent" });
          try {
            await k.tween(d, { tx: P.x - 80 }, 480, k.ease.linear);
            if (!ok) await k.sleep(300);             // the timeout
            d.circle.style.fill = k.colors[ok ? "good" : "bad"];
            flash(ok ? "good" : "bad");
            if (ok) { succ++; score += 1; } else { fails++; score -= 1; k.float(svg, P.x, P.y - 36, "timeout −1", "bad"); }
            pushResult(ok); hud();
            await k.tween(d, { tx: U.x + 60 }, 380, k.ease.linear);
          } finally { d.remove(); }
        });
      }

      function probe() {
        if (!open || probing || over) return;
        probing = true;
        brk.label.textContent = "⚡ HALF-OPEN"; brk.sub.textContent = "one trial call…";
        k.tone(brk, "warn");
        const ok = isUp();
        k.run(async () => {
          const d = k.dot(svg, B.x + 75, B.y, { r: 8, tone: "warn", label: "?" });
          try {
            await k.tween(d, { tx: P.x - 80 }, 350, k.ease.linear);
            if (!ok) await k.sleep(300);
            d.circle.style.fill = k.colors[ok ? "good" : "bad"];
            flash(ok ? "good" : "bad");
            pushResult(ok);
            await k.tween(d, { tx: B.x + 75 }, 300, k.ease.linear);
          } finally { d.remove(); }
          probing = false;
          if (ok) { setOpen(false); k.toast("Trial call succeeded → circuit <b>closed</b>", "good"); }
          else { setOpen(true); k.toast("Trial failed → stay <b>open</b>", "bad"); }
        });
      }

      function end() {
        const ratio = ideal ? score / ideal : 0;
        const text = `Score <b>${score}</b> of a possible ~${ideal}: ${succ} payments succeeded, ${fails} users waited for a timeout, ${fallbacks} got a fast fallback.`;
        if (ratio < 0.1) k.lose(`${text} Open the breaker as soon as the strip turns red, and probe while it’s open so you close it again the moment the provider is back.`);
        else k.win({ stars: k.starsFor(ratio, 0.35, 0.6), text: `${text} A breaker trades a few fast failures for not wasting threads on a dead dependency, and probing (half-open) finds the recovery without a flood.` });
      }

      k.loop(dt => {
        if (over) return false;
        t += dt;
        segLeft -= dt * (!segs[segI].up && !open ? 0.5 : 1);
        while (segLeft <= 0 && segI < segs.length - 1) { segI++; segLeft += segs[segI].d; }
        acc += dt;
        while (acc >= GAP) { acc -= GAP; spawn(); }
        hud();
        if (t >= DURATION) { over = true; k.run(async () => { await k.sleep(900); end(); }); return false; }
      });

      k.say("You can’t see the provider’s health, only the results of calls. Red ✗s mean timeouts: <b>open the breaker</b>. While open, <b>probe</b> to see if it’s back.");
      hud();
    }
  }
});
