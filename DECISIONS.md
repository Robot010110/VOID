# Decisions

Non-obvious calls, one or two lines each, with the reason. Newest phase last.

## Phase 0: Foundation

### Tooling

- **The project lives in the existing `VOID` folder**, not a nested `void/` from `npm create vite`. The folder was already dedicated to the project; template files came from a scratch scaffold.
- **ESLint (flat config) replaces the template's oxlint**, because the brief asks for ESLint. `react-hooks/immutability` is off for `src/scene` and `src/debug` only: three.js objects are mutated in `useFrame` by design, and VOID doesn't use the React Compiler.
- **TypeScript 6.0, not 7.0.** typescript-eslint supports TypeScript below 6.1.
- **three is pinned to r182.** R3F 9.8.1 (the latest) still constructs `THREE.Clock`, which logs a deprecation warning from r183 on. Revisit when R3F moves to `THREE.Timer`.
- **LF line endings everywhere**, via `.gitattributes` and repo-local `core.autocrlf=false`, so shaders and configs are byte-identical on every OS.
- **Imports carry explicit `.ts` extensions**, as the Vite template does. Pure modules in `src/core` also run directly in Node for quick checks.
- **`npm run shots` uses SwiftShader**, as the brief suggests. `VOID_GPU=1 npm run shots` uses the real GPU through ANGLE and runs about 5× faster. Any console warning or error fails a shot, so the script doubles as a smoke test. `/screenshots` is git-ignored.
- **URL parameters for review:** `?debug` (tuning panel and frame readout), `?quality=low|medium|high` (pins the tier), `?view=home|core|pole` (opening framing), `?tone=agx|aces|neutral` (tone mapper), `?shot=` (screenshot run: no fade-in, no drift).
- **leva only loads with `?debug`, from a lazy chunk.** Components describe their tunables in a small registry (`core/tweaks.ts`) whose values are the production defaults, so app code never imports leva. `?debug` also works on production builds, for profiling on real devices.

### Determinism

- **sfc32 seeded through splitmix32; cyrb53 for strings; child seeds hash parent + index.** Any level can be generated without its siblings. Golden-value tests lock the output, so returning visitors' saved constellations never move.
- **Names: four phonetic families, each galaxy a dialect of one** (re-weighted sounds and a favoured ending). Names are 4 to 8 letters, because three-letter names kept colliding with real words. Blocklists cover profanity, real places, people and brands, and common English words.

### Light and grade

- **Tone mapping is AgX, plus a gentle look in the film grade** (contrast 1.16, saturation 1.12). I compared AgX, ACES and Khronos Neutral on the galactic core. AgX kept the most structure in the band but read flat in the low mids. ACES and Neutral crushed the band's faint light.
- **AgX runs as a postprocessing effect, not `gl.toneMapping`**, because R3F's EffectComposer forces renderer tone mapping off while it is mounted.
- **Black is lifted to Abyss after tone mapping**, by a screen blend in the film grade. Used as a clear colour, `#03040B` gets crushed to pure black by any tone mapper.
- **Custom grain instead of the stock Noise effect.** Grain is added in display space with a triangular distribution, so it also dithers away banding in faint gradients. Stock Noise in linear space either vanishes in the darks or greys them.
- **Effect order: SMAA, bloom, tone mapping, vignette, film, merged into one pass.** SMAA re-samples the raw input buffer at edges, so anything merged ahead of it in the same pass would be lost there.
- **SMAA only below a 1.75 pixel ratio.** At retina density edge aliasing is barely visible, and on integrated GPUs SMAA cost about a third of the frame at DPR 2.
- **The grade approximates display space with gamma 2 (sqrt and square).** It runs on every pixel at up to twice screen resolution; exact sRGB curves cost a dozen `pow()` calls per pixel.

### Starfield

- **All stars share one point-spread function**: a gaussian core, a faint wide halo, and spikes on the brightest 0.5%. Brighter stars light more of it, so apparent size grows with brightness as on a real sensor. Sprites end where the light drops below visibility, so faint stars cost a few pixels.
- **Spikes share one orientation across the sky**, as through a single telescope, and are deliberately faint.
- **The starfield draws first, in the opaque queue, at the far plane**, with additive light and no depth test. Opaque planets cover it; anything transparent glows over it.
- **The home sky has a galactic band**, baked once on the GPU into a 2048×512 half-float strip (1024 wide on Low). Its dust dims and reddens the stars behind it, and faint stars brighten inside its glow, so dust lanes and star gaps always line up. The band is meant to fade at the Galaxy and Universe levels, where the view is from outside any galaxy.
- **The band's glow is a ring mesh at infinity with per-vertex UVs**, not a full-screen ray pass. There is no per-pixel trigonometry, and it costs nothing when the band is out of view.
- **The opening framing is composed:** the band rises from lower left, the warm core sits on the right third, and the upper left is quiet.
- **Parallax comes from accumulated camera travel divided by distance**, not absolute position. It feels the same at every scale, and jumps (a level swap re-centring the camera) can be ignored.

### Quality and performance

- **Tiers draw a brightness-ranked prefix of one 30k catalogue** (30k / 15k / 6k) and fade the rest in the vertex shader, instead of regenerating. Tier changes are smooth, and Low keeps the brightest stars.
- **The initial tier is a guess from the GPU string, memory, cores and pointer type.** Intel HD/UHD start on Low: a UHD 620 measured about 27 fps at DPR 1.5 and a steady 60 at DPR 1. Iris Xe, Apple silicon and discrete GPUs start on High.
- **The governor** (drei's PerformanceMonitor) has separate decline and incline bounds, a longer cool-down before stepping up than down, and a lock after three flip-flops, so it never oscillates.
- **The GPU probe reads `RENDERER` first** and only asks for `WEBGL_debug_renderer_info` when that is masked, because Firefox warns when the extension is touched. It never calls `loseContext()`, because Chrome logs that as a warning.

## Phase 1: One perfect planet

### Surfaces

- **Surfaces are baked once into cube maps, then shaded every frame.** Per-pixel domain-warped noise across a full-screen planet would cost hundreds of noise evaluations per pixel. The bake runs once per world, and again only when a debug parameter changes. Cube maps of 3D noise on the sphere have no seams and no polar pinching.
- **Two maps per rocky world.** A 16-bit cube map holds height, moisture, slow variation and a style mask. An 8-bit one holds normals and population. Normals are baked from central differences of the height, so lighting interpolates smoothly between texels instead of faceting. Face size is 1024 / 768 / 512 by tier, fixed at load.
- **Fine detail is added per pixel, and each octave fades out before it reaches the size of a pixel.** Close-ups gain ridges and fractal coastlines while distant views stay calm. The same rule governs clouds and city lights.
- **No vertex displacement.** At planetary scale relief is a fraction of a pixel at the limb, and a smooth sphere keeps the atmosphere's analytic ground intersection exact. Icosphere detail is chosen by on-screen size, keeping the silhouette within a quarter pixel of a true circle.
- **Five terrain styles share one shader family:** continents, dunes, ice, lava and craters. Presets are parameter sets; airless moons reuse the barren and ice presets.

### Atmosphere and light

- **The raymarched single-scattering atmosphere won over the fresnel rim approximation.** It gives the blue limb, the warm terminator and a bright backlit rim. Sunlight transmittance comes from a 256×64 precomputed table, which also carries the planet's soft shadow, so each sample costs one texture read. Units are planet radii. The atmosphere is drawn about 6× thicker than Earth's, with coefficients scaled down to keep Earth-like optical depth.
- **Samples follow the path.** A short drop to the ground gets 4 samples, bunched towards the dense air near the surface. Long grazing paths along the limb get up to 14 / 10 / 5 by tier. This cut the close-view atmosphere cost by more than half.
- **Low keeps a minimal march instead of dropping it, a deliberate deviation from the brief.** With adaptive sampling most of the planet already uses 4 samples. The fresnel fallback would lose the warm terminator for a small saving. Revisit in the Phase 9 performance pass.
- **Sun irradiance is set so a white sunlit surface sits just under the bloom threshold** (π × 0.95). Only real light sources bloom: the sun, ocean glint, city lights and lava.
- **The warm terminator is lifted slightly.** Ground light uses transmittance^0.8, clouds ^0.7. The exact values read as dirty brown instead of a sunset glow.

### Layers

- **Translucent layers output premultiplied colour.** Clouds, atmosphere and rings add light plus an alpha that dims what is behind, so the atmosphere glows, hazes the ground and dims the stars behind the limb in one blend.
- **Draw order:**
  1. The sky and the distant sun, first in the opaque queue.
  2. The surface and moons, opaque.
  3. Clouds, then the atmosphere, then rings.

  Rings come after the atmosphere so their near side is never hazed. Their far side, where it shows beside the limb, is slightly under-hazed, which is invisible in practice.
- **Clouds use two levels of domain warping** for curling, streaming systems. Cyclone twists stay gentle, because strong shear winds fine detail into concentric rings.
- **Clouds turn about 7% faster than the ground and churn along a curl flow.** The flow comes from one gradient-noise evaluation and is divergence-free, so cloud neither piles up nor tears.
- **City lights never shrink below about a pixel.** Like the stars, they keep part of their energy as they shrink. Overlapping lights roll off exponentially, so distant cities read as clusters and dense metros glow without burning out.
- **Population is baked:** coastal, low, temperate, liveable land, gathered unevenly by noise. Metropolitan areas are its densest parts. The cloud base glows faintly above them at night.
- **Gas giants bake their band field once; all motion happens at lookup time.** Each latitude turns at its own rate and storms swirl the lookup, so storms ride their bands and nothing is re-baked per frame.
- **Ring density comes from a 1024×1 profile** built from radial waves and smooth gaps, with mipmaps for distance. The planet shadows the rings by a ray-sphere test with penumbra; the rings shadow the planet by a ray-plane test.

### Framing

- **Tall screens widen the view instead of cropping it.** The vertical field of view is 50° on landscape screens. On portrait screens it widens to keep at least 42° across, up to 72°, where perspective starts to stretch the planet's edges.
- **The opening shot is composed for the screen's shape.** On a wide screen the sun sits beside the planet. On a tall one it rises below it, and the planet stands a quarter further back so the whole crescent fits.

### Review and performance

- **`?level=sky` shows the Phase 0 sky until levels connect in Phase 2.** `?planet=<kind>` picks a preset, and `?debug` can switch it live.
- **`npm run shots` now uses the real GPU and falls back to software automatically.** `npm run shots:soft` forces SwiftShader as the brief describes. One high-quality planet shot takes about 2.3 minutes on SwiftShader against about 15 seconds on the GPU.
- **Measured on an Intel UHD 620 at 1600×900, DPR 1:**
  - Planet filling the screen: 37 fps on Low (where this GPU starts) and 29 on High.
  - The normal framing: 60 fps on Low and about 52 on High.
  - Iris Xe is roughly 2.5–3× faster; the governor steps weaker GPUs down a tier.

## Phase 2: The star system

### Interface design plan

Written before the interface was built, reviewed against the brief, then revised: a first draft gave the info panel a translucent card and put the place's name both on the card and at the end of the breadcrumb. Both read as a dashboard template, so the panel lost its box and the two names became one.

**Principles**

- The universe is the content and the interface is its caption. Nothing is boxed: no cards, no borders, no glass. Text sits on the sky, kept legible by a soft dark halo, not a container.
- Two voices. Fraunces (light, soft) speaks the names of places. Hanken Grotesk light carries what navigates or explains.
- Sentence case. No capitals, tracking, monospace, middle dots, arrows or icons. Breadcrumb separators are plain slashes in the quiet tier.
- One colour, Starlight, in three strengths. Ember, Tide and Aurora stay reserved for light in the universe.
- Motion is opacity, plus a small rise for arriving text. Nothing slides in from the edges.
- Everything is reachable by keyboard. A focused world wears the same ring as a hovered one; every other control gets the Starlight focus outline.

**Tokens**

| Token | Value |
|---|---|
| Text, names | Starlight at 92% |
| Text, prose | Starlight at 68% |
| Text, quiet (ancestors, slashes) | Starlight at 46% |
| Halo | `0 0 18px` Abyss at 90%, plus `0 0 2px` at 60% |
| Name | Fraunces 300, soft, `clamp(1.75rem, 1.2rem + 1.6vw, 2.6rem)`, line height 1.05 |
| Prose | Hanken 300, `clamp(0.9rem, 0.86rem + 0.2vw, 1rem)`, line height 1.6, at most 34ch |
| Crumbs | Hanken 300, 0.8125rem |
| Hover name | Fraunces 300, 1.0625rem |
| Gutter | `clamp(16px, 3.2vw, 44px)`, plus safe-area insets |
| Easing | `cubic-bezier(0.22, 1, 0.36, 1)` |
| Timing | text in 0.9 s; out 0.5 s; idle fade 1.6 s |

**Layout**

One caption, bottom left. The breadcrumb's ancestors are a quiet line, the current place is its large name, and the description follows it. The name is the breadcrumb's last item, styled as a title, so it appears once.

```
Desktop, at a planet                          Phone, at a planet
+-------------------------------------------+  +-----------------------+
|                                           |  |                       |
|                ( ) Oru      hover: ring   |  |        (planet)       |
|                             and name     |  |                       |
|                                           |  |                       |
|              (the world)                  |  | Vileth /              |
|                                           |  | Ithasal               |
| Vileth /                  ancestors       |  | A temperate world of  |
| Ithasal                   current, large  |  | blue oceans and green |
| A temperate world of blue oceans and      |  | continents...         |
| green continents...       2-3 sentences   |  +-----------------------+
+-------------------------------------------+
```

**Behaviour**

- The caption fades out when a transition starts and returns once the camera settles.
- The interface fades to nothing after 4 s without input and returns on any input. When a new place arrives, the timer starts only after the description has had time to be read: about 1.5 s plus 0.3 s per word.
- Hovering a world, or focusing it with Tab, shows a thin ring around it and its name beside it. Click, tap or Enter falls into it.
- Escape or Backspace goes up a level. On touch, the breadcrumb's ancestors are the way up, padded to at least 44 px.
- The caption is real DOM text in a polite live region, so a screen reader announces each arrival.

### Systems

- **A galaxy speaks one language**, seeded from the galaxy's seed, so a star and its worlds share a sound.
- **The home system is star 0 of galaxy 0, and featured.** It always has a sun-like star, at least six worlds, a lit temperate home world nearest the habitable zone, a banded and a ringed giant, and a belt.
- **World kinds follow temperature zones.** Zones are measured against the habitable distance, which grows with the square root of the star's luminosity. Kinds already used are less likely, for variety. Presets vary within their tuned ranges, and giants pick from curated palettes, so every world looks as good as the showroom's.
- **Until civilisations arrive in Phase 5, at most one temperate world per system is lit.**
- **Sunlight doesn't fall off as 1/r².** It dims gently beyond the habitable zone (power 0.35, floor 0.55), so outer worlds stay readable. Its colour is the star's blackbody.
- **Orbits follow Kepler's third law.** At 1x the innermost world takes about 10 minutes and the outermost about 5 hours, so the system is calm but alive.

### Levels and transitions

- **Each level lives in its own frame.** A child's frame is anchored in its parent's: its origin at the moving world, its unit that world's radius. During a swap the leaving level is drawn through that anchor in the arriving level's frame. Only a parent and its child are ever mounted together.
- **One camera rig for every level.** A flight is computed in the parent's frame and re-expressed in whichever frame is active. The swap only changes units: the picture doesn't move.
- **The arriving level mounts unseen when the approach begins.** It bakes its maps in the background and compiles its shaders in parallel (KHR_parallel_shader_compile) against a half-float target, because three keys programs by output colour space. The swap waits until it is ready and the world fills the view: 1.35x its resting distance going down, 1.5x going up.
- **The world itself is handed over, not crossfaded.** Both levels draw it from the same baked maps, so it is identical in the swap frame. Everything else crossfades over 0.8 s.
- **Arrival is three-quarter lit,** with the star 62 degrees to the side and off screen. The planet level's sun is smaller than the system's star would look from there, and that difference never shows.
- **Ascents end on the star, still facing the way they started,** so the camera never swings around.
- **Transition clocks advance with rendered frames. GSAP only provides the easing curves** (power3.inOut and friends). Driving GSAP's ticker from the render loop timed tweens inconsistently, and the screenshot run needs fixed steps.
- **Escape turns back an approach before the swap.** Zooming falls into a world after about 140 px of wheel over it, and rises out of a level after about 260 px past the outer limit.
- **The background bake budget is counted in tiles of the current pass.** It grows by one per frame on time, halves after a late frame, and restarts at one with each new pass, because passes differ about tenfold in cost. A byte budget with fixed cost weights overshot by hundreds of milliseconds at pass changes.
- **Production builds skip three's shader error readback.** Its synchronous log queries stalled the swap frame. Development and the screenshot run keep it.
- **Close-up maps keep one spare set, and moons have their own cache group.** Sharing a group evicted textures that were still on screen, which stalled the GPU for half a second.
- **Level frames are memoised,** so a swap updates the store without re-rendering whole levels.
- **The near plane follows the camera's distance** (1%), keeping depth precise from 200-unit orbits down to a planet's radius.

### Star, flare, orbits, belt

- **The star's surface pattern is baked once:** two granulation fields, the supergranular network and the spot field. The shader blends the two fields region by region over time, so the surface boils for one texture read and one noise sample per pixel.
- **The face is tinted like an astrophotograph through a filter.** It uses 0.78x the star's temperature, with temperature swings exaggerated 2.5x, so up close it is golden or ember instead of a pale disc that AgX whitens. The light it casts uses the true temperature.
- **The star adds light but writes depth.** Worlds behind it are hidden and worlds in front of it cover it.
- **Prominences are arches standing on the limb,** each on its own slow cycle of minutes. Noise-crack versions read as lightning.
- **The lens flare is a halo and six ghosts in screen space,** at 0.2-1.8% strength. It is visible only while the light is in frame and not hidden. Occlusion is a ray-sphere test against the worlds, with a smooth ramp as the limb crosses the light.
- **Orbits are ribbons of constant width on screen.** They are brightest just behind each world, faint elsewhere, and fade as the camera nears the world being visited.
- **The belt is a single instanced draw.** Kepler shear runs in the vertex shader. Rocks never shrink below a pixel: they are drawn at that size with their light spread, like the stars.
- **The transition's colour fringe lives in the film pass.** It reads the scene buffer at offset coordinates and applies the shift as a difference, so it needs no extra full-screen pass.

### Review and performance

- **The default page opens on the home system.** `?world=<index>` opens close up on one of its worlds. `?view=` takes home, top, edge, wide or star at the system level, and home, night, terminator, day, pole or close at a world. `?planet=<kind>` is still the Phase 1 showroom.
- **Measured on an Intel UHD 620 at 1600x900, DPR 1, production build:**
  - System view: 60 fps on Low and High.
  - Star close-up: about 56 fps.
  - Descents and ascents on Low (where this GPU starts): p95 frame time 16.7-33 ms.
  - On High the crossfade frames run 50-100 ms on this GPU, because both levels draw at full detail. Iris Xe is roughly 2.5-3x faster.

## Phase 3: The galaxy

### The galaxy itself

- **Arms are density waves, not drawn spirals.** Every star moves on a slightly lobed orbit whose lobes turn with radius, so neighbouring orbits crowd into logarithmic spirals. Stars move at their own speed from a flat rotation curve (inner stars faster) and pass through the arms, while the arms keep their shape and turn slowly as a whole. A spiral drawn into the particles would wind itself up under differential rotation within minutes at 1x, and instantly at the time control's 10,000x.
- **Arms are as strong as orbits allow without crossing.** The lobe size is set from the crowding it produces (0.68 to 0.86 of the point where orbits would cross), so arms are bold but never collapse into a hard line.
- **Young light, knots and dust are placed against the crest at a star's actual radius.** Placing them by their orbit's radius squeezed the gap between dust lane and young stars to almost nothing, because a lobe moves stars in or out depending on where they are in the arm. Dust lanes sit upstream, on the arm's inner edge. Knots sit just downstream.
- **Knots and dust lanes turn with the arms; stars move through them.** Gas is squeezed into lanes and forms stars as it passes, so lanes and knots are always there while their material changes. Lanes wander, thicken and break along each arm and throw off feathered spurs.
- **The home galaxy is a barred two-armed spiral named Valath Drift.** Its name was picked by ear from the first few its language offered. The first one, "Feliss Reach", echoes *Felis*. More real words joined the banned list after a star came out as "This", "Ithil" and "Sakura".
- **About 300 stars can be visited, and each is its system's own star.** A star's identity (name, colour, size) is generated before its worlds, so the galaxy shows them without building 300 systems. Unremarkable stars carry catalogue designations (WH-93); featured, hot and bright ones keep names. A golden test pins the home system's names.

### Drawing it

- **The soft light and dust render into their own buffer at reduced resolution and are laid over the scene.** A diffuse glow needs no retina resolution, and blending tens of thousands of sprites is what a weak GPU pays for. The buffer is sized in CSS pixels by tier: 0.6 of the screen on High, 0.48 on Medium, 0.34 on Low. Up close, where the glow covers the screen, its resolution drops further, to half at most, until frames are on time, and climbs back when there's room.
- **Sharp point stars draw at full resolution on top.** The galaxy's resolved stars and the stars that can be visited stay crisp; the soft glow doesn't need to be.
- **The dust has depth.** The light is stored in three runs (below the dust layer, inside it, above it), and the run beyond the plane draws before the dust, the run in front after it. Each run is its own draw over shared buffers: drawing one buffer three times and discarding the wrong points cost more than the points themselves on this GPU.
- **Particles are sized like a smoothing length.** Particles are larger where the galaxy is sparse, so its outskirts and the edge of the bulge are a haze rather than a spray of blobs. Their surface brightness is the same from any distance. Lower tiers draw a prefix of the same particles, each larger and brighter.
- **Up close, the soft light thins away and an analytic glow gives it back.** Each pixel integrates the disc along its ray through the same model the particles sample, over just the distances where particles have thinned. Its coefficients come from the particles' own counts and light, so the two match in brightness.
- **Light nearer than a resolving distance isn't glow.** An eye that close sees those stars one by one. So falling into the disc ends in a dark, starry sky with the galaxy's band along the horizon, like the Milky Way from Earth, not a bright fog.
- **The eye adapts inside the disc.** The galaxy's glow dims by about half as the camera enters it, while its resolved stars keep their light.
- **Nebulae are a few camera-facing layers each, sampling one shared baked noise atlas.** The atlas has four kinds of noise, one per channel. Layers sit at different depths, sizes and slow turns, so no side is flat, and they thin away before the camera can pass through one. They're larger than life (8 to 15 units for an emission nebula) so they read as clouds from across the galaxy. They glow brighter than the disc, as real star-forming regions do in hydrogen light.
- **Bloom intensity follows the level.** A galaxy is extended light that can fill the screen, so it blooms at 45% of a system's strength, easing through transitions.

### Galaxy and system

- **A system's frame is turned inside its galaxy so its sky's band is the real galactic plane.** Every system shows the band composed for the earlier phases (so their framings are unchanged), turned so its bright core faces the galaxy's centre. Systems end up tilted about 25 degrees against the galactic plane, as real ones are. Seen from inside, the galaxy's light and the sky's band are one thing.
- **The camera banks into the system's plane as it falls.** The rig now has an up basis. Flights move the camera's direction and its up along shortest arcs, planned in the frame where they end, so nothing swings round. The sky turns early in the fall, while its band is still too faint to see turning.
- **Inside the disc, the sky's band takes over from the galaxy's particles.** The galaxy reports how far inside its disc the camera is, and the starfield fades its band in to match, whatever the level.
- **The star is handed over whole.** The galaxy's star becomes a small limb-darkened sun as its disc resolves, sized and tinted like the system's star. At the swap the real star appears at full strength and the galaxy's copy steps aside. A crossfade showed the real star's sphere, which writes depth, as a dark ball against the galaxy's glow.
- **A system is 0.0025 galaxy units per unit.** Its outer orbit is half a galaxy unit across, far smaller than the gaps between the galaxy's particles.
- **Falls into a galaxy's star take 3 s; rises out to a galaxy take 3.2 s.** These are the longest drops in VOID. The breadcrumb climbs several levels by chaining rises.
- **A galaxy's particles are generated in chunks on the CPU, in a few milliseconds per frame.** Rising into a galaxy never stalls. Every particle's randomness is a pure function of the seed and its index, so chunking changes nothing. They upload while the level is still hidden.

### Interface

- **Tab reaches a galaxy's notable stars, not all 300.** Those are the home star and its eleven brightest named stars, in order around the galaxy starting from home. A few hundred tab stops would be a chore, and every star is a pointer's reach away. Hover and focus show the same ring and name, so hover never gates anything.
- **The page now opens on the home galaxy.** `?system=<index>` opens a system of the home galaxy (0 is the home system), and `?world=<index>` still opens a world of it. `?view=` takes home, top, edge, core, wide or nebula at the galaxy level.

### Review and performance

- **Medium and Low use FXAA; only High uses SMAA.** GPU timer queries showed SMAA alone costing 5 to 7 ms a frame on an Intel UHD 620 at 1600x900, a third of the budget, while FXAA costs about 1.5 ms. On VOID's soft edges and points the two look the same.
- **The galaxy's own passes are cheap.** Timed with GPU queries, the soft-light buffer costs about 2 ms a frame at the overview and 2.6 ms close up on Low. What remains is the post pipeline every level shares.
- **Measured on an Intel UHD 620 at 1600x900, DPR 1, production build:**
  - Galaxy overview: about 59 fps on Low (where this GPU starts).
  - Close over the disc or a nebula: 40-47 fps on Low, as the glow covers the screen.
  - High on this GPU: 20-37 fps. High is meant for Iris Xe-class GPUs and up, roughly 2.5-3x faster.
  - Against Phase 2's build in the same run: a world on Low went from 44 to 60 fps, and a system on Low from 54 to 61, thanks to FXAA.
- **Measurements on this laptop drift by up to 15% over a long session as it heats.** Comparisons were made as A/B runs of two builds in one session, and timings with GPU timer queries.

## Phase 4: The universe

### The universe itself

- **The universe level's data lives in `core/cosmos.ts`.** `universe.ts` keeps the levels and the star systems, and `galaxy.ts` the galaxies. The brief's single `universe.ts` would have grown past a thousand lines.
- **The web is a handful of nodes joined by curved filaments.** There are 9 to 11 nodes: one great cluster and smaller groups. They are joined by a spanning tree (so nothing floats free) plus each node's nearest neighbours (for loops). Tendrils reach from the outer nodes into the void. The whole web is centred on its weight, so the universe's camera turns around the web itself.
- **A galaxy's kind follows its surroundings, as in the real universe.** Ellipticals crowd the great cluster, which has a giant elliptical at its heart. Spirals and small irregulars live along the filaments and alone in the field. The home galaxy is a barred spiral a little off the centre of a modest group, like the Milky Way in the Local Group.
- **Galaxies are larger than life against the web.** A spiral's radius is 14 to 21 units in a web about 2000 across, so a spiral still reads as a spiral from across the universe. At true proportions every galaxy would be a dot.
- **The universe's nebulae fill the voids and are artistic licence.** They are vast, faint clouds of two or three lobes strung along an axis, so none is a ball. They are mostly soft billows, with wisps and threads only as faint grain.
- **The black hole is the universe's last child, a level of its own (`hole`).** It sits alone in a void between the web and the first nebula. From its resting view that nebula lies just behind it, a quarter of a radian off the line of sight, so lensing draws a bright arc and a fainter one opposite instead of a perfect ring.

### Galaxy kinds

- **An elliptical is one smooth swarm (a Hernquist profile).** It is flattened by its axis ratio and turns slowly, at a third of a spiral's speed. It has no dust, no young stars and no nebulae. Sixty to a hundred globular clusters hang in a halo wider than its light. Each cluster's stars share one orbit, so the cluster holds together as it turns.
- **An irregular is a thick, lopsided disc of six to nine star-forming complexes, around an offset old envelope and a short bar.** It turns almost as a solid wheel (a rising rotation curve), so its clumps keep their shape. Its nebulae sit on its largest complexes. Its scattered young stars are drawn large and faint, so they make a haze, not a spray of dots.
- **The home galaxy is unchanged, byte for byte.** Its data and its particles at every tier total match Phase 3. The particle job also became about three times faster: it builds the light in one pass and then sorts it into its runs, where Phase 3 built every light particle twice, and nothing is allocated per particle.
- **The spiral disc's near glow is drawn for spirals only.** It models a flat disc, and inside an elliptical or an irregular it showed a glowing floor. Those galaxies resolve into their stars instead. The sky's band follows the kind too: full inside a spiral, half inside an irregular's thick disc, none inside an elliptical.

### Drawing the universe

- **Every galaxy is drawn from a few thousand of the very particles its own level draws.** Each galaxy gets 6000, 3600 or 2200 particles by tier, generated by the same job. All galaxies are drawn in one pass: each particle reads its galaxy's shape, motion, place and turn from a row of a float data texture, then moves with the same motion code the galaxy level uses (`galaxy/motion.glsl`, shared). So the galaxy seen from afar turns exactly like the one fallen into, and the brief's "rendered from the same shader logic" holds literally.
- **A galaxy small on screen draws only some of its particles.** Each is made larger and brighter to keep the galaxy's light and look, as a lower tier does. Each galaxy draws about eight particles per square pixel of its disc in the soft buffer, at least 160 and at most all of them. Each particle carries its place in its galaxy's set, and those beyond the drawn share fade out, so nothing pops. GPU timer queries showed the overview's cost was the number of point sprites, not their size: on Windows, ANGLE emulates points over Direct3D 11, and each one is dear. This brought the overview on an Intel UHD 620 from about 21 ms of GPU time to 14 on Low, and from 27 to 48 fps on High, with no visible change.
- **Each galaxy's dust is drawn between its far and near light, in the shader.** The light is drawn twice. The first pass keeps only particles beyond their own galaxy's dust layer as seen from the camera. Then comes the dust, then the light in front. Ordering per galaxy on the CPU would have cost a draw call per galaxy.
- **The soft light shares one buffer class with the galaxy level (`SoftBuffer`).** It holds the galaxies' glow and dust, the web's gas and the nebulae, at reduced resolution with adaptive sharpness. The deep field and the galaxies' brightest stars draw sharp on screen.
- **The deep field has two parts.** Thousands of faint distant galaxies lie at infinity, like the stars. The rest are scattered along the web, and those fade rather than swell into blurs when the camera nears them.
- **The web's gas is almost below notice.** It is soft clouds beaded along the filaments, plus haloes on the nodes. A lower tier draws fewer clouds, each larger, so the web keeps its light.
- **The far plane is 120,000 units.** While the universe crossfades in a galaxy's frame it is drawn about twenty times larger. Depth precision is set by the near plane, which follows the camera's distance, so nothing that writes depth loses precision.

### The black hole

- **The hole is drawn by the universe around it, and the two share one stage.** The hole's level is the universe's own units, centred on the hole and turned to its disc. The universe stays mounted beneath it, so a fall between them changes only the frame and the framing, and nothing fades.
- **It is ray traced.** This is the brief's stretch goal, and it fit the budget. Each pixel near the hole follows its ray through the hole's gravity: the exact shape of a light ray's path in Schwarzschild spacetime, written as a force (-1.5 h² x / r⁵) and integrated with steps that shrink near the hole. The trace runs into its own buffer (0.85, 0.7 or 0.55 of the screen, 88, 76 or 64 steps by tier), only where the traced sphere lands on screen. Disc crossings are composited front to back, so the far side of the disc arches over the shadow and under it, as in the classic render.
- **The shadow's edge and the photon ring come from each ray's exact impact parameter, not from the march.** Rays near the critical impact parameter circle the photon sphere and need hundreds of steps. Treating rays that ran out of steps as fallen in made the shadow too large and left the ring inside it. The ring is drawn no thinner than a pixel, with its light kept, so it never breaks into dashes on a phone.
- **Lensing is a post pass of its own, ahead of bloom, so bloom sees the disc.** Each pixel's ray is turned towards the hole by the real deflection for its impact parameter. That is Darwin's exact result in elliptic integrals, tabulated over log(b / b_c - 1) in a half-float texture, with the strong-field limit below the table and the weak-field series above it. A camera's finite distance is accounted for by (1 + cos θ) / 2. The pass is skipped when nothing on screen bends by more than three quarters of a pixel. Lensing's exact physics gives arcs, an Einstein ring, and the dark lens the hole makes against the web from afar.
- **The disc is white-hot at its inner edge (11,000 K) and cools to Ember outward.** Its colour falls as r^-1.2 and its light more steeply. Doppler beaming (g³, with speeds scaled to 0.72) brightens and blues the side coming towards the camera, and gravitational redshift dims gas near the hole. Its turbulence is a baked, seamless noise carried round at Keplerian speeds. Two layers half a cycle apart crossfade, so the pattern streams without winding up. The noise is filtered to each pixel's footprint, stretched where the disc is seen edge-on, so the disc never sparkles.

### Falls

- **Universe to galaxy takes 3.6 s; galaxy to universe 3.8 s.** These are the longest falls. The levels swap at three times the galaxy's resting distance, while the few-thousand-particle version is still small enough to match the full one. In the long falls the camera's centre reaches the target in the first 42% of the flight, so the camera heads for its target before closing in.
- **The black hole is always arrived at from its one composed side, with the nebula behind it.** The camera swings round it on the way in.
- **Escape at the universe does nothing.** Scrolling past its outer limit is reserved for Phase 8's edge.

### Interface

- **The page opens on the universe.** `?galaxy=<index>` opens a galaxy and `?hole` the black hole. `?system=` and `?world=` open in `?galaxy=`, or in the home galaxy by default. `?view=` takes home, top, edge, wide, cluster, local, nebula or hole in the universe, and home, top, edge, close or far at the hole.
- **Every breadcrumb begins with "Universe".** From a world it climbs three levels by chaining rises.
- **Tab in the universe reaches the home galaxy, the black hole and the ten largest galaxies.** Every other galaxy is a pointer's reach away.
- **More real-world names joined the ban list** after galaxies came out as Kathryn, Drogon, Aesir and Akutan.

### Review and performance

- **Measured on an Intel UHD 620 at 1600x900, DPR 1, production build:**
  - On Low: 60 fps everywhere. This covers the universe overview from the side and from above, a cluster, the home galaxy's group, the black hole at rest (58 close up), an elliptical, an irregular and the home galaxy.
  - On High: 48 fps at the universe overview and 37 at the black hole. High is meant for Iris Xe-class GPUs and up, roughly 2.5-3x faster.

## Phase 5: Civilizations and stories

### Peoples

- **A people may live on the temperate world nearest a system's habitable zone**: always in a featured system, in about half the others (the same draw that lit worlds before, so no world's orbit or look moved). A dry, frozen or clouded world near the zone sometimes keeps the ruins of a people who outlived its climate (16% when the system has no temperate people). About half the systems in the universe hold a people, or what is left of one: exploring should keep turning up signs of life.
- **States, by weight: thriving 40, fading 22, gone 25, transcended 13.** A people has a name in its galaxy's language, an age, and for the gone and the transcended how long ago they ended, rounded to two figures as people speak of long times ("about thirty-one thousand years").
- **What each state shows.** Thriving: city lights, satellites, and sometimes a ring of stations. Fading: sparse lights that stutter, and whole cities going dark for a while. Gone: no lights, ruins in the ground, sometimes a broken ring. Transcended: no cities, only a lattice around the world or an unfinished arc of collectors around the star.
- **A world ringed by its people keeps no rings of its own.** Stations and natural rings would cross.
- **Descriptions stay plain, and say who.** A peopled world's caption names its people, how long they lived there and what can be seen of them, in two sentences after the world's look. A star names its peopled world. A galaxy names the stars of its handcrafted worlds ("People live, or once lived, on worlds around Saelith, Vaethis and Lisi"): plain fact, and the only signpost to the stories. Galaxy captions drop the colour of their arms to stay at three sentences.

### The handcrafted worlds

- **Twelve anchors in `content/anchors.ts`**, each a place (galaxy, star, world), a kind, a people, a state and one to three fragments. An anchor overrides its world's kind, sometimes its name and moons, and its civilisation; the rest of its system stays as the seed made it, and it holds the only people of its system.
- **Four are in the home galaxy and eight are spread across the universe:** the giant elliptical at the heart of the great cluster, the largest spiral there, an irregular, the galaxy nearest the black hole, the home galaxy's neighbour, and a spiral far out in the field. Most visitors start in the home galaxy, so its stories are the first to be found; the rest reward going further.
- **Every anchor's star is named and a keyboard stop**, so Tab reaches it, and its galaxy's caption names it.
- **The worlds are chosen to match their stories:** the home world Ithasal (thriving), an island world of failing lamps, a desert of ruined cities, an ocean world in a lattice, a world with a ring of stations, a frozen world with a broken ring, a world near the black hole, a desert under a small red sun with an unfinished arc, a young world in an irregular galaxy, a world under yellow cloud, a world whose cities put their lights out to watch the sky, and an ocean world with two moons whose record of tides stops. What a fragment mentions (two moons, the ring, the arc, lights going out) is on screen.
- **Fragments follow `content/voice.md`**: the brief's guide, plus habits written down while writing them (say what people did, ordinary objects and days, no invented names, end on the image). Tests hold them to it: one to three fragments a world, at most forty words and three sentences each, no exclamation marks, none of the stock words, no names, and lines of at most 42 characters so a fragment fits beside a world on a laptop screen without wrapping.
- **`?anchor=<id>` opens a handcrafted world directly**, for review and for the drift mode to come.

### Fragments on screen

- **They appear once the camera settles, line by line, at reading pace:** each line about 0.7 s plus 45 ms a character after the one before, with a longer pause between fragments. Lines rise a few pixels out of a slight blur as they fade in. With reduced motion they only fade.
- **On a wide screen the fragments gather into one short poem; on a narrow one each gives way to the next and the last one stays.** A poem of three stanzas does not fit above a world on a phone.
- **They sit beside the world, on the side away from the sun, and never over it.** The scene reports the world's circle on screen each frame (including its air, ring or lattice), and the words take the dark side, else the other side, else the space above. The block narrows to the room it has, so a long line hangs onto the next, balanced. When nothing fits (close up, the world fills the screen) the words wait out of sight. The layout is measured again only when the world moves by a few pixels, never with the camera's handheld drift.
- **They are not interface:** they stay while being read, outside the interface's idle fade, and leave with the visitor. Screen readers hear them once, in a polite live region, after the caption.

### What peoples build

- **Thin structures are ribbons that face the camera, shaded as round tubes**: rails, struts, tethers and the lattice's circles, one instanced draw per structure. A strand never draws narrower than 1.6 pixels; below that it keeps that width and lowers its cover, as stars and city lights do, so a ring far off is a steady thread, not a dashed one. Ribbons are double-sided, since which way a piece runs across the screen decides its winding.
- **Sunlight on a structure comes through the world's shadow and air.** Each point of metal (and each satellite) looks up the world's transmittance table along its ray to the sun, so a ring reddens to ember at dusk before it goes dark, as the atmosphere's own light does.
- **A ring of stations is a triangular truss at 1.14 to 1.2 radii, inside the closest the camera comes (1.32).** It turns with its world, tethered to the equator, with a station at each tether and lamps along its crown. Its crown glows faintly at night, so from the night side the ring is a thread of warm light; a fading people's lamps go out for spells. A derelict ring has lost whole runs of itself; the pieces left have sagged and rolled out of line, its stations hang broken tethers, debris drifts in the gaps, its lamps are out, and having come loose it slips a turn an hour against its world.
- **Satellites fly in a few shells, as real constellations do, moved entirely on the GPU.** Each is a speck of sunlit metal, dark in the world's shadow, and flashes now and then as a panel turns the sun towards the camera. They only show once their world is large on screen.
- **The lattice is the six great circles of an icosidodecahedron**, meeting at thirty glowing nodes: a world in a cage of triangles and pentagons. It is mostly light (it hides only 30% of what lies behind it), in a pale violet from Aurora, carrying slow pulses round. It turns once in half an hour about its own tilted axis.
- **The arc around a star is thousands of collectors on Kepler orbits** (6,000, 4,000 or 2,500 by tier) in a band about one tilted plane, thinning towards its unfinished ends and broken by gaps. Around the star they veil it where they cross it and glow faintly ember against the dark. From their world the same collectors are drawn at infinity, a thin band of embers through the sun. One panel in twenty catches the light for a moment every few minutes.
- **Structures fade in as their world grows on screen** (between 10 and 26 pixels of radius; satellites later, from 36), so across a system they never glitter around a speck.

### Lights and ruins

- **A fading people's lights keep a rhythm in real seconds,** never world time, so they do not strobe when time runs fast. Each light has long spells lit and short spells dark and stutters as it changes; now and then a whole city puts its lights out together and later turns them back on. One fragment explains why.
- **Ruins are planned cities.** Each district of a coarse grid on the sphere whose middle was settled held a walled rectangle on its own bearing, laid out in avenues far enough apart to be seen from orbit, blocks between them and, up close, streets; some hold a round forum. Lengths of wall have fallen at random and the outskirts have weathered most. Old roads run between cities as great circles across the lowlands, in stretches. The walls stand slightly proud of the ground, so a low sun picks them out. Ruins are only worked out where the sun reaches.
- **Ruins cost about a millisecond up close on Low.** Patterns too fine to resolve return their average tone at once, and the roads' circles are worked out once on the CPU. A first version cost five to seven.
- **Cities under thick cloud show mostly as a glow on the cloud's underside.**
- **Worlds without seas now have people where it is low and liveable**, in basins and valleys. Before, their population map was empty, so the desert's lights never showed.

### Fixes along the way

- **No generated name is a common English word, name or place.** Every galaxy, star, world and people in the universe was checked against public word-frequency lists (English Wikipedia, film and television, first names and surnames, as shipped with Chrome's password-strength estimator). 1,144 collisions are banned in `core/realWords.ts`, among them stars called Mary, Make, Father and Viral. Only names changed: every star and world kept its place and look. The home system's names and every galaxy's name are unchanged.
- **Snow on worlds without a sea is measured from the ground's middle, not from a sea far below it.** Highlands on every dry world were white, so the desert showroom was mostly snow. It is red dust again, with frost at the poles as its description says.
- **The debug panel no longer clamps a dry world's sea level to -1**, which rebaked its population and colour whenever `?debug` was open.

### Review and performance

- **Measured on an Intel UHD 620 at 1600x900, DPR 1, production build, on Low:** 60 fps for every handcrafted world at its resting view, the arc's system and the arc in the sky. Close up, with the world filling the screen, 41 to 44 fps, as for any world (the GPU time per frame is the same with or without a people). On High, the ring world runs 54 fps at rest.
