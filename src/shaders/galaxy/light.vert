// The galaxy's light: every particle is a soft gaussian of light whose size is real (galaxy
// units), larger where the galaxy is sparse. Its surface brightness is the same from any
// distance, as a real galaxy's is; when it would be smaller than a pixel it is drawn at that
// size and dimmed (its light conserved). Close up the two kinds part ways: the soft glow
// thins away, while the bright point stars (uResolve) stay points and brighten, so a galaxy
// resolves into stars as the camera falls into it.
#include "./orbit.glsl"

attribute vec4 aOrbit;
// Size, light, how sharply the arms gate it, turns with the arms.
attribute vec4 aShape;
attribute vec4 aColour;

uniform float uFade;
uniform float uExposure;
// Device pixels per unit of size at unit distance: drawing-buffer height / (2 tan(fov / 2)).
uniform float uPixelsPerUnit;
uniform float uMinSigma;
uniform float uMaxSigma;
uniform float uMaxPointSize;
uniform float uPeakMax;
// Where young stars shine, as an arm phase: just downstream of the crest.
uniform float uYoungShift;
// Galaxy units: particles nearer the camera than this have gone.
uniform float uNear;
// A lower tier draws a prefix of the particles, each larger and brighter to make up.
uniform float uSizeScale;
uniform float uLightScale;
// 1 for point stars, which brighten close up; 0 for the soft glow, which thins away.
uniform float uResolve;
// Which particles this draw takes: those below the dust layer (-1), inside it (0), above it
// (1), or all (2). The layer's half-thickness is uLayer.
uniform float uGroup;
uniform float uLayer;

varying vec3 vColour;
varying float vPeak;
varying float vSigma;
varying float vHalf;

void main() {
  float group = aOrbit.z > uLayer ? 1.0 : (aOrbit.z < -uLayer ? -1.0 : 0.0);
  if (uGroup < 1.5 && abs(group - uGroup) > 0.5) {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    return;
  }
  float phase;
  float presence;
  vec3 local = galacticPosition(aOrbit, aShape.w, phase, presence);
  vec4 view = modelViewMatrix * vec4(local, 1.0);
  gl_Position = projectionMatrix * view;
  // Light never hides anything: it sits behind whatever writes depth.
  gl_Position.z = gl_Position.w;

  float scale = length(modelMatrix[0].xyz);
  float distance = max(-view.z, 1e-5);
  float size = aShape.x * uSizeScale;
  float sigmaFar = size * scale * uPixelsPerUnit / distance;
  float sigma = max(sigmaFar, uMinSigma);
  float thin = 1.0;
  if (uResolve > 0.5) {
    sigma = min(sigma, uMaxSigma);
  } else {
    thin = 1.0 - smoothstep(uMaxSigma, uMaxSigma * 2.0, sigmaFar);
    sigma = min(sigma, uMaxSigma * 2.0);
  }

  // Young light lives in the arms; beyond them (the outskirts) only a little of it shines.
  float gate = aShape.z > 0.0 ? mix(0.15, pow(crest(phase, uYoungShift), aShape.z), presence) : 1.0;
  float near = smoothstep(uNear, uNear * 3.0, distance / scale);
  float peak = uExposure * aShape.y * uLightScale / (size * size) * (sigmaFar * sigmaFar) / (sigma * sigma);
  peak = min(peak * gate, uPeakMax) * thin * near * uFade;

  vColour = aColour.rgb;
  vPeak = peak;
  vSigma = sigma;
  vHalf = ceil(sigma * 2.3) + 0.5;
  gl_PointSize = peak > 2e-4 && view.z < 0.0 ? min(vHalf * 2.0, uMaxPointSize) : 0.0;
}
