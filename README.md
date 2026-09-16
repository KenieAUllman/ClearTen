# ClearTen (prototype v0.7)

A browser-based prototype of a mobile strategy puzzle game. The goal of
this build is **only** to test whether the core mechanic is fun -- it is
not a finished product. No accounts, ads, sound, procedural levels, or
monetization.

**V0.7 does not change a single rule.** V0.6 proved the core mechanic
could carry five distinct puzzles using split/separated boards (a short
bridge, a shared column, a one-cell gate, disconnected pockets). This
version asks a sharper question: can the SAME mechanics produce genuine
"I SEE IT NOW" moments on boards that are mostly **one continuous mass**,
without leaning on structural separation as the trick? Colors, the clear
threshold (still exactly 10), piece layering, gravity, and win/loss
conditions are all identical to V0.6. What changed: **five brand-new
levels** built around discoverable insights rather than terrain gating,
and **Undo is no longer part of normal play** -- a meaningful mistake now
costs a Restart, not a free rewind (Undo still exists internally and is
reachable in debug mode).

## HOW TO PLAY

- Every piece occupies **one hex cell** and holds **1-3 stacked colors**
  (red, purple, or orange). The topmost color is **active** -- drawn as
  one large, dominant circle. Anything buried underneath shows as tiny
  ordered dots beneath it.
- You see only **3 Current pieces** -- no Upcoming preview. When you use
  one, the next piece from a hidden, predetermined sequence fills that
  slot.
- **Tap a current piece** to select it, then **tap any empty board cell**
  to place it there.
- **Gravity**: after every placement, every piece that can fall does --
  straight down, within its own column, as one indivisible unit. A
  column's occupied cells always compact toward its own floor, in the
  order they were placed -- clicking a cell higher up just means the
  piece falls to the next open slot below it.
- **Clearing**: whenever 10 or more pieces with the *same active color*
  are connected, that whole group's **top layer only** clears, revealing
  whatever was buried underneath. A newly revealed color can immediately
  turn out to already be part of another 10+ group, clearing again in the
  same cascade.
- **You win a level only when every board cell is empty.** Clear a level
  and you'll see **LEVEL CLEARED** with a **Next Level** button -- except
  after Level 5, which shows **PROTOTYPE COMPLETE**.
- **You lose** if cells remain occupied and no current piece can legally
  be placed.
- **Restart** resets the level you're currently on. **Undo is not
  available in normal play this version** -- a bad placement is a real
  cost, not something to casually rewind. (It's still there under the
  hood for debugging; see DEBUG MODE below.)
- A small row of numbered buttons under the title bar (**1 2 3 4 5**) is a
  developer convenience for jumping straight to any level while testing.
  It's deliberately plain -- not part of the intended play experience.

## THE FIVE LEVELS

See **LEVEL DESIGN REPORT** below for the concept/insight/mistake/solution
for each one. All five are hand-authored (not procedural) and verified
end-to-end by `tests.js`: the documented solution is replayed through the
real engine and confirmed to empty the board without ever doing so early,
AND the documented tempting mistake is separately replayed and confirmed
to leave the board **unsolvable** -- the temptation is a real trap, not
just narrated.

At least 3 of the 5 boards are **one continuous connected mass** -- no
structural cut anywhere on them at all (verified: every cell is reachable
from every other cell via hex adjacency, ignoring color). The difficulty
comes entirely from WHICH cell a buried color ends up in, WHETHER a
completing piece's surroundings are ready yet, and WHERE gravity will
carry a piece once something clears beneath it -- not from a board that's
impossible to read or from extra pieces/colors.

## HOW TO RUN IT

This is plain HTML/CSS/JavaScript with no build step and no dependencies.

1. Open the `ClearTen` folder.
2. Double-click `index.html` (or open it via File -> Open in your browser).
   That's it -- if your browser opens the file directly, you're playing.

If your browser blocks local file access for some reason, run a tiny
local server instead from a terminal in this folder:

```
python3 -m http.server 8000
```

Then open `http://localhost:8000` in your browser.

## PROJECT FILES

- `index.html` -- page structure, including the small `#level-select` row
  and a debug-only Undo button (hidden unless `DEBUG = true`).
- `style.css` -- all visual styling.
- `gamelogic.js` -- the pure game engine (hex grid, adjacency, layered
  pieces, gravity, clearing, cascades). No UI code, no rendering. Runs
  identically in the browser and in Node. **Unchanged since V0.4.**
- `config.js` -- everything that defines the puzzles: colors, the clear
  threshold, a `layoutFromColumns` helper (V0.7: lets each column have its
  own floor as well as height, for genuinely irregular continuous
  boards), and a `LEVELS` array of **5 levels**, each with its board
  shape, piece sequence, verified solution, and design-rationale comments
  covering the key insight and the tempting mistake.
- `game.js` -- the browser UI: rendering, input handling, restart,
  win/loss detection, animation timing, level navigation, the developer
  level selector, and (V0.7) an internally-preserved but normally-hidden
  Undo.
- `tests.js` -- automated tests for `gamelogic.js` and every level in
  `config.js`, including a mistake-replay test per level, runnable with
  `node tests.js` (no framework, no npm install).

## DEVELOPER NOTES

- **The layered data model, gravity-moves-a-whole-piece behavior, and the
  clear threshold (exactly 10)** are all unchanged from V0.4-V0.6. See
  `gamelogic.js`'s file header for the full explanation.
- **Continuous boards via `layoutFromColumns`**: V0.6's levels used a
  too-short (or height-0) column to structurally CUT a board into
  separate regions. V0.7 mostly avoids that -- `layoutFromColumns` lets
  each column keep its own contiguous slot range starting at any FLOOR,
  which is enough to build a bowl, a staircase, a tower, or an asymmetric
  skyline that stays fully connected end to end. Levels 1-3 and 5 are (or
  are almost entirely) one continuous mass; only a couple of small,
  deliberately placed decoy/pocket regions in Levels 3 and 5 are
  color-isolated on purpose (see their design notes in `config.js`).
- **Every level was designed backward from a known solved state** using a
  Node sandbox harness that replays a hand-built solution through the
  real engine before committing to it. This process caught real design
  bugs: an early version of Level 1's trap piece turned out to be
  rescuable by gravity no matter where it was placed (column 1's floor
  happened to touch the seam too); an early Level 2 mistake test turned
  out to be recoverable because a later piece re-chained the stranded one
  through the same column. Both were only caught by actually running the
  mistake through the engine, not by reasoning about it -- which is why
  `tests.js` replays the documented mistake for every level, not just the
  documented solution.
- **Debug mode**: set `DEBUG = true` near the top of `game.js` to show,
  per cell, its `(col, slot)`, full layer sequence, and connected-group
  size; every legal placement cell for the selected piece; the current
  level number and hidden-sequence queue position in the title bar;
  the current piece choices and full documented solution logged to the
  console on every level load; and **the Undo button**, which is hidden
  from normal play this version but fully functional underneath (the
  history stack and `onUndo` were never removed -- only `renderControls`
  now gates the button's visibility on `DEBUG`).
- **The developer level selector** is intentionally plain -- small
  numbered buttons, no icons, no completion state beyond which one is
  active. Purely a testing convenience.
- **A real SVG gotcha worth knowing about** (carried over from V0.4-V0.6,
  still relevant): pieces render as nested `<g>` elements because setting
  `el.style.transform = 'translate(x,y)'` on an SVG element silently does
  nothing without an explicit unit -- `px` is required, and on an SVG
  element it resolves to one local coordinate-system unit, not a screen
  pixel.

## LEVEL DESIGN REPORT

### LEVEL 1: Deceptive Simple
**BOARD CONCEPT:** A symmetric bowl, one continuous board (floors
`[2,1,0,1,2]`, heights `[3,4,5,4,3]`) -- every cell reachable from every
other cell. Columns 1 and 3 are pre-filled (purple/orange); the player
fills column 0, column 4, and the bowl's floor (column 2).
**KEY INSIGHT:** `TRAP` is a `[purple, orange]` piece. All three of
column 2's purple cells also border column 3's orange -- it isn't about
finding one exact magic cell, it's about recognizing that the bowl's
FLOOR (not the flanks) is where a buried color pays off.
**TEMPTING MISTAKE:** Placing TRAP in a flank cell instead of the floor.
Verified: this leaves orange permanently stuck at 9/10.
**EXPECTED DIFFICULTY:** Medium (gentle, introductory).
**VERIFIED SOLUTION:** 8 placements; documented in `config.js` as
`level1.solution`. `tests.js` replays both the solution and the mistake.

### LEVEL 2: Delay the Clear
**BOARD CONCEPT:** A smooth 5-column rising staircase, one continuous
board. Columns 0-1 (purple) and columns 3-4 (orange) each need one more
cell; that tenth cell for BOTH colors lives in column 2, whose lower 3
cells are orange support and whose top cell is `DELAY`, a `[purple,
orange]` piece.
**KEY INSIGHT:** Column 2's cells look like generic empty space -- any
piece could go there. But DELAY only stays at the top (where it touches
column 3) if the support cells beneath it are occupied by something that
ISN'T also clearing in the same event as purple. Route purple to columns
0-1 and keep column 2's lower cells orange; don't spend purple pieces
there just because it's open space.
**TEMPTING MISTAKE:** Using plain purple pieces on column 2's support
cells (rerouting the spare orange pieces into column 1 instead).
Verified: DELAY ends up isolated from the rest of purple's own group, and
the board is permanently unsolvable even though the raw color counts
still add up to 10.
**EXPECTED DIFFICULTY:** Medium.
**VERIFIED SOLUTION:** 19 placements; `level2.solution` in `config.js`.

### LEVEL 3: Gravity Routing
**BOARD CONCEPT:** An asymmetric continuous board -- a tall orange target
(column 0) beside two identical-looking purple stacks: column 1
(adjacent) and column 2 (floor 2, two columns from column 0).
**KEY INSIGHT:** Both stacks are the same height, same shape, same
colors, and both LOOK equally promising. Hex adjacency only ever spans
one column step, so column 2 can never reach column 0 no matter how it's
stacked or how gravity settles it. The insight is recognizing WHICH
column is even structurally capable of this, when both look identical.
**TEMPTING MISTAKE:** Placing the buried-orange `ROUTE` piece in column 2
instead of column 1. Verified: both colors end up permanently short.
**EXPECTED DIFFICULTY:** Medium-hard.
**VERIFIED SOLUTION:** 19 placements; `level3.solution` in `config.js`.

### LEVEL 4: Cascade Setup
**BOARD CONCEPT:** A "tower" board, one continuous mass: orange (column
0) -- a 10-cell purple tower (column 1) -- red (column 2).
**KEY INSIGHT:** The tower's bottom-to-top order is 6 plain purple, a
buried-orange piece, 2 more plain purple, then a buried-red piece --
entirely purple, enough on its own to complete purple's group. When it
clears, the two buried pieces are the only survivors and compact to the
column's floor, which (verified) touches BOTH neighbors at once -- orange
and red reach 10 and clear TOGETHER, in the same cascade, from that one
purple clear. The payoff is spotting, before it happens, that finishing
this one column triggers three separate colors in a chain.
**TEMPTING MISTAKE:** None separately verified for this level (the whole
point is the payoff, not a trap) -- but any piece spent outside the three
intended columns would simply be extra territory with no way to
contribute, since there is nowhere else to place it that helps.
**EXPECTED DIFFICULTY:** Hard.
**VERIFIED SOLUTION:** 28 placements; `level4.solution` in `config.js`.
`tests.js` confirms the cascade is exactly 2 events -- purple, then
orange AND red together.

### LEVEL 5: Signature Puzzle
**BOARD CONCEPT:** Combines Level 4's tower-cascade with Levels 1/3's
wrong-tower decoy on one asymmetric board: an orange target, a real
10-cell purple tower right beside it, and -- two columns further out -- a
smaller decoy tower dressed identically (a purple stack topped with its
own buried-orange piece).
**KEY INSIGHT:** The decoy tower is two columns from the orange target,
so its purple can never be part of the same connected group as the real
tower's -- it would need its own 10 to ever clear, and it only has 6
cells, so anything spent there is unrecoverable. The signature moment is
recognizing that the decoy isn't overflow space or a second opportunity;
it's a complete dead end dressed up to look exactly like the real thing.
**TEMPTING MISTAKE:** Placing the final buried-orange `ROUTE` piece in
the decoy tower instead of finishing the real one. Verified: purple gets
permanently stuck one cell short in the real tower, and the board is
unsolvable.
**EXPECTED DIFFICULTY:** Hard.
**VERIFIED SOLUTION:** 19 placements; `level5.solution` in `config.js`.

## PLAYTEST WITHOUT READING THE SOLUTIONS FIRST

Play all five levels before looking at `config.js`. While you play,
notice:

- Did you ever suddenly understand what the puzzle wanted from you?
- Was the insight discoverable rather than arbitrary?
- Did you sometimes intentionally delay a clear?
- Did you make placements based on colors that were still buried?
- Did gravity create plans several moves ahead?
- Were there several plausible choices, not just one obvious path?
- Were failures clearly attributable to your own decisions?
- Which level produced the strongest "I see it" moment?
- Which level felt clever? Which one merely felt difficult?
- Did removing Undo make mistakes more meaningful, or just annoying?
- Did you want to immediately Restart after a loss, or did it feel
  tedious?

**Most important**: if a level ever feels too easy, that's a note about
level DESIGN, not a request for a new mechanic. V0.7 exists to learn how
to build ClearTen levels that produce discovery, foresight, and a
satisfying realization -- without adding a single new rule.
