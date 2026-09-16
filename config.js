/*
 * ClearTen - gameplay configuration.
 *
 * Everything that defines the puzzle (colors, the clear threshold, the
 * board shape, starting pieces, and predetermined piece sequence) lives
 * here, separate from the engine (gamelogic.js) and the UI (game.js).
 * Tweak these values to experiment with the rules.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ClearTenConfig = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // How many same-active-color connected pieces are needed to clear a group.
  var CLEAR_THRESHOLD = 10;

  // The 3 token colors used in this prototype, with their display color.
  var COLORS = {
    red: { hex: '#e15c5c', label: 'Red' },
    purple: { hex: '#8d6fd1', label: 'Purple' },
    orange: { hex: '#f0a04b', label: 'Orange' }
  };

  // Builds a board layout from an array of column heights. Every column's
  // valid slots start at 0 and are contiguous -- this is what keeps
  // gravity simple (see gamelogic.js). A SHORT column next to tall ones
  // is what creates a "narrow passage": hex adjacency only ever spans one
  // column step, so a column too short to reach a given height silently
  // cuts off anything above that height from whatever's on the far side.
  function boardLayout(columnHeights) {
    var layout = [];
    columnHeights.forEach(function (height, col) {
      for (var slot = 0; slot < height; slot++) layout.push({ col: col, slot: slot });
    });
    return layout;
  }

  function makePiece(id, layers) {
    return { id: id, layers: layers };
  }

  // =====================================================================
  // V0.5 -- BOARD TERRAIN test level.
  // =====================================================================
  //
  // V0.5 keeps V0.4's layered-piece mechanic (single-cell pieces, 2-3
  // layers, only the active/top layer counts for Clear Ten) but changes
  // what's being tested. Playtesting V0.4 found three problems: buried
  // colors looked messy, the Upcoming preview was clutter, and gravity
  // pulling everything into one shared lower area made WHERE you placed a
  // piece barely matter. V0.5 removes Upcoming entirely (the only visible
  // future information now comes from what's buried inside the 3 current
  // pieces), simplifies the layer visual (game.js), and -- the main
  // change -- redesigns the board so placement location has real,
  // different consequences depending on which column you choose.
  //
  // THE TERRAIN (why column choice matters here):
  // Column heights: [5, 4, 2, 4, 5] (columns 0-4). Hex adjacency only ever
  // spans ONE column step (see gamelogic.js), so column 2 -- only 2 cells
  // tall, versus its neighbors' 4-5 -- can only ever touch column 1 and
  // column 3 at their BOTTOM one or two cells. Column 1's slots 2-3 and
  // column 3's slots 2-3 are simply too high to ever reach column 2 at
  // all. The result is three distinct regions:
  //   LEFT basin   = columns 0-1 (9 cells)
  //   NARROW BRIDGE = column 2 (2 cells) -- the ONLY path between sides
  //   RIGHT basin  = columns 3-4 (9 cells)
  // Column 0 and column 4 are dead ends: column 0 only ever touches column
  // 1, column 4 only ever touches column 3 -- neither can EVER reach the
  // bridge or the other basin, at any height, no matter what's placed
  // where. This is a structural fact of the board shape, not a rule of
  // thumb (tests.js proves it directly).
  //
  // THE SETUP (initial pieces establish "left = purple, right = orange"):
  //   column 1: 3x [purple, red] (left basin seed)
  //   column 3: 3x [orange, red] (right basin seed)
  //
  // THE THREE WAVES:
  //   Wave 1 (purple -> 10, clears): grows using column 0 (all 5 cells)
  //   plus BOTH bridge cells. Clears -> reveals what's underneath.
  //   Wave 2 (orange -> 10, clears): the bridge's revealed orange is
  //   already touching the column-3 seed; grows using column 4 to reach
  //   10, clears -> reveals red, and reopens the bridge (its cells had no
  //   further buried layer).
  //   Wave 3 (red -> 10, clears, empties the board): red revealed on the
  //   LEFT (column 1) and red revealed on the RIGHT (column 3/4) are NOT
  //   yet connected -- the bridge that used to join them was spent on
  //   wave 1's orange and is only just reopening now. Two new red pieces
  //   placed directly in the reopened bridge reconnect both sides for
  //   exactly 10 -> clears -> board empty -> WIN.
  //
  // THE STRATEGIC MOMENT (what this level is actually testing):
  // Wave 1 needs 7 new purple pieces. Five of them are plain purple (no
  // buried color) and freely belong in column 0. The other TWO --
  // TRAP_A and TRAP_B -- are [purple, orange]. In the moment, column 0
  // looks just as good for them as the bridge: both are empty, both are
  // "purple's territory," and either placement completes wave 1's purple
  // count identically. But column 0 is a dead end. A [purple, orange]
  // piece placed there reveals its orange permanently stranded -- 2 cells
  // that can never reach column 3's orange group, verified structurally
  // in tests.js, not just asserted. Placed in the bridge instead (the
  // documented SOLUTION), the exact same reveal becomes the connective
  // tissue wave 2 depends on. This is the same decision twice, tested
  // independently at two different moments in play (tests.js checks
  // each of TRAP_A and TRAP_B in isolation) -- planning around where a
  // piece's BURIED color will end up, not just where its active color is
  // convenient right now.
  //
  // PIECE SEQUENCE ORDERING: the 14 pieces are deliberately interleaved
  // (not grouped by wave) so the 3 visible current pieces always show a
  // mix of active colors -- tests.js checks every consecutive window of 3
  // in the sequence and confirms none are all the same color, including
  // the very first three the player ever sees.
  //
  // 14 player placements (plus the 6 starting pieces), within the
  // "roughly 10-15 meaningful placements" target. Verified end-to-end by
  // tests.js: a full replay of SOLUTION through the real engine, the
  // three cascades resolving as separate events (not merged), and the
  // board empties only on the last placement.
  var level = {
    id: 'level1',
    name: 'Level 1',
    introText: 'Connect 10 matching top colors. Buried colors appear next.',
    layout: boardLayout([5, 4, 2, 4, 5]),

    initialTokens: [
      { col: 1, slot: 0, layers: ['purple', 'red'] },
      { col: 1, slot: 1, layers: ['purple', 'red'] },
      { col: 1, slot: 2, layers: ['purple', 'red'] },
      { col: 3, slot: 0, layers: ['orange', 'red'] },
      { col: 3, slot: 1, layers: ['orange', 'red'] },
      { col: 3, slot: 2, layers: ['orange', 'red'] }
    ],

    // Interleaved so active colors vary across every window of 3 (see
    // note above) -- NOT grouped by wave, even though the SOLUTION below
    // still completes each wave as a coherent block of placements.
    pieceSequence: [
      makePiece('TRAP_A', ['purple', 'orange']),
      makePiece('P1', ['purple']),
      makePiece('TRAP_D', ['orange', 'red']),
      makePiece('TRAP_B', ['purple', 'orange']),
      makePiece('O1', ['orange']),
      makePiece('P2', ['purple']),
      makePiece('TRAP_C', ['orange', 'red']),
      makePiece('P3', ['purple']),
      makePiece('O2', ['orange']),
      makePiece('P4', ['purple']),
      makePiece('P5', ['purple']),
      makePiece('O3', ['orange']),
      makePiece('R1', ['red']),
      makePiece('R2', ['red'])
    ],

    // Verified solution. Every placement targets the CURRENT lowest empty
    // slot of the column it's in, so gravity never visibly shifts a piece
    // right when it's placed -- what's listed here is exactly where it
    // comes to rest. (Gravity still does real, visible work between
    // waves: wave 1 clearing empties column 0 and the bridge; wave 2
    // clearing empties the bridge again and column 4 -- tests.js checks
    // the bridge cells really do go through occupied -> empty -> occupied
    // -> empty across the three waves.)
    solution: [
      { pieceId: 'TRAP_A', target: { col: 2, slot: 0 } }, // bridge, NOT column 0 -- the strategic choice
      { pieceId: 'P1', target: { col: 0, slot: 0 } },
      { pieceId: 'TRAP_D', target: { col: 4, slot: 0 } },
      { pieceId: 'TRAP_B', target: { col: 2, slot: 1 } }, // bridge, NOT column 0 -- the strategic choice, again
      { pieceId: 'O1', target: { col: 4, slot: 1 } },
      { pieceId: 'P2', target: { col: 0, slot: 1 } },
      { pieceId: 'TRAP_C', target: { col: 3, slot: 3 } },
      { pieceId: 'P3', target: { col: 0, slot: 2 } },
      { pieceId: 'O2', target: { col: 4, slot: 2 } },
      { pieceId: 'P4', target: { col: 0, slot: 3 } },
      { pieceId: 'P5', target: { col: 0, slot: 4 } },
      // ^ purple reaches 10 (3 starting + P1-5 + TRAP_A/B = 3+5+2) -> clears.
      //   Reveals: column 0 -> nothing (plain purple, cells empty).
      //            bridge (TRAP_A, TRAP_B) -> orange, joining column 3's seed.
      //            column 1 -> red (3 cells).
      //   Board not empty -> game continues.
      { pieceId: 'O3', target: { col: 4, slot: 3 } },
      // ^ orange reaches 10 (bridge's 2 + column 3 seed's 3 + TRAP_D/O1/O2/O3) -> clears.
      //   Reveals: bridge -> nothing (plain, from wave 1's reveal -> empty again).
      //            column 3/4 -> red (5 cells: seed's 3 + TRAP_C + TRAP_D).
      //   Board not empty (column 1's red + column 3/4's red both present,
      //   but NOT yet connected -- the bridge that used to join them just
      //   emptied out again) -> game continues.
      { pieceId: 'R1', target: { col: 2, slot: 0 } },
      { pieceId: 'R2', target: { col: 2, slot: 1 } }
      // ^ red reaches 10 (column 1's 3 + bridge's 2 new + column 3/4's 5)
      //   -> one connected group via the reopened bridge -> clears ->
      //   board empty -> WIN.
    ]
  };

  var LEVELS = [level];

  return {
    CLEAR_THRESHOLD: CLEAR_THRESHOLD,
    COLORS: COLORS,
    LEVELS: LEVELS
  };
});
