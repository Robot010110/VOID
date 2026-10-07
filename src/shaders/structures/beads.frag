// A point of light, a couple of pixels across, added to the scene so the brightest bloom gently.
uniform vec3 uColor;
uniform float uFade;

varying float vBright;

void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(c, c);
  if (r2 > 1.0 || vBright <= 0.0) discard;
  gl_FragColor = vec4(uColor * vBright * exp(-r2 * 2.2) * uFade, 1.0);
}
