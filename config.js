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

  function makePiece(id, layers) {
    return { id: id, layers: layers };
  }

  // =====================================================================
  // V0.4 -- LAYERED PIECES test level.
  // =====================================================================
  //
  // V0.4 replaces V0.2/V0.3's flat multi-cell geometric pieces with
  // SINGLE-CELL pieces that carry 2-4 ordered color layers (top = active).
  // Only the active layer counts for connectivity. Clearing a qualifying
  // region peels just the top layer off each of its cells; the next color
  // becomes active. A piece disappears only once its last layer is gone.
  // This is a deliberately narrow experiment (per the brief, back to ONE
  // level) testing a single question: does planning around a piece's
  // BURIED colors -- not just its currently-active one -- create real
  // strategic depth? See gamelogic.js's file header for the full data
  // model (`{ layers: [...] }` per occupied cell).
  //
  // THE SHAPE OF THIS LEVEL (three chained reveals, one placement wave
  // each):
  //
  //   Wave 1 (red, 10 -> clears): 2 starting pieces + 8 placed pieces.
  //   That reveals purple under some cells and orange under others,
  //   depending on which color was the SECOND layer of each individual
  //   piece -- not everything reveals the same color.
  //
  //   Wave 2 (purple, 10 -> clears): the purple revealed by wave 1,
  //   grown to 10 by 4 more placements. Peeling purple reveals orange
  //   under EVERY one of those cells (by design), which immediately
  //   turns out to already be one large connected orange region...
  //
  //   Wave 3 (orange, 10 -> clears, automatically): ...because the
  //   orange revealed by wave 1 (from different cells than wave 2's
  //   purple) and the orange just revealed by wave 2 are already
  //   touching. No extra placement needed -- orange hits 10 and clears
  //   itself in the SAME cascade resolution as wave 2, which happens to
  //   empty the entire board. This is the "10 pink clears, purple
  //   appears, connects, clears, blue appears..." chain called for in
  //   the brief, produced for real by the engine rather than scripted.
  //
  // THE BURIED-COLOR DECISION (the thing this level is actually testing):
  // During wave 1, the 8 placed pieces are a mix of [red, orange] and
  // [red, purple]. At the moment you place any one of them, EVERY empty
  // cell in red's growing group looks equally good -- they're all red,
  // and red is all that's needed to reach 10. But which SPECIFIC cell
  // you put a given piece into determines where its buried color ends up
  // once red clears, and that's what wave 2/3's automatic chain depends
  // on. A player who only looks at "what does this piece do right now"
  // (place any red piece in any red-adjacent cell) can complete wave 1
  // just fine, but risks scattering the buried purples and oranges so
  // they DON'T end up already-connected for wave 2 -- turning one placed
  // move plus an automatic chain reaction into a much longer, fiddlier
  // manual cleanup. The documented SOLUTION below places each piece by
  // its buried color, not just its active one -- that's the intended
  // "obvious top-color move isn't obviously the best move" moment (not
  // exhaustively proven as the only route, in the spirit of a prototype).
  //
  // 12 total placements (2 starting + 10 played), matching the
  // "roughly 10-15 meaningful placements" target. Verified end-to-end by
  // tests.js, which replays SOLUTION through the real engine and asserts
  // the board empties only on the final step.
  var level = {
    id: 'level1',
    name: 'Level 1',
    introText: 'Connect 10 matching top colors to clear them. New colors are underneath.',
    layout: hexagonLayout([3, 4, 5, 4, 3]),

    // Two 3-layer pieces already on the board: red active, purple and then
    // orange buried beneath. Visibly "layered pieces already on the board
    // with meaningful buried colors" from the very first frame.
    initialTokens: [
      { col: 2, slot: 0, layers: ['red', 'purple', 'orange'] },
      { col: 2, slot: 1, layers: ['red', 'purple', 'orange'] }
    ],

    pieceSequence: [
      // --- Wave 1: red pieces. Half hide purple, half hide orange -- WHICH
      // cell each one goes into is what wave 2/3's automatic chain depends on.
      makePiece('RA1', ['red', 'orange']),
      makePiece('RA2', ['red', 'orange']),
      makePiece('RA3', ['red', 'purple']),
      makePiece('RA4', ['red', 'purple']),
      makePiece('RA5', ['red', 'orange']),
      makePiece('RA6', ['red', 'orange']),
      makePiece('RA7', ['red', 'purple']),
      makePiece('RA8', ['red', 'purple']),
      // --- Wave 2: purple pieces, all hiding orange underneath.
      makePiece('PA1', ['purple', 'orange']),
      makePiece('PA2', ['purple', 'orange']),
      makePiece('PA3', ['purple', 'orange']),
      makePiece('PA4', ['purple', 'orange'])
    ],

    // Verified solution. Every placement targets the CURRENT lowest empty
    // slot of the column it's in, so gravity never visibly shifts anything
    // ON PLACEMENT -- what's listed here is exactly where each piece comes
    // to rest. (Gravity still does real, visible work later: when wave 2
    // clears, several cells empty out completely and the board resettles
    // before wave 3's orange is even checked -- see tests.js for the
    // assertion that this actually happens.)
    solution: [
      // Column 1 gets the [red,orange] pieces; column 3 gets [red,purple];
      // column 2's remaining two cells get one of each, extending both.
      { pieceId: 'RA1', target: { col: 1, slot: 0 } },
      { pieceId: 'RA2', target: { col: 1, slot: 1 } },
      { pieceId: 'RA3', target: { col: 3, slot: 0 } },
      { pieceId: 'RA4', target: { col: 3, slot: 1 } },
      { pieceId: 'RA5', target: { col: 2, slot: 2 } },
      { pieceId: 'RA6', target: { col: 1, slot: 2 } },
      { pieceId: 'RA7', target: { col: 3, slot: 2 } },
      { pieceId: 'RA8', target: { col: 2, slot: 3 } },
      // ^ red reaches 10 (2 starting + 8 placed) -> clears.
      //   Reveals: col1 (0,1,2) + col2 slot2 -> orange (4 cells, connected).
      //            col2 (0,1,3) + col3 (0,1,2) -> purple (6 cells, connected).
      //   Board not empty -> game continues.
      { pieceId: 'PA1', target: { col: 1, slot: 3 } },
      { pieceId: 'PA2', target: { col: 2, slot: 4 } },
      { pieceId: 'PA3', target: { col: 3, slot: 3 } },
      { pieceId: 'PA4', target: { col: 4, slot: 0 } }
      // ^ purple reaches 10 (6 revealed + 4 placed) -> clears, revealing
      //   orange under all 4 placed cells. That orange is already
      //   connected to the 4-cell orange region revealed by wave 1 (they
      //   share column 1/column 2 borders), making exactly 10 orange --
      //   which clears automatically in the SAME cascade, with no further
      //   placement. Every cell that clears here has no layer left
      //   beneath it, so the board ends completely empty -> WIN.
    ]
  };

  var LEVELS = [level];

  return {
    CLEAR_THRESHOLD: CLEAR_THRESHOLD,
    COLORS: COLORS,
    LEVELS: LEVELS
  };
});
