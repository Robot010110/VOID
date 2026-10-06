// The atmosphere as a participating medium: Rayleigh and Mie scattering with exponential
// density, plus an ozone-like absorbing layer that deepens the blue and purples twilight.
// Distances are in planet radii.

uniform vec3 uRayleigh;
uniform float uRayleighHeight;
uniform float uMie;
uniform float uMieHeight;
uniform vec3 uAbsorption;
uniform float uOzoneCenter;
uniform float uOzoneWidth;

// Density of (Rayleigh, Mie, absorber) at a height above the ground.
vec3 mediumDensity(float h) {
  return vec3(
    exp(-h / uRayleighHeight),
    exp(-h / uMieHeight),
    max(0.0, 1.0 - abs(h - uOzoneCenter) / uOzoneWidth)
  );
}

// Optical depth (Rayleigh, Mie, absorber) to extinction.
vec3 extinction(vec3 depth) {
  return uRayleigh * depth.x + uMie * 1.11 * depth.y + uAbsorption * depth.z;
}
