// Orbits as ribbons of constant width on screen: each vertex is pushed sideways, in pixels,
// across the projected direction of its segment, so the line stays thin and anti-aliased at
// any distance and angle. Brightness is a trail: strongest just behind the world, fading
// around the rest of its path.
uniform vec2 uViewport;
uniform float uHalfWidth;
uniform float uAngles[MAX_ORBITS];
uniform float uStrength[MAX_ORBITS];

attribute vec3 aNext;
attribute float aSide;
attribute float aAngle;
attribute float aOrbit;

varying float vSide;
varying float vStrength;

const float TAU = 6.2831853;

void main() {
  int index = int(aOrbit + 0.5);
  vec4 here = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vec4 next = projectionMatrix * modelViewMatrix * vec4(aNext, 1.0);
  // Segments reaching behind the camera are dropped rather than smeared across the frame.
  if (here.w <= 1e-3 || next.w <= 1e-3) {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    vStrength = 0.0;
    vSide = 0.0;
    return;
  }
  vec2 a = here.xy / here.w * uViewport;
  vec2 b = next.xy / next.w * uViewport;
  vec2 along = b - a;
  float span = length(along);
  vec2 across = span > 1e-5 ? vec2(-along.y, along.x) / span : vec2(0.0, 1.0);
  here.xy += across * aSide * (2.0 * uHalfWidth / uViewport) * here.w;
  gl_Position = here;

  vSide = aSide;
  float behind = mod(uAngles[index] - aAngle, TAU);
  vStrength = (0.2 + 0.8 * exp(-behind * 1.5)) * uStrength[index];
}
