// Colour of a blackbody at a given temperature, as linear sRGB normalised so its brightest
// channel is 1. Planckian locus from Kang et al. (2002), valid 1667 K to 25000 K; hotter
// stars are clamped, which is visually indistinguishable. Mirrors src/core/blackbody.ts.

vec3 blackbody(float kelvin) {
  float t = clamp(kelvin, 1667.0, 25000.0);
  float k = 1000.0 / t;
  float k2 = k * k;
  float k3 = k2 * k;

  float x = t <= 4000.0
    ? -0.2661239 * k3 - 0.2343589 * k2 + 0.8776956 * k + 0.179910
    : -3.0258469 * k3 + 2.1070379 * k2 + 0.2226347 * k + 0.240390;
  float x2 = x * x;
  float x3 = x2 * x;

  float y;
  if (t <= 2222.0) {
    y = -1.1063814 * x3 - 1.34811020 * x2 + 2.18555832 * x - 0.20219683;
  } else if (t <= 4000.0) {
    y = -0.9549476 * x3 - 1.37418593 * x2 + 2.09137015 * x - 0.16748867;
  } else {
    y = 3.0817580 * x3 - 5.87338670 * x2 + 3.75112997 * x - 0.37001483;
  }

  vec3 xyz = vec3(x / y, 1.0, (1.0 - x - y) / y);
  vec3 rgb = mat3(
    3.2404542, -0.9692660, 0.0556434,
    -1.5371385, 1.8760108, -0.2040259,
    -0.4985314, 0.0415560, 1.0572252
  ) * xyz;
  rgb = max(rgb, vec3(0.0));
  return rgb / max(max(rgb.r, rgb.g), max(rgb.b, 1e-4));
}
