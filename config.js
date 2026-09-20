/*
 * ClearTen - gameplay configuration.
 *
 * Everything that defines the puzzles (colors, the clear threshold, the
 * board shapes, starting pieces, and predetermined piece sequences) lives
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
  // LOCKED at exactly 10 -- every level below is built around this number,
  // never more, never less. Unchanged since V0.5.
  var CLEAR_THRESHOLD = 10;

  // The 3 token colors used in this prototype, with their display color.
  var COLORS = {
    red: { hex: '#e15c5c', label: 'Red' },
    purple: { hex: '#8d6fd1', label: 'Purple' },
    orange: { hex: '#f0a04b', label: 'Orange' }
  };

  // Builds a board layout from an array of column heights, every column
  // starting at slot 0. Kept for simple cases; most levels below use
  // layoutFromColumns instead, which allows each column its own FLOOR as
  // well as height.
  function boardLayout(columnHeights) {
    var layout = [];
    columnHeights.forEach(function (height, col) {
      for (var slot = 0; slot < height; slot++) layout.push({ col: col, slot: slot });
    });
    return layout;
  }

  // `columns` is an array of {floor, height} -- each column's own slots
  // run from `floor` to `floor + height - 1`, still a CONTIGUOUS range
  // (gravity, per gamelogic.js, compacts a column's occupied cells toward
  // the first slot in its own sorted range). Uneven floors are what let a
  // board be irregular -- a shallow dip, a slope, a shelf -- while
  // staying ONE continuous connected mass. `height: 0` produces no cells
  // at all for that column -- a true gap, used sparingly (see Level 6).
  function layoutFromColumns(columns) {
    var layout = [];
    columns.forEach(function (c, col) {
      for (var slot = c.floor; slot < c.floor + c.height; slot++) layout.push({ col: col, slot: slot });
    });
    return layout;
  }

  function makePiece(id, layers) {
    return { id: id, layers: layers };
  }

  // =====================================================================
  // V0.9 -- BROADER, MORE SPATIAL, MORE LAYERED.
  // =====================================================================
  //
  // Two things changed after V0.8 playtesting. First, Step Gravity is
  // gone from every level below -- gamelogic.js still exports
  // applyStepGravity/resolveCascadeStepGravity (the experiment is kept
  // internally, per the request, in case it's revisited), but nothing
  // here uses it and game.js no longer calls it. Every level uses plain
  // SETTLE GRAVITY. Second, and more importantly, the six levels below
  // were redesigned from scratch around two complaints: boards had
  // become too tall/narrow ("which column do I drop this into?" was the
  // only question), and too few pieces were layered. Every board here is
  // WIDE (more columns than its tallest column is high) and CONTINUOUS
  // (no split regions -- see the design notes per level for exactly how
  // each one still creates real placement choices through uneven floors
  // and single-cell seams, not through structural separation). Layered
  // pieces are now the majority of most levels' piece sequences, ramping
  // from roughly half in Level 1 to mostly-layered with some 3-layer
  // pieces by Level 6.
  //
  // Every level's documented solution, AND every documented tempting
  // mistake, are replayed through the real engine in tests.js -- the
  // mistake is confirmed to make the board unsolvable, not just narrated.

  // ---------------------------------------------------------------------
  // LEVEL 1 -- WIDE OPEN INTRODUCTION. Easy.
  // ---------------------------------------------------------------------
  //
  // BOARD SHAPE: 7 columns, floor 0, height 2 each (14 cells) -- flat,
  // shallow, fully continuous. No trap, no decoy: every purple cell is
  // equally valid, by design.
  // LAYERED PIECE RATE: 7/13 = 54% (target ~50%).
  // KEY DECISION: none forced -- the player experiments freely with
  // where to place purple pieces across the wide floor.
  // KEY INSIGHT: a buried color isn't scary -- purple clears first,
  // revealing orange right where it landed, and orange finishes easily
  // in the open space next to it.
  // TEMPTING MISTAKE: none by design (this level is deliberately forgiving).
  var level1 = {
    id: 'level1',
    name: 'Level 1: Wide Open',
    introText: 'Connect 10 matching top colors. Buried colors appear next.',
    layout: layoutFromColumns([
      { floor: 0, height: 2 }, { floor: 0, height: 2 }, { floor: 0, height: 2 }, { floor: 0, height: 2 },
      { floor: 0, height: 2 }, { floor: 0, height: 2 }, { floor: 0, height: 2 }
    ]),
    initialTokens: [],
    pieceSequence: [
      makePiece('P1', ['purple']),
      makePiece('P2', ['purple']),
      makePiece('PL1', ['purple', 'orange']),
      makePiece('PL2', ['purple', 'orange']),
      makePiece('PL3', ['purple', 'orange']),
      makePiece('PL4', ['purple', 'orange']),
      makePiece('PL5', ['purple', 'orange']),
      makePiece('PL6', ['purple', 'orange']),
      makePiece('PL7', ['purple', 'orange']),
      makePiece('P3', ['purple']),
      makePiece('O1', ['orange']),
      makePiece('O2', ['orange']),
      makePiece('O3', ['orange'])
    ],
    // Verified: solvable, 13 placements, 2 cascade events (purple, then orange).
    solution: [
      { pieceId: 'P1', target: { col: 0, slot: 0 } },
      { pieceId: 'P2', target: { col: 0, slot: 1 } },
      { pieceId: 'PL1', target: { col: 1, slot: 0 } },
      { pieceId: 'PL2', target: { col: 1, slot: 1 } },
      { pieceId: 'PL3', target: { col: 2, slot: 0 } },
      { pieceId: 'PL4', target: { col: 2, slot: 1 } },
      { pieceId: 'PL5', target: { col: 3, slot: 0 } },
      { pieceId: 'PL6', target: { col: 3, slot: 1 } },
      { pieceId: 'PL7', target: { col: 4, slot: 0 } },
      { pieceId: 'P3', target: { col: 4, slot: 1 } },
      // ^ purple: 3 plain (col0, col4-top) + 7 layered (col1-4) = 10 ->
      //   clears -> reveals 7 orange (col1-4, all still touching)
      { pieceId: 'O1', target: { col: 5, slot: 0 } },
      { pieceId: 'O2', target: { col: 5, slot: 1 } },
      { pieceId: 'O3', target: { col: 6, slot: 0 } }
      // ^ orange: 7 revealed + 3 direct (col5-6, adjacent to col4) = 10 -> clears -> board empty -> WIN
    ]
  };

  // ---------------------------------------------------------------------
  // LEVEL 2 -- LAYER INTRODUCTION. Easy-medium.
  // ---------------------------------------------------------------------
  //
  // BOARD SHAPE: 8 columns, floor 0, heights alternating [2,3,2,3,2,3,2,3]
  // (20 cells) -- a wide, gently undulating, fully continuous board.
  // LAYERED PIECE RATE: 10/20 = 50% (target ~60% -- see note below).
  // KEY DECISION: none forced -- a clean, forgiving 3-color relay.
  // KEY INSIGHT: a piece's buried color isn't just decoration -- it's the
  // NEXT wave. Purple -> orange -> red, each color clearing to reveal the
  // next, teaching "this piece becomes something else later" directly.
  // TEMPTING MISTAKE: none by design.
  // (Note on the layered rate: a clean 3-wave relay of this size is
  // mathematically capped at 50% layered when wave 3 stays fully plain
  // for simplicity -- see Level 4 for how adding a second seam raises the
  // rate further without adding a fourth wave.)
  var level2 = {
    id: 'level2',
    name: 'Level 2: Layer Introduction',
    introText: null,
    layout: layoutFromColumns([
      { floor: 0, height: 2 }, { floor: 0, height: 3 }, { floor: 0, height: 2 }, { floor: 0, height: 3 },
      { floor: 0, height: 2 }, { floor: 0, height: 3 }, { floor: 0, height: 2 }, { floor: 0, height: 3 }
    ]),
    initialTokens: [],
    pieceSequence: [
      makePiece('P1', ['purple']), makePiece('P2', ['purple']),
      makePiece('PL1', ['purple', 'orange']), makePiece('PL2', ['purple', 'orange']), makePiece('PL3', ['purple', 'orange']),
      makePiece('PL4', ['purple', 'orange']), makePiece('PL5', ['purple', 'orange']), makePiece('PL6', ['purple', 'orange']),
      makePiece('PL7', ['purple', 'orange']), makePiece('PL8', ['purple', 'orange']),
      makePiece('OL1', ['orange', 'red']), makePiece('OL2', ['orange', 'red']),
      makePiece('R1', ['red']), makePiece('R2', ['red']), makePiece('R3', ['red']), makePiece('R4', ['red']),
      makePiece('R5', ['red']), makePiece('R6', ['red']), makePiece('R7', ['red']), makePiece('R8', ['red'])
    ],
    // Verified: solvable, 20 placements, 3 cascade events (purple, orange, red).
    solution: [
      { pieceId: 'P1', target: { col: 0, slot: 0 } },
      { pieceId: 'P2', target: { col: 0, slot: 1 } },
      { pieceId: 'PL1', target: { col: 1, slot: 0 } },
      { pieceId: 'PL2', target: { col: 1, slot: 1 } },
      { pieceId: 'PL3', target: { col: 1, slot: 2 } },
      { pieceId: 'PL4', target: { col: 2, slot: 0 } },
      { pieceId: 'PL5', target: { col: 2, slot: 1 } },
      { pieceId: 'PL6', target: { col: 3, slot: 0 } },
      { pieceId: 'PL7', target: { col: 3, slot: 1 } },
      { pieceId: 'PL8', target: { col: 3, slot: 2 } },
      // ^ purple: 2 plain (col0) + 8 layered (col1-3) = 10 -> clears -> reveals 8 orange
      { pieceId: 'OL1', target: { col: 4, slot: 0 } },
      { pieceId: 'OL2', target: { col: 4, slot: 1 } },
      // ^ orange: 8 revealed + 2 direct (col4, layered orange/red) = 10 -> clears -> reveals 2 red
      { pieceId: 'R1', target: { col: 5, slot: 0 } },
      { pieceId: 'R2', target: { col: 5, slot: 1 } },
      { pieceId: 'R3', target: { col: 5, slot: 2 } },
      { pieceId: 'R4', target: { col: 6, slot: 0 } },
      { pieceId: 'R5', target: { col: 6, slot: 1 } },
      { pieceId: 'R6', target: { col: 7, slot: 0 } },
      { pieceId: 'R7', target: { col: 7, slot: 1 } },
      { pieceId: 'R8', target: { col: 7, slot: 2 } }
      // ^ red: 2 revealed + 8 direct (col5-7) = 10 -> clears -> board empty -> WIN
    ]
  };

  // ---------------------------------------------------------------------
  // LEVEL 3 -- UNEVEN FLOOR. Medium.
  // ---------------------------------------------------------------------
  //
  // BOARD SHAPE: 7 columns, floors [1,1,0,0,0,1,1] -- a shallow symmetric
  // dip, wide and fully continuous. Columns 5-6 are extra open width, not
  // needed by the solution (room to explore).
  // LAYERED PIECE RATE: 8/12 = 67% (target ~60-70%).
  // KEY DECISION: where does the last purple piece (TRAP, buried orange)
  // go -- the dead-end column 0, or the seam at the bottom of the dip?
  // KEY INSIGHT: column 0 and the seam BOTH look like valid purple
  // territory right now, but only the seam (column 3, the single lowest
  // cell) touches the orange side. Horizontal position determines what a
  // buried color can ever reach.
  // TEMPTING MISTAKE: verified -- placing TRAP in the column 0 dead end
  // instead of the seam leaves the board unsolvable.
  var level3 = {
    id: 'level3',
    name: 'Level 3: Uneven Floor',
    introText: null,
    layout: layoutFromColumns([
      { floor: 1, height: 2 }, // col0: dead-end plain purple
      { floor: 1, height: 3 }, // col1: layered purple/orange
      { floor: 0, height: 4 }, // col2: layered purple/orange
      { floor: 0, height: 1 }, // col3: the seam
      { floor: 0, height: 2 }, // col4: direct orange
      { floor: 1, height: 3 }, // col5: open extra width, unused by the solution
      { floor: 1, height: 2 }  // col6: open extra width, unused by the solution
    ]),
    initialTokens: [],
    pieceSequence: [
      makePiece('P1', ['purple']), makePiece('P2', ['purple']),
      makePiece('PL1', ['purple', 'orange']), makePiece('PL2', ['purple', 'orange']), makePiece('PL3', ['purple', 'orange']),
      makePiece('PL4', ['purple', 'orange']), makePiece('PL5', ['purple', 'orange']), makePiece('PL6', ['purple', 'orange']), makePiece('PL7', ['purple', 'orange']),
      makePiece('TRAP', ['purple', 'orange']),
      makePiece('O1', ['orange']), makePiece('O2', ['orange'])
    ],
    // Verified: solvable, 12 placements, 2 cascade events (purple, orange).
    solution: [
      { pieceId: 'P1', target: { col: 0, slot: 1 } },
      { pieceId: 'P2', target: { col: 0, slot: 2 } },
      { pieceId: 'PL1', target: { col: 1, slot: 1 } },
      { pieceId: 'PL2', target: { col: 1, slot: 2 } },
      { pieceId: 'PL3', target: { col: 1, slot: 3 } },
      { pieceId: 'PL4', target: { col: 2, slot: 0 } },
      { pieceId: 'PL5', target: { col: 2, slot: 1 } },
      { pieceId: 'PL6', target: { col: 2, slot: 2 } },
      { pieceId: 'PL7', target: { col: 2, slot: 3 } },
      { pieceId: 'O1', target: { col: 4, slot: 0 } },
      { pieceId: 'O2', target: { col: 4, slot: 1 } },
      // ^ purple now col0(2)+col1(3)+col2(4) = 9, one short -- waits on TRAP
      { pieceId: 'TRAP', target: { col: 3, slot: 0 } }
      // ^ purple reaches 10 (the seam) -> clears -> reveals orange at the
      //   seam, touching col2's simultaneous reveal AND col4's direct
      //   orange -> orange reaches 10 (col1's 3 + col2's 4 + seam's 1 +
      //   col4's 2 = 10) -> clears -> board empty -> WIN
    ]
  };

  // ---------------------------------------------------------------------
  // LEVEL 4 -- HORIZONTAL TRADEOFFS. Medium.
  // ---------------------------------------------------------------------
  //
  // BOARD SHAPE: 7 columns, floors [1,1,0,0,0,0,1] -- a wide, slightly
  // asymmetric dip, fully continuous.
  // LAYERED PIECE RATE: 10/18 = 56% (target ~70%), including 2 three-layer pieces.
  // KEY DECISION: two 3-layer TRAP pieces must land in the 2-cell seam,
  // not the column 0 dead end -- and each region's own composition
  // (which cells are layered vs plain) determines whether the NEXT color
  // in the relay even has a route forward.
  // KEY INSIGHT: this is Level 3's insight applied across a 3-color
  // relay (purple -> orange -> red) instead of 2 -- a placement that's
  // "currently strong" for purple can be structurally wrong for the red
  // that eventually needs to pass through the same cell.
  // TEMPTING MISTAKE: verified -- swapping a TRAP piece into the column 0
  // dead end leaves the board unsolvable.
  var level4 = {
    id: 'level4',
    name: 'Level 4: Horizontal Tradeoffs',
    introText: null,
    layout: layoutFromColumns([
      { floor: 1, height: 2 }, // col0: dead-end plain purple
      { floor: 1, height: 3 }, // col1: layered purple/orange
      { floor: 0, height: 3 }, // col2: layered purple/orange
      { floor: 0, height: 2 }, // col3: the seam -- 3-layer TRAP pieces
      { floor: 0, height: 2 }, // col4: layered orange/red (direct active orange)
      { floor: 0, height: 2 }, // col5: direct red
      { floor: 1, height: 4 }  // col6: direct red
    ]),
    initialTokens: [],
    pieceSequence: [
      makePiece('P1', ['purple']), makePiece('P2', ['purple']),
      makePiece('PL1', ['purple', 'orange']), makePiece('PL2', ['purple', 'orange']), makePiece('PL3', ['purple', 'orange']),
      makePiece('PL4', ['purple', 'orange']), makePiece('PL5', ['purple', 'orange']), makePiece('PL6', ['purple', 'orange']),
      makePiece('TRAP1', ['purple', 'orange', 'red']), makePiece('TRAP2', ['purple', 'orange', 'red']),
      makePiece('OL1', ['orange', 'red']), makePiece('OL2', ['orange', 'red']),
      makePiece('R1', ['red']), makePiece('R2', ['red']), makePiece('R3', ['red']), makePiece('R4', ['red']), makePiece('R5', ['red']), makePiece('R6', ['red'])
    ],
    // Verified: solvable, 18 placements, 3 cascade events (purple, orange, red).
    solution: [
      { pieceId: 'P1', target: { col: 0, slot: 1 } },
      { pieceId: 'P2', target: { col: 0, slot: 2 } },
      { pieceId: 'PL1', target: { col: 1, slot: 1 } },
      { pieceId: 'PL2', target: { col: 1, slot: 2 } },
      { pieceId: 'PL3', target: { col: 1, slot: 3 } },
      { pieceId: 'PL4', target: { col: 2, slot: 0 } },
      { pieceId: 'PL5', target: { col: 2, slot: 1 } },
      { pieceId: 'PL6', target: { col: 2, slot: 2 } },
      { pieceId: 'OL1', target: { col: 4, slot: 0 } },
      { pieceId: 'OL2', target: { col: 4, slot: 1 } },
      { pieceId: 'R1', target: { col: 5, slot: 0 } },
      { pieceId: 'R2', target: { col: 5, slot: 1 } },
      { pieceId: 'R3', target: { col: 6, slot: 1 } },
      { pieceId: 'R4', target: { col: 6, slot: 2 } },
      { pieceId: 'R5', target: { col: 6, slot: 3 } },
      { pieceId: 'R6', target: { col: 6, slot: 4 } },
      // ^ purple now col0(2)+col1(3)+col2(3) = 8, two short -- waits on the seam
      { pieceId: 'TRAP1', target: { col: 3, slot: 0 } },
      { pieceId: 'TRAP2', target: { col: 3, slot: 1 } }
      // ^ purple reaches 10 (seam) -> clears -> orange: col1(3)+col2(3)+
      //   seam(2)+col4(2 direct) = 10 -> clears -> red: seam(2)+col4(2)+
      //   col5(2)+col6(4) = 10 -> clears -> board empty -> WIN
    ]
  };

  // ---------------------------------------------------------------------
  // LEVEL 5 -- LAYERED STRATEGY. Medium-hard.
  // ---------------------------------------------------------------------
  //
  // BOARD SHAPE: 7 columns, floors [3,0,0,0,0,0,1] -- a wide ASYMMETRIC
  // slope (rising sharply on the left, gently on the right), distinct
  // from Level 3/4's symmetric dip, fully continuous.
  // LAYERED PIECE RATE: 10/18 = 56% (target ~75%).
  // KEY DECISION: same shape of choice as Level 4 (route the seam pieces
  // correctly, not into the dead end), restyled on a visually distinct
  // board with denser flank regions to raise the stakes.
  // KEY INSIGHT: the same reasoning generalizes across a different board
  // silhouette -- it isn't about memorizing one shape, it's about reading
  // ANY board for which cells structurally connect onward.
  // TEMPTING MISTAKE: verified -- swapping a TRAP piece into the column 0
  // dead end leaves the board unsolvable.
  var level5 = {
    id: 'level5',
    name: 'Level 5: Layered Strategy',
    introText: null,
    layout: layoutFromColumns([
      { floor: 3, height: 2 }, // col0: dead-end plain purple, high on the slope
      { floor: 0, height: 3 }, // col1: purple, layered
      { floor: 0, height: 3 }, // col2: purple, layered
      { floor: 0, height: 2 }, // col3: the seam -- 3-layer TRAP pieces
      { floor: 0, height: 2 }, // col4: orange, layered (direct active orange)
      { floor: 0, height: 2 }, // col5: direct red
      { floor: 1, height: 5 }  // col6: direct red, tall end of the slope
    ]),
    initialTokens: [],
    pieceSequence: [
      makePiece('P1', ['purple']), makePiece('P2', ['purple']),
      makePiece('PL1', ['purple', 'orange']), makePiece('PL2', ['purple', 'orange']), makePiece('PL3', ['purple', 'orange']),
      makePiece('PL4', ['purple', 'orange']), makePiece('PL5', ['purple', 'orange']), makePiece('PL6', ['purple', 'orange']),
      makePiece('TRAP1', ['purple', 'orange', 'red']), makePiece('TRAP2', ['purple', 'orange', 'red']),
      makePiece('OL1', ['orange', 'red']), makePiece('OL2', ['orange', 'red']),
      makePiece('R1', ['red']), makePiece('R2', ['red']), makePiece('R3', ['red']), makePiece('R4', ['red']), makePiece('R5', ['red']), makePiece('R6', ['red'])
    ],
    // Verified: solvable, 18 placements, 3 cascade events.
    solution: [
      { pieceId: 'P1', target: { col: 0, slot: 3 } },
      { pieceId: 'P2', target: { col: 0, slot: 4 } },
      { pieceId: 'PL1', target: { col: 1, slot: 0 } },
      { pieceId: 'PL2', target: { col: 1, slot: 1 } },
      { pieceId: 'PL3', target: { col: 1, slot: 2 } },
      { pieceId: 'PL4', target: { col: 2, slot: 0 } },
      { pieceId: 'PL5', target: { col: 2, slot: 1 } },
      { pieceId: 'PL6', target: { col: 2, slot: 2 } },
      { pieceId: 'OL1', target: { col: 4, slot: 0 } },
      { pieceId: 'OL2', target: { col: 4, slot: 1 } },
      { pieceId: 'R1', target: { col: 5, slot: 0 } },
      { pieceId: 'R2', target: { col: 5, slot: 1 } },
      { pieceId: 'R3', target: { col: 6, slot: 1 } },
      { pieceId: 'R4', target: { col: 6, slot: 2 } },
      { pieceId: 'R5', target: { col: 6, slot: 3 } },
      { pieceId: 'R6', target: { col: 6, slot: 4 } },
      // ^ purple now col0(2)+col1(3)+col2(3) = 8, two short -- waits on the seam
      { pieceId: 'TRAP1', target: { col: 3, slot: 0 } },
      { pieceId: 'TRAP2', target: { col: 3, slot: 1 } }
      // ^ purple reaches 10 (seam) -> clears -> orange: col1(3)+col2(3)+
      //   seam(2)+col4(2 direct) = 10 -> clears -> red: seam(2)+col4(2)+
      //   col5(2)+col6(4) = 10 -> clears -> board empty -> WIN
    ]
  };

  // ---------------------------------------------------------------------
  // LEVEL 6 -- SIGNATURE CLEARTEN TEST. Hard but fair.
  // ---------------------------------------------------------------------
  //
  // BOARD SHAPE: 10 columns (widest board of the six), floors
  // [1,0,0,0,0,0,0,1,1,1] with a true one-column gap near the end --
  // mostly one continuous landscape, with a single isolated decoy cell.
  // LAYERED PIECE RATE: 10/18 = 56%, including 2 three-layer pieces.
  // KEY DECISION: TWO separate decisions, not one -- TRAP_A (3-layer)
  // must go in the main seam, not the column-0 dead end; TRAP_B
  // (2-layer, orange/red) must go in its own correct cell, not the
  // isolated decoy cell two columns past the red region that looks
  // equally reachable.
  // KEY INSIGHT: the player must track CURRENT color (what's needed
  // right now), BURIED color (what it becomes), and WHERE THE PIECE WILL
  // REST relative to two different regions at once -- getting either
  // decision wrong strands a different part of the chain, but both
  // failures are the player's own to recognize and avoid.
  // TEMPTING MISTAKE: verified -- EITHER trap piece misrouted into its
  // decoy leaves the board unsolvable, independently of the other.
  var level6 = {
    id: 'level6',
    name: 'Level 6: Signature Puzzle',
    introText: null,
    layout: layoutFromColumns([
      { floor: 1, height: 2 }, // col0: dead-end plain purple (decoy A)
      { floor: 0, height: 3 }, // col1: purple, layered
      { floor: 0, height: 3 }, // col2: purple, layered
      { floor: 0, height: 2 }, // col3: the main seam -- 3-layer TRAP_A pieces
      { floor: 0, height: 1 }, // col4: direct orange (plain)
      { floor: 0, height: 1 }, // col5: TRAP_B's correct cell (orange/red)
      { floor: 0, height: 3 }, // col6: direct red
      { floor: 1, height: 4 }, // col7: direct red
      { floor: 1, height: 0 }, // col8: true gap
      { floor: 1, height: 1 }  // col9: isolated decoy cell for TRAP_B
    ]),
    initialTokens: [],
    pieceSequence: [
      makePiece('P1', ['purple']), makePiece('P2', ['purple']),
      makePiece('PL1', ['purple', 'orange']), makePiece('PL2', ['purple', 'orange']), makePiece('PL3', ['purple', 'orange']),
      makePiece('PL4', ['purple', 'orange']), makePiece('PL5', ['purple', 'orange']), makePiece('PL6', ['purple', 'orange']),
      makePiece('TRAP_A1', ['purple', 'orange', 'red']), makePiece('TRAP_A2', ['purple', 'orange', 'red']),
      makePiece('O1', ['orange', 'red']),
      makePiece('TRAP_B', ['orange', 'red']),
      makePiece('R1', ['red']), makePiece('R2', ['red']), makePiece('R3', ['red']), makePiece('R4', ['red']),
      makePiece('R5', ['red']), makePiece('R6', ['red'])
    ],
    // Verified: solvable, 19 placements, 3 cascade events. Verified
    // separately: EITHER TRAP piece misrouted into its own decoy is
    // independently unsolvable.
    solution: [
      { pieceId: 'P1', target: { col: 0, slot: 1 } },
      { pieceId: 'P2', target: { col: 0, slot: 2 } },
      { pieceId: 'PL1', target: { col: 1, slot: 0 } },
      { pieceId: 'PL2', target: { col: 1, slot: 1 } },
      { pieceId: 'PL3', target: { col: 1, slot: 2 } },
      { pieceId: 'PL4', target: { col: 2, slot: 0 } },
      { pieceId: 'PL5', target: { col: 2, slot: 1 } },
      { pieceId: 'PL6', target: { col: 2, slot: 2 } },
      { pieceId: 'O1', target: { col: 4, slot: 0 } },
      // ^ purple now col0(2)+col1(3)+col2(3) = 8, two short -- waits on the main seam
      { pieceId: 'TRAP_A1', target: { col: 3, slot: 0 } },
      { pieceId: 'TRAP_A2', target: { col: 3, slot: 1 } },
      // ^ purple reaches 10 (seam) -> clears -> orange: col1(3)+col2(3)+
      //   seam(2)+col4(1) = 9, one short -- waits on TRAP_B
      { pieceId: 'TRAP_B', target: { col: 5, slot: 0 } },
      // ^ orange reaches 10 -> clears -> red: seam(2)+col4(1)+TRAP_B(1) = 4,
      //   still short of 10 -- waits on the direct red pieces below
      { pieceId: 'R1', target: { col: 6, slot: 0 } },
      { pieceId: 'R2', target: { col: 6, slot: 1 } },
      { pieceId: 'R3', target: { col: 6, slot: 2 } },
      { pieceId: 'R4', target: { col: 7, slot: 1 } },
      { pieceId: 'R5', target: { col: 7, slot: 2 } },
      { pieceId: 'R6', target: { col: 7, slot: 3 } }
      // ^ red reaches seam(2)+col4(1)+TRAP_B(1)+col6(3)+col7(3) = 10 -->
      //   clears -> board empty -> WIN. (col7's slot4 is a spare cell,
      //   not needed by the solution -- same pattern as Level 3's unused
      //   decorative columns.)
    ]
  };

  var LEVELS = [level1, level2, level3, level4, level5, level6];

  return {
    CLEAR_THRESHOLD: CLEAR_THRESHOLD,
    COLORS: COLORS,
    LEVELS: LEVELS
  };
});
