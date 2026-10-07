// One galaxy's shape and motion, as uniforms, for the shaders that draw a single galaxy. Stars
// follow lobed orbits whose lobes turn with radius, so neighbouring orbits crowd into
// logarithmic spiral arms (density waves). Every star moves at its own orbital speed (inner
// stars faster) and passes through the arms, which keep their shape and turn slowly as a whole.

uniform float uTime;
// Arm count, cot(pitch), angle of the first arm where the arms begin, radius where they begin.
uniform vec4 uArms;
// Arm eccentricity, crest phase, disc radius.
uniform vec3 uArmShape;
// Two gentle bends along the arms: amplitude, frequency (per e-fold of radius), phase.
uniform vec3 uBend1;
uniform vec3 uBend2;
// Bar half-length (0 for none), angle, eccentricity.
uniform vec3 uBar;
// Flat orbital speed, radius of the solid core, angular speed of the arms.
uniform vec3 uMotion;

#include "./motion.glsl"
