// The galaxy's soft light, drawn at half resolution, laid over the scene: its dust's coverage
// (alpha) dims what lies behind the galaxy, and its light adds on top.
uniform sampler2D uLight;
uniform vec2 uResolution;

void main() {
  gl_FragColor = texture2D(uLight, gl_FragCoord.xy / uResolution);
}
