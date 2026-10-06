// 3D cellular (Worley) noise. Requires hash.glsl.

// Distances to the nearest and second-nearest feature points: (F1, F2).
vec2 cellular(vec3 p) {
  vec3 cell = floor(p);
  vec3 local = fract(p);
  float f1 = 8.0;
  float f2 = 8.0;
  for (int z = -1; z <= 1; z++) {
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec3 offset = vec3(float(x), float(y), float(z));
        vec3 r = offset + hash33(cell + offset) - local;
        float d = dot(r, r);
        if (d < f1) {
          f2 = f1;
          f1 = d;
        } else if (d < f2) {
          f2 = d;
        }
      }
    }
  }
  return sqrt(vec2(f1, f2));
}

// Nearest feature point: distance, plus a random value per cell (for sizes, colours, ages).
vec2 cellularId(vec3 p) {
  vec3 cell = floor(p);
  vec3 local = fract(p);
  float best = 8.0;
  float id = 0.0;
  for (int z = -1; z <= 1; z++) {
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec3 offset = vec3(float(x), float(y), float(z));
        vec3 r = offset + hash33(cell + offset) - local;
        float d = dot(r, r);
        if (d < best) {
          best = d;
          id = hash13(cell + offset + 17.0);
        }
      }
    }
  }
  return vec2(sqrt(best), id);
}
