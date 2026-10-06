// A gas giant's visible cloud deck. Each latitude turns at its own speed (alternating jets),
// storms swirl the pattern around their eyes, and the disc darkens towards the limb.
#include "../common/noise.glsl"
#include "../atmosphere/transmittance.glsl"

uniform samplerCube uBands;
uniform sampler2D uRingMap;
uniform vec3 uSunObj;
uniform vec3 uCamObj;
uniform vec3 uSunIrradiance;
uniform float uTime;
uniform float uFade;
uniform float uJetSpeed;
uniform float uJetCount;
uniform vec4 uStorms[3];
uniform vec3 uStormColors[3];
uniform int uStormCount;
uniform float uStormSwirl;
uniform float uLimbDarkening;
uniform float uAmbient;
uniform float uDetail;

uniform float uRingInner;
uniform float uRingOuter;
uniform float uRingOpacity;

varying vec3 vPos;

const float PI = 3.14159265;

vec3 rotateAbout(vec3 v, vec3 axis, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return v * c + cross(axis, v) * s + axis * dot(axis, v) * (1.0 - c);
}

float ringShadow(vec3 p, vec3 light) {
  if (abs(light.y) < 1e-4) return 1.0;
  float t = -p.y / light.y;
  if (t <= 0.0) return 1.0;
  float r = length((p + light * t).xz);
  float x = (r - uRingInner) / (uRingOuter - uRingInner);
  if (x < 0.0 || x > 1.0) return 1.0;
  return 1.0 - texture(uRingMap, vec2(x, 0.5)).r * uRingOpacity;
}

void main() {
  vec3 d = normalize(vPos);
  float lat = d.y;

  // Differential rotation: alternating jets, each latitude sliding at its own rate.
  float jet = sin(lat * uJetCount) * 0.65 + sin(lat * uJetCount * 0.43 + 1.3) * 0.35;
  vec3 q = rotateAbout(d, vec3(0.0, 1.0, 0.0), uTime * uJetSpeed * jet);

  // Storms live in the band they ride on: swirl the lookup around each eye.
  vec3 stormTint = vec3(0.0);
  float stormWeight = 0.0;
  for (int i = 0; i < 3; i++) {
    if (i >= uStormCount) break;
    vec3 eye = normalize(uStorms[i].xyz);
    float radius = uStorms[i].w;
    // Ovals: squash distance across latitude.
    vec3 offset = q - eye;
    offset.y *= 1.7;
    float r = length(offset) / radius;
    float inside = 1.0 - smoothstep(0.0, 1.0, r);
    q = rotateAbout(q, eye, uStormSwirl * inside * inside * (1.0 + 0.15 * sin(uTime * 0.05 + float(i))));
    float core = 1.0 - smoothstep(0.35, 0.9, r);
    stormTint += uStormColors[i] * core;
    stormWeight += core;
  }

  vec3 albedo = texture(uBands, q).rgb;
  albedo = mix(albedo, stormTint / max(stormWeight, 1e-4), clamp(stormWeight, 0.0, 1.0) * 0.75);
  // A hint of fine turbulence when close.
  float footprint = length(fwidth(vPos));
  float fade = 1.0 - smoothstep(0.2, 0.5, footprint * 60.0);
  albedo *= 1.0 + snoise(vec3(q.x, q.y * 8.0, q.z) * 60.0) * 0.04 * uDetail * fade;

  vec3 view = normalize(uCamObj - d);
  float mu = dot(d, uSunObj);
  float nv = max(dot(d, view), 0.0);

  // No hard surface: a soft terminator, and limb darkening from the deep atmosphere.
  float lambert = max(mu, 0.0);
  lambert = pow(lambert, 0.85) * smoothstep(-0.08, 0.12, mu);
  float limb = mix(1.0, pow(nv, 0.35), uLimbDarkening);
  vec3 sunlight = uSunIrradiance * sunTransmittance(uAtmBottom, mu);

  float shadow = 1.0;
#ifdef RINGS
  shadow = ringShadow(d, uSunObj);
#endif

  vec3 colour = albedo * sunlight * lambert * limb * shadow / PI + albedo * uAmbient;
  gl_FragColor = vec4(colour, 1.0) * uFade;
}
