"use strict";
/* Concept 21 · Idempotency keys. Watch: a retried payment double-charges without a key; with a key the stored
   response is replayed; concurrent duplicates need a unique index. Play: Payment Server (process / replay / reject). */
Lab.define(21, {
  watch: {
    title: "The customer who paid twice",
    intro: "A phone pays, the reply gets lost, the app retries. Watch the customer’s card.",
    steps: [
      { label: "Pay", tag: "concept", title: "The reply gets lost",
        body: "<p>The shop app sends <code>POST /payments $19.99</code>. The API charges the card and replies <b>200</b>.</p><p>But the connection drops on the way back. The app only sees a <b>timeout</b>: it can’t tell whether the charge happened.</p>",
        idea: "A timeout means “unknown”, not “failed”. The work may have been done.",
        changed: ["Charges: 1", "Reply lost: the app sees a timeout"] },
      { label: "Retry", tag: "failure", title: "The retry charges again",
        body: "<p>The app does the sensible thing and <b>retries</b>. The server treats it as a brand-new payment.</p><p><b>The customer is charged twice.</b> Retries are only safe if the operation is <b>idempotent</b>: doing it twice has the same effect as once.</p>",
        idea: "POST is not idempotent by default. Retries plus non-idempotent writes equal duplicates.",
        changed: ["Charges: 2", "Double charges: 1"] },
      { label: "Key", tag: "technique", title: "Send an Idempotency-Key",
        body: "<p>The app creates an <b>Idempotency-Key</b> (here <code>7f3a</code>) <b>once per payment</b> and sends it on every attempt.</p><p>The server looks the key up. Not found, so it charges and saves <b>key + response in the same transaction</b>. Then the reply is lost again.</p>",
        idea: "The key names the operation, so the server can recognise a repeat.",
        changed: ["Key table appears", "Row: 7f3a → 200 · charge #1"] },
      { label: "Replay", tag: "fix", title: "Replay the stored response",
        body: "<p>The app retries <b>with the same key</b>. The server finds <code>7f3a</code> and <b>replays the stored response</b> without touching the card.</p><p>One payment, however many retries.</p>",
        idea: "Same key → same answer, with no second side effect.",
        changed: ["Replayed: 1", "Charges stay at 1"] },
      { label: "Double-click", tag: "failure", title: "Two requests at the same moment",
        body: "<p>The user <b>double-clicks</b>. Two requests with key <code>c41d</code> arrive together, and the code does “check, then insert”.</p><p>Both checks run before either insert, so <b>both see “not found”</b>, and both charge. A <b>race condition</b>.</p>",
        idea: "Check-then-act is not atomic. Two concurrent requests can both pass the check.",
        changed: ["2 lookups: not found ×2", "Charges: 2 · Double charges: 1"] },
      { label: "Unique index", tag: "fix", title: "Let the database decide",
        body: "<p><b>Insert the key first</b>, protected by a <b>unique index</b>. Only one insert can win.</p><p>B hits “duplicate key”, so it <b>does not charge</b>: it waits for A’s result (or gets <b>409</b> and retries). The C# demo fires 10 concurrent requests and gets 1 charge.</p>",
        idea: "Atomicity comes from the database constraint, not from an if-statement.",
        changed: ["Row: c41d → in progress → 200", "Charges: 1 · both clicks get 200"] },
      { label: "New key", tag: "concept", title: "A new purchase is a new key",
        body: "<p>Buying the same thing again <b>on purpose</b> is a new operation, so the app makes a <b>new key</b> (<code>9b21</code>).</p><p>The key, not the amount, identifies a payment, so it is charged as it should be.</p>",
        idea: "One key per logical operation, not per HTTP attempt and not per amount.",
        changed: ["Row: 9b21 → 200 · charge #2", "Charges: 2, both intended"] },
      { label: "Rules", tag: "result", title: "Guard rails for keys",
        body: "<p>A key reused with a <b>different body</b> (same key, $9.00) is a client bug: answer <b>422</b>, never charge.</p><p>Keep keys for about a <b>day</b>, then expire them. Store key + result <b>atomically</b> with the charge.</p>",
        idea: "Interview line: “client-generated Idempotency-Key, unique index, store the response, replay on repeat, expire after 24 h.”",
        changed: ["Mismatched body → 422", "Old keys expire"] }
    ],
    learn: [
      { text: "Why retries cause double charges", step: 1 },
      { text: "How an Idempotency-Key replays the result", step: 3 },
      { text: "The check-then-insert race", step: 4 },
      { text: "Unique index: let the database decide", step: 5 },
      { text: "One key per logical operation", step: 6 }
    ],
    build(stage, k) {
      const svg = k.svg(760, 330, { label: "A client, a payments API with an idempotency key table, and the customer's card" });
      stage.append(svg);
      const CL = { x: 85, y: 110 }, API = { x: 360, y: 110 }, BANK = { x: 650, y: 110 }, ST = { x: 360, y: 215 };
      k.line(svg, CL, API, { dashed: true });
      k.line(svg, API, BANK, { dashed: true });
      const stLine = k.line(svg, API, ST, { dashed: true });
      const client = k.box(svg, { ...CL, label: "Shop app", icon: "📱", w: 120 });
      const api = k.box(svg, { ...API, label: "Payments API", icon: "🖥️", sub: "no idempotency", w: 160, h: 52 });
      const bank = k.box(svg, { ...BANK, label: "Customer’s card", icon: "💳", w: 170, h: 48 });
      const reqText = k.text(svg, 14, CL.y - 40, "", { size: 11, anchor: "start", mono: true });

      let attempts = 0, charges = 0, replayed = 0, doubles = 0;
      const metrics = () => k.hud({ Attempts: attempts, Charges: charges, Replayed: replayed, "Double charges": doubles });
      const resetMetrics = () => { attempts = 0; charges = 0; replayed = 0; doubles = 0; metrics(); };
      metrics();

      // the key table (hidden until part 2)
      const storeG = k.s("g", { opacity: 0 }); svg.append(storeG);
      storeG.append(k.s("rect", { x: 225, y: 215, width: 270, height: 100, rx: 10, fill: "surface", stroke: "accent", "stroke-width": 1.5 }));
      k.text(storeG, 360, 234, "idempotency_keys · UNIQUE(key)", { size: 11.5, weight: 700, mono: true });
      stLine.setAttribute("opacity", 0);
      const storeRows = [];
      function addRow(str, tone = "ink") {
        const t = k.text(storeG, 240, 256 + storeRows.length * 19, str, { size: 11.5, anchor: "start", mono: true, tone });
        storeRows.push(t); return t;
      }
      function clearRows() { storeRows.splice(0).forEach(t => t.remove()); }

      // the ledger
      k.text(svg, BANK.x, 160, "charges on the card", { size: 11, tone: "muted" });
      const ledger = [];
      let chargeNo = 0;
      function charge(amount, tone = "good") {
        chargeNo++;
        charges++; metrics();
        const t = k.text(svg, BANK.x, 182 + ledger.length * 20, `charge #${chargeNo} · ${amount}`, { size: 12, weight: 700, tone, mono: true });
        ledger.push(t);
        k.float(svg, BANK.x, BANK.y - 34, `−${amount}`, tone === "good" ? "warn" : "bad");
        return chargeNo;
      }
      function clearLedger() { ledger.splice(0).forEach(t => t.remove()); chargeNo = 0; k.tone(bank, "neutral"); }

      async function lostResponse(label) {
        const d = k.dot(svg, API.x, API.y, { r: 12, tone: "good", label, size: 9 });
        await k.tween(d, { tx: 225 }, 500, k.ease.linear);
        k.float(svg, 225, API.y - 22, "✂ connection dropped", "bad");
        await k.tween(d, { ty: API.y + 26, opacity: 0 }, 500);
        d.remove();
        k.tone(client, "warn");
        k.float(svg, CL.x, CL.y - 56, "⏱ timeout… did it work?", "warn");
        await k.sleep(1600);
        k.tone(client, "neutral");
      }
      async function toBankAndBack(amount, tone) {
        await k.packet(svg, API, BANK, { ms: 500, r: 8 });
        const n = charge(amount, tone);
        await k.sleep(400);
        await k.packet(svg, BANK, API, { ms: 450, r: 8, tone: "good" });
        return n;
      }
      async function attempt(from, to, opts) { attempts++; metrics(); await k.packet(svg, from, to, opts); }

      k.run(async () => {
        // ---- part 1: no key ----
        // 1 · the reply is lost
        await k.step();
        k.say("<b>POST /payments $19.99</b>, no idempotency key.");
        reqText.textContent = "POST /payments $19.99";
        await k.sleep(1200);
        await attempt(CL, API, { ms: 600, r: 8 });
        await toBankAndBack("$19.99", "good");
        k.say("Charged. The reply heads back…");
        await lostResponse("200");
        k.say("The app only sees a timeout.");

        // 2 · the retry double-charges
        await k.step();
        k.say("The app retries…");
        await k.sleep(800);
        await attempt(CL, API, { ms: 600, r: 8 });
        await toBankAndBack("$19.99", "bad");
        ledger.forEach(t => t.style.fill = k.colors.bad);
        k.tone(bank, "bad");
        doubles = 1; metrics();
        await k.packet(svg, API, CL, { ms: 500, r: 8, tone: "good" });
        k.say("<b>Charged twice.</b>");
        await k.sleep(1200);

        // ---- part 2: with a key ----
        // 3 · send a key
        await k.step();
        clearLedger(); resetMetrics();
        k.say("Every attempt now carries <b>Idempotency-Key: 7f3a</b>.");
        api.sub.textContent = "checks the key first";
        k.tone(api, "accent");
        await k.tween(storeG, { opacity: 1 }, 600);
        stLine.setAttribute("opacity", 1);
        reqText.textContent = "POST /payments $19.99 · key 7f3a";
        await k.sleep(1200);
        await attempt(CL, API, { ms: 600, r: 8, label: "7f3a", size: 8 });
        k.say("Look up <b>7f3a</b>… not found: new payment.");
        await k.packet(svg, API, ST, { ms: 400, r: 7, tone: "accent" });
        k.float(svg, ST.x + 80, ST.y + 10, "not found", "muted");
        await k.packet(svg, ST, API, { ms: 350, r: 7, tone: "muted" });
        const n1 = await toBankAndBack("$19.99", "good");
        const row = addRow(`7f3a  →  200 · charge #${n1}`, "good");
        k.say("Key + response saved with the charge. Reply lost again…");
        k.pulse(row);
        await k.sleep(1000);
        await lostResponse("200");

        // 4 · replay
        await k.step();
        k.say("Retry with the <b>same key</b>…");
        await k.sleep(800);
        await attempt(CL, API, { ms: 600, r: 8, label: "7f3a", size: 8 });
        await k.packet(svg, API, ST, { ms: 400, r: 7, tone: "accent" });
        k.float(svg, ST.x + 80, ST.y + 10, "found!", "good");
        row.style.fill = k.colors.accent;
        await k.sleep(700);
        await k.packet(svg, ST, API, { ms: 350, r: 9, tone: "good", label: "↩" });
        replayed++; metrics();
        await k.packet(svg, API, CL, { ms: 600, r: 12, tone: "good", label: "200", size: 9 });
        k.tone(client, "good");
        k.say(`Stored response replayed: still <b>one charge</b> (#${n1}).`);
        await k.sleep(1500);

        // ---- part 3: concurrent duplicates ----
        // 5 · double-click race
        await k.step();
        k.tone(client, "neutral"); row.style.fill = k.colors.good;
        clearLedger(); clearRows(); resetMetrics();
        api.sub.textContent = "if (!exists) charge…";
        k.tone(api, "warn");
        k.say("Double-click: two requests with key <b>c41d</b> at once.");
        reqText.textContent = "2 × POST /payments $5.00 · key c41d";
        await k.sleep(1200);
        attempts += 2; metrics();
        await Promise.all([
          k.packet(svg, { x: CL.x, y: CL.y - 10 }, { x: API.x, y: API.y - 10 }, { ms: 600, r: 8, label: "A", size: 9 }),
          k.packet(svg, { x: CL.x, y: CL.y + 10 }, { x: API.x, y: API.y + 10 }, { ms: 600, r: 8, label: "B", size: 9 })
        ]);
        await Promise.all([
          k.packet(svg, { x: API.x - 10, y: API.y }, { x: ST.x - 10, y: ST.y }, { ms: 400, r: 7, tone: "accent" }),
          k.packet(svg, { x: API.x + 10, y: API.y }, { x: ST.x + 10, y: ST.y }, { ms: 400, r: 7, tone: "accent" })
        ]);
        k.float(svg, ST.x + 90, ST.y + 10, "not found ×2", "bad");
        await k.sleep(700);
        k.say("Both see “not found”, so both charge.");
        await Promise.all([toBankAndBack("$5.00", "bad"), k.sleep(150).then(() => toBankAndBack("$5.00", "bad"))]);
        k.tone(bank, "bad");
        doubles = 1; metrics();
        await k.sleep(1200);

        // 6 · unique index
        await k.step();
        clearLedger(); resetMetrics();
        api.sub.textContent = "insert key first";
        k.tone(api, "accent");
        k.say("Insert the key first. A unique index lets only one win.");
        await k.sleep(1200);
        attempts += 2; metrics();
        await Promise.all([
          k.packet(svg, { x: CL.x, y: CL.y - 10 }, { x: API.x, y: API.y - 10 }, { ms: 600, r: 8, label: "A", size: 9 }),
          k.packet(svg, { x: CL.x, y: CL.y + 10 }, { x: API.x, y: API.y + 10 }, { ms: 600, r: 8, label: "B", size: 9 })
        ]);
        await Promise.all([
          k.packet(svg, { x: API.x - 10, y: API.y }, { x: ST.x - 10, y: ST.y }, { ms: 400, r: 7, tone: "accent", label: "A", size: 8 }),
          k.packet(svg, { x: API.x + 10, y: API.y }, { x: ST.x + 10, y: ST.y }, { ms: 460, r: 7, tone: "accent", label: "B", size: 8 })
        ]);
        const row2 = addRow("c41d  →  ⏳ in progress (A)", "warn");
        k.float(svg, ST.x + 100, ST.y + 6, "B: duplicate key!", "bad");
        k.say("A wins. B gets “duplicate key” and waits for A’s result.");
        await k.sleep(1200);
        const n2 = await toBankAndBack("$5.00", "good");
        row2.textContent = `c41d  →  200 · charge #${n2}`;
        row2.style.fill = k.colors.good;
        replayed++; metrics();
        await Promise.all([
          k.packet(svg, { x: API.x, y: API.y - 10 }, { x: CL.x, y: CL.y - 10 }, { ms: 600, r: 12, tone: "good", label: "200", size: 9 }),
          k.packet(svg, { x: API.x, y: API.y + 10 }, { x: CL.x, y: CL.y + 10 }, { ms: 600, r: 12, tone: "good", label: "200", size: 9 })
        ]);
        k.say("Both clicks get 200. <b>One charge.</b>");
        await k.sleep(1200);

        // ---- part 4: new operation, new key ----
        // 7 · new key
        await k.step();
        k.say("Buying again on purpose: new key <b>9b21</b>.");
        reqText.textContent = "POST /payments $5.00 · key 9b21";
        await k.sleep(800);
        await attempt(CL, API, { ms: 600, r: 8, label: "9b21", size: 8 });
        await k.packet(svg, API, ST, { ms: 400, r: 7, tone: "accent" });
        k.float(svg, ST.x + 80, ST.y + 10, "not found", "muted");
        await k.packet(svg, ST, API, { ms: 350, r: 7, tone: "muted" });
        const n3 = await toBankAndBack("$5.00", "good");
        addRow(`9b21  →  200 · charge #${n3}`, "good");
        await k.packet(svg, API, CL, { ms: 500, r: 12, tone: "good", label: "200", size: 9 });
        k.say("New key, new operation: charged, as it should be.");
        await k.sleep(1200);

        // 8 · guard rails
        await k.step();
        k.say("Same key <b>c41d</b>, different amount…");
        reqText.textContent = "POST /payments $9.00 · key c41d";
        await k.sleep(800);
        await attempt(CL, API, { ms: 600, r: 8, label: "c41d", size: 8, tone: "warn" });
        await k.packet(svg, API, ST, { ms: 400, r: 7, tone: "accent" });
        k.float(svg, ST.x + 90, ST.y + 10, "amount mismatch", "bad");
        row2.style.fill = k.colors.bad;
        await k.sleep(600);
        await k.packet(svg, API, CL, { ms: 600, r: 12, tone: "bad", label: "422", size: 9 });
        row2.style.fill = k.colors.good;
        k.say("<b>422</b>: never charge on a mismatched key.");
        await k.sleep(1200);
        k.say("A day later, old keys expire.");
        await k.tween(storeG, { opacity: 0.35 }, 1200);
        clearRows();
        await k.tween(storeG, { opacity: 1 }, 400);
        addRow("(keys expire after ~24 h)", "muted");
        await k.sleep(1200);
        k.done();
      });
    }
  },

  play: {
    title: "Payment Server",
    goal: "You are the payments API. For each request choose <b>Process</b> (charge the card), <b>Replay</b> (return the stored response) or <b>Reject</b>. Use the key table: never charge twice, never drop a real payment.",
    build(stage, k) {
      const TOTAL = 16, AMOUNTS = ["$5.00", "$12.50", "$20.00", "$49.99"];
      const svg = k.svg(760, 330, { label: "Incoming payment request, the idempotency key table and the card network" });
      stage.append(svg);
      const CARD = { x: 160, y: 60 }, API = { x: 160, y: 185 }, BANK = { x: 590, y: 290 };
      k.line(svg, CARD, API, { dashed: true });
      k.line(svg, API, { x: 432, y: 130 }, { dashed: true });
      k.line(svg, API, BANK, { dashed: true });
      const card = k.box(svg, { ...CARD, w: 280, h: 62, label: "…", sub: "…", tone: "accent" });
      const api = k.box(svg, { ...API, label: "Payments API", icon: "🖥️", sub: "that’s you", w: 170, h: 50 });
      const bank = k.box(svg, { ...BANK, label: "Card network", icon: "💳", sub: "charges 0 · double charges 0", w: 300, h: 52 });

      svg.append(k.s("rect", { x: 432, y: 18, width: 312, height: 222, rx: 10, fill: "surface", stroke: "line", "stroke-width": 1.5 }));
      k.text(svg, 588, 40, "idempotency_keys", { size: 12, weight: 700, mono: true });
      k.text(svg, 446, 62, "key", { size: 11, anchor: "start", tone: "muted" });
      k.text(svg, 530, 62, "amount", { size: 11, anchor: "start", tone: "muted" });
      k.text(svg, 610, 62, "stored response", { size: 11, anchor: "start", tone: "muted" });
      const rowsG = k.s("g"); svg.append(rowsG);
      const ROWY = i => 86 + i * 25;

      const store = new Map();         // key → {amount, status, charge, doneAt}
      let idx = 0, correct = 0, charges = 0, doubles = 0, busy = true, cur = null;
      const usedKeys = new Set();
      function newKey() {
        let key;
        do { key = `k-${k.randInt(0x1000, 0xffff).toString(16)}`; } while (usedKeys.has(key));
        usedKeys.add(key);
        return key;
      }

      function drawStore() {
        rowsG.replaceChildren();
        const entries = [...store.entries()].slice(-6);
        entries.forEach(([key, e], i) => {
          const y = ROWY(i);
          const hl = cur && cur.key === key;
          if (hl) rowsG.append(k.s("rect", { x: 438, y: y - 15, width: 300, height: 22, rx: 5, fill: "accentSoft" }));
          k.text(rowsG, 446, y, key, { size: 12, anchor: "start", mono: true, weight: hl ? 800 : 500 });
          k.text(rowsG, 530, y, e.amount, { size: 12, anchor: "start", mono: true });
          k.text(rowsG, 610, y, e.status === "processing" ? "⏳ processing" : `✓ 200 · charge #${e.charge}`, { size: 12, anchor: "start", tone: e.status === "processing" ? "warn" : "good" });
        });
        if (!entries.length) k.text(rowsG, 588, ROWY(1), "(empty)", { size: 11, tone: "muted" });
      }
      function hud() { k.hud({ Request: `${Math.min(idx + 1, TOTAL)} / ${TOTAL}`, Correct: correct, "Double charges": doubles }); }

      const PLAN = ["new", "new", "dupProcessing", "new", "dupDone", "sameAmountNewKey", "mismatch", "noKey",
        "new", "dupProcessing", "dupDone", "mismatch", "new", "dupDone", "sameAmountNewKey", "dupDone"];
      function gen(kind) {
        const all = [...store.entries()];
        const proc = all.filter(([, e]) => e.status === "processing"), done = all.filter(([, e]) => e.status === "done");
        if (kind === "dupProcessing") { if (proc.length) { const [key, e] = k.pick(proc); return { key, amount: e.amount, kind }; } kind = "dupDone"; }
        if (kind === "dupDone") { if (done.length) { const [key, e] = k.pick(done); return { key, amount: e.amount, kind }; } kind = "new"; }
        if (kind === "mismatch" && all.length) { const [key, e] = k.pick(all); return { key, amount: k.pick(AMOUNTS.filter(a => a !== e.amount)), kind }; }
        if (kind === "sameAmountNewKey" && all.length) { const [, e] = all[all.length - 1]; return { key: newKey(), amount: e.amount, kind }; }
        if (kind === "noKey") return { key: null, amount: k.pick(AMOUNTS), kind };
        return { key: newKey(), amount: k.pick(AMOUNTS), kind: "new" };
      }
      function expected(r) {
        if (!r.key) return { act: "reject", why: "No Idempotency-Key at all. A payments API should refuse it (<b>400</b>) rather than risk a charge it can’t de-duplicate." };
        const e = store.get(r.key);
        if (!e) return { act: "process", why: r.kind === "sameAmountNewKey" ? "Same amount as an earlier payment, but a <b>new key</b> means a new purchase: <b>process</b> it." : "A key we’ve never seen: <b>process</b> it, and store key + result in the same transaction." };
        if (e.amount !== r.amount) return { act: "reject", why: `Key ${r.key} was used for ${e.amount}, and this asks for ${r.amount}. A key reused for a different request: <b>422</b>.` };
        if (e.status === "processing") return { act: "reject", why: `The first request with ${r.key} is <b>still processing</b>. Answer <b>409 Conflict</b> (retry later); never start a second charge.` };
        return { act: "replay", why: `${r.key} already succeeded: <b>replay the stored response</b> (charge #${e.charge}) without charging again.` };
      }

      async function next() {
        // finish any payment whose processing time is up
        for (const e of store.values()) if (e.status === "processing" && idx >= e.doneAt) e.status = "done";
        if (idx >= TOTAL) { drawStore(); return end(); }
        cur = gen(PLAN[idx]);
        hud();
        card.label.textContent = `POST /payments · ${cur.amount}`;
        card.sub.textContent = cur.key ? `Idempotency-Key: ${cur.key}` : "(no Idempotency-Key header)";
        k.tone(card, "accent");
        drawStore();
        k.pulse(card);
        await k.packet(svg, CARD, API, { ms: 380, r: 8 });
        busy = false;
        setButtons(true);
      }

      async function decide(act) {
        if (busy || !cur) return;
        busy = true; setButtons(false);
        const r = cur, exp = expected(r), ok = act === exp.act;
        const existing = r.key ? store.get(r.key) : null;
        if (act === "process") {
          await k.packet(svg, API, BANK, { ms: 500, r: 8 });
          charges++;
          const dup = existing && existing.amount === r.amount;
          if (dup) { doubles++; k.tone(bank, "bad"); k.float(svg, BANK.x, BANK.y - 34, `${r.amount} AGAIN!`, "bad"); }
          else k.float(svg, BANK.x, BANK.y - 34, `−${r.amount}`, ok ? "good" : "bad");
          if (r.key && !existing) store.set(r.key, { amount: r.amount, status: "processing", charge: charges, doneAt: idx + 2 });
          bank.sub.textContent = `charges ${charges} · double charges ${doubles}`;
          drawStore();
        } else if (act === "replay") {
          const i = existing ? [...store.keys()].slice(-6).indexOf(r.key) : -1;
          const to = i >= 0 ? { x: 440, y: ROWY(i) - 4 } : { x: 440, y: 130 };
          await k.packet(svg, API, to, { ms: 420, r: 8, tone: "accent" });
          if (!existing) k.float(svg, 588, 130, "nothing stored!", "bad");
          else if (existing.status === "processing") k.float(svg, 588, ROWY(i) - 14, "no response yet!", "bad");
          await k.packet(svg, to, CARD, { ms: 480, r: 10, tone: ok ? "good" : "bad", label: "↩" });
        } else {
          await k.packet(svg, API, CARD, { ms: 420, r: 12, tone: ok ? "muted" : "bad", label: "✕" });
        }
        if (ok) { correct++; k.say(`✓ ${exp.why}`); k.float(svg, API.x, API.y - 36, "correct", "good"); }
        else {
          const harm = act === "process" && existing ? " You just charged the customer twice."
            : exp.act === "process" ? " The real payment never happened: a lost sale." : "";
          k.say(`✗ ${exp.why}${harm}`);
          k.tone(card, "bad");
        }
        hud();
        await k.sleep(ok ? 1100 : 2600);
        k.tone(bank, "neutral");
        idx++;
        await next();
      }

      const box = k.choices([
        { label: "⚡ Process (charge)", act: "process" },
        { label: "↩ Replay stored response", act: "replay" },
        { label: "⛔ Reject", act: "reject" }
      ], o => k.run(() => decide(o.act)));
      function setButtons(on) { box.querySelectorAll("button").forEach(b => { b.disabled = !on; }); }

      function end() {
        const text = `You handled <b>${correct} of ${TOTAL}</b> requests correctly, with <b>${doubles}</b> double charge${doubles === 1 ? "" : "s"}. The key, not the amount, identifies a payment: new key → process, finished key → replay, in-flight or mismatched key → reject.`;
        if (correct < 9) k.lose(`${text} Look the key up in the table before anything else.`);
        else k.win({ stars: doubles > 1 ? Math.min(2, k.starsFor(correct, 12, 15)) : k.starsFor(correct, 12, 15), text });
      }

      setButtons(false); hud(); drawStore();
      k.say("Requests arrive at your API. Check the <b>Idempotency-Key</b> against the table, then decide.");
      k.run(async () => { await k.sleep(700); await next(); });
    }
  }
});
