# ClearTen (prototype v0.4)

A browser-based prototype of a mobile strategy puzzle game. The goal of
this build is **only** to test whether the core mechanic is fun -- it is
not a finished product. No accounts, ads, sound, procedural levels, or
anything beyond the one hand-authored puzzle.

**V0.4 replaces the piece model entirely.** Earlier versions used flat
multi-cell geometric pieces (a shape spanning 1-3 hexes) -- playtesting
found that felt too much like untimed Tetris. V0.4 tests a different idea:
every piece is a single hex cell holding a small stack of 2-4 color
layers, one on top of the other. Only the top (active) layer counts
toward clearing; clearing it reveals the color underneath. The question
this version exists to answer: **does planning around a piece's buried
colors -- not just what it does right now -- create real strategic
depth?**

## HOW TO PLAY

- The board is a hex grid with an irregular (hexagon-shaped) outline.
- Every piece occupies **one hex cell** and holds **2-4 stacked colors**
  (red, purple, or orange -- the same three colors throughout). The
  topmost color is **active**; the rest are buried underneath, visible
  as smaller offset circles peeking out behind the active one.
- At the bottom of the screen you have **3 Current pieces** you can play
  right now, and **2 Upcoming pieces** you can see but not play yet, each
  showing its *complete* layer stack. The whole sequence is fixed ahead
  of time (not random), so what you see is genuinely useful for planning.
- **Tap a current piece** to select it, then **tap any empty board cell**
  to place it there -- there's no shape to fit; any piece fits any open
  cell. Hovering/tapping shows a green preview if the cell is open, red if
  it's already occupied.
- **Gravity**: after every placement, every piece that can fall does --
  straight down, within its own column, as one indivisible unit (its
  buried layers never separate from it). Columns never affect each other.
- **Clearing**: whenever 10 or more pieces with the *same active color*
  are connected (through any of a hex's 6 neighbors), that whole group's
  **top layer only** clears. Whatever was the second layer becomes active
  and stays right there on the board -- the piece isn't removed unless
  that was its last layer. If peeling a layer reveals a color that's now
  part of *another* 10+ connected group, that clears too, and so on (a
  cascade) -- clearing one color can reveal and immediately clear another.
  The first time this ever happens, the game pauses briefly to highlight
  the group and show "10+ CLEAR!" so the rule is obvious -- after that,
  clears just animate normally.
- **You win only when every board cell is empty** -- meaning every layer
  of every piece has been cleared, buried colors included. There's no
  score, no target percentage, nothing else.
- **You lose** if board cells remain occupied and either no piece you're
  holding can legally be placed (the board is completely full), or you
  run out of pieces entirely.
- **Undo** steps back through your whole move history, one move at a
  time, restoring the complete layered state (not just the active
  colors). **Restart** resets the puzzle to its starting position.

## HOW TO RUN IT

This is plain HTML/CSS/JavaScript with no build step and no dependencies.

1. Open the `ClearTen` folder.
2. Double-click `index.html` (or open it via File -> Open in your browser).
   That's it -- if your browser opens the file directly, you're playing.

If your browser blocks local file access for some reason (rare, but some
browsers restrict JavaScript modules from `file://` URLs -- this project
doesn't use modules, so it's unlikely to matter here), run a tiny local
server instead from a terminal in this folder:

```
python3 -m http.server 8000
```

Then open `http://localhost:8000` in your browser.

## PROJECT FILES

- `index.html` -- page structure.
- `style.css` -- all visual styling.
- `gamelogic.js` -- the pure game engine (hex grid, adjacency, layered
  pieces, gravity, clearing, cascades). No UI code, no rendering. Runs
  identically in the browser and in Node, which is what makes it testable.
  See the file header for the full layered-cell data model.
- `config.js` -- everything that defines the puzzle: colors, the clear
  threshold, and a `LEVELS` array (one level in this version) with its
  board shape, starting pieces, and predetermined piece sequence, plus a
  documented, verified solution. Tweak numbers here to experiment.
- `game.js` -- the browser UI: layered-token rendering, input handling,
  undo/restart, win/loss detection, animation timing.
- `tests.js` -- automated tests for `gamelogic.js`, runnable with
  `node tests.js` (no test framework, no npm install required).

## DEVELOPER NOTES

- **The layered data model**: a board cell is either `null` (empty) or
  `{ layers: [color, ...] }`, `layers[0]` being active. Every function
  that changes a cell replaces it with a brand-new object rather than
  mutating it in place, which is what lets Undo work with a cheap shallow
  clone instead of a deep one -- see the `gamelogic.js` file header.
- **Clearing only ever peels one layer**: `clearGroups` removes just
  `layers[0]` from each cell in a qualifying group; a cell becomes `null`
  only once its layer array is empty. It returns a `revealed` list (what's
  now on top of each affected cell, or `null` if the piece is gone) that
  the UI uses to show "I cleared red, and purple was underneath."
- **Gravity moves a whole piece as one unit** by relocating its entire
  `{layers}` object between slots -- there's no per-layer movement, so
  buried colors can never separate from their piece while falling.
- **A real SVG gotcha worth knowing about**: pieces render as nested
  `<g>` elements (an outer group for position, an inner one for pop-in/
  peel effects). Setting `el.style.transform = 'translate(x,y)'` on an SVG
  element silently does nothing without an explicit unit -- `px` is
  required, and on an SVG element it resolves to one local coordinate-
  system unit, not a screen pixel. This was caught by an actual browser
  test run, not by the Node test suite (which has no DOM), which is why
  a scripted Playwright pass matters as much as `node tests.js` does here.
- **Debug mode**: set `DEBUG = true` near the top of `game.js` to show,
  per cell, its `(col, slot)`, full layer sequence, and connected-group
  size, plus every legal placement cell for the selected piece and the
  queue position in the title bar. Not shown to normal players.
- **The level is hand-authored, not procedural**, and was built backward
  from a solved (empty) state using a Node sandbox to verify each wave
  against the real engine before committing to it. The full worked
  solution, and the reasoning behind why THIS mechanic specifically needs
  a clear-triggered cascade (not just stacking) to create a genuine "new
  connection" moment, is documented at length above the level definition
  in `config.js`. `tests.js` replays the solution through the real engine
  and separately proves the level's headline mechanic: peeling red
  reveals purple, which reaches 10 and clears, which reveals orange that
  was *already* connected to more orange revealed earlier -- clearing the
  entire board without one further placement.
- **The "buried color, not just active color" decision**: during the
  level's first wave, every empty cell in the growing red group looks
  equally good in the moment (they're all red, and red is all wave 1
  needs). Which cell you put a given piece into is what actually
  determines whether the automatic reveal-and-cascade chain works cleanly
  afterward or leaves a scattered mess to clean up by hand. `tests.js` has
  a test that swaps two pieces' target cells, confirms wave 1 still
  clears red either way, and shows the resulting board genuinely differs
  -- proving the buried color is what the placement choice affects, not
  the (identical either way) active one.

## WHAT TO TEST

Play through it a few times (use Restart freely) and pay attention to:

- Am I thinking about the buried colors, or only reacting to the active one?
- Do I place pieces differently because of what's underneath?
- Can I mentally plan 2-3 clears ahead?
- Does gravity make the future colors more interesting, now that a whole
  layered piece visibly falls and settles?
- Are the visible layer indicators (the offset circles) easy to read at a
  glance, on the board and in the piece queue?
- Does the game still feel like Tetris, or does the single-cell placement
  (no shape to fit) change that?
- Do cascades feel earned and understandable -- can you actually follow
  "that cleared, which revealed this, which then also cleared"?
- Does a bad placement create consequences you can recognize?
- Does clearing the entire board feel more satisfying now?
- Do you wish you could see more future information (deeper queue, more
  layers shown), or is what's visible now enough?

If you get stuck, Undo is there to help you rethink recent moves, and the
full solution is documented in `config.js` if you want to compare your
approach to a known-working one.
