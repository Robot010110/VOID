// A collector: a dark speck that dims what lies behind it (premultiplied), with a faint ember
// glow, or for a moment a bright glint.
uniform vec3 uGlowColor;
uniform vec3 uGlintColor;
uniform float uOpacity;
uniform float uFade;

varying float vGlow;
varying float vGlint;

void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(c, c);
  if (r2 > 1.0) discard;
  float shape = exp(-r2 * 2.5);
  vec3 light = uGlowColor * vGlow + uGlintColor * vGlint;
  float alpha = uOpacity * shape;
  gl_FragColor = vec4(light * shape, alpha) * uFade;
}
