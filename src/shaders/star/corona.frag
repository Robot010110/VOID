// The corona: a bright inner glow falling steeply from the limb, a faint outer corona,
// fine streamers that flow slowly outward, and now and then a prominence: a thin arch of
// glowing gas standing on the limb, which rises and fades over minutes. Noise is sampled on
// the circle around the star, so the streamers have no seam.
#include "../common/noise.glsl"

uniform vec3 uColor;
uniform float uIntensity;
uniform float uTime;
uniform float uExtent;
/** The limb's radius in the quad's plane, in star radii (just over 1 when seen up close). */
uniform float uLimb;
uniform vec3 uSeedOffset;
/** Per arch: angle on the limb, angular half-width, height (star radii), phase. */
uniform vec4 uArches[4];
uniform float uFade;

varying vec2 vCoord;

const float TAU = 6.2831853;

float angleBetween(float a, float b) {
  return mod(a - b + TAU * 1.5, TAU) - TAU * 0.5;
}

void main() {
  float r = length(vCoord) / uLimb;
  if (r < 0.98 || r > uExtent) discard;
  vec2 around = vCoord / max(length(vCoord), 1e-4);
  float angle = atan(around.y, around.x);
  float h = max(r - 1.0, 0.0);

  float corona = exp(-h * 7.0) * 0.4 + exp(-h * 2.0) * 0.06 + 0.012 / (r * r);

  // Streamers flow outward: noise in (direction, log radius) drifting with time.
  float rays = snoise(vec3(around * 6.0, log(r) * 2.0 - uTime * 0.012) + uSeedOffset);
  corona *= mix(1.0, 0.86 + 0.2 * rays, smoothstep(0.03, 0.4, h));

  // Prominences: arches whose feet stand on the limb, each rising and fading on its own
  // slow cycle, so one is usually somewhere on the rim and rarely more than two.
  float prominence = 0.0;
  for (int i = 0; i < 4; i++) {
    vec4 arch = uArches[i];
    float x = angleBetween(angle, arch.x) / arch.y;
    if (abs(x) > 1.2) continue;
    float life = smoothstep(0.55, 0.95, sin(uTime * 0.0045 + arch.w));
    if (life <= 0.0) continue;
    float top = arch.z * sqrt(max(1.0 - x * x, 0.0));
    float wobble = snoise(vec3(x * 3.0, h * 30.0, uTime * 0.02 + arch.w)) * 0.006;
    float thickness = 0.008 + 0.006 * (1.0 - abs(x));
    float rim = (h - top + wobble) / thickness;
    float line = exp(-rim * rim);
    // A faint veil of gas fills the arch beneath its rim.
    float veil = (1.0 - smoothstep(top * 0.3, top, h)) * 0.18 * step(abs(x), 1.0);
    prominence += (line + veil) * life;
  }
  prominence *= smoothstep(0.0, 0.01, h);

  vec3 colour = uColor * corona + vec3(1.0, 0.36, 0.3) * prominence * 0.9;
  colour *= 1.0 - smoothstep(uExtent * 0.5, uExtent * 0.97, r);
  gl_FragColor = vec4(colour * uIntensity * uFade, 1.0);
}
