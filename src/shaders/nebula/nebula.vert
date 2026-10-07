// One layer of a nebula: a camera-facing card somewhere inside the cloud. A nebula is several
// such layers at different depths, sizes and turns, each sampling a different stretch of the
// noise, so from any side it is a cloud and never a flat card. Nebulae ride their arm.
#include "../galaxy/orbit.glsl"

// The nebula's orbit: mean radius, angle at time zero, height, and its size (galaxy units).
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

uniform float uFade;

varying vec2 vPlace;
varying vec2 vUv;
varying vec4 vChannel;
varying vec3 vColourA;
varying vec3 vColourB;
varying vec4 vLook;
varying float vFade;

void main() {
  float phase;
  float presence;
  vec3 centre = galacticPosition(vec4(aNebula.x, aNebula.y, aNebula.z, 0.0), 1.0, phase, presence);
  centre += aPlace.xyz * aNebula.w;
  float size = aNebula.w * aPlace.w;

  vec4 view = modelViewMatrix * vec4(centre, 1.0);
  float scale = length(modelMatrix[0].xyz);
  view.xy += position.xy * size * scale;
  gl_Position = projectionMatrix * view;

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
  vFade = smoothstep(size * 0.4, size * 1.6, distance) * uFade * step(0.0, -view.z);
}
