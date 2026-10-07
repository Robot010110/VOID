// The black hole, traced. Every pixel near the hole follows its ray back through the hole's
// gravity (Schwarzschild, in units of the hole's radius, from the exact shape of a light ray's
// path written as a force), so the far side of the disc bends up over the shadow and down
// under it, light that skims the photon sphere gathers into a thin bright ring, and rays that
// come too close fall in and stay black.
//
// The disc is thin, hot gas on circular orbits: white-hot at its inner edge, cooling to Ember
// outward, its turbulence carried round faster inside than out. Gas coming towards the camera
// is brighter and bluer (Doppler beaming), gas near the hole dimmer and redder.
//
// Output is premultiplied: the disc's light, and in alpha how much of the scene behind it is
// hidden (all of it inside the shadow). The lensing pass lays it over the bent scene.
#include "../common/blackbody.glsl"

uniform vec2 uResolution;
// The camera in the hole's frame, in the hole's radii; and view directions into that frame.
uniform vec3 uCamera;
uniform mat3 uViewToHole;
uniform vec2 uTanHalfFov;
uniform float uTime;
uniform sampler2D uNoise;
// The noise's size in texels, and the angle one pixel of this buffer spans (for its detail).
uniform vec2 uNoiseSize;
uniform float uPixelAngle;
// The disc's inner and outer radius, and the radius of the region traced.
uniform vec2 uDisc;
uniform float uBound;
uniform float uInnerTemperature;
uniform float uBrightness;
uniform float uBeaming;
uniform float uFade;

#ifndef STEPS
#define STEPS 72
#endif

const float TAU = 6.2831853;
// Rays aimed closer than this fall in: the edge of the shadow.
const float CRITICAL = 2.5980762;
// Seconds over which the disc's turbulence renews: two layers half a cycle apart crossfade,
// so the pattern streams round without winding up for ever.
const float CYCLE = 36.0;
// Radians a second at the inner edge.
const float SPIN = 0.12;

float pow5(float x) {
  float x2 = x * x;
  return x2 * x2 * x;
}

/** The disc's light and cover where a ray crosses it, premultiplied. */
vec4 disc(vec3 p, float r, vec3 travel) {
  float phi = atan(p.z, p.x);
  float omega = SPIN * pow(uDisc.x / r, 1.5);
  float outward = log(r / uDisc.x) / log(uDisc.y / uDisc.x);
  // As coarse as a pixel's footprint here (stretched where the disc is seen edge-on), so it
  // never sparkles when it is small or far.
  float footprint = uPixelAngle * length(p - uCamera) / max(abs(travel.y), 0.08);
  float texels = footprint * max(uNoiseSize.x / (TAU * r), uNoiseSize.y / (r * log(uDisc.y / uDisc.x)));
  float lod = log2(max(texels, 1.0));
  float cycle = uTime / CYCLE;
  vec3 noise = vec3(0.0);
  for (int k = 0; k < 2; k++) {
    float t = fract(cycle + float(k) * 0.5);
    float weight = 1.0 - abs(2.0 * t - 1.0);
    float angle = phi - omega * (t - 0.5) * CYCLE;
    noise += weight * textureLod(uNoise, vec2(angle / TAU + float(k) * 0.37, outward), lod).rgb;
  }
  float streaks = noise.r;
  float clumps = noise.g;

  // Thick and bright inside, thinning into ragged wisps outside.
  float inner = smoothstep(uDisc.x * 0.92, uDisc.x * 1.12, r);
  float outer = 1.0 - smoothstep(uDisc.y * 0.45, uDisc.y, r);
  float gas = inner * outer * smoothstep(0.18, 0.75, clumps * 0.6 + streaks * 0.7 - 0.1 * outward);
  float cover = clamp(gas * mix(1.0, 0.55, outward) * 1.6, 0.0, 0.97);

  // Hottest at the inner edge, cooling as r^-3/4.
  // Light falls as the gas cools outward (r^-3/4), its colour faster, from white to Ember.
  float heat = pow(r / uDisc.x, -0.75);
  float cooling = pow(heat, 2.6);
  float colourHeat = pow(r / uDisc.x, -0.95);
  // Doppler beaming: the gas circles the hole's axis; light leaves it against the ray.
  float beta = uBeaming * sqrt(0.5 / max(r - 1.0, 0.25));
  vec3 velocity = normalize(vec3(-p.z, 0.0, p.x));
  float approach = dot(velocity, -travel);
  float g = sqrt(1.0 - beta * beta) / (1.0 - beta * approach) * sqrt(1.0 - 1.0 / r);
  vec3 colour = blackbody(uInnerTemperature * colourHeat * g);
  float light = uBrightness * cooling * g * g * g * (0.62 + 0.62 * streaks);
  return vec4(colour * light * cover, cover);
}

void main() {
  vec2 ndc = gl_FragCoord.xy / uResolution * 2.0 - 1.0;
  vec3 ray = normalize(uViewToHole * vec3(ndc * uTanHalfFov, -1.0));
  // Whether the ray falls in is known from where it is aimed: its impact parameter, as the
  // lensing pass measures it. The march below gathers the disc along the way.
  float distance = length(uCamera);
  float cosine = dot(ray, -uCamera / distance);
  float impact = distance * sqrt(max(0.0, 1.0 - cosine * cosine)) / sqrt(max(1.0 - 1.0 / distance, 1e-4));
  bool fallsIn = impact < CRITICAL && cosine > 0.0;
  vec3 x = uCamera;
  // Into the traced region (rays that miss it are not bent enough to matter here).
  float along = dot(x, ray);
  float outside = dot(x, x) - uBound * uBound;
  if (outside > 0.0) {
    float reach = along * along - outside;
    if (reach <= 0.0 || along > 0.0) {
      gl_FragColor = vec4(0.0);
      return;
    }
    x += ray * (-along - sqrt(reach));
  }

  vec3 v = ray;
  vec3 h = cross(x, v);
  float h2 = dot(h, h);
  vec3 light = vec3(0.0);
  float cover = 0.0;
  for (int i = 0; i < STEPS; i++) {
    float r = length(x);
    float dt = clamp(0.11 * (r - 0.7), 0.02, 1.6);
    vec3 midway = v - 0.75 * h2 * x / pow5(r) * dt;
    vec3 next = x + midway * dt;
    float rNext = length(next);
    v = midway - 0.75 * h2 * next / pow5(rNext) * dt;
    if (x.y * next.y < 0.0) {
      vec3 p = mix(x, next, x.y / (x.y - next.y));
      float pr = length(p.xz);
      if (pr > uDisc.x * 0.9 && pr < uDisc.y) {
        vec4 gas = disc(p, pr, normalize(next - x));
        light += (1.0 - cover) * gas.rgb;
        cover += (1.0 - cover) * gas.a;
      }
    }
    x = next;
    if (rNext < 1.0 || cover > 0.995) break;
    if (rNext > uBound && dot(x, v) > 0.0) break;
  }

  if (fallsIn) {
    cover = 1.0;
  } else {
    // The photon ring: light that skimmed the photon sphere, circling it before it escaped.
    float ring = exp(-(impact / CRITICAL - 1.0) / 0.012);
    light += (1.0 - cover) * blackbody(uInnerTemperature * 0.85) * ring * uBrightness * 0.9;
  }
  gl_FragColor = vec4(light, cover) * uFade;
}
