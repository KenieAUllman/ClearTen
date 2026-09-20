# ClearTen (prototype v0.9)

A browser-based prototype of a mobile strategy puzzle game. The goal of
this build is **only** to test whether the core mechanic is fun -- it is
not a finished product. No accounts, ads, sound, procedural levels, or
monetization.

**V0.9 is a course-correction after V0.8 playtesting**, not a new
mechanic. Two things changed:

1. **Step Gravity is removed from normal play entirely.** V0.8 added a
   second gravity mode where an unsupported piece advanced one hex
   position per turn instead of falling straight to its resting spot.
   Playtesting verdict: *"I do NOT like pieces moving downward only one
   space per turn."* Every level now uses only the original **Settle
   Gravity** -- a piece placed, then every unsupported piece falls
   instantly, all the way, straight down within its own column. The
   turn order is: piece placed -> gravity resolves fully -> check Clear
   Ten -> clear qualifying groups & reveal buried colors -> gravity
   resolves fully again -> check again -> repeat until stable.
   `gamelogic.js` still exports `applyStepGravity` and
   `resolveCascadeStepGravity` (kept internally in case Step Gravity is
   revisited later), but nothing in `config.js` or `game.js` calls them
   anymore.
2. **Boards are wide, not tall, and pieces are layered much more often.**
   V0.7/V0.8 boards had drifted into tall, narrow, column-sorting shapes.
   Every V0.9 level is wider than it is tall, five of the six are one
   single continuous board (no separate pockets), and roughly half to
   three-quarters of each level's pieces now carry a buried color,
   ramping up level by level.

Everything else is unchanged from V0.7/V0.8: 3 colors, the clear
threshold (still exactly 10), 1-3 stacked layers per piece (never 4 in
any shipped level, though the engine still supports it), buried-color
reveals, full-board-clear victory, irregular board shapes, Restart, and
no player-facing Undo.

**Move count is no longer shown to the player.** The only success
condition is clearing the whole board -- not how few placements it took.
Move count is still tracked internally (Restart/debug use it), just never
rendered in the normal UI.

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
- Gravity is always **Settle Gravity**: after every placement, every
  unsupported piece falls all the way to its final resting position,
  instantly, straight down within its own column.
- **Clearing**: whenever 10 or more pieces with the *same active color*
  are connected, that whole group's **top layer only** clears, revealing
  whatever was buried underneath. A newly revealed color can immediately
  turn out to already be part of another 10+ group, clearing again in the
  same cascade.
- **You win a level only when every board cell is empty.** Clear a level
  and you'll see **LEVEL CLEARED** with a **Next Level** button -- except
  after Level 6, which shows **PROTOTYPE COMPLETE**.
- **You lose** if cells remain occupied and no current piece can legally
  be placed.
- **Restart** resets the level you're currently on. **Undo is not
  available in normal play** -- a bad placement is a real cost, and
  restarting with a new plan is the intended response to a mistake. (Undo
  is still there under the hood for debugging; see DEBUG MODE below.)
- A small row of numbered buttons under the title bar (**1 2 3 4 5 6**) is
  a developer convenience for jumping straight to any level while
  testing.

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

- `index.html` -- page structure: the small `#level-select` row, the
  board, the current-pieces tray, and a debug-only Undo button (hidden
  unless `DEBUG = true`). The move-count/gravity-mode indicators from
  V0.8 are gone -- the top bar now shows only the title and level name.
- `style.css` -- all visual styling.
- `gamelogic.js` -- the pure game engine (hex grid, adjacency, layered
  pieces, clearing, cascades). No UI code, no rendering. Runs identically
  in the browser and in Node. Unchanged from V0.8: still exports both
  `applyGravity`/`resolveCascade` (Settle Gravity, the only mode any
  level uses now) and `applyStepGravity`/`resolveCascadeStepGravity`
  (Step Gravity, preserved but unused).
- `config.js` -- everything that defines the puzzles: colors, the clear
  threshold, `layoutFromColumns` (lets each column have its own floor as
  well as height -- `height: 0` produces a true structural gap), and a
  `LEVELS` array of **6 levels**, each with its board shape, piece
  sequence, a verified solution, and design-rationale comments covering
  the key decision, the key insight, and the tempting mistake. No level
  sets `gravityMode` anymore -- every level uses Settle Gravity.
- `game.js` -- the browser UI: rendering, input handling, restart,
  win/loss detection, animation timing, level navigation, the developer
  level selector, and an internally-preserved but normally-hidden Undo.
  `runGravityAndCascadeThenCheckEnd` always calls `Logic.resolveCascade`
  now (no more branching on a level's gravity mode). `renderTopBar` no
  longer writes move count into the visible UI.
- `tests.js` -- automated tests for `gamelogic.js` (including the
  preserved Step Gravity engine mechanics, still tested directly even
  though unused by any level) and every level in `config.js`, including a
  mistake-replay test per level's documented trap, runnable with
  `node tests.js` (no framework, no npm install). Solvability is verified
  through the same 3-piece drawn-window queue mechanic the real UI uses
  (see DEVELOPER NOTES below), not just a naive positional replay.

## DEVELOPER NOTES

### The 3-piece "drawn window" queue, and why solution order isn't always sequence order

The player never sees the whole hidden `pieceSequence` -- only 3
"Current" slots at a time. Placing any one of the 3 visible pieces draws
the next undrawn piece from `pieceSequence` into that same slot. This
means a level's `solution` array does **not** have to place pieces in
the same order they appear in `pieceSequence` -- it only has to place
pieces that have already been drawn. Level 6, for example, queues its
two `TRAP_A` pieces early in `pieceSequence` (so a player considering the
board mid-game already has them in hand) but its verified solution
delays placing them until after `O1`, matching how a player would
actually hold a piece back strategically. `tests.js`'s `replaySteps`
models this "drawn window" exactly, rather than assuming index-for-index
positional order -- an earlier draft of Level 6's solution and one of its
`R7`/col7-height assumptions failed this exact check (a piece the
solution tried to place hadn't been drawn into the queue yet, and
separately, one red piece was mathematically redundant -- the connected
red group already reached the threshold one piece earlier). Both were
caught by replaying the real engine, not by hand-counting, and fixed
before this version shipped.

### The "seam" trap pattern

Reused across every level with a documented tempting mistake (3-6): a
piece with a buried color must be placed in the ONE cell/column that
structurally touches the next region (the seam), not in a visually
similar dead-end that's 2+ columns away and can therefore never connect,
regardless of how gravity resolves. Hex adjacency only ever spans one
column step -- columns 2+ apart are structurally never adjacent, no
matter the heights involved -- which is what makes a dead-end truly dead
rather than just currently inconvenient.

### The "empty cell breaks the chain" bug (and its fix)

A recurring failure mode, hit and fixed twice while building this
version (Level 1's column 4, and Level 6's `O1`): if a *plain*
(single-layer) piece sits in a column structurally between two regions
that need to stay connected after a reveal, that piece's cell goes fully
empty the moment its own color clears -- severing the chain between the
regions on either side of it, even though they were never more than one
column apart. The fix is always the same: any "bridge" cell between two
chained regions must itself carry a buried layer (be at least 2 layers),
so it keeps occupying its cell (revealing the next color) instead of
vanishing when its top layer clears.

### Debug mode

Set `DEBUG = true` near the top of `game.js` to show, per cell, its
`(col, slot)`, full layer sequence, and connected-group size; every legal
placement cell for the selected piece; the current level number, hidden
piece sequence position, and move count (appended into the level-name
text, since it's no longer shown by default); the current piece choices
and full documented solution logged to the console on every level load;
and **the Undo button**, hidden from normal play but fully functional
underneath.

### A real SVG gotcha worth knowing about

(Carried over from V0.4 onward, still relevant): pieces render as nested
`<g>` elements because setting `el.style.transform = 'translate(x,y)'` on
an SVG element silently does nothing without an explicit unit -- `px` is
required, and on an SVG element it resolves to one local
coordinate-system unit, not a screen pixel.

## V0.9 LEVEL DESIGN REPORT

### LEVEL 1: Wide Open Introduction (Easy)
**BOARD SHAPE:** 7 columns, all floor 0, height 2 -- a flat, fully
continuous, shallow rectangle. No funnels, no dead ends.
**LAYERED PIECE RATE:** 7/13 = 54%.
**KEY DECISION:** none forced -- broad placement freedom while the player
learns the basic loop.
**KEY INSIGHT:** a buried color isn't decoration -- purple clears first
and reveals orange underneath, which is what actually finishes the
board.
**TEMPTING MISTAKE:** none by design -- deliberately forgiving.
**VERIFIED SOLUTION:** 13 placements; `level1.solution` in `config.js`.

### LEVEL 2: Layer Introduction (Easy-medium)
**BOARD SHAPE:** 8 columns, floor 0, heights alternating
`[2,3,2,3,2,3,2,3]` -- a wide, gently undulating, fully continuous board.
**LAYERED PIECE RATE:** 10/20 = 50%.
**KEY DECISION:** none forced -- a clean, forgiving 3-color relay.
**KEY INSIGHT:** a piece's buried color is the NEXT wave, not decoration.
Purple clears to reveal orange, orange clears to reveal red -- the
relay makes "this piece becomes something else later" concrete.
**TEMPTING MISTAKE:** none by design.
**VERIFIED SOLUTION:** 20 placements, 3 cascade events (purple, orange,
red); `level2.solution` in `config.js`.

### LEVEL 3: Uneven Floor (Medium)
**BOARD SHAPE:** 7 columns, floors `[1,1,0,0,0,1,1]` -- a shallow,
symmetric dip, wide and fully continuous (2 extra columns of open width
aren't needed by the solution).
**LAYERED PIECE RATE:** 8/12 = 67%.
**KEY DECISION:** where does the last purple piece (`TRAP`, buried
orange) go -- the dead-end column 0, or the single-cell seam at the
bottom of the dip?
**KEY INSIGHT:** column 0 and the seam both look like valid purple
territory right now, but only the seam structurally touches the orange
side. Horizontal position determines what a buried color can ever reach.
**TEMPTING MISTAKE:** verified -- placing `TRAP` in the column 0 dead end
instead of the seam leaves the board unsolvable.
**VERIFIED SOLUTION:** 12 placements, 2 cascade events; `level3.solution`
in `config.js`.

### LEVEL 4: Horizontal Tradeoffs (Medium)
**BOARD SHAPE:** 7 columns, floors `[1,1,0,0,0,0,1]` -- a wide, slightly
asymmetric dip, fully continuous.
**LAYERED PIECE RATE:** 10/18 = 56%, including 2 three-layer pieces.
**KEY DECISION:** two 3-layer `TRAP` pieces must land in the 2-cell seam,
not the column 0 dead end -- and which cells in each region are layered
vs. plain determines whether the *next* color in the relay even has a
route forward.
**KEY INSIGHT:** Level 3's insight applied across a full 3-color relay
(purple -> orange -> red) instead of 2 -- a placement that's currently
strong for purple can be structurally wrong for the red that eventually
needs to pass through that same cell.
**TEMPTING MISTAKE:** verified -- swapping a `TRAP` piece into the column
0 dead end leaves the board unsolvable.
**VERIFIED SOLUTION:** 18 placements, 3 cascade events; `level4.solution`
in `config.js`.

### LEVEL 5: Layered Strategy (Medium-hard)
**BOARD SHAPE:** 7 columns, floors `[3,0,0,0,0,0,1]` -- a wide,
*asymmetric* slope (steep on the left, gentle on the right), visually
distinct from Level 3/4's symmetric dip, fully continuous.
**LAYERED PIECE RATE:** 10/18 = 56%, including 2 three-layer pieces.
**KEY DECISION:** the same shape of choice as Level 4, restyled on a
visually distinct silhouette with denser flank regions.
**KEY INSIGHT:** the reasoning generalizes across different board
shapes -- it was never about memorizing one silhouette, it's about
reading any board for which cells structurally connect onward.
**TEMPTING MISTAKE:** verified -- swapping a `TRAP1` piece into the
column 0 dead end leaves the board unsolvable.
**VERIFIED SOLUTION:** 18 placements, 3 cascade events (purple, then
orange, then red, confirmed in that exact order by `tests.js`);
`level5.solution` in `config.js`.

### LEVEL 6: Signature ClearTen Test (Hard but fair)
**BOARD SHAPE:** 10 columns (the widest board), floors
`[1,0,0,0,0,0,0,1,1,1]` with a true one-column gap (`col8`, height 0) --
mostly one continuous landscape, plus a single isolated one-cell decoy
(`col9`) that is never adjacent to anything the player needs.
**LAYERED PIECE RATE:** 10/18 = 56%, including 2 three-layer pieces.
**KEY DECISION:** TWO independent decisions, not one. `TRAP_A` (3-layer:
purple/orange/red) must go in the main seam, not the column 0 dead end.
Separately, `TRAP_B` (2-layer: orange/red) must go in its own correct
cell (column 5), not the tempting, equally-reachable isolated decoy at
column 9.
**KEY INSIGHT:** the player has to track current color, buried color,
and where the piece will physically rest, for TWO different regions of
the board at once -- getting either decision wrong strands a different
part of the chain, and each failure is independent of the other.
**TEMPTING MISTAKE:** verified -- EITHER trap piece misrouted into its
own decoy independently leaves the board unsolvable; the other decision
being correct doesn't save it.
**VERIFIED SOLUTION:** 18 placements, 3 cascade events; `level6.solution`
in `config.js`.

## PLAYTEST WITHOUT READING THE SOLUTIONS FIRST

Play all six levels before looking at `config.js`. While you play,
notice:

- Do the boards feel more spread out and spatial, rather than like a
  narrow vertical column-sort?
- Do the levels feel less vertically repetitive than V0.8's?
- Does Settle Gravity (the only mode now) feel better than V0.8's Step
  Gravity did?
- Are layered pieces common enough now -- or, on the other end, do they
  ever feel like too much at once?
- Do the early levels (1-2) feel approachable, not overwhelming?
- Does horizontal placement genuinely matter to the outcome, not just
  "which column has room"?
- When you make a mistake, do you recognize *why* it was a mistake, or
  does it feel arbitrary?
- Do the later levels (4-6) require thinking about buried/future colors,
  not just the piece in front of you?
- Which board shape (flat rectangle, symmetric dip, asymmetric slope,
  wide board with a gap) felt best to play on?
- Does Level 6 feel closer to what ClearTen's core identity should be
  than Level 1 does?

**Most important**: the goal of V0.9 is to find out whether committing to
one gravity mode and redesigning around width, continuity, and layering
actually fixed what V0.8 playtesting flagged -- not to add anything new.
If a level still feels like "just pick a column," that's exactly the
signal this prototype exists to surface.
