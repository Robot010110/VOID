uniform vec3 uColour;
uniform float uIntensity;
uniform float uRadius;
uniform float uFade;

varying vec2 vPlace;

void main() {
  float r = length(vPlace) / uRadius;
  // A bright gaussian heart in a wide exponential halo.
  float light = 0.55 * exp(-r * r * 2.2) + 0.45 * exp(-r * 1.6);
  light *= 1.0 - smoothstep(3.2, 4.0, r);
  gl_FragColor = vec4(uColour * light * uIntensity * uFade, 1.0);
}
