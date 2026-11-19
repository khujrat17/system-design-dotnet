"use strict";
/* Concept 19 · Rate limiting. Watch: a token bucket refilling while requests spend tokens or get 429, then
   fixed window vs sliding window vs token bucket on a window-boundary burst. Play: Tune the Bucket. */
Lab.define(19, {
  watch: {
    title: "How a bucket stops a flood",
    intro: "Watch tokens drip into a bucket while requests spend them. Then see why a fixed window lets twice the limit through.",
    steps: [
      { label: "Bucket", tag: "concept", title: "A bucket of tokens",
        body: "<p>One client can flood an API and starve everyone else, so a <b>rate limiter</b> sits in front and decides per client.</p><p>A <b>token bucket</b> holds up to <b>5 tokens</b> and refills at <b>1 token per second</b>. Each request must take a token to get through.</p>",
        idea: "Two numbers define the bucket: capacity (the biggest burst) and refill rate (the long-run limit).",
        changed: ["Bucket full: 5 / 5 tokens", "2 requests pass, 2 tokens spent"] },
      { label: "Burst", tag: "technique", title: "7 requests at once",
        body: "<p>A page load fires <b>7 requests at once</b>. The first 5 spend the stored tokens: <b>bursts are allowed</b>, up to the capacity.</p><p>The last 2 find the bucket empty and get <b>429 Too Many Requests</b> with a <code>Retry-After</code> header.</p>",
        idea: "Capacity is how much burst you tolerate. Stored tokens let normal page loads through.",
        changed: ["5 allowed, 2 × 429", "Tokens: 5 → 0"] },
      { label: "Steady", tag: "concept", title: "Slower than the refill",
        body: "<p>A well-behaved client sends <b>one request every ~2 seconds</b>, slower than the refill.</p><p>Every request finds a token waiting. The client never notices the limiter.</p>",
        idea: "Clients under the refill rate are never limited, however long they run.",
        changed: ["4 more allowed, 0 × 429", "Bucket stays near full"] },
      { label: "Too fast", tag: "failure", title: "4 per second drains it",
        body: "<p>A client sends <b>4 requests per second</b>, faster than the refill. The stored burst goes first.</p><p>After that, only the tokens that drip in pass: about <b>1 per second</b>. The rest get 429.</p>",
        idea: "However fast a client sends, the long-run rate it gets is the refill rate.",
        changed: ["12 sent: 7 allowed, 5 × 429", "Pattern: 6 ✓, then 1 ✓ per second"] },
      { label: "Refill", tag: "trade-off", title: "Refill stops at capacity",
        body: "<p>When traffic stops, the bucket refills, but <b>never beyond its capacity</b>. Saving up for an hour still buys a burst of only 5.</p><p>Bigger capacity: friendlier to bursts, but a bigger hit on the API. Higher rate: more throughput per client.</p>",
        idea: "Capacity = the largest burst; refill rate = the long-run limit. Tune them separately.",
        changed: ["Tokens: 0 → 5, then stop", "The drip fades when full"] },
      { label: "Boundary", tag: "problem", title: "One policy, three algorithms",
        body: "<p>New policy: <b>10 requests per 10 seconds</b>. A client sends 10 requests just before the 10 s mark and 10 just after: <b>20 requests in 2 seconds</b>.</p><p>Let’s run three common algorithms against that same traffic.</p>",
        idea: "Window boundaries are where simple limiters leak.",
        changed: ["Timeline from 4 s to 16 s", "20 requests marked around 10 s"] },
      { label: "Fixed window", tag: "failure", title: "The counter resets at 10 s",
        body: "<p>A <b>fixed window</b> keeps one counter per clock window (0–10 s, 10–20 s) and resets it on the boundary.</p><p>10 requests fill the first window, the counter resets, and 10 more fill the second: <b>all 20 pass</b> in 2 seconds.</p>",
        idea: "A fixed window can let through twice the limit around a boundary.",
        changed: ["Allowed: 20 of 20", "2× the policy"] },
      { label: "Sliding", tag: "fix", title: "Count the last 10 seconds",
        body: "<p>A <b>sliding window log</b> counts the requests in the <b>last 10 seconds</b>, measured from now, not from the clock.</p><p>The 10 early requests are still inside the window, so the 10 late ones get <b>429</b>.</p>",
        idea: "Sliding windows are exact, at the cost of storing a timestamp per request.",
        changed: ["Allowed: 10 of 20", "10 × 429"] },
      { label: "Bucket wins", tag: "result", title: "Token bucket: bursts OK, average capped",
        body: "<p>A <b>token bucket</b> with capacity 10 and 1 token/s lets the burst empty it; then only tokens that dripped in pass: <b>11 of 20</b>.</p><p>It is the usual choice. Answer with <b>429 + Retry-After</b>; with many servers share counters in <b>Redis</b> or limit at the gateway. In .NET: <code>AddRateLimiter</code>.</p>",
        idea: "Interview line: “token bucket per user, 429 with Retry-After, counters in Redis or at the gateway.”",
        changed: ["Allowed: 11 of 20", "Capacity + rate × time"] }
    ],
    learn: [
      { text: "How a token bucket allows bursts", step: 1 },
      { text: "Why the refill rate caps the long-run rate", step: 3 },
      { text: "The fixed-window boundary burst", step: 6 },
      { text: "How sliding windows and buckets fix it", step: 8 }
    ],
    build(stage, k) {
      const svg = k.svg(760, 330, { label: "A client, a token bucket rate limiter and an API" });
      stage.append(svg);

      /* ---------- part 1: token bucket ---------- */
      const CL = { x: 80, y: 175 }, IN = { x: 300, y: 175 }, OUT = { x: 420, y: 175 }, API = { x: 660, y: 175 };
      const CAP = 5, RATE = 1;
      k.line(svg, CL, IN, { dashed: true });
      k.line(svg, OUT, API, { dashed: true, arrow: true });
      k.box(svg, { ...CL, label: "Client", icon: "📱", w: 110 });
      const api = k.box(svg, { ...API, label: "API", icon: "🖥️", sub: "protected", w: 120, h: 52 });
      const bucket = k.s("path", { d: "M298,100 L312,268 L408,268 L422,100", fill: "surface", stroke: "ink", "stroke-width": 3, "stroke-linejoin": "round" });
      svg.append(bucket);
      k.text(svg, 360, 58, "💧 +1 token per second", { size: 12, weight: 700, tone: "warn" });
      k.text(svg, 360, 92, `capacity ${CAP}`, { size: 11, tone: "muted" });
      const drip = k.dot(svg, 360, 66, { r: 4, tone: "warn" });
      const slots = Array.from({ length: CAP }, (_, i) => {
        const c = k.s("circle", { cx: 360, cy: 245 - i * 32, r: 13, fill: "warn", stroke: "ink", "stroke-width": 1 });
        svg.append(c); return c;
      });
      const count = k.text(svg, 360, 292, "", { size: 12, weight: 700 });
      const tally = k.text(svg, 660, 230, "", { size: 12, tone: "muted" });
      let tokens = CAP, passed = 0, limited = 0, dripT = 0, refilling = true;
      let policy = "5 burst · 1/s", tokCard = null;
      const metrics = () => k.hud({ Policy: policy, Tokens: tokCard ?? `${Math.floor(tokens + 1e-9)} / ${CAP}`, "Rejected (429)": limited, Allowed: passed });
      function draw() {
        const full = Math.floor(tokens + 1e-9), frac = tokens - full;
        slots.forEach((c, i) => c.setAttribute("r", i < full ? 13 : i === full ? Math.round(13 * frac * 10) / 10 : 0));
        count.textContent = `tokens ${tokens.toFixed(1)} / ${CAP}`;
        tally.textContent = `passed ${passed} · 429s ${limited}`;
        metrics();
      }
      const stopRefill = k.loop(dt => {
        if (!refilling) return;
        tokens = Math.min(CAP, tokens + dt * RATE);
        dripT = (dripT + dt) % 1;                       // a drop falls once per second
        k.place(drip, { tx: 360, ty: 66 + dripT * 30 });
        drip.setAttribute("opacity", tokens < CAP ? 1 - dripT * 0.6 : 0.15);
        draw();
      });

      /* Outcomes are decided by exact maths on the schedule (not by frame timing), so replays are identical. */
      function plan(times, start = CAP) {
        let tok = start, last = 0;
        return times.map(t => {
          tok = Math.min(CAP, tok + (t - last) * RATE); last = t;
          if (tok >= 1 - 1e-9) { tok -= 1; return true; }
          return false;
        });
      }
      async function waitFull() { while (tokens < CAP) await k.sleep(100); }
      async function send(ok) {
        await k.packet(svg, CL, IN, { ms: 450, r: 8 });
        if (ok) {
          tokens = Math.max(0, tokens - 1); passed++; draw();
          await k.packet(svg, OUT, API, { tone: "good", ms: 450, r: 8 });
          k.tone(api, "good"); k.after(250, () => k.tone(api, "neutral"));
        } else {
          limited++; draw();
          k.float(svg, IN.x, IN.y - 30, "429", "bad");
          await k.packet(svg, IN, CL, { tone: "bad", label: "429", r: 13, ms: 450 });
        }
      }
      const burst = (outcomes, gap) => Promise.all(outcomes.map((ok, i) => k.sleep(i * gap).then(() => send(ok))));
      const times = (n, gap) => Array.from({ length: n }, (_, i) => i * gap);

      /* ---------- part 2: three algorithms on a boundary burst ---------- */
      const X = t => 150 + (t - 4) * 47;              // 4 s … 16 s on the axis
      const TIMES = [...Array.from({ length: 10 }, (_, j) => 9 + j * 0.1), ...Array.from({ length: 10 }, (_, j) => 10 + j * 0.1)];
      function tick(row, t, ok) {
        const r = k.s("rect", { x: X(t) - 1.6, y: row - 11, width: 3.2, height: 22, rx: 1, fill: ok ? "good" : "bad" });
        svg.append(r);
      }
      async function sweep(row, decide) {
        const cur = k.s("line", { x1: X(8.6), x2: X(8.6), y1: row - 30, y2: row + 26, stroke: "ink", "stroke-width": 2 });
        svg.append(cur);
        let prev = 8.6, allowed = 0;
        passed = 0; limited = 0; metrics();
        for (const t of TIMES) {
          const x = X(t);
          await k.tween(cur, { x1: x, x2: x }, Math.max(60, (t - prev) * 1300), k.ease.linear);
          prev = t;
          const ok = decide(t);
          if (ok) { allowed++; passed++; } else limited++;
          metrics();
          tick(row, t, ok);
        }
        await k.tween(cur, { x1: X(11.2), x2: X(11.2) }, 500, k.ease.linear);
        cur.remove();
        return allowed;
      }

      k.run(async () => {
        // 1 · the bucket
        await k.step();
        draw();
        k.say("The bucket is full: 5 tokens.");
        await k.sleep(1500);
        k.say("Each request takes one token.");
        await send(true);
        await k.sleep(600);
        await send(true);
        await k.sleep(800);

        // 2 · a burst
        await k.step();
        k.say("Waiting for a full bucket…");
        await waitFull();
        k.say("A page load fires <b>7 requests at once</b>.");
        await k.sleep(800);
        await burst(plan(times(7, 0.15)), 150);
        k.say("5 spent the stored tokens; 2 got <b>429</b>.");
        await k.sleep(1000);

        // 3 · steady traffic
        await k.step();
        k.say("Waiting for a full bucket…");
        await waitFull();
        k.say("One request every ~2 s, slower than the refill.");
        await burst(plan(times(4, 1.75)), 1750);
        await k.sleep(600);

        // 4 · too fast
        await k.step();
        k.say("Waiting for a full bucket…");
        await waitFull();
        k.say("Now <b>4 requests per second</b>, faster than the refill.");
        await k.sleep(600);
        await burst(plan(times(12, 0.25)), 250);
        k.say("After the burst, about 1 per second gets through.");
        await k.sleep(800);

        // 5 · refill to capacity
        await k.step();
        k.say("Traffic stops. The bucket refills…");
        await waitFull();
        k.say("…and stops at <b>5</b>. No saving up beyond capacity.");
        await k.sleep(2000);
        refilling = false; stopRefill();
        tokens = CAP; draw();

        // 6 · the boundary setup
        await k.step();
        svg.replaceChildren();
        policy = "10 per 10 s"; tokCard = "—"; passed = 0; limited = 0; metrics();
        k.say("Policy: <b>10 requests per 10 seconds</b>.");
        const ROWS = { fixed: 95, sliding: 170, bucket: 245 };
        k.line(svg, { x: X(4), y: 288 }, { x: X(16), y: 288 }, { tone: "muted" });
        for (let t = 4; t <= 16; t += 2) k.text(svg, X(t), 304, `${t}s`, { size: 11, tone: "muted" });
        const names = { fixed: "Fixed window", sliding: "Sliding window", bucket: "Token bucket" };
        const res = {};
        for (const [id, y] of Object.entries(ROWS)) {
          k.text(svg, 12, y - 2, names[id], { size: 12, anchor: "start", weight: 700 });
          res[id] = k.text(svg, 12, y + 15, "", { size: 11, anchor: "start", tone: "muted" });
          k.line(svg, { x: X(4), y }, { x: X(16), y }, { tone: "line", width: 1 });
        }
        await k.sleep(1200);
        k.say("10 requests just before 10 s, 10 just after…");
        for (const t of TIMES) {
          svg.append(k.s("rect", { x: X(t) - 1.6, y: 278, width: 3.2, height: 10, rx: 1, fill: "accent" }));
          await k.sleep(90);
        }
        k.text(svg, X(11.4), 286, "← 20 requests in 2 s", { size: 11, anchor: "start", tone: "accent", weight: 700 });
        await k.sleep(1200);

        // 7 · fixed window
        await k.step();
        const w1 = k.s("rect", { x: X(4), y: ROWS.fixed - 32, width: X(10) - X(4), height: 58, fill: "accentSoft", opacity: 0.6 });
        const w2 = k.s("rect", { x: X(10), y: ROWS.fixed - 32, width: X(16) - X(10), height: 58, fill: "lessonSoft", opacity: 0.6 });
        svg.insertBefore(w2, svg.firstChild); svg.insertBefore(w1, svg.firstChild);
        const c1 = k.text(svg, (X(4) + X(10)) / 2, ROWS.fixed - 18, "window 0–10 s · 0/10", { size: 11 });
        const c2 = k.text(svg, (X(10) + X(16)) / 2, ROWS.fixed - 18, "window 10–20 s · 0/10", { size: 11 });
        k.say("<b>Fixed window</b>: one counter per clock window.");
        await k.sleep(1000);
        const fwCount = [0, 0];
        const fixed = await sweep(ROWS.fixed, t => {
          const w = t < 10 ? 0 : 1;
          const ok = ++fwCount[w] <= 10;
          c1.textContent = `window 0–10 s · ${Math.min(fwCount[0], 10)}/10`;
          c2.textContent = `window 10–20 s · ${Math.min(fwCount[1], 10)}/10`;
          return ok;
        });
        res.fixed.textContent = `allowed ${fixed} of 20 ✗`;
        res.fixed.style.fill = k.colors.bad;
        k.say(`The counter reset at 10 s: <b>${fixed} passed</b> in 2 seconds.`);
        await k.sleep(1000);

        // 8 · sliding window
        await k.step();
        k.say("<b>Sliding window</b>: count the last 10 seconds.");
        const bracket = k.s("rect", { x: X(4), y: ROWS.sliding - 26, width: 0, height: 52, rx: 6, fill: "accentSoft", stroke: "accent", "stroke-dasharray": "4 3" });
        svg.insertBefore(bracket, svg.firstChild);
        const bl = k.text(svg, X(6), ROWS.sliding - 30, "", { size: 11, tone: "accent" });
        await k.sleep(1000);
        const log = [];
        const sliding = await sweep(ROWS.sliding, t => {
          while (log.length && log[0] <= t - 10) log.shift();
          const ok = log.length < 10;
          if (ok) log.push(t);
          bracket.setAttribute("width", X(t) - X(4));
          bl.textContent = `← last 10 s holds ${log.length}/10`;
          return ok;
        });
        res.sliding.textContent = `allowed ${sliding} of 20 ✓`;
        res.sliding.style.fill = k.colors.good;
        k.say(`The early 10 still count: <b>${sliding} allowed</b>.`);
        await k.sleep(1000);

        // 9 · token bucket
        await k.step();
        k.say("<b>Token bucket</b>: capacity 10, refill 1 per second.");
        const tb = k.text(svg, X(13.5), ROWS.bucket - 18, "", { size: 11, tone: "warn" });
        await k.sleep(1000);
        let tok = 10, last = 0;
        const bucketAllowed = await sweep(ROWS.bucket, t => {
          tok = Math.min(10, Math.round((tok + (t - last) * 1) * 1000) / 1000); last = t;
          const ok = tok >= 1;
          if (ok) tok = Math.round((tok - 1) * 1000) / 1000;
          tb.textContent = `tokens left ${tok.toFixed(1)}`;
          tokCard = tok.toFixed(1);
          return ok;
        });
        res.bucket.textContent = `allowed ${bucketAllowed} of 20 ✓`;
        res.bucket.style.fill = k.colors.good;
        k.say(`Burst, then only the drip: <b>${bucketAllowed} allowed</b>.`);
        await k.sleep(1500);
        k.done();
      });
    }
  },

  play: {
    title: "Tune the Bucket",
    goal: "Each user gets their own token bucket. Set <b>capacity</b> and <b>refill rate</b> so Alice’s page-load bursts and Bob’s steady traffic pass, while the scraper gets throttled. Press Run. You have 3 runs.",
    build(stage, k) {
      const SIM = 20, SPEEDUP = 2, RUNS = 3;
      const svg = k.svg(760, 320, { label: "Three users, each with a token bucket, sending requests to an API" });
      stage.append(svg);
      const LANES = [
        { name: "Alice", icon: "🙂", sub: "bursts of 8 every 5 s", legit: true },
        { name: "Bob", icon: "🙂", sub: "steady 2 per second", legit: true },
        { name: "Scraper", icon: "🤖", sub: "12 per second, nonstop", legit: false }
      ];
      const Y = [70, 160, 250];
      const server = k.box(svg, { x: 665, y: 160, w: 120, h: 250, label: "API", icon: "🖥️", sub: "per-user limits" });
      const meters = [], vals = [], stats = [];
      LANES.forEach((l, i) => {
        k.line(svg, { x: 150, y: Y[i] }, { x: 228, y: Y[i] }, { dashed: true });
        k.line(svg, { x: 440, y: Y[i] }, { x: 603, y: Y[i] }, { dashed: true, arrow: true });
        k.box(svg, { x: 80, y: Y[i], w: 140, h: 50, label: l.name, icon: l.icon, sub: l.sub, size: 12, tone: l.legit ? "neutral" : "bad" });
        meters.push(k.meter(svg, { x: 240, y: Y[i] - 6, w: 160, h: 12, max: 100, value: 100, tone: "warn", label: "tokens" }));
        vals.push(k.text(svg, 408, Y[i] + 4, "", { size: 11, anchor: "start", mono: true }));
        stats.push(k.text(svg, 240, Y[i] + 24, "", { size: 11, anchor: "start", tone: "muted" }));
      });

      // traffic (simulated seconds)
      const events = [];
      for (const b of [0.5, 5.5, 10.5, 15.5]) for (let j = 0; j < 8; j++) events.push({ t: b + j * 0.05, lane: 0 });
      for (let t = 0.25; t < SIM; t += 0.5) events.push({ t, lane: 1 });
      let n = 0;
      for (let t = 0.02; t < SIM; t += 1 / 12) events.push({ t, lane: 2, show: n++ % 2 === 0 });
      events.sort((a, b) => a.t - b.t);
      const totals = [0, 0, 0];
      events.forEach(e => totals[e.lane]++);

      let cap = 3, rate = 6, run = 0, running = false, best = 0, bestText = "";
      const capS = k.slider({ label: "Capacity", min: 1, max: 25, step: 1, value: cap, format: v => `${v} tokens`, onInput: v => { cap = v; idle(); } });
      const rateS = k.slider({ label: "Refill rate", min: 0.5, max: 8, step: 0.5, value: rate, format: v => `${v} / s`, onInput: v => { rate = v; idle(); } });
      const runBtn = k.button("▶ Run 20 s of traffic", () => start(), { primary: true });

      function idle() {
        if (running) return;
        meters.forEach(m => m.set(100));
        vals.forEach(v => v.textContent = `${cap.toFixed(1)}`);
      }
      function hud(legit, blocked) {
        k.hud({ Run: `${Math.min(run + 1, RUNS)} / ${RUNS}`, "Real users served": legit == null ? "—" : `${Math.round(legit * 100)}%`, "Scraper blocked": blocked == null ? "—" : `${Math.round(blocked * 100)}%` });
      }
      function grade(l, b) {
        if (l >= 0.97 && b >= 0.75) return 3;
        if (l >= 0.9 && b >= 0.55) return 2;
        if (l >= 0.7 && b >= 0.25) return 1;
        return 0;
      }
      function fly(lane, ok) {
        k.run(async () => {
          const d = k.dot(svg, 150, Y[lane], { r: 6, tone: "accent" });
          try {
            await k.tween(d, { tx: 232 }, 200, k.ease.linear);
            if (ok) { d.circle.style.fill = k.colors.good; await k.tween(d, { tx: 600 }, 380, k.ease.linear); }
            else { d.circle.style.fill = k.colors.bad; await k.tween(d, { ty: Y[lane] + 24, opacity: 0 }, 380); }
          } finally { d.remove(); }
        });
      }

      function start() {
        if (running) return;
        running = true;
        runBtn.disabled = true; capS.input.disabled = true; rateS.input.disabled = true;
        const B = [0, 1, 2].map(() => ({ tokens: cap, last: 0, pass: 0, fail: 0 }));
        let simT = 0, ei = 0;
        hud(null, null);
        k.say(`Run ${run + 1}: capacity <b>${cap}</b>, refill <b>${rate}/s</b>. Watch who gets 429s…`);
        k.loop(dt => {
          simT += dt * SPEEDUP;
          while (ei < events.length && events[ei].t <= simT) {
            const e = events[ei++], b = B[e.lane];
            b.tokens = Math.min(cap, b.tokens + (e.t - b.last) * rate); b.last = e.t;
            const ok = b.tokens >= 1;
            if (ok) { b.tokens -= 1; b.pass++; } else b.fail++;
            if (e.lane !== 2 || e.show) fly(e.lane, ok);
            if (!ok && e.lane !== 2 && b.fail % 2 === 1) k.float(svg, 260, Y[e.lane] - 14, "429", "bad");
          }
          B.forEach((b, i) => {
            const now = Math.min(cap, b.tokens + (Math.min(simT, SIM) - b.last) * rate);
            meters[i].set(100 * now / cap, now < 1 ? "bad" : "warn");
            vals[i].textContent = now.toFixed(1);
            stats[i].textContent = `passed ${b.pass} · 429s ${b.fail}`;
          });
          if (simT >= SIM && ei >= events.length) { k.run(() => finishRun(B)); return false; }
        });
      }

      async function finishRun(B) {
        const legit = (B[0].pass + B[1].pass) / (totals[0] + totals[1]);
        const blocked = B[2].fail / totals[2];
        const g = grade(legit, blocked);
        run++;
        hud(legit, blocked);
        const summary = `Real users served <b>${Math.round(legit * 100)}%</b>, scraper blocked <b>${Math.round(blocked * 100)}%</b> (capacity ${cap}, refill ${rate}/s).`;
        if (g > best || (g === best && !bestText)) { best = g; bestText = summary; }
        await k.sleep(900);
        if (g === 3) return k.win({ stars: 3, text: `${summary} Capacity covers the biggest legitimate burst (8), and the refill rate sits just above the steady legitimate rate (2/s), so the scraper only ever gets that rate.` });
        if (run >= RUNS) {
          const why = "Capacity should cover the biggest real burst (Alice’s 8); the refill rate should match the highest steady real rate (Bob’s 2/s), no more.";
          return best === 0 ? k.lose(`${bestText} ${why}`) : k.win({ stars: best, text: `Best run: ${bestText} ${why}` });
        }
        const hints = [];
        if (B[0].fail > 0) hints.push("Alice’s bursts are being cut: is the <b>capacity</b> at least her burst size?");
        if (B[1].fail > 0) hints.push("Bob gets 429s: the <b>refill rate</b> is below his steady rate.");
        if (blocked < 0.75) hints.push("The scraper gets too much: every extra token per second is 20 more scraped pages in this run. Lower the <b>refill rate</b> (or an oversized capacity).");
        k.say(`${summary} ${hints.join(" ") || "Close!"} Adjust and run again (${RUNS - run} left).`);
        running = false;
        runBtn.disabled = false; capS.input.disabled = false; rateS.input.disabled = false;
        idle();
      }

      idle(); hud(null, null);
      k.say("Bursty pages and steady polling are fine. A scraper hammering 12 requests a second is not. Tune the bucket, then press <b>Run</b>.");
    }
  }
});
