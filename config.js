/*
 * ClearTen - gameplay configuration.
 *
 * Everything that defines the puzzles (colors, the clear threshold, each
 * level's board shape, starting tokens, and predetermined piece sequence)
 * lives here, separate from the engine (gamelogic.js) and the UI
 * (game.js). Tweak these values to experiment with the rules.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ClearTenConfig = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // How many same-color connected tokens are needed to clear a group.
  var CLEAR_THRESHOLD = 10;

  // The 3 token colors used in this prototype, with their display color.
  var COLORS = {
    red: { hex: '#e15c5c', label: 'Red' },
    purple: { hex: '#8d6fd1', label: 'Purple' },
    orange: { hex: '#f0a04b', label: 'Orange' }
  };

  // Builds a hexagon-shaped board layout from an array of column heights.
  // Every column's valid slots start at 0 and are contiguous -- this is
  // what keeps gravity simple (see gamelogic.js).
  function hexagonLayout(columnHeights) {
    var layout = [];
    columnHeights.forEach(function (height, col) {
      for (var slot = 0; slot < height; slot++) layout.push({ col: col, slot: slot });
    });
    return layout;
  }

  // --- Piece shape templates -------------------------------------------------
  // Shapes are defined as axial (dq, dr) offsets from an anchor cell, which
  // makes them translation-invariant (see gamelogic.js coordinate notes).
  // Reused across colors and levels below.
  var SHAPES = {
    singleHex: [{ dq: 0, dr: 0 }],
    pairVertical: [{ dq: 0, dr: 0 }, { dq: 0, dr: 1 }],
    pairDiagonal: [{ dq: 0, dr: 0 }, { dq: 1, dr: 0 }],
    lineThreeVertical: [{ dq: 0, dr: 0 }, { dq: 0, dr: 1 }, { dq: 0, dr: 2 }],
    bentThree: [{ dq: 0, dr: 0 }, { dq: 0, dr: 1 }, { dq: 1, dr: 0 }]
  };

  function makePiece(id, shapeName, color) {
    return {
      id: id,
      cells: SHAPES[shapeName].map(function (offset) {
        return { dq: offset.dq, dr: offset.dr, color: color };
      })
    };
  }

  // =====================================================================
  // LEVEL 1 -- simple introductory level (unchanged from v0.1).
  // =====================================================================
  //
  // This prototype intentionally does NOT use randomness: the whole
  // sequence is fixed ahead of time so the player is testing strategy with
  // partial information (3 current + 2 upcoming), not luck. The board is
  // authored backward from a fully-cleared state, so this exact sequence is
  // guaranteed solvable -- see SOLUTION below and tests.js, which replays
  // it through the real engine and asserts the board ends empty.
  //
  // S1 is a single lone red token placed in column 4 (a column none of the
  // purple or orange waves ever touch) before the purple wave completes.
  // Design note: the win condition is "board completely empty," checked
  // after every cascade -- so if a wave's clear ever left the board with
  // nothing on it, the game would declare an accidental win right there.
  // S1 exists purely so a token is always on the board between waves; it
  // only gets folded into (and cleared as part of) the red wave at the end.
  var level1 = {
    id: 'level1',
    name: 'Level 1',
    introText: 'Connect 10 matching dots to clear them.',
    layout: hexagonLayout([3, 4, 5, 4, 3]),
    initialTokens: [
      { col: 1, slot: 0, color: 'purple' },
      { col: 1, slot: 1, color: 'purple' },
      { col: 2, slot: 0, color: 'purple' },
      { col: 2, slot: 1, color: 'purple' },
      { col: 3, slot: 0, color: 'purple' },
      { col: 3, slot: 1, color: 'purple' }
    ],
    pieceSequence: [
      makePiece('S1-red-seed', 'singleHex', 'red'),
      makePiece('P1-purple-pair-v', 'pairVertical', 'purple'),
      makePiece('P2-purple-pair-d', 'pairDiagonal', 'purple'),
      makePiece('O1-orange-single', 'singleHex', 'orange'),
      makePiece('O2-orange-pair-v', 'pairVertical', 'orange'),
      makePiece('O3-orange-bent', 'bentThree', 'orange'),
      makePiece('O4-orange-line3', 'lineThreeVertical', 'orange'),
      makePiece('O5-orange-single', 'singleHex', 'orange'),
      makePiece('R1-red-bent', 'bentThree', 'red'),
      makePiece('R2-red-line3', 'lineThreeVertical', 'red'),
      makePiece('R3-red-single', 'singleHex', 'red'),
      makePiece('R4-red-single', 'singleHex', 'red'),
      makePiece('R5-red-single', 'singleHex', 'red')
    ],
    // One confirmed way to fully clear the board, expressed as the anchor
    // cell (the piece's dq:0,dr:0 cell) for each piece in pieceSequence
    // order. Every placement below targets the current lowest empty slot(s)
    // of the column(s) it touches, so gravity never visibly shifts anything
    // for this level -- what you see here is exactly the final resting
    // position of each token.
    //
    // S1: one red token parked in column 4, untouched by anything else
    //     until the very end (keeps the board non-empty between waves).
    // Wave 1 (purple): starting 6-token block + P1 + P2 = 10 purple -> clears.
    //   Board afterward: just the S1 red token. Not empty -> game continues.
    // Wave 2 (orange): O1..O5 build one 10-token orange group -> clears.
    //   Board afterward: still just the S1 red token. Not empty -> continues.
    // Wave 3 (red): R1, R2, R3, R4, R5 build a red group that connects up to
    //   S1, for 1 + 3 + 3 + 1 + 1 + 1 = 10 red -> clears -> board empty -> WIN.
    //
    // This is verified automatically by tests.js, which replays these exact
    // anchors through the real engine and additionally asserts the board is
    // NOT empty after any step except the very last one.
    solution: [
      { pieceId: 'S1-red-seed', anchor: { col: 4, slot: 0 } },
      { pieceId: 'P1-purple-pair-v', anchor: { col: 0, slot: 0 } },
      { pieceId: 'P2-purple-pair-d', anchor: { col: 0, slot: 2 } },
      { pieceId: 'O1-orange-single', anchor: { col: 1, slot: 0 } },
      { pieceId: 'O2-orange-pair-v', anchor: { col: 1, slot: 1 } },
      { pieceId: 'O3-orange-bent', anchor: { col: 2, slot: 0 } },
      { pieceId: 'O4-orange-line3', anchor: { col: 2, slot: 2 } },
      { pieceId: 'O5-orange-single', anchor: { col: 3, slot: 1 } },
      { pieceId: 'R1-red-bent', anchor: { col: 2, slot: 0 } },
      { pieceId: 'R2-red-line3', anchor: { col: 3, slot: 1 } },
      { pieceId: 'R3-red-single', anchor: { col: 4, slot: 1 } },
      { pieceId: 'R4-red-single', anchor: { col: 4, slot: 2 } },
      { pieceId: 'R5-red-single', anchor: { col: 2, slot: 2 } }
    ]
  };

  // =====================================================================
  // LEVEL 2 -- strategy test level.
  // =====================================================================
  //
  // Purpose: this level exists specifically to answer "does predictable,
  // per-column gravity create interesting planning?" -- not just to be
  // harder. It uses the same board size, same 3 colors, same 10+ rule, and
  // same 3-current/2-upcoming queue as Level 1, but is built around a
  // mechanic Level 1 never actually exercises: a token separated from its
  // matching color, freed by a DIFFERENT color's clear, dropping into a
  // brand new connection.
  //
  // WHY GRAVITY CAN CREATE A GENUINE "AHA" HERE (design note):
  // Gravity in this game is per-column and settles immediately after every
  // placement (see gamelogic.js). That means two same-color tokens in
  // *adjacent* columns either already touch or never will just by adding
  // more of that color -- there's no "wait for it to fall into place"
  // moment from simple stacking, because the board is always fully settled
  // between moves. The one place gravity genuinely creates a *new*
  // connection that didn't exist a moment ago is a cascade: a token
  // resting near the top of a column, sitting on a DIFFERENT color's
  // "scaffold," which drops down (in that same column) once the scaffold
  // clears -- landing somewhere it now touches a token it couldn't reach
  // before. That's the mechanic this level is built around.
  //
  // THE SETUP (initial tokens, multiple separated groups):
  //   col0: 2 purple (west seed)
  //   col2: 4 orange at the bottom (the "scaffold"), 1 red on TOP of it at
  //         the very top of the column (col2 is height 5) -- a token
  //         visibly stranded above the scaffold, separated from...
  //   col3: 1 red (a lone target seed, separated from col2's red -- col2 is
  //         full, so nothing can touch that stranded red token yet)
  //   col4: 2 purple (east seed, separated from col0's)
  //
  // THE PLAN (wave 1, orange -> clears the scaffold):
  //   Grow orange in col1 (fills 0-3) and col3 (2 more, on top of its red
  //   seed) so col1(4) + col2(4 existing) + col3(2) = 10 orange, connected.
  //   When it clears, col2 empties out from under the stranded red token --
  //   gravity drops it from slot 4 all the way to slot 0. Column 2's even,
  //   so slot 0 is adjacent to column 3's slot 0 -- which is exactly where
  //   the lone red seed is sitting. Two previously-unconnected red tokens
  //   are now one connected pair. THIS is the gravity-driven merge moment.
  //
  // THE OBVIOUS-BUT-RISKY TRAP (documented, not exhaustively solved):
  //   Once col1/col2/col3 are wide open (after either clear), a purple
  //   piece is visible in the upcoming queue. Columns 1-3 look like open,
  //   inviting space -- but they're exactly the cells the red and purple
  //   waves below are counted on to use. A player who places an upcoming
  //   purple piece into red's or orange's territory "because it's empty
  //   and available" eats into space this solution needs down to the cell;
  //   there's no slack built in. Reading the upcoming queue and holding
  //   pieces for their intended column, rather than playing the first
  //   legal empty cell, is what this level is testing.
  //
  // THE PLAN (wave 2, red -> grows from the 2-token merge to 10):
  //   col1 (4) + col2 (3 more, on top of the settled token) + col3 (1 more)
  //   = 8 new + the 2 already connected = 10 red, connected. Clears.
  //
  // THE PLAN (wave 3, purple -> finishes the board):
  //   col0 and col4's purple seeds can never connect directly (they're not
  //   hex-adjacent at any height -- only immediately neighboring columns
  //   ever touch). The board only ends empty if they're swept into ONE
  //   final group, so this wave bridges col0 through col4 with a minimal
  //   purple chain along the bottom rows of col1-col3: col0(3) + col1(1) +
  //   col2(2) + col3(1) + col4(3) = 10 purple, one connected group -> clears
  //   -> board empty -> WIN.
  //
  // 12 total placements, matching the "10-15 meaningful moves" target.
  // Verified end-to-end by tests.js, which replays this exact solution
  // through the real engine (placement -> gravity -> cascade, every step)
  // and asserts the board is empty only after the final piece.
  var level2 = {
    id: 'level2',
    name: 'Level 2',
    introText: null, // only the first level gets the onboarding banner
    layout: hexagonLayout([3, 4, 5, 4, 3]),
    initialTokens: [
      { col: 0, slot: 0, color: 'purple' },
      { col: 0, slot: 1, color: 'purple' },
      { col: 2, slot: 0, color: 'orange' },
      { col: 2, slot: 1, color: 'orange' },
      { col: 2, slot: 2, color: 'orange' },
      { col: 2, slot: 3, color: 'orange' },
      { col: 2, slot: 4, color: 'red' },
      { col: 3, slot: 0, color: 'red' },
      { col: 4, slot: 0, color: 'purple' },
      { col: 4, slot: 1, color: 'purple' }
    ],
    pieceSequence: [
      makePiece('OA-orange-line3', 'lineThreeVertical', 'orange'),
      makePiece('OB-orange-single', 'singleHex', 'orange'),
      makePiece('OC-orange-pair-v', 'pairVertical', 'orange'),
      makePiece('RA-red-line3', 'lineThreeVertical', 'red'),
      makePiece('RB-red-single', 'singleHex', 'red'),
      makePiece('RC-red-line3', 'lineThreeVertical', 'red'),
      makePiece('RD-red-single', 'singleHex', 'red'),
      makePiece('PA-purple-single', 'singleHex', 'purple'),
      makePiece('PB-purple-single', 'singleHex', 'purple'),
      makePiece('PC-purple-pair-v', 'pairVertical', 'purple'),
      makePiece('PD-purple-single', 'singleHex', 'purple'),
      makePiece('PE-purple-single', 'singleHex', 'purple')
    ],
    solution: [
      { pieceId: 'OA-orange-line3', anchor: { col: 1, slot: 0 } },
      { pieceId: 'OB-orange-single', anchor: { col: 1, slot: 3 } },
      { pieceId: 'OC-orange-pair-v', anchor: { col: 3, slot: 1 } },
      // ^ orange reaches 10 (col1:4 + col2:4 + col3:2) -> clears.
      //   The stranded red at col2 slot4 drops to col2 slot0 and connects
      //   with col3 slot0's red seed: the gravity-merge moment.
      { pieceId: 'RA-red-line3', anchor: { col: 1, slot: 0 } },
      { pieceId: 'RB-red-single', anchor: { col: 1, slot: 3 } },
      { pieceId: 'RC-red-line3', anchor: { col: 2, slot: 1 } },
      { pieceId: 'RD-red-single', anchor: { col: 3, slot: 1 } },
      // ^ red reaches 10 (col1:4 + col2:4 + col3:2, including the 2
      //   already-merged tokens) -> clears. Board left with only the two
      //   purple seeds (col0, col4) -- not empty, game continues.
      { pieceId: 'PA-purple-single', anchor: { col: 0, slot: 2 } },
      { pieceId: 'PB-purple-single', anchor: { col: 1, slot: 0 } },
      { pieceId: 'PC-purple-pair-v', anchor: { col: 2, slot: 0 } },
      { pieceId: 'PD-purple-single', anchor: { col: 3, slot: 0 } },
      { pieceId: 'PE-purple-single', anchor: { col: 4, slot: 2 } }
      // ^ purple reaches 10 (col0:3 + col1:1 + col2:2 + col3:1 + col4:3),
      //   one connected chain bridging both seeds -> clears -> board empty -> WIN.
    ]
  };

  var LEVELS = [level1, level2];

  return {
    CLEAR_THRESHOLD: CLEAR_THRESHOLD,
    COLORS: COLORS,
    LEVELS: LEVELS
  };
});
