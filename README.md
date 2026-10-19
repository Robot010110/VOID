# VOID

An interactive universe you can fall into.

**https://void-universe.onrender.com**

VOID is a piece of interactive art for the browser. It is a whole universe:
- galaxies strung along a cosmic web;
- the stars in those galaxies, and the worlds around the stars;
- a few peoples on those worlds, with their lights and their stories.

You fall from scale to scale without a loading screen, from the cosmos down to the night side of a single planet. There is nothing to win and nothing to sell. Turn the sound on and take your time.

## Controls

| | Mouse or trackpad | Touch | Keyboard |
|---|---|---|---|
| Look around | Drag | Drag | Arrow keys |
| Zoom | Scroll | Pinch | |
| Fall into a galaxy, a star or a world | Click it, or keep scrolling over it | Tap it, or keep spreading over it | Tab to it, then Enter |
| Rise back out | Keep scrolling out, or click a place in the breadcrumb | Keep pinching out, or the arrow at the top left | Escape or Backspace |
| Bend the stars with gravity (in a galaxy, or among the galaxies) | Hold the button down on empty space | Long press on empty space | |
| Draw a constellation (in a galaxy) | Hold Shift and click stars; let go of Shift to finish | Long press a star, tap more stars, tap the sky to finish | Shift and Enter on each star |

Three controls sit at the top right, with keys that work anywhere:

| Control | Key |
|---|---|
| Sound on or off | M |
| Time: paused, as it is, 100 times faster, 10,000 times faster | T |
| What the eye sees by: visible light, infrared, radio | S |

**Drift:** press D, or leave VOID alone for a minute, and it tours its stories on its own. Any input brings you back.

The interface fades when you are not using it and returns as soon as you move. Your constellations are kept between visits.

Some things in VOID are not on any map.

## Running it locally

VOID needs Node 22 or newer, and a browser with WebGL2. Once loaded it makes no network requests at all.

```bash
npm install
npm run dev
```

| Script | What it does |
|---|---|
| `npm run dev` | The development server |
| `npm run build` | Typecheck, then build to `dist/` |
| `npm run preview` | Serve the built site |
| `npm run typecheck` | TypeScript, strict |
| `npm run lint` | ESLint |
| `npm test` | Unit tests (Vitest) |
| `npm run shots` | Screenshots of every level, in headless Chromium, into `screenshots/`; any console warning fails the run |

**Development URL parameters:**
- `?debug` shows the tuning panel and a frame-rate readout.
- `?quality=low|medium|high` pins the quality tier.
- `?galaxy=`, `?system=` and `?world=` open somewhere other than the universe; so do `?hole` and `?anchor=`, with the ids in `src/content/anchors.ts`.
- `?view=` picks one of a level's named framings.
- `?intro=skip` skips the opening.
- `?spectrum=` and `?time=` open in a spectrum or at a pace.
- `?fallback` shows the page a browser without WebGL2 sees.

## Deploying

It is a static site: `npm run build` writes everything to `dist/`.

- **Render** (where the link above lives) is a static site that builds with `npm ci && npm run build`, publishes `dist`, and deploys on every push to `main`.
- **Vercel** reads `vercel.json`: the same build, with long-lived caching for the hashed assets.
- **Link previews:** set `VITE_SITE_URL` to the site's address in the host's environment. Its default is in `.env`.

## How it is made

- React 19 and React Three Fiber 9 over three.js r182, with shaders in GLSL files.
- Post-processing for the tone mapping, the bloom and the film grade, and for the black hole's lensing.
- Sound from Tone.js, all of it made in the browser.
- Every galaxy, star and world is generated from one seed, a level at a time. A few worlds and their words are made by hand (`src/content/`).
- The decisions behind it all, with their reasons, are in [DECISIONS.md](DECISIONS.md).

Fonts: Fraunces and Hanken Grotesk, both under the SIL Open Font License, self-hosted through Fontsource.
