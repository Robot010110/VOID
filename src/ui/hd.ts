import { writeFlag } from '../core/persist.ts'
import { useVoid } from '../core/store.ts'

/**
 * HD: the Ultra tier, asked for by the visitor and remembered (see main.tsx). A galaxy's
 * particles, the textures and the sky's band are built once at load, so the switch reloads the
 * page; a pinned `?quality` is dropped, or it would win over the choice just made.
 */
export function toggleHd() {
  writeFlag('hd', useVoid.getState().quality !== 'ultra')
  const url = new URL(window.location.href)
  url.searchParams.delete('quality')
  window.location.replace(url)
}
