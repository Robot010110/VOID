// An asteroid belt: one instanced rock shape, each instance on its own Kepler orbit (inner
// rocks overtake outer ones), tumbling about its own axis. Everything moves here, so the CPU
// does no work per frame. Like the stars, a rock never shrinks below about a pixel: when it
// would, it is drawn at that size with its light spread over it, so the belt reads as a
// stream of fine dust from afar instead of sparkling.
uniform float uTime;
uniform float uRadius;
uniform float uOmega;
uniform float uPixelsPerUnit;
uniform float uMinPixels;

attribute vec4 aOrbit; // radius, angle at time zero, height, unused
attribute vec4 aShape; // size, stretch y, stretch z, seed
attribute vec4 aSpin; // axis, radians per second

varying vec3 vNormal;
varying vec3 vToStar;
varying float vShade;
varying float vDim;

mat3 rotation(vec3 axis, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  float t = 1.0 - c;
  return mat3(
    t * axis.x * axis.x + c, t * axis.x * axis.y + s * axis.z, t * axis.x * axis.z - s * axis.y,
    t * axis.x * axis.y - s * axis.z, t * axis.y * axis.y + c, t * axis.y * axis.z + s * axis.x,
    t * axis.x * axis.z + s * axis.y, t * axis.y * axis.z - s * axis.x, t * axis.z * axis.z + c
  );
}

void main() {
  float r = aOrbit.x;
  float angle = aOrbit.y + uTime * uOmega * pow(r / uRadius, -1.5);
  vec3 centre = vec3(cos(angle) * r, aOrbit.z, -sin(angle) * r);
  mat3 spin = rotation(aSpin.xyz, aSpin.w * uTime + aShape.w * 6.2831);
  vec3 local = spin * (position * vec3(1.0, aShape.y, aShape.z)) * aShape.x;

  vec4 view = modelViewMatrix * vec4(centre, 1.0);
  float scale = length(modelMatrix[0].xyz);
  float pixels = aShape.x * scale * uPixelsPerUnit / max(-view.z, 1e-3);
  float grow = max(1.0, uMinPixels / max(pixels, 1e-4));
  vDim = 1.0 / (grow * grow);

  vec3 placed = centre + local * grow;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(placed, 1.0);
  vNormal = mat3(modelMatrix) * (spin * normal);
  vToStar = mat3(modelMatrix) * -placed;
  vShade = 0.7 + 0.6 * fract(aShape.w * 13.71);
}
