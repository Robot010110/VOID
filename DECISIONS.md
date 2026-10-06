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
