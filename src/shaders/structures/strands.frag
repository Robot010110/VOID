// A strand's surface: a round tube of dull metal lit by the sun (in the world's shadow it goes
// dark, and reddens on the way there), and for the transcended a faint light from within, with
// slow pulses travelling along it. Output is premultiplied: the metal covers what lies behind.
#include "../atmosphere/transmittance.glsl"

uniform vec3 uSunObj;
uniform vec3 uSunIrradiance;
uniform vec3 uAlbedo;
uniform vec3 uGlowColor;
// How much a strand hides what lies behind it: 1 for metal, less for a lattice of light.
uniform float uSolid;
// 0 for a steady glow (a ring's lit windows), 1 for slow pulses travelling along (a lattice).
uniform float uPulse;
uniform float uTime;
uniform float uFade;

varying vec3 vPos;
varying vec3 vSide;
varying vec3 vFacing;
varying float vAcross;
varying float vCover;
varying float vHalf;
varying vec2 vGlow;

#include "sunlight.glsl"

const float PI = 3.14159265;

void main() {
  float a = abs(vAcross);
  // Soft edges about a pixel wide.
  float cover = vCover * clamp((1.0 - a) * vHalf * 1.2, 0.0, 1.0);
  if (cover < 0.002) discard;

  vec3 normal = normalize(vSide * vAcross + vFacing * sqrt(max(0.0, 1.0 - vAcross * vAcross)));
  vec3 light = uSunIrradiance * sunlightAt(vPos);
  float diffuse = max(dot(normal, uSunObj), 0.0);
  vec3 halfway = normalize(uSunObj + vFacing);
  float sheen = pow(max(dot(normal, halfway), 0.0), 36.0) * 0.18;
  vec3 colour = light * (uAlbedo * diffuse / PI + sheen);

  if (vGlow.x > 0.0) {
    float pulse = exp(-pow((fract(vGlow.y - uTime * 0.021) - 0.5) * 16.0, 2.0));
    colour += uGlowColor * vGlow.x * mix(1.0, 0.35 + 1.5 * pulse, uPulse);
  }
  gl_FragColor = vec4(colour * cover, cover * uSolid) * uFade;
}
