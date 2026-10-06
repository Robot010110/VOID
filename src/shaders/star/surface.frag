// The surface of a star: boiling granulation (convection cells whose centres drift, so the
// pattern seethes), a coarse supergranular network, slow-drifting spots with dark umbrae
// and bright faculae, and limb darkening that also reddens towards the edge, where only the
// cooler upper layers are seen. Detail finer than a pixel fades out, like a planet's.
#include "../common/noise.glsl"
#include "../common/fbm.glsl"
#include "../common/hash.glsl"
#include "../common/blackbody.glsl"

uniform float uTime;
uniform float uTemperature;
uniform float uIntensity;
uniform vec3 uCamObj;
uniform vec3 uSeedOffset;
uniform float uFade;

varying vec3 vPos;

// Nearest and second-nearest distances to cell centres that wander on small loops.
vec2 granules(vec3 p, float t) {
  vec3 cell = floor(p);
  vec3 local = fract(p);
  float f1 = 8.0;
  float f2 = 8.0;
  for (int z = -1; z <= 1; z++) {
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec3 offset = vec3(float(x), float(y), float(z));
        vec3 h = hash33(cell + offset);
        vec3 centre = 0.5 + 0.36 * sin(t * (0.5 + h.yzx) + h * 6.2831);
        vec3 r = offset + centre - local;
        float d = dot(r, r);
        if (d < f1) {
          f2 = f1;
          f1 = d;
        } else if (d < f2) {
          f2 = d;
        }
      }
    }
  }
  return sqrt(vec2(f1, f2));
}

void main() {
  vec3 d = normalize(vPos);
  vec3 view = normalize(uCamObj - d);
  float mu = clamp(dot(d, view), 0.0, 1.0);
  float footprint = length(fwidth(vPos));

  // Granulation: bright cell bodies, dark lanes between them.
  const float GRAIN = 34.0;
  float grainFade = 1.0 - smoothstep(0.25, 0.6, footprint * GRAIN);
  float brightness = 1.0;
  if (grainFade > 0.0) {
    vec2 f = granules(d * GRAIN + uSeedOffset, uTime * 0.3);
    float lane = smoothstep(0.0, 0.2, f.y - f.x);
    float body = mix(0.66, 1.08, lane) * (1.0 - f.x * 0.35) + 0.1;
    brightness = mix(1.0, body, grainFade);
  }
  // Supergranulation: a coarse network a few per cent brighter or darker.
  brightness *= 1.0 + fbm(d * 7.0 + uSeedOffset * 0.3 + vec3(0.0, uTime * 0.004, 0.0), 3) * 0.09;

  // Spots live in two belts either side of the equator and form and fade over minutes;
  // they drift because the whole star turns.
  float latitude = abs(d.y);
  float belts = smoothstep(0.06, 0.2, latitude) * (1.0 - smoothstep(0.42, 0.62, latitude));
  float field = fbm(d * 2.4 + uSeedOffset + vec3(uTime * 0.002), 4) * belts;
  float penumbra = smoothstep(0.3, 0.36, field);
  float umbra = smoothstep(0.4, 0.45, field);
  brightness *= 1.0 - penumbra * 0.4 - umbra * 0.42;
  // Faculae: bright magnetic patches around the spots, clearest towards the limb.
  brightness *= 1.0 + smoothstep(0.16, 0.28, field) * (1.0 - penumbra) * (1.0 - mu) * 0.6;

  // Limb darkening (quadratic law), and a cooler, redder edge.
  float limb = 1.0 - 0.56 * (1.0 - mu) - 0.22 * (1.0 - mu) * (1.0 - mu);
  vec3 colour = blackbody(uTemperature * mix(0.8, 1.0, sqrt(mu)));
  gl_FragColor = vec4(colour * brightness * limb * uIntensity * uFade, 1.0);
}
