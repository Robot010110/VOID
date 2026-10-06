// A distant sun: a limb-darkened disc far brighter than anything else in the frame, and a
// soft corona falling away from it. Bloom does the rest.
uniform vec3 uColor;
uniform float uIntensity;
uniform float uDisc;
uniform float uCorona;
uniform float uFade;

varying vec2 vCorner;

void main() {
  float r = length(vCorner);
  float x = r / uDisc;
  float disc = 1.0 - smoothstep(0.92, 1.0, x);
  float limb = 0.55 + 0.45 * sqrt(max(0.0, 1.0 - x * x));
  float corona = exp(-r * 14.0) * 0.7 + exp(-r * 5.0) * 0.05;
  float light = disc * limb * uIntensity + corona * uCorona;
  light *= 1.0 - smoothstep(0.8, 1.0, r);
  gl_FragColor = vec4(uColor * light * uFade, 1.0);
}
