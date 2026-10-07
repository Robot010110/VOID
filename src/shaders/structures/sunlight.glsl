// Sunlight reaching a point above a world of unit radius, in the world's object space: full on
// the sunward side, none in the world's shadow, and reddened where the light grazes its air on
// the way (a ring at dusk turns ember before it goes dark). Requires uSunObj, and with
// ATMOSPHERE the transmittance chunk, whose table already holds the world's soft shadow.
vec3 sunlightAt(vec3 p) {
  float along = dot(p, uSunObj);
  if (along >= 0.0) return vec3(1.0);
  float closest = length(p - uSunObj * along);
#ifdef ATMOSPHERE
  if (closest >= uAtmTop) return vec3(1.0);
  // The ray towards the sun enters the air at the top, heading down at this angle.
  float mu = -sqrt(max(0.0, 1.0 - closest * closest / (uAtmTop * uAtmTop)));
  return sunTransmittance(uAtmTop, mu);
#else
  return vec3(smoothstep(0.99, 1.01, closest));
#endif
}
