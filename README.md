# ClearTen (prototype v0.6)

A browser-based prototype of a mobile strategy puzzle game. The goal of
this build is **only** to test whether the core mechanic is fun -- it is
not a finished product. No accounts, ads, sound, procedural levels, or
monetization.

**V0.6 does not change a single rule.** V0.5 proved the layered-piece
mechanic (buried colors, terrain that makes placement location matter)
was fun on ONE hand-built puzzle. This version asks a different question:
does that same small rule set have enough DEPTH to carry five genuinely
different, increasingly strategic puzzles -- purely through level design,
not new mechanics? Colors, the clear threshold (still exactly 10), piece
layering, gravity, and win/loss conditions are all identical to V0.5. What
changed is that there are now **five hand-authored levels** instead of
one, plus a small developer level selector for testing convenience.

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
  straight down, within its own column, as one indivisible unit.
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
- **Undo** steps back through your whole move history. **Restart** resets
  the level you're currently on.
- A small row of numbered buttons under the title bar (**1 2 3 4 5**) is a
  developer convenience for jumping straight to any level while testing.
  It's deliberately plain -- not part of the intended play experience.

## THE FIVE LEVELS

Every level is solvable, hand-authored (not procedural), and verified
end-to-end by `tests.js` -- the documented solution in `config.js` is
replayed through the real engine and confirmed to empty the board without
ever doing so early. Difficulty increases through tighter geometry and
more consequential decisions, never by adding pieces or colors.

1. **Split Basin** (easy, ~8 moves) -- two basins joined by a short,
   height-gated 2-cell bridge. Teaches the core loop: which side a piece
   belongs on, and that a buried color's destination matters as much as
   its active color.
2. **Funnel** (easy-medium, ~12 moves) -- a wide, FULLY shared middle
   column both sides draw from, with zero slack (2 cells for purple, 2
   for orange, 4 total). Teaches resource congestion; rewards leaving the
   shared column exactly what each side needs.
3. **Choke Point** (medium, ~11 moves) -- two large regions joined by
   exactly ONE single-cell passage. One "obviously fine" piece placement,
   made in the wrong specific cell, permanently strands a buried color
   that was meant to bridge both sides.
4. **Dual Pocket** (medium-hard, ~14 moves) -- two structurally
   independent gravity pockets (a real gap between them, not just a
   gate), fed by one interleaved hidden sequence. Forces tracking two
   evolving boards in parallel.
5. **Future Color** (hard but fair, ~15 moves) -- the signature moment:
   an active-color piece placed high in a column is, for a while,
   completely useless. Only after an unrelated color clears underneath it
   does gravity drop it into a brand-new connection, forming a second
   10-group and clearing in the same cascade.

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

- `index.html` -- page structure, including the small `#level-select` row.
- `style.css` -- all visual styling.
- `gamelogic.js` -- the pure game engine (hex grid, adjacency, layered
  pieces, gravity, clearing, cascades). No UI code, no rendering. Runs
  identically in the browser and in Node. **Unchanged since V0.4** --
  V0.6, like V0.5, only changes levels (`config.js`) and UI (`game.js`).
- `config.js` -- everything that defines the puzzles: colors, the clear
  threshold, and a `LEVELS` array of **5 levels**, each with its own board
  shape, starting pieces, predetermined piece sequence, and a documented,
  verified solution with design-rationale comments.
- `game.js` -- the browser UI: rendering, input handling, undo/restart,
  win/loss detection, animation timing, level navigation (`goToNextLevel`,
  `goToLevel`), and the developer level selector.
- `tests.js` -- automated tests for `gamelogic.js` and every level in
  `config.js`, runnable with `node tests.js` (no framework, no npm
  install).

## DEVELOPER NOTES

- **The layered data model, gravity-moves-a-whole-piece behavior, and the
  clear threshold (exactly 10)** are all unchanged from V0.4/V0.5. See
  `gamelogic.js`'s file header for the full explanation.
- **Terrain via geometry**: every level's board shape is built the same
  way -- an array of column heights. Because hex adjacency only ever
  spans one column step (see `gamelogic.js`), a SHORT column (or a
  height-0 gap) next to taller ones creates a structural, provable
  bottleneck or a true disconnection. This one technique produces five
  visually and strategically distinct boards:
  - Level 1: `[5, 4, 2, 4, 5]` -- a short 2-cell bridge, gated (only
    reachable at low slots).
  - Level 2: `[3, 5, 4, 5, 3]` -- a "hill" silhouette; the shared middle
    column is tall enough to be reachable from both sides at EVERY slot,
    a fundamentally different kind of narrow passage (congestion, not
    gating).
  - Level 3: `[4, 5, 1, 5, 4]` -- a single-cell passage, verified via
    `Logic.getNeighbors` to touch only one cell on each side.
  - Level 4: `[5, 5, 0, 5, 5]` -- a height-0 gap column; the two halves
    are never adjacent under any circumstance, stronger than gating.
  - Level 5: `[4, 5, 2, 4, 3]` -- asymmetric, with a piece deliberately
    placed high in a tall column so a later clear underneath it lets
    gravity drop it into a new connection.
- **Every level was designed backward from a known solved state** using a
  Node sandbox harness that replays a hand-built solution through the
  real engine before committing to it -- this caught several real design
  bugs along the way (miscounted totals, a piece a second placement
  couldn't reach because gravity had already compacted the column
  underneath it). `tests.js` performs the same replay for all 5 levels,
  plus a level-specific test proving each level's signature structural
  trick actually works as designed (not just "the board ends up empty").
- **Debug mode**: set `DEBUG = true` near the top of `game.js` to show,
  per cell, its `(col, slot)`, full layer sequence, and connected-group
  size; every legal placement cell for the selected piece; the current
  level number and hidden-sequence queue position in the title bar; and,
  logged to the console on every level load, the current piece choices
  and the full documented solution sequence. Not shown to normal players.
- **The developer level selector** (`#level-select` in `index.html`,
  `renderLevelSelect`/`goToLevel` in `game.js`) is intentionally plain --
  small numbered buttons, no icons, no completion state beyond which one
  is active. It exists purely so a level doesn't have to be replayed from
  Level 1 every time during testing.
- **Responsive board sizing**: because the five levels have five
  different aspect ratios (a wide hill, a tall narrow spike, twin
  pockets...), `loadLevelGeometry` now also sets `#board-svg`'s CSS
  `aspect-ratio` from each level's computed viewBox, so a board doesn't
  render tiny inside a box sized for a different level's shape.
- **A real SVG gotcha worth knowing about** (carried over from V0.4/V0.5,
  still relevant): pieces render as nested `<g>` elements because setting
  `el.style.transform = 'translate(x,y)'` on an SVG element silently does
  nothing without an explicit unit -- `px` is required, and on an SVG
  element it resolves to one local coordinate-system unit, not a screen
  pixel.

## WHAT TO TEST

Play through all five levels (use the level selector or Next Level) and
pay attention to:

- Did each level feel genuinely distinct, not just "the same board with
  different numbers"?
- Did difficulty increase naturally as you went, without the game ever
  feeling harder just because it threw more pieces or colors at you?
- Did you find yourself thinking more about buried colors, and further
  ahead, as the levels went on?
- Did the board's shape meaningfully change how you thought about a
  placement -- not just where a piece could physically go, but where it
  should go?
- Did any level feel unfair or random, or did every mistake feel like it
  was recognizably your own decision?
- Did you ever feel forced into blind guessing, or did each level's
  difficulty still feel discoverable and fair?
- Did later levels ever produce an "I see it now" moment -- realizing
  what a piece was really for well after you placed it?
- Which level was the most fun? Which was the least? Which do you think
  best represents what ClearTen should become?

If you get stuck, Undo is there to help you rethink recent moves, and
every level's full solution is documented in `config.js`.

**Most important**: if a level ever feels too easy, that's a note about
level DESIGN, not a request for a new mechanic. The whole point of V0.6
is finding out whether the existing small rule set -- layered pieces,
buried colors, terrain-shaped gravity, and a single clear threshold of
10 -- has enough depth on its own to carry many different puzzles.
