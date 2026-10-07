// An unfinished arc of light collectors circling a star, moved entirely here: each on its own
// circular orbit (Kepler's third law, as the planets), all in a band about one tilted plane.
// Panels face their star, so from outside they are dark against it, with a faint ember glow of
// spent heat that hums along the arc; now and then one turns and catches the light.
// With SKY, drawn as seen from one of the star's worlds: a direction pinned at infinity.

// Orbit radius (system units), inclination, node and phase at time zero (radians).
attribute vec4 aOrbit;
// Seconds per orbit at 1x, place along the arc (0 to 1), and two random numbers.
attribute vec4 aMotion;

uniform float uTime;
uniform float uClock;
uniform float uSize;
#ifdef SKY
// The world the arc is seen from, in the system's frame.
uniform vec3 uFrom;
#endif

varying float vGlow;
varying float vGlint;

void main() {
  float angle = aOrbit.w + uTime / aMotion.x * 6.2831853;
  vec3 p = vec3(cos(angle), 0.0, -sin(angle)) * aOrbit.x;
  p = vec3(p.x, -p.z * sin(aOrbit.y), p.z * cos(aOrbit.y));
  float cn = cos(aOrbit.z);
  float sn = sin(aOrbit.z);
  p = vec3(p.x * cn + p.z * sn, p.y, -p.x * sn + p.z * cn);

#ifdef SKY
  vec3 direction = normalize(p - uFrom);
  vec4 clip = projectionMatrix * vec4(mat3(viewMatrix) * direction, 1.0);
  // Pinned to the far plane, behind everything the world itself draws.
  gl_Position = clip.xyww;
#else
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
#endif

  // The hum: slow waves of warmth running along the arc.
  vGlow = 0.55 + 0.45 * sin(aMotion.y * 40.0 - uClock * 0.6);
  // A rare glint: one panel in twenty turns towards the light for a moment every few minutes.
  float cycle = fract(uClock / (120.0 + 400.0 * aMotion.w) + aMotion.w * 7.0);
  vGlint = step(aMotion.z, 0.05) * smoothstep(0.0, 0.002, cycle) * (1.0 - smoothstep(0.002, 0.006, cycle));
  gl_PointSize = uSize * (1.0 + vGlint * 1.5);
}
