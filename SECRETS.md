# VOID's secrets (spoilers)

This file is for whoever maintains VOID. It says where all nine secrets are, how each is found,
and where its code lives. Nothing in VOID points at any of them, and the README must not either.

Finding a secret plays a soft chime and shows, for a moment, how many have been found ("4 of 9
found") just above the breadcrumb. Found secrets are kept in `localStorage` under
`void.secrets`; clear that key to find them all again.

The definitions and detection logic are in `src/secrets/secrets.ts`. The scenes they play out in
(the black hole, the signal, the edge, the old code's song) are in `src/secrets/sequences.ts`.
The station's commands are in `src/secrets/terminal.ts`, and the console riddle is in
`src/secrets/console.ts`. All the words are in `src/content/secrets.ts`, `src/content/station.ts`
and the `HIDDEN` worlds in `src/content/anchors.ts`.

## 1. The signal

- **What:** in the sky among the galaxies, at the universe level, one faint star blinks two,
  three, five, a second apart. It waits between counts, then waits longer, and begins again
  (about 19 seconds a round). It sits above the web, a little right of centre in the universe's
  resting view.
- **Found by:** clicking or tapping it while it is lit (or within a third of a second after a
  flash).
- **What happens:** the camera turns to it, its light swells over everything, then dims to dark.
  The visitor comes up out of the dark at the world it comes from: Ellolin, a red dwarf's world
  at the rim of Ethae (`34.2.0`). The Senael have kept the light counting for nine thousand
  years. The secret counts once the world is in view.
- **Code:** `objects/SignalStar.tsx` and `followSignal` in `sequences.ts`. The click is caught in
  `CameraRig.tsx`, before the galaxies are picked.
- **Shots and testing:** `?shot=…&signal` holds the signal at the height of a flash;
  `?anchor=beacon` opens the world.

## 2. The radio whisper

- **What:** seen by radio (S twice), the spiral Bonyr Wake (galaxy 41) wears a ring of 64 lights
  on a faint thread, out past its disc. A slow wave of brightness runs round it. It is invisible
  in visible light and in infrared.
- **Found by:** watching it by radio for a moment and close enough to make out: in the galaxy
  itself, or among the galaxies once the ring spans about 40 pixels. From the universe's resting
  view the ring is seen edge-on and hides in its galaxy's light, so it rewards someone orbiting
  the universe by radio.
- **Code:** `objects/RadioRing.tsx`, drawn by `GalaxyLevel` and `UniverseLevel`.

## 3. The edge

- **What:** at the universe level, zoom out to the farthest view and keep pulling, as if to rise
  out of a level. The limit lets go and the camera keeps going. From 6,200 units everything
  fades, and by 21,000 there is total dark. After a moment, in the dark, a last fragment appears:
  "Nothing is out here. / Only the way back, / lit all the way."
- **Found by:** reading it for a few seconds. Zooming back in brings everything back, and the
  usual limit returns.
- **Code:** `leanOut` in `CameraRig.tsx` (`openEdge`), and `stepEdge` in `sequences.ts`.

## 4. The pale dot

- **What:** in the home galaxy, Valath Drift, on its outer edge, the yellow star WC-43 (star 250)
  has only a catalogue number. Its system is laid out like ours: a rock, a cloudy hot world, then
  a small blue world with one moon, a red desert world with two moons, a belt, a banded giant, a
  ringed giant and two ice giants. Its third world, Isare, has no people, and its one fragment
  reads "You are here."
- **Found by:** falling into it. It is not a notable star, so it is not on the keyboard's stops,
  in the tour or in any caption. One of the station's logs describes where it is.
- **Code:** the `pale-dot` entry in `HIDDEN`; detection is `watchPaleDot` in `sequences.ts`.
  `?anchor=pale-dot&view=day` opens it.

## 5. The black hole's interior

- **What:** at the black hole's own level, click or tap its shadow, or zoom in as far as the
  camera goes with the pointer over the shadow and keep zooming. The camera falls in faster and
  faster until the shadow is all there is. The dark closes, the sound drops away, and after a few
  seconds one line appears: "Everything that ever fell in here is still falling, together." Then
  the visitor is set back outside and everything returns.
- **Found by:** coming back out. Escape skips to the way back out.
- **Code:** `fallIntoHole` and `onHoleShadow` in `sequences.ts`, the hush in `audio/engine.ts`,
  and the gestures in `CameraRig.tsx`.

## 6. The developer's door

- **What:** on load, the browser's console prints a styled riddle: "There is a door here. It
  opens for one word, which is what the quiet becomes, rearranged: S I L E N T." The answer is
  **listen**, typed anywhere on the page (outside a text field).
- **Found by:** typing the word, which opens Listening Station 9's terminal. VOID's S and T keys
  do nothing while the word is being typed.
- **Code:** `console.ts`, `KeyTrail` in `secrets.ts`, `ui/Shortcuts.tsx` and `ui/Terminal.tsx`.

## 7. The terminal

The station understands `help`, `ls [-a] [dir]`, `cat <file>`, `whoami`, `scan`, `goto <place>`,
`clear` and `exit` (or Escape). A few more are answered for fun: `listen`, `cd` and `sudo`.

**The trail:**
1. `cat readme` says the keepers kept their notes "out of sight".
2. `ls -a` shows `.keeper`.
3. `cat .keeper` gives their home, `2f.a1.01`, "in sixteens", and says `goto 2f a1 01`.
4. `goto` closes the station and flies there, level by level, to Gothrok in Kosko (`47.161.1`).
   The Nuren are fading there, and the station has sent home the word "nothing" every day.

**Found by:** arriving there by `goto`.

**What `goto` and `scan` do:**
- `goto` takes any coordinates: galaxy, star and world, each in hex. For example, `goto 0 0 3`
  is Ithasal and `goto 3d` is the black hole.
- `scan` prints the current position in the same notation.
- The logs also point at the signal (4111, 4112, 4140), the radio whisper (5020) and the pale
  dot (6315).

**Code:** `terminal.ts`, `content/station.ts`, `ui/Terminal.tsx` and `scene/journey.ts`.

## 8. The old code

- **What:** the Konami code: ↑ ↑ ↓ ↓ ← → ← → B A. Every star in view sings one chord together.
  - In a galaxy, its stars each sing their own note (hot high, cool low).
  - Among the galaxies, the galaxies sing.
  - In a system, its star and its worlds sing.
  - Elsewhere, the sky sings an open D Lydian chord.
  - Everything that shines brightens while the chord sounds, about four seconds.
- **Found by:** entering the code.
- **Code:** `sing` in `sequences.ts`, `voiceChord` in `audio/notes.ts`, the choir in
  `audio/engine.ts`, and `scene/shared/chorus.ts` for the brightening.

## 9. The persistence

- **What:** draw a constellation, then come back on a later calendar day. A small new star
  appears beside the first star of the oldest constellation drawn before today. It rides round
  the galaxy with that star and breathes a little. Beside it: "You came back. / While you were
  away, / a small star came / to keep yours company."
- **Found by:** seeing the words for a few seconds.
- **Code:** `returning` and `companionOrbit` in `secrets.ts`, `objects/Companion.tsx` and
  `ui/CompanionWords.tsx`.
- **Testing:** store a constellation whose `made` is an old timestamp, as the `8-companion` shot
  does.

## Accessibility of the secrets

Secrets are found by looking, so not all of them can be reached every way.

- **Keyboard only:**
  - The developer's door, the terminal and the old code are keyboard secrets.
  - With `goto`, a keyboard user can reach the keepers' world, and any place whose coordinates
    they know (`scan` shows them for wherever they are).
  - The signal and the black hole's shadow need a pointer.
- **Screen readers:**
  - The words in the dark and the station's output are announced as they appear.
  - The companion's words are hidden from screen readers until they are shown, so they never
    give the secret away.
- **Reduced motion:** the fall into the black hole and the turn to the signal are shorter.
