// Premultiplied: the colour is the faint light the dust itself scatters.
uniform vec3 uColour;

varying float vAlpha;
varying float vSigma;
varying float vHalf;

void main() {
  vec2 p = (gl_PointCoord - 0.5) * 2.0 * vHalf;
  float r2 = dot(p, p);
  float alpha = vAlpha * exp(-r2 / (2.0 * vSigma * vSigma));
  alpha *= 1.0 - smoothstep(vHalf * 0.75, vHalf, sqrt(r2));
  gl_FragColor = vec4(uColour * alpha, alpha);
}
