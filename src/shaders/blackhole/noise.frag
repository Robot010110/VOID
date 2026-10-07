// The black hole's disc, baked: noise laid out around it (seamless all the way round, u) and
// outward from it (v), changing slowly around and quickly outward, so it streaks along the
// orbits. Fine turbulent streaks (red), broad clumps of denser gas (green), a middle weave
// (blue).
#include "../common/noise.glsl"
#include "../common/fbm.glsl"

uniform vec2 uSize;

void main() {
  vec2 uv = gl_FragCoord.xy / uSize;
  float a = uv.x * 6.2831853;
  vec3 ring = vec3(cos(a), sin(a), 0.0);
  vec3 p = ring * 3.0 + vec3(0.0, 0.0, uv.y * 24.0);
  vec3 warp = vec3(fbm(p * 0.7 + 4.1, 3), fbm(p * 0.7 - 2.3, 3), fbm(p * 0.7 + 9.7, 3));
  float streaks = fbm(ring * 7.0 + vec3(0.0, 0.0, uv.y * 64.0) + warp * 0.9, 5) * 0.5 + 0.5;
  float clumps = fbm(ring * 2.2 + vec3(0.0, 0.0, uv.y * 9.0) + warp * 0.5 + 17.0, 4) * 0.5 + 0.5;
  float weave = fbm(ring * 4.5 + vec3(0.0, 0.0, uv.y * 34.0) - warp * 0.6 + 31.0, 4) * 0.5 + 0.5;
  gl_FragColor = vec4(clamp(streaks, 0.0, 1.0), clamp(clumps, 0.0, 1.0), clamp(weave, 0.0, 1.0), 1.0);
}
