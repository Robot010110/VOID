// The deep field: thousands of faint, distant galaxies, each a tiny soft ellipse. Those along
// the web have places; the rest are so far away they lie at infinity, like the stars. Their
// surface brightness holds at any distance; too small to resolve, they dim instead of shrink.
attribute vec4 aPlace;
// Size (universe units, or radians at infinity), light, axis ratio, turn on screen.
attribute vec4 aLook;
attribute vec4 aColour;

uniform float uFade;
uniform float uExposure;
// Device pixels per unit of size at unit distance (and so per radian).
uniform float uPixelsPerUnit;
uniform float uMinSigma;
uniform float uMaxPointSize;

varying vec3 vColour;
varying float vPeak;
varying float vSigma;
varying float vHalf;
varying vec2 vTurn;
varying float vRatio;

void main() {
  float sigmaFar;
  bool behind;
  if (aPlace.w > 0.5) {
    vec4 view = modelViewMatrix * vec4(aPlace.xyz, 1.0);
    gl_Position = projectionMatrix * view;
    float scale = length(modelMatrix[0].xyz);
    sigmaFar = aLook.x * scale * uPixelsPerUnit / max(-view.z, 1e-5);
    behind = view.z > 0.0;
  } else {
    vec3 direction = normalize(mat3(modelViewMatrix) * aPlace.xyz);
    gl_Position = projectionMatrix * vec4(direction, 0.0);
    sigmaFar = aLook.x * uPixelsPerUnit;
    behind = direction.z > 0.0;
  }
  // Behind everything that writes depth.
  gl_Position.z = gl_Position.w * 0.99999;

  float sigma = max(sigmaFar, uMinSigma);
  // A galaxy of the web the camera nears would need detail it does not have: it fades instead.
  float near = 1.0 - smoothstep(uMinSigma * 2.5, uMinSigma * 5.0, sigmaFar);
  sigma = min(sigma, uMinSigma * 5.0);
  float peak = uExposure * aLook.y * (sigmaFar * sigmaFar) / (sigma * sigma) * near * uFade;
  vColour = aColour.rgb;
  vPeak = peak;
  vSigma = sigma;
  vHalf = sigma * 2.4 + 0.5;
  vTurn = vec2(cos(aLook.w), sin(aLook.w));
  vRatio = aLook.z;
  gl_PointSize = peak > 1e-4 && !behind ? min(vHalf * 2.0, uMaxPointSize) : 0.0;
}
