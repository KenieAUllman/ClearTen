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
  // LOCKED at 10 for V0.6 -- every level below is built to hit exactly this
  // number, never more, never less.
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
  // creates a "narrow passage" or, at height 0, a true gap: hex adjacency
  // only ever spans one column step, so a column too short (or missing
  // entirely) to reach a given height silently cuts off anything above
  // that height -- or anything at all -- from the far side.
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
  // V0.6 -- FIVE HANDCRAFTED LEVELS, same locked mechanics as V0.5.
  // =====================================================================
  //
  // V0.5 proved the core mechanic (layered pieces, buried colors, terrain
  // that makes placement location matter) was fun on ONE hand-built
  // puzzle. V0.6 does not change a single rule -- no new colors, no new
  // tile types, no new gravity behavior. It asks a different question:
  // does this same small rule set have enough DEPTH to carry five
  // genuinely different puzzles, each harder than the last, purely
  // through LEVEL DESIGN (board shape, piece composition, sequencing)?
  //
  // Every level below was hand-authored backward from a known solved
  // state and verified end-to-end by tests.js: the documented SOLUTION is
  // replayed through the real engine (placement -> gravity -> cascade,
  // exactly like game.js does), confirming it empties the board and never
  // does so early. Difficulty increases through tighter geometry and more
  // consequential buried-color decisions -- never through adding pieces,
  // colors, or clutter.

  // ---------------------------------------------------------------------
  // LEVEL 1 -- SPLIT BASIN. Teaches the core loop: left vs. right, buried
  // colors, gravity destination. Easy, ~8 placements.
  // ---------------------------------------------------------------------
  //
  // Reuses V0.5's proven bridge geometry, sized down: [5, 4, 2, 4, 5].
  // Column 2 (2 cells) can only ever touch column 1 and column 3 at their
  // bottom slots -- columns 0 and 4 are true dead ends. Left = purple,
  // right = orange, both seeded with buried red.
  //
  // THE ONE STRATEGIC MOMENT: TRAP is a 3-layer [purple, orange, red]
  // piece. Its active purple makes the dead-end column 0 look just as
  // valid as the bridge -- both are empty purple cells. Placed in the
  // bridge (the solution), its buried orange becomes the connective
  // tissue between the left and right basins for wave 2, and its buried
  // red becomes part of the reopened bridge for wave 3. Placed in column
  // 0 instead, both buried colors would be stranded on the dead-end side
  // forever.
  var level1 = {
    id: 'level1',
    name: 'Level 1: Split Basin',
    introText: 'Connect 10 matching top colors. Buried colors appear next.',
    layout: boardLayout([5, 4, 2, 4, 5]),
    initialTokens: [
      { col: 0, slot: 0, layers: ['purple'] },
      { col: 0, slot: 1, layers: ['purple'] },
      { col: 1, slot: 0, layers: ['purple', 'red'] },
      { col: 1, slot: 1, layers: ['purple', 'red'] },
      { col: 1, slot: 2, layers: ['purple', 'red'] },
      { col: 1, slot: 3, layers: ['purple', 'red'] },
      { col: 3, slot: 0, layers: ['orange', 'red'] },
      { col: 3, slot: 1, layers: ['orange', 'red'] },
      { col: 3, slot: 2, layers: ['orange', 'red'] },
      { col: 3, slot: 3, layers: ['orange', 'red'] },
      { col: 4, slot: 0, layers: ['orange'] },
      { col: 4, slot: 1, layers: ['orange'] }
    ],
    pieceSequence: [
      makePiece('TRAP', ['purple', 'orange', 'red']),
      makePiece('P1', ['purple']),
      makePiece('OB', ['orange']),
      makePiece('P2', ['purple']),
      makePiece('O1', ['orange']),
      makePiece('P3', ['purple']),
      makePiece('O2', ['orange']),
      makePiece('R1', ['red'])
    ],
    // Verified: solvable, 8 placements, purple clears (step 5), orange
    // clears (step 6), red clears (step 7) -- three clean, separate waves.
    solution: [
      { pieceId: 'TRAP', target: { col: 2, slot: 0 } }, // the bridge, NOT column 0 -- the one decision this level tests
      { pieceId: 'P1', target: { col: 0, slot: 2 } },
      { pieceId: 'OB', target: { col: 2, slot: 1 } },
      { pieceId: 'P2', target: { col: 0, slot: 3 } },
      { pieceId: 'O1', target: { col: 4, slot: 2 } },
      { pieceId: 'P3', target: { col: 0, slot: 4 } },
      // ^ purple reaches 10 (col0's 2 seed + P1/P2/P3 = 5, col1's 4 seed, TRAP's 1) -> clears
      { pieceId: 'O2', target: { col: 4, slot: 3 } },
      // ^ orange reaches 10 -> clears, reveals red
      { pieceId: 'R1', target: { col: 2, slot: 1 } }
      // ^ red reaches 10 -> clears -> board empty -> WIN
    ]
  };

  // ---------------------------------------------------------------------
  // LEVEL 2 -- FUNNEL. Teaches resource congestion: a wide, FULLY shared
  // middle column both sides must draw from, with zero slack. Easy-medium,
  // ~12 placements.
  // ---------------------------------------------------------------------
  //
  // [3, 5, 4, 5, 3] -- a "hill" silhouette, the opposite of level 1's dip.
  // Unlike level 1's short, height-GATED bridge (only reachable at low
  // slots), column 2 here is height 4 and columns 1/3 are height 5 --
  // tall enough that EVERY cell of column 2 is reachable from both sides
  // at every slot (verified directly via getNeighbors, not assumed). This
  // makes column 2 a genuinely shared, tightly-fit resource: purple needs
  // exactly 2 of its 4 cells, orange needs exactly 2 -- no room to waste
  // any of it on the wrong color.
  //
  // The shared cells are ALSO 2-layer [purple, red] / [orange, red]. When
  // purple and orange each clear their top layer, the buried red
  // underneath column 1 (3) + column 2 (4) + column 3 (3) = 10 becomes
  // ONE connected group (column 2 borders both sides) and clears in the
  // very same cascade as orange -- congestion pays off as a bonus
  // connection, not just a bottleneck.
  var level2 = {
    id: 'level2',
    name: 'Level 2: Funnel',
    introText: null,
    layout: boardLayout([3, 5, 4, 5, 3]),
    initialTokens: [
      { col: 0, slot: 0, layers: ['purple'] },
      { col: 1, slot: 0, layers: ['purple', 'red'] },
      { col: 1, slot: 1, layers: ['purple', 'red'] },
      { col: 1, slot: 2, layers: ['purple', 'red'] },
      { col: 3, slot: 0, layers: ['orange', 'red'] },
      { col: 3, slot: 1, layers: ['orange', 'red'] },
      { col: 3, slot: 2, layers: ['orange', 'red'] },
      { col: 4, slot: 0, layers: ['orange'] }
    ],
    pieceSequence: [
      makePiece('P1', ['purple']),
      makePiece('O1', ['orange']),
      makePiece('PX1', ['purple']),
      makePiece('OX1', ['orange']),
      makePiece('P2', ['purple']),
      makePiece('O2', ['orange']),
      makePiece('PX2', ['purple']),
      makePiece('OX2', ['orange']),
      makePiece('PC1', ['purple', 'red']),
      makePiece('OC1', ['orange', 'red']),
      makePiece('PC2', ['purple', 'red']),
      makePiece('OC2', ['orange', 'red'])
    ],
    // Verified: solvable, 12 placements, purple clears (step 10), orange
    // AND the bonus red bridge both clear together on the final placement.
    solution: [
      { pieceId: 'P1', target: { col: 0, slot: 1 } },
      { pieceId: 'O1', target: { col: 4, slot: 1 } },
      { pieceId: 'PX1', target: { col: 1, slot: 3 } },
      { pieceId: 'OX1', target: { col: 3, slot: 3 } },
      { pieceId: 'P2', target: { col: 0, slot: 2 } },
      { pieceId: 'O2', target: { col: 4, slot: 2 } },
      { pieceId: 'PX2', target: { col: 1, slot: 4 } },
      { pieceId: 'OX2', target: { col: 3, slot: 4 } },
      { pieceId: 'PC1', target: { col: 2, slot: 0 } },
      { pieceId: 'OC1', target: { col: 2, slot: 1 } },
      { pieceId: 'PC2', target: { col: 2, slot: 2 } },
      // ^ purple: col0(3)+col1(5)+col2(2) = 10 -> clears, reveals red at col1(3)+col2 slot0,2(2)
      { pieceId: 'OC2', target: { col: 2, slot: 3 } }
      // ^ orange: col4(3)+col3(5)+col2(2) = 10 -> clears, reveals red at col3(3)+col2 slot1,3(2)
      // total red = col1(3)+col2(4)+col3(3) = 10, all connected through
      // column 2 -> clears in the same cascade -> board empty -> WIN
    ]
  };

  // ---------------------------------------------------------------------
  // LEVEL 3 -- CHOKE POINT. Makes spatial access the whole puzzle: two
  // large regions joined by exactly ONE single-cell passage. Medium,
  // ~11 placements.
  // ---------------------------------------------------------------------
  //
  // [4, 5, 1, 5, 4]. Column 2 is a single cell (verified via getNeighbors
  // to border ONLY column 1 slot 0 and column 3 slot 0) -- a true
  // one-cell gate, not a wide corridor like level 2's shared column.
  // Columns 0 and 4 are simple pre-seeded dead-end fills (the same "not a
  // real decision" pattern as level 1) so the real puzzle is entirely
  // column 1 (purple), column 3 (orange), and the single CHOKE piece.
  //
  // THE TRAP: CHOKE is a 2-layer [purple, orange] piece. Every empty cell
  // in the left region looks equally "obviously correct" for it, since
  // its active color (purple) is needed everywhere there -- but only the
  // passage cell itself touches the right region too. Placed there (the
  // solution), when the left's purple clears, CHOKE's buried orange is
  // revealed sitting in the ONE cell bordering both sides, instantly
  // joining the right region's orange group for a second clear in the
  // same cascade. Placed anywhere else in the left region, that same
  // buried orange would be revealed permanently stranded.
  var level3 = {
    id: 'level3',
    name: 'Level 3: Choke Point',
    introText: null,
    layout: boardLayout([4, 5, 1, 5, 4]),
    initialTokens: [
      { col: 0, slot: 0, layers: ['purple'] },
      { col: 0, slot: 1, layers: ['purple'] },
      { col: 0, slot: 2, layers: ['purple'] },
      { col: 0, slot: 3, layers: ['purple'] },
      { col: 4, slot: 0, layers: ['orange'] },
      { col: 4, slot: 1, layers: ['orange'] },
      { col: 4, slot: 2, layers: ['orange'] },
      { col: 4, slot: 3, layers: ['orange'] }
    ],
    pieceSequence: [
      makePiece('OR1', ['orange']),
      makePiece('PL1', ['purple']),
      makePiece('OR2', ['orange']),
      makePiece('PL2', ['purple']),
      makePiece('OR3', ['orange']),
      makePiece('PL3', ['purple']),
      makePiece('OR4', ['orange']),
      makePiece('PL4', ['purple']),
      makePiece('OR5', ['orange']),
      makePiece('PL5', ['purple']),
      makePiece('CHOKE', ['purple', 'orange'])
    ],
    // Verified: solvable, 11 placements, both colors clear in one
    // cascade on the final move via the single-cell passage.
    solution: [
      { pieceId: 'OR1', target: { col: 3, slot: 0 } },
      { pieceId: 'PL1', target: { col: 1, slot: 0 } },
      { pieceId: 'OR2', target: { col: 3, slot: 1 } },
      { pieceId: 'PL2', target: { col: 1, slot: 1 } },
      { pieceId: 'OR3', target: { col: 3, slot: 2 } },
      { pieceId: 'PL3', target: { col: 1, slot: 2 } },
      { pieceId: 'OR4', target: { col: 3, slot: 3 } },
      { pieceId: 'PL4', target: { col: 1, slot: 3 } },
      { pieceId: 'OR5', target: { col: 3, slot: 4 } },
      // ^ orange now col4(4)+col3(5) = 9, one short -- waits on the choke
      { pieceId: 'PL5', target: { col: 1, slot: 4 } },
      // ^ purple now col0(4)+col1(5) = 9, one short -- waits on the choke
      { pieceId: 'CHOKE', target: { col: 2, slot: 0 } }
      // ^ purple reaches 10 -> clears, revealing orange in the one cell
      //   bordering column 3 -> orange reaches 10 -> clears -> board empty -> WIN
    ]
  };

  // ---------------------------------------------------------------------
  // LEVEL 4 -- DUAL POCKET MANAGEMENT. Forces parallel planning across
  // two genuinely INDEPENDENT gravity pockets fed by one shared hidden
  // sequence. Medium-hard, ~14 placements.
  // ---------------------------------------------------------------------
  //
  // [5, 5, 0, 5, 5]. Column 2 has height 0 -- it produces no cells at
  // all, so pocket A (columns 0-1, purple) and pocket B (columns 3-4,
  // orange) are more than one column apart and can NEVER be adjacent
  // under any circumstance, a stronger guarantee than level 1's short
  // gated bridge or level 3's single-cell gate. This is the "twin
  // pockets" silhouette -- visibly a gap down the middle, unlike any
  // other level.
  //
  // Each pocket is its own self-contained 2-layer mini-puzzle (10 cells
  // of [purple, red] in pocket A, 10 cells of [orange, red] in pocket B),
  // but the ONE interleaved hidden sequence deals pieces for both pockets
  // in alternation -- the player must track two simultaneously-evolving
  // boards at once instead of one, deciding on every move which pocket
  // most needs the piece in hand right now. Both pockets independently
  // produce a satisfying top-color-clears-then-buried-red-clears
  // cascade, proving the SAME mechanic can carry two puzzles in parallel
  // without needing a new one.
  var level4 = {
    id: 'level4',
    name: 'Level 4: Dual Pocket',
    introText: null,
    layout: boardLayout([5, 5, 0, 5, 5]),
    initialTokens: [
      { col: 0, slot: 0, layers: ['purple', 'red'] },
      { col: 0, slot: 1, layers: ['purple', 'red'] },
      { col: 0, slot: 2, layers: ['purple', 'red'] },
      { col: 3, slot: 0, layers: ['orange', 'red'] },
      { col: 3, slot: 1, layers: ['orange', 'red'] },
      { col: 3, slot: 2, layers: ['orange', 'red'] }
    ],
    pieceSequence: [
      makePiece('PA1', ['purple', 'red']),
      makePiece('PB1', ['orange', 'red']),
      makePiece('PA2', ['purple', 'red']),
      makePiece('PB2', ['orange', 'red']),
      makePiece('PA3', ['purple', 'red']),
      makePiece('PB3', ['orange', 'red']),
      makePiece('PA4', ['purple', 'red']),
      makePiece('PB4', ['orange', 'red']),
      makePiece('PA5', ['purple', 'red']),
      makePiece('PB5', ['orange', 'red']),
      makePiece('PA6', ['purple', 'red']),
      makePiece('PB6', ['orange', 'red']),
      makePiece('PA7', ['purple', 'red']),
      makePiece('PB7', ['orange', 'red'])
    ],
    // Verified: solvable, 14 placements, two independent double-cascades
    // (purple->red in pocket A, orange->red in pocket B).
    solution: [
      { pieceId: 'PA1', target: { col: 0, slot: 3 } },
      { pieceId: 'PB1', target: { col: 3, slot: 3 } },
      { pieceId: 'PA2', target: { col: 0, slot: 4 } },
      { pieceId: 'PB2', target: { col: 3, slot: 4 } },
      { pieceId: 'PA3', target: { col: 1, slot: 0 } },
      { pieceId: 'PB3', target: { col: 4, slot: 0 } },
      { pieceId: 'PA4', target: { col: 1, slot: 1 } },
      { pieceId: 'PB4', target: { col: 4, slot: 1 } },
      { pieceId: 'PA5', target: { col: 1, slot: 2 } },
      { pieceId: 'PB5', target: { col: 4, slot: 2 } },
      { pieceId: 'PA6', target: { col: 1, slot: 3 } },
      { pieceId: 'PB6', target: { col: 4, slot: 3 } },
      { pieceId: 'PA7', target: { col: 1, slot: 4 } },
      // ^ pocket A purple now col0(5)+col1(5) = 10 -> clears, reveals red(10) in pocket A -> clears
      { pieceId: 'PB7', target: { col: 4, slot: 4 } }
      // ^ pocket B orange now col3(5)+col4(5) = 10 -> clears, reveals red(10) in pocket B -> clears -> board empty -> WIN
    ]
  };

  // ---------------------------------------------------------------------
  // LEVEL 5 -- FUTURE-COLOR PUZZLE. The hardest level: buried colors and
  // a gravity-driven reconnection are central to the whole solution. Hard
  // but fair, ~15 placements.
  // ---------------------------------------------------------------------
  //
  // [4, 5, 2, 4, 3] -- an asymmetric silhouette (unlike every other
  // level's mirrored shape). Column 1 holds 4 plain purple cells at the
  // bottom (slots 0-3) and ONE single-layer ORANGE piece (FU1) resting on
  // TOP at slot 4. Placing FU1 there is the "best placement for the
  // active color isn't the best long-term placement" moment: its active
  // orange has nothing to connect to way up there, two columns removed
  // from the right side with no path -- UNTIL the purple underneath it
  // clears.
  //
  // The bridge (column 2, height 2) is 2-layer [purple, orange], not
  // plain purple. When column0(4) + column1-lower(4) + bridge(2) = 10
  // purple clears, THREE things happen in one cascade: (1) the bridge's
  // buried orange is revealed in place, (2) column 1's now-empty slots
  // 0-3 let gravity drop FU1 all the way down to slot 0 -- newly adjacent
  // to the revealed bridge orange, (3) that connects FU1 + bridge(2) +
  // the already-placed right side (column3+column4 = 7) into a fresh
  // 10-orange group that clears in the SAME cascade. This is the
  // deliberate "clear -> reveal -> gravity shifts a piece -> a second
  // 10-group forms -> clears" chain the level exists to prove.
  var level5 = {
    id: 'level5',
    name: 'Level 5: Future Color',
    introText: null,
    layout: boardLayout([4, 5, 2, 4, 3]),
    initialTokens: [
      { col: 0, slot: 0, layers: ['purple'] },
      { col: 0, slot: 1, layers: ['purple'] },
      { col: 4, slot: 0, layers: ['orange'] }
    ],
    pieceSequence: [
      makePiece('PC1', ['purple']),
      makePiece('OR1', ['orange']),
      makePiece('PC2', ['purple']),
      makePiece('OR2', ['orange']),
      makePiece('PL1', ['purple']),
      makePiece('OR3', ['orange']),
      makePiece('PL2', ['purple']),
      makePiece('OR4', ['orange']),
      makePiece('PL3', ['purple']),
      makePiece('OC1', ['orange']),
      makePiece('PL4', ['purple']),
      makePiece('OC2', ['orange']),
      makePiece('FU1', ['orange']),
      makePiece('BR1', ['purple', 'orange']),
      makePiece('BR2', ['purple', 'orange'])
    ],
    // Verified: solvable, 15 placements. Both colors clear in a single
    // dramatic final cascade, including the gravity-driven fall and
    // reconnection of FU1 described above -- confirmed by replaying this
    // exact solution through the real engine (tests.js checks the fall,
    // not just the final empty board).
    solution: [
      { pieceId: 'PC1', target: { col: 0, slot: 2 } },
      { pieceId: 'OR1', target: { col: 3, slot: 0 } },
      { pieceId: 'PC2', target: { col: 0, slot: 3 } },
      { pieceId: 'OR2', target: { col: 3, slot: 1 } },
      { pieceId: 'PL1', target: { col: 1, slot: 0 } },
      { pieceId: 'OR3', target: { col: 3, slot: 2 } },
      { pieceId: 'PL2', target: { col: 1, slot: 1 } },
      { pieceId: 'OR4', target: { col: 3, slot: 3 } },
      { pieceId: 'PL3', target: { col: 1, slot: 2 } },
      { pieceId: 'OC1', target: { col: 4, slot: 1 } },
      { pieceId: 'PL4', target: { col: 1, slot: 3 } },
      { pieceId: 'OC2', target: { col: 4, slot: 2 } },
      // ^ orange direct so far: col3(4)+col4(3) = 7, FU1 not placed yet
      { pieceId: 'FU1', target: { col: 1, slot: 4 } },
      // ^ rests on top of column 1's full lower stack -- stranded orange, purple still at 8
      { pieceId: 'BR1', target: { col: 2, slot: 0 } },
      // ^ purple now col0(4)+col1(4)+bridge(1) = 9
      { pieceId: 'BR2', target: { col: 2, slot: 1 } }
      // ^ purple reaches 10 -> clears -> bridge reveals orange(2) -> gravity
      //   drops FU1 from col1 slot4 to slot0 -> orange 7+2+1 = 10 -> clears
      //   -> board empty -> WIN
    ]
  };

  var LEVELS = [level1, level2, level3, level4, level5];

  return {
    CLEAR_THRESHOLD: CLEAR_THRESHOLD,
    COLORS: COLORS,
    LEVELS: LEVELS
  };
});
