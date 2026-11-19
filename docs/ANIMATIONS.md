# Writing an animation or mini-game

Every concept in the lab has two interactive tabs:

- **Watch**: a narrated animation that shows the mechanism moving (requests, data, failures).
- **Play**: a 30–90 second mini-game that makes the learner *use* the idea, scored with 1–3 stars.

Both live in one plain JavaScript file per concept: `src/SystemDesign.Web/wwwroot/viz/cNN.js`
(`c01.js` … `c26.js`). There is no build step and no framework. The shared toolkit is
[`viz/lab.js`](../src/SystemDesign.Web/wwwroot/viz/lab.js); [`viz/c05.js`](../src/SystemDesign.Web/wwwroot/viz/c05.js)
(caching) is the reference example.

## The shape of a file

```js
"use strict";
/* Concept 5 · Caching. Watch: …  Play: … */
Lab.define(5, {
  watch: {
    title: "Cache-aside, step by step",          // shown above the stage
    intro: "One sentence on what to look at.",   // optional, may contain <b>
    build(stage, k) {                            // stage: an empty <div>; k: the kit
      const svg = k.svg(760, 320, { label: "accessible description" });
      stage.append(svg);
      k.run(async () => {
        k.say("Narration under the stage. <b>Bold</b> the key idea.");
        await k.sleep(800);
        // … animate …
        k.done();                                // marks the animation as watched (+25 XP)
      });
    }
  },
  play: {
    title: "Cache Keeper",
    goal: "What to do and how to win, in one or two sentences.",
    build(stage, k) {
      // set up, read input, then end with exactly one of:
      k.win({ stars: k.starsFor(score, twoStarScore, threeStarScore), text: "What happened and why." });
      k.lose("Why it failed, and the hint to do better.");
    }
  }
});
```

## Stepped lessons (the Watch tab)

A Watch scene is a **stepped lesson**: the animation plays one beat, then waits for the learner to press **Next**
(or → on the keyboard). A panel beside the stage explains the current step, a stepper underneath shows every step,
and a "You'll learn" checklist ticks itself off. Back, jumping to any step and Replay work automatically: the page
restarts your script and fast-forwards to that step. So **your script must be deterministic up to each step**; use
`Math.random` only for decoration.

```js
watch: {
  title: "Why the product page got fast",
  intro: "One sentence on what the lesson follows.",
  steps: [                                   // 6–10 steps
    { label: "Slow page",                    // ≤ 2 short words, shown in the stepper
      tag: "problem",                        // problem | concept | technique | trade-off | failure | fix | case | result
      title: "Every page hits the database", // the panel heading
      body: "<p>Two or three short sentences. <b>Bold</b> the key term.</p>",
      idea: "One sentence: the thing to remember.",          // optional "Key idea" box
      changed: ["What moved on the stage", "A number that changed"] }   // optional "What changed" list
  ],
  learn: [{ text: "How cache-aside works", step: 1 }],    // checklist; ticks when the learner reaches `step` (0-based)
  build(stage, k) {
    // draw the scene…
    k.run(async () => {
      await k.step();            // step 1 starts immediately
      // …animate step 1…
      await k.step();            // waits for Next, then shows step 2
      // …animate step 2…
      k.done();                  // after the last step
    });
  }
}
```

Call `await k.step()` exactly once per entry in `steps`, and make it the first statement of the script. Show live
numbers with `k.hud({ "DB calls": 3, "Latency": "22 ms" })`: in a lesson they appear as metric cards above the stage.
Keep `k.say` for one short line about what is moving right now; the explanation belongs in the step's `body`.
A Watch scene without `steps` still works: it plays as one continuous animation.

The page gives every scene a Restart button. Watch scenes also get Pause and a 0.5× / 1× / 2× speed control.
These work automatically **as long as you only use the kit's timing functions** (`k.sleep`, `k.after`, `k.every`,
`k.loop`, `k.tween`). Never use `setTimeout`, `setInterval` or `requestAnimationFrame` directly: those don't pause
and keep running after the learner leaves the page.

## The kit (`k`)

**Time** (all on a virtual clock that pauses and changes speed)

| Call | What it does |
|---|---|
| `k.run(async () => {…})` | Run a script. Being cancelled by Restart or leaving the page is not an error. |
| `await k.sleep(ms)` | Wait. |
| `k.after(ms, fn)` / `k.every(ms, fn)` | Timers. Both return a function that cancels them. |
| `k.loop((dt, t) => {…})` | Called every frame with seconds since the last frame. Return `false` to stop. |
| `await k.tween(el, {cx: 100, opacity: 0}, ms, k.ease.out)` | Animate numeric SVG attributes, or `tx` `ty` `scale` `rot` (a transform). |
| `await k.travel(el, [{x,y}, …], ms)` | Move an element along points. |
| `k.place(el, {tx, ty, scale})` | Set an element's transform without animating. |

**Drawing** (SVG; every colour is a theme name, so light and dark mode both work)

| Call | Returns |
|---|---|
| `k.svg(w, h, {label})` | A responsive `<svg>` with that viewBox. |
| `k.box(parent, {x, y, w, h, label, sub, icon, tone})` | A rounded, labelled box centred on x, y. |
| `k.tone(box, "good")` | Recolour a box (or a dot): `neutral` `accent` `good` `bad` `warn` `lesson` `muted` `solid`. |
| `k.text(parent, x, y, "str", {size, anchor, tone, weight, mono})` | Text. |
| `k.line(parent, a, b, {tone, dashed, arrow, width})` | A connector, drawn behind boxes. |
| `k.dot(parent, x, y, {r, tone, label})` | A circle you can move. `.circle` is the `<circle>`. |
| `await k.packet(parent, a, b, {label, tone, ms})` | A dot that travels from a to b and disappears. |
| `k.float(parent, x, y, "+10", "good")` | Text that floats up and fades. |
| `k.meter(parent, {x, y, w, max, value, tone, label})` | A bar; call `.set(value, tone?)`. |
| `k.pulse(el)` | A quick "look here" bounce. |
| `k.s(tag, attrs, …children)` / `k.h(…)` | Raw SVG / HTML elements. `fill` and `stroke` accept theme names. |

Colour names: `accent` `good` `bad` `warn` `lesson` `ink` `muted` `line` `surface` `surface2` `paper`
`accentSoft` `goodSoft` `badSoft` `warnSoft` `lessonSoft`. Use them in `k.s()` attributes or via `k.colors.bad`.

**Narration, controls, input**

| Call | What it does |
|---|---|
| `k.say(html)` | Set the caption under the stage. |
| `k.button(label, onClick, {primary})` | A button under the stage. |
| `k.slider({label, min, max, step, value, format, onInput})` | A labelled range input. |
| `k.choices(["A", "B"] or [{label, …}], (option, button) => …)` | A row of answer buttons (style with `.right` / `.wrong`, set `disabled`). |
| `k.clearTools()` | Remove all controls under the stage. |
| `k.toast(html, tone)` | A short message floating over the stage. |
| `k.clickable(el, "Evict A", fn)` | Make an SVG element clickable by mouse, keyboard and screen readers. |
| `k.on(target, "keydown", fn)` | An event listener removed automatically when the scene closes. |
| `await k.step()` | Stepped lessons: start the next step (waits for Next). |

**Games**

| Call | What it does |
|---|---|
| `k.hud({Score: 120, Lives: "❤❤❤"})` | Update the score chips above the stage. |
| `k.win({stars, text})` / `k.lose(text)` | End the game; the page shows stars, XP and Play again. |
| `k.starsFor(score, two, three)` | 1, 2 or 3 stars from two thresholds. |
| `k.rand` `k.randInt` `k.pick` `k.shuffle` `k.clamp` `k.lerp` `k.fmt` | Small helpers. |

## Guidelines

- **Teach one mechanism per scene**, and narrate it with `k.say`. The learner should be able to explain the idea
  afterwards from the animation alone. Animations run about 40–90 seconds at 1×.
- **Games test understanding, not reflexes.** A learner who understood the concept should get 3 stars; a
  learner who guesses should get 1 or lose. Every ending explains *why* in one or two sentences.
- **Keep it accessible.** Clickable SVG elements get `tabindex="0"`, `role="button"`, an `aria-label` and an
  Enter / Space handler. Never rely on colour alone: add a label or icon.
- **Phones.** Use a viewBox about 720–780 wide and 260–360 high, with text at size 11 or more, so it stays readable
  when scaled to 360 px. Keep tap targets at least 28 SVG units.
- **No libraries, no network calls, no `localStorage`.** The page handles stars, XP and progress.
