// Final grade, after tone mapping. AgX on its own is faithful but flat in the low mids, so a
// gentle look (contrast and saturation in display space) comes first. Then the black point
// is lifted to Abyss, and film grain is added in display space. The grain uses a triangular
// distribution, so in the darks it doubles as a dither that keeps faint gradients from
// banding in 8-bit output.

uniform vec3 uFloor;
uniform float uContrast;
uniform float uSaturation;
uniform float uGrain;
uniform float uSeed;

float filmHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 filmToDisplay(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

vec3 filmToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 display = filmToDisplay(clamp(inputColor.rgb, 0.0, 1.0));

  // Look: deepen the low mids, then restore a little of the colour AgX lets go of.
  display = pow(display, vec3(uContrast));
  float luma = dot(display, vec3(0.2126, 0.7152, 0.0722));
  display = clamp(mix(vec3(luma), display, uSaturation), 0.0, 1.0);

  // Never pure black: a screen blend towards Abyss lifts the floor and leaves highlights alone.
  vec3 colour = filmToLinear(display);
  colour += uFloor * (1.0 - colour);
  display = filmToDisplay(colour);

  // A constant dither everywhere, plus grain that is strongest in the mid-tones, like film.
  vec2 pixel = floor(uv * resolution);
  float noise = filmHash(pixel + uSeed * 61.7) + filmHash(pixel.yx + uSeed * 23.3 + 17.0) - 1.0;
  float grain = uGrain * smoothstep(0.02, 0.3, luma) * (1.0 - smoothstep(0.6, 1.0, luma));
  display += noise * (0.0045 + grain);

  outputColor = vec4(filmToLinear(max(display, vec3(0.0))), inputColor.a);
}
