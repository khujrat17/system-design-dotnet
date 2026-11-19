"use strict";
/* Concept 26 · Case study: news feed. Watch: fan-out on write vs fan-out on read, a celebrity breaking push,
   and the hybrid fix. Play: Feed Ops (choose push or pull per account tier to keep writes and reads within budget). */
(function () {
  function clickable(el, label, fn) {
    el.setAttribute("tabindex", 0);
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", label);
    el.style.cursor = "pointer";
    el.addEventListener("click", fn);
    el.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } });
  }
  const short = n => n >= 1e6 ? `${n / 1e6}M` : n >= 1e3 ? `${n / 1e3}k` : String(n);

  Lab.define(26, {
    watch: {
      title: "The celebrity who broke the feed",
      intro: "Watch where the work happens: when someone posts, or when someone opens their feed.",
      steps: [
        { label: "The question", tag: "problem", title: "Build the feed on write or on read?",
          body: "<p>Ravi's feed shows recent posts from the <b>300 accounts</b> he follows. Asha posts, and her post body is stored once in the <b>posts store</b>, by post id.</p><p>The core question: do we assemble feeds when someone <b>posts</b>, or when someone <b>reads</b>?</p>",
          idea: "Every feed design is a decision about where to put the work: write time or read time.",
          changed: ["p1 stored in the posts store"] },
        { label: "Push", tag: "technique", title: "Fan-out on write",
          body: "<p>A queue worker pushes the post <b>id</b> (not the body) into the feed list of <b>every follower</b>.</p><p>Asha has 120 followers, so that is <b>120 small writes</b> (5 shown). Posting stays fast because workers do it in the background.</p>",
          idea: "Push pays at write time, once per follower.",
          changed: ["p1 lands in 5 feed lists", "Feed writes: 120"] },
        { label: "Fast read", tag: "result", title: "The feed is already built",
          body: "<p>When Ravi opens the app, his feed is a <b>Redis list of post ids</b>, newest first. One read of one list, about <b>5 ms</b>.</p><p>Lists are trimmed to ~800 ids; post bodies are cached separately.</p>",
          idea: "Reads outnumber writes by far, so making reads cheap is usually the right call.",
          changed: ["Reads per open: 1", "Feed open: ~5 ms"] },
        { label: "Pull", tag: "trade-off", title: "Fan-out on read",
          body: "<p>Pull flips it. Asha posts p2 and it is only stored: <b>1 write</b>, no fan-out.</p><p>But every feed open must fetch recent posts from <b>all 300 accounts</b> Ravi follows, then merge and sort: about <b>150 ms</b>, repeated for every reader, every open.</p>",
          idea: "Pull makes writes cheap and reads slow. Since reads dominate, pure pull is expensive.",
          changed: ["Feed writes +1", "Reads per open: 300, ~150 ms"] },
        { label: "Celebrity", tag: "failure", title: "One post, 2,000,000 writes",
          body: "<p>Back to push. Now <b>Star</b>, with <b>2,000,000 followers</b>, posts.</p><p>One post becomes <b>2 million feed writes</b>. The fan-out queue backs up for minutes. The C# demo: 3 celebrity posts make <b>6,000,000</b> of a minute's writes.</p>",
          idea: "Push cost scales with follower count, and follower counts are wildly skewed.",
          changed: ["Feed writes jump by 2,000,000", "Queue backlog goes red"] },
        { label: "Stale feeds", tag: "failure", title: "Everyone waits behind the celebrity",
          body: "<p>Asha posts p3. It lands in the same queue, <b>behind</b> Star's 2 million writes.</p><p>Every follower of every account now sees feeds about <b>10 minutes</b> stale.</p>",
          idea: "A shared queue turns one hot account into everyone's problem.",
          changed: ["p3 stuck in the queue", "Feed delay: ~10 min"] },
        { label: "Hybrid", tag: "fix", title: "Push for most, pull for celebrities",
          body: "<p>Accounts over a threshold (<b>10,000 followers</b> in the C# demo) are <b>never fanned out</b>. Their posts are pulled at read time.</p><p>The backlog drains, Asha's p3 reaches her followers, and Star's next post is just <b>1 write</b>.</p>",
          idea: "Treat the few huge accounts differently from the long tail.",
          changed: ["Backlog drains to 0", "s2: 1 write, no fan-out"] },
        { label: "Merge", tag: "result", title: "Precomputed list + a few pulls",
          body: "<p>Ravi opens his app: it reads his <b>precomputed list</b> and <b>pulls</b> recent posts of the few celebrities he follows, then merges by time: about <b>8 ms</b>.</p><p>Also: skip inactive followers, trim lists to ~800 ids, paginate with a cursor.</p>",
          idea: "Cheap writes for celebrities, fast reads for everyone.",
          changed: ["Feed: s2 · p3 · s1 · p1", "Reads per open: 1 list + 1 celeb, ~8 ms"] }
      ],
      learn: [
        { text: "Fan-out on write (push) and its fast reads", step: 2 },
        { text: "Fan-out on read (pull) and its slow reads", step: 3 },
        { text: "Why celebrities break pure push", step: 5 },
        { text: "The hybrid push/pull design", step: 7 }
      ],
      build(stage, k) {
        const svg = k.svg(760, 340, { label: "Authors, a posts store, fan-out workers, per-follower feed lists and a reader's app" });
        stage.append(svg);
        const P = { asha: { x: 80, y: 62 }, star: { x: 90, y: 262 }, posts: { x: 270, y: 62 }, workers: { x: 270, y: 170 }, phone: { x: 650, y: 292 } };
        const NAMES = ["Ravi", "Mei", "Omar", "Lena", "Kofi"];
        const rowY = i => 40 + i * 42;
        k.line(svg, P.asha, P.posts, { dashed: true });
        k.line(svg, P.posts, P.workers, { dashed: true });
        const starLine = k.line(svg, P.star, P.posts, { dashed: true });
        starLine.setAttribute("opacity", 0);
        NAMES.forEach((_, i) => k.line(svg, { x: P.workers.x + 75, y: P.workers.y }, { x: 428, y: rowY(i) }, { dashed: true }));
        k.line(svg, { x: 470, y: rowY(0) }, P.phone, { dashed: true });

        const asha = k.box(svg, { ...P.asha, label: "Asha", icon: "🧑", sub: "120 followers", w: 130, h: 50 });
        const star = k.box(svg, { ...P.star, label: "Star", icon: "⭐", sub: "2,000,000 followers", w: 168, h: 50 });
        star.setAttribute("opacity", 0);
        const posts = k.box(svg, { ...P.posts, label: "Posts store", icon: "📝", sub: "body by post id", w: 150, h: 50 });
        const workers = k.box(svg, { ...P.workers, label: "Fan-out workers", icon: "⚙️", sub: "fed by a queue", w: 150, h: 50 });
        const backlog = k.meter(svg, { x: 200, y: 214, w: 140, max: 100, value: 0, tone: "good", label: "queue backlog" });
        const lateText = k.text(svg, 270, 248, "", { size: 12, weight: 700, tone: "bad" });
        k.text(svg, 560, 14, "Feed lists in Redis: post IDs, newest first", { size: 11.5, tone: "muted", weight: 700 });
        const feeds = NAMES.map((n, i) => ({ box: k.box(svg, { x: 470, y: rowY(i), label: n, w: 84, h: 30, size: 12.5 }), chips: [] }));
        const phone = k.box(svg, { ...P.phone, label: "Ravi's app", icon: "📱", sub: "—", w: 170, h: 50 });
        const stats = k.text(svg, 285, 324, "", { size: 12.5, weight: 700 });
        let writes = 0, hudReads = "—", hudMs = "—", delay = "0 s";
        const metrics = () => k.hud({ "Reads per open": hudReads, "Feed open": hudMs, "Feed delay": delay, "Feed writes": k.fmt(writes) });
        const showStats = (reads, ms) => {
          stats.textContent = `writes ${k.fmt(writes)} · reads per open ${reads} · ${ms}`;
          if (reads !== "—") { hudReads = reads; hudMs = ms; }
          metrics();
        };
        showStats("—", "—");

        async function pushChip(i, label, tone = "accent") {
          const f = feeds[i];
          const moves = f.chips.map((c, j) => k.tween(c, { tx: 530 + (j + 1) * 30 }, 250));
          const d = k.dot(svg, 530, rowY(i), { r: 12, tone, label, size: 10 });
          d.setAttribute("opacity", 0);
          f.chips.unshift(d);
          if (f.chips.length > 6) f.chips.pop().remove();
          await Promise.all([...moves, k.tween(d, { opacity: 1 }, 250)]);
        }
        const fanOut = (label, tone, ms = 550) => Promise.all(NAMES.map((_, i) => k.sleep(i * 70).then(async () => {
          await k.packet(svg, { x: P.workers.x + 75, y: P.workers.y }, { x: 428, y: rowY(i) }, { r: 9, tone, ms });
          await pushChip(i, label, tone);
        })));

        k.run(async () => {
          /* ---- 1 · the question ---- */
          await k.step();
          k.say("Asha posts. The body is stored once, by post id.");
          await k.sleep(1200);
          k.tone(asha, "accent");
          await k.packet(svg, P.asha, P.posts, { label: "p1", r: 12, size: 10, ms: 700 });
          k.tone(asha, "neutral"); k.tone(posts, "accent");
          k.say("p1 is stored. Now: who builds Ravi's feed, and when?");
          await k.sleep(1600);

          /* ---- 2 · push ---- */
          await k.step();
          k.say("A worker pushes the post <b>id</b> into every follower's list.");
          await k.packet(svg, P.posts, P.workers, { r: 9, ms: 500 });
          k.tone(posts, "neutral"); k.tone(workers, "accent");
          await fanOut("p1", "accent");
          writes += 120; showStats("—", "—");
          k.tone(workers, "neutral");
          k.say("<b>120 writes</b>, done in the background.");
          await k.sleep(1400);

          /* ---- 3 · fast read ---- */
          await k.step();
          k.say("Ravi opens the app: one read of his list.");
          await k.sleep(800);
          await k.packet(svg, { x: 470, y: rowY(0) }, P.phone, { label: "p1", r: 12, size: 10, ms: 700, tone: "good" });
          phone.sub.textContent = "p1"; k.tone(phone, "good");
          showStats("1", "~5 ms");
          await k.sleep(1600);
          k.tone(phone, "neutral");

          /* ---- 4 · pull ---- */
          await k.step();
          k.say("Pull: p2 is only stored. <b>1 write</b>.");
          await k.packet(svg, P.asha, P.posts, { label: "p2", r: 12, size: 10, ms: 700 });
          writes += 1; showStats("—", "—");
          k.tone(posts, "accent");
          await k.sleep(1000);
          k.say("Ravi's open queries <b>all 300 accounts</b> he follows…");
          k.tone(phone, "warn");
          for (let n = 0; n < 6; n++) {
            k.packet(svg, P.phone, P.posts, { label: "?", r: 9, size: 9, ms: 600, tone: "warn" }).catch(() => {});
            await k.sleep(160);
          }
          await k.sleep(600);
          for (let n = 0; n < 6; n++) {
            k.packet(svg, P.posts, P.phone, { r: 7, ms: 600, tone: "warn" }).catch(() => {});
            await k.sleep(160);
          }
          await k.sleep(700);
          phone.sub.textContent = "merging 300 lists…";
          showStats("300", "~150 ms");
          await k.sleep(1600);
          phone.sub.textContent = "p2 · p1";
          k.say("…and merges them: <b>~150 ms</b>, on every open.");
          await k.sleep(1400);
          k.tone(phone, "neutral"); k.tone(posts, "neutral");

          /* ---- 5 · the celebrity ---- */
          await k.step();
          starLine.setAttribute("opacity", 1);
          await k.tween(star, { opacity: 1 }, 500);
          k.say("Back to push. <b>Star</b> (2,000,000 followers) posts.");
          await k.sleep(1000);
          k.tone(star, "accent");
          await k.packet(svg, P.star, P.posts, { label: "s1", r: 12, size: 10, ms: 700, tone: "lesson" });
          await k.packet(svg, P.posts, P.workers, { r: 9, ms: 500, tone: "lesson" });
          k.tone(workers, "bad");
          const start = writes;
          const burst = fanOut("s1", "lesson", 900);
          for (let i = 1; i <= 24; i++) {
            writes = start + Math.round(2e6 * i / 24); showStats("1", "~5 ms");
            backlog.set(Math.min(100, i * 5), i > 10 ? "bad" : "warn");
            await k.sleep(110);
          }
          await burst;
          k.say("One post became <b>2,000,000 writes</b>. The queue is backed up.");
          await k.sleep(1400);

          /* ---- 6 · stale feeds ---- */
          await k.step();
          k.say("Asha posts p3. It queues <b>behind</b> Star's writes…");
          k.tone(asha, "accent");
          await k.packet(svg, P.asha, P.posts, { label: "p3", r: 12, size: 10, ms: 600 });
          await k.packet(svg, P.posts, P.workers, { r: 9, ms: 400 });
          const stuck = k.dot(svg, P.workers.x - 40, P.workers.y + 2, { r: 12, tone: "accent", label: "p3", size: 10 });
          k.tone(asha, "neutral");
          await k.pulse(stuck, 2);
          lateText.textContent = "⏳ feeds ~10 min behind";
          delay = "~10 min"; metrics();
          k.say("Feeds are now ~10 minutes stale for everyone.");
          await k.sleep(1600);

          /* ---- 7 · hybrid ---- */
          await k.step();
          k.say("Star switches to <b>pull at read time</b>.");
          star.sub.textContent = "pulled at read time"; k.tone(star, "lesson");
          await k.sleep(1200);
          for (let i = 20; i >= 0; i--) { backlog.set(i * 5, i > 8 ? "warn" : "good"); await k.sleep(60); }
          lateText.textContent = "";
          delay = "0 s"; metrics();
          k.tone(workers, "accent");
          stuck.remove();
          await fanOut("p3", "accent", 450);
          writes += 120; showStats("—", "—");
          k.tone(workers, "neutral");
          k.say("Backlog gone: p3 reaches followers right away.");
          await k.sleep(1200);
          k.say("Star posts again: <b>1 write</b>, that's all.");
          await k.packet(svg, P.star, P.posts, { label: "s2", r: 12, size: 10, ms: 700, tone: "lesson" });
          writes += 1; showStats("—", "—");
          await k.sleep(1000);

          /* ---- 8 · merge on read ---- */
          await k.step();
          k.say("Ravi's open: his list plus a pull of Star's posts.");
          k.tone(phone, "accent");
          await Promise.all([
            k.packet(svg, { x: 470, y: rowY(0) }, P.phone, { label: "p3", r: 12, size: 10, ms: 800, tone: "good" }),
            k.packet(svg, P.posts, P.phone, { label: "s2", r: 12, size: 10, ms: 800, tone: "lesson" })
          ]);
          phone.sub.textContent = "s2 · p3 · s1 · p1"; k.tone(phone, "good");
          showStats("1 list + 1 celeb", "~8 ms");
          k.say("Merged by time in <b>~8 ms</b>.");
          await k.sleep(1600);
          k.done();
        });
      }
    },

    play: {
      title: "Feed Ops",
      goal: "Choose <b>PUSH</b> or <b>PULL</b> for each account tier (click a card). Keep feeds fresh (<b>fan-out delay ≤ 3 s</b>) and feed opens fast (<b>≤ 100 ms</b>) for as much of the 60 seconds as you can. Plan, then press Start.",
      build(stage, k) {
        const svg = k.svg(760, 340, { label: "Account tiers on the left, fan-out queue, posts store and feed API on the right" });
        stage.append(svg);
        const W = 2e6, DELAY_BUDGET = 3, READ_BUDGET = 100, BASE_READ = 10, PER_QUERY = 6, GAME = 60;
        const TIERS = [
          { name: "Everyday users", icon: "🙂", followers: 150, follows: 200, inflow: 400e3, every: 0.3 },
          { name: "Creators", icon: "🎨", followers: 40e3, follows: 30, inflow: 400e3, every: 0.7 },
          { name: "Journalists", icon: "📰", followers: 150e3, follows: 8, inflow: 300e3, every: 1.2 },
          { name: "Big brands", icon: "🏷️", followers: 2e6, follows: 5, every: 4, first: 3 },
          { name: "Celebrities", icon: "⭐", followers: 20e6, follows: 4, every: 5, first: 8 },
          { name: "Mega stars", icon: "🌟", followers: 100e6, follows: 2, every: 11, first: 16 }
        ];
        const Q = { queue: { x: 385, y: 70 }, feeds: { x: 610, y: 70 }, posts: { x: 385, y: 250 }, api: { x: 610, y: 190 }, readers: { x: 705, y: 296 } };
        k.line(svg, Q.queue, Q.feeds, { dashed: true });
        k.line(svg, Q.feeds, Q.api, { dashed: true });
        k.line(svg, Q.posts, Q.api, { dashed: true });
        k.line(svg, Q.readers, Q.api, { dashed: true });
        const queueB = k.box(svg, { ...Q.queue, label: "Fan-out queue", icon: "⚙️", w: 160, h: 44 });
        k.box(svg, { ...Q.feeds, label: "Feed lists", icon: "📋", w: 130, h: 44 });
        k.box(svg, { ...Q.posts, label: "Posts store", icon: "📝", sub: "pulled at read time", w: 160, h: 50 });
        const apiB = k.box(svg, { ...Q.api, label: "Feed API", icon: "📱", w: 130, h: 44 });
        k.box(svg, { ...Q.readers, label: "Readers", icon: "👥", w: 100, h: 36, size: 12 });
        const mDelay = k.meter(svg, { x: 310, y: 112, w: 150, max: DELAY_BUDGET * 2, value: 0, tone: "good" });
        const tDelay = k.text(svg, 385, 142, "", { size: 12, weight: 700 });
        const mRead = k.meter(svg, { x: 545, y: 226, w: 130, max: READ_BUDGET * 2, value: 0, tone: "good" });
        const tRead = k.text(svg, 610, 256, "", { size: 12, weight: 700 });
        for (const [x, y] of [[385, 112], [610, 226]]) svg.append(k.s("line", { x1: x, y1: y - 4, x2: x, y2: y + 14, stroke: "ink", "stroke-width": 2 }));
        const status = k.text(svg, 520, 318, "", { size: 13, weight: 800 });

        // tier cards
        const cardY = i => 34 + i * 50;
        TIERS.forEach((t, i) => {
          t.pull = false;
          t.card = k.box(svg, { x: 118, y: cardY(i), label: `${t.icon} ${t.name}`, sub: "-", w: 212, h: 42, size: 13.5 });
          const paint = () => {
            k.tone(t.card, t.pull ? "lesson" : "accent");
            t.card.sub.textContent = `${short(t.followers)} followers · ${t.pull ? "PULL on read" : "PUSH on write"}`;
            t.card.setAttribute("aria-label", `${t.name}, ${short(t.followers)} followers, currently ${t.pull ? "pull" : "push"}. Activate to switch.`);
          };
          t.paint = paint;
          clickable(t.card, "", () => { if (over) return; t.pull = !t.pull; paint(); updateRead(); k.pulse(t.card).catch(() => {}); });
          paint();
        });

        let started = false, over = false, time = 0, backlog = 0, healthy = 0, lastSec = -1, readerT = 0;
        const readMs = () => BASE_READ + TIERS.reduce((s, t) => s + (t.pull ? t.follows * PER_QUERY : 0), 0);
        function updateRead() {
          const r = readMs();
          mRead.set(Math.min(READ_BUDGET * 2, r), r <= READ_BUDGET ? "good" : "bad");
          tRead.textContent = `feed open ${r} ms (≤ ${READ_BUDGET})`;
          tRead.style.fill = r <= READ_BUDGET ? k.colors.ink : k.colors.bad;
        }
        function updateDelay() {
          const d = backlog / W;
          mDelay.set(Math.min(DELAY_BUDGET * 2, d), d <= DELAY_BUDGET ? "good" : "bad");
          tDelay.textContent = `fan-out delay ${d.toFixed(1)} s (≤ ${DELAY_BUDGET})`;
          tDelay.style.fill = d <= DELAY_BUDGET ? k.colors.ink : k.colors.bad;
          k.tone(queueB, d <= DELAY_BUDGET ? "neutral" : "bad");
        }
        const hud = () => k.hud({ Time: `${Math.max(0, Math.ceil(GAME - time))}s`, Healthy: `${Math.floor(healthy)}s`, "Feed delay": `${(backlog / W).toFixed(1)}s`, "Open": `${readMs()} ms` });
        updateRead(); updateDelay(); hud();

        function postDot(t, i, big) {
          const from = { x: 224, y: cardY(i) };
          const to = t.pull ? Q.posts : Q.queue;
          k.packet(svg, from, { x: to.x - 80, y: to.y }, { r: big ? 13 : 5, label: big ? short(t.followers) : "", size: 9, ms: big ? 700 : 500, tone: t.pull ? "lesson" : "accent" }).catch(() => {});
        }

        function start() {
          if (started) return;
          started = true;
          k.clearTools();
          TIERS.forEach(t => { t.nextPost = t.first ?? 0; t.nextVis = k.rand(0, t.every); });
          k.say("Live! Posts flow in. Switch tiers any time; only writes already queued stay queued.");
          k.loop(dt => {
            if (over) return false;
            time += dt;
            TIERS.forEach((t, i) => {
              if (t.inflow) {
                if (!t.pull) backlog += t.inflow * dt;
                if (time >= t.nextVis) { t.nextVis = time + t.every; postDot(t, i, false); }
              } else if (time >= t.nextPost) {
                t.nextPost = time + t.every * k.rand(0.85, 1.15);
                postDot(t, i, true);
                if (!t.pull) {
                  backlog += t.followers;
                  if (t.followers >= 10e6) k.float(svg, Q.queue.x, Q.queue.y - 30, `+${short(t.followers)} writes`, "bad");
                } else k.float(svg, Q.posts.x, Q.posts.y - 34, "1 write", "good");
              }
            });
            backlog = Math.max(0, backlog - W * dt);
            const d = backlog / W, r = readMs();
            const ok = d <= DELAY_BUDGET && r <= READ_BUDGET;
            if (ok) healthy += dt;
            status.textContent = ok ? "✓ healthy" : d > DELAY_BUDGET && r > READ_BUDGET ? "✗ feeds late and opens slow" : d > DELAY_BUDGET ? "✗ feeds are late" : "✗ feed opens too slow";
            status.style.fill = ok ? k.colors.good : k.colors.bad;
            updateDelay();
            readerT += dt;
            if (readerT >= 1.4) {
              readerT = 0;
              k.packet(svg, Q.readers, Q.api, { r: 6, ms: 450, tone: r <= READ_BUDGET ? "good" : "bad" }).catch(() => {});
              k.tone(apiB, r <= READ_BUDGET ? "good" : "bad");
            }
            const sec = Math.floor(time);
            if (sec !== lastSec) { lastSec = sec; hud(); }
            if (time >= GAME) { end(); return false; }
          });
        }

        function end() {
          if (over) return;
          over = true;
          const h = Math.round(healthy);
          const text = `Healthy for <b>${h} of ${GAME} s</b>. One celebrity post pushed to 20M feeds swamps the fan-out queue, while pulling the long tail makes every feed open query hundreds of accounts. ` +
            "The hybrid wins: <b>push</b> for normal accounts, <b>pull</b> for the few huge ones.";
          if (h < 25) k.lose(text);
          else k.win({ stars: k.starsFor(h, 40, 54), text });
        }

        k.say(`Every tier starts on <b>PUSH</b>. Workers write ${short(W)} feed entries per second. Each pulled tier adds ${PER_QUERY} ms per followed account to every feed open. Plan, then press Start.`);
        k.button("Start ▶", start, { primary: true });
      }
    }
  });
})();
