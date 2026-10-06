// Shared by every layer that wraps a planet: the varying is the unit-sphere position in the
// layer's own object space, which is also the cube map lookup direction.
varying vec3 vPos;

void main() {
  vPos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
