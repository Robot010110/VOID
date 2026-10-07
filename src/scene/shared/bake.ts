/**
 * Baking procedural maps (cube maps for worlds, flat maps for nebulae), either all at once
 * (when a scene first loads, hidden by its fade-in) or a few tiles per frame within a budget
 * (while the camera is flying, where a long bake would freeze the motion). Tiles are
 * scissored rectangles of one face, so the bake shaders, which work from gl_FragCoord, need
 * no changes. Passes differ in cost by an order of magnitude, so the background budget is
 * counted in tiles of the pass being baked.
 */
import { WebGLCubeRenderTarget, type ShaderMaterial, type WebGLRenderer, type WebGLRenderTarget } from 'three'
import { bakeCubeTile, bakeTile } from './gpu.ts'

export interface BakePass {
  readonly target: WebGLCubeRenderTarget | WebGLRenderTarget
  readonly material: ShaderMaterial
}

function isCube(target: WebGLCubeRenderTarget | WebGLRenderTarget): target is WebGLCubeRenderTarget {
  return target instanceof WebGLCubeRenderTarget
}

/** Largest tile side baked in one go. */
const TILE = 256

export class BakeJob {
  ready = false
  private pass = 0
  private face = 0
  private tile = 0
  private started = false
  private readonly listeners = new Set<() => void>()
  private readonly passes: readonly BakePass[]
  /** Small bakes that run first, all at once (an atmosphere's lookup table). */
  private readonly prepare: (gl: WebGLRenderer) => void

  constructor(passes: readonly BakePass[], prepare: (gl: WebGLRenderer) => void = () => {}) {
    this.passes = passes
    this.prepare = prepare
  }

  /** Bake everything now. */
  run(gl: WebGLRenderer) {
    while (!this.ready) this.step(gl, Infinity)
  }

  /** Which pass is baking now, so a scheduler can tell when the cost per tile changes. */
  get passIndex(): number {
    return this.pass
  }

  /** Start over, e.g. after a debug parameter changed. The old maps stay usable meanwhile. */
  restart() {
    this.pass = 0
    this.face = 0
    this.tile = 0
    this.started = false
    this.ready = false
  }

  onReady(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * Bake up to `tiles` tiles, never past the end of the current pass, so a scheduler can
   * size the next frame's work for the next pass. Returns the tiles baked.
   */
  step(gl: WebGLRenderer, tiles: number): number {
    if (this.ready) return 0
    if (!this.started) {
      this.prepare(gl)
      this.started = true
    }
    let baked = 0
    const pass = this.pass
    while (this.pass === pass && baked < tiles) {
      const { target, material } = this.passes[this.pass]!
      const cube = isCube(target)
      const faces = cube ? 6 : 1
      const tile = Math.min(TILE, target.width)
      const perRow = Math.ceil(target.width / tile)
      const perColumn = Math.ceil(target.height / tile)
      const x = (this.tile % perRow) * tile
      const y = Math.floor(this.tile / perRow) * tile
      const width = Math.min(tile, target.width - x)
      const height = Math.min(tile, target.height - y)
      const lastTile = this.tile === perRow * perColumn - 1
      const last = lastTile && this.face === faces - 1
      if (cube) bakeCubeTile(gl, target, material, this.face, x, y, width, height, last)
      else bakeTile(gl, target, material, x, y, width, height, last)
      baked++
      if (!lastTile) {
        this.tile++
      } else if (this.face < faces - 1) {
        this.tile = 0
        this.face++
      } else {
        this.tile = 0
        this.face = 0
        this.pass++
      }
    }
    if (this.pass >= this.passes.length) {
      this.ready = true
      for (const listener of this.listeners) listener()
    }
    return baked
  }
}

const queue: BakeJob[] = []

/** Bake a job in the background, a few tiles per frame. */
export function enqueueBake(job: BakeJob) {
  if (!job.ready && !queue.includes(job)) queue.push(job)
}

export function cancelBake(job: BakeJob) {
  const index = queue.indexOf(job)
  if (index >= 0) queue.splice(index, 1)
}

/** True while anything is waiting to bake. */
export function bakesPending(): boolean {
  return queue.length > 0
}

const tokens = new WeakMap<BakeJob, object[]>()

/** The pass at the head of the queue, as a token that changes whenever the pass does. */
export function currentBake(): object | null {
  const job = queue[0]
  if (!job) return null
  let list = tokens.get(job)
  if (!list) {
    list = []
    tokens.set(job, list)
  }
  list[job.passIndex] ??= {}
  return list[job.passIndex]!
}

/** Bake up to `tiles` tiles of the oldest job's current pass. */
export function runBakeQueue(gl: WebGLRenderer, tiles: number) {
  const job = queue[0]
  if (!job) return
  job.step(gl, tiles)
  if (job.ready) queue.shift()
}
