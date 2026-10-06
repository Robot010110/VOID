// Intersection of a ray with a sphere centred at the origin.
// Returns the near and far distances along the ray, or (-1, -1) when it misses.

vec2 raySphere(vec3 origin, vec3 direction, float radius) {
  float b = dot(origin, direction);
  float c = dot(origin, origin) - radius * radius;
  float disc = b * b - c;
  if (disc < 0.0) return vec2(-1.0);
  float s = sqrt(disc);
  return vec2(-b - s, -b + s);
}
