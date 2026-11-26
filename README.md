# Ivan Ly | Portfolio

Static portfolio for Ivan Ly: a collection of interactive engineering experiments, shown as one scroll-driven film.
Live at https://notivanly.github.io/Portfolio/. Plain HTML, CSS and JavaScript, no build step, no dependencies. All paths are relative, so it works under any base path.

Scrolling moves a camera between eight scenes. In every scene the visitor changes something and sees the result at once. The film is reversible, never scrolls by itself and never takes over the wheel.

## The scenes

| # | Scene | What you change | What computes the answer |
| --- | --- | --- | --- |
| 1 | Bridge | Pick a car, pickup or heavy truck; set its position, speed and load; tap a bar | `sim-structures.js`: the same truss solver as the Truss scene. The wheel suspension is decoration and does not feed the numbers. Deflection is drawn magnified and says so. |
| 2 | Wind tunnel | Airfoil, sphere, cylinder, car or banana; wind speed and angle | `sim-fluid.js`: potential flow around a Joukowski airfoil (Kutta condition) and a source-panel solution for the other shapes, with textbook-style drag coefficients per object (the banana's is an estimate). The wake is an illustration. The airflow is labelled illustrative and the coefficients approximate. It is not CFD. |
| 3 | Truss | Drag joints, choose a preset, move or resize the load, remove a bar | `sim-structures.js`: stiffness-method finite elements. An unstable or invalid arrangement is reported as such and never shown as solved. |
| 4 | Physics sandbox | Spawn balls and boxes, grab and throw, gravity, bounce, friction, presets | `sim-motion.js`: sequential-impulse rigid bodies at 120 Hz, capped at 48 movable bodies. |
| 5 | Planet explorer | Pick a system, click a planet, change time speed | `sim-motion.js`: published data (below). Sizes are enlarged and distances compressed, and the scene says so. |
| 6 | Orbital mechanics | Central body, starting height and speed, prograde and retrograde burns, challenges | `sim-motion.js`: two-body gravity with a fourth-order Runge-Kutta integrator in km, km/s and s. Impact and escape end the flight. |
| 7 | Learning tools | SAT Question Bank Tracker, AMC Practice, Calculus III Visualizer, AP Atlas | The captures are real images of the live sites. The SAT preview is an interactive illustration and is labelled as one. |
| 8 | Build your own constellation | Click or tap to place stars, connect them, drag to rearrange | `sim-motion.js`: at most 24 stars. About and Contact sit below it. |

Every scene has a Reset, short text, and a collapsed "How it works" with the model, assumptions and limits.

### Data

- **Solar System**: NASA Planetary Fact Sheet (NSSDC).
- **TRAPPIST-1**: masses, periods and distances from Agol et al. 2021 (Planetary Science Journal); radii from the NASA Exoplanet Archive. No surface has been observed on any of these planets, so they are plain tinted spheres.
- **Lantern**: an invented system. It is labelled fictional wherever it appears and every number is marked invented.
- Planet colours and features for the Solar System are simplified from spacecraft and telescope images. Nothing speculative is presented as observed.

## Architecture

Four layers that do not reach into each other, plus an optional fifth.

| Layer | Files | Rule |
| --- | --- | --- |
| Simulation state | `sim-structures.js`, `sim-fluid.js`, `sim-motion.js` | Pure functions and plain objects. No DOM, no canvas, no timers. Run in Node by the tests. |
| Input | `input.js` | One place that turns pointer, touch and keyboard events on the canvas into `hit / down / move / up / tap` calls on the scene under the pointer. Gated: nothing is delivered unless that scene is live. |
| Rendering | `core.js`, `g3d.js`, `scenes-*.js`, `film.js`, `transitions.js` | Reads simulation state and draws it. One canvas, one render loop. |
| Controls | `labs.js` and the HTML panels in `index.html` | Real buttons, sliders and menus above the picture, with readable labels, native keyboard use and visible focus. They call the same simulation functions the canvas does, so a slider and a drag can never disagree. |
| Decorative media (optional) | `cinematic.js` | Footage laid over a scene for a few seconds on first arrival. Knows nothing about any simulation. See below. |

A scene is a factory returning `{ id, sim, side, init, advance(dt, m), draw(ctx, V, o), input?, anchor(V), outlineScreen?, focus? }`. `V` is a view from `PF.makeView`: the canvas size and `V.free`, the part not under the text column.

### The film

`film.js` holds the timeline (`ORDER`, `HOLD`, `TRANS`, in stage heights): hold, transition, hold, and so on through all nine scenes (the intro, then the eight above). Scroll position is the only input to the camera. During a hold the scene is live. During a transition no scene receives input (`PF.film.live` is -1), so a half-finished camera move can never change anything.

`transitions.js` has the eight transitions. They are written against what each scene reports about itself (`anchor`, `outlineScreen`, `focus`) and not against fixed geometry, because what is on screen depends on what the visitor has done: the wind tunnel may hold a sphere or a banana, the truss may have been rebuilt. They are decorative camera moves, not physical processes.

Edits are kept when you leave a scene and come back. The timeline only moves the camera; it never writes into a simulation.

### Rendering: Canvas 2D, on purpose

The page stays on Canvas 2D with a small hand-written 3D layer (`g3d.js`: orbit camera, depth-sorted faces, lit solids, shadows) rather than moving to WebGL or three.js.

- **The work is not pixel-bound.** Every scene is a few hundred shapes. Measured in software-rendered headless Chromium, a frame costs about 0.4 to 1.7 ms of script on average and under 3.5 ms at the 95th percentile, on desktop and on a phone at 2x, in every scene.
- **One canvas, one loop.** Mixing WebGL contexts with a 2D film means two render paths to keep in step with scroll, pause, resize and offscreen rules. Staying in 2D keeps a single `VisualHost` loop that stops when paused, hidden or offscreen.
- **No dependency, no build.** A 3D library would be the only third-party code in the site and would force a build or a CDN.
- **It degrades predictably.** Canvas 2D has no context-loss or driver cases to design around, and the same `draw` code serves the film, the still rows used for reduced motion, and the previews.
- **Honest trade-off.** Scenes are separate compositions joined by transitions, not one shared 3D world, and there is no GPU lighting. If a scene ever needs thousands of shaded triangles, that scene is the place to introduce WebGL, behind the same `draw` interface.

### Scrolling and touch

- Native scrolling is kept everywhere. On touch, `touchstart` is only cancelled when the touch begins on something the scene can grab (a truss joint, a sandbox body, a planet card, a star). Every other touch scrolls the page. A touch on the control panel scrolls the panel first, then the page.
- Links and the header jump straight to where a scene is settled, with no fast-forward through the scenes between. Direct links work, including the old tool anchors: `#sat-question-bank-tracker`, `#amc-practice`, `#calculus-iii-visualizer`, `#ap-atlas` (they open Learning tools with that tool selected) and `#mathematics`.
- Reduced motion, no JavaScript, or a failure in the film gives ordinary rows with a still canvas per scene. In rows mode the labs are live and the still canvases accept input. Animation starts paused; the header button plays it.
- The render loop stops when the animation is paused, the tab is hidden, or nothing is on screen.

## Decorative footage, and how Higgsfield (or anything else) plugs in later

Nothing here is connected to Higgsfield or any other service. No account, API or paid generation is used, and the page does not claim otherwise. The structure only keeps the door open.

The rule that makes this safe: **footage is decoration, never a result.** It is drawn after the scene, by `cinematic.js`, for a few seconds on first arrival. While it is up, input is held off and a tag reads "Decorative footage, not simulation output". Then it fades out and does not play again. The calculation underneath was running the whole time and is never replaced. It cannot overwrite an edit, because it only exists before the scene settles.

It is off until a page opts in. With no `data-cinematic` attribute there is no request, no footage and nothing visible. To use it later:

1. Make clips, stills or image sequences (from any tool) and put them in `assets/cinematic/`.
2. Write `assets/cinematic/manifest.json`:

   ```json
   {
     "version": 1,
     "scenes": {
       "bridge":  { "duration": 2.6, "poster": "assets/cinematic/bridge.webp" },
       "wind":    { "duration": 2.4, "sequence": { "pattern": "assets/cinematic/wind-{n}.webp", "frames": 48, "fps": 24 } },
       "planets": { "duration": 3.0, "clip": "assets/cinematic/planets.mp4", "poster": "assets/cinematic/planets.webp" }
     }
   }
   ```

   Scene ids: `home, bridge, wind, truss, sandbox, planets, orbital, learn, finale`. An entry needs a `poster`, a `clip` or a `sequence` (frames numbered `0001`, `0002`, ...). Paths must be relative and same-origin. Clips must be muted. Keep them short and small.
3. Add `data-cinematic="assets/cinematic/manifest.json"` to the `<html>` element in `index.html`.

Failure handling: a missing manifest, a bad path, a file that does not load, or footage that is not ready when the scene is reached is dropped without a trace. There is never an empty frame or a placeholder, and the procedural transitions are always the fallback. Reduced motion and a paused page never show footage. It never appears late over a scene the visitor is already using. `PF.cinematic.add(id, spec)` does the same from script.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | All content in order, as plain HTML: the content, the controls' markup and every link work without JavaScript (the controls themselves need it). |
| `styles.css` | Two layouts from one DOM: the pinned film (`html.film-on`) and ordinary rows. Accent colour is `--accent`. Experiment panel styles are at the end. |
| `sim-structures.js`, `sim-fluid.js`, `sim-motion.js` | The simulation layer (above). |
| `input.js`, `labs.js` | Canvas input; control panels and their syncing. |
| `core.js` | Shared maths, colour and text helpers, `makeView`, and the render loop (`VisualHost`). |
| `g3d.js` | The small 3D layer on Canvas 2D. |
| `vehicles.js` | Car, pickup and heavy truck shapes, with wheel rotation matched to motion. |
| `scenes-structures.js`, `scenes-flow.js`, `scenes-truss.js`, `scenes-sandbox.js`, `scenes-planets.js`, `scenes-orbital.js`, `scenes-learn.js`, `scenes-finale.js` | One module per scene, plus its control panel. |
| `film.js`, `transitions.js`, `main.js` | Timeline and compositor; transitions; page behaviour (film or rows, scroll mapping, navigation, menu, pause). |
| `cinematic.js` | Optional decorative footage. |
| `assets/learn/` | Captures of AMC Practice, Calculus III Visualizer and AP Atlas. |
| `tests/` | Node tests for the simulation layer. |
| `visuals-engineering.js`, `visuals-hero.js`, `visuals-transition.js` | Older code that was already unused before this upgrade. Not loaded. Safe to delete. |

## Tests

```
node tests/sim-structures.test.js   # 12: stiffness forces equal method of joints, reactions, unstable and invalid trusses, reset
node tests/sim-fluid.test.js        # 9: panel solution against the exact circle result, no flow through the surface, drag and lift rules
node tests/sim-motion.test.js       # 37: free fall, bounce, friction, grab and throw, the body cap, stacks, Kepler periods, energy,
                                    #     impact, escape, challenges, planet data, constellation
```

The interactive checks (every control in every scene, touch drag against scroll, keyboard, focus, reduced motion, resize, every transition forward and back, direct links, frame cost, pause and hidden-tab behaviour) were run with Playwright against headless Chromium. They are not committed, because they drive a local server and the installed Chromium. The same checks can be repeated by hand from the list in each scene's text.

## Known limits

- Tested in headless Chromium only: desktop sizes and phone emulation (touch events, 2x). Not tested on Safari, Firefox or a physical device.
- Fonts are loaded from Google Fonts. Headless runs blocked them, so layout was checked with the fallback fonts and may shift a few pixels with the real ones.
- At short desktop heights (below about 800 px) the text column of the denser scenes scrolls inside itself. On a phone the same column scrolls, with a fade at its lower edge.
- The physics sandbox is 2D with no continuous collision detection, so a very fast object can pass through a thin one.
- Wind-tunnel results are approximate and illustrative. Potential flow has no wake or separation, so the wake behind each shape is drawn as an illustration.

## Contact details on the page

Email `notivanly@gmail.com`, GitHub `github.com/notivanly`, Midway City, California. No phone number and no LinkedIn.
