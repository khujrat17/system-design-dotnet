"use strict";
/* Concept 2 · Back-of-the-envelope estimation. Watch: users → QPS → peak → servers (and what happens if you
   size for the average), storage, and the latency ladder. Play: Napkin Math (log-slider estimates that pick an architecture). */
(function () {
  const DAY = 86400;
  /** 1234 → "1.2k", 35000 → "35k", 1.7e6 → "1.7M" */
  function short(v) {
    if (v < 10) return (Math.round(v * 10) / 10).toString();
    if (v < 1000) return String(Math.round(v));
    if (v < 1e4) return (Math.round(v / 100) / 10) + "k";
    if (v < 1e6) return Math.round(v / 1000) + "k";
    return (Math.round(v / 1e5) / 10) + "M";
  }
  /** a size in GB → "10 GB", "9.1 TB", "1.2 PB" */
  function bytesGB(v) {
    const r = x => x < 10 ? Math.round(x * 10) / 10 : Math.round(x);
    if (v < 1000) return `${r(v)} GB`;
    if (v < 1e6) return `${r(v / 1000)} TB`;
    return `${r(v / 1e6)} PB`;
  }

  Lab.define(2, {
    watch: {
      title: "How 100M users became 12 servers",
      intro: "Turn “100 million users” into requests per second, servers and terabytes, and see why the peak matters.",
      steps: [
        { label: "Big number", tag: "problem", title: "“We have 100 million users”",
          body: "<p>The only number you’re given: <b>100 million daily active users</b>, each doing about <b>10 reads</b> a day.</p><p>That’s <b>1 billion reads a day</b>. But servers are sized in requests per <b>second</b>.</p>",
          idea: "Start every estimate from users × actions per day.",
          changed: ["Chain: 100M × 10 = 1B reads/day"] },
        { label: "Per second", tag: "technique", title: "Divide by the seconds in a day",
          body: "<p>1B ÷ 86,400 s ≈ <b>11,600 reads/s</b> on average. Writes (1 per user per day) are only ≈ 1,160/s.</p><p>Round aggressively: <b>1 day ≈ 10⁵ seconds</b>, so 1M requests a day ≈ 12 per second.</p>",
          idea: "1 day ≈ 10⁵ s and 1M/day ≈ 12/s. Memorise those two.",
          changed: ["Avg reads/s: 11.6k"] },
        { label: "Peak", tag: "concept", title: "Traffic isn’t flat",
          body: "<p>Real traffic has a daily rhythm. The <b>peak</b> is usually 2–10× the average.</p><p>Here the evening peak is about <b>3×</b>: ≈ 35,000 reads/s.</p>",
          idea: "Averages hide the hour that takes you down.",
          changed: ["One day of traffic drawn", "Peak reads/s: 35k"] },
        { label: "Avg sizing", tag: "failure", title: "Size for the average",
          body: "<p>One app server handles about <b>3,000 req/s</b>, so 11,600 ÷ 3,000 ≈ <b>4 servers</b>.</p><p>Run the day: every evening the peak overwhelms them, and requests fail with <b>503</b>.</p>",
          idea: "Capacity sized for the average fails at the peak, every single day.",
          changed: ["4 servers turn red at the evening peak", "Failed (503) climbs into the millions"] },
        { label: "Peak sizing", tag: "fix", title: "Size for the peak",
          body: "<p>35,000 ÷ 3,000 ≈ <b>12 servers</b>, or <b>autoscale</b> between 4 and 12.</p><p>No failures. The servers run cool most of the day and only work hard at the evening peak.</p>",
          idea: "Size for the peak, then let autoscaling stop you paying for it at night.",
          changed: ["Servers needed: 12", "Failed (503): 0"] },
        { label: "Storage", tag: "technique", title: "Writes × bytes × days kept",
          body: "<p>Each user writes one <b>500-byte</b> item a day, kept <b>5 years</b>: 100M × 500 B × 365 × 5 ≈ <b>91 TB</b>.</p><p>One big server’s disk holds about 10 TB, so that’s <b>nine machines’ worth</b>.</p>",
          idea: "91 TB alone tells you this data must be partitioned.",
          changed: ["Storage: 91 TB", "The bar spans nine disks"] },
        { label: "Small data", tag: "trade-off", title: "Not everything needs sharding",
          body: "<p>Compare user profiles: 10M users × 1 KB = <b>10 GB</b>.</p><p>That’s a sliver of one disk. <b>Don’t shard it</b>: sharding adds cost and complexity you don’t need.</p>",
          idea: "The estimate also tells you when to stop scaling.",
          changed: ["Profiles: 10 GB, a sliver of one disk"] },
        { label: "Latency", tag: "concept", title: "The latency ladder",
          body: "<p>Memory ≈ <b>100 ns</b>, SSD read ≈ <b>100 µs</b>, same-datacenter round trip ≈ <b>0.5 ms</b>, disk seek ≈ <b>10 ms</b>, cross-continent ≈ <b>150 ms</b>.</p><p>A Redis call costs about one network round trip. A request that crosses an ocean pays 150 ms before any work happens.</p>",
          idea: "1 day ≈ 10⁵ s, size for the peak, know the ladder. The numbers pick the architecture.",
          changed: ["5 rungs, each 10–1,000× slower than the last"] }
      ],
      learn: [
        { text: "Turn daily users into requests per second", step: 1 },
        { text: "Why you size for the peak, not the average", step: 4 },
        { text: "Estimate storage and decide when to shard", step: 6 },
        { text: "The latency numbers worth memorising", step: 7 }
      ],
      build(stage, k) {
        const svg = k.svg(760, 340, { label: "An estimate built step by step, then a day of traffic hitting a pool of servers" });
        stage.append(svg);
        const top = k.s("g"), bottom = k.s("g");
        svg.append(top, bottom);

        async function show(el, ms = 400) {
          el.setAttribute("opacity", 0);
          await k.tween(el, { opacity: 1 }, ms);
        }

        // ---- the chain ----
        const CHAIN = [
          { label: "100M users", sub: "active each day" },
          { label: "× 10 reads", sub: "per user per day" },
          { label: "= 1B reads", sub: "per day" },
          { label: "÷ 86,400 s", sub: "≈ 10⁵ seconds/day" },
          { label: "≈ 11,600/s", sub: "average reads", tone: "accent" }
        ];
        const cx = i => 82 + i * 144;
        async function chainBox(i) {
          const c = CHAIN[i];
          if (i > 0) {
            const l = k.line(top, { x: cx(i - 1) + 64, y: 52 }, { x: cx(i) - 66, y: 52 }, { arrow: true, tone: "muted" });
            await show(l, 200);
          }
          const b = k.box(top, { x: cx(i), y: 52, w: 128, h: 46, label: c.label, sub: c.sub, tone: c.tone || "neutral", size: 13.5 });
          await show(b);
        }

        // ---- the day chart ----
        const X0 = 50, X1 = 440, YB = 316, YT = 150, QMAX = 40000;
        const xOf = h => X0 + (h / 24) * (X1 - X0);
        const yOf = q => YB - (q / QMAX) * (YB - YT);
        const AVG = 1e8 * 10 / DAY;    // 11,574
        const load = h => AVG * (0.35 + 2.65 * Math.exp(-Math.pow(h - 20, 2) / 9.68) + 0.5 * Math.exp(-Math.pow(h - 12, 2) / 12.5));
        const PER = 3000;              // requests per second one instance handles comfortably

        let avgR = "?", peakR = "?", storage = "?", failedN = "—", servers = "?";
        const metrics = () => k.hud({ "Avg reads/s": avgR, "Peak reads/s": peakR, Storage: storage, "Failed (503)": failedN, "Servers needed": servers });
        metrics();

        k.run(async () => {
          // 1 · the big number
          await k.step();
          k.say("100M daily users, about 10 reads each.");
          for (let i = 0; i < 3; i++) { await chainBox(i); await k.sleep(900); }
          k.say("That’s <b>1 billion reads a day</b>. Per second?");
          await k.sleep(1200);

          // 2 · per second
          await k.step();
          await chainBox(3);
          k.say("Round it: <b>1 day ≈ 10⁵ seconds</b>.");
          await k.sleep(1600);
          await chainBox(4);
          avgR = "11.6k"; metrics();
          k.say("About <b>11,600 reads per second</b> on average.");
          await k.sleep(1600);

          // 3 · the peak
          await k.step();
          const peakT = k.text(top, 380, 104, "But traffic isn’t flat: peak ≈ 3 × average ≈ 35,000 reads/s", { size: 13, weight: 700, tone: "warn" });
          await show(peakT);
          k.say("One day of reads per second…");
          for (let q = 10000; q <= 40000; q += 10000) {
            bottom.append(k.s("line", { x1: X0, y1: yOf(q), x2: X1, y2: yOf(q), stroke: "line", "stroke-width": 1, "stroke-dasharray": "2 4" }));
            k.text(bottom, X0 - 6, yOf(q) + 4, `${q / 1000}k`, { size: 11, anchor: "end", tone: "muted" });
          }
          for (let h = 0; h <= 24; h += 6) k.text(bottom, xOf(h), 334, `${h}h`, { size: 11, tone: "muted" });
          bottom.append(k.s("line", { x1: X0, y1: YB, x2: X1, y2: YB, stroke: "line", "stroke-width": 1.5 }));
          k.text(bottom, 245, 136, "Reads per second over one day", { size: 12, tone: "muted" });
          let d = "";
          for (let h = 0; h <= 24.001; h += 0.25) d += `${d ? "L" : "M"}${xOf(h).toFixed(1)},${yOf(load(h)).toFixed(1)} `;
          const curve = k.s("path", { d, fill: "none", stroke: "accent", "stroke-width": 2.5 });
          bottom.append(curve);
          await show(curve, 900);
          bottom.append(k.s("line", { x1: X0, y1: yOf(AVG), x2: X1, y2: yOf(AVG), stroke: "muted", "stroke-width": 1.5, "stroke-dasharray": "6 4" }));
          k.text(bottom, X0 + 6, yOf(AVG) - 6, "average 11.6k", { size: 11, anchor: "start", tone: "muted" });
          await k.sleep(800);
          k.text(bottom, xOf(20), yOf(load(20)) - 8, "peak ≈ 35k", { size: 11, weight: 700, tone: "warn" });
          peakR = "35k"; metrics();
          k.say("The evening peak is about <b>3×</b> the average.");
          await k.sleep(1600);

          // servers (drawn hidden; shown by sweep)
          k.text(bottom, 615, 136, "App servers · 3,000 req/s each", { size: 12, tone: "muted" });
          const readout = k.text(bottom, 615, 156, "", { size: 12, weight: 600 });
          const tiles = Array.from({ length: 12 }, (_, i) => {
            const g = k.box(bottom, { x: 522 + (i % 4) * 62, y: 188 + Math.floor(i / 4) * 50, w: 54, h: 38, label: `S${i + 1}`, size: 12 });
            g.style.display = "none";
            return g;
          });
          const cursor = k.dot(bottom, xOf(0), yOf(load(0)), { r: 7, tone: "ink" });

          async function sweep(n) {
            tiles.forEach((s, i) => { s.style.display = i < n ? "" : "none"; k.tone(s, "neutral"); });
            const cap = n * PER;
            let failed = 0;
            failedN = "0"; metrics();
            for (let h = 0; h <= 24.001; h += 0.25) {
              const q = load(h), u = q / cap;
              k.place(cursor, { tx: xOf(h), ty: yOf(q) });
              const tone = u > 1 ? "bad" : u > 0.8 ? "warn" : "good";
              for (let i = 0; i < n; i++) k.tone(tiles[i], tone);
              readout.textContent = `load ${short(q)}/s · capacity ${short(cap)}/s`;
              if (u > 1) {
                failed += (q - cap) * 900;    // each step is a quarter hour = 900 s
                failedN = short(failed); metrics();
                if (Math.random() < 0.4) k.float(bottom, k.rand(500, 720), k.rand(190, 300), "503", "bad");
              }
              await k.sleep(55);
            }
            return failed;
          }

          // 4 · size for the average
          await k.step();
          servers = "4 (avg)"; metrics();
          k.say("11,600 ÷ 3,000 ≈ <b>4 servers</b>. Run the day…");
          await k.sleep(1000);
          const failed = await sweep(4);
          k.say(`The peak overwhelms them: about <b>${short(failed)} requests fail</b>.`);
          await k.sleep(1000);

          // 5 · size for the peak
          await k.step();
          servers = "12 (peak)"; metrics();
          k.say("35,000 ÷ 3,000 ≈ <b>12 servers</b>. Same day again…");
          await k.sleep(1000);
          await sweep(12);
          k.say("No failures. Cool most of the day, busy at the peak.");
          await k.sleep(1000);

          // 6 · storage
          await k.step();
          bottom.replaceChildren();
          peakT.remove();
          const PX = 6;   // px per TB
          k.text(bottom, 380, 140, "Storage = writes/day × bytes each × days kept", { size: 13, weight: 700 });
          k.say("One 500-byte write per user per day, kept 5 years.");
          const eq = k.text(bottom, 380, 166, "100M writes/day × 500 B × 365 × 5 years ≈ 91 TB", { size: 13, mono: true });
          await show(eq);
          await k.sleep(1000);
          k.text(bottom, 60, 194, "one big server’s disk ≈ 10 TB", { size: 11, anchor: "start", tone: "muted" });
          const frame = k.s("rect", { x: 60, y: 200, width: 10 * PX, height: 32, rx: 4, fill: "surface2", stroke: "ink", "stroke-width": 2 });
          bottom.append(frame);
          const bar = k.s("rect", { x: 62, y: 204, width: 0, height: 24, rx: 3, fill: "bad", opacity: 0.85 });
          bottom.append(bar);
          await k.tween(bar, { width: 91 * PX }, 2200, k.ease.inOut);
          k.text(bottom, 62 + 91 * PX + 8, 221, "91 TB", { size: 13, weight: 700, anchor: "start", tone: "bad" });
          storage = "91 TB"; metrics();
          k.say("91 TB is <b>nine disks’ worth</b>: partition it.");
          for (let t = 10; t < 91; t += 10) {
            bottom.append(k.s("line", { x1: 62 + t * PX, y1: 200, x2: 62 + t * PX, y2: 232, stroke: "surface", "stroke-width": 2 }));
            await k.sleep(90);
          }
          await k.sleep(1200);

          // 7 · small data
          await k.step();
          k.say("User profiles: 10M × 1 KB.");
          k.text(bottom, 60, 270, "10M users × 1 KB profile = 10 GB", { size: 12, anchor: "start", mono: true });
          const frame2 = k.s("rect", { x: 60, y: 280, width: 10 * PX, height: 32, rx: 4, fill: "surface2", stroke: "ink", "stroke-width": 2 });
          const bar2 = k.s("rect", { x: 62, y: 284, width: 0, height: 24, rx: 2, fill: "good" });
          bottom.append(frame2, bar2);
          await k.sleep(800);
          await k.tween(bar2, { width: 3 }, 600);
          k.text(bottom, 140, 301, "← a sliver of one disk", { size: 12, anchor: "start", tone: "good", weight: 600 });
          k.say("<b>10 GB</b> fits on one machine. Don’t shard it.");
          await k.sleep(2000);

          // 8 · latency ladder
          await k.step();
          bottom.replaceChildren();
          k.say("Each rung is 10–1,000× slower than the one before.");
          k.text(bottom, 380, 140, "Latency ladder · log scale: each grid line is 10× slower", { size: 13, weight: 700 });
          const LX = 232, DEC = 70;
          const decs = ["10ns", "100ns", "1µs", "10µs", "100µs", "1ms", "10ms", "100ms"];
          decs.forEach((lab, j) => {
            bottom.append(k.s("line", { x1: LX + j * DEC, y1: 156, x2: LX + j * DEC, y2: 312, stroke: "line", "stroke-width": 1, "stroke-dasharray": "2 4" }));
            k.text(bottom, LX + j * DEC, 330, lab, { size: 11, tone: "muted" });
          });
          const LADDER = [
            ["Memory read · 100 ns", 100, "good"],
            ["SSD random read · 100 µs", 1e5, "good"],
            ["Same-DC round trip · 0.5 ms", 5e5, "accent"],
            ["Disk seek · 10 ms", 1e7, "warn"],
            ["Cross-continent trip · 150 ms", 1.5e8, "bad"]
          ];
          for (let i = 0; i < LADDER.length; i++) {
            const [lab, ns, tone] = LADDER[i];
            const y = 172 + i * 30;
            k.text(bottom, LX - 8, y + 4, lab, { size: 12, anchor: "end" });
            const b = k.s("rect", { x: LX, y: y - 9, width: 0, height: 18, rx: 4, fill: tone });
            bottom.append(b);
            await k.tween(b, { width: (Math.log10(ns) - 1) * DEC }, 700, k.ease.out);
            await k.sleep(600);
          }
          k.say("Crossing an ocean costs <b>150 ms</b> before any work.");
          await k.sleep(1500);
          k.done();
        });
      }
    },

    play: {
      title: "Napkin Math",
      goal: "Five quick estimates. <b>Drag the slider</b> to your answer and lock it in. Within 2× is a bullseye; within 10× still scores. Your number decides what gets built.",
      build(stage, k) {
        const ROUNDS = [
          { q: "5M daily users × 20 requests each.", ask: "Average requests per second?", unit: "qps", truth: 5e6 * 20 / DAY,
            work: "5M × 20 = 100M a day ÷ 10⁵ s ≈ 1,000/s (exactly ≈ 1,160)." },
          { q: "Small SaaS: 50,000 daily users × 30 reads. Peak is 3× average.", ask: "Peak reads per second?", unit: "qps", truth: 50000 * 30 / DAY * 3,
            work: "1.5M a day ÷ 86,400 ≈ 17/s average, × 3 ≈ 52/s at peak." },
          { q: "10M users, each with a 1 KB profile.", ask: "Total storage?", unit: "gb", truth: 10,
            work: "10M × 1 KB = 10 GB. One machine, no sharding." },
          { q: "Social feed: 100M daily users × 50 reads. Peak is 3× average.", ask: "Peak reads per second?", unit: "qps", truth: 1e8 * 50 / DAY * 3,
            work: "5B a day ÷ 86,400 ≈ 58k/s average, × 3 ≈ 174k/s at peak." },
          { q: "Same feed: 100M users × 2 posts/day × 500 B, kept 5 years.", ask: "Total storage?", unit: "gb", truth: 1e8 * 2 * 500 * 365 * 5 / 1e9,
            work: "100 GB a day × 1,825 days ≈ 180 TB." }
        ];
        const AXIS = {
          qps: { ticks: ["1", "10", "100", "1k", "10k", "100k", "1M"], fmt: v => `${short(v)} /s`, cuts: [500, 20000],
                 tiers: ["1 server + 1 DB", "several instances + cache + replicas", "caching everywhere + queues + sharding"], zone: ["1 server", "scale out + cache", "shard + queues"] },
          gb:  { ticks: ["1 GB", "10 GB", "100 GB", "1 TB", "10 TB", "100 TB", "1 PB"], fmt: bytesGB, cuts: [1000, 20000],
                 tiers: ["one database, don’t shard", "one big database + archive old rows", "partition / shard the data"], zone: ["one DB", "big DB + archive", "partition"] }
        };
        const TIME = 25;
        const X0 = 60, X1 = 700, AY = 156;
        const xOf = lg => X0 + (lg / 6) * (X1 - X0);
        const tierOf = (ax, v) => v < ax.cuts[0] ? 0 : v < ax.cuts[1] ? 1 : 2;

        let r = 0, total = 0, bulls = 0, locked = true, left = TIME, guessLog = 3;
        const svg = k.svg(760, 320, { label: "A scenario, a logarithmic number line and the architecture your estimate implies" });
        stage.append(svg);
        const scene = k.s("g"); svg.append(scene);

        function play(rd) { r = rd; setup(rd); hud(); }

        function setup(rd) {
          const R = ROUNDS[rd], ax = AXIS[R.unit];
          scene.replaceChildren();
          k.clearTools();
          locked = false; left = TIME;
          // start the slider well away from the answer, so the default never scores
          guessLog = k.pick([0.5, 1.5, 2.5, 3.5, 4.5, 5.5].filter(v => Math.abs(v - Math.log10(R.truth)) > 1.2));

          k.text(scene, 380, 30, R.q, { size: 15, weight: 700 });
          k.text(scene, 380, 54, R.ask, { size: 13, tone: "muted" });
          const timer = k.meter(scene, { x: X0, y: 70, w: X1 - X0, h: 6, max: TIME, value: TIME, tone: "accent" });

          // architecture zones along the axis
          const cutX = ax.cuts.map(c => xOf(Math.log10(c)));
          const zx = [X0, cutX[0], cutX[1], X1];
          ["goodSoft", "warnSoft", "badSoft"].forEach((fill, z) => {
            scene.append(k.s("rect", { x: zx[z], y: AY - 40, width: zx[z + 1] - zx[z], height: 40, fill, opacity: 0.8 }));
            k.text(scene, (zx[z] + zx[z + 1]) / 2, AY - 24, ax.zone[z], { size: 11, tone: "muted" });
          });
          scene.append(k.s("line", { x1: X0, y1: AY, x2: X1, y2: AY, stroke: "ink", "stroke-width": 2 }));
          ax.ticks.forEach((t, j) => {
            scene.append(k.s("line", { x1: xOf(j), y1: AY - 5, x2: xOf(j), y2: AY + 5, stroke: "ink", "stroke-width": 1.5 }));
            k.text(scene, xOf(j), AY + 20, t, { size: 11, tone: "muted" });
          });
          const band = k.s("rect", { x: 0, y: AY - 10, width: 0, height: 20, rx: 4, fill: "good", opacity: 0 });
          scene.append(band);

          const marker = k.s("g");
          const mDot = k.dot(marker, 0, AY, { r: 9, tone: "accent" });
          const mText = k.text(marker, 0, AY - 46, "", { size: 12, weight: 700, tone: "accent" });
          scene.append(marker);
          const place = () => { k.place(marker, { tx: xOf(guessLog) }); mText.textContent = `you: ${ax.fmt(Math.pow(10, guessLog))}`; };
          place();
          mDot.circle.style.stroke = k.colors.surface; mDot.circle.style.strokeWidth = 2;

          k.slider({ label: "Your estimate", min: 0, max: 6, step: 0.05, value: guessLog, format: v => ax.fmt(Math.pow(10, v)),
            onInput: v => { if (!locked) { guessLog = v; place(); } } });
          const lockBtn = k.button("Lock it in", () => k.run(lock), { primary: true });
          k.say(`Round ${rd + 1} of ${ROUNDS.length}. Shortcuts: <b>1 day ≈ 10⁵ s</b> · peak ≈ 3× average · 1M/day ≈ 12/s.`);

          k.loop(dt => {
            if (locked) return false;
            left -= dt;
            timer.set(Math.max(0, left), left < 6 ? "bad" : "accent");
            hud();
            if (left <= 0) { k.run(lock); return false; }
          });

          async function lock() {
            if (locked) return;
            locked = true;
            lockBtn.disabled = true;
            const guess = Math.pow(10, guessLog), truthLog = Math.log10(R.truth);
            const d = Math.abs(guessLog - truthLog);
            const pts = d <= 0.31 ? 3 : d <= 0.5 ? 2 : d <= 1 ? 1 : 0;
            total += pts; if (pts === 3) bulls++;
            hud();

            band.setAttribute("x", xOf(Math.max(0, truthLog - 0.301)));
            band.setAttribute("width", xOf(Math.min(6, truthLog + 0.301)) - xOf(Math.max(0, truthLog - 0.301)));
            const tdot = k.dot(scene, xOf(truthLog), 90, { r: 9, tone: "good" });
            await Promise.all([k.tween(band, { opacity: 0.35 }, 500), k.tween(tdot, { ty: AY }, 500, k.ease.out)]);
            k.text(scene, xOf(truthLog), AY + 40, `actual ≈ ${ax.fmt(R.truth)}`, { size: 12, weight: 700, tone: "good" });
            const label = pts === 3 ? "Bullseye +3" : pts === 2 ? "Close +2" : pts === 1 ? "Right order of magnitude +1" : "Off by over 10× · 0";
            k.float(scene, xOf(guessLog), AY - 60, label, pts >= 2 ? "good" : pts === 1 ? "warn" : "bad");

            // what your number would have built
            const yours = tierOf(ax, guess), need = tierOf(ax, R.truth);
            const yb = k.box(scene, { x: 200, y: 246, w: 320, h: 46, label: "Your number builds", sub: ax.tiers[yours], tone: "accent", size: 13.5 });
            const nb = k.box(scene, { x: 560, y: 246, w: 320, h: 46, label: "Reality needs", sub: ax.tiers[need], tone: "good", size: 13.5 });
            yb.setAttribute("opacity", 0); nb.setAttribute("opacity", 0);
            await k.tween(yb, { opacity: 1 }, 300);
            await k.tween(nb, { opacity: 1 }, 300);
            let verdict, tone;
            if (yours < need) { verdict = R.unit === "qps" ? "💥 Outage at peak: you under-built" : "💥 Disks fill up: you under-built"; tone = "bad"; }
            else if (yours > need) { verdict = "💸 Over-engineered: complexity you didn’t need"; tone = "warn"; }
            else { verdict = "✓ Right-sized"; tone = "good"; }
            k.tone(yb, tone);
            k.text(scene, 380, 300, verdict, { size: 14, weight: 700, tone });
            k.say(`${R.work}`);
            k.clearTools();
            k.button(rd + 1 < ROUNDS.length ? "Next estimate ▸" : "See my score", () => {
              if (rd + 1 < ROUNDS.length) play(rd + 1); else end();
            }, { primary: true });
          }
        }

        function hud() {
          k.hud({ Round: `${r + 1} / ${ROUNDS.length}`, Score: `${total} / ${ROUNDS.length * 3}`, Time: locked ? "—" : `${Math.max(0, Math.ceil(left))}s` });
        }
        function end() {
          const text = `<b>${total} / 15</b> points with ${bulls} bullseye${bulls === 1 ? "" : "s"}. Precision doesn’t matter; the order of magnitude does, because it decides between one server and a sharded fleet. Remember: 1 day ≈ 10⁵ s and size for the peak.`;
          if (total < 5) k.lose(`${text} Work it out: requests per day ÷ 10⁵, then × the peak factor.`);
          else k.win({ stars: k.starsFor(total, 9, 12), text });
        }

        play(0);
      }
    }
  });
})();
