# Ivan Ly | Portfolio

Static portfolio for Ivan Ly. Plain HTML, CSS and JavaScript, no build step, no dependencies.
Live at https://notivanly.github.io/Columbia-Portfolio/ (all paths are relative, so it works under the `/Columbia-Portfolio/` base path).

## Files

| File | Purpose |
| --- | --- |
| `index.html` | All content: hero, project index, nine projects, engineering, about, contact. Everything is plain HTML, so it works without JavaScript. |
| `styles.css` | Layout and design. The accent color is `--accent` at the top. |
| `main.js` | Small enhancements: mobile menu, active navigation item, animation pause button, lazy-started previews, Mathematics tabs. |
| `core.js` | Animation engine: one render loop, paused when a preview is offscreen, the tab is hidden, or the visitor pauses. |
| `visuals-hero.js` | The decorative globe in the hero. |
| `visuals-engineering.js` | The six project previews and the rocket-nozzle decoration. |
| `favicon.svg`, `social-preview.png` | Icon and link-preview image (rendered from the hero). |

## Editing a project

Each project is one `<article>` in `index.html`. Change the title, description, "Try this" line, button link and technical details in place. The project order, the numbering (`01 / 09`) and the project index at the top of the page are all written by hand, so update them together if you reorder.

- **Source code button**: only include it when a public repository with the source exists. Today that is every project except Bridge Physics Simulator (its repository currently holds only a README) and the SAT extension (a Chrome Web Store listing).
- **Technical details**: only describe what the code in the repository actually does.
- **Previews**: the animations are illustrations made for this page, not the linked tools. They are labeled "Illustrative preview". The Mathematics diagrams are static SVG drawings, labeled as illustrations, not screenshots.

## Animation

- Previews start when scrolled near and stop when offscreen. A hidden browser tab stops them too.
- The "Pause animation" button in the header stops everything. If the visitor prefers reduced motion, animation starts paused.
- The previews never show numbers, because they are not results from the linked tools.
- Tension and compression are shown by line style (solid or dashed) and by the letters T and C, not by color alone.

## Content notes

- Contact details on the page: email `notivanly@gmail.com`, GitHub `github.com/notivanly`, Midway City, California. No phone number and no LinkedIn.
- The Chrome Web Store listing for the SAT extension shows a different developer email (`notivanly2@gmail.com`).
