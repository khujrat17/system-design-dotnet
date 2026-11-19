"use strict";
/* Concept 12 · CAP theorem and consistency. Watch: a partition between two replicas, CP refuses vs AP diverges
   and reconciles. Play: Partition Planner (choose CP or AP per feature and watch the consequence). */
Lab.define(12, {
  watch: {
    title: "The day the cable was cut",
    intro: "Two replicas hold the same stock. Follow purchases, step by step, when the link between them is cut.",
    steps: [
      { label: "Replicas", tag: "concept", title: "Two copies that agree",
        body: "<p>ShopKart keeps its inventory on two <b>replicas</b>, in Mumbai and Delhi. Both start with <b>12 units</b>.</p><p>A sale in Mumbai is <b>replicated</b> to Delhi before the buyer gets ✔.</p>",
        idea: "While the network works, you get both consistency and availability for free.",
        changed: ["Mumbai sells 2: stock 12 → 10", "Delhi copies the write: 10 on both sides"] },
      { label: "Partition", tag: "problem", title: "The link goes down",
        body: "<p>A cable is cut: a <b>network partition</b>. Both replicas are still running, but they can’t talk to each other.</p><p>On real networks this <b>will</b> happen. The <b>CAP theorem</b> says that during a partition you must pick: <b>C</b>onsistency or <b>A</b>vailability.</p>",
        idea: "P is not optional. The real choice is what each replica does while it is cut off.",
        changed: ["Link turns red and dashed", "Replicas can no longer sync"] },
      { label: "CP refuses", tag: "technique", title: "CP: refuse what you can’t confirm",
        body: "<p>Option 1, <b>CP</b>: a replica only accepts a write it can confirm with the other side.</p><p>Mumbai’s buyer wants 7, Delhi’s wants 6. Neither replica can reach the other, so both say no.</p>",
        idea: "CP keeps the data correct (10 everywhere) and pays with errors: the system is not available.",
        changed: ["2 writes refused", "Stock stays 10 on both sides"] },
      { label: "AP accepts", tag: "technique", title: "AP: accept now, sync later",
        body: "<p>The link heals; with CP there was nothing to repair. Then the same partition again, but now <b>AP</b>: each replica accepts writes locally.</p><p>Both buyers get ✔. Mumbai says <b>3</b>, Delhi says <b>4</b>.</p>",
        idea: "AP stays available, but the replicas now disagree. Someone has to merge them later.",
        changed: ["2 writes accepted locally", "Replicas diverge: 3 vs 4"] },
      { label: "Oversold", tag: "failure", title: "Last write wins, stock loses",
        body: "<p>The link heals and the replicas <b>reconcile</b>. A common rule is <b>last write wins</b>: Delhi wrote last, so both say 4.</p><p>But <b>7 + 6 = 13 units</b> were sold out of 10.</p>",
        idea: "For stock, AP means apologising to three customers. Some data can’t be merged after the fact.",
        changed: ["Both replicas show 4", "Oversold by 3"] },
      { label: "Likes", tag: "case", title: "Same partition, different data",
        body: "<p>AP isn’t wrong, it’s wrong <b>for stock</b>. Now the data is a <b>likes counter</b> at 120.</p><p>During the partition Mumbai counts +3 and Delhi +2. Readers briefly see 123 or 122.</p>",
        idea: "A slightly stale like count harms nobody. An error on the like button would.",
        changed: ["Both sides accept likes", "Counts diverge: 123 vs 122"] },
      { label: "Merge", tag: "fix", title: "Merge by adding increments",
        body: "<p>On heal, each side sends its <b>increments</b>, not its total. 120 + 3 + 2 = <b>125</b> everywhere.</p><p>This is the idea behind a <b>CRDT</b> counter: data designed to merge without conflicts.</p>",
        idea: "AP works when the data can be merged correctly: counters, sets, carts.",
        changed: ["Increments exchanged", "125 on both sides, nothing lost"] },
      { label: "Per feature", tag: "result", title: "Choose per feature",
        body: "<p><b>CP</b> for stock, payments and seat booking: wrong data costs money, so refuse.</p><p><b>AP</b> for likes, views, feeds and carts: an error is worse than a stale value.</p>",
        idea: "Interview answer: “Partitions will happen. For each feature I decide: refuse (CP) or answer and merge later (AP).”",
        changed: ["Two rule boxes appear"] }
    ],
    learn: [
      { text: "What a network partition is", step: 1 },
      { text: "How a CP system behaves during one", step: 2 },
      { text: "How AP diverges and why last-write-wins can oversell", step: 4 },
      { text: "When AP is the right call: mergeable data", step: 6 },
      { text: "Choosing CP or AP per feature", step: 7 }
    ],
    build(stage, k) {
      const svg = k.svg(760, 330, { label: "Two replicas, Mumbai and Delhi, each with a buyer, and a network link between them that gets cut" });
      stage.append(svg);
      const P = { buyerA: { x: 160, y: 50 }, buyerB: { x: 600, y: 50 }, a: { x: 160, y: 170 }, b: { x: 600, y: 170 } };
      const link = k.line(svg, P.a, P.b, { tone: "good", width: 3 });
      k.line(svg, P.buyerA, P.a, { dashed: true });
      k.line(svg, P.buyerB, P.b, { dashed: true });
      k.box(svg, { ...P.buyerA, label: "Buyer in Mumbai", icon: "🧑", w: 160, h: 40 });
      k.box(svg, { ...P.buyerB, label: "Buyer in Delhi", icon: "🧑", w: 160, h: 40 });
      const A = k.box(svg, { ...P.a, label: "Mumbai replica", icon: "🗄️", w: 180, h: 72 });
      const B = k.box(svg, { ...P.b, label: "Delhi replica", icon: "🗄️", w: 180, h: 72 });
      A.label.setAttribute("y", -10); B.label.setAttribute("y", -10);
      const valA = k.text(A, 0, 20, "", { size: 16, weight: 800 });
      const valB = k.text(B, 0, 20, "", { size: 16, weight: 800 });
      const stA = k.text(svg, P.a.x, 228, "", { size: 12, tone: "muted" });
      const stB = k.text(svg, P.b.x, 228, "", { size: 12, tone: "muted" });
      const mode = k.text(svg, 380, 112, "", { size: 15, weight: 800, tone: "accent" });
      const linkTxt = k.text(svg, 380, 160, "link up", { size: 12, tone: "good" });
      // texts that get pulsed live in a group centred on their position, so scaling stays in place
      const tag = (x, y, str, opts) => { const g = k.s("g"); svg.append(g); k.place(g, { tx: x, ty: y }); g.t = k.text(g, 0, 0, str, opts); return g; };
      const cut = tag(380, 196, "✂ partition", { size: 14, weight: 800, tone: "bad" });
      cut.setAttribute("opacity", 0);
      const soldG = tag(380, 262, "", { size: 13, weight: 700 }), sold = soldG.t;

      function partition() {
        link.style.stroke = k.colors.bad; link.setAttribute("stroke-dasharray", "4 10");
        linkTxt.textContent = "link down"; linkTxt.style.fill = k.colors.bad;
        cut.setAttribute("opacity", 1);
        return k.pulse(cut);
      }
      function heal() {
        link.style.stroke = k.colors.good; link.removeAttribute("stroke-dasharray");
        linkTxt.textContent = "link up"; linkTxt.style.fill = k.colors.good;
        cut.setAttribute("opacity", 0);
      }
      // a sync message that dies in the gap between the replicas
      async function blocked(from, to) {
        const dir = to.x > from.x ? 1 : -1;
        const d = k.dot(svg, from.x + dir * 90, from.y, { r: 10, tone: "bad", label: "?" });
        await k.tween(d, { tx: 380 - dir * 22 }, 550);
        await k.tween(d, { opacity: 0, scale: 0.3 }, 300);
        d.remove();
      }
      const buy = (from, to, label) => k.packet(svg, from, to, { label, r: 14, size: 11, ms: 600 });
      const reply = (from, to, ok) => k.packet(svg, from, to, { label: ok ? "✔" : "✖", r: 12, size: 11, tone: ok ? "good" : "bad", ms: 500 });

      let accepted = 0, refused = 0, agree = true, oversold = 0;
      const metrics = () => k.hud({ "Writes accepted": accepted, "Writes refused": refused, Replicas: agree ? "in sync" : "diverged", "Units oversold": oversold });
      valA.textContent = "stock 12"; valB.textContent = "stock 12";
      metrics();

      k.run(async () => {
        // 1 · replicas agree
        await k.step();
        mode.textContent = "Normal operation";
        k.say("Mumbai sells 2 units and copies the write to Delhi.");
        await k.sleep(800);
        await buy(P.buyerA, P.a, "−2");
        valA.textContent = "stock 10"; k.tone(A, "accent");
        await k.packet(svg, P.a, P.b, { label: "−2", r: 13, size: 11, tone: "good", ms: 800 });
        valB.textContent = "stock 10"; k.tone(B, "accent");
        await reply(P.a, P.buyerA, true);
        accepted++; metrics();
        k.tone(A, "neutral"); k.tone(B, "neutral");
        k.say("Both replicas agree: 10 left.");

        // 2 · partition
        await k.step();
        k.say("A cable is cut. The replicas can’t talk.");
        await partition();
        await k.sleep(1500);

        // 3 · CP refuses
        await k.step();
        mode.textContent = "Option 1 · CP: choose consistency";
        k.say("CP: accept only what the other side can confirm.");
        await k.sleep(800);
        await buy(P.buyerA, P.a, "−7");
        await blocked(P.a, P.b);
        k.tone(A, "bad"); stA.textContent = "can’t confirm → refuse";
        await reply(P.a, P.buyerA, false);
        refused++; metrics();
        await buy(P.buyerB, P.b, "−6");
        await blocked(P.b, P.a);
        k.tone(B, "bad"); stB.textContent = "can’t confirm → refuse";
        await reply(P.b, P.buyerB, false);
        refused++; metrics();
        k.say("Both buyers get an error. Stock is still 10 everywhere.");

        // 4 · AP accepts
        await k.step();
        heal(); k.tone(A, "neutral"); k.tone(B, "neutral"); stA.textContent = ""; stB.textContent = "";
        k.say("The link heals. Nothing diverged, so nothing to repair.");
        await k.sleep(1400);
        mode.textContent = "Option 2 · AP: choose availability";
        await partition();
        k.say("Same partition. AP: accept writes locally.");
        await k.sleep(600);
        await buy(P.buyerA, P.a, "−7");
        valA.textContent = "stock 3"; k.tone(A, "warn");
        agree = false; accepted++; metrics();
        await reply(P.a, P.buyerA, true);
        await buy(P.buyerB, P.b, "−6");
        valB.textContent = "stock 4"; k.tone(B, "warn");
        accepted++; metrics();
        await reply(P.b, P.buyerB, true);
        stA.textContent = "accepted locally"; stB.textContent = "accepted locally";
        sold.textContent = "sold during the partition: 7 + 6 = 13";
        k.say("Both buyers got ✔, but Mumbai says 3 and Delhi says 4.");

        // 5 · reconcile, oversold
        await k.step();
        heal();
        k.say("Link heals. Last write wins: Delhi wrote last.");
        await Promise.all([
          k.packet(svg, P.a, P.b, { label: "3", r: 12, tone: "warn", ms: 800 }),
          k.packet(svg, P.b, P.a, { label: "4", r: 12, tone: "warn", ms: 800 })
        ]);
        valA.textContent = "stock 4"; valB.textContent = "stock 4";
        stA.textContent = ""; stB.textContent = "";
        k.tone(A, "bad"); k.tone(B, "bad");
        agree = true; oversold = 3; metrics();
        sold.textContent = "⚠ 13 units sold out of 10: oversold by 3";
        sold.style.fill = k.colors.bad;
        await k.pulse(soldG);
        k.say("Both say 4, but 13 units were sold out of 10.");

        // 6 · likes diverge
        await k.step();
        k.tone(A, "neutral"); k.tone(B, "neutral");
        sold.textContent = ""; sold.style.fill = k.colors.ink;
        mode.textContent = "AP for a likes counter";
        valA.textContent = "120 likes"; valB.textContent = "120 likes";
        k.say("Same partition, but the data is a likes counter.");
        await partition();
        await k.sleep(1000);
        await Promise.all([buy(P.buyerA, P.a, "+3"), buy(P.buyerB, P.b, "+2")]);
        valA.textContent = "123 likes"; valB.textContent = "122 likes";
        k.tone(A, "warn"); k.tone(B, "warn");
        accepted += 2; agree = false; metrics();
        await Promise.all([reply(P.a, P.buyerA, true), reply(P.b, P.buyerB, true)]);
        k.say("Readers see 123 or 122 for a moment. Nobody minds.");

        // 7 · merge increments
        await k.step();
        heal();
        k.say("Link heals. Each side sends its increments.");
        await Promise.all([
          k.packet(svg, P.a, P.b, { label: "+3", r: 12, tone: "good", ms: 800 }),
          k.packet(svg, P.b, P.a, { label: "+2", r: 12, tone: "good", ms: 800 })
        ]);
        valA.textContent = "125 likes"; valB.textContent = "125 likes";
        k.tone(A, "good"); k.tone(B, "good");
        agree = true; metrics();
        k.say("120 + 3 + 2 = <b>125</b> on both sides. Nothing lost.");

        // 8 · the rule
        await k.step();
        mode.textContent = "";
        k.tone(A, "neutral"); k.tone(B, "neutral");
        k.box(svg, { x: 200, y: 296, w: 330, h: 44, label: "CP: stock, payments, seat booking", sub: "wrong data costs money → refuse", tone: "accent", size: 12.5 });
        k.box(svg, { x: 560, y: 296, w: 330, h: 44, label: "AP: likes, views, feeds, carts", sub: "an error is worse than a stale value", tone: "good", size: 12.5 });
        k.say("Refuse (CP) or answer and merge later (AP), <b>per feature</b>.");
        await k.sleep(1200);
        k.done();
      });
    }
  },

  play: {
    title: "Partition Planner",
    goal: "The link between two replicas is down. For each feature, choose <b>CP</b> (refuse writes) or <b>AP</b> (accept, merge later), then watch what happens. Get 7 of 8 right for 3 stars.",
    build(stage, k) {
      const FEATURES = [
        { name: "Bank balance", icon: "🏦", who: ["ATM in Mumbai", "ATM in Delhi"], req: "−800", start: "₹1,000", a: "₹200", b: "₹200", merged: "−₹600 ⚠", best: "CP",
          cp: "Both ATMs said “try again later”. Annoying for a minute, but no money was invented.",
          ap: "Both ₹800 withdrawals succeeded from ₹1,000. After the merge the account is at <b>−₹600</b>: money that never existed." },
        { name: "Likes counter", icon: "❤️", who: ["Fan in Mumbai", "Fan in Delhi"], req: "+1", start: "120 likes", a: "123 likes", b: "122 likes", merged: "125 likes ✔", best: "AP",
          cp: "The like button failed for everyone during the partition, to protect a number nobody checks exactly. A needless outage.",
          ap: "Each side counted locally; on heal the increments were added: 125. Nobody saw an error." },
        { name: "Concert seat 14C", icon: "🎟️", who: ["Fan in Mumbai", "Fan in Delhi"], req: "book", start: "14C free", a: "14C → Asha", b: "14C → Ravi", merged: "2 owners ⚠", best: "CP",
          cp: "Bookings paused until the link healed. Nobody was sold a seat that someone else owns.",
          ap: "Both fans got a ticket for <b>the same seat</b>. Someone is getting turned away at the door." },
        { name: "Video view count", icon: "▶️", who: ["Viewer in Mumbai", "Viewer in Delhi"], req: "+1", start: "9,000 views", a: "9,040 views", b: "9,025 views", merged: "9,065 views ✔", best: "AP",
          cp: "Videos stopped counting views (or worse, stopped playing) over a number that is approximate anyway.",
          ap: "Views were counted on both sides and summed on heal: 9,065. Eventual consistency is plenty here." },
        { name: "Shopping cart", icon: "🛒", who: ["Phone", "Laptop"], req: "add", start: "cart: 1 item", a: "cart: + socks", b: "cart: + headphones", merged: "cart: 3 items ✔", best: "AP",
          cp: "“Add to cart” failed during the partition. Lost sales, for data that merges cleanly.",
          ap: "Each side added an item; the merge takes the <b>union</b>, so the cart holds all 3. This is what Amazon’s Dynamo was built for." },
        { name: "Last 3 units, flash sale", icon: "📦", who: ["Buyer in Mumbai", "Buyer in Delhi"], req: "buy 3", start: "3 left", a: "0 left", b: "0 left", merged: "6 sold of 3 ⚠", best: "CP",
          cp: "Sales paused for a moment, and exactly 3 units were sold. Inventory needs strong consistency.",
          ap: "Each side sold its “last 3”. <b>6 sold out of 3</b>: three refunds and three angry customers." },
        { name: "Home feed", icon: "📰", who: ["Writer in Mumbai", "Reader in Delhi"], req: "post", start: "feed v1", a: "feed v2", b: "feed v1", merged: "feed v2 ✔", best: "AP",
          cp: "Feeds went blank during the partition just to avoid showing a post a few seconds late.",
          ap: "The Delhi reader saw the new post a few seconds late. A slightly stale feed is fine." },
        { name: "Unique username @nova", icon: "🔤", who: ["Sign-up in Mumbai", "Sign-up in Delhi"], req: "claim", start: "@nova free", a: "@nova → user 1", b: "@nova → user 2", merged: "2 owners ⚠", best: "CP",
          cp: "Sign-ups waited for the link. @nova still belongs to exactly one person.",
          ap: "Two people now own <b>@nova</b>. Unique things need consistency, not availability." }
      ];
      const feats = k.shuffle(FEATURES), N = feats.length;
      let idx = 0, right = 0, score = 0;

      const svg = k.svg(740, 320, { label: "Two replicas separated by a network partition, each with a client sending a write" });
      stage.append(svg);
      const P = { ca: { x: 170, y: 122 }, cb: { x: 570, y: 122 }, a: { x: 170, y: 235 }, b: { x: 570, y: 235 } };
      const link = k.line(svg, P.a, P.b, { tone: "bad", width: 3, dashed: true });
      k.line(svg, P.ca, P.a, { dashed: true });
      k.line(svg, P.cb, P.b, { dashed: true });
      const card = k.box(svg, { x: 370, y: 40, w: 360, h: 46, label: "", tone: "accent", size: 15 });
      const cA = k.box(svg, { ...P.ca, label: "", w: 170, h: 36, size: 12 });
      const cB = k.box(svg, { ...P.cb, label: "", w: 170, h: 36, size: 12 });
      const A = k.box(svg, { ...P.a, label: "Replica · Mumbai", w: 220, h: 70, size: 12 });
      const B = k.box(svg, { ...P.b, label: "Replica · Delhi", w: 220, h: 70, size: 12 });
      A.label.setAttribute("y", -12); B.label.setAttribute("y", -12);
      const valA = k.text(A, 0, 18, "", { size: 15, weight: 800 });
      const valB = k.text(B, 0, 18, "", { size: 15, weight: 800 });
      const cut = k.text(svg, 370, 240, "✂ partition", { size: 13, weight: 800, tone: "bad" });
      const verdict = k.text(svg, 370, 300, "", { size: 14, weight: 800 });

      function hud() { k.hud({ Feature: `${Math.min(idx + 1, N)} / ${N}`, Right: right, Score: score }); }

      function setup() {
        const f = feats[idx];
        hud();
        card.label.textContent = `${f.icon} ${f.name}`;
        cA.label.textContent = f.who[0]; cB.label.textContent = f.who[1];
        valA.textContent = f.start; valB.textContent = f.start;
        for (const g of [A, B, cA, cB]) k.tone(g, "neutral");
        k.tone(card, "accent");
        link.style.stroke = k.colors.bad; link.setAttribute("stroke-dasharray", "5 5");
        cut.setAttribute("opacity", 1);
        verdict.textContent = "";
        k.say(`<b>${f.icon} ${f.name}</b>: both sides send a write (<b>${f.req}</b>) while the replicas can’t talk. Refuse (CP) or accept and merge later (AP)?`);
        k.clearTools();
        let picked = false;
        const row = k.choices([{ label: "CP · refuse until healed", v: "CP" }, { label: "AP · accept, merge later", v: "AP" }], (o, btn) => {
          if (picked) return;
          picked = true;
          row.querySelectorAll("button").forEach(b => { b.disabled = true; });
          k.run(() => resolve(f, o.v, btn));
        });
      }

      async function blocked(from, dir) {
        const d = k.dot(svg, from.x + dir * 110, from.y, { r: 9, tone: "bad", label: "?" });
        await k.tween(d, { tx: 370 - dir * 50 }, 450);
        await k.tween(d, { opacity: 0, scale: 0.3 }, 250);
        d.remove();
      }

      async function resolve(f, choice, btn) {
        const good = choice === f.best;
        btn.classList.add(good ? "right" : "wrong");
        await Promise.all([
          k.packet(svg, P.ca, P.a, { label: f.req.length <= 4 ? f.req : "✎", r: 15, size: 10, ms: 550 }),
          k.packet(svg, P.cb, P.b, { label: f.req.length <= 4 ? f.req : "✎", r: 15, size: 10, ms: 550 })
        ]);
        if (choice === "CP") {
          await Promise.all([blocked(P.a, 1), blocked(P.b, -1)]);
          k.tone(A, "muted"); k.tone(B, "muted");
          await Promise.all([
            k.packet(svg, P.a, P.ca, { label: "✖", r: 12, tone: "bad", ms: 450 }),
            k.packet(svg, P.b, P.cb, { label: "✖", r: 12, tone: "bad", ms: 450 })
          ]);
          k.tone(cA, "bad"); k.tone(cB, "bad");
          k.float(svg, P.ca.x, P.ca.y - 26, "503", "bad"); k.float(svg, P.cb.x, P.cb.y - 26, "503", "bad");
          await k.sleep(700);
        } else {
          valA.textContent = f.a; valB.textContent = f.b;
          k.tone(A, "warn"); k.tone(B, "warn");
          await Promise.all([
            k.packet(svg, P.a, P.ca, { label: "✔", r: 12, tone: "good", ms: 450 }),
            k.packet(svg, P.b, P.cb, { label: "✔", r: 12, tone: "good", ms: 450 })
          ]);
          k.tone(cA, "good"); k.tone(cB, "good");
          await k.sleep(900);
          // the link heals and the replicas reconcile
          link.style.stroke = k.colors.good; link.removeAttribute("stroke-dasharray");
          cut.setAttribute("opacity", 0);
          await Promise.all([
            k.packet(svg, { x: P.a.x + 110, y: P.a.y }, { x: P.b.x - 110, y: P.b.y }, { r: 9, tone: "accent", ms: 600 }),
            k.packet(svg, { x: P.b.x - 110, y: P.b.y }, { x: P.a.x + 110, y: P.a.y }, { r: 9, tone: "accent", ms: 600 })
          ]);
          valA.textContent = f.merged; valB.textContent = f.merged;
          const t = f.best === "AP" ? "good" : "bad";
          k.tone(A, t); k.tone(B, t);
          await k.sleep(300);
        }
        if (good) { right++; score += 100; }
        verdict.textContent = good ? "✔ Right call" : f.best === "CP" ? "✖ Data went wrong: this needed CP" : "✖ Needless outage: AP was fine";
        verdict.style.fill = good ? k.colors.good : k.colors.bad;
        k.float(svg, 370, 275, good ? "+100" : "+0", good ? "good" : "bad");
        k.say(`${good ? "✔" : "✖"} ${choice === "CP" ? f.cp : f.ap}`);
        hud();
        k.clearTools();
        k.button(idx + 1 < N ? "Next feature →" : "See results", () => {
          idx++;
          if (idx < N) setup(); else end();
        }, { primary: true });
      }

      function end() {
        k.clearTools();
        const text = `You chose right for <b>${right} of ${N}</b> features. Rule: if a wrong or duplicated value costs money or breaks a promise (balances, stock, seats, unique names), refuse (CP). If an error is worse than a briefly stale value (likes, views, feeds, carts), accept and merge (AP).`;
        if (right < 4) k.lose(`${text} Ask yourself: during the outage, which is worse here, an error or a wrong answer?`);
        else k.win({ stars: k.starsFor(right, 5, 7), text });
      }

      setup();
    }
  }
});
