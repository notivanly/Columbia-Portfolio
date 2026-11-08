# Ivan Ly | Portfolio

Static portfolio for Ivan Ly. Plain HTML, CSS and JavaScript, no build step, no dependencies.
Live at https://notivanly.github.io/Columbia-Portfolio/ (all paths are relative, so it works under the `/Columbia-Portfolio/` base path).

## Files

| File | Purpose |
| --- | --- |
| `index.html` | All content: intro, nine projects, About, Contact. Plain HTML, so it works without JavaScript. |
| `styles.css` | Layout and design. The accent color is `--accent` at the top. |
| `main.js` | Small enhancements: mobile menu, active navigation item, animation pause button, lazy-started previews, Mathematics tabs. |
| `core.js` | Animation engine: one render loop, paused when a preview is offscreen, the tab is hidden, or the visitor pauses. |
| `visuals-hero.js` | The decorative globe in the intro. |
| `visuals-engineering.js` | The six animated project previews. (The rocket-nozzle scene in this file is no longer used on the page.) The bridge and wind previews also report where a member and the airfoil surface are on screen, so the transition below can aim the camera. |
| `visuals-transition.js` | The scroll transition between the first two projects (see below). It runs the bridge and wind previews unchanged and only moves the camera around them. |
| `favicon.svg`, `social-preview.png` | Icon and link-preview image (rendered from the intro). |

## How a project is laid out

Each project is one `<article>` in `index.html`: a title, a visualizer with one short caption, then a 20 to 30 word description, one hint, the links, and a collapsed "How it works".

- On desktop the visualizer takes about three quarters of the row and the text sits in a narrow column beside it. Each project sets its own proportions and ground color in `styles.css` (the `#project-id` rules), and every other project flips sides.
- On a phone the order is title, visualizer, caption, description, links.
- Put anything longer than a sentence in "How it works": what the preview is, the model or implementation, assumptions and limits.
- **Source code button**: only include it when a public repository with the source exists. Today that is every project except Bridge Physics Simulator (its repository currently holds only a README) and the SAT extension (a Chrome Web Store listing).
- **Previews** are illustrations made for this page, not the linked tools, and the caption says so. The three Mathematics diagrams are static SVG drawings, not screenshots. The previews never show numbers, because they are not results from the linked tools.
- If you reorder projects, update the numbers and the project index in the intro by hand.

## Scroll transition: bridge to wind tunnel

On wide screens (861px and up) with motion allowed, the first two projects share one pinned stage, about 1.9 screens of scrolling:

1. The bridge project sits settled for a short hold.
2. The camera dollies into the bridge's middle bottom-chord member and rolls until it lies flat and fills the frame as a bar.
3. The bar opens like an aperture onto the wind-tunnel flow, and the camera pulls back to the settled wing view.

Scroll position is the only input, so it is reversible and there is no auto-scrolling. The camera follows with a little damping so it has weight. The title and buttons never move; only the text swaps, once the frame is mostly the bar. Index links, the URL hash and tabbing to the wind-tunnel link all land on the right view.

On phones, tablets and with reduced motion (and without JavaScript) the two projects are ordinary rows with their own previews, like the rest. The sequence's lengths are `SEQ` in `main.js`; the camera moves are in `visuals-transition.js`. To extend the idea to other projects, give the next pair its own `data-seq` block and visual.

## Animation

- Previews start when scrolled near and stop when offscreen. A hidden browser tab stops them too.
- The "Pause animation" button in the header stops everything. If the visitor prefers reduced motion, animation starts paused.
- Tension and compression are shown by line style (solid or dashed), not by color alone.

## Contact details on the page

Email `notivanly@gmail.com`, GitHub `github.com/notivanly`, Midway City, California. No phone number and no LinkedIn.
