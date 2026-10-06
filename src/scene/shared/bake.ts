/**
 * Baking procedural cube maps, either all at once (when a scene first loads, hidden by its
 * fade-in) or a few tiles per frame within a budget (while the camera is flying, where a
 * long bake would freeze the motion). Tiles are scissored rectangles of one face, so the
 * bake shaders, which work from gl_FragCoord, need no changes.
 */
import type { ShaderMaterial, WebGLCubeRenderTarget, WebGLRenderer } from 'three'
import { bakeCubeTile } from './gpu.ts'

export interface BakePass {
  readonly target: WebGLCubeRenderTarget
  readonly material: ShaderMaterial
  /** Relative cost per texel: noise-heavy passes cost more than a few texture reads. */
  readonly cost: number
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

  /** Bake tiles until about `budget` cost-weighted texels are spent. Returns what was spent. */
  step(gl: WebGLRenderer, budget: number): number {
    if (this.ready) return 0
    if (!this.started) {
      this.prepare(gl)
      this.started = true
    }
    let spent = 0
    while (this.pass < this.passes.length && spent < budget) {
      const { target, material, cost } = this.passes[this.pass]!
      const size = target.width
      const tile = Math.min(TILE, size)
      const perRow = Math.ceil(size / tile)
      const x = (this.tile % perRow) * tile
      const y = Math.floor(this.tile / perRow) * tile
      const width = Math.min(tile, size - x)
      const height = Math.min(tile, size - y)
      const lastTile = this.tile === perRow * perRow - 1
      bakeCubeTile(gl, target, material, this.face, x, y, width, height, lastTile && this.face === 5)
      spent += width * height * cost
      if (!lastTile) {
        this.tile++
      } else if (this.face < 5) {
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
    return spent
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

/** Spend this frame's budget on the oldest jobs first. */
export function runBakeQueue(gl: WebGLRenderer, budget: number) {
  let left = budget
  while (queue.length > 0 && left > 0) {
    const job = queue[0]!
    left -= job.step(gl, left)
    if (job.ready) queue.shift()
  }
}
