// Lens flare elements, placed in screen space: a halo around the light and faint ghosts
// along the line from the light through the centre of the frame, like reflections between
// the elements of a lens.
uniform vec2 uSource;
uniform float uAspect;

// x: place along the axis (0 at the light, 0.5 at the centre, 1 at its mirror image),
// y: radius as a fraction of the screen's height, z: shape (0 halo, 1 ghost), w: tint.
attribute vec4 aElement;
attribute float aStrength;

varying vec2 vLocal;
varying float vShape;
varying float vTint;
varying float vStrength;

void main() {
  vLocal = position.xy;
  vShape = aElement.z;
  vTint = aElement.w;
  vStrength = aStrength;
  vec2 centre = uSource * (1.0 - 2.0 * aElement.x);
  vec2 offset = position.xy * aElement.y * 2.0 * vec2(1.0 / uAspect, 1.0);
  gl_Position = vec4(centre + offset, 0.0, 1.0);
}
