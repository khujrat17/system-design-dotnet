"use strict";
/* Concept 9 · Replication. Watch: async primary→replica streaming, lag, a read-your-own-writes anomaly and its fix,
   then sync vs async. Play: Read Router, send each read to the primary or a lagging replica. */
Lab.define(9, {
  watch: {
    title: "The address that came back",
    intro: "Writes go to the primary and stream to replicas <b>asynchronously</b>. Follow Asha’s address change and the read that arrives before it does.",
    steps: [
      { label: "Replicas", tag: "concept", title: "One primary, many copies",
        body: "<p>A <b>primary</b> takes every write and streams its <b>change log</b> to two <b>replicas</b>.</p><p>The app spreads reads over the replicas, so read capacity grows with every copy you add.</p>",
        idea: "Replication buys read capacity and a standby copy. Each replica holds the whole dataset.",
        changed: ["3 reads served by replicas", "Primary stays free for writes"] },
      { label: "Async write", tag: "technique", title: "“Saved!”, before the replicas know",
        body: "<p>Asha changes her address to <b>New Rd 99</b>. The primary commits and answers “saved” <b>at once</b>.</p><p>With <b>asynchronous</b> replication it doesn’t wait for the replicas. The change is still travelling down the log.</p>",
        idea: "Async replication keeps writes fast, but replicas are always a little behind.",
        changed: ["Primary: New Rd 99", "Replicas still say Old St 1", "Replication lag starts counting"] },
      { label: "Stale read", tag: "failure", title: "Her own write vanished",
        body: "<p>Asha’s next page reads her profile, and the app sends the read to <b>Replica B</b>.</p><p>The change hasn’t arrived yet, so she sees <b>Old St 1</b>. That delay is <b>replication lag</b>: usually milliseconds, but seconds under a bulk import.</p>",
        idea: "Breaking <b>read-your-own-writes</b> is the classic replication bug: users think their save failed.",
        changed: ["Stale reads: 1", "Asha sees her old address"] },
      { label: "Catch up", tag: "concept", title: "Nothing was lost, just late",
        body: "<p>A moment later the change reaches both replicas and they match the primary again.</p><p>This is <b>eventual consistency</b>: if writes stop, every copy converges to the same value.</p>",
        idea: "Lag is a window, not data loss. The question is who reads inside that window.",
        changed: ["Both replicas: New Rd 99", "Replication lag back to 0"] },
      { label: "Own writes", tag: "fix", title: "Recent writers read the primary",
        body: "<p>The fix is <b>read-your-own-writes</b>: the app remembers when each user last wrote, and for a few seconds sends <i>that user’s</i> reads to the primary.</p><p>Asha saves <b>Flat 7</b> and sees it at once. Ravi, who wrote nothing, still reads a replica and may see it a second late, which is fine.</p>",
        idea: "Route by who is reading: the writer gets the primary, everyone else gets a replica.",
        changed: ["Asha’s read → primary: Flat 7 ✓", "Ravi’s read → replica"] },
      { label: "Sync", tag: "trade-off", title: "Wait for a replica before “saved”",
        body: "<p>With <b>synchronous</b> replication the primary waits until Replica A confirms the change before answering.</p><p>Replica A can never lag, and a failover to it loses nothing. The price: <b>every write is slower</b>. Many systems keep one sync replica and the rest async.</p>",
        idea: "Sync = safer and slower; async = faster with a lag window. Semi-sync mixes both.",
        changed: ["Write ack: 1.6 s → 3.4 s", "Replica A confirmed before the ack"] },
      { label: "Reads only", tag: "result", title: "Replicas scale reads, not writes",
        body: "<p>Reads fan out over the replicas, but <b>every write</b> still lands on the one primary, and then on every replica too.</p><p>If writes are the bottleneck, more replicas won’t help. That is when you need <b>sharding</b>.</p>",
        idea: "Interview answer: “replicas for read scale and failover, read-your-own-writes for the user who just wrote, shard when writes outgrow one machine.”",
        changed: ["3 writes → the primary", "3 reads → the replicas"] }
    ],
    learn: [
      { text: "How a primary streams changes to replicas", step: 1 },
      { text: "What replication lag does to a read", step: 2 },
      { text: "How read-your-own-writes fixes it", step: 4 },
      { text: "Sync vs async replication", step: 5 },
      { text: "Why replicas don’t scale writes", step: 6 }
    ],
    build(stage, k) {
      const svg = k.svg(760, 330, { label: "Two users, an app server, a primary database and two replicas" });
      stage.append(svg);
      const P = {
        asha: { x: 60, y: 110 }, ravi: { x: 60, y: 240 }, app: { x: 205, y: 175 },
        primary: { x: 440, y: 62 }, ra: { x: 360, y: 262 }, rb: { x: 610, y: 262 }
      };
      for (const u of [P.asha, P.ravi]) k.line(svg, u, P.app, { dashed: true });
      k.line(svg, P.app, P.primary, { dashed: true });
      k.line(svg, P.app, P.ra, { dashed: true });
      k.line(svg, P.app, P.rb, { dashed: true });
      k.line(svg, P.primary, P.ra, { tone: "accent", arrow: true });
      k.line(svg, P.primary, P.rb, { tone: "accent", arrow: true });
      k.text(svg, 345, 165, "change log", { size: 11, tone: "accent" });
      k.text(svg, 585, 165, "change log", { size: 11, tone: "accent" });

      const asha = k.box(svg, { ...P.asha, w: 96, label: "Asha", icon: "👩" });
      const ravi = k.box(svg, { ...P.ravi, w: 96, label: "Ravi", icon: "🧑" });
      const app = k.box(svg, { ...P.app, w: 164, h: 52, label: "App", icon: "🖥️", sub: "reads → replicas", size: 13.5 });
      const primary = k.box(svg, { ...P.primary, w: 190, h: 54, label: "Primary", icon: "🗄️", sub: "address: Old St 1", size: 13.5 });
      const ra = k.box(svg, { ...P.ra, w: 190, h: 54, label: "Replica A", icon: "📄", sub: "address: Old St 1", size: 13.5 });
      const rb = k.box(svg, { ...P.rb, w: 190, h: 54, label: "Replica B", icon: "📄", sub: "address: Old St 1", size: 13.5 });
      k.text(svg, 440, 22, "all writes", { size: 11, tone: "muted" });
      const stat = k.text(svg, 470, 322, "", { size: 12, weight: 600 });
      const setVal = (b, v) => { b.sub.textContent = `address: ${v}`; };
      const lagTxt = k.text(svg, 470, 200, "", { size: 12, weight: 700, tone: "warn" });

      /* live metrics; lag is counted in fixed 0.1 s ticks while a beat plays, so replays land on the same numbers */
      let lag = 0, replicaReads = 0, primaryReads = 0, staleReads = 0, ack = "—";
      const metrics = () => k.hud({ "Replication lag": `${lag.toFixed(1)} s`, "Replica reads": replicaReads, "Primary reads": primaryReads, "Write ack": ack, "Stale reads": staleReads });
      metrics();
      let stopTick = null;
      function startLag() {
        stopLag();
        stopTick = k.every(100, () => { lag += 0.1; lagTxt.textContent = `replication lag: ${lag.toFixed(1)} s`; metrics(); });
      }
      function stopLag(value) {
        if (stopTick) { stopTick(); stopTick = null; }
        if (value != null) { lag = value; lagTxt.textContent = value ? `replication lag: ${value.toFixed(1)} s` : ""; metrics(); }
      }

      /* the change log: Δ packets that travel part of the way and hold, then finish later */
      function shipStart() {
        const dots = [P.ra, P.rb].map(() => k.dot(svg, P.primary.x, P.primary.y, { r: 9, label: "Δ", tone: "accent" }));
        const mid = (to, f) => ({ x: P.primary.x + (to.x - P.primary.x) * f, y: P.primary.y + (to.y - P.primary.y) * f });
        return { dots, go: Promise.all([P.ra, P.rb].map((to, i) => k.tween(dots[i], { tx: mid(to, 0.5 - i * 0.15).x, ty: mid(to, 0.5 - i * 0.15).y }, 1600))) };
      }
      async function shipFinish(h, value, ms) {
        await Promise.all([P.ra, P.rb].map((to, i) => k.tween(h.dots[i], { tx: to.x, ty: to.y }, ms + i * 300).then(() => {
          h.dots[i].remove();
          const b = i ? rb : ra; setVal(b, value); k.tone(b, "good");
        })));
      }
      async function read(who, to, tone = "good") {
        await k.packet(svg, who, P.app, { r: 8, label: "R", ms: 350 });
        await k.packet(svg, P.app, to, { r: 8, label: "R", ms: 400 });
        if (to === P.primary) primaryReads++; else replicaReads++;
        metrics();
        await k.packet(svg, to, P.app, { r: 8, tone, ms: 350 });
        await k.packet(svg, P.app, who, { r: 8, tone, ms: 350 });
      }
      async function write(value) {
        await k.packet(svg, P.asha, P.app, { r: 10, label: "W", tone: "warn", ms: 450 });
        await k.packet(svg, P.app, P.primary, { r: 10, label: "W", tone: "warn", ms: 450 });
        setVal(primary, value); k.tone(primary, "good");
      }
      async function confirm() {
        await k.packet(svg, P.primary, P.app, { r: 9, label: "✓", tone: "good", ms: 350 });
        await k.packet(svg, P.app, P.asha, { r: 9, label: "✓", tone: "good", ms: 350 });
      }

      k.run(async () => {
        // 1 · replicas serve reads
        await k.step();
        k.say("Reads are spread over the replicas.");
        for (const [who, to] of [[P.ravi, P.ra], [P.asha, P.rb], [P.ravi, P.rb]]) {
          await k.packet(svg, who, P.app, { r: 8, ms: 400 });
          await k.packet(svg, P.app, to, { r: 8, ms: 450 });
          replicaReads++; metrics();
          await k.packet(svg, to, P.app, { r: 8, tone: "good", ms: 400 });
        }
        await k.sleep(800);

        // 2 · async write
        await k.step();
        k.say("Asha saves <b>New Rd 99</b>.");
        await write("New Rd 99");
        await confirm();
        ack = "1.6 s"; metrics();
        k.say("Acknowledged at once; the change is still on its way.");
        startLag();
        const ship1 = shipStart();
        await ship1.go;
        await k.sleep(600);
        stopLag(2.2);

        // 3 · the stale read
        await k.step();
        startLag();
        k.say("Asha reloads her profile → Replica B…");
        k.tone(rb, "bad");
        await read(P.asha, P.rb, "bad");
        staleReads++; metrics();
        k.tone(asha, "bad"); k.float(svg, P.asha.x, P.asha.y - 34, "Old St 1?!", "bad");
        stat.textContent = "Asha read “Old St 1” right after saving “New Rd 99”"; stat.style.fill = k.colors.bad;
        k.say("…and gets her <b>old address</b>.");
        await k.sleep(1400);
        stopLag(3.9);

        // 4 · replicas catch up
        await k.step();
        k.tone(asha, "neutral"); k.tone(rb, "neutral");
        startLag();
        k.say("The change log arrives…");
        await shipFinish(ship1, "New Rd 99", 1600);
        stopLag(0);
        stat.textContent = "all three copies agree again"; stat.style.fill = k.colors.good;
        k.say("Both replicas caught up.");
        await k.sleep(1600);
        [primary, ra, rb].forEach(b => k.tone(b, "neutral"));
        stat.textContent = "";

        // 5 · read-your-own-writes
        await k.step();
        app.sub.textContent = "recent writer → primary";
        k.tone(app, "accent");
        k.say("Asha saves <b>Flat 7</b>.");
        await k.sleep(600);
        await write("Flat 7");
        await confirm();
        startLag();
        const ship2 = shipStart();
        k.say("She wrote 1 s ago → her read goes to the <b>primary</b>.");
        await read(P.asha, P.primary);
        k.tone(asha, "good"); k.float(svg, P.asha.x, P.asha.y - 34, "Flat 7 ✓", "good");
        await ship2.go;
        k.say("Ravi wrote nothing → replica, maybe a second behind.");
        await read(P.ravi, P.ra, "warn");
        await shipFinish(ship2, "Flat 7", 1200);
        stopLag(0);
        await k.sleep(800);
        [asha, primary, ra, rb].forEach(b => k.tone(b, "neutral"));
        app.sub.textContent = "reads → replicas"; k.tone(app, "neutral");

        // 6 · synchronous replication
        await k.step();
        k.say("Synchronous: wait for Replica A before “saved”.");
        await k.sleep(600);
        await k.packet(svg, P.asha, P.app, { r: 10, label: "W", tone: "warn", ms: 450 });
        await k.packet(svg, P.app, P.primary, { r: 10, label: "W", tone: "warn", ms: 450 });
        setVal(primary, "Flat 8"); k.tone(primary, "warn");
        await k.packet(svg, P.primary, P.ra, { r: 9, label: "Δ", tone: "accent", ms: 900 });
        setVal(ra, "Flat 8"); k.tone(ra, "good");
        await k.packet(svg, P.ra, P.primary, { r: 8, label: "✓", tone: "good", ms: 900 });
        k.tone(primary, "good");
        await confirm();
        ack = "3.4 s"; metrics();
        stat.textContent = "write confirmed after: async 1.6 s · sync 3.4 s"; stat.style.fill = k.colors.ink;
        k.say("Replica A can’t lag. Every write waits longer.");
        await k.packet(svg, P.primary, P.rb, { r: 9, label: "Δ", tone: "accent", ms: 1500 });
        setVal(rb, "Flat 8"); k.tone(rb, "good");
        await k.sleep(1000);
        [primary, ra, rb].forEach(b => k.tone(b, "neutral"));
        stat.textContent = "";

        // 7 · replicas scale reads, not writes
        await k.step();
        k.say("Reads fan out; every write hits the one primary.");
        k.tone(primary, "warn");
        await Promise.all([0, 1, 2].map(i => k.sleep(i * 500).then(async () => {
          const who = i % 2 ? P.ravi : P.asha, to = i % 2 ? P.rb : P.ra;
          await Promise.all([
            k.packet(svg, who, P.app, { r: 9, label: "W", tone: "warn", ms: 450 }).then(() => k.packet(svg, P.app, P.primary, { r: 9, label: "W", tone: "warn", ms: 450 })),
            k.packet(svg, who === P.asha ? P.ravi : P.asha, P.app, { r: 8, label: "R", ms: 450 }).then(() => k.packet(svg, P.app, to, { r: 8, label: "R", ms: 450 }))
          ]);
          replicaReads++; metrics();
          await Promise.all([P.ra, P.rb].map(r => k.packet(svg, P.primary, r, { r: 7, label: "Δ", tone: "accent", ms: 700 })));
        })));
        k.tone(primary, "bad");
        stat.textContent = "3 writes → 1 primary (and every replica) · 3 reads → spread out"; stat.style.fill = k.colors.warn;
        k.say("Write-bound? Replicas won’t help: <b>shard</b>.");
        await k.sleep(1600);
        k.done();
      });
    }
  },

  play: {
    title: "Read Router",
    goal: "Send each read to the <b>primary</b> or the <b>replica</b> (click one). Stale data where freshness matters costs points; needless primary reads fill up the primary, which also has to take every write.",
    build(stage, k) {
      const TOTAL = 16;
      const PEOPLE = k.shuffle(["Asha", "Ravi", "Meera", "Tom", "Li", "Sara", "Omar", "Ana", "Kofi", "Yuki"]);
      const RELAXED = ["scrolls the product list", "opens last month’s sales report", "reads a blog post", "browses other people’s reviews", "views the public leaderboard"];
      const STRICT = ["checkout: reads stock before charging the card", "transfer: reads the balance before moving money", "admin: reads an order before refunding it"];
      const OWN = [["reloads their profile", "edited it"], ["opens their cart", "added an item"], ["opens their order list", "placed an order"], ["views the thread", "posted a comment"], ["opens their settings", "changed a setting"], ["checks their address", "updated it"]];
      const r1 = v => Math.round(v * 10) / 10;

      const kinds = k.shuffle([...Array(5).fill("relaxed"), ...Array(3).fill("strict"), ...Array(4).fill("ownFresh"), ...Array(4).fill("ownOld")]);
      const spikes = new Set([k.randInt(4, 7), k.randInt(10, 13)]);
      const reqs = kinds.map((kind, i) => {
        const lag = r1(spikes.has(i) ? k.rand(3.5, 6) : k.rand(0.3, 1.6));
        const who = PEOPLE[i % PEOPLE.length];
        if (kind === "relaxed") return { kind, who, lag, act: k.pick(RELAXED), info: "a few seconds stale is fine" };
        if (kind === "strict") return { kind, who, lag, act: k.pick(STRICT), info: "must see the latest value" };
        const [act, did] = k.pick(OWN);
        const since = kind === "ownFresh" ? Math.max(0.1, r1(lag * k.rand(0.2, 0.7))) : r1(lag + k.rand(0.6, 3));
        return { kind: "own", who, lag, act, since, info: `${did} ${since.toFixed(1)} s ago` };
      });
      const needsPrimary = q => q.kind === "strict" || (q.kind === "own" && q.since < q.lag);

      const svg = k.svg(760, 320, { label: "A read request on the left; a primary and a replica on the right" });
      stage.append(svg);
      const CARD = { x: 150, y: 160 }, PRI = { x: 500, y: 78 }, REP = { x: 500, y: 238 };
      k.line(svg, { x: 280, y: 160 }, PRI, { dashed: true });
      k.line(svg, { x: 280, y: 160 }, REP, { dashed: true });
      k.line(svg, PRI, REP, { tone: "accent", arrow: true });
      k.text(svg, 512, 162, "async log", { size: 11, tone: "accent", anchor: "start" });
      const pri = k.box(svg, { ...PRI, w: 210, h: 62, label: "Primary", icon: "🗄️", sub: "always fresh · takes all writes", size: 13.5 });
      const rep = k.box(svg, { ...REP, w: 210, h: 62, label: "Replica", icon: "📄", sub: "lag 0.0 s", size: 13.5 });
      const load = k.meter(svg, { x: 612, y: 74, w: 130, max: 100, value: 20, tone: "good", label: "primary load" });
      const lagM = k.meter(svg, { x: 612, y: 234, w: 130, max: 6, value: 0, tone: "good", label: "replication lag" });
      const cardG = k.s("g"); svg.append(cardG);
      const fb = k.text(svg, 150, 290, "", { size: 12.5, weight: 700 });

      let i = 0, score = 0, loadV = 20, waiting = false, stale = 0;
      function clickable(b, label, fn) {
        b.style.cursor = "pointer";
        b.setAttribute("tabindex", 0); b.setAttribute("role", "button"); b.setAttribute("aria-label", label);
        b.addEventListener("click", () => k.run(fn));
        b.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); k.run(fn); } });
      }
      clickable(pri, "Send this read to the primary", () => route("primary"));
      clickable(rep, "Send this read to the replica", () => route("replica"));

      function hud() { k.hud({ Read: `${Math.min(i + 1, TOTAL)} / ${TOTAL}`, Score: score, "Stale reads": stale }); }
      function setLoad(v) { loadV = k.clamp(v, 0, 100); load.set(loadV, loadV >= 80 ? "bad" : loadV >= 55 ? "warn" : "good"); }

      async function show() {
        hud();
        if (i >= TOTAL) return end();
        const q = reqs[i];
        rep.sub.textContent = `lag ${q.lag.toFixed(1)} s`;
        lagM.set(q.lag, q.lag >= 3 ? "bad" : q.lag >= 1 ? "warn" : "good");
        k.tone(rep, q.lag >= 3 ? "warn" : "neutral");
        if (q.lag >= 3) k.toast("Bulk import running: replica lag spikes", "warn");
        cardG.replaceChildren();
        cardG.append(k.s("rect", { x: -128, y: -58, width: 256, height: 116, rx: 12, fill: "surface", stroke: "accent", "stroke-width": 2 }));
        k.text(cardG, -114, -36, `READ ${i + 1}`, { size: 11, anchor: "start", tone: "muted", weight: 700 });
        k.text(cardG, 0, -12, q.who, { size: 15, weight: 700 });
        const words = [];
        for (const w of q.act.split(" ")) {
          const last = words.length - 1;
          if (last >= 0 && (words[last] + " " + w).length <= 34) words[last] += " " + w; else words.push(w);
        }
        words.forEach((w, j) => k.text(cardG, 0, 8 + j * 16, w, { size: 12.5 }));
        k.text(cardG, 0, 8 + words.length * 16 + 6, q.info, { size: 12.5, weight: 700, tone: q.kind === "relaxed" ? "good" : q.kind === "strict" ? "bad" : "accent" });
        k.place(cardG, { tx: CARD.x - 40, ty: CARD.y, scale: 1 });
        cardG.setAttribute("opacity", 0);
        await k.tween(cardG, { tx: CARD.x, opacity: 1 }, 350, k.ease.out);
        k.say(q.kind === "own"
          ? `${q.who} reads their own recent change. Has the replica had time to receive it? Compare with the <b>replica lag</b>.`
          : "Primary or replica?");
        waiting = true;
      }

      async function route(to) {
        if (!waiting) return;
        waiting = false;
        const q = reqs[i], need = needsPrimary(q);
        const target = to === "primary" ? PRI : REP, box = to === "primary" ? pri : rep;
        setLoad(loadV - 10);
        await k.packet(svg, { x: 280, y: 160 }, target, { r: 9, label: "R", ms: 450 });
        let pts, tone, msg;
        if (to === "replica" && need) {
          pts = -10; tone = "bad"; stale++;
          fb.textContent = "✗ stale read: old data shown";
          msg = q.kind === "strict"
            ? "The replica can be behind, and this read <b>must</b> see the latest value. Reads that decide money or stock go to the primary."
            : `Stale! ${q.who} wrote ${q.since.toFixed(1)} s ago but the replica is ${q.lag.toFixed(1)} s behind, so their own change is missing.`;
        } else if (to === "replica") {
          pts = 10; tone = "good";
          fb.textContent = "✓ replica: fresh enough";
          msg = q.kind === "own"
            ? `Right: ${q.who} wrote ${q.since.toFixed(1)} s ago and the lag is only ${q.lag.toFixed(1)} s, so the replica already has the change.`
            : "Right: slightly stale data is fine here, and the replica soaks up the read.";
        } else if (need) {
          pts = 10; tone = "good"; setLoad(loadV + 12);
          fb.textContent = "✓ primary: guaranteed fresh";
          msg = q.kind === "strict" ? "Right: this read must be exact, so it goes to the primary." : `Right: the change (${q.since.toFixed(1)} s ago) hasn’t reached the replica yet (lag ${q.lag.toFixed(1)} s). Read-your-own-writes.`;
        } else {
          pts = q.kind === "own" ? 3 : 0; tone = "warn"; setLoad(loadV + 25);
          fb.textContent = "~ correct data, wasted primary capacity";
          msg = q.kind === "own"
            ? `Safe, but the replica had caught up (${q.since.toFixed(1)} s > ${q.lag.toFixed(1)} s lag). The primary’s capacity is precious: it takes every write.`
            : "Correct data, but this read didn’t need the primary. Every unneeded primary read takes capacity away from writes.";
        }
        k.tone(box, tone);
        await k.packet(svg, target, { x: 280, y: 160 }, { r: 9, tone, ms: 400 });
        score += pts;
        fb.style.fill = k.colors[tone];
        k.float(svg, CARD.x, CARD.y - 70, pts > 0 ? `+${pts}` : pts < 0 ? `${pts}` : "+0", tone);
        k.say(msg);
        if (loadV >= 100) {
          score -= 15; setLoad(55);
          k.toast("Primary overloaded: writes stall (−15)", "bad", 1800);
          k.say(msg + " <b>The primary overloaded</b>: too many reads were sent to it.");
        }
        i++; hud();
        await k.sleep(tone === "good" ? 1500 : 3000);
        k.tone(box, "neutral"); k.tone(rep, "neutral"); fb.textContent = "";
        await show();
      }

      function end() {
        const text = `Score <b>${score}</b> of 160 with ${stale} stale read${stale === 1 ? "" : "s"}. Replicas take reads that tolerate a little lag; reads of your own fresh write (younger than the lag) and reads that must be exact go to the primary.`;
        if (score < 50) k.lose(text + " Compare “wrote X s ago” with the replica lag on every own-data read.");
        else k.win({ stars: k.starsFor(score, 95, 135), text });
      }

      setLoad(20);
      k.run(show);
    }
  }
});
