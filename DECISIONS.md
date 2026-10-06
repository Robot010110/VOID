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
