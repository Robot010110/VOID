// Bakes one face of a rocky world's terrain cube map. Everything is 3D noise sampled on the
// unit sphere, so there are no seams and no polar pinching.
// Output: r = height (sea level near 0), g = moisture [0, 1], b = slow variation [-1, 1],
// a = a style mask (lava cracks, ice lineae, bright crater ejecta, salt flats).
#include "../common/noise.glsl"
#include "../common/fbm.glsl"
#include "../common/hash.glsl"
#include "../common/cellular.glsl"
#include "../common/cube.glsl"

uniform int uFace;
uniform float uSize;
uniform vec3 uSeedOffset;
uniform float uContinentScale;
uniform float uWarp;
uniform float uContinentBias;
uniform float uMountainScale;
uniform float uMountainStrength;
uniform float uHillStrength;
uniform float uMoistureScale;
uniform float uCraterDensity;
uniform float uCraterDepth;
uniform float uCrackScale;

// Large-scale landmasses: domain-warped fractal noise gives organic, believable coastlines.
float continents(vec3 d) {
  vec3 p = d * uContinentScale + uSeedOffset;
  vec3 q = vec3(fbm(p, 4), fbm(p + vec3(5.2, 1.3, 2.8), 4), fbm(p + vec3(1.7, 9.2, 4.3), 4));
  return fbm(p + uWarp * q, 6);
}

// One octave of craters: bowls with raised rims and a skirt of ejecta. Not every cell holds
// one. The mask reports fresh, bright ejecta around the youngest craters.
float craterField(vec3 p, out float ejecta) {
  vec2 c = cellularId(p);
  float exists = step(1.0 - uCraterDensity, fract(c.y * 7.31));
  float radius = mix(0.22, 0.46, c.y);
  float x = c.x / radius;
  float bowl = max(x * x - 1.0, -0.75) * step(x, 1.0);
  float rim = exp(-pow((x - 1.0) / 0.2, 2.0)) * 0.42;
  float skirt = exp(-max(x - 1.0, 0.0) * 3.5) * 0.12 * step(1.0, x);
  float young = step(0.82, fract(c.y * 13.7));
  ejecta = exists * young * exp(-max(x - 1.0, 0.0) * 1.6) * step(0.9, x);
  return (bowl + rim + skirt) * exists;
}

float craters(vec3 d, out float ejecta) {
  float height = 0.0;
  ejecta = 0.0;
  float amplitude = 1.0;
  float frequency = 3.0;
  for (int i = 0; i < 5; i++) {
    float e;
    height += craterField(d * frequency + uSeedOffset * (1.0 + float(i) * 0.37), e) * amplitude;
    ejecta = max(ejecta, e * amplitude);
    frequency *= 2.15;
    amplitude *= 0.52;
  }
  return height;
}

void main() {
  vec3 d = cubeDirection(uFace, gl_FragCoord.xy / uSize);
  float lat = d.y;
  float height;
  float mask = 0.0;

#if defined(STYLE_CONTINENTS)
  float c = continents(d) + uContinentBias;
  float land = smoothstep(-0.02, 0.2, c);
  // Mountain ranges: ridged noise, strongest inland and along old plate boundaries.
  float ridges = ridged(d * uMountainScale + uSeedOffset * 1.37, 6);
  float plates = 1.0 - smoothstep(0.0, 0.24, abs(fbm(d * 1.4 + uSeedOffset.zxy * 0.7, 3)));
  float mountains = ridges * ridges * smoothstep(0.02, 0.32, c) * mix(0.3, 1.0, plates);
  float hills = fbm(d * uMountainScale * 2.6 + uSeedOffset.yzx, 5);
  height = c * 0.9 + mountains * uMountainStrength + hills * uHillStrength * land;
  // Sea floor: a shallow shelf near coasts, falling away into deep basins.
  if (c < 0.0) height = c * 1.2 - smoothstep(0.0, 0.25, -c) * 0.15 + hills * 0.02;

#elif defined(STYLE_DUNES)
  // Basins and plateaus, cut into terraced mesas, with dune seas in the lowlands.
  float c = continents(d) + uContinentBias;
  float terraces = floor(c * 7.0) / 7.0;
  float steps = mix(c, terraces + smoothstep(0.0, 1.0, fract(c * 7.0)) / 7.0, 0.65);
  vec3 wind = vec3(d.x, d.y * 3.5, d.z);
  float dunes = ridged(wind * uMountainScale * 3.0 + uSeedOffset, 3);
  float basin = 1.0 - smoothstep(-0.25, 0.1, c);
  float e;
  float crater = craters(d * 0.6, e) * 0.08;
  height = steps * 0.8 + dunes * uHillStrength * basin + crater;
  height += ridged(d * uMountainScale + uSeedOffset.zyx, 5) * uMountainStrength * smoothstep(0.1, 0.4, c);
  // Salt flats in the lowest basins.
  mask = smoothstep(-0.32, -0.42, c);

#elif defined(STYLE_ICE)
  // Smooth ice plains crossed by long fracture lines (lineae) and colder, rougher highlands.
  float c = continents(d) + uContinentBias;
  height = c * 0.35 + fbm(d * uMountainScale + uSeedOffset.yzx, 5) * uHillStrength;
  float lineA = ridged(d * uCrackScale + uSeedOffset, 4);
  float lineB = ridged(d * uCrackScale * 1.7 + uSeedOffset.zxy * 1.3, 4);
  mask = max(smoothstep(0.8, 0.95, lineA), smoothstep(0.83, 0.96, lineB) * 0.7);
  height -= mask * 0.04;

#elif defined(STYLE_LAVA)
  // A cracked basalt crust over molten rock: plates part along glowing seams, and the lowest
  // ground pools into lava lakes.
  float c = continents(d) + uContinentBias;
  // Warp the cells so plate edges wander instead of running straight.
  vec3 bend = vec3(fbm(d * 3.0 + uSeedOffset, 3), fbm(d * 3.0 + uSeedOffset.yzx, 3), fbm(d * 3.0 + uSeedOffset.zxy, 3));
  vec2 big = cellular(d * uCrackScale + bend * 0.9 + uSeedOffset);
  vec2 small = cellular(d * uCrackScale * 2.7 + bend * 1.6 + uSeedOffset.zxy);
  float width = mix(0.03, 0.11, fbm(d * 5.0 + uSeedOffset.yxz, 3) * 0.5 + 0.5);
  float seams = 1.0 - smoothstep(0.0, width, big.y - big.x);
  float fissures = (1.0 - smoothstep(0.0, width * 0.6, small.y - small.x)) * 0.55;
  // Some regions are quiet crust, others still pouring out.
  float activity = smoothstep(-0.25, 0.35, fbm(d * 1.6 + uSeedOffset.zyx * 1.3, 4));
  float lakes = smoothstep(-0.18, -0.3, c);
  mask = clamp(max(seams, fissures * activity) * mix(0.25, 1.0, activity) + lakes, 0.0, 1.0);
  height = c * 0.6 + ridged(d * uMountainScale + uSeedOffset * 1.1, 5) * uMountainStrength * smoothstep(0.0, 0.3, c);
  height -= mask * 0.08;

#else // STYLE_CRATERS
  // An airless world: dark, smooth maria in old basins, saturated with craters elsewhere.
  float c = continents(d) + uContinentBias;
  float maria = smoothstep(-0.05, -0.2, c);
  float ejecta;
  float pits = craters(d, ejecta) * uCraterDepth;
  height = c * 0.25 + pits * mix(1.0, 0.35, maria) + fbm(d * 18.0 + uSeedOffset, 3) * 0.02;
  mask = ejecta;
#endif

  float moisture = fbm(d * uMoistureScale + uSeedOffset.zyx * 1.9, 4) * 0.5 + 0.5;
  // Wet tropics, dry subtropics, wet mid-latitudes, dry poles.
  float latitude = asin(clamp(abs(lat), 0.0, 1.0));
  moisture = clamp(moisture + cos(latitude * 6.0) * 0.16, 0.0, 1.0);
  float variation = fbm(d * 3.1 + uSeedOffset * 0.31, 3);

  gl_FragColor = vec4(height, moisture, variation, mask);
}
