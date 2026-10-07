// Every galaxy of the universe in one draw: each particle reads its own galaxy's shape, motion
// and place from a row of a data texture (see Cosmos.tsx), then moves exactly as it does when
// that galaxy is drawn on its own, so the two always agree.

uniform float uTime;
uniform highp sampler2D uGalaxies;

// The galaxy's shape and motion, as galaxy/motion.glsl expects them.
vec4 uArms;
vec3 uArmShape;
vec3 uBend1;
vec3 uBend2;
vec3 uBar;
vec3 uMotion;
// Where the galaxy sits in the universe, universe units per galaxy unit, and its turn.
vec3 gCentre;
float gScale;
vec4 gTurn;
// Half-thickness of its dust layer, galaxy units.
float gLayer;

void loadGalaxy(float index) {
  int row = int(index + 0.5);
  vec4 t0 = texelFetch(uGalaxies, ivec2(0, row), 0);
  vec4 t1 = texelFetch(uGalaxies, ivec2(1, row), 0);
  vec4 t2 = texelFetch(uGalaxies, ivec2(2, row), 0);
  vec4 t3 = texelFetch(uGalaxies, ivec2(3, row), 0);
  vec4 t4 = texelFetch(uGalaxies, ivec2(4, row), 0);
  vec4 t5 = texelFetch(uGalaxies, ivec2(5, row), 0);
  uArms = t0;
  uArmShape = t1.xyz;
  gLayer = t1.w;
  uBend1 = t2.xyz;
  uBend2 = vec3(t2.w, t3.xy);
  uBar = vec3(t3.zw, t4.x);
  uMotion = t4.yzw;
  gCentre = t5.xyz;
  gScale = t5.w;
  gTurn = texelFetch(uGalaxies, ivec2(6, row), 0);
}

// Turn a vector by a unit quaternion.
vec3 turnVector(vec4 q, vec3 v) {
  vec3 t = 2.0 * cross(q.xyz, v);
  return v + q.w * t + cross(q.xyz, t);
}

#include "../galaxy/motion.glsl"
