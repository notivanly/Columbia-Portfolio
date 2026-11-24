# Contributing

Thanks for your interest! This repo is a scroll-driven animation "film" built with plain HTML, CSS and JavaScript: no build step, no dependencies. Small, focused contributions are very welcome, including your first pull request.

## What to contribute

Good places to help:

- **Cross-browser and device testing.** The film has only been tested in headless Chromium. Reports and fixes for Safari, Firefox and real phones are the most useful thing right now.
- **New transitions or scenes** (see "Adding a transition or scene" below).
- **Accessibility**: keyboard navigation, focus order, reduced-motion behaviour, contrast.
- **Performance** on low-end phones.
- **Tests** for the truss solver and maths helpers in `core.js`.
- **Docs**: the three `visuals-*.js` files are not yet described in the README.
- Bug fixes, typo fixes and broken links.

Please do **not** change the personal content in `index.html` (the project descriptions, About, Contact) or the contact details in the README. That is the site owner's own content. If you spot a mistake there, open an issue instead.

Look for issues labelled `good first issue` or `help wanted`. If you want to take one, comment on it first so two people don't do the same work.

## Run it locally

There is nothing to install. From the repo root:

```
python3 -m http.server 8000
```

Then open http://localhost:8000. (Opening `index.html` directly mostly works too, but a local server matches how the site is hosted.) All paths are relative, so it also works under the `/Columbia-Portfolio/` base path on GitHub Pages.

## Making a change

1. Fork the repo and create a branch: `git checkout -b short-description`.
2. Make one focused change. Small pull requests get reviewed and merged much faster than large ones.
3. Match the existing style: plain ES5-style JavaScript in an IIFE, 2-space indent, no new dependencies, no build tools.
4. Check it by hand in at least one browser: scroll the whole film forwards and backwards, and try the reduced-motion and no-JavaScript fallbacks if you touched anything structural.
5. Open a pull request. Say what you changed and why, link the issue (`Fixes #123`), and include a screenshot or short clip for anything visual.

## Adding a transition or scene

The README describes the architecture in detail. In short:

- A **scene** is a factory on `PF.scenes` that returns `{ init(V), advance(dt, m), draw(ctx, V, o) }`. Look at `S.sandbox` in `scenes-motion.js` for a compact example. A scene never knows about scrolling.
- A **transition** is a function `(X, u)` in `transitions.js`, where `u` runs from 0 to 1. It must start exactly on the settled first scene and end exactly on the settled next one, and it must be reversible (the picture is a pure function of scroll position).
- To add a scene: add the factory, add its name to `ORDER` in `film.js` with a hold and a transition length, add a transition function, and add a matching `<article>` to `index.html` with `data-scene` and `data-key`.

Transitions are decorative camera moves, not simulations, and the caption says so while one plays. Keep it that way.

## Reporting bugs

Open an issue using the bug template. Please include your browser, OS and device, and what you expected to see.

## Be kind

Be respectful and patient with each other. Reviews are about the code, not the person.

## License

By contributing, you agree that your contribution is licensed under the MIT License in `LICENSE`.
