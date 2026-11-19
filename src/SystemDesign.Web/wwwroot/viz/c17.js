"use strict";
/* Concept 17 · API gateway and reverse proxy. Watch: clients calling services directly vs one gateway doing
   TLS, auth, rate limiting and routing. Play: Gateway Dispatcher (be the gateway: route, deny, 404 or 429). */
Lab.define(17, {
  watch: {
    title: "Why the admin panel leaked",
    intro: "First the app calls every service directly. Then one gateway takes over TLS, auth, rate limits and routing.",
    steps: [
      { label: "Direct calls", tag: "problem", title: "The app calls every service",
        body: "<p>ShopKart’s phone app talks to <b>Catalog</b>, <b>Orders</b> and <b>Admin</b> directly.</p><p>It must know <b>three addresses</b>, and all three services are reachable from the internet. Move one, and every client has to ship an update.</p>",
        idea: "Every service exposed to the internet is one more door you have to lock.",
        changed: ["3 direct connections", "Public addresses: 3"] },
      { label: "Copy-paste", tag: "problem", title: "Every service re-does the plumbing",
        body: "<p>Because each service faces the internet, each one does its own <b>TLS</b>, <b>authentication</b>, <b>rate limiting</b> and logging.</p><p>Three teams, three copies of the same cross-cutting code, three chances to get it wrong.</p>",
        idea: "Cross-cutting code copied into every service drifts apart over time.",
        changed: ["All three services turn amber: duplicated work"] },
      { label: "Leak", tag: "failure", title: "One team forgot auth",
        body: "<p>The Admin team forgot the auth check. An anonymous <code>GET /api/admin/users</code> walks straight in and gets the user list.</p><p>Nothing central was there to catch it.</p>",
        idea: "When security is spread over many services, the weakest one sets your security level.",
        changed: ["Admin turns red", "Data leaks: 1"] },
      { label: "Gateway", tag: "technique", title: "One front door",
        body: "<p>An <b>API gateway</b> is a reverse proxy with API features. Clients know <b>one host</b>; the services hide on the private network.</p><p>Every request passes the same pipeline: <b>TLS → Auth → Rate limit → Route</b>, driven by a route table.</p>",
        idea: "Cross-cutting rules live in one place, so every service gets them the same way.",
        changed: ["Direct links removed", "Public addresses: 1", "Pipeline and route table appear"] },
      { label: "Routing", tag: "concept", title: "The route table picks the service",
        body: "<p><code>/api/catalog</code> is public, so a request with no token is forwarded to Catalog and gets <b>200</b>.</p><p><code>/api/unknown</code> matches no route. The gateway answers <b>404</b> itself; nothing behind it is bothered.</p>",
        idea: "The gateway maps public paths to private services. Clients never see internal addresses.",
        changed: ["Forwarded (200): 1", "Blocked at gateway: 1 (404)"] },
      { label: "Auth", tag: "technique", title: "Tokens are checked at the edge",
        body: "<p><code>/api/orders</code> needs a token. Without one the gateway returns <b>401</b>, and the Orders service <b>never sees</b> the request.</p><p>The same request with a valid token passes auth and is routed to Orders.</p>",
        idea: "Validate tokens once at the gateway. Services still check fine-grained permissions themselves.",
        changed: ["401 returned by the gateway", "Valid token → Orders → 200"] },
      { label: "Rate limit", tag: "technique", title: "3 per second, then 429",
        body: "<p>A buggy script fires requests in a loop. The gateway allows <b>3 requests per second per client</b>.</p><p>Requests 4–6 get <b>429 Too Many Requests</b> with a <code>Retry-After</code> header. Catalog never feels the flood.</p>",
        idea: "One rate-limit policy at the gateway protects every service behind it.",
        changed: ["3 forwarded, 3 × 429", "Blocked at gateway: 5"] },
      { label: "Trade-off", tag: "trade-off", title: "The cost of one front door",
        body: "<p>The gateway adds <b>one extra hop</b> and becomes a component that must <b>scale and stay up</b>, so run several instances behind a load balancer.</p><p>Keep <b>business rules out</b> of it: it routes and protects, it doesn’t decide. In .NET: <b>YARP</b>, Ocelot or Azure API Management.</p>",
        idea: "Interview line: “one gateway (YARP) for TLS, auth and rate limits; services stay private and focus on business logic.”",
        changed: ["Gateway runs as 2+ instances", "Normal traffic pays 1 extra hop"] }
    ],
    learn: [
      { text: "Why exposing every service is risky", step: 2 },
      { text: "What an API gateway does for each request", step: 3 },
      { text: "Routing, 404 and 401 at the edge", step: 5 },
      { text: "Rate limiting with 429 + Retry-After", step: 6 },
      { text: "The cost: an extra hop to scale and keep up", step: 7 }
    ],
    build(stage, k) {
      const svg = k.svg(760, 340, { label: "A client calling three services, first directly and then through an API gateway" });
      stage.append(svg);
      const C = { x: 80, y: 165 }, G = { x: 330, y: 150 };
      const S = { catalog: { x: 640, y: 65 }, orders: { x: 640, y: 165 }, admin: { x: 640, y: 265 } };
      const ROUTES = [
        { p: "/api/catalog", svc: "catalog", auth: false },
        { p: "/api/orders", svc: "orders", auth: true },
        { p: "/api/admin", svc: "admin", auth: true }
      ];

      const direct = Object.values(S).map(p => k.line(svg, C, p, { dashed: true }));
      k.box(svg, { ...C, label: "Client", icon: "📱", w: 110 });
      const addr = k.text(svg, C.x, C.y + 42, "knows 3 addresses", { size: 11, tone: "muted" });
      const reqText = k.text(svg, 18, 112, "", { size: 11.5, anchor: "start", mono: true, tone: "ink" });
      const svcs = {
        catalog: k.box(svg, { ...S.catalog, label: "Catalog", icon: "🛍️", sub: "own TLS · own auth", w: 160, h: 52 }),
        orders: k.box(svg, { ...S.orders, label: "Orders", icon: "📦", sub: "own TLS · own auth", w: 160, h: 52 }),
        admin: k.box(svg, { ...S.admin, label: "Admin", icon: "🛠️", sub: "own TLS · auth: forgot!", w: 160, h: 52 })
      };

      // gateway parts, created later
      let gw = null, pills = [], rows = [], limText = null, used = 0;
      const LIMIT = 3;
      let publicAddr = 3, leaks = 0, forwarded = 0, blocked = 0;
      const metrics = () => k.hud({ "Public addresses": publicAddr, "Data leaks": leaks, "Forwarded (200)": forwarded, "Blocked at gateway": blocked });
      metrics();

      async function light(i, tone, fast) {
        k.tone(pills[i], tone);
        await k.sleep(fast ? 160 : 420);
      }
      function resetPills() { pills.forEach(p => k.tone(p, "neutral")); rows.forEach(r => r.style.fill = k.colors.muted); }

      async function reject(code, why, fast) {
        k.tone(gw, "bad");
        k.float(svg, G.x, G.y - 40, code, "bad");
        blocked++; metrics();
        if (why) k.say(why);
        await k.packet(svg, G, C, { tone: "bad", label: code, r: 14, ms: fast ? 350 : 550 });
        await k.sleep(fast ? 250 : 900);
        k.tone(gw, "accent"); resetPills();
      }

      async function viaGateway(path, token, { fast = false, why = "" } = {}) {
        reqText.textContent = `GET ${path} · ${token ? "token ✓" : "no token"}`;
        await k.packet(svg, C, G, { ms: fast ? 350 : 650, label: token ? "🔑" : "", r: 10 });
        await light(0, "good", fast);                                   // TLS terminated here
        const ri = ROUTES.findIndex(r => path.startsWith(r.p));
        const route = ROUTES[ri];
        if (route && route.auth && !token) {
          await light(1, "bad", fast);
          return reject("401", why || "<b>401</b>: no token. Rejected at the gateway; Orders never saw it.", fast);
        }
        await light(1, "good", fast);
        if (used >= LIMIT) {
          await light(2, "bad", fast);
          return reject("429", why, fast);
        }
        used++;
        if (limText) limText.textContent = `${used}/${LIMIT} this second`;
        await light(2, "good", fast);
        if (!route) {
          await light(3, "bad", fast);
          return reject("404", why || "<b>404</b>: no route matches <code>/api/unknown</code>.", fast);
        }
        rows[ri].style.fill = k.colors.accent;
        await light(3, "good", fast);
        if (why) k.say(why);
        const svc = svcs[route.svc], to = S[route.svc];
        await k.packet(svg, G, to, { ms: fast ? 350 : 600 });
        k.tone(svc, "good");
        await k.sleep(fast ? 150 : 400);
        await k.packet(svg, to, G, { tone: "good", label: "200", r: 14, ms: fast ? 300 : 500 });
        await k.packet(svg, G, C, { tone: "good", label: "200", r: 14, ms: fast ? 300 : 500 });
        forwarded++; metrics();
        k.tone(svc, "neutral");
        await k.sleep(fast ? 200 : 700);
        resetPills();
      }

      k.run(async () => {
        // 1 · direct calls
        await k.step();
        k.say("The app calls each service at its own address.");
        await k.sleep(1400);
        for (const name of ["catalog", "orders", "admin"]) {
          await k.packet(svg, C, S[name], { ms: 650 });
          k.pulse(svcs[name]);
        }
        await k.sleep(600);
        k.say("Three addresses, three services open to the internet.");

        // 2 · duplicated plumbing
        await k.step();
        k.say("Each team writes its own TLS, auth and rate limits.");
        for (const name of ["catalog", "orders", "admin"]) {
          k.tone(svcs[name], "warn");
          k.float(svg, S[name].x, S[name].y - 40, "TLS · auth · limits", "warn");
          await k.sleep(900);
        }
        await k.sleep(1200);
        k.say("Three copies of the same code.");

        // 3 · the leak
        await k.step();
        k.say("An anonymous request heads for Admin…");
        reqText.textContent = "GET /api/admin/users · no token";
        await k.sleep(900);
        await k.packet(svg, C, S.admin, { tone: "bad", ms: 900 });
        k.tone(svcs.admin, "bad");
        k.float(svg, S.admin.x, S.admin.y - 40, "data leak!", "bad");
        leaks++; metrics();
        await k.packet(svg, S.admin, C, { tone: "bad", label: "200", r: 14, ms: 900 });
        k.say("Admin answered with the user list. <b>Data leaked.</b>");
        await k.sleep(1200);

        // 4 · the gateway arrives
        await k.step();
        k.say("One gateway in front; the services move to the private network.");
        direct.forEach(l => l.remove());
        reqText.textContent = ""; addr.textContent = "knows 1 address";
        Object.values(svcs).forEach(s => { k.tone(s, "neutral"); s.sub.textContent = "business logic only"; });
        k.line(svg, C, G, {});
        Object.values(S).forEach(p => k.line(svg, G, p, { dashed: true }));
        gw = k.box(svg, { ...G, label: "API gateway", icon: "🚪", sub: "e.g. YARP", w: 160, h: 56, tone: "accent" });
        gw.setAttribute("opacity", 0);
        publicAddr = 1; metrics();
        await k.tween(gw, { opacity: 1 }, 700);
        await k.sleep(1200);
        k.say("Every request: <b>TLS → Auth → Rate limit → Route</b>.");
        pills = ["🔒 TLS", "🪪 Auth", "⏱ Limit", "🧭 Route"].map((l, i) =>
          k.box(svg, { x: 240 + i * 60, y: 212, w: 56, h: 26, label: l, size: 11, r: 7 }));
        rows = ROUTES.map((r, i) => {
          const t = k.text(svg, 212, 256 + i * 17, `${r.p.padEnd(13)}→ ${r.svc.padEnd(8)} ${r.auth ? "needs token" : "public"}`, { size: 11, anchor: "start", mono: true, tone: "muted" });
          t.style.whiteSpace = "pre";
          return t;
        });
        for (const p of pills) { k.tone(p, "accent"); await k.sleep(450); k.tone(p, "neutral"); }
        await k.sleep(600);

        // 5 · routing and 404
        await k.step();
        used = 0;
        k.say("<code>GET /api/catalog/phones</code>, no token: a public route.");
        await viaGateway("/api/catalog/phones", false);
        used = 0;
        k.say("A path nobody owns…");
        await k.sleep(600);
        await viaGateway("/api/unknown", true);
        used = 0;

        // 6 · auth at the edge
        await k.step();
        k.say("<code>GET /api/orders/mine</code> with no token…");
        await k.sleep(600);
        await viaGateway("/api/orders/mine", false);
        used = 0;
        k.say("Same request <b>with a valid token</b>.");
        await k.sleep(600);
        await viaGateway("/api/orders/mine", true);
        used = 0;

        // 7 · rate limit
        await k.step();
        k.say("A buggy script loops: 6 requests in one second.");
        limText = k.text(svg, 330, 240, `0/${LIMIT} this second`, { size: 11, tone: "muted" });
        await k.sleep(1000);
        for (let i = 0; i < 6; i++) {
          await viaGateway("/api/catalog/tv", true, {
            fast: true,
            why: i < LIMIT ? `Request ${i + 1}: under the limit, forwarded.` : `Request ${i + 1}: <b>429 Too Many Requests</b> + Retry-After.`
          });
        }

        // 8 · the trade-off
        await k.step();
        used = 0; limText.textContent = `0/${LIMIT} this second`;
        gw.sub.textContent = "YARP · 2+ instances";
        k.pulse(gw);
        k.float(svg, G.x, G.y - 40, "+1 hop", "warn");
        k.say("Normal traffic pays one extra hop through the gateway.");
        await k.sleep(1200);
        await viaGateway("/api/catalog/phones", true);
        k.say("It routes and protects. Business rules stay in the services.");
        await k.sleep(1200);
        k.done();
      });
    }
  },

  play: {
    title: "Gateway Dispatcher",
    goal: "You are the gateway. <b>Click the service</b> a request should go to, or reject it: <b>404</b> if no route matches, <b>401/403</b> if the token is missing or too weak, <b>429</b> if that client already used its 3 requests this window.",
    build(stage, k) {
      const WINDOWS = 3, PER_WINDOW = 6, LIMIT = 3, TOTAL = WINDOWS * PER_WINDOW;
      const svg = k.svg(760, 340, { label: "Incoming request, the gateway, three services and reject buttons" });
      stage.append(svg);

      const G = { x: 380, y: 160 }, CARD = { x: 140, y: 60 };
      const SV = {
        catalog: { x: 640, y: 65, label: "Catalog", icon: "🛍️", sub: "/api/catalog · public" },
        orders: { x: 640, y: 160, label: "Orders", icon: "📦", sub: "/api/orders · user token" },
        admin: { x: 640, y: 255, label: "Admin", icon: "🛠️", sub: "/api/admin · admin token" }
      };
      const RJ = {
        deny: { x: 290, y: 268, label: "401/403", icon: "🚫", tone: "bad", aria: "Reject: 401 or 403, missing or weak token" },
        "404": { x: 385, y: 268, label: "404", icon: "❓", tone: "muted", aria: "Reject: 404, no route" },
        "429": { x: 480, y: 268, label: "429", icon: "🐢", tone: "warn", aria: "Reject: 429, over the rate limit" }
      };

      k.line(svg, CARD, G, { dashed: true });
      for (const p of Object.values(SV)) k.line(svg, G, p, { dashed: true });
      const card = k.box(svg, { ...CARD, w: 250, h: 58, label: "Waiting for traffic…", sub: "—", tone: "accent" });
      const gw = k.box(svg, { ...G, label: "API gateway", icon: "🚪", sub: "that’s you", w: 150, h: 54 });

      function clickable(el, label, fn) {
        el.setAttribute("tabindex", 0); el.setAttribute("role", "button"); el.setAttribute("aria-label", label);
        el.addEventListener("click", fn);
        el.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } });
      }
      const svcBox = {};
      for (const [id, p] of Object.entries(SV)) {
        svcBox[id] = k.box(svg, { x: p.x, y: p.y, label: p.label, icon: p.icon, sub: p.sub, w: 176, h: 54 });
        clickable(svcBox[id], `Forward to ${p.label} service (${p.sub})`, () => decide(id));
      }
      const rjBox = {};
      for (const [id, p] of Object.entries(RJ)) {
        rjBox[id] = k.box(svg, { x: p.x, y: p.y, label: p.label, icon: p.icon, w: 88, h: 38, tone: p.tone, size: 12 });
        clickable(rjBox[id], p.aria, () => decide(id));
      }
      k.text(svg, 385, 236, "reject at the gateway", { size: 11, tone: "muted" });

      // per-client rate-limit panel
      const winText = k.text(svg, 22, 128, "", { size: 12, anchor: "start", weight: 700 });
      const CLIENTS = ["A", "B", "C"];
      const slots = {};
      CLIENTS.forEach((c, ci) => {
        const y = 158 + ci * 30;
        k.text(svg, 22, y + 4, `Client ${c}`, { size: 12, anchor: "start" });
        slots[c] = [0, 1, 2].map(j => { const r = k.s("rect", { x: 90 + j * 22, y: y - 8, width: 16, height: 16, rx: 4, fill: "surface2", stroke: "line" }); svg.append(r); return r; });
      });
      k.text(svg, 22, 258, "■ = request forwarded this window", { size: 11, anchor: "start", tone: "muted" });

      const used = { A: 0, B: 0, C: 0 };
      function drawSlots() {
        for (const c of CLIENTS) slots[c].forEach((r, j) => { r.style.fill = k.colors[j < used[c] ? "accent" : "surface2"]; });
      }

      // request generation
      const CAT = ["/api/catalog/phones", "/api/catalog/tv", "/api/catalog/42"];
      const ORD = ["/api/orders/mine", "/api/orders/42"];
      const ADM = ["/api/admin/users", "/api/admin/stats"];
      const UNK = ["/api/cart", "/api/payments/7", "/api/v2/users", "/catalog/phones"];
      function validFor(token) {
        if (token === "none") return k.pick(CAT);
        if (token === "user") return k.pick([...CAT, ...ORD, ...ORD]);
        return k.pick([...ORD, ...ADM, ...ADM]);
      }
      function genWindow() {
        const heavy = k.pick(CLIENTS);
        const htoken = k.pick(["none", "user", "admin"]);
        const reqs = [];
        for (let i = 0; i < 4; i++) reqs.push({ client: heavy, token: htoken, path: validFor(htoken) });
        const others = CLIENTS.filter(c => c !== heavy);
        for (let i = 0; i < PER_WINDOW - 4; i++) {
          const client = others[i % 2];
          const kind = k.pick(["noToken", "weakToken", "unknown", "valid"]);
          if (kind === "noToken") reqs.push({ client, token: "none", path: k.pick([...ORD, ...ADM]) });
          else if (kind === "weakToken") reqs.push({ client, token: "user", path: k.pick(ADM) });
          else if (kind === "unknown") reqs.push({ client, token: k.pick(["none", "user", "admin"]), path: k.pick(UNK) });
          else { const t = k.pick(["none", "user", "admin"]); reqs.push({ client, token: t, path: validFor(t) }); }
        }
        return k.shuffle(reqs);
      }
      const queue = [];
      for (let w = 0; w < WINDOWS; w++) queue.push(...genWindow());

      function expected(r) {
        const svc = r.path.startsWith("/api/catalog") ? "catalog" : r.path.startsWith("/api/orders") ? "orders" : r.path.startsWith("/api/admin") ? "admin" : null;
        if (!svc) return "404";
        if (svc === "orders" && r.token === "none") return "deny";
        if (svc === "admin" && r.token !== "admin") return "deny";
        if (used[r.client] >= LIMIT) return "429";
        return svc;
      }
      const WHY = {
        "404": r => `<code>${r.path}</code> matches no route, so the answer is <b>404</b>.`,
        deny: r => `<code>${r.path}</code> needs ${r.path.startsWith("/api/admin") ? "an <b>admin</b> token" : "a token"}, and it had <b>${r.token}</b>: reject with 401/403.`,
        "429": r => `Client ${r.client} already used its ${LIMIT} requests this window: <b>429</b>.`,
        catalog: () => "It was valid and under the limit: forward to <b>Catalog</b>.",
        orders: () => "It was valid and under the limit: forward to <b>Orders</b>.",
        admin: () => "It was valid and under the limit: forward to <b>Admin</b>."
      };

      let idx = 0, correct = 0, mistakes = 0, busy = true, cur = null, dot = null;
      function hud() { k.hud({ Request: `${Math.min(idx + 1, TOTAL)} / ${TOTAL}`, Correct: correct, Mistakes: mistakes }); }

      async function next() {
        if (idx >= TOTAL) return end();
        if (idx % PER_WINDOW === 0) {
          used.A = used.B = used.C = 0; drawSlots();
          winText.textContent = `Window ${idx / PER_WINDOW + 1} of ${WINDOWS} · limit ${LIMIT} per client`;
          if (idx > 0) { k.toast("New rate-limit window: counters reset", "accent"); await k.sleep(700); }
        }
        cur = queue[idx];
        hud();
        card.label.textContent = `GET ${cur.path}`;
        card.sub.textContent = `client ${cur.client} · token: ${cur.token === "none" ? "none" : cur.token}`;
        k.pulse(card);
        dot = k.dot(svg, CARD.x, CARD.y, { r: 13, tone: "accent", label: cur.client, size: 12 });
        await k.tween(dot, { tx: G.x - 50, ty: G.y }, 450);
        busy = false;
      }

      function decide(choice) {
        if (busy || !cur) return;
        busy = true;
        k.run(async () => {
          const r = cur, exp = expected(r), ok = choice === exp;
          const forward = !!SV[choice];
          if (forward) {
            used[r.client]++; drawSlots();
            await k.tween(dot, { tx: SV[choice].x - 95, ty: SV[choice].y }, 450);
            const box = svcBox[choice];
            if (ok) { k.tone(box, "good"); k.float(svg, SV[choice].x, SV[choice].y - 36, "200 ✓", "good"); }
            else {
              k.tone(box, exp === "429" ? "warn" : "bad");
              const msg = exp === "deny" ? "🔓 leak!" : exp === "404" ? "not my path" : exp === "429" ? "flooded" : "wrong service";
              k.float(svg, SV[choice].x, SV[choice].y - 36, msg, exp === "429" ? "warn" : "bad");
            }
          } else {
            dot.circle.style.fill = k.colors[ok ? "muted" : "bad"];
            await k.tween(dot, { tx: CARD.x, ty: CARD.y + 20, opacity: 0 }, 450);
            k.float(svg, G.x, G.y - 40, ok ? `${choice === "deny" ? "401/403" : choice} ✓` : SV[exp] ? "blocked a real user!" : "wrong status code", ok ? "good" : "bad");
            if (!ok) k.tone(card, "bad");
          }
          if (ok) { correct++; k.say(`✓ ${WHY[exp](r)}`); }
          else { mistakes++; k.say(`✗ ${WHY[exp](r)}`); }
          hud();
          await k.sleep(ok ? 800 : 1900);
          dot.remove(); dot = null;
          for (const b of Object.values(svcBox)) k.tone(b, "neutral");
          k.tone(card, "accent");
          idx++;
          await next();
        });
      }

      function end() {
        const text = `You handled <b>${correct} of ${TOTAL}</b> requests correctly. A gateway checks the route, then auth, then the rate limit, and only then forwards, so services only ever see valid, fair traffic.`;
        if (correct < 10) k.lose(`${text} Read the route table on each service: unknown paths are 404, missing or weak tokens are 401/403, and a client with 3 filled squares gets 429.`);
        else k.win({ stars: k.starsFor(correct, 14, 17), text });
      }

      k.say("Requests arrive at your gateway one at a time. Check: <b>route exists?</b> → <b>token good enough?</b> → <b>under the limit?</b> → forward.");
      drawSlots(); hud();
      k.run(async () => { await k.sleep(900); await next(); });
    }
  }
});
