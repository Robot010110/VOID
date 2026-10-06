// A star seen from far away: a camera-facing quad pinned to a direction at infinity.
// Its size is in pixels, so it reads the same at any distance and field of view.
uniform vec3 uDirection;
uniform float uSize;
uniform vec2 uViewport;

varying vec2 vCorner;

void main() {
  vec3 view = mat3(viewMatrix) * uDirection;
  vec4 clip = projectionMatrix * vec4(view, 1.0);
  vCorner = position.xy;
  if (clip.w <= 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  vec2 ndc = clip.xy / clip.w + position.xy * uSize / uViewport * 2.0;
  gl_Position = vec4(ndc, 1.0, 1.0);
}
