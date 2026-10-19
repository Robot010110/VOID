/**
 * Compiling shaders before they are needed. With KHR_parallel_shader_compile the driver
 * compiles off the main thread while frames go on; a program used before it has finished
 * holds up the frame that uses it (for a large shader on some drivers, for seconds).
 */
import { HalfFloatType, WebGLRenderTarget, type Camera, type Material, type Object3D, type Scene, type WebGLRenderer } from 'three'

/**
 * A one-pixel target of the kind the scene really renders into (linear, half float), bound
 * while shaders are precompiled: three keys programs by output colour space, and programs
 * compiled for the screen would be compiled again at first use.
 */
let compileTarget: WebGLRenderTarget | null = null

interface ProgramState {
  currentProgram?: { isReady(): boolean; getUniforms(): unknown }
}

function programOf(gl: WebGLRenderer, material: Material) {
  return (gl.properties.get(material) as ProgramState).currentProgram
}

/**
 * Start compiling a level's shaders. With KHR_parallel_shader_compile the driver compiles in
 * the background and the returned materials are polled until their programs are ready;
 * without it, linking is forced now, mid-flight, rather than at the moment of the swap.
 */
export function precompile(gl: WebGLRenderer, roots: Iterable<Object3D>, camera: Camera, scene: Scene): Set<Material> {
  compileTarget ??= new WebGLRenderTarget(1, 1, { type: HalfFloatType, depthBuffer: true })
  const previous = gl.getRenderTarget()
  gl.setRenderTarget(compileTarget)
  const materials = new Set<Material>()
  for (const root of roots) for (const material of gl.compile(root, camera, scene)) materials.add(material)
  gl.setRenderTarget(previous)
  if (!gl.extensions.has('KHR_parallel_shader_compile')) {
    for (const material of materials) programOf(gl, material)?.getUniforms()
    materials.clear()
  }
  return materials
}

/**
 * Programs handed to the driver and not finished yet, across everything that compiles ahead
 * (levels and bakes). A slow driver given many at once works through them as one block, and
 * the page draws nothing until the last is done; given a few at a time, it lets frames through
 * between them. On an Intel UHD 620 with sixty programs to compile: all at once, an 8 s freeze;
 * one at a time, no freeze but twice as long; six at a time, the longest pause about a second
 * and nearly the speed of all at once.
 */
const outstanding = new Set<Material>()
const MAX_OUTSTANDING = 6

/** Whether another program may be handed to the driver now. */
export function compileSlotFree(gl: WebGLRenderer): boolean {
  for (const material of outstanding) {
    const program = programOf(gl, material)
    if (!program || program.isReady()) outstanding.delete(material)
  }
  return outstanding.size < MAX_OUTSTANDING
}

/** Count a program the driver is compiling, until it is ready. */
export function compiling(gl: WebGLRenderer, material: Material) {
  const program = programOf(gl, material)
  if (program && !program.isReady()) outstanding.add(material)
}

/** True once every program has finished compiling. Disposed materials no longer count. */
export function compiledAll(gl: WebGLRenderer, materials: Set<Material>): boolean {
  for (const material of materials) {
    const program = programOf(gl, material)
    if (!program || program.isReady()) materials.delete(material)
  }
  return materials.size === 0
}

function renderable(object: Object3D): boolean {
  const o = object as Object3D & { isMesh?: boolean; isPoints?: boolean; isLine?: boolean; isSprite?: boolean }
  return Boolean(o.isMesh || o.isPoints || o.isLine || o.isSprite)
}

/**
 * Compiling a level's shaders an object at a time, as the driver has room (see
 * `compileSlotFree`). Handed dozens of programs at once, a slow driver holds the GPU process
 * for seconds, and with it every frame on the page, even one that only animates CSS.
 */
export class CompileJob {
  private objects: Object3D[] | null = null
  private readonly materials = new Set<Material>()
  private readonly roots: readonly Object3D[]

  constructor(roots: readonly Object3D[]) {
    this.roots = roots
  }

  /** Compile what there is room for; true once every object is compiled and ready. */
  step(gl: WebGLRenderer, camera: Camera, scene: Scene): boolean {
    if (!this.objects) {
      const objects: Object3D[] = []
      for (const root of this.roots) root.traverse((object) => void (renderable(object) && objects.push(object)))
      this.objects = objects
    }
    while (this.objects.length > 0 && compileSlotFree(gl)) {
      for (const material of precompile(gl, this.objects.splice(0, 1), camera, scene)) {
        this.materials.add(material)
        compiling(gl, material)
      }
    }
    return this.objects.length === 0 && compiledAll(gl, this.materials)
  }
}
