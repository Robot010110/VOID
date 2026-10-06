// Bakes the home galaxy seen edge-on from inside it: a thin luminous disc that swells into a
// bulge towards the core, gathered into star clouds and split by dark dust. Structure is
// stretched along the band, the way dust and star clouds in a real disc are.
// Output: rgb = diffuse light (linear, relative), a = dust optical depth.
#include "../common/noise.glsl"
#include "../common/fbm.glsl"

uniform float uLatMax;
uniform vec3 uSeedOffset;

varying vec2 vUv;

const float TAU = 6.28318530718;

void main() {
  // u = 0.5 at the core; the strip spans +-uLatMax around the band's plane.
  float lon = (vUv.x - 0.5) * TAU;
  float lat = (vUv.y - 0.5) * 2.0 * uLatMax;
  vec3 dir = vec3(cos(lat) * sin(lon), sin(lat), cos(lat) * cos(lon));

  // Noise domains, stretched along the band: gently for light, more for dust.
  vec3 p = vec3(dir.x, dir.y * 1.6, dir.z) * 1.7 + uSeedOffset;
  vec3 d = vec3(dir.x, dir.y * 2.2, dir.z) * 1.7 + uSeedOffset.zxy;

  float core = exp(-lon * lon / (2.0 * 0.38 * 0.38));
  float plane = lat + 0.016 * fbm(p * 1.3 + 11.0, 3);
  float thickness = mix(0.06, 0.13, core) * (0.85 + 0.3 * (fbm(p * 1.1 + 3.0, 3) * 0.5 + 0.5));
  float profile = exp(-plane * plane / (2.0 * thickness * thickness));
  float bulge = exp(-lon * lon / (2.0 * 0.26 * 0.26) - lat * lat / (2.0 * 0.14 * 0.14));

  // Star clouds: bright patches and darker gaps, plus a fine grain of unresolved stars.
  vec3 q = vec3(fbm(p * 2.0 + 1.7, 3), fbm(p * 2.0 + 8.3, 3), fbm(p * 2.0 + 4.1, 3));
  float clouds = smoothstep(0.2, 0.85, fbm(p * 3.6 + q * 0.55, 5) * 0.5 + 0.5);
  float grain = fbm(p * 24.0, 2) * 0.5 + 0.5;
  float glow = profile * (0.28 + 0.72 * core) * mix(0.2, 1.8, clouds);
  glow += bulge * mix(0.6, 1.6, clouds) * 1.2;
  glow *= mix(0.8, 1.2, grain);
  glow += 0.07 * exp(-lat * lat / (2.0 * 0.3 * 0.3)) * (0.35 + 0.65 * core);

  // Dust: coherent dark clouds along the mid-plane with ragged, wispy rims, and one rift
  // that splits the band for a stretch on one side of the core.
  vec3 w = vec3(fbm(d * 1.4 + 2.0, 3), fbm(d * 1.4 + 6.0, 3), fbm(d * 1.4 + 4.0, 3)) * 0.45;
  float large = fbm(d * 2.2 + w, 5) * 0.5 + 0.5;
  float lanes = smoothstep(0.47, 0.66, large);
  float rim = smoothstep(0.36, 0.5, large) * (1.0 - lanes);
  float wisps = smoothstep(0.55, 0.9, ridged(d * 5.5 + w * 1.5, 4)) * rim;
  float midplane = exp(-pow(plane / (thickness * 0.8), 2.0));
  float halo = exp(-pow(plane / (thickness * 2.0), 2.0));
  float rift = smoothstep(0.35, 0.6, fbm(d * 1.6 + 9.0, 4) * 0.5 + 0.5)
    * exp(-pow((plane - 0.006) / (thickness * 0.34), 2.0))
    * smoothstep(-0.4, 0.3, lon) * (1.0 - smoothstep(1.2, 2.1, lon));
  float tau = (lanes * 1.6 + wisps * 0.9) * (midplane + 0.25 * halo) + rift * 1.6;
  tau *= 0.6 + 0.4 * core;

  // Cream-gold towards the core, cool white in the outer disc.
  vec3 colour = mix(vec3(0.8, 0.87, 1.0), vec3(1.0, 0.83, 0.6), smoothstep(0.08, 0.9, core + bulge * 0.4));
  // Rare hydrogen-pink emission knots along the outer disc, never saturated.
  float knots = smoothstep(0.8, 0.95, fbm(p * 10.0 + 21.0, 3) * 0.5 + 0.5) * profile * (1.0 - core);
  colour = mix(colour, vec3(1.0, 0.6, 0.78), knots * 0.5);
  glow *= 1.0 + knots * 0.7;

  // Dust absorbs, a little more strongly in blue.
  vec3 light = colour * glow * exp(-tau * vec3(0.88, 1.0, 1.15));

  // Fade out well inside the strip so the sky never shows its edge.
  light *= 1.0 - smoothstep(uLatMax * 0.7, uLatMax * 0.98, abs(lat));
  gl_FragColor = vec4(light, tau);
}
