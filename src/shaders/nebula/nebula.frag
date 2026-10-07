// A nebula layer's light and dust, premultiplied: glowing gas adds light, its dust (alpha)
// dims what lies behind. Very soft edges, and a slow drift through the noise, so the cloud
// seems to move within itself without ever visibly animating.
uniform sampler2D uAtlas;
uniform float uTime;
uniform float uGlow;

varying vec2 vPlace;
varying vec2 vUv;
varying vec4 vChannel;
varying vec3 vColourA;
varying vec3 vColourB;
varying vec4 vLook;
varying float vFade;

void main() {
  float r = length(vPlace);
  if (r >= 1.0 || vFade <= 0.0) discard;

  // A second, slowly drifting look-up bends the first: the gas seems to flow.
  vec4 drift = texture2D(uAtlas, vUv * 0.6 + vec2(uTime * 0.0011, -uTime * 0.0007));
  vec2 uv = vUv + (drift.ra - 0.5) * 0.07;
  vec4 n = texture2D(uAtlas, uv);
  float noise = dot(n, vChannel);

  // Clouds fade from the middle out; shells are brightest in a ring.
  float cloud = 1.0 - smoothstep(0.15, 1.0, r);
  float shell = smoothstep(0.35, 0.72, r) * (1.0 - smoothstep(0.72, 1.0, r));
  float shape = mix(cloud * cloud, shell, vLook.w);
  // The noise sits around a half: its upper third becomes the cloud's body.
  float density = smoothstep(vLook.z, vLook.z + 0.32, noise) * shape;

  vec3 colour = mix(vColourA, vColourB, smoothstep(0.3, 0.75, n.a));
  vec3 light = colour * density * vLook.x * uGlow;
  float dust = clamp(density * vLook.y, 0.0, 1.0);
  gl_FragColor = vec4(light, dust) * vFade;
}
