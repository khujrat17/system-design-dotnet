"use strict";
/* Lab: the small animation + mini-game toolkit behind every concept's "Watch" and "Play" tabs.
   Each concept lives in viz/cNN.js and calls Lab.define(n, { watch, play }). See docs/ANIMATIONS.md. */
(function () {
  const SVGNS = "http://www.w3.org/2000/svg";
  const CANCEL = Symbol("lab-cancelled");
  const registry = new Map(), loading = new Map();
  // A scene closed while a tween was running: its un-awaited promises reject with CANCEL. That's expected, not an error.
  addEventListener("unhandledrejection", e => { if (e.reason === CANCEL) e.preventDefault(); });
  const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Theme colours as CSS variables, so every scene works in light and dark mode. */
  const COLORS = {
    accent: "var(--accent)", good: "var(--good)", bad: "var(--bad)", warn: "var(--warn)", lesson: "var(--lesson)",
    ink: "var(--ink)", muted: "var(--muted)", line: "var(--line)", surface: "var(--surface)", surface2: "var(--surface-2)",
    paper: "var(--paper)", accentSoft: "var(--accent-soft)", goodSoft: "var(--good-soft)", badSoft: "var(--bad-soft)",
    warnSoft: "var(--warn-soft)", lessonSoft: "var(--lesson-soft)", edge: "var(--edge)", strong: "var(--strong)", none: "none"
  };
  const col = v => (typeof v === "string" && COLORS[v]) || v;
  const TONES = {   // fill, stroke, text
    neutral: ["surface", "strong", "ink"], accent: ["accentSoft", "accent", "ink"], good: ["goodSoft", "good", "ink"],
    bad: ["badSoft", "bad", "ink"], warn: ["warnSoft", "warn", "ink"], lesson: ["lessonSoft", "lesson", "ink"],
    muted: ["surface2", "line", "muted"], solid: ["accent", "accent", "surface"]
  };

  const ease = {
    linear: p => p,
    inOut: p => p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2,
    out: p => 1 - Math.pow(1 - p, 3),
    in: p => p * p * p,
    back: p => { const c = 1.70158; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); }
  };

  /* ---------- DOM / SVG builders ---------- */
  function apply(el, props, svg) {
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === "class") el.setAttribute("class", v);
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === "text") el.textContent = v;
      else if (k === "html") el.innerHTML = v;
      else if (svg && (k === "fill" || k === "stroke")) el.style[k] = col(v);
      else el.setAttribute(k, v === true ? "" : v);
    }
  }
  function append(el, kids) {
    for (const c of kids.flat(Infinity)) {
      if (c == null || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
  }
  const h = (tag, props, ...kids) => { const el = document.createElement(tag); apply(el, props, false); append(el, kids); return el; };
  const s = (tag, props, ...kids) => { const el = document.createElementNS(SVGNS, tag); apply(el, props, true); append(el, kids); return el; };

  /* ---------- loading modules ---------- */
  function define(n, spec) { registry.set(n, spec); }
  function load(n) {
    if (registry.has(n)) return Promise.resolve(registry.get(n));
    if (!loading.has(n)) loading.set(n, new Promise((resolve, reject) => {
      const tag = document.createElement("script");
      tag.src = `viz/c${String(n).padStart(2, "0")}.js`;
      tag.onload = () => registry.has(n) ? resolve(registry.get(n)) : reject(new Error(`viz/c${n} did not call Lab.define`));
      tag.onerror = () => { loading.delete(n); tag.remove(); reject(new Error("the scene could not be loaded")); };
      document.head.append(tag);
    }));
    return loading.get(n);
  }

  /* ---------- the kit handed to each scene ----------
     All timing runs on one virtual clock, so Pause and the speed control work for every scene for free. */
  function makeKit(parts, mode, hooks) {
    let disposed = false, halted = false, paused = false, speed = 1, now = 0, last = null, raf = 0;
    let stepIdx = -1, gate = null;
    const timers = new Set(), loops = new Set(), pending = new Set(), cleanups = [];

    function report(err) {
      if (err === CANCEL) return;
      console.error(err);
      parts.caption.innerHTML = `<span class="lab-err">Something went wrong in this scene: ${String(err?.message || err).replace(/</g, "&lt;")}</span>`;
    }
    function frame(ts) {
      if (disposed) return;
      const dt = last == null ? 0 : Math.min(0.1, (ts - last) / 1000);
      last = ts;
      if (!paused && !halted) pump(dt * 1000).then(next, next);
      else next();
    }
    function next() { if (!disposed) raf = requestAnimationFrame(frame); }
    // Let `await` continuations run (scripts resume a few microtask ticks after a timer or tween resolves).
    async function settle() { for (let i = 0; i < 64; i++) await null; }
    /* Advance the virtual clock in slices of at most 40 ms, firing timers in time order and letting scripts resume
       after each one, so fast-forwarding (Back / jump to a step runs at 80×) replays exactly like normal playback. */
    async function pump(realMs) {
      // realMs of wall-clock time to play. Speed is re-read every slice, so reaching a step mid-frame
      // (fast-forward ends) drops straight back to normal speed instead of finishing the frame at 80×.
      let remaining = realMs;
      while (remaining > 0 && !disposed && !halted && !paused) {
        const slice = Math.min(40, remaining * speed);
        remaining -= slice / speed;
        const end = now + slice;
        for (;;) {
          let due = null;
          for (const t of timers) if (t.at <= end && (!due || t.at < due.at)) due = t;
          if (!due) break;
          now = Math.max(now, due.at);
          if (due.every) due.at = now + due.every; else timers.delete(due);
          try { due.fn(); } catch (e) { report(e); }
          await settle();
          if (disposed || halted) return;
        }
        now = end;
        for (const f of [...loops]) {
          if (!loops.has(f)) continue;
          try { if (f(slice / 1000, now / 1000) === false) loops.delete(f); } catch (e) { loops.delete(f); report(e); }
        }
        await settle();
      }
    }
    raf = requestAnimationFrame(frame);

    function stopAll() {
      timers.clear(); loops.clear();
      for (const rej of pending) rej(CANCEL);
      pending.clear();
    }

    const k = {
      mode, h, s, ease, CANCEL, colors: COLORS,
      get reduced() { return reducedMotion(); },
      get time() { return now / 1000; },
      get speed() { return speed; },
      get paused() { return paused; },
      get alive() { return !disposed && !halted; },

      /* ----- time ----- */
      loop(fn) { loops.add(fn); return () => loops.delete(fn); },
      after(ms, fn) { const t = { at: now + ms, fn }; timers.add(t); return () => timers.delete(t); },
      every(ms, fn) { const t = { at: now + ms, every: ms, fn }; timers.add(t); return () => timers.delete(t); },
      sleep(ms) {
        return new Promise((resolve, reject) => {
          if (disposed || halted) return reject(CANCEL);
          const t = { at: now + ms, fn: () => { pending.delete(reject); resolve(); } };
          pending.add(reject); timers.add(t);
        });
      },
      /** Run an async script; being cancelled by Restart / leaving the page is not an error. */
      run(fn) { return Promise.resolve().then(fn).catch(report); },

      /** Animate numeric SVG attributes (x, y, cx, r, width, opacity…) or tx / ty / scale / rot (a transform). */
      tween(el, to, ms = 450, easing = ease.inOut) {
        if (!el) return Promise.resolve();
        el._tf ??= { tx: 0, ty: 0, scale: 1, rot: 0 };
        const from = {}, tf = el._tf;
        let usesTf = false;
        for (const key in to) {
          if (key in tf) { from[key] = tf[key]; usesTf = true; }
          else {
            const cur = parseFloat(el.getAttribute(key));
            from[key] = Number.isFinite(cur) ? cur : key === "opacity" ? 1 : 0;
          }
        }
        const start = now;
        return new Promise((resolve, reject) => {
          if (disposed || halted) return reject(CANCEL);
          const step = () => {
            const p = ms <= 0 ? 1 : Math.min(1, (now - start) / ms), e = easing(p);
            for (const key in to) {
              const v = from[key] + (to[key] - from[key]) * e;
              if (key in tf) tf[key] = v; else el.setAttribute(key, Math.round(v * 100) / 100);
            }
            if (usesTf) k.place(el);
            if (p >= 1) { pending.delete(reject); resolve(); return false; }
          };
          pending.add(reject);
          if (step() !== false) loops.add(step);
        });
      },
      /** Set an element's transform from tx / ty / scale / rot without animating. */
      place(el, pos) {
        el._tf ??= { tx: 0, ty: 0, scale: 1, rot: 0 };
        if (pos) Object.assign(el._tf, pos);
        const t = el._tf;
        el.setAttribute("transform", `translate(${t.tx} ${t.ty})${t.rot ? ` rotate(${t.rot})` : ""}${t.scale !== 1 ? ` scale(${t.scale})` : ""}`);
        return el;
      },
      /** Move an element through a list of {x, y} points. */
      async travel(el, points, ms = 700, easing = ease.inOut) {
        const per = ms / Math.max(1, points.length - 1);
        k.place(el, { tx: points[0].x, ty: points[0].y });
        for (const p of points.slice(1)) await k.tween(el, { tx: p.x, ty: p.y }, per, points.length > 2 ? ease.linear : easing);
      },

      /* ----- drawing helpers (all return SVG elements) ----- */
      svg(w, h, props = {}) {
        return s("svg", { viewBox: `0 0 ${w} ${h}`, class: "lab-svg", role: "img", "aria-label": props.label || "", ...props, label: null });
      },
      /** A labelled rounded box centred on (x, y). Returns a <g>; use k.tone(g, "good") to recolour it. */
      box(parent, { x, y, w = 110, h = 48, label = "", sub = "", icon = "", tone = "neutral", r = 10, size = 13 } = {}) {
        const g = s("g", { class: "lab-box" });
        // a 3D block: soft ground shadow, a lit top face and a shaded right face behind the front face
        const d = Math.round(Math.min(12, Math.max(7, h / 4.5)));
        const L = -w / 2, R = w / 2, T = -h / 2, B = h / 2;
        const shadow = s("ellipse", { cx: d / 2 + 4, cy: B + 7, rx: w / 2 + d, ry: Math.max(6, h / 6), class: "lab-shadow" });
        const top = s("path", { d: `M${L + r * .4},${T} L${L + d + r * .4},${T - d} L${R + d},${T - d} L${R},${T} Z`, class: "lab-top", "stroke-width": 1.4, "stroke-linejoin": "round" });
        const side = s("path", { d: `M${R},${T} L${R + d},${T - d} L${R + d},${B - d - r * .3} L${R},${B - r * .3} Z`, class: "lab-side", "stroke-width": 1.4, "stroke-linejoin": "round" });
        const rect = s("rect", { x: L, y: T, width: w, height: h, rx: Math.min(r, 6), "stroke-width": 1.6 });
        g.append(shadow, top, side, rect);
        g.side = side; g.top = top;
        const lines = [icon && label ? `${icon} ${label}` : icon || label, sub].filter(Boolean);
        const t1 = s("text", { x: 0, y: sub ? -3 : 4.5, "text-anchor": "middle", class: "lab-t", "font-size": size, "font-weight": 600 }, lines[0] || "");
        g.append(t1);
        let t2 = null;
        if (sub) { t2 = s("text", { x: 0, y: 13, "text-anchor": "middle", class: "lab-t lab-sub", "font-size": size - 2.5 }, sub); g.append(t2); }
        g.rect = rect; g.label = t1; g.sub = t2;
        k.tone(g, tone);
        k.place(g, { tx: x, ty: y });
        parent?.append(g);
        return g;
      },
      tone(g, tone = "neutral") {
        if (g.circle && !g.rect) { g.circle.style.fill = col(tone === "neutral" ? "muted" : tone === "solid" ? "accent" : tone); g.dataset.tone = tone; return g; }
        const [fill, stroke, ink] = TONES[tone] || TONES.neutral;
        const rect = g.rect || g;
        rect.style.fill = col(fill); rect.style.stroke = col(stroke);
        if (g.side) {
          // faces are mixed from the tone so every theme and tone gets a lit top and a darker side
          const base = col(fill === "surface" || fill === "surface2" ? "surface" : fill), edge = col(stroke);
          g.top.style.fill = `color-mix(in srgb, ${base} 82%, #fff)`;
          g.side.style.fill = `color-mix(in srgb, ${tone === "neutral" || tone === "muted" ? col("edge") : edge} 70%, ${base})`;
          g.top.style.stroke = g.side.style.stroke = edge;
        }
        for (const t of [g.label, g.sub]) if (t) t.style.fill = col(t === g.sub && tone !== "solid" ? "muted" : ink);
        g.dataset.tone = tone;
        return g;
      },
      text(parent, x, y, str, { size = 13, anchor = "middle", tone = "ink", weight = 500, mono = false, cls = "" } = {}) {
        const t = s("text", { x, y, "text-anchor": anchor, "font-size": size, "font-weight": weight, class: `lab-t ${mono ? "lab-mono" : ""} ${cls}` }, str);
        t.style.fill = col(tone);
        parent?.append(t);
        return t;
      },
      line(parent, a, b, { tone = "line", width = 2, dashed = false, arrow = false } = {}) {
        const l = s("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, "stroke-width": width, "stroke-linecap": "round" });
        l.style.stroke = col(tone);
        if (dashed) l.setAttribute("stroke-dasharray", "5 5");
        if (arrow) l.setAttribute("marker-end", `url(#${k.arrowHead(parent, tone)})`);
        parent?.prepend(l);   // lines sit behind boxes
        return l;
      },
      arrowHead(parent, tone = "line") {
        const svg = parent?.ownerSVGElement || parent;
        const id = `lab-arrow-${tone}`;
        if (svg && !svg.querySelector(`#${id}`)) {
          let defs = svg.querySelector("defs");
          if (!defs) { defs = s("defs"); svg.prepend(defs); }
          const p = s("path", { d: "M0,0 L8,4 L0,8 z" }); p.style.fill = col(tone);
          defs.append(s("marker", { id, viewBox: "0 0 8 8", refX: 7, refY: 4, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" }, p));
        }
        return id;
      },
      /** A dot (optionally with a label) that you can move with k.tween / k.travel. */
      dot(parent, x, y, { r = 7, tone = "accent", label = "", size = 11 } = {}) {
        const g = s("g", { class: "lab-dot" });
        const c = s("circle", { cx: 0, cy: 0, r }); c.style.fill = col(tone);
        g.append(c);
        if (label) { const t = s("text", { x: 0, y: 3.5, "text-anchor": "middle", "font-size": size, "font-weight": 700, class: "lab-t" }, label); t.style.fill = "#fff"; g.append(t); g.label = t; }
        g.circle = c;
        k.place(g, { tx: x, ty: y });
        parent?.append(g);
        return g;
      },
      /** Send a dot from a to b and remove it (unless keep). Resolves when it arrives. */
      async packet(parent, a, b, { ms = 650, keep = false, ...dotOpts } = {}) {
        const d = k.dot(parent, a.x, a.y, dotOpts);
        try { await k.tween(d, { tx: b.x, ty: b.y }, ms); }
        finally { if (!keep) d.remove(); }
        return d;
      },
      /** A short pulse to draw the eye to an element. */
      async pulse(el, times = 1) {
        for (let i = 0; i < times; i++) { await k.tween(el, { scale: 1.12 }, 140, ease.out); await k.tween(el, { scale: 1 }, 180); }
      },
      /** "+10" style text that floats up and fades. */
      float(parent, x, y, str, tone = "good") {
        const t = k.text(parent, x, y, str, { tone, weight: 800, size: 15 });
        t.setAttribute("opacity", 1);
        k.place(t, { tx: 0, ty: 0 });
        k.tween(t, { ty: -26, opacity: 0 }, 900, ease.out).then(() => t.remove(), () => t.remove());
        return t;
      },
      /** A horizontal meter (e.g. CPU, hit rate). Returns {g, set(value)}. */
      meter(parent, { x, y, w = 140, h = 10, max = 100, value = 0, tone = "accent", label = "" } = {}) {
        const g = s("g"); k.place(g, { tx: x, ty: y });
        const bg = s("rect", { x: 0, y: 0, width: w, height: h, rx: h / 2 }); bg.style.fill = col("surface2"); bg.style.stroke = col("line");
        const fg = s("rect", { x: 0, y: 0, width: 0, height: h, rx: h / 2 }); fg.style.fill = col(tone);
        g.append(bg, fg);
        const lbl = label ? k.text(g, 0, -5, label, { anchor: "start", size: 11, tone: "muted" }) : null;
        parent?.append(g);
        const m = {
          g, label: lbl,
          set(v, t) { value = v; fg.setAttribute("width", Math.max(0, Math.min(1, v / max)) * w); if (t) fg.style.fill = col(t); return m; },
          get value() { return value; }
        };
        return m.set(value);
      },

      /* ----- narration and controls ----- */
      /** Set the caption under the stage. Accepts simple HTML (<b>, <code>). */
      say(html) { parts.caption.innerHTML = html; },
      button(label, onClick, { primary = false, title = "" } = {}) {
        const b = h("button", { class: `btn ${primary ? "primary" : "ghost"} lab-btn`, title, onclick: e => { try { onClick(e); } catch (err) { report(err); } } }, label);
        parts.tools.append(b);
        return b;
      },
      /** A labelled range input. onInput(value) is called on every change. */
      slider({ label, min = 0, max = 100, step = 1, value = 50, format = v => v, onInput = () => {} }) {
        const out = h("output", {}, format(value));
        const input = h("input", { type: "range", min, max, step, value, "aria-label": label });
        input.addEventListener("input", () => { const v = +input.value; out.textContent = format(v); try { onInput(v); } catch (e) { report(e); } });
        const wrap = h("label", { class: "lab-slider" }, h("span", {}, label), input, out);
        parts.tools.append(wrap);
        return { el: wrap, input, get value() { return +input.value; }, set value(v) { input.value = v; out.textContent = format(+v); } };
      },
      /** A row of choice buttons; onPick(option, button) runs once per click. Returns the container. */
      choices(options, onPick, { target = parts.tools } = {}) {
        const box = h("div", { class: "lab-choices" });
        for (const o of options) {
          const label = typeof o === "string" ? o : o.label;
          const b = h("button", { class: "lab-choice", onclick: () => { try { onPick(o, b); } catch (e) { report(e); } } }, label);
          box.append(b);
        }
        target.append(box);
        return box;
      },
      /** Clear the controls area under the stage. */
      clearTools() { parts.tools.innerHTML = ""; },
      /** A floating message over the stage. tone: good | bad | warn | accent */
      toast(html, tone = "accent", ms = 1400) {
        const t = h("div", { class: `lab-toast lab-toast-${tone}`, html });
        parts.stageWrap.append(t);
        setTimeout(() => t.classList.add("out"), ms);
        setTimeout(() => t.remove(), ms + 400);
      },
      /** Make an SVG element keyboard- and screen-reader-clickable: tabindex, role, label, click + Enter/Space. */
      clickable(el, label, fn) {
        el.setAttribute("tabindex", 0); el.setAttribute("role", "button"); el.setAttribute("aria-label", label);
        el.style.cursor = "pointer";
        const go = e => { if (halted || disposed) return; try { fn(e); } catch (err) { report(err); } };
        el.addEventListener("click", go);
        el.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(e); } });
        return el;
      },
      /** Add an event listener that is removed automatically when the scene closes. */
      on(target, type, fn, opts) {
        const wrapped = e => { if (!halted) try { fn(e); } catch (err) { report(err); } };
        target.addEventListener(type, wrapped, opts);
        cleanups.push(() => target.removeEventListener(type, wrapped, opts));
      },

      /* ----- scoring ----- */
      /** Update the HUD chips (games). e.g. k.hud({ Score: 120, Lives: "❤❤❤", Time: "0:24" }) */
      hud(values) {
        for (const [name, v] of Object.entries(values)) {
          let chip = parts.hud.querySelector(`[data-hud="${CSS.escape(name)}"]`);
          if (v == null) { chip?.remove(); continue; }    // k.hud({ Name: null }) removes a chip
          if (!chip) { chip = h("div", { class: "lab-chip", "data-hud": name }, h("span", {}, name), h("b")); parts.hud.append(chip); }
          const b = chip.querySelector("b");
          if (b.textContent !== String(v)) { b.textContent = v; chip.classList.remove("bump"); void chip.offsetWidth; chip.classList.add("bump"); }
        }
      },
      /** Game won. stars: 1–3. */
      win({ stars = 1, text = "" } = {}) { finish({ stars: Math.max(1, Math.min(3, Math.round(stars))), text }); },
      /** Game lost (0 stars). */
      lose(text = "") { finish({ stars: 0, text }); },
      /** The Watch animation reached its end. */
      done(text = "") { hooks.onDone?.(text); },
      /** Turn a score into 1–3 stars using two thresholds. */
      starsFor(score, two, three) { return score >= three ? 3 : score >= two ? 2 : 1; },

      /* ----- misc ----- */
      rand: (a, b) => a + Math.random() * (b - a),
      randInt: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
      pick: arr => arr[Math.floor(Math.random() * arr.length)],
      shuffle(arr) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; },
      clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
      lerp: (a, b, p) => a + (b - a) * p,
      fmt: n => Number(n).toLocaleString("en-US"),

      /* ----- stepped lessons ----- */
      /** Begin the next step of a stepped lesson (watch.steps). The first call shows step 1 at once; each later call
          waits until the learner presses Next (or auto-play moves on), then shows that step's panel. */
      async step() {
        const next = stepIdx + 1;
        if (next > 0 && next > (hooks.target?.() ?? 0)) {
          if (hooks.autoplay?.()) await k.sleep(1400);
          else {
            hooks.onWaiting?.(true);
            await new Promise((resolve, reject) => {
              if (disposed || halted) return reject(CANCEL);
              pending.add(reject);
              gate = () => { pending.delete(reject); gate = null; resolve(); };
            });
            hooks.onWaiting?.(false);
          }
        }
        stepIdx = next;
        hooks.onStep?.(stepIdx);
        return stepIdx;
      },
      get stepIndex() { return stepIdx; },

      /* used by the host page */
      _next() { if (gate) { gate(); return true; } return false; },
      _setPaused(p) { paused = p; },
      _setSpeed(v) { speed = v; },
      _dispose() {
        if (disposed) return;
        disposed = true; cancelAnimationFrame(raf); stopAll();
        for (const c of cleanups.splice(0)) try { c(); } catch { /* ignore */ }
      }
    };

    function finish(result) {
      if (halted || disposed) return;
      halted = true; stopAll();
      hooks.onFinish?.(result);
    }
    return k;
  }

  /* ---------- mounting a scene into the page ---------- */
  /** mode: "watch" | "play". hooks: { onDone(text), onFinish({stars, text}), next: {href, label}, playHref, playLabel } */
  function mount(host, spec, mode, hooks = {}) {
    const part = spec[mode];
    const steps = mode === "watch" && Array.isArray(part.steps) && part.steps.length ? part.steps : null;
    const learn = steps && Array.isArray(part.learn) ? part.learn : [];
    let kit = null;
    const speeds = [0.5, 1, 2];
    let speedIdx = 1, paused = false, autoplay = false, target = 0, current = -1, finished = false;
    const TURBO = 80;

    const root = h("div", { class: `lab lab-${mode}${steps ? " lab-stepped" : ""}` });
    const chips = steps ? h("div", { class: "lab-chips" },
      h("span", { class: "lab-pill" }, `⏱ ${Math.max(3, Math.round(steps.length * 0.8))} min`),
      h("span", { class: "lab-pill" }, `${steps.length} steps`)) : null;
    const headText = h("div", { class: "lab-headtext" },
      h("span", { class: "lab-kicker" }, mode === "watch" ? (steps ? "▶ Step-by-step lesson" : "▶ Animated walkthrough") : "🎮 Mini-game"),
      h("b", {}, part.title),
      part.intro || part.goal ? h("span", { class: "lab-intro", html: part.intro || part.goal }) : null);
    const ctrl = h("div", { class: "lab-ctrl" });
    const head = h("div", { class: "lab-head" }, headText, chips, ctrl);
    const hud = h("div", { class: "lab-hud" });
    const stage = h("div", { class: "lab-stage" });
    const stageWrap = h("div", { class: "lab-stagewrap" }, stage);
    const caption = h("div", { class: "lab-caption", "aria-live": "polite" });
    const tools = h("div", { class: "lab-tools" });

    // stepped lesson: stage on the left, step panel on the right, stepper underneath
    const stepper = steps ? h("ol", { class: "lab-stepper", "aria-label": "Lesson steps" }) : null;
    const panel = steps ? h("aside", { class: "lab-panel", "aria-live": "polite" }) : null;
    const learnBox = steps && learn.length ? h("div", { class: "lab-learn" }, h("h4", {}, "You'll learn"), h("ul")) : null;
    if (steps) {
      steps.forEach((s, i) => {
        const li = h("li", {}, h("button", { "aria-label": `Step ${i + 1}: ${s.label || s.title}`, onclick: () => jump(i) },
          h("i", {}, String(i + 1)), h("span", {}, s.label || `Step ${i + 1}`)));
        stepper.append(li);
      });
      const main = h("div", { class: "lab-main" }, hud, stageWrap, caption, tools,
        h("div", { class: "lab-stepbar" }, h("div", { class: "lab-stepbar-h" }, h("b", {}, "In this lesson"), h("span", { class: "lab-stepcount" })), stepper));
      const side = h("div", { class: "lab-sidecol" }, panel, learnBox);
      root.append(head, h("div", { class: "lab-body" }, main, side));
    } else {
      root.append(head, hud, stageWrap, caption, tools);
    }
    host.replaceChildren(root);

    const pauseBtn = h("button", { class: `lab-icon${steps ? " lab-wide" : ""}`, title: "Pause (P or Space)", "aria-label": "Pause" }, steps ? "⏸ Pause" : "⏸");
    const restartBtn = h("button", { class: `lab-icon${steps ? " lab-wide" : ""}`, title: steps ? "Replay this step (R)" : "Restart", "aria-label": steps ? "Replay this step" : "Restart" }, steps ? "↺ Replay" : "↺");
    const speedBtn = h("button", { class: "lab-icon lab-speed", title: "Playback speed", "aria-label": "Playback speed" }, "1×");
    const autoBtn = h("button", { class: "lab-icon lab-auto", title: "Auto-play every step", "aria-pressed": "false" }, "Auto");
    if (mode === "watch") ctrl.append(pauseBtn, speedBtn);
    if (steps) ctrl.append(autoBtn);
    ctrl.append(restartBtn);

    pauseBtn.addEventListener("click", () => setPaused(!paused));
    speedBtn.addEventListener("click", () => {
      speedIdx = (speedIdx + 1) % speeds.length;
      speedBtn.textContent = `${speeds[speedIdx]}×`;
      if (current >= target) kit?._setSpeed(speeds[speedIdx]);
    });
    autoBtn.addEventListener("click", () => {
      autoplay = !autoplay;
      autoBtn.setAttribute("aria-pressed", String(autoplay));
      autoBtn.classList.toggle("on", autoplay);
      if (autoplay) kit?._next();
    });
    restartBtn.addEventListener("click", () => steps ? jump(Math.max(0, current)) : start());

    function setPaused(p) {
      paused = p;
      kit?._setPaused(p);
      pauseBtn.textContent = steps ? (p ? "▶ Play" : "⏸ Pause") : (p ? "▶" : "⏸");
      pauseBtn.setAttribute("aria-label", p ? "Resume" : "Pause");
      root.classList.toggle("is-paused", p);
    }

    /* ----- stepped lesson UI ----- */
    function renderStep(i) {
      const s = steps[i] || {};
      const tag = (s.tag || "").toUpperCase();
      const tagTone = { PROBLEM: "bad", FAILURE: "bad", TECHNIQUE: "good", FIX: "good", "TRADE-OFF": "warn", CASE: "lesson", CONCEPT: "accent", RESULT: "good" }[tag] || "accent";
      panel.replaceChildren(
        h("div", { class: "lab-panel-top" }, h("span", { class: "lab-stepno" }, `Step ${i + 1} / ${steps.length}`),
          tag ? h("span", { class: `lab-tag lab-tag-${tagTone}` }, tag) : null),
        h("h3", {}, s.title || s.label || ""),
        s.body ? h("div", { class: "lab-panel-body", html: s.body }) : null,
        s.idea ? h("div", { class: "lab-idea" }, h("span", { class: "lab-idea-ic", "aria-hidden": "true" }, "💡"), h("div", {}, h("b", {}, "Key idea"), h("p", { html: s.idea }))) : null,
        s.changed?.length ? h("div", { class: "lab-changed" }, h("b", {}, "What changed"), h("ul", {}, s.changed.map(c => h("li", { html: c })))) : null,
        h("div", { class: "lab-panel-nav" },
          h("button", { class: "btn ghost lab-back", disabled: i === 0, onclick: () => back() }, "← Back"),
          nextButton(i)),
        h("p", { class: "lab-keys" }, h("kbd", {}, "←"), h("kbd", {}, "→"), " step · ", h("kbd", {}, "R"), " replay · ", h("kbd", {}, "Space"), " pause"));
      [...stepper.children].forEach((li, j) => {
        li.classList.toggle("done", j < i);
        li.classList.toggle("now", j === i);
        li.querySelector("button").setAttribute("aria-current", j === i ? "step" : "false");
      });
      stepper.children[i]?.scrollIntoView?.({ block: "nearest", inline: "center", behavior: "smooth" });
      root.querySelector(".lab-stepcount").textContent = `Step ${i + 1} of ${steps.length}`;
      if (learnBox) {
        learnBox.querySelector("ul").replaceChildren(...learn.map(l => {
          const text = typeof l === "string" ? l : l.text, at = typeof l === "string" ? steps.length - 1 : l.step ?? steps.length - 1;
          const on = i >= at || finished;
          return h("li", { class: on ? "on" : "" }, h("span", { class: "lab-check", "aria-hidden": "true" }, on ? "✓" : ""), h("span", { html: text }));
        }));
      }
    }
    function nextButton(i) {
      const isLast = i >= steps.length - 1;
      if (isLast && hooks.playHref) return h("a", { class: "btn primary lab-next-btn", href: hooks.playHref }, hooks.playLabel || "Play the mini-game →");
      const label = isLast ? "Finish" : `Next: ${steps[i + 1].label || "continue"} →`;
      return h("button", { class: "btn primary lab-next-btn", disabled: isLast, onclick: () => next() }, label);
    }
    function next() {
      if (!steps || current >= steps.length - 1) return;
      if (paused) setPaused(false);
      if (!kit?._next()) jump(current + 1);   // still animating this step: skip ahead
    }
    function back() { if (steps && current > 0) jump(current - 1); }
    /** Restart the script and fast-forward to the start of step i. */
    function jump(i) {
      target = Math.max(0, Math.min(steps.length - 1, i));
      start();
    }

    function showResult({ stars, text }) {
      const won = stars > 0;
      const reward = hooks.onFinish?.({ stars, text }) || {};
      const panelEl = h("div", { class: `lab-result ${won ? "won" : "lost"}` },
        h("div", { class: "lab-stars", "aria-label": `${stars} of 3 stars` },
          [1, 2, 3].map(i => h("span", { class: i <= stars ? "on" : "", style: { animationDelay: `${i * 160}ms` } }, "★"))),
        h("h3", {}, won ? (stars === 3 ? "Perfect!" : stars === 2 ? "Nice work!" : "Cleared!") : "Not this time"),
        text ? h("p", { html: text }) : null,
        reward.xp ? h("p", { class: "lab-xp" }, `+${reward.xp} XP${reward.best ? " · new best" : ""}`) : null,
        h("div", { class: "lab-result-actions" },
          h("button", { class: "btn primary", onclick: start }, won ? "Play again" : "Try again"),
          hooks.next ? h("a", { class: "btn ghost", href: hooks.next.href }, hooks.next.label) : null));
      stageWrap.append(panelEl);
      panelEl.querySelector("button")?.focus({ preventScroll: true });
      if (stars === 3 && !reducedMotion()) confetti();
    }

    function start() {
      kit?._dispose();
      stage.replaceChildren(); tools.replaceChildren(); hud.replaceChildren();
      stageWrap.querySelectorAll(".lab-result, .lab-toast").forEach(e => e.remove());
      caption.textContent = "";
      current = -1;
      root.classList.toggle("is-seeking", !!steps && target > 0);
      setPaused(false);
      kit = makeKit({ stage, caption, tools, hud, stageWrap }, mode, {
        onDone: text => {
          finished = true;
          root.classList.add("is-done");
          if (steps) renderStep(Math.max(0, current));
          hooks.onDone?.(text);
        },
        onFinish: showResult,
        target: () => target,
        autoplay: () => autoplay,
        onWaiting: w => root.classList.toggle("is-waiting", w),
        onStep: i => {
          current = i;
          const seeking = i < target;
          root.classList.toggle("is-seeking", seeking);
          kit._setSpeed(seeking ? TURBO : speeds[speedIdx]);
          if (!seeking && steps) renderStep(Math.min(i, steps.length - 1));
        }
      });
      kit._setSpeed(steps && target > 0 ? TURBO : speeds[speedIdx]);
      if (steps) renderStep(target);
      try { part.build(stage, kit); }
      catch (e) { console.error(e); caption.innerHTML = `<span class="lab-err">This scene failed to start: ${String(e.message).replace(/</g, "&lt;")}</span>`; }
    }

    start();
    return {
      dispose() { kit?._dispose(); kit = null; },
      togglePause() { if (mode === "watch") setPaused(!paused); },
      restart: () => steps ? jump(Math.max(0, current)) : start(),
      next, back,
      stepped: !!steps,
      get step() { return current; },
      get kit() { return kit; },     // for automated checks
      root
    };
  }

  /* ---------- confetti for 3-star wins ---------- */
  function confetti() {
    const c = h("canvas", { class: "lab-confetti", "aria-hidden": "true" });
    document.body.append(c);
    const ctx = c.getContext("2d");
    const W = c.width = innerWidth, H = c.height = innerHeight;
    const hues = ["#1D58B5", "#23805A", "#E9B64F", "#B83A2E", "#6B3FA0", "#5FD1C1"];
    const bits = Array.from({ length: 140 }, () => ({
      x: W / 2 + (Math.random() - .5) * W * .3, y: H * .35, vx: (Math.random() - .5) * 14, vy: -Math.random() * 14 - 4,
      r: Math.random() * Math.PI, vr: (Math.random() - .5) * .4, w: 6 + Math.random() * 6, c: hues[Math.floor(Math.random() * hues.length)]
    }));
    let t0 = performance.now();
    (function draw(t) {
      const age = t - t0;
      ctx.clearRect(0, 0, W, H);
      for (const b of bits) {
        b.vy += .45; b.x += b.vx; b.y += b.vy; b.r += b.vr; b.vx *= .99;
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.r); ctx.fillStyle = b.c;
        ctx.globalAlpha = Math.max(0, 1 - age / 1800); ctx.fillRect(-b.w / 2, -b.w / 4, b.w, b.w / 2); ctx.restore();
      }
      if (age < 1800) requestAnimationFrame(draw); else c.remove();
    })(t0);
  }

  window.Lab = { define, load, mount, has: n => registry.has(n), get: n => registry.get(n), confetti, h, s, COLORS };
})();
