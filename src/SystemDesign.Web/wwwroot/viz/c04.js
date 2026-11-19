"use strict";
/* Concept 4 · Load balancing + health checks. Watch: round robin piles slow exports on one server, least
   connections spreads them, health checks pull a sick server out, and the liveness-vs-readiness trap.
   Play: Be the Load Balancer. */
(function () {
  function clickable(el, label, fn) {
    el.setAttribute("tabindex", 0);
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", label);
    el.style.cursor = "pointer";
    el.addEventListener("click", fn);
    el.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } });
  }

  Lab.define(4, {
    watch: {
      title: "Why server-1 kept drowning",
      intro: "Every 3rd request is a slow report export. Watch where each algorithm sends it, then watch a server fail its health check.",
      steps: [
        { label: "Round robin", tag: "problem", title: "Every slow export lands on one server",
          body: "<p>Requests arrive one per tick. Every <b>3rd</b> one is a slow report export (9 ticks); the rest take 1 tick.</p><p><b>Round robin</b> hands out turns blindly (1, 2, 3, 1, 2, 3…), so every export goes to <b>server-1</b>.</p>",
          idea: "Round robin assumes every request costs the same. When they don’t, one server drowns while the others idle.",
          changed: ["server-1 piles up slow exports", "Peak on one server: 3 at once"] },
        { label: "Least conns", tag: "technique", title: "Send it to the least busy server",
          body: "<p>Same traffic with <b>least connections</b>: each request goes to the server with the <b>fewest requests in flight</b>.</p><p>The slow exports now spread across all three servers.</p>",
          idea: "When request cost varies, least connections beats round robin.",
          changed: ["Exports spread across servers", "Peak on one server drops"] },
        { label: "Health checks", tag: "concept", title: "The balancer probes every server",
          body: "<p>Every few seconds the balancer calls each server’s <code>/health/ready</code>.</p><p><b>200</b> means “send me traffic”; <b>503</b> means “not now”.</p>",
          idea: "A load balancer is only as smart as its health checks.",
          changed: ["3 probes out, 3 × 200 back", "In rotation: 3 / 3"] },
        { label: "Sick server", tag: "failure", title: "server-2 loses its database",
          body: "<p>server-2 loses its DB connection, but the process is still up.</p><p>Until the next probe, round robin still sends it <b>1 in 3</b> requests, and those fail with <b>500</b>.</p>",
          idea: "Between probes, a sick server keeps receiving traffic. Probe intervals are a trade-off.",
          changed: ["server-2: DB connection lost", "Failed requests +1"] },
        { label: "Rotate out", tag: "fix", title: "Out of rotation",
          body: "<p>Next probe: server-2 answers <b>503</b>. The balancer takes it <b>out of rotation</b>.</p><p>Traffic now flows only to the two healthy servers, and users see no errors.</p>",
          idea: "Health checks turn a broken server into a smaller pool, not an outage.",
          changed: ["In rotation: 2 / 3", "4 requests, 0 errors"] },
        { label: "Back in", tag: "concept", title: "Recovery is automatic",
          body: "<p>server-2 reconnects to its database. Its next probe passes, and the balancer puts it <b>back in rotation</b>.</p><p>Nobody had to touch the load balancer.</p>",
          idea: "Health checks remove and restore servers without a human in the loop.",
          changed: ["server-2 probe: 200", "In rotation: 3 / 3"] },
        { label: "Liveness trap", tag: "failure", title: "One DB blip restarts everything",
          body: "<p>A <b>liveness</b> check asks “is the process alive?”. This one also pings the database.</p><p>The DB blips for two seconds, so <b>every</b> instance fails liveness at once. The orchestrator restarts all of them, and the app is down while they cold-start.</p>",
          idea: "A liveness check that depends on a shared dependency turns a small blip into a full outage.",
          changed: ["All 3 servers restarting", "In rotation: 0 / 3, users get 503"] },
        { label: "Readiness", tag: "fix", title: "Split live from ready",
          body: "<p><code>/health/live</code> checks only the process. <code>/health/ready</code> checks dependencies like the database.</p><p>Same blip: instances stay alive but <b>not ready</b>, so they get no new traffic. When the DB is back, readiness passes and traffic resumes. Nobody restarted.</p>",
          idea: "Least connections when request cost varies; health checks remove sick servers; keep liveness independent of the DB.",
          changed: ["Servers: alive · not ready, then ready", "0 restarts"] }
      ],
      learn: [
        { text: "Why round robin fails when request cost varies", step: 0 },
        { text: "How least connections spreads the load", step: 1 },
        { text: "How health checks take sick servers out", step: 4 },
        { text: "Liveness vs readiness, and the restart trap", step: 7 }
      ],
      build(stage, k) {
        const svg = k.svg(760, 330, { label: "Clients, a load balancer and three servers with their in-flight requests" });
        stage.append(svg);
        const U = { x: 60, y: 170 }, LB = { x: 205, y: 170 };
        const S = [75, 170, 265].map(y => ({ x: 400, y }));
        k.line(svg, U, LB, { dashed: true });
        const lines = S.map(p => k.line(svg, LB, p, { dashed: true }));
        k.box(svg, { ...U, label: "Clients", icon: "👥", w: 100 });
        const lb = k.box(svg, { ...LB, label: "Load balancer", sub: "round robin", w: 150, h: 52, size: 13.5 });
        const srv = S.map((p, i) => k.box(svg, { ...p, label: `server-${i + 1}`, sub: "active 0 · peak 0", w: 130, h: 46, size: 13.5 }));
        const jobsG = S.map(() => { const g = k.s("g"); svg.append(g); return g; });
        const legend = k.text(svg, 610, 322, "numbers = ticks of work left · 9 = slow export", { size: 11, tone: "muted" });

        let algo = "Round robin", peakOne = 0, inRot = 3, failedN = 0;
        const metrics = () => k.hud({ Algorithm: algo, "Peak on one server": peakOne, "In rotation": `${inRot} / 3`, "Failed requests": failedN });
        metrics();

        function drawJobs(st) {
          st.forEach((s, i) => {
            jobsG[i].replaceChildren();
            s.jobs.forEach((j, p) => {
              const x = 478 + p * 30, y = S[i].y - 13;
              jobsG[i].append(k.s("rect", { x, y, width: 26, height: 26, rx: 6, fill: j.slow ? "warnSoft" : "accentSoft", stroke: j.slow ? "warn" : "accent", "stroke-width": 1.5 }));
              k.text(jobsG[i], x + 13, y + 17, String(j.left), { size: 11, weight: 700 });
            });
            srv[i].sub.textContent = `active ${s.jobs.length} · peak ${s.peak}`;
            k.tone(srv[i], s.jobs.length >= 3 ? "bad" : s.jobs.length === 2 ? "warn" : "neutral");
          });
        }

        async function simulate(pick, n) {
          const st = S.map(() => ({ jobs: [], peak: 0 }));
          peakOne = 0; metrics();
          drawJobs(st);
          for (let i = 0; i < n; i++) {
            for (const s of st) { s.jobs.forEach(j => j.left--); s.jobs = s.jobs.filter(j => j.left > 0); }
            drawJobs(st);
            const slow = i % 3 === 0;
            const target = pick(st, i);
            const opts = { r: 10, label: slow ? "9" : "1", size: 11, tone: slow ? "warn" : "accent" };
            await k.packet(svg, U, LB, { ...opts, ms: 240 });
            await k.packet(svg, LB, S[target], { ...opts, ms: 280 });
            st[target].jobs.push({ left: slow ? 9 : 1, slow });
            st[target].peak = Math.max(st[target].peak, st[target].jobs.length);
            peakOne = Math.max(...st.map(s => s.peak)); metrics();
            drawJobs(st);
            await k.sleep(160);
          }
          return st;
        }
        const roundRobin = (st, i) => i % 3;
        const leastConn = st => { let b = 0; st.forEach((s, i) => { if (s.jobs.length < st[b].jobs.length) b = i; }); return b; };

        async function probe(healthy, path = "/health/ready") {
          lb.sub.textContent = `probing ${path}`;
          await Promise.all(S.map(p => k.packet(svg, LB, p, { r: 5, tone: "lesson", ms: 340 })));
          S.forEach((p, i) => k.float(svg, p.x + 95, p.y - 6, healthy[i] ? "200" : "503", healthy[i] ? "good" : "bad"));
          await Promise.all(S.map((p, i) => k.packet(svg, p, LB, { r: 5, tone: healthy[i] ? "good" : "bad", ms: 340 })));
        }
        function setRotation(i, on) {
          lines[i].style.stroke = on ? k.colors.line : k.colors.bad;
          lines[i].setAttribute("stroke-dasharray", on ? "5 5" : "2 7");
          lines[i].setAttribute("opacity", on ? 1 : 0.6);
        }

        k.run(async () => {
          // 1 · round robin
          await k.step();
          k.say("Round robin: 1, 2, 3, 1, 2, 3… Every 3rd request is a slow export.");
          await k.sleep(1000);
          const rr = await simulate(roundRobin, 15);
          k.say(`Every export lands on <b>server-1</b>: ${rr[0].peak} at once.`);
          await k.pulse(srv[0]);
          await k.sleep(800);

          // 2 · least connections
          await k.step();
          algo = "Least connections"; metrics();
          lb.sub.textContent = "least connections";
          k.say("Same traffic, sent to the server with the <b>fewest in flight</b>.");
          await k.sleep(800);
          const lc = await simulate(leastConn, 15);
          const worst = Math.max(...lc.map(s => s.peak));
          k.say(`No server holds more than <b>${worst}</b> at once.`);
          await k.sleep(1000);

          // 3 · health checks
          await k.step();
          drawJobs(S.map(() => ({ jobs: [], peak: 0 })));
          srv.forEach(s => { s.sub.textContent = "healthy"; k.tone(s, "neutral"); });
          algo = "Round robin"; metrics();
          lb.sub.textContent = "round robin";
          k.say("The balancer probes <code>/health/ready</code> on each server.");
          await k.sleep(800);
          await probe([true, true, true]);
          lb.sub.textContent = "3 of 3 in rotation";
          await k.sleep(800);
          await probe([true, true, true]);
          lb.sub.textContent = "3 of 3 in rotation";
          await k.sleep(800);

          // 4 · a sick server
          await k.step();
          k.tone(srv[1], "bad"); srv[1].sub.textContent = "DB connection lost";
          k.say("server-2 loses its database. It still gets 1 in 3 requests…");
          await k.sleep(800);
          for (let i = 0; i < 3; i++) {
            await k.packet(svg, U, LB, { r: 8, ms: 220 });
            await k.packet(svg, LB, S[i], { r: 8, ms: 260 });
            k.float(svg, S[i].x + 95, S[i].y - 6, i === 1 ? "500" : "OK", i === 1 ? "bad" : "good");
            if (i === 1) { failedN++; metrics(); }
          }
          await k.sleep(1200);

          // 5 · out of rotation
          await k.step();
          k.say("Next probe: server-2 answers <b>503</b>.");
          await probe([true, false, true]);
          setRotation(1, false);
          inRot = 2; metrics();
          lb.sub.textContent = "2 of 3 in rotation";
          await k.sleep(800);
          k.say("Traffic flows only to the healthy servers.");
          for (let n = 0; n < 4; n++) {
            const i = n % 2 ? 2 : 0;
            await k.packet(svg, U, LB, { r: 8, ms: 220 });
            await k.packet(svg, LB, S[i], { r: 8, ms: 260 });
            k.float(svg, S[i].x + 95, S[i].y - 6, "OK", "good");
          }
          await k.sleep(800);

          // 6 · back in rotation
          await k.step();
          k.tone(srv[1], "neutral"); srv[1].sub.textContent = "DB reconnected";
          k.say("server-2 reconnects. The next probe passes…");
          await k.sleep(1000);
          await probe([true, true, true]);
          setRotation(1, true);
          inRot = 3; metrics();
          lb.sub.textContent = "3 of 3 in rotation";
          k.say("…and it’s <b>back in rotation</b>.");
          await k.sleep(1500);

          // 7 · liveness trap
          await k.step();
          const DB = { x: 650, y: 170 };
          const dbLines = S.map(p => k.line(svg, p, DB, { dashed: true, tone: "muted" }));
          const db = k.box(svg, { ...DB, label: "Database", icon: "🗄️", w: 130, h: 46 });
          db.setAttribute("opacity", 0);
          await k.tween(db, { opacity: 1 }, 500);
          k.say("A <b>liveness</b> check that also pings the database.");
          await k.sleep(1500);
          k.tone(db, "bad"); db.label.textContent = "🗄️ DB blip";
          k.say("The DB blips. Every instance fails liveness…");
          await probe([false, false, false], "/health/live");
          srv.forEach(s => { k.tone(s, "muted"); s.sub.textContent = "restarting…"; });
          S.forEach((_, i) => setRotation(i, false));
          inRot = 0; metrics();
          lb.sub.textContent = "0 of 3 in rotation";
          k.say("…so <b>all of them restart</b>. The app is down.");
          k.tone(db, "neutral"); db.label.textContent = "🗄️ Database";
          for (let n = 0; n < 3; n++) {
            await k.packet(svg, U, LB, { r: 8, ms: 220, tone: "bad" });
            k.float(svg, LB.x, LB.y - 40, "503", "bad");
            failedN++; metrics();
          }
          await k.sleep(1500);

          // 8 · readiness
          await k.step();
          srv.forEach(s => { k.tone(s, "neutral"); s.sub.textContent = "healthy"; });
          S.forEach((_, i) => setRotation(i, true));
          inRot = 3; metrics();
          k.say("Liveness checks only the process now. Same blip:");
          await k.sleep(1200);
          k.tone(db, "bad"); db.label.textContent = "🗄️ DB blip";
          await probe([false, false, false], "/health/ready");
          srv.forEach(s => { k.tone(s, "warn"); s.sub.textContent = "alive · not ready"; });
          inRot = 0; metrics();
          lb.sub.textContent = "waiting for ready";
          await k.sleep(1600);
          k.tone(db, "neutral"); db.label.textContent = "🗄️ Database";
          await probe([true, true, true], "/health/ready");
          srv.forEach(s => { k.tone(s, "good"); s.sub.textContent = "ready again"; });
          inRot = 3; metrics();
          lb.sub.textContent = "3 of 3 in rotation";
          k.say("Nobody restarted. A blip stays a blip.");
          await k.sleep(1500);
          dbLines.forEach(l => l.setAttribute("opacity", 0.4));
          legend.textContent = "";
          k.done();
        });
      }
    },

    play: {
      title: "Be the Load Balancer",
      goal: "You are the balancer. Send each waiting request to a server: <b>click it</b> or press <b>1</b>, <b>2</b>, <b>3</b>. Fewest in flight scores most. Never send to a server whose health check fails.",
      build(stage, k) {
        const TOTAL = 40, GAP = 1.35, WAIT = 4.5, SLOTS = 4, QUICK = 1, SLOW = 5;
        const svg = k.svg(760, 330, { label: "Incoming requests queue at the load balancer; three servers with job slots and health status" });
        stage.append(svg);
        const LB = { x: 265, y: 170 };
        const SY = [70, 170, 270];
        const SP = SY.map(y => ({ x: 470, y }));
        const srv = SP.map((p, i) => ({ jobs: [], healthy: true, seen: true, box: null, heart: null, jobsG: null, i }));

        SP.forEach(p => k.line(svg, LB, p, { dashed: true }));
        k.box(svg, { ...LB, label: "You", sub: "load balancer", icon: "⚖️", w: 104, h: 50, tone: "accent", size: 13.5 });
        k.text(svg, 110, 120, "waiting requests", { size: 11, tone: "muted" });
        k.text(svg, 640, 322, "1s = quick read · 5s = slow export", { size: 11, tone: "muted" });
        srv.forEach((s, i) => {
          for (let j = 0; j < SLOTS; j++) svg.append(k.s("rect", { x: 542 + j * 52, y: SY[i] - 18, width: 46, height: 36, rx: 7, fill: "surface2", stroke: "line", "stroke-dasharray": "4 3" }));
          s.jobsG = k.s("g"); svg.append(s.jobsG);
          s.box = k.box(svg, { ...SP[i], label: `${i + 1} · server-${i + 1}`, sub: "0 / 4 busy", w: 126, h: 50, size: 13.5 });
          s.heart = k.text(svg, SP[i].x, SY[i] - 32, "♥ 200 OK", { size: 11, weight: 700, tone: "good" });
          clickable(s.box, `Send to server ${i + 1}`, () => route(i));
        });
        const queueG = k.s("g"); svg.append(queueG);
        const ageBar = k.meter(svg, { x: 145, y: 200, w: 40, h: 5, max: WAIT, value: WAIT, tone: "accent" });
        ageBar.g.style.display = "none";

        // schedule: 12 slow exports among 40, the first request is quick
        const kinds = k.shuffle(Array.from({ length: TOTAL - 1 }, (_, i) => i < 12));
        kinds.unshift(false);
        const fails = (() => { const a = k.randInt(0, 2); let b = k.randInt(0, 1); if (b >= a) b++; return [{ at: 14, s: a }, { at: 35, s: b }]; })();
        const FAIL_FOR = 9;

        let t = 0, spawned = 0, routed = 0, score = 0, best = 0, over = false, lostDead = 0, dropped = 0, timeouts = 0;
        const queue = [];

        function hud() {
          k.hud({ Score: score, Routed: `${routed} / ${TOTAL}`, Quality: best ? `${Math.max(0, Math.round(score / best * 100))}%` : "—" });
        }
        function drawQueue() {
          queueG.replaceChildren();
          queue.slice(0, 4).forEach((q, n) => {
            const d = k.dot(queueG, 165 - n * 38, LB.y, { r: n === 0 ? 17 : 13, tone: q.slow ? "warn" : "accent", label: q.slow ? "5s" : "1s", size: n === 0 ? 12 : 11 });
            if (n === 0) { d.circle.style.stroke = k.colors.ink; d.circle.style.strokeWidth = 2.5; }
          });
          if (queue.length > 4) k.text(queueG, 30, LB.y + 4, `+${queue.length - 4}`, { size: 12, tone: "muted", weight: 700 });
          ageBar.g.style.display = queue.length ? "" : "none";
        }
        function drawServers() {
          srv.forEach((s, i) => {
            s.jobsG.replaceChildren();
            s.jobs.forEach((j, n) => {
              const x = 542 + n * 52, y = SY[i] - 18;
              s.jobsG.append(k.s("rect", { x, y, width: 46, height: 36, rx: 7, fill: j.slow ? "warnSoft" : "accentSoft", stroke: j.slow ? "warn" : "accent", "stroke-width": 1.5 }));
              s.jobsG.append(k.s("rect", { x: x + 4, y: y + 28, width: Math.max(0, 38 * j.left / j.dur), height: 4, rx: 2, fill: j.slow ? "warn" : "accent" }));
              k.text(s.jobsG, x + 23, y + 21, j.slow ? "5s" : "1s", { size: 11, weight: 700 });
            });
            s.box.sub.textContent = s.seen ? `${s.jobs.length} / ${SLOTS} busy` : "unhealthy";
            k.tone(s.box, !s.seen ? "bad" : s.jobs.length >= SLOTS ? "warn" : "neutral");
            s.box.setAttribute("aria-label", `Send to server ${i + 1}: ${s.jobs.length} of ${SLOTS} busy, ${s.seen ? "health check passing" : "health check failing"}`);
          });
        }

        function route(i) {
          if (over || !queue.length) return;
          const q = queue.shift();
          const s = srv[i];
          const healthy = srv.filter(x => x.healthy && x.jobs.length < SLOTS);
          const bestPts = healthy.length ? 10 - 3 * Math.min(...healthy.map(x => x.jobs.length)) : 0;
          best += bestPts;
          routed++;
          let pts, msg, tone;
          if (!s.healthy) {
            pts = s.seen ? -25 : -5; lostDead++; tone = "bad";
            msg = s.seen ? `server-${i + 1} is failing its health check: that request was lost. A balancer takes sick servers out of rotation.`
              : `server-${i + 1} had just died, before its next health check. Bad luck; the probe will catch it within 1.5 s.`;
          } else if (s.jobs.length >= SLOTS) {
            pts = -15; dropped++; tone = "bad";
            msg = `server-${i + 1} was full, so it answered 503. Pick the one with the fewest in flight.`;
          } else {
            pts = 10 - 3 * s.jobs.length; tone = pts === bestPts ? "good" : "warn";
            msg = pts === bestPts ? `Good: server-${i + 1} had the fewest in flight (${s.jobs.length}). +${pts}`
              : `+${pts}. server-${i + 1} already had ${s.jobs.length} in flight; another server had fewer.`;
            s.jobs.push({ slow: q.slow, left: q.slow ? SLOW : QUICK, dur: q.slow ? SLOW : QUICK });
          }
          score += pts;
          k.float(svg, SP[i].x, SY[i] - 40, pts > 0 ? `+${pts}` : String(pts), tone);
          k.say(msg);
          k.packet(svg, LB, SP[i], { r: 9, tone: q.slow ? "warn" : "accent", ms: 260 }).catch(() => {});
          drawQueue(); drawServers(); hud();
          checkEnd();
        }
        function checkEnd() {
          if (over || spawned < TOTAL || queue.length) return;
          over = true;
          const pct = best ? Math.round(score / best * 100) : 0;
          const notes = [];
          if (lostDead) notes.push(`${lostDead} sent to an unhealthy server`);
          if (dropped) notes.push(`${dropped} sent to a full server`);
          if (timeouts) notes.push(`${timeouts} timed out waiting`);
          const text = `Routing quality <b>${pct}%</b> (${score} of a possible ${best} points)${notes.length ? `; ${notes.join(", ")}` : ""}. ` +
            "Least connections keeps slow exports from piling up on one server, and health checks keep traffic away from sick ones.";
          k.after(600, () => {
            if (pct < 35) k.lose(`${text} Watch the health hearts and the busy counts.`);
            else k.win({ stars: k.starsFor(pct, 65, 85), text });
          });
        }

        function probe() {
          srv.forEach((s, i) => {
            k.packet(svg, LB, SP[i], { r: 4, tone: "lesson", ms: 260 }).then(() => {
              if (s.seen && !s.healthy && !over) k.say(`Health check: <b>server-${i + 1}</b> answers 503. Take it out of rotation until it passes again.`);
              s.seen = s.healthy;
              s.heart.textContent = s.healthy ? "♥ 200 OK" : "✖ 503 failing";
              s.heart.style.fill = s.healthy ? k.colors.good : k.colors.bad;
              drawServers();
            }, () => {});
          });
        }
        k.every(1500, probe);

        k.on(document, "keydown", e => {
          if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
          const n = { "1": 0, "2": 1, "3": 2 }[e.key];
          if (n !== undefined) { e.preventDefault(); route(n); }
        });

        let tick = 0;
        k.loop(dt => {
          if (over) return false;
          t += dt;
          // arrivals
          while (spawned < TOTAL && t >= 1 + spawned * GAP) { queue.push({ slow: kinds[spawned], age: 0 }); spawned++; drawQueue(); }
          // failures and recoveries
          for (const f of fails) {
            if (!f.started && t >= f.at) { f.started = true; srv[f.s].healthy = false; }
            if (f.started && !f.ended && t >= f.at + FAIL_FOR) { f.ended = true; srv[f.s].healthy = true; k.say(`server-${f.s + 1} recovered. Once its health check passes, it’s back in rotation.`); }
          }
          // work
          for (const s of srv) { s.jobs.forEach(j => j.left -= dt); s.jobs = s.jobs.filter(j => j.left > 0); }
          // waiting requests age out
          for (const q of queue) q.age += dt;
          if (queue.length) ageBar.set(Math.max(0, WAIT - queue[0].age), queue[0].age > WAIT * 0.6 ? "bad" : "accent");
          if (queue.length && queue[0].age >= WAIT) {
            queue.shift(); timeouts++; routed++;
            const healthy = srv.filter(x => x.healthy && x.jobs.length < SLOTS);
            best += healthy.length ? 10 - 3 * Math.min(...healthy.map(x => x.jobs.length)) : 0;
            k.float(svg, 165, LB.y - 30, "timeout", "bad");
            k.say("A request waited too long and timed out. Keep the queue moving.");
            drawQueue(); hud(); checkEnd();
          }
          tick += dt;
          if (tick > 0.1) { tick = 0; drawServers(); }
        });

        drawServers(); hud();
        k.say("Requests are arriving. <b>Slow 5s exports</b> tie a server up; spread them out. Watch the <b>♥ health checks</b>.");
      }
    }
  });
})();
