// A rocky world's surface, lit by its star. Terrain comes from the baked cube maps; fine
// detail, wave glitter and city lights are added per pixel and fade out as they approach the
// size of a pixel, so the planet stays calm at any distance. Lighting is in the planet's
// object space. Optional features compile in with defines: ATMOSPHERE, OCEAN, CLOUDS, RINGS,
// LIGHTS, LAVA, and one STYLE_* for the palette logic.
#include "../common/noise.glsl"
#include "../common/hash.glsl"
#include "../atmosphere/transmittance.glsl"

uniform samplerCube uTerrain;
uniform samplerCube uNormals;
uniform samplerCube uClouds;
uniform sampler2D uRingMap;
uniform mat3 uCloudRotation;
uniform vec3 uSunObj;
uniform vec3 uCamObj;
uniform vec3 uSunIrradiance;
uniform float uSunSize;
uniform float uTime;
uniform float uFade;

uniform float uSeaLevel;
uniform float uRelief;
uniform float uDetail;
uniform int uDetailOctaves;

uniform vec3 uDeepWater;
uniform vec3 uShallowWater;
uniform vec3 uShore;
uniform vec3 uLowDry;
uniform vec3 uLowWet;
uniform vec3 uHighland;
uniform vec3 uRock;
uniform vec3 uSnow;
uniform vec3 uMarking;
uniform float uIceCap;
uniform float uSnowLine;
uniform float uWaterRoughness;
uniform float uGlint;
uniform vec3 uEmissive;
uniform float uEmissiveStrength;
uniform float uAmbient;
uniform vec3 uSkyAmbient;

uniform vec3 uCityColor;
uniform float uCityDensity;
uniform float uCityIntensity;
uniform float uRoads;

uniform float uCloudShadow;
uniform float uCloudHeight;
uniform float uCloudThreshold;

uniform float uRingInner;
uniform float uRingOuter;
uniform float uRingOpacity;

varying vec3 vPos;

const float PI = 3.14159265;
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

// Fractal detail with its analytic gradient. Each octave fades out before it gets smaller
// than about two pixels, which is what keeps the planet from shimmering when it is small.
float detailNoise(vec3 d, float footprint, out vec3 gradient) {
  float sum = 0.0;
  gradient = vec3(0.0);
  float amplitude = 0.5;
  float frequency = 40.0;
  for (int i = 0; i < 4; i++) {
    if (i >= uDetailOctaves) break;
    float fade = 1.0 - smoothstep(0.2, 0.5, footprint * frequency);
    if (fade <= 0.0) break;
    vec3 g;
    float n = snoiseGrad(d * frequency + float(i) * 17.3, g);
    sum += n * amplitude * fade;
    gradient += g * frequency * amplitude * fade;
    frequency *= 2.2;
    amplitude *= 0.5;
  }
  return sum;
}

// Bright points scattered through jittered cells: settlements. Only cells whose random value
// falls under the local density are lit. Like the stars, a light never shrinks below about a
// pixel: when it would, it is drawn at that size with its energy partly conserved, so distant
// cities read as soft clusters of light instead of sparkling or vanishing.
float settlements(vec3 d, float frequency, float size, float density, float footprint) {
  vec3 p = d * frequency;
  vec3 cell = floor(p);
  vec3 f = p - cell;
  vec3 base = step(0.5, f) - 1.0;
  float pixel = 0.75 * footprint * frequency;
  float light = 0.0;
  for (int k = 0; k < 8; k++) {
    vec3 c = base + vec3(float(k & 1), float((k >> 1) & 1), float((k >> 2) & 1));
    vec3 rnd = hash33(cell + c);
    if (rnd.x > density) continue;
    vec3 offset = f - (c + rnd);
    float s = size * (0.5 + rnd.y);
    float drawn = max(s, pixel);
    light += exp(-dot(offset, offset) / (drawn * drawn)) * (s / drawn) * (0.25 + 0.75 * rnd.z * rnd.z);
  }
  return light;
}

vec3 cityLights(vec3 d, float settled, float footprint) {
  // People gather unevenly: a few dense regions, long empty stretches between.
  float gather = snoise(d * 7.0 + 11.0) * 0.6 + snoise(d * 19.0 + 3.0) * 0.4;
  float population = settled * smoothstep(0.12, 0.7, gather);
  // Metropolitan areas pack settlements tighter and brighter; they are made of points too,
  // never a single glowing blob.
  float metro = smoothstep(0.55, 0.95, snoise(d * 34.0 + 5.0)) * smoothstep(0.2, 0.6, population);
  float density = clamp(population * uCityDensity * (1.0 + metro * 2.0), 0.0, 1.0);
  float light = settlements(d, 190.0, 0.15, density, footprint) * (1.0 + metro);
  light += settlements(d, 560.0, 0.13, density, footprint) * (0.4 + metro);
  light += settlements(d, 1500.0, 0.12, density * metro, footprint) * metro * 0.6;
  // Roads: faint threads where a noise field crosses zero, only between settlements.
  float field = abs(snoise(d * 58.0 + 3.1));
  float roadFade = 1.0 - smoothstep(0.08, 0.3, footprint * 58.0);
  light += (1.0 - smoothstep(0.0, 0.02, field)) * smoothstep(0.25, 0.6, population) * uRoads * roadFade;
  return uCityColor * light * uCityIntensity;
}

float cloudCover(vec3 d) {
  float c = texture(uClouds, uCloudRotation * d).r;
  return smoothstep(uCloudThreshold, uCloudThreshold + 0.22, c);
}

// Light passing through the ring plane on its way to the surface.
float ringShadow(vec3 p, vec3 light) {
  if (abs(light.y) < 1e-4) return 1.0;
  float t = -p.y / light.y;
  if (t <= 0.0) return 1.0;
  float r = length((p + light * t).xz);
  float x = (r - uRingInner) / (uRingOuter - uRingInner);
  if (x < 0.0 || x > 1.0) return 1.0;
  return 1.0 - texture(uRingMap, vec2(x, 0.5)).r * uRingOpacity;
}

vec3 landColour(float altitude, float moisture, float variation, float slope, float lat, float mask) {
  float coldness = abs(lat) + variation * 0.06;
#if defined(STYLE_CONTINENTS)
  // Desert, then grassland, then forest as rainfall rises.
  vec3 grass = mix(uLowDry, uLowWet, 0.45) * vec3(0.92, 1.0, 0.82);
  vec3 low = mix(uLowDry, grass, smoothstep(0.28, 0.38, moisture + variation * 0.05));
  low = mix(low, uLowWet, smoothstep(0.44, 0.56, moisture + variation * 0.05));
  vec3 colour = mix(low, uHighland, smoothstep(0.1, 0.38, altitude + variation * 0.04));
  colour = mix(colour, uRock, clamp(smoothstep(0.28, 0.6, altitude) * 0.75 + smoothstep(0.2, 0.45, slope) * 0.55, 0.0, 1.0));
  colour = mix(uShore, colour, smoothstep(0.0, 0.022, altitude));
#elif defined(STYLE_DUNES)
  // Bright dust plains broken by dark basalt provinces, ochre uplands and bare rock faces.
  vec3 colour = mix(uLowDry, uLowWet, smoothstep(0.44, 0.6, moisture + variation * 0.3));
  colour = mix(colour, uHighland, smoothstep(0.05, 0.35, altitude) * 0.7);
  colour = mix(colour, uRock, clamp(smoothstep(0.22, 0.5, slope) + smoothstep(0.4, 0.8, altitude) * 0.4, 0.0, 1.0));
  colour = mix(colour, uShore, mask * 0.45);
#elif defined(STYLE_ICE)
  vec3 colour = mix(uLowWet, uLowDry, smoothstep(0.3, 0.7, moisture + variation * 0.3));
  colour = mix(colour, uHighland, smoothstep(0.05, 0.3, altitude));
  colour = mix(colour, uRock, smoothstep(0.3, 0.55, slope));
  colour = mix(colour, uMarking, mask * 0.8);
#elif defined(STYLE_LAVA)
  vec3 colour = mix(uLowDry, uLowWet, smoothstep(0.3, 0.7, moisture));
  colour = mix(colour, uHighland, smoothstep(0.0, 0.3, altitude));
  colour = mix(colour, uRock, smoothstep(0.25, 0.5, slope));
  colour = mix(colour, uMarking, mask);
#else
  vec3 colour = mix(uLowWet, uLowDry, smoothstep(-0.05, 0.12, altitude + variation * 0.05));
  colour = mix(colour, uHighland, smoothstep(0.1, 0.4, altitude));
  colour = mix(colour, uRock, smoothstep(0.2, 0.5, slope) * 0.5);
  colour = mix(colour, uMarking, mask * 0.7);
#endif
  // Snow: polar caps, and peaks whose snow line drops towards the poles.
  float snow = smoothstep(uSnowLine - 0.04, uSnowLine + 0.04, altitude + (coldness - 0.45) * 0.55);
  snow = max(snow, smoothstep(uIceCap - 0.02, uIceCap + 0.05, coldness));
  snow *= 1.0 - smoothstep(0.45, 0.8, slope) * 0.55;
  return mix(colour, uSnow, clamp(snow, 0.0, 1.0));
}

void main() {
  vec3 d = normalize(vPos);
  vec4 terrain = texture(uTerrain, d);
  vec4 derived = texture(uNormals, d);
  float footprint = length(fwidth(vPos));

  vec3 normal = normalize(mix(d, normalize(derived.rgb * 2.0 - 1.0), uRelief));
  vec3 gradient;
  float detail = detailNoise(d, footprint, gradient);
  vec3 tangential = gradient - d * dot(gradient, d);

  float height = terrain.r + detail * 0.03 * uDetail;
  float altitude = height - uSeaLevel;
  float slope = 1.0 - dot(normal, d);
  float lat = d.y;

  vec3 light = uSunObj;
  vec3 view = normalize(uCamObj - d);
  float mu = dot(d, light);

#ifdef ATMOSPHERE
  // Sunlight after crossing the air: white at noon, ember near the terminator. Lifted a
  // little so the sunset band glows rather than browns out.
  vec3 sunlight = uSunIrradiance * pow(sunTransmittance(uAtmBottom, mu), vec3(0.8));
#else
  vec3 sunlight = uSunIrradiance * smoothstep(-uSunSize, uSunSize, mu);
#endif

  vec3 albedo;
  vec3 colour = vec3(0.0);
  bool water = false;

#ifdef OCEAN
  water = altitude < 0.0;
#endif

  if (water) {
    float depth = -altitude;
    albedo = mix(uShallowWater, uDeepWater, smoothstep(0.0, 0.12, depth));
    // Sea ice near the poles.
    float ice = smoothstep(uIceCap + 0.02, uIceCap + 0.08, abs(lat) + terrain.b * 0.05);
    albedo = mix(albedo, uSnow * 0.92, ice);
    // Waves: a faint fine normal so the glint breaks into glitter up close.
    vec3 waves = normalize(d - tangential * 0.0006);
    float roughness = mix(uWaterRoughness, 0.6, ice);
    vec3 h = normalize(light + view);
    float nl = max(dot(waves, light), 0.0);
    float nv = max(dot(waves, view), 1e-3);
    float nh = max(dot(waves, h), 0.0);
    float vh = max(dot(view, h), 0.0);
    float a = roughness * roughness;
    float a2 = a * a;
    float dTerm = a2 / (PI * pow(nh * nh * (a2 - 1.0) + 1.0, 2.0));
    float k = a * 0.5;
    float gTerm = (nv / (nv * (1.0 - k) + k)) * (nl / (nl * (1.0 - k) + k));
    float fresnel = 0.02 + 0.98 * pow(1.0 - vh, 5.0);
    colour += sunlight * dTerm * gTerm * fresnel / (4.0 * nv) * uGlint * (1.0 - ice);
    // The sea reflects the sky at grazing angles.
    float skyFresnel = 0.02 + 0.98 * pow(1.0 - nv, 5.0);
    colour += uSkyAmbient * skyFresnel * smoothstep(-0.2, 0.3, mu) * 2.0;
    normal = d;
  } else {
    albedo = landColour(altitude, terrain.g, terrain.b, slope, lat, terrain.a);
    normal = normalize(normal - tangential * 0.0012 * uDetail);
  }

  // Direct sunlight. Normal-mapped slopes catch low sun near the terminator, but stop at it.
  float lambert = max(dot(normal, light), 0.0) * smoothstep(-0.06, 0.1, mu);
  float shadow = 1.0;
#ifdef CLOUDS
  vec3 shadowDir = normalize(d + light * uCloudHeight / max(mu, 0.2));
  shadow *= 1.0 - cloudCover(shadowDir) * uCloudShadow;
#endif
#ifdef RINGS
  shadow *= ringShadow(d, light);
#endif
  colour += albedo * sunlight * lambert * shadow / PI;
  colour += albedo * (uSkyAmbient * smoothstep(-0.25, 0.35, mu) + uAmbient);

#ifdef LIGHTS
  float night = smoothstep(0.05, -0.16, mu);
  if (night > 0.0 && !water) colour += cityLights(d, derived.a, footprint) * night;
#endif

#ifdef LAVA
  float heat = terrain.a * (0.82 + 0.18 * sin(uTime * 0.6 + terrain.b * 23.0));
  colour += uEmissive * uEmissiveStrength * heat * heat;
#endif

  gl_FragColor = vec4(colour * uFade, 1.0);
}
