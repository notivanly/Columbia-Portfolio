# Ivan Ly | Portfolio

Static portfolio for Ivan Ly. Plain HTML, CSS and JavaScript, no build step, no dependencies.
Live at https://notivanly.github.io/Columbia-Portfolio/ (all paths are relative, so it works under the `/Columbia-Portfolio/` base path).

The page is one continuous scroll-driven film: a single pinned stage that moves from the intro through nine projects to About and Contact. Scroll position is the only input. It is reversible, never scrolls by itself, and never hijacks the wheel.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | All content, in order: intro, nine projects, About, Contact. Plain HTML, so the content and every link work without JavaScript. |
| `styles.css` | Two layouts from one DOM: the pinned film (`html.film-on`) and ordinary rows. The accent colour is `--accent` at the top. |
| `core.js` | Shared maths and colour helpers, the truss solver, and the render loop (`VisualHost`). One loop for the whole page; it stops when nothing is on screen, in a hidden tab, or when the visitor pauses. |
| `g3d.js` | A small 3D layer on Canvas 2D: orbit camera, depth-sorted draw list, lit faces, tubes, shaded spheres, fading ground grid, contact shadows, grain. This is what gives the scenes solid surfaces and depth. |
| `scenes-structures.js` | Scenes: Home (the bridge pulled apart), Bridge, Wind Tunnel, Truss. |
| `scenes-motion.js` | Scenes: Physics Sandbox, Planetary Gravity, Orbital Mechanics. |
| `scenes-math.js` | Scenes: SAT Question Bank Tracker, AMC Practice, Calculus III Visualizer, and the quiet ending behind About and Contact. |
| `film.js` | The timeline (how long each scene holds and each transition lasts), the compositor, and the `still` visual used for ordinary rows. |
| `transitions.js` | The ten transitions. |
| `main.js` | Page behaviour: choosing film or rows, scroll to timeline, text visibility, direct jumps, mobile menu, pause button. |
| `favicon.svg`, `social-preview.png` | Icon and link-preview image (rendered from the intro). |

## The film

Each scene is a factory returning `{ init(V), advance(dt, m), draw(ctx, V, o) }`. `V` is a view (see `PF.makeView`): the canvas size and `V.free`, the part not covered by the text column, where the scene composes its object. `o` carries what a transition needs to change (a camera pose, an explode amount, an opacity). A scene never knows about scrolling.

The timeline is in stage heights (`HOLD` and `TRANS` at the top of `film.js`):

```
[ hold 0 ][ transition 0>1 ][ hold 1 ] ... [ hold 10 ]
```

During a hold the scene is settled but still live, so the text beside it can be read and its links used. During a transition the camera moves and the objects change configuration. The picture is a pure function of scroll position, so scrolling back reproduces exactly the same frames. The film follows the scroll with a little damping, and snaps when paused or when you jump to a section.

| # | Transition | Connection |
| --- | --- | --- |
| 0 | Home to Bridge | The parts dock into the bridge, left to right, as the camera moves in. |
| 1 | Bridge to Wind Tunnel | The camera dollies along a chord member until it is a bar; the bar opens onto the airflow. |
| 2 | Wind Tunnel to Truss | The wing section is cut away; its ribs are the truss, and they move into place. |
| 3 | Truss to Sandbox | A joint fills the frame, then opens onto the pin of a pendulum. |
| 4 | Sandbox to Gravity | A ball is followed as the floor curves into the limb of a planet. |
| 5 | Gravity to Orbital | The camera dives into Earth and comes back out above it. |
| 6 | Orbital to SAT | Points on the orbits settle into the grid of questions. |
| 7 | SAT to AMC | The camera drops onto one question's figure, which becomes the construction. |
| 8 | AMC to Calculus III | The construction's rings lift into the surface. |
| 9 | Calculus III to About | The surface flattens and the camera settles. |

Every transition starts exactly on the settled first scene and ends exactly on the settled next one. They are decorative camera moves, not physical processes, and the caption says "Decorative transition. Not a simulation." while one plays.

To add or reorder a scene: add the scene factory, add its name to `ORDER` in `film.js` with a hold and a transition length, add a function to `transitions.js`, and add its `<article>` to `index.html` with matching `data-scene` and `data-key`.

## How a project is laid out

Each project is one `<article class="scene project">` in `index.html`: a title, one short sentence, one hint, the links, and a collapsed "How it works". The article also holds a `<figure class="preview">` with a still canvas and its caption; the film hides it and shows the caption in the bar along the bottom of the stage.

- In the film, the text sits in a narrow column over the picture, alternating sides (`data-text`). On a phone the picture takes the top half and the text sits below it; expanding "How it works" covers the stage and scrolls inside.
- Put anything longer than a sentence in "How it works": what the preview is, the model or implementation, assumptions and limits.
- **Source code button**: only include it when a public repository with the source exists. Today that is every project except Bridge Physics Simulator (its repository currently holds only a README) and the SAT extension (a Chrome Web Store listing).
- **Previews are illustrations** made for this page, not the linked tools, and the captions and "Preview." paragraphs say so. They never show numbers, because they are not results from the linked tools. None shows a real SAT or AMC problem.
- The bottom bar has a numbered link to each project. The header's Mathematics link goes to project 7. If you reorder projects, update the numbers, the index in the intro and the bar by hand.

## Navigation, mobile and reduced motion

- Links to any section jump straight to where that scene is settled (no fast-forward through the scenes between). Tabbing to a link in a scene that is not showing brings that scene into view. Header offsets are handled by the timeline in the film and by `scroll-padding-top` in rows.
- **Phones**: the same film with a portrait composition, fewer particles and no grain. The index in the intro is dropped (the bottom bar and the Menu list every project).
- **Reduced motion, no JavaScript, or if the film fails**: ordinary rows, each with its own still preview. All content, links and navigation are kept. With reduced motion the previews start paused; the Play button in the header animates them in place.
- **Performance**: one canvas, one loop. Device pixel ratio is capped at 2 and a pixel budget. Scene simulations only run while their scene is on screen. The loop stops in a hidden tab, when paused, and when nothing is on screen (rows mode). In the film the stage is pinned, so it is on screen for the whole film.

## Calculations

Carried over from the original previews, unchanged: the method-of-joints solver and bridge deflection, potential flow around a Joukowski airfoil, circle collisions with an impulse, the warped-sheet surface from point masses, and the Hohmann transfer solved with Kepler's equation and the vis-viva equation. New in the previews: rods, a spring and a pendulum in the sandbox; a numerical gradient and tangent plane on the Calculus III surface. Tension and compression are shown by line style (plain or broken or hatched), not by colour alone.

## Known limits

- The film is Canvas 2D with a hand-written 3D layer, not WebGL. Scenes are separate compositions joined by transitions, not one shared 3D world.
- At about 320 by 568 px, "How it works" sits below the fold of the text panel and needs a scroll inside it. The links stay visible.
- Tested in headless Chromium (desktop and phone emulation). Not tested on Safari, Firefox or physical devices.

## Contact details on the page

Email `notivanly@gmail.com`, GitHub `github.com/notivanly`, Midway City, California. No phone number and no LinkedIn.
