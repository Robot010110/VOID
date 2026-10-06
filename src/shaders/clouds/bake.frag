// Bakes cloud cover for one face of the cloud cube map: weather organised by latitude,
// streaked along the prevailing winds, with a few cyclones spiralling the cover around them.
// Output: r = coverage [0, 1].
#include "../common/noise.glsl"
#include "../common/fbm.glsl"
#include "../common/hash.glsl"
#include "../common/cellular.glsl"
#include "../common/cube.glsl"

uniform int uFace;
uniform float uSize;
uniform vec3 uSeedOffset;
uniform float uCoverage;
uniform float uScale;
uniform vec4 uCyclones[6];
uniform int uCycloneCount;

vec3 rotateAbout(vec3 v, vec3 axis, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return v * c + cross(axis, v) * s + axis * dot(axis, v) * (1.0 - c);
}

void main() {
  vec3 d = cubeDirection(uFace, gl_FragCoord.xy / uSize);
  float latitude = asin(clamp(abs(d.y), 0.0, 1.0));

  // Cyclones twist the sampling direction around their eye; the twist fades with distance,
  // which winds the cloud field into spiral arms. Hemisphere sets the sense of rotation.
  vec3 q = d;
  float eye = 0.0;
  for (int i = 0; i < 6; i++) {
    if (i >= uCycloneCount) break;
    vec3 centre = uCyclones[i].xyz;
    float strength = uCyclones[i].w;
    float apart = acos(clamp(dot(q, centre), -1.0, 1.0));
    float radius = 0.2 + 0.12 * fract(float(i) * 0.37);
    // A gentle twist with a broad falloff: strong shear would wind fine detail into rings.
    q = rotateAbout(q, centre, strength * exp(-pow(apart / radius, 2.0)) * 1.6);
    eye = max(eye, exp(-pow(apart / (radius * 0.08), 2.0)));
  }

#if defined(STYLE_HAZE)
  // A deep haze deck: almost no ground shows through. Broad, soft bands and slow swirls
  // give it a face without turning it into stripes.
  vec3 p = vec3(q.x, q.y * 3.0, q.z) * uScale + uSeedOffset;
  vec3 w = vec3(fbm(p * 0.8, 3), fbm(p * 0.8 + 7.7, 3), fbm(p * 0.8 + 3.3, 3));
  float broad = fbm(p * 0.6 + w * 1.2, 4);
  float fine = fbm(p * 3.0 + w * 2.0, 4);
  float cover = 0.74 + broad * 0.2 + fine * 0.07 + (uCoverage - 0.5);
#elif defined(STYLE_WISPS)
  // Thin, high streaks: long and sparse.
  vec3 p = vec3(q.x, q.y * 3.0, q.z) * uScale + uSeedOffset;
  vec3 w = vec3(fbm(p * 1.4, 3), fbm(p * 1.4 + 7.7, 3), fbm(p * 1.4 + 3.3, 3));
  float streaks = ridged(p * 1.6 + w * 0.8, 5);
  float cover = streaks * (fbm(p * 0.7 + 4.0, 3) * 0.5 + 0.5) + (uCoverage - 0.5);
#else
  // Earth-like weather. Two levels of domain warping fold the noise into the curling,
  // streaming shapes of real cloud systems; latitude organises them into belts.
  vec3 p = vec3(q.x, q.y * 1.5, q.z) * uScale + uSeedOffset;
  vec3 a = vec3(fbm(p, 4), fbm(p + vec3(5.2, 1.3, 2.8), 4), fbm(p + vec3(1.7, 9.2, 4.3), 4));
  vec3 b = vec3(
    fbm(p + 1.6 * a + vec3(8.3, 2.8, 4.1), 4),
    fbm(p + 1.6 * a + vec3(2.1, 6.4, 9.9), 4),
    fbm(p + 1.6 * a + vec3(7.4, 3.3, 1.2), 4)
  );
  float flow = fbm(p + 1.4 * b, 6) * 0.5 + 0.5;
  // Rain belt at the equator, clear subtropics, storm tracks at mid-latitudes.
  float belts = 0.2 * cos(latitude * 6.0) - 0.06 * smoothstep(0.8, 1.2, latitude);
  float cover = flow + belts + (uCoverage - 0.5);
  cover += (fbm(p * 7.0 + b * 2.0, 4)) * 0.08;
#endif

  cover = mix(cover, cover - 0.6, eye);
  gl_FragColor = vec4(clamp(cover, 0.0, 1.0), 0.0, 0.0, 1.0);
}
