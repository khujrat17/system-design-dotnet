"use strict";
/* Concept 3 · Vertical vs horizontal scaling. Watch: a server grows until it hits the ceiling, then scale-out
   breaks logins (in-memory sessions) until state moves to a shared store. Play: Black Friday Scaler. */
(function () {
  Lab.define(3, {
    watch: {
      title: "Bigger box, or more boxes?",
      intro: "Watch one server grow until it can’t, then three small ones that only work once they’re stateless.",
      steps: [
        { label: "One server", tag: "concept", title: "One server, 800 req/s",
          body: "<p>The shop runs on <b>one app server</b> with 2 vCPUs for <b>$70 a month</b>. It handles about 1,000 requests a second.</p><p>Today’s traffic is 800 req/s, so the CPU sits at 80%.</p>",
          idea: "Start simple. One server is easy to run, debug and deploy.",
          changed: ["Traffic: 800 req/s", "CPU 80%, no errors"] },
        { label: "Scale up", tag: "technique", title: "Buy a bigger machine",
          body: "<p>Traffic grows to <b>3,000 req/s</b>. The CPU is pinned and requests fail with <b>503</b>.</p><p><b>Vertical scaling</b>: move to an 8 vCPU machine. No code changes, but resizing usually means a <b>restart</b>.</p>",
          idea: "Scaling up is the easiest first move: same code, bigger box.",
          changed: ["503s while overloaded", "Server: 8 vCPU, $280/mo"] },
        { label: "Pricey", tag: "trade-off", title: "Each size up costs more per request",
          body: "<p>Traffic keeps growing: 12,000, then 30,000 req/s. Each time, buy the next size: 32 vCPU, then 96 vCPU.</p><p>Capacity went up <b>36×</b>, but the bill went up about <b>70×</b>: from $70 to $5,000 a month.</p>",
          idea: "The biggest machines cost the most per request.",
          changed: ["Server: 96 vCPU, $5,000/mo", "Capacity: 36,000 req/s"] },
        { label: "Ceiling", tag: "failure", title: "No bigger machine exists",
          body: "<p>Traffic doubles to <b>60,000 req/s</b>. There is nothing bigger to buy.</p><p>About 40% of requests now fail. Vertical scaling has a <b>hard ceiling</b>.</p>",
          idea: "Sooner or later, growth outruns the biggest box on sale.",
          changed: ["Traffic 60,000 > capacity 36,000", "Failed requests climb"] },
        { label: "One box", tag: "failure", title: "A single point of failure",
          body: "<p>Even below the ceiling, it’s still <b>one machine</b>. A kernel patch reboots it, and <b>every</b> request fails until it’s back.</p>",
          idea: "One server means one failure takes everything down. You need redundancy, not just size.",
          changed: ["Capacity: 0 while rebooting", "All 10 requests fail"] },
        { label: "Scale out", tag: "technique", title: "More boxes behind a load balancer",
          body: "<p><b>Horizontal scaling</b>: three identical servers behind a <b>load balancer</b>. Need more? Add another.</p><p>Priya logs in. Round robin sends her to <b>app-1</b>, which keeps her session <b>in its own memory</b>.</p>",
          idea: "Scaling out has no ceiling and survives a dead server, but only if any server can handle any request.",
          changed: ["3 servers + a load balancer", "app-1 memory: sid-42 → priya"] },
        { label: "Logged out", tag: "failure", title: "The session is stuck on one server",
          body: "<p>Priya’s next requests carry cookie <code>sid-42</code>. Round robin sends them to app-2, app-3, then app-1.</p><p>app-2 and app-3 have never heard of her: <b>401, please log in</b>. She is randomly logged out.</p>",
          idea: "Servers that hold state aren’t interchangeable, so the load balancer can’t treat them that way.",
          changed: ["2 of 3 requests: 401", "Failed requests +2"] },
        { label: "Shared store", tag: "fix", title: "Move the session out of the process",
          body: "<p>Put sessions in a shared store such as <b>Redis</b>. The servers become <b>stateless</b>.</p><p>Login writes <code>sid-42</code> to Redis, and every instance reads it from there, so any server can serve Priya.</p>",
          idea: "Make the app stateless before you scale out.",
          changed: ["Redis added", "3 of 3 requests: hello priya"] },
        { label: "Server dies", tag: "result", title: "Lose a server, lose nobody",
          body: "<p>app-2 crashes. The load balancer skips it, and nobody is logged out because <b>no state died with it</b>.</p><p>ASP.NET Core trap: <b>Data Protection keys</b> (cookie and antiforgery encryption) are per machine by default. Share them too.</p>",
          idea: "Start vertical; scale out for capacity and redundancy, but first make the app stateless.",
          changed: ["app-2 down, 0 new errors", "Redis: sessions + DP keys"] }
      ],
      learn: [
        { text: "When scaling up works, and where it stops", step: 3 },
        { text: "Why one server is a single point of failure", step: 4 },
        { text: "Why in-memory sessions break scale-out", step: 6 },
        { text: "How a shared session store makes servers stateless", step: 7 }
      ],
      build(stage, k) {
        const svg = k.svg(760, 330, { label: "Users sending traffic to one growing server, then to three servers behind a load balancer" });
        stage.append(svg);
        const scene = k.s("g"); svg.append(scene);

        let traffic = "800 req/s", capacity = "1,000 req/s", fleet = "1 × 2 vCPU", cost = "$70", failedN = 0;
        const metrics = () => k.hud({ Traffic: traffic, Capacity: capacity, Servers: fleet, "Cost / month": cost, "Failed requests": failedN });
        metrics();

        // okShare of n requests succeed, in a fixed pattern (deterministic for step replay)
        async function stream(from, to, n, okShare, gap = 110) {
          const share = Math.max(0, Math.min(1, okShare));
          await Promise.all(Array.from({ length: n }, (_, i) => k.sleep(i * gap).then(async () => {
            const ok = Math.floor((i + 1) * share + 1e-9) > Math.floor(i * share + 1e-9);
            if (!ok) { failedN++; metrics(); }
            await k.packet(scene, from, to, { r: 6, tone: ok ? "accent" : "bad", ms: 650 });
            if (!ok) k.float(scene, to.x + k.rand(-50, 50), to.y - 70, "503", "bad");
          })));
        }

        k.run(async () => {
          // 1 · one server
          await k.step();
          const U = { x: 80, y: 160 }, S = { x: 400, y: 150 };
          k.line(scene, U, S, { dashed: true });
          k.box(scene, { ...U, label: "Users", icon: "👥", w: 110 });
          const srv = k.box(scene, { ...S, w: 120, h: 56, label: "App server", sub: "2 vCPU · $70/mo", icon: "🖥️", size: 13.5 });
          const cpu = k.meter(scene, { x: 330, y: 250, w: 140, max: 100, value: 0, tone: "good", label: "CPU" });
          const trafficT = k.text(scene, 80, 210, "", { size: 12, tone: "muted" });
          const note = k.text(scene, 620, 90, "", { size: 12, weight: 700, tone: "bad" });
          const TIERS = [
            { vcpu: 2, cap: 1000, cost: "$70/mo", scale: 1 },
            { vcpu: 8, cap: 4000, cost: "$280/mo", scale: 1.22 },
            { vcpu: 32, cap: 14000, cost: "$1,200/mo", scale: 1.45 },
            { vcpu: 96, cap: 36000, cost: "$5,000/mo", scale: 1.7 }
          ];
          let tier = 0;
          const setLoad = (rps) => {
            trafficT.textContent = `traffic: ${k.fmt(rps)} req/s`;
            traffic = `${k.fmt(rps)} req/s`; metrics();
            const u = Math.round(rps / TIERS[tier].cap * 100);
            cpu.set(Math.min(100, u), u > 100 ? "bad" : u > 85 ? "warn" : "good");
            cpu.label.textContent = `CPU ${Math.min(100, u)}%${u > 100 ? " · overloaded" : ""}`;
            return u;
          };
          k.say("One server, 2 vCPUs, 800 requests a second.");
          setLoad(800);
          await k.sleep(800);
          await stream(U, S, 8, 1);
          await k.sleep(1000);

          async function grow(g, rps) {
            setLoad(rps);
            k.say(`Traffic: <b>${k.fmt(rps)} req/s</b>. CPU pinned, requests fail.`);
            k.tone(srv, "bad");
            await stream(U, S, 10, TIERS[tier].cap / rps);
            const t = TIERS[tier + 1];
            k.say(`Scale <b>up</b> to ${t.vcpu} vCPU (${t.cost}). Restarting…`);
            k.tone(srv, "muted"); srv.sub.textContent = "restarting…";
            await k.sleep(1000);
            tier++;
            await k.tween(srv, { scale: t.scale }, 700, k.ease.back);
            srv.sub.textContent = `${t.vcpu} vCPU · ${t.cost}`;
            k.tone(srv, "good");
            capacity = `${k.fmt(t.cap)} req/s`; fleet = `1 × ${t.vcpu} vCPU`; cost = t.cost.replace("/mo", ""); metrics();
            setLoad(rps);
            await stream(U, S, 8, 1);
          }

          // 2 · scale up
          await k.step();
          await grow(0, 3000);
          await k.sleep(800);

          // 3 · pricey
          await k.step();
          await grow(1, 12000);
          await k.sleep(800);
          await grow(2, 30000);
          k.say("36× the capacity, about <b>70×</b> the bill.");
          await k.sleep(1500);

          // 4 · ceiling
          await k.step();
          setLoad(60000);
          note.textContent = "⛔ no bigger machine exists";
          k.tone(srv, "bad");
          k.say("60,000 req/s, and nothing bigger to buy.");
          await k.sleep(800);
          await stream(U, S, 12, 0.6);
          await k.sleep(1200);

          // 5 · single point of failure
          await k.step();
          note.textContent = "";
          srv.label.textContent = "💥 App server"; srv.sub.textContent = "rebooting for a patch";
          capacity = "0 (rebooting)"; metrics();
          k.say("A patch reboots the only server. <b>Everything</b> is down.");
          await k.sleep(800);
          await stream(U, S, 10, 0);
          await k.sleep(1500);

          // 6 · scale out
          await k.step();
          scene.replaceChildren();
          const L = { x: 215, y: 165 };
          const A = [{ x: 420, y: 70 }, { x: 420, y: 170 }, { x: 420, y: 270 }];
          const R = { x: 672, y: 170 };
          const UU = { x: 70, y: 165 };
          k.line(scene, UU, L, { dashed: true });
          A.forEach(a => k.line(scene, L, a, { dashed: true }));
          k.box(scene, { ...UU, label: "Priya", icon: "👩", w: 100 });
          const lb = k.box(scene, { ...L, label: "Load balancer", sub: "round robin", w: 130, h: 50, size: 13.5 });
          const apps = A.map((a, i) => k.box(scene, { ...a, label: `app-${i + 1}`, icon: "🖥️", w: 120, h: 44 }));
          const tags = A.map(a => k.text(scene, a.x, a.y + 38, "memory: (empty)", { size: 11, mono: true, tone: "muted" }));
          [lb, ...apps].forEach(g => g.setAttribute("opacity", 0));
          traffic = "1 user (Priya)"; capacity = "12,000 req/s"; fleet = "3 × 8 vCPU"; cost = "$840"; metrics();
          k.say("Three identical servers behind a load balancer.");
          await Promise.all([lb, ...apps].map(g => k.tween(g, { opacity: 1 }, 600)));
          await k.sleep(1200);

          let rr = 0;
          async function request(label, handle) {
            const i = rr++ % 3;
            await k.packet(scene, UU, L, { r: 9, label, size: 11, ms: 380 });
            await k.packet(scene, L, A[i], { r: 9, label, size: 11, ms: 380 });
            const res = await handle(i);
            if (!res.ok) { failedN++; metrics(); }
            k.tone(apps[i], res.ok ? "good" : "bad");
            k.float(scene, A[i].x + 128, A[i].y + 5, res.text, res.ok ? "good" : "bad");
            await k.packet(scene, A[i], L, { r: 9, tone: res.ok ? "good" : "bad", ms: 300 });
            await k.packet(scene, L, UU, { r: 9, tone: res.ok ? "good" : "bad", ms: 300 });
            await k.sleep(500);
            k.tone(apps[i], "neutral");
          }

          let local = [null, null, null];
          k.say("Priya logs in on <b>app-1</b>; the session lives in its memory.");
          await request("🔑", async i => { local[i] = "priya"; tags[i].textContent = "memory: sid-42 → priya"; tags[i].style.fill = k.colors.accent; return { ok: true, text: "logged in" }; });
          await k.sleep(600);

          // 7 · logged out
          await k.step();
          k.say("Cookie <code>sid-42</code> goes to app-2, app-3, app-1…");
          for (let n = 0; n < 3; n++) {
            await request("42", async i => local[i] ? { ok: true, text: "hello priya" } : { ok: false, text: "401 log in" });
          }
          k.say("Two of three say <b>401</b>.");
          await k.sleep(1200);

          // 8 · shared session store
          await k.step();
          k.say("Sessions move out of the process, into <b>Redis</b>.");
          A.forEach(a => k.line(scene, a, R, { dashed: true, tone: "accent" }));
          const redis = k.box(scene, { ...R, label: "Redis", sub: "sessions", icon: "⚡", w: 130, h: 50, tone: "accent", size: 13.5 });
          redis.setAttribute("opacity", 0);
          await k.tween(redis, { opacity: 1 }, 600);
          local = [null, null, null];
          tags.forEach(t => { t.textContent = "stateless"; t.style.fill = k.colors.good; });
          rr = 0;
          cost = "$840 + Redis"; metrics();
          await k.sleep(1000);

          async function viaRedis(i, write) {
            await k.packet(scene, A[i], R, { r: 7, tone: "accent", ms: 330 });
            if (write) redis.sub.textContent = "sid-42 → priya";
            await k.packet(scene, R, A[i], { r: 7, tone: "good", ms: 330 });
          }
          k.say("Login writes the session to Redis.");
          await request("🔑", async i => { await viaRedis(i, true); return { ok: true, text: "logged in" }; });
          k.say("Any instance reads <code>sid-42</code> from Redis.");
          for (let n = 0; n < 3; n++) await request("42", async i => { await viaRedis(i, false); return { ok: true, text: "hello priya" }; });
          await k.sleep(800);

          // 9 · a server dies
          await k.step();
          k.say("app-2 crashes. The balancer skips it.");
          k.tone(apps[1], "bad"); apps[1].label.textContent = "💥 app-2";
          capacity = "8,000 req/s"; fleet = "2 of 3 up"; metrics();
          await k.sleep(1000);
          for (const i of [0, 2]) {
            await k.packet(scene, UU, L, { r: 9, label: "42", size: 11, ms: 340 });
            await k.packet(scene, L, A[i], { r: 9, label: "42", size: 11, ms: 340 });
            await viaRedis(i, false);
            k.float(scene, A[i].x + 128, A[i].y + 5, "hello priya", "good");
            await k.packet(scene, A[i], L, { r: 9, tone: "good", ms: 280 });
            await k.packet(scene, L, UU, { r: 9, tone: "good", ms: 280 });
          }
          await k.sleep(800);
          k.say("Share the <b>Data Protection keys</b> too.");
          redis.sub.textContent = "sessions + DP keys";
          await k.pulse(redis);
          await k.sleep(1500);
          k.done();
        });
      }
    },

    play: {
      title: "Black Friday Scaler",
      goal: "Keep the shop up for 60 seconds while traffic grows and a sale hits at 0:52. Scale <b>up</b> (bigger machines) or <b>out</b> (more servers) without running out of budget. Watch for crashes and logged-out users.",
      build(stage, k) {
        const TIERS = [
          { name: "S", cap: 1000, cost: 1 },
          { name: "M", cap: 4000, cost: 3 },
          { name: "L", cap: 14000, cost: 12 },
          { name: "XL", cap: 30000, cost: 40 }
        ];
        const DURATION = 60, BUDGET = 1200, MAXN = 12, REDIS_COST = 40, LOGGED_IN = 0.6, SALE = 52;
        const load = t => 600 + 35000 * Math.pow(t / 60, 2.2) + 12000 * Math.exp(-Math.pow((t - SALE) / 3, 2));

        let t = 0, tier = 0, stateless = false, spent = 0, demand = 0, served = 0;
        let lostCap = 0, lostSess = 0, outage = 0, over = false, redraw = 0, fx = 0, warned = false;
        const crashes = [22, 41];
        let servers = [{ state: "up", until: 0 }];

        const svg = k.svg(760, 330, { label: "Traffic and capacity over time on the left; your servers and session store on the right" });
        stage.append(svg);

        // chart
        const X0 = 50, X1 = 430, YB = 300, YT = 50, QMAX = 45000;
        const xOf = s => X0 + (s / DURATION) * (X1 - X0);
        const yOf = q => YB - (Math.min(q, QMAX) / QMAX) * (YB - YT);
        for (let q = 10000; q <= 40000; q += 10000) {
          svg.append(k.s("line", { x1: X0, y1: yOf(q), x2: X1, y2: yOf(q), stroke: "line", "stroke-width": 1, "stroke-dasharray": "2 4" }));
          k.text(svg, X0 - 6, yOf(q) + 4, `${q / 1000}k`, { size: 11, anchor: "end", tone: "muted" });
        }
        svg.append(k.s("line", { x1: X0, y1: YB, x2: X1, y2: YB, stroke: "line", "stroke-width": 1.5 }));
        for (let s = 0; s <= 60; s += 15) k.text(svg, xOf(s), YB + 18, `0:${String(s).padStart(2, "0")}`.replace("0:60", "1:00"), { size: 11, tone: "muted" });
        svg.append(k.s("line", { x1: xOf(SALE), y1: YT - 10, x2: xOf(SALE), y2: YB, stroke: "warn", "stroke-width": 1.5, "stroke-dasharray": "5 4" }));
        k.text(svg, xOf(SALE), YT - 16, "🛍 sale", { size: 11, weight: 700, tone: "warn" });
        k.text(svg, X0, 22, "req/s: demand", { size: 11, anchor: "start", tone: "accent", weight: 700 });
        k.text(svg, X0 + 100, 22, "capacity", { size: 11, anchor: "start", tone: "good", weight: 700 });
        const capPath = k.s("path", { d: "", fill: "none", stroke: "good", "stroke-width": 2, "stroke-dasharray": "5 3" });
        const loadPath = k.s("path", { d: "", fill: "none", stroke: "accent", "stroke-width": 2.5 });
        svg.append(capPath, loadPath);
        let dLoad = "", dCap = "";
        const now = k.dot(svg, xOf(0), yOf(load(0)), { r: 5, tone: "accent" });

        // fleet
        const lb = k.box(svg, { x: 610, y: 40, w: 170, h: 34, label: "Load balancer", size: 12.5 });
        const slotPos = i => ({ x: 505 + (i % 4) * 70, y: 100 + Math.floor(i / 4) * 58 });
        const tiles = Array.from({ length: MAXN }, (_, i) => {
          const g = k.box(svg, { ...slotPos(i), w: 62, h: 48, label: "S", sub: "1k/s", size: 13.5 });
          g.style.display = "none";
          return g;
        });
        const sess = k.box(svg, { x: 610, y: 292, w: 260, h: 44, label: "Sessions: in server memory", sub: "fine while there’s one server", size: 13.5 });

        // controls
        const bUp = k.button("⬆ Bigger machines", () => act(upgrade));
        const bAdd = k.button("➕ Add server", () => act(add), { primary: true });
        const bRem = k.button("➖ Remove server", () => act(remove));
        const bRedis = k.button(`🔑 Sessions → Redis ($${REDIS_COST})`, () => act(toRedis));
        function act(fn) { if (!over) { fn(); refresh(); } }

        function upgrade() {
          if (tier >= TIERS.length - 1) return;
          tier++;
          if (servers.length === 1) {
            servers[0].state = "resizing"; servers[0].until = t + 3;
            k.say(`Resized to <b>${TIERS[tier].name}</b>. With a single server, resizing means a restart: <b>3 s of downtime</b>.`);
          } else {
            k.say(`Rolling upgrade to <b>${TIERS[tier].name}</b>: servers resize one at a time behind the load balancer, so no downtime.`);
          }
          if (tier === TIERS.length - 1) k.say("<b>XL</b> is the biggest machine there is: the vertical ceiling. And it’s pricey.");
        }
        function add() {
          if (servers.length >= MAXN) { k.toast("12 servers is the limit here", "warn"); return; }
          servers.push({ state: "booting", until: t + 2 });
          k.say(stateless ? "Server added. It boots in 2 s and can serve anyone, because sessions live in Redis."
            : servers.length === 2 ? "Second server added. Careful: sessions still live in <b>each server’s memory</b>…" : "Server added (2 s to boot).");
        }
        function remove() {
          if (servers.length <= 1) return;
          const i = servers.findIndex(s => s.state !== "up");
          servers.splice(i >= 0 ? i : servers.length - 1, 1);
        }
        function toRedis() {
          if (stateless) return;
          stateless = true; spent += REDIS_COST;
          k.tone(sess, "good"); sess.label.textContent = "Sessions: Redis ✓"; sess.sub.textContent = "any server can serve any user";
          k.say("Sessions moved to a shared store. Servers are now <b>stateless</b> and interchangeable.");
        }

        function refresh() {
          const T = TIERS[tier];
          tiles.forEach((g, i) => {
            const s = servers[i];
            if (!s) { g.style.display = "none"; return; }
            g.style.display = "";
            g.label.textContent = T.name;
            const L = load(t), upN = servers.filter(x => x.state === "up").length, u = upN ? L / (upN * T.cap) : 2;
            if (s.state === "up") { g.sub.textContent = `${T.cap / 1000}k/s`; k.tone(g, u > 1 ? "bad" : u > 0.85 ? "warn" : "good"); }
            else if (s.state === "booting") { g.sub.textContent = "booting"; k.tone(g, "muted"); }
            else if (s.state === "resizing") { g.sub.textContent = "resizing"; k.tone(g, "muted"); }
            else { g.sub.textContent = "💥 down"; k.tone(g, "bad"); }
          });
          bUp.disabled = tier >= TIERS.length - 1;
          bAdd.disabled = servers.length >= MAXN;
          bRem.disabled = servers.length <= 1;
          bRedis.disabled = stateless;
          if (!stateless) {
            const many = servers.length > 1;
            k.tone(sess, many ? "bad" : "neutral");
            sess.sub.textContent = many ? "users bounce between servers → logged out!" : "fine while there’s one server";
          }
          const uptime = demand ? served / demand * 100 : 100;
          k.hud({ Time: `0:${String(Math.min(60, Math.floor(t))).padStart(2, "0")}`.replace("0:60", "1:00"), Uptime: `${uptime.toFixed(1)}%`,
            Budget: `$${Math.max(0, Math.round(BUDGET - spent))}`, Fleet: `${servers.length} × ${T.name}` });
        }

        k.loop(dt => {
          if (over) return false;
          t += dt;
          for (const s of servers) if (s.state !== "up" && s.state !== "down" && t >= s.until) s.state = "up";
          for (const s of servers) if (s.state === "down" && t >= s.until) s.state = "up";
          if (crashes.length && t >= crashes[0]) {
            crashes.shift();
            const ups = servers.filter(s => s.state === "up");
            if (ups.length) {
              const victim = k.pick(ups);
              victim.state = "down"; victim.until = t + 5;
              k.say(servers.length === 1 ? "💥 Your <b>only</b> server crashed: total outage for 5 s. One machine is a single point of failure."
                : "💥 A server crashed. The others carry on while it’s replaced (5 s).");
            }
          }
          if (!warned && t >= 40) { warned = true; k.toast("📣 Black Friday sale starts at 0:52!", "warn", 2200); }

          const T = TIERS[tier], L = load(t);
          const upN = servers.filter(s => s.state === "up").length;
          const cap = upN * T.cap;
          let ok = Math.min(L, cap);
          const capLoss = L - ok;
          let sessLoss = 0;
          if (!stateless && upN > 1) { sessLoss = ok * LOGGED_IN * (upN - 1) / upN; ok -= sessLoss; }
          demand += L * dt; served += ok * dt;
          lostCap += capLoss * dt; lostSess += sessLoss * dt;
          if (upN === 0) outage += dt;
          spent += servers.length * T.cost * dt;

          fx += dt;
          if (fx > 0.45) {
            fx = 0;
            if (capLoss > L * 0.02) k.float(svg, k.rand(520, 700), 70, "503", "bad");
            if (sessLoss > 0) k.float(svg, k.rand(520, 700), 262, "401 logged out", "bad");
          }
          redraw += dt;
          if (redraw > 0.25) {
            redraw = 0;
            const x = xOf(t).toFixed(1);
            dLoad += `${dLoad ? "L" : "M"}${x},${yOf(L).toFixed(1)} `;
            dCap += `${dCap ? "L" : "M"}${x},${yOf(cap).toFixed(1)} `;
            loadPath.setAttribute("d", dLoad); capPath.setAttribute("d", dCap);
            k.place(now, { tx: xOf(t), ty: yOf(L) });
            k.tone(lb, capLoss > L * 0.02 || upN === 0 ? "bad" : "neutral");
            refresh();
          }

          if (spent >= BUDGET) {
            over = true;
            k.lose(`Out of budget at 0:${String(Math.floor(t)).padStart(2, "0")}. Big machines cost more per request than several medium ones, and idle servers still cost money. Add capacity just ahead of demand.`);
            return false;
          }
          if (t >= DURATION) { over = true; end(); return false; }
        });

        function end() {
          const up = served / demand * 100;
          const why = [];
          if (lostSess / demand > 0.02) why.push(`${(lostSess / demand * 100).toFixed(0)}% of requests landed on a server that didn’t hold the user’s session (move sessions to Redis <b>before</b> scaling out)`);
          if (outage > 1) why.push(`${outage.toFixed(0)} s of total outage (a single server is a single point of failure, and resizing it means a restart)`);
          if (lostCap / demand > 0.02) why.push(`${(lostCap / demand * 100).toFixed(0)}% turned away for lack of capacity`);
          const text = `Uptime <b>${up.toFixed(1)}%</b>, spent $${Math.round(spent)} of $${BUDGET}. ` +
            (why.length ? `What hurt: ${why.join("; ")}.` : "Stateless servers, scaled out just ahead of demand: exactly how it’s done.");
          if (up < 75) k.lose(text);
          else k.win({ stars: up >= 96 ? 3 : up >= 88 ? 2 : 1, text });
        }

        refresh();
        k.say("Traffic is already growing. One small server (S = 1k req/s) won’t last long…");
      }
    }
  });
})();
