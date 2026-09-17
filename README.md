# ClearTen (prototype v0.8)

A browser-based prototype of a mobile strategy puzzle game. The goal of
this build is **only** to test whether the core mechanic is fun -- it is
not a finished product. No accounts, ads, sound, procedural levels, or
monetization.

**V0.8 adds exactly one new dimension: pieces can move THROUGH the board
over time.** V0.7 playtesting found that even with varied board shapes,
most levels reduced to the same question -- "which column?" -- because
Settle Gravity resolves a placement instantly. This version adds a second
gravity mode, **Step Gravity**, where an unsupported piece advances
exactly one hex position per player turn instead of falling straight to
its final resting spot. Everything else is locked: colors, the clear
threshold (still exactly 10), piece layering, buried-color reveals,
full-board-clear victory, irregular board shapes, Restart, and no
player-facing Undo are all unchanged from V0.7. The original gravity is
now called **Settle Gravity** internally, and one level (the control)
still uses it, purely for comparison.

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
- **Gravity mode** is shown in the top-right corner of every level:
  - **Settle Gravity** (the original behavior): after every placement,
    every unsupported piece falls all the way to its final resting
    position, instantly, straight down within its own column.
  - **Step Gravity** (new in V0.8): after every placement, every
    unsupported piece advances by exactly **one** hex position -- no
    further. A piece dropped near the top of a tall column takes several
    turns (one per placement anywhere on the board, not just in that
    column) to actually arrive at the bottom. Watch it travel.
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
  available in normal play** -- a bad placement is a real cost. (It's
  still there under the hood for debugging; see DEBUG MODE below.)
- A small row of numbered buttons under the title bar (**1 2 3 4 5**) is a
  developer convenience for jumping straight to any level while testing.

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

- `index.html` -- page structure, including the small `#level-select` row,
  the gravity-mode indicator, and a debug-only Undo button (hidden unless
  `DEBUG = true`).
- `style.css` -- all visual styling.
- `gamelogic.js` -- the pure game engine (hex grid, adjacency, layered
  pieces, clearing, cascades). No UI code, no rendering. Runs identically
  in the browser and in Node. **V0.8 adds `applyStepGravity` and
  `resolveCascadeStepGravity`** alongside the original (now documented as
  "SETTLE GRAVITY") `applyGravity`/`resolveCascade` -- both coexist, and
  every function from V0.4-V0.7 is unchanged.
- `config.js` -- everything that defines the puzzles: colors, the clear
  threshold, `layoutFromColumns` (lets each column have its own floor as
  well as height), and a `LEVELS` array of **5 levels**, each declaring a
  `gravityMode` (`'settle'` or `'step'`, defaulting to `'settle'` if
  omitted) plus its board shape, piece sequence, verified solution, and
  design-rationale comments covering the key insight and the tempting
  mistake.
- `game.js` -- the browser UI: rendering, input handling, restart,
  win/loss detection, animation timing, level navigation, the developer
  level selector, the gravity-mode indicator, and an
  internally-preserved but normally-hidden Undo. `runGravityAndCascadeThenCheckEnd`
  picks `resolveCascadeStepGravity` or `resolveCascade` based on the
  current level's `gravityMode` -- everything downstream (animation,
  win/loss checking) is identical either way, since both functions return
  the same `{board, events}` shape.
- `tests.js` -- automated tests for `gamelogic.js` (including Step
  Gravity's engine mechanics directly) and every level in `config.js`,
  including a mistake-replay test per level, runnable with `node tests.js`
  (no framework, no npm install).

## DEVELOPER NOTES

### Step Gravity: the exact turn order

Per player turn, once a piece is placed:

1. **Immediate clear check** on the board exactly as placed (no movement
   yet) -- a piece can complete a group by landing directly in a
   connected spot, same as Settle Gravity.
2. **Exactly one call to `applyStepGravity`** -- every unsupported piece
   (the slot below it, in its own column, is empty) advances by
   precisely one slot. This is the *only* movement in the whole turn.
3. **Cascade**: check for newly-qualifying groups created by that one
   step, clear/reveal/re-check to a fixed point -- but **without** calling
   `applyStepGravity` again. A reveal that empties a cell leaves whatever
   was above it merely unsupported; it advances on the player's *next*
   turn, not later in this same cascade. This is deliberate: movement
   stays tied to player turns, never to cascades, so it can never run
   away or repeat unexpectedly (verified in `tests.js`).

### Why this resolution order is deterministic (no movement conflicts)

Step Gravity decides which pieces are "unsupported" entirely from a
single snapshot of the board taken before that turn's movement -- never
from in-progress results of the same call. Concretely: a piece with an
empty slot below it (in its own column, in the snapshot) moves down one
slot; everything else stays. This makes conflicts structurally
impossible without any special-case rule: a piece sitting directly above
another is, by definition, supported (something is still below it in the
snapshot) and does not move that turn -- it waits for the piece below it
to move away first, then becomes unsupported on a *later* turn. It's an
ordinary "conga line" fall, one link closing per turn. Different columns
never interact with each other at all (movement is strictly vertical,
within a column, exactly like Settle Gravity), so there's no cross-column
case to resolve either. The player can always predict it: count how many
empty slots are directly below a piece, in its own column, right now --
that's exactly how many more turns (of placements ANYWHERE on the board,
not just that column) it will take to land.

### Animation

Step Gravity reuses the exact same `animateFall`/`computeGravityMoves`
machinery Settle Gravity already used -- a one-slot move is just a
shorter, quicker version of the same falling animation, so it reads as
"this piece advanced" rather than "the board reset." No new animation
code was needed.

### Debug mode

Set `DEBUG = true` near the top of `game.js` to show, per cell, its
`(col, slot)`, full layer sequence, and connected-group size; every legal
placement cell for the selected piece; the current level number,
gravity mode, and hidden-sequence queue position; the current piece
choices and full documented solution logged to the console on every
level load; and **the Undo button**, hidden from normal play but fully
functional underneath.

### A real SVG gotcha worth knowing about

(Carried over from V0.4-V0.7, still relevant): pieces render as nested
`<g>` elements because setting `el.style.transform = 'translate(x,y)'` on
an SVG element silently does nothing without an explicit unit -- `px` is
required, and on an SVG element it resolves to one local
coordinate-system unit, not a screen pixel.

## V0.8 LEVEL DESIGN REPORT

### LEVEL 1: Control
**GRAVITY MODE:** Settle.
**BOARD CONCEPT:** A tower + decoy puzzle (same family as V0.7's
signature Level 5) -- a baseline for comparing against the four Step
Gravity levels that follow.
**KEY INSIGHT:** Column 1's tower (9 plain purple + one buried-orange
`ROUTE` piece) is the only way to complete purple; column 3's decoy
tower looks identical but is two columns from the orange target and can
never reach it.
**DELAYED CLEAR?:** No.
**TEMPTING MISTAKE:** Placing `ROUTE` in the decoy instead of finishing
the real tower. Verified: the board becomes unsolvable.
**VERIFIED SOLUTION:** 19 placements; `level1.solution` in `config.js`.

### LEVEL 2: Step Gravity Introduction
**GRAVITY MODE:** Step.
**BOARD CONCEPT:** A wide, uniform, shallow board -- 5 columns, all the
same floor and height, no funnel.
**KEY INSIGHT:** A piece placed near the top doesn't teleport to its
final spot -- it takes visible, countable turns to arrive. There are far
more total turns than any single piece needs, so exact ordering barely
matters; this level exists purely to let the player watch movement
happen and learn to predict it.
**DELAYED CLEAR?:** No.
**TEMPTING MISTAKE:** None by design -- deliberately forgiving.
**VERIFIED SOLUTION:** 10 placements; `level2.solution` in `config.js`.

### LEVEL 3: Crossing Paths
**GRAVITY MODE:** Step.
**BOARD CONCEPT:** A wide board with a very tall (height-16) "elevator"
column standing between a purple region and an orange region, plus decoy
geometry two columns away.
**KEY INSIGHT:** The elevator column's top has nothing to touch at all
(verified: its neighbors up there are only itself) -- a `[purple,
orange]` piece dropped there must fall through 7+ turns of genuinely
empty space before entering range of anything. This is a FUTURE POSITION
problem, not a "which column" one: the eventual landing column is
obvious from the start, but dropping the piece late enough that it can't
finish its descent in time still fails.
**DELAYED CLEAR?:** No.
**TEMPTING MISTAKE:** Dropping `ELEVATOR` LAST instead of FIRST. Verified:
it gets stuck mid-descent (slot 14 of 15) with no turns left, and the
board is unsolvable.
**VERIFIED SOLUTION:** 19 placements; `level3.solution` in `config.js`.

### LEVEL 4: Delay the Clear
**GRAVITY MODE:** Step.
**BOARD CONCEPT:** Two separate purple waves -- a dead-end column (2+
columns from everything relevant) and a column adjacent to an orange
target. Two "tenth piece" candidates exist: `QUICK` (plain purple) and
`ELEVATOR` (`[purple, orange]`).
**KEY INSIGHT:** The dead-end wave has no target waiting on it, so it's
very likely to reach 9 FIRST -- an available Clear Ten, right there,
tempting to finish with whatever's in hand. If that's `ELEVATOR`, purple
clears immediately, but the revealed orange is permanently stranded (the
dead end can never reach the orange target), and `QUICK` -- now stuck
finishing the other wave -- reveals nothing.
**DELAYED CLEAR?:** Yes -- the dead-end wave can be completed as soon as
it reaches 9, using whichever tenth piece is at hand, but doing so with
`ELEVATOR` is the trap. The level is solved by deliberately holding
`ELEVATOR` back for the wave that actually needs it.
**TEMPTING MISTAKE:** Swapping `ELEVATOR` and `QUICK` between the two
waves. Verified: unsolvable -- the orange target sits at 9/10 forever.
**VERIFIED SOLUTION:** 29 placements; `level4.solution` in `config.js`.

### LEVEL 5: Motion Puzzle (signature)
**GRAVITY MODE:** Step.
**BOARD CONCEPT:** Combines Level 4's "two waves, one right piece"
choice with a 3-layer tower cascade: a dead-end decoy wave, an orange
target, a 10-cell tower whose floor touches BOTH the orange target AND a
red target at once (verified), and the red target itself.
**KEY INSIGHT (future color AND future position together):** `ELEVATOR`
(this time 3 layers: `[purple, orange, red]`) must go in the tower, not
the dead end. When the tower's purple clears, `ELEVATOR` is the lone
survivor and peels to orange -- touching the orange target -> clears ->
peels again to red -- still in that same cell, now touching the red
target -> clears -> board empty. One decision made many turns earlier
pays off as a 3-stage chain reaction.
**DELAYED CLEAR?:** Yes, same shape as Level 4.
**TEMPTING MISTAKE:** `ELEVATOR` finishing the dead end instead of the
tower. Verified: both targets stay stuck at 9/10 forever, and
`ELEVATOR`'s buried colors are permanently unreachable.
**VERIFIED SOLUTION:** 38 placements; `level5.solution` in `config.js`.
`tests.js` confirms the full 3-stage cascade (purple, then orange, then
red, in that order).

## PLAYTEST WITHOUT READING THE SOLUTIONS FIRST

Play all five levels before looking at `config.js`. While you play,
notice:

- Did Step Gravity feel understandable? Could you predict where a piece
  would be next turn?
- Did you start thinking about WHERE pieces would be several turns from
  now, not just where they'd end up eventually?
- Did the levels feel less like vertical stacking, or did they still
  boil down to "which column"?
- Did horizontal or diagonal relationships between columns matter to your
  planning, or was it still purely about depth?
- Did waiting to trigger a Clear Ten ever feel strategically useful,
  rather than just delaying the inevitable?
- Did Step Gravity make the puzzles feel richer, or just slower?
- Which gravity mode did you personally prefer?
- Should both gravity modes exist in the eventual game, or should V0.9
  commit to one?
- Did Level 5 feel closer to the strategic identity ClearTen should have
  than Level 1 (the Settle Gravity control) did?

**Most important**: the goal of V0.8 is to discover whether controlled
movement through time makes ClearTen more spatially varied *without*
losing its simple core -- not to decide that Step Gravity is definitely
better. If a level feels tedious rather than tense, that's exactly the
kind of signal this prototype exists to surface.
