// The unresolved glow of the bulge's billions of old stars: a camera-facing disc of light at
// the centre. Particles give the bulge its grain; this gives it a smooth photographic core.
uniform float uSize;

varying vec2 vPlace;

void main() {
  vPlace = position.xy * uSize;
  vec4 centre = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float scale = length(modelMatrix[0].xyz);
  gl_Position = projectionMatrix * (centre + vec4(position.xy * uSize * scale, 0.0, 0.0));
  gl_Position.z = gl_Position.w;
}
