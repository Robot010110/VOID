import { useVoid } from '../core/store.ts'

/** A gentle wave while sound is on; the same line lying flat when it is off. */
const WAVE = 'M3 12 C 5.2 6.5, 8.3 6.5, 10.5 12 S 15.8 17.5, 18 12 S 20.4 9.4, 21 10'
const FLAT = 'M3 12 C 5.2 12, 8.3 12, 10.5 12 S 15.8 12, 18 12 S 20.4 12, 21 12'

/** Top right: the few controls VOID has, drawn as single lines. */
export function Controls() {
  const enabled = useVoid((s) => s.audioEnabled)
  const setEnabled = useVoid((s) => s.setAudioEnabled)
  return (
    <div className="controls">
      <button
        type="button"
        className="control"
        aria-label="Sound"
        aria-pressed={enabled}
        aria-keyshortcuts="M"
        onClick={() => setEnabled(!enabled)}
      >
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
          <path className="control-line" d={enabled ? WAVE : FLAT} />
        </svg>
      </button>
    </div>
  )
}
