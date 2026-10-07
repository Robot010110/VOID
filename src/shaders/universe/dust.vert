// The galaxies' dust, seen from the universe: galaxy/dust.vert for every galaxy at once, drawn
// between the light beyond each galaxy's dust layer and the light in front of it.
#include "./galaxy.glsl"

attribute vec4 aOrbit;
// Size, opacity, unused, turns with the arms.
attribute vec4 aShape;
attribute float aGalaxy;

uniform float uFade;
uniform float uPixelsPerUnit;
uniform float uMinSigma;
uniform float uMaxSigma;
uniform float uMaxPointSize;
uniform float uDustScale;

varying float vAlpha;
varying float vSigma;
varying float vHalf;

void main() {
  loadGalaxy(aGalaxy);
  float phase;
  float presence;
  vec3 local = galacticPosition(aOrbit, aShape.w, phase, presence);
  vec3 place = gCentre + turnVector(gTurn, local * gScale);
  vec4 view = modelViewMatrix * vec4(place, 1.0);
  gl_Position = projectionMatrix * view;
  gl_Position.z = gl_Position.w;

  float scale = length(modelMatrix[0].xyz) * gScale;
  float distance = max(-view.z, 1e-5);
  float sigmaFar = aShape.x * scale * uPixelsPerUnit / distance;
  float sigma = max(sigmaFar, uMinSigma);
  float thin = (sigmaFar * sigmaFar) / (sigma * sigma) * (1.0 - smoothstep(uMaxSigma, uMaxSigma * 2.0, sigmaFar));
  vAlpha = clamp(aShape.y * uDustScale * thin * uFade, 0.0, 1.0);
  sigma = min(sigma, uMaxSigma * 2.0);
  vSigma = sigma;
  vHalf = sigma * 2.1 + 0.5;
  gl_PointSize = vAlpha > 2e-3 && view.z < 0.0 ? min(vHalf * 2.0, uMaxPointSize) : 0.0;
}
