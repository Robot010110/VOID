// A ghost is an out-of-focus image of the aperture: a soft disc with a slightly brighter
// rim, faintly tinted by the lens coatings. The halo is a thin ring whose edge splits into
// colour. All of it is very faint; bloom softens it further.
uniform vec3 uColor;
uniform float uStrength;

varying vec2 vLocal;
varying float vShape;
varying float vTint;
varying float vStrength;

vec3 coating(float index) {
  if (index < 0.5) return vec3(1.0, 0.9, 0.75);
  if (index < 1.5) return vec3(0.7, 0.86, 1.0);
  if (index < 2.5) return vec3(0.82, 1.0, 0.78);
  return vec3(1.0, 0.78, 0.92);
}

void main() {
  float r = length(vLocal);
  if (r > 1.0) discard;
  vec3 light;
  if (vShape < 0.5) {
    vec3 x = (vec3(r) - vec3(0.87, 0.855, 0.84)) / 0.03;
    light = exp(-x * x) * uColor;
  } else {
    float edge = 1.0 - smoothstep(0.86, 1.0, r);
    float rim = smoothstep(0.5, 0.95, r);
    light = uColor * coating(vTint) * edge * (0.5 + 0.5 * rim);
  }
  gl_FragColor = vec4(light * vStrength * uStrength, 1.0);
}
