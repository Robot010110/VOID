varying vec3 vColour;
varying float vPeak;
varying float vSigma;
varying float vHalf;
varying vec2 vTurn;
varying float vRatio;

void main() {
  vec2 p = (gl_PointCoord - 0.5) * 2.0 * vHalf;
  // An ellipse: turned, then squeezed across its axis.
  vec2 q = vec2(dot(p, vTurn), dot(p, vec2(-vTurn.y, vTurn.x)) / max(vRatio, 0.1));
  float light = vPeak * exp(-dot(q, q) / (2.0 * vSigma * vSigma));
  light *= 1.0 - smoothstep(vHalf * 0.75, vHalf, length(p));
  gl_FragColor = vec4(vColour * light, 1.0);
}
