// A satellite: a speck of reflected sunlight.
uniform float uFade;

varying vec3 vColour;

void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(c, c);
  if (r2 > 1.0) discard;
  gl_FragColor = vec4(vColour * exp(-r2 * 4.0) * uFade, 1.0);
}
