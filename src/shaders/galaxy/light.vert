// The galaxy's light: every particle is a soft gaussian of light whose size is real (galaxy
// units). Its surface brightness is the same from any distance, as a real galaxy's is. When
// it would be smaller than a pixel it is drawn at that size and dimmed (its light conserved);
// when it would be larger than a few pixels it is drawn at that size and brightened, so the
// galaxy resolves into points of light as the camera falls into it. Particles very close to
// the camera fade away: around a system, the galaxy's light is its sky, drawn by the stars.
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

varying vec3 vColour;
varying float vPeak;
varying float vSigma;
varying float vHalf;

void main() {
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
  float sigma = clamp(sigmaFar, uMinSigma, uMaxSigma);

  float gate = aShape.z > 0.0 ? mix(1.0, pow(crest(phase, uYoungShift), aShape.z), presence) : 1.0;
  float near = smoothstep(uNear, uNear * 3.0, distance / scale);
  float peak = uExposure * aShape.y * uLightScale / (size * size) * (sigmaFar * sigmaFar) / (sigma * sigma);
  peak = min(peak * gate, uPeakMax) * near * uFade;

  vColour = aColour.rgb;
  vPeak = peak;
  vSigma = sigma;
  vHalf = ceil(sigma * 2.6) + 0.5;
  gl_PointSize = peak > 2e-4 && view.z < 0.0 ? min(vHalf * 2.0, uMaxPointSize) : 0.0;
}
