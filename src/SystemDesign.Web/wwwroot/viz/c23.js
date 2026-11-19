"use strict";
/* Concept 23 · Authentication and authorisation. Watch: a signed token is issued, verified without a database,
   tampered with, stolen, revoked with a deny-list and finally expires; 401 vs 403. Play: You Are the API. */
(function () {
  const hhmm = m => `10:${String(m).padStart(2, "0")}`;

  Lab.define(23, {
    watch: {
      title: "The token that couldn't be cancelled",
      intro: "Watch the four checks the API runs on every request, and notice which of them need no database.",
      steps: [
        { label: "Sign in", tag: "problem", title: "Prove who you are, once",
          body: "<p>Every API request must prove who is calling, without asking the database each time. So Asha signs in once at the <b>identity provider</b>: that is <b>authentication</b>.</p><p>The provider writes <b>claims</b> (sub, role, scope, exp, jti) and signs them: <code>sig = HMAC-SHA256(key, header.payload)</code>. The key lives in a vault, never in code.</p>",
          idea: "A JWT is just signed claims: anyone can read them, only the key holder can produce the signature.",
          changed: ["Token card appears", "exp 10:15: a 15-minute lifetime"] },
        { label: "Verify", tag: "technique", title: "Checked without a database",
          body: "<p>Asha calls <code>GET /orders</code>. The API recomputes the signature with its key, then checks <b>exp</b>, revocation and <b>scope</b>.</p><p>No session table, <b>no database lookup</b>. Any server with the key can verify, which is why tokens scale.</p>",
          idea: "Stateless verification is the whole point of signed tokens.",
          changed: ["All four checks pass", "200 OK, 0 DB lookups"] },
        { label: "403", tag: "concept", title: "Known user, not allowed",
          body: "<p><code>POST /orders/7/refund</code> needs scope <b>orders.refund</b>. Asha's token only has orders.read.</p><p>We know exactly who she is; she just may not do this. <b>Authorisation</b> fails → <b>403 Forbidden</b>.</p>",
          idea: "AuthZ is a separate question from AuthN: what may this identity do?",
          changed: ["Scope check fails", "403 count +1"] },
        { label: "401", tag: "concept", title: "No token, no identity",
          body: "<p>A request arrives with <b>no token at all</b>. We don't know who this is, so <b>authentication</b> fails → <b>401 Unauthorized</b>.</p><p>Rule of thumb: 401 = who are you? 403 = I know you, but no.</p>",
          idea: "Getting 401 vs 403 right tells clients whether to sign in again or give up.",
          changed: ["First check fails", "401 count +1"] },
        { label: "Tamper", tag: "failure", title: "Editing the payload breaks the signature",
          body: "<p>An attacker copies the token and edits role → <b>admin</b>, scope → <b>orders.*</b>.</p><p>The API hashes the edited payload with its key: the result no longer matches the signature, and without the key no new one can be made → <b>401</b>.</p>",
          idea: "The signature protects integrity, not secrecy. Never put secrets in the payload.",
          changed: ["Attacker appears", "Signature check fails: 401"] },
        { label: "Stolen", tag: "failure", title: "A stolen token just works",
          body: "<p>Worse: the attacker steals Asha's <b>real, unedited</b> token, say from a leaked log line.</p><p>Every check passes. A signed token is valid <b>until it expires</b>, and there is no server-side session to delete.</p>",
          idea: "The same property that makes tokens scale makes them hard to revoke.",
          changed: ["Attacker gets 200 OK", "Result shown in warning colour"] },
        { label: "Deny-list", tag: "fix", title: "Revoke by token ID",
          body: "<p>Asha reports it. Security adds the token's <b>jti</b> (<code>t-1</code>) to a small <b>deny-list</b> the API checks on every request.</p><p>The stolen token now fails the revocation check → <b>401</b>.</p>",
          idea: "A deny-list brings back one fast lookup, so keep it tiny: only revoked tokens that haven't expired.",
          changed: ["t-1 on the deny-list", "DB lookups start counting"] },
        { label: "Expiry", tag: "trade-off", title: "Short lifetimes limit the damage",
          body: "<p>Asha signs in again and gets <b>t-2</b>, valid until 10:17. At 10:15 t-1 would have expired anyway, so the deny-list forgets it.</p><p>At 10:18 t-2 is past its <b>exp</b> → <b>401</b>.</p>",
          idea: "Short expiry (minutes) bounds how long a stolen token is useful.",
          changed: ["Clock runs to 10:18", "Deny-list empties itself", "Expired token: 401"] },
        { label: "Refresh", tag: "result", title: "Refresh tokens: the moment to say no",
          body: "<p>Her app quietly swaps its <b>refresh token</b> for a new access token, <b>t-3</b>. That swap is where the provider can refuse a revoked user.</p><p>AuthN fails with 401, AuthZ with 403.</p>",
          idea: "Signed tokens scale because they're checked locally, so revocation needs short expiry or a deny-list.",
          changed: ["New token t-3, exp 10:33", "GET /orders: 200 OK again"] }
      ],
      learn: [
        { text: "How a signed token is verified without a database", step: 1 },
        { text: "401 Unauthorized vs 403 Forbidden", step: 3 },
        { text: "Why tampering fails but stealing works", step: 5 },
        { text: "Revoking with a deny-list and short expiry", step: 7 }
      ],
      build(stage, k) {
        const svg = k.svg(760, 340, { label: "A user, an identity provider, an API with its checks, a token card and a deny-list" });
        stage.append(svg);
        const P = { user: { x: 70, y: 170 }, idp: { x: 250, y: 58 }, api: { x: 410, y: 170 }, thief: { x: 70, y: 292 }, deny: { x: 642, y: 290 } };
        k.line(svg, P.user, P.idp, { dashed: true });
        k.line(svg, P.user, P.api, { dashed: true });
        const thiefLine = k.line(svg, P.thief, P.api, { dashed: true });
        thiefLine.setAttribute("opacity", 0);
        const user = k.box(svg, { ...P.user, label: "Asha", icon: "🧑", w: 100 });
        const idp = k.box(svg, { ...P.idp, label: "Identity provider", sub: "signs with the 🔑", w: 170, h: 52 });
        const api = k.box(svg, { ...P.api, label: "Orders API", sub: "verifies with the 🔑", w: 160, h: 52 });
        const thief = k.box(svg, { ...P.thief, label: "Attacker", icon: "🕵️", w: 116 });
        thief.setAttribute("opacity", 0);
        const reqText = k.text(svg, 240, 158, "", { size: 12, weight: 700, mono: true });

        // the API's checks
        const checks = ["signature valid", "not expired", "not revoked", "has scope"].map((name, i) =>
          ({ name, t: k.text(svg, 340, 222 + i * 20, `○ ${name}`, { anchor: "start", size: 12, tone: "muted" }) }));
        const result = k.text(svg, 410, 316, "", { size: 15, weight: 800 });
        function resetChecks(scope) {
          checks[3].name = scope ? `has scope ${scope}` : "has scope";
          for (const c of checks) { c.t.textContent = `○ ${c.name}`; c.t.style.fill = k.colors.muted; }
          result.textContent = "";
        }
        async function verify(res) {   // booleans for each check in order; stops at the first failure
          for (let i = 0; i < res.length; i++) {
            await k.sleep(420);
            const c = checks[i];
            c.t.textContent = `${res[i] ? "✓" : "✗"} ${c.name}`;
            c.t.style.fill = res[i] ? k.colors.good : k.colors.bad;
            if (!res[i]) break;
          }
          await k.sleep(300);
        }

        // the token card
        const card = k.s("g"); svg.append(card);
        card.append(k.s("rect", { x: 535, y: 20, width: 215, height: 196, rx: 10, fill: "surface2", stroke: "line", "stroke-width": 1.5 }));
        k.text(card, 642, 40, "🎫 Access token (JWT)", { size: 12.5, weight: 700 });
        const rows = {};
        [["alg", "HS256", 64, "muted"], ["sub", "asha", 88, "ink"], ["role", "customer", 106, "ink"], ["scope", "orders.read", 124, "ink"],
          ["exp", hhmm(15), 142, "ink"], ["jti", "t-1", 160, "ink"], ["sig", "9f3a…c27e", 194, "accent"]].forEach(([key, val, y, tone]) => {
          k.text(card, 548, y, key, { anchor: "start", size: 11.5, mono: true, tone: "muted" });
          rows[key] = k.text(card, 600, y, val, { anchor: "start", size: 11.5, mono: true, tone, weight: 700 });
        });
        k.text(card, 735, 76, "header", { anchor: "end", size: 11, tone: "muted" });
        k.text(card, 735, 178, "payload ↑", { anchor: "end", size: 11, tone: "muted" });
        const setRow = (key, val, tone = "ink") => { rows[key].textContent = val; rows[key].style.fill = k.colors[tone]; };
        async function flash(el) {   // blink a text twice (scaling a <text> would move it, so fade instead)
          for (let i = 0; i < 2; i++) { await k.tween(el, { opacity: 0.15 }, 180); await k.tween(el, { opacity: 1 }, 260); }
        }
        card.setAttribute("opacity", 0);

        let now = 0;
        const clock = k.text(svg, 642, 238, `🕒 now ${hhmm(now)}`, { size: 13, weight: 700 });
        const deny = k.box(svg, { ...P.deny, label: "Deny-list", icon: "⛔", sub: "empty", w: 200, h: 50 });
        async function clockTo(m) {
          while (now < m) {
            now++; clock.textContent = `🕒 now ${hhmm(now)}`;
            if (now === 15 && deny.sub.textContent !== "empty") {
              deny.sub.textContent = "empty"; k.tone(deny, "neutral");
              k.float(svg, P.deny.x, P.deny.y - 30, "t-1 expired: forget it", "muted");
            }
            await k.sleep(170);
          }
        }

        const tally = { 200: 0, 401: 0, 403: 0 };
        let dbLookups = 0, denyOn = false;
        const metrics = () => k.hud({ "200 OK": tally[200], "401": tally[401], "403": tally[403], "DB lookups": dbLookups, Requests: tally[200] + tally[401] + tally[403] });
        metrics();

        async function request(from, method, label, scope, res, code) {
          resetChecks(scope);
          reqText.textContent = method;
          k.place(reqText, { tx: 0, ty: from === P.thief ? 58 : 0 });
          await k.packet(svg, from, P.api, { label, r: 14, size: 9, ms: 800, tone: from === P.thief ? "bad" : "accent" });
          k.tone(api, "accent");
          await verify(res);
          const good = code === 200;
          const txt = { 200: "200 OK", 401: "401 Unauthorized", 403: "403 Forbidden" }[code];
          result.textContent = `→ ${txt}`;
          result.style.fill = good ? k.colors.good : k.colors.bad;
          k.tone(api, good ? "good" : "bad");
          tally[code]++;
          if (denyOn && res.length >= 3) dbLookups++;
          metrics();
          await k.packet(svg, P.api, from, { label: String(code), r: 14, size: 9, ms: 700, tone: good ? "good" : "bad" });
          k.tone(api, "neutral");
          reqText.textContent = "";
        }

        k.run(async () => {
          /* 1 · sign in */
          await k.step();
          resetChecks();
          k.say("Asha sends her password to the identity provider.");
          await k.sleep(800);
          await k.packet(svg, P.user, P.idp, { label: "pw", r: 13, ms: 800 });
          k.tone(idp, "accent");
          await k.sleep(500);
          k.say("The provider signs her claims with its key.");
          await k.tween(card, { opacity: 1 }, 600);
          await flash(rows.sig);
          await k.sleep(1200);
          await k.packet(svg, P.idp, P.user, { label: "JWT", r: 14, size: 9, ms: 800, tone: "good" });
          k.tone(idp, "neutral");
          k.say("Asha now holds a signed <b>JWT</b>.");
          await k.sleep(600);

          /* 2 · verify locally */
          await k.step();
          k.say("<b>GET /orders</b> with the token: the API runs its checks.");
          await k.sleep(800);
          await request(P.user, "GET /orders", "JWT", "orders.read", [true, true, true, true], 200);
          k.say("All four checks pass → <b>200 OK</b>. No database touched.");
          await k.sleep(1200);

          /* 3 · 403 */
          await k.step();
          k.say("<b>POST /orders/7/refund</b> needs <b>orders.refund</b>…");
          await k.sleep(1000);
          await request(P.user, "POST /orders/7/refund", "JWT", "orders.refund", [true, true, true, false], 403);
          k.say("Known user, missing scope → <b>403 Forbidden</b>.");
          await k.sleep(1200);

          /* 4 · 401 */
          await k.step();
          k.say("A request with <b>no token at all</b>…");
          await k.sleep(1000);
          await request(P.user, "GET /orders", "∅", "orders.read", [false], 401);
          k.say("Unknown caller → <b>401 Unauthorized</b>.");
          await k.sleep(1200);

          /* 5 · tampering */
          await k.step();
          thiefLine.setAttribute("opacity", 1);
          await k.tween(thief, { opacity: 1 }, 500);
          k.say("The attacker edits role → <b>admin</b>, scope → <b>orders.*</b>.");
          setRow("role", "admin", "bad"); setRow("scope", "orders.*", "bad");
          await flash(rows.role);
          await k.sleep(1000);
          await request(P.thief, "POST /orders/7/refund", "JWT", "orders.refund", [false], 401);
          k.say("Recomputed signature doesn't match → <b>401</b>.");
          setRow("role", "customer"); setRow("scope", "orders.read");
          await k.sleep(1200);

          /* 6 · stolen token */
          await k.step();
          k.say("The attacker replays Asha's <b>real</b> token…");
          await k.sleep(1200);
          await request(P.thief, "GET /orders", "JWT", "orders.read", [true, true, true, true], 200);
          result.style.fill = k.colors.warn;
          k.say("Every check passes: the thief gets <b>200 OK</b>.");
          await k.sleep(1200);

          /* 7 · deny-list */
          await k.step();
          k.say("Security puts <b>jti t-1</b> on the deny-list.");
          await k.packet(svg, P.idp, P.deny, { label: "t-1", r: 13, size: 9, ms: 1000, tone: "bad" });
          deny.sub.textContent = "t-1"; k.tone(deny, "bad");
          denyOn = true;
          await k.sleep(800);
          await request(P.thief, "GET /orders", "JWT", "orders.read", [true, true, false], 401);
          k.say("Revoked → <b>401</b>, at the cost of one lookup.");
          await k.sleep(1000);
          thiefLine.setAttribute("opacity", 0);
          await k.tween(thief, { opacity: 0 }, 400);

          /* 8 · expiry */
          await k.step();
          k.say("Asha signs in again: fresh token <b>t-2</b>.");
          await k.packet(svg, P.user, P.idp, { label: "pw", r: 13, ms: 600 });
          now = 2; clock.textContent = `🕒 now ${hhmm(now)}`;
          setRow("exp", hhmm(17)); setRow("jti", "t-2"); setRow("sig", "41d0…9b8a", "accent");
          await k.packet(svg, P.idp, P.user, { label: "JWT", r: 14, size: 9, ms: 600, tone: "good" });
          await k.sleep(600);
          k.say("Time passes…");
          await clockTo(18);
          await k.sleep(600);
          setRow("exp", hhmm(17), "bad");
          k.say("10:18 is past t-2's <b>exp</b> (10:17)…");
          await k.sleep(1000);
          await request(P.user, "GET /orders", "JWT", "orders.read", [true, false], 401);
          k.say("Expired → <b>401</b>.");
          await k.sleep(1000);

          /* 9 · refresh */
          await k.step();
          k.say("The app swaps its <b>refresh token</b> for a new access token.");
          await k.sleep(800);
          await k.packet(svg, P.user, P.idp, { label: "ref", r: 13, size: 9, ms: 700 });
          setRow("exp", hhmm(33)); setRow("jti", "t-3"); setRow("sig", "c83e…07f1", "accent");
          await k.packet(svg, P.idp, P.user, { label: "JWT", r: 14, size: 9, ms: 700, tone: "good" });
          await k.sleep(600);
          await request(P.user, "GET /orders", "JWT", "orders.read", [true, true, true, true], 200);
          k.say("Fresh token <b>t-3</b> → <b>200 OK</b> again.");
          await k.sleep(1200);
          k.done();
        });
      }
    },

    play: {
      title: "You Are the API",
      goal: "Twelve requests arrive. Check each token like the API would and answer <b>200</b>, <b>401</b> or <b>403</b> before the client times out. Keys: 1, 2, 3.",
      build(stage, k) {
        const svg = k.svg(760, 330, { label: "An incoming request card with its token, and the server's clock and deny-list" });
        stage.append(svg);
        const NOW = 20, LIMIT = 14;
        const ENDPOINTS = [
          { path: "GET /orders", scope: "orders.read" },
          { path: "POST /orders", scope: "orders.write" },
          { path: "POST /orders/7/refund", scope: "orders.refund" },
          { path: "DELETE /users/3", scope: "admin" }
        ];
        const SCOPES = ["orders.read", "orders.write", "orders.refund", "admin", "profile"];
        const USERS = ["asha", "ravi", "mei", "omar", "lena", "kofi"];
        const HEX = "0123456789abcdef";
        const hex4 = () => Array.from({ length: 4 }, () => HEX[k.randInt(0, 15)]).join("");
        const differ = a => { for (;;) { const b = hex4(); let d = 0; for (let i = 0; i < 4; i++) if (a[i] !== b[i]) d++; if (d >= 2) return b; } };
        const denyList = k.shuffle(Array.from({ length: 80 }, (_, i) => `t-${i + 10}`)).slice(0, 3);
        const freshJti = () => { for (;;) { const j = `t-${k.randInt(10, 89)}`; if (!denyList.includes(j)) return j; } };

        function make(kind) {
          const ep = k.pick(ENDPOINTS);
          const lacks = kind === "scope" || kind === "expired+scope";
          let scopes = k.shuffle(SCOPES.filter(s => s !== ep.scope)).slice(0, k.randInt(lacks ? 1 : 0, 1));
          if (!lacks) scopes.push(ep.scope);
          scopes = k.shuffle(scopes);
          const sig = hex4();
          const r = {
            kind, ep, sub: k.pick(USERS), scopes,
            exp: kind.startsWith("expired") ? NOW - k.randInt(1, 12) : NOW + k.randInt(1, 14),
            jti: kind === "revoked" ? k.pick(denyList) : freshJti(),
            sig, calc: kind === "tamper" ? differ(sig) : sig,
            answer: kind === "ok" ? 200 : kind === "scope" ? 403 : 401
          };
          r.why = {
            ok: `Signature matches, exp ${hhmm(r.exp)} is after now, jti not revoked, and it has <b>${ep.scope}</b> → 200.`,
            none: "No Authorization header: we don't know who this is → <b>401</b>.",
            tamper: `The recomputed HMAC (${r.calc}) doesn't match the token's signature (${r.sig}): the payload was edited → <b>401</b>.`,
            expired: `exp ${hhmm(r.exp)} is before now (${hhmm(NOW)}): expired → <b>401</b>.`,
            revoked: `jti ${r.jti} is on the deny-list: revoked → <b>401</b>.`,
            scope: `Valid token, but it lacks <b>${ep.scope}</b>. We know who it is; they just may not → <b>403</b>.`,
            "expired+scope": `Expired (exp ${hhmm(r.exp)}), so none of its claims can be trusted. Authentication fails first → <b>401</b>, not 403.`
          }[kind];
          return r;
        }
        const kinds = k.shuffle(["ok", "ok", "ok", "none", "tamper", "tamper", "expired", "expired", "revoked", "scope", "scope", "expired+scope"]);

        // server panel
        svg.append(k.s("rect", { x: 570, y: 16, width: 178, height: 300, rx: 12, fill: "surface2", stroke: "line", "stroke-width": 1.5 }));
        k.text(svg, 659, 40, "Server", { size: 13, weight: 700 });
        k.text(svg, 659, 70, `🕒 now ${hhmm(NOW)}`, { size: 15, weight: 700 });
        k.text(svg, 659, 110, "⛔ Deny-list (jti)", { size: 12, tone: "muted", weight: 700 });
        denyList.forEach((j, i) => k.text(svg, 659, 134 + i * 20, j, { size: 13, mono: true, weight: 700, tone: "bad" }));
        k.text(svg, 659, 214, "🔑 HMAC key in vault", { size: 11.5, tone: "muted" });
        const meter = k.meter(svg, { x: 584, y: 280, w: 150, max: LIMIT, value: LIMIT, tone: "accent", label: "time to answer" });

        // incoming queue
        k.text(svg, 70, 36, "Incoming", { size: 12, tone: "muted", weight: 700 });
        const queueG = k.s("g"); svg.append(queueG);
        function drawQueue(left) {
          queueG.replaceChildren();
          for (let i = 0; i < Math.min(left, 9); i++) k.dot(queueG, 70, 64 + i * 26, { r: 9, tone: "muted" });
          if (left > 9) k.text(queueG, 70, 64 + 9 * 26, `+${left - 9}`, { size: 11, tone: "muted" });
        }

        let idx = 0, correct = 0, score = 0, cur = null, answered = true, timeLeft = LIMIT, card = null;
        const hud = () => k.hud({ Request: `${Math.min(idx + 1, kinds.length)} / ${kinds.length}`, Correct: correct, Score: score });

        function drawCard(r) {
          const g = k.s("g"); svg.append(g);
          g.append(k.s("rect", { x: 140, y: 16, width: 416, height: 300, rx: 14, fill: "surface", stroke: "line", "stroke-width": 1.5 }));
          k.text(g, 348, 48, r.ep.path, { size: 17, weight: 800, mono: true });
          k.text(g, 348, 72, `needs scope: ${r.ep.scope}`, { size: 12.5, tone: "muted", weight: 700 });
          g.append(k.s("line", { x1: 160, y1: 88, x2: 536, y2: 88, stroke: "line", "stroke-width": 1 }));
          const row = (y, key, val, tone = "ink") => {
            k.text(g, 172, y, key, { anchor: "start", size: 13, mono: true, tone: "muted" });
            k.text(g, 300, y, val, { anchor: "start", size: 13.5, mono: true, weight: 700, tone });
          };
          if (r.kind === "none") {
            k.text(g, 348, 150, "Authorization: (no header)", { size: 15, mono: true, weight: 700 });
            k.text(g, 348, 180, "the client sent no token at all", { size: 12.5, tone: "muted" });
          } else {
            row(114, "token.sub", r.sub);
            row(140, "token.scope", r.scopes.join(" "));
            row(166, "token.exp", hhmm(r.exp));
            row(192, "token.jti", r.jti);
            g.append(k.s("line", { x1: 160, y1: 210, x2: 536, y2: 210, stroke: "line", "stroke-width": 1, "stroke-dasharray": "4 4" }));
            row(236, "token sig", r.sig, "accent");
            row(262, "HMAC(payload)", r.calc, "accent");
            k.text(g, 348, 296, "the API recomputes the signature with its key", { size: 11.5, tone: "muted" });
          }
          return g;
        }

        async function next() {
          hud(); drawQueue(kinds.length - idx);
          if (idx >= kinds.length) return end();
          cur = make(kinds[idx]);
          card = drawCard(cur);
          k.place(card, { tx: -120 });
          card.setAttribute("opacity", 0);
          timeLeft = LIMIT; meter.set(LIMIT, "accent");
          answered = false;
          await k.tween(card, { tx: 0, opacity: 1 }, 350, k.ease.out);
        }

        async function answer(code) {
          if (answered || !cur) return;
          answered = true;
          const ok = code === cur.answer;
          if (ok) { correct++; score += 100 + Math.round(50 * timeLeft / LIMIT); }
          const stamp = k.text(card, 348, 175, code == null ? "⏱" : String(code), { size: 64, weight: 900, tone: ok ? "good" : "bad" });
          stamp.setAttribute("transform", "rotate(-12 348 175)");
          stamp.setAttribute("opacity", 0.85);
          if (!ok) k.text(card, 348, 216, `correct: ${cur.answer}`, { size: 16, weight: 800, tone: "good" });
          hud();
          k.say((ok ? "✔ " : code == null ? "⏱ Too slow: the client timed out. " : `✘ You answered ${code}. `) + cur.why);
          await k.sleep(ok ? 1500 : 3200);
          await k.tween(card, { tx: 140, opacity: 0 }, 300);
          card.remove();
          idx++;
          await next();
        }

        k.loop(dt => {
          if (answered) return;
          timeLeft = Math.max(0, timeLeft - dt);
          meter.set(timeLeft, timeLeft < 4 ? "bad" : "accent");
          if (timeLeft === 0) k.run(() => answer(null));
        });

        const opts = [{ label: "✅ 200 OK", code: 200 }, { label: "🔒 401 Unauthorized", code: 401 }, { label: "⛔ 403 Forbidden", code: 403 }];
        k.choices(opts, o => k.run(() => answer(o.code)));
        k.on(document, "keydown", e => {
          const o = opts[["1", "2", "3"].indexOf(e.key)];
          if (o && !e.target.closest?.("input, textarea")) k.run(() => answer(o.code));
        });

        function end() {
          const text = `You answered <b>${correct} of ${kinds.length}</b> correctly (${score} points). ` +
            "Check in order: token present and signature matches, not expired, not revoked (401 if any fails), then scope (403 if missing).";
          if (correct < 7) k.lose(text);
          else k.win({ stars: k.starsFor(correct, 9, 11), text });
        }

        k.say("You are the API. Compare signatures, check <b>exp</b> against the clock and <b>jti</b> against the deny-list, then the scope.");
        k.run(next);
      }
    }
  });
})();
