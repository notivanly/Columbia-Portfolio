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
| `visuals-engineering.js` | The six animated project previews. (The rocket-nozzle scene in this file is no longer used on the page.) |
| `favicon.svg`, `social-preview.png` | Icon and link-preview image (rendered from the intro). |

## How a project is laid out

Each project is one `<article>` in `index.html`: a title, a visualizer with one short caption, then a 20 to 30 word description, one hint, the links, and a collapsed "How it works".

- On desktop the visualizer takes about three quarters of the row and the text sits in a narrow column beside it. Each project sets its own proportions and ground color in `styles.css` (the `#project-id` rules), and every other project flips sides.
- On a phone the order is title, visualizer, caption, description, links.
- Put anything longer than a sentence in "How it works": what the preview is, the model or implementation, assumptions and limits.
- **Source code button**: only include it when a public repository with the source exists. Today that is every project except Bridge Physics Simulator (its repository currently holds only a README) and the SAT extension (a Chrome Web Store listing).
- **Previews** are illustrations made for this page, not the linked tools, and the caption says so. The three Mathematics diagrams are static SVG drawings, not screenshots. The previews never show numbers, because they are not results from the linked tools.
- If you reorder projects, update the numbers and the project index in the intro by hand.

## Animation

- Previews start when scrolled near and stop when offscreen. A hidden browser tab stops them too.
- The "Pause animation" button in the header stops everything. If the visitor prefers reduced motion, animation starts paused.
- Tension and compression are shown by line style (solid or dashed), not by color alone.

## Contact details on the page

Email `notivanly@gmail.com`, GitHub `github.com/notivanly`, Midway City, California. No phone number and no LinkedIn.
