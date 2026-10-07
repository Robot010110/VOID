// One layer of a nebula of the universe: nebula/nebula.vert for clouds that stay where they
// are, in the voids between the galaxies. Each is many layers at different depths, sizes and
// turns, so from any side it is a cloud and never a flat card.

// The nebula's centre and size (universe units).
attribute vec4 aNebula;
// Place within the nebula (in nebula sizes), and this layer's size as a share of it.
attribute vec4 aPlace;
// Where on the atlas: centre (x, y), spread, and how fast the layer turns (radians a second).
attribute vec4 aWindow;
// Which noise (one-hot over the atlas channels).
attribute vec4 aChannel;
attribute vec3 aColourA;
attribute vec3 aColourB;
// Glow, dust, how sharply the noise is thresholded, and its shape (0 a cloud, 1 a shell).
attribute vec4 aLook;

uniform float uTime;
uniform float uFade;

varying vec2 vPlace;
varying vec2 vUv;
varying vec4 vChannel;
varying vec3 vColourA;
varying vec3 vColourB;
varying vec4 vLook;
varying float vFade;

void main() {
  vec3 centre = aNebula.xyz + aPlace.xyz * aNebula.w;
  float size = aNebula.w * aPlace.w;

  vec4 view = modelViewMatrix * vec4(centre, 1.0);
  float scale = length(modelMatrix[0].xyz);
  view.xy += position.xy * size * scale;
  gl_Position = projectionMatrix * view;
  gl_Position.z = gl_Position.w;

  float turn = aWindow.w * uTime + aWindow.x * 6.2831853;
  vec2 turned = vec2(cos(turn) * position.x - sin(turn) * position.y, sin(turn) * position.x + cos(turn) * position.y);
  vPlace = position.xy;
  vUv = aWindow.xy + turned * aWindow.z;
  vChannel = aChannel;
  vColourA = aColourA;
  vColourB = aColourB;
  vLook = aLook;
  // A layer the camera is inside, or about to be, thins away.
  float distance = -view.z / scale;
  vFade = smoothstep(size * 0.3, size * 0.9, distance) * uFade * step(0.0, -view.z);
}
