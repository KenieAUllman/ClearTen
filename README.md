# ClearTen (prototype v0.5)

A browser-based prototype of a mobile strategy puzzle game. The goal of
this build is **only** to test whether the core mechanic is fun -- it is
not a finished product. No accounts, ads, sound, procedural levels, or
anything beyond the one hand-authored puzzle.

**V0.5 keeps V0.4's layered-piece idea but fixes what playtesting flagged
as broken.** V0.4 tested "does planning around a piece's buried colors
create strategic depth?" and found real potential, but three problems got
in the way: buried colors looked visually messy, the Upcoming preview was
clutter nobody needed, and gravity pulling everything into one shared
lower area meant WHERE you placed a piece barely mattered. V0.5 removes
Upcoming entirely, simplifies the buried-color visual to small ordered
dots under a dominant active-color circle, and -- the main change --
redesigns the board so different columns lead to genuinely different,
separated regions. The question this version exists to answer: **does
board terrain make layered-piece placement position actually matter?**

## HOW TO PLAY

- The board is a hex grid with an irregular shape: two "basins" (left and
  right) connected only by a narrow 2-cell bridge in the middle. Columns
  0 and 4 are dead ends -- they only ever touch their one neighboring
  column, never the bridge or the far side.
- Every piece occupies **one hex cell** and holds **1-3 stacked colors**
  (red, purple, or orange). The topmost color is **active** -- drawn as
  one large, dominant circle. Anything buried underneath shows as tiny
  ordered dots beneath it: leftmost dot = the next color, next dot = the
  one after that.
- You see only **3 Current pieces** -- no Upcoming preview. When you use
  one, the next piece from a hidden, predetermined sequence fills that
  slot. You don't know what's coming; the only visible future information
  is what's buried inside the 3 pieces already in front of you.
- **Tap a current piece** to select it, then **tap any empty board cell**
  to place it there -- any piece fits any open cell, so the decision is
  entirely about *where*, not *whether it fits*.
- **Gravity**: after every placement, every piece that can fall does --
  straight down, within its own column, as one indivisible unit. Columns
  never affect each other, which is exactly why WHICH column you choose
  matters: a piece dropped in a dead-end column can never reach the
  bridge or the far basin, no matter how tall that column gets.
- **Clearing**: whenever 10 or more pieces with the *same active color*
  are connected, that whole group's **top layer only** clears, revealing
  whatever was buried underneath (or removing the piece entirely if that
  was its last layer). A newly revealed color can immediately turn out to
  already be part of another 10+ group, clearing again in the same
  cascade. The first time this happens, the game pauses briefly to
  highlight it and show "10+ CLEAR!" -- after that, clears just animate.
- **You win only when every board cell is empty** -- every layer of every
  piece cleared. **You lose** if cells remain occupied and no current
  piece can legally be placed, or the hidden sequence runs out first.
- **Undo** steps back through your whole move history, restoring the
  complete layered state (not just active colors). **Restart** resets to
  the puzzle's starting position.

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
  See the file header for the full layered-cell data model. Unchanged
  from V0.4 -- this version only changed the level and the UI.
- `config.js` -- everything that defines the puzzle: colors, the clear
  threshold, and a `LEVELS` array (one level) with its board shape,
  starting pieces, and predetermined piece sequence, plus a documented,
  verified solution. Tweak numbers here to experiment.
- `game.js` -- the browser UI: layered-token rendering (now a big circle
  + small pips), input handling, undo/restart, win/loss detection,
  animation timing. No Upcoming rendering in this version.
- `tests.js` -- automated tests for `gamelogic.js`, runnable with
  `node tests.js` (no test framework, no npm install required).

## DEVELOPER NOTES

- **The layered data model** and **gravity-moves-a-whole-piece** behavior
  are unchanged from V0.4 -- see the `gamelogic.js` file header for the
  full explanation. This version only changed `config.js` (the level) and
  `game.js` (rendering, no more Upcoming).
- **The board terrain, and why it actually works with this engine**:
  gravity here is strictly per-column (see `gamelogic.js`), and hex
  adjacency only ever spans one column step. Column heights `[5,4,2,4,5]`
  make column 2 -- only 2 cells tall next to neighbors of 4-5 -- a literal
  bottleneck: it can only ever touch column 1 and column 3 at their
  BOTTOM one or two cells, never higher. That carves the board into a
  left basin (columns 0-1), a 2-cell bridge (column 2), and a right basin
  (columns 3-4), with columns 0 and 4 as true dead ends that can never
  reach the bridge or the far side at any height. This is a structural
  fact of the board shape, proven directly in `tests.js` (not just
  asserted), not a rule of thumb.
- **The simplified layer visual**: one large circle for the active color,
  with tiny "pip" dots in a row underneath for buried colors, left to
  right in reveal order. See `layerCircleSpecs()` in `game.js`. Same
  visual is reused for board pieces and the current-piece previews (now
  bigger, since there's no Upcoming row competing for space).
- **A real SVG gotcha worth knowing about** (carried over from V0.4,
  still relevant): pieces render as nested `<g>` elements (an outer group
  for position, an inner one for pop-in/peel effects) because setting
  `el.style.transform = 'translate(x,y)'` on an SVG element silently does
  nothing without an explicit unit -- `px` is required, and on an SVG
  element it resolves to one local coordinate-system unit, not a screen
  pixel. Caught by an actual browser test run, not `node tests.js` (which
  has no DOM) -- why a scripted Playwright pass matters here too.
- **Debug mode**: set `DEBUG = true` near the top of `game.js` to show,
  per cell, its `(col, slot)`, full layer sequence, and connected-group
  size, plus every legal placement cell for the selected piece and the
  queue position in the title bar. Not shown to normal players.
- **The level is hand-authored, not procedural**, built backward from a
  solved state using a Node sandbox to verify the terrain and each wave
  against the real engine before committing to it. The full worked
  solution and design reasoning are documented at length in `config.js`.
  `tests.js` replays it through the real engine, confirms the three
  color waves (purple -> orange -> red) resolve as three SEPARATE
  cascades through the bridge (not merged), and confirms the board stays
  non-empty until the final placement.
- **The two buried-color decisions this level tests**: during the purple
  wave, two placed pieces (`TRAP_A`, `TRAP_B`) are `[purple, orange]`. In
  the moment, the dead-end column 0 looks exactly as good for them as the
  bridge -- both are empty, both complete purple's count identically. But
  a `[purple, orange]` piece placed in column 0 reveals an orange that
  can never reach the right basin (proven structurally, not just
  asserted); placed in the bridge instead, that same reveal becomes the
  connective tissue the next wave depends on. `tests.js` tests `TRAP_A`
  and `TRAP_B` independently -- swapping each one's target with a plain
  piece's, confirming purple still reaches 10 either way, and confirming
  the resulting board genuinely differs (a stranded orange vs. one that
  joins the right basin's group) -- two situations, not one.

## WHAT TO TEST

Play through it a few times (use Restart freely) and pay attention to:

- Did placement location finally matter?
- Did you think about where a piece would END UP after gravity, not just
  where you clicked?
- Did buried colors influence where you placed pieces?
- Did removing Upcoming make the interface calmer, or did you miss it?
- Did the hidden future pieces feel pleasantly uncertain, or frustrating?
- Could you recognize the board's pockets (the two basins and the narrow
  bridge between them) and plan around them?
- Did the game still feel like Tetris?
- Did gravity feel strategic now, instead of automatic cleanup?
- Did you ever deliberately avoid the "obvious" placement for a piece's
  active color because of what was buried underneath it?
- Did the cleaner layer visual (big circle + small pips) make planning
  easier than V0.4's overlapping offset circles?

If you get stuck, Undo is there to help you rethink recent moves, and the
full solution is documented in `config.js` if you want to compare your
approach to a known-working one.
