// The galaxy's motion, mirrored exactly from src/core/galaxy.ts: lobed orbits whose lobes turn
// with radius, so neighbouring orbits crowd into logarithmic spiral arms (density waves). It
// reads the galaxy's shape from uArms, uArmShape, uBend1, uBend2, uBar and uMotion, and the
// time from uTime: uniforms for one galaxy (orbit.glsl), or values read per particle when the
// universe draws them all at once (universe/galaxy.glsl).

float orbitalSpeed(float a) {
  return uMotion.x * (1.0 - exp(-a / uMotion.y)) / max(a, 1e-3);
}

float armStrength(float a) {
  return uArmShape.x * smoothstep(uArms.w * 0.75, uArms.w * 1.25, a) *
    (1.0 - smoothstep(uArmShape.z * 0.9, uArmShape.z * 1.15, a));
}

float barStrength(float a) {
  return uBar.x > 0.0 ? uBar.z * (1.0 - smoothstep(uBar.x * 0.75, uBar.x * 1.1, a)) : 0.0;
}

float armAngle(float a) {
  float l = log(max(a, 1e-3) / uArms.w);
  float bend = uBend1.x * (sin(l * uBend1.y + uBend1.z) - sin(uBend1.z)) +
    uBend2.x * (sin(l * uBend2.y + uBend2.z) - sin(uBend2.z));
  return uArms.z - l * uArms.y + bend;
}

// Where a particle on `orbit` (mean radius, angle at time zero, height, radial scatter) is
// now. `turnsWithArms` is 1 for what rides the arms (knots, dust lanes). Also returns where
// the particle is against the arms, measured from the crest at its actual radius (0 on a
// crest, one arm to the next is 2 pi, positive downstream), and how present the arms are
// there (0 in the bulge, 1 in the disc).
vec3 galacticPosition(vec4 orbit, float turnsWithArms, out float armPhase, out float armPresence) {
  float a = orbit.x;
  float turned = uMotion.z * uTime;
  float phi = orbit.y + mix(orbitalSpeed(a), uMotion.z, turnsWithArms) * uTime;
  float lobe = uArms.x * (phi - armAngle(a) - turned) + uArmShape.y;
  float r = a * (1.0 + armStrength(a) * cos(lobe) + barStrength(a) * cos(2.0 * (phi - uBar.y - turned))) + orbit.w;
  armPhase = uArms.x * (phi - armAngle(r) - turned);
  armPresence = armStrength(r) / max(uArmShape.x, 1e-6);
  return vec3(r * cos(phi), orbit.z, -r * sin(phi));
}

// Nearness to an arm's crest, shifted along the flow (positive is downstream), 0 to 1.
float crest(float armPhase, float shift) {
  return 0.5 + 0.5 * cos(armPhase - shift);
}
