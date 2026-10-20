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

## Phase 6: Opening and sound

### The opening

- **One point of light, then a title card.** The page opens on Abyss with a single warm point breathing at the centre while everything loads. When everything is ready it swells into a soft glow, and the wordmark comes up over it, lit from behind; then "Sound on. Take your time.", then Enter (staggered at 0.5, 1.5 and 2.3 s). Enter (the button, or the Enter key or space anywhere on the title) is the gesture that starts the sound.
- **The wordmark is the brief's one place where type becomes art:** Fraunces 300, sharp (SOFT 0), tracked wide like a film title, its trailing tracking balanced on the left so the word sits centred on the light. It is the only thing on screen; the line and Enter are Hanken in the prose and name tiers. Enter is a word with a hairline beneath it, not a box.
- **On Enter the letters let go.** Each letter is drawn into an offscreen canvas exactly where it stands, sampled into about 2,200 specks (1,400 on a narrow screen) and the page's letters hand over to them in 0.35 s. The middle letters go first. The specks drift outward, slowing; most dim within two seconds, and one in fifteen lingers as a twinkling point, warm or cool, until the sky has come up behind. Seeded and stepped by the frame clock, so screenshot runs draw the same dust.
- **The point of light is a sun.** The dark lifts over 1.3 s and the glow gives way to the home star at the same place on screen. The first shot stands in the plane of Ithasal's orbit, 7 units beyond it (inside the asteroid belt beyond its orbit), a little below the plane: from there the world is larger than its sun and covers it, night side towards us with its cities lit. The camera holds for a second and a half while the dust drifts, then rises as it pulls back, and the world slides down off the sun: an eclipse, ending. The camera is placed when Enter is pressed, from where the world is then, so this happens however long the title waited.
- **The pull-back is one move.** Out of the system, out of the galaxy, out to the universe at rest: 10 s, after the 1.5 s hold. Chained ascents would each ease in and out and the camera would stall at every level, so the whole move follows one curve of log-distance over time (`intro/pullback.ts`): a monotone cubic through each level's resting distance, given 30%, 37% and 33% of the time, starting and ending at rest, its speed continuous at every hand-over. Each flight is handed its stretch of the curve as a profile (`ascend(profile)`, `ascendTo(path, profiles)`).
- **Asteroids shrink away as the camera comes near** (from 32 units, gone by 8). The pull-back rises through the home belt, whose low-poly rocks showed their facets up close. Views of a system stand 50 units or more from any belt, so nothing else changes.
- **The hint, once.** On a first visit, after the film has shown what falling looks like, "Scroll to fall into anything" ("Tap to fall into anything" on a touch screen) fades in at the bottom centre, holds 4 s and goes; the caption and controls follow it. It is remembered and never shown again.
- **Reduced motion, and links:** a visitor who prefers reduced motion opens on the universe and gets the same title, the letters fading rather than breaking, and a crossfade instead of the flight. A link to somewhere particular (`?anchor=`, `?galaxy=`...) gets the same: title, Enter, crossfade to that place.
- **Input waits for the opening**, which flies the camera itself: no orbiting, falling, hovering or Escape until it ends. Every visit plays it; Enter is needed to start the sound anyway, and on a second visit the browser's shader cache brings the title up in a few seconds.
- **`?intro` plays the opening on a screenshot run, and `?intro=skip` skips it** (straight into the universe or the linked place). Screenshot runs and the development views (`?level=sky`, `?planet=`) skip it by default.

### Loading behind the dark

- **Nothing is drawn while the opening loads.** The levels the film needs (the home system, the home galaxy and the universe) mount at once, the galaxy and the universe hidden, never framing the camera. Behind the dark ("the curtain"), no level, no sky and no post-processing draws at all: every shader compiles in the background (KHR_parallel_shader_compile), every map bakes a little each frame, and only then does the curtain rise, for eight real frames still behind the dark, before the title. The warm levels leave the stage when the film ends: the brief's "current level plus the incoming one" rule is bent only while the opening plays.
- **Why:** on the Intel UHD 620, the page used to freeze for the first 8 to 11 s, with no frames at all and no breathing point. Profiling found three causes, each a program used before the driver had compiled it: a level that opened in place baked its maps all at once in the first frame, the sky's band and the post-processing passes drew from the first frame, and every level's shaders were handed to the driver at once.
- **Levels opening behind the curtain bake patiently,** as an arriving level always has. Bake passes now compile in the background before their first tile (in every case, not only the opening).
- **The driver gets at most six programs at a time** (`compileSlotFree`), from levels and bakes alike, an object at a time. All at once, a slow driver works through them as one block and the page freezes until the last is done (8 s); one at a time, no freeze but twice as long; six at a time, the longest pause is about a second and loading nearly as quick. It also helps falls between levels, which compile their next level the same way.
- **The title waits for the fonts, the sound module, the band of the sky, and all three levels ready**, at least 1.4 s (one breath) and at most 15 s. On the UHD 620 that is about 13 s on a first visit and about 3 s on the next (the shader cache).

### Sound

- **Tone.js, D Lydian, in `audio/`.** `engine.ts` is the graph and nothing else (no React, no three); `notes.ts` maps things to notes (pure, tested); `sound.ts` is the engine as the rest of VOID sees it; `AudioDirector.tsx` keeps it in step with the store through subscriptions.
- **Tone is fetched while the opening loads, in its own chunk (65 kB gzipped), and imported from its class modules, not its index:** the index creates an AudioContext as soon as it loads, which Chrome warns about before any gesture. The context is created inside the Enter click (creating it takes a quarter of a second on the test laptop, unavoidably in the click); the routing is built once it runs, and the voices a stage a frame, in the order the film needs them, because built at once they held the page for half a second as the dark lifts. Tone's console greeting is silenced, and its warning about scheduling on a sleeping context is dropped (VOID's context sleeps on purpose); anything else Tone says still reaches the console.
- **Master:** everything plays through one bus, a gentle compressor (-24 dB, 3:1, soft knee), a limiter at -1 dB and the master volume (-9 dB); most voices also send into a 10 s reverb, the space everything hangs in. Measured at the output: about -21 to -27 dBFS RMS by level, peaks under -13 dBFS.
- **The drone is always there:** two sawtooths a few cents apart on D2 and a quiet fifth above, through a low-pass that wanders over a minute, with very quiet dark noise under it.
- **Each level has a layer, crossfading over two seconds when the level changes:** the universe, D1 and its octave swelling and ebbing over half a minute (the octave carries it on laptop speakers); a galaxy, D major seventh with the raised fourth, high and thin, each voice breathing on its own slow cycle through a wide chorus, like voices far off; a system, a warm open chord (D3, A3, E4) that pulses with the orbit of the world nearest the camera (0.1 to 0.5 Hz, faster for quicker orbits, checked every two seconds); a world, wind in its air (none on an airless rock, most on a giant), and the hum of its people: warm while they thrive, faltering at odd moments while they fade, a glassy high fifth if they became light, nothing if they are gone. The black hole darkens the drone.
- **Touching something rings it.** A star (hovered or focused with Tab) rings an FM bell pitched by its temperature, three octaves from D3, hot stars high; a world rings a softer bell pitched by its orbit, the innermost highest; a galaxy rings deep, the largest lowest. Notes come at most every 90 ms, and a quick run plays softer.
- **A fall sweeps noise through a band down from 2.6 kHz to 180 Hz, and a rise sweeps it up, over the flight's own length.** The opening plays one long rise for the whole pull-back.
- **Fades are linear in amplitude.** The first bloom swells over 4.5 s and is heard from its first moment; an exponential fade from silence stayed inaudible for half its length.
- **The first shot is framed while loading,** not only on Enter, so what it shows close up (the world, its moons, its cities) is built and compiled behind the dark; on Enter it is framed again from where the world has moved to.
- **Mute** (the M key, or the sound control top right) fades out over half a second and then suspends the AudioContext, so muted VOID does no audio work at all; a hidden tab does the same. The choice is remembered. The control is a single line: a gentle wave while sound is on, lying flat when it is off.

### Review and performance

- **Measured on an Intel UHD 620 at 1600x900, DPR 1, production build.** Loading: the title after about 13 s on a first visit and 2 to 3 s after, the longest pause in the breathing point about a second. The film on Low: 60 fps through the whole pull-back, with five short hitches in its first second (the AudioContext, then the sound's stages) while the camera still holds on the eclipse. On High (meant for Iris Xe-class GPUs and up) 33 to 60 fps, as the universe on High was already.
- **Sound, measured at the output (the screenshot browser has no speakers):** the bloom is heard within half a second; every level sits between -23 and -26 dBFS RMS; peaks stay under -13 dBFS; the right layer is up at every level, a world's wind and hum follow it, and hovering rings a note. How it sounds needs ears.

## Phase 7: Interaction and environment

### Controls

- **Three controls, top right, each a single line:** time is a world on its orbit (still when paused, trailing an arc as long as its pace); what the eye sees by is a point that radiates further (one ring for infrared, two for radio); sound is a wave that lies flat when off. A word appears beside them for a moment after one changes ("100 times faster", "Radio"), so a glyph is never a puzzle; screen readers hear it too.
- **Keys work anywhere:** T for time, S for the spectrum, M for sound, D to drift. In a galaxy, Shift with a click or with Enter joins stars into a constellation.
- **On a touch screen, a way up a level sits top left**, where a way back is looked for. The breadcrumb's ancestors still work too.

### Time

- **Paused, 1x, 100x, 10,000x, each step easing over about a second** (in log(1 + scale), so 1x to 10,000x is as smooth as 1x to 100x).
- **Nearer levels cap the pace at what still reads as motion:** a system at 1,000x, a world at 150x. At 10,000x a system's inner world would lap its star five times a second and a world would spin thirty times; a galaxy and the universe take the full 10,000x, which is what makes a galaxy visibly turn. A fall between two levels takes the slower cap.
- **Fading cities keep flickering in real seconds**, and the system's sound pulses faster as time is sped up and all but stops when it is paused.

### Seeing by heat and by radio

- **Each material turns its own light up or down for each way of seeing, and the post effect then re-colours the picture.** `lens(infrared, radio)` multipliers on the starfield, the galaxy's light, stars, dust and nebulae, the universe's galaxies, cores, web gas and deep field, the stars and a world's cities; then `SpectrumLens`, merged into the existing grading pass, maps the tone-mapped picture through a heat palette (black, crimson, ember, pale gold, by how warm each part is) or a cold, nearly colourless radio palette (deep blue-grey to a pale Tide white, by energy). The weights crossfade over most of a second.
- **Infrared:** stars dim; dust lanes glow ember instead of darkening, and thin out (infrared sees through dust); nebulae and the galactic band brighten; a world's cities glow warm.
- **Radio:** stars all but vanish; the cosmic web's gas comes out (the hidden structure); galaxies' hearts stay bright; and wherever a people are still there, their signals give them away: a galaxy's stars with living peoples outshine every other star, and from inside a system such a world wears a cold glow with a faint ring carrying outward every few seconds. A people's cities shine three times as bright. Which stars hold a people is worked out the first time a galaxy is seen by radio, two dozen stars a frame (the whole galaxy takes about 80 ms).
- **`?spectrum=` and `?time=` open in a spectrum or at a pace**, for screenshots and links.

### Gravity touch

- **Holding the pointer still on empty space in a galaxy or among the galaxies for a third of a second makes a well there** (a long press on a touch screen). It gathers over most of a second; dragging moves it instead of turning the view; letting go releases it over a second and a half.
- **Particles bend towards it in their vertex shaders and are swept a little round it**, the more the nearer, never past its centre (`shaders/common/well.glsl`): a galaxy's light, dust and visitable stars, and every galaxy seen from the universe. In a galaxy the well sits where the pointer's ray meets the disc (things turn about the disc's axis); among the galaxies, on a plane facing the camera through the universe's centre. Its reach is about a third of a galaxy's disc, or a cluster and the threads beside it.
- **The black hole has no well:** it is one already.

### Constellations

- **Drawn star by star in the galaxy the visitor is in**: Shift and click (or Shift and Enter on a focused star), letting go of Shift to finish; on a touch screen, a long press on a star begins, a tap on each further star joins it, a tap on empty sky finishes. Escape lets a drawing go and Backspace takes back its last star. A line needs two stars; a sky's worth (24) is the most.
- **Thin glowing lines, a little space left round each star as on a star chart**, moving with the stars as the galaxy turns (positions worked out on the CPU each frame from the same orbits as the shaders). Kept constellations are faint; one being drawn is brighter, with a tether from its last star to the pointer.
- **Its name is asked for as soon as it is finished**, in a line to write on beneath it. A name is a quiet italic button that opens the same line to rename it or forget it. Unnamed ones say so in the quiet tier.
- **Kept in localStorage** (`void.constellations`, at most 64), and read back defensively: anything malformed is dropped rather than trusted.
- **They show only in their own galaxy**, where their stars are drawn as stars; elsewhere those stars are not points on screen.

### Drift mode

- **D, or a minute without input (not for a visitor who prefers reduced motion), and VOID tours its stories on its own:** the twelve handcrafted worlds in order, beginning with one in the galaxy the camera is in, and the black hole as one stop. It rises and falls a level at a time at 1.7 times a visitor's pace, pausing four seconds or so at each level on the way, eight at a galaxy or system that is a stop, and twenty-four at a world, long enough to read its fragment.
- **The interface and the pointer step away; the fragments stay**, as they are the story, not interface. The camera turns slowly round what it looks at, slowest at a world so its light stays three-quarter while its words are read.
- **Any input ends it, and does nothing else**: a key, a press, the wheel, or the pointer travelling more than six pixels (a desk is never quite still).

### Fixes along the way

- **A just-opened name field keeps its focus**: on a touch screen, the tap that finishes a constellation is followed by mouse events that took focus away at once and closed the field.
- **`half` is reserved in GLSL ES**; a variable of that name broke a shader.

### Review and performance

- **On the UHD 620 at 1600x900, Low, production build:** a galaxy and the universe hold 60 fps in visible light, in infrared and in radio, and with a well held. The spectrum lens costs nothing extra (it joins the grading pass); the well adds a few instructions per particle.
- **Known risk:** world time is sent to shaders as a 32-bit float. After a long stay at 10,000x it grows large enough that slow shader animations (cloud flow, granulation) step in visible jumps. Positions are worked out in double precision on the CPU and are not affected.

## Phase 8: Secrets

All nine secrets are described, with where they are, in SECRETS.md (spoilers). These are the decisions behind them.

### Finding

- **Found once, remembered between visits** (`void.secrets` in localStorage, read back defensively like the constellations). A find rings a soft chime of two high bell notes, outside the gain the black hole closes, and shows "4 of 9 found" for four seconds just above the breadcrumb, in the prose tier. There is no list, no hint, and no other interface.
- **The logic is in `src/secrets/`**, as the brief asks:
  - `secrets.ts` holds the definitions and the pure detection: the signal's pattern, the key sequences, the day a constellation was drawn, and the edge's fade.
  - `sequences.ts` holds the scenes that play out on screen.
  - `terminal.ts` is the station, and `console.ts` the riddle.
  - Their words are in `content/`, like every fragment.
- **A secret that takes the camera** (the fall into the black hole, following the signal) sets `secretScene` in the store. Steering, hover and drift wait for it to end. The caption and a world's fragments wait too, and the interface steps aside. Escape hurries the black hole along to its way back out.
- **The veil and the words are page elements**, written each frame by the scene like the hover ring. A scene's dark is a real black over everything, not the scene drawn dark, so nothing can show through at its edges.

### The hidden worlds

- **Three worlds are made by hand like the anchors but hidden** (`HIDDEN` in `content/anchors.ts`): the beacon the signal leads to, the pale dot, and the keepers' home that the terminal's `goto` reaches.
  - They are left out of the tour, the galaxies' captions and the keyboard's notable stars.
  - Their stars are as plain as their neighbours. Two of them are only catalogue numbers.
- **A handcrafted world can now lay out its whole system and set its own size**, and may have no people. The pale dot's system is ours: rock, cloud, the blue world, a red one, a belt, a banded giant, a ringed giant, two ice giants.
  - A system laid out by hand always gets its belt, like the featured home system.
  - No ruins are generated beside a handcrafted world.
- **The new peoples' names were taken from their galaxies' own languages** and checked against the real-word lists.

### The signal

- **It is drawn as a direction, as far away as the stars, in the universe's frame**, above the web and right of centre in the resting view. It sits high rather than wide, so a tall screen also has it in view.
  - Between flashes it is a faint star like any other.
  - It flashes in cool white, a little bluer than any star, two, three, five, a second apart.
  - A click counts during a flash and for a third of a second after it.
- **Following it turns the camera where it stands**, rather than flying somewhere: the light is too far away to fly to.
  1. The light swells over the screen, holds, then dims to dark.
  2. Behind the dark the beacon's world is built with the opening's curtain closed: compiled, baked, and then drawn for a few frames unseen.
  3. The world comes up out of the dark.

  A first version stayed on the pale light until the world was ready. On a slow GPU that is several seconds of a white screen, so the light now gives way to dark while it waits.

### The radio whisper

- **A ring of 64 lights on a faint thread, at 1.28 times its galaxy's radius**, in the plane of the disc.
  - A slow wave of brightness runs round it every fifteen seconds.
  - It is drawn by radio only, as strong as the view has turned to radio.
  - It is a made thing, not a natural radio lobe: the secret is that someone hung it there.
- **It is drawn at both scales.** From among the galaxies it is a clue for a visitor orbiting the universe by radio; the resting view sees it edge-on, hidden in its galaxy's light.

### The edge

- **The universe's farthest view (5,200 units) stays its limit until the visitor keeps pulling**, with the same intent that rises out of any other level. Then the limit gives way, out to 26,000.
  - Everything fades by distance: a black veil from 6,200, total by 21,000.
  - In the dark, after a moment, the fragment comes up.
  - Zooming back in under the old limit restores it.
  - The universe's caption and controls step aside once the fade is under way.

### The black hole's interior

- **The fall needs no new level.** From the black hole's own level, a click on the shadow, or zooming in at the closest the camera goes with the pointer over the shadow, starts a scripted fall onto the hole's centre to 2.3 of its radii.
  - Real geometry does most of the work: from there the shadow fills the view.
  - The veil only closes what is left.
  - The sound sweeps down, then drops away entirely through a gain on everything but the chime.
  - After nearly three seconds of dark and silence the line comes up, holds, and goes. The visitor is set back outside, further out than the resting view, and drifts in as the dark lifts and the sound returns.

### The developer's door and the terminal

- **The riddle is one styled `console.log`** (not a warning or an error, so the console stays clean): dark blocks in VOID's palette, legible in a light console or a dark one.
  - The word is **listen**, which is "silent" rearranged and what the station does.
  - Typed anywhere outside a text field, it opens the station.
  - S and T also change the spectrum and time. Once two letters of the word are typed, the rest do nothing else, so the view does not flicker as the word is typed.
- **Listening Station 9 is a small dark panel, top left, in the system's own monospace font.** It is a third typeface, kept to this one machine voice, so nothing extra is downloaded.
  - Its prompt is in Tide.
  - The scene stays in view around it, and the caption and the controls keep their corners. On a narrow screen it takes the top and the controls step aside.
  - It is a real `<input>`: arrow keys go back through history, Tab finishes a command, Escape closes it.
  - Its output is a polite live region.
- **The trail is short:**
  1. The readme's hint leads to `ls -a`.
  2. The keepers' note gives coordinates in hex ("in sixteens").
  3. `goto` flies there level by level at the usual pace.

  `goto` takes any coordinates and `scan` prints the current ones, so the station is also a way to go anywhere by keyboard. The logs leave clues to three of the other secrets.

### The old code and the persistence

- **The Konami code sings every star in view:**
  - Each pitch is taken once from the stars in view (their temperature, as when touched), thinned evenly to seven voices, with an open D Lydian chord where there are too few.
  - It is played on a soft choir of sines, rolled upwards, under a light strike of the star bell.
  - Everything that shines brightens with it for about four seconds.
- **The companion comes on a later calendar day** (local midnight, measured from when the visit began), beside the first star of the oldest constellation drawn before today.
  - It is drawn fainter than its neighbour, breathing a little.
  - It rides the same orbit, a few units out.
  - Its words sit beside it in Fraunces, and are hidden from screen readers until shown so they never give it away.

### Review and performance

- **Every secret was played through in Playwright**, in the development build and in production with real clicks, keys and wheel. The consoles stayed clean, apart from the riddle itself.
- **11 new screenshots** (`8-*`). The `7-` constellation shots now store a constellation drawn today, so the companion does not appear in them.
- **On the UHD 620 at Low, production build:**
  - the universe, the universe by radio, Bonyr Wake by radio and the home galaxy with a companion all hold 60 fps;
  - the worst frame is 16.8 ms;
  - the fall into the black hole stays between 40 and 59 fps.

## Phase 9: Polish and ship

### Performance

- **Measured on the UHD 620 at 1600x900, production build, every tier at eleven kinds of place** (the universe, the black hole, a spiral, an elliptical and an irregular galaxy, two systems, four worlds).
  - Low holds 60 fps everywhere.
  - Medium holds 60 everywhere except the universe (54), the irregular galaxy (57) and the black hole (44).
  - High runs at 31 to 58.
  - This GPU is about half the speed of the brief's reference laptops (M1, Iris Xe). It is guessed as Low, and the governor steps any machine down when frames drop, so what a visitor sees runs smoothly. High at 60 fps on the reference hardware is extrapolated, not measured.
- **The black hole was the one place over budget on Low**: 17.5 ms of GPU time a frame against 16.7, measured A/B in one session because heat drifts readings by more than the effect.
  - The lensing pass costs 2.3 ms. It is a full-screen read and write of a half-float buffer, so its cost is bandwidth.
  - Halving the trace's resolution or its steps saved nothing measurable.
  - Lensing cannot shrink to a region: weak bending stays visible across half the screen even from among the galaxies.
  - It cannot merge into the grading pass either, because bloom must see the disc it lays down.
- **So, on Low only, the black hole is drawn at a pixel ratio of 0.85 once the camera has settled there**, and at full again as the next flight begins (`holeDpr`). The camera is all but still at both moments, so the resize, at most one dropped frame, is not seen in motion. It now holds 60 fps, with no frame over 16.8 ms. Its light is soft and the words are page text, so the lower resolution barely shows.
- **No per-frame allocations in `useFrame`**, checked by scanning every callback: the few are one-off (a compile job, a camera copy) or the strings that place page elements while they are shown.
- **The build is split so nothing warns:**
  - three.js (710 kB);
  - React;
  - the scene's other libraries (R3F, postprocessing, GSAP; 438 kB);
  - the sound engine, loaded during the opening;
  - VOID's own code (466 kB), which changes most, so returning visitors re-fetch only that.

### When VOID cannot run

- **Without WebGL2, a still sky in the same light** (`ui/Fallback.tsx`): an SVG starfield with a soft band, drawn from a seed (the same every time, coloured by temperature, mostly cool stars), the warm glow, the wordmark as the title sets it, and one line: "VOID needs a browser with WebGL2."
  - `main.tsx` decides before anything renders, from the GPU probe the quality guess already makes, so no second context is opened.
  - If the canvas still fails to start, an error boundary shows the same page.
  - `?fallback` previews it.
- **A lost context never leaves a frozen frame.** The old renderer can only be restored with its baked maps empty, so the scene starts again in a new canvas (`scene/recovery.ts`):
  1. The opening's dark and its breathing point cover the page at once.
  2. Recovery waits for the browser to give the context back, or 2.5 s if it never says.
  3. Anything under way (a flight, a journey, drift, a secret) stops where it is, and the shared GPU cache and the bake queue are dropped so everything is baked afresh.
  4. The canvas is remounted where the visitor was. The dark lifts once the new canvas has drawn the place, ready.
- **Two details keep the console clean:**
  - A context the browser gave back is lost again on purpose before it goes, since freeing old objects in a restored context only draws warnings, and in a lost one it is silently nothing.
  - The old renderer is not asked to lose a context that is already lost.

  If the context is lost before the opening has ended, the page simply loads again.

### Identity and sharing

- **The favicon is a small glowing dot on Abyss**, with its core enlarged so it reads at 16 px. It also comes as a 32 px `.ico` and a full-bleed 180 px touch icon (iOS rounds it).
- **The link preview is a real frame**: the black hole at rest, 1200x630, with the interface hidden. It was chosen from six candidates because it reads as one strong shape at thumbnail size.
- **Open Graph and Twitter tags need absolute addresses.** They come from `VITE_SITE_URL` (default in `.env`, the Render site), so another host only sets one variable.
- **The README gives the controls, how to run it and how to deploy, and says only that some things are not on any map.** SECRETS.md holds the rest.
- **Render stays the live host**; the user chose it to share the link.
  - `vercel.json` makes the same build deployable on Vercel, as the brief asks, with year-long caching for the hashed assets.
  - `engines` pins Node 22 or newer for both hosts.

### Accessibility and mobile

- **axe-core found no violations** (WCAG 2.2 AA plus best practice) on the title, the universe, a world with its fragments, the open station and the fallback page.
  - Tab goes through the three controls, then the galaxies, stars or worlds by name, each with its ring and name shown.
  - The interface wakes on focus.
- **The station's title is sentence case and its coordinates use plain dots** (`2f.a1.01`), per the brief's rule against tracked capitals and middle-dot strings. It still reads dots, spaces or colons as typed.
- **Touch, re-checked after Phase 8's changes:** taps fall into things, a long press begins a constellation, taps join and finish it, holding bends the stars, and the up control rises. The companion's words now choose their side by their measured width, so they never run off a narrow screen.
- **Every phone screenshot was reviewed side by side for fixed elements in each other's way.** One was: a world opened directly on a tall screen set its sun low, behind the breadcrumb and the world's name. The sun now rises just below the planet's limb (0.3 rad off the view rather than 0.42), between the world and the caption.

## After the build: the trailer

A motion piece to advertise VOID, made out of VOID itself.

### Directed through the real universe, not edited from footage

- **`?film` plays it on the site, and the same film renders to video.** The camera, the titles and the music all run on one film clock. Nothing is cut together after the fact: every frame is VOID rendering itself, with words laid over it.
- **The director (`src/film/director.ts`) fires shots at their moments, using the site's own moves:**
  - the opening's pull-back from one world out to the universe, reused whole;
  - chained falls at a quicker pace than a visitor's;
  - flights to a framing;
  - cuts under a flash or a dip to dark.
- **Every place the film visits is put on stage unseen before it rolls:** two galaxies, a system, a world, the universe, the black hole. They are built and compiled behind the Play gate, so nothing waits mid-film. A place that is somehow not ready holds the film, not the picture's motion: a render simply takes no frames, and live, world time stands still.
- **Live, the film follows the music's clock**, so every cut lands on its hit however the frames fall. It follows what is heard: the output's own delay is taken off.
- **The music is composed in code (`score.ts`) and rendered offline, once.** That one rendering goes into the videos and into `score.mp3`, which `?film` plays back.
  - **Synthesised live, it stuttered.** The score cost more than real time to compute on a laptop: 55 s of work for 52 s of music, mostly the reverb, the pad and the bells. Tone's voices keep their signals running long after they fall silent. Beside the universe, the audio clock fell to about 0.7 of real time, and the film with it.
  - **Played back, it costs nothing.** Live sounds exactly like the videos, Tone.js is not even downloaded for the film, and the press of Play no longer stalls the page while instruments are built.
  - **The file is 1.2 MB, an MP3 at 192 kbps.** MP3 decodes in every browser, it is fetched while the universe builds, and it is decoded by an offline context, so no audio context exists before Play.
  - **A phone's silent switch is told this is playback,** so the trailer is heard.

### The film

About 50 seconds, sentence case throughout:
1. **"Look up."** A point of light.
2. **The pull-back, counted:** 8 worlds around one sun, 300 stars in one galaxy, 61 galaxies and one black hole. These are the real numbers of the real place.
3. **"Fall into anything."** Straight down through Kistri into Driram's night side, its ring, its cities and one of its fragments.
4. **The features, cut on the beat:** visible, infrared, radio; then bending the stars, speeding up time, drawing a constellation.
5. **The black hole:** "Some things are hidden.", "Look closer.", and in.
6. **The name:** silence, then the wordmark gathering out of streaming stars, the address, and "Sound on. Take your time."

### The look

- **Louder than the interface, as an advertisement must be, in the same light:** Fraunces for what is said, Hanken for what is noted, Starlight on the dark.
- **Motion is deterministic and comes only from the film clock:** words blur up word by word, counts roll and push in, the spectrum's words pop on the cut with a glow the colour of their light, features rise from behind a rule.
- **Spectrum words sit above the galaxy, in white:** set in their own colours, they disappeared into a galaxy of the same colour.
- **A soft ring shows where the stars are being bent.**
- **The end card's stars are the wordmark's own letters, sampled and sent out across the screen.** Each comes back on a curve with a short trail. Reversing the opening's burst was tried and was too sparse.

### The music

- **Composed from VOID's own sound:** D Lydian, the drone, FM bells, the chorus pad, noise swept down for falls.
- **The score follows the film's structure:**
  - a heartbeat in the dark;
  - a bloom and a long rise under the pull-back, a bell for each count;
  - a soft pulse at 100 beats a minute under the falls;
  - the people's chord;
  - a hit for each way of seeing;
  - a glide for gravity, quickening ticks for time, a run of bells for the constellation;
  - the black hole's rumble and two last heartbeats;
  - silence;
  - the rise of the gathering and the last chord.
- **Mixed by meter, not by ear:** about −14.5 dBFS RMS overall, peaks under −0.7 dBFS, the black hole loudest at about −11, the silence before the name truly silent.

### Making the video

- **`npm run film:render` (tools/film) lays the page out at a screen's size and draws it at twice the density.** 540x960 makes 1080x1920 for Reels and TikTok; 960x540 makes 1920x1080. The words are sized as on a phone, and the frames are full size. Rendered at its native 1080x1920 layout the type was a desktop page's and unreadable on a phone.
- **Frames are high-quality JPEG; the music is a 48 kHz WAV.** ffmpeg encodes H.264 with AAC.
- **A stretch can be shot again (`FRAMES`), and spliced in only at a cut.** Some of the sky (its brightness, its parallax) eases by frame time, so no two renders are quite the same mid-shot. The fragment's line ran off a wide screen; frames 0–935 were shot again, up to the flash at 31.2 s.
- **Converted to BT.709 and tagged so.** JPEG frames are BT.601. Left that way, the social players, which assume BT.709 for HD, shift the warm colours.
- **The sky twinkles, and the well gathers, on world time in a screenshot run,** so a frame-stepped render moves at the film's own pace.

## After the build: the cost of the sound

The trailer's score, made of Tone.js pieces, cost more than real time to compute. The site's own sound engine is made of the same pieces, and more of them.

### Measuring it

- **Offline: each level's sound rendered inside Tone's `Offline()`, and timed against the music it makes.** The whole graph is built and held at one level for 30 s (at a world, with its wind and a warm hum), with two quick runs of ten hover notes. Near 1x, the audio thread has no room left once WebGL and the page want the CPU. `npm run audio:cost` (`tools/audio`) does this for the current engine.
- **Live: the production build in headless Chrome at every level, the pointer sweeping over stars, reading how far the AudioContext's clock moves against the wall clock.** A graph cheap enough keeps real time there, so a slow clock means the graph costs too much: on speakers, that is sound breaking up.
- **On the UHD 620 laptop (i5-8265U), the old engine cost 0.79 to 1.13 times real time at every level offline. Live, beside the universe, its clock ran at 0.30 to 0.55 of real time.** Every quick run over the stars also logged "Max polyphony exceeded" warnings.
- **Absolute numbers move with the machine:** the same renders ran 1.5 to 2 times slower on the laptop when it was busy or throttled (1.5 GHz). Old and new are compared in interleaved rounds in one session, and the ratio between them held.

### Where it went

- **Each Tone piece, measured alone, cost several times the browser's own node:** an oscillator 4 to 6 times, a filter 3 to 8, an LFO 4 to 8.
  - Tone feeds every frequency, detune and level through a constant-source signal that runs at audio rate. One oscillator is about five nodes, and one LFO about a dozen.
  - A parameter fed at audio rate is computed sample by sample: a biquad's coefficients, an oscillator's detune.
  - The engine ran 14 LFOs (two in the chorus), 27 oscillators and 7 filters at every level, heard or not.
- **The reverb (decay 10) cost about twice real time on its own** offline, where Chrome convolves everything on the render thread. Live, it hands the long tail to a background thread, which still needs a core.
- **A PolySynth keeps its voices running after they fall silent.** It disposes of one a second at most, and only while it holds more than it has lately needed. After a quick run over the stars, eight voices kept running for most of a minute, and two (with the template voice every PolySynth makes) for good. There were five PolySynths: the three bells, the chime and the choir.

### Lighter, and the same sound

- **`audio/voices.ts` makes the same pieces from the browser's own nodes, through Tone's context:**
  - oscillators, with Tone's phase-turned periodic waves, and fat oscillators;
  - LFOs (the target rests at the middle and the sine adds the swing, the same sum as Tone's);
  - filter cascades, the chorus and the reverb;
  - a fresh voice for every bell and choir note, whose nodes end when it does.

  Tone still provides the context, the routing gains, the noise and the dynamics.
- **Proven by subtraction, not by ear.** Each piece was rendered offline beside the Tone class it replaces, from the same input, and subtracted.
  - The residual is rounding: 96 dB below the signal for a bell, 82 for the LFOs, 83 for the chorus, 108 to 124 for oscillators, filters and the choir.
  - The whole engine was made deterministic (noise from one seed, one reverb response for both) and subtracted from the old one at every level: 76 to 85 dB below.
- **Offline, Tone schedules a little differently from live, so the comparisons were run as a live context runs.**
  - Its offline now() leaves out the look-ahead that its parameter writes add.
  - It starts a note due a moment ahead on its next clock tick.
  - What is left, run that way: Tone builds a choir voice, and sets the spread of its two sines, as the note is handed over, a tick or so late. That moves where their beating starts by a few milliseconds, differently from play to play in Tone.
- **Tone's quirks are kept, since they are part of the sound:**
  - A bell (no sustain) stops when its decay ends. Its release asks for a later stop, which comes too late to count, so the release is cut there, 56 dB down on a star bell; the modulator stops sooner still.
  - Eight voices an instrument: a note that finds all eight sounding is dropped, now without a console warning.
  - The chorus keeps its feedback loop at a gain of 0, so its delays stay in a cycle (the specification has a delay in a cycle hold at least a render quantum).
  - A fat oscillator's spread is set as Tone sets it, as it starts: Chrome takes it a moment late, and that places the beating.
- **The reverb ends where Chrome already ended it.** Tone draws the response's fall with setTargetAtTime, τ = ln 11 / ln 200 = 0.45 s, and Chrome ends a setTarget after ten time constants: 87 dB down, 4.5 s in. The other 5.5 s of the 10 s response were silence, convolved all the same. The new response has the same fall and stops there, 4.61 s in all.
  - The convolver scales a response by its average power over its whole length, so the input is raised by √(10.08 / 4.61).
  - An impulse through the old reverb and the new one carries the same energy: 0.000 dB apart overall, and within 0.15 dB in every half second.
  - Chrome prepares a convolver as its response is set, which holds the page for about 80 ms (a 10 s response held it for about 200 ms). That now has a frame of its own in the opening's stages, while the camera holds still. Drawing the response takes 5 to 20 ms.
- **What is silent rests.** Only one level's layer is heard at a time. Each layer, a world's wind and its hums, and the fall's noise sit behind a gate: once faded out it is disconnected, and Chrome stops computing whatever only feeds it. It is joined up again before it rises.
  - The gate waits on the audio clock, so a page muted or hidden mid-fade, its context asleep, finishes the fade before anything rests.
  - A slow LFO behind a closed gate picks up where it stopped, not where it would have been, which no one can hear.
  - The bus is kept stereo, as it was with the galaxy's chorus in it, so the compressor never sees its channels change.

### Before and after

Offline, 30 s a level with two quick runs of notes; the median of three interleaved rounds on a quiet laptop (cost against real time):

| Level | Before | After |
|---|---|---|
| Universe | 0.88 | 0.19 |
| Galaxy | 0.85 | 0.19 |
| System | 0.90 | 0.21 |
| World | 0.93 | 0.22 |
| Black hole | 0.91 | 0.20 |

- **About 4.5 times cheaper at every level.** Throttled (1.5 GHz), the galaxy and the black hole cost 1.54 and 1.45 before, and 0.35 and 0.34 after.
- **Live, production build, two interleaved rounds:** the audio clock ran at 0.30 to 0.55 of real time before, and at 0.99 to 1.00 after, at every level and through runs of notes. The frame rate stayed at 58 to 60 fps on Low, and the console is clean.
- **Loudness is unchanged:** each level's loudness offline sits within the spread between runs of the same engine (a fresh random reverb response each time), and live between about -20 and -27 dBFS RMS as before.
- **The sound's chunk grew by 2 kB gzipped.** Tone's own chunk is unchanged (63 kB).
- **Checked in production:** the opening, mute and a hidden tab; keys and drift; the riddle, the station and the old code's chord with sound on; the fall into the black hole; the edge; a lost context; a phone. Also new: loudness through each fall, and a mute in the middle of a crossfade (the layers hold, then finish). How it sounds still wants ears, but subtraction says nothing has changed.
