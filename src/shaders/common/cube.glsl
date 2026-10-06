// Direction through texel coordinate st (in [0, 1]) of a cube map face, following the
// OpenGL cube map conventions, so a value baked for this direction is exactly what
// texture(samplerCube, direction) returns later. Faces: +X, -X, +Y, -Y, +Z, -Z.

vec3 cubeDirection(int face, vec2 st) {
  vec2 uv = st * 2.0 - 1.0;
  vec3 d;
  if (face == 0) d = vec3(1.0, -uv.y, -uv.x);
  else if (face == 1) d = vec3(-1.0, -uv.y, uv.x);
  else if (face == 2) d = vec3(uv.x, 1.0, uv.y);
  else if (face == 3) d = vec3(uv.x, -1.0, -uv.y);
  else if (face == 4) d = vec3(uv.x, -uv.y, 1.0);
  else d = vec3(-uv.x, -uv.y, -1.0);
  return normalize(d);
}

// Two unit tangents perpendicular to a direction on the sphere.
void sphereTangents(vec3 n, out vec3 t, out vec3 b) {
  vec3 helper = abs(n.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  t = normalize(cross(helper, n));
  b = cross(n, t);
}
