// A rocky world's surface, lit by its star. Terrain comes from the baked cube maps; fine
// detail, wave glitter, city lights and ruins are added per pixel and fade out as they approach
// the size of a pixel, so the planet stays calm at any distance. Lighting is in the planet's
// object space. Optional features compile in with defines: ATMOSPHERE, OCEAN, CLOUDS, RINGS,
// LIGHTS (with FLICKER for a failing grid), RUINS, LAVA, and one STYLE_* for the palette logic.
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
uniform float uClock;

uniform vec3 uRuinColor;
uniform float uRuinStrength;
uniform float uRuinRelief;
uniform vec3 uRuinSeed;
// The old roads: the planes of three great circles, and a direction in each to measure along.
uniform vec3 uRoadNormal[3];
uniform vec3 uRoadAxis[3];

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

#ifdef FLICKER
// A failing grid, in real seconds so it never strobes when time runs fast: every light keeps
// its own slow rhythm of long spells lit and short spells dark, and stutters as it changes over.
float flicker(vec3 rnd) {
  float period = 6.0 + 18.0 * fract(rnd.y * 37.1 + rnd.z * 3.7);
  float cycle = fract(uClock / period + fract(rnd.z * 91.7 + rnd.x * 13.3));
  float duty = 0.62 + 0.33 * fract(rnd.x * 53.9 + rnd.y * 7.1);
  float on = smoothstep(0.0, 0.025, cycle) * (1.0 - smoothstep(duty, duty + 0.025, cycle));
  float change = max(1.0 - smoothstep(0.0, 0.045, abs(cycle - duty)), 1.0 - smoothstep(0.0, 0.045, cycle));
  return on * (1.0 - change * 0.55 * (0.5 + 0.5 * sin(uClock * 43.0 + rnd.x * 60.0)));
}
#endif

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
    float brightness = 0.25 + 0.75 * rnd.z * rnd.z;
#ifdef FLICKER
    brightness *= flicker(rnd);
#endif
    light += exp(-dot(offset, offset) / (drawn * drawn)) * (s / drawn) * brightness;
  }
  return light;
}

vec3 cityLights(vec3 d, float population, float footprint) {
  // The most populous ground holds metropolitan areas: settlements packed tighter and
  // brighter. They are made of points too, never a single glowing blob.
  float metro = smoothstep(0.42, 0.85, population);
  float density = clamp(population * uCityDensity * (1.0 + metro * 0.6), 0.0, 1.0);
  float light = settlements(d, 190.0, 0.15, density, footprint) * (1.0 + metro * 0.5);
  light += settlements(d, 560.0, 0.13, density, footprint) * (0.4 + metro * 0.4);
  // Roads: faint threads where a noise field crosses zero, only between settlements.
  float field = abs(snoise(d * 58.0 + 3.1));
  float roadFade = 1.0 - smoothstep(0.08, 0.3, footprint * 58.0);
  light += (1.0 - smoothstep(0.0, 0.02, field)) * smoothstep(0.25, 0.6, population) * uRoads * roadFade;
#ifdef FLICKER
  // Now and then a whole city puts its lights out together, and later turns them back on.
  vec3 city = floor(d * 26.0 + snoise(d * 7.0 + 5.0) * 0.45);
  float r = hash13(city + 41.0);
  float cycle = fract(uClock / (45.0 + 60.0 * r) + r * 7.0);
  float dark = smoothstep(0.0, 0.05, cycle) * (1.0 - smoothstep(0.17, 0.23, cycle));
  light *= 1.0 - dark * step(0.4, r);
#endif
  // Overlapping lights roll off instead of adding up without limit, so a dense metropolis
  // glows rather than burning out into a flat patch.
  return uCityColor * (1.0 - exp(-light * 1.4)) / 1.4 * uCityIntensity;
}

#ifdef RUINS
// Walls on a square grid of spacing s through local coordinates p (radians): a soft profile of
// half-width w across each family of lines. A wall thinner than the pixel footprint f is drawn
// at about a pixel with its contrast kept; once the spacing itself nears a pixel the pattern
// gives way to its average tone, so it never shimmers. Returns its cover; slope gets the
// gradient of its height, for light.
float walls(vec2 p, float s, float w, float f, float lost, out vec2 slope) {
  float drawn = max(w, f * 0.6);
  float keep = w / drawn;
  float mean = min(1.0, 1.77 * drawn / s) * (1.0 - lost);
  float average = 1.0 - (1.0 - mean) * (1.0 - mean);
  float resolve = 1.0 - smoothstep(0.18, 0.45, f / s);
  slope = vec2(0.0);
  if (resolve <= 0.0) return average * keep;
  vec2 cell = p / s + 0.5;
  vec2 o = (fract(cell) - 0.5) * s;
  // Each length of wall, between one crossing and the next, stands or has fallen on its own.
  vec2 stands = step(vec2(lost), vec2(hash13(vec3(floor(cell), 1.0) + uRuinSeed), hash13(vec3(floor(cell.yx), 2.0) + uRuinSeed)));
  vec2 h = exp(-(o * o) / (drawn * drawn)) * stands;
  vec2 dh = -2.0 * o / (drawn * drawn) * h;
  slope = vec2(dh.x * (1.0 - h.y), dh.y * (1.0 - h.x)) * keep * resolve;
  return mix(average, 1.0 - (1.0 - h.x) * (1.0 - h.y), resolve) * keep;
}

// A round wall of radius r about c, in the same local coordinates.
float roundWall(vec2 p, vec2 c, float r, float w, float f, out vec2 slope) {
  vec2 q = p - c;
  float len = max(length(q), 1e-6);
  float o = len - r;
  float drawn = max(w, f * 0.6);
  float keep = w / drawn * (1.0 - smoothstep(0.1, 0.3, f / r));
  float h = exp(-(o * o) / (drawn * drawn)) * keep;
  slope = -2.0 * o / (drawn * drawn) * h * (q / len);
  return h;
}

// What is left of a people's cities. Each district of a coarse grid on the sphere whose middle
// was settled held one planned city: a walled rectangle on its own bearing, laid out in avenues
// far enough apart to be seen from orbit, blocks between them and, up close, streets; some
// hold a great round forum. Between cities old roads run as great circles across the
// lowlands, broken into stretches. Returns how much of the ground here is ruin, 0 to 1; slope
// gets the walls' gradient on the sphere, for a low sun to pick out.
float ruins(vec3 d, float ground, float footprint, out vec3 slope) {
  slope = vec3(0.0);
  float ruin = 0.0;
  vec3 cell = floor(d * 14.0);
  vec3 centre = normalize(cell + 0.5);
  vec4 rnd = vec4(hash33(cell + uRuinSeed), hash13(cell + uRuinSeed + 7.7));
  if (rnd.w < 0.85 && texture(uNormals, centre).a > 0.08) {
    vec3 axis = abs(centre.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 t = normalize(cross(axis, centre));
    float turn = rnd.x * 1.5708;
    vec3 bearing = t * cos(turn) + cross(centre, t) * sin(turn);
    vec3 across = cross(centre, bearing);
    vec2 p = vec2(dot(d, bearing), dot(d, across));
    vec3 shape = hash33(cell + uRuinSeed + 31.0);
    vec2 middle = (shape.xy - 0.5) * 0.018;
    vec2 halfSize = vec2(mix(0.014, 0.03, shape.z), mix(0.012, 0.026, rnd.y));
    vec2 q = p - middle;
    vec2 e = abs(q) - halfSize;
    float edge = length(max(e, 0.0)) + min(max(e.x, e.y), 0.0);
    float inside = 1.0 - smoothstep(-footprint, footprint, edge);

    // The city wall.
    float drawn = max(0.0007, footprint * 0.6);
    float wall = exp(-(edge * edge) / (drawn * drawn)) * (0.0007 / drawn);
    vec2 outward = e.x > e.y ? vec2(sign(q.x), 0.0) : vec2(0.0, sign(q.y));
    vec2 g = outward * (-2.0 * edge / (drawn * drawn) * wall);

    // Its plan, laid out from one corner. Sand has taken some blocks and spared others.
    vec2 corner = q + halfSize;
    float avenue = mix(0.007, 0.011, rnd.z);
    float survives = step(0.3, hash13(vec3(floor(corner / (avenue * 0.25)), cell.x + cell.y * 7.0) + uRuinSeed));
    vec2 g1;
    vec2 g2;
    vec2 g3;
    float plan = walls(corner, avenue, 0.0004, footprint, 0.15, g1);
    float blocks = walls(corner, avenue * 0.25, 0.00015, footprint, 0.3, g2) * mix(0.15, 0.6, survives);
    float streets = walls(corner + avenue * 0.125, avenue * 0.0625, 0.00004, footprint, 0.4, g3) * 0.35 * survives;
    // The outer quarters have weathered most.
    float rim = max(abs(q.x) / halfSize.x, abs(q.y) / halfSize.y);
    float weathered = mix(0.5, 1.0, shape.y) * (1.0 - smoothstep(0.55, 1.0, rim) * 0.55);
    ruin = max(wall, max(plan, max(blocks, streets)) * inside) * weathered;
    g += (g1 + g2 * mix(0.15, 0.6, survives) + g3 * 0.35 * survives) * inside;
    g *= weathered;

    // A great round forum in some.
    if (shape.x < 0.4) {
      vec2 g4;
      vec2 at = middle + (hash33(cell + uRuinSeed + 53.0).xy - 0.5) * halfSize;
      float forum = roundWall(p, at, mix(0.0025, 0.0055, shape.y), 0.0005, footprint, g4);
      ruin = max(ruin, forum);
      g += g4;
    }
    slope = bearing * g.x + across * g.y;
  }

  // The old roads.
  float lowlands = 1.0 - smoothstep(0.2, 0.4, ground);
  if (lowlands > 0.0) {
    float drawn = max(0.0006, footprint * 0.6);
    for (int k = 0; k < 3; k++) {
      vec3 n = uRoadNormal[k];
      float o = dot(d, n);
      if (abs(o) > drawn * 3.0) continue;
      vec3 u = uRoadAxis[k];
      float along = atan(dot(d, cross(n, u)), dot(d, u)) * 2.865 + float(k) * 7.0;
      float piece = fract(along);
      float stretch = step(0.42, hash13(vec3(floor(along), float(k), 3.0) + uRuinSeed)) * smoothstep(0.0, 0.08, piece) * smoothstep(1.0, 0.92, piece);
      float h = exp(-(o * o) / (drawn * drawn)) * (0.0006 / drawn) * stretch * lowlands * 0.8;
      ruin = max(ruin, h);
      vec3 gradient = n * (-2.0 * o / (drawn * drawn) * h);
      slope += gradient - d * dot(gradient, d);
    }
  }
  return clamp(ruin, 0.0, 1.0);
}
#endif

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
  // Snow: polar caps, and peaks whose snow line drops towards the poles. Heights are measured
  // from the sea, or on a world without one from the ground's middle (its sea lies far below).
#ifdef OCEAN
  float peaks = altitude;
#else
  float peaks = altitude + uSeaLevel;
#endif
  float snow = smoothstep(uSnowLine - 0.04, uSnowLine + 0.04, peaks + (coldness - 0.45) * 0.55);
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
#ifdef RUINS
    // Their walls stand a little proud of the ground, so a low sun picks them out.
    vec3 wallSlope;
#ifdef OCEAN
    float ground = altitude;
#else
    float ground = height;
#endif
    // Only where the sun reaches: at night the ground's colour hardly shows.
    if (mu > -0.2) {
      float ruin = ruins(d, ground, footprint, wallSlope);
      albedo = mix(albedo, uRuinColor, ruin * uRuinStrength);
      normal = normalize(normal - wallSlope * uRuinRelief);
    }
#endif
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
  if (night > 0.0 && !water && derived.a > 0.01) colour += cityLights(d, derived.a, footprint) * night;
#endif

#ifdef LAVA
  float heat = terrain.a * (0.82 + 0.18 * sin(uTime * 0.6 + terrain.b * 23.0));
  colour += uEmissive * uEmissiveStrength * heat * heat;
#endif

  // Premultiplied: a fading world thins against the sky instead of darkening to a disc.
  gl_FragColor = vec4(colour, 1.0) * uFade;
}
