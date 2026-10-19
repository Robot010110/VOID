/**
 * Drawing a constellation: stars joined one after another in the galaxy the visitor is in.
 * With a mouse, hold Shift and click stars, and let go of Shift to finish; with the keyboard,
 * Shift and Enter on a focused star; on a touch screen, a long press on a star begins, a tap on
 * each further star joins it, and a tap on empty sky finishes. Escape lets a drawing go,
 * Backspace takes back its last star. A finished constellation of two stars or more is kept,
 * and its name is asked for.
 */
import { extend, MIN_STARS, newId } from '../core/constellations.ts'
import { useVoid } from '../core/store.ts'

/** How this drawing was begun: a held Shift ends it when let go; a touch, by a tap on the sky. */
export const sketching = { by: 'keys' as 'keys' | 'touch' }

/** Join a star to the drawing, beginning one if there is none. Only in a galaxy. */
export function joinStar(star: number, by: 'keys' | 'touch' = 'keys') {
  const { path, sketch, setSketch } = useVoid.getState()
  if (path.length !== 1) return
  const galaxy = path[0]!
  if (!sketch || sketch.galaxy !== galaxy) {
    sketching.by = by
    setSketch({ galaxy, stars: [star] })
    return
  }
  const stars = extend(sketch.stars, star)
  if (stars !== sketch.stars) setSketch({ galaxy, stars })
}

/** Take back the last star joined. */
export function unjoinStar() {
  const { sketch, setSketch } = useVoid.getState()
  if (!sketch) return
  setSketch(sketch.stars.length > 1 ? { ...sketch, stars: sketch.stars.slice(0, -1) } : null)
}

/** Keep the drawing as a constellation if it joins at least two stars, and ask its name. */
export function finishSketch() {
  const { sketch, setSketch, addConstellation, setNaming } = useVoid.getState()
  if (!sketch) return
  setSketch(null)
  if (sketch.stars.length < MIN_STARS) return
  const id = newId(Date.now())
  addConstellation({ id, galaxy: sketch.galaxy, stars: sketch.stars, name: '', made: Date.now() })
  setNaming(id)
}

export function cancelSketch() {
  useVoid.getState().setSketch(null)
}
