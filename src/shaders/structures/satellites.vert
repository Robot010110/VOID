// Satellites in low orbit, moved entirely here from their orbital elements: a speck of sunlit
// metal, dark in the world's shadow, reddening as it slips into it, and now and then flashing
// as a panel turns the sun towards the camera.
#include "../atmosphere/transmittance.glsl"

// Orbit radius (planet radii), inclination, node and phase (radians).
attribute vec4 aOrbit;
// Seconds per orbit at 1x, brightness, and the turn of its panel.
attribute vec3 aMotion;

uniform vec3 uSunObj;
uniform vec3 uCamObj;
uniform vec3 uSunIrradiance;
uniform float uTime;
uniform float uSize;

varying vec3 vColour;

#include "sunlight.glsl"

void main() {
  float angle = aOrbit.w + uTime / aMotion.x * 6.2831853;
  // The same orbit as orbitPoint() in core/universe.ts: anticlockwise from above, tilted
  // about x by the inclination, then turned about y to its node.
  vec3 p = vec3(cos(angle), 0.0, -sin(angle)) * aOrbit.x;
  p = vec3(p.x, -p.z * sin(aOrbit.y), p.z * cos(aOrbit.y));
  float cn = cos(aOrbit.z);
  float sn = sin(aOrbit.z);
  p = vec3(p.x * cn + p.z * sn, p.y, -p.x * sn + p.z * cn);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);

  vec3 toCamera = normalize(uCamObj - p);
  float spin = angle * 2.0 + aMotion.z * 6.2831853;
  vec3 panel = normalize(vec3(cos(spin), 0.35 * sin(aMotion.z * 17.0), sin(spin)));
  float glint = pow(max(dot(reflect(-uSunObj, panel), toCamera), 0.0), 260.0);
  float phase = 0.5 + 0.5 * dot(uSunObj, toCamera);
  vColour = uSunIrradiance * sunlightAt(p) * aMotion.y * (0.05 + 0.12 * phase + 5.0 * glint);
  gl_PointSize = uSize;
}
