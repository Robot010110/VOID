// The cloud layer: baked cover that both rotates (slightly faster than the ground) and churns
// in place through a slow flow field, lit by sunlight that has crossed the atmosphere, so
// clouds near the terminator turn gold and rose. Clouds over cities glow faintly from below
// at night. Output is premultiplied.
#include "../common/noise.glsl"
#include "../atmosphere/transmittance.glsl"

uniform samplerCube uCloudMap;
uniform samplerCube uNormals;
uniform mat3 uSurfaceRotation;
uniform vec3 uSunObj;
uniform vec3 uSunIrradiance;
uniform float uTime;
uniform float uFlow;
uniform float uThreshold;
uniform float uSoftness;
uniform float uOpacity;
uniform vec3 uCloudColor;
uniform float uAmbient;
uniform float uDetail;
uniform int uDetailOctaves;
uniform float uCloudRadius;
uniform vec3 uCityColor;
uniform float uCityGlow;
uniform float uFade;

varying vec3 vPos;

const float PI = 3.14159265;

void main() {
  vec3 d = normalize(vPos);
  float footprint = length(fwidth(vPos));

  // Churn: the lookup drifts along a slowly changing swirl. The flow runs along the level
  // lines of one noise field (its gradient turned a right angle about the vertical), so it
  // never piles cloud up or tears it apart, and it costs a single noise evaluation.
  vec3 gradient;
  snoiseGrad(d * 2.2 + vec3(0.0, 0.0, uTime * 0.012), gradient);
  vec3 flow = cross(d, gradient - d * dot(gradient, d)) * 0.3;
  vec3 lookup = normalize(d + flow * uFlow);
  float cover = texture(uCloudMap, lookup).r;

  // Ragged edges up close, each octave fading before it reaches the pixel size.
  float fadeA = 1.0 - smoothstep(0.2, 0.5, footprint * 90.0);
  if (uDetailOctaves > 0 && fadeA > 0.0) cover += snoise(d * 90.0 + flow * 3.0) * 0.05 * uDetail * fadeA;
  float fadeB = 1.0 - smoothstep(0.2, 0.5, footprint * 260.0);
  if (uDetailOctaves > 1 && fadeB > 0.0) cover += snoise(d * 260.0 + flow * 5.0) * 0.04 * uDetail * fadeB;

  float alpha = smoothstep(uThreshold, uThreshold + uSoftness, cover) * uOpacity;
  if (alpha < 0.003) discard;

  float mu = dot(d, uSunObj);
  // Cloud tops stay lit a little past the ground's terminator, in reddened light. Lift that
  // light slightly so the sunset band reads as a warm glow rather than dimming to brown.
  vec3 sun = uSunIrradiance * pow(sunTransmittance(uCloudRadius, mu), vec3(0.7));

  // Self-shadowing: thicker cloud just sunward of here darkens this side.
  vec3 sunward = normalize(uSunObj - d * mu + 1e-5);
  float ahead = texture(uCloudMap, normalize(lookup + sunward * 0.012)).r;
  float shade = mix(1.0, 0.78, smoothstep(0.0, 0.3, ahead - cover));
  float wrap = smoothstep(-0.16, 0.5, mu);

  // Thick cloud scatters more light back up: thin veils read darker than dense cores.
  float body = mix(0.72, 1.04, smoothstep(uThreshold, uThreshold + 0.45, cover));
  vec3 colour = uCloudColor * body * (sun * wrap * shade * 0.88 / PI + uAmbient);

  // City glow on the cloud base at night, only over the most populous ground.
  if (mu < 0.05 && uCityGlow > 0.0) {
    float people = texture(uNormals, uSurfaceRotation * d).a;
    colour += uCityColor * uCityGlow * smoothstep(0.3, 0.75, people) * smoothstep(0.05, -0.15, mu);
  }

  gl_FragColor = vec4(colour * alpha, alpha) * uFade;
}
