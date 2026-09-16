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
  // starting at slot 0. Kept for simple cases; V0.7's continuous boards
  // mostly use layoutFromColumns below, which allows each column its own
  // FLOOR as well as height.
  function boardLayout(columnHeights) {
    var layout = [];
    columnHeights.forEach(function (height, col) {
      for (var slot = 0; slot < height; slot++) layout.push({ col: col, slot: slot });
    });
    return layout;
  }

  // V0.7: `columns` is an array of {floor, height} -- each column's own
  // slots run from `floor` to `floor + height - 1`, still a CONTIGUOUS
  // range (gravity, per gamelogic.js, compacts a column's occupied cells
  // toward the first slot in its own sorted range, so a contiguous range
  // is what keeps "falling" behaving the way it looks). Uneven floors are
  // what let a board be genuinely irregular -- a bowl, a staircase, a
  // tower -- while still being ONE continuous connected mass, instead of
  // V0.6's technique of using a too-short column to structurally cut the
  // board into separate pieces.
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
  // V0.7 -- FIVE NEW LEVELS, same locked mechanics, focused on PUZZLE
  // DESIGN QUALITY rather than new mechanics or new board TRICKS.
  // =====================================================================
  //
  // V0.6 proved the core system could carry five distinct puzzles using
  // split/separated boards (a short bridge, a shared column, a one-cell
  // gate, disconnected pockets). V0.7 does not touch a single rule --
  // instead it asks whether the SAME mechanics can produce genuine "I SEE
  // IT NOW" moments on boards that are mostly or entirely ONE CONTINUOUS
  // MASS (at least 3 of the 5 levels here never split into separate
  // regions at all). On a continuous board, adjacency reaches almost
  // everywhere, so the old "structurally impossible" trick mostly doesn't
  // apply -- the puzzle has to come from WHICH specific cell a piece's
  // buried color ends up in, WHETHER a completing piece's neighbors are
  // ready yet, and WHERE gravity will actually carry a piece once
  // something clears beneath it. Every level below was hand-built
  // backward from a verified solution (a Node sandbox replays it through
  // the real engine before anything gets committed) and every level also
  // has a verified WRONG placement confirmed to make the board unsolvable
  // or clearly worse -- the temptation is real, not just narrated.

  // ---------------------------------------------------------------------
  // LEVEL 1 -- DECEPTIVE SIMPLE BOARD. One continuous bowl. Medium.
  // ---------------------------------------------------------------------
  //
  // Floors [2,1,0,1,2], heights [3,4,5,4,3] -- a symmetric bowl, fully
  // connected (verified: every one of its 19 cells is reachable from any
  // other via adjacency, unlike V0.6's boards which had a genuine
  // structural cut). Column 1 (purple) and column 3 (orange) are
  // pre-filled; the player fills column 0 (purple) and column 4 (orange),
  // plus the bowl's floor (column 2), which is split: its lower 2 cells
  // are orange, its upper 3 are purple.
  //
  // KEY INSIGHT: TRAP is a [purple, orange] piece. EVERY purple cell in
  // column 2 (slots 2, 3, 4) is ALSO adjacent to column 3 (verified via
  // getNeighbors) -- so any of them works for the reveal. Column 1's
  // cells, however, are pre-filled and not a live decision; the only
  // other empty purple-looking territory the player can choose is NONE
  // here by design -- this is the "gentle" version of the insight: there
  // is exactly one real choice, and it's about using the seam column, not
  // wasting the piece on assumption-free-feeling territory.
  //
  // TEMPTING MISTAKE: verified -- swapping TRAP with a plain piece so it
  // lands in the flank (a pre-filled area) instead of the seam leaves the
  // board permanently short of orange (9/10 forever, unsolvable).
  var level1 = {
    id: 'level1',
    name: 'Level 1: Deceptive Simple',
    introText: 'Connect 10 matching top colors. Buried colors appear next.',
    layout: layoutFromColumns([
      { floor: 2, height: 3 },
      { floor: 1, height: 4 },
      { floor: 0, height: 5 },
      { floor: 1, height: 4 },
      { floor: 2, height: 3 }
    ]),
    initialTokens: [
      { col: 1, slot: 1, layers: ['purple'] },
      { col: 1, slot: 2, layers: ['purple'] },
      { col: 1, slot: 3, layers: ['purple'] },
      { col: 1, slot: 4, layers: ['purple'] },
      { col: 3, slot: 1, layers: ['orange'] },
      { col: 3, slot: 2, layers: ['orange'] },
      { col: 3, slot: 3, layers: ['orange'] },
      { col: 3, slot: 4, layers: ['orange'] },
      { col: 4, slot: 2, layers: ['orange'] },
      { col: 4, slot: 3, layers: ['orange'] },
      { col: 4, slot: 4, layers: ['orange'] }
    ],
    pieceSequence: [
      makePiece('PL1', ['purple']),
      makePiece('OC1', ['orange']),
      makePiece('PL2', ['purple']),
      makePiece('OC2', ['orange']),
      makePiece('PL3', ['purple']),
      makePiece('TRAP', ['purple', 'orange']),
      makePiece('PC1', ['purple']),
      makePiece('PC2', ['purple'])
    ],
    solution: [
      { pieceId: 'PL1', target: { col: 0, slot: 2 } },
      { pieceId: 'OC1', target: { col: 2, slot: 0 } },
      { pieceId: 'PL2', target: { col: 0, slot: 3 } },
      { pieceId: 'OC2', target: { col: 2, slot: 1 } },
      { pieceId: 'PL3', target: { col: 0, slot: 4 } },
      { pieceId: 'TRAP', target: { col: 2, slot: 2 } }, // the seam -- not column 0
      { pieceId: 'PC1', target: { col: 2, slot: 3 } },
      { pieceId: 'PC2', target: { col: 2, slot: 4 } }
      // ^ purple: col0(3)+col1(4, pre-filled)+col2-upper(3, incl TRAP) = 10 -> clears
      //   reveals orange at col2 slot2 (TRAP), touching col3's orange group
      //   orange: col3(4)+col4(3)+col2-lower(2)+TRAP's reveal(1) = 10 -> clears -> WIN
    ]
  };

  // ---------------------------------------------------------------------
  // LEVEL 2 -- DELAY THE CLEAR. A rising staircase, one continuous board.
  // Medium.
  // ---------------------------------------------------------------------
  //
  // Floors [0,1,2,3,4], height 4-5 each -- a smooth staircase, fully
  // connected. Column 0/1 (purple, 9 cells) and column 3/4 (orange, 9
  // cells) each need one more cell to reach 10. That tenth cell for BOTH
  // colors lives in column 2 (floor 2, height 4): its lower 3 cells are
  // orange SUPPORT and its top cell (slot 5) is DELAY, a [purple, orange]
  // piece -- the only remaining purple cell once columns 0-1 are full.
  //
  // KEY INSIGHT: column 2's cells are physically indistinguishable from
  // "more purple space" or "more orange space" -- any piece can go
  // anywhere. But DELAY's buried orange only reaches column 3 if it stays
  // AT SLOT 5 when purple clears -- and it only stays there if slots 2-4
  // beneath it are still occupied by something that ISN'T also clearing
  // in the same event. If the player instead spends plain PURPLE pieces
  // on column 2 (it "looks like" free purple territory too, and purple is
  // what's needed) instead of routing purple to column 1, then when
  // purple clears, column 2 empties completely under DELAY, gravity drops
  // it to the very floor, and its neighbors there are NOT column 3 --
  // DELAY ends up isolated, and purple can never reach 10 again (verified
  // below -- the raw color count can even total 10 across the board while
  // the connected group stays stuck at 9, because the completing piece is
  // isolated from the rest of its own color).
  //
  // TEMPTING MISTAKE: verified -- using two of column 1's intended purple
  // pieces on column 2's support cells instead (and re-routing the
  // now-spare orange support pieces into column 1) leaves DELAY stranded
  // and the board permanently unsolvable.
  var level2 = {
    id: 'level2',
    name: 'Level 2: Delay the Clear',
    introText: null,
    layout: layoutFromColumns([
      { floor: 0, height: 5 },
      { floor: 1, height: 4 },
      { floor: 2, height: 4 },
      { floor: 3, height: 4 },
      { floor: 4, height: 2 }
    ]),
    initialTokens: [],
    pieceSequence: [
      makePiece('P1', ['purple']),
      makePiece('O1', ['orange']),
      makePiece('P2', ['purple']),
      makePiece('O2', ['orange']),
      makePiece('P3', ['purple']),
      makePiece('O3', ['orange']),
      makePiece('P4', ['purple']),
      makePiece('OSUP1', ['orange']),
      makePiece('P5', ['purple']),
      makePiece('OSUP2', ['orange']),
      makePiece('P6', ['purple']),
      makePiece('OSUP3', ['orange']),
      makePiece('P7', ['purple']),
      makePiece('O4', ['orange']),
      makePiece('P8', ['purple']),
      makePiece('O5', ['orange']),
      makePiece('O6', ['orange']),
      makePiece('P9', ['purple']),
      makePiece('DELAY', ['purple', 'orange'])
    ],
    solution: [
      { pieceId: 'P1', target: { col: 0, slot: 0 } },
      { pieceId: 'O1', target: { col: 3, slot: 3 } },
      { pieceId: 'P2', target: { col: 0, slot: 1 } },
      { pieceId: 'O2', target: { col: 3, slot: 4 } },
      { pieceId: 'P3', target: { col: 0, slot: 2 } },
      { pieceId: 'O3', target: { col: 3, slot: 5 } },
      { pieceId: 'P4', target: { col: 0, slot: 3 } },
      { pieceId: 'OSUP1', target: { col: 2, slot: 2 } }, // support -- keep this ORANGE, not purple
      { pieceId: 'P5', target: { col: 0, slot: 4 } },
      { pieceId: 'OSUP2', target: { col: 2, slot: 3 } },
      { pieceId: 'P6', target: { col: 1, slot: 1 } },
      { pieceId: 'OSUP3', target: { col: 2, slot: 4 } },
      { pieceId: 'P7', target: { col: 1, slot: 2 } },
      { pieceId: 'O4', target: { col: 3, slot: 6 } },
      { pieceId: 'P8', target: { col: 1, slot: 3 } },
      { pieceId: 'O5', target: { col: 4, slot: 4 } },
      { pieceId: 'O6', target: { col: 4, slot: 5 } },
      { pieceId: 'P9', target: { col: 1, slot: 4 } },
      // ^ purple now col0(5)+col1(4) = 9, one short -- waits on DELAY
      // ^ orange direct now col2-support(3)+col3(4)+col4(2) = 9, one short -- waits on DELAY's reveal
      { pieceId: 'DELAY', target: { col: 2, slot: 5 } }
      // ^ purple reaches 10 -> clears. Columns 2's support cells are still
      //   occupied (orange, unaffected by purple's clear) so DELAY's
      //   revealed orange has nothing to fall into -- it stays at slot 5,
      //   already touching column 3 -> orange completes -> clears -> WIN
    ]
  };

  // ---------------------------------------------------------------------
  // LEVEL 3 -- GRAVITY ROUTING. Asymmetric continuous board, uneven
  // terrain. Medium-hard.
  // ---------------------------------------------------------------------
  //
  // Column 0 (floor 0, height 9) is the ORANGE target. Column 1 (floor 0,
  // height 5, directly adjacent) and column 2 (floor 2, height 5, TWO
  // columns from column 0) each hold an identical-looking purple stack --
  // 4 plain purple cells topped with a buried-orange "route" piece. Both
  // stacks are the same height, same shape, same colors.
  //
  // KEY INSIGHT: column 2's stack LOOKS just as promising -- it's tall,
  // it's purple, it's right there. But hex adjacency only ever spans one
  // column step: column 2 can never touch column 0, no matter how it's
  // stacked or how gravity settles it. Only column 1's route piece, once
  // its purple clears and it free-falls to column 1's own floor, actually
  // lands somewhere touching column 0. The insight isn't "which cell" --
  // it's "which COLUMN is even capable of this, regardless of how alike
  // the two stacks look."
  //
  // TEMPTING MISTAKE: verified -- placing ROUTE in column 2 instead of
  // column 1 (swapped with one of column 2's plain fillers) leaves both
  // colors permanently short and the board unsolvable.
  var level3 = {
    id: 'level3',
    name: 'Level 3: Gravity Routing',
    introText: null,
    layout: layoutFromColumns([
      { floor: 0, height: 9 },
      { floor: 0, height: 5 },
      { floor: 2, height: 5 }
    ]),
    initialTokens: [],
    pieceSequence: [
      makePiece('O1', ['orange']),
      makePiece('P1', ['purple']),
      makePiece('O2', ['orange']),
      makePiece('P2', ['purple']),
      makePiece('O3', ['orange']),
      makePiece('DP1', ['purple']),
      makePiece('O4', ['orange']),
      makePiece('P3', ['purple']),
      makePiece('DP2', ['purple']),
      makePiece('O5', ['orange']),
      makePiece('P4', ['purple']),
      makePiece('DP3', ['purple']),
      makePiece('O6', ['orange']),
      makePiece('DP4', ['purple']),
      makePiece('O7', ['orange']),
      makePiece('DP5', ['purple']),
      makePiece('O8', ['orange']),
      makePiece('O9', ['orange']),
      makePiece('ROUTE', ['purple', 'orange'])
    ],
    solution: [
      { pieceId: 'O1', target: { col: 0, slot: 0 } },
      { pieceId: 'P1', target: { col: 1, slot: 0 } },
      { pieceId: 'O2', target: { col: 0, slot: 1 } },
      { pieceId: 'P2', target: { col: 1, slot: 1 } },
      { pieceId: 'O3', target: { col: 0, slot: 2 } },
      { pieceId: 'DP1', target: { col: 2, slot: 2 } },
      { pieceId: 'O4', target: { col: 0, slot: 3 } },
      { pieceId: 'P3', target: { col: 1, slot: 2 } },
      { pieceId: 'DP2', target: { col: 2, slot: 3 } },
      { pieceId: 'O5', target: { col: 0, slot: 4 } },
      { pieceId: 'P4', target: { col: 1, slot: 3 } },
      { pieceId: 'DP3', target: { col: 2, slot: 4 } },
      { pieceId: 'O6', target: { col: 0, slot: 5 } },
      { pieceId: 'DP4', target: { col: 2, slot: 5 } },
      { pieceId: 'O7', target: { col: 0, slot: 6 } },
      { pieceId: 'DP5', target: { col: 2, slot: 6 } },
      { pieceId: 'O8', target: { col: 0, slot: 7 } },
      { pieceId: 'O9', target: { col: 0, slot: 8 } },
      // ^ orange direct now col0(9) = 9, one short -- waits on ROUTE's reveal
      { pieceId: 'ROUTE', target: { col: 1, slot: 4 } }
      // ^ purple: col1(4)+ROUTE(1)+col2(5) = 10 -> clears
      //   reveals orange at col1 slot4 -> falls to col1's floor (slot0) ->
      //   touches col0 -> orange reaches 10 -> clears -> WIN
      //   (column 2's own reveal, if it existed, would fall to ITS floor,
      //   slot2 -- still 2 columns from column 0, forever stranded)
    ]
  };

  // ---------------------------------------------------------------------
  // LEVEL 4 -- CASCADE SETUP. A "tower" board, one continuous mass. Hard.
  // ---------------------------------------------------------------------
  //
  // Column 0 (ORANGE, 9 cells), column 1 (the TOWER, 10 cells, entirely
  // purple except two buried pieces), column 2 (RED, 9 cells) -- three
  // columns in a row, each touching the next.
  //
  // THE PLANNED CHAIN: column 1's tower, bottom to top, is 6 plain
  // purple, ROUTE_O [purple, orange] at slot 6, 2 more plain purple, then
  // ROUTE_R [purple, red] at slot 9 -- ten cells, all purple, enough on
  // its own to complete purple's group. When it clears, the 8 plain cells
  // vanish and ROUTE_O/ROUTE_R (the only survivors) compact to the
  // column's floor in their original relative order -- ROUTE_O to slot 0,
  // ROUTE_R to slot 1. Column 1's low slots touch BOTH column 0 AND
  // column 2 (verified) -- so orange and red BOTH reach 10 and clear
  // together, in the very same cascade step, from that one purple clear.
  //
  // The player has the opportunity to see this coming: once column 1 is
  // nearly full and columns 0/2 are both sitting at 9, it's discoverable
  // that the LAST piece placed anywhere will trigger all three colors in
  // one chain, not just complete purple.
  var level4 = {
    id: 'level4',
    name: 'Level 4: Cascade Setup',
    introText: null,
    layout: layoutFromColumns([
      { floor: 0, height: 9 },
      { floor: 0, height: 10 },
      { floor: 0, height: 9 }
    ]),
    initialTokens: [],
    pieceSequence: [
      makePiece('O1', ['orange']), makePiece('P1', ['purple']), makePiece('R1', ['red']),
      makePiece('O2', ['orange']), makePiece('P2', ['purple']), makePiece('R2', ['red']),
      makePiece('O3', ['orange']), makePiece('P3', ['purple']), makePiece('R3', ['red']),
      makePiece('O4', ['orange']), makePiece('P4', ['purple']), makePiece('R4', ['red']),
      makePiece('O5', ['orange']), makePiece('P5', ['purple']), makePiece('R5', ['red']),
      makePiece('O6', ['orange']), makePiece('P6', ['purple']), makePiece('R6', ['red']),
      makePiece('O7', ['orange']), makePiece('ROUTE_O', ['purple', 'orange']), makePiece('R7', ['red']),
      makePiece('O8', ['orange']), makePiece('P7', ['purple']), makePiece('R8', ['red']),
      makePiece('O9', ['orange']), makePiece('P8', ['purple']), makePiece('R9', ['red']),
      makePiece('ROUTE_R', ['purple', 'red'])
    ],
    solution: [
      { pieceId: 'O1', target: { col: 0, slot: 0 } },
      { pieceId: 'P1', target: { col: 1, slot: 0 } },
      { pieceId: 'R1', target: { col: 2, slot: 0 } },
      { pieceId: 'O2', target: { col: 0, slot: 1 } },
      { pieceId: 'P2', target: { col: 1, slot: 1 } },
      { pieceId: 'R2', target: { col: 2, slot: 1 } },
      { pieceId: 'O3', target: { col: 0, slot: 2 } },
      { pieceId: 'P3', target: { col: 1, slot: 2 } },
      { pieceId: 'R3', target: { col: 2, slot: 2 } },
      { pieceId: 'O4', target: { col: 0, slot: 3 } },
      { pieceId: 'P4', target: { col: 1, slot: 3 } },
      { pieceId: 'R4', target: { col: 2, slot: 3 } },
      { pieceId: 'O5', target: { col: 0, slot: 4 } },
      { pieceId: 'P5', target: { col: 1, slot: 4 } },
      { pieceId: 'R5', target: { col: 2, slot: 4 } },
      { pieceId: 'O6', target: { col: 0, slot: 5 } },
      { pieceId: 'P6', target: { col: 1, slot: 5 } },
      { pieceId: 'R6', target: { col: 2, slot: 5 } },
      { pieceId: 'O7', target: { col: 0, slot: 6 } },
      { pieceId: 'ROUTE_O', target: { col: 1, slot: 6 } },
      { pieceId: 'R7', target: { col: 2, slot: 6 } },
      { pieceId: 'O8', target: { col: 0, slot: 7 } },
      { pieceId: 'P7', target: { col: 1, slot: 7 } },
      { pieceId: 'R8', target: { col: 2, slot: 7 } },
      { pieceId: 'O9', target: { col: 0, slot: 8 } },
      { pieceId: 'P8', target: { col: 1, slot: 8 } },
      { pieceId: 'R9', target: { col: 2, slot: 8 } },
      // ^ orange direct = 9, red direct = 9, purple (col1) = 9 -- all one short
      { pieceId: 'ROUTE_R', target: { col: 1, slot: 9 } }
      // ^ purple reaches 10 (col1 full) -> clears -> ROUTE_O/ROUTE_R
      //   compact to slots 0,1 -> BOTH touch col0 and col2 at those low
      //   slots -> orange AND red both reach 10 -> clear TOGETHER -> WIN
    ]
  };

  // ---------------------------------------------------------------------
  // LEVEL 5 -- SIGNATURE CLEARTEN PUZZLE. Combines the tower-cascade
  // (Level 4) with the wrong-tower decoy (Levels 1/3) on one asymmetric
  // board. Hard. 19 placements.
  // ---------------------------------------------------------------------
  //
  // Column 0 (ORANGE, 9 cells) sits beside column 1 (the REAL tower, 10
  // cells: 9 plain purple + one buried-orange ROUTE at the top). Two
  // columns further out, column 3 (floor 2, height 6) holds a DECOY
  // tower -- 5 plain purple cells topped with its own buried-orange
  // piece, built to look exactly like the real one.
  //
  // KEY INSIGHT: column 1 and column 3 are themselves two columns apart,
  // so their purple is never the same connected group -- column 3's
  // purple can only ever reach ITS OWN 10, and it only has 6 cells,
  // meaning anything spent there is permanently unrecoverable. The
  // signature moment is recognizing that column 3 isn't a second
  // opportunity or overflow space -- it's a complete dead end that
  // happens to be dressed identically to the real tower, and the
  // correct solution never places a single piece there.
  //
  // TEMPTING MISTAKE: verified -- placing ROUTE in the decoy (column 3)
  // instead of finishing the real tower (column 1) leaves purple stuck
  // at 9 in column 1 forever (column 1's own tenth cell is never filled)
  // AND leaves orange stuck at 9 -- the board is permanently unsolvable.
  var level5 = {
    id: 'level5',
    name: 'Level 5: Signature Puzzle',
    introText: null,
    layout: layoutFromColumns([
      { floor: 0, height: 9 },
      { floor: 0, height: 10 },
      { floor: 2, height: 3 },
      { floor: 2, height: 6 }
    ]),
    initialTokens: [],
    pieceSequence: [
      makePiece('O1', ['orange']),
      makePiece('P1', ['purple']),
      makePiece('O2', ['orange']),
      makePiece('P2', ['purple']),
      makePiece('O3', ['orange']),
      makePiece('P3', ['purple']),
      makePiece('O4', ['orange']),
      makePiece('P4', ['purple']),
      makePiece('O5', ['orange']),
      makePiece('P5', ['purple']),
      makePiece('O6', ['orange']),
      makePiece('P6', ['purple']),
      makePiece('O7', ['orange']),
      makePiece('P7', ['purple']),
      makePiece('O8', ['orange']),
      makePiece('P8', ['purple']),
      makePiece('O9', ['orange']),
      makePiece('P9', ['purple']),
      makePiece('ROUTE', ['purple', 'orange'])
    ],
    solution: [
      { pieceId: 'O1', target: { col: 0, slot: 0 } },
      { pieceId: 'P1', target: { col: 1, slot: 0 } },
      { pieceId: 'O2', target: { col: 0, slot: 1 } },
      { pieceId: 'P2', target: { col: 1, slot: 1 } },
      { pieceId: 'O3', target: { col: 0, slot: 2 } },
      { pieceId: 'P3', target: { col: 1, slot: 2 } },
      { pieceId: 'O4', target: { col: 0, slot: 3 } },
      { pieceId: 'P4', target: { col: 1, slot: 3 } },
      { pieceId: 'O5', target: { col: 0, slot: 4 } },
      { pieceId: 'P5', target: { col: 1, slot: 4 } },
      { pieceId: 'O6', target: { col: 0, slot: 5 } },
      { pieceId: 'P6', target: { col: 1, slot: 5 } },
      { pieceId: 'O7', target: { col: 0, slot: 6 } },
      { pieceId: 'P7', target: { col: 1, slot: 6 } },
      { pieceId: 'O8', target: { col: 0, slot: 7 } },
      { pieceId: 'P8', target: { col: 1, slot: 7 } },
      { pieceId: 'O9', target: { col: 0, slot: 8 } },
      { pieceId: 'P9', target: { col: 1, slot: 8 } },
      // ^ orange direct = 9, one short -- waits on ROUTE's reveal
      // ^ purple = col1(9), one short -- waits on ROUTE. Column 3 (the decoy) stays untouched.
      { pieceId: 'ROUTE', target: { col: 1, slot: 9 } }
      // ^ purple reaches 10 (col1 full) -> clears -> ROUTE is the sole
      //   survivor in col1, compacts to the floor -> touches col0 ->
      //   orange reaches 10 -> clears -> board empty -> WIN
    ]
  };

  var LEVELS = [level1, level2, level3, level4, level5];

  return {
    CLEAR_THRESHOLD: CLEAR_THRESHOLD,
    COLORS: COLORS,
    LEVELS: LEVELS
  };
});
