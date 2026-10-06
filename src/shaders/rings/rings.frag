// Planetary rings: radial bands and gaps from a baked density profile. Ice and dust scatter
// light forwards, so the rings brighten when the sun is behind them; seen from their unlit
// face they glow only where light leaks through. The planet's shadow falls across them.
uniform sampler2D uRingMap;
uniform vec3 uSunObj;
uniform vec3 uCamObj;
uniform vec3 uSunIrradiance;
uniform float uInner;
uniform float uOuter;
uniform float uOpacity;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uForward;
uniform float uSunSize;
uniform float uFade;

varying vec3 vPos;

const float PI = 3.14159265;

// Soft shadow of the unit-radius planet, seen from a point on the rings.
float planetShadow(vec3 p, vec3 light) {
  float along = dot(-p, light);
  if (along < 0.0) return 1.0;
  float closest = length(p + light * along);
  // Penumbra widens with distance, from the size of the sun's disc.
  float penumbra = max(along * uSunSize, 0.01);
  return smoothstep(1.0 - penumbra, 1.0 + penumbra, closest);
}

void main() {
  float r = length(vPos.xz);
  float x = (r - uInner) / (uOuter - uInner);
  if (x < 0.0 || x > 1.0) discard;
  vec4 profile = texture(uRingMap, vec2(x, 0.5));
  float density = profile.r;
  float alpha = density * uOpacity;
  if (alpha < 0.002) discard;

  vec3 view = normalize(uCamObj - vPos);
  float sunElevation = abs(uSunObj.y);
  bool litFace = (uSunObj.y > 0.0) == (view.y > 0.0);

  // Lit face: diffuse, stronger the higher the sun stands over the ring plane.
  // Unlit face: only light that filters through thin parts of the ring.
  float diffuse = litFace ? (0.25 + 0.75 * sunElevation) : (1.0 - density) * 0.55 * sunElevation + 0.03;
  float phase = max(dot(-view, uSunObj), 0.0);
  float forward = pow(phase, 10.0) * uForward;

  vec3 colour = mix(uColorA, uColorB, profile.g);
  vec3 light = uSunIrradiance * colour * (diffuse / PI + forward) * planetShadow(vPos, uSunObj);
  gl_FragColor = vec4(light * alpha, alpha) * uFade;
}
