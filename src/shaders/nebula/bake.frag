// The nebula atlas: four kinds of noise, one per channel, that every nebula's layers sample
// and stretch: soft billows (red), thin bright filaments (green), long wisps drawn out by a
// flow (blue), and slow clumps that mix a cloud's two colours (alpha).
#include "../common/noise.glsl"
#include "../common/fbm.glsl"

uniform vec2 uSize;
uniform vec3 uSeedOffset;

void main() {
  vec2 uv = gl_FragCoord.xy / uSize;
  vec3 p = vec3(uv * 4.0, 0.0) + uSeedOffset;

  // Billows: domain-warped fbm, soft and rounded.
  vec3 warp = vec3(fbm(p * 0.8 + 3.1, 3), fbm(p * 0.8 - 7.4, 3), 0.0);
  float billows = fbm(p + warp * 0.9, 6) * 0.5 + 0.5;

  // Filaments: ridged noise, sharpened.
  float filaments = ridged(p * 1.3 + warp * 0.6 + 11.7, 5);
  filaments = pow(filaments, 1.6);

  // Wisps: noise stretched along a slowly turning flow.
  vec3 flow = vec3(fbm(p * 0.5 + 21.3, 3), fbm(p * 0.5 - 13.9, 3), 0.0);
  vec3 q = p + flow * 2.2;
  float wisps = fbm(vec3(q.x * 2.4, q.y * 0.7, q.z) + 5.2, 5) * 0.5 + 0.5;

  // Clumps: large, slow variation.
  float clumps = fbm(p * 0.45 - 31.2, 3) * 0.5 + 0.5;

  gl_FragColor = vec4(clamp(billows, 0.0, 1.0), clamp(filaments, 0.0, 1.0), clamp(wisps, 0.0, 1.0), clamp(clumps, 0.0, 1.0));
}
