// Single scattering along each view ray through the atmosphere shell, with sunlight
// transmittance from the precomputed table. Blue by day, reddened where sunlight grazes
// the terminator, a bright forward-scattering rim when the sun is behind the planet, and
// a faint airglow on the night side. Output is premultiplied: in-scattered light, plus
// alpha that dims whatever is behind (the surface, or stars seen through the limb).
#include "../common/sphere.glsl"
#include "./medium.glsl"
#include "./transmittance.glsl"

uniform vec3 uCenter;
uniform float uScale;
uniform vec3 uSunDir;
uniform vec3 uSunIrradiance;
uniform float uMieG;
uniform float uMultiScatter;
uniform vec3 uAirglow;
uniform int uSteps;
uniform float uFade;

varying vec3 vWorld;

const float PI = 3.14159265;

float phaseRayleigh(float c) {
  return 3.0 / (16.0 * PI) * (1.0 + c * c);
}

// Cornette-Shanks: Henyey-Greenstein with a better backward lobe.
float phaseMie(float c, float g) {
  float g2 = g * g;
  return 3.0 / (8.0 * PI) * ((1.0 - g2) * (1.0 + c * c)) / ((2.0 + g2) * pow(1.0 + g2 - 2.0 * g * c, 1.5));
}

void main() {
  vec3 origin = (cameraPosition - uCenter) / uScale;
  vec3 direction = normalize(vWorld - cameraPosition);

  vec2 shell = raySphere(origin, direction, uAtmTop);
  if (shell.y <= 0.0) discard;
  float start = max(shell.x, 0.0);
  float end = shell.y;
  vec2 ground = raySphere(origin, direction, uAtmBottom);
  bool hitsGround = ground.x > 0.0;
  if (hitsGround) end = min(end, ground.x);

  // Samples follow the path: a few for a short drop straight down to the ground, the full
  // budget for long grazing paths along the limb.
  float pathLength = end - start;
  float steps = clamp(ceil(pathLength / (uAtmTop - uAtmBottom) * 2.5), 4.0, float(uSteps));
  vec3 depth = vec3(0.0);
  vec3 rayleigh = vec3(0.0);
  vec3 mie = vec3(0.0);
  float glow = 0.0;

  for (int i = 0; i < 64; i++) {
    if (float(i) >= steps) break;
    float s = (float(i) + 0.5) / steps;
    // Rays ending on the ground crowd their samples towards it, where the air is densest.
    float along = hitsGround ? 1.0 - (1.0 - s) * (1.0 - s) : s;
    float dt = (hitsGround ? 2.0 * (1.0 - s) : 1.0) * pathLength / steps;
    vec3 p = origin + direction * (start + along * pathLength);
    float r = length(p);
    vec3 density = mediumDensity(max(r - uAtmBottom, 0.0)) * dt;
    depth += density;
    vec3 light = sunTransmittance(r, dot(p / r, uSunDir)) * exp(-extinction(depth));
    rayleigh += density.x * light;
    mie += density.y * light;
    glow += density.x;
  }

  float c = dot(direction, uSunDir);
  vec3 scattered = uSunIrradiance * uRayleigh * rayleigh * (phaseRayleigh(c) + uMultiScatter / (4.0 * PI));
  scattered += uSunIrradiance * uMie * mie * phaseMie(c, uMieG);
  scattered += uAirglow * glow;

  float alpha = 1.0 - dot(exp(-extinction(depth)), vec3(1.0 / 3.0));
  gl_FragColor = vec4(scattered, alpha) * uFade;
}
