// Ring geometry lies in the planet's equatorial plane (object y = 0).
varying vec3 vPos;

void main() {
  vPos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
