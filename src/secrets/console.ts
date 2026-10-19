/**
 * The developer's door: what the browser's console says, once, to anyone who opens it. A short
 * riddle (content/secrets.ts) whose answer, typed anywhere on the page, opens the listening
 * station (ui/Terminal.tsx). The styles keep to VOID's palette on dark blocks, legible in a
 * light console or a dark one.
 */
import { CONSOLE_RIDDLE } from '../content/secrets.ts'

const BLOCK = 'background:#03040b;border-radius:2px;'
const TITLE = `${BLOCK}color:#f4ebdd;font:300 20px/1.6 Georgia,serif;letter-spacing:.42em;padding:8px 10px 8px 18px;`
const WORDS = 'color:#8b8798;font:13px/1.7 system-ui,sans-serif;'
const ANSWER = `${BLOCK}color:#6fd3e0;font:600 13px/1.8 ui-monospace,Consolas,monospace;letter-spacing:.3em;padding:3px 6px 3px 12px;`

let greeted = false

export function greetConsole() {
  if (greeted) return
  greeted = true
  const answer = CONSOLE_RIDDLE.findIndex((line) => line.trim().replace(/\s/g, '') === 'SILENT')
  const before = CONSOLE_RIDDLE.slice(0, answer).join('\n')
  const after = CONSOLE_RIDDLE.slice(answer + 1).join('\n')
  console.log(
    `%cVOID%c\n\n${before}\n%c${CONSOLE_RIDDLE[answer]!.trim()}%c\n${after}`,
    TITLE,
    WORDS,
    ANSWER,
    WORDS,
  )
}
