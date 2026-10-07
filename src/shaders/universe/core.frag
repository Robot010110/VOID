uniform float uFade;

varying vec2 vPlace;
varying vec3 vLight;
varying float vRadius;

void main() {
  float r = length(vPlace) / vRadius;
  // A bright gaussian heart in a wide exponential halo, as galaxy/core.frag.
  float light = 0.55 * exp(-r * r * 2.2) + 0.45 * exp(-r * 1.6);
  light *= 1.0 - smoothstep(3.2, 4.0, r);
  gl_FragColor = vec4(vLight * light * uFade, 1.0);
}
