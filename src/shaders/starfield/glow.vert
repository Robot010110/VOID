// Full-screen triangle that carries each pixel's world-space view ray.

uniform mat4 uInverseProjection;

varying vec3 vRay;

void main() {
  vec4 farPoint = uInverseProjection * vec4(position.xy, 1.0, 1.0);
  vRay = transpose(mat3(viewMatrix)) * (farPoint.xyz / farPoint.w);
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
