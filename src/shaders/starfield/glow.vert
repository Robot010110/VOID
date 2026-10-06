// The band's glow lives on a ring of sky around the band's plane, centred on the camera so it
// is always infinitely far away. Band coordinates come per vertex, so the fragment shader is
// a single texture read and nothing is drawn when the band is out of view.

uniform mat3 uBandToWorld;
uniform float uRadius;

varying vec2 vUv;

void main() {
  vUv = uv;
  vec3 world = cameraPosition + uBandToWorld * position * uRadius;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
