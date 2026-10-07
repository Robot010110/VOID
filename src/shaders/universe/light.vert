// The galaxies' light, seen from the universe: galaxy/light.vert for every galaxy at once.
// A galaxy's dust has a near and a far side, so the soft light is drawn in two passes around
// the dust: the light beyond each galaxy's dust layer (as seen from the camera), then the
// dust, then the light in front. The sparkle, which never meets the dust, draws in one.
#include "./galaxy.glsl"

attribute vec4 aOrbit;
// Size, light, how sharply the arms gate it, turns with the arms.
attribute vec4 aShape;
attribute vec4 aColour;
attribute float aGalaxy;

uniform float uFade;
uniform float uExposure;
uniform float uPixelsPerUnit;
uniform float uMinSigma;
uniform float uMaxSigma;
uniform float uMaxPointSize;
uniform float uPeakMax;
uniform float uYoungShift;
// 1 for point stars, which brighten close up; 0 for the soft glow, which thins away.
uniform float uResolve;
// The camera in the universe's frame.
uniform vec3 uCamera;
// Which light this pass draws: 0 beyond each galaxy's dust, 1 in front of it, -1 all of it.
uniform float uSide;

varying vec3 vColour;
varying float vPeak;
varying float vSigma;
varying float vHalf;

void main() {
  loadGalaxy(aGalaxy);
  float phase;
  float presence;
  vec3 local = galacticPosition(aOrbit, aShape.w, phase, presence);

  if (uSide > -0.5) {
    vec3 axis = turnVector(gTurn, vec3(0.0, 1.0, 0.0));
    float camera = dot(uCamera - gCentre, axis);
    float front = step(gLayer, abs(local.y)) * step(0.0, local.y * camera);
    if (abs(front - uSide) > 0.5) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      return;
    }
  }

  vec3 place = gCentre + turnVector(gTurn, local * gScale);
  vec4 view = modelViewMatrix * vec4(place, 1.0);
  gl_Position = projectionMatrix * view;
  gl_Position.z = gl_Position.w;

  float scale = length(modelMatrix[0].xyz) * gScale;
  float distance = max(-view.z, 1e-5);
  float size = aShape.x;
  float sigmaFar = size * scale * uPixelsPerUnit / distance;
  float sigma = max(sigmaFar, uMinSigma);
  float thin = 1.0;
  if (uResolve > 0.5) {
    sigma = min(sigma, uMaxSigma);
  } else {
    thin = 1.0 - smoothstep(uMaxSigma, uMaxSigma * 1.5, sigmaFar);
    sigma = min(sigma, uMaxSigma * 1.5);
  }

  float gate = aShape.z > 0.0 ? mix(0.15, pow(crest(phase, uYoungShift), aShape.z), presence) : 1.0;
  float peak = uExposure * aShape.y / (size * size) * (sigmaFar * sigmaFar) / (sigma * sigma);
  peak = min(peak * gate, uPeakMax) * thin * uFade;

  vColour = aColour.rgb;
  vPeak = peak;
  vSigma = sigma;
  vHalf = sigma * 2.0 + 0.5;
  gl_PointSize = peak > 2e-4 && view.z < 0.0 ? min(vHalf * 2.0, uMaxPointSize) : 0.0;
}
