// The diffuse light of the home galaxy: unresolved stars, star clouds and dust lanes,
// read from the strip baked once at startup.
#include "./band.glsl"

uniform sampler2D uBandMap;
uniform mat3 uBandFrame;
uniform float uBandLatMax;
uniform float uIntensity;
uniform float uFade;

varying vec3 vRay;

void main() {
  float lat;
  vec2 uv = bandUv(uBandFrame, uBandLatMax, normalize(vRay), lat);
  vec3 light = abs(lat) < uBandLatMax ? texture(uBandMap, uv).rgb : vec3(0.0);
  gl_FragColor = vec4(light * uIntensity * uFade, 1.0);
}
