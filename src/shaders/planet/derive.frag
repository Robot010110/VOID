// Second bake pass over the terrain cube map: surface normals from central differences of the
// height (so lighting interpolates smoothly between texels), and where a civilisation would
// settle: low, temperate, not too dry, and close to a coast. A world without seas has no coasts;
// its people settle the basins and valleys instead.
// Output: rgb = object-space normal * 0.5 + 0.5, a = population [0, 1].
#include "../common/noise.glsl"
#include "../common/cube.glsl"

uniform samplerCube uTerrain;
uniform int uFace;
uniform float uSize;
uniform float uReliefScale;
uniform float uSeaLevel;

void main() {
  vec3 d = cubeDirection(uFace, gl_FragCoord.xy / uSize);
  vec3 t;
  vec3 b;
  sphereTangents(d, t, b);

  // One texel at the face centre, in radians.
  float e = 2.0 / uSize;
  vec4 here = texture(uTerrain, d);
  // The sea is a smooth surface: clamp heights to sea level so oceans stay flat.
  float hx1 = max(texture(uTerrain, normalize(d + t * e)).r, uSeaLevel);
  float hx0 = max(texture(uTerrain, normalize(d - t * e)).r, uSeaLevel);
  float hy1 = max(texture(uTerrain, normalize(d + b * e)).r, uSeaLevel);
  float hy0 = max(texture(uTerrain, normalize(d - b * e)).r, uSeaLevel);
  vec3 gradient = (t * (hx1 - hx0) + b * (hy1 - hy0)) / (2.0 * e);
  vec3 normal = normalize(d - gradient * uReliefScale);

  bool dry = uSeaLevel < -1.0;
  float altitude = here.r - uSeaLevel;
  float land = step(0.0, altitude);
  float lowland = 1.0 - smoothstep(0.04, 0.36, altitude);
  float coastal = 0.7;
  if (dry) {
    lowland = 1.0 - smoothstep(-0.1, 0.25, here.r);
  } else {
    // How much sea lies within a short walk.
    float sea = 0.0;
    for (int i = 0; i < 12; i++) {
      float angle = float(i) * 0.5235988;
      float reach = (i < 6) ? 0.02 : 0.045;
      vec3 o = normalize(d + (t * cos(angle) + b * sin(angle)) * reach);
      sea += step(texture(uTerrain, o).r, uSeaLevel);
    }
    coastal = smoothstep(0.0, 0.2, sea / 12.0);
  }
  float temperate = 1.0 - smoothstep(0.5, 0.78, abs(d.y));
  float liveable = smoothstep(0.18, 0.42, here.g);
  float settled = land * lowland * temperate * mix(0.25, 1.0, coastal) * mix(0.35, 1.0, liveable);
  // People gather unevenly: a few dense regions, long empty stretches between.
  float gather = snoise(d * 7.0 + 11.0) * 0.6 + snoise(d * 19.0 + 3.0) * 0.4;
  float population = settled * smoothstep(0.12, 0.7, gather);

  gl_FragColor = vec4(normal * 0.5 + 0.5, population);
}
