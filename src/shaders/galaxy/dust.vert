// The galaxy's dust: narrow dark lanes on the inner edges of the arms (upstream of the crest,
// where gas is squeezed before it forms stars), which turn with the arms, and a thin haze over
// the disc. Drawn with normal blending over the light beyond the galaxy's plane and inside
// its dust layer, under the light in front, so the lanes have depth. Unlike the light, dust
// never shrinks into points: close up it thins out and is gone.
#include "./orbit.glsl"

attribute vec4 aOrbit;
// Size, opacity, unused, turns with the arms.
attribute vec4 aShape;

uniform float uFade;
uniform float uPixelsPerUnit;
uniform float uMinSigma;
uniform float uMaxSigma;
uniform float uMaxPointSize;
uniform float uNear;
uniform float uSizeScale;
uniform float uDustScale;

varying float vAlpha;
varying float vSigma;
varying float vHalf;

void main() {
  float phase;
  float presence;
  vec3 local = galacticPosition(aOrbit, aShape.w, phase, presence);
  vec4 view = modelViewMatrix * vec4(local, 1.0);
  gl_Position = projectionMatrix * view;
  gl_Position.z = gl_Position.w;

  float scale = length(modelMatrix[0].xyz);
  float distance = max(-view.z, 1e-5);
  float sigmaFar = aShape.x * uSizeScale * scale * uPixelsPerUnit / distance;
  float sigma = max(sigmaFar, uMinSigma);
  // Too small to resolve: its shadow spreads over the minimum size. Too close: it thins away.
  float thin = (sigmaFar * sigmaFar) / (sigma * sigma) * (1.0 - smoothstep(uMaxSigma, uMaxSigma * 2.0, sigmaFar));
  float near = smoothstep(uNear * 2.0, uNear * 6.0, distance / scale);
  vAlpha = clamp(aShape.y * uDustScale * thin * near * uFade, 0.0, 1.0);
  sigma = min(sigma, uMaxSigma * 2.0);
  vSigma = sigma;
  vHalf = sigma * 2.1 + 0.5;
  gl_PointSize = vAlpha > 2e-3 && view.z < 0.0 ? min(vHalf * 2.0, uMaxPointSize) : 0.0;
}
