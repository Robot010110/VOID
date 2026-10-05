# VOID — An Interactive Universe

## Master build brief for Claude Code

You are the creative technologist and lead graphics engineer on VOID. Read this entire document before writing a single line of code. Then build it phase by phase, exactly as described in "Build phases" near the end.

---

## 1. What VOID is

VOID is not a website for a company, a product, or a person. It is a piece of interactive digital art in the browser: a living universe the visitor can fall into, from the scale of the whole cosmos down to the night side of a single planet where a civilization's lights are glowing.

There is no call to action and nothing to sell. The only goal is that someone opens the link, and within ten seconds they lean toward the screen and forget they are on a website.

### The feeling

The mood is **awe and calm**. Vast, quiet, beautiful, slightly lonely in the way the night sky is lonely. Think of the emotional register of *Interstellar*'s quiet moments, *Outer Wilds*, *Journey*, and long-exposure astrophotography. It is never loud, never busy, never "gamer". Every frame should be screenshot-worthy.

If you ever have to choose between more features and more beauty, choose beauty.

### The visitor's journey

1. The screen is black. A single point of light breathes while the universe loads.
2. The wordmark VOID appears, with one quiet line: "Sound on. Take your time." and a button: "Enter".
3. They click. Sound blooms. The wordmark dissolves into stars. The camera starts very close to a single star and pulls back, and back, through its planets, out through its galaxy, out until thousands of galaxies hang in the dark. This one continuous pull-back teaches the core mechanic without a single word of instruction.
4. A faint hint appears and fades: "Scroll to fall into anything."
5. They scroll into a galaxy, then a star, then a planet. Each descent is seamless, with no loading screens and no page changes.
6. At a planet they might find a civilization: city lights on the night side, rings of structures in orbit, and a short fragment of that people's story.
7. They touch stars and hear them. They connect stars into their own constellations. They speed up time and watch orbits wheel. They shift what spectrum they see in. They find secrets.
8. They leave, and the next time they come back, the stars they drew are still there.

---

## 2. How you work on this project

These rules apply to every phase.

1. **Build in phases. Stop at the end of each phase.** Summarize what you built, list exactly what I should look at in the browser to judge it ("Zoom to the planet's terminator line and check the atmosphere goes warm orange at sunset"), and wait for me to say "continue". Beauty needs human eyes; do not run through all phases unattended.
2. **No placeholders, no TODO stubs, no grey boxes.** Every piece you ship must be finished-looking. If something is not ready, it is not in the build.
3. **Verify before you hand off.** At the end of every phase: `npm run typecheck`, `npm run lint`, and `npm run build` must all pass with zero errors, and the dev server must run with zero console errors or warnings (React key warnings, three.js deprecation warnings and WebGL warnings all count).
4. **Self-review visually if you can.** Set up Playwright with Chromium and a script (`npm run shots`) that loads the dev server, waits for the scene, and saves screenshots of each scale level to `/screenshots`. Use `--use-angle=swiftshader` (or `--use-gl=swiftshader`) so WebGL works headless. Look at your own screenshots and critique them before stopping. If headless WebGL proves impossible in this environment, say so once and rely on my review.
5. **Commit at every meaningful step** with clear messages (`feat(planet): atmosphere scattering with warm terminator`). Initialize git in Phase 0.
6. **Decide; don't ask.** Make design and engineering decisions yourself and record the non-obvious ones in `DECISIONS.md` (one or two lines each, with the reason). Only ask me something if you are truly blocked.
7. **Performance is part of beauty.** A gorgeous scene at 15 fps is a broken scene. Respect the budgets in section 12 from day one, not as a final cleanup.
8. **Never put per-frame updates through React state.** Animate with refs and `useFrame`, shader uniforms, and zustand's transient subscriptions. React re-renders are for structure, not motion.

---

## 3. Stack and setup

### Create the project

```bash
npm create vite@latest void -- --template react-ts
cd void
npm install three @react-three/fiber @react-three/drei @react-three/postprocessing postprocessing gsap zustand simplex-noise tone @fontsource-variable/fraunces @fontsource/hanken-grotesk
npm install -D @types/three leva vite-plugin-glsl eslint prettier @playwright/test vitest
```

Install the latest stable versions, and make sure the majors are compatible: React Three Fiber v9 requires React 19, drei v10 pairs with R3F v9, and @react-three/postprocessing v3 pairs with R3F v9. If npm reports peer conflicts, fix the versions rather than using `--legacy-peer-deps`.

### Tooling

- **TypeScript strict mode** on.
- **vite-plugin-glsl** so shaders live in real `.glsl` files with `#include` support for shared noise and lighting chunks. No giant shader strings inside components.
- **leva** is a dev tool only: mount its panel when the URL contains `?debug`, and make sure it is excluded from the production bundle via dynamic import.
- **Scripts:** `dev`, `build`, `preview`, `typecheck` (`tsc --noEmit`), `lint`, `test` (vitest), `shots` (Playwright screenshots).
- **Fonts** are self-hosted through @fontsource. No external font CDN, no external network requests at all. VOID must run fully offline once loaded.

### Folder structure

```
src/
  main.tsx
  App.tsx
  core/
    rng.ts                 seeded PRNG + hash helpers
    names.ts               procedural name generator
    universe.ts            deterministic universe description (data only, no three.js)
    quality.ts             quality tiers + detection
    store.ts               zustand store (level, target, transition, settings, secrets)
  scene/
    Experience.tsx         the single <Canvas>, post pipeline, level router
    camera/
      CameraRig.tsx        orbit, fly-to, cinematic paths
      transitions.ts       descend / ascend controller
    levels/
      UniverseLevel.tsx
      GalaxyLevel.tsx
      SystemLevel.tsx
      PlanetLevel.tsx
    objects/
      Starfield.tsx
      Galaxy.tsx
      Nebula.tsx
      BlackHole.tsx
      Star.tsx             a sun, close up
      Planet.tsx           surface + atmosphere + clouds + rings + lights
      GasGiant.tsx
      Rings.tsx
      Megastructures.tsx
      Constellations.tsx
    post/
      Lensing.ts           custom postprocessing Effect for black-hole lensing
      SpectrumLens.ts      custom Effect for the spectrum modes
  shaders/
    common/                noise.glsl, fbm.glsl, blackbody.glsl, lighting.glsl
    planet/ atmosphere/ clouds/ rings/ star/ galaxy/ nebula/ starfield/ blackhole/
  audio/
    engine.ts              Tone.js graph, level layers, star notes
  ui/
    Intro.tsx  Hud.tsx  Breadcrumb.tsx  InfoPanel.tsx  Fragment.tsx  Controls.tsx  Terminal.tsx
  content/
    anchors.ts             handcrafted worlds and their fragments
    voice.md               writing guide for all copy (from section 7)
  secrets/
    secrets.ts             definitions + detection
```

---

## 4. Architecture

### 4.1 Scale levels

The universe has four levels. Each one is its own self-contained world with its own local units, so floating-point precision never breaks:

| Level | What you see | Local unit scale |
|---|---|---|
| Universe | 40–80 galaxies, nebulae, faint cosmic-web filaments | the visible universe spans ~2000 units |
| Galaxy | one galaxy in full detail, its stars and nebulae | the galaxy spans ~400 units |
| System | one star, its planets, orbits, belts | the outermost orbit is ~200 units |
| Planet | one planet up close: surface, atmosphere, clouds, rings, moons, civilization | the planet radius is 1 unit |

Only the current level, plus the incoming level during a transition, is ever mounted. Never place objects from different levels in one coordinate space with real astronomical ratios.

### 4.2 The transition system (the heart of VOID)

Descending (for example, universe to galaxy) must feel like one unbroken fall:

1. **Approach.** The camera flies toward the target with GSAP (`power3.inOut`, about 2.2 s) until the target fills most of the view. Scrolling in over a target also triggers this once the camera crosses a distance threshold.
2. **Swap.** Mount the child level with its detailed version of the target placed and scaled so that its on-screen size and position match the parent's version exactly at that frame. Compute this from the camera's field of view and the target's projected radius.
3. **Crossfade.** Over about 0.8 s, fade the parent out and the child in using opacity uniforms on every material (all shaders take a `uFade` uniform). Keep the camera moving through the swap so motion never stops.
4. **Settle.** Unmount the parent, reset the camera to the child's local frame, and continue a gentle drift toward the child's resting framing.

Ascending (Escape, scrolling out past a threshold, or clicking a breadcrumb) is the same sequence in reverse.

Model the transition as a small state machine in the store: `idle → approaching → swapping → settling → idle`. Input is ignored while a transition runs, except Escape, which may reverse an approach that has not reached the swap.

The intro pull-back in section 10 uses this same system, chained, in reverse.

### 4.3 Deterministic procedural universe

- `rng.ts`: a small fast seeded PRNG (mulberry32 or sfc32) plus a string/number hash (cyrb53 or splitmix-style) to derive child seeds: `seed(galaxy i) = hash(universeSeed, i)`, `seed(star j) = hash(galaxySeed, j)`, and so on. Same seed, same universe, every visit, on every device.
- `universe.ts` produces plain data (types, positions, colors, sizes, names, civilization data) with no three.js imports. Components turn that data into visuals. Generate lazily, one level at a time.
- Write vitest tests proving determinism (same seed gives identical output) and sensible distributions.

### 4.4 Names

A syllable-based generator with a few phonetic "language families", so a galaxy's star names share a feel. Examples of the target sound: Ithren, Vael, Oru, Saelith, Kethra, Amaru Veil, Nostrim. No silly or real-world names, no numbers in names except catalogue-style designations for minor stars (VX-11 is fine for unremarkable stars, never for featured ones).

### 4.5 Store (zustand)

`level`, `path` (the chain of ids from universe down), `hoverTarget`, `transition` state, `timeScale`, `spectrum`, `audioEnabled`, `quality`, `driftMode`, `foundSecrets`, `constellations`. Persist `audioEnabled`, `foundSecrets` and `constellations` to localStorage, wrapped in try/catch so the app still works when storage is blocked.

---

## 5. Art direction

### 5.1 Palette

| Name | Hex | Use |
|---|---|---|
| Abyss | `#03040B` | deep-space base; never pure black, always faintly blue |
| Dust | `#1B1830` | nebula shadows, darkest gradients |
| Starlight | `#F4EBDD` | warm white for stars and all UI text |
| Ember | `#FFB36B` | warm stars, sunsets, civilization lights |
| Tide | `#6FD3E0` | atmospheres, ice, distant blue stars |
| Aurora | `#B07CFF` | nebulae, rare accents |

Everything is restraint. Most of the screen is dark. Color comes from light sources, not from decoration. Star colors come from a real blackbody approximation (2,500 K to 30,000 K), not from the palette.

### 5.2 Light and rendering

- `toneMapping`: AgX (or ACESFilmic if AgX looks flat in practice; record the choice in DECISIONS.md). Output in sRGB.
- Emissive values above 1.0 on stars, cores and city lights so bloom picks them up selectively.
- Post pipeline (@react-three/postprocessing): Bloom (mipmapBlur, luminanceThreshold around 0.85, intensity tuned per level), very subtle film-grain Noise, gentle Vignette, SMAA. Chromatic aberration only at the screen edges and only during transitions, as a feeling of speed. The custom Lensing and SpectrumLens effects from section 8 slot in here.
- The camera has a slow, almost imperceptible handheld drift when idle, so the image is never perfectly still.

### 5.3 Typography

- **Fraunces** (variable; light weights, soft optical size) for story fragments and the VOID wordmark. It should feel like found literature, not a sci-fi interface.
- **Hanken Grotesk** (light and regular) for the tiny amount of UI text.
- Sentence case everywhere. No all-caps labels, no tracked-out eyebrow labels above things, no monospace "data readout" labels, no middle-dot meta strings, no arrows appended to buttons. These are generic interface tells, and VOID should not look like a dashboard.
- The wordmark VOID is the one exception where type becomes art: it is set in Fraunces, and on Enter its letters break apart into stars that join the starfield.
- Line lengths under 60 characters for fragments, generous line-height.

### 5.4 UI

The interface is almost invisible. It fades to zero after 4 seconds without input and returns on mouse move.

- **Bottom left:** the breadcrumb of where you are ("Universe / Amaru Veil / Vael / Oru"). Each part is clickable to ascend.
- **Top right:** three small icon controls: sound, time, spectrum. Icons are drawn as simple custom SVG line glyphs, not an icon library.
- **Info panel:** at a planet or star, a short quiet panel with the name and two or three sentences in prose. Not a stats table.
- **Hover:** hovering a selectable object shows its name softly next to it, with a thin ring around the object.
- All controls are keyboard-focusable with a visible focus ring in Starlight.

Before building the UI, write a compact design plan (tokens, type scale, layout as ASCII wireframes, principles) into DECISIONS.md, review it against this brief, and revise anything that reads like a generic template. Spend boldness in one place: the universe itself. The UI stays quiet.

---

## 6. Visual systems (detailed specs)

### 6.1 Starfield (all levels)

- Three parallax layers of points with a custom ShaderMaterial: far (dense, tiny, dim), mid, near (sparse, larger, brighter).
- Per-star attributes: size, color (from blackbody temperature, weighted toward the real distribution: many orange/red, few blue), twinkle phase and speed.
- Fragment shader: soft gaussian disc, tiny bright core. The brightest ~0.5% get faint four-point diffraction spikes.
- Twinkle is subtle (5–10% brightness variation) and slower on brighter stars.
- Counts by quality tier: 30k / 15k / 6k.

### 6.2 The star (System level)

- Sphere with an animated surface: granulation from 3D cellular plus FBM noise, limb darkening, slow-drifting dark spots.
- Corona: camera-facing billboard with radial falloff and slowly flowing streaks; occasional gentle prominences.
- Emissive strong enough to bloom beautifully without blowing the whole screen white.
- Its color comes from its temperature and drives the light color for every planet in the system.
- A very subtle lens flare (ghosts and a halo) when the star is on screen and unobstructed.

### 6.3 Planets

Use high-subdivision icosphere geometry with LOD (detail drops when the planet is small on screen). Implement each layer as its own mesh and shader:

**Surface shader**
- Height from domain-warped FBM 3D simplex noise sampled on the sphere's normalized position (seamless, no UV seams).
- Biome color from height, latitude, and a second "moisture" noise: ocean depths, shallows, beaches, lowlands, highlands, snow caps, polar ice.
- Ocean: specular sun glint (Blinn-Phong or GGX) and slightly darker, saturated deep water.
- Normal perturbation from the noise gradient so mountains catch the light at low sun angles.
- Lit by the system's star direction; the night side is dark but never pure black (faint ambient from starlight).

**Atmosphere**
- A slightly larger sphere (about 1.03–1.06 × radius), BackSide, additive blending, no depth write.
- Approximate scattering: rim brightness from the fresnel term, multiplied by how lit that region is, with blue at full daylight shifting to warm Ember tones near the terminator (sunset band). A thin visible glow on the night-side rim.
- If time allows in Phase 1, upgrade to a simplified single-scattering Rayleigh/Mie raymarch with a small fixed step count; keep whichever looks better at acceptable cost.

**Clouds**
- A separate sphere just above the surface: animated FBM coverage with soft edges, rotating slightly faster than the surface, lit with the same sun direction, darker on the night side. Optional soft cloud shadows on the surface.

**Civilization lights**
- In the surface shader on the night side only: a civilization-density mask (noise clustered along coastlines and lowlands) multiplied by high-frequency noise thresholded into city points and the threads of roads between them. Warm Ember emissive above 1.0 so it blooms gently. Fade the lights in across the terminator.

**Planet types** (each a parameter preset of the same shader family where possible)
- Terrestrial, ocean world, desert, ice, lava (glowing cracks, emissive), toxic (sickly green-yellow haze, thick atmosphere), barren moon-like.
- Gas giants (their own shader): latitude bands with domain-warped flow noise, slow differential band motion, one or two persistent storm vortices.
- Rings (some gas giants and a few rocky worlds): flat ring geometry with radial band noise, transparency, forward-scattering brightening when backlit, and the planet's shadow on the rings computed in the shader with a ray-sphere test.
- Moons: small, simple versions orbiting larger planets.

### 6.4 The galaxy (Galaxy level)

- 2 to 5 logarithmic spiral arms. Generate positions once on the CPU into Float32Arrays: arm angle plus radius-based twist plus gaussian scatter that widens with radius, and a vertical thickness that thins toward the edges. A dense warm central bulge.
- Color by radius: warm yellow-white core to blue-white young stars along the arms, with pink star-forming knots (small Aurora-tinted clumps) along the arms.
- **Rotation happens in the vertex shader** via a `uTime` uniform, with angular speed depending on radius (differential rotation), so no CPU work per frame.
- Dust lanes: a second, darker particle layer with normal blending running along the inner edges of the arms, so the galaxy has real depth and silhouette.
- Additive blending for the stars, no depth write.
- Counts by tier: 400k / 200k / 80k.
- Within the galaxy, a few hundred selectable stars are rendered as slightly larger points that respond to hover; these are the stars you can descend into.

### 6.5 Universe level

- 40–80 galaxies, generated from the universe seed: spirals, barred spirals, ellipticals (smooth soft-glow ellipsoids), irregulars. Low-particle versions or impostor sprites rendered from the same shader logic.
- Nebulae: layered camera-facing planes (or a cheap low-step raymarch if the budget allows) with FBM-based density in Aurora, Tide and Ember tones, very soft edges, slow internal motion. They must never look like flat rectangles: check edges from every angle.
- Cosmic web: faint filaments connecting galaxy clusters, almost subliminal.

### 6.6 The black hole (one handcrafted anchor)

One special place in the universe holds a black hole. It is the visual showstopper.

- Accretion disk: a flat disk shader with turbulent flowing noise, white-hot inner edge fading to Ember, and Doppler beaming (the side moving toward the camera is brighter and bluer).
- Photon ring: a thin bright ring at the shadow's edge.
- Gravitational lensing: a custom postprocessing Effect (`Lensing.ts`) that takes the black hole's screen position and apparent radius and distorts UVs radially, roughly by `strength / distance²`, plus a pure-black event-horizon disc. Background stars and nebulae smear into arcs around it.
- Stretch goal, only if everything else is done and performance allows: a raymarched lensed disk in the style of the classic Interstellar render.

---

## 7. Civilizations and story fragments

### 7.1 Procedural civilizations

Some habitable worlds host a civilization, generated from the seed: a name, an age, and a state.

- **Thriving:** dense city lights, satellites, maybe an orbital ring.
- **Fading:** sparse, flickering lights.
- **Gone:** no lights, but ruins visible as geometric patterns in the terrain, and a silent derelict ring.
- **Transcended:** no cities at all, but a vast structure in orbit (a partial Dyson-swarm arc around the star, or a lattice around the planet) faintly humming with light.

Megastructures are built from instanced geometry with emissive accents, never detailed spaceships. Restrained, mysterious, architectural.

### 7.2 Handcrafted anchors and fragments

The procedural universe is the canvas. The stories live on about 12 handcrafted anchor worlds placed across the universe (`content/anchors.ts`). Each anchor has its own place in the universe, a planet type, a civilization state, and one to three short fragments.

Fragments appear when you settle at the planet: line by line, in Fraunces, softly fading in near the planet, never covering it. They fade out when you leave.

Write all fragments yourself, following this voice guide (also save it as `content/voice.md`):

- Short. One to three sentences. Never more than about 40 words.
- Quiet, specific, human-scale. One concrete image beats any amount of cosmic grandeur.
- No exclamation marks, no sci-fi jargon soup, no "ancient beings of pure energy", no clichés like "in the vastness of space".
- Melancholy is welcome; despair is not. The overall feeling is wonder.
- Planet and star descriptions in the info panel are plain prose, two or three sentences.

Tone examples:

> They built their cities on the night side, so the lights would face the stars.

> Every child here learns the same first word. It means "the sky is still there."

> The last broadcast from this world was a lullaby. It is still travelling.

> A cold ocean world. Its people left four thousand years ago, and the tide still comes in for them.

Never procedurally generate fragments; generated poetry reads cheap. Procedural worlds get only a name and a one-line plain description built from their actual properties.

---

## 8. Interaction and environment

### 8.1 Navigation

- **Desktop:** drag to orbit, scroll to zoom (zooming in over a target descends; zooming out past the limit ascends), click a target to fly to it and descend, Escape or Backspace to ascend, the breadcrumb to jump up several levels.
- **Touch:** one-finger drag to orbit, pinch to zoom and descend, tap to select, a small "up" control to ascend.
- **Keyboard:** Tab cycles through visible selectable objects; Enter descends; arrow keys orbit.
- Camera motion always eases; nothing snaps. Orbit has damping and gentle limits so you can't flip the camera into nonsense angles.

### 8.2 Touching stars

- Hovering a selectable star brightens it and plays its note (section 11).
- **Constellations:** hold Shift (or long-press on touch) and click stars one after another to connect them with thin glowing lines. Release to finish. The visitor can name the constellation. Saved constellations persist in localStorage and reappear on return, drawn faintly wherever those stars are visible.

### 8.3 Changing the environment

- **Time:** a control that steps through paused, 1×, 100×, 10,000×. At the System level orbits speed up and planets visibly rotate through day and night; at the Galaxy level the galaxy turns; at the Planet level clouds race and city lights wink on across the terminator. Transitions between speeds ease over a second.
- **Spectrum lens:** visible, infrared, and radio, implemented as the `SpectrumLens` post Effect plus a `uSpectrum` uniform the key materials respond to. Infrared: warm dust glows, stars dim, nebulae bloom in heat tones. Radio: a cold, almost monochrome view where hidden structures and signals show up (one of the secrets lives here).
- **Gravity touch:** at the Galaxy and Universe levels, holding the mouse button on empty space creates a gravity well; nearby particles bend toward the cursor in the vertex shader, and release smoothly.
- **Drift mode:** press D (or the visitor goes 60 seconds idle) and the UI disappears and the camera flies a slow cinematic tour through handpicked anchors, descending and ascending on its own. This is the mode for screensavers, demos, and showing VOID to a room. Any input ends it.

---

## 9. Secrets

Hidden things reward curiosity. Track them in the store; when one is found, a soft chime plays and a tiny counter appears briefly near the breadcrumb ("4 of 9 found"), then fades. No other UI, no hint list.

1. **The signal.** One faint star in the universe-level starfield blinks in a slow repeating pattern. Clicking it while it's lit leads to a hidden anchor world.
2. **The radio whisper.** In radio spectrum mode, one galaxy shows a structure invisible in visible light.
3. **The edge.** Fly out past the normal zoom limit at the Universe level and keep going. Eventually everything fades, and in the total dark there is one small last fragment.
4. **The pale dot.** Somewhere is a small blue planet with one moon and a fragment that reads "You are here." Found by descending, not marked anywhere.
5. **The black hole's interior.** Descend into the black hole. The screen goes fully dark, sound drops away, and after a few seconds one line of text appears before you are returned outside.
6. **The developer's door.** On load, the browser console prints a short, styled message to anyone who opens DevTools: a riddle that leads to the next secret.
7. **The terminal.** Typing the word the riddle points to (choose it yourself; something like "listen" or "origin") anywhere on the page opens a minimal fake terminal overlay styled in the VOID palette. It accepts a handful of commands (`help`, `ls`, `cat`, `whoami`, `scan`, `exit`), contains in-world logs, and one file holds coordinates that, when entered with a `goto` command, fly you to a hidden world. This is a nod to security researchers: make it a little CTF trail, fun and polished.
8. **The old code.** The Konami code (↑ ↑ ↓ ↓ ← → ← → B A) briefly makes every star in view sing a chord together.
9. **The persistence.** Return to VOID on a later day: one star you connected in a constellation has a new, faint companion and a fragment that acknowledges you came back.

Keep secret logic in `secrets/secrets.ts`, isolated and readable. Keep a `SECRETS.md` with spoilers for the maintainer.

---

## 10. The opening sequence

This is the most important 10 seconds in the project. Design it like a film opening.

1. **Loading:** pure Abyss. One small point of light in the center breathes (slow scale and brightness pulse) while fonts load, shaders compile, and the first two levels are generated. Precompile all shader programs before showing the intro (`gl.compile(scene, camera)` or drei's `<Preload all />`) so nothing hitches later.
2. **Title:** the point of light swells softly; the VOID wordmark fades in (Fraunces, light weight, large). Below it, small: "Sound on. Take your time." Then the "Enter" button. The click is the user gesture that unlocks audio.
3. **On Enter:** the first sound swells. The wordmark's letters break into particles that drift outward and become stars.
4. **The pull-back:** the camera starts close to a sun with a planet passing in front of it, then pulls back continuously: through the system, out of the galaxy, out to the whole universe. Use the ascend transitions from section 4.2, chained, with eased timing totalling about 10–12 seconds.
5. **The hint:** "Scroll to fall into anything" fades in at the bottom, holds for 4 seconds, and fades out forever (only shown on first visit).

If `prefers-reduced-motion` is set, replace the pull-back with a gentle crossfade straight to the universe.

---

## 11. Sound (Tone.js)

Sound is half of the immersion. Build `audio/engine.ts` as a clean, self-contained module.

- **Master chain:** gentle compressor, a long reverb (about 8–12 s decay), a limiter, and an overall volume that starts moderate.
- **Base drone:** always present. A low, slowly evolving pad (two detuned oscillators with a slowly moving filter) plus very quiet filtered noise.
- **Level layers**, crossfading over about 2 s on every transition:
  - Universe: very low, vast, almost subsonic swell.
  - Galaxy: a shimmering high pad with slow chorus, like distant voices.
  - System: warmer and more harmonic, with a faint slow pulse tied to the nearest planet's orbit.
  - Planet: atmospheric wind (filtered pink noise with LFO), plus a soft tonal hum if a civilization lives there.
- **Star notes:** hovering a star plays one soft bell-like note (FM or AM synth with long release into the reverb). Notes come from a single scale chosen for wonder (D Lydian or a major pentatonic). A star's pitch depends on its temperature: hot blue stars high, cool red stars low.
- **Transitions:** a soft "fall" sound, noise swept through a filter, timed to the descent.
- **Controls:** the sound toggle and the M key mute and unmute with a short fade. The preference persists.
- Audio must never start before the Enter click, and it must suspend when the tab is hidden.

---

## 12. Performance budgets and quality tiers

Target: a steady 60 fps on a mid-range laptop (Apple M1, or Intel Iris Xe integrated graphics) at the High tier, and smooth on recent phones at Low.

- **Quality tiers** in `core/quality.ts`: High, Medium, Low. They control particle counts (listed per system above), planet geometry detail, pixel ratio (clamp DPR to 2 / 1.5 / 1), post effects (Low drops film grain and the scattering raymarch), and nebula complexity.
- **Detection:** start from a guess (device memory, screen size, touch support, GPU renderer string where available), then use drei's `<PerformanceMonitor>` to step down when frame rate drops and step back up when there is headroom. Never oscillate: add hysteresis.
- **Budgets:** under 150 draw calls per frame; use instancing for any repeated mesh; zero per-frame allocations in `useFrame` (reuse vectors and matrices); dispose geometries, materials and render targets when a level unmounts.
- **Loading:** code-split levels with `React.lazy`; generate data lazily per level.
- Pause the render loop's heavy work in drift-free idle when the tab is hidden.
- Add a hidden FPS and draw-call readout in `?debug` mode (drei `<Stats>` or `r3f-perf`).

---

## 13. Mobile, accessibility, and fallbacks

- Fully usable on touch devices with the gestures from 8.1. UI controls have touch targets of at least 44 px.
- Respect `prefers-reduced-motion`: no camera shake, shorter and gentler transitions, no automatic drift mode.
- All UI is keyboard-accessible with visible focus. Fragments and info panels are also exposed as real DOM text with sensible ARIA roles, so screen readers can read the story.
- If WebGL2 is unavailable, show a beautiful static fallback: a CSS/SVG starfield, the wordmark, and one line saying VOID needs a browser with WebGL2.
- Handle WebGL context loss gracefully (restore or show the fallback; never a frozen frame).

---

## 14. Build phases

Work through these in order. Stop after each one for my review, as described in section 2.

**Phase 0 — Foundation**
Scaffold, dependencies, tooling, folder structure, git. Full-screen Canvas, tone mapping, post pipeline, quality tiers, `?debug` panel, seeded RNG and name generator with tests, and the three-layer starfield.
*Done when:* the starfield alone already looks beautiful, all checks pass, and the screenshot script works.

**Phase 1 — One perfect planet**
A single terrestrial planet in front of a sun, with every layer from 6.3: surface, ocean glint, atmosphere with warm terminator, clouds, and night-side city lights. Add the leva controls for every shader parameter. Then implement all the other planet types, gas giants and rings as presets.
*Done when:* the planet looks good enough to be a wallpaper from any angle. This phase sets the visual standard for everything else, so take your time here.

**Phase 2 — The star system**
The star shader and corona, orbits, multiple planets and moons, an asteroid belt (instanced), camera rig with orbit and fly-to, hover rings and names, the info panel, the breadcrumb, and the System-to-Planet transition.

**Phase 3 — The galaxy**
The spiral galaxy with GPU rotation and dust lanes, selectable stars, galaxy nebulae, and the Galaxy-to-System transition.

**Phase 4 — The universe**
Galaxy types, universe nebulae, the cosmic web, the black hole with lensing, and the full transition chain in both directions.

**Phase 5 — Civilizations and stories**
Civilization states and megastructures, the 12 handcrafted anchors with their fragments, `voice.md`, and fragment presentation.

**Phase 6 — Opening and sound**
The full opening sequence and the complete audio engine.

**Phase 7 — Interaction and environment**
Constellations, time control, spectrum lens, gravity touch, drift mode, and keyboard and touch navigation.

**Phase 8 — Secrets**
All nine secrets, the console riddle, the terminal, and `SECRETS.md`.

**Phase 9 — Polish and ship**
Performance tuning across tiers, mobile pass, accessibility pass, WebGL fallback, context-loss handling, favicon (a small glowing dot), meta and Open Graph tags with a real screenshot as the preview image, a README with the controls (no spoilers), and deployment configuration for Vercel.

---

## 15. Final checklist

Before declaring VOID finished, confirm every item:

- [ ] The first 10 seconds give chills with sound on.
- [ ] Every descent and ascent is seamless: no pops, no flashes, no frozen frames.
- [ ] Every level holds 60 fps on the High tier on mid-range hardware.
- [ ] No console errors or warnings anywhere, in dev or production.
- [ ] Every screenshot at every level could be a wallpaper.
- [ ] The UI disappears when not needed and never looks like a template or a dashboard.
- [ ] Fragments read like literature, not like generated text.
- [ ] All nine secrets work and nothing gives them away.
- [ ] It works on a phone.
- [ ] It works with reduced motion, a keyboard, and a screen reader.
- [ ] typecheck, lint, tests and build all pass.

Now start with Phase 0.