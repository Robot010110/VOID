uniform vec3 uColor;
uniform float uFade;

varying float vSide;
varying float vStrength;

void main() {
  // A soft profile across the ribbon: about a pixel of core, a pixel of falloff each side.
  float profile = 1.0 - smoothstep(0.3, 1.0, abs(vSide));
  gl_FragColor = vec4(uColor * profile * vStrength * uFade, 1.0);
}
