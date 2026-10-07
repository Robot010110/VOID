// The near disc's light, for a camera inside or close to the galaxy. Particles close to the
// camera thin away (they would be huge, costly blobs); this pass gives back their light as a
// smooth glow, integrated along each pixel's ray through the same disc the particles sample:
// an exponential old disc crowded onto the arms, young light just downstream of each crest,
// and dust lanes just upstream. It weighs each distance by the share of particles thinned
// there, so the two never count the same light twice. Its coefficients come from the
// particles' own counts and light (see Galaxy.tsx), so the glow matches them in brightness.
//
// Light nearer than uResolve is not glow at all: an eye that close sees those stars one by one
// (the sparkle, and in a system the sky's stars). So from inside the disc only rays running
// along it travel far enough to glow, and the glow becomes a band across a dark, starry sky,
// as the Milky Way is from Earth. Drawn at half resolution, first in the light buffer.
#include "./orbit.glsl"

uniform vec2 uResolution;
uniform vec3 uCameraLocal;
uniform mat3 uViewToLocal;
uniform vec2 uTanHalfFov;
// Galaxy units: particles have all thinned nearer than x, and none beyond y.
uniform vec2 uNear;
// Galaxy units: nearer than this, stars are seen one by one rather than as glow.
uniform float uResolve;
uniform float uFade;
// Light per unit length of ray through the densest old disc and the densest young disc.
uniform float uOldLight;
uniform float uYoungLight;
uniform float uScaleLength;
uniform float uYoungScale;
uniform float uThickness;
uniform float uYoungShift;
uniform float uDustLane;
uniform float uDust;
uniform vec3 uDiscColour;
uniform vec3 uYoungColour;

const int STEPS = 8;
const float SQRT_TAU = 2.5066283;

float near(float phase, float shift, float width) {
  float d = mod(phase - shift + 3.14159265, 6.28318531) - 3.14159265;
  return exp(-d * d / (2.0 * width * width));
}

void main() {
  vec2 ndc = gl_FragCoord.xy / uResolution * 2.0 - 1.0;
  vec3 ray = normalize(uViewToLocal * vec3(ndc.x * uTanHalfFov.x, ndc.y * uTanHalfFov.y, -1.0));

  // The stretch of the ray inside the disc's slab and nearer than the particles reach.
  float slab = uThickness * 3.0;
  float t0 = uResolve * 0.5;
  float t1 = uNear.y;
  if (abs(ray.y) > 1e-4) {
    float a = (-slab - uCameraLocal.y) / ray.y;
    float b = (slab - uCameraLocal.y) / ray.y;
    t0 = max(t0, min(a, b));
    t1 = min(t1, max(a, b));
  } else if (abs(uCameraLocal.y) > slab) {
    t1 = -1.0;
  }
  if (t1 <= t0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  float turned = uMotion.z * uTime;
  float dt = (t1 - t0) / float(STEPS);
  vec3 light = vec3(0.0);
  for (int i = 0; i < STEPS; i++) {
    float t = t0 + (float(i) + 0.5) * dt;
    vec3 p = uCameraLocal + ray * t;
    float r = length(p.xz);
    float edge = 1.0 - 0.85 * smoothstep(uArmShape.z * 0.72, uArmShape.z * 1.1, r);
    float h = uThickness * (1.15 - 0.55 * min(1.0, r / uArmShape.z));
    float phase = uArms.x * (atan(-p.z, p.x) - armAngle(r) - turned);
    float presence = armStrength(r) / max(uArmShape.x, 1e-6);
    // Old stars crowd onto the arms (about four to one); young light lives just past them.
    float old = uOldLight * exp(-r / uScaleLength) * exp(-p.y * p.y / (2.0 * h * h)) / (SQRT_TAU * h) *
      (0.55 + 1.2 * near(phase, 0.0, 0.8) * presence);
    float hy = h * 0.4;
    float young = uYoungLight * exp(-r / uYoungScale) * exp(-p.y * p.y / (2.0 * hy * hy)) / (SQRT_TAU * hy) *
      mix(0.15, pow(crest(phase, uYoungShift), 2.0), presence);
    float dust = 1.0 - uDust * near(phase, uDustLane, 0.18) * presence * exp(-p.y * p.y / (2.0 * hy * hy));
    // Only the share of the light whose particles have thinned away at this distance, and
    // only where it is far enough to merge into glow.
    float thinned = (1.0 - smoothstep(uNear.x, uNear.y, t)) * smoothstep(uResolve * 0.5, uResolve, t);
    light += (uDiscColour * old + uYoungColour * young) * edge * dust * thinned * dt;
  }
  gl_FragColor = vec4(light * uFade, 1.0);
}
