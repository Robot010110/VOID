/**
 * When the graphics are lost. A GPU reset, a driver update, or a browser reclaiming memory can
 * take the WebGL context away at any moment; everything drawn and baked into it is gone. VOID
 * never leaves a frozen frame on screen: a quiet dark covers the page at once (ui/Outage.tsx),
 * and the scene starts again from nothing in a new canvas, where the visitor was, as soon as
 * the browser gives the context back (or after a short wait, if it does not say). Shared maps
 * are dropped so they are baked afresh. If no context can be had at all, the page shows the
 * same still sky as a browser without WebGL2 (ui/Fallback.tsx). Lost before the opening has
 * ended, the page simply loads again.
 */
import type { WebGLRenderer } from 'three'
import { IDLE, useVoid } from '../core/store.ts'
import { endDrift } from './drift.ts'
import { endJourney } from './journey.ts'
import { rig, settleRig } from './camera/rig.ts'
import { clearBakes } from './shared/bake.ts'
import { forgetShared } from './shared/cache.ts'
import { curtain, handover, levelRuntime } from './stage.ts'
import { resetSecretScreen } from '../secrets/sequences.ts'

/** How long to wait for the browser to give the context back before making a new one. */
const WAIT_FOR_RESTORE_MS = 2500

/** The canvas whose scene is on screen has rendered, ready, after starting again. */
export const recovery = { readyEpoch: 0 }

/**
 * Listen for the renderer's canvas losing its context. A canvas being replaced also loses its
 * context, on purpose, as it is taken down; only the canvas on screen is listened to. Returns
 * the clean-up.
 */
export function watchContext(renderer: WebGLRenderer): () => void {
  const canvas = renderer.domElement
  const epoch = useVoid.getState().canvasEpoch
  let timer = 0
  let renewed = false
  const renew = () => {
    if (renewed) return
    renewed = true
    window.clearTimeout(timer)
    letGo(renderer)
    startAgain()
  }
  const onLost = (event: Event) => {
    if (!canvas.isConnected || useVoid.getState().canvasEpoch !== epoch) return
    // Allows the browser to give the context back.
    event.preventDefault()
    useVoid.getState().setOutage(true)
    timer = window.setTimeout(renew, WAIT_FOR_RESTORE_MS)
  }
  const onRestored = () => {
    if (useVoid.getState().outage && useVoid.getState().canvasEpoch === epoch) renew()
  }
  canvas.addEventListener('webglcontextlost', onLost)
  canvas.addEventListener('webglcontextrestored', onRestored)
  return () => {
    window.clearTimeout(timer)
    canvas.removeEventListener('webglcontextlost', onLost)
    canvas.removeEventListener('webglcontextrestored', onRestored)
  }
}

/**
 * Let the old renderer go quietly. Its context is lost again on purpose if the browser had given
 * it back: nothing made before the loss can be freed in the context that came back (asking only
 * draws warnings), while in a lost context freeing is silently nothing. And taking the canvas
 * down will not ask a lost context to lose itself.
 */
function letGo(renderer: WebGLRenderer) {
  const context = renderer.getContext()
  if (!context.isContextLost()) context.getExtension('WEBGL_lose_context')?.loseContext()
  renderer.forceContextLoss = () => {}
}

/** Stop whatever was under way where it is, forget the lost maps, and start a new canvas. */
function startAgain() {
  const state = useVoid.getState()
  if (state.intro !== 'done') {
    window.location.reload()
    return
  }
  rig.flight = null
  settleRig()
  endJourney()
  endDrift()
  resetSecretScreen()
  handover.index = -1
  curtain.closed = false
  state.setTransition({ ...IDLE, from: state.path, to: state.path })
  const runtime = levelRuntime(state.path)
  runtime.visible = true
  runtime.ready = false
  runtime.fade.current = 1
  forgetShared()
  clearBakes()
  state.renewCanvas()
}
