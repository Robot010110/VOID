// Each galaxy's unresolved heart, seen from the universe: galaxy/core.vert for every galaxy at
// once, one camera-facing card each. A heart smaller than a couple of pixels is drawn at that
// size and dimmed, so its light holds steady instead of flickering between pixels.
attribute vec3 aCentre;
// Glow radius and card half-size (universe units), and intensity.
attribute vec3 aCore;
attribute vec3 aColour;

uniform float uPixelsPerUnit;
uniform float uMinRadius;
uniform float uIntensity;

varying vec2 vPlace;
varying vec3 vLight;
varying float vRadius;

void main() {
  vec4 centre = modelViewMatrix * vec4(aCentre, 1.0);
  float scale = length(modelMatrix[0].xyz);
  float distance = max(-centre.z, 1e-5);
  float pixels = aCore.x * scale * uPixelsPerUnit / distance;
  float grow = max(1.0, uMinRadius / max(pixels, 1e-5));
  float size = aCore.y * grow;
  vPlace = position.xy * size;
  vRadius = aCore.x * grow;
  vLight = aColour * aCore.z * uIntensity / (grow * grow);
  gl_Position = projectionMatrix * (centre + vec4(position.xy * size * scale, 0.0, 0.0));
  gl_Position.z = gl_Position.w;
  if (centre.z > 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
