// Gravity touch: a well where the visitor holds the pointer down on empty space. Everything
// drawn with this bends towards it, the more the nearer, never past its centre, and is swept a
// little round it, as stars round a mass. Strength 0 leaves everything where it was.

// Where the well is, in this object's frame, and how strong it is (0 to 1).
uniform vec4 uWell;
// The axis things turn about (unit, this object's frame), and how far the well reaches.
uniform vec4 uWellAxis;

vec3 wellBend(vec3 p) {
  if (uWell.w <= 0.0) return p;
  vec3 d = uWell.xyz - p;
  float reach2 = uWellAxis.w * uWellAxis.w;
  float pull = uWell.w * reach2 / (reach2 + dot(d, d) * 2.5);
  vec3 r = (p + d * pull * 0.82) - uWell.xyz;
  float angle = pull * 1.4;
  vec3 k = uWellAxis.xyz;
  float c = cos(angle);
  r = r * c + cross(k, r) * sin(angle) + k * dot(k, r) * (1.0 - c);
  return uWell.xyz + r;
}
