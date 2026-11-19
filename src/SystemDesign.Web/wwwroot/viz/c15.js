"use strict";
/* Concept 15 · Message queues. Watch: synchronous checkout vs a queue, a burst absorbed by steady workers,
   at-least-once redelivery with an idempotent consumer, retries and a dead-letter queue. Play: Backlog Boss. */
Lab.define(15, {
  watch: {
    title: "The checkout that stopped waiting",
    intro: "Follow a checkout as the slow side effects move out of the request and into a queue drained by workers.",
    steps: [
      { label: "Sync", tag: "problem", title: "The user waits for everything",
        body: "<p>Checkout <b>without</b> a queue: the request saves the order, then sends the email (400 ms), builds the PDF (800 ms) and sends the SMS (600 ms), all <b>before replying</b>.</p><p>If the SMS provider is down, the <b>whole order fails</b>.</p>",
        idea: "Side effects the user doesn’t need to watch shouldn’t sit inside the request.",
        changed: ["3 calls in a row", "User wait: 1,850 ms"] },
      { label: "Queue", tag: "technique", title: "Publish and reply at once",
        body: "<p>With a <b>message queue</b>: save the order, publish <code>OrderPlaced</code>, reply. <b>Workers</b> (consumers) pick up the message and do the slow work afterwards.</p>",
        idea: "A slow SMS provider now delays a worker, never the customer.",
        changed: ["Queue and 2 workers appear", "User wait: 50 ms"] },
      { label: "Burst", tag: "concept", title: "The queue absorbs the spike",
        body: "<p>A flash sale: <b>14 orders</b> in under two seconds. Workers keep their steady pace; the backlog waits in the queue instead of overloading anything.</p><p>Consumers scale <b>independently</b> of the API, so a third worker joins.</p>",
        idea: "Queues turn a traffic spike into a backlog that drains at the rate you can afford.",
        changed: ["Queue depth jumps to 14", "Worker 3 added; backlog drains to 0"] },
      { label: "Ack lost", tag: "failure", title: "Delivered twice",
        body: "<p>Brokers deliver <b>at least once</b>. The worker sends order 16’s email, but its <b>acknowledgement is lost</b>.</p><p>The broker assumes it failed and <b>redelivers</b>. This consumer doesn’t check, so the customer gets two emails.</p>",
        idea: "Any message can arrive more than once. Plan for it.",
        changed: ["Order 16 requeued", "Duplicate emails: 1"] },
      { label: "Idempotent", tag: "fix", title: "Skip what you already did",
        body: "<p>The consumer becomes <b>idempotent</b>: it records processed message IDs (a processed-messages table) and skips any it has seen.</p><p>Order 17 loses its ack too, and is redelivered, but only one email goes out.</p>",
        idea: "At-least-once delivery + idempotent consumers = effectively once.",
        changed: ["Order 17 redelivered", "Duplicate skipped, no extra email"] },
      { label: "Poison", tag: "failure", title: "A message nobody can process",
        body: "<p>Order 666 has a payload no consumer can parse: a <b>poison message</b>. It is retried with <b>backoff</b> (1 s, then 2 s) while the other workers keep draining orders 18–20.</p><p>After <b>3 attempts</b> it moves to the <b>dead-letter queue</b> for a human to inspect.</p>",
        idea: "Without a DLQ, one bad message is retried forever and blocks a worker.",
        changed: ["3 failed attempts", "Dead-lettered: 1"] },
      { label: "Trade-offs", tag: "result", title: "What the queue costs",
        body: "<p>Queues give fast replies, absorb spikes and let workers scale on their own.</p><p>The price: <b>duplicates</b> (be idempotent), <b>retries</b> with backoff, and a <b>DLQ</b> someone has to watch.</p>",
        idea: "Interview answer: “publish OrderPlaced, idempotent consumers, 3 retries with backoff, then a DLQ with an alert.”",
        changed: ["Workers idle, queue empty", "DLQ highlighted"] }
    ],
    learn: [
      { text: "Why slow side effects belong in a queue", step: 1 },
      { text: "How a queue absorbs a burst", step: 2 },
      { text: "Why at-least-once delivery needs idempotent consumers", step: 4 },
      { text: "Retries, backoff and the dead-letter queue", step: 5 }
    ],
    build(stage, k) {
      const svg = k.svg(760, 330, { label: "A user, a checkout API, a message queue, workers and a dead-letter queue" });
      stage.append(svg);
      const USER = { x: 50, y: 150 }, API = { x: 165, y: 150 }, DLQ = { x: 300, y: 285 };
      const WY = [70, 150, 230], WX = 650;
      const FRONT = 490, BACK = 262, QY = 150;
      k.line(svg, USER, API, { dashed: true });
      k.box(svg, { ...USER, label: "User", icon: "📱", w: 84, h: 40, size: 12 });
      const api = k.box(svg, { ...API, label: "Checkout API", icon: "🛒", w: 126, h: 48, size: 12 });
      const wait = k.meter(svg, { x: 30, y: 228, w: 190, max: 2000, label: "user waits for the reply", tone: "warn" });
      const waitTxt = k.text(svg, 30, 260, "", { size: 13, anchor: "start", weight: 800 });
      const stats = k.text(svg, 380, 24, "", { size: 12, tone: "muted" });

      /* ---- queue, workers, DLQ (built when the queue appears) ---- */
      const queue = [], workers = [], dlq = [], processed = new Set();
      let active = false, sent = 0, dups = 0, doubles = 0, waitMs = 0, idempotent = false, depthTxt = null, qG = null;
      const metrics = () => k.hud({ "User wait": waitMs ? `${k.fmt(waitMs)} ms` : "—", "Queue depth": queue.length, "Duplicate emails": doubles, "Dead-lettered": dlq.length, "Emails sent": sent });
      const setWait = ms => { waitMs = ms; wait.set(ms, ms > 500 ? "bad" : "good"); waitTxt.textContent = `${k.fmt(ms)} ms`; waitTxt.style.fill = k.colors[ms > 500 ? "bad" : "good"]; metrics(); };
      const showStats = () => { if (qG) stats.textContent = `emails sent ${sent} · duplicates skipped ${dups} · dead-lettered ${dlq.length}`; metrics(); };
      const showDepth = () => { if (depthTxt) depthTxt.textContent = `queue depth ${queue.length}`; metrics(); };
      const qX = (i, n) => FRONT - i * Math.min(24, (FRONT - BACK) / Math.max(1, n - 1));
      const layoutQ = () => Promise.all(queue.map((m, i) => k.tween(m.g, { tx: qX(i, queue.length), ty: QY }, 260))).catch(() => {});

      function buildQueue() {
        qG = k.s("g"); svg.append(qG);
        k.line(qG, { x: API.x + 63, y: QY }, { x: BACK - 14, y: QY }, { arrow: true });
        const tube = k.s("rect", { x: BACK - 16, y: QY - 18, width: FRONT - BACK + 32, height: 36, rx: 18, fill: "surface2", stroke: "line", "stroke-width": 1.5 });
        qG.append(tube);
        k.text(qG, (FRONT + BACK) / 2, QY - 28, "message queue  (front →)", { size: 12, tone: "muted" });
        depthTxt = k.text(qG, (FRONT + BACK) / 2, QY + 38, "", { size: 12, weight: 700 });
        const d = k.box(qG, { ...DLQ, label: "Dead-letter queue", icon: "☠️", w: 180, h: 40, size: 12, tone: "muted" });
        k.line(qG, { x: FRONT, y: QY + 18 }, { x: DLQ.x + 90, y: DLQ.y }, { dashed: true });
        showDepth(); showStats();
        return d;
      }
      function addWorker(n) {
        const y = WY[n - 1];
        k.line(svg, { x: FRONT + 18, y: QY }, { x: WX - 65, y }, { dashed: true });
        const box = k.box(svg, { x: WX, y, label: `Worker ${n}`, icon: "⚙️", w: 130, h: 46, size: 12 });
        const note = k.text(svg, WX, y + 36, "", { size: 11, tone: "muted" });
        const w = { x: WX, y, box, note, busy: false, ms: 1100 };
        workers.push(w);
        box.setAttribute("opacity", 0);
        k.tween(box, { opacity: 1 }, 400).catch(() => {});
        k.run(() => workerLoop(w));
        return w;
      }
      async function enqueue(id, opts = {}) {
        const g = k.dot(svg, API.x + 63, QY, { r: 13, tone: opts.poison ? "bad" : "accent", label: String(id), size: 11 });
        queue.push({ id, g, ...opts });
        showDepth();
        await layoutQ();
      }
      async function requeue(id, w) {
        const g = k.dot(svg, w.x - 82, w.y, { r: 13, tone: "warn", label: String(id), size: 11 });
        queue.push({ id, g });
        showDepth();
        await layoutQ();
      }
      async function poison(w, m) {
        for (let t = 1; t <= 3; t++) {
          await k.sleep(500);
          k.tone(w.box, "bad");
          k.float(svg, w.x, w.y - 30, `✖ attempt ${t}`, "bad");
          if (t < 3) {
            w.note.textContent = `retry in ${2 ** (t - 1)} s (backoff)`;
            await k.sleep(700 * 2 ** (t - 1));
            w.note.textContent = "";
            k.tone(w.box, "accent");
          }
        }
        w.note.textContent = "";
        await k.tween(m.g, { tx: DLQ.x + 110 + dlq.length * 26, ty: DLQ.y }, 700);
        dlq.push(m);
        showStats();
      }
      async function workerLoop(w) {
        while (active) {
          if (!queue.length) { await k.sleep(150); continue; }
          const m = queue.shift();
          w.busy = true;
          showDepth(); layoutQ();
          await k.tween(m.g, { tx: w.x - 82, ty: w.y }, 380);
          k.tone(w.box, "accent");
          if (m.poison) await poison(w, m);
          else {
            await k.sleep(w.ms);
            m.g.remove();
            if (processed.has(m.id) && !idempotent) {
              sent++; doubles++;
              k.tone(w.box, "bad");
              k.float(svg, w.x, w.y - 30, `${m.id}: ✉ sent again`, "bad");
            } else if (processed.has(m.id)) {
              dups++;
              k.tone(w.box, "warn");
              k.float(svg, w.x, w.y - 30, `${m.id}: dup → skip`, "warn");
            } else {
              processed.add(m.id); sent++;
              k.tone(w.box, "good");
              k.float(svg, w.x, w.y - 30, "✉ sent", "good");
            }
            showStats();
            if (m.ackLost) {
              w.note.textContent = "ack lost 📡✖";
              await k.sleep(1200);
              w.note.textContent = "";
              await requeue(m.id, w);
            }
            await k.sleep(250);
          }
          k.tone(w.box, "neutral");
          w.busy = false;
        }
      }
      async function drained() {
        while (queue.length || workers.some(w => w.busy)) await k.sleep(200);
      }

      // the synchronous services are drawn up front so step 1 starts on a full scene
      const svcG = k.s("g"); svg.prepend(svcG);
      const SV = [{ name: "Email", icon: "✉️", ms: 400 }, { name: "PDF", icon: "📄", ms: 800 }, { name: "SMS", icon: "💬", ms: 600 }]
        .map((s, i) => ({ ...s, x: WX, y: WY[i] }));
      for (const s of SV) {
        k.line(svcG, API, s, { dashed: true });
        s.box = k.box(svcG, { x: s.x, y: s.y, label: `${s.name} service`, icon: s.icon, sub: `${s.ms} ms`, w: 140, h: 46, size: 12 });
      }
      metrics();

      k.run(async () => {
        // 1 · synchronous checkout
        await k.step();
        k.say("Checkout calls email, PDF and SMS before replying.");
        await k.sleep(800);
        await k.packet(svg, USER, API, { r: 9 });
        let waited = 50; setWait(waited);
        for (const s of SV) {
          await k.packet(svg, API, s, { r: 9, ms: 450 });
          k.tone(s.box, "accent");
          await k.sleep(s.ms);
          k.tone(s.box, "neutral");
          await k.packet(svg, s, API, { r: 9, ms: 450, tone: "good" });
          waited += s.ms; setWait(waited);
        }
        await k.packet(svg, API, USER, { r: 9, tone: "good" });
        k.say("The user waited <b>1.85 s</b> for side effects.");

        // 2 · queued checkout
        await k.step();
        await k.tween(svcG, { opacity: 0 }, 400);
        svcG.remove();
        const dlqBox = buildQueue();
        active = true;
        addWorker(1); addWorker(2);
        k.say("Save, publish OrderPlaced, reply at once.");
        await k.sleep(1200);
        await k.packet(svg, USER, API, { r: 9 });
        setWait(50);
        await Promise.all([enqueue(1), k.packet(svg, API, USER, { r: 9, tone: "good" })]);
        k.say("Reply in 50 ms. A worker sends the email afterwards.");
        await drained();

        // 3 · burst
        await k.step();
        k.say("Flash sale: 14 orders in under two seconds.");
        const adds = [];
        for (let i = 2; i <= 15; i++) { adds.push(enqueue(i)); await k.sleep(110); }
        await Promise.all(adds);
        await k.sleep(2200);
        k.say("Backlog is long: add a third worker.");
        addWorker(3);
        await drained();
        k.say("Backlog drained at a steady pace.");

        // 4 · ack lost, consumer not idempotent
        await k.step();
        k.say("Order 16: email sent, but the ack is lost…");
        await enqueue(16, { ackLost: true });
        await drained();
        k.say("…so the broker redelivers and the customer gets <b>two emails</b>.");

        // 5 · idempotent consumer
        await k.step();
        idempotent = true;
        k.say("Now the consumer checks processed IDs. Order 17, ack lost again…");
        await enqueue(17, { ackLost: true });
        await drained();
        k.say("Duplicate skipped: one email, not two.");

        // 6 · poison message → DLQ
        await k.step();
        k.say("Order 666 can’t be parsed by anyone.");
        await enqueue(666, { poison: true });
        await k.sleep(400);
        for (const id of [18, 19, 20]) { await enqueue(id); await k.sleep(200); }
        await drained();
        k.say("After 3 attempts, 666 moves to the dead-letter queue.");

        // 7 · trade-offs
        await k.step();
        active = false;
        for (const w of workers) k.tone(w.box, "good");
        k.say("Fast replies and absorbed spikes, at the price of duplicates and a DLQ.");
        k.tone(dlqBox, "warn");
        await k.pulse(dlqBox);
        await k.sleep(1200);
        k.done();
      });
    }
  },

  play: {
    title: "Backlog Boss",
    goal: "Orders pour into a queue for 60 seconds. Each worker drains <b>2 messages/s</b>, costs money every second and takes <b>2 s to boot</b>. Keep the queue at <b>40 or fewer</b> waiting without paying for idle workers. The chart shows the traffic coming.",
    build(stage, k) {
      const DUR = 60, PER = 2, BOOT = 2, SLA = 40, CAP = 160, MAXW = 12;
      // traffic forecast, one rate per second
      const SEG = [[8, 4], [10, 12], [10, 3], [8, 20], [12, 6], [12, 2]];
      const rates = [];
      for (const [len, r] of SEG) for (let i = 0; i < len; i++) rates.push(Math.max(1, r + k.randInt(-1, 1)));
      let t = 0, acc = 0, work = 0, depth = 0, cost = 0, okTime = 0, waste = 0, dropped = 0, running = false;
      const workers = [{ boot: 0 }, { boot: 0 }];

      const svg = k.svg(740, 320, { label: "A producer, a queue with a depth bar, worker icons, and a chart of incoming traffic against your capacity" });
      stage.append(svg);
      // producer and queue
      const PROD = { x: 70, y: 110 };
      k.box(svg, { ...PROD, label: "Producers", icon: "🛒", w: 116, h: 44, size: 12 });
      const rateTxt = k.text(svg, PROD.x, 152, "", { size: 12, weight: 700, tone: "accent" });
      const QX = 150, QW = 320, QY = 95;
      const qx = d => QX + Math.min(1, d / CAP) * QW;
      svg.append(k.s("rect", { x: QX, y: QY, width: QW, height: 30, rx: 8, fill: "surface2", stroke: "line", "stroke-width": 1.5 }));
      const fill = k.s("rect", { x: QX, y: QY, width: 0, height: 30, rx: 8, fill: "good" });
      svg.append(fill);
      svg.append(k.s("line", { x1: qx(SLA), y1: QY - 8, x2: qx(SLA), y2: QY + 38, stroke: "warn", "stroke-width": 2, "stroke-dasharray": "4 3" }));
      k.text(svg, qx(SLA), QY - 12, "SLA: 40", { size: 11, tone: "warn", weight: 700 });
      k.text(svg, QX + QW, QY - 12, "full: 160", { size: 11, tone: "bad", anchor: "end" });
      const depthTxt = k.text(svg, QX + QW / 2, QY + 52, "", { size: 12.5, weight: 700 });
      // workers
      k.text(svg, 630, 36, "Workers", { size: 12, tone: "muted" });
      const wG = k.s("g"); svg.append(wG);
      const wTxt = k.text(svg, 630, 186, "", { size: 12, weight: 700 });
      const wPos = i => ({ x: 552 + (i % 4) * 52, y: 64 + Math.floor(i / 4) * 42 });
      // chart
      const CX = 60, CW = 640, CB = 300, CH = 78, cw = CW / DUR;
      const cy = v => CB - Math.min(1, v / 24) * CH;
      k.text(svg, CX, 210, "■ incoming msg/s (forecast)", { size: 11, tone: "accent", anchor: "start", weight: 700 });
      k.text(svg, CX + 230, 210, "— your capacity (ready workers × 2/s)", { size: 11, tone: "good", anchor: "start", weight: 700 });
      svg.append(k.s("line", { x1: CX, y1: CB, x2: CX + CW, y2: CB, stroke: "line", "stroke-width": 1 }));
      rates.forEach((r, i) => svg.append(k.s("rect", { x: CX + i * cw + 1, y: cy(r), width: cw - 2, height: CB - cy(r), fill: "accentSoft", stroke: "accent", "stroke-width": 0.6 })));
      const capLine = k.s("polyline", { points: "", fill: "none", stroke: "good", "stroke-width": 2.5 });
      svg.append(capLine);
      const cursor = k.s("line", { x1: CX, y1: CB - CH - 6, x2: CX, y2: CB + 4, stroke: "ink", "stroke-width": 1.5 });
      svg.append(cursor);
      const fx = k.s("g"); svg.append(fx);
      let capPts = [], lastPt = -1, flying = 0;

      const ready = () => workers.filter(w => w.boot <= 0).length;
      function drawWorkers() {
        wG.replaceChildren();
        workers.forEach((w, i) => {
          const p = wPos(i);
          const d = k.dot(wG, p.x, p.y, { r: 16, tone: w.boot > 0 ? "warn" : "good", label: w.boot > 0 ? "…" : "⚙", size: 13 });
          d.setAttribute("aria-hidden", "true");
        });
        const booting = workers.length - ready();
        wTxt.textContent = `${workers.length} worker${workers.length === 1 ? "" : "s"}${booting ? ` (${booting} booting)` : ""} · ${ready() * PER} msg/s`;
      }
      function draw() {
        const tone = depth <= SLA ? "good" : depth <= 100 ? "warn" : "bad";
        fill.setAttribute("width", Math.max(0, qx(depth) - QX));
        fill.style.fill = k.colors[tone];
        const capNow = ready() * PER;
        const waitS = capNow ? depth / capNow : Infinity;
        depthTxt.textContent = `${depth} waiting · oldest waits ≈ ${Number.isFinite(waitS) ? waitS.toFixed(1) + " s" : "∞"}`;
        depthTxt.style.fill = k.colors[tone === "good" ? "ink" : tone];
        rateTxt.textContent = `${rates[Math.min(DUR - 1, Math.floor(t))]} msg/s`;
        const x = CX + t * cw;
        cursor.setAttribute("x1", x); cursor.setAttribute("x2", x);
        const health = t > 0 ? Math.round(okTime / t * 100) : 100;
        k.hud({ "Time left": `${Math.max(0, Math.ceil(DUR - t))} s`, Workers: workers.length, Cost: `$${Math.round(cost)}`, "In SLA": `${health}%` });
      }
      function sample() {
        const step = Math.floor(t * 4);
        if (step === lastPt) return;
        lastPt = step;
        capPts.push(`${(CX + t * cw).toFixed(1)},${cy(ready() * PER).toFixed(1)}`);
        capLine.setAttribute("points", capPts.join(" "));
      }
      function fly(a, b, tone) {
        if (flying > 30) return;
        flying++;
        k.packet(fx, a, b, { r: 4, tone, ms: 450 }).catch(() => {}).then(() => { flying--; });
      }

      function addW() {
        if (!running || workers.length >= MAXW) return;
        workers.push({ boot: BOOT });
        drawWorkers();
      }
      function removeW() {
        if (!running || workers.length <= 1) return;
        // remove a booting worker first, otherwise a ready one
        const i = workers.findIndex(w => w.boot > 0);
        workers.splice(i >= 0 ? i : workers.length - 1, 1);
        drawWorkers();
      }

      function finish() {
        running = false;
        const health = Math.round(okTime / DUR * 100);
        const penalty = waste / 6 + dropped / 2;
        const score = Math.round(k.clamp(health - penalty, 0, 100));
        const text = `Queue within SLA <b>${health}%</b> of the time, <b>${Math.round(waste)}</b> idle worker-seconds paid for, <b>${dropped}</b> messages dropped. Score <b>${score}</b>. Capacity = workers × 2/s: match it to the incoming rate, boot workers just before a burst, and let the queue soak up short spikes.`;
        if (score < 40) k.lose(`${text} ${health < 70 ? "Too few workers: the backlog blew past the SLA." : "Too many idle workers: you paid for capacity nobody used."}`);
        else k.win({ stars: k.starsFor(score, 60, 80), text });
      }

      k.loop(dt => {
        if (!running) return;
        t += dt;
        if (t >= DUR) { t = DUR; draw(); finish(); return false; }
        const rate = rates[Math.floor(t)];
        acc += rate * dt;
        while (acc >= 1) {
          acc -= 1;
          if (depth < CAP) { depth++; fly({ x: PROD.x + 58, y: PROD.y }, { x: QX + 8, y: QY + 15 }, "accent"); }
          else { dropped++; k.float(svg, QX + QW, QY - 4, "dropped", "bad"); }
        }
        let changed = false;
        for (const w of workers) if (w.boot > 0) { w.boot -= dt; if (w.boot <= 0) changed = true; }
        if (changed) drawWorkers();
        const r = ready();
        work += r * PER * dt;
        while (work >= 1 && depth > 0) {
          work -= 1; depth--;
          fly({ x: qx(depth) - 4, y: QY + 15 }, wPos(k.randInt(0, Math.max(0, r - 1))), "good");
        }
        if (depth === 0) work = Math.min(work, 1);
        cost += workers.length * dt;
        if (depth <= SLA) okTime += dt;
        if (depth <= 3) waste += Math.max(0, workers.length - Math.ceil(rate / PER)) * dt;
        sample();
        draw();
      });

      k.on(window, "keydown", e => {
        if (!running || e.target?.closest?.("input, textarea")) return;
        if (e.key === "+" || e.key === "=") { e.preventDefault(); addW(); }
        else if (e.key === "-" || e.key === "_") { e.preventDefault(); removeW(); }
      });

      drawWorkers(); draw();
      k.say("Read the forecast chart first: two bursts are coming. Workers take 2 s to boot, so scale up just <b>before</b> a burst and back down after it drains.");
      k.button("Start the traffic", () => {
        running = true;
        k.clearTools();
        k.button("− Worker", removeW, { title: "Remove a worker (− key)" });
        k.button("+ Worker", addW, { primary: true, title: "Add a worker (+ key)" });
        k.say("Traffic is live. Keep the bar left of the <b>SLA line</b>, and the green capacity line close to the blue bars.");
      }, { primary: true });
    }
  }
});
