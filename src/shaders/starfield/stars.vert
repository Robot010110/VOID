// One parallax layer of background stars, drawn as point sprites at infinity.
// Every star shares one point-spread function (a tight core and a faint wide halo); brighter
// stars simply light more of it, so apparent size grows with brightness the way it does on a
// real sensor. The sprite is sized to the radius where the light falls below visibility.
#include "../common/blackbody.glsl"
#include "./band.glsl"

attribute float aFlux;
attribute float aTemp;
attribute vec2 aTwinkle;
attribute float aSpike;
attribute float aRank;

uniform float uTime;
uniform float uFade;
uniform float uPixelRatio;
uniform float uMaxPointSize;
uniform float uBrightness;
uniform float uSaturation;
uniform float uTwinkle;
uniform float uCoreSigma;
uniform float uHaloSigma;
uniform float uHaloRatio;
uniform float uSpikeRatio;
uniform float uSpikeLength;
uniform float uSpikeWidth;
uniform float uDensity;
uniform vec3 uOffset;
uniform float uDust;
uniform float uGlowBoost;
uniform sampler2D uBandMap;
uniform mat3 uBandFrame;
uniform float uBandLatMax;

varying vec3 vColor;
// x: core peak, y: halo peak, z: spike peak, w: sprite half-size in pixels
varying vec4 vShape;
// x: core sigma, y: halo sigma, z: spike decay length, w: spike half-width (pixels)
varying vec4 vSize;

// Linear light below this is invisible once graded; sprites end where the light does.
const float VISIBLE = 0.003;

float gaussianReach(float peak, float sigma) {
  return peak > VISIBLE ? sigma * sqrt(2.0 * log(peak / VISIBLE)) : 0.0;
}

void main() {
  // Lower quality tiers keep the brightest share of the catalogue; the rest fades out.
  float keep = 1.0 - smoothstep(uDensity - 0.03, uDensity, aRank);

  // Parallax: the layer sits on a unit sphere, seen from a camera displaced by uOffset.
  vec3 world = normalize(mat3(modelMatrix) * position - uOffset);
  vec3 view = mat3(viewMatrix) * world;
  gl_Position = projectionMatrix * vec4(view, 1.0);
  gl_Position.z = gl_Position.w;

  // The band's light is made of stars: faint stars brighten where its glow is bright, and its
  // dust dims and reddens the stars behind it.
  float lat;
  vec2 uv = bandUv(uBandFrame, uBandLatMax, world, lat);
  vec4 band = abs(lat) < uBandLatMax ? texture(uBandMap, uv) : vec4(0.0);
  float tau = band.a * uDust;
  float glow = dot(band.rgb, vec3(0.2126, 0.7152, 0.0722));

  float twinkle = 1.0 + uTwinkle * (
    0.65 * sin(uTime * aTwinkle.y + aTwinkle.x) +
    0.35 * sin(uTime * aTwinkle.y * 1.73 + aTwinkle.x * 2.1)
  );
  float flux = aFlux * uBrightness * twinkle * uFade * keep * exp(-tau) * (1.0 + uGlowBoost * glow);

  vec3 tint = mix(vec3(1.0), blackbody(aTemp), uSaturation);
  tint *= mix(vec3(1.0), vec3(1.0, 0.8, 0.6), 1.0 - exp(-tau * 0.8));
  vColor = tint / max(dot(tint, vec3(0.2126, 0.7152, 0.0722)), 1e-3);

  float coreSigma = uCoreSigma * uPixelRatio;
  float haloSigma = uHaloSigma * uPixelRatio;
  float spikeLength = uSpikeLength * uPixelRatio * (0.5 + 0.5 * aSpike);
  float halo = flux * uHaloRatio;
  float spike = flux * aSpike * uSpikeRatio;

  float reach = max(gaussianReach(flux, coreSigma), gaussianReach(halo, haloSigma));
  reach = max(reach, spike > VISIBLE ? spikeLength * log(spike / VISIBLE) : 0.0);
  float size = min(2.0 * reach + 2.0, uMaxPointSize);

  gl_PointSize = flux > VISIBLE ? size : 0.0;
  vShape = vec4(flux, halo, spike, size * 0.5);
  vSize = vec4(coreSigma, haloSigma, spikeLength, uSpikeWidth * uPixelRatio);
}
