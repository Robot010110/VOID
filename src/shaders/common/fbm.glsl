// Fractal sums of simplex noise. Requires noise.glsl.

// Fractional Brownian motion, normalised to roughly [-1, 1].
float fbm(vec3 p, int octaves) {
  float sum = 0.0;
  float amplitude = 0.5;
  float total = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    sum += amplitude * snoise(p);
    total += amplitude;
    // Offset each octave so their lattices never line up.
    p = p * 2.03 + vec3(17.1, -9.3, 4.7);
    amplitude *= 0.5;
  }
  return sum / total;
}

// Ridged multifractal: sharp creases where the noise crosses zero, in [0, 1].
float ridged(vec3 p, int octaves) {
  float sum = 0.0;
  float amplitude = 0.5;
  float total = 0.0;
  float weight = 1.0;
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    float n = 1.0 - abs(snoise(p));
    n *= n;
    n *= weight;
    weight = clamp(n * 2.0, 0.0, 1.0);
    sum += amplitude * n;
    total += amplitude;
    p = p * 2.07 + vec3(-5.3, 13.9, 2.2);
    amplitude *= 0.5;
  }
  return sum / total;
}
