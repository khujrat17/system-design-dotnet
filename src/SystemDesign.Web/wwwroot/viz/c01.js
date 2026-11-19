"use strict";
/* Concept 1 · How to approach any design. Watch: the 8-step loop on a URL shortener, after a rushed
   "boxes first" attempt falls apart. Play: Interview Clock (pick the next move under a 45-minute budget). */
(function () {
  const NAMES = ["Functional reqs", "Non-functional reqs", "Estimate", "API", "Data model", "High-level diagram", "Deep dive", "Bottlenecks"];

  /** Make an SVG element behave like a button (mouse, Enter, Space). */
  function clickable(el, label, fn) {
    el.setAttribute("tabindex", 0);
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", label);
    el.style.cursor = "pointer";
    el.addEventListener("click", fn);
    el.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } });
  }

  Lab.define(1, {
    watch: {
      title: "Why the boxes-first answer failed",
      intro: "Watch a rushed URL-shortener answer fall apart, then the same question done in order, one step at a time.",
      steps: [
        { label: "Boxes first", tag: "problem", title: "Drawing before thinking",
          body: "<p>The interviewer says “design a URL shortener”. The candidate jumps straight to step 6 and draws <b>Kafka, 16 shards and 12 microservices</b>.</p><p>Then the obvious question: <b>how many redirects per second, and is it read-heavy?</b> The candidate has no idea.</p>",
          idea: "Boxes drawn before you know the numbers are guesses, and guesses can’t be defended.",
          changed: ["5 boxes on the board, all turned red", "Writes/s and reads/s still unknown"] },
        { label: "Requirements", tag: "technique", title: "Steps 1–2: what, and how well",
          body: "<p><b>Functional</b>: three to five verbs. Create a short link, redirect, show the click count.</p><p><b>Non-functional</b>: how big, how fast, how reliable. Here it’s <b>read-heavy (100:1)</b>, p99 under 50 ms, 99.9% uptime, and stale click counts are fine.</p>",
          idea: "Always ask for the read/write ratio. It decides where the design effort goes.",
          changed: ["The rushed boxes are wiped", "Steps 1 and 2 turn green"] },
        { label: "Estimate", tag: "technique", title: "Step 3: the numbers",
          body: "<p>100M new links a month ÷ 2.6M seconds ≈ <b>40 writes/s</b>. Reads are 100× that: ≈ <b>4,000 reads/s</b>.</p><p>Storage: 6B links × 500 B ≈ <b>3 TB over 5 years</b>.</p>",
          idea: "40 writes/s fits on one primary database; 4,000 reads/s calls for a cache. The numbers chose that, not taste.",
          changed: ["Writes/s: 40", "Reads/s: 4,000", "Storage: ~3 TB"] },
        { label: "API & data", tag: "technique", title: "Steps 4–5: contract, then data model",
          body: "<p>Pin down the <b>API</b> before any boxes: <code>POST /links</code> returns a code, and <code>GET /{code}</code> answers 302.</p><p>The <b>data model</b> follows the access pattern: every read is “look up by code”, so <code>Code</code> is the primary key.</p>",
          idea: "The API and the access pattern shape the data model, not the other way round.",
          changed: ["Steps 4 and 5 turn green", "<code>Link(Code PK, LongUrl, …)</code> on the board"] },
        { label: "Diagram", tag: "concept", title: "Step 6: now draw the boxes",
          body: "<p>Client → CDN → load balancer → API → <b>Redis</b> → database. Every box is justified by a number above it.</p><p>A redirect for <code>GET /x7Kp2</code> is answered from Redis, not the database.</p>",
          idea: "Same whiteboard, fewer boxes, and each one has a reason.",
          changed: ["6 boxes on the board", "Redirect served as a cache HIT"] },
        { label: "Async clicks", tag: "trade-off", title: "Count clicks off the hot path",
          body: "<p>Counting a click shouldn’t slow the redirect. The API drops an event on a <b>queue</b>, and an analytics worker counts it later.</p><p>That’s only allowed because step 2 said <b>stale counts are OK</b>.</p>",
          idea: "Non-functional requirements give you permission to make things asynchronous.",
          changed: ["Queue and Analytics added", "Click event flows API → queue → analytics"] },
        { label: "Deep dive", tag: "technique", title: "Step 7: the hardest part",
          body: "<p>Pick the riskiest piece and go deep. Here it’s <b>unique short codes</b>.</p><p>Each node reserves a <b>counter range</b>, then encodes the number in <b>base62</b>. No collisions, and no coordination per request.</p>",
          idea: "Spend your deep-dive minutes where the design could actually break.",
          changed: ["Step 7 turns green", "ID scheme written on the board"] },
        { label: "Break it", tag: "failure", title: "Step 8: what if the database dies?",
          body: "<p>Try to break your own design. The database goes down.</p><p>Hot links are still served from <b>Redis</b>, and the <b>queue</b> holds clicks until analytics catches up.</p>",
          idea: "Finding your own bottlenecks before the interviewer does is the strongest signal you can give.",
          changed: ["Database marked 💥", "Redirect still served from Redis"] },
        { label: "The loop", tag: "result", title: "Eight steps, in order",
          body: "<p>Requirements → numbers → API → data → boxes → deep dive → break it. Each step feeds the next.</p><p>Same question as the first attempt, but now <b>every box can be defended</b>.</p>",
          idea: "Never draw boxes (step 6) before you know the numbers (steps 2–3). The numbers pick the architecture.",
          changed: ["All 8 steps green", "Steps done: 8 / 8"] }
      ],
      learn: [
        { text: "Why drawing boxes first fails", step: 0 },
        { text: "How requirements turn into QPS and storage", step: 2 },
        { text: "Why every box needs a number behind it", step: 4 },
        { text: "How to deep-dive and stress-test a design", step: 7 }
      ],
      build(stage, k) {
        const svg = k.svg(760, 340, { label: "Eight design steps on the left, a whiteboard for a URL shortener on the right" });
        stage.append(svg);
        const slotY = i => 44 + i * 37;

        svg.append(k.s("rect", { x: 200, y: 12, width: 548, height: 320, rx: 14, fill: "paper", stroke: "line" }));
        k.text(svg, 474, 34, "Whiteboard · “Design a URL shortener”", { size: 12, tone: "muted" });
        const stepBoxes = NAMES.map((n, i) => k.box(svg, { x: 98, y: slotY(i), w: 178, h: 30, label: `${i + 1}. ${n}`, tone: "muted", size: 12 }));
        const wb = k.s("g"); svg.append(wb);

        let wps = "?", rps = "?", store = "?", boxes = 0, done = 0;
        const metrics = () => k.hud({ "Writes/s": wps, "Reads/s": rps, "Storage (5 yr)": store, "Boxes on board": boxes, "Steps done": `${done} / 8` });
        metrics();

        function note(y, str, { tone = "ink", mono = false } = {}) {
          const t = k.text(wb, 216, y, str, { size: 12, anchor: "start", tone, mono });
          t.setAttribute("opacity", 0);
          return k.tween(t, { opacity: 1 }, 450).then(() => t);
        }
        async function begin(i, html) {
          k.tone(stepBoxes[i], "accent");
          k.say(html);
          await k.pulse(stepBoxes[i]);
        }
        function finish(i) {
          k.tone(stepBoxes[i], "good");
          done++; metrics();
        }
        async function pop(g) {
          k.place(g, { scale: 0.2 });
          g.setAttribute("opacity", 0);
          await k.tween(g, { scale: 1, opacity: 1 }, 380, k.ease.back);
        }

        k.run(async () => {
          // 1 · boxes first
          await k.step();
          k.say("The candidate starts drawing boxes <b>immediately</b>…");
          k.tone(stepBoxes[5], "warn");
          await k.sleep(900);
          const junk = [["Kafka", 300, 110], ["16 DB shards", 470, 88], ["12 microservices", 640, 120], ["GraphQL gateway", 360, 210], ["Cassandra ring", 560, 230]];
          const rush = junk.map(([label, x, y]) => {
            const g = k.box(wb, { x, y, w: 140, h: 40, label, tone: "warn", size: 12.5 });
            g.setAttribute("opacity", 0);
            return g;
          });
          for (const g of rush) { await pop(g); boxes++; metrics(); await k.sleep(200); }
          await k.sleep(700);
          const ask = k.text(wb, 474, 300, "Interviewer: “How many redirects per second? Mostly reads?”", { size: 13, weight: 700, tone: "lesson" });
          k.say("“How much traffic?” No idea.");
          await k.sleep(1500);
          for (const g of rush) {
            k.tone(g, "bad");
            k.float(wb, g._tf.tx, g._tf.ty - 26, "?", "bad");
            await k.sleep(220);
          }
          k.say("Every box is now a <b>guess</b>.");
          await k.sleep(1200);

          // 2 · requirements
          await k.step();
          await Promise.all(rush.map(g => k.tween(g, { opacity: 0, scale: 0.6 }, 450)));
          ask.remove(); rush.forEach(g => g.remove());
          boxes = 0; metrics();
          k.tone(stepBoxes[5], "muted");
          await begin(0, "Step 1 · <b>functional</b>: what must it do?");
          await note(62, "1 · create a short link · redirect · show the click count");
          finish(0);
          await k.sleep(1200);
          await begin(1, "Step 2 · <b>non-functional</b>: how big, how fast, how stale?");
          await note(84, "2 · read-heavy 100:1 · p99 < 50 ms · 99.9% up · stale counts OK");
          finish(1);
          await k.sleep(800);

          // 3 · estimate
          await k.step();
          await begin(2, "Step 3 · <b>estimate</b>: 100M links a month ÷ 2.6M s.");
          const est = await note(106, "3 · ≈ 40 writes/s", { mono: true });
          wps = "40"; metrics();
          await k.sleep(1200);
          k.say("Reads are 100× writes…");
          for (const v of ["400", "1,600", "4,000"]) { est.textContent = `3 · ≈ 40 writes/s · ${v} reads/s`; rps = v; metrics(); await k.sleep(280); }
          await k.sleep(500);
          est.textContent = "3 · ≈ 40 writes/s · 4,000 reads/s · ~3 TB in 5 years";
          store = "~3 TB"; metrics();
          finish(2);
          k.say("One primary DB for writes, a <b>cache</b> for reads.");
          await k.sleep(1500);

          // 4 · API and data model
          await k.step();
          await begin(3, "Step 4 · <b>API</b>: the contract before any boxes.");
          await note(128, "4 · POST /links {url} → {code}   ·   GET /{code} → 302", { mono: true });
          finish(3);
          await k.sleep(1200);
          await begin(4, "Step 5 · <b>data model</b>: every read is a lookup by code.");
          await note(150, "5 · Link(Code PK, LongUrl, CreatedAt, ExpiresAt) · key lookup only", { mono: true });
          finish(4);
          await k.sleep(800);

          // 5 · diagram
          await k.step();
          await begin(5, "Step 6 · <b>high-level diagram</b>, box by box.");
          const X = [256, 340, 424, 508, 592, 676], Y = 196;
          const names = ["Client", "CDN", "LB", "API", "Redis", "DB"];
          const P = X.map(x => ({ x, y: Y }));
          for (let i = 0; i < X.length - 1; i++) k.line(wb, P[i], P[i + 1], { dashed: true });
          const nodes = names.map((n, i) => {
            const g = k.box(wb, { x: X[i], y: Y, w: 76, h: 34, label: n, size: 12.5 });
            g.setAttribute("opacity", 0);
            return g;
          });
          for (const g of nodes) { await pop(g); boxes++; metrics(); await k.sleep(120); }
          await k.sleep(600);
          k.say("<code>GET /x7Kp2</code> is answered from <b>Redis</b>.");
          for (let i = 0; i < 4; i++) await k.packet(wb, P[i], P[i + 1], { r: 8, ms: 320 });
          k.tone(nodes[4], "good"); k.float(wb, P[4].x, P[4].y - 26, "HIT", "good");
          for (let i = 4; i > 0; i--) await k.packet(wb, P[i], P[i - 1], { r: 8, ms: 260, tone: "good" });
          k.tone(nodes[4], "neutral");
          await k.sleep(600);

          // 6 · async clicks
          await k.step();
          const Q = { x: 508, y: 256 }, A = { x: 624, y: 256 };
          k.line(wb, P[3], Q, { dashed: true }); k.line(wb, Q, A, { dashed: true });
          const queue = k.box(wb, { ...Q, w: 76, h: 32, label: "Queue", size: 12.5 }); queue.setAttribute("opacity", 0);
          const analytics = k.box(wb, { ...A, w: 104, h: 32, label: "Analytics", size: 12.5 }); analytics.setAttribute("opacity", 0);
          await pop(queue); await pop(analytics);
          boxes += 2; metrics();
          finish(5);
          k.say("The click goes API → queue → analytics, off the hot path.");
          await k.sleep(500);
          await k.packet(wb, P[3], Q, { r: 7, tone: "lesson", ms: 400 });
          await k.packet(wb, Q, A, { r: 7, tone: "lesson", ms: 500 });
          await k.packet(wb, P[3], Q, { r: 7, tone: "lesson", ms: 400 });
          await k.packet(wb, Q, A, { r: 7, tone: "lesson", ms: 500 });
          await k.sleep(600);

          // 7 · deep dive
          await k.step();
          await begin(6, "Step 7 · <b>deep dive</b>: unique short codes.");
          await note(298, "7 · IDs: each node reserves a counter range → base62 → no collisions");
          finish(6);
          await k.sleep(1500);

          // 8 · break it
          await k.step();
          await begin(7, "Step 8 · <b>try to break it</b>: the database dies.");
          k.tone(nodes[5], "bad"); nodes[5].label.textContent = "DB 💥";
          await k.sleep(900);
          for (let i = 0; i < 4; i++) await k.packet(wb, P[i], P[i + 1], { r: 8, ms: 260 });
          k.tone(nodes[4], "good"); k.float(wb, P[4].x, P[4].y - 26, "HIT", "good");
          for (let i = 4; i > 0; i--) await k.packet(wb, P[i], P[i - 1], { r: 8, ms: 220, tone: "good" });
          k.tone(nodes[4], "neutral");
          await note(318, "8 · DB down → hot links served from Redis · analytics lag is fine", { tone: "good" });
          finish(7);
          k.say("Popular links keep working from the cache.");
          await k.sleep(1500);
          k.tone(nodes[5], "neutral"); nodes[5].label.textContent = "DB";

          // 9 · the loop
          await k.step();
          k.say("The whole loop, in order.");
          for (const s of stepBoxes) await k.pulse(s);
          k.say("<b>Numbers first, boxes second.</b>");
          await k.sleep(1500);
          k.done();
        });
      }
    },

    play: {
      title: "Interview Clock",
      goal: "You have 45 interview minutes to design a URL shortener. <b>Click the move that should come next.</b> Out-of-order moves and over-engineering traps cost minutes and points.",
      build(stage, k) {
        const MOVES = [
          { label: "What must it do?", sub: "shorten · redirect · stats", early: "" },
          { label: "Scale & ratio?", sub: "reads vs writes, p99, uptime", early: "Scale questions only make sense once you know what the features are." },
          { label: "Estimate load", sub: "QPS, storage per year", early: "You can’t estimate before you know the user count and read/write ratio." },
          { label: "Define the API", sub: "POST /links · GET /{code}", early: "Pin down requirements and numbers before the contract." },
          { label: "Data model", sub: "Link(Code, LongUrl, …)", early: "The data model follows the API’s access patterns." },
          { label: "Draw the boxes", sub: "LB → API → cache → DB", early: "Boxes drawn before the numbers and the API are guesses." },
          { label: "Deep dive: IDs", sub: "base62 of a counter", early: "Go deep only once the whole picture is on the board." },
          { label: "Try to break it", sub: "DB down? hot links?", early: "You can’t find bottlenecks in a design you haven’t drawn yet." }
        ];
        const TRAPS = [
          { label: "Shard into 16 DBs", sub: "before any numbers", msg: "Over-engineering: 40 writes/s and 3 TB fit on one primary. Numbers first, then decide." },
          { label: "Pick Kafka first", sub: "everyone uses it", msg: "A tool is not a requirement. Pick technology when a need appears in the design." },
          { label: "Start coding", sub: "write the controller", msg: "Code comes after the design. That burned minutes you needed for the trade-offs." }
        ];
        const RATE = 45 / 75;                  // interview minutes per real second (45 minutes = 75 s)
        let minutes = 45, score = 0, next = 0, mistakes = 0, over = false, busy = false;

        const svg = k.svg(760, 330, { label: "Your interview timeline on the left, possible next moves on the right" });
        stage.append(svg);
        const slotY = i => 44 + i * 37;
        k.text(svg, 98, 20, "Your interview so far", { size: 12, tone: "muted" });
        k.text(svg, 488, 24, "Design a URL shortener · click the next move", { size: 12, tone: "muted" });
        const mood = k.text(svg, 735, 28, "🙂", { size: 20 });
        const slots = NAMES.map((n, i) => k.box(svg, { x: 98, y: slotY(i), w: 178, h: 30, label: `${i + 1}. ?`, tone: "muted", size: 12 }));

        const cols = [318, 488, 658], rows = [64, 128, 192, 256];
        const cards = k.shuffle([
          ...MOVES.map((m, i) => ({ ...m, kind: "step", idx: i })),
          ...TRAPS.map(t => ({ ...t, kind: "trap" }))
        ]);
        cards.forEach((c, n) => {
          const x = cols[n % 3], y = rows[Math.floor(n / 3)];
          c.x = x; c.y = y;
          c.g = k.box(svg, { x, y, w: 160, h: 52, label: c.label, sub: c.sub, size: 13.5 });
          clickable(c.g, `${c.label}: ${c.sub}`, () => k.run(() => pick(c)));
        });

        function hud() {
          k.hud({ Score: score, Clock: `${Math.max(0, Math.ceil(minutes))} min left`, Step: `${next} / 8` });
        }
        function frown() {
          mood.textContent = "🤨";
          k.after(1600, () => { if (!over) mood.textContent = "🙂"; });
        }
        async function shake(c) {
          k.tone(c.g, "bad");
          for (const dx of [7, -7, 5, -3, 0]) {
            if (c.gone) return;
            await k.tween(c.g, { tx: c.x + dx }, 55, k.ease.linear);
          }
          await k.sleep(500);
          if (!c.gone) k.tone(c.g, "neutral");
        }

        async function pick(c) {
          if (over || busy || c.gone) return;
          if (c.kind === "step" && c.idx === next) {
            busy = true; c.gone = true;
            score += 100;
            k.float(svg, c.x, c.y - 30, "+100", "good");
            k.tone(c.g, "good");
            const i = next;
            next++;
            hud();
            k.say(`✓ <b>${c.label}</b>. ${i < 7 ? "What comes next?" : "That’s the full loop."}`);
            await k.tween(c.g, { tx: 98, ty: slotY(i), scale: 0.45, opacity: 0 }, 420, k.ease.inOut);
            c.g.remove();
            slots[i].label.textContent = `${i + 1}. ${NAMES[i]}`;
            k.tone(slots[i], "good");
            busy = false;
            await k.pulse(slots[i]);
            if (next === 8) end();
          } else if (c.kind === "step") {
            mistakes++; score -= 40; minutes -= 4; hud(); frown();
            k.float(svg, c.x, c.y - 30, "−4 min", "bad");
            k.say(`<b>${c.label}</b> is too early. ${c.early}`);
            await shake(c);
          } else {
            mistakes++; score -= 60; minutes -= 6; hud(); frown();
            c.gone = true;
            k.float(svg, c.x, c.y - 30, "−6 min", "bad");
            k.say(`<b>Trap:</b> ${c.msg}`);
            k.tone(c.g, "bad");
            await k.tween(c.g, { opacity: 0, scale: 0.7 }, 500);
            c.g.remove();
          }
        }

        function end() {
          if (over) return;
          over = true;
          const left = Math.max(0, Math.round(minutes));
          const bonus = left * 5, total = score + bonus;
          const text = `All 8 steps with <b>${left} minutes</b> to spare and <b>${mistakes}</b> detour${mistakes === 1 ? "" : "s"} (score ${score} + time bonus ${bonus} = ${total}). ` +
            "Each step feeds the next: requirements give the numbers, the numbers pick the architecture, and only then do boxes make sense.";
          k.win({ stars: k.starsFor(total, 680, 800), text });
        }

        k.loop(dt => {
          if (over) return false;
          minutes -= dt * RATE;
          hud();
          if (minutes <= 0) {
            over = true;
            k.lose(`The interview ended at step ${next + 1} of 8 (“${NAMES[next]}”). Detours and traps ate the clock. Follow the loop: requirements → estimate → API → data → boxes → deep dive → break it.`);
            return false;
          }
        });
        hud();
        k.say("The interviewer is waiting. Which move comes <b>first</b>?");
      }
    }
  });
})();
