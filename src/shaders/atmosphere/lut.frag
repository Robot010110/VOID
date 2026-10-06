// Bakes the transmittance table: for each height and sun angle, how much of each colour of
// sunlight survives the path to the top of the atmosphere. Layout matches transmittance.glsl.
#include "../common/sphere.glsl"
#include "./medium.glsl"

uniform float uAtmBottom;
uniform float uAtmTop;
uniform float uSunSize;

varying vec2 vUv;

const int STEPS = 48;

void main() {
  float s = vUv.x * 2.0 - 1.0;
  float mu = sign(s) * s * s;
  float h = vUv.y * vUv.y * (uAtmTop - uAtmBottom);
  float r = uAtmBottom + h;

  // Below the horizon the planet blocks the sun. Fade across the sun's disc rather than
  // cutting, and integrate along a ray that just clears the ground.
  float muHorizon = -sqrt(max(0.0, 1.0 - (uAtmBottom * uAtmBottom) / (r * r)));
  float lit = smoothstep(muHorizon - uSunSize, muHorizon + uSunSize, mu);
  float muRay = max(mu, muHorizon + 1e-4);

  vec3 origin = vec3(0.0, r, 0.0);
  vec3 direction = vec3(sqrt(max(0.0, 1.0 - muRay * muRay)), muRay, 0.0);
  float pathLength = max(raySphere(origin, direction, uAtmTop).y, 0.0);
  float dt = pathLength / float(STEPS);

  vec3 depth = vec3(0.0);
  for (int i = 0; i < STEPS; i++) {
    vec3 p = origin + direction * (dt * (float(i) + 0.5));
    depth += mediumDensity(max(length(p) - uAtmBottom, 0.0)) * dt;
  }
  gl_FragColor = vec4(exp(-extinction(depth)) * lit, 1.0);
}
