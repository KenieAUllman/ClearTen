# ClearTen (prototype v0.2)

A browser-based prototype of a mobile strategy puzzle game. The goal of
this build is **only** to test whether the core mechanic is fun -- it is
not a finished product. No accounts, ads, sound, procedural levels, or
anything beyond the two hand-authored puzzles.

## HOW TO PLAY

- The board is a hex grid with an irregular (hexagon-shaped) outline. Each
  filled hex holds one colored token: **red**, **purple**, or **orange**.
- At the bottom of the screen you have **3 Current pieces** you can play
  right now, and **2 Upcoming pieces** you can see but not play yet. The
  whole sequence of pieces for this puzzle is fixed ahead of time (not
  random), so what you see is genuinely useful information for planning.
- **Tap a current piece** to select it (it highlights). **Tap a spot on the
  board** to place it there. While a piece is selected, hovering/tapping
  the board shows a green preview if the placement is legal, or red if it
  isn't (out of bounds, or overlapping an existing token).
- When you use a piece, the next piece in the sequence slides into that
  slot, and a new one appears in the Upcoming preview.
- **Gravity**: after every placement, every token that can fall does --
  straight down, within its own column, animated so you can actually see
  it happen. Columns never affect each other -- if you place something in
  one column, nothing shifts in the column next to it.
- **Clearing**: whenever 10 or more tokens of the *same color* are
  connected (through any of a hex's 6 neighbors), that whole group clears
  at once. If clearing exposes another qualifying group after gravity
  resettles the board, that clears too, and so on (a cascade). The first
  time this ever happens, the game pauses briefly to highlight the group
  and show "10+ CLEAR!" so the rule is obvious -- after that, clears just
  animate normally.
- **You win a level only when its board is entirely empty.** There's no
  score, no target percentage, nothing else. Clear Level 1 and a "Next
  Level" button takes you to Level 2; clear Level 2 and you've finished
  the prototype.
- **You lose** if tokens remain on the board and either no piece you're
  currently holding can legally be placed anywhere, or you run out of
  pieces entirely.
- **Undo** steps back through your whole move history, one move at a
  time. **Restart** resets the *current* level to its starting position.

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
- `gamelogic.js` -- the pure game engine (hex grid, adjacency, piece
  placement, gravity, clearing, cascades). No UI code, no rendering. Runs
  identically in the browser and in Node, which is what makes it testable.
- `config.js` -- everything that defines the puzzles: colors, the clear
  threshold, and a `LEVELS` array where each level has its own board
  shape, starting tokens, and predetermined piece sequence (plus a
  documented, verified solution). Tweak numbers here to experiment with
  the rules, or add a `LEVELS[2]` to try a third level.
- `game.js` -- the browser UI: rendering, input handling, undo/restart,
  win/loss detection, animation timing.
- `tests.js` -- automated tests for `gamelogic.js`, runnable with
  `node tests.js` (no test framework, no npm install required).

## DEVELOPER NOTES

- **Coordinate system**: the board uses flat-top hexagons stored as
  `(col, slot)` offset coordinates (`slot` 0 = bottom of that column).
  Piece shapes are defined in axial coordinates internally so they're
  translation-invariant. All of this is explained in comments at the top
  of `gamelogic.js`.
- **Gravity** is strictly per-column (tokens fall straight down, columns
  never interact) -- chosen deliberately for predictability over a more
  "realistic" but confusing all-directions hex gravity.
- **Debug mode**: set `DEBUG = true` near the top of `game.js` to show
  `(col, slot)` coordinate labels on every board hex. Not shown to normal
  players.
- **The level is hand-authored, not procedural**, and was built backward
  from a solved (empty) state. The full worked solution -- which piece
  goes where, in what order, and why -- is documented as `SOLUTION` in
  `config.js`, and `tests.js` replays it through the real engine to prove
  the puzzle is actually solvable (not just "probably fine").
- One non-obvious design fix worth knowing about: the win condition
  ("board completely empty") is checked after *every* move, and Level 1
  is built around clearing color groups in waves. Early on, a wave
  clearing perfectly could leave the board *entirely* empty before all the
  pieces were used -- which the game would (correctly, per the rules)
  immediately score as a win, well before the puzzle was meant to end.
  The fix was adding a single "seed" token (`S1` in the sequence) that
  sits untouched in an unused column between waves, so the board always
  has something on it until the final piece. `tests.js` has a regression
  test guarding against this specific failure mode.
- **v0.2 gravity fix**: `gamelogic.js`'s `resolveCascade` used to only call
  `applyGravity` *inside* the "a group qualifies" loop -- so any placement
  that didn't immediately trigger a clear left its tokens exactly where
  they were clicked, never settling. Gravity now always runs once right
  after a placement, clear-or-not, and `computeGravityMoves()` lets the UI
  animate exactly which tokens fell and how far, rather than snapping the
  board to its settled state. `tests.js` has regression tests for both.
- **Level 2's design goal isn't "harder," it's answering a specific
  question**: does predictable, per-column gravity actually create
  interesting planning? The long comment above `level2` in `config.js`
  walks through why (per-column, immediate-settle gravity can only create
  a *brand new* connection through a clear-triggered cascade, not simple
  stacking) and documents the verified 12-move solution in full, including
  the deliberate "obvious empty cell, wrong to use it" trap.

## WHAT TO TEST

Play through both levels a few times (use Restart freely) and pay
attention to:

- Did placing pieces require actual thought, or did it feel automatic?
- Could you reasonably predict what gravity would do before you placed a
  piece? Could you actually *see* it happen now?
- Did the 3 current + 2 upcoming pieces give you enough information to
  plan ahead, or did you want to see more/less?
- Did groups of 10 feel like the right size to aim for -- too easy, too
  hard, or about right?
- Did clearing the whole board feel satisfying? Did the first-time "10+
  CLEAR!" explanation make the rule clear without getting in the way on
  later clears?
- When you lost, did it feel like your mistake, or like the game's fault?
- Did the board ever feel too crowded or cramped?
- **Level 2 specifically**: did you notice the two separated red tokens at
  the start? Did watching one drop and connect to the other (after a
  *different* color's group cleared) feel like a genuine "aha," or was it
  confusing? Did you get tempted to place an upcoming piece into open
  middle-column space before you needed to -- and if you did, what
  happened?
- Did you wish you could see further ahead in the piece queue?
- Did you find yourself discovering strategies naturally as you played?

If you get stuck, Undo is there to help you rethink recent moves, and the
full solution for both levels is documented in `config.js` if you want to
compare your approach to a known-working one.
