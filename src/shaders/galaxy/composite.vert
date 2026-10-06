// A full-screen triangle at the far plane: the galaxy's light lies behind everything that
// writes depth, and over the sky.
void main() {
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
