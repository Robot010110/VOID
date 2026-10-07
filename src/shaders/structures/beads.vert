// Points of light on a structure: the lamps along a ring and its stations, the nodes of a
// lattice. Each keeps its own slow pulse; a failing grid's lamps go out for spells (in real
// seconds, so they never strobe when time runs fast).
attribute float aSize;
// Brightness, phase, pulse period in seconds (0 for steady), and whether its grid is failing.
attribute vec4 aLight;

uniform float uClock;
uniform float uPixelRatio;

varying float vBright;

void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  float bright = aLight.x;
  if (aLight.z > 0.0) {
    float wave = 0.5 + 0.5 * sin((uClock / aLight.z + aLight.y) * 6.2831853);
    bright *= 0.4 + 0.6 * smoothstep(0.35, 1.0, wave);
  }
  if (aLight.w > 0.0) {
    float cycle = fract(uClock / (9.0 + 14.0 * fract(aLight.y * 7.3)) + aLight.y);
    bright *= smoothstep(0.0, 0.03, cycle) * (1.0 - smoothstep(0.7, 0.74, cycle));
  }
  vBright = bright;
  gl_PointSize = aSize * uPixelRatio;
}
