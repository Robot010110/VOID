// A visited star: a point of light (a tight core in a faint halo) until its disc resolves,
// then a small limb-darkened sun in a soft corona, as bright as the system's star up close.
uniform float uFade;
uniform float uDiscLight;

varying vec3 vColour;
varying vec3 vFace;
varying vec4 vLight;
varying vec2 vSpread;

void main() {
  float halfSize = vLight.w;
  vec2 p = (gl_PointCoord - 0.5) * 2.0 * halfSize;
  float r2 = dot(p, p);
  float r = sqrt(r2);

  float point = vLight.x * exp(-r2 / (2.0 * vSpread.x * vSpread.x));
  point += vLight.y * exp(-r2 / (2.0 * vSpread.y * vSpread.y));
  vec3 colour = vColour * point;

  float disc = vLight.z;
  if (disc > 0.7) {
    float shown = smoothstep(0.7, 2.2, disc);
    float x = clamp(r / disc, 0.0, 1.0);
    float limb = 1.0 - 0.55 * (1.0 - sqrt(1.0 - x * x));
    float edge = 1.0 - smoothstep(disc - 0.75, disc + 0.75, r);
    float corona = 0.28 * exp(-max(r - disc, 0.0) / (disc * 0.55)) + 0.06 * exp(-max(r - disc, 0.0) / (disc * 1.8));
    colour += shown * uDiscLight * uFade * (vFace * limb * edge + vColour * corona * (1.0 - edge));
  }

  colour *= 1.0 - smoothstep(halfSize * 0.8, halfSize, r);
  gl_FragColor = vec4(colour, 1.0);
}
