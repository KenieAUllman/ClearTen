/*
 * ClearTen - gameplay configuration.
 *
 * Everything that defines THIS particular puzzle (colors, the clear
 * threshold, the board shape, the starting tokens, and the predetermined
 * piece sequence) lives here, separate from the engine (gamelogic.js) and
 * the UI (game.js). Tweak these values to experiment with the rules.
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

  // --- Board shape --------------------------------------------------------
  // An irregular hexagon-shaped board, 5 columns wide, built from flat-top
  // hexes. Column heights [3,4,5,4,3] give a symmetric hexagonal silhouette
  // instead of a plain rectangle. Every column's valid slots start at 0 and
  // are contiguous -- this is what keeps gravity simple (see gamelogic.js).
  var COLUMN_HEIGHTS = [3, 4, 5, 4, 3];

  var LEVEL_LAYOUT = [];
  COLUMN_HEIGHTS.forEach(function (height, col) {
    for (var slot = 0; slot < height; slot++) {
      LEVEL_LAYOUT.push({ col: col, slot: slot });
    }
  });

  // --- Starting tokens -----------------------------------------------------
  // A solid 6-token purple block sitting at the bottom of columns 1-3. It's
  // 4 tokens short of the 10 needed to clear -- an intentional "almost
  // there" starting position for the player to build on.
  var INITIAL_TOKENS = [
    { col: 1, slot: 0, color: 'purple' },
    { col: 1, slot: 1, color: 'purple' },
    { col: 2, slot: 0, color: 'purple' },
    { col: 2, slot: 1, color: 'purple' },
    { col: 3, slot: 0, color: 'purple' },
    { col: 3, slot: 1, color: 'purple' }
  ];

  // --- Piece shape templates -------------------------------------------------
  // Shapes are defined as axial (dq, dr) offsets from an anchor cell, which
  // makes them translation-invariant (see gamelogic.js coordinate notes).
  // Reused across colors below.
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

  // --- Predetermined piece sequence ----------------------------------------
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
  var PIECE_SEQUENCE = [
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
  ];

  // --- Developer-verified solution ------------------------------------------
  // One confirmed way to fully clear the board, expressed as the anchor
  // cell (the piece's dq:0,dr:0 cell) for each piece in PIECE_SEQUENCE
  // order. Every placement below targets the current lowest empty slot(s)
  // of the column(s) it touches, so gravity never shifts anything -- what
  // you see here is exactly the final resting position of each token.
  //
  // S1: one red token parked in column 4, untouched by anything else until
  //     the very end (keeps the board non-empty between waves).
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
  var SOLUTION = [
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
  ];

  return {
    CLEAR_THRESHOLD: CLEAR_THRESHOLD,
    COLORS: COLORS,
    LEVEL_LAYOUT: LEVEL_LAYOUT,
    INITIAL_TOKENS: INITIAL_TOKENS,
    PIECE_SEQUENCE: PIECE_SEQUENCE,
    SOLUTION: SOLUTION
  };
});
