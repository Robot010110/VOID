// Gravitational lensing around the black hole. Each pixel's ray is turned towards the hole by
// the angle a ray with its impact parameter is really turned (looked up from a table of the
// exact result), and the scene is read where the turned ray lands: stars, galaxies and nebulae
// behind the hole smear into arcs around it, and one straight behind it becomes a ring. Rays
// aimed inside the critical impact parameter fall in. The traced hole (shadow, disc, photon
// ring) is laid over the bent scene.
uniform sampler2D uTrace;
uniform sampler2D uDeflection;
// The table's range, in log(b / critical - 1).
uniform vec2 uDeflectionRange;
// The camera in the hole's frame, in the hole's radii, and view directions into that frame.
uniform vec3 uCamera;
uniform mat3 uViewToHole;
uniform mat3 uHoleToView;
uniform vec2 uTanHalfFov;
uniform float uStrength;

const float CRITICAL = 2.5980762;
const float TABLE = 256.0;

float deflection(float b) {
  float x = b / CRITICAL - 1.0;
  float s = log(max(x, 1e-9));
  if (s > uDeflectionRange.y) return 2.0 / b + 2.9452431 / (b * b);
  if (s < uDeflectionRange.x) return -s - 0.4002288;
  float t = (s - uDeflectionRange.x) / (uDeflectionRange.y - uDeflectionRange.x);
  return texture2D(uDeflection, vec2(mix(0.5 / TABLE, 1.0 - 0.5 / TABLE, t), 0.5)).r;
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec2 ndc = uv * 2.0 - 1.0;
  vec3 ray = normalize(uViewToHole * vec3(ndc * uTanHalfFov, -1.0));
  float distance = length(uCamera);
  vec3 towards = -uCamera / distance;
  float cosine = dot(ray, towards);
  float sine = sqrt(max(0.0, 1.0 - cosine * cosine));
  // The ray's impact parameter, seen from a camera at this distance.
  float b = distance * sine / sqrt(max(1.0 - 1.0 / distance, 1e-4));

  // Fallen in: nothing behind the shadow reaches the camera.
  vec3 behind = inputColor.rgb * (1.0 - uStrength);
  if (b > CRITICAL || cosine <= 0.0) {
    // What is left of the turn between the camera and infinity.
    float turn = deflection(b) * (1.0 + cosine) * 0.5 * uStrength;
    vec3 axis = cross(ray, towards);
    float across = length(axis);
    vec3 bent = ray;
    if (across > 1e-7) {
      axis /= across;
      bent = ray * cos(turn) + cross(axis, ray) * sin(turn);
    }
    vec3 view = uHoleToView * bent;
    behind = vec3(0.0);
    if (view.z < -1e-3) {
      vec2 at = view.xy / (-view.z) / uTanHalfFov * 0.5 + 0.5;
      // Light from beyond the screen's edge is not in the picture: let it fade, not smear.
      float margin = min(min(at.x, 1.0 - at.x), min(at.y, 1.0 - at.y));
      behind = texture2D(inputBuffer, clamp(at, 0.0, 1.0)).rgb * smoothstep(-0.12, 0.0, margin);
    }
  }
  vec4 hole = texture2D(uTrace, uv);
  outputColor = vec4(hole.rgb + behind * (1.0 - hole.a), inputColor.a);
}
