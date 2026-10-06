// Final grade, after tone mapping. AgX on its own is faithful but flat in the low mids, so a
// gentle look (contrast and saturation) comes first. Then the black point is lifted to Abyss,
// and film grain is added. The grain uses a triangular distribution, so in the darks it
// doubles as a dither that keeps faint gradients from banding in 8-bit output.
// Display space is approximated with gamma 2 (sqrt and square): this pass runs on every
// pixel at up to twice the screen's resolution, and exact sRGB curves cost a dozen pow()s.

uniform vec3 uFloor;
uniform float uContrast;
uniform float uSaturation;
uniform float uGrain;
uniform float uSeed;
uniform float uAberration;

float filmHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// Colour fringes at the edges of the frame while the camera falls between levels. Red and
// blue are read a little outward and inward from the scene; the shift is applied as a
// difference of roughly tone-mapped values, so the bloom and grade of this pass survive it.
vec3 fringe(vec3 colour, vec2 uv) {
  vec2 fromCentre = uv - 0.5;
  vec2 shift = fromCentre * dot(fromCentre, fromCentre) * 4.0 * uAberration;
  vec3 here = texture2D(inputBuffer, uv).rgb;
  float red = texture2D(inputBuffer, uv + shift).r;
  float blue = texture2D(inputBuffer, uv - shift).b;
  colour.r += red / (1.0 + red) - here.r / (1.0 + here.r);
  colour.b += blue / (1.0 + blue) - here.b / (1.0 + here.b);
  return colour;
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 base = uAberration > 0.0 ? fringe(inputColor.rgb, uv) : inputColor.rgb;
  vec3 display = sqrt(clamp(base, 0.0, 1.0));

  // Look: deepen the low mids, then restore a little of the colour AgX lets go of.
  display = pow(display, vec3(uContrast));
  float luma = dot(display, vec3(0.2126, 0.7152, 0.0722));
  display = clamp(mix(vec3(luma), display, uSaturation), 0.0, 1.0);

  // Never pure black: a screen blend towards Abyss lifts the floor and leaves highlights alone.
  vec3 colour = display * display;
  colour += uFloor * (1.0 - colour);
  display = sqrt(colour);

  // A constant dither everywhere, plus grain that is strongest in the mid-tones, like film.
  vec2 pixel = floor(uv * resolution);
  float noise = filmHash(pixel + uSeed * 61.7) + filmHash(pixel.yx + uSeed * 23.3 + 17.0) - 1.0;
  float grain = uGrain * smoothstep(0.02, 0.3, luma) * (1.0 - smoothstep(0.6, 1.0, luma));
  display = max(display + noise * (0.0045 + grain), 0.0);

  outputColor = vec4(display * display, inputColor.a);
}
