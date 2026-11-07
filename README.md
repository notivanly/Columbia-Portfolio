# Ivan Ly | Portfolio

An interactive STEM portfolio. Every visual is a live canvas animation drawn from real physics and mathematics (a statics solver, potential flow around an airfoil, Kepler's equation, the Lorenz system), so the numbers in the small readouts are computed, not typed in.

No build step, no frameworks, no dependencies. Plain HTML, CSS and JavaScript.

## Preview it locally

Open `index.html` in a browser. That is all.

(For the best result use a local server, for example `python3 -m http.server` and visit `http://localhost:8000`.)

## Put it on GitHub Pages

1. Create a new repository on GitHub, for example `portfolio`.
2. Upload every file in this folder (keep the `css` and `js` folders as they are).
3. Go to **Settings > Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**, pick the `main` branch and the `/ (root)` folder, then **Save**.
5. After a minute your site is live at `https://YOUR-USERNAME.github.io/portfolio/`.

Tip: name the repository `YOUR-USERNAME.github.io` to get the shorter address `https://YOUR-USERNAME.github.io/`.

## Add your own content

Almost everything you will want to change lives in **`js/data.js`**:

- **`site`**: your email, GitHub, LinkedIn, school, graduation year and location.
- **`projects`**: the six full-screen project scenes. Replace each `'#'` in `links` with a real URL. While a link is still `'#'` it shows a small "soon" tag and does nothing.
- **`math`**: the Mathematics & Educational Tools list. The three entries are placeholders.

To add a project, copy one object in `projects` and change its fields. Each project picks an animation with `visual`:

| visual | what it draws |
| --- | --- |
| `bridge` | 3D truss bridge with a moving vehicle and live member forces |
| `truss` | Pratt truss with tension / compression values |
| `wind` | Streamlines around an airfoil, adjustable angle of attack |
| `sandbox` | Rigid bodies, gravity and collisions (the cursor pulls them in) |
| `gravity` | A space-time grid bent by the planets |
| `orbital` | A Hohmann transfer with Kepler's equal-area wedges |
| `fourier` | Epicycles building a square wave |
| `riemann` | Riemann sums converging on an integral |
| `lorenz` | The Lorenz attractor |
| `nozzle` | Rocket bell-nozzle wireframe |

`side` (`1` or `-1`) flips a scene left or right, `tone` (`'dark'` or `'light'`) changes the graphite background, and `cy` moves the text block up or down.

The headings in `index.html` (hero text, About, Engineering, Contact) are plain HTML, so edit them directly there.

## Make it yours

- **Colours and spacing**: the `:root` block at the top of `css/styles.css`.
- **Accent colour**: `--signal` in the CSS, and the `A()` helper in `js/core.js` (it is `rgba(255,79,46,...)`).
- **Fonts**: Hanken Grotesk and Martian Mono, loaded from Google Fonts in `index.html`.

## Files

```
index.html            page structure
css/styles.css        design system and layout
js/data.js            YOUR content (edit this)
js/core.js            canvas engine, render loop, truss solver
js/visuals-hero.js    landing-page globe and orbits
js/visuals-engineering.js   bridge, truss, wind tunnel, sandbox, gravity, orbital, nozzle
js/visuals-math.js    Fourier, Riemann, Lorenz, constellation, signal rings
js/main.js            builds the scenes, scroll behaviour, navigation
```

## Notes

- Only the animations currently on screen are drawn, so it stays smooth.
- Respects `prefers-reduced-motion` (animations become still frames).
- Fully responsive; on phones the layout becomes a single column.
- Keyboard accessible, with visible focus outlines and a skip link.
