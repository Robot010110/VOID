import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { STATION_GREETING } from '../content/station.ts'
import { samePath, useVoid } from '../core/store.ts'
import type { Path } from '../core/universe.ts'
import { endDrift } from '../scene/drift.ts'
import { journeyTo } from '../scene/journey.ts'
import { findSecret, KEEPERS } from '../secrets/secrets.ts'
import { PROMPT, runCommand } from '../secrets/terminal.ts'

interface Line {
  readonly id: number
  readonly kind: 'input' | 'output'
  readonly text: string
}

/** Lines kept on screen; older ones scroll away for good. */
const KEPT = 300
/** A moment to read where the course is set for, before the station closes and the flight begins. */
const BEFORE_FLIGHT_MS = 1100

const COMMANDS = ['help', 'ls', 'cat', 'whoami', 'scan', 'goto', 'clear', 'exit']

/**
 * Listening Station 9, behind the developer's door: a small terminal in VOID's own colours,
 * over the scene and leaving it in view. It takes a line at a time (secrets/terminal.ts says
 * what each does), remembers what was typed (the arrow keys go back through it), and closes on
 * `exit` or Escape. A `goto` closes it and flies the camera there.
 */
export function Terminal() {
  const open = useVoid((s) => s.terminalOpen)
  if (!open) return null
  return <Station />
}

let nextId = 0
const line = (kind: Line['kind'], text: string): Line => ({ id: nextId++, kind, text })

function close() {
  useVoid.getState().setTerminalOpen(false)
}

/** Fly to a place; the station's keepers count it as the terminal's secret on arrival. */
function travel(path: Path) {
  endDrift()
  journeyTo(path, (arrived) => {
    if (samePath(arrived, KEEPERS)) findSecret('terminal')
  })
}

function Station() {
  const [lines, setLines] = useState<Line[]>(() => STATION_GREETING.map((text) => line('output', text)))
  const [value, setValue] = useState('')
  const [leaving, setLeaving] = useState(false)
  const history = useRef<string[]>([])
  const back = useRef(-1)
  const input = useRef<HTMLInputElement>(null)
  const log = useRef<HTMLDivElement>(null)

  // Typing goes straight to the station; focus returns to the page when it closes.
  useEffect(() => {
    const before = document.activeElement
    input.current?.focus()
    document.documentElement.dataset.terminal = 'true'
    return () => {
      delete document.documentElement.dataset.terminal
      if (before instanceof HTMLElement && before.isConnected) before.focus()
    }
  }, [])

  useLayoutEffect(() => {
    const element = log.current
    if (element) element.scrollTop = element.scrollHeight
  }, [lines])

  const submit = () => {
    const typed = value
    setValue('')
    back.current = -1
    if (typed.trim()) history.current.push(typed)
    const reply = runCommand(typed, useVoid.getState().path)
    if (reply.effect?.kind === 'clear') {
      setLines([])
      return
    }
    setLines((previous) => [...previous, line('input', typed), ...reply.lines.map((text) => line('output', text))].slice(-KEPT))
    if (reply.effect?.kind === 'close') close()
    else if (reply.effect?.kind === 'goto') {
      const path = reply.effect.path
      setLeaving(true)
      window.setTimeout(() => {
        close()
        travel(path)
      }, BEFORE_FLIGHT_MS)
    }
  }

  /** Tab finishes a command's name, when only one begins with what is typed. */
  const complete = () => {
    if (value.includes(' ')) return
    const matches = COMMANDS.filter((c) => c.startsWith(value.toLowerCase()))
    if (matches.length === 1) setValue(`${matches[0]} `)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (leaving) {
      event.preventDefault()
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      submit()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      close()
    } else if (event.key === 'Tab') {
      event.preventDefault()
      complete()
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault()
      const past = history.current
      if (past.length === 0) return
      const step = event.key === 'ArrowUp' ? -1 : 1
      const at = back.current < 0 ? past.length : back.current
      const next = Math.min(past.length, Math.max(0, at + step))
      back.current = next
      setValue(next >= past.length ? '' : past[next]!)
    }
  }

  return (
    <section className="terminal" role="dialog" aria-label="Listening Station 9" data-leaving={leaving}>
      <header className="terminal-title">
        <span>Listening Station 9</span>
        <button type="button" className="terminal-close" onClick={close}>
          Close
        </button>
      </header>
      <div ref={log} className="terminal-log" role="log" aria-live="polite" onClick={() => input.current?.focus()}>
        {lines.map((entry) => (
          <p key={entry.id} className="terminal-line" data-kind={entry.kind}>
            {entry.kind === 'input' && <span className="terminal-prompt">{PROMPT} </span>}
            {entry.text}
          </p>
        ))}
      </div>
      <label className="terminal-entry">
        <span className="terminal-prompt" aria-hidden="true">
          {PROMPT}
        </span>
        <input
          ref={input}
          className="terminal-input"
          aria-label="Command"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={onKeyDown}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="send"
        />
      </label>
    </section>
  )
}
