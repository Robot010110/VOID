varying vec3 vColour;
varying float vPeak;
varying float vSigma;
varying float vHalf;

void main() {
  vec2 p = (gl_PointCoord - 0.5) * 2.0 * vHalf;
  float r2 = dot(p, p);
  float light = vPeak * exp(-r2 / (2.0 * vSigma * vSigma));
  // A soft window, so the sprite's square edge never shows.
  light *= 1.0 - smoothstep(vHalf * 0.75, vHalf, sqrt(r2));
  gl_FragColor = vec4(vColour * light, 1.0);
}
