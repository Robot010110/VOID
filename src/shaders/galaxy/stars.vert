// The stars that can be visited: points a little larger and steadier than the galaxy's other
// light, each the colour of its own sun. From afar their light holds steady, so they read at
// every distance; close in it grows as a real star's would, and once the camera can resolve
// the star's disc it becomes a small sun, matched to the system's own star at the swap.
#include "./orbit.glsl"

attribute vec4 aOrbit;
// Index, light, the star's radius in system units, notable.
attribute vec4 aStar;
attribute vec3 aColour;

uniform float uFade;
uniform float uPixelsPerUnit;
uniform float uPixelRatio;
uniform float uMaxPointSize;
uniform float uSystemScale;
uniform float uStarLight;
// Galaxy units: nearer than this, a star's light grows as the inverse square.
uniform float uReach;
uniform float uHover;
uniform float uPeakMax;

varying vec3 vColour;
// x: point light peak, y: halo peak, z: disc radius (px), w: sprite half-size (px)
varying vec4 vLight;
// x: core sigma, y: halo sigma (px)
varying vec2 vSpread;

const float VISIBLE = 0.003;

void main() {
  float phase;
  float presence;
  vec3 local = galacticPosition(aOrbit, 0.0, phase, presence);
  vec4 view = modelViewMatrix * vec4(local, 1.0);
  gl_Position = projectionMatrix * view;
  gl_Position.z = gl_Position.w;

  float scale = length(modelMatrix[0].xyz);
  float distance = max(-view.z, 1e-6);
  float near = uReach / (distance / scale);
  float hovered = 1.0 - step(0.5, abs(aStar.x - uHover));
  float light = uStarLight * aStar.y * max(1.0, near * near) * (1.0 + 0.9 * hovered);

  // The star's own disc, in pixels: the point of light hands over to it as it resolves.
  float disc = aStar.z * uSystemScale * scale * uPixelsPerUnit / distance;
  float point = 1.0 - smoothstep(0.7, 2.2, disc);

  float coreSigma = 0.85 * uPixelRatio;
  float haloSigma = 3.0 * uPixelRatio;
  float peak = min(light, uPeakMax) * point * uFade;
  float halo = min(light * 0.05, uPeakMax * 0.1) * uFade;
  float reach = max(
    coreSigma * sqrt(2.0 * log(max(peak / VISIBLE, 1.0))),
    haloSigma * sqrt(2.0 * log(max(halo / VISIBLE, 1.0)))
  );
  reach = max(reach, disc * 5.0 * step(0.7, disc));

  vColour = aColour;
  vLight = vec4(peak, halo, disc, reach + 1.0);
  vSpread = vec2(coreSigma, haloSigma);
  gl_PointSize = uFade > 0.0 && view.z < 0.0 ? min(2.0 * reach + 2.0, uMaxPointSize) : 0.0;
}
