// Bakes a gas giant's cloud tops for one cube map face: latitude bands from a palette,
// their edges torn by domain-warped turbulence that is stretched along the winds, plus fine
// streaks and mottled polar regions. Motion (differential rotation, storms) happens later,
// when the shader samples this map. Output: rgb = colour (stored in sRGB).
#include "../common/noise.glsl"
#include "../common/fbm.glsl"
#include "../common/hash.glsl"
#include "../common/cellular.glsl"
#include "../common/cube.glsl"

uniform int uFace;
uniform float uSize;
uniform vec3 uSeedOffset;
uniform sampler2D uPalette;
uniform float uTurbulence;
uniform vec3 uPoleColor;

void main() {
  vec3 d = cubeDirection(uFace, gl_FragCoord.xy / uSize);

  // Stretched along longitude: eddies are long and thin, the way jets shear them.
  vec3 p = vec3(d.x, d.y * 7.0, d.z) * 1.5 + uSeedOffset;
  vec3 w = vec3(fbm(p, 4), fbm(p + 13.1, 4), fbm(p + 27.7, 4));
  // Band edges torn at two scales: broad waves and fine eddies.
  float wobble = fbm(p * 2.5 + w * 1.8, 5);
  vec3 v = vec3(fbm(p * 5.0 + w * 2.0, 3), fbm(p * 5.0 + w * 2.0 + 4.4, 3), 0.0);
  float ripple = fbm(p * 9.0 + v * 2.5, 4);
  float y = d.y + uTurbulence * (0.024 * wobble + 0.016 * ripple);
  vec3 colour = texture(uPalette, vec2(y * 0.5 + 0.5, 0.5)).rgb;
  // Bands within bands: a second, differently torn reading of the palette blended in,
  // so each band carries finer stripes of its neighbours' colours.
  float y2 = d.y + uTurbulence * (0.05 * fbm(p * 1.7 + w * 2.2 + 31.0, 4) + 0.02 * ripple);
  colour = mix(colour, texture(uPalette, vec2(y2 * 0.5 + 0.5, 0.5)).rgb, 0.35);

  // Fine streaks drawn out along the winds, and eddies that brighten or darken a band.
  float streaks = fbm(vec3(d.x, d.y * 34.0, d.z) * 6.0 + w * 2.8, 5);
  colour *= 0.92 + 0.16 * streaks;
  float eddies = fbm(p * 4.0 + w * 3.0 + v, 5);
  colour *= 1.0 + 0.1 * eddies * uTurbulence;

  // Small white ovals scattered through the belts.
  float ovals = smoothstep(0.16, 0.06, cellular(vec3(d.x * 1.0, d.y * 2.6, d.z * 1.0) * 13.0 + uSeedOffset).x);
  ovals *= step(0.7, fract(sin(floor(d.y * 18.0) * 43.7) * 917.3)) * uTurbulence;
  colour = mix(colour, vec3(0.96, 0.93, 0.88), ovals * 0.75);

  // Poles: bands give way to a darker, mottled cap.
  float pole = smoothstep(0.78, 0.96, abs(d.y));
  float mottle = fbm(d * 9.0 + uSeedOffset, 4) * 0.5 + 0.5;
  colour = mix(colour, uPoleColor * (0.8 + 0.4 * mottle), pole * 0.75);

  gl_FragColor = vec4(colour, 1.0);
}
