// The corona: a bright inner glow falling steeply from the limb, a faint outer corona,
// streamers that flow slowly outward, and now and then thin prominences standing on the
// limb. Noise is sampled on the circle around the star, so the streamers have no seam.
#include "../common/noise.glsl"

uniform vec3 uColor;
uniform float uIntensity;
uniform float uTime;
uniform float uExtent;
/** The limb's radius in the quad's plane, in star radii (just over 1 when seen up close). */
uniform float uLimb;
uniform vec3 uSeedOffset;
uniform float uFade;

varying vec2 vCoord;

void main() {
  float r = length(vCoord) / uLimb;
  if (r < 0.98) discard;
  vec2 around = vCoord / max(length(vCoord), 1e-4);
  float h = max(r - 1.0, 0.0);

  float corona = exp(-h * 5.5) * 0.55 + exp(-h * 1.3) * 0.11 + 0.02 / (r * r);

  // Streamers flow outward: noise in (direction, log radius) drifting with time.
  float rays = snoise(vec3(around * 3.2, log(r) * 1.6 - uTime * 0.012) + uSeedOffset);
  rays += 0.5 * snoise(vec3(around * 9.0, log(r) * 2.4 - uTime * 0.02) + uSeedOffset * 1.7);
  corona *= mix(1.0, clamp(0.62 + 0.5 * rays, 0.05, 1.7), smoothstep(0.02, 0.3, h));

  // Prominences: thin arcs on the limb, in a few active regions that come and go.
  float activity = smoothstep(0.35, 0.75, snoise(vec3(around * 1.4, uTime * 0.004) + uSeedOffset * 0.7));
  float arcs = 1.0 - abs(snoise(vec3(around * 11.0, h * 9.0 - uTime * 0.03) + uSeedOffset));
  float prominence = pow(max(arcs, 0.0), 7.0) * activity * smoothstep(0.0, 0.015, h) * (1.0 - smoothstep(0.04, 0.22, h));

  vec3 colour = uColor * corona + mix(uColor, vec3(1.0, 0.42, 0.32), 0.55) * prominence * 1.4;
  colour *= 1.0 - smoothstep(uExtent * 0.55, uExtent * 0.97, r);
  gl_FragColor = vec4(colour * uIntensity * uFade, 1.0);
}
