// The cosmic web's gas: soft, faint clouds along the filaments and around the clusters, almost
// below notice. Like the galaxies' glow, a cloud's surface brightness is the same from any
// distance; one too small to resolve spreads its light, and one the camera is inside thins away.
attribute vec4 aPlace;
// Light, then linear colour.
attribute vec4 aLook;

uniform float uFade;
uniform float uExposure;
uniform float uPixelsPerUnit;
uniform float uMinSigma;
uniform float uMaxSigma;
uniform float uMaxPointSize;
// A lower tier draws fewer clouds, each larger, so the web keeps its light and its cover.
uniform float uSizeScale;

varying vec3 vColour;
varying float vPeak;
varying float vSigma;
varying float vHalf;

void main() {
  vec4 view = modelViewMatrix * vec4(aPlace.xyz, 1.0);
  gl_Position = projectionMatrix * view;
  gl_Position.z = gl_Position.w;

  float scale = length(modelMatrix[0].xyz);
  float distance = max(-view.z, 1e-5);
  float sigmaFar = aPlace.w * uSizeScale * scale * uPixelsPerUnit / distance;
  float sigma = clamp(sigmaFar, uMinSigma, uMaxSigma);
  float thin = 1.0 - smoothstep(uMaxSigma * 0.6, uMaxSigma, sigmaFar);
  float near = smoothstep(aPlace.w * 1.5, aPlace.w * 4.0, distance / scale);
  float peak = uExposure * aLook.x * (sigmaFar * sigmaFar) / (sigma * sigma) * thin * near * uFade;
  vColour = aLook.yzw;
  vPeak = peak;
  vSigma = sigma;
  vHalf = sigma * 2.0 + 0.5;
  gl_PointSize = peak > 2e-5 && view.z < 0.0 ? min(vHalf * 2.0, uMaxPointSize) : 0.0;
}
