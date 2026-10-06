// Point-spread function of one star: gaussian core + faint gaussian halo, plus four thin
// diffraction spikes on the brightest stars. Spikes share one orientation across the sky,
// as they would through a single telescope.

uniform vec2 uSpikeDirection;

varying vec3 vColor;
varying vec4 vShape;
varying vec4 vSize;

void main() {
  float halfSize = vShape.w;
  vec2 p = (gl_PointCoord - 0.5) * 2.0 * halfSize;
  float r2 = dot(p, p);

  float light = vShape.x * exp(-r2 / (2.0 * vSize.x * vSize.x));
  light += vShape.y * exp(-r2 / (2.0 * vSize.y * vSize.y));

  if (vShape.z > 0.0) {
    vec2 q = vec2(
      uSpikeDirection.x * p.x - uSpikeDirection.y * p.y,
      uSpikeDirection.y * p.x + uSpikeDirection.x * p.y
    );
    vec2 a = abs(q);
    float width = 2.0 * vSize.w * vSize.w;
    light += vShape.z * (exp(-q.y * q.y / width - a.x / vSize.z) + exp(-q.x * q.x / width - a.y / vSize.z));
  }

  // Soft window so the sprite's square edge can never show.
  light *= 1.0 - smoothstep(halfSize * 0.8, halfSize, sqrt(r2));
  gl_FragColor = vec4(vColor * light, 1.0);
}
