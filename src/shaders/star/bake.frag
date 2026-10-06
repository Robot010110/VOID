// Bakes one face of a star's surface pattern: two independent granulation fields (the
// surface shader blends between them region by region over time, so the surface seems to
// boil), the coarse supergranular network, and the field spots form in.
// Output: r, g = granulation (bright cell tops, dark lanes, each cell its own brightness),
// b = network, a = spot field; all in [0, 1].
#include "../common/noise.glsl"
#include "../common/fbm.glsl"
#include "../common/hash.glsl"
#include "../common/cube.glsl"

uniform int uFace;
uniform float uSize;
uniform vec3 uSeedOffset;

const float GRAIN = 24.0;

// Distances to the nearest and second-nearest cell centres, and the nearest cell's own value.
vec3 granules(vec3 p) {
  vec3 cell = floor(p);
  vec3 local = fract(p);
  float f1 = 8.0;
  float f2 = 8.0;
  float id = 0.0;
  for (int z = -1; z <= 1; z++) {
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec3 offset = vec3(float(x), float(y), float(z));
        vec3 h = hash33(cell + offset);
        vec3 r = offset + 0.15 + h * 0.7 - local;
        float d = dot(r, r);
        if (d < f1) {
          f2 = f1;
          f1 = d;
          id = h.z;
        } else if (d < f2) {
          f2 = d;
        }
      }
    }
  }
  return vec3(sqrt(vec2(f1, f2)), id);
}

float granulation(vec3 p) {
  // Warped slightly, so cells are irregular rather than a mosaic.
  p += vec3(snoise(p * 0.35), snoise(p * 0.35 + 11.0), snoise(p * 0.35 + 23.0)) * 0.35;
  vec3 f = granules(p);
  float body = (1.0 - smoothstep(0.05, 0.85, f.x)) * smoothstep(0.0, 0.32, f.y - f.x);
  return clamp(body * 0.8 + f.z * 0.2, 0.0, 1.0);
}

void main() {
  vec3 d = cubeDirection(uFace, gl_FragCoord.xy / uSize);
  vec3 p = d * GRAIN + uSeedOffset;
  float a = granulation(p);
  float b = granulation(p + vec3(17.3, 5.1, 9.7));
  float network = fbm(d * 7.0 + uSeedOffset * 0.3, 3) * 0.5 + 0.5;
  float spots = fbm(d * 2.4 + uSeedOffset, 4) * 0.5 + 0.5;
  gl_FragColor = vec4(a, b, network, spots);
}
