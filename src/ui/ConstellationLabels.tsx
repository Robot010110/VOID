import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { cleanName, MAX_NAME, type Constellation } from '../core/constellations.ts'
import { useVoid } from '../core/store.ts'
import { constellationLabels } from '../scene/stage.ts'

/** The editor for one constellation's name: a line to write on, and a way to let it go. */
function NameEditor({ constellation }: { constellation: Constellation }) {
  const [value, setValue] = useState(constellation.name)
  const done = useRef(false)
  const opened = useRef(0)
  useLayoutEffect(() => {
    opened.current = performance.now()
  }, [])
  const close = (keep: boolean) => {
    if (done.current) return
    done.current = true
    const { renameConstellation, setNaming } = useVoid.getState()
    if (keep) renameConstellation(constellation.id, cleanName(value))
    setNaming(null)
  }
  return (
    <span className="constellation-editor">
      <input
        className="constellation-input"
        aria-label="Name this constellation"
        placeholder="Name it"
        maxLength={MAX_NAME}
        value={value}
        autoFocus
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === 'Enter') close(true)
          if (event.key === 'Escape') close(false)
        }}
        onBlur={(event) => {
          // The tap that finished a constellation on a touch screen is followed by mouse events
          // that take focus away at once: a field just opened keeps it.
          if (performance.now() - opened.current < 600) {
            const field = event.currentTarget
            window.setTimeout(() => field.focus(), 0)
            return
          }
          close(true)
        }}
      />
      <button
        type="button"
        className="constellation-forget"
        // Pressed before the field loses focus, so letting go is not first taken as keeping.
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          done.current = true
          useVoid.getState().forgetConstellation(constellation.id)
        }}
      >
        Forget
      </button>
    </span>
  )
}

/**
 * The names of the visitor's constellations in the galaxy they are in, set beneath each one at
 * the place the scene works out every frame. A name is a quiet button: it opens a field to
 * rename the constellation, or to let it go. A constellation just drawn asks for its name.
 */
export function ConstellationLabels() {
  const path = useVoid((s) => s.path)
  const all = useVoid((s) => s.constellations)
  const naming = useVoid((s) => s.naming)
  const here = useMemo(() => (path.length === 1 ? all.filter((c) => c.galaxy === path[0]) : []), [all, path])

  // A name being written stays only while its galaxy is the place.
  useEffect(() => {
    if (naming && !here.some((c) => c.id === naming)) useVoid.getState().setNaming(null)
  }, [here, naming])

  return (
    <>
      {here.map((c) => (
        <div
          key={c.id}
          className="constellation-label"
          data-shown="false"
          data-editing={naming === c.id}
          ref={(element) => {
            if (element) constellationLabels.elements.set(c.id, element)
            else constellationLabels.elements.delete(c.id)
          }}
        >
          {naming === c.id ? (
            <NameEditor constellation={c} />
          ) : (
            <button
              type="button"
              className="constellation-name"
              data-unnamed={c.name === ''}
              aria-label={c.name ? `${c.name}, a constellation you drew` : 'A constellation you drew, unnamed'}
              onClick={() => useVoid.getState().setNaming(c.id)}
            >
              {c.name || 'Unnamed'}
            </button>
          )}
        </div>
      ))}
    </>
  )
}
