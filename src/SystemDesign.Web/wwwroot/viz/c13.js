"use strict";
/* Concept 13 · Distributed transactions. Watch: an orchestrated saga whose 3rd step fails and compensates backwards,
   then the dual-write bug and the transactional outbox. Play: Saga Medic (compensate the right steps in the right order). */
Lab.define(13, {
  watch: {
    title: "Order 77 half-happened",
    intro: "One order spans three services. Follow a saga that fails halfway and undoes itself, then the outbox that keeps events from getting lost.",
    steps: [
      { label: "Three DBs", tag: "problem", title: "One order, three databases",
        body: "<p>Placing order 77 touches <b>stock</b>, <b>payment</b> and <b>courier</b>, and each service owns its own database.</p><p>No single ACID transaction can span all three. A <b>saga</b> runs one <b>local transaction</b> per service instead.</p>",
        idea: "In microservices, “one transaction” becomes a chain of small ones that each commit on their own.",
        changed: ["Step 1: stock reserved, committed", "Step 2: ₹499 charged, committed"] },
      { label: "Fails", tag: "failure", title: "Step 3 fails",
        body: "<p>The courier API returns <b>503</b>. But steps 1 and 2 are <b>already committed</b> in other databases.</p><p>There is no rollback that reaches across services.</p>",
        idea: "A half-finished saga leaves money charged and stock held for an order that won’t ship.",
        changed: ["Courier service turns red", "Orchestrator is stuck mid-saga"] },
      { label: "Compensate", tag: "technique", title: "Undo in reverse order",
        body: "<p>Each step has a <b>compensating action</b>. The saga runs them in <b>reverse order</b>, like popping a stack: refund the card, then release the stock.</p><p>Here a central <b>orchestrator</b> drives it. In <b>choreography</b>, each service reacts to events instead.</p>",
        idea: "Not atomic, but eventually correct: no charge, no held stock, order cancelled.",
        changed: ["2 compensations run, newest first", "Order 77: cancelled, refunded"] },
      { label: "Dual write", tag: "problem", title: "Saved, but never announced",
        body: "<p>After saving an order, the service must publish <code>OrderPlaced</code> so email and billing can act.</p><p>It saves order 501, then <b>crashes before publishing</b>. The database has the order; the broker has nothing.</p>",
        idea: "This is the <b>dual-write problem</b>: a database and a broker can’t be updated atomically.",
        changed: ["Order 501 saved", "1 event lost: email and billing never hear"] },
      { label: "Outbox", tag: "technique", title: "Write the event with the order",
        body: "<p>The <b>transactional outbox</b>: insert the event into an <b>outbox table in the same database</b>, in the same transaction as the order.</p><p>Both rows commit together, or neither does. A crash right after the commit loses nothing.</p>",
        idea: "There is never a moment where the order exists without its event.",
        changed: ["Order 502 + outbox row in one transaction", "Crash after commit: event still stored"] },
      { label: "Relay", tag: "technique", title: "A relay publishes the outbox",
        body: "<p>A background <b>relay</b> (a <code>BackgroundService</code> in .NET) reads unsent outbox rows, publishes them to the broker, then marks them <b>sent</b>.</p>",
        idea: "The event got out even though the service crashed right after the commit.",
        changed: ["502 published to the broker", "Email and billing receive it; row marked sent"] },
      { label: "Duplicate", tag: "failure", title: "The relay crashes mid-way",
        body: "<p>The relay publishes 503, then crashes <b>before marking the row sent</b>.</p><p>On restart the row still says <i>unsent</i>, so it publishes 503 <b>again</b>.</p>",
        idea: "The outbox gives <b>at-least-once</b> delivery, never exactly-once.",
        changed: ["503 published twice", "Broker holds 3 events for 2 orders"] },
      { label: "Idempotent", tag: "fix", title: "Consumers skip duplicates",
        body: "<p>Email remembers which event IDs it has handled, sees 503 again and <b>skips</b> it. That makes the consumer <b>idempotent</b>.</p><p>Saga + outbox: local transactions, compensations to undo, and an outbox so events are never lost.</p>",
        idea: "Interview answer: “saga with compensations, transactional outbox, idempotent consumers. No distributed lock needed.”",
        changed: ["Duplicate 503 skipped", "Every order announced exactly once in effect"] }
    ],
    learn: [
      { text: "Why one transaction can’t span services", step: 0 },
      { text: "How a saga compensates in reverse order", step: 2 },
      { text: "What the dual-write problem is", step: 3 },
      { text: "How the transactional outbox and relay fix it", step: 5 },
      { text: "Why consumers must be idempotent", step: 7 }
    ],
    build(stage, k) {
      const svg = k.svg(760, 330, { label: "A saga orchestrator calling stock, payment and courier services, then an order service with an outbox table, a relay and a message broker" });
      stage.append(svg);

      let commits = 0, comps = 0, dups = 0, lost = 0, delivered = 0;
      const metrics = () => k.hud({ "Local commits": commits, Compensations: comps, "Duplicates skipped": dups, "Events lost": lost, "Events delivered": delivered });
      metrics();

      /* ---------------- scene 1: the saga ---------------- */
      const saga = {};
      function drawSaga() {
        const g = k.s("g"); svg.append(g);
        const O = { x: 110, y: 70 };
        const S = [
          { x: 250, y: 200, label: "Stock service", icon: "📦", sub: "own database" },
          { x: 440, y: 200, label: "Payment service", icon: "💳", sub: "own database" },
          { x: 630, y: 200, label: "Courier service", icon: "🚚", sub: "own database" }
        ];
        for (const s of S) k.line(g, O, s, { dashed: true });
        const orch = k.box(g, { ...O, label: "Order saga", sub: "orchestrator", icon: "🧭", w: 160, h: 52 });
        const order = k.text(g, O.x, 120, "order 77: pending", { size: 12, tone: "muted" });
        const boxes = S.map(s => k.box(g, { ...s, w: 170, h: 52 }));
        const st = S.map(s => k.text(g, s.x, 248, "", { size: 12, weight: 700 }));
        const setSt = (i, str, tone) => { st[i].textContent = str; st[i].style.fill = k.colors[tone]; };
        Object.assign(saga, { g, O, S, orch, order, boxes, setSt });
      }
      drawSaga();

      /* ---------------- scene 2: dual write vs outbox ---------------- */
      const ob = {};
      function drawOutbox() {
        const g = k.s("g"); svg.append(g);
        const APP = { x: 100, y: 150 }, DB = { x: 320, y: 150 }, BR = { x: 560, y: 150 }, EM = { x: 695, y: 75 }, BI = { x: 695, y: 225 }, RL = { x: 320, y: 290 };
        k.line(g, APP, DB, { dashed: true });
        k.line(g, BR, EM, { dashed: true });
        k.line(g, BR, BI, { dashed: true });
        const app = k.box(g, { ...APP, label: "Order service", icon: "🖥️", w: 150, h: 52 });
        const db = k.box(g, { ...DB, label: "Orders database", icon: "🗄️", w: 220, h: 168 });
        db.label.setAttribute("y", -62);
        k.text(db, -96, -38, "orders table", { size: 11, tone: "muted", anchor: "start" });
        k.text(db, -96, 14, "outbox table", { size: 11, tone: "muted", anchor: "start" });
        const broker = k.box(g, { ...BR, label: "Message broker", icon: "📬", w: 150, h: 52, sub: "0 events" });
        const email = k.box(g, { ...EM, label: "Email", icon: "📧", w: 110, h: 44 });
        const bill = k.box(g, { ...BI, label: "Billing", icon: "💰", w: 110, h: 44 });
        let rows = [];
        function setRows(orderTxt, outTxt, outTone) {
          rows.forEach(r => r.remove());
          rows = [];
          if (orderTxt) rows.push(k.box(db, { x: 0, y: -16, w: 190, h: 26, label: orderTxt, size: 12, r: 6, tone: "good" }));
          if (outTxt) rows.push(k.box(db, { x: 0, y: 36, w: 190, h: 26, label: outTxt, size: 12, r: 6, tone: outTone || "warn" }));
          return rows;
        }
        const brokerCount = n => { broker.sub.textContent = `${n} event${n === 1 ? "" : "s"}`; };
        Object.assign(ob, { g, APP, DB, BR, EM, BI, RL, app, db, broker, email, bill, setRows, brokerCount, getRows: () => rows });
      }

      k.run(async () => {
        const { O, S, orch, order, boxes, setSt } = saga;
        // 1 · steps 1 and 2 commit
        await k.step();
        k.say("Step 1: reserve stock.");
        await k.packet(saga.g, O, S[0], { label: "1", r: 11 });
        k.tone(boxes[0], "good"); setSt(0, "✔ reserved · committed", "good");
        commits++; metrics();
        await k.sleep(1200);
        k.say("Step 2: charge the card.");
        await k.packet(saga.g, O, S[1], { label: "2", r: 11 });
        k.tone(boxes[1], "good"); setSt(1, "✔ ₹499 charged · committed", "good");
        commits++; metrics();
        k.say("Two local transactions committed in two databases.");

        // 2 · step 3 fails
        await k.step();
        k.say("Step 3: book a courier…");
        await k.packet(saga.g, O, S[2], { label: "3", r: 11 });
        k.tone(boxes[2], "bad"); setSt(2, "✖ 503 unavailable", "bad");
        k.float(saga.g, S[2].x, S[2].y - 36, "FAIL", "bad");
        await k.packet(saga.g, S[2], O, { label: "✖", r: 11, tone: "bad" });
        k.tone(orch, "warn");
        k.say("Courier failed. Stock and payment are already committed.");

        // 3 · compensate in reverse
        await k.step();
        k.line(saga.g, { x: 600, y: 285 }, { x: 260, y: 285 }, { tone: "lesson", width: 2.5, arrow: true });
        k.text(saga.g, 430, 310, "compensate in reverse order", { size: 12, tone: "lesson", weight: 700 });
        k.say("Undo step 2 first: refund the card.");
        await k.sleep(800);
        await k.packet(saga.g, O, S[1], { label: "↩", r: 11, tone: "lesson" });
        k.tone(boxes[1], "lesson"); setSt(1, "↩ refunded", "lesson");
        comps++; metrics();
        await k.sleep(800);
        k.say("Then undo step 1: release the stock.");
        await k.packet(saga.g, O, S[0], { label: "↩", r: 11, tone: "lesson" });
        k.tone(boxes[0], "lesson"); setSt(0, "↩ released", "lesson");
        comps++; metrics();
        k.tone(orch, "neutral");
        order.textContent = "order 77: cancelled, refunded"; order.style.fill = k.colors.ink;
        k.say("Consistent again: no charge, no held stock.");

        // 4 · dual write
        await k.step();
        await k.tween(saga.g, { opacity: 0 }, 400);
        saga.g.remove();
        drawOutbox();
        const { g, APP, DB, BR, EM, BI, RL, app, broker, email, bill, setRows, brokerCount, getRows } = ob;
        k.say("Order service saves order 501…");
        await k.sleep(600);
        await k.packet(g, APP, DB, { label: "501", r: 15, size: 11 });
        setRows("order 501", null);
        commits++; metrics();
        await k.sleep(800);
        k.tone(app, "bad"); k.float(g, APP.x, APP.y - 40, "💥 crash", "bad");
        k.say("…and crashes before publishing.");
        await k.sleep(1400);
        k.tone(broker, "bad"); k.tone(email, "muted"); k.tone(bill, "muted");
        lost++; metrics();
        k.say("The broker never hears about order 501.");

        // 5 · outbox
        await k.step();
        setRows(null, null);
        for (const b of [app, broker, email, bill]) k.tone(b, "neutral");
        const tx = k.s("rect", { x: DB.x - 104, y: DB.y - 50, width: 208, height: 116, rx: 8, fill: "none", stroke: "accent", "stroke-width": 2, "stroke-dasharray": "6 4" });
        g.append(tx);
        const txTxt = k.text(g, DB.x, DB.y + 100, "BEGIN … COMMIT (one transaction)", { size: 11, tone: "accent", weight: 700 });
        k.say("Order and event go in one transaction.");
        await k.sleep(1200);
        await k.packet(g, APP, DB, { label: "502", r: 15, size: 11 });
        const [r1, r2] = setRows("order 502", "OrderPlaced 502 · unsent", "warn");
        commits++; metrics();
        await Promise.all([k.pulse(r1), k.pulse(r2)]);
        await k.sleep(800);
        k.tone(app, "bad"); k.float(g, APP.x, APP.y - 40, "💥 crash", "bad");
        k.say("Crash after commit: the event is safely stored.");
        await k.sleep(1200);

        // 6 · relay
        await k.step();
        tx.remove(); txTxt.remove();
        k.tone(app, "neutral");
        const relay = k.box(g, { ...RL, label: "Outbox relay", sub: "BackgroundService", icon: "⚙️", w: 170, h: 46 });
        relay.setAttribute("opacity", 0);
        await k.tween(relay, { opacity: 1 }, 500);
        k.say("The relay picks up the unsent row.");
        await k.packet(g, { x: DB.x, y: DB.y + 50 }, RL, { label: "502", r: 14, size: 11, tone: "warn", ms: 500 });
        await k.packet(g, RL, BR, { label: "502", r: 14, size: 11, tone: "warn" });
        brokerCount(1);
        await Promise.all([
          k.packet(g, BR, EM, { label: "502", r: 14, size: 11, tone: "good", ms: 500 }),
          k.packet(g, BR, BI, { label: "502", r: 14, size: 11, tone: "good", ms: 500 })
        ]);
        k.tone(email, "good"); k.tone(bill, "good");
        delivered++; metrics();
        getRows()[1].label.textContent = "OrderPlaced 502 · sent ✔"; k.tone(getRows()[1], "good");
        k.say("Delivered, and the row is marked sent.");

        // 7 · relay crash → duplicate
        await k.step();
        k.tone(email, "neutral"); k.tone(bill, "neutral");
        setRows("order 503", "OrderPlaced 503 · unsent", "warn");
        commits++; metrics();
        k.say("Order 503: the relay publishes it…");
        await k.sleep(1000);
        await k.packet(g, RL, BR, { label: "503", r: 14, size: 11, tone: "warn" });
        brokerCount(2);
        await k.packet(g, BR, EM, { label: "503", r: 14, size: 11, tone: "good", ms: 500 });
        k.tone(email, "good"); k.float(g, EM.x, EM.y - 34, "✉ sent", "good");
        delivered++; metrics();
        k.tone(relay, "bad"); k.float(g, RL.x, RL.y - 30, "💥", "bad");
        k.say("…and crashes before marking it sent.");
        await k.sleep(1200);
        k.tone(relay, "neutral");
        k.say("On restart the row still says unsent: publish again.");
        await k.packet(g, RL, BR, { label: "503", r: 14, size: 11, tone: "warn" });
        brokerCount(3);

        // 8 · idempotent consumer
        await k.step();
        k.say("Email sees 503 a second time…");
        await k.packet(g, BR, EM, { label: "503", r: 14, size: 11, tone: "warn", ms: 500 });
        k.float(g, EM.x, EM.y - 34, "dup → skip", "warn");
        dups++; metrics();
        getRows()[1].label.textContent = "OrderPlaced 503 · sent ✔"; k.tone(getRows()[1], "good");
        k.say("…and skips it. One email per order.");
        await k.sleep(1200);
        k.done();
      });
    }
  },

  play: {
    title: "Saga Medic",
    goal: "Each saga runs until a step fails. <b>Click the steps that need compensating, in the right order.</b> Read-only steps and steps that never committed need nothing. 4 mistakes and you’re out.",
    build(stage, k) {
      const SAGAS = [
        { name: "Online order", steps: [
          { n: "Reserve stock", i: "📦", undo: "release stock" },
          { n: "Charge card", i: "💳", undo: "refund card" },
          { n: "Book courier", i: "🚚", undo: "cancel courier" },
          { n: "Send receipt", i: "📧", undo: "send correction" }] },
        { name: "Trip booking", steps: [
          { n: "Check visa rules", i: "🛂", ro: true },
          { n: "Book flight", i: "✈️", undo: "cancel flight" },
          { n: "Book hotel", i: "🏨", undo: "cancel hotel" },
          { n: "Rent car", i: "🚗", undo: "cancel car" },
          { n: "Charge card", i: "💳", undo: "refund card" }] },
        { name: "Money transfer", steps: [
          { n: "Validate account", i: "🔎", ro: true },
          { n: "Debit sender", i: "➖", undo: "refund sender" },
          { n: "Credit receiver", i: "➕", undo: "reverse credit" },
          { n: "Notify both", i: "🔔", undo: "send correction" }] },
        { name: "Food delivery", steps: [
          { n: "Charge wallet", i: "👛", undo: "refund wallet" },
          { n: "Kitchen accepts", i: "🍳", undo: "cancel at kitchen" },
          { n: "Check rider area", i: "🗺️", ro: true },
          { n: "Assign rider", i: "🛵", undo: "release rider" }] },
        { name: "SaaS sign-up", steps: [
          { n: "Create account", i: "👤", undo: "deactivate account" },
          { n: "Fraud check", i: "🛡️", ro: true },
          { n: "Charge 1st month", i: "💳", undo: "refund charge" },
          { n: "Create workspace", i: "🧱", undo: "delete workspace" }] }
      ];
      const ROUNDS = k.shuffle(SAGAS);
      const LIVES = 4;
      let round = 0, mistakes = 0, score = 0, phase = "intro";
      let steps = [], fail = 0, busy = false;

      const svg = k.svg(760, 300, { label: "A saga orchestrator above a row of steps; click steps to run their compensations" });
      stage.append(svg);
      const O = { x: 380, y: 46 };
      const orch = k.box(svg, { ...O, label: "Saga orchestrator", icon: "🧭", w: 230, h: 46, sub: " " });
      const stepsG = k.s("g"); svg.append(stepsG);
      const status = k.text(svg, 380, 284, "", { size: 13, weight: 700 });

      const hearts = () => "❤".repeat(Math.max(0, LIVES - mistakes)) + "♡".repeat(Math.min(LIVES, mistakes));
      function hud() { k.hud({ Saga: `${Math.min(round + 1, ROUNDS.length)} / ${ROUNDS.length}`, Score: score, Lives: hearts() }); }

      // The fail point: a step with at least two committed, changing steps before it, so order matters.
      function pickFail(list) {
        const ok = [];
        list.forEach((s, i) => { if (list.slice(0, i).filter(x => !x.ro).length >= 2) ok.push(i); });
        return k.pick(ok);
      }

      async function startRound() {
        phase = "intro"; busy = true;
        hud();
        const saga = ROUNDS[round];
        fail = pickFail(saga.steps);
        stepsG.replaceChildren();
        status.textContent = "";
        orch.sub.textContent = saga.name;
        k.tone(orch, "neutral");
        const n = saga.steps.length, gap = 148;
        steps = saga.steps.map((s, i) => {
          const x = 380 - (n - 1) * gap / 2 + i * gap, y = 165;
          const box = k.box(stepsG, { x, y, w: 136, h: 60, label: `${s.i} ${s.n}`, sub: "waiting", size: 12, tone: "muted" });
          const hint = k.text(stepsG, x, 216, s.ro ? "read-only" : `undo: ${s.undo}`, { size: 11, tone: "muted" });
          const st = { ...s, x, y, box, hint, state: "notrun", undone: false, idx: i };
          box.style.cursor = "pointer";
          box.setAttribute("tabindex", 0); box.setAttribute("role", "button");
          box.setAttribute("aria-label", `${s.n}: waiting`);
          const go = () => click(st);
          box.addEventListener("click", go);
          box.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
          return st;
        });
        for (let i = 0; i < n - 1; i++) k.line(stepsG, { x: steps[i].x + 66, y: 165 }, { x: steps[i + 1].x - 69, y: 165 }, { arrow: true });
        k.say(`<b>${saga.name}</b>: the orchestrator runs each local transaction in turn…`);
        await k.sleep(700);
        for (const s of steps) {
          await k.packet(svg, O, s, { label: String(s.idx + 1), r: 10, ms: 380 });
          if (s.idx === fail) {
            s.state = "failed";
            k.tone(s.box, "bad"); s.box.sub.textContent = "✖ failed";
            k.float(svg, s.x, s.y - 40, "FAIL", "bad");
            break;
          }
          s.state = "done";
          k.tone(s.box, s.ro ? "neutral" : "good");
          s.box.sub.textContent = s.ro ? "✔ checked" : "✔ committed";
          await k.sleep(120);
        }
        for (const s of steps) {
          if (s.state === "notrun") s.box.sub.textContent = "not run";
          s.box.setAttribute("aria-label", `${s.n}: ${s.box.sub.textContent}. ${s.ro ? "Read-only." : `Compensation: ${s.undo}.`} Activate to compensate.`);
        }
        k.tone(orch, "warn");
        k.say(`<b>${steps[fail].n}</b> failed. Click the steps that need a compensating action, <b>in the right order</b>.`);
        phase = "fix"; busy = false;
      }

      function needed() { return steps.filter(s => s.state === "done" && !s.ro && !s.undone); }

      function mistake(html, s) {
        mistakes++;
        hud();
        k.toast(html, "bad", 2600);
        k.say(`✖ ${html}`);
        k.float(svg, s.x, s.y - 40, "✖", "bad");
        k.pulse(s.box).catch(() => {});
        if (mistakes >= LIVES) {
          phase = "over";
          k.lose(`Out of lives. The rule: only steps that <b>committed a change</b> need compensating, and you undo them <b>newest first</b> (reverse order). Failed steps rolled back on their own; read-only steps changed nothing.`);
        }
      }

      function click(s) {
        if (phase !== "fix" || busy) return;
        if (s.undone) { k.toast("Already compensated.", "warn"); return; }
        if (s.state === "failed") return mistake(`<b>${s.n}</b> failed: its local transaction never committed, so there is nothing to undo.`, s);
        if (s.state === "notrun") return mistake(`<b>${s.n}</b> never ran. Compensating it would undo something that didn’t happen.`, s);
        if (s.ro) return mistake(`<b>${s.n}</b> only read data. Nothing changed, so there is nothing to compensate.`, s);
        const todo = needed();
        const expect = todo[todo.length - 1];
        if (s !== expect) return mistake(`Undo the newest step first: <b>${expect.n}</b> ran after <b>${s.n}</b>, and may depend on it.`, s);
        k.run(async () => {
          busy = true;
          await k.packet(svg, O, s, { label: "↩", r: 11, tone: "lesson", ms: 420 });
          s.undone = true;
          k.tone(s.box, "lesson"); s.box.sub.textContent = `↩ ${s.undo}`;
          s.box.setAttribute("aria-label", `${s.n}: compensated`);
          score += 50; hud();
          k.float(svg, s.x, s.y - 40, "+50", "good");
          busy = false;
          if (needed().length === 0) {
            phase = "between"; busy = true;
            score += 50; hud();
            k.tone(orch, "good");
            status.textContent = "✔ Saga rolled back cleanly (+50)";
            status.style.fill = k.colors.good;
            k.say(`✔ All committed changes undone, newest first. ${ROUNDS[round].name} is consistent again.`);
            await k.sleep(2200);
            round++;
            if (round < ROUNDS.length) k.run(startRound); else end();
          } else {
            k.say(`✔ ${s.undo}. What’s next?`);
          }
        });
      }

      function end() {
        const text = `${ROUNDS.length} sagas repaired with <b>${mistakes} mistake${mistakes === 1 ? "" : "s"}</b> (score ${score}). Compensate only committed changes, newest first: the same order as popping a stack.`;
        const stars = mistakes <= 1 ? 3 : mistakes === 2 ? 2 : 1;
        k.win({ stars, text });
      }

      hud();
      k.run(startRound);
    }
  }
});
