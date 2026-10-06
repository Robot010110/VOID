// The diffuse light of the home galaxy: unresolved stars, star clouds and dust lanes,
// read from the strip baked once at startup.

uniform sampler2D uBandMap;
uniform float uIntensity;
uniform float uFade;

varying vec2 vUv;

void main() {
  gl_FragColor = vec4(texture(uBandMap, vUv).rgb * uIntensity * uFade, 1.0);
}
