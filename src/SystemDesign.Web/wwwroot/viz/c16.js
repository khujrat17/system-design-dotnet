"use strict";
/* Concept 16 · Real-time communication. Watch: short polling wasting requests vs a WebSocket push, then a message
   lost across 3 servers and fixed by a Redis backplane. Play: Push It Live (pick a transport per feature, then scale out). */
Lab.define(16, {
  watch: {
    title: "“Out for delivery” never arrived",
    intro: "First compare asking over and over with a connection that stays open. Then scale out to three servers and follow who gets the message.",
    steps: [
      { label: "Polling", tag: "problem", title: "Asking “anything new?”",
        body: "<p><b>Short polling</b>: the browser asks the server every 2 seconds, whether or not anything happened.</p><p>Each poll is a full HTTP request and response.</p>",
        idea: "Most polls come back empty: wasted work on the browser, the network and the server.",
        changed: ["3 requests sent", "3 empty responses"] },
      { label: "Late", tag: "failure", title: "News waits for the next poll",
        body: "<p>A new message arrives on the server <b>right after</b> a poll. The browser won’t know until it asks again, up to <b>2 s later</b>.</p><p><b>Long polling</b> helps: the server <b>holds</b> the request until there is news. But every message still costs a fresh request.</p>",
        idea: "Polling trades latency against wasted requests. Poll faster and you waste more.",
        changed: ["Message delivered 1.4 s late", "More empty polls after it"] },
      { label: "Upgrade", tag: "technique", title: "Open a WebSocket",
        body: "<p>A <b>WebSocket</b> starts as one HTTP request with an <code>Upgrade</code> header. The server answers <code>101 Switching Protocols</code>.</p><p>From then on, the connection <b>stays open</b>.</p>",
        idea: "One request, then a long-lived connection that either side can write to.",
        changed: ["1 upgrade request", "The lane turns into an open connection"] },
      { label: "Push", tag: "technique", title: "The server pushes",
        body: "<p>The server <b>pushes</b> each message the instant it exists: no delay, no empty responses.</p><p>It’s <b>two-way</b>, so chat and games use it. <b>Server-sent events</b> (SSE) are the one-way version over plain HTTP, great for feeds and tickers.</p>",
        idea: "Short polling &lt; long polling &lt; SSE &lt; WebSockets (two-way). SignalR negotiates the best one.",
        changed: ["3 messages pushed, 0 s delay", "Browser sends on the same connection"] },
      { label: "Scale out", tag: "failure", title: "Three servers, one lost message",
        body: "<p>Now there are <b>three servers</b>. Each WebSocket lives on <b>one</b> of them: the customer’s phone on server-3, the support agent on server-2.</p><p>The courier’s webhook lands on <b>server-1</b> with “Out for delivery” for group <b>order-77</b>. Server-1 only knows its own connections.</p>",
        idea: "Behind a load balancer, the server that has the news is often not the server that holds the connection.",
        changed: ["Webhook hits server-1", "1 message lost: nobody in the group gets it"] },
      { label: "Backplane", tag: "fix", title: "A Redis backplane fans out",
        body: "<p>A <b>backplane</b>: every server publishes outgoing messages to <b>Redis pub/sub</b> and subscribes to everything. Each server delivers to the group members it holds.</p><p>In .NET, SignalR does this with <code>AddStackExchangeRedis()</code>, or Azure SignalR Service holds the connections for you.</p>",
        idea: "Any server must be able to reach any connection.",
        changed: ["Redis backplane added", "Agent and phone both receive the message"] },
      { label: "State", tag: "trade-off", title: "Connections are state",
        body: "<p>Open connections are <b>state</b> pinned to a server. You plan capacity in <b>concurrent connections</b>, not just requests per second.</p><p>Deploys and crashes drop connections, so clients must reconnect.</p>",
        idea: "Interview answer: “WebSockets via SignalR for chat, SSE for one-way feeds, a Redis backplane to scale out.”",
        changed: ["Each server pulses: it owns its connections"] }
    ],
    learn: [
      { text: "Why short polling wastes requests and adds delay", step: 1 },
      { text: "How a WebSocket upgrade works", step: 2 },
      { text: "WebSockets vs SSE vs long polling", step: 3 },
      { text: "Why push breaks across several servers", step: 4 },
      { text: "How a Redis backplane fixes it", step: 5 }
    ],
    build(stage, k) {
      const svg = k.svg(760, 330, { label: "A client and a server using short polling, then a WebSocket; then three servers with a Redis backplane" });
      stage.append(svg);

      let requests = 0, polls = 0, useful = 0, empty = 0, delay = "—", lost = 0, delivered = 0;
      const metrics = () => k.hud({ "HTTP requests": requests, "Empty responses": empty, "Delivery delay": delay, "Messages lost": lost, "Messages delivered": delivered });
      metrics();

      /* ---------------- scene 1: polling vs WebSocket ---------------- */
      const tr = {};
      function drawTransport() {
        const g = k.s("g"); svg.append(g);
        const lanes = [
          { y: 95, name: "Short polling (ask every 2 s)" },
          { y: 245, name: "WebSocket (one open connection)" }
        ];
        const L = lanes.map(l => {
          const c = { x: 110, y: l.y }, s = { x: 520, y: l.y };
          k.text(g, 40, l.y - 42, l.name, { size: 13, anchor: "start", weight: 800 });
          const line = k.line(g, c, s, { dashed: true });
          const cb = k.box(g, { ...c, label: "Browser", icon: "📱", w: 120, h: 44, size: 12 });
          const sb = k.box(g, { ...s, label: "Server", icon: "🖥️", w: 120, h: 44, size: 12 });
          const stat = k.text(g, 600, l.y - 6, "", { size: 12, anchor: "start", weight: 700 });
          const stat2 = k.text(g, 600, l.y + 14, "", { size: 12, anchor: "start", tone: "muted" });
          return { c, s, line, cb, sb, stat, stat2, from: { x: c.x + 62, y: l.y }, to: { x: s.x - 62, y: l.y } };
        });
        const P = L[0], W = L[1];
        const pStat = () => { P.stat.textContent = `requests: ${polls}`; P.stat2.textContent = `useful: ${useful}`; };
        pStat();
        Object.assign(tr, { g, P, W, pStat });
      }
      drawTransport();

      /* ---------------- scene 2: three servers and a backplane ---------------- */
      const bk = {};
      function drawBackplane() {
        const g = k.s("g"); svg.append(g);
        const SV = [{ x: 240, y: 160 }, { x: 430, y: 160 }, { x: 620, y: 160 }];
        const U = [
          { x: 240, y: 50, label: "Other user", icon: "💻", member: false, s: 0 },
          { x: 430, y: 50, label: "Support agent", icon: "🎧", member: true, s: 1 },
          { x: 620, y: 50, label: "Customer’s phone", icon: "📱", member: true, s: 2 }
        ];
        const HOOK = { x: 75, y: 160 }, BP = { x: 430, y: 280 };
        for (const u of U) k.line(g, u, SV[u.s], { tone: "good", width: 3 });
        k.line(g, HOOK, SV[0], { dashed: true });
        const servers = SV.map((p, i) => k.box(g, { ...p, label: `server-${i + 1}`, icon: "🖥️", w: 140, h: 48, size: 12 }));
        const users = U.map(u => k.box(g, { x: u.x, y: u.y, label: u.label, icon: u.icon, sub: u.member ? "in group order-77" : "not in group", w: 160, h: 46, size: 12 }));
        k.box(g, { ...HOOK, label: "Courier", sub: "webhook", icon: "🚚", w: 110, h: 46, size: 12 });
        Object.assign(bk, { g, SV, U, HOOK, BP, servers, users });
      }

      k.run(async () => {
        const { P, W, pStat } = tr;
        // one short poll: "?" up, answer back
        async function poll(news) {
          polls++; requests++; pStat(); metrics();
          await k.packet(tr.g, P.from, P.to, { r: 10, label: "?", size: 11, ms: 450 });
          await k.packet(tr.g, P.to, P.from, { r: 10, label: news ? "★" : "∅", size: 11, tone: news ? "good" : "muted", ms: 450 });
          if (!news) { empty++; metrics(); }
        }

        // 1 · short polling, nothing new
        await k.step();
        k.say("“Anything new?” every 2 seconds.");
        await k.sleep(600);
        for (let i = 0; i < 3; i++) { await poll(false); await k.sleep(650); }
        k.say("Three requests, three empty answers.");

        // 2 · a message arrives between polls
        await k.step();
        k.tone(P.sb, "warn");
        k.float(tr.g, P.s.x, P.s.y - 30, "★ new message", "warn");
        k.say("A new message arrives right after a poll…");
        await k.sleep(1400);
        await poll(true);
        useful++; delivered++; delay = "1.4 s"; pStat(); metrics();
        k.tone(P.sb, "neutral"); k.tone(P.cb, "good");
        k.float(tr.g, P.c.x, P.c.y - 30, "1.4 s late", "warn");
        k.say("…and the next poll picks it up 1.4 s late.");
        await k.sleep(650);
        k.tone(P.cb, "neutral");
        for (let i = 0; i < 2; i++) { await poll(false); await k.sleep(450); }

        // 3 · WebSocket upgrade
        await k.step();
        k.say("One HTTP request asks to upgrade…");
        await k.sleep(600);
        requests++; metrics();
        await k.packet(tr.g, W.from, W.to, { r: 12, label: "⇧", size: 12, ms: 600 });
        await k.packet(tr.g, W.to, W.from, { r: 14, label: "101", size: 11, tone: "good", ms: 600 });
        W.line.removeAttribute("stroke-dasharray");
        W.line.style.stroke = k.colors.good; W.line.setAttribute("stroke-width", 6);
        W.stat.textContent = "requests: 1"; W.stat2.textContent = "connection stays open";
        k.say("…<code>101 Switching Protocols</code>: the connection stays open.");

        // 4 · push, both ways
        await k.step();
        k.say("The server pushes each message the instant it exists.");
        for (let i = 0; i < 3; i++) {
          k.tone(W.sb, "warn");
          k.float(tr.g, W.s.x, W.s.y - 30, "★", "warn");
          await k.packet(tr.g, W.to, W.from, { r: 10, label: "★", size: 11, tone: "good", ms: 450 });
          k.tone(W.sb, "neutral"); k.tone(W.cb, "good");
          delivered++; delay = "0 s"; metrics();
          await k.sleep(700);
          k.tone(W.cb, "neutral");
        }
        k.say("And the browser can send on the same connection.");
        await k.packet(tr.g, W.from, W.to, { r: 10, label: "✎", size: 11, tone: "accent", ms: 450 });

        // 5 · scale out: message lost
        await k.step();
        await k.tween(tr.g, { opacity: 0 }, 400);
        tr.g.remove();
        drawBackplane();
        const { g, SV, U, HOOK, BP, servers, users } = bk;
        k.say("Three servers. The phone is on server-3, the agent on server-2.");
        await k.sleep(1600);
        k.say("The courier webhook lands on server-1.");
        await k.packet(g, HOOK, SV[0], { r: 11, label: "🚚", size: 11, ms: 700 });
        k.tone(servers[0], "warn");
        await k.sleep(700);
        const lostDot = k.dot(g, SV[0].x, SV[0].y - 24, { r: 10, tone: "bad", label: "✉", size: 11 });
        await k.tween(lostDot, { ty: SV[0].y - 50, opacity: 0 }, 900);
        lostDot.remove();
        k.tone(servers[0], "bad");
        k.tone(users[1], "bad"); k.tone(users[2], "bad");
        lost++; metrics();
        k.float(g, U[2].x, U[2].y + 34, "never arrives", "bad");
        k.say("Server-1 holds nobody in order-77: the message goes nowhere.");

        // 6 · Redis backplane
        await k.step();
        for (const b of [...servers, ...users]) k.tone(b, "neutral");
        const bpLines = SV.map(p => k.line(g, p, BP, { tone: "lesson", dashed: true, width: 2 }));
        const bp = k.box(g, { ...BP, label: "Redis backplane (pub/sub)", icon: "🔁", w: 420, h: 44, tone: "lesson", size: 13 });
        bp.setAttribute("opacity", 0);
        k.say("Every server publishes to Redis and subscribes to everything.");
        await k.tween(bp, { opacity: 1 }, 500);
        await k.sleep(1000);
        await k.packet(g, HOOK, SV[0], { r: 11, label: "🚚", size: 11, ms: 700 });
        k.tone(servers[0], "warn");
        await k.packet(g, SV[0], { x: SV[0].x, y: BP.y }, { r: 10, label: "✉", size: 11, tone: "lesson", ms: 550 });
        k.say("Redis fans it out to every server…");
        await Promise.all(SV.map(p => k.packet(g, { x: SV[0].x, y: BP.y }, { x: p.x, y: BP.y - 22 }, { r: 10, label: "✉", size: 11, tone: "lesson", ms: 500 })
          .then(() => k.packet(g, { x: p.x, y: BP.y - 22 }, p, { r: 10, label: "✉", size: 11, tone: "lesson", ms: 400 }))));
        servers.forEach(s => k.tone(s, "accent"));
        await Promise.all([1, 2].map(i => k.packet(g, SV[i], U[i], { r: 10, label: "✉", size: 11, tone: "good", ms: 600 })));
        k.tone(users[1], "good"); k.tone(users[2], "good");
        delivered += 2; metrics();
        k.float(g, U[2].x, U[2].y + 34, "Out for delivery ✔", "good");
        k.say("…and both group members get it.");

        // 7 · connections are state
        await k.step();
        bpLines.forEach(l => l.remove());
        servers.forEach(s => k.tone(s, "neutral"));
        k.say("Each open connection lives on one server.");
        for (const s of servers) await k.pulse(s);
        await k.sleep(800);
        k.done();
      });
    }
  },

  play: {
    title: "Push It Live",
    goal: "Seven features need live updates. Pick the transport for each and watch the traffic, then scale chat out to three servers. Best fit +100, partial credit for workable picks. Score 600 for 3 stars.",
    build(stage, k) {
      const T = ["Short polling", "Long polling", "SSE", "WebSocket"];
      const FEATS = [
        { name: "Multiplayer game", icon: "🎮", ctx: "Players send and receive moves about 20 times a second.", twoWay: true, pts: [0, 10, 30, 100],
          why: ["Polling 20 times a second per player floods the server, and moves still arrive late.",
            "Each update needs a fresh held request: far too chatty for 20 messages a second in both directions.",
            "Server → player is great, but every move the player makes needs its own HTTP POST upstream.",
            "One persistent two-way connection: moves flow both ways instantly."] },
        { name: "Live cricket score on a news page", icon: "🏏", ctx: "Millions of readers only receive updates; they never send anything.", pts: [20, 40, 100, 60],
          why: ["Millions of readers asking every few seconds: almost every response is empty.",
            "Works, but every update forces millions of readers to reconnect.",
            "A one-way stream over plain HTTP, with automatic reconnect: exactly what a read-only ticker needs.",
            "Works, but a two-way connection is more than a read-only ticker needs."] },
        { name: "“Is my export ready?”", icon: "📦", ctx: "A report export takes about 10 minutes. The page needs to know once, when it’s done.", rare: true, pts: [100, 60, 50, 30],
          why: ["Checking every 30 seconds for one rare event is simple and cheap. Polling is the right tool here.",
            "Holding a request open for 10 minutes fights timeouts for no real gain.",
            "An open stream for a single event 10 minutes away is overkill.",
            "A persistent two-way connection for one notification is overkill."] },
        { name: "Team chat", icon: "💬", ctx: "People type and read messages in both directions, all day.", twoWay: true, pts: [0, 30, 50, 100],
          why: ["Chat over short polling means constant empty requests and laggy messages.",
            "It works (it’s SignalR’s last fallback), but every message costs a new request.",
            "Incoming messages stream nicely, but each message you send is a separate HTTP POST.",
            "Two-way, low latency, one connection: the classic chat transport."] },
        { name: "Alerts behind an old corporate proxy", icon: "🏢", ctx: "The office proxy blocks WebSocket upgrades and buffers streaming responses.", proxy: true, pts: [50, 100, 20, 0],
          why: ["It gets through the proxy, but wastes requests and adds lag.",
            "Plain request/response that any proxy understands, yet near-instant. That’s why SignalR keeps long polling as a fallback.",
            "The proxy buffers the stream, so alerts arrive in late clumps.",
            "The proxy blocks the upgrade: nothing gets through at all."] },
        { name: "Live delivery map", icon: "🛵", ctx: "The customer watches the rider’s position, updated every few seconds. Nothing is sent back.", pts: [40, 50, 100, 80],
          why: ["Works, but each position arrives up to a poll interval late, plus lots of empty requests.",
            "Works, with a reconnect after every single position update.",
            "One-way updates over a single HTTP stream: simple and efficient.",
            "Works well, but you don’t need the upstream half of the connection."] }
      ];
      const SCALE = { name: "Chat on three servers", icon: "🖥️", ctx: "Chat now runs on 3 servers. Alice is on server-1, Bob on server-2, Chen on server-3. Alice posts in their room.",
        opts: ["Nothing extra", "Sticky sessions", "Redis backplane", "Azure SignalR Service"], pts: [0, 20, 100, 100],
        why: ["Each server only pushes to its own connections: Bob and Chen never see Alice’s message.",
          "Sticky sessions keep each user on one server, but don’t move messages between servers. Still only server-1 delivers.",
          "Every server publishes to Redis and hears every message, then pushes to its local connections. Everyone gets it.",
          "The managed service holds every connection, so any server can reach any user. Everyone gets it."] };
      const rounds = [...k.shuffle(FEATS), SCALE], N = rounds.length;
      let idx = 0, score = 0, best = 0;

      const svg = k.svg(740, 310, { label: "A browser and a server exchanging messages with the transport you picked" });
      stage.append(svg);
      const title = k.text(svg, 370, 32, "", { size: 16, weight: 800 });
      const scene = k.s("g"); svg.append(scene);
      const verdict = k.text(svg, 370, 298, "", { size: 14, weight: 800 });
      const stat = k.text(svg, 370, 274, "", { size: 12.5, weight: 700, tone: "muted" });
      const C = { x: 110, y: 140 }, S = { x: 630, y: 140 }, PX = { x: 370, y: 140 };
      const from = { x: C.x + 72, y: C.y }, to = { x: S.x - 72, y: S.y };

      function hud() { k.hud({ Feature: `${Math.min(idx + 1, N)} / ${N}`, Score: score, "Best picks": best }); }

      function setup() {
        const f = rounds[idx];
        hud();
        scene.replaceChildren();
        verdict.textContent = ""; stat.textContent = "";
        title.textContent = `${f.icon} ${f.name}`;
        if (f === SCALE) drawServers();
        else {
          scene.line = k.line(scene, C, S, { dashed: true });
          scene.c = k.box(scene, { ...C, label: "Browser", icon: "📱", w: 140, h: 48, size: 12.5 });
          scene.s = k.box(scene, { ...S, label: "Server", icon: "🖥️", w: 140, h: 48, size: 12.5 });
          if (f.proxy) scene.p = k.box(scene, { ...PX, label: "Old proxy", icon: "🧱", w: 120, h: 48, size: 12.5, tone: "warn" });
        }
        k.say(`<b>${f.name}.</b> ${f.ctx} Which do you pick?`);
        k.clearTools();
        let picked = false;
        const row = k.choices((f.opts || T).map((label, i) => ({ label, i })), (o, btn) => {
          if (picked) return;
          picked = true;
          row.querySelectorAll("button").forEach(b => { b.disabled = true; });
          k.run(() => resolve(f, o.i, btn, row));
        });
      }

      /* ----- transport animations ----- */
      const req = (label, tone = "accent", ms = 380) => k.packet(scene, from, to, { r: 13, label, size: 11, tone, ms });
      const res = (label, tone = "muted", ms = 380) => k.packet(scene, to, from, { r: 13, label, size: 11, tone, ms });
      async function bounceAtProxy(label) {
        const d = k.dot(scene, from.x, from.y, { r: 10, tone: "accent", label, size: 11 });
        await k.tween(d, { tx: PX.x - 70 }, 450);
        d.circle.style.fill = k.colors.bad;
        k.float(scene, PX.x, PX.y - 34, "✖ blocked", "bad");
        await k.tween(d, { opacity: 0 }, 400);
        d.remove();
      }
      async function animate(f, t) {
        let n = 0;
        const count = extra => { n++; stat.textContent = `HTTP requests: ${n}${extra ? ` · ${extra}` : ""}`; };
        if (t === 0) {            // short polling
          const polls = f.rare ? 3 : 6;
          for (let i = 0; i < polls; i++) {
            count(); await req("?");
            const hit = i === polls - 1;
            await res(hit ? "★" : "∅", hit ? "good" : "muted");
            if (f.twoWay && i % 2) { count("plus a POST per message sent"); await req("✎", "warn"); }
            await k.sleep(f.rare ? 500 : 150);
          }
          k.float(scene, C.x, C.y - 36, f.rare ? "a few cheap checks" : `${polls - 1} empty replies`, f.rare ? "good" : "bad");
        } else if (t === 1) {     // long polling
          for (let i = 0; i < 3; i++) {
            count();
            const held = k.dot(scene, from.x, from.y, { r: 10, label: "⏳", size: 11, tone: "accent" });
            await k.tween(held, { tx: to.x }, 380);
            await k.sleep(f.rare ? 900 : 450);
            held.remove();
            await res("★", "good");
            if (f.twoWay) { count("plus a POST per message sent"); await req("✎", "warn"); }
          }
          k.float(scene, C.x, C.y - 36, "one request per message", f.proxy ? "good" : "warn");
        } else if (t === 2) {     // SSE
          count();
          await req("GET");
          if (f.proxy) {
            k.tone(scene.p, "bad");
            const stuck = [];
            for (let i = 0; i < 3; i++) { stuck.push(k.dot(scene, PX.x + 30 + i * 8, PX.y - 30, { r: 7, tone: "warn" })); await k.packet(scene, to, { x: PX.x + 64, y: PX.y }, { r: 11, label: "★", size: 11, tone: "warn", ms: 350 }); }
            k.float(scene, PX.x, PX.y - 52, "buffered…", "bad");
            await k.sleep(800);
            stuck.forEach(d => d.remove());
            await res("★", "warn", 500);
            stat.textContent = "HTTP requests: 1 · events arrived late, all at once";
          } else {
            scene.line.removeAttribute("stroke-dasharray");
            scene.line.style.stroke = k.colors.good; scene.line.setAttribute("stroke-width", 4);
            for (let i = 0; i < 4; i++) { await res("★", "good", 330); await k.sleep(f.rare ? 900 : 120); }
            if (f.twoWay) for (let i = 0; i < 3; i++) { count("plus a POST per message sent"); await req("✎", "warn"); }
            k.float(scene, C.x, C.y - 36, f.twoWay ? "upstream needs extra requests" : "one stream, many events", f.twoWay ? "warn" : "good");
          }
        } else {                  // WebSocket
          count();
          if (f.proxy) { await bounceAtProxy("⇧"); stat.textContent = "upgrade blocked: 0 messages delivered"; return; }
          await req("⇧");
          await res("101", "good");
          scene.line.removeAttribute("stroke-dasharray");
          scene.line.style.stroke = k.colors.good; scene.line.setAttribute("stroke-width", 6);
          for (let i = 0; i < (f.rare ? 1 : 3); i++) {
            if (f.rare) await k.sleep(1200);
            await res("★", "good", 300);
            if (f.twoWay) await req("✎", "accent", 300);
            await k.sleep(100);
          }
          stat.textContent = `HTTP requests: 1 · connection held open${f.rare ? " for 10 minutes" : ""}`;
          k.float(scene, C.x, C.y - 36, f.rare ? "idle open connection" : "instant, both ways", f.rare ? "warn" : "good");
        }
      }

      /* ----- the scale-out round ----- */
      const SV = [{ x: 170, y: 155 }, { x: 370, y: 155 }, { x: 570, y: 155 }];
      const UP = [{ x: 170, y: 80, name: "Alice" }, { x: 370, y: 80, name: "Bob" }, { x: 570, y: 80, name: "Chen" }];
      const BP = { x: 370, y: 238 };
      function drawServers() {
        UP.forEach((u, i) => k.line(scene, u, SV[i], { tone: "good", width: 3 }));
        scene.servers = SV.map((p, i) => k.box(scene, { ...p, label: `server-${i + 1}`, icon: "🖥️", w: 140, h: 44, size: 12.5 }));
        scene.users = UP.map(u => k.box(scene, { ...u, label: u.name, icon: "🧑", w: 110, h: 38, size: 12.5 }));
      }
      async function animateScale(i) {
        await k.packet(scene, UP[0], SV[0], { r: 10, label: "✉", size: 11, ms: 500 });
        k.tone(scene.servers[0], "warn");
        if (i <= 1) {
          if (i === 1) k.float(scene, SV[0].x, SV[0].y + 36, "sticky: Alice ↔ server-1", "warn");
          await k.packet(scene, SV[0], UP[0], { r: 10, label: "✉", size: 11, tone: "good", ms: 500 });
          k.tone(scene.users[0], "good");
          k.tone(scene.users[1], "bad"); k.tone(scene.users[2], "bad");
          k.float(scene, UP[1].x, UP[1].y - 26, "✖ missed", "bad");
          k.float(scene, UP[2].x, UP[2].y - 26, "✖ missed", "bad");
          stat.textContent = "delivered to 1 of 3 users";
          return;
        }
        const hub = k.box(scene, { ...BP, label: i === 2 ? "Redis backplane" : "Azure SignalR Service", icon: i === 2 ? "🔁" : "☁️", w: 400, h: 40, tone: "lesson", size: 12.5 });
        hub.setAttribute("opacity", 0);
        await k.tween(hub, { opacity: 1 }, 350);
        await k.packet(scene, SV[0], { x: SV[0].x, y: BP.y - 20 }, { r: 10, label: "✉", size: 11, tone: "lesson", ms: 450 });
        await Promise.all(SV.map((p, j) => k.packet(scene, { x: SV[0].x, y: BP.y - 20 }, { x: p.x, y: BP.y - 20 }, { r: 10, label: "✉", size: 11, tone: "lesson", ms: 450 })
          .then(() => k.packet(scene, { x: p.x, y: BP.y - 20 }, i === 2 ? p : UP[j], { r: 10, label: "✉", size: 11, tone: "lesson", ms: 450 }))
          .then(() => i === 2 ? k.packet(scene, p, UP[j], { r: 10, label: "✉", size: 11, tone: "good", ms: 400 }) : null)));
        scene.users.forEach(u => k.tone(u, "good"));
        stat.textContent = "delivered to 3 of 3 users";
      }

      async function resolve(f, i, btn, row) {
        const top = Math.max(...f.pts), pts = f.pts[i];
        const isBest = pts === top;
        btn.classList.add(isBest ? "right" : "wrong");
        if (!isBest) row.querySelectorAll("button")[f.pts.indexOf(top)].classList.add("right");
        if (f === SCALE) await animateScale(i); else await animate(f, i);
        score += pts;
        if (isBest) best++;
        hud();
        verdict.textContent = isBest ? "✔ Best fit  +100" : pts > 0 ? `≈ Workable  +${pts}` : "✖ Poor fit  +0";
        verdict.style.fill = k.colors[isBest ? "good" : pts > 0 ? "warn" : "bad"];
        k.say(`${isBest ? "✔" : pts > 0 ? "≈" : "✖"} ${f.why[i]}`);
        k.button(idx + 1 < N ? "Next feature →" : "See results", () => {
          idx++;
          if (idx < N) setup(); else end();
        }, { primary: true });
      }

      function end() {
        k.clearTools();
        const text = `Score <b>${score}</b> of ${N * 100}, best pick for <b>${best} of ${N}</b>. Two-way and chatty: WebSocket. One-way streams: SSE. Rare events or hostile proxies: polling still has its place. And with more than one server, a backplane so any server can reach any connection.`;
        if (score < 250) k.lose(`${text} Ask: who sends, how often, and what sits in between?`);
        else k.win({ stars: k.starsFor(score, 420, 600), text });
      }

      setup();
    }
  }
});
