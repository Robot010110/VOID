// Rocks lit by their star, with a little wrap so the terminator is soft, and the faint
// starlight ambient that keeps the night side of every body from pure black.
uniform vec3 uLight;
uniform vec3 uAlbedo;
uniform float uFade;

varying vec3 vNormal;
varying vec3 vToStar;
varying float vShade;
varying float vDim;

const float PI = 3.14159265;

void main() {
  vec3 n = normalize(vNormal);
  vec3 l = normalize(vToStar);
  float lambert = max(dot(n, l) * 0.85 + 0.15, 0.0);
  vec3 colour = uAlbedo * vShade * (uLight * lambert / PI + 0.003) * vDim;
  gl_FragColor = vec4(colour, 1.0) * uFade;
}
