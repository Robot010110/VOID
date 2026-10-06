// Mapping between world directions and the baked strip of the galactic band.
// The strip is equirectangular in band coordinates: u is longitude (0.5 = the core),
// v covers latitudes within +-latMax of the band's plane.

vec2 bandUv(mat3 worldToBand, float latMax, vec3 world, out float lat) {
  vec3 d = worldToBand * world;
  lat = asin(clamp(d.y, -1.0, 1.0));
  float lon = atan(d.x, d.z);
  return vec2(lon * 0.15915494309 + 0.5, lat / (2.0 * latMax) + 0.5);
}
