// The surface of a star: granulation (hot cell tops parted by cooler lanes) that boils as
// two baked fields trade places region by region, a coarse supergranular network, spots
// with dark, cooler umbrae and bright faculae, and limb darkening that also reddens towards
// the edge, where only the cooler upper layers are seen. The pattern is baked once (see
// bake.frag); here it costs one texture read and one noise sample per pixel.
#include "../common/noise.glsl"
#include "../common/blackbody.glsl"

uniform samplerCube uPattern;
uniform float uTime;
uniform float uTemperature;
uniform float uIntensity;
uniform vec3 uCamObj;
uniform vec3 uSeedOffset;
uniform float uFade;

varying vec3 vPos;

void main() {
  vec3 d = normalize(vPos);
  vec3 view = normalize(uCamObj - d);
  float mu = clamp(dot(d, view), 0.0, 1.0);
  vec4 pattern = texture(uPattern, d);

  // Temperature relative to the photosphere's mean: granule tops run a little hot, lanes
  // and spots cool. Each region boils on its own rhythm.
  float rhythm = 0.5 + 0.5 * sin(uTime * 0.22 + snoise(d * 5.0 + uSeedOffset) * 4.0);
  float granule = mix(pattern.r, pattern.g, rhythm);
  float heat = 1.0 + mix(-0.045, 0.03, granule) + (pattern.b - 0.5) * 0.04;

  // Spots live in two belts either side of the equator; they drift as the star turns.
  float latitude = abs(d.y);
  float belts = smoothstep(0.06, 0.2, latitude) * (1.0 - smoothstep(0.42, 0.62, latitude));
  float field = (pattern.a * 2.0 - 1.0) * belts;
  float penumbra = smoothstep(0.3, 0.36, field);
  float umbra = smoothstep(0.4, 0.45, field);
  heat -= penumbra * 0.12 + umbra * 0.16;
  // Faculae: bright magnetic patches around the spots, clearest towards the limb.
  heat += smoothstep(0.16, 0.28, field) * (1.0 - penumbra) * (1.0 - mu) * 0.06;

  // Limb darkening (quadratic law); towards the edge the visible layers are cooler.
  float limb = 1.0 - 0.56 * (1.0 - mu) - 0.22 * (1.0 - mu) * (1.0 - mu);
  heat *= mix(0.82, 1.0, sqrt(mu));

  // Radiance climbs steeply with temperature (Stefan-Boltzmann), so small changes in heat
  // read as strong contrast. The face is coloured like an astrophotograph through a filter:
  // a warmer temperature than the light it casts, with the swings exaggerated, so a star
  // seen up close is golden or ember rather than a pale disc the tone mapper whitens.
  float tint = uTemperature * 0.78 * (1.0 + (heat - 1.0) * 2.5);
  vec3 colour = blackbody(tint) * pow(max(heat, 0.0), 4.0);
  gl_FragColor = vec4(colour * limb * uIntensity * uFade, 1.0);
}
