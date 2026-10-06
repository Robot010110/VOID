// A camera-facing quad through the star's centre. The mesh is scaled by the star's radius,
// so coordinates come out in star radii whatever the level's scale.
uniform float uExtent;

varying vec2 vCoord;

void main() {
  vCoord = position.xy * uExtent;
  float radius = length(modelViewMatrix[0].xyz);
  vec4 view = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  view.xy += vCoord * radius;
  gl_Position = projectionMatrix * view;
}
