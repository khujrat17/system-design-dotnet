# Contributing

Thanks for helping people learn system design. Fixes, clearer explanations, better demos and new concepts are all welcome.

## Ground rules

- **Plain C#, no NuGet packages in the demos.** The point of `SystemDesign.Concepts` is to show the mechanism, not to call a library. Mention the production library in the lesson or the course text instead.
- **Small, deterministic, fast.** A demo should finish in a few seconds and print the same story every run (seed your `Random`).
- **Teach one idea per step.** Each `Out.Step` is one experiment; `Out.Good` / `Out.Bad` show the outcome; the demo ends with one `Out.Lesson`.
- Keep the tone plain and friendly. Short sentences beat clever ones.

## Run it locally

```bash
dotnet run --project src/SystemDesign.Web        # the lab UI on http://localhost:5090
dotnet test                                      # every demo runs, every scene exists, the web app works
```

## Improving an animation or mini-game

Each concept's **Watch** and **Play** tabs are one plain JavaScript file, `src/SystemDesign.Web/wwwroot/viz/cNN.js`,
built on a small toolkit with no dependencies. Read [docs/ANIMATIONS.md](docs/ANIMATIONS.md): it documents the kit and
what makes a good scene. Edit the file, reload the page, and press ↺ to restart the scene; no rebuild is needed.
Ideas for better games are very welcome: open a "Concept request" issue to discuss one first.

## Fixing or improving a demo

1. Edit the file in `src/SystemDesign.Concepts/Demos/`.
2. Run it: `dotnet run --project src/SystemDesign.Concepts -- <number>`, then check it in the UI's **Run** tab.
3. `dotnet test` must pass.

### How output becomes UI

All demo output goes through the `Out` helper ([IDemo.cs](src/SystemDesign.Concepts/IDemo.cs)):

| Call | Console | Web UI |
|---|---|---|
| `Out.Step("...")` | yellow `> ...` | a numbered step card |
| `Out.Line("...")` | plain line | monospace row |
| `Out.Line("label: 1,234")` (2+ in a row) | plain lines | **a bar chart** |
| `Out.Good("...")` / `Out.Bad("...")` | green / red | green ✓ / red ✕ callouts |
| `Out.Lesson("...")` | magenta | the 💡 lesson card (must be last) |

## Adding a new concept

1. Add `Dxx_Name.cs` in `src/SystemDesign.Concepts/Demos/` implementing `IDemo` with the next `Number`, and a `/// <summary>` (the UI shows it).
2. Add the matching course entry to the `C` array in `docs/system-design-course.html`, in the same position as the demo number. The web app reads its theory, trade-offs and flashcard from there.
3. Add `src/SystemDesign.Web/wwwroot/viz/cNN.js` with its animation and mini-game (see [docs/ANIMATIONS.md](docs/ANIMATIONS.md)).
4. Update the concept count in the tests and README.

## Pull requests

- One topic per PR, with a short description of what a learner gains.
- CI must be green (build with warnings as errors, tests, all demos, Docker image).
- Be kind in reviews. Everyone here is learning.
