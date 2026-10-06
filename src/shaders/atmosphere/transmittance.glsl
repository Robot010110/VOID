// Sunlight transmittance through the atmosphere, from a point at radius r towards a direction
// whose cosine with the local zenith is mu. Precomputed into a small table (see lut.frag);
// it already includes the planet's own shadow, softened across the sun's disc.
// The table packs mu with a square-root curve and height with a square, so resolution
// gathers near the horizon and near the ground, where the colour changes fastest.

uniform sampler2D uTransmittance;
uniform float uAtmBottom;
uniform float uAtmTop;

vec2 transmittanceUv(float r, float mu) {
  float h = clamp((r - uAtmBottom) / (uAtmTop - uAtmBottom), 0.0, 1.0);
  float s = sign(mu) * sqrt(abs(mu));
  return vec2(0.5 + 0.5 * s, sqrt(h));
}

vec3 sunTransmittance(float r, float mu) {
  return texture(uTransmittance, transmittanceUv(r, mu)).rgb;
}
