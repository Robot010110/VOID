// What the eye sees by. After tone mapping, the picture is re-coloured: in infrared by how
// warm each part is (red light reads hot, blue cold), through a heat palette from black
// through crimson and ember to pale gold; in radio by how much energy each part gives off,
// through a cold, nearly colourless palette of deep blue-grey to a pale Tide white. The
// materials have already turned their own light up or down for each (see shared/spectrum.ts);
// this decides the colours.

uniform float uInfrared;
uniform float uRadio;

vec3 heatPalette(float t) {
  vec3 c = mix(vec3(0.0), vec3(0.11, 0.008, 0.022), smoothstep(0.0, 0.18, t));
  c = mix(c, vec3(0.5, 0.06, 0.03), smoothstep(0.12, 0.45, t));
  c = mix(c, vec3(1.0, 0.36, 0.09), smoothstep(0.38, 0.72, t));
  return mix(c, vec3(1.0, 0.84, 0.58), smoothstep(0.66, 1.0, t));
}

vec3 radioPalette(float t) {
  vec3 c = mix(vec3(0.0, 0.002, 0.008), vec3(0.03, 0.075, 0.12), smoothstep(0.0, 0.3, t));
  c = mix(c, vec3(0.22, 0.42, 0.52), smoothstep(0.25, 0.7, t));
  return mix(c, vec3(0.78, 0.95, 0.96), smoothstep(0.62, 1.0, t));
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 colour = inputColor.rgb;
  float warmth = dot(colour, vec3(0.62, 0.3, 0.08));
  float energy = dot(colour, vec3(0.3, 0.45, 0.25));
  vec3 heat = heatPalette(clamp(sqrt(warmth * 1.6), 0.0, 1.0));
  vec3 cold = radioPalette(clamp(sqrt(energy * 1.5), 0.0, 1.0));
  colour = colour * (1.0 - uInfrared - uRadio) + heat * uInfrared + cold * uRadio;
  outputColor = vec4(colour, inputColor.a);
}
